import { describe, expect, it, vi } from 'vitest'
import { matchesScript, performTake, performerInstructions, readPcmWav, resolveAudioAgent, shapeTake, takePitch, type AudioAgentConfig } from './audio'
import { createTools } from './tools'
import { AiError } from './types'
import { encodeWav } from '../wav'

const RATE = 24000

/** a 16-bit mono WAV as OpenAI sends it; `claim` overrides the data chunk's size (a streamed file says 0xFFFFFFFF) */
function pcm16(x: Float32Array, rate = RATE, claim?: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + x.length * 2)
  const v = new DataView(buf)
  const text = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  v.setUint32(4, claim ?? 36 + x.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  text(36, 'data')
  v.setUint32(40, claim ?? x.length * 2, true)
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), true)
  return buf
}
const b64 = (buf: ArrayBuffer) => Buffer.from(buf).toString('base64')

/** a voice-like tone: a few harmonics at `hz` (or gliding to `to`), `seconds` long, at `level` */
function tone(seconds: number, hz: number, level = 0.3, to = hz): Float32Array {
  const n = Math.round(seconds * RATE)
  const x = new Float32Array(n)
  let ph = 0
  for (let i = 0; i < n; i++) {
    const f = hz * (to / hz) ** (i / n)
    ph += (2 * Math.PI * f) / RATE
    x[i] = level * (Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.25 * Math.sin(3 * ph)) / 1.75
  }
  return x
}
const silence = (seconds: number) => new Float32Array(Math.round(seconds * RATE))
const join = (...parts: Float32Array[]) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) out.set(p, at), (at += p.length)
  return out
}

describe('the audio agent: settings', () => {
  const base = { provider: 'anthropic', endpoint: 'https://api.anthropic.com', apiKey: 'sk-ant' }
  it('uses its own key first, then the OpenAI provider’s', () => {
    expect(resolveAudioAgent({ current: { ...base, audio: { apiKey: 'own' } } })?.apiKey).toBe('own')
    const r = resolveAudioAgent({ current: base, profiles: { openai: { apiKey: 'sk-oa', endpoint: 'https://proxy.example/v1' } } })
    expect(r).toMatchObject({ apiKey: 'sk-oa', endpoint: 'https://proxy.example/v1', model: 'gpt-audio-1.5', voice: 'marin' })
    // the OpenAI provider in use: its current key
    expect(resolveAudioAgent({ current: { provider: 'openai', endpoint: 'https://api.openai.com/v1', apiKey: 'sk-now' } })?.apiKey).toBe('sk-now')
  })
  it('is not set up without an OpenAI key (never the Anthropic one)', () => {
    expect(resolveAudioAgent({ current: base })).toBeNull()
    expect(resolveAudioAgent({ current: base, profiles: { openai: { apiKey: '' } } })).toBeNull()
  })
})

describe('the audio agent: a take', () => {
  const take = pcm16(join(silence(0.3), tone(1, 220), silence(0.3)))
  const reply = (message: object, status = 200) =>
    new Response(JSON.stringify(status === 200 ? { model: 'gpt-audio-1.5', choices: [{ message }], usage: { prompt_tokens: 90, completion_tokens: 160, completion_tokens_details: { audio_tokens: 130 } } } : message), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  const cfg = (fetch: typeof globalThis.fetch): AudioAgentConfig => ({ provider: 'openai', endpoint: 'https://api.openai.com/v1/', apiKey: 'sk-test', model: 'gpt-audio-1.5', voice: 'marin', fetch })

  it('asks Chat Completions for text + audio (WAV), the delivery in its instructions and the script in <script>', async () => {
    const fetch = vi.fn(async () => reply({ content: null, audio: { id: 'audio_1', data: b64(take), transcript: 'Hey!', expires_at: 0 } }))
    const t = await performTake(cfg(fetch), { script: ' Hey! ', delivery: 'an energetic shout', voice: 'coral' })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.openai.com/v1/chat/completions')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test')
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({ model: 'gpt-audio-1.5', modalities: ['text', 'audio'], audio: { voice: 'coral', format: 'wav' } })
    expect(body.messages[0]).toEqual({ role: 'system', content: performerInstructions('an energetic shout') })
    expect(body.messages[0].content).toMatch(/never converse/i)
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Perform this script:\n<script>Hey!</script>' })
    expect(t).toMatchObject({ transcript: 'Hey!', voice: 'coral', model: 'gpt-audio-1.5', usage: { textIn: 90, audioIn: 0, textOut: 30, audioOut: 130 } })
    expect(new Uint8Array(t.wav)).toEqual(new Uint8Array(take))
  })
  it('the settings’ voice when the brief names none', async () => {
    const fetch = vi.fn(async () => reply({ audio: { data: b64(take), transcript: 'x' } }))
    await performTake(cfg(fetch), { script: 'x' })
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).audio.voice).toBe('marin')
  })
  it('a text-only answer, a refusal, a bad key and an empty script are errors to show', async () => {
    await expect(performTake(cfg(vi.fn(async () => reply({ content: 'I can’t sing that.' }))), { script: 'la' })).rejects.toThrow(/without recording: “I can’t sing that.”/)
    await expect(performTake(cfg(vi.fn(async () => reply({ refusal: 'no' }))), { script: 'la' })).rejects.toThrow(/declined: no/)
    const bad = performTake(cfg(vi.fn(async () => reply({ error: { message: 'Incorrect API key' } }, 401))), { script: 'la' })
    await expect(bad).rejects.toBeInstanceOf(AiError)
    await expect(bad).rejects.toMatchObject({ kind: 'auth' })
    await expect(performTake(cfg(vi.fn()), { script: '  ' })).rejects.toThrow(/no script/)
  })
})

describe('the audio agent: shaping a take', () => {
  it('reads 16-bit WAVs that claim more data than they hold, and float WAVs', async () => {
    const x = tone(0.1, 440)
    const a = readPcmWav(pcm16(x, RATE, 0xffffffff))!
    expect(a.rate).toBe(RATE)
    expect(a.channels[0].length).toBe(x.length)
    expect(Math.abs(a.channels[0][100] - x[100])).toBeLessThan(1e-4)
    const f = readPcmWav(await encodeWav([x, x], 48000).arrayBuffer())!
    expect(f.rate).toBe(48000)
    expect(f.channels.length).toBe(2)
    expect(f.channels[1][77]).toBeCloseTo(x[77], 6)
    expect(readPcmWav(new ArrayBuffer(10))).toBeNull()
  })
  it('trims the silence around it (keeping a little room), fades and normalises to -1 dBFS', () => {
    const t = tone(1, 220, 0.1)
    const inPeak = t.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    const s = shapeTake([join(silence(0.5), t, silence(0.7))], RATE, { maxSeconds: 20 })
    expect(s.seconds).toBeGreaterThan(1.05)
    expect(s.seconds).toBeLessThan(1.15)
    expect(s.cut).toBe(false)
    expect(s.peakDb).toBeCloseTo(20 * Math.log10(inPeak), 1)
    let peak = 0
    for (const v of s.data) peak = Math.max(peak, Math.abs(v))
    expect(20 * Math.log10(peak)).toBeCloseTo(-1, 1)
    expect(Math.abs(s.data[0])).toBeLessThan(1e-3)
    expect(Math.abs(s.data[s.data.length - 1])).toBeLessThan(1e-3)
  })
  it('cuts a take that runs on at max_seconds, and knows a silent one', () => {
    const s = shapeTake([tone(5, 220)], RATE, { maxSeconds: 2 })
    expect(s.cut).toBe(true)
    expect(s.seconds).toBeCloseTo(2, 2)
    expect(shapeTake([silence(1)], RATE, { maxSeconds: 20 }).silent).toBe(true)
  })
  it('hears a held note’s pitch as steady, and speech-like glides and noise as not', () => {
    const held = takePitch(tone(2, 207.65), RATE)! // G#3
    expect(held).toMatchObject({ name: 'G#3', steady: true })
    expect(Math.abs(held.cents)).toBeLessThanOrEqual(3)
    expect(Math.round(held.midi)).toBe(56)
    const sharp = takePitch(tone(2, 261.63 * 2 ** (40 / 1200)), RATE)! // C4 + 40 cents
    expect(sharp.name).toBe('C4')
    expect(sharp.cents).toBeGreaterThanOrEqual(37)
    expect(sharp.cents).toBeLessThanOrEqual(43)
    expect(takePitch(tone(2, 120, 0.3, 300), RATE)?.steady ?? false).toBe(false)
    let seed = 1
    const noise = Float32Array.from({ length: RATE * 2 }, () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.5)
    expect(takePitch(noise, RATE)?.steady ?? false).toBe(false)
  })
  it('tells a take that answered instead of performing', () => {
    expect(matchesScript('Hello, how are you?', 'Hello, how are you?')).toBe(true)
    expect(matchesScript('Super Sound Board.', 'Super … Sound … Board')).toBe(true)
    expect(matchesScript('Can you help me?', 'Hey there! How can I help you today?')).toBe(false)
    expect(matchesScript('Hey!', 'Hey there! How can I help you today?')).toBe(true) // one word: can't tell
    expect(matchesScript('Ooooooh', '(singing)')).toBe(true)
    expect(matchesScript('One, two, three, four', 'One, two, three, four.')).toBe(true)
    expect(matchesScript('Sings a sustained ooh', 'Sings a sustained "oo" on C4 for three seconds')).toBe(false)
  })
})

describe('make_audio', () => {
  const hum = pcm16(join(silence(0.4), tone(3, 205.1, 0.2), silence(0.5))) // G#3 − 21 cents
  function setup(config: AudioAgentConfig | null) {
    const added: { channels: Float32Array[]; rate: number; o: { name: string; tags: string[]; rootNote: number; fine: number } }[] = []
    const board = {
      addAgentSound: vi.fn(async (channels: Float32Array[], rate: number, o: (typeof added)[number]['o']) => {
        added.push({ channels, rate, o })
        return { id: 'snd-1', settings: { name: o.name } }
      }),
      soundRef: () => ({ ref: 'snd-1' }),
    }
    const tool = createTools(board as never, { confirmDeletes: true, audio: () => config }).find((t) => t.name === 'make_audio')!
    return { tool, added }
  }
  const run = (tool: ReturnType<typeof setup>['tool'], input: object) => (tool.run as (i: object) => Promise<{ text: string; soundId?: string }>)(input)

  it('records a take onto the board, in tune from its detected pitch', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ model: 'gpt-audio-1.5', choices: [{ message: { audio: { data: b64(hum), transcript: 'Mmmmmm' } } }], usage: {} })))
    const { tool, added } = setup({ provider: 'openai', endpoint: 'https://api.openai.com/v1', apiKey: 'k', model: 'gpt-audio-1.5', voice: 'marin', fetch })
    const r = await run(tool, { script: 'Mmmmmm', delivery: 'a soft steady hum', name: 'soft hum c4', tags: 'Vocal, hum' })
    expect(r.soundId).toBe('snd-1')
    const out = JSON.parse(r.text)
    // named with the note it holds, not the one asked for
    expect(out).toMatchObject({ sound: 'snd-1', name: 'SOFT HUM G#3', voiced: 'Mmmmmm', rootNote: 56, pitch: { note: 'G#3', steady: true } })
    expect(out.fine).toBeGreaterThanOrEqual(19)
    expect(out.fine).toBeLessThanOrEqual(23)
    expect(out.seconds).toBeGreaterThan(3)
    expect(out.seconds).toBeLessThan(3.2)
    expect(added[0].o).toMatchObject({ name: 'SOFT HUM G#3', tags: ['take', 'vocal', 'hum'], rootNote: 56 })
    expect(added[0].rate).toBe(RATE)
  })
  it('a root_note given wins over the detection; a take that answered is flagged', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { audio: { data: b64(hum), transcript: 'Hey there! How can I help you today?' } } }] })))
    const { tool } = setup({ provider: 'openai', endpoint: 'https://api.openai.com/v1', apiKey: 'k', model: 'gpt-audio-1.5', voice: 'marin', fetch })
    const out = JSON.parse((await run(tool, { script: 'Can you help me?', root_note: 60, name: 'plea' })).text)
    expect(out).toMatchObject({ rootNote: 60, fine: 0, name: 'PLEA' })
    expect(out.notes.join(' ')).toMatch(/differs from the script/)
  })
  it('says so when the audio agent is not set up', async () => {
    const { tool } = setup(null)
    await expect(run(tool, { script: 'la' })).rejects.toThrow(/not set up: it needs an OpenAI API key/)
  })
})
