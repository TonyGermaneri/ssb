/**
 * The VCO Play view's pads (SpaceCraft's), as numbers: where each crosshair sits for a layer's settings, and what a
 * crosshair position writes back. Positions are 0..1 with y = 1 at the top. Pure, so the mappings are tested.
 *
 * - PERFORM (the big waveform): x = where grains fire (POS, in the clip), y = the layer's volume.
 * - GRAIN: y = how often grains fire (GRAIN, log), x = how long each lasts (LENGTH, log).
 * - LFO: the layer's LFO 2 swinging POS: x = how far (its route's amount), y = how fast (tempo bands, slow → fast).
 * - FILTER · REVERB: y = reverb; x = the filter: centre bypassed, left a low-pass closing, right a high-pass opening.
 * - PITCH · RING: a pitch multiplier that is fine (±2 semitones) in the middle and coarse (×2 up, through stopped, to
 *   ×2 backwards) at the edges; the right edge brings in the ring modulator, its carrier rising with y.
 */
import { DIVISIONS, type ModRoute, type SoundSettings } from '../../types'
import { GRAIN_FREQ_MAX } from '../../audio/grainMath'

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
export const LENGTH_MIN = 0.02
/**
 * The grain rates the pad spans: from one grain per clip (or 0.5 Hz) to GRAIN's top, and always four octaves at
 * least (a single-cycle wave's clip is a few ms: one grain per clip would be faster than the top).
 */
export const grainRange = (clipSeconds: number) => ({
  lo: Math.min(GRAIN_FREQ_MAX / 16, Math.max(0.5, clipSeconds > 0 ? 1 / clipSeconds : 0.5)),
  hi: GRAIN_FREQ_MAX,
})
export function grainPoint(s: SoundSettings & { grainLength?: number }, clipSeconds: number): Point {
  const { lo, hi } = grainRange(clipSeconds)
  return { x: logTo(s.grainLength ?? 1, LENGTH_MIN, 1), y: logTo(s.grainFreq, lo, hi) }
}
export function grainWrite(p: Point, clipSeconds: number) {
  const { lo, hi } = grainRange(clipSeconds)
  return { grainFreq: round4(logFrom(p.y, lo, hi)), grainLength: round4(logFrom(p.x, LENGTH_MIN, 1)) }
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
/** LFO 2 synced to the band under y, and its route to POS at x's amount (none at the far left) */
export function lfoWrite(s: SoundSettings, p: Point) {
  const amount = round4(clamp01(p.x) < 0.02 ? 0 : clamp01(p.x))
  const routes = s.mod.routes.filter((r) => !isPosRoute(r))
  if (amount > 0) routes.push({ source: 'lfo2', dest: 'grainPos', amount })
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
/** how much of the coarse (edge) behaviour a column has: none in the middle, all at the edges */
export function edgeWeight(x: number) {
  const d = Math.abs(clamp01(x) - 0.5)
  return Math.pow(clamp01((d - 0.08) / 0.42), 1.5)
}
/**
 * The pitch multiplier at a point: ×2^(±2/12) across the middle (fine), −2..+2 linear at the edges (coarse: up an
 * octave at the top, stopped half-way, an octave backwards at the bottom), blended between.
 */
export function pitchMultiplier(p: Point) {
  const u = 2 * clamp01(p.y) - 1
  const e = edgeWeight(p.x)
  return (1 - e) * Math.pow(2, (2 * u) / 12) + e * 2 * u
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
    // pitchMultiplier rises with y in every column: bisect
    let lo = 0
    let hi = 1
    if (target < pitchMultiplier({ x, y: 0 }) - 1e-6 || target > pitchMultiplier({ x, y: 1 }) + 1e-6) return null
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2
      if (pitchMultiplier({ x, y: mid }) < target) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  }
  const y = solve(x0)
  if (y !== null) return { x: x0, y }
  // out to whichever edge is nearer, step by step, until it can
  const dir = x0 < 0.5 ? -1 : 1
  for (let x = x0; x >= 0 && x <= 1; x += dir * 0.01) {
    const yy = solve(x)
    if (yy !== null) return { x, y: yy }
  }
  return { x: dir < 0 ? 0 : 1, y: target > 0 ? 1 : 0 }
}

/**
 * Lines of equal pitch over the pad (marching squares on the multiplier field): one polyline set per level, in pad
 * coordinates (y = 1 at the top).
 */
export function contours(levels: number[], n = 64): { level: number; segments: [Point, Point][] }[] {
  const f = (i: number, j: number) => pitchMultiplier({ x: i / n, y: j / n })
  const grid: number[][] = []
  for (let i = 0; i <= n; i++) {
    grid.push([])
    for (let j = 0; j <= n; j++) grid[i].push(f(i, j))
  }
  return levels.map((level) => {
    const segments: [Point, Point][] = []
    const lerp = (a: number, b: number) => (level - a) / (b - a)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const v = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]]
        const pts: Point[] = []
        const corners: Point[] = [
          { x: i / n, y: j / n },
          { x: (i + 1) / n, y: j / n },
          { x: (i + 1) / n, y: (j + 1) / n },
          { x: i / n, y: (j + 1) / n },
        ]
        for (let k = 0; k < 4; k++) {
          const a = v[k]
          const b = v[(k + 1) % 4]
          if ((a < level) !== (b < level)) {
            const t = lerp(a, b)
            const p = corners[k]
            const q = corners[(k + 1) % 4]
            pts.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t })
          }
        }
        if (pts.length >= 2) segments.push([pts[0], pts[1]])
        if (pts.length === 4) segments.push([pts[2], pts[3]])
      }
    return { level, segments }
  })
}

const round4 = (v: number) => Math.round(v * 10000) / 10000
