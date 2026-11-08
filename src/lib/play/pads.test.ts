import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../../types'
import {
  contours,
  fxPoint,
  fxResponse,
  fxWrite,
  grainPoint,
  grainWrite,
  lfoPoint,
  lfoWrite,
  LFO_BANDS,
  pitchMultiplier,
  pitchPoint,
  pitchWrite,
} from './pads'

const s = () => ({ ...defaultSettings('T'), grainLength: 1, grainBackwards: false, ringMix: 0, ringFreq: 440 })

describe('Play pads', () => {
  it('GRAIN: a point and its settings round-trip; top-right is fast and long, bottom-left slow and short', () => {
    const w = grainWrite({ x: 1, y: 1 }, 2)
    expect(w.grainFreq).toBeCloseTo(150, 3)
    expect(w.grainLength).toBe(1)
    const low = grainWrite({ x: 0, y: 0 }, 2)
    expect(low.grainFreq).toBeCloseTo(0.5, 3)
    expect(low.grainLength).toBeCloseTo(0.02, 4)
    const p = grainPoint({ ...s(), ...grainWrite({ x: 0.3, y: 0.7 }, 2) }, 2)
    expect(p.x).toBeCloseTo(0.3, 3)
    expect(p.y).toBeCloseTo(0.7, 3)
  })

  it('LFO: x is the route to POS (none at the far left), y the tempo band', () => {
    const a = lfoWrite(s(), { x: 0.6, y: 0.99 })
    expect(a.routes).toEqual([{ source: 'lfo2', dest: 'grainPos', amount: 0.6 }])
    expect(a.lfo2.division).toBe(LFO_BANDS.at(-1))
    expect(a.lfo2.sync).toBe(true)
    const st = s()
    st.mod.routes = [{ source: 'lfo1', dest: 'cutoff', amount: 0.2 }, ...a.routes]
    Object.assign(st.mod.lfo2, a.lfo2)
    expect(lfoPoint(st).x).toBeCloseTo(0.6, 4)
    // other routes are left alone; the far left removes ours
    expect(lfoWrite(st, { x: 0, y: 0.5 }).routes).toEqual([{ source: 'lfo1', dest: 'cutoff', amount: 0.2 }])
  })

  it('FILTER · REVERB: centre bypasses, left low-passes down to 60 Hz, right high-passes up to 8 kHz; y is the reverb', () => {
    expect(fxWrite({ x: 0.5, y: 0.3 })).toEqual({ filterType: 'lowpass', cutoff: 20000, reverbMix: 0.3 })
    expect(fxWrite({ x: 0, y: 0 }).cutoff).toBe(60)
    expect(fxWrite({ x: 1, y: 0 })).toMatchObject({ filterType: 'highpass', cutoff: 8000 })
    for (const x of [0.1, 0.3, 0.7, 0.9]) expect(fxPoint({ ...s(), ...fxWrite({ x, y: 0.4 }) }).x).toBeCloseTo(x, 2)
    expect(fxResponse({ filterType: 'lowpass', cutoff: 1000, resonance: 0.7 }, 8000)).toBeLessThan(0.05)
    expect(fxResponse({ filterType: 'highpass', cutoff: 1000, resonance: 0.7 }, 8000)).toBeGreaterThan(0.95)
  })

  it('PITCH: ±2 semitones in the middle; at the edges ×2 at the top, stopped half-way, ×2 backwards at the bottom', () => {
    expect(pitchMultiplier({ x: 0.5, y: 1 })).toBeCloseTo(2 ** (2 / 12), 6)
    expect(pitchMultiplier({ x: 0.5, y: 0.5 })).toBeCloseTo(1, 6)
    expect(pitchMultiplier({ x: 0, y: 1 })).toBeCloseTo(2, 6)
    expect(pitchMultiplier({ x: 0, y: 0.5 })).toBeCloseTo(0, 6)
    expect(pitchMultiplier({ x: 0, y: 0 })).toBeCloseTo(-2, 6)
    const back = pitchWrite({ x: 0, y: 0.25 })
    expect(back).toMatchObject({ grainBackwards: true, pitch: 0, fine: 0, ringMix: 0 })
    expect(pitchWrite({ x: 1, y: 0.5 }).ringMix).toBe(1)
  })

  it('PITCH: settings find their way back to a point that plays them (moving out to an edge when the middle can’t)', () => {
    for (const [x, y] of [[0.5, 0.8], [0.15, 0.9], [0.05, 0.2]]) {
      const w = pitchWrite({ x, y })
      const p = pitchPoint({ ...s(), ...w, ringMix: 0 }, x)
      const again = pitchWrite(p)
      expect(again.pitch + again.fine / 100).toBeCloseTo(w.pitch + w.fine / 100, 1)
      expect(again.grainBackwards).toBe(w.grainBackwards)
    }
    // an octave up can't be played in the middle: the crosshair moves out
    expect(pitchPoint({ ...s(), pitch: 12, fine: 0 }, 0.5).x).not.toBeCloseTo(0.5, 2)
  })

  it('draws contours of equal pitch: the nominal one crosses the middle at y 0.5 and rises toward the edges', () => {
    const [nominal] = contours([1], 48)
    const middle = nominal.segments.flat().filter((p) => Math.abs(p.x - 0.5) < 0.03)
    const edge = nominal.segments.flat().filter((p) => p.x < 0.03)
    expect(middle.every((p) => Math.abs(p.y - 0.5) < 0.03)).toBe(true)
    expect(edge.every((p) => Math.abs(p.y - 0.75) < 0.03)).toBe(true)
  })
})
