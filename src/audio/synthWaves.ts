/**
 * Buffers for SFZ's built-in generators (*sine, *saw, *square, *triangle, *noise, *silence).
 *
 * Periodic waves are a looped wavetable pitched at C4 (the default pitch_keycenter): the buffer's sample rate is
 * chosen so one cycle is exactly 256 samples, so the loop is seamless. Saw / square / triangle are built additively
 * (band-limited) so they don't alias badly when played higher.
 */
export const SYNTH_WAVES = ['sine', 'saw', 'square', 'triangle', 'noise', 'silence'] as const
export type SynthWave = (typeof SYNTH_WAVES)[number]

const C4 = 261.6255653
const CYCLE = 256
const CYCLES = 64
const HARMONICS = 60

/** "*tri" → "triangle", "*sine" → "sine"; null if not a generator we know. */
export function synthWave(sample: string): SynthWave | null {
  const n = sample.replace(/^\*/, '').toLowerCase()
  if (n === 'tri') return 'triangle'
  return (SYNTH_WAVES as readonly string[]).includes(n) ? (n as SynthWave) : null
}

export const synthAudioId = (w: SynthWave) => `synth:${w}`
export const isSynthAudioId = (id: string) => id.startsWith('synth:')

/** One cycle of a band-limited wave, 0..1 phase → -1..1. */
export function cycleSample(w: SynthWave, phase: number): number {
  const x = 2 * Math.PI * phase
  let v = 0
  switch (w) {
    case 'sine':
      return Math.sin(x)
    case 'saw':
      for (let k = 1; k <= HARMONICS; k++) v += Math.sin(k * x) / k
      return (2 / Math.PI) * v
    case 'square':
      for (let k = 1; k <= HARMONICS; k += 2) v += Math.sin(k * x) / k
      return (4 / Math.PI) * v
    case 'triangle':
      for (let k = 1, sign = 1; k <= HARMONICS; k += 2, sign = -sign) v += (sign * Math.sin(k * x)) / (k * k)
      return (8 / (Math.PI * Math.PI)) * v
    default:
      return 0
  }
}

export function makeSynthBuffer(ctx: BaseAudioContext, w: SynthWave): AudioBuffer {
  if (w === 'noise' || w === 'silence') {
    const len = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    if (w === 'noise') {
      const d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    }
    return buf
  }
  const buf = ctx.createBuffer(1, CYCLE * CYCLES, C4 * CYCLE)
  const d = buf.getChannelData(0)
  const one = new Float32Array(CYCLE)
  for (let i = 0; i < CYCLE; i++) one[i] = 0.8 * cycleSample(w, i / CYCLE)
  for (let c = 0; c < CYCLES; c++) d.set(one, c * CYCLE)
  return buf
}
