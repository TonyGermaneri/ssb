import { describe, expect, it } from 'vitest'
import { SCALES, scaleOf, snapToScale } from './scales'
import { grainFreqNow } from '../../audio/grainMath'
import { impulseDampCoef, roundDamp } from '../../audio/impulse'

describe('scales (the pitch pad\'s SCALE)', () => {
  it('has 34 scales, each rising from 0 within an octave', () => {
    expect(SCALES).toHaveLength(34)
    expect(new Set(SCALES.map((s) => s.id)).size).toBe(34)
    for (const s of SCALES) {
      expect(s.steps[0]).toBe(0)
      for (let i = 1; i < s.steps.length; i++) expect(s.steps[i]).toBeGreaterThan(s.steps[i - 1])
      expect(s.steps.at(-1)).toBeLessThan(12)
    }
    expect(scaleOf('nonsense').id).toBe('major')
  })

  it('snaps a pitch to the scale\'s nearest note (PITCH · RING\'s SCALE)', () => {
    expect(snapToScale('major', 0.4)).toBe(0)
    expect(snapToScale('major', 3.6)).toBe(4)
    expect(snapToScale('major', -0.6)).toBe(-1)
    expect(snapToScale('minorPent', 11.4)).toBe(12)
    expect(snapToScale('chromatic', 1.4)).toBe(1)
  })
})

describe('the Play view\'s grain and reverb options', () => {
  it('SYNC: GRAIN is a tempo division at the tempo; its top band (0 beats) stays free', () => {
    expect(grainFreqNow({ grainFreq: 10, grainSync: true, grainBeats: 1 }, 120)).toBe(2)
    expect(grainFreqNow({ grainFreq: 10, grainSync: true, grainBeats: 0.25 }, 90)).toBe(6)
    expect(grainFreqNow({ grainFreq: 10, grainSync: true, grainBeats: 0 }, 120)).toBe(10)
    expect(grainFreqNow({ grainFreq: 10, grainSync: false, grainBeats: 1 }, 120)).toBe(10)
  })

  it('reverb DAMP: no filter at 0; at 1 the tail closes to 3 % of a new sample', () => {
    expect(impulseDampCoef(0, 0.9)).toBe(1)
    expect(impulseDampCoef(1, 0)).toBe(1)
    expect(impulseDampCoef(1, 1)).toBeCloseTo(0.03)
    expect(roundDamp(0.33)).toBeCloseTo(0.35)
  })
})

describe('the removed sequencer\'s saves', () => {
  it('keep their scale as the pitch pad\'s and drop the grid', async () => {
    const { migrateSettings } = await import('../../types')
    const s = migrateSettings({ seq: true, seqScale: 'dorian', seqGrid: [0, 7], seqEnv: true } as never) as unknown as Record<string, unknown>
    expect(s.pitchScaleId).toBe('dorian')
    for (const k of ['seq', 'seqScale', 'seqGrid', 'seqEnv', 'seqAttack', 'seqRelease', 'seqSingle']) expect(k in s).toBe(false)
    expect(migrateSettings({}).pitchScaleId).toBe('major')
  })
})

describe('the Play view\'s pictures and shader feed', () => {
  it('points the pitch pad\'s needles right at ×1, up when stopped, left backwards', async () => {
    const { needleAngle } = await import('./draw')
    expect(needleAngle(1)).toBeCloseTo(0)
    expect(needleAngle(0)).toBeCloseTo(Math.PI / 2)
    expect(needleAngle(-1)).toBeCloseTo(Math.PI)
    expect(needleAngle(2)).toBeCloseTo(-Math.PI / 2)
  })

  it('hears a sine: its level, its wave, and a spectrum peaking at its band', async () => {
    const { AudioFeed, SPEC_N } = await import('./shaders')
    const f = new AudioFeed()
    const buf = new Float32Array(2048)
    // 37 cycles in the last 512 samples: DFT bin 37
    for (let i = 0; i < buf.length; i++) buf[i] = 0.3 * Math.sin((2 * Math.PI * 37 * i) / 512)
    f.update(buf, true)
    expect(f.level).toBeGreaterThan(0.5)
    expect(Math.max(...f.wave) - Math.min(...f.wave)).toBeGreaterThan(150)
    const peak = f.spec.indexOf(Math.max(...f.spec))
    const band = Math.round((Math.log(37) / Math.log(256)) * (SPEC_N - 1))
    expect(Math.abs(peak - band)).toBeLessThanOrEqual(2)
    // silence: it falls away
    for (let k = 0; k < 40; k++) f.update(buf, false)
    expect(f.level).toBeLessThan(0.01)
  })
})
