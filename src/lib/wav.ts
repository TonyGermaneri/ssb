/** A float32 WAV file (IEEE float, format 3): lossless for audio the page already decoded. */
export function encodeWav(channels: Float32Array[], rate: number): Blob {
  const n = channels[0]?.length ?? 0
  const ch = channels.length
  const bytes = n * ch * 4
  const buf = new ArrayBuffer(44 + bytes)
  const v = new DataView(buf)
  const text = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  v.setUint32(4, 36 + bytes, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 3, true) // IEEE float
  v.setUint16(22, ch, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * ch * 4, true)
  v.setUint16(32, ch * 4, true)
  v.setUint16(34, 32, true)
  text(36, 'data')
  v.setUint32(40, bytes, true)
  const out = new Float32Array(buf, 44, n * ch)
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) out[i * ch + c] = channels[c][i]
  return new Blob([buf], { type: 'audio/wav' })
}

/** Planar float32, base64 (what the plugin's sample cache hands back) -> channels. */
export function planarFromBase64(data: string, channels: number): Float32Array[] {
  const bin = atob(data)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const all = new Float32Array(bytes.buffer, 0, Math.floor(bytes.length / 4))
  const n = Math.floor(all.length / channels)
  return Array.from({ length: channels }, (_, c) => all.slice(c * n, (c + 1) * n))
}

/** Longest file read as a single cycle: a whole-file loop longer than this is an ordinary looped sample. */
export const MAX_CYCLE_FRAMES = 4096

/**
 * One cycle of a waveform as a 16-bit WAV whose `smpl` chunk names its root note and loops the whole file
 * (what samplers read): `rate` is chosen so that one cycle is that note.
 */
export function encodeCycleWav(channels: Float32Array[], rate: number, rootNote: number): Blob {
  const n = channels[0]?.length ?? 0
  const ch = channels.length
  const bytes = n * ch * 2
  const SMPL = 60 // header + one loop
  const buf = new ArrayBuffer(44 + bytes + 8 + SMPL)
  const v = new DataView(buf)
  const text = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  v.setUint32(4, buf.byteLength - 8, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, ch, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * ch * 2, true)
  v.setUint16(32, ch * 2, true)
  v.setUint16(34, 16, true)
  text(36, 'data')
  v.setUint32(40, bytes, true)
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      // ×32768 both ways, so 16-bit audio read as x / 32768 comes back exactly
      v.setInt16(44 + (i * ch + c) * 2, Math.max(-32768, Math.min(32767, Math.round(channels[c][i] * 32768))), true)
    }
  const o = 44 + bytes
  text(o, 'smpl')
  v.setUint32(o + 4, SMPL, true)
  v.setUint32(o + 16, Math.round(1e9 / rate), true) // sample period, ns
  v.setUint32(o + 20, rootNote, true) // MIDI unity note
  v.setUint32(o + 36, 1, true) // one loop:
  v.setUint32(o + 52, 0, true) //   forward, from the first frame
  v.setUint32(o + 56, n - 1, true) //   to the last (inclusive)
  return new Blob([buf], { type: 'audio/wav' })
}

/**
 * A single-cycle WAV (16-bit or float PCM, at most MAX_CYCLE_FRAMES, its `smpl` loop the whole file): its own
 * rate and frames, so it can be played without being resampled (resampling would leave the loop inexact).
 * Null for anything else.
 */
export function readCycleWav(buf: ArrayBuffer): { rate: number; channels: Float32Array[]; rootNote: number } | null {
  if (buf.byteLength < 44) return null
  const v = new DataView(buf)
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3))
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null
  let fmt: { format: number; ch: number; rate: number; bits: number } | null = null
  let data: [number, number] | null = null
  let loop: { start: number; end: number; root: number } | null = null
  for (let o = 12; o + 8 <= buf.byteLength; ) {
    const id = tag(o)
    const size = v.getUint32(o + 4, true)
    const body = o + 8
    if (body + size > buf.byteLength) break
    if (id === 'fmt ' && size >= 16)
      fmt = { format: v.getUint16(body, true), ch: v.getUint16(body + 2, true), rate: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) }
    else if (id === 'data') data = [body, size]
    else if (id === 'smpl' && size >= 60 && v.getUint32(body + 28, true) >= 1)
      loop = { start: v.getUint32(body + 44, true), end: v.getUint32(body + 48, true), root: v.getUint32(body + 12, true) }
    o = body + size + (size & 1)
  }
  if (!fmt || !data || !loop || !fmt.ch) return null
  const pcm16 = fmt.format === 1 && fmt.bits === 16
  const f32 = fmt.format === 3 && fmt.bits === 32
  if (!pcm16 && !f32) return null
  const width = fmt.bits / 8
  const n = Math.floor(data[1] / (width * fmt.ch))
  if (n < 2 || n > MAX_CYCLE_FRAMES || loop.start !== 0 || loop.end !== n - 1) return null
  const channels = Array.from({ length: fmt.ch }, () => new Float32Array(n))
  for (let i = 0; i < n; i++)
    for (let c = 0; c < fmt.ch; c++) {
      const at = data[0] + (i * fmt.ch + c) * width
      channels[c][i] = pcm16 ? v.getInt16(at, true) / 32768 : v.getFloat32(at, true)
    }
  return { rate: fmt.rate, channels, rootNote: loop.root }
}
