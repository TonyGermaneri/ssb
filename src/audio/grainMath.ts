/**
 * The arithmetic of a grain cloud, shared by the grain worklet (grains.worklet.ts) and mirrored by the native
 * engine (native/engine/src/Engine.cpp). How it works follows the usual asynchronous granular synthesis
 * (Truax; Roads, "Microsound"; Mutable Instruments Clouds): grains start at a RATE of their own, independent of
 * their SIZE, so a cloud can be sparse (gaps between grains) or dense (many overlapping), and SCATTER moves the
 * start times from a steady clock towards random (Poisson) times.
 */

/** What a voice's grain processor plays; sent again whenever a knob moves. Times are AudioContext seconds. */
export interface GrainConfig {
  kind: 'cloud' | 'stretch'
  /** the clip, seconds of the sample */
  clipIn: number
  clipOut: number
  size: number // ms
  pos: number // 0..1 of the clip
  width: number // spray, 0..1 of the clip
  rate: number // grains per second per stream
  shape: number // window taper
  jitter: number // ± semitones
  reverse: number // chance
  spread: number // ± pan
  streams: number
  scatter: number
  drift: number
  speed: number // stretch: clip seconds per second
  kRate: number // the pad's PITCH / FINE as a playback rate
  glide: { from: number; to: number; start: number; dur: number } // semitones
  t0: number
  /** no grain starts after this */
  end: number
}

/** A grain as it started, for the waveform. pos / len in seconds of the sample (forward); when / dur in context time. */
export interface GrainEvent {
  when: number
  pos: number
  len: number
  dur: number
  rate: number // playback rate (pitch)
  reverse: boolean
  pan: number
  gain: number // window level (density normalisation), 0..1
  stream: number
}

export type ToGrains =
  | { type: 'config'; config: GrainConfig }
  | { type: 'sample'; id: string; channels: Float32Array[]; rate: number }
  | { type: 'stop' }
export type FromGrains = { type: 'grains'; list: GrainEvent[] } | { type: 'need'; id: string } | { type: 'done' }

/** Grains started by the stretch mode (SPEED without pitch): fixed size, four overlapping, steady. */
export const STRETCH_GRAIN = 0.09 // seconds
export const STRETCH_OVERLAP = 4

/**
 * Grain window at sample `i` of `n`: a Tukey window whose taper runs from 0 (square: harsh, clicky, like Clouds'
 * TEXTURE fully left) to 1 (Hann: smooth). Sampled at sample centres, so no sample is silent and a grain of one
 * sample still plays.
 */
export function grainWindow(i: number, n: number, taper: number): number {
  if (taper <= 0 || n < 2) return 1
  const x = (i + 0.5) / n
  const edge = taper / 2
  if (x < edge) return 0.5 - 0.5 * Math.cos((Math.PI * x) / edge)
  if (x > 1 - edge) return 0.5 - 0.5 * Math.cos((Math.PI * (1 - x)) / edge)
  return 1
}

/**
 * Seconds from one grain's start to the next, for `rate` grains per second. Scatter 0: exactly 1 / rate;
 * scatter 1: exponentially distributed (a Poisson process, the asynchronous granular classic); between, a mix.
 * The average stays 1 / rate. `u` is a uniform random number in [0, 1).
 */
export function grainInterval(rate: number, scatter: number, u: number): number {
  const mean = 1 / Math.max(1e-3, rate)
  if (scatter <= 0) return mean
  return mean * (1 - scatter + scatter * -Math.log(1 - Math.min(u, 0.999999)))
}

/**
 * Level of each grain when `overlap` grains sound at once on average (size × rate × streams). A sparse cloud
 * plays its grains at full level; a dense one sums grains from scattered places, which add up like
 * uncorrelated sources (by the square root of their number), so it scales by 1/√overlap.
 */
export function grainGain(overlap: number): number {
  return Math.min(1, Math.sqrt(2 / Math.max(1e-6, overlap)))
}

/**
 * How a grain reaches the voice's two channels: out L = a·ll + b·rl, out R = a·lr + b·rr for the sample's
 * left / right (a, b; equal for mono). `pan` null: unpanned. Otherwise Web Audio's StereoPannerNode law (mono
 * input: equal power; stereo: the far channel folds into the near one), the node each grain had before.
 */
export function grainPan(pan: number | null, mono: boolean): [ll: number, lr: number, rl: number, rr: number] {
  if (pan === null) return [1, 0, 0, 1]
  const p = Math.min(1, Math.max(-1, pan))
  if (mono) {
    const x = ((p + 1) / 2) * (Math.PI / 2)
    return [Math.cos(x), Math.sin(x), 0, 0]
  }
  const x = (p <= 0 ? p + 1 : p) * (Math.PI / 2)
  const gl = Math.cos(x)
  const gr = Math.sin(x)
  return p <= 0 ? [1, 0, gl, gr] : [gl, gr, 0, 1]
}
