import { describe, expect, it } from 'vitest'
import { defaultPadLfo, lfoAt, lfoPath, rateHz, shapeName, snapShape, RATE_HI, RATE_LO } from './padLfo'

const at = (o: Partial<ReturnType<typeof defaultPadLfo>>) => ({ ...defaultPadLfo({ x: 0.5, y: 0.5 }), ...o })
const close = (a: { x: number; y: number }, x: number, y: number) => {
  expect(a.x).toBeCloseTo(x, 4)
  expect(a.y).toBeCloseTo(y, 4)
}

describe("a pad's LFO", () => {
  it('goes round a circle about its centre, AMP away', () => {
    const l = at({ amp: 0.25 })
    close(lfoAt(l, 0), 0.75, 0.5)
    close(lfoAt(l, 0.25), 0.5, 0.75)
    close(lfoAt(l, 0.5), 0.25, 0.5)
    close(lfoAt(l, 1.25), 0.5, 0.75)
  })
  it('is stretched by ASPECT: wide to the right, tall to the left', () => {
    close(lfoAt(at({ amp: 0.4, aspect: 1 }), 0.25), 0.5, 0.6)
    close(lfoAt(at({ amp: 0.4, aspect: 1 }), 0), 0.9, 0.5)
    close(lfoAt(at({ amp: 0.4, aspect: 0 }), 0), 0.6, 0.5)
  })
  it('is held at the edges: at full AMP a circle squares off', () => {
    const pts = lfoPath(at({ amp: 1 }), 64)
    for (const p of pts) for (const v of [p.x, p.y]) expect(v >= 0 && v <= 1).toBe(true)
    close(lfoAt(at({ amp: 1 }), 0.125), 1, 1)
    close(lfoAt(at({ amp: 0.3, cx: 0.9 }), 0), 1, 0.5)
  })
  it('a square has corners, a line stays on its row, and between two it morphs', () => {
    close(lfoAt(at({ shape: 2, amp: 0.2 }), 0), 0.7, 0.5)
    close(lfoAt(at({ shape: 2, amp: 0.2 }), 0.125), 0.7, 0.7)
    for (let i = 0; i < 8; i++) expect(lfoAt(at({ shape: 4 }), i / 8).y).toBeCloseTo(0.5, 6)
    const mid = lfoAt(at({ shape: 0.5, amp: 0.2 }), 0.25)
    // (a quarter round: the circle's top, the eight's right; half of each)
    close(mid, 0.6, 0.6)
  })
  it('SHAPE runs CIRCLE to LINE, and names a morph by its two', () => {
    expect(snapShape(-1)).toBe(0)
    expect(snapShape(7)).toBe(4)
    expect(shapeName(4)).toBe('LINE')
    expect(shapeName(0.5)).toBe('CIRCLE→EIGHT')
  })
  it('FREQ runs from slow to fast, on a log scale', () => {
    expect(rateHz(0)).toBeCloseTo(RATE_LO)
    expect(rateHz(1)).toBeCloseTo(RATE_HI)
    expect(rateHz(0.5)).toBeCloseTo(Math.sqrt(RATE_LO * RATE_HI))
  })
})
