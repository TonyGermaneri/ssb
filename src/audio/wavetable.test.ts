import { describe, expect, it } from 'vitest'
import { fmtEntry, tableCount, tablePos, tableRead } from './wavetable'

/** a table of `count` cycles of `size` frames: cycle k is a ramp scaled by (k + 1) */
const table = (count: number, size: number) => Float32Array.from({ length: count * size }, (_, i) => ((Math.floor(i / size) + 1) * (i % size)) / size)

describe('wavetables', () => {
  it('count whole cycles only', () => {
    expect(tableCount(2400, 600)).toBe(4)
    expect(tableCount(2500, 600)).toBe(4)
    expect(tableCount(500, 600)).toBe(0)
    expect(tableCount(2400, 0)).toBe(0)
  })

  it('place WT + BLEND + modulation in the table, wrapping round', () => {
    expect(tablePos(1, 0.25, 0, 4)).toBeCloseTo(1.25)
    expect(tablePos(3, 0.5, 0, 4)).toBeCloseTo(3.5)
    expect(tablePos(5, 0, 0, 4)).toBeCloseTo(1)
    // modulation is a share of the table: +0.25 of 4 cycles is one on, -0.5 two back
    expect(tablePos(0, 0, 0.25, 4)).toBeCloseTo(1)
    expect(tablePos(1, 0, -0.5, 4)).toBeCloseTo(3)
    expect(tablePos(2, 0, 0, 1)).toBe(0)
  })

  it('read a cycle as it is at BLEND 0, and blend it into the next at one phase', () => {
    const t = table(4, 8)
    // cycle 1 at phase 4: (1 + 1) · 4 / 8
    expect(tableRead(t, 8, 4, 4, 1)).toBeCloseTo(1)
    // between frames: linear
    expect(tableRead(t, 8, 4, 4.5, 1)).toBeCloseTo(1.125)
    // half way to cycle 2 (3 · 4 / 8 = 1.5): 1.25
    expect(tableRead(t, 8, 4, 4, 1.5)).toBeCloseTo(1.25)
    // 2 % of cycle 1, 98 % of cycle 2
    expect(tableRead(t, 8, 4, 4, 1.98)).toBeCloseTo(0.02 * 1 + 0.98 * 1.5)
    // the last cycle blends into the first
    expect(tableRead(t, 8, 4, 4, 3.5)).toBeCloseTo(0.5 * 2 + 0.5 * 0.5)
    // past a cycle's last frame comes its own first, not the next cycle's
    expect(tableRead(t, 8, 4, 7.5, 0)).toBeCloseTo((7 / 8 + 0) / 2)
  })

  it('show WT 1-based, with the table size', () => {
    expect(fmtEntry(0, 100)).toBe('1 / 100')
    expect(fmtEntry(11, 0)).toBe('12')
  })
})
