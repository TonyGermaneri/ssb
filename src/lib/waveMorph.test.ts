import { describe, expect, it } from 'vitest'
import { MORPH_MS, waveMorph } from './waveMorph'

const flat = (n: number, v: number) => Float32Array.from({ length: n * 2 }, (_, i) => (i % 2 ? v : -v))

describe('waveMorph', () => {
  it('shows the first wave at once', () => {
    const m = waveMorph()
    const a = flat(10, 0.5)
    expect(m.at('a', a, 0)).toBe(a)
    expect(m.moving(0)).toBe(false)
  })

  it('morphs a new wave in, sweeping left to right, and lands exactly on it', () => {
    const m = waveMorph()
    const a = flat(10, 0.2)
    const b = flat(10, 0.8)
    m.at('a', a, 0)
    const start = m.at('b', b, 1000)!
    expect(start[1]).toBeCloseTo(0.2)
    const mid = m.at('b', b, 1000 + MORPH_MS / 2)!
    // the left is further along than the right
    expect(mid[1]).toBeGreaterThan(mid[19])
    expect(mid[1]).toBeGreaterThan(0.2)
    expect(mid[19]).toBeLessThan(0.8)
    expect(m.moving(1000 + MORPH_MS / 2)).toBe(true)
    expect(m.at('b', b, 1000 + MORPH_MS)).toBe(b)
    expect(m.moving(1000 + MORPH_MS)).toBe(false)
  })

  it('resamples the old wave onto the new columns', () => {
    const m = waveMorph()
    m.at('a', flat(40, 0.3), 0)
    const r = m.at('b', flat(7, 0.9), 10)!
    expect(r.length).toBe(14)
    expect(r[1]).toBeCloseTo(0.3)
  })

  it('snaps when the same wave is redrawn (a trim, a resize)', () => {
    const m = waveMorph()
    m.at('a', flat(10, 0.3), 0)
    const a2 = flat(12, 0.6)
    expect(m.at('a', a2, 5)).toBe(a2)
    expect(m.moving(5)).toBe(false)
  })

  it('holds the old wave while the new one has no peaks yet, then morphs when they come', () => {
    const m = waveMorph()
    const a = flat(10, 0.3)
    m.at('a', a, 0)
    expect(m.at('b', undefined, 100)).toBe(a)
    expect(m.moving(100)).toBe(true)
    const b = flat(10, 0.9)
    const r = m.at('b', b, 300)!
    expect(r[1]).toBeCloseTo(0.3)
    expect(m.at('b', b, 300 + MORPH_MS)).toBe(b)
  })

  it('gives up holding after a while', () => {
    const m = waveMorph()
    m.at('a', flat(10, 0.3), 0)
    m.at('b', undefined, 100)
    expect(m.at('b', undefined, 5000)).toBeUndefined()
    expect(m.moving(5000)).toBe(false)
  })

  it('a morph interrupted starts from what was on screen', () => {
    const m = waveMorph()
    m.at('a', flat(10, 0), 0)
    m.at('b', flat(10, 1), 100)
    const mid = m.at('b', flat(10, 1), 100 + MORPH_MS / 2)!.slice()
    const r = m.at('c', flat(10, 0.5), 100 + MORPH_MS / 2)!
    expect(Array.from(r)).toEqual(Array.from(mid))
  })
})
