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
    delete old.grainFreq
    const s = migrateSettings(old)
    expect(s.attack).toBe(0.5)
    expect(s.release).toBe(2)
    expect(s.grainFreq).toBe(GRAIN_DEFAULTS.grainFreq)
    expect(s.grainFreqKey).toBe(1)
    expect('fadeIn' in s).toBe(false)
  })

  it('keeps an old cloud\'s grain length and POS; the rest starts from Granulator II\'s defaults', () => {
    const old = (fields: Record<string, unknown>) => {
      const o = { ...defaultSettings('x'), ...fields } as Record<string, unknown>
      for (const k of Object.keys(GRAIN_DEFAULTS)) if (!(k in fields)) delete o[k]
      return o
    }
    // the last version's cloud: 80 ms grains, sprayed and scattered (which made short grains noise)
    const cloud = migrateSettings(old({
      grain: true, grainSize: 80, grainPos: 0.3, grainDensity: 2, grainWidth: 0.1, grainScatter: 0.5, grainKey: true,
      grainScan: 1, grainShape: 1, grainSpread: 0.3, grainStreams: 3,
    }))
    expect(cloud.grain).toBe(true)
    expect(cloud.grainFreq).toBeCloseTo(12.5) // a grain lasts one period: 1000 / 80 ms
    expect(cloud.grainPos).toBe(0.3)
    expect(cloud.grainSpray).toBe(0)
    expect(cloud.grainWindow).toBe(0)
    expect(cloud.grainStereo).toBe(0)
    expect(cloud.grainScanOn).toBe(false)
    for (const k of ['grainSize', 'grainDensity', 'grainWidth', 'grainScatter', 'grainKey', 'grainScan', 'grainShape', 'grainSpread', 'grainStreams'])
      expect(k in cloud).toBe(false)
    // lengths beyond GRAIN's range land on its ends
    expect(migrateSettings(old({ grain: true, grainSize: 1 })).grainFreq).toBe(150)
    expect(migrateSettings(old({ grain: true, grainSize: 9000 })).grainFreq).toBeCloseTo(1 / 9) // a 9 s grain stays 9 s
    // before 0.2: a size > 0 was on
    const v01 = migrateSettings(old({ grainSize: 100, grainDensity: 4 }))
    expect(v01.grain).toBe(true)
    expect(v01.grainFreq).toBeCloseTo(10)
    const unused = migrateSettings(old({ grainSize: 0 }))
    expect(unused.grain).toBe(false)
    expect(unused.grainFreq).toBe(GRAIN_DEFAULTS.grainFreq)
    // presets get the same
    expect(migratePresetSettings({ grain: true, grainSize: 50 } as never).grainFreq).toBeCloseTo(20)
    // today's: untouched
    const now = migrateSettings({ ...defaultSettings('y'), grain: true, grainFreq: 77, grainSpray: 12, grainSymmetry: 'fall' })
    expect(now.grainFreq).toBe(77)
    expect(now.grainSpray).toBe(12)
    expect(now.grainSymmetry).toBe('fall')
  })
})
