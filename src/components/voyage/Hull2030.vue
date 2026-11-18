<script setup lang="ts">
import type { Era, Part } from '../../lib/voyage/ship'

/**
 * The THIRTIES ship's hull (lib/voyage/eras/e2030.ts), as a photograph: a stainless cylinder and tangent-ogive nose
 * lying on its side, nose to the right, lit hard from the upper left with the Earth's blue coming up from below.
 *
 * - the steel: shaded band by band round the cylinder and into the nose (diffuse, a brushed specular streak, black
 *   space reflected at the top), each rolled ring a slightly different sheet, brushed and scratched, the welds between
 *   them heat-tinted straw and blue, the longitudinal seams, two heavy bulkhead joints
 * - the heat shield: ~1700 black hex tiles laid out round the cylinder (foreshortened toward the belly, following the
 *   ogive), each its own shade, a few replaced, two missing down to their white felt, the gaps black
 * - the raceway along the top, the chine over the tiles' edge, the aft skirt and engine-bay shroud
 * - housings round every working part: carbon window frames with polished bezels and bolts, a steel collar per ring,
 *   vent plates, footing rings under the domes, actuator fairings over the flaps' hinges, pod fairings over the RCS
 *   bells, soot and heat on the engine bells, tiles over the windward flaps, lattice over the comms mast, ribs on the
 *   radiator, shading on the dishes
 * - stencils and serials (fictional)
 *
 * Static; drawn between the parts behind the hull (flaps, bells, masts) and the parts on it.
 */
const props = defineProps<{ era: Era }>()
const parts = props.era.parts

// ── the shape ──
const CY = -30
const R = 158
const TAIL = -704
const NOSE0 = 380
const TIP = 806
const LN = TIP - NOSE0
const RHO = (R * R + LN * LN) / (2 * R)
/** the hull's half-height at x: a cylinder, then a tangent ogive */
function h(x: number) {
  if (x <= NOSE0) return R
  const s = Math.min(LN, x - NOSE0)
  return Math.max(0, Math.sqrt(RHO * RHO - s * s) - (RHO - R))
}
const f = (v: number) => v.toFixed(1)
const XS = [TAIL, NOSE0, ...Array.from({ length: 24 }, (_, i) => NOSE0 + ((i + 1) / 24) * (LN - 4))]
/** a line of constant angle along the hull (k = sin of it: -1 the top, 1 the bottom), into the nose */
const line = (k: number, xs = XS) => xs.map((x) => `${f(x)} ${f(CY + h(x) * k)}`)
function band(k0: number, k1: number, xs = XS) {
  return `M ${line(k0, xs).join(' L ')} L ${line(k1, xs).reverse().join(' L ')} Z`
}
const xsFrom = (a: number, b: number) => [a, ...XS.filter((x) => x > a && x < b), b]
const HULL = `M ${TAIL} ${CY - R + 4} L ${TAIL + 4} ${CY - R} ${XS.slice(1)
  .map((x) => `L ${f(x)} ${f(CY - h(x))}`)
  .join(' ')} Q ${TIP + 3} ${CY} ${f(XS[XS.length - 1])} ${f(CY + h(XS[XS.length - 1]))} ${XS.slice(1)
  .reverse()
  .map((x) => `L ${f(x)} ${f(CY + h(x))}`)
  .join(' ')} L ${TAIL + 4} ${CY + R} L ${TAIL} ${CY + R - 4} Z`

// ── a seeded random, so the tiles and sheets are the same every time ──
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── the light: the sun up and to the left (a little toward us), black space above, the Earth's blue below ──
const norm = (v: number[]) => {
  const n = Math.hypot(...v)
  return v.map((c) => c / n)
}
const L = norm([-0.45, -0.86, 0.3])
const HV = norm([L[0], L[1], L[2] + 1])
const hex = (c: number[]) => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')
/** the steel's colour where its normal is at angle th (0 facing us, -90° up) */
function steel(th: number) {
  const ny = Math.sin(th)
  const nz = Math.cos(th)
  const dif = Math.max(0, L[1] * ny + L[2] * nz)
  const nh = Math.max(0, HV[1] * ny + HV[2] * nz)
  // what the mirror half of the steel sees: black space up top, the Earth's blue down below
  const ry = 2 * nz * ny
  const earth = Math.max(0, ry) ** 1.4
  const space = Math.max(0, -ry) ** 1.6
  const base = [0.6, 0.625, 0.65]
  const spec = nh ** 80 * 0.9 + nh ** 12 * 0.25
  return hex(base.map((b, i) => b * (0.06 + dif ** 1.3 * 0.95) * (1 - space * 0.25) + spec * [1, 0.98, 0.94][i] + earth * [0.05, 0.12, 0.24][i]))
}
/** where the heat shield starts (sin of an angle just below the side) */
const TK = 0.07
const TH0 = Math.asin(TK)
const NB = 56
const bands = Array.from({ length: NB }, (_, i) => {
  const t0 = -Math.PI / 2 + (i / NB) * (Math.PI / 2 + TH0 + 0.02)
  const t1 = -Math.PI / 2 + ((i + 1) / NB) * (Math.PI / 2 + TH0 + 0.02)
  return { d: band(Math.sin(t0), Math.sin(t1) + 0.003), c: steel((t0 + t1) / 2) }
})
const STEEL = band(-1, TK)
const SHIELD = band(TK - 0.01, 1)

// ── the rolled rings: each a slightly different sheet, the welds between ──
const RING_W = 62
const RINGS = Array.from({ length: 30 }, (_, i) => TAIL + 44 + i * RING_W).filter((x) => x < TIP - 60)
const rr = rng(2030)
const sheets = RINGS.slice(0, -1).map((x, i) => {
  const v = rr()
  return { x, w: RINGS[i + 1] - x, fill: v < 0.5 ? '#000' : '#fff', o: (Math.abs(v - 0.5) * 0.14).toFixed(3), warm: rr() < 0.3 }
})
/** a circumferential weld at x, over the steel only */
const weld = (x: number) => `M ${f(x)} ${f(CY - h(x) - 2)} V ${f(CY + h(x) * TK)}`
/** the longitudinal seams (a sheet's two ends meet), staggered ring to ring */
const SEAMS = RINGS.slice(0, -1).map((x, i) => {
  const k = [-0.46, -0.2, -0.62, -0.33][i % 4]
  const x1 = Math.min(RINGS[i + 1], TIP - 70)
  return `M ${f(x)} ${f(CY + h(x) * k)} L ${f(x1)} ${f(CY + h(x1) * k)}`
})
const BULKHEADS = [-318, 186]

// ── the heat shield: hex tiles round the cylinder, foreshortened toward the belly ──
interface TileSet {
  d: string
  c: string
}
const TILES: { sets: TileSet[]; felt: string; swapped: string; gaps: string } = (() => {
  const a = 6.6 // hex radius, in arc units
  const w = Math.sqrt(3) * a
  const dth = (1.5 * a) / R
  const g = 0.86
  const rnd = rng(30)
  const buckets = new Map<string, string[]>()
  const felt: string[] = []
  const swapped: string[] = []
  const pt = (x: number, th: number) => `${f(x)} ${f(CY + h(x) * Math.sin(Math.min(Math.PI / 2, th)))}`
  for (let row = 0; ; row++) {
    const thc = TH0 + 0.03 + row * dth
    if (thc > Math.PI / 2 + dth * 0.5) break
    const off = row % 2 ? w / 2 : 0
    for (let cx = TAIL + 30 + off; cx < TIP - 8; cx += w) {
      const hh = h(cx)
      if (hh < 10) continue
      const pts = [0, 1, 2, 3, 4, 5].map((k) => {
        const an = ((30 + 60 * k) * Math.PI) / 180
        return pt(cx + Math.cos(an) * a * g, thc + (Math.sin(an) * a * g) / R)
      })
      const d = `M ${pts.join(' L ')} Z `
      // the ragged top edge
      if (row === 0 && rnd() < 0.35) continue
      const r = rnd()
      if (r < 0.003) {
        felt.push(d)
        continue
      }
      if (r < 0.02) {
        swapped.push(d)
        continue
      }
      // lit a little where it faces us and the sun, blue from the Earth toward the belly
      const ny = Math.sin(Math.min(Math.PI / 2, thc))
      const nz = Math.cos(Math.min(Math.PI / 2, thc))
      const dif = Math.max(0, L[1] * ny + L[2] * nz)
      const earth = ny ** 2
      const v = 0.075 + rnd() * 0.06
      const lit = 0.6 + dif * 1.25
      const c = hex([v * lit + earth * 0.012, v * lit + earth * 0.03, v * lit * 1.06 + earth * 0.07].map((q) => Math.round(q * 90) / 90))
      if (!buckets.has(c)) buckets.set(c, [])
      buckets.get(c)!.push(d)
    }
  }
  return {
    sets: [...buckets.entries()].map(([c, ds]) => ({ c, d: ds.join('') })),
    felt: felt.join(''),
    swapped: swapped.join(''),
    gaps: '',
  }
})()

// ── the raceway along the top, the chine over the tiles ──
const RACE_XS = xsFrom(-668, 560)
const RACEWAY = band(-0.95, -0.885, RACE_XS)
const RACE_TOP = `M ${line(-0.95, RACE_XS).join(' L ')}`
const RACE_SHADOW = band(-0.885, -0.84, RACE_XS)
const RACE_JOINTS = Array.from({ length: 22 }, (_, i) => -640 + i * 56).filter((x) => x < 548)
const CHINE_XS = xsFrom(-690, 620)
const CHINE = band(TK - 0.055, TK + 0.004, CHINE_XS)
const CHINE_HI = `M ${line(TK - 0.055, CHINE_XS).join(' L ')}`
const CHINE_LO = `M ${line(TK + 0.006, CHINE_XS).join(' L ')}`

// ── the parts' housings ──
const W = (p: Part) => p.rect[2] - p.rect[0]
const H = (p: Part) => p.rect[3] - p.rect[1]
const CXp = (p: Part) => (p.rect[0] + p.rect[2]) / 2
const CYp = (p: Part) => (p.rect[1] + p.rect[3]) / 2
const of = (form: string) => parts.filter((p) => p.form === form)
const gardenOf = (vco: number) => parts.find((p) => p.vco === vco && p.kind === 'garden')

/** each window's carbon frame, round it and its garden's lamps; the flight deck's a trapezoid like the cockpit's panes */
const WINDOWS = of('window').map((p) => {
  const g = gardenOf(p.vco)
  const [x0, y0, x1, y1] = p.rect
  const m = 12
  const slant = p.vco === 0 ? 22 : 5
  const frame = `M ${x0 - m + slant} ${y0 - m} L ${x1 + m - slant} ${y0 - m} Q ${x1 + m - slant + 6} ${y0 - m} ${x1 + m - slant + 8} ${y0 - m + 6} L ${x1 + m} ${y1 + m - 10} Q ${x1 + m + 2} ${y1 + m} ${x1 + m - 8} ${y1 + m} L ${x0 - m + 8} ${y1 + m} Q ${x0 - m - 2} ${y1 + m} ${x0 - m} ${y1 + m - 10} L ${x0 - m + slant - 8} ${y0 - m + 6} Q ${x0 - m + slant - 6} ${y0 - m} ${x0 - m + slant} ${y0 - m} Z`
  const bolts: { x: number; y: number }[] = []
  const nb = Math.round((x1 - x0) / 26)
  for (let i = 0; i <= nb; i++) {
    const x = x0 - 4 + ((x1 - x0 + 8) * i) / nb
    bolts.push({ x, y: y0 - 12 }, { x, y: y1 + 12 })
  }
  return { p, g, frame, bolts, x0, y0, x1, y1, wy1: y1 }
})
/** the rings' collars and the turbines' intake lips */
const ROTORS = of('rotor').map((p) => {
  const ring = p.variant === 'ring'
  const rx = ring ? W(p) / 2 + 14 : Math.min(W(p), H(p)) / 2 + 12
  const ry = ring ? H(p) / 2 + 14 : rx
  const n = 16
  const bolts = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return { x: CXp(p) + Math.cos(a) * (rx - 6), y: CYp(p) + Math.sin(a) * (ry - 6) }
  })
  return { p, ring, cx: CXp(p), cy: CYp(p), rx, ry, bolts }
})
const VENTS = of('vents').map((p) => ({ p, x: p.rect[0] - 12, y: CYp(p) - 28, w: W(p) + 24, h: 56, louvers: Array.from({ length: Math.floor((W(p) + 4) / 9) }, (_, i) => p.rect[0] - 2 + i * 9) }))
const DOMES = of('dome').map((p) => {
  const down = p.variant === 'down'
  return { p, down, x: p.rect[0] - 22, y: down ? p.rect[1] - 14 : p.rect[3] - 10, w: W(p) + 44, cx: CXp(p), base: down ? p.rect[1] : p.rect[3] }
})
/** the flaps' (and the sensor mast's) roots: an actuator fairing over each hinge */
const HINGES = of('swinger').map((p) => {
  const cx = CXp(p)
  const y = p.rect[3] - 4
  const hw = p.variant === 'flap' ? W(p) * 0.52 : 34
  const ht = p.variant === 'flap' ? 30 : 22
  return {
    p,
    flap: p.variant === 'flap',
    d: `M ${cx - hw - 26} ${y + 16} C ${cx - hw} ${y + 8} ${cx - hw + 6} ${y - ht} ${cx - hw + 34} ${y - ht} L ${cx + hw - 20} ${y - ht} C ${cx + hw + 4} ${y - ht} ${cx + hw + 10} ${y + 4} ${cx + hw + 36} ${y + 16} Z`,
    cx,
    y,
    hw,
    ht,
  }
})
/** the bells (VoyageShip's bells()), for the heat, soot and pod fairings over their cooling bands */
const BELLS = of('funnel')
  .filter((p) => p.variant === 'bells')
  .map((p) => {
    const [x0, y0, x1, y1] = p.rect
    const n = Math.max(1, p.n)
    const dx = Math.cos((p.dir * Math.PI) / 180)
    const dy = Math.sin((p.dir * Math.PI) / 180)
    const vertical = Math.abs(dy) >= Math.abs(dx)
    const across = vertical ? x1 - x0 : y1 - y0
    const len = (vertical ? y1 - y0 : x1 - x0) - 6
    const slot = across / n
    const main = p.kind === 'pitch' && p.vco === 2
    return {
      p,
      main,
      vertical,
      dx,
      dy,
      list: Array.from({ length: n }, (_, i) => {
        const c = slot * (i + 0.5)
        const x = vertical ? x0 + c : dx > 0 ? x0 : x1
        const y = vertical ? (dy > 0 ? y0 : y1) : y0 + c
        const tw = slot * 0.42
        const mw = slot * 0.92
        return {
          key: `${p.id}-${i}`,
          x,
          y,
          t: `translate(${x} ${y}) rotate(${p.dir - 90})`,
          d: `M ${-tw / 2} 0 C ${-tw / 2} ${len * 0.5} ${-mw / 2} ${len * 0.7} ${-mw / 2} ${len} L ${mw / 2} ${len} C ${mw / 2} ${len * 0.7} ${tw / 2} ${len * 0.5} ${tw / 2} 0 Z`,
          L: len,
          tw,
          mw,
        }
      }),
    }
  })
/** a fin's resting outline (VoyageShip's finPath at mid 0) */
function finRest(p: Part) {
  const [x0, y0, x1, y1] = p.rect
  const X = (n: number) => n * Math.min(1.6, W(p) / 200)
  const Y = (n: number) => n * Math.min(1.6, H(p) / 150)
  if (p.variant === 'keel') return `M ${x0 + X(10)} ${y0} L ${x1 - X(6)} ${y0} C ${x1 - X(30)} ${y0 + Y(50)} ${x1 - X(50)} ${y1 - Y(30)} ${x1 - X(90)} ${y1} L ${x0 + X(70)} ${y1 - Y(10)} C ${x0 + X(40)} ${y1 - Y(50)} ${x0 + X(20)} ${y0 + Y(50)} ${x0 + X(10)} ${y0} Z`
  if (p.variant === 'delta') return `M ${x0 + X(8)} ${y0} L ${x1 - X(4)} ${y0} C ${x1 - X(20)} ${y0 + H(p) * 0.45} ${x0 + W(p) * 0.4} ${y1 - Y(10)} ${x0 + X(6)} ${y1} C ${x0 + X(14)} ${y0 + H(p) * 0.6} ${x0 + X(10)} ${y0 + Y(30)} ${x0 + X(8)} ${y0} Z`
  if (p.variant === 'wing') return `M ${x1 - X(10)} ${y0 + Y(20)} C ${x1 + X(6)} ${y0 + Y(80)} ${x1 - X(20)} ${y1 - Y(40)} ${x0 + X(30)} ${y1 - Y(6)} C ${x0 + X(6)} ${y1 - Y(30)} ${x0 + X(20)} ${y0 + Y(90)} ${x0 + X(40)} ${y0 + Y(10)} Z`
  return `M ${x1 - X(8)} ${y0} L ${x0 + X(60)} ${y0 + Y(10)} C ${x0 + X(20)} ${y0 + Y(60)} ${x0} ${y1 - Y(30)} ${x0 + X(10)} ${y1} L ${x1 - X(60)} ${y1 - Y(30)} C ${x1 - X(30)} ${y1 - Y(80)} ${x1 - X(10)} ${y0 + Y(60)} ${x1 - X(8)} ${y0} Z`
}
const flipT = (p: Part) => (p.flip === 'y' ? `translate(0 ${p.rect[1] + p.rect[3]}) scale(1 -1)` : p.flip === 'x' ? `translate(${p.rect[0] + p.rect[2]} 0) scale(-1 1)` : '')
/** the tone parts: the windward flaps (below the hull, tiled) and the radiator (above, ribbed) */
const FINS = of('fin').map((p) => {
  const below = p.rect[1] > CY
  // the root, where it meets the hull
  const ry = below ? p.rect[1] + 2 : p.rect[3] - 2
  return { p, id: p.id.replace(':', '-'), d: finRest(p), t: flipT(p), below, ry }
})
/** the comms masts: a lattice over the bare mast */
const MASTS = of('antenna')
  .filter((p) => p.variant === 'mast')
  .map((p) => {
    const cx = CXp(p)
    const top = p.rect[1] + 30
    const bot = p.rect[3]
    const segs = 7
    let d = ''
    for (let i = 0; i < segs; i++) {
      const ya = bot - ((bot - top) * i) / segs
      const yb = bot - ((bot - top) * (i + 1)) / segs
      const wa = 9 - i * 0.8
      const wb = 9 - (i + 1) * 0.8
      d += `M ${f(cx - wa)} ${f(ya)} L ${f(cx + wb)} ${f(yb)} M ${f(cx + wa)} ${f(ya)} L ${f(cx - wb)} ${f(yb)} M ${f(cx - wb)} ${f(yb)} H ${f(cx + wb)} `
    }
    const arms = [0.25, 0.5, 0.75].map((k, i) => {
      const y = bot - (bot - p.rect[1]) * k
      const w = (W(p) / 2 - 8) * (1 - (i + 1) * 0.22)
      return { y, w }
    })
    return { p, cx, top, bot, d, arms }
  })
const DISHES = of('antenna')
  .filter((p) => p.variant === 'dish')
  .map((p) => {
    const r = Math.min(W(p), H(p)) * 0.42
    const c = { x: CXp(p), y: CYp(p) }
    const a0 = (-20 * Math.PI) / 180
    const a1 = (160 * Math.PI) / 180
    const p0 = { x: c.x + Math.cos(a0) * r, y: c.y - r * 0.2 + Math.sin(a0) * r }
    const p1 = { x: c.x + Math.cos(a1) * r, y: c.y - r * 0.2 + Math.sin(a1) * r }
    const base = p.flip === 'y' ? p.rect[1] : p.rect[3]
    return { p, d: `M ${f(p0.x)} ${f(p0.y)} A ${f(r)} ${f(r * 0.62)} -20 0 1 ${f(p1.x)} ${f(p1.y)} Z`, t: flipT(p), cx: c.x, base, r }
  })

// ── the stencils ──
const FONT = "'DIN Alternate', 'Eurostile', 'Helvetica Neue', Arial, sans-serif"
const MONO = "'SF Mono', 'Menlo', 'Consolas', monospace"
/** small fastener rows along each bulkhead */
/** access panels on the bare steel (between the windows, aft, in the nose) */
const PANELS = [
  { x: -292, y: CY - 104, w: 46, h: 30, r: 4 },
  { x: -238, y: CY - 104, w: 30, h: 30, r: 4 },
  { x: -292, y: CY - 66, w: 76, h: 24, r: 3 },
  { x: 120, y: CY - 104, w: 40, h: 54, r: 5 },
  { x: 120, y: CY - 40, w: 40, h: 26, r: 3 },
  { x: -684, y: CY - 40, w: 50, h: 18, r: 3 },
  { x: 650, y: CY - 52, w: 34, h: 20, r: 3 },
].map((a) => ({ ...a, screws: [0, 1, 2, 3].map((k) => ({ x: a.x + (k % 2 ? a.w - 3.5 : 3.5), y: a.y + (k < 2 ? 3.5 : a.h - 3.5) })) }))
const HATCH = { x: 232, y: CY - 116, w: 66, h: 96 }
/** flush RCS ports, each with its soot streak blown aft */
const THRUSTERS = [
  { x: 604, y: CY - 44, sx: -26, sy: 2 },
  { x: 622, y: CY - 44, sx: -26, sy: 2 },
  { x: -200, y: CY - 30, sx: -22, sy: 3 },
  { x: -660, y: CY - 136, sx: 0, sy: -14 },
]
const rivets = BULKHEADS.flatMap((x) => Array.from({ length: 13 }, (_, i) => ({ x: x - 7, y: CY - R + 14 + i * 13 })).filter((r) => r.y < CY + R * TK - 4))
</script>

<template>
  <g class="hull h30">
    <defs>
      <clipPath id="h30-hull"><path :d="HULL" /></clipPath>
      <clipPath id="h30-steel"><path :d="STEEL" /></clipPath>
      <clipPath id="h30-shield"><path :d="SHIELD" /></clipPath>
      <linearGradient id="h30-tint" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#3a5aa8" stop-opacity="0" />
        <stop offset="0.25" stop-color="#5b4a9a" stop-opacity="0.5" />
        <stop offset="0.42" stop-color="#b78a3c" stop-opacity="0.75" />
        <stop offset="0.5" stop-color="#e8d6a8" stop-opacity="0.6" />
        <stop offset="0.58" stop-color="#b78a3c" stop-opacity="0.75" />
        <stop offset="0.75" stop-color="#5b4a9a" stop-opacity="0.5" />
        <stop offset="1" stop-color="#3a5aa8" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="h30-shieldShade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000" stop-opacity="0" />
        <stop offset="0.55" stop-color="#000" stop-opacity="0.12" />
        <stop offset="0.85" stop-color="#16314f" stop-opacity="0.25" />
        <stop offset="1" stop-color="#4a8fd0" stop-opacity="0.32" />
      </linearGradient>
      <linearGradient id="h30-noseShade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#000" stop-opacity="0" />
        <stop offset="0.55" stop-color="#000" stop-opacity="0.12" />
        <stop offset="1" stop-color="#000" stop-opacity="0.5" />
      </linearGradient>
      <linearGradient id="h30-tailShade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#000" stop-opacity="0.75" />
        <stop offset="0.35" stop-color="#1a0f08" stop-opacity="0.35" />
        <stop offset="1" stop-color="#000" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="h30-carbon" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stop-color="#34373c" />
        <stop offset="0.45" stop-color="#1a1c1f" />
        <stop offset="1" stop-color="#0b0c0d" />
      </linearGradient>
      <linearGradient id="h30-bezel" x1="0" y1="0" x2="0.2" y2="1">
        <stop offset="0" stop-color="#f4f6f8" />
        <stop offset="0.18" stop-color="#9aa0a7" />
        <stop offset="0.5" stop-color="#4a4f55" />
        <stop offset="0.8" stop-color="#8f969e" />
        <stop offset="1" stop-color="#2a2d31" />
      </linearGradient>
      <linearGradient id="h30-polish" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.3" stop-color="#9ea4ab" />
        <stop offset="0.55" stop-color="#3c4045" />
        <stop offset="0.85" stop-color="#7d848c" />
        <stop offset="1" stop-color="#22252a" />
      </linearGradient>
      <radialGradient id="h30-bolt" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.45" stop-color="#8d9298" />
        <stop offset="1" stop-color="#1c1f22" />
      </radialGradient>
      <radialGradient id="h30-ao" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#000" stop-opacity="0.55" />
        <stop offset="1" stop-color="#000" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="h30-warm" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ffcf8a" stop-opacity="0.5" />
        <stop offset="1" stop-color="#ffb060" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="h30-soot" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#140c06" stop-opacity="0.7" />
        <stop offset="0.6" stop-color="#2a1a0c" stop-opacity="0.25" />
        <stop offset="1" stop-color="#2a1a0c" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="h30-heatblot" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#8a5a24" stop-opacity="0.35" />
        <stop offset="0.5" stop-color="#4b3c7a" stop-opacity="0.18" />
        <stop offset="1" stop-color="#2c3e7a" stop-opacity="0" />
      </radialGradient>
      <!-- a bell, across: steel, the sun's streak, its shadow side -->
      <linearGradient id="h30-bell" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#000" stop-opacity="0.72" />
        <stop offset="0.22" stop-color="#fff" stop-opacity="0.32" />
        <stop offset="0.32" stop-color="#fff" stop-opacity="0.06" />
        <stop offset="0.7" stop-color="#000" stop-opacity="0.35" />
        <stop offset="1" stop-color="#000" stop-opacity="0.8" />
      </linearGradient>
      <!-- and along: the throat's blued steel, the mouth's scorched lip -->
      <linearGradient id="h30-bellHeat" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2d3c74" stop-opacity="0.5" />
        <stop offset="0.3" stop-color="#6b4a8a" stop-opacity="0.25" />
        <stop offset="0.6" stop-color="#9a6a30" stop-opacity="0.18" />
        <stop offset="0.9" stop-color="#1a0e06" stop-opacity="0.55" />
        <stop offset="1" stop-color="#000" stop-opacity="0.8" />
      </linearGradient>
      <radialGradient id="h30-plume" cx="1" cy="0.5" r="1">
        <stop offset="0" stop-color="#cfe8ff" stop-opacity="0.5" />
        <stop offset="0.2" stop-color="#7fb4ff" stop-opacity="0.22" />
        <stop offset="0.6" stop-color="#5a6cff" stop-opacity="0.06" />
        <stop offset="1" stop-color="#5a6cff" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="h30-throat" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#fff2d8" stop-opacity="0.9" />
        <stop offset="0.35" stop-color="#ff9a52" stop-opacity="0.45" />
        <stop offset="1" stop-color="#ff6a2a" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="h30-finShade" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#9fc4ff" stop-opacity="0.14" />
        <stop offset="0.5" stop-color="#000" stop-opacity="0.05" />
        <stop offset="1" stop-color="#000" stop-opacity="0.5" />
      </linearGradient>
      <linearGradient id="h30-finBounce" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000" stop-opacity="0.35" />
        <stop offset="0.5" stop-color="#2a5a8f" stop-opacity="0.08" />
        <stop offset="1" stop-color="#6fb2f0" stop-opacity="0.3" />
      </linearGradient>
      <linearGradient id="h30-radShade" x1="0" y1="0" x2="1" y2="0.4">
        <stop offset="0" stop-color="#fff" stop-opacity="0.35" />
        <stop offset="0.35" stop-color="#fff" stop-opacity="0.04" />
        <stop offset="1" stop-color="#000" stop-opacity="0.45" />
      </linearGradient>
      <linearGradient id="h30-skirt" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#d9dde1" />
        <stop offset="0.25" stop-color="#8e949b" />
        <stop offset="0.55" stop-color="#3a3e44" />
        <stop offset="0.85" stop-color="#16181b" />
        <stop offset="1" stop-color="#2c4a6c" />
      </linearGradient>
      <linearGradient id="h30-fairing" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e6e9ec" />
        <stop offset="0.35" stop-color="#9ba1a8" />
        <stop offset="1" stop-color="#3b3f45" />
      </linearGradient>
      <linearGradient id="h30-fairingDark" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3a3d42" />
        <stop offset="0.5" stop-color="#1b1d20" />
        <stop offset="1" stop-color="#0a0b0c" />
      </linearGradient>
      <linearGradient id="h30-dishShade" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.55" />
        <stop offset="0.4" stop-color="#fff" stop-opacity="0.05" />
        <stop offset="1" stop-color="#000" stop-opacity="0.55" />
      </linearGradient>
      <pattern id="h30-cells" patternUnits="userSpaceOnUse" width="12" height="12">
        <rect width="12" height="12" fill="#08132a" opacity="0.55" />
        <path d="M 0 0.5 H 12 M 0.5 0 V 12" stroke="#b9c4d4" stroke-width="0.7" stroke-opacity="0.5" />
        <path d="M 6 1 V 11 M 1 6 H 11" stroke="#7d93b8" stroke-width="0.3" stroke-opacity="0.35" />
      </pattern>
      <pattern id="h30-hexSmall" patternUnits="userSpaceOnUse" width="13.86" height="12" patternTransform="rotate(90)">
        <rect width="13.86" height="12" fill="#121316" />
        <path d="M 0 2 L 3.46 0 L 6.93 2 L 6.93 6 L 3.46 8 L 0 6 Z M 6.93 8 L 10.39 6 L 13.86 8 L 13.86 12 M 6.93 8 L 6.93 12 M 10.39 6 L 10.39 2 L 13.86 0" fill="none" stroke="#000" stroke-width="0.9" />
        <path d="M 0.8 2.4 L 3.46 0.9 L 6.1 2.4" fill="none" stroke="#fff" stroke-width="0.4" stroke-opacity="0.08" />
      </pattern>
    </defs>

    <!-- ── behind: the bells' steel, heat and soot over their cooling bands; the main engines' faint plume ── -->
    <g v-for="b in BELLS" :key="b.p.id">
      <ellipse v-if="b.main" :cx="b.p.rect[0] - 60" :cy="(b.p.rect[1] + b.p.rect[3]) / 2" rx="200" ry="130" fill="url(#h30-plume)" style="mix-blend-mode: screen" />
      <g v-for="l in b.list" :key="l.key" :transform="l.t">
        <path :d="l.d" fill="#17130f" opacity="0.7" />
        <path :d="l.d" fill="url(#h30-bellHeat)" />
        <path :d="l.d" fill="url(#h30-bell)" />
        <!-- the cooling tubes' fine lines -->
        <path :d="l.d" fill="url(#tx-brushed)" opacity="0.35" style="mix-blend-mode: overlay" />
        <ellipse cx="0" :cy="l.L" :rx="l.mw / 2" :ry="Math.max(3, l.mw * (b.vertical ? 0.16 : 0.24))" fill="#060403" opacity="0.65" />
        <ellipse cx="0" :cy="l.L" :rx="l.mw / 2 - 1" :ry="Math.max(2, l.mw * (b.vertical ? 0.16 : 0.24) - 1)" fill="none" stroke="#c9b9a6" stroke-width="0.8" stroke-opacity="0.45" />
        <ellipse v-if="b.main" cx="0" :cy="l.L - 4" :rx="l.tw * 0.5" :ry="l.mw * 0.14" fill="url(#h30-throat)" opacity="0.55" style="mix-blend-mode: screen" />
        <!-- the gimbal collar at the throat -->
        <rect :x="-l.tw / 2 - 6" y="-2" :width="l.tw + 12" height="14" rx="2" fill="url(#h30-fairingDark)" />
        <rect :x="-l.tw / 2 - 6" y="-2" :width="l.tw + 12" height="3" fill="#8a9097" opacity="0.6" />
      </g>
    </g>

    <!-- the windward flaps: tiles over their shaded steel (its bands show through), a steel leading edge -->
    <g v-for="fn in FINS" :key="fn.id">
      <clipPath :id="`h30-fin-${fn.id}`"><path :d="fn.d" :transform="fn.t" /></clipPath>
      <g :clip-path="`url(#h30-fin-${fn.id})`">
        <template v-if="fn.below">
          <rect :x="fn.p.rect[0] - 10" :y="fn.p.rect[1] - 10" :width="W(fn.p) + 20" :height="H(fn.p) + 20" fill="url(#h30-hexSmall)" opacity="0.93" />
          <rect :x="fn.p.rect[0] - 10" :y="fn.p.rect[1] - 10" :width="W(fn.p) + 20" :height="H(fn.p) + 20" fill="url(#h30-finShade)" />
          <rect :x="fn.p.rect[0] - 10" :y="fn.p.rect[1] - 10" :width="W(fn.p) + 20" :height="H(fn.p) + 20" fill="url(#h30-finBounce)" />
        </template>
        <template v-else>
          <rect :x="fn.p.rect[0] - 10" :y="fn.p.rect[1] - 10" :width="W(fn.p) + 20" :height="H(fn.p) + 20" fill="url(#h30-cells)" />
          <rect :x="fn.p.rect[0] - 10" :y="fn.p.rect[1] - 10" :width="W(fn.p) + 20" :height="H(fn.p) + 20" fill="url(#h30-radShade)" />
          <path v-for="k in 3" :key="k" :d="`M ${fn.p.rect[0]} ${fn.p.rect[1] + (H(fn.p) * k) / 4} H ${fn.p.rect[2]}`" stroke="#c9ced3" stroke-width="2.2" stroke-opacity="0.55" />
        </template>
      </g>
      <path :d="fn.d" :transform="fn.t" fill="none" :stroke="fn.below ? '#a3aab1' : '#d9dde1'" stroke-width="2.2" stroke-opacity="0.8" stroke-linejoin="round" />
      <text v-if="fn.below" :x="fn.p.rect[0] + 26" :y="fn.p.rect[1] + 40" :font-family="FONT" font-size="7" letter-spacing="1.6" fill="#c8ccd2" opacity="0.4">NO STEP</text>
    </g>

    <!-- the dishes: a reflector's shading, a feed strut, a gimbal on the hull -->
    <g v-for="ds in DISHES" :key="ds.p.id">
      <g :transform="ds.t">
        <path :d="ds.d" fill="url(#h30-dishShade)" />
        <path :d="ds.d" fill="url(#tx-brushed)" opacity="0.3" style="mix-blend-mode: overlay" />
        <path :d="ds.d" fill="none" stroke="#e9edf0" stroke-width="1.2" stroke-opacity="0.55" />
      </g>
    </g>

    <!-- the comms masts: a lattice over the bare mast, instrument booms -->
    <g v-for="m in MASTS" :key="m.p.id">
      <path :d="m.d" fill="none" stroke="#b9bfc6" stroke-width="1.3" stroke-linecap="round" />
      <path :d="`M ${m.cx - 9} ${m.bot} L ${m.cx - 3} ${m.top} M ${m.cx + 9} ${m.bot} L ${m.cx + 3} ${m.top}`" stroke="#e1e5e9" stroke-width="2.2" stroke-linecap="round" />
      <path :d="`M ${m.cx + 9} ${m.bot} L ${m.cx + 3} ${m.top}`" stroke="#3a3e44" stroke-width="1.2" />
      <g v-for="(a, i) in m.arms" :key="i">
        <rect :x="m.cx - a.w" :y="a.y - 2" :width="a.w * 2" height="4" fill="#9ea4ab" />
        <rect :x="m.cx - a.w" :y="a.y - 2" :width="a.w * 2" height="1.4" fill="#f2f4f6" />
        <rect :x="m.cx - a.w - 6" :y="a.y - 6" width="9" height="12" rx="1.5" fill="#1d1f23" />
        <rect :x="m.cx + a.w - 3" :y="a.y - 5" width="8" height="10" rx="1.5" fill="#d8dce0" />
        <rect :x="m.cx + a.w - 3" :y="a.y + 1" width="8" height="4" fill="#5b6067" />
      </g>
    </g>

    <!-- ── the hull ── -->
    <g clip-path="url(#h30-hull)">
      <!-- the steel, band by band -->
      <path v-for="(b, i) in bands" :key="`s${i}`" :d="b.d" :fill="b.c" />
      <!-- the brushed grain, scratches, fine noise (blended straight onto the bands: no group between) -->
      <path :d="STEEL" fill="url(#tx-brushed)" opacity="0.8" style="mix-blend-mode: overlay" />
      <path :d="STEEL" fill="url(#tx-scratches)" opacity="0.5" style="mix-blend-mode: soft-light" />
      <path :d="STEEL" fill="url(#tx-noise)" opacity="0.25" style="mix-blend-mode: overlay" />
      <g clip-path="url(#h30-steel)">
        <!-- ring to ring, the sheets differ a little; one in three a touch warmer -->
        <g v-for="(s, i) in sheets" :key="`p${i}`">
          <rect :x="s.x" :y="CY - R" :width="s.w" :height="2 * R" :fill="s.fill" :opacity="s.o" />
          <rect v-if="s.warm" :x="s.x" :y="CY - R" :width="s.w" :height="2 * R" fill="#c8a070" opacity="0.045" />
        </g>
        <!-- heat, aft, and round the vents -->
        <ellipse cx="-600" :cy="CY - 40" rx="150" ry="120" fill="url(#h30-heatblot)" />
        <ellipse cx="-180" :cy="CY - 10" rx="120" ry="60" fill="url(#h30-heatblot)" opacity="0.6" />
        <ellipse cx="470" :cy="CY - 20" rx="100" ry="70" fill="url(#h30-heatblot)" opacity="0.4" />
        <!-- the welds: heat tint either side, a dark bead, its lit lip -->
        <g v-for="x in RINGS" :key="`w${x}`">
          <rect :x="x - 7" :y="CY - R" width="14" :height="2 * R" fill="url(#h30-tint)" opacity="0.22" />
          <path :d="weld(x)" stroke="#000" stroke-width="1.6" stroke-opacity="0.42" />
          <path :d="weld(x + 1.4)" stroke="#fff" stroke-width="0.7" stroke-opacity="0.32" />
        </g>
        <path v-for="(d, i) in SEAMS" :key="`m${i}`" :d="d" fill="none" stroke="#000" stroke-width="0.9" stroke-opacity="0.25" />
        <!-- the bulkheads: heavier welds, rows of fasteners -->
        <g v-for="x in BULKHEADS" :key="`j${x}`">
          <rect :x="x - 14" :y="CY - R" width="28" :height="2 * R" fill="url(#h30-tint)" opacity="0.32" />
          <path :d="`M ${x - 2} ${CY - R} V ${CY + R}`" stroke="#000" stroke-width="3.2" stroke-opacity="0.45" />
          <path :d="`M ${x + 1.8} ${CY - R} V ${CY + R}`" stroke="#fff" stroke-width="1.1" stroke-opacity="0.4" />
        </g>
        <circle v-for="(r, i) in rivets" :key="`r${i}`" :cx="r.x" :cy="r.y" r="1.6" fill="url(#h30-bolt)" opacity="0.8" />
        <!-- the nose turning away from the sun; the stern dark into the skirt -->
        <rect :x="NOSE0 - 40" :y="CY - R" :width="TIP - NOSE0 + 44" :height="2 * R" fill="url(#h30-noseShade)" />
      </g>

      <!-- the heat shield: tiles, each its own shade; replaced ones; two lost to the felt -->
      <g clip-path="url(#h30-shield)">
        <path :d="SHIELD" fill="#030304" />
        <path v-for="t in TILES.sets" :key="t.c" :d="t.d" :fill="t.c" />
        <path :d="TILES.swapped" fill="#30333a" />
        <path :d="TILES.felt" fill="#a8a294" />
        <path :d="SHIELD" fill="url(#tx-speckle)" opacity="0.35" style="mix-blend-mode: overlay" />
        <path :d="SHIELD" fill="url(#h30-shieldShade)" />
        <!-- the Earth's light along the belly -->
        <path :d="band(0.86, 1)" fill="#5aa6ff" opacity="0.14" />
        <path :d="band(0.965, 1)" fill="#a6d4ff" opacity="0.22" />
      </g>

      <!-- the chine over the tiles' edge: a steel lip, lit above, a shadow under -->
      <path :d="CHINE" fill="#8f959c" />
      <path :d="CHINE" fill="url(#tx-brushed)" opacity="0.6" style="mix-blend-mode: overlay" />
      <path :d="CHINE_HI" fill="none" stroke="#f1f4f6" stroke-width="1" stroke-opacity="0.75" />
      <path :d="CHINE_LO" fill="none" stroke="#000" stroke-width="2.4" stroke-opacity="0.6" />

      <!-- the raceway along the top: carbon cover, steel brackets, its shadow on the hull -->
      <path :d="RACE_SHADOW" fill="#000" opacity="0.35" />
      <path :d="RACEWAY" fill="url(#h30-fairingDark)" />
      <path :d="RACEWAY" fill="url(#tx-carbon)" opacity="0.5" style="mix-blend-mode: overlay" />
      <path :d="RACE_TOP" fill="none" stroke="#c9ced3" stroke-width="1.1" stroke-opacity="0.8" />
      <g v-for="x in RACE_JOINTS" :key="`rj${x}`">
        <rect :x="x - 3" :y="CY - h(x) * 0.96" width="6" :height="h(x) * 0.1" fill="#a9afb5" />
        <rect :x="x - 3" :y="CY - h(x) * 0.96" width="1.6" :height="h(x) * 0.1" fill="#fff" opacity="0.6" />
      </g>

      <!-- the aft skirt and its shroud -->
      <rect :x="TAIL" :y="CY - R" width="80" :height="2 * R" fill="url(#h30-tailShade)" />
      <rect :x="TAIL" :y="CY - R" width="22" :height="2 * R" fill="#0b0c0e" />
      <path :d="`M ${TAIL + 22} ${CY - R} V ${CY + R}`" stroke="#c4c9cf" stroke-width="1.2" stroke-opacity="0.55" />
      <path :d="`M ${TAIL + 40} ${CY - R} V ${CY + R}`" stroke="#000" stroke-width="2" stroke-opacity="0.45" />
      <rect v-for="k in 9" :key="`sk${k}`" :x="TAIL + 4" :y="CY - R + k * 32 - 10" width="14" height="4" fill="#3a3d42" />

      <!-- the top edge catching the sun, a thin rim of Earth light along the belly -->
      <path :d="band(-1, -0.992)" fill="#fff" opacity="0.65" />
      <path :d="band(-0.992, -0.975)" fill="#fff" opacity="0.18" />
    </g>

    <!-- ── the housings round the parts on the hull ── -->
    <!-- windows: a carbon frame (the flight deck's a trapezoid), a polished bezel, bolts, warm light spilling -->
    <g v-for="w in WINDOWS" :key="`wf${w.p.id}`">
      <path :d="w.frame" fill="#000" opacity="0.5" transform="translate(4 6)" />
      <path :d="w.frame" fill="url(#h30-carbon)" />
      <path :d="w.frame" fill="url(#tx-carbon)" opacity="0.55" style="mix-blend-mode: overlay" />
      <path :d="w.frame" fill="none" stroke="#c9ced3" stroke-width="1.2" stroke-opacity="0.55" />
      <rect :x="w.x0 - 7" :y="w.y0 - 7" :width="w.x1 - w.x0 + 14" :height="w.wy1 - w.y0 + 14" rx="20" fill="url(#h30-bezel)" />
      <rect :x="w.x0 - 7" :y="w.y0 - 7" :width="w.x1 - w.x0 + 14" :height="w.wy1 - w.y0 + 14" rx="20" fill="url(#tx-brushed)" opacity="0.5" style="mix-blend-mode: overlay" />
      <rect :x="w.x0 - 2.5" :y="w.y0 - 2.5" :width="w.x1 - w.x0 + 5" :height="w.wy1 - w.y0 + 5" rx="17" fill="#050505" />
      <!-- the garden's lamps sit in a recessed slot -->
      <rect v-if="w.g" :x="w.g.rect[0] - 5" :y="w.g.rect[1] - 5" :width="W(w.g) + 10" :height="H(w.g) + 10" :rx="(H(w.g) + 10) / 2" fill="#040405" />
      <rect v-if="w.g" :x="w.g.rect[0] - 5" :y="w.g.rect[1] - 5" :width="W(w.g) + 10" :height="H(w.g) + 10" :rx="(H(w.g) + 10) / 2" fill="none" stroke="#7d848c" stroke-width="1.2" stroke-opacity="0.6" />
      <circle v-for="(b, i) in w.bolts" :key="i" :cx="b.x" :cy="b.y" r="2" fill="url(#h30-bolt)" />
      <ellipse :cx="(w.x0 + w.x1) / 2" :cy="w.wy1 + 6" :rx="(w.x1 - w.x0) * 0.55" ry="18" fill="url(#h30-warm)" opacity="0.35" style="mix-blend-mode: screen" />
    </g>

    <!-- rings and intakes: a machined collar with bolts, its shadow -->
    <g v-for="r in ROTORS" :key="`rc${r.p.id}`">
      <ellipse :cx="r.cx + 4" :cy="r.cy + 6" :rx="r.rx" :ry="r.ry" fill="#000" opacity="0.5" />
      <ellipse :cx="r.cx" :cy="r.cy" :rx="r.rx" :ry="r.ry" fill="url(#h30-polish)" />
      <ellipse :cx="r.cx" :cy="r.cy" :rx="r.rx" :ry="r.ry" fill="url(#tx-brushed)" opacity="0.45" style="mix-blend-mode: overlay" />
      <ellipse :cx="r.cx" :cy="r.cy" :rx="r.rx - 10" :ry="r.ry - 10" fill="#08090a" />
      <ellipse :cx="r.cx" :cy="r.cy" :rx="r.rx - 1" :ry="r.ry - 1" fill="none" stroke="#000" stroke-width="1" stroke-opacity="0.5" />
      <circle v-for="(b, i) in r.bolts" :key="i" :cx="b.x" :cy="b.y" r="1.9" fill="url(#h30-bolt)" />
      <!-- the docking rings' alignment targets and latches -->
      <template v-if="r.ring">
        <rect v-for="k in [0, 1, 2, 3]" :key="`l${k}`" :x="r.cx + Math.cos((k * Math.PI) / 2 + Math.PI / 4) * (r.rx - 3) - 4" :y="r.cy + Math.sin((k * Math.PI) / 2 + Math.PI / 4) * (r.ry - 3) - 3" width="8" height="6" rx="1" fill="#1b1d20" stroke="#c9ced3" stroke-width="0.6" stroke-opacity="0.6" />
        <path :d="`M ${r.cx - r.rx - 18} ${r.cy} h 12 M ${r.cx + r.rx + 6} ${r.cy} h 12`" stroke="#e8b10a" stroke-width="2" />
      </template>
    </g>

    <!-- vents: a louvred plate, sooted downstream -->
    <g v-for="v in VENTS" :key="`vp${v.p.id}`">
      <ellipse :cx="v.x + v.w / 2 + 10" :cy="v.y + v.h + 14" :rx="v.w * 0.55" ry="30" fill="url(#h30-soot)" />
      <rect :x="v.x + 3" :y="v.y + 5" :width="v.w" :height="v.h" rx="5" fill="#000" opacity="0.45" />
      <rect :x="v.x" :y="v.y" :width="v.w" :height="v.h" rx="5" fill="url(#h30-fairing)" />
      <rect :x="v.x" :y="v.y" :width="v.w" :height="v.h" rx="5" fill="url(#tx-brushed)" opacity="0.55" style="mix-blend-mode: overlay" />
      <path v-for="x in v.louvers" :key="x" :d="`M ${x} ${v.y + 6} V ${v.y + 10} M ${x} ${v.y + v.h - 10} V ${v.y + v.h - 6}`" stroke="#1a1c1f" stroke-width="2.4" stroke-opacity="0.7" />
      <rect :x="v.x + 1" :y="v.y + 1" :width="v.w - 2" :height="v.h - 2" rx="4" fill="none" stroke="#fff" stroke-width="0.8" stroke-opacity="0.45" />
      <rect :x="v.x + 8" :y="v.y + v.h / 2 - 21" :width="v.w - 16" height="42" rx="21" fill="#060606" />
    </g>

    <!-- domes: a bolted footing ring and its contact shadow -->
    <g v-for="dm in DOMES" :key="`df${dm.p.id}`">
      <ellipse :cx="dm.cx + 6" :cy="dm.base + (dm.down ? 4 : 2)" :rx="dm.w / 2 + 6" ry="12" fill="url(#h30-ao)" />
      <rect :x="dm.x" :y="dm.y" :width="dm.w" height="24" rx="4" fill="url(#h30-fairing)" />
      <rect :x="dm.x" :y="dm.y" :width="dm.w" height="24" rx="4" fill="url(#tx-brushed)" opacity="0.5" style="mix-blend-mode: overlay" />
      <circle v-for="k in 9" :key="k" :cx="dm.x + 8 + ((dm.w - 16) * (k - 1)) / 8" :cy="dm.y + 12" r="1.6" fill="url(#h30-bolt)" />
    </g>

    <!-- the flaps' and mast's roots: an actuator fairing over each hinge, a shadow on the steel -->
    <g v-for="hg in HINGES" :key="`hg${hg.p.id}`">
      <ellipse :cx="hg.cx + 14" :cy="hg.y + 14" :rx="hg.hw + 30" ry="10" fill="url(#h30-ao)" />
      <path :d="hg.d" fill="url(#h30-fairing)" />
      <path :d="hg.d" fill="url(#tx-brushed)" opacity="0.6" style="mix-blend-mode: overlay" />
      <!-- the hinge line: a carbon cover strip -->
      <rect :x="hg.cx - hg.hw + 10" :y="hg.y - 12" :width="hg.hw * 2 - 20" height="9" rx="3" fill="url(#h30-fairingDark)" />
      <path :d="`M ${hg.cx - hg.hw + 8} ${hg.y - hg.ht + 1} H ${hg.cx + hg.hw - 8}`" stroke="#f0f3f5" stroke-width="1.2" stroke-opacity="0.7" />
      <template v-if="hg.flap">
        <!-- the actuator: a piston running up to the pivot -->
        <rect :x="hg.cx - hg.hw * 0.6" :y="hg.y - 8" :width="hg.hw * 0.55" height="6" rx="3" fill="#c3c8cd" />
        <rect :x="hg.cx - hg.hw * 0.6" :y="hg.y - 8" :width="hg.hw * 0.55" height="2" rx="1" fill="#fff" opacity="0.7" />
        <circle :cx="hg.cx" :cy="hg.y - 4" r="9" fill="url(#h30-polish)" />
        <circle :cx="hg.cx" :cy="hg.y - 4" r="3" fill="#121316" />
        <circle v-for="k in 5" :key="k" :cx="hg.cx + hg.hw * 0.15 + k * 10" :cy="hg.y - hg.ht * 0.5" r="1.4" fill="url(#h30-bolt)" />
      </template>
    </g>

    <!-- the RCS bells' pods (where they meet the hull) -->
    <g v-for="b in BELLS.filter((q) => !q.main)" :key="`pod${b.p.id}`">
      <rect v-for="l in b.list" :key="l.key" :x="l.x - l.tw / 2 - 10" :y="b.dy < 0 ? l.y - 16 : l.y - 4" :width="l.tw + 20" height="22" rx="6" fill="url(#h30-fairingDark)" />
      <rect v-for="l in b.list" :key="`h${l.key}`" :x="l.x - l.tw / 2 - 10" :y="b.dy < 0 ? l.y - 16 : l.y - 4" :width="l.tw + 20" height="2" rx="1" fill="#d6dade" opacity="0.6" />
    </g>
    <!-- the main engines' aft skirt: a flared steel shroud over their gimbals, a dark heat shield behind -->
    <g v-for="b in BELLS.filter((q) => q.main)" :key="`ts${b.p.id}`">
      <path :d="`M ${TAIL + 2} ${CY - R} L ${TAIL - 24} ${CY - R + 10} L ${TAIL - 24} ${CY + R - 10} L ${TAIL + 2} ${CY + R} Z`" fill="url(#h30-skirt)" />
      <path :d="`M ${TAIL + 2} ${CY - R} L ${TAIL - 24} ${CY - R + 10} L ${TAIL - 24} ${CY + R - 10} L ${TAIL + 2} ${CY + R} Z`" fill="url(#tx-brushed)" opacity="0.5" style="mix-blend-mode: overlay" />
      <path :d="`M ${TAIL - 24} ${CY - R + 10} L ${TAIL - 24} ${CY + R - 10}`" stroke="#e8ebee" stroke-width="1.4" stroke-opacity="0.6" />
      <path v-for="k in 7" :key="k" :d="`M ${TAIL - 22} ${CY - R + 10 + k * 37} H ${TAIL}`" stroke="#000" stroke-width="1" stroke-opacity="0.4" />
    </g>

    <!-- the windward flaps' hinge fairings, tiled, at the belly -->
    <g v-for="fn in FINS.filter((q) => q.below)" :key="`fh${fn.id}`">
      <path :d="`M ${fn.p.rect[0] - 4} ${fn.ry - 12} C ${fn.p.rect[0] + 10} ${fn.ry + 14} ${fn.p.rect[2] - 10} ${fn.ry + 14} ${fn.p.rect[2] + 10} ${fn.ry - 12} Z`" fill="#0b0c0e" />
      <path :d="`M ${fn.p.rect[0] - 4} ${fn.ry - 12} C ${fn.p.rect[0] + 10} ${fn.ry + 14} ${fn.p.rect[2] - 10} ${fn.ry + 14} ${fn.p.rect[2] + 10} ${fn.ry - 12} Z`" fill="url(#h30-hexSmall)" opacity="0.9" />
      <path :d="`M ${fn.p.rect[0] + 6} ${fn.ry + 4} C ${fn.p.rect[0] + 30} ${fn.ry + 12} ${fn.p.rect[2] - 30} ${fn.ry + 12} ${fn.p.rect[2]} ${fn.ry + 4}`" fill="none" stroke="#7eb6f0" stroke-width="1" stroke-opacity="0.35" />
    </g>
    <!-- the radiator's root -->
    <g v-for="fn in FINS.filter((q) => !q.below)" :key="`fr${fn.id}`">
      <rect :x="fn.p.rect[0] + 20" :y="fn.ry - 10" :width="W(fn.p) - 50" height="16" rx="4" fill="url(#h30-fairing)" />
      <rect :x="fn.p.rect[0] + 20" :y="fn.ry - 10" :width="W(fn.p) - 50" height="2" fill="#fff" opacity="0.7" />
    </g>
    <!-- the dishes' gimbals -->
    <g v-for="ds in DISHES" :key="`dg${ds.p.id}`">
      <rect :x="ds.cx - 14" :y="ds.base - 10" width="28" height="18" rx="4" :fill="ds.base > CY ? 'url(#h30-fairingDark)' : 'url(#h30-fairing)'" />
    </g>

    <!-- ── on the bare steel between: access panels, the crew hatch, flush RCS ports ── -->
    <g v-for="(a, i) in PANELS" :key="`ap${i}`">
      <rect :x="a.x + 1.5" :y="a.y + 2" :width="a.w" :height="a.h" :rx="a.r" fill="#000" opacity="0.28" />
      <rect :x="a.x" :y="a.y" :width="a.w" :height="a.h" :rx="a.r" fill="#fff" opacity="0.05" />
      <rect :x="a.x" :y="a.y" :width="a.w" :height="a.h" :rx="a.r" fill="none" stroke="#111" stroke-width="0.9" stroke-opacity="0.55" />
      <rect :x="a.x + 0.9" :y="a.y + 0.9" :width="a.w" :height="a.h" :rx="a.r" fill="none" stroke="#fff" stroke-width="0.6" stroke-opacity="0.3" />
      <circle v-for="(c, k) in a.screws" :key="k" :cx="c.x" :cy="c.y" r="1.2" fill="url(#h30-bolt)" />
    </g>
    <!-- the crew hatch: a plug door, hinges, a recessed handle, its window -->
    <g>
      <rect :x="HATCH.x + 2" :y="HATCH.y + 3" :width="HATCH.w" :height="HATCH.h" rx="14" fill="#000" opacity="0.35" />
      <rect :x="HATCH.x" :y="HATCH.y" :width="HATCH.w" :height="HATCH.h" rx="14" fill="url(#h30-polish)" opacity="0.35" />
      <rect :x="HATCH.x" :y="HATCH.y" :width="HATCH.w" :height="HATCH.h" rx="14" fill="none" stroke="#0d0e10" stroke-width="1.6" stroke-opacity="0.8" />
      <rect :x="HATCH.x + 1.2" :y="HATCH.y + 1.2" :width="HATCH.w" :height="HATCH.h" rx="14" fill="none" stroke="#fff" stroke-width="0.7" stroke-opacity="0.45" />
      <rect :x="HATCH.x + 14" :y="HATCH.y + 12" :width="HATCH.w - 28" height="22" rx="8" fill="#06080a" />
      <rect :x="HATCH.x + 15" :y="HATCH.y + 13" :width="HATCH.w - 30" height="8" rx="4" fill="url(#h30-warm)" opacity="0.8" />
      <rect :x="HATCH.x + HATCH.w / 2 - 12" :y="HATCH.y + HATCH.h - 30" width="24" height="10" rx="3" fill="#0e0f11" />
      <rect :x="HATCH.x + HATCH.w / 2 - 9" :y="HATCH.y + HATCH.h - 27" width="18" height="3" rx="1.5" fill="#c9ced3" />
      <rect v-for="k in [0, 1]" :key="`hh${k}`" :x="HATCH.x - 4" :y="HATCH.y + 16 + k * (HATCH.h - 44)" width="7" height="12" rx="2" fill="url(#h30-fairing)" />
      <path :d="`M ${HATCH.x + 6} ${HATCH.y + HATCH.h + 8} h ${HATCH.w - 12}`" stroke="#e3a90b" stroke-width="2.4" stroke-dasharray="6 4" opacity="0.85" />
    </g>
    <g v-for="(t, i) in THRUSTERS" :key="`th${i}`">
      <path :d="`M ${t.x} ${t.y} l ${t.sx} ${t.sy} l 6 -2 Z`" fill="url(#h30-soot)" opacity="0.9" />
      <ellipse :cx="t.x + t.sx * 0.5" :cy="t.y + t.sy * 0.5" :rx="Math.abs(t.sx) * 0.55 + 4" :ry="Math.abs(t.sy) * 0.55 + 4" fill="url(#h30-soot)" />
      <rect :x="t.x - 5" :y="t.y - 4" width="10" height="8" rx="1.5" fill="#0a0a0b" />
      <rect :x="t.x - 5" :y="t.y - 4" width="10" height="8" rx="1.5" fill="none" stroke="#9aa0a7" stroke-width="0.7" />
      <rect :x="t.x - 3" :y="t.y - 2" width="6" height="4" fill="#2b1d12" />
    </g>

    <!-- ── stencils, serials, hazard marks (fictional) ── -->
    <g :font-family="FONT" font-weight="700" fill="#15171a">
      <text x="574" :y="CY - 72" font-size="14" letter-spacing="6" opacity="0.6">S-30·07</text>
      <text x="-684" :y="CY - 100" font-size="8" letter-spacing="2.2" opacity="0.6">LOX · CH4</text>
      <text :x="HATCH.x - 2" :y="HATCH.y - 8" font-size="6.5" letter-spacing="1.6" opacity="0.6">CREW HATCH</text>
      <text x="606" :y="CY - 18" font-size="6.5" letter-spacing="1.6" opacity="0.6">DANGER · RCS</text>
      <text x="-292" :y="CY - 30" font-size="6.5" letter-spacing="1.4" opacity="0.55">NO PUSH</text>
    </g>
    <g :font-family="MONO" font-size="4.6" fill="#1b1d20" opacity="0.6">
      <text x="-684" :y="CY - 90">SN 3007-A · RING 02</text>
      <text x="-292" :y="CY - 112">BHD 2 · CH4 / LOX</text>
      <text x="120" :y="CY - 112">BHD 3 · COMMON DOME</text>
      <text x="574" :y="CY - 62">TQ 18 N·m · 3 PL · QA 2031-03</text>
      <text x="120" :y="CY + 4">RING 14 · WELD 14-B</text>
    </g>
    <!-- hazard triangles, an arrow -->
    <path :d="`M 592 ${CY - 26} l 10 0 l -5 -9 Z M -684 ${CY - 120} l 10 0 l -5 -9 Z`" fill="#e3a90b" />
    <path :d="`M 597 ${CY - 32} v 3 M -679 ${CY - 126} v 3`" stroke="#111" stroke-width="1.1" />
    <path :d="`M ${HATCH.x + HATCH.w + 8} ${HATCH.y + 50} l 12 0 l 0 -3 l 6 5 l -6 5 l 0 -3 l -12 0 Z`" fill="#15171a" opacity="0.5" />
    <!-- the umbilical plate and fill couplings, aft -->
    <rect x="-684" :y="CY - 76" width="62" height="28" rx="3" fill="url(#h30-fairingDark)" />
    <rect x="-684" :y="CY - 76" width="62" height="2" fill="#c9ced3" opacity="0.5" />
    <circle v-for="k in 3" :key="`u${k}`" :cx="-684 + k * 15.5" :cy="CY - 62" r="5.5" fill="url(#h30-polish)" />
    <circle v-for="k in 3" :key="`uu${k}`" :cx="-684 + k * 15.5" :cy="CY - 62" r="2.2" fill="#0a0a0b" />
    <!-- nav lights: red to port (aft-top), green below, a white strobe at the nose -->
    <circle :cx="TAIL + 34" :cy="CY - R + 18" r="2.6" fill="#ff3b30" />
    <circle :cx="TAIL + 34" :cy="CY - R + 18" r="9" fill="#ff3b30" opacity="0.18" />
    <circle :cx="TAIL + 34" :cy="CY + R - 20" r="2.6" fill="#30ff7a" />
    <circle :cx="TAIL + 34" :cy="CY + R - 20" r="9" fill="#30ff7a" opacity="0.15" />
    <circle :cx="TIP - 26" :cy="CY - 4" r="2" fill="#fff" />
    <circle :cx="TIP - 26" :cy="CY - 4" r="8" fill="#fff" opacity="0.2" />
  </g>
</template>
