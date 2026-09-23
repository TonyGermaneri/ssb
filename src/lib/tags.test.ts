import { describe, expect, it } from 'vitest'
import { addTags, hasAllTags, joinTags, splitTags, tagFacets } from './tags'

describe('tags', () => {
  it('splits, trims and de-duplicates comma lists', () => {
    expect(splitTags(' drums, 808 ,,Drums, fx ')).toEqual(['drums', '808', 'fx'])
    expect(splitTags('')).toEqual([])
    expect(joinTags(['a', 'b', 'A'])).toBe('a, b')
    expect(addTags('a, b', ['c', 'B'])).toBe('a, b, c')
  })

  it('filters with AND, case-insensitively', () => {
    expect(hasAllTags('Drums, 808', ['drums'])).toBe(true)
    expect(hasAllTags('Drums, 808', ['drums', 'fx'])).toBe(false)
    expect(hasAllTags('x', [])).toBe(true)
  })

  it('counts facets within the filtered set', () => {
    const pads = ['drums, 808', 'drums, 909', 'drums, 808, loud', 'piano']
    expect(tagFacets(pads, [])).toEqual([
      { name: 'drums', count: 3, selected: false },
      { name: '808', count: 2, selected: false },
      { name: '909', count: 1, selected: false },
      { name: 'loud', count: 1, selected: false },
      { name: 'piano', count: 1, selected: false },
    ])
    // selecting 808 narrows the list and the counts; piano and 909 disappear
    expect(tagFacets(pads, ['808'])).toEqual([
      { name: '808', count: 2, selected: true },
      { name: 'drums', count: 2, selected: false },
      { name: 'loud', count: 1, selected: false },
    ])
  })
})

import { defaultMaster, defaultSettings, headerOf, migratePatch, type Patch } from '../types'
describe('patches', () => {
  it('snapshots the header knobs', () => {
    const m = { ...defaultMaster(), glide: 0.3, mono: true, bpm: 97 }
    const h = headerOf(m)
    expect(h).toMatchObject({ glide: 0.3, mono: true, bpm: 97, volume: 0.8 })
    expect('theme' in h || 'scale' in h || 'selectedId' in h).toBe(false)
    m.fx.reverbMix = 0.5
    expect(h.fx.reverbMix).toBe(0) // a copy, not a reference
  })
  it('migrates old / partial patches', () => {
    const raw = { id: 'p', name: 'x', layers: [{ id: 'l', soundId: 's', settings: { ...defaultSettings(), vcos: undefined } }], header: { glide: 1 } } as unknown as Patch
    const p = migratePatch(raw)
    expect(p.tag).toBe('')
    expect(p.header.glide).toBe(1)
    expect(p.header.fx.chorusRate).toBeGreaterThan(0)
    // old layers-based patches become slots
    expect(p.slots).toHaveLength(3)
    expect(p.slots[0]?.layer.settings.vcos).toEqual([])
    expect(p.slots[1]).toBeNull()
  })
})
