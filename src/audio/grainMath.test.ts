import { describe, expect, it } from 'vitest'
import {
  grainGain, grainInterval, grainPan, grainsPerSecond, grainWindow, hermite, KEY_MAX_OVERLAP, noteHz, rise,
} from './grainMath'

describe('grain window', () => {
  it('runs from square to Hann, and a one-sample grain plays', () => {
    expect(grainWindow(0, 1, 1)).toBe(1)
    expect(grainWindow(0, 64, 0)).toBe(1) // square: full level from the first sample
    expect(grainWindow(0, 64, 1)).toBeLessThan(0.01) // Hann: fades in
    expect(grainWindow(32, 64, 1)).toBeGreaterThan(0.99)
    // a half taper: flat in the middle half, cosine edges
    expect(grainWindow(32, 64, 0.5)).toBe(1)
    expect(grainWindow(20, 64, 0.5)).toBe(1)
    expect(grainWindow(3, 64, 0.5)).toBeLessThan(0.3)
    for (let i = 0; i < 10; i++) expect(grainWindow(i, 10, 1)).toBeCloseTo(grainWindow(9 - i, 10, 1), 6) // symmetric
  })

  it('is the raised cosine it stands for, between samples too', () => {
    const exact = (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, u)))
    for (let k = 0; k <= 1000; k++) expect(rise(k / 1000 + 0.00037)).toBeCloseTo(exact(k / 1000 + 0.00037), 5)
    expect(rise(-1)).toBe(0)
    expect(rise(2)).toBe(1)
    // a grain due 0.3 samples before its first output sample starts 0.3 into its window
    const n = 48
    for (const i of [0.3, 7.3, 40.3]) {
      const x = (i + 0.5) / n
      const hann = 0.5 - 0.5 * Math.cos(2 * Math.PI * x)
      expect(grainWindow(i, n, 1)).toBeCloseTo(hann, 5)
    }
    // past the end (a fractional start can leave the last sample a hair over): silent, not negative
    expect(grainWindow(n - 0.3, n, 1)).toBeGreaterThanOrEqual(0)
    expect(grainWindow(n - 0.3, n, 1)).toBeLessThan(0.01)
  })
})

describe('grain timing', () => {
  it('starts DENSITY grains per SIZE: shorter grains come faster, keeping the overlap', () => {
    expect(grainsPerSecond(2, 0.08)).toBeCloseTo(25) // 80 ms grains, two at a time: 25 a second
    expect(grainsPerSecond(2, 0.002)).toBeCloseTo(1000) // 2 ms grains: a 1 kHz buzz, not 25 clicks
    expect(grainsPerSecond(0.125, 0.08)).toBeCloseTo(1.5625) // sparse: one every eight grain lengths
    expect(grainsPerSecond(2, 1 / 48000) * (1 / 48000)).toBeCloseTo(2) // one-sample grains keep the overlap too
    expect(KEY_MAX_OVERLAP).toBe(8)
  })

  it('KEY: grains at the note', () => {
    expect(noteHz(69)).toBe(440)
    expect(noteHz(57)).toBeCloseTo(220)
    expect(noteHz(60)).toBeCloseTo(261.63, 1)
    expect(noteHz(60 + 0.5)).toBeCloseTo(noteHz(60) * Math.pow(2, 1 / 24)) // glides land between notes
  })

  it('is steady at scatter 0 and Poisson at 1, with the same average rate', () => {
    expect(grainInterval(20, 0, 0.7)).toBe(0.05)
    let seed = 1
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    for (const scatter of [0.5, 1]) {
      let sum = 0
      let min = Infinity
      for (let i = 0; i < 20000; i++) {
        const d = grainInterval(20, scatter, rand())
        sum += d
        min = Math.min(min, d)
      }
      expect(sum / 20000).toBeCloseTo(0.05, 2)
      if (scatter === 1) expect(min).toBeLessThan(0.001) // exponential: some grains land almost together
      else expect(min).toBeGreaterThanOrEqual(0.025) // half steady: never closer than half the period
    }
  })

  it('sparse clouds play grains at full level, dense ones by 1/√overlap', () => {
    expect(grainGain(0.2)).toBe(1)
    expect(grainGain(2)).toBe(1)
    expect(grainGain(8)).toBeCloseTo(0.5)
    expect(grainGain(32)).toBeCloseTo(0.25)
  })
})

describe('grain interpolation', () => {
  it('passes through the samples and follows a curve between them', () => {
    expect(hermite(1, 2, 3, 4, 0)).toBe(2)
    expect(hermite(1, 2, 3, 4, 1)).toBeCloseTo(3)
    expect(hermite(1, 2, 3, 4, 0.25)).toBeCloseTo(2.25) // a line stays a line
    const sq = (x: number) => x * x
    expect(hermite(sq(-1), sq(0), sq(1), sq(2), 0.5)).toBeCloseTo(sq(0.5)) // a parabola too
    // a sine at an eighth of the sample rate (6 kHz at 48 k): far closer than the straight line between samples
    const s = (x: number) => Math.sin((Math.PI / 4) * x)
    const f = 0.5
    const linear = s(0) + (s(1) - s(0)) * f
    expect(Math.abs(hermite(s(-1), s(0), s(1), s(2), f) - s(f))).toBeLessThan(Math.abs(linear - s(f)) / 4)
  })
})

describe('grain pan', () => {
  it('follows StereoPannerNode: equal power for mono, fold-over for stereo', () => {
    expect(grainPan(null, true)).toEqual([1, 0, 0, 1])
    const [ll, lr] = grainPan(0, true)
    expect(ll).toBeCloseTo(Math.SQRT1_2)
    expect(lr).toBeCloseTo(Math.SQRT1_2)
    expect(grainPan(-1, false)).toEqual([1, 0, 1, expect.closeTo(0, 9)]) // hard left: R folds into L
    const [l2, r2, , rr2] = grainPan(1, false)
    expect(l2).toBeCloseTo(0)
    expect(r2).toBeCloseTo(1)
    expect(rr2).toBe(1)
  })
})
