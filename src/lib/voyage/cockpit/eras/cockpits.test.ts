import { describe, expect, it } from 'vitest'
import { COCKPITS } from './index'
import { PARAMS } from '../params'
import { STAGE } from '../design'

describe.each(COCKPITS.map((c) => [c.era, c] as const))('the %s cockpit', (_, c) => {
  it('has every VCO\'s 17 controls, once each (a stick stands for both of PITCH\'s)', () => {
    for (const vco of [0, 1, 2]) {
      const mine = c.controls.filter((x) => x.vco === vco)
      const params = new Set(mine.map((x) => x.param))
      expect(mine.length, `VCO ${vco + 1}: ${mine.map((x) => x.param).join(',')}`).toBe(params.size)
      const stick = mine.some((x) => x.kind === 'stick' && x.param === 'pitchX')
      for (const p of PARAMS) if (!(stick && p.id === 'pitchY')) expect(params.has(p.id), `VCO ${vco + 1} lacks ${p.id}`).toBe(true)
    }
  })
  it('puts its controls, screens and intakes on the stage, and the vanishing point in the glass', () => {
    for (const x of [...c.controls, ...c.intakes]) {
      expect(x.x >= 0 && x.x <= STAGE.w && x.y >= 0 && x.y <= STAGE.h, `${'param' in x ? x.param : 'intake'} at ${x.x},${x.y}`).toBe(true)
    }
    for (const s of c.screens) expect(s.x >= 0 && s.y >= 0 && s.x + s.w <= STAGE.w && s.y + s.h <= STAGE.h).toBe(true)
    expect(c.intakes.map((i) => i.vco).sort()).toEqual([0, 1, 2])
  })
})
