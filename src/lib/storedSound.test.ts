import { describe, expect, it } from 'vitest'
import { compactSound, expandSound, isWaveSound } from './storedSound'
import { waveSoundSettings } from './akwf'
import { defaultSettings, type Sound } from '../types'

const wave = (): Sound => ({ id: 'w1', audioId: 'akwf-AKWF_epiano_0012', fileName: 'AKWF_epiano_0012.wav', settings: waveSoundSettings('AKWF_epiano_0012', 'AKWF_epiano') })

describe('stored sounds', () => {
  it('store an untouched wave as its name and tag', () => {
    const c = compactSound(wave())
    expect(c.settings).toEqual({ name: 'EPIANO 0012', tag: 'akwf, akwf_epiano' })
    expect(JSON.stringify(c).length).toBeLessThan(200)
  })

  it('keep what was changed, and expand to the same sound', () => {
    const w = wave()
    w.settings.cutoff = 900
    w.settings.mod.routes.push({ source: 'lfo1', dest: 'cutoff', amount: 0.5 })
    w.fav = true
    const c = compactSound(w)
    expect(Object.keys(c.settings).sort()).toEqual(['cutoff', 'mod', 'name', 'tag'])
    expect(expandSound(JSON.parse(JSON.stringify(c)))).toEqual(w)
  })

  it('read a wave 0.5 stored in full, and leave other sounds as they are', () => {
    const full = wave()
    expect(expandSound(JSON.parse(JSON.stringify(full)))).toEqual(full)
    const sample: Sound = { id: 's', audioId: 'abc', fileName: 'kick.wav', settings: defaultSettings('KICK') }
    expect(isWaveSound(sample)).toBe(false)
    expect(compactSound(sample)).toBe(sample)
    // an SFZ instrument that starts on a wave is not a wave
    expect(isWaveSound({ ...wave(), zones: [{} as never] })).toBe(false)
  })
})
