import { describe, expect, it } from 'vitest'
import { compareMetrics, describeMetrics, measure, noteOf, type Render } from './analysis'

const rate = 48000
/** a note: `f(t)` for `seconds`, released at `off` (then e^-t/tau) */
function note(f: (t: number) => number, seconds: number, off: number, tau = 0.1086, attack = 0, stereo?: (l: number, t: number) => number): Render {
  const n = Math.round(seconds * rate)
  const L = new Float32Array(n)
  const R = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / rate
    const env = (attack > 0 ? Math.min(1, t / attack) : 1) * (t < off ? 1 : Math.exp(-(t - off) / tau))
    L[i] = f(t) * env
    R[i] = stereo ? stereo(L[i], t) : L[i]
  }
  return { channels: [L, R], sampleRate: rate, noteOffAt: off }
}
const sine = (hz: number, a = 0.5) => (t: number) => a * Math.sin(2 * Math.PI * hz * t)

describe('measure', () => {
  it('reads a sine: its pitch, note, brightness and tonality', () => {
    const m = measure(note(sine(261.63), 2, 1.5))
    expect(Math.abs(m.fundamentalHz! - 261.63)).toBeLessThan(0.3)
    expect(m.noteName).toBe('C4')
    expect(Math.abs(m.centsOff!)).toBeLessThanOrEqual(1)
    expect(m.periodicity).toBeGreaterThan(0.95)
    expect(Math.abs(m.centroidHz - 262)).toBeLessThan(15)
    expect(m.flatness).toBeLessThan(0.01)
    expect(Math.abs(m.peaks[0].hz - 261.63)).toBeLessThan(1)
    expect(m.peakDb).toBeCloseTo(-6, 0)
    expect(m.rmsHeldDb).toBeCloseTo(-9, 0)
    expect(m.stereoCorrelation).toBeCloseTo(1, 3)
    expect(m.clipped).toBe(0)
  })

  it('finds the harmonics of a saw-like tone, loudest first', () => {
    const saw = (t: number) => [1, 2, 3, 4].reduce((s, k) => s + Math.sin(2 * Math.PI * 110 * k * t) / k, 0) * 0.3
    const m = measure(note(saw, 2, 1.5))
    expect(Math.abs(m.fundamentalHz! - 110)).toBeLessThan(0.3)
    expect(m.peaks.slice(0, 4).map((p) => Math.round(p.hz / 110))).toEqual([1, 2, 3, 4])
    expect(m.peaks[1].db).toBeCloseTo(-6, 0)
    expect(m.centroidHz).toBeGreaterThan(150)
  })

  it('times an exponential release: 40 dB in 0.5 s', () => {
    const m = measure(note(sine(440), 2.5, 1, 0.5 / Math.log(100)))
    expect(Math.abs(m.releaseMs! - 500)).toBeLessThan(25)
    expect(m.tailDropDb!).toBeGreaterThan(60)
  })

  it('times a linear attack (10 % to 90 % of 100 ms) and a held sustain', () => {
    const m = measure(note(sine(440), 2, 1.5, 0.1, 0.1))
    expect(Math.abs(m.attackMs - 80)).toBeLessThan(12)
    expect(m.decayMs).toBeNull()
    expect(Math.abs(m.sustainDb)).toBeLessThan(0.5)
  })

  it('calls silence silent, counts clipping, and hears noise as noise', () => {
    expect(measure(note(() => 0, 1, 0.5)).silent).toBe(true)
    expect(describeMetrics(measure(note(() => 0, 1, 0.5)))).toMatch(/Silent/)
    const clip = measure(note((t) => Math.max(-1, Math.min(1, 1.5 * Math.sin(2 * Math.PI * 100 * t))), 1, 0.8))
    expect(clip.clipped).toBeGreaterThan(1000)
    let seed = 1
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.5
    const m = measure(note(noise, 1.5, 1.2))
    expect(m.flatness).toBeGreaterThan(0.4)
    expect(m.periodicity).toBeLessThan(0.7)
  })

  it('hears stereo: out of phase is -1, wide is near 0', () => {
    const m = measure(note(sine(330), 1.5, 1, 0.1, 0, (l) => -l))
    expect(m.stereoCorrelation).toBeCloseTo(-1, 3)
    expect(m.sideDb).toBeGreaterThan(40)
  })

  it('names notes and compares renders', () => {
    expect(noteOf(440)).toEqual({ name: 'A4', cents: 0, midi: 69 })
    expect(noteOf(261.63).name).toBe('C4')
    const a = measure(note(sine(440), 1.5, 1))
    const b = measure(note(sine(440, 0.25), 1.5, 1))
    const d = compareMetrics(a, b)
    expect(d.peakDb.delta).toBeCloseTo(-6, 0)
    expect(d.fundamentalHz.delta).toBeCloseTo(0, 1)
  })
})
