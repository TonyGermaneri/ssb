/**
 * The audio agent: a second model the patch designer (or an agent over MCP) briefs to perform and record a take,
 * which lands on the board as a sample sound. It's a voice — speech in any delivery, sung or hummed notes and vowels,
 * whispers, shouts, breaths, beatbox — briefed as a SCRIPT (exactly what it voices) and DELIVERY notes (how), with
 * its own instructions and one request per take. OpenAI's gpt-audio-1.5 (Chat Completions with audio out) to begin
 * with; another provider is another entry in AUDIO_PROVIDERS and a branch in performTake.
 *
 * What briefing it taught (2026-11-12): directions written into the script are read aloud ("sing a sustained ooh on
 * C4" came back spoken, word for word), and a bare line like "Hey!" gets answered ("Hey there! How can I help you
 * today?"). So the delivery goes in its instructions, and the user turn wraps the script in <script> tags: every
 * line tried then came back as written, and sung and hummed notes held one pitch.
 */
import { pitch as yin, noteOf } from './analysis'
import { request } from './providers/openai'
import { AiError, AUDIO_PROVIDERS, defaultAudioSettings, type AudioProviderKind, type AudioSettings } from './types'

export { AUDIO_PROVIDERS, OPENAI_VOICES } from './types'

/** an audio agent ready to call */
export interface AudioAgentConfig {
  provider: AudioProviderKind
  endpoint: string
  apiKey: string
  model: string
  voice: string
  fetch?: typeof fetch
}

/** what of the AI settings the audio agent reads: its own settings, and the OpenAI provider's endpoint and key */
export interface AudioSources {
  current: { provider: string; endpoint: string; apiKey: string; audio?: Partial<AudioSettings> }
  profiles?: Partial<Record<string, { endpoint?: string; apiKey?: string }>>
}

/** The audio agent as the settings configure it, or null when there's no key for it. */
export function resolveAudioAgent(src: AudioSources): AudioAgentConfig | null {
  const a = { ...defaultAudioSettings(), ...(src.current.audio ?? {}) }
  const openai = src.current.provider === 'openai' ? src.current : src.profiles?.openai
  const apiKey = a.apiKey || openai?.apiKey || ''
  if (!apiKey) return null
  const p = AUDIO_PROVIDERS[a.provider] ?? AUDIO_PROVIDERS.openai
  return { provider: a.provider, endpoint: a.endpoint || openai?.endpoint || p.endpoint, apiKey, model: a.model || p.model, voice: a.voice || p.voices[0] }
}

/** the same from the AI settings as stored: for the MCP server, which answers without the dialog's store */
export function storedAudioAgent(): AudioAgentConfig | null {
  try {
    const raw = JSON.parse(localStorage.getItem('ssb:ai:settings') ?? 'null') as AudioSources | null
    return raw?.current ? resolveAudioAgent(raw) : null
  } catch {
    return null
  }
}

export interface AudioBrief {
  /** exactly what to voice */
  script: string
  /** how: voice quality, emotion, pace, pitch, length */
  delivery?: string
  voice?: string
}

export interface AudioTake {
  /** the WAV file as it came back */
  wav: ArrayBuffer
  transcript: string
  model: string
  voice: string
  usage: { textIn: number; audioIn: number; textOut: number; audioOut: number }
}

/** the audio agent's instructions for one take */
export function performerInstructions(delivery?: string): string {
  return [
    "You are a voice performer in a recording booth, recording one take for a music producer's sampler.",
    'You never converse: you only perform the script you are given, exactly, and nothing else.',
    'Never say the delivery notes, a description, the word "script", or anything in brackets aloud. No greeting, no reply, no commentary, no count-in, no sign-off.',
    'A sung or hummed note is held at one steady pitch for as long as asked, with a clean start and end.',
    `Delivery: ${delivery?.trim() || 'natural and clear.'}`,
  ].join('\n')
}

/** the request body for one take */
export function takeRequest(cfg: Pick<AudioAgentConfig, 'model' | 'voice'>, brief: AudioBrief) {
  return {
    model: cfg.model,
    modalities: ['text', 'audio'],
    audio: { voice: brief.voice || cfg.voice, format: 'wav' },
    messages: [
      { role: 'system', content: performerInstructions(brief.delivery) },
      { role: 'user', content: `Perform this script:\n<script>${brief.script.trim()}</script>` },
    ],
    // ~20 audio tokens a second: minutes of headroom, and a stop for a take that runs away
    max_completion_tokens: 4096,
  }
}

interface AudioResponse {
  model?: string
  choices?: { message?: { content?: string | null; refusal?: string | null; audio?: { data?: string; transcript?: string } } }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    prompt_tokens_details?: { audio_tokens?: number }
    completion_tokens_details?: { audio_tokens?: number }
  }
}

/** One take: the audio agent performs the brief; its WAV and what it says it voiced. */
export async function performTake(cfg: AudioAgentConfig, brief: AudioBrief, signal?: AbortSignal): Promise<AudioTake> {
  if (!brief.script.trim()) throw new AiError('The brief has no script: give the words or sounds to perform', 'request')
  const body = takeRequest(cfg, brief)
  const fetchImpl = cfg.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const res = await request(fetchImpl, { provider: 'openai', endpoint: cfg.endpoint, apiKey: cfg.apiKey }, '/chat/completions', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  })
  let j: AudioResponse
  try {
    j = (await res.json()) as AudioResponse
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new AiError('Stopped', 'aborted')
    throw new AiError("The audio agent's reply wasn't JSON", 'server')
  }
  const m = j.choices?.[0]?.message
  if (m?.refusal) throw new AiError(`The audio agent declined: ${m.refusal}`, 'request')
  if (!m?.audio?.data) throw new AiError(`The audio agent answered without recording${m?.content ? `: “${String(m.content).slice(0, 300)}”` : ''}`, 'other')
  const u = j.usage ?? {}
  const audioIn = u.prompt_tokens_details?.audio_tokens ?? 0
  const audioOut = u.completion_tokens_details?.audio_tokens ?? 0
  return {
    wav: fromBase64(m.audio.data),
    transcript: (m.audio.transcript ?? '').trim(),
    model: j.model ?? cfg.model,
    voice: body.audio.voice,
    usage: { textIn: (u.prompt_tokens ?? 0) - audioIn, audioIn, textOut: (u.completion_tokens ?? 0) - audioOut, audioOut },
  }
}

function fromBase64(data: string): ArrayBuffer {
  const bin = atob(data)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

/**
 * A PCM WAV (8/16/24/32-bit integer or 32-bit float, extensible or not) as float channels. A streamed WAV's sizes
 * may claim more than is there (0xFFFFFFFF): what's there is read.
 */
export function readPcmWav(buf: ArrayBuffer): { rate: number; channels: Float32Array[] } | null {
  const v = new DataView(buf)
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3))
  if (buf.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null
  let format = 0
  let ch = 0
  let rate = 0
  let bits = 0
  let at = 12
  while (at + 8 <= buf.byteLength) {
    const id = tag(at)
    const size = v.getUint32(at + 4, true)
    const body = at + 8
    if (id === 'fmt ') {
      format = v.getUint16(body, true)
      ch = v.getUint16(body + 2, true)
      rate = v.getUint32(body + 4, true)
      bits = v.getUint16(body + 14, true)
      if (format === 0xfffe && size >= 26) format = v.getUint16(body + 24, true)
    } else if (id === 'data') {
      if (!ch || !rate || (format !== 1 && format !== 3)) return null
      const bytes = bits / 8
      const n = Math.floor(Math.min(size, buf.byteLength - body) / (bytes * ch))
      const channels = Array.from({ length: ch }, () => new Float32Array(n))
      for (let i = 0; i < n; i++)
        for (let c = 0; c < ch; c++) {
          const o = body + (i * ch + c) * bytes
          channels[c][i] =
            format === 3
              ? bits === 64
                ? v.getFloat64(o, true)
                : v.getFloat32(o, true)
              : bits === 16
                ? v.getInt16(o, true) / 32768
                : bits === 24
                  ? ((v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getInt8(o + 2) << 16)) / 8388608)
                  : bits === 32
                    ? v.getInt32(o, true) / 2147483648
                    : (v.getUint8(o) - 128) / 128
        }
      return { rate, channels }
    }
    at = body + size + (size & 1)
  }
  return null
}

export interface ShapedTake {
  /** mono, trimmed, faded, normalised */
  data: Float32Array
  rate: number
  seconds: number
  /** the take's peak before normalising, dBFS */
  peakDb: number
  /** it ran past max_seconds and was cut there (faded) */
  cut: boolean
  silent: boolean
}

const dbOf = (x: number) => (x > 1e-10 ? 20 * Math.log10(x) : -200)

/**
 * A take as a sample: mixed to mono, the silence before and after trimmed (a little room kept), cut at `maxSeconds`,
 * faded in and out (no clicks), its peak raised or lowered to `peakDb` (-1 dBFS).
 */
export function shapeTake(channels: Float32Array[], rate: number, o: { maxSeconds: number; peakDb?: number }): ShapedTake {
  const n = channels[0]?.length ?? 0
  const x = new Float32Array(n)
  for (const c of channels) for (let i = 0; i < n; i++) x[i] += c[i] / channels.length
  let peak = 0
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]))
  if (peak < 1e-4) return { data: new Float32Array(0), rate, seconds: 0, peakDb: dbOf(peak), cut: false, silent: true }
  // 10 ms RMS windows over a threshold 45 dB under the loudest (and above -70 dBFS)
  const win = Math.max(1, Math.round(rate * 0.01))
  const rmsAt = (k: number) => {
    let s = 0
    const a = k * win
    const b = Math.min(n, a + win)
    for (let i = a; i < b; i++) s += x[i] * x[i]
    return Math.sqrt(s / Math.max(1, b - a))
  }
  const windows = Math.ceil(n / win)
  let loudest = 0
  for (let k = 0; k < windows; k++) loudest = Math.max(loudest, rmsAt(k))
  const floor = Math.max(loudest * 10 ** (-45 / 20), 10 ** (-70 / 20))
  let first = 0
  while (first < windows - 1 && rmsAt(first) < floor) first++
  let last = windows - 1
  while (last > first && rmsAt(last) < floor) last--
  const start = Math.max(0, first * win - Math.round(rate * 0.02))
  let end = Math.min(n, (last + 1) * win + Math.round(rate * 0.08))
  const cut = end - start > o.maxSeconds * rate
  if (cut) end = start + Math.round(o.maxSeconds * rate)
  const data = x.slice(start, end)
  const fadeIn = Math.min(data.length, Math.round(rate * 0.003))
  const fadeOut = Math.min(data.length, Math.round(rate * (cut ? 0.05 : 0.02)))
  for (let i = 0; i < fadeIn; i++) data[i] *= i / fadeIn
  for (let i = 0; i < fadeOut; i++) data[data.length - 1 - i] *= i / fadeOut
  let top = 0
  for (let i = 0; i < data.length; i++) top = Math.max(top, Math.abs(data[i]))
  const gain = Math.min(10 ** (40 / 20), 10 ** ((o.peakDb ?? -1) / 20) / Math.max(top, 1e-9))
  for (let i = 0; i < data.length; i++) data[i] *= gain
  return { data, rate, seconds: data.length / rate, peakDb: Math.round(dbOf(peak) * 10) / 10, cut, silent: false }
}

export interface TakePitch {
  /** the median pitch of its voiced stretches, as a fractional MIDI note */
  midi: number
  hz: number
  name: string
  cents: number
  /** held at one pitch (a sung or hummed note), not moving about (speech) */
  steady: boolean
  /** of the take's loud stretches, how many are pitched (0..1) */
  voiced: number
}

/**
 * What pitch a take holds: YIN every 20 ms over its loud stretches. Steady when most of it is pitched and stays
 * within half a semitone of the median for at least 0.3 s in all: a sung or hummed note. Null when nothing's pitched.
 */
export function takePitch(x: Float32Array, rate: number): TakePitch | null {
  const hop = Math.round(rate * 0.02)
  const span = Math.round(rate * 0.12)
  const w = Math.round(rate * 0.06)
  let loudest = 0
  const frames: { a: number; rms: number }[] = []
  for (let a = 0; a + span <= x.length; a += hop) {
    let s = 0
    for (let i = a; i < a + w; i++) s += x[i] * x[i]
    const rms = Math.sqrt(s / w)
    frames.push({ a, rms })
    loudest = Math.max(loudest, rms)
  }
  const loud = frames.filter((f) => f.rms > loudest * 0.1)
  const midis: number[] = []
  for (const f of loud) {
    const p = yin(x, rate, f.a, f.a + span)
    if (p.hz && p.periodicity >= 0.85 && p.hz >= 60 && p.hz <= 1200) midis.push(69 + 12 * Math.log2(p.hz / 440))
  }
  if (loud.length < 5 || midis.length < 5) return null
  const sorted = [...midis].sort((a, b) => a - b)
  const midi = sorted[Math.floor(sorted.length / 2)]
  const near = midis.filter((m) => Math.abs(m - midi) <= 0.5).length
  const voiced = midis.length / loud.length
  const hz = 440 * 2 ** ((midi - 69) / 12)
  const note = noteOf(hz)
  return {
    midi: Math.round(midi * 100) / 100,
    hz: Math.round(hz * 10) / 10,
    name: note.name,
    cents: note.cents,
    steady: voiced >= 0.6 && near / midis.length >= 0.8 && near * 0.02 >= 0.3,
    voiced: Math.round(voiced * 100) / 100,
  }
}

/**
 * Whether what the audio agent says it voiced is the script, or it answered or improvised instead: most of the
 * script's words are there, and few others ("Can you help me?" answered "Hey there! How can I help you today?").
 */
export function matchesScript(script: string, transcript: string): boolean {
  const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter((w) => w.length > 1)
  const want = words(script)
  if (want.length < 2) return true // "Ooooh", "Hey!": too short to judge (and the transcript may say "(singing)")
  const wanted = new Set(want)
  const got = words(transcript)
  const found = new Set(got.filter((w) => wanted.has(w)))
  const extra = got.filter((w) => !wanted.has(w)).length
  return found.size / wanted.size >= 0.6 && extra <= Math.max(1, Math.round(0.3 * want.length))
}
