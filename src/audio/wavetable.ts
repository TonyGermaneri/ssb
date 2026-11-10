/**
 * Wavetables: a sample made of equal single cycles (`size` frames each), played as an oscillator. A note reads one
 * cycle over and over at the note's rate, as a looping single-cycle sample would, and blends it into the next one
 * at the same phase: position p = WT + BLEND (+ modulation, as a share of the table), cycle ⌊p⌋ weighted 1 − frac(p)
 * and cycle ⌊p⌋ + 1 weighted frac(p), the last cycle's next being the first. BLEND 0 plays the cycle as it is, so a
 * single AKWF wave and the same wave in its category's table sound the same.
 *
 * Why an oscillator and not the granulator at audio rate: grains are windowed and overlap (two streams half a period
 * apart), which at the pitch rate becomes amplitude modulation with its own sidebands and a comb (the second stream
 * reads the same cycle half a period late); blending by moving POS between cycles splices them out of phase. Reading
 * two cycles at one phase and crossfading is exact, keeps the pitch the playback rate's, and costs two reads.
 *
 * The page's processor (grains.worklet.ts TableProcessor) and the native engine (Engine.cpp, the sample voice) read
 * it the same way: linear interpolation within a cycle, wrapping at its end.
 *
 * Played as grains or STRETCH, a table is the wave WT and BLEND pick, repeated to a quarter second as a single-cycle
 * wave's buffer is (tableCycleBuffer; ModelJson.cpp tableCycleSample): the grain patches made of single AKWF waves
 * sound as they did, and WT and BLEND still choose what the grains read.
 */

/** how many whole cycles a sample of `frames` holds (0: not a wavetable) */
export const tableCount = (frames: number, size: number) => (size >= 2 ? Math.floor(frames / size) : 0)

/**
 * The position, in cycles from the first: WT + BLEND + modulation (WT POS: a share of the table), wrapped into
 * 0..count. `blendMod` (the matrix's WT BLEND) adds to BLEND, held to 0..1.
 */
export function tablePos(wt: number, blend: number, mod: number, count: number, blendMod = 0): number {
  if (count <= 1) return 0
  const b = Math.min(1, Math.max(0, blend + blendMod))
  let p = (wt + b + mod * count) % count
  if (p < 0) p += count
  return p >= count ? 0 : p
}

/** A channel's value `phase` frames into a cycle (0..size) at position p (tablePos). */
export function tableRead(ch: Float32Array, size: number, count: number, phase: number, p: number): number {
  const i0 = Math.floor(phase)
  const i1 = i0 + 1 >= size ? 0 : i0 + 1
  const fr = phase - i0
  const ia = Math.min(count - 1, Math.floor(p))
  const f = p - ia
  const a0 = ia * size
  const a = ch[a0 + i0] + (ch[a0 + i1] - ch[a0 + i0]) * fr
  if (f <= 0) return a
  const b0 = (ia + 1 >= count ? 0 : ia + 1) * size
  const b = ch[b0 + i0] + (ch[b0 + i1] - ch[b0 + i0]) * fr
  return a + (b - a) * f
}

/** "12 / 100": a WT knob's value (1-based) and the table's size */
export const fmtEntry = (wt: number, count: number) => `${Math.round(wt) + 1}${count > 0 ? ` / ${count}` : ''}`

/** how long a single cycle is repeated for, for grains and STRETCH to move in (engine.ts cycleBuffer's) */
export const CYCLE_FILL = 0.25

/** how long the buffer grains play of a table is (tableCycleBuffer): a cycle repeated to CYCLE_FILL */
export const cycleFillSeconds = (size: number, rate: number) => (size * Math.max(1, Math.round((rate * CYCLE_FILL) / size))) / rate

const cycleBuffers = new WeakMap<AudioBuffer, Map<number, AudioBuffer>>()
/** The wave a table's WT + BLEND pick (position p, tablePos), repeated to CYCLE_FILL: what grains play of a table. */
export function tableCycleBuffer(buf: AudioBuffer, size: number, p: number): AudioBuffer {
  let byPos = cycleBuffers.get(buf)
  if (!byPos) cycleBuffers.set(buf, (byPos = new Map()))
  const hit = byPos.get(p)
  if (hit) return hit
  const count = tableCount(buf.length, size)
  const ia = Math.min(count - 1, Math.floor(p))
  const f = p - ia
  const ib = ia + 1 >= count ? 0 : ia + 1
  const times = Math.max(1, Math.round((buf.sampleRate * CYCLE_FILL) / size))
  const out = new AudioBuffer({ numberOfChannels: buf.numberOfChannels, length: size * times, sampleRate: buf.sampleRate })
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c)
    const cyc = new Float32Array(size)
    for (let i = 0; i < size; i++) cyc[i] = src[ia * size + i] + (src[ib * size + i] - src[ia * size + i]) * f
    const d = out.getChannelData(c)
    for (let k = 0; k < times; k++) d.set(cyc, k * size)
  }
  if (byPos.size > 64) byPos.clear()
  byPos.set(p, out)
  return out
}
