import { describe, expect, it } from 'vitest'
import { soundsInUse } from './soundsInUse'
import type { Patch } from '../types'

const slot = (soundId: string) => ({ layer: { id: `l-${soundId}`, soundId, settings: {} } })
const patch = (...ids: (string | null)[]) => ({ id: 'p', slots: ids.map((id) => (id ? slot(id) : null)) }) as unknown as Patch
const body = (...ids: (string | null)[]) => JSON.stringify([ids.map((id) => (id ? slot(id) : null)), {}, []])

describe('sounds in use', () => {
  it('counts what patches play now', () => {
    expect([...soundsInUse([patch('a', null, 'b')], [])].sort()).toEqual(['a', 'b'])
  })
  it('keeps what a SAVEd patch plays after its edits moved on (the garden swapped the take)', () => {
    // saved while VCO 1 played take-1; the garden has since moved the live patch to take-9
    const used = soundsInUse([patch('take-9', 'x')], [body('take-1', 'x')])
    expect(used.has('take-1')).toBe(true)
    expect(used.has('take-9')).toBe(true)
  })
  it('keeps what a kept draft plays, and ignores a body that does not read', () => {
    const used = soundsInUse([], ['not json'], [body('d1'), null])
    expect([...used]).toEqual(['d1'])
  })
})
