import { describe, expect, it } from 'vitest'
import { lfoQuant, LfoState } from './lfoMath'
import { svfG, svfQ2, svfTick, SVF_TABLE, type SvfStage } from './svfMath'
import { normalise } from './capture'

/** a fixed sequence for the random shapes */
const seq = (...xs: number[]) => {
  let i = 0
  return () => xs[i++ % xs.length]
}

describe("Granulator III's LFO", () => {
  it('QUANT steps the value, halves away from 0', () => {
    expect(lfoQuant(0.3, 0)).toBe(0.3)
    expect(lfoQuant(0.26, 0.5)).toBeCloseTo(0.5, 5)
    expect(lfoQuant(-0.26, 0.5)).toBeCloseTo(-0.5, 5)
    expect(lfoQuant(0.24, 0.5)).toBe(0)
    expect(lfoQuant(0.9, 1)).toBeCloseTo(1, 5)
    for (let p = 0; p < 1; p += 0.01) {
      const v = lfoQuant(Math.sin(2 * Math.PI * p), 0.5) * 2
      expect(Math.abs(v - Math.round(v))).toBeLessThan(1e-4)
    }
  })

  it('STEREO: periodic shapes read the sides a phase apart', () => {
    const lfo = new LfoState('sine', 180, 0)
    lfo.reset(0)
    expect(lfo.value(0)).toBeCloseTo(1) // a quarter cycle ahead
    expect(lfo.value(1)).toBeCloseTo(-1) // a quarter behind
    const mono = new LfoState('triangle', 0, 0)
    mono.reset(0.1)
    expect(mono.value(0)).toBe(mono.value(1))
    const quarter = new LfoState('sine', 90, 0)
    quarter.reset(0)
    expect(quarter.value(0)).toBeCloseTo(Math.SQRT1_2)
    expect(quarter.value(1)).toBeCloseTo(-Math.SQRT1_2)
  })

  it('STEREO: random shapes mix two streams: the same at 0°, opposite at 180°, half each at 90°', () => {
    for (const [deg, l, r] of [[0, 0.6, 0.6], [180, -0.2, 0.2], [90, 0.2, 0.4]] as const) {
      const lfo = new LfoState('random', deg, 0, seq(0.8, 0.4)) // a = 0.6, b = -0.2
      lfo.reset(0)
      expect(lfo.value(0)).toBeCloseTo(l)
      expect(lfo.value(1)).toBeCloseTo(r)
    }
  })

  it('S&H holds through a cycle and steps at its end; SMOOTH ramps into the next', () => {
    const sh = new LfoState('random', 0, 0, seq(0.9, 0.5, 0.1, 0.5, 0.3, 0.5))
    sh.reset(0)
    const first = sh.value(0)
    for (let i = 0; i < 7; i++) sh.advance(0.125)
    expect(sh.value(0)).toBe(first)
    sh.advance(0.125)
    expect(sh.value(0)).not.toBe(first)
    const sm = new LfoState('smooth', 0, 0, seq(0.9, 0.5))
    sm.reset(0) // from 0 towards 0.8
    sm.advance(0.5)
    expect(sm.value(0)).toBeCloseTo(0.4)
  })

  it('RAND steps four times a cycle and glides to each (a tenth of a cycle)', () => {
    let k = 0
    const lfo = new LfoState('wander', 0, 0, () => ((k++ * 0.618) % 1))
    lfo.reset(0)
    const inc = 1 / 4800 // 10 Hz at 48 kHz
    let jump = 0
    let last = lfo.value(0)
    const seen = new Set<number>()
    for (let i = 0; i < 4800; i++) {
      lfo.advance(inc)
      const v = lfo.value(0)
      jump = Math.max(jump, Math.abs(v - last))
      last = v
      seen.add(Math.round(v * 10))
    }
    expect(jump).toBeLessThan(0.01) // no steps
    expect(seen.size).toBeGreaterThan(5) // it moves
    // the plugin steps 16 samples at a time: the same glide, near enough
    const a = new LfoState('wander', 0, 0, seq(0.9, 0.2, 0.1, 0.7))
    const b = new LfoState('wander', 0, 0, seq(0.9, 0.2, 0.1, 0.7))
    a.reset(0)
    b.reset(0)
    for (let i = 0; i < 1200; i++) a.advance(inc)
    for (let i = 0; i < 75; i++) b.advance(16 * inc, 16)
    expect(b.value(0)).toBeCloseTo(a.value(0), 2)
  })
})

describe("Granulator III's filter", () => {
  /** a stage's steady level for a sine at `hz` (cutoff 1 kHz, 48 kHz), from its RMS */
  const gain = (mode: SvfStage, hz: number, q = 1) => {
    const st = { s1: 0, s2: 0 }
    const g = svfG(1000, 48000)
    let sum = 0
    for (let i = 0; i < 48000; i++) {
      const y = svfTick(st, mode, g, 1 / q, Math.sin((2 * Math.PI * hz * i) / 48000))
      if (i >= 24000) sum += y * y
    }
    return Math.sqrt(sum / 24000) * Math.SQRT2
  }
  /** the analog 2-pole's level at the frequency the trapezoidal stage maps `hz` to (Q 1) */
  const analog = (hz: number, hp = false) => {
    const w = Math.tan((Math.PI * hz) / 48000) / Math.tan((Math.PI * 1000) / 48000)
    return (hp ? w * w : 1) / Math.hypot(1 - w * w, w)
  }

  it('LP and HP: the 2-pole responses, 12 dB an octave either side of the cutoff', () => {
    expect(gain(1, 50)).toBeCloseTo(1, 2)
    for (const hz of [250, 1000, 4000, 8000]) expect(gain(1, hz)).toBeCloseTo(analog(hz), 3)
    for (const hz of [125, 1000, 4000]) expect(gain(3, hz)).toBeCloseTo(analog(hz, true), 3)
    expect(20 * Math.log10(gain(1, 4000))).toBeCloseTo(-24, -1) // two octaves up
    expect(gain(0, 1234)).toBeCloseTo(1, 5) // off: passes
  })

  it("NOTCH is Granulator III's: a true notch at Q 1; at 0.707 the lows 2 − k down, at Q 7 a bump", () => {
    expect(gain(2, 1000)).toBeLessThan(0.01)
    expect(gain(2, 20, 0.707)).toBeCloseTo(2 - 1 / 0.707, 2)
    expect(20 * Math.log10(gain(2, 1000, 7))).toBeGreaterThan(15)
  })

  it("types: two stages; stage 2's Q follows RES only for LP+HP and NO+NO", () => {
    expect(SVF_TABLE.lp24.slice(0, 2)).toEqual([1, 1])
    expect(SVF_TABLE.hpnotch.slice(0, 3)).toEqual([3, 2, true])
    expect(svfQ2('lphp', 7)).toBeCloseTo(3)
    expect(svfQ2('notch2', 0.7)).toBeCloseTo(0.7)
    expect(svfQ2('lp24', 7)).toBe(0.707)
    // the cutoff is kept to 10 Hz .. 0.45 × the sample rate
    expect(svfG(1, 48000)).toBeCloseTo(Math.tan((Math.PI * 10) / 48000))
    expect(svfG(1e6, 48000)).toBeCloseTo(Math.tan(Math.PI * 0.45))
  })
})

describe('CAPTURE', () => {
  it('peak-normalises to 1; silence is nothing', () => {
    const l = new Float32Array([0.1, -0.25, 0.2])
    const r = new Float32Array([0, 0.05, -0.1])
    expect(normalise([l, r])).toBe(true)
    expect(l[1]).toBeCloseTo(-1)
    expect(r[1]).toBeCloseTo(0.2)
    expect(normalise([new Float32Array(4)])).toBe(false)
  })
})
