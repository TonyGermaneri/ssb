import { describe, expect, it } from 'vitest'
import { dot } from '../embed/model2vec'
import { cycleTimbre, sampleTimbre } from './timbre'

/** one period of a wave made of harmonics (amplitude of harmonic k) */
const cycle = (amp: (k: number) => number, n = 600) =>
  Float32Array.from({ length: n }, (_, i) => {
    let v = 0
    for (let k = 1; k < 128; k++) v += amp(k) * Math.sin((2 * Math.PI * k * i) / n)
    return v / 2
  })
const saw = (k: number) => 1 / k
const square = (k: number) => (k % 2 ? 1 / k : 0)
const sine = (k: number) => (k === 1 ? 1 : 0)

describe('timbre', () => {
  it('is a unit vector, and zeros for silence', () => {
    const t = cycleTimbre(cycle(saw))
    expect(dot(t, t)).toBeCloseTo(1, 5)
    expect(cycleTimbre(new Float32Array(600)).every((x) => x === 0)).toBe(true)
  })
  it('tells a saw from a square, and both from a sine', () => {
    const [a, b, c] = [saw, square, sine].map((f) => cycleTimbre(cycle(f)))
    const darker = cycleTimbre(cycle((k) => 1 / (k * k)))
    expect(dot(a, cycleTimbre(cycle((k) => (1 / k) * (1 + 0.05 * Math.sin(k)))))).toBeGreaterThan(0.99)
    expect(dot(a, b)).toBeLessThan(0.75) // a square has no even harmonics
    expect(dot(a, darker)).toBeGreaterThan(dot(a, c)) // a duller saw is still nearer a saw than a sine is
  })
  it('hears a saw played as a sample at C2 as the same as its single cycle', () => {
    const rate = 48000
    const one = cycle(saw, 1024)
    const hz = 65.406
    const data = Float32Array.from({ length: rate }, (_, i) => {
      const x = ((i * hz) / rate) % 1
      return one[Math.floor(x * one.length)]
    })
    expect(dot(sampleTimbre(data, rate), cycleTimbre(cycle(saw)))).toBeGreaterThan(0.9)
  })
})
