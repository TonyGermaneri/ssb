import { describe, expect, it } from 'vitest'
import { PAD_IDS } from '../../play/padControl'
import { SHIP_BOX, VARIANTS } from '../ship'
import { ERAS } from './index'

describe.each(ERAS.map((e) => [e.label, e] as const))('the %s ship', (_, era) => {
  it('carries every VCO\'s eight pads, once each', () => {
    expect(era.parts).toHaveLength(24)
    for (const vco of [0, 1, 2]) expect(era.parts.filter((p) => p.vco === vco).map((p) => p.kind).sort()).toEqual([...PAD_IDS].sort())
    expect(new Set(era.parts.map((p) => p.id)).size).toBe(24)
  })
  it('draws each part in a form it has', () => {
    for (const p of era.parts) expect(VARIANTS[p.form], `${p.name}: ${p.variant}`).toContain(p.variant)
  })
  it('gives every pad room to play, inside the ship, apart from the others', () => {
    const { x, y, w, h } = SHIP_BOX
    for (const p of era.parts) {
      const [x0, y0, x1, y1] = p.rect
      expect(x1 - x0, `${p.name} width`).toBeGreaterThanOrEqual(90)
      expect(y1 - y0, `${p.name} height`).toBeGreaterThanOrEqual(56)
      expect(x0 >= x && y0 >= y && x1 <= x + w && y1 <= y + h, `${p.name} inside`).toBe(true)
    }
    for (const a of era.parts)
      for (const b of era.parts) {
        if (a === b) continue
        const overlap = a.rect[0] < b.rect[2] && b.rect[0] < a.rect[2] && a.rect[1] < b.rect[3] && b.rect[1] < a.rect[3]
        expect(overlap, `${a.name} overlaps ${b.name}`).toBe(false)
      }
  })
  it('has a tractor port per VCO and five sky colours', () => {
    expect(era.ports.map((p) => p.vco).sort()).toEqual([0, 1, 2])
    expect(era.sky.colors).toHaveLength(5)
    expect(era.palettes).toHaveLength(3)
  })
})
