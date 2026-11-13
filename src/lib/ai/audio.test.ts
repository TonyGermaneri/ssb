import { describe, expect, it, vi } from 'vitest'
import { clipPitch, readPcmWav, shapeClip } from './audio'
import { SOUND_MODELS, soundModelFrom, type SoundModelInfo } from './soundModels'
import { loadAndWait, requestFor, type SoundHostApi, type SoundStatus } from './soundHost'
import { soundAgentFrom } from './soundTools'
import { createTools } from './tools'
import { encodeWav } from '../wav'

const RATE = 24000

/** a 16-bit mono WAV; `claim` overrides the data chunk's size (a streamed file says 0xFFFFFFFF) */
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

describe('shaping a clip', () => {
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
    const s = shapeClip([join(silence(0.5), t, silence(0.7))], RATE, { maxSeconds: 20 })
    expect(s.seconds).toBeGreaterThan(1.05)
    expect(s.seconds).toBeLessThan(1.15)
    expect(s.cut).toBe(false)
    expect(s.peakDb).toBeCloseTo(20 * Math.log10(inPeak), 1)
    let peak = 0
    for (const v of s.mono) peak = Math.max(peak, Math.abs(v))
    expect(20 * Math.log10(peak)).toBeCloseTo(-1, 1)
    expect(Math.abs(s.mono[0])).toBeLessThan(1e-3)
    expect(Math.abs(s.mono[s.mono.length - 1])).toBeLessThan(1e-3)
  })
  it('keeps stereo as stereo, both channels cut and scaled alike', () => {
    const l = join(silence(0.3), tone(1, 220, 0.2), silence(0.3))
    const r = join(silence(0.3), tone(1, 330, 0.4), silence(0.3))
    const s = shapeClip([l, r], RATE, { maxSeconds: 20, keepChannels: true })
    expect(s.channels.length).toBe(2)
    expect(s.channels[0].length).toBe(s.channels[1].length)
    const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    expect(20 * Math.log10(peak(s.channels[1]))).toBeCloseTo(-1, 1)
    expect(peak(s.channels[0]) / peak(s.channels[1])).toBeCloseTo(0.5, 1)
    expect(s.mono.length).toBe(s.channels[0].length)
    expect(shapeClip([l, r], RATE, { maxSeconds: 20 }).channels.length).toBe(1)
  })
  it('cuts a clip that runs on at max_seconds, and knows a silent one', () => {
    const s = shapeClip([tone(5, 220)], RATE, { maxSeconds: 2 })
    expect(s.cut).toBe(true)
    expect(s.seconds).toBeCloseTo(2, 2)
    expect(shapeClip([silence(1)], RATE, { maxSeconds: 20 }).silent).toBe(true)
  })
  it('hears a held note’s pitch as steady, and speech-like glides and noise as not', () => {
    const held = clipPitch(tone(2, 207.65), RATE)! // G#3
    expect(held).toMatchObject({ name: 'G#3', steady: true })
    expect(Math.abs(held.cents)).toBeLessThanOrEqual(3)
    expect(Math.round(held.midi)).toBe(56)
    const sharp = clipPitch(tone(2, 261.63 * 2 ** (40 / 1200)), RATE)! // C4 + 40 cents
    expect(sharp.name).toBe('C4')
    expect(sharp.cents).toBeGreaterThanOrEqual(37)
    expect(sharp.cents).toBeLessThanOrEqual(43)
    expect(clipPitch(tone(2, 120, 0.3, 300), RATE)?.steady ?? false).toBe(false)
    let seed = 1
    const noise = Float32Array.from({ length: RATE * 2 }, () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.5)
    expect(clipPitch(noise, RATE)?.steady ?? false).toBe(false)
  })
})

describe('sound models', () => {
  it('takes a catalog id or name, its page, or a GGUF on Hugging Face (a custom model)', () => {
    expect(soundModelFrom('moss-soundeffect-v2-q8')?.label).toBe('MOSS-SoundEffect v2')
    expect(soundModelFrom('moss')?.id).toBe('moss-soundeffect-v2-q8')
    expect(soundModelFrom('Stable Audio 3 Small Music')?.id).toBe('stable-audio-3-small-music-q8')
    expect(soundModelFrom('stable audio sfx')?.id).toBe('stable-audio-3-small-sfx-q8')
    expect(soundModelFrom('stable audio open')?.id).toBe('stable-audio-open-1.0')
    expect(soundModelFrom('https://huggingface.co/stabilityai/stable-audio-open-1.0')?.id).toBe('stable-audio-open-1.0')
    const c = soundModelFrom('https://huggingface.co/someone/moss-sfx-finetune/blob/main/gguf/moss-soundeffect-v2-ft-q8_0.gguf')!
    expect(c).toMatchObject({ custom: true, family: 'moss_soundeffect', main: 'moss-soundeffect-v2-ft-q8_0.gguf', label: 'moss-soundeffect-v2-ft-q8_0', stepsOption: 'num_steps' })
    expect(c.files).toEqual([{ url: 'https://huggingface.co/someone/moss-sfx-finetune/resolve/main/gguf/moss-soundeffect-v2-ft-q8_0.gguf', path: 'moss-soundeffect-v2-ft-q8_0.gguf', bytes: 0 }])
    expect(c.id).toMatch(/^custom-someone-moss-sfx-finetune-moss-soundeffect-v2-ft-q8_0$/)
    expect(soundModelFrom('hf.co/x/y/resolve/main/thing.gguf')).toMatchObject({ family: '', tag: 'sound-model' })
    expect(soundModelFrom('https://huggingface.co/x/y')).toBeNull() // a repo, not a file
    expect(soundModelFrom('a door slam')).toBeNull()
  })
  it('lays Stable Audio Open 1.0 out as audio.cpp reads a safetensors checkpoint, from the gated repo', () => {
    const m = soundModelFrom('stable-audio-open-1.0')!
    expect(m).toMatchObject({ gated: true, main: '.', family: 'stable_audio' })
    expect(m.files.map((f) => f.path)).toEqual([
      'model_config.json',
      'model.safetensors',
      't5gemma-b-b-ul2/config.json',
      't5gemma-b-b-ul2/model.safetensors',
      't5gemma-b-b-ul2/tokenizer.json',
      't5gemma-b-b-ul2/tokenizer.model',
      't5gemma-b-b-ul2/tokenizer_config.json',
    ])
    expect(m.files.every((f) => f.url.startsWith('https://huggingface.co/stabilityai/stable-audio-open-1.0/resolve/main/'))).toBe(true)
  })
  it('asks audio.cpp with each family\'s own option names, the length clamped to the model', () => {
    const moss = soundModelFrom('moss')!
    expect(requestFor(moss, { prompt: 'rain', seconds: 99, negative_prompt: 'music' }, 5)).toEqual({ text: 'rain', seed: 5, options: { duration_sec: 30, num_steps: 50, guidance_scale: 4, negative_prompt: 'music' } })
    expect(requestFor(soundModelFrom('stable audio open')!, { prompt: 'loop', seconds: 2.04, steps: 20 }, 1).options).toEqual({ duration_sec: 2, num_inference_steps: 20, guidance_scale: 7, sampler_mode: 'dpmpp-3m-sde' })
    expect(requestFor(soundModelFrom('stable audio 3 small music')!, { prompt: 'x' }, 1).options).toMatchObject({ num_inference_steps: 8, guidance_scale: 1, duration_sec: 5 })
  })
})

/** a stand-in for the native host: loads on the next status, generates a held G#3 (stereo) */
function fakeHost(o: { loaded?: string | null; downloaded?: boolean; available?: boolean } = {}) {
  const st: SoundStatus = { available: o.available ?? true, backend: 'metal', helper: 'stopped', modelsDir: '/x' }
  const labelOf = (id: string) => SOUND_MODELS.find((m) => m.id === id)?.label ?? id
  if (o.loaded) st.loaded = { id: o.loaded, label: labelOf(o.loaded), family: 'stable_audio', loadSeconds: 2 }
  let pending: SoundModelInfo | null = null
  const calls: { op: string; arg?: unknown }[] = []
  const hum = join(silence(0.2), tone(2, 207.65 * 2 ** (-21 / 1200), 0.3), silence(0.4))
  const host: SoundHostApi = {
    status: async () => {
      if (pending) {
        if (st.task) (st.loaded = { id: pending.id, label: pending.label, family: pending.family, loadSeconds: 1 }), delete st.task, (pending = null)
        else st.task = { kind: 'download', model: pending.id, message: '', done: 1, total: 2, progress: 0.5, elapsed: 1 }
      }
      return structuredClone(st)
    },
    check: async (models) => models.map((m) => ({ id: m.id, downloaded: !!o.downloaded || m.id === st.loaded?.id, missing: o.downloaded ? 0 : m.files.reduce((n, f) => n + f.bytes, 0) })),
    load: async (m) => {
      calls.push({ op: 'load', arg: m.id })
      pending = m
    },
    download: async () => {},
    unload: async () => {
      calls.push({ op: 'unload' })
      delete st.loaded
    },
    cancel: async () => void calls.push({ op: 'cancel' }),
    remove: async () => {},
    generate: async (m, req) => {
      calls.push({ op: 'generate', arg: requestFor(m, req, req.seed ?? 1234) })
      if (!st.loaded) throw new Error('no sound model is loaded: load one first')
      return { wav: await encodeWav([hum, hum.map((v) => v * 0.5)], RATE).arrayBuffer(), rate: RATE, channels: 2, seed: req.seed ?? 1234, model: st.loaded.id, elapsed: 3.2 }
    },
  }
  return { host, calls, st }
}

describe('the sound host client', () => {
  it('loads and waits, reporting progress; a failed load says why', async () => {
    const f = fakeHost()
    const seen: string[] = []
    const s = await loadAndWait(f.host, SOUND_MODELS[0], (st) => seen.push(st.task?.kind ?? 'idle'), undefined, 1)
    expect(s.loaded?.id).toBe('moss-soundeffect-v2-q8')
    expect(seen).toContain('download')
    const bad = fakeHost()
    bad.host.load = async () => void Object.assign(bad.st, { error: { model: SOUND_MODELS[3].id, message: 'Stable Audio Open 1.0 is gated: …' } })
    await expect(loadAndWait(bad.host, SOUND_MODELS[3], undefined, undefined, 1)).rejects.toThrow(/is gated/)
  })
})

describe('the sound tools', () => {
  function setup(f: ReturnType<typeof fakeHost>, model = 'moss-soundeffect-v2-q8', hfToken = '') {
    const added: { channels: Float32Array[]; rate: number; o: { name: string; tags: string[]; rootNote: number; fine: number } }[] = []
    const board = {
      addAgentSound: vi.fn(async (channels: Float32Array[], rate: number, o: (typeof added)[number]['o']) => {
        added.push({ channels, rate, o })
        return { id: 'snd-1', settings: { name: o.name } }
      }),
      soundRef: () => ({ ref: 'snd-1' }),
    }
    const settings = { model, hfToken }
    const loaded: string[] = []
    const agent = soundAgentFrom(() => settings, { onLoaded: (m) => loaded.push(m.id) }, f.host)
    const tools = createTools(board as never, { confirmDeletes: true, sound: agent })
    const tool = (name: string) => tools.find((t) => t.name === name)!
    const run = (name: string, input: object) => (tool(name).run as (i: object, s?: AbortSignal) => Promise<{ text: string; soundId?: string }>)(input)
    const confirm = (name: string, input: object) => (tool(name).confirm as (i: object) => Promise<string | null>)(input)
    return { tools, run, confirm, added, loaded }
  }

  it('are there only with a sound agent (none in a browser tab)', () => {
    expect(createTools({} as never, { confirmDeletes: true }).some((t) => t.name === 'make_sound')).toBe(false)
    expect(setup(fakeHost()).tools.slice(-4).map((t) => t.name)).toEqual(['sound_models', 'load_sound_model', 'unload_sound_model', 'make_sound'])
  })
  it('make_sound generates with the loaded model onto the board: stereo kept, in tune from its pitch', async () => {
    const f = fakeHost({ loaded: 'stable-audio-3-small-music-q8', downloaded: true })
    const { run, added } = setup(f)
    const r = await run('make_sound', { prompt: 'a soft sustained synth note, G#3', seconds: 3, name: 'soft note c4', tags: 'Synth, note' })
    expect(r.soundId).toBe('snd-1')
    const out = JSON.parse(r.text)
    expect(out).toMatchObject({ sound: 'snd-1', name: 'SOFT NOTE G#3', channels: 'stereo', rootNote: 56, seed: 1234, model: 'stable-audio-3-small-music-q8', pitch: { note: 'G#3', steady: true } })
    expect(out.fine).toBeGreaterThanOrEqual(19)
    expect(out.fine).toBeLessThanOrEqual(23)
    expect(added[0].channels.length).toBe(2)
    expect(added[0].o.tags).toEqual(['generated', 'stable-audio', 'synth', 'note'])
    // with the loaded model's own option names
    expect(f.calls.find((c) => c.op === 'generate')?.arg).toMatchObject({ options: { duration_sec: 3, num_inference_steps: 8 } })
  })
  it('make_sound with nothing loaded loads the settings\' pick first, asking first when that downloads', async () => {
    const f = fakeHost()
    const { run, confirm, loaded } = setup(f)
    expect(await confirm('make_sound', { prompt: 'door slam' })).toBe(
      'The agent wants to load the sound model MOSS-SoundEffect v2: that downloads 4.00 GB (once), and it takes about 6 GB of memory while loaded. Download it?',
    )
    const out = JSON.parse((await run('make_sound', { prompt: 'a heavy door slams', root_note: 48 })).text)
    expect(out).toMatchObject({ loaded_model_first: true, model: 'moss-soundeffect-v2-q8', rootNote: 48, fine: 0, name: 'A HEAVY DOOR SLAMS' })
    expect(loaded).toEqual(['moss-soundeffect-v2-q8'])
  })
  it('load_sound_model switches models, asks nothing when downloaded, and names a gated model\'s needs', async () => {
    const { run, confirm } = setup(fakeHost({ loaded: 'moss-soundeffect-v2-q8', downloaded: true }))
    expect(await confirm('load_sound_model', { model: 'stable audio 3 small music' })).toBeNull()
    const out = JSON.parse((await run('load_sound_model', { model: 'stable-audio-3-small-music-q8' })).text)
    expect(out).toMatchObject({ loaded: 'stable-audio-3-small-music-q8', unloaded: 'moss-soundeffect-v2-q8' })
    const fresh = setup(fakeHost())
    expect(await fresh.confirm('load_sound_model', { model: 'stable-audio-open-1.0' })).toMatch(/Stable Audio Open 1.0: that downloads 5.30 GB .*It is gated/)
    expect(await setup(fakeHost(), 'moss', 'hf_x').confirm('load_sound_model', { model: 'stable-audio-open-1.0' })).not.toMatch(/gated/)
    await expect(fresh.run('load_sound_model', { model: 'not a model' })).rejects.toThrow(/isn't a sound model/)
  })
  it('sound_models lists the catalog (and a custom pick), which is loaded and downloaded', async () => {
    const custom = 'https://huggingface.co/someone/sfx/blob/main/stable-audio-ft.gguf'
    const { run } = setup(fakeHost({ loaded: 'moss-soundeffect-v2-q8' }), custom)
    const out = JSON.parse((await run('sound_models', {})).text)
    expect(out.loaded.model).toBe('moss-soundeffect-v2-q8')
    expect(out.models.map((m: { model: string }) => m.model)).toEqual([...SOUND_MODELS.map((m) => m.id), 'custom-someone-sfx-stable-audio-ft'])
    expect(out.models[0]).toMatchObject({ loaded: true, downloaded: true })
    expect(out.models[1]).toMatchObject({ loaded: false, downloaded: false, download: '1.68 GB' })
    expect(out.models[4]).toMatchObject({ selected_in_settings: true, download: 'size unknown' })
  })
  it('a build without the helper says so', async () => {
    const { run } = setup(fakeHost({ available: false }))
    await expect(run('make_sound', { prompt: 'x' })).rejects.toThrow(/no sound model helper/)
  })
  it('unload_sound_model frees it', async () => {
    const { run } = setup(fakeHost({ loaded: 'moss-soundeffect-v2-q8' }))
    expect(JSON.parse((await run('unload_sound_model', {})).text)).toEqual({ unloaded: 'moss-soundeffect-v2-q8' })
  })
})
