/**
 * The arithmetic of a grain cloud, shared by the grain worklet (grains.worklet.ts) and mirrored by the native
 * engine (native/engine/include/ssb/Dsp.h, src/Engine.cpp). How it works follows the granulators people reach
 * for (Mutable Instruments Clouds, Padshop, Granulator II; Roads, "Microsound"):
 *
 * - DENSITY is how many grains sound at once per stream, so grains start DENSITY / SIZE times a second. Shrink
 *   the grains and they come faster: 2 ms grains at density 2 are a 1 kHz buzz, 80 ms ones at the same density
 *   a slow smear, and a density under 1 leaves gaps (a sparse cloud).
 * - KEY starts grains at the note's frequency instead (pulsar / PSOLA synthesis): the cloud plays in tune with
 *   the keyboard whatever the sample, SIZE sets its formants, and PITCH / FINE shift those formants alone.
 * - SCATTER moves the start times from a steady clock (periodic: pitched) towards random (Poisson) times (noisy).
 * - Grains start between samples, exactly when they are due, and read the sample with a 4-point interpolator, so
 *   a steady grain train is a clean harmonic tone rather than a jittery one.
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
  density: number // grains sounding at once per stream: grains start density / size times a second
  key: boolean // grains start at the note's frequency; the note no longer transposes the sample
  scan: number // POS moves through the clip at this many times real time (0: frozen; negative: backwards)
  shape: number // window taper
  jitter: number // ± semitones
  reverse: number // chance
  spread: number // ± pan
  streams: number
  scatter: number
  drift: number
  speed: number // stretch: clip seconds per second
  kRate: number // the pad's PITCH / FINE as a playback rate
  rootNote: number // the pad's ROOT (MIDI): the glide's semitones are relative to it (KEY)
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
 * KEY grains longer than this many periods are shortened to it. Grains reading the same place at the note's
 * period add up coherently on the harmonics, so a long grain at a high note would pile dozens on each other and
 * jump in level (the 1/sqrt(overlap) gain assumes unrelated grains); eight periods already resolve every harmonic.
 */
export const KEY_MAX_OVERLAP = 8

/** At most this many grains start per output sample per stream (one-sample grains at DENSITY 4 tile the output). */
export const MAX_STARTS_PER_SAMPLE = 4

/** Grains per second per stream for DENSITY of them sounding at once, each `size` seconds long. */
export function grainsPerSecond(density: number, size: number): number {
  return Math.max(1e-3, density) / Math.max(1e-6, size)
}

/** Frequency of a MIDI note (69 = A4 = 440 Hz). */
export const noteHz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

/**
 * The rising half of a Hann window, 0.5 - 0.5 cos(pi u) for u in 0..1, from a table: every sounding grain
 * evaluates it once per sample, and a dense cloud has hundreds sounding.
 */
const RISE_N = 1024
const RISE = new Float32Array(RISE_N + 1)
for (let i = 0; i <= RISE_N; i++) RISE[i] = 0.5 - 0.5 * Math.cos((Math.PI * i) / RISE_N)
export function rise(u: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  const x = u * RISE_N
  const i = Math.floor(x)
  return RISE[i] + (RISE[i + 1] - RISE[i]) * (x - i)
}

/**
 * Grain window at sample `i` of `n`: a Tukey window whose taper runs from 0 (square: harsh, clicky, like Clouds'
 * TEXTURE fully left) to 1 (Hann: smooth). Sampled at sample centres, so no sample is silent and a grain of one
 * sample still plays. `i` may be fractional: a grain due between two samples starts part-way into its window.
 */
export function grainWindow(i: number, n: number, taper: number): number {
  if (taper <= 0 || n < 2) return 1
  const x = (i + 0.5) / n
  const edge = taper / 2
  if (x < edge) return rise(x / edge)
  if (x > 1 - edge) return rise((1 - x) / edge)
  return 1
}

/**
 * 4-point, 3rd-order Hermite interpolation: the value `f` (0..1) of the way from y0 to y1, shaped by the
 * neighbours ym1 and y2. Flatter to the top of the band than the linear interpolation a grain read with before,
 * which mattered once grains started between samples (each would have had its own high-frequency roll-off).
 */
export function hermite(ym1: number, y0: number, y1: number, y2: number, f: number): number {
  const c1 = 0.5 * (y1 - ym1)
  const c2 = ym1 - 2.5 * y0 + 2 * y1 - 0.5 * y2
  const c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1)
  return ((c3 * f + c2) * f + c1) * f + y0
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
export type PanGains = [ll: number, lr: number, rl: number, rr: number]
const setPan = (o: PanGains, ll: number, lr: number, rl: number, rr: number) => {
  o[0] = ll
  o[1] = lr
  o[2] = rl
  o[3] = rr
  return o
}
/** Written into `out` when given (the worklet reuses each grain's, so a dense cloud allocates nothing). */
export function grainPan(pan: number | null, mono: boolean, out: PanGains = [0, 0, 0, 0]): PanGains {
  if (pan === null) return setPan(out, 1, 0, 0, 1)
  const p = Math.min(1, Math.max(-1, pan))
  if (mono) {
    const x = ((p + 1) / 2) * (Math.PI / 2)
    return setPan(out, Math.cos(x), Math.sin(x), 0, 0)
  }
  const x = (p <= 0 ? p + 1 : p) * (Math.PI / 2)
  const gl = Math.cos(x)
  const gr = Math.sin(x)
  return p <= 0 ? setPan(out, 1, 0, gl, gr) : setPan(out, gl, gr, 0, 1)
}
