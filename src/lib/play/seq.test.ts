import { describe, expect, it } from 'vitest'
import { gridLayout, keyToGrid, SCALES, scaleOf, snapToScale, toggleGrid } from './seq'
import { grainFreqNow, seqLevel, seqPick, seqSounding, type SeqNote } from '../../audio/grainMath'
import { impulseDampCoef, roundDamp } from '../../audio/impulse'

describe('the sequencer grid (SpaceCraft notes grid)', () => {
  it('has SpaceCraft\'s 34 scales, each rising from 0 within an octave', () => {
    expect(SCALES).toHaveLength(34)
    expect(new Set(SCALES.map((s) => s.id)).size).toBe(34)
    for (const s of SCALES) {
      expect(s.steps[0]).toBe(0)
      for (let i = 1; i < s.steps.length; i++) expect(s.steps[i]).toBeGreaterThan(s.steps[i - 1])
      expect(s.steps.at(-1)).toBeLessThan(12)
    }
    expect(scaleOf('nonsense').id).toBe('major')
  })

  it('lays a seven-note scale out as SpaceCraft does: four octaves, one above the sample\'s key and two below', () => {
    const g = gridLayout('major')
    expect([g.cols, g.rows, g.top]).toEqual([7, 4, 1])
    expect(g.cells[0]).toEqual([12, 14, 16, 17, 19, 21, 23])
    expect(g.cells[1][0]).toBe(0) // the triangle: the sample's own key
    expect(g.cells[3][0]).toBe(-24)
  })

  it('gives smaller scales more rows (up to eight), the sample\'s key near the middle', () => {
    expect(gridLayout('minorPent')).toMatchObject({ cols: 5, rows: 6, top: 2 })
    expect(gridLayout('octaves')).toMatchObject({ cols: 1, rows: 8, top: 3 })
    expect(gridLayout('chromatic')).toMatchObject({ cols: 12, rows: 4 })
  })

  it('maps keys as the native engine does: chromatic by distance, other scales by white keys from the root', () => {
    expect(keyToGrid('chromatic', 61, 60)).toBe(1)
    expect(keyToGrid('chromatic', 48, 60)).toBe(-12)
    // MINOR from C4: D is the 2nd step (2), E the 3rd (a minor third), C5 the octave, B3 the 7th below
    expect(keyToGrid('minor', 62, 60)).toBe(2)
    expect(keyToGrid('minor', 64, 60)).toBe(3)
    expect(keyToGrid('minor', 72, 60)).toBe(12)
    expect(keyToGrid('minor', 59, 60)).toBe(-2)
    // a black key plays the white key below it
    expect(keyToGrid('minor', 63, 60)).toBe(keyToGrid('minor', 62, 60))
    // a pentatonic scale steps through its five notes over the white keys, then the next octave
    expect([60, 62, 64, 65, 67, 69].map((n) => keyToGrid('minorPent', n, 60))).toEqual([0, 3, 5, 7, 10, 12])
  })

  it('snaps a pitch to the scale\'s nearest note (PITCH · RING\'s SCALE)', () => {
    expect(snapToScale('major', 0.4)).toBe(0)
    expect(snapToScale('major', 3.6)).toBe(4)
    expect(snapToScale('major', -0.6)).toBe(-1)
    expect(snapToScale('minorPent', 11.4)).toBe(12)
    expect(snapToScale('chromatic', 1.4)).toBe(1)
  })

  it('turns a pad on at the end of the order, off where it was; SINGLE NOTE keeps only the new one', () => {
    expect(toggleGrid([0, 7], 12, false)).toEqual([0, 7, 12])
    expect(toggleGrid([0, 7, 12], 7, false)).toEqual([0, 12])
    expect(toggleGrid([0, 7], 12, true)).toEqual([12])
    expect(toggleGrid([12], 12, true)).toEqual([])
  })
})

describe('the sequencer\'s grain stream (grainMath.ts)', () => {
  const note = (semis: number, on = 0, off = Infinity, gain = 1): SeqNote => ({ semis, gain, on, off })

  it('a note\'s level: instant without an envelope; ENVELOPE ON fades it in and, once out, from where it got', () => {
    expect(seqLevel(note(0, 1), 0.5, 0, 0)).toBe(0)
    expect(seqLevel(note(0, 1), 1, 0, 0)).toBe(1)
    expect(seqLevel(note(0, 0, 2), 2, 0, 0)).toBe(0)
    expect(seqLevel(note(0), 0.25, 0.5, 1)).toBeCloseTo(0.5)
    // out at 0.25, half way in: falls from 0.5 over the release
    expect(seqLevel(note(0, 0, 0.25), 0.75, 0.5, 1)).toBeCloseTo(0.25)
    expect(seqLevel(note(0, 0, 0.25), 1.3, 0.5, 1)).toBe(0)
  })

  it('takes turns through the sounding notes in the order they went in, each at its level', () => {
    const notes = [note(0, 0, Infinity, 0.5), note(7), note(12, 5)]
    expect([0, 1, 2, 3].map((k) => seqPick(notes, 1, k, 0, 0)?.semis)).toEqual([0, 7, 0, 7]) // 12 isn't in yet
    expect(seqPick(notes, 1, 0, 0, 0)?.gain).toBe(0.5)
    expect([0, 1, 2].map((k) => seqPick(notes, 6, k, 0, 0)?.semis)).toEqual([0, 7, 12])
    expect(seqPick([note(0, 0, 1)], 2, 0, 0, 0)).toBeNull()
  })

  it('keeps sounding until the last note has faded', () => {
    expect(seqSounding([note(0, 0, 1)], 1.5, 1)).toBe(true)
    expect(seqSounding([note(0, 0, 1)], 2.5, 1)).toBe(false)
    expect(seqSounding([note(0)], 100, 0)).toBe(true)
  })

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
