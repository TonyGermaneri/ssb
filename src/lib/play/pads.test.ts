import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../../types'
import {
  contours,
  echoDivisions,
  echoPoint,
  echoWrite,
  ECHO_HI,
  ECHO_LO,
  ECHO_MIX,
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
  texturePoint,
  textureWrite,
  tonePoint,
  toneResponse,
  toneWrite,
} from './pads'

const s = () => ({ ...defaultSettings('T'), grainLength: 1, grainBackwards: false, ringMix: 0, ringFreq: 440 })

describe('Play pads', () => {
  it('GRAIN: y the grain size (fast at the top), x the share of its turn a grain sounds (1 % … all of it)', () => {
    const w = grainWrite({ x: 1, y: 1 }, 2)
    expect(w.grainFreq).toBeCloseTo(150, 3)
    expect(w.grainLength).toBe(1)
    const low = grainWrite({ x: 0, y: 0 }, 2)
    expect(low.grainFreq).toBeCloseTo(0.5, 3)
    // the bottom is one grain as long as the whole sample, however long
    expect(grainWrite({ x: 0, y: 0 }, 12).grainFreq).toBeCloseTo(1 / 12, 3)
    // a single cycle still spans four octaves
    expect(grainWrite({ x: 0, y: 0 }, 0.005).grainFreq).toBeCloseTo(150 / 16, 3)
    expect(low.grainLength).toBeCloseTo(0.01, 4)
    // linear across: the middle sounds about half the time
    expect(grainWrite({ x: 0.5, y: 0.5 }, 2).grainLength).toBeCloseTo(0.505, 3)
    const p = grainPoint({ ...s(), ...grainWrite({ x: 0.3, y: 0.7 }, 2) }, 2)
    expect(p.x).toBeCloseTo(0.3, 3)
    expect(p.y).toBeCloseTo(0.7, 3)
  })

  it('LFO: x is the route to POS, one-sided (none at the far left), y the tempo band', () => {
    const a = lfoWrite(s(), { x: 0.6, y: 0.99 })
    expect(a.routes).toEqual([{ source: 'lfo2', dest: 'grainPos', amount: 0.6, unipolar: true }])
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
    // a smooth valley, as SpaceCraft's: about 0.61 a quarter of the way in
    expect(Math.abs(pitchPoint({ ...s(), pitch: 0, fine: 0 }, 0.27).y - 0.61)).toBeLessThan(0.03)
    // a line just above nominal rises over the middle (where its pitch is near the top of the fine range)
    const [above] = contours([1.1], 200)
    const at = (x: number) => above.segments.flat().reduce((b, p) => (Math.abs(p.x - x) < Math.abs(b.x - x) ? p : b)).y
    expect(at(0.5)).toBeGreaterThan(at(0.02) + 0.1)
  })

  it('the stopped line leaves the pad at the bottom about a fifth of the way in, ×-1 nearer the edges', () => {
    const [stopped, back] = contours([0, -1], 200)
    const bottomX = (c: { segments: [{ x: number; y: number }, { x: number; y: number }][] }) =>
      Math.min(...c.segments.flat().filter((p) => p.x < 0.5 && p.y < 0.01).map((p) => p.x))
    expect(bottomX(stopped)).toBeGreaterThan(0.12)
    expect(bottomX(stopped)).toBeLessThan(0.24)
    expect(bottomX(back)).toBeGreaterThan(0.05)
    expect(bottomX(back)).toBeLessThan(bottomX(stopped))
    // each starts at its edge height: stopped half-way, ×-1 a quarter up
    expect(stopped.segments[0][0].y).toBeCloseTo(0.5, 2)
    expect(back.segments[0][0].y).toBeCloseTo(0.25, 2)
  })
})

describe('SpaceCraft options on the pads', () => {
  it('GRAIN under SYNC: the rows below the top are tempo divisions, the top band free', async () => {
    const { grainSyncWrite, grainSyncPoint, GRAIN_SYNC_BANDS, SYNC_TOP } = await import('./pads')
    const slow = grainSyncWrite({ x: 1, y: 0.01 }, 120)
    expect(slow.grainBeats).toBe(GRAIN_SYNC_BANDS[0])
    expect(slow.grainFreq).toBeCloseTo(120 / 60 / 8)
    const beat = grainSyncWrite({ x: 1, y: ((3 + 0.5) / GRAIN_SYNC_BANDS.length) * SYNC_TOP }, 120)
    expect(beat.grainBeats).toBe(1)
    expect(beat.grainFreq).toBe(2)
    const free = grainSyncWrite({ x: 1, y: 0.99 }, 120)
    expect(free.grainBeats).toBe(0)
    expect(free.grainFreq).toBeGreaterThan(120 / 60 * 32)
    const s = { ...defaultSettings(), grainSync: true, ...beat }
    expect(grainSyncWrite(grainSyncPoint(s, 120), 120).grainBeats).toBe(1)
    const f = { ...defaultSettings(), grainSync: true, ...free }
    expect(grainSyncWrite(grainSyncPoint(f, 120), 120).grainFreq).toBeCloseTo(free.grainFreq, 0)
  })

  it('PITCH · RING\'s SCALE snaps the pitch to the scale', async () => {
    const { pitchWrite } = await import('./pads')
    const p = { x: 0.5, y: 0.5 + 3 * Math.log2(Math.pow(2, 1.4 / 12)) } // 1.4 semitones up, in the middle
    expect(pitchWrite(p).pitch + pitchWrite(p).fine / 100).toBeCloseTo(1.4, 1)
    expect(pitchWrite(p, 'major')).toMatchObject({ pitch: 2, fine: 0 })
    expect(pitchWrite(p, 'minor')).toMatchObject({ pitch: 2, fine: 0 })
    expect(pitchWrite(p, 'chromatic')).toMatchObject({ pitch: 1, fine: 0 })
  })

})


describe('the added Play pads', () => {
  it('TEXTURE: x SPRAY (to 2 s), y DETUNE (to 12 st), both cubed so the small amounts get the room; and back', () => {
    expect(textureWrite({ x: 0, y: 0 })).toEqual({ grainSpray: 0, grainDetune: 0 })
    expect(textureWrite({ x: 1, y: 1 })).toEqual({ grainSpray: 2000, grainDetune: 12 })
    expect(textureWrite({ x: 0.5, y: 0.5 })).toEqual({ grainSpray: 250, grainDetune: 1.5 })
    const p = texturePoint({ grainSpray: 250, grainDetune: 1.5 })
    expect(p.x).toBeCloseTo(0.5, 3)
    expect(p.y).toBeCloseTo(0.5, 3)
    // more than the pad reaches (the knob's further): pinned to the edge
    expect(texturePoint({ grainSpray: 9000, grainDetune: 0 }).x).toBe(1)
  })

  it('ECHO: x the time (log 20 ms .. 1.5 s), drawn to a tempo division near it; y the feedback; MIX given if none', () => {
    const lo = echoWrite({ x: 0, y: 0 }, 120, 0.5)
    expect(lo.delayTime).toBeCloseTo(ECHO_LO, 4)
    expect(lo).not.toHaveProperty('delayMix')
    expect(echoWrite({ x: 1, y: 1 }, 120, 0.5)).toMatchObject({ delayTime: ECHO_HI, delayFeedback: 0.9 })
    // an eighth at 120 BPM is 0.25 s: a hair off its x lands on it exactly
    const eighth = echoDivisions(120).find((d) => d.id === '1/8')!
    expect(echoWrite({ x: eighth.x + 0.01, y: 0.5 }, 120, 0.4).delayTime).toBe(0.25)
    expect(echoWrite({ x: 0.5, y: 0.5 }, 120, 0).delayMix).toBe(ECHO_MIX)
    const p = echoPoint({ delayTime: 0.25, delayFeedback: 0.45 })
    expect(p.x).toBeCloseTo(eighth.x, 6)
    expect(p.y).toBeCloseTo(0.5, 6)
  })

  it('TONE: flat in the middle; x tilts bass against treble, y scoops or pushes the mids, in half dB', () => {
    expect(toneWrite({ x: 0.5, y: 0.5 })).toEqual({ eqLow: 0, eqMid: 0, eqHigh: 0 })
    expect(toneWrite({ x: 0.51, y: 0.49 })).toEqual({ eqLow: 0, eqMid: 0, eqHigh: 0 })
    expect(toneWrite({ x: 1, y: 0 })).toEqual({ eqLow: -9, eqMid: -12, eqHigh: 9 })
    expect(toneWrite({ x: 0, y: 1 })).toEqual({ eqLow: 9, eqMid: 12, eqHigh: -9 })
    const p = tonePoint({ eqLow: -4.5, eqMid: 6, eqHigh: 4.5 })
    expect(p.x).toBeCloseTo(0.75, 6)
    expect(p.y).toBeCloseTo(0.75, 6)
    // the curve: bright tilt is up at the top, down at the bottom
    const bright = { eqLow: -9, eqMid: 0, eqHigh: 9 }
    expect(toneResponse(bright, 16000)).toBeGreaterThan(6)
    expect(toneResponse(bright, 40)).toBeLessThan(-6)
  })
})
