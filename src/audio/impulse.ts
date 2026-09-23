const cache = new Map<string, AudioBuffer>()
const MAX_CACHED = 24

/** Synthetic stereo reverb impulse: decaying noise. Cached by (size, decay). */
export function getImpulse(ctx: BaseAudioContext, size: number, decay: number): AudioBuffer {
  const s = Math.max(0.1, Math.round(size * 20) / 20)
  const d = Math.max(0.5, Math.round(decay * 4) / 4)
  const key = `${ctx.sampleRate}|${s}|${d}`
  const hit = cache.get(key)
  if (hit) return hit

  const len = Math.floor(ctx.sampleRate * s)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, d)
  }
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!)
  cache.set(key, buf)
  return buf
}
