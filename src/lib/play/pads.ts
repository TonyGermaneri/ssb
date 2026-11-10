/**
 * The VCO Play view's pads (SpaceCraft's), as numbers: where each crosshair sits for a layer's settings, and what a
 * crosshair position writes back. Positions are 0..1 with y = 1 at the top. Pure, so the mappings are tested.
 *
 * - PERFORM (the big waveform): x = where grains fire (POS, in the clip), y = the layer's volume.
 * - GRAIN: y = the grains' size (GRAIN, log: small and fast at the top, as long as the whole sample at the bottom), x = how much of
 *   each grain's turn it sounds (LENGTH, 1 % at the far left -- mostly silence -- to all of it at the right).
 * - LFO: the layer's LFO 2 sweeping POS forward of where it's set (a unipolar route): x = how far, y = how fast.
 * - FILTER · REVERB: y = reverb; x = the filter: centre bypassed, left a low-pass closing, right a high-pass opening.
 * - PITCH · RING: a pitch multiplier that is fine (±2 semitones) in the middle and coarse (×2 up, through stopped, to
 *   ×2 backwards) at the edges; the right edge brings in the ring modulator, its carrier rising with y.
 */
import { DIVISIONS, type ModRoute, type SoundSettings } from '../../types'
import { GRAIN_FREQ_MAX, grainFreqMin } from '../../audio/grainMath'

export interface Point {
  x: number
  y: number
}
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const logTo = (v: number, lo: number, hi: number) => clamp01(Math.log(v / lo) / Math.log(hi / lo))
const logFrom = (t: number, lo: number, hi: number) => lo * Math.pow(hi / lo, clamp01(t))

// ── PERFORM ──
export const VOLUME_TOP = 1.2
export const performPoint = (s: SoundSettings): Point => ({ x: clamp01(s.grainPos), y: clamp01(s.volume / VOLUME_TOP) })
export const performWrite = (p: Point) => ({ grainPos: clamp01(p.x), volume: Math.round(clamp01(p.y) * VOLUME_TOP * 1000) / 1000 })

// ── GRAIN ──
export const LENGTH_MIN = 0.01
/**
 * The grain rates the pad spans: from one grain as long as the whole sample (the bottom, as the GRAIN knob's own
 * floor) to GRAIN's top, and always four octaves at least (a single-cycle wave is a few ms long: one grain per
 * sample would be faster than the top).
 */
export const grainRange = (sampleSeconds: number) => ({
  lo: Math.min(GRAIN_FREQ_MAX / 16, grainFreqMin(sampleSeconds)),
  hi: GRAIN_FREQ_MAX,
})
export function grainPoint(s: SoundSettings & { grainLength?: number }, sampleSeconds: number): Point {
  const { lo, hi } = grainRange(sampleSeconds)
  return { x: clamp01(((s.grainLength ?? 1) - LENGTH_MIN) / (1 - LENGTH_MIN)), y: logTo(s.grainFreq, lo, hi) }
}
export function grainWrite(p: Point, sampleSeconds: number) {
  const { lo, hi } = grainRange(sampleSeconds)
  return { grainFreq: round4(logFrom(p.y, lo, hi)), grainLength: round4(LENGTH_MIN + clamp01(p.x) * (1 - LENGTH_MIN)) }
}

// ── LFO (the layer's LFO 2 → POS) ──
/** slow (bottom) to fast (top): the tempo divisions, longest first */
export const LFO_BANDS = DIVISIONS.map((d) => d.id)
const isPosRoute = (r: ModRoute) => r.source === 'lfo2' && r.dest === 'grainPos'
export function lfoPoint(s: SoundSettings): Point {
  const route = s.mod.routes.find(isPosRoute)
  const band = s.mod.lfo2.sync ? LFO_BANDS.indexOf(s.mod.lfo2.division) : -1
  // a free-running LFO 2: its rate placed among the bands' (at 120 BPM)
  const y = band >= 0 ? (band + 0.5) / LFO_BANDS.length : logTo(s.mod.lfo2.rate, 0.02, 20)
  return { x: clamp01(Math.abs(route?.amount ?? 0)), y }
}
export function lfoBand(y: number) {
  return Math.min(LFO_BANDS.length - 1, Math.floor(clamp01(y) * LFO_BANDS.length))
}
/**
 * LFO 2 synced to the band under y, and its route to POS at x's amount (none at the far left), one-sided: the grains
 * fire at the position or ahead of it, never behind.
 */
export function lfoWrite(s: SoundSettings, p: Point) {
  const amount = round4(clamp01(p.x) < 0.02 ? 0 : clamp01(p.x))
  const routes = s.mod.routes.filter((r) => !isPosRoute(r))
  if (amount > 0) routes.push({ source: 'lfo2', dest: 'grainPos', amount, unipolar: true })
  return { lfo2: { ...s.mod.lfo2, sync: true, ratioMode: false, division: LFO_BANDS[lfoBand(p.y)], amount: 1 }, routes }
}

// ── FILTER · REVERB ──
export const LP_LOW = 60
export const HP_HIGH = 8000
const DEAD = 0.02
const isHigh = (t: string) => t === 'highpass' || t.startsWith('hp')
const isLow = (t: string) => t === 'lowpass' || t.startsWith('lp')
export function fxPoint(s: SoundSettings): Point {
  let x = 0.5
  if (isHigh(s.filterType) && s.cutoff > 20) x = 0.5 + DEAD + (0.5 - DEAD) * logTo(s.cutoff, 20, HP_HIGH)
  else if (isLow(s.filterType) && s.cutoff < 20000) x = 0.5 - DEAD - (0.5 - DEAD) * logTo(20000 / s.cutoff, 1, 20000 / LP_LOW)
  return { x: clamp01(x), y: clamp01(s.reverbMix) }
}
export function fxWrite(p: Point) {
  const x = clamp01(p.x)
  const reverbMix = round4(clamp01(p.y))
  if (Math.abs(x - 0.5) <= DEAD) return { filterType: 'lowpass' as const, cutoff: 20000, reverbMix }
  if (x < 0.5) return { filterType: 'lowpass' as const, cutoff: Math.round(20000 / logFrom((0.5 - DEAD - x) / (0.5 - DEAD), 1, 20000 / LP_LOW)), reverbMix }
  return { filterType: 'highpass' as const, cutoff: Math.round(logFrom((x - 0.5 - DEAD) / (0.5 - DEAD), 20, HP_HIGH)), reverbMix }
}
/** the filter's response, 0..1 (1 = passes), at a frequency (Hz): 12 dB an octave past the cutoff */
export function fxResponse(s: Pick<SoundSettings, 'filterType' | 'cutoff' | 'resonance'>, hz: number): number {
  const r = hz / Math.max(1, s.cutoff)
  const q = Math.max(0.1, s.resonance)
  const shape = (w: number) => 1 / Math.sqrt((1 - w * w) ** 2 + (w / q) ** 2)
  if (isLow(s.filterType)) return s.cutoff >= 20000 ? 1 : Math.min(1.6, shape(r))
  if (isHigh(s.filterType)) return s.cutoff <= 20 ? 1 : Math.min(1.6, shape(1 / r))
  return 1
}

// ── PITCH · RING ──
/*
 * SpaceCraft's pitch field, drawn as lines of equal pitch multiplier m. Each runs from (m + 2) / 4 up the edges (coarse:
 * ×2 at the top corners, stopped half-way, ×2 backwards at the bottom ones) to where m sits in the middle's ±2
 * semitones, along a cosine: the nominal line a smooth valley, as SpaceCraft draws it. Multipliers the middle can't
 * play (the stopped and backwards ones) carry on below the pad there, so their lines leave it at the bottom part-way
 * in: stopped (red) about a fifth of the way from each edge, ×-1 nearer the edge.
 */
const FINE_LOW = 2 ** (-2 / 12)
/** below the middle's range, how fast a line's middle height falls with m (where stopped and ×-1 leave the pad) */
const BELOW = 1.24 / FINE_LOW
const edgeY = (m: number) => (m + 2) / 4
const middleY = (m: number) => (m >= FINE_LOW ? 0.5 + 3 * Math.log2(m) : (m - FINE_LOW) * BELOW)
/** how much a column belongs to the middle: 1 there, 0 at the edges, a cosine between */
export const middleWeight = (x: number) => (1 + Math.cos(Math.PI * Math.abs(clamp01(x) - 0.5) * 2)) / 2
/** the height of the line of multiplier m in a column (it rises with m in every column) */
export const contourY = (m: number, x: number) => edgeY(m) + (middleY(m) - edgeY(m)) * middleWeight(x)
/** The pitch multiplier at a point: the line through it (bisected). */
export function pitchMultiplier(p: Point) {
  const y = clamp01(p.y)
  let lo = -2.5
  let hi = 2.5
  for (let k = 0; k < 48; k++) {
    const mid = (lo + hi) / 2
    if (contourY(mid, p.x) < y) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}
export const RING_LO = 30
export const RING_HI = 3840
export function pitchWrite(p: Point) {
  const m = pitchMultiplier(p)
  const semis = Math.max(-24, Math.min(24, 12 * Math.log2(Math.max(1e-4, Math.abs(m)))))
  const pitch = Math.round(semis)
  return {
    pitch,
    fine: Math.round((semis - pitch) * 100),
    grainBackwards: m < 0,
    ringMix: round4(clamp01((p.x - 0.6) / 0.4)),
    ringFreq: Math.round(logFrom(p.y, RING_LO, RING_HI)),
  }
}
/**
 * Where the crosshair goes for settings the pad wrote (or the knobs did): the ring modulator puts it on the right;
 * otherwise in `column` (where it was) if that column can reach the pitch, else the nearest column out that can.
 */
export function pitchPoint(s: SoundSettings & { grainBackwards?: boolean; ringMix?: number; ringFreq?: number }, column = 0.5): Point {
  const semis = s.pitch + s.fine / 100
  const target = (s.grainBackwards ? -1 : 1) * Math.pow(2, semis / 12)
  const ring = s.ringMix ?? 0
  const x0 = ring > 0 ? 0.6 + 0.4 * ring : column
  const solve = (x: number) => {
    const y = contourY(target, x)
    return y >= -1e-9 && y <= 1 + 1e-9 ? clamp01(y) : null
  }
  const y = solve(x0)
  if (y !== null) return { x: x0, y }
  // out to whichever edge is nearer, step by step, until it can
  const dir = x0 < 0.5 ? -1 : 1
  for (let k = 1; k <= 100; k++) {
    const x = clamp01(x0 + dir * k * 0.01)
    const yy = solve(x)
    if (yy !== null) return { x, y: yy }
    if (x === 0 || x === 1) break
  }
  return { x: dir < 0 ? 0 : 1, y: target > 0 ? 1 : 0 }
}

/** Lines of equal pitch over the pad, one polyline set per multiplier, in pad coordinates (y = 1 at the top). */
export function contours(levels: number[], n = 96): { level: number; segments: [Point, Point][] }[] {
  return levels.map((level) => {
    const segments: [Point, Point][] = []
    let prev: Point | null = null
    for (let i = 0; i <= n; i++) {
      const p = { x: i / n, y: contourY(level, i / n) }
      if (prev) {
        // the part inside the pad (a line leaving at the top or bottom is cut there)
        const inA = prev.y >= 0 && prev.y <= 1
        const inB = p.y >= 0 && p.y <= 1
        // where it leaves the pad between two samples
        const cut = (a: Point, b: Point): Point => {
          const edge = (a.y > 1) !== (b.y > 1) ? 1 : 0
          const t = (edge - a.y) / (b.y - a.y)
          return { x: a.x + (b.x - a.x) * t, y: edge }
        }
        if (inA && inB) segments.push([prev, p])
        else if (inA) segments.push([prev, cut(prev, p)])
        else if (inB) segments.push([cut(prev, p), p])
      }
      prev = p
    }
    return { level, segments }
  })
}

const round4 = (v: number) => Math.round(v * 10000) / 10000
