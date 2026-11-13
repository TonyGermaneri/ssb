/**
 * Audio a sound model made (sound-server/, soundServer.ts), made into a sample: the WAV read, the silence around it
 * trimmed, faded and normalised, and the pitch it holds (if it holds one) found, so it plays in tune from the keys.
 */
import { pitch as yin, noteOf } from './analysis'

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

export interface ShapedClip {
  /** trimmed, faded, normalised: mono, or the channels as they came with `keepChannels` */
  channels: Float32Array[]
  /** the channels mixed (for pitch detection) */
  mono: Float32Array
  rate: number
  seconds: number
  /** the clip's peak before normalising, dBFS */
  peakDb: number
  /** it ran past max_seconds and was cut there (faded) */
  cut: boolean
  silent: boolean
}

const dbOf = (x: number) => (x > 1e-10 ? 20 * Math.log10(x) : -200)

/**
 * A clip as a sample: the silence before and after trimmed (a little room kept), cut at `maxSeconds`, faded in and
 * out (no clicks), its peak raised or lowered to `peakDb` (-1 dBFS); mixed to mono unless `keepChannels` (stereo
 * stays stereo, every channel cut and scaled alike).
 */
export function shapeClip(channels: Float32Array[], rate: number, o: { maxSeconds: number; peakDb?: number; keepChannels?: boolean }): ShapedClip {
  const n = channels[0]?.length ?? 0
  const x = new Float32Array(n)
  for (const c of channels) for (let i = 0; i < n; i++) x[i] += c[i] / channels.length
  let peak = 0
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]))
  if (peak < 1e-4) return { channels: [new Float32Array(0)], mono: new Float32Array(0), rate, seconds: 0, peakDb: dbOf(peak), cut: false, silent: true }
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
  const out = (o.keepChannels && channels.length > 1 ? channels : [x]).map((c) => c.slice(start, end))
  const len = end - start
  const fadeIn = Math.min(len, Math.round(rate * 0.003))
  const fadeOut = Math.min(len, Math.round(rate * (cut ? 0.05 : 0.02)))
  let top = 0
  for (const data of out) {
    for (let i = 0; i < fadeIn; i++) data[i] *= i / fadeIn
    for (let i = 0; i < fadeOut; i++) data[len - 1 - i] *= i / fadeOut
    for (let i = 0; i < len; i++) top = Math.max(top, Math.abs(data[i]))
  }
  const gain = Math.min(10 ** (40 / 20), 10 ** ((o.peakDb ?? -1) / 20) / Math.max(top, 1e-9))
  for (const data of out) for (let i = 0; i < len; i++) data[i] *= gain
  const mono = out.length === 1 ? out[0] : x.slice(start, end).map((v) => v * gain)
  return { channels: out, mono, rate, seconds: len / rate, peakDb: Math.round(dbOf(peak) * 10) / 10, cut, silent: false }
}

export interface ClipPitch {
  /** the median pitch of its voiced stretches, as a fractional MIDI note */
  midi: number
  hz: number
  name: string
  cents: number
  /** held at one pitch (a held note), not moving about (speech) */
  steady: boolean
  /** of the clip's loud stretches, how many are pitched (0..1) */
  voiced: number
}

/**
 * What pitch a clip holds: YIN every 20 ms over its loud stretches. Steady when most of it is pitched and stays
 * within half a semitone of the median for at least 0.3 s in all: a held note. Null when nothing's pitched.
 */
export function clipPitch(x: Float32Array, rate: number): ClipPitch | null {
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
