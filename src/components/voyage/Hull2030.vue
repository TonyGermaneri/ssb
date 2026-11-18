<script setup lang="ts">
import type { Era } from '../../lib/voyage/ship'

/**
 * The THIRTIES ship's hull (lib/voyage/eras/e2030.ts): a stainless-steel, fully reusable super-heavy ship lying on its
 * side, nose to the right -- a long steel cylinder and an ogive nose, shaded in bands that follow the surface into the
 * nose (lit from the sun at the upper left, the Earth's blue in the lower steel), welded rings, black hexagonal tiles
 * on the windward belly, a chine along each side, the belly flaps, the aft skirt. Static; the parts are drawn round it.
 */
const props = defineProps<{ era: Era }>()
const P = props.era.palettes
const ink = props.era.ink

const CY = -20
const R = 145
const TAIL = -695
const NOSE0 = 420
const TIP = 800
const LN = TIP - NOSE0
const RHO = (R * R + LN * LN) / (2 * R)
/** the hull's half-height at x: a cylinder, then a tangent ogive */
function h(x: number) {
  if (x <= NOSE0) return R
  const s = Math.min(LN, x - NOSE0)
  return Math.max(0, Math.sqrt(RHO * RHO - s * s) - (RHO - R))
}
const f = (v: number) => v.toFixed(1)
const XS = [TAIL, NOSE0, ...Array.from({ length: 18 }, (_, i) => NOSE0 + ((i + 1) / 18) * (LN - 6))]
/** a line of constant angle along the hull (k = sin of it: -1 the top, 1 the bottom), into the nose */
const line = (k: number, xs = XS) => xs.map((x) => `${f(x)} ${f(CY + h(x) * k)}`)
function band(k0: number, k1: number, xs = XS) {
  return `M ${line(k0, xs).join(' L ')} L ${line(k1, xs).reverse().join(' L ')} Z`
}
const HULL = `M ${TAIL} ${CY - R + 6} L ${TAIL + 6} ${CY - R} ${XS.slice(1)
  .map((x) => `L ${f(x)} ${f(CY - h(x))}`)
  .join(' ')} Q ${TIP + 2} ${CY} ${f(XS[XS.length - 1])} ${f(CY + h(XS[XS.length - 1]))} ${XS.slice(1)
  .reverse()
  .map((x) => `L ${f(x)} ${f(CY + h(x))}`)
  .join(' ')} L ${TAIL + 6} ${CY + R} L ${TAIL} ${CY + R - 6} Z`

// ── the light: the sun up and to the left, black space above, the Earth's blue below ──
const L = (() => {
  const v = [-0.4, -0.62, 0.68]
  const n = Math.hypot(...v)
  return v.map((c) => c / n)
})()
const HV = (() => {
  const v = [L[0], L[1], L[2] + 1]
  const n = Math.hypot(...v)
  return v.map((c) => c / n)
})()
const hex = (c: number[]) => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')
function shade(th: number, tile: boolean) {
  const ny = Math.sin(th)
  const nz = Math.cos(th)
  const dif = Math.max(0, L[1] * ny + L[2] * nz)
  const nh = Math.max(0, HV[1] * ny + HV[2] * nz)
  const ry = 2 * nz * ny
  const earth = Math.max(0, ry) ** 1.5
  if (tile) {
    const s = 0.035 + dif * 0.07 + nh ** 18 * 0.12 + earth * 0.05
    return hex([s * 0.95, s, s * 1.08 + earth * 0.03])
  }
  const base = [0.58, 0.6, 0.625]
  const spec = nh ** 34 * 0.95 + nh ** 6 * 0.18
  const space = Math.max(0, -ry) ** 2
  return hex(base.map((b, i) => b * (0.1 + dif * 0.66) * (1 - space * 0.35) + spec * [1, 0.985, 0.95][i] + earth * [0.05, 0.13, 0.26][i]))
}
/** where the heat shield starts (an angle below the side) */
const TB = 0.12
const NB = 48
const bands = Array.from({ length: NB }, (_, i) => {
  const t0 = -Math.PI / 2 + (i / NB) * Math.PI
  const t1 = -Math.PI / 2 + ((i + 1) / NB) * Math.PI
  const tm = (t0 + t1) / 2
  return { d: band(Math.sin(t0), Math.sin(t1) + 0.004), steel: shade(tm, false), tile: shade(tm, true), t0, t1 }
})
const tileTop = Math.sin(TB)
const TILES = band(tileTop, 1)
/** the tiles' ragged top edge: a row of hexes' teeth */
const TEETH = (() => {
  const xs: number[] = []
  for (let x = TAIL + 8; x < TIP - 40; x += 11) xs.push(x)
  let d = `M ${xs[0]} ${f(CY + h(xs[0]) * tileTop)}`
  xs.forEach((x, i) => (d += ` L ${f(x)} ${f(CY + h(x) * tileTop - (i % 2 ? 4 : 0))}`))
  return d
})()

// ── welds: the rings, every 58, and round the nose ──
const RINGS = Array.from({ length: 23 }, (_, i) => TAIL + 30 + i * 58).filter((x) => x < TIP - 50)
const ringPanels = RINGS.slice(0, -1).map((x, i) => ({ x, w: RINGS[i + 1] - x, o: [0.05, 0.0, 0.07, 0.02, 0.04, 0.08, 0.01][i % 7] }))
const SECTION_X = [232, -292]
/** a stringer weld along the side, and the chine above the tiles */
const STRINGER = `M ${line(-0.62, [TAIL + 4, NOSE0, NOSE0 + 120, NOSE0 + 240]).join(' L ')}`
const CHINE_XS = [-430, -200, 100, NOSE0, NOSE0 + 60, NOSE0 + 130]
const CHINE = band(tileTop - 0.06, tileTop - 0.005, CHINE_XS)
const CHINE_LINE = `M ${line(tileTop - 0.06, CHINE_XS).join(' L ')}`

// ── the belly flaps (the windward ones, tiled); the leeward pair are parts ──
const FLAPS = [
  'M 458 118 L 606 92 L 582 286 Q 536 302 490 292 Z',
  'M -588 118 L -422 118 L -450 312 Q -505 328 -560 312 Z',
]
/** each flap's leading edge, steel */
const EDGES = ['M 606 92 L 582 286', 'M -422 118 L -450 312']
const HINGES = [
  'M 450 122 C 480 104 590 88 614 94 L 612 110 C 586 108 486 120 456 136 Z',
  'M -598 118 C -560 104 -450 104 -412 118 L -414 134 C -456 124 -556 124 -594 134 Z',
  'M 452 -160 C 486 -176 588 -164 614 -144 L 608 -130 C 580 -146 490 -152 458 -144 Z',
  'M -598 -162 C -560 -180 -450 -180 -412 -162 L -416 -146 C -456 -162 -556 -162 -594 -146 Z',
]
/** the tone parts' solar arrays: their fin's resting outline (VoyageShip's finPath at mid 0), for the cells over it */
function finRest(rect: [number, number, number, number], variant: string) {
  const [x0, y0, x1, y1] = rect
  if (variant === 'tail') return `M ${x1 - 8} ${y0} L ${x0 + 60} ${y0 + 10} C ${x0 + 20} ${y0 + 60} ${x0} ${y1 - 30} ${x0 + 10} ${y1} L ${x1 - 60} ${y1 - 30} C ${x1 - 30} ${y1 - 80} ${x1 - 10} ${y0 + 60} ${x1 - 8} ${y0} Z`
  return `M ${x0} ${y0} H ${x1} V ${y1} H ${x0} Z`
}
const ARRAYS = props.era.parts
  .filter((p) => p.kind === 'tone')
  .map((p) => ({
    id: p.id.replace(':', '-'),
    d: finRest(p.rect, p.variant),
    t: p.flip === 'y' ? `translate(0 ${p.rect[1] + p.rect[3]}) scale(1 -1)` : p.flip === 'x' ? `translate(${p.rect[0] + p.rect[2]} 0) scale(-1 1)` : '',
    x: p.rect[0],
    y: p.rect[1],
    w: p.rect[2] - p.rect[0],
    h: p.rect[3] - p.rect[1],
  }))
/** the pitch parts' bells (VoyageShip's bells()), for the steel and soot over their stripes */
const BELLS = props.era.parts
  .filter((p) => p.form === 'funnel' && p.variant === 'bells')
  .flatMap((p) => {
    const [x0, y0, x1, y1] = p.rect
    const n = Math.max(1, p.n)
    const dx = Math.cos((p.dir * Math.PI) / 180)
    const dy = Math.sin((p.dir * Math.PI) / 180)
    const vertical = Math.abs(dy) >= Math.abs(dx)
    const across = vertical ? x1 - x0 : y1 - y0
    const len = (vertical ? y1 - y0 : x1 - x0) - 6
    const slot = across / n
    return N(n).map((i) => {
      const c = slot * (i + 0.5)
      const x = vertical ? x0 + c : dx > 0 ? x0 : x1
      const y = vertical ? (dy > 0 ? y0 : y1) : y0 + c
      const tw = slot * 0.42
      const mw = slot * 0.92
      return {
        key: `${p.id}-${i}`,
        t: `translate(${x} ${y}) rotate(${p.dir - 90})`,
        d: `M ${-tw / 2} 0 C ${-tw / 2} ${len * 0.5} ${-mw / 2} ${len * 0.7} ${-mw / 2} ${len} L ${mw / 2} ${len} C ${mw / 2} ${len * 0.7} ${tw / 2} ${len * 0.5} ${tw / 2} 0 Z`,
        L: len,
        mw,
      }
    })
  })
function N(n: number) {
  return Array.from({ length: n }, (_, i) => i)
}
</script>

<template>
  <g class="hull">
    <defs>
      <clipPath id="vy-2030-hull"><path :d="HULL" /></clipPath>
      <clipPath id="vy-2030-tiles"><path :d="TILES" /></clipPath>
      <pattern id="vy-2030-hex" patternUnits="userSpaceOnUse" width="18" height="10.392">
        <path d="M 0 5.196 L 3 0 L 9 0 L 12 5.196 L 9 10.392 L 3 10.392 Z M 12 5.196 L 18 5.196" fill="none" stroke="#000" stroke-width="1.1" stroke-opacity="0.75" />
        <path d="M 3.6 1 L 8.4 1" stroke="#fff" stroke-width="0.6" stroke-opacity="0.09" />
        <path d="M 12.6 6.2 L 17.4 6.2" stroke="#fff" stroke-width="0.6" stroke-opacity="0.07" />
      </pattern>
      <pattern id="vy-2030-hexFlap" patternUnits="userSpaceOnUse" width="18" height="10.392">
        <rect width="18" height="10.392" fill="#16171a" />
        <path d="M 0 5.196 L 3 0 L 9 0 L 12 5.196 L 9 10.392 L 3 10.392 Z M 12 5.196 L 18 5.196" fill="none" stroke="#000" stroke-width="1.1" stroke-opacity="0.8" />
        <path d="M 3.6 1 L 8.4 1" stroke="#fff" stroke-width="0.6" stroke-opacity="0.12" />
      </pattern>
      <linearGradient id="vy-2030-flapShade" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#9fb8d8" stop-opacity="0.16" />
        <stop offset="0.5" stop-color="#000" stop-opacity="0" />
        <stop offset="1" stop-color="#000" stop-opacity="0.45" />
      </linearGradient>
      <linearGradient id="vy-2030-skirt" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#050506" />
        <stop offset="0.6" stop-color="#2a2c30" />
        <stop offset="1" stop-color="#000" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="vy-2030-sunEdge" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity="0.85" />
        <stop offset="0.55" stop-color="#fff" stop-opacity="0.35" />
        <stop offset="1" stop-color="#fff" stop-opacity="0.05" />
      </linearGradient>
      <linearGradient id="vy-2030-bell" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#000" stop-opacity="0.6" />
        <stop offset="0.28" stop-color="#fff" stop-opacity="0.4" />
        <stop offset="0.42" stop-color="#fff" stop-opacity="0.05" />
        <stop offset="0.8" stop-color="#000" stop-opacity="0.3" />
        <stop offset="1" stop-color="#000" stop-opacity="0.65" />
      </linearGradient>
      <linearGradient id="vy-2030-earthshine" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4da6ff" stop-opacity="0" />
        <stop offset="1" stop-color="#6fb8ff" stop-opacity="0.22" />
      </linearGradient>
      <pattern id="vy-2030-cells" patternUnits="userSpaceOnUse" width="14" height="14">
        <path d="M 0 0.5 H 14 M 0.5 0 V 14" stroke="#c8d0da" stroke-width="0.9" stroke-opacity="0.55" />
        <path d="M 7 0 V 14" stroke="#000" stroke-width="0.5" stroke-opacity="0.35" />
      </pattern>
      <linearGradient id="vy-2030-arrSheen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.28" />
        <stop offset="0.4" stop-color="#fff" stop-opacity="0" />
        <stop offset="1" stop-color="#000" stop-opacity="0.3" />
      </linearGradient>
      <radialGradient id="vy-2030-light">
        <stop offset="0" stop-color="#fff" stop-opacity="1" />
        <stop offset="0.25" stop-color="#fff" stop-opacity="0.5" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </radialGradient>
    </defs>

    <!-- the bells: steel, soot and heat tint over their cooling bands -->
    <g v-for="b in BELLS" :key="b.key" :transform="b.t">
      <path :d="b.d" fill="#2a1d16" opacity="0.38" />
      <path :d="b.d" fill="url(#vy-2030-bell)" />
      <ellipse cx="0" :cy="b.L" :rx="b.mw / 2" :ry="Math.max(4, b.mw * 0.14)" fill="#000" opacity="0.45" />
    </g>

    <!-- the solar arrays: cells and a frame over the tone parts' panels (their colour shows through, dimmed) -->
    <g v-for="a in ARRAYS" :key="a.id">
      <clipPath :id="`vy-2030-arr-${a.id}`"><path :d="a.d" :transform="a.t" /></clipPath>
      <g :clip-path="`url(#vy-2030-arr-${a.id})`">
        <rect :x="a.x - 4" :y="a.y - 4" :width="a.w + 8" :height="a.h + 8" fill="#050b1c" opacity="0.5" />
        <rect :x="a.x - 4" :y="a.y - 4" :width="a.w + 8" :height="a.h + 8" fill="url(#vy-2030-cells)" />
        <rect :x="a.x - 4" :y="a.y - 4" :width="a.w + 8" :height="a.h + 8" fill="url(#vy-2030-arrSheen)" />
      </g>
      <path :d="a.d" :transform="a.t" fill="none" stroke="#c3c8ce" stroke-width="2.5" stroke-linejoin="round" />
    </g>

    <!-- the windward flaps, under the belly -->
    <g v-for="(d, i) in FLAPS" :key="`f${i}`">
      <path :d="d" fill="url(#vy-2030-hexFlap)" />
      <path :d="d" fill="url(#vy-2030-flapShade)" />
      <path :d="d" fill="url(#vy-2030-earthshine)" />
      <path :d="EDGES[i]" fill="none" stroke="#b9bfc5" stroke-width="5" stroke-linecap="round" />
      <path :d="EDGES[i]" fill="none" stroke="#fff" stroke-width="1.2" stroke-opacity="0.6" stroke-linecap="round" />
      <path :d="d" fill="none" :stroke="ink" stroke-width="1.2" stroke-linejoin="round" />
    </g>

    <g clip-path="url(#vy-2030-hull)">
      <!-- the steel, band by band -->
      <path v-for="(b, i) in bands" :key="`s${i}`" :d="b.d" :fill="b.steel" />
      <!-- ring to ring, the steel's sheets differ a little -->
      <rect v-for="(r, i) in ringPanels" :key="`p${i}`" :x="r.x" :y="CY - R" :width="r.w" :height="2 * R" :fill="i % 2 ? '#000' : '#fff'" :opacity="r.o" />
      <!-- brushed streaks -->
      <path v-for="k in N(14)" :key="`b${k}`" :d="`M ${line(-0.95 + k * 0.075).join(' L ')}`" fill="none" :stroke="k % 3 ? '#fff' : '#000'" stroke-width="0.6" :stroke-opacity="k % 3 ? 0.07 : 0.1" />
      <!-- welds -->
      <g v-for="x in RINGS" :key="`w${x}`">
        <path :d="`M ${x} ${CY - R - 4} V ${CY + R + 4}`" stroke="#000" stroke-width="1.1" stroke-opacity="0.38" />
        <path :d="`M ${x + 1.6} ${CY - R - 4} V ${CY + R + 4}`" stroke="#fff" stroke-width="0.8" stroke-opacity="0.22" />
      </g>
      <path :d="STRINGER" fill="none" stroke="#000" stroke-width="0.9" stroke-opacity="0.25" />
      <!-- the section joints: heavier welds, the tank domes behind them -->
      <g v-for="x in SECTION_X" :key="`j${x}`">
        <path :d="`M ${x - 3} ${CY - R - 4} V ${CY + R + 4}`" stroke="#000" stroke-width="3" stroke-opacity="0.4" />
        <path :d="`M ${x + 1} ${CY - R - 4} V ${CY + R + 4}`" stroke="#fff" stroke-width="1.2" stroke-opacity="0.35" />
        <circle v-for="k in N(9)" :key="k" :cx="x - 9" :cy="CY - 128 + k * 18" r="1.4" fill="#000" opacity="0.35" />
      </g>
      <!-- the heat shield: black hex tiles, shaded with the hull -->
      <g clip-path="url(#vy-2030-tiles)">
        <path v-for="(b, i) in bands" :key="`t${i}`" :d="b.d" :fill="b.tile" />
        <rect :x="TAIL" :y="CY - R" :width="TIP - TAIL" :height="2 * R" fill="url(#vy-2030-hex)" />
        <rect :x="TAIL" :y="CY" :width="TIP - TAIL" :height="R" fill="url(#vy-2030-earthshine)" />
        <!-- a few tiles swapped, a shade off -->
        <path d="M 120 52 l 3 -5.2 h 6 l 3 5.2 l -3 5.2 h -6 Z M -380 70 l 3 -5.2 h 6 l 3 5.2 l -3 5.2 h -6 Z M 330 30 l 3 -5.2 h 6 l 3 5.2 l -3 5.2 h -6 Z M -150 98 l 3 -5.2 h 6 l 3 5.2 l -3 5.2 h -6 Z" fill="#3a3c40" opacity="0.7" />
      </g>
      <path :d="TEETH" fill="none" stroke="#111215" stroke-width="5" stroke-linejoin="bevel" />
      <!-- the chine: a lip along the side, over the tiles' edge -->
      <path :d="CHINE" fill="#8c9197" />
      <path :d="CHINE_LINE" fill="none" stroke="#e8ecef" stroke-width="1.1" stroke-opacity="0.7" />
      <!-- the aft skirt -->
      <rect :x="TAIL" :y="CY - R" width="34" :height="2 * R" fill="url(#vy-2030-skirt)" />
      <path :d="`M ${TAIL + 30} ${CY - R} V ${CY + R}`" stroke="#000" stroke-width="2" stroke-opacity="0.5" />
      <!-- the top edge catching the sun, the belly falling into shadow -->
      <path :d="band(-1, -0.985)" fill="url(#vy-2030-sunEdge)" />
      <path :d="band(0.9, 1)" fill="#000" opacity="0.35" />
    </g>

    <!-- the flaps' hinge fairings -->
    <path v-for="(d, i) in HINGES" :key="`h${i}`" :d="d" :fill="i < 2 ? '#2a2c30' : '#a7adb3'" :stroke="ink" stroke-width="0.8" stroke-linejoin="round" />

    <path :d="HULL" fill="none" :stroke="ink" stroke-width="1.4" stroke-linejoin="round" />

    <!-- the payload bay's door frame, a hatch, the markings -->
    <rect x="-182" y="-142" width="344" height="139" rx="6" fill="none" stroke="#000" stroke-width="1.4" stroke-opacity="0.45" />
    <rect x="-180" y="-140" width="340" height="135" rx="5" fill="none" stroke="#fff" stroke-width="0.8" stroke-opacity="0.35" />
    <g font-family="'Helvetica Neue', 'Avenir Next', system-ui, sans-serif" font-weight="700" fill="#15171a">
      <text x="556" y="-64" font-size="13" letter-spacing="4" opacity="0.8">SSB · 30</text>
      <text x="-555" y="-133" font-size="9" letter-spacing="2.5" opacity="0.6">LOX · CH4 · S30</text>
      <text x="-540" y="114" font-size="8" letter-spacing="2" opacity="0.5">DANGER · VENT</text>
    </g>
    <path d="M 560 -36 l 10 0 l -5 -9 Z M -600 -2 l 10 0 l -5 -9 Z" fill="#e8b10a" stroke="#15171a" stroke-width="0.7" />
    <!-- the section's status lights, one hue each -->
    <g v-for="(l, i) in [{ x: 700, y: -30 }, { x: 196, y: -150 }, { x: -640, y: -60 }]" :key="`l${i}`">
      <circle :cx="l.x" :cy="l.y" r="12" fill="url(#vy-2030-light)" opacity="0.55" />
      <circle :cx="l.x" :cy="l.y" r="12" :fill="P[i].glow" opacity="0.25" />
      <circle :cx="l.x" :cy="l.y" r="3" :fill="P[i].hi" :stroke="P[i].alt" stroke-width="1.5" />
    </g>
    <!-- nav lights -->
    <circle cx="-676" cy="-160" r="14" fill="url(#vy-2030-light)" opacity="0.5" />
    <circle cx="-676" cy="-160" r="3" fill="#ff3b30" />
    <circle cx="-676" cy="120" r="3" fill="#30ff7a" />
  </g>
</template>
