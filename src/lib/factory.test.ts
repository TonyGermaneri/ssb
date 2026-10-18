import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FACTORY_PATCHES, LEGACY_FACTORY_NAMES } from './factory'
import { FACTORY_LEVELS } from './factoryLevels'
import { splitTags } from './tags'
import type { AkwfIndex } from './akwf'
import { defaultGlobalFx, defaultSettings, DIVISIONS, FILTER_TYPES, LFO_SHAPES, MOD_DESTS, MOD_SOURCES, PATCH_SLOTS } from '../types'

const index = JSON.parse(readFileSync(new URL('../../public/akwf/index.json', import.meta.url), 'utf8')) as AkwfIndex
const waves = new Set(index.categories.flatMap((c) => c.waves))

describe('built-in patches', () => {
  it('127 of them, each with its own id and name, tagged factory', () => {
    expect(FACTORY_PATCHES).toHaveLength(127)
    expect(new Set(FACTORY_PATCHES.map((p) => p.id)).size).toBe(127)
    expect(new Set(FACTORY_PATCHES.map((p) => p.name)).size).toBe(127)
    for (const p of FACTORY_PATCHES) {
      expect(p.name).toBe(p.name.toUpperCase())
      const tags = splitTags(p.tag)
      expect(tags[0]).toBe('factory')
      expect(tags.length, p.id).toBeGreaterThan(2)
    }
  })

  it('are made of waves AKWF has, with settings, LFOs and routes the board knows', () => {
    const keys = new Set(Object.keys(defaultSettings()))
    const fxKeys = new Set(Object.keys(defaultGlobalFx()))
    const divisions = new Set(DIVISIONS.map((d) => d.id))
    for (const p of FACTORY_PATCHES) {
      expect(p.slots.length, p.id).toBeLessThanOrEqual(PATCH_SLOTS)
      expect(p.slots[0], `${p.id}: slot 1 is the main voice`).toBeTruthy()
      for (const s of p.slots) {
        if (!s) continue
        expect(waves.has(s.wave), `${p.id}: ${s.wave}`).toBe(true)
        for (const k of Object.keys(s.settings ?? {})) expect(keys.has(k), `${p.id}: ${k}`).toBe(true)
        if (s.settings?.filterType) expect(FILTER_TYPES).toContain(s.settings.filterType)
        for (const l of [s.lfo1, s.lfo2]) {
          if (l?.shape) expect(LFO_SHAPES).toContain(l.shape)
          if (l?.division) expect(divisions.has(l.division), `${p.id}: ${l.division}`).toBe(true)
        }
        for (const r of s.routes ?? []) {
          expect(MOD_DESTS[r.dest], `${p.id}: ${r.dest}`).toBeTruthy()
          expect(MOD_SOURCES.some((m) => m.id === r.source), `${p.id}: ${r.source}`).toBe(true)
          expect(Math.abs(r.amount)).toBeLessThanOrEqual(2)
          // VCO n is slot n
          const vco = /^vco(\d)$/.exec(r.source)
          if (vco) expect(p.slots[+vco[1] - 1], `${p.id}: ${r.source}`).toBeTruthy()
        }
      }
      for (const k of Object.keys(p.header?.fx ?? {})) expect(fxKeys.has(k), `${p.id}: fx ${k}`).toBe(true)
      if (p.header?.fx?.delayDivision) expect(divisions.has(p.header.fx.delayDivision)).toBe(true)
    }
  })

  it("include 0.5's nine, known by the names they had", () => {
    const ids = new Set(FACTORY_PATCHES.map((p) => p.id))
    expect(Object.keys(LEGACY_FACTORY_NAMES)).toHaveLength(9)
    for (const id of Object.values(LEGACY_FACTORY_NAMES)) expect(ids.has(id)).toBe(true)
  })

  it('are level-matched: every one has a trim, and only built-ins do', () => {
    const ids = new Set(FACTORY_PATCHES.map((p) => p.id))
    for (const p of FACTORY_PATCHES) expect(FACTORY_LEVELS[p.id], p.id).toBeTypeOf('number')
    for (const id of Object.keys(FACTORY_LEVELS)) expect(ids.has(id), id).toBe(true)
  })
})
