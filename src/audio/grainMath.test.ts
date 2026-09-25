import { describe, expect, it } from 'vitest'
import { grainGain, grainInterval, grainPan, grainWindow } from './grainMath'

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
    for (let i = 0; i < 10; i++) expect(grainWindow(i, 10, 1)).toBeCloseTo(grainWindow(9 - i, 10, 1), 9) // symmetric
  })
})

describe('grain timing', () => {
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
