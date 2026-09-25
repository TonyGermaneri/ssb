import { describe, expect, it } from 'vitest'
import { computePeaks } from './peaks'
import { clipBounds, cycleSeconds, glideSemis, playSeconds, tailSeconds } from './timing'
import { envLevel } from './envelope'
import { keyToMidi } from '../lib/piano'
import { defaultSettings, GRAIN_DEFAULTS, migratePresetSettings, migrateSettings } from '../types'

const S = (o: object = {}) => ({ ...defaultSettings(), ...o })

describe('computePeaks', () => {
  it('finds min/max per bucket across channels', () => {
    const l = new Float32Array([0.1, -0.5, 0.2, 0.9])
    const r = new Float32Array([-0.8, 0, 0.3, 0])
    const p = computePeaks({ numberOfChannels: 2, length: 4, getChannelData: (c) => (c ? r : l) }, 2)
    expect(Array.from(p)).toEqual([-0.8, 0.1, 0, 0.9].map(Math.fround))
  })
})

describe('timing', () => {
  it('bounds the clip and tolerates crossed points', () => {
    expect(clipBounds(S({ clipIn: 0.25, clipOut: 0.75 }), 4)).toEqual({ clipIn: 1, clipOut: 3, clipLen: 2 })
    expect(clipBounds(S({ clipIn: 0.8, clipOut: 0.2 }), 10).clipIn).toBe(2)
  })

  it('plays N repeats; 0 loops forever', () => {
    expect(playSeconds(S({ repeat: 3 }), 2, false)).toBe(6)
    expect(playSeconds(S({ repeat: 0 }), 2, false)).toBe(Infinity)
  })

  it('tape: pitch, played note and speed all shorten', () => {
    expect(cycleSeconds(S({ pitch: 12 }), 2, false)).toBe(1)
    expect(cycleSeconds(S(), 2, false, 12)).toBe(1)
    expect(cycleSeconds(S({ speed: 2 }), 2, false)).toBe(1)
  })

  it('stretch and grain cloud: only speed changes length', () => {
    expect(cycleSeconds(S({ pitch: 12, timeMode: 'stretch' }), 2, false)).toBe(2)
    expect(cycleSeconds(S({ pitch: 12, speed: 0.5 }), 2, true)).toBe(4)
  })

  it('glides linearly in semitones', () => {
    const g = { from: 0, to: 12, start: 1, dur: 2 }
    expect(glideSemis(g, 0)).toBe(0)
    expect(glideSemis(g, 2)).toBe(6)
    expect(glideSemis(g, 5)).toBe(12)
    expect(glideSemis({ ...g, dur: 0 }, 0)).toBe(12)
  })

  it('computes FX tails', () => {
    expect(tailSeconds(S())).toBe(0)
    expect(tailSeconds(S({ reverbMix: 0.5, reverbSize: 3 }))).toBe(3)
  })
})

describe('envLevel', () => {
  const e = { a: 1, d: 1, s: 0.5, r: 1 }
  it('ramps up, decays, sustains', () => {
    expect(envLevel(0, e)).toBe(0)
    expect(envLevel(0.5, e)).toBe(0.5)
    expect(envLevel(1.5, e)).toBe(0.75)
    expect(envLevel(9, e)).toBe(0.5)
  })
  it('handles zero attack', () => {
    expect(envLevel(0, { ...e, a: 0 })).toBe(1)
  })
})

describe('keyToMidi', () => {
  it('maps tracker rows around the root', () => {
    expect(keyToMidi('q', 0)).toBe(60)
    expect(keyToMidi('z', 0)).toBe(48)
    expect(keyToMidi('S', 0)).toBe(49)
    expect(keyToMidi('q', 1)).toBe(72)
    expect(keyToMidi('a', 0)).toBeNull()
  })
})

describe('migrateSettings', () => {
  it('maps old fades onto the ADSR and fills new fields', () => {
    const old = { ...defaultSettings('x'), fadeIn: 0.5, fadeOut: 2 } as Record<string, unknown>
    delete old.attack
    delete old.release
    delete old.grainRate
    const s = migrateSettings(old)
    expect(s.attack).toBe(0.5)
    expect(s.release).toBe(2)
    expect(s.grainRate).toBe(GRAIN_DEFAULTS.grainRate)
    expect('fadeIn' in s).toBe(false)
  })

  it('keeps an old grain cloud (size > 0 was on; density was an overlap) and gives unused ones the new defaults', () => {
    const legacy = (extra: Record<string, unknown>) => {
      const o = { ...defaultSettings('x'), ...extra } as Record<string, unknown>
      for (const k of ['grain', 'grainRate', 'grainShape']) delete o[k]
      return o
    }
    const cloud = migrateSettings(legacy({ grainSize: 100, grainDensity: 4, grainWidth: 0, grainScatter: 0 }))
    expect(cloud.grain).toBe(true)
    expect(cloud.grainRate).toBeCloseTo(40) // 4 overlapping 100 ms grains = 40 a second
    expect(cloud.grainWidth).toBe(0) // the user's own settings stay
    expect('grainDensity' in cloud).toBe(false)
    const unused = migrateSettings(legacy({ grainSize: 0, grainDensity: 2, grainWidth: 0 }))
    expect(unused.grain).toBe(false)
    expect(unused.grainSize).toBe(GRAIN_DEFAULTS.grainSize)
    expect(unused.grainWidth).toBe(GRAIN_DEFAULTS.grainWidth)
    // presets from before get the same treatment
    expect(migratePresetSettings({ grainSize: 50, grainDensity: 1 } as never).grainRate).toBeCloseTo(20)
    // already migrated: untouched
    expect(migrateSettings({ ...defaultSettings('y'), grain: true, grainSize: 0.5 }).grainSize).toBe(0.5)
  })
})
