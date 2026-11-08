/**
 * The Play view's pictures (SpaceCraft's), on 2D canvases sized in device pixels. Each pad's picture shows what its
 * crosshair does to the sound: the grains as lines in time, the LFO's swing as a trail, the filter's response with
 * the reverb behind it, the pitch as contour lines. Coordinates: pad points have y = 1 at the top.
 */
import { lfoHz, type Lfo, type SoundSettings } from '../../types'
import { contours, fxResponse, pitchMultiplier, type Point } from './pads'

export interface Colors {
  line: string
  cross: string
}
type G = CanvasRenderingContext2D

const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/** the crosshair through a point: two thin lines and a dot where they cross */
export function crosshair(g: G, w: number, h: number, p: Point, c: Colors, dpr: number) {
  const x = Math.round(p.x * w) + 0.5
  const y = Math.round((1 - p.y) * h) + 0.5
  g.strokeStyle = c.cross
  g.lineWidth = Math.max(1, dpr)
  g.beginPath()
  g.moveTo(x, 0)
  g.lineTo(x, h)
  g.moveTo(0, y)
  g.lineTo(w, y)
  g.stroke()
  g.fillStyle = c.cross
  g.beginPath()
  g.arc(x, y, 2.2 * dpr, 0, Math.PI * 2)
  g.fill()
}

// ── GRAIN: SpaceCraft's raster -- time runs along each row and on down the pad, like lines of text; a dash is a grain
// sounding, the gap after it the silence before the next ──
export const GRAIN_ROWS = 16
const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
/**
 * A grain's turn along the raster, in rows (measured off SpaceCraft's): just over a row near the bottom -- each row
 * starts a little later, a staircase that wraps -- down to an eighth of one near the top.
 */
export const grainSpan = (y: number) => 1.06 * Math.pow(0.12 / 1.06, (clampTo(y, 0, 1) - 0.12) / 0.8)
/**
 * The grain the highlight is on: the latest to fire, counted along the raster (it runs through the lines as fast as
 * grains fire), or -1 when nothing sounds.
 */
export function grainLit(o: { freq: number; y: number; now: number; sounding: boolean }) {
  if (!o.sounding) return -1
  const span = grainSpan(o.y)
  const along = (o.now * o.freq * span) % GRAIN_ROWS
  return Math.floor(along / span)
}
export function drawGrain(g: G, w: number, h: number, o: { duty: number; y: number; lit: number; colors: Colors; dpr: number }) {
  const span = grainSpan(o.y)
  const rowH = h / GRAIN_ROWS
  const thick = clampTo(rowH * 0.3, 1.5 * o.dpr, 4.5 * o.dpr)
  const pad = 2 * thick
  const inner = w - 2 * pad
  const on = clampTo(o.duty, 0.005, 1) * span
  g.lineCap = 'round'
  const grains = Math.ceil(GRAIN_ROWS / span)
  for (let k = 0; k < grains; k++) {
    const a = k * span
    const b = Math.min(GRAIN_ROWS, a + on)
    const hot = k === o.lit
    g.fillStyle = g.strokeStyle = hot ? o.colors.cross : o.colors.line
    g.lineWidth = hot ? thick * 1.5 : thick
    // a grain past a row's end carries on at the start of the next
    for (let t = a; t < b - 1e-9; ) {
      const r = Math.floor(t + 1e-9)
      const end = Math.min(b, r + 1)
      const y = (r + 0.5) * rowH
      const x0 = pad + (t - r) * inner
      const x1 = pad + (end - r) * inner
      if (x1 - x0 <= thick) {
        g.beginPath()
        g.arc((x0 + x1) / 2, y, g.lineWidth / 2, 0, Math.PI * 2)
        g.fill()
      } else {
        // round ends inside the dash, so its length is the grain's
        g.beginPath()
        g.moveTo(x0 + thick / 2, y)
        g.lineTo(x1 - thick / 2, y)
        g.stroke()
      }
      t = end
    }
  }
}

// ── LFO: where the grains fire, over the last few seconds (newest at the bottom), and the LFO's shape ──
/** the LFO's value, -1..1, at a phase (cycles) */
export function lfoValue(shape: Lfo['shape'], phase: number): number {
  const f = phase - Math.floor(phase)
  switch (shape) {
    case 'sine':
      return Math.sin(f * 2 * Math.PI)
    case 'triangle':
      return f < 0.25 ? f * 4 : f < 0.75 ? 2 - f * 4 : f * 4 - 4
    case 'square':
      return f < 0.5 ? 1 : -1
    case 'sawtooth':
      return 2 * f - 1
    case 'rampDown':
      return 1 - 2 * f
    default: {
      // random / smooth / wander: a held value per cycle (a hash of its index), glided for the smooth ones
      const n = Math.floor(phase)
      const rnd = (k: number) => {
        const s = Math.sin(k * 12.9898) * 43758.5453
        return 2 * (s - Math.floor(s)) - 1
      }
      return shape === 'random' ? rnd(n) : rnd(n) + (rnd(n + 1) - rnd(n)) * (0.5 - 0.5 * Math.cos(f * Math.PI))
    }
  }
}
/**
 * The offset (fraction of the clip) LFO 2 gives POS at a time: -0.5..0.5 at full depth, or 0..0.5 through a unipolar
 * route (forward of the position only).
 */
export function lfoOffset(lfo: Lfo, amount: number, bpm: number, t: number, unipolar = false) {
  const v = lfoValue(lfo.shape, t * lfoHz(lfo, bpm))
  return (unipolar ? (v + 1) / 2 : v) * amount * 0.5 * lfo.amount
}

/** The firing point over the last cycle and a half, as dots (newest at the bottom); one-sided: from the left edge. */
export function drawLfo(g: G, w: number, h: number, o: { lfo: Lfo; amount: number; unipolar: boolean; bpm: number; now: number; colors: Colors; dpr: number }) {
  // dots apart, never touching: a row of the pad's height each, the newest the biggest
  const big = 4.2 * o.dpr
  const n = Math.max(8, Math.floor((h - 14 * o.dpr) / (2 * big + 2.5 * o.dpr)))
  // about a cycle and a half in view, so the trail reads as a curve however fast it runs
  const history = Math.min(4, Math.max(0.5, 1.6 / Math.max(0.01, lfoHz(o.lfo, o.bpm))))
  // one-sided, the pad's left edge is the position itself and the crosshair the furthest the sweep goes
  const xs = (off: number) => (o.unipolar ? off * 2 : 0.5 + off) * w
  const at = (t: number) => lfoOffset(o.lfo, o.amount, o.bpm, t, o.unipolar)
  // the dashed line: where the grains fire now
  const nowX = Math.round(xs(at(o.now))) + 0.5
  g.strokeStyle = alpha(o.colors.line, 0.55)
  g.lineWidth = Math.max(1, o.dpr)
  g.setLineDash([2 * o.dpr, 3 * o.dpr])
  g.beginPath()
  g.moveTo(nowX, 0)
  g.lineTo(nowX, h)
  g.stroke()
  g.setLineDash([])
  // the trail: oldest (top) small and faint, newest (bottom) big and bright
  for (let i = n; i >= 0; i--) {
    const age = (i / n) * history
    const x = xs(at(o.now - age))
    const y = h - 8 * o.dpr - (age / history) * (h - 14 * o.dpr)
    const k = 1 - i / n
    g.fillStyle = alpha(o.colors.line, 0.15 + 0.85 * k * k)
    g.beginPath()
    g.arc(x, y, 1.4 * o.dpr + (big - 1.4 * o.dpr) * k, 0, Math.PI * 2)
    g.fill()
  }
}

// ── FILTER · REVERB: the filter's response, the reverb as copies receding behind it ──
export function drawFx(g: G, w: number, h: number, o: { s: Pick<SoundSettings, 'filterType' | 'cutoff' | 'resonance' | 'reverbMix'>; colors: Colors; dpr: number }) {
  const n = 96
  const plateau = 0.46
  const bottom = 0.86
  // the response once (each copy is the same curve, narrower and higher)
  const ys = new Float32Array(n + 1)
  for (let i = 0; i <= n; i++) {
    const t = i / n
    // the trapezoid's own shoulders at the very ends (the audible band's edges)
    const r = fxResponse(o.s, 20 * Math.pow(1000, t)) * Math.min(1, t / 0.035, (1 - t) / 0.035)
    ys[i] = bottom - (bottom - plateau) * Math.min(1.35, r)
  }
  const path = (scale: number, lift: number) => {
    const pts: [number, number][] = []
    for (let i = 0; i <= n; i++) pts.push([(0.5 + (i / n - 0.5) * scale) * w, (ys[i] - lift) * h])
    return pts
  }
  const copies = Math.round(3 + o.s.reverbMix * 22)
  for (let i = copies; i >= 1; i--) {
    const k = i / copies
    const pts = path(1 - i * 0.022, i * (0.36 / copies) * (0.4 + o.s.reverbMix))
    g.strokeStyle = alpha(o.colors.line, 0.5 * (1 - k) + 0.05)
    g.lineWidth = Math.max(1, o.dpr * 0.8)
    g.beginPath()
    pts.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.stroke()
  }
  // the line, with a glow: wide faint strokes under it (a shadow blur costs a blur of the canvas every repaint)
  const main = path(1, 0)
  g.beginPath()
  main.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y)))
  g.lineJoin = 'round'
  g.strokeStyle = alpha(o.colors.line, 0.12)
  g.lineWidth = 9 * o.dpr
  g.stroke()
  g.strokeStyle = alpha(o.colors.line, 0.25)
  g.lineWidth = 4.5 * o.dpr
  g.stroke()
  g.strokeStyle = o.colors.line
  g.lineWidth = Math.max(1.5, 2 * o.dpr)
  g.stroke()
}

// ── PITCH · RING: lines of equal pitch, drawn in dots ──
/** the fixed lines: nominal, stopped, nominal backwards, and the ×2 / ×-2 corners */
const FIXED = contours([1, 0, -1, 1.9, -1.9], 160)
let currentCache: { m: number; segments: [Point, Point][] } | null = null
const fixedLayers = new Map<string, HTMLCanvasElement>()
/** a seeded scatter (the ring's), so a repaint without a new tick draws the same picture */
function scatter(seed: number) {
  let x = (seed * 2654435761) >>> 0 || 1
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return (x >>> 0) / 4294967296
  }
}
export function drawPitch(g: G, w: number, h: number, o: { at: Point; ring: number; tick: number; colors: Colors; dpr: number }) {
  const m = Math.round(pitchMultiplier(o.at) * 2000) / 2000
  if (currentCache?.m !== m) currentCache = { m, segments: contours([m], 160)[0].segments }
  const current = currentCache.segments
  const rand = scatter(o.tick + 1)
  const dots = (g: G, segs: [Point, Point][], color: string, r: number, spacing: number, jitter: number) => {
    g.fillStyle = color
    for (const [a, b] of segs) {
      const len = Math.hypot((b.x - a.x) * w, (b.y - a.y) * h)
      const steps = Math.max(1, Math.round(len / spacing))
      for (let k = 0; k < steps; k++) {
        const t = k / steps
        const px = a.x + (b.x - a.x) * t
        const py = a.y + (b.y - a.y) * t
        // the ring modulator shakes every dot
        const nx = px * w + (jitter ? (rand() - 0.5) * jitter * w : 0)
        const ny = (1 - py) * h + (jitter ? (rand() - 0.5) * jitter * h : 0)
        g.beginPath()
        g.arc(nx, ny, r, 0, Math.PI * 2)
        g.fill()
      }
    }
  }
  const jitter = 0.025 * o.ring
  const fixed = (g: G, jitter: number) => {
    dots(g, FIXED[0].segments, o.colors.line, 2.4 * o.dpr, 1.6 * o.dpr, jitter) // nominal pitch: a solid thick line
    dots(g, FIXED[1].segments, o.colors.cross, 1.7 * o.dpr, 4.5 * o.dpr, jitter) // stopped
    dots(g, FIXED[2].segments, o.colors.line, 1.7 * o.dpr, 4.5 * o.dpr, jitter) // nominal, backwards
    dots(g, FIXED[3].segments, o.colors.line, 1.3 * o.dpr, 2 * o.dpr, jitter) // ×2, the top corners
    dots(g, FIXED[4].segments, o.colors.line, 1.3 * o.dpr, 2 * o.dpr, jitter) // ×-2, the bottom corners
  }
  if (jitter) fixed(g, jitter)
  else {
    // without the ring they never move: drawn once for the pad's size and colours
    const key = `${w}x${h}|${o.colors.line}|${o.colors.cross}|${o.dpr}`
    let layer = fixedLayers.get(key)
    if (!layer) {
      layer = document.createElement('canvas')
      layer.width = w
      layer.height = h
      fixed(layer.getContext('2d')!, 0)
      if (fixedLayers.size > 12) fixedLayers.clear()
      fixedLayers.set(key, layer)
    }
    g.drawImage(layer, 0, 0)
  }
  dots(g, current, alpha(o.colors.line, 0.9), 1 * o.dpr, 3 * o.dpr, jitter) // the line through the crosshair
}

// ── PERFORM: the clip, the grains in it, where they fire ──
export interface GrainDot {
  /** where in the clip it's playing, 0..1 */
  x: number
  /** a height of its own (only for seeing them apart) */
  y: number
  /** how much of it is left, 0..1 */
  life: number
}
export function drawClip(g: G, w: number, h: number, peaks: Float32Array | null, colors: Colors) {
  if (!peaks) return
  const n = peaks.length / 2
  g.fillStyle = colors.line
  const mid = h / 2
  for (let i = 0; i < n; i++) {
    const x = (i / n) * w
    // filled from the centre line, so a zoomed-in wave is solid teeth and a long one its envelope
    const top = mid - Math.max(0, peaks[i * 2 + 1]) * mid * 0.92
    const bottom = mid - Math.min(0, peaks[i * 2]) * mid * 0.92
    g.fillRect(x, top, Math.max(1, w / n + 0.5), Math.max(1, bottom - top))
  }
}
export function drawPerformOverlay(
  g: G,
  w: number,
  h: number,
  o: { at: Point; fireX: number | null; grains: GrainDot[]; colors: Colors; dpr: number },
) {
  if (o.fireX !== null) {
    const x = Math.round(o.fireX * w) + 0.5
    g.strokeStyle = alpha(o.colors.cross, 0.8)
    g.lineWidth = Math.max(1, o.dpr)
    g.setLineDash([2 * o.dpr, 3 * o.dpr])
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, h)
    g.stroke()
    g.setLineDash([])
  }
  const size = 7 * o.dpr
  for (const d of o.grains) {
    if (d.x < 0 || d.x > 1) continue
    g.fillStyle = alpha(o.colors.cross, 0.25 + 0.75 * d.life)
    g.fillRect(d.x * w - size / 2, (1 - d.y) * h - size / 2, size, size)
  }
  crosshair(g, w, h, o.at, o.colors, o.dpr)
}
