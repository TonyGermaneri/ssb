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

// ── GRAIN: the grains in turn, one per row (top first), each as long as it sounds ──
/**
 * How many grains the picture shows: more as they fire faster (the pad's height), so the staircase always fills the
 * pad, steep and sparse at the bottom, a dense run at the top.
 */
export const grainRows = (y: number) => Math.round(5 + 19 * Math.min(1, Math.max(0, y)))
/** which row lights: the grain firing now (-1 when nothing sounds) */
export function grainHot(o: { freq: number; overlap: number; now: number; rows: number; sounding: boolean }) {
  if (!o.sounding) return -1
  const step = 1 / Math.max(0.01, o.freq) / Math.max(1, o.overlap)
  return ((Math.floor(o.now / step) % o.rows) + o.rows) % o.rows
}
/**
 * Time runs left to right over the run of grains: each starts one firing after the last, and lasts its LENGTH share
 * of the grain period. Long grains overlap the next rows' (a smooth texture), short ones are dots apart (separate
 * grains, arpeggios).
 */
export function drawGrain(g: G, w: number, h: number, o: { freq: number; length: number; overlap: number; rows: number; hot: number; colors: Colors; dpr: number }) {
  const period = 1 / Math.max(0.01, o.freq)
  const step = period / Math.max(1, o.overlap)
  const len = Math.max(0, o.length) * period
  const rows = Math.max(1, o.rows)
  const rowH = h / rows
  const thick = Math.min(4 * o.dpr, Math.max(1.5 * o.dpr, rowH * 0.22))
  const pad = thick
  const span = (rows - 1) * step + len || 1
  const xs = (t: number) => pad + (t / span) * (w - 2 * pad)
  g.lineCap = 'round'
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * rowH
    const x0 = xs(r * step)
    const x1 = xs(r * step + len)
    const hot = r === o.hot
    const t = hot ? thick * 1.5 : thick
    g.fillStyle = g.strokeStyle = hot ? o.colors.cross : o.colors.line
    if (x1 - x0 < t) {
      // shorter than it is thick: a dot (a zero-length line draws nothing)
      g.beginPath()
      g.arc(x0, y, t / 2, 0, Math.PI * 2)
      g.fill()
    } else {
      g.lineWidth = t
      g.beginPath()
      g.moveTo(x0, y)
      g.lineTo(x1, y)
      g.stroke()
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
/** the offset (fraction of the clip, -0.5..0.5 at full depth) LFO 2 gives POS at a time */
export const lfoOffset = (lfo: Lfo, amount: number, bpm: number, t: number) => lfoValue(lfo.shape, t * lfoHz(lfo, bpm)) * amount * 0.5 * lfo.amount

export function drawLfo(g: G, w: number, h: number, o: { lfo: Lfo; amount: number; bpm: number; now: number; colors: Colors; dpr: number }) {
  // dots apart, never touching: a row of the pad's height each, the newest the biggest
  const big = 4.2 * o.dpr
  const n = Math.max(8, Math.floor((h - 14 * o.dpr) / (2 * big + 2.5 * o.dpr)))
  // about a cycle and a half in view, so the trail reads as a curve however fast it runs
  const history = Math.min(4, Math.max(0.5, 1.6 / Math.max(0.01, lfoHz(o.lfo, o.bpm))))
  const xs = (off: number) => (0.5 + off) * w
  // the dashed line: where the grains fire now
  const nowX = Math.round(xs(lfoOffset(o.lfo, o.amount, o.bpm, o.now))) + 0.5
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
    const x = xs(lfoOffset(o.lfo, o.amount, o.bpm, o.now - age))
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
const FIXED = contours([1, 0, -1], 72)
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
  if (currentCache?.m !== m) currentCache = { m, segments: contours([m], 72)[0].segments }
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
        // the ring modulator scatters the dots on the right, more toward the edge
        const j = jitter * Math.max(0, px - 0.6) * 2.5
        const nx = px * w + (j ? (rand() - 0.5) * j * w : 0)
        const ny = (1 - py) * h + (j ? (rand() - 0.5) * j * h : 0)
        g.beginPath()
        g.arc(nx, ny, r, 0, Math.PI * 2)
        g.fill()
      }
    }
  }
  const jitter = 0.08 * o.ring
  const fixed = (g: G, jitter: number) => {
    dots(g, FIXED[0].segments, o.colors.line, 2 * o.dpr, 3 * o.dpr, jitter) // nominal pitch: thick
    dots(g, FIXED[1].segments, o.colors.cross, 1.3 * o.dpr, 4 * o.dpr, jitter) // stopped
    dots(g, FIXED[2].segments, alpha(o.colors.line, 0.75), 1.3 * o.dpr, 4 * o.dpr, jitter) // nominal, backwards
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
  dots(g, current, alpha(o.colors.line, 0.9), 1 * o.dpr, 2.5 * o.dpr, jitter) // where the crosshair is
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
