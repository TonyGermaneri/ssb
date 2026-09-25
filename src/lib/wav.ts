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
