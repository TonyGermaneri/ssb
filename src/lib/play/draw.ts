/**
 * The Play view's pictures, on 2D canvases sized in device pixels: what each pad's crosshair does to the sound, in a
 * look of SSB's own -- the grains as dashes along a spiral groove, the LFO as a pendulum swinging where the grains
 * fire, the filter as a sliced horizon with the reverb rippling out under it, the pitch as a flow field of needles,
 * the clip as a bar graph with grains as diamonds; the grain cloud's texture as pollen drifting apart into two strands,
 * the echo as taps marching away and fading, the tone as a comb of light standing on the EQ's curve. Each crosshair is
 * a reticle, its place marked on the edges.
 * Coordinates: pad points have y = 1 at the top. They're drawn over the shader stage (shaders.ts), or alone.
 */
import { lfoHz, type Lfo, type SoundSettings } from '../../types'
import { fxResponse, pitchMultiplier, toneResponse, type Point } from './pads'

export interface Colors {
  line: string
  cross: string
}
type G = CanvasRenderingContext2D

const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** the crosshair: a reticle (a ring, four ticks), and its x and y marked by notches on the pad's edges */
export function crosshair(g: G, w: number, h: number, p: Point, c: Colors, dpr: number) {
  const x = p.x * w
  const y = (1 - p.y) * h
  const r = 6 * dpr
  g.lineWidth = Math.max(1.2, 1.4 * dpr)
  g.strokeStyle = alpha('#000000', 0.45)
  g.beginPath()
  g.arc(x, y, r + dpr, 0, Math.PI * 2)
  g.stroke()
  g.strokeStyle = c.cross
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    g.moveTo(x + dx * (r + 2 * dpr), y + dy * (r + 2 * dpr))
    g.lineTo(x + dx * (r + 6 * dpr), y + dy * (r + 6 * dpr))
  }
  g.stroke()
  g.fillStyle = c.cross
  g.beginPath()
  g.arc(x, y, 1.6 * dpr, 0, Math.PI * 2)
  // the edge notches: triangles pointing in, at the bottom (x) and the left (y)
  const t = 5 * dpr
  g.moveTo(x - t, h)
  g.lineTo(x + t, h)
  g.lineTo(x, h - t)
  g.closePath()
  g.moveTo(0, y - t)
  g.lineTo(0, y + t)
  g.lineTo(t, y)
  g.closePath()
  g.fill()
}

// ── GRAIN: a spiral groove from the middle outwards; time runs along it, a dash a grain sounding, the gap its silence ──
/** the groove's length, in grain-turn units (the old raster's 16 rows) */
export const GRAIN_ROWS = 16
const TURNS = 3.25
/** A grain's turn along the groove, in rows: about a row near the bottom of the pad, an eighth of one near the top. */
export const grainSpan = (y: number) => 1.06 * Math.pow(0.12 / 1.06, (clampTo(y, 0, 1) - 0.12) / 0.8)
/** The grain lit: the latest to fire, counted along the groove (as fast as grains fire), or -1 when nothing sounds. */
export function grainLit(o: { freq: number; y: number; now: number; sounding: boolean }) {
  if (!o.sounding) return -1
  const span = grainSpan(o.y)
  const along = (o.now * o.freq * span) % GRAIN_ROWS
  return Math.floor(along / span)
}
export function drawGrain(g: G, w: number, h: number, o: { duty: number; y: number; lit: number; colors: Colors; dpr: number }) {
  const span = grainSpan(o.y)
  const cx = w / 2
  const cy = h / 2
  const r0 = Math.min(w, h) * 0.07
  const r1 = Math.min(w, h) * 0.44
  const at = (u: number): [number, number] => {
    const f = u / GRAIN_ROWS
    const th = f * TURNS * Math.PI * 2 - Math.PI / 2
    const r = r0 + (r1 - r0) * f
    return [cx + Math.cos(th) * r, cy + Math.sin(th) * r]
  }
  // the groove, faint
  g.strokeStyle = alpha(o.colors.line, 0.16)
  g.lineWidth = Math.max(1, o.dpr)
  g.beginPath()
  for (let i = 0; i <= 240; i++) {
    const [x, y] = at((i / 240) * GRAIN_ROWS)
    if (i) g.lineTo(x, y)
    else g.moveTo(x, y)
  }
  g.stroke()
  const on = clampTo(o.duty, 0.005, 1) * span
  const thick = clampTo(Math.min(w, h) * 0.022, 1.5 * o.dpr, 4 * o.dpr)
  g.lineCap = 'round'
  const grains = Math.ceil(GRAIN_ROWS / span)
  for (let k = 0; k < grains; k++) {
    const a = k * span
    const b = Math.min(GRAIN_ROWS, a + on)
    const hot = k === o.lit
    // the outer turns brighter: time goes outwards
    g.strokeStyle = g.fillStyle = hot ? o.colors.cross : alpha(o.colors.line, 0.45 + 0.55 * (a / GRAIN_ROWS))
    g.lineWidth = hot ? thick * 1.7 : thick
    const [x0, y0] = at(a)
    const len = (b - a) / GRAIN_ROWS
    if (len * TURNS * Math.PI * 2 * r1 < thick) {
      g.beginPath()
      g.arc(x0, y0, g.lineWidth / 2, 0, Math.PI * 2)
      g.fill()
      continue
    }
    const steps = Math.max(2, Math.ceil(len * 160))
    g.beginPath()
    for (let i = 0; i <= steps; i++) {
      const [x, y] = at(a + ((b - a) * i) / steps)
      if (i) g.lineTo(x, y)
      else g.moveTo(x, y)
    }
    g.stroke()
  }
}
/** GRAIN under SYNC: its bands as a ladder of notches up the right edge, the one the crosshair's in filled */
export function drawSyncBands(g: G, w: number, h: number, o: { bands: number; top: number; at: Point; colors: Colors; dpr: number }) {
  const bandH = (o.top * h) / o.bands
  const lit = o.at.y < o.top ? Math.min(o.bands - 1, Math.floor((o.at.y / o.top) * o.bands)) : -1
  const x1 = w - 3 * o.dpr
  for (let i = 0; i < o.bands; i++) {
    const y = h - (i + 0.5) * bandH
    const len = (4 + (i % 2 ? 0 : 4)) * o.dpr
    g.fillStyle = i === lit ? o.colors.cross : alpha(o.colors.line, 0.4)
    g.fillRect(x1 - (i === lit ? len + 4 * o.dpr : len), y - Math.max(1, bandH * 0.18), i === lit ? len + 4 * o.dpr : len, Math.max(2, bandH * 0.36))
  }
}

// ── LFO: a pendulum hung from the top, swinging where the grains fire; its ghosts trace the last swing ──
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
/** where the swing sits now, 0..1 across the pad (centred either way), for the pendulum and the stage */
export function lfoSwing(o: { lfo: Lfo; amount: number; unipolar: boolean; bpm: number; now: number }) {
  const mid = o.unipolar ? o.amount * o.lfo.amount * 0.25 : 0
  const off = lfoOffset(o.lfo, o.amount, o.bpm, o.now, o.unipolar)
  return 0.5 + (o.unipolar ? 2 * (off - mid) : off)
}
export function drawLfo(g: G, w: number, h: number, o: { lfo: Lfo; amount: number; unipolar: boolean; bpm: number; now: number; colors: Colors; dpr: number }) {
  const px = w / 2
  const py = 7 * o.dpr
  const len = h * 0.74
  const MAX = (62 * Math.PI) / 180
  const angle = (x: number) => (x - 0.5) * 2 * MAX
  const bob = (x: number): [number, number] => [px + Math.sin(angle(x)) * len, py + Math.cos(angle(x)) * len]
  // the sweep's range: an arc of ticks
  const reach = o.amount * o.lfo.amount
  const lo = o.unipolar ? 0.5 - reach * 0.5 : 0.5 - reach * 0.5
  const hi = o.unipolar ? 0.5 + reach * 0.5 : 0.5 + reach * 0.5
  g.strokeStyle = alpha(o.colors.line, 0.3)
  g.lineWidth = Math.max(1, o.dpr)
  g.beginPath()
  for (let i = 0; i <= 24; i++) {
    const a = angle(i / 24)
    const r1 = len + 9 * o.dpr
    const r2 = r1 + (i % 6 ? 3 : 7) * o.dpr
    g.moveTo(px + Math.sin(a) * r1, py + Math.cos(a) * r1)
    g.lineTo(px + Math.sin(a) * r2, py + Math.cos(a) * r2)
  }
  g.stroke()
  if (reach > 0) {
    g.strokeStyle = alpha(o.colors.line, 0.7)
    g.lineWidth = 2.5 * o.dpr
    g.beginPath()
    g.arc(px, py, len + 9 * o.dpr, Math.PI / 2 - angle(hi), Math.PI / 2 - angle(lo))
    g.stroke()
  }
  // ghosts: the last swing, faint and small to bright
  const history = Math.min(2, Math.max(0.25, 0.9 / Math.max(0.01, lfoHz(o.lfo, o.bpm))))
  const n = 9
  for (let i = n; i >= 1; i--) {
    const x = lfoSwing({ ...o, now: o.now - (i / n) * history })
    const [bx, by] = bob(x)
    g.fillStyle = alpha(o.colors.line, 0.08 + 0.3 * (1 - i / n))
    g.beginPath()
    g.arc(bx, by, (3 + 3 * (1 - i / n)) * o.dpr, 0, Math.PI * 2)
    g.fill()
  }
  // the rod and the bob
  const x = lfoSwing(o)
  const [bx, by] = bob(x)
  g.strokeStyle = o.colors.line
  g.lineWidth = Math.max(1.2, 1.5 * o.dpr)
  g.beginPath()
  g.moveTo(px, py)
  g.lineTo(bx, by)
  g.stroke()
  g.fillStyle = o.colors.line
  g.beginPath()
  g.arc(px, py, 2.5 * o.dpr, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.arc(bx, by, 7 * o.dpr, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = alpha(o.colors.line, 0.5)
  g.beginPath()
  g.arc(bx, by, 11 * o.dpr, 0, Math.PI * 2)
  g.stroke()
}

// ── FILTER · REVERB: the response as a sliced horizon; the reverb rippling out underneath it ──
export function drawFx(g: G, w: number, h: number, o: { s: Pick<SoundSettings, 'filterType' | 'cutoff' | 'resonance' | 'reverbMix'>; colors: Colors; dpr: number }) {
  const n = 96
  const top = 0.18
  const base = 0.9
  const pts: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const r = fxResponse(o.s, 20 * Math.pow(1000, t)) * Math.min(1, t / 0.03, (1 - t) / 0.03)
    pts.push([t * w, (base - (base - top) * Math.min(1.25, r) * 0.8) * h])
  }
  // the ripples: rings from the floor's middle, more and wider with the reverb
  const rings = Math.round(1 + o.s.reverbMix * 9)
  for (let i = 1; i <= rings; i++) {
    const k = i / rings
    g.strokeStyle = alpha(o.colors.cross, 0.45 * (1 - k) + 0.05)
    g.lineWidth = Math.max(1, o.dpr)
    g.beginPath()
    g.ellipse(w / 2, base * h, w * (0.08 + 0.5 * k * (0.3 + o.s.reverbMix)), h * 0.05 * (1 + 2 * k), 0, Math.PI, 2 * Math.PI)
    g.stroke()
  }
  // the horizon, filled in slices that thin towards the top
  g.save()
  g.beginPath()
  g.moveTo(0, base * h)
  for (const [x, y] of pts) g.lineTo(x, y)
  g.lineTo(w, base * h)
  g.closePath()
  g.clip()
  for (let y = top * h; y < base * h; ) {
    const f = (y - top * h) / ((base - top) * h)
    const bar = (1.5 + 5 * f) * o.dpr
    g.fillStyle = alpha(o.colors.line, 0.25 + 0.5 * f)
    g.fillRect(0, y, w, bar)
    y += bar + (4 - 3 * f) * o.dpr
  }
  g.restore()
  g.strokeStyle = o.colors.line
  g.lineWidth = Math.max(1.5, 2 * o.dpr)
  g.lineJoin = 'round'
  g.beginPath()
  pts.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y)))
  g.stroke()
  g.fillStyle = alpha(o.colors.line, 0.6)
  g.fillRect(0, base * h, w, Math.max(1, o.dpr))
}

// ── PITCH · RING: a field of needles, each pointing the way the sample plays where it stands ──
/**
 * The needle's angle for a pitch multiplier: right at the sample's own pitch, up when stopped, left playing it
 * backwards, tipping down past ×1 towards ×2.
 */
export const needleAngle = (m: number) => (clampTo(1 - m, -1, 2) * Math.PI) / 2
const FIELD = 11
const fieldCache = new Map<string, HTMLCanvasElement>()
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
  const mc = pitchMultiplier(o.at)
  const cw = w / FIELD
  const ch = h / FIELD
  const len = Math.min(cw, ch) * 0.36
  const needle = (gg: G, x: number, y: number, m: number, color: string, width: number, shake: number) => {
    const a = needleAngle(m) + shake
    const dx = Math.cos(a) * len
    const dy = -Math.sin(a) * len
    gg.strokeStyle = color
    gg.fillStyle = color
    gg.lineWidth = width
    gg.beginPath()
    gg.moveTo(x - dx, y - dy)
    gg.lineTo(x + dx, y + dy)
    gg.stroke()
    gg.beginPath()
    gg.arc(x + dx, y + dy, width * 0.9, 0, Math.PI * 2)
    gg.fill()
  }
  const cells: { x: number; y: number; m: number; ringy: boolean }[] = []
  for (let i = 0; i < FIELD; i++) {
    for (let j = 0; j < FIELD; j++) {
      const p = { x: (i + 0.5) / FIELD, y: 1 - (j + 0.5) / FIELD }
      cells.push({ x: (i + 0.5) * cw, y: (j + 0.5) * ch, m: pitchMultiplier(p), ringy: p.x > 0.6 })
    }
  }
  const base = (gg: G, shake: () => number) => {
    for (const c of cells) {
      // stopped: faint, standing up
      const color = alpha(o.colors.line, Math.abs(c.m) < 0.06 ? 0.2 : 0.3 + 0.35 * Math.min(1, Math.abs(c.m)))
      needle(gg, c.x, c.y, c.m, color, Math.max(1, 1.2 * o.dpr), shake())
      if (c.ringy) {
        // the ring modulator's side: a small halo round each needle
        gg.strokeStyle = alpha(o.colors.line, 0.18)
        gg.lineWidth = Math.max(1, 0.8 * o.dpr)
        gg.beginPath()
        gg.arc(c.x, c.y, len * 1.25, 0, Math.PI * 2)
        gg.stroke()
      }
    }
  }
  if (o.ring > 0 && o.tick) {
    const rand = scatter(o.tick + 1)
    base(g, () => (rand() - 0.5) * 0.9 * o.ring)
  } else {
    // still: drawn once for the pad's size and colours
    const key = `${w}x${h}|${o.colors.line}|${o.colors.cross}|${o.dpr}`
    let layer = fieldCache.get(key)
    if (!layer) {
      layer = document.createElement('canvas')
      layer.width = w
      layer.height = h
      base(layer.getContext('2d')!, () => 0)
      if (fieldCache.size > 12) fieldCache.clear()
      fieldCache.set(key, layer)
    }
    g.drawImage(layer, 0, 0)
  }
  // the line of needles playing what the crosshair plays: in each column, the one nearest its pitch, lit
  for (let i = 0; i < FIELD; i++) {
    let best = -1
    for (let j = 0; j < FIELD; j++) {
      const c = cells[i * FIELD + j]
      if (best < 0 || Math.abs(c.m - mc) < Math.abs(cells[best].m - mc)) best = i * FIELD + j
    }
    const c = cells[best]
    if (Math.abs(c.m - mc) < 0.12 + 0.1 * Math.abs(mc)) needle(g, c.x, c.y, c.m, o.colors.cross, Math.max(1.5, 2.2 * o.dpr), 0)
  }
}

// ── PERFORM: the clip as a bar graph, the grains in it as diamonds, where they fire ──
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
  const mid = h / 2
  // bars of a few pixels with gaps: the clip's envelope as a graphic equaliser would show it
  const bar = Math.max(3, Math.round(w / 180))
  const gap = Math.max(1, Math.round(bar / 3))
  for (let x = 0; x < w; x += bar + gap) {
    const i0 = Math.floor((x / w) * n)
    const i1 = Math.max(i0 + 1, Math.floor(((x + bar) / w) * n))
    let hi = 0
    let lo = 0
    for (let i = i0; i < i1 && i < n; i++) {
      hi = Math.max(hi, peaks[i * 2 + 1])
      lo = Math.min(lo, peaks[i * 2])
    }
    const top = mid - Math.max(0, hi) * mid * 0.9
    const bottom = mid - Math.min(0, lo) * mid * 0.9
    g.fillStyle = alpha(colors.line, 0.85)
    g.fillRect(x, top, bar, Math.max(1, mid - top))
    g.fillStyle = alpha(colors.line, 0.4)
    g.fillRect(x, mid, bar, Math.max(1, bottom - mid))
  }
}
export function drawPerformOverlay(
  g: G,
  w: number,
  h: number,
  o: { at: Point; fireX: number | null; grains: GrainDot[]; colors: Colors; dpr: number; crossAlpha?: number },
) {
  if (o.fireX !== null) {
    // where the LFO has the grains firing: a bracket top and bottom
    const x = o.fireX * w
    const t = 6 * o.dpr
    g.fillStyle = alpha(o.colors.cross, 0.9)
    g.beginPath()
    g.moveTo(x - t, 0)
    g.lineTo(x + t, 0)
    g.lineTo(x, t * 1.3)
    g.closePath()
    g.moveTo(x - t, h)
    g.lineTo(x + t, h)
    g.lineTo(x, h - t * 1.3)
    g.closePath()
    g.fill()
    g.fillStyle = alpha(o.colors.cross, 0.18)
    g.fillRect(x - o.dpr, 0, 2 * o.dpr, h)
  }
  const size = 4.5 * o.dpr
  for (const d of o.grains) {
    if (d.x < 0 || d.x > 1) continue
    const x = d.x * w
    const y = (1 - d.y) * h
    const s = size * (0.6 + 0.4 * d.life)
    g.fillStyle = alpha(o.colors.cross, 0.25 + 0.75 * d.life)
    g.beginPath()
    g.moveTo(x, y - s)
    g.lineTo(x + s, y)
    g.lineTo(x, y + s)
    g.lineTo(x - s, y)
    g.closePath()
    g.fill()
  }
  const k = o.crossAlpha ?? 1
  if (k < 0.02) return
  g.globalAlpha = k
  crosshair(g, w, h, o.at, o.colors, o.dpr)
  g.globalAlpha = 1
}

// ── TEXTURE: grains as pollen; SPRAY scatters them across, DETUNE splits them into a low strand and a high one ──
const POLLEN = 90
export function drawTexture(g: G, w: number, h: number, o: { at: Point; t: number; colors: Colors; dpr: number }) {
  const rand = scatter(7)
  const spread = 0.5
  const split = o.at.y
  const cy = h / 2
  // the two strands' paths: a slow wave each, apart by DETUNE
  const strand = (side: number, u: number) => cy + side * split * h * 0.28 + Math.sin(u * 6 + o.t * 0.8 + side) * h * 0.04 * (0.4 + split)
  g.lineWidth = Math.max(1, o.dpr)
  for (const side of [-1, 1]) {
    g.strokeStyle = alpha(side < 0 ? o.colors.line : o.colors.cross, 0.18 + 0.2 * split)
    g.beginPath()
    for (let i = 0; i <= 64; i++) {
      const u = i / 64
      const y = strand(side, u)
      if (i) g.lineTo(u * w, y)
      else g.moveTo(u * w, y)
    }
    g.stroke()
  }
  for (let i = 0; i < POLLEN; i++) {
    const a = rand()
    const b = rand()
    const c = rand()
    const side = i % 2 ? 1 : -1
    // across: in step along its strand with no SPRAY, thrown about at random as it grows; drifting a little as it plays
    const even = 0.06 + 0.88 * (Math.floor(i / 2) / (POLLEN / 2 - 1))
    const u = clampTo(even + (a - 0.5) * 2 * spread * o.at.x + Math.sin(o.t * (0.3 + c) + i) * 0.01, 0.02, 0.98)
    const y = strand(side, u) + (b - 0.5) * h * 0.22 * o.at.x
    const r = (0.8 + (0.6 + 1.2 * o.at.x) * c) * o.dpr
    g.fillStyle = alpha(side < 0 ? o.colors.line : o.colors.cross, 0.35 + 0.55 * c)
    g.beginPath()
    g.arc(u * w, y, r, 0, Math.PI * 2)
    g.fill()
  }
}

// ── ECHO: the taps marching away, each fainter by the feedback; the tempo's divisions as ticks along the floor ──
export function drawEcho(
  g: G,
  w: number,
  h: number,
  o: { at: Point; feedback: number; mix: number; divisions: number[]; lit: number; colors: Colors; dpr: number },
) {
  const floor = h * 0.84
  // the floor and its ticks: the divisions at this tempo (the one the time sits on, lit)
  g.fillStyle = alpha(o.colors.line, 0.45)
  g.fillRect(0, floor, w, Math.max(1, o.dpr))
  o.divisions.forEach((x, i) => {
    const on = i === o.lit
    g.fillStyle = on ? o.colors.cross : alpha(o.colors.line, 0.5)
    const tall = (on ? 9 : 5) * o.dpr
    g.fillRect(x * w - (on ? 1.5 : 0.75) * o.dpr, floor, (on ? 3 : 1.5) * o.dpr, tall)
  })
  // the taps: the first the sound itself, then one every delay, shorter by the feedback, out to the right edge
  const spacing = w * (0.045 + 0.3 * o.at.x)
  const bar = Math.max(3 * o.dpr, Math.min(spacing * 0.42, 12 * o.dpr))
  const wet = o.mix > 0 ? 1 : 0.35
  let level = 1
  for (let k = 0, x = w * 0.08; x < w - bar / 2 && level > 0.02; k++, x += spacing) {
    const hh = (floor - h * 0.1) * level
    const r = bar / 2
    g.fillStyle = k === 0 ? o.colors.line : alpha(o.colors.line, (0.25 + 0.6 * level) * wet)
    g.beginPath()
    g.moveTo(x - r, floor)
    g.lineTo(x - r, floor - hh + r)
    g.arc(x, floor - hh + r, r, Math.PI, 0)
    g.lineTo(x + r, floor)
    g.closePath()
    g.fill()
    // each tap's reflection under the floor
    g.fillStyle = alpha(o.colors.line, 0.12 * level * wet)
    g.fillRect(x - r, floor + 2 * o.dpr, bar, Math.min(h - floor, hh * 0.25))
    level *= o.feedback
    if (k === 0) level = o.feedback
  }
}

// ── TONE: the EQ's curve, a comb of light standing on it (up for a boost, down for a cut) and its three bands ──
export function drawTone(g: G, w: number, h: number, o: { s: Pick<SoundSettings, 'eqLow' | 'eqMid' | 'eqHigh'>; colors: Colors; dpr: number }) {
  const mid = h / 2
  const dbY = (db: number) => mid - (db / 15) * h * 0.42
  const hzAt = (u: number) => 20 * Math.pow(1000, u)
  g.fillStyle = alpha(o.colors.line, 0.35)
  g.fillRect(0, mid, w, Math.max(1, o.dpr))
  // the comb: thin teeth from 0 dB to the curve, every few pixels
  const step = Math.max(3, Math.round(4 * o.dpr))
  for (let x = step / 2; x < w; x += step) {
    const db = toneResponse(o.s, hzAt(x / w))
    const y = dbY(db)
    g.fillStyle = alpha(db >= 0 ? o.colors.line : o.colors.cross, 0.2 + 0.5 * Math.min(1, Math.abs(db) / 12))
    g.fillRect(x - o.dpr * 0.6, Math.min(y, mid), Math.max(1, 1.2 * o.dpr), Math.abs(mid - y) || 1)
  }
  g.strokeStyle = o.colors.line
  g.lineWidth = Math.max(1.5, 2 * o.dpr)
  g.lineJoin = 'round'
  g.beginPath()
  for (let i = 0; i <= 120; i++) {
    const u = i / 120
    const y = dbY(toneResponse(o.s, hzAt(u)))
    if (i) g.lineTo(u * w, y)
    else g.moveTo(u * w, y)
  }
  g.stroke()
  // the bands: BASS 120 Hz, MID 1 kHz, TREBLE 8 kHz, at their gains
  for (const [hz, db] of [[120, o.s.eqLow], [1000, o.s.eqMid], [8000, o.s.eqHigh]] as const) {
    const x = (Math.log(hz / 20) / Math.log(1000)) * w
    const y = dbY(db)
    g.strokeStyle = alpha(o.colors.line, 0.6)
    g.lineWidth = Math.max(1, o.dpr)
    g.beginPath()
    g.arc(x, y, 5 * o.dpr, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = o.colors.line
    g.beginPath()
    g.arc(x, y, 2 * o.dpr, 0, Math.PI * 2)
    g.fill()
  }
}

/** a spark thrown off a pad's LFO: where (0..1, y up), how fast, how much life is left (1 → 0), how big */
export interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  /** seconds it lives in all */
  span: number
  size: number
}
/** a ripple where a snapping pad's setting stepped: where, and how far through its life (0 → 1) */
export interface Ripple {
  x: number
  y: number
  age: number
}

/**
 * A pad's LFO (lib/play/padLfo.ts) as part of the picture: a comet going round its shape -- a hot head, its tail
 * along the path behind it, sparks thrown off it and ripples where a snapping pad's setting steps -- in the pad's own
 * colour, added light over the picture. `ui` (0..1) brings up the guides only while someone's at it: the path drawn
 * out, and its centre (the pad's X / Y) as a diamond. `at(phase)` is the LFO's point at a phase (turns).
 */
export function drawLfoFx(
  g: G,
  w: number,
  h: number,
  o: { at: (phase: number) => Point; phase: number; color: string; ui: number; center: Point; sparks: Spark[]; ripples: Ripple[]; dpr: number },
) {
  const { dpr, color } = o
  const X = (p: Point) => p.x * w
  const Y = (p: Point) => (1 - p.y) * h
  g.save()
  // the path: a faint glow always, drawn out while someone's at it
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.strokeStyle = alpha(color, 0.07 + 0.3 * o.ui)
  g.lineWidth = (1 + o.ui) * dpr
  g.beginPath()
  for (let i = 0; i <= 96; i++) {
    const p = o.at(i / 96)
    if (i) g.lineTo(X(p), Y(p))
    else g.moveTo(X(p), Y(p))
  }
  g.stroke()

  g.globalCompositeOperation = 'lighter'
  // ripples: a setting stepping (the LFO pad's tempo divisions, the echo's, a scale's notes)
  for (const r of o.ripples) {
    const k = r.age
    g.strokeStyle = alpha(color, 0.35 * (1 - k))
    g.lineWidth = (1.6 * (1 - k) + 0.4) * dpr
    g.beginPath()
    g.arc(r.x * w, (1 - r.y) * h, (3 + 15 * Math.sqrt(k)) * dpr, 0, Math.PI * 2)
    g.stroke()
  }
  // the tail, behind the head along the path: thicker and brighter toward it
  const TAIL = 0.16
  const N = 28
  g.shadowColor = color
  g.shadowBlur = 8 * dpr
  let prev = o.at(o.phase - TAIL)
  for (let i = 1; i <= N; i++) {
    const k = i / N
    const p = o.at(o.phase - TAIL * (1 - k))
    g.strokeStyle = alpha(color, 0.05 + 0.75 * k * k)
    g.lineWidth = (0.6 + 4.2 * k) * dpr
    g.beginPath()
    g.moveTo(X(prev), Y(prev))
    g.lineTo(X(p), Y(p))
    g.stroke()
    prev = p
  }
  g.shadowBlur = 0
  // sparks
  for (const s of o.sparks) {
    const r = s.size * (0.4 + 0.6 * s.life) * dpr
    g.fillStyle = alpha(color, 0.85 * s.life)
    g.beginPath()
    g.arc(s.x * w, (1 - s.y) * h, r, 0, Math.PI * 2)
    g.fill()
  }
  // the head: a white-hot core in a glow of the pad's colour
  const head = o.at(o.phase)
  const hx = X(head)
  const hy = Y(head)
  const R = 11 * dpr
  const glow = g.createRadialGradient(hx, hy, 0, hx, hy, R)
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
  glow.addColorStop(0.25, alpha(color, 0.85))
  glow.addColorStop(1, alpha(color, 0))
  g.fillStyle = glow
  g.beginPath()
  g.arc(hx, hy, R, 0, Math.PI * 2)
  g.fill()
  g.globalCompositeOperation = 'source-over'

  // the centre, while someone's at it
  if (o.ui > 0.02) {
    const x = X(o.center)
    const y = Y(o.center)
    const r = 4 * dpr
    g.globalAlpha = o.ui
    g.fillStyle = color
    g.strokeStyle = 'rgba(0, 0, 0, 0.6)'
    g.lineWidth = dpr
    g.beginPath()
    g.moveTo(x, y - r)
    g.lineTo(x + r, y)
    g.lineTo(x, y + r)
    g.lineTo(x - r, y)
    g.closePath()
    g.fill()
    g.stroke()
  }
  g.restore()
}
