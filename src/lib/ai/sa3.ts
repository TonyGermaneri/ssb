/**
 * Stable Audio 3 Small, as a browser tab runs it (workers/sa3.worker.ts): the arithmetic around its four ONNX graphs
 * (a 4-bit export: lsb/stable-audio-3-small-music-onnx), ported from Stability's own framework-free pipeline
 * (stable-audio-3/optimized/tflite/models/defs/tflite_pipeline.py and sa3_tflite.py):
 *
 *   prompt → tokens (256, padded with 0, no BOS / EOS) → T5Gemma encoder → [1,256,768]
 *   seconds → number conditioner → [1,1,768]
 *   cross-attention = tokens' states ++ seconds' embedding [1,257,768]; global = seconds' embedding [1,768]
 *   8 steps of rectified-flow "pingpong" on noise [1,256,L], L = ceil(seconds·44100/4096) rounded up to even
 *   decoder → stereo [1,2,L·4096] at 44.1 kHz, trimmed to the seconds asked for
 *
 * No ONNX here: the graphs come in as functions (`Sa3Graphs`), so the worker (onnxruntime-web, WebGPU) and a test
 * (onnxruntime-node) share it.
 */

export const SA3_RATE = 44100
/** audio samples per latent frame */
export const SA3_PER_LATENT = 4096
export const SA3_LATENT_CHANNELS = 256
export const SA3_TOKENS = 256
export const SA3_DIM = 768
/** the duration conditioner's range, seconds */
export const SA3_MAX_SECONDS = 384

/** latent frames for `seconds` (the decoder takes an even count) */
export function latentFrames(seconds: number): number {
  const n = Math.max(1, Math.ceil((seconds * SA3_RATE) / SA3_PER_LATENT))
  return n + (n % 2)
}

/**
 * The pingpong schedule: `steps + 1` times from 1 (noise) to 0 (data), spaced evenly in log-SNR (LogSNRShift with
 * rate 0, anchor -6.2, end 2.0: the same for any length).
 */
export function sa3Schedule(steps: number, anchor = -6.2, end = 2.0): Float32Array {
  const t = new Float32Array(steps + 1)
  for (let i = 0; i <= steps; i++) {
    const u = 1 - i / steps
    t[i] = u <= 0 ? 0 : u >= 1 ? 1 : 1 / (1 + Math.exp(end - u * (end - anchor)))
  }
  t[0] = 1
  return t
}

/** a seeded generator (mulberry32) of standard normals (Box-Muller), so a seed brings a clip back */
export function normals(seed: number) {
  let a = seed >>> 0
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  let spare: number | null = null
  const one = () => {
    if (spare !== null) {
      const s = spare
      spare = null
      return s
    }
    const u = Math.max(uniform(), 1e-12)
    const v = uniform()
    const r = Math.sqrt(-2 * Math.log(u))
    spare = r * Math.sin(2 * Math.PI * v)
    return r * Math.cos(2 * Math.PI * v)
  }
  return (n: number) => {
    const out = new Float32Array(n)
    for (let i = 0; i < n; i++) out[i] = one()
    return out
  }
}

/** tokens for the encoder: the prompt's ids, cut to 256, padded with 0, and its mask */
export function sa3Tokens(ids: ArrayLike<number>): { ids: BigInt64Array; mask: BigInt64Array } {
  const out = { ids: new BigInt64Array(SA3_TOKENS), mask: new BigInt64Array(SA3_TOKENS) }
  const n = Math.min(SA3_TOKENS, ids.length)
  for (let i = 0; i < n; i++) {
    out.ids[i] = BigInt(ids[i])
    out.mask[i] = 1n
  }
  return out
}

/** the graphs, each one call */
export interface Sa3Graphs {
  /** ids, mask [1,256] → states [1,256,768] (the export pads masked positions with the learned padding itself) */
  text(ids: BigInt64Array, mask: BigInt64Array): Promise<Float32Array>
  /** seconds [1] → embedding [1,1,768] */
  seconds(s: number): Promise<Float32Array>
  /** one denoising call: the velocity [1,256,L] */
  dit(x: Float32Array, t: number, cross: Float32Array, global: Float32Array, local: Float32Array, mask: Uint8Array, frames: number): Promise<Float32Array>
  /** latents [1,256,L] → audio [1,2,L·4096] */
  decode(latents: Float32Array, frames: number): Promise<Float32Array>
}

export interface Sa3Request {
  ids: ArrayLike<number>
  seconds: number
  steps?: number
  seed: number
  onStep?: (done: number, of: number) => void
  /** asked between steps: true stops it */
  stopped?: () => boolean
}

/** One clip: left and right, `seconds` long. */
export async function sa3Generate(g: Sa3Graphs, req: Sa3Request): Promise<[Float32Array, Float32Array]> {
  const seconds = Math.min(SA3_MAX_SECONDS, Math.max(0.5, req.seconds))
  const steps = Math.max(1, Math.round(req.steps ?? 8))
  const L = latentFrames(seconds)
  const size = SA3_LATENT_CHANNELS * L

  const tok = sa3Tokens(req.ids)
  const states = await g.text(tok.ids, tok.mask)
  const secEmbed = await g.seconds(seconds)
  const cross = new Float32Array((SA3_TOKENS + 1) * SA3_DIM)
  cross.set(states.subarray(0, SA3_TOKENS * SA3_DIM))
  cross.set(secEmbed.subarray(0, SA3_DIM), SA3_TOKENS * SA3_DIM)
  const global = secEmbed.slice(0, SA3_DIM)
  // (inpainting's channel: nothing for a clip from words)
  const local = new Float32Array((SA3_TOKENS + 1) * L)
  const mask = new Uint8Array(L).fill(1)

  const randn = normals(req.seed)
  const sigmas = sa3Schedule(steps)
  let x = randn(size)
  for (let i = 0; i < steps; i++) {
    if (req.stopped?.()) throw new Error('cancelled')
    const tc = sigmas[i]
    const tn = sigmas[i + 1]
    const v = await g.dit(x, tc, cross, global, local, mask, L)
    // denoised = x - t·v; then back up to the next noise level with fresh noise (none after the last step)
    const last = i === steps - 1 || tn <= 0
    const noise = last ? null : randn(size)
    const next = new Float32Array(size)
    for (let k = 0; k < size; k++) {
      const d = x[k] - tc * v[k]
      next[k] = noise ? (1 - tn) * d + tn * noise[k] : d
    }
    x = next
    req.onStep?.(i + 1, steps)
  }
  if (req.stopped?.()) throw new Error('cancelled')
  const audio = await g.decode(x, L)
  const n = Math.min(L * SA3_PER_LATENT, Math.round(seconds * SA3_RATE))
  const per = L * SA3_PER_LATENT
  const clamp = (a: Float32Array) => a.map((s) => Math.max(-1, Math.min(1, s)))
  return [clamp(audio.slice(0, n)), clamp(audio.slice(per, per + n))]
}
