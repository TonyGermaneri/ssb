const cache = new Map<string, AudioBuffer>()
const MAX_CACHED = 24

/**
 * DAMP (SpaceCraft's reverb damping): the noise through a one-pole low-pass that closes as the tail decays, so a damped
 * reverb starts bright and darkens. `coef` is the filter's share of the new sample at `x` (0..1) of the way through:
 * 1 throughout at DAMP 0; at DAMP 1 down to 0.03 by the end. (Dsp.h impulseDampCoef is the same.)
 */
export const impulseDampCoef = (damp: number, x: number) => 1 - 0.97 * Math.min(1, Math.max(0, damp)) * Math.sqrt(x)
/** DAMP in the steps impulses are shared under */
export const roundDamp = (damp: number) => Math.min(1, Math.max(0, Math.round(damp * 20) / 20))

/** Synthetic stereo reverb impulse: decaying noise, darkening as it goes by DAMP. Cached by (size, decay, damp). */
export function getImpulse(ctx: BaseAudioContext, size: number, decay: number, damp = 0): AudioBuffer {
  const s = Math.max(0.1, Math.round(size * 20) / 20)
  const d = Math.max(0.5, Math.round(decay * 4) / 4)
  const dm = roundDamp(damp)
  const key = `${ctx.sampleRate}|${s}|${d}|${dm}`
  const hit = cache.get(key)
  if (hit) return hit

  const len = Math.floor(ctx.sampleRate * s)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    let y = 0
    for (let i = 0; i < len; i++) {
      const noise = Math.random() * 2 - 1
      y = dm > 0 ? y + impulseDampCoef(dm, i / len) * (noise - y) : noise
      data[i] = y * Math.pow(1 - i / len, d)
    }
  }
  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!)
  cache.set(key, buf)
  return buf
}
