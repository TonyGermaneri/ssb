import { describe, expect, it } from 'vitest'
import { Spectrum } from './fft'

describe('Spectrum', () => {
  const rate = 48000
  const n = 2048
  const sine = (hz: number, amp: number) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate))

  it('puts a full-scale sine at 0 dB in its bin, and little elsewhere', () => {
    const s = new Spectrum(n)
    const bin = 64
    s.run(sine((bin * rate) / n, 1))
    expect(s.db[bin]).toBeCloseTo(0, 1)
    expect(s.db[bin + 10]).toBeLessThan(-60)
  })

  it('reads a band by its loudest bin, scaled with the level', () => {
    const s = new Spectrum(n)
    s.run(sine(1000, 0.1))
    expect(s.peak(900, 1100, rate)).toBeGreaterThan(-21.5)
    expect(s.peak(900, 1100, rate)).toBeLessThan(-19.5)
    expect(s.peak(4000, 8000, rate)).toBeLessThan(-70)
  })
})
