import { describe, expect, it } from 'vitest'
import { GRAIN_LENGTH_MIN, LENGTH_FADE, lengthGate, lengthPhase } from './grainMath'

describe('grain LENGTH', () => {
  it('leaves the phase alone at 1, squeezes it into the first part otherwise, silent after', () => {
    for (const p of [0, 0.123, 0.5, 0.999]) expect(lengthPhase(p, 1)).toBe(p)
    expect(lengthPhase(0.1, 0.25)).toBeCloseTo(0.4, 12)
    expect(lengthPhase(0.2499, 0.25)).toBeCloseTo(0.9996, 12)
    expect(lengthPhase(0.25, 0.25)).toBe(-1)
    expect(lengthPhase(0.9, 0.25)).toBe(-1)
    expect(GRAIN_LENGTH_MIN).toBe(0.01)
  })

  it("gates a LOOP segment: whole, then a raised-cosine fade over the end of what sounds, then silence; 1 at LENGTH 1", () => {
    for (const u of [0, 0.5, 0.99]) expect(lengthGate(u, 1)).toBe(1)
    const L = 0.4
    expect(lengthGate(0.1, L)).toBe(1)
    expect(lengthGate(L * (1 - LENGTH_FADE), L)).toBe(1)
    expect(lengthGate(L * (1 - LENGTH_FADE / 2), L)).toBeCloseTo(0.5, 9)
    expect(lengthGate(L, L)).toBe(0)
    expect(lengthGate(0.9, L)).toBe(0)
  })
})
