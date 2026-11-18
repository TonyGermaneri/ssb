import { describe, expect, it } from 'vitest'
import { migratePatch } from '../../types'
import { defaultPadGrowth } from './garden'

describe('a patch saved by an older SSB', () => {
  it('gets its gardens filled in (the GROWTH tab reads every field)', () => {
    const old = { id: 'p', name: 'OLD', slots: [{ layer: { id: 'l', soundId: 's', settings: {} }, garden: { on: true, seed: 3, loops: 2, history: [] } }, null, null] }
    const p = migratePatch(old as never)
    expect(p.slots[0]!.garden!.pads).toEqual(defaultPadGrowth())
    expect(p.slots[0]!.garden!.loops).toBe(2)
    expect(p.slots[0]!.garden!.saved).toEqual([])
  })
})
