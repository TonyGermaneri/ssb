import { describe, expect, it } from 'vitest'
import { fmtRouteAmount, lfoValue, modSum } from './modulation'
import { History } from './history'
import { parseMidi } from '../audio/midi'
import { defaultSettings, migrateSettings, presetSettings } from '../types'

describe('lfoValue', () => {
  it('matches oscillator shapes', () => {
    expect(lfoValue('sine', 0.25)).toBeCloseTo(1)
    expect(lfoValue('triangle', 0.25)).toBe(1)
    expect(lfoValue('triangle', 0.75)).toBe(-1)
    expect(lfoValue('square', 0.1)).toBe(1)
    expect(lfoValue('square', 0.6)).toBe(-1)
    expect(lfoValue('sawtooth', 0.25)).toBe(0.5)
    expect(lfoValue('sawtooth', 0.75)).toBe(-0.5)
    expect(lfoValue('sine', 3.25)).toBeCloseTo(1)
  })
})

describe('modSum', () => {
  it('sums scaled routes for one destination', () => {
    const routes = [
      { source: 'lfo1' as const, dest: 'grainPos' as const, amount: 0.5 },
      { source: 'mod' as const, dest: 'grainPos' as const, amount: -1 },
      { source: 'mod' as const, dest: 'pitch' as const, amount: 1 },
    ]
    const v = modSum(routes, 'grainPos', (s) => (s === 'lfo1' ? 1 : 0.5))
    expect(v).toBeCloseTo(0.5 * 0.5 * 1 - 1 * 0.5 * 0.5)
  })
  it('formats amounts in destination units', () => {
    expect(fmtRouteAmount('pitch', 0.5)).toBe('+6.0st')
    expect(fmtRouteAmount('cutoff', -1)).toBe('-5.0oct')
    expect(fmtRouteAmount('volume', 0.25)).toBe('+25%')
  })
})

describe('History', () => {
  it('undoes and redoes, and a new commit clears redo', () => {
    const h = new History('a')
    h.commit('b')
    h.commit('c')
    expect(h.undo()).toBe('b')
    expect(h.undo()).toBe('a')
    expect(h.undo()).toBeNull()
    expect(h.redo()).toBe('b')
    h.commit('d')
    expect(h.canRedo).toBe(false)
    expect(h.undo()).toBe('b')
  })
  it('ignores no-op commits and respects the limit', () => {
    const h = new History('0', 2)
    h.commit('0')
    expect(h.canUndo).toBe(false)
    h.commit('1')
    h.commit('2')
    h.commit('3')
    expect(h.undo()).toBe('2')
    expect(h.undo()).toBe('1')
    expect(h.undo()).toBeNull()
  })
})

describe('parseMidi', () => {
  it('decodes note, pressure, bend, cc', () => {
    expect(parseMidi([0x91, 60, 127])).toEqual({ type: 'noteOn', channel: 1, note: 60, velocity: 1 })
    expect(parseMidi([0x90, 60, 0])).toEqual({ type: 'noteOff', channel: 0, note: 60 })
    expect(parseMidi([0xa0, 60, 127])).toEqual({ type: 'polyPressure', channel: 0, note: 60, value: 1 })
    expect(parseMidi([0xd2, 64])).toEqual({ type: 'channelPressure', channel: 2, value: 64 / 127 })
    expect(parseMidi([0xe0, 0, 64])).toEqual({ type: 'pitchBend', channel: 0, value: 0 })
    expect(parseMidi([0xe0, 127, 127])?.type === 'pitchBend' && parseMidi([0xe0, 127, 127])).toMatchObject({ value: 1 })
    expect(parseMidi([0xe0, 0, 0])).toMatchObject({ value: -1 })
    expect(parseMidi([0xb0, 1, 127])).toEqual({ type: 'cc', channel: 0, cc: 1, value: 1 })
    expect(parseMidi([0xf8])).toBeNull()
  })
})

describe('presets & migration', () => {
  it('presets leave sample-specific settings out', () => {
    const p = presetSettings({ ...defaultSettings('kick'), clipIn: 0.2, cutoff: 900 })
    expect(p.cutoff).toBe(900)
    expect('name' in p || 'clipIn' in p || 'rootNote' in p).toBe(false)
  })
  it('fills in a missing mod matrix', () => {
    const raw = { ...defaultSettings() } as Record<string, unknown>
    delete raw.mod
    expect(migrateSettings(raw).mod.lfo1.rate).toBe(5)
  })
})
