import type { LfoShape } from '../types'

/**
 * The matrix's LFOs, sample by sample: the page runs this in an AudioWorklet (lfo processor in grains.worklet.ts),
 * the plugin's engine the same in C++ (ssb::dsp::Lfo). Granulator III's additions: two sides a STEREO phase apart,
 * RAND (random steps four times a cycle, smoothed), QUANT and a depth.
 */

/**
 * LFO value (-1..1) at `phase` cycles, the periodic shapes: sine / triangle / sawtooth start at 0 rising, square
 * starts high, ramp-down is the sawtooth upside down.
 */
export function lfoValue(shape: LfoShape, phase: number): number {
  const p = phase - Math.floor(phase)
  switch (shape) {
    case 'sine':
      return Math.sin(2 * Math.PI * p)
    case 'triangle':
      return p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4
    case 'square':
      return p < 0.5 ? 1 : -1
    case 'sawtooth':
      return p < 0.5 ? 2 * p : 2 * p - 2
    case 'rampDown':
      return p < 0.5 ? -2 * p : 2 - 2 * p
    default:
      return 0 // random shapes are stateful: see LfoState
  }
}

/** QUANT (0..1): the value in steps of it, halves rounding away from 0 (Granulator III's LFO Quant). */
export function lfoQuant(v: number, quant: number): number {
  if (quant <= 0) return v
  const q = quant + 1e-6
  return Math.sign(v) * Math.round(Math.abs(v) / q) * q
}

/** How a random shape steps: S&H and SMOOTH once a cycle, RAND four times. */
const stepsPerCycle = (shape: LfoShape) => (shape === 'wander' ? 4 : 1)
export const isRandomShape = (shape: LfoShape) => shape === 'random' || shape === 'smooth' || shape === 'wander'

/**
 * One LFO. Random shapes draw two streams, a and b, at each step; with k = STEREO / 180 the left side is
 * a·(1 − k) + b·k and the right a·(1 − k) − b·k: the same at 0°, unrelated at 90°, opposite at 180°. Periodic
 * shapes read the left side at phase + STEREO / 720 and the right at phase − it.
 */
export class LfoState {
  /** cycles; it only matters mod 1, apart from counting steps */
  phase = 0
  private prevA = 0
  private nextA = 0
  private prevB = 0
  private nextB = 0
  /** RAND's smoothed sides */
  private y = [0, 0]
  /** the step the phase is in */
  private step = 0

  constructor(
    public shape: LfoShape,
    public stereo: number, // degrees
    public quant: number,
    private rnd: () => number = Math.random,
  ) {}

  private draw() {
    return this.rnd() * 2 - 1
  }

  /** Start from `phase` (cycles): random shapes draw afresh, RAND sits on its first value. */
  reset(phase: number) {
    this.phase = phase
    this.step = Math.floor(phase * stepsPerCycle(this.shape))
    this.prevA = this.prevB = 0
    this.nextA = this.draw()
    this.nextB = this.draw()
    if (this.shape === 'random' || this.shape === 'wander') {
      this.prevA = this.nextA
      this.prevB = this.nextB
    }
    this.y = [this.target(0), this.target(1)]
  }

  /** a random shape's step value for `side` (S&H's held one, RAND's target) */
  private target(side: number): number {
    const k = Math.min(1, Math.max(0, this.stereo / 180))
    const b = (side ? -k : k) * this.prevB
    return this.prevA * (1 - k) + b
  }

  /** The raw shape on `side` (0 left, 1 right), QUANT applied: -1..1. */
  value(side: number): number {
    let v: number
    switch (this.shape) {
      case 'random':
        v = this.target(side)
        break
      case 'wander':
        v = this.y[side]
        break
      case 'smooth': {
        const k = Math.min(1, Math.max(0, this.stereo / 180))
        const f = this.phase - Math.floor(this.phase)
        const a = this.prevA + (this.nextA - this.prevA) * f
        const b = this.prevB + (this.nextB - this.prevB) * f
        v = a * (1 - k) + (side ? -k : k) * b
        break
      }
      default: {
        const s = this.stereo / 720
        v = lfoValue(this.shape, this.phase + (side ? -s : s))
      }
    }
    return lfoQuant(v, this.quant)
  }

  /**
   * Move on `inc` cycles, over `n` samples (1 in the page; the plugin's engine steps 16 at a time). RAND closes in
   * on its target by 10 × inc a sample (a tenth of a cycle's time constant).
   */
  advance(inc: number, n = 1) {
    this.phase += inc
    const spc = stepsPerCycle(this.shape)
    const step = Math.floor(this.phase * spc)
    if (step !== this.step) {
      const crossed = Math.min(4, Math.abs(step - this.step))
      this.step = step
      for (let i = 0; i < crossed; i++) {
        // S&H and RAND land on the value they hold; SMOOTH has ramped into it
        this.prevA = this.shape === 'smooth' ? this.nextA : this.draw()
        this.prevB = this.shape === 'smooth' ? this.nextB : this.draw()
        this.nextA = this.draw()
        this.nextB = this.draw()
      }
    }
    if (this.shape === 'wander') {
      const c = Math.min(1, (10 * Math.abs(inc)) / n)
      const g = n === 1 ? c : 1 - Math.pow(1 - c, n)
      for (let side = 0; side < 2; side++) this.y[side] += g * (this.target(side) - this.y[side])
    }
    if (this.phase > 1e6 || this.phase < -1e6) {
      this.phase -= Math.floor(this.phase)
      this.step = Math.floor(this.phase * spc)
    }
  }
}

/** The LFO processor's start (processorOptions) and messages. */
export interface LfoOptions {
  shape: LfoShape
  stereo: number
  quant: number
  /** cycles at `start`; before it the LFO waits */
  phase: number
  start: number
}
export type ToLfo =
  | { type: 'set'; shape: LfoShape; stereo: number; quant: number }
  | { type: 'restart'; phase: number; at: number }
  | { type: 'stop' }
