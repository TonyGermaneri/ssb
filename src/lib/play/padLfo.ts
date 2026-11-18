/**
 * A pad's LFO (its automation button, PLAY and VOYAGE): the pad's crosshair traced round a shape, again and again.
 * SHAPE picks it -- CIRCLE, EIGHT, SQUARE, TRIANGLE, LINE, morphing from one to the next between them. (The garden's
 * GROW is the pad's own button: it walks the pad -- or, with an LFO on, its centre -- with each new clip.) ASPECT stretches it
 * wide or tall, FREQ is how fast it goes round, AMP how far it reaches from its centre (the pad's own X / Y, where
 * it was dragged). Where it reaches past an edge it's held at the edge, so a big one squares off -- as it should.
 *
 * Pure: the garden store runs it (writing the pad as its pointer would) and the pads draw its path.
 */
import type { Point } from './pads'

export interface PadLfo {
  on: boolean
  /** 0 CIRCLE .. 4 LINE (between two, a morph of them) */
  shape: number
  /** 0..1: 0.5 as wide as tall, 0 four times taller, 1 four times wider */
  aspect: number
  /** 0..1 along RATE_LO..RATE_HI Hz (log) */
  rate: number
  /** 0..1: how far from the centre, 1 the pad's whole width / height */
  amp: number
  /** the centre: the pad's X / Y */
  cx: number
  cy: number
}

export const SHAPES = ['CIRCLE', 'EIGHT', 'SQUARE', 'TRIANGLE', 'LINE'] as const
export const LAST_SHAPE = SHAPES.length - 1
export const RATE_LO = 0.02
export const RATE_HI = 8

export const defaultPadLfo = (at: Point): PadLfo => ({ on: true, shape: 0, aspect: 0.5, rate: 0.45, amp: 0.25, cx: at.x, cy: at.y })

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
/** a SHAPE as set: anywhere from CIRCLE to LINE (between two, a morph) */
export const snapShape = (s: number) => Math.min(LAST_SHAPE, Math.max(0, s))
export const rateHz = (rate: number) => RATE_LO * Math.pow(RATE_HI / RATE_LO, clamp01(rate))
export const shapeName = (s: number) => {
  const v = snapShape(s)
  const i = Math.round(v)
  return Math.abs(v - i) < 0.05 ? SHAPES[i] : `${SHAPES[Math.floor(v)]}→${SHAPES[Math.ceil(v)]}`
}

/** along a closed polygon, `u` 0..1 of the way round */
function polygon(pts: [number, number][], u: number): [number, number] {
  const n = pts.length
  const lens = pts.map((p, i) => Math.hypot(pts[(i + 1) % n][0] - p[0], pts[(i + 1) % n][1] - p[1]))
  const total = lens.reduce((a, b) => a + b, 0)
  let d = (((u % 1) + 1) % 1) * total
  for (let i = 0; i < n; i++) {
    if (d <= lens[i] || i === n - 1) {
      const k = lens[i] ? Math.min(1, d / lens[i]) : 0
      const a = pts[i]
      const b = pts[(i + 1) % n]
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
    }
    d -= lens[i]
  }
  return pts[0]
}
const SQUARE: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]]
const TRIANGLE: [number, number][] = [[0, 1], [-1, -0.8], [1, -0.8]]

/** each shape at `u` (0..1 round it), in -1..1 each way, y up; all start at the top or the right and go anticlockwise */
const UNIT: ((u: number) => [number, number])[] = [
  (u) => [Math.cos(u * Math.PI * 2), Math.sin(u * Math.PI * 2)],
  (u) => [Math.sin(u * Math.PI * 2), Math.sin(u * Math.PI * 4)],
  (u) => polygon(SQUARE, u + 0.875),
  (u) => polygon(TRIANGLE, u),
  (u) => [Math.sin(u * Math.PI * 2), 0],
]

/** where the shape puts the pad at `phase` (turns: 0..1 is once round), held inside the pad */
export function lfoAt(l: PadLfo, phase: number): Point {
  const s = snapShape(l.shape)
  const i = Math.min(LAST_SHAPE - 1, Math.floor(s))
  const f = s - i
  const u = ((phase % 1) + 1) % 1
  const a = UNIT[i](u)
  const b = UNIT[i + 1](u)
  const ux = a[0] + (b[0] - a[0]) * f
  const uy = a[1] + (b[1] - a[1]) * f
  const ratio = Math.pow(4, clamp01(l.aspect) * 2 - 1)
  const amp = clamp01(l.amp)
  const sx = amp * (ratio >= 1 ? 1 : ratio)
  const sy = amp * (ratio >= 1 ? 1 / ratio : 1)
  return { x: clamp01(l.cx + ux * sx), y: clamp01(l.cy + uy * sy) }
}

/** the whole path, `n` points round, for drawing */
export function lfoPath(l: PadLfo, n = 96): Point[] {
  return Array.from({ length: n + 1 }, (_, i) => lfoAt(l, i / n))
}
