<script setup lang="ts">
import type { Era } from '../../lib/voyage/ship'

/**
 * The SIXTIES ship's hull (lib/voyage/eras/e1960.ts): the DREAMBOAT, the eye-ship. A plump sub lacquered in op-art
 * bands of candy colour rippling out from the EYE on its flank (screenprinted, a little off-register, flaked and
 * glossed like a hard candy), the eye's rainbow lids and pearly corners round MIDSHIPS' window, lashes fanning up off
 * the top lid in a crest, diamonds at the corners, chrome ribbons studded with jelly beads between the sections,
 * mandalas turning behind the airscrews and the kaleidoscope, daisies breathing. The parts are drawn around it (their
 * bezels in Overlay1960).
 */
const props = defineProps<{ era: Era }>()
const ink = props.era.ink
const N = (n: number) => Array.from({ length: n }, (_, i) => i)
const f = (n: number) => n.toFixed(1)

const HULL = 'M -704 20 C -694 -124 -470 -204 -170 -208 L 380 -202 C 612 -192 764 -110 804 10 C 764 132 612 202 380 212 L -170 216 C -470 212 -694 164 -704 20 Z'
const BANDS = ['#ff2e88', '#ff7a1a', '#ffd21f', '#a6ff2e', '#2fe0c4', '#7a3cff', '#ff3df0']

/** the eye, scaled about its centre (s = 1: the window's lids) -- the cockpit's eye60 proportions */
const EX = 40
const EY = -75
const HW = 295
const K = HW / 570
function eye(s: number) {
  const a = 570 * K * s
  const b = 370 * K * s
  const t = 222 * K * s
  const u = 200 * K * s
  return `M ${f(EX - a)} ${EY} C ${f(EX - b)} ${f(EY - t)} ${f(EX + b)} ${f(EY - t)} ${f(EX + a)} ${EY} C ${f(EX + b)} ${f(EY + u)} ${f(EX - b)} ${f(EY + u)} ${f(EX - a)} ${EY} Z`
}
const NB = 11
const scales = N(NB).map((i) => 1.1 * Math.pow(3.7 / 1.1, (NB - 1 - i) / (NB - 1)))
const bands = scales.map((s, i) => ({ d: eye(s), c: BANDS[i % BANDS.length], c2: BANDS[(i + 3) % BANDS.length] }))

/** the top lid at scale s: point and outward normal at t */
function lid(s: number, t: number) {
  const a = 570 * K * s
  const b = 370 * K * s
  const h = 222 * K * s
  const P = [
    [EX - a, EY],
    [EX - b, EY - h],
    [EX + b, EY - h],
    [EX + a, EY],
  ]
  const u = 1 - t
  const x = u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0]
  const y = u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1]
  const dx = 3 * u * u * (P[1][0] - P[0][0]) + 6 * u * t * (P[2][0] - P[1][0]) + 3 * t * t * (P[3][0] - P[2][0])
  const dy = 3 * u * u * (P[1][1] - P[0][1]) + 6 * u * t * (P[2][1] - P[1][1]) + 3 * t * t * (P[3][1] - P[2][1])
  const l = Math.hypot(dx, dy)
  return { x, y, tx: dx / l, ty: dy / l, nx: dy / l, ny: -dx / l }
}
function lash(t: number, len: number, w: number, s: number) {
  const p = lid(s, t)
  const side = t < 0.5 ? -1 : 1
  const bend = (Math.abs(t - 0.5) * 2 + 0.25) * len * 0.5 * side
  const tip = { x: p.x + p.nx * len + p.tx * bend, y: p.y + p.ny * len + p.ty * bend }
  const bl = { x: p.x - p.tx * w, y: p.y - p.ty * w }
  const br = { x: p.x + p.tx * w, y: p.y + p.ty * w }
  const c1 = { x: bl.x + p.nx * len * 0.6 + p.tx * bend * 0.2, y: bl.y + p.ny * len * 0.6 + p.ty * bend * 0.2 }
  const c2 = { x: br.x + p.nx * len * 0.6 + p.tx * bend * 0.35, y: br.y + p.ny * len * 0.6 + p.ty * bend * 0.35 }
  return {
    d: `M ${f(bl.x)} ${f(bl.y)} Q ${f(c1.x)} ${f(c1.y)} ${f(tip.x)} ${f(tip.y)} Q ${f(c2.x)} ${f(c2.y)} ${f(br.x)} ${f(br.y)} Z`,
    hi: `M ${f(p.x)} ${f(p.y)} Q ${f((c1.x + c2.x) / 2)} ${f((c1.y + c2.y) / 2)} ${f(tip.x)} ${f(tip.y)}`,
  }
}
const lashes = N(15).map((i) => {
  const t = 0.24 + (i / 14) * 0.52
  const mid = 1 - Math.abs(t - 0.5) * 2
  return { ...lash(t, 50 + mid * 70, 8 + mid * 5, 1.1), c: BANDS[i % BANDS.length], i }
})
/** the lid's sweep for its rainbow rim */
const LID = eye(1.04)
const SOCKET = eye(1.18)

/** a mandala: rings of petals */
function petalRing(n: number, r0: number, r1: number, w: number) {
  return N(n).map((i) => ({ d: `M 0 ${-r0} C ${w} ${-(r0 + r1) / 2} ${w * 0.6} ${-r1} 0 ${-r1} C ${-w * 0.6} ${-r1} ${-w} ${-(r0 + r1) / 2} 0 ${-r0} Z`, a: (i / n) * 360 }))
}
const mandalas = [
  {
    x: 750,
    y: 0,
    spin: 40,
    rings: [
      { petals: petalRing(16, 44, 78, 11), c: '#ff2e88' },
      { petals: petalRing(10, 24, 56, 12), c: '#ffd21f' },
    ],
  },
  {
    x: -760,
    y: 20,
    spin: -50,
    rings: [
      { petals: petalRing(16, 44, 80, 11), c: '#7a3cff' },
      { petals: petalRing(10, 24, 58, 12), c: '#ff7a1a' },
    ],
  },
  {
    x: -170,
    y: 140,
    spin: 70,
    rings: [
      { petals: petalRing(20, 70, 100, 9), c: '#ff3df0' },
      { petals: petalRing(12, 50, 84, 11), c: '#a6ff2e' },
    ],
  },
]
const daisies = [
  { x: -662, y: -24, r: 15, core: '#ff7a1a', d: 0 },
  { x: 300, y: -165, r: 15, core: '#ff2e88', d: 0.9 },
  { x: 640, y: 104, r: 13, core: '#7a3cff', d: 1.6 },
  { x: -36, y: 150, r: 14, core: '#ffd21f', d: 2.2 },
  { x: -286, y: 172, r: 13, core: '#2fe0c4', d: 0.4 },
  { x: -345, y: -125, r: 12, core: '#ff3df0', d: 1.2 },
]
const petals8 = N(8).map((k) => k * 45)
const gems = [
  { x: EX - HW - 15, y: EY, s: 1, d: 0 },
  { x: EX + HW + 15, y: EY, s: 1, d: 1.4 },
  { x: -770, y: -170, s: 0.8, d: 2.1 },
  { x: 560, y: -360, s: 0.7, d: 3.3 },
  { x: 160, y: -300, s: 0.6, d: 0.7 },
]
/** chrome ribbons between the sections, beaded with jelly lamps */
const SEAMS = [-306, 376]
const BEAD_C = ['#ff2e88', '#ffd21f', '#2fe0c4', '#ff7a1a', '#7a3cff']
/** button candy along the belly, just inside the outline: the lower curve, sampled */
function belly(t: number) {
  // the hull's lower edge from the nose (t = 0) to the stern (t = 1): its two cubics
  const seg = t < 0.45 ? [[804, 10], [764, 132], [612, 202], [380, 212]] : [[-170, 216], [-470, 212], [-694, 164], [-704, 20]]
  const u = t < 0.45 ? t / 0.45 : (t - 0.45) / 0.55
  const v = 1 - u
  const P = seg
  return { x: v * v * v * P[0][0] + 3 * v * v * u * P[1][0] + 3 * v * u * u * P[2][0] + u * u * u * P[3][0], y: v * v * v * P[0][1] + 3 * v * v * u * P[1][1] + 3 * v * u * u * P[2][1] + u * u * u * P[3][1] }
}
const buttons = [...N(9).map((i) => belly(0.12 + i * 0.035)), ...N(11).map((i) => ({ x: 360 - i * 50, y: 212 })), ...N(8).map((i) => belly(0.5 + i * 0.05))].map((p, i) => ({ x: p.x, y: p.y - 16, c: BEAD_C[i % BEAD_C.length] }))
</script>

<template>
  <g class="hull h60">
    <defs>
      <clipPath id="h60-hull"><path :d="HULL" /></clipPath>
      <linearGradient id="h60-vol" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.4" />
        <stop offset="0.12" stop-color="#fff" stop-opacity="0.08" />
        <stop offset="0.4" stop-color="#fff" stop-opacity="0" />
        <stop offset="0.7" stop-color="#241036" stop-opacity="0.3" />
        <stop offset="1" stop-color="#12001f" stop-opacity="0.85" />
      </linearGradient>
      <linearGradient id="h60-horizon" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.7" />
        <stop offset="0.36" stop-color="#fff" stop-opacity="0.35" />
        <stop offset="0.37" stop-color="#000" stop-opacity="0.15" />
        <stop offset="1" stop-color="#000" stop-opacity="0.5" />
      </linearGradient>
      <pattern id="h60-dots" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(30)">
        <circle cx="4.5" cy="4.5" r="2.2" fill="#3b0a4f" />
      </pattern>
      <linearGradient id="h60-lowG" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.5" stop-color="#000" />
        <stop offset="1" stop-color="#fff" />
      </linearGradient>
      <mask id="h60-low" maskContentUnits="userSpaceOnUse">
        <rect x="-720" y="-220" width="1540" height="450" fill="url(#h60-lowG)" />
      </mask>
      <linearGradient id="h60-ends" x1="-704" y1="0" x2="804" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#12001f" stop-opacity="0.65" />
        <stop offset="0.18" stop-color="#12001f" stop-opacity="0" />
        <stop offset="0.85" stop-color="#12001f" stop-opacity="0" />
        <stop offset="1" stop-color="#12001f" stop-opacity="0.55" />
      </linearGradient>
      <linearGradient id="h60-iri" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ff3df0" />
        <stop offset="0.25" stop-color="#ffd21f" />
        <stop offset="0.5" stop-color="#2fe0c4" />
        <stop offset="0.75" stop-color="#7a3cff" />
        <stop offset="1" stop-color="#ff2e88" />
      </linearGradient>
      <linearGradient id="h60-lid" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ff3df0" />
        <stop offset="0.3" stop-color="#ff2e88" />
        <stop offset="0.5" stop-color="#ffd21f" />
        <stop offset="0.7" stop-color="#2fe0c4" />
        <stop offset="1" stop-color="#7a3cff" />
      </linearGradient>
      <linearGradient id="h60-lash" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#241036" />
        <stop offset="0.45" stop-color="#3b0a4f" stop-opacity="0.6" />
        <stop offset="1" stop-color="#3b0a4f" stop-opacity="0" />
      </linearGradient>
      <radialGradient id="h60-sclera" cx="0.5" cy="0.4" r="0.6">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.6" stop-color="#ffe3f6" />
        <stop offset="1" stop-color="#c7a0ff" />
      </radialGradient>
      <radialGradient id="h60-gem" cx="0.35" cy="0.3" r="0.9">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.4" stop-color="#bff8ff" />
        <stop offset="1" stop-color="#7a3cff" />
      </radialGradient>
      <linearGradient id="h60-chrome" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#4a1a66" />
        <stop offset="0.35" stop-color="#e9a0f5" />
        <stop offset="0.5" stop-color="#fff2ff" />
        <stop offset="0.7" stop-color="#b45ad0" />
        <stop offset="1" stop-color="#3b0a4f" />
      </linearGradient>
      <radialGradient id="h60-bead" cx="0.35" cy="0.3" r="0.75">
        <stop offset="0" stop-color="#fff" stop-opacity="0.95" />
        <stop offset="0.35" stop-color="#fff" stop-opacity="0.15" />
        <stop offset="1" stop-color="#000" stop-opacity="0.35" />
      </radialGradient>
      <linearGradient id="h60-spec" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.85" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </linearGradient>
      <radialGradient id="h60-socket" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0.7" stop-color="#12001f" stop-opacity="0.6" />
        <stop offset="1" stop-color="#12001f" stop-opacity="0" />
      </radialGradient>
    </defs>

    <!-- the mandalas behind the airscrews and the kaleidoscope, turning -->
    <g v-for="(m, i) in mandalas" :key="`m${i}`" :transform="`translate(${m.x} ${m.y})`">
      <g class="spin" :style="{ animationDuration: `${Math.abs(m.spin)}s`, animationDirection: m.spin < 0 ? 'reverse' : 'normal' }">
        <g v-for="(r, k) in m.rings" :key="k">
          <path v-for="(p, j) in r.petals" :key="j" :d="p.d" :transform="`rotate(${p.a})`" :fill="r.c" :stroke="ink" stroke-width="2" />
        </g>
        <path v-for="(p, j) in m.rings[0].petals" :key="`h${j}`" :d="p.d" :transform="`rotate(${p.a}) scale(0.55 0.9)`" fill="#fff" opacity="0.25" />
      </g>
    </g>

    <!-- the hull: op-art bands rippling out from the eye -->
    <path :d="HULL" :fill="BANDS[0]" />
    <g clip-path="url(#h60-hull)">
      <g v-for="(b, i) in bands" :key="`b${i}`">
        <path :d="b.d" :fill="b.c" />
        <path :d="b.d" fill="none" :stroke="b.c2" stroke-width="3" opacity="0.55" transform="translate(4 3)" />
        <path :d="b.d" fill="none" :stroke="ink" stroke-width="2.2" opacity="0.7" />
      </g>
      <!-- candy lacquer: flake, a sheen of every colour, its volume, the ends rolling away -->
      <rect x="-720" y="-220" width="1540" height="450" fill="url(#tx-speckle)" opacity="0.14" style="mix-blend-mode: screen" />
      <rect x="-720" y="-220" width="1540" height="450" fill="url(#tx-noise)" opacity="0.22" style="mix-blend-mode: overlay" />
      <rect x="-720" y="-220" width="1540" height="450" fill="url(#h60-iri)" opacity="0.16" style="mix-blend-mode: overlay" />
      <!-- the lacquer's horizon: the sky reflected above, the ground's dark below -->
      <rect x="-720" y="-220" width="1540" height="450" fill="url(#h60-horizon)" style="mix-blend-mode: soft-light" />
      <rect x="-720" y="-220" width="1540" height="450" fill="url(#h60-vol)" />
      <rect x="-720" y="-220" width="1540" height="450" fill="url(#h60-dots)" mask="url(#h60-low)" style="mix-blend-mode: multiply" />
      <rect x="-720" y="-220" width="1540" height="450" fill="url(#h60-ends)" />
      <path :d="HULL" fill="none" stroke="#12001f" stroke-width="44" opacity="0.28" />
      <path :d="HULL" fill="none" stroke="#12001f" stroke-width="18" opacity="0.3" />
      <!-- the chrome ribbons -->
      <g v-for="x in SEAMS" :key="`s${x}`">
        <rect :x="x - 10" y="-220" width="20" height="450" fill="url(#h60-chrome)" :stroke="ink" stroke-width="2" />
        <g v-for="k in N(9)" :key="k">
          <circle :cx="x" :cy="-186 + k * 46" r="6.5" :fill="BEAD_C[(k + (x > 0 ? 2 : 0)) % BEAD_C.length]" :stroke="ink" stroke-width="1.5" />
          <circle :cx="x" :cy="-186 + k * 46" r="6.5" fill="url(#h60-bead)" />
        </g>
      </g>
      <g v-for="(b, i) in buttons" :key="`bt${i}`">
        <circle :cx="f(b.x)" :cy="f(b.y)" r="5.5" :fill="b.c" :stroke="ink" stroke-width="1.4" />
        <circle :cx="f(b.x)" :cy="f(b.y)" r="5.5" fill="url(#h60-bead)" />
      </g>
      <!-- a long specular streak along the top, a soft one under -->
      <path d="M -560 -150 C -380 -196 200 -200 560 -150 C 300 -176 -300 -176 -560 -150 Z" fill="url(#h60-spec)" opacity="0.7" />
      <path d="M -420 -126 C -200 -150 200 -152 440 -126" fill="none" stroke="#fff" stroke-width="3" opacity="0.35" stroke-linecap="round" />
      <path d="M -500 176 C -200 200 220 200 520 170" fill="none" stroke="#ff9ad8" stroke-width="4" opacity="0.35" stroke-linecap="round" />
    </g>

    <!-- the eye: a glow round it, a socket's shadow, pearly corners, rainbow lids -->
    <path v-for="(g, k) in [1.5, 1.34, 1.22]" :key="`eg${k}`" :d="eye(g)" fill="none" stroke="#ff3df0" :stroke-width="16 - k * 4" :opacity="0.12 + k * 0.08" style="mix-blend-mode: screen" />
    <path :d="SOCKET" fill="url(#h60-socket)" />
    <path :d="eye(1.02)" fill="url(#h60-sclera)" :stroke="ink" stroke-width="3" />
    <path :d="eye(1.02)" fill="url(#tx-noise)" opacity="0.15" style="mix-blend-mode: multiply" />
    <path :d="LID" fill="none" :stroke="ink" stroke-width="20" />
    <path :d="LID" fill="none" stroke="url(#h60-lid)" stroke-width="13" />
    <path :d="LID" fill="none" stroke="#fff" stroke-width="3" opacity="0.6" transform="translate(0 -3)" />
    <!-- lashes fanning off the top lid -->
    <g v-for="l in lashes" :key="`l${l.i}`">
      <path :d="l.d" :fill="l.c" :stroke="ink" stroke-width="2.5" stroke-linejoin="round" />
      <path :d="l.d" fill="url(#h60-lash)" />
      <path :d="l.hi" fill="none" stroke="#fff" stroke-width="2" opacity="0.55" stroke-linecap="round" />
    </g>
    <!-- diamonds at the eye's corners and drifting -->
    <g v-for="(g, i) in gems" :key="`g${i}`" :transform="`translate(${f(g.x)} ${g.y}) scale(${g.s})`">
      <g class="twinkle" :style="{ animationDelay: `${-g.d}s` }">
        <path d="M 0 -20 L 15 -6 L 0 22 L -15 -6 Z" fill="url(#h60-gem)" :stroke="ink" stroke-width="2" stroke-linejoin="round" />
        <path d="M -15 -6 L 15 -6 M -7 -6 L 0 22 L 7 -6 M -7 -6 L 0 -20 L 7 -6" fill="none" stroke="#fff" stroke-width="1.2" opacity="0.8" />
        <path d="M 0 -32 V -26 M 0 26 V 32 M -26 0 H -21 M 21 0 H 26" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity="0.8" />
      </g>
    </g>
    <!-- daisies, breathing -->
    <g v-for="(d, i) in daisies" :key="`d${i}`" :transform="`translate(${d.x} ${d.y})`">
      <g class="breathe" :style="{ animationDelay: `${-d.d}s` }">
        <ellipse v-for="a in petals8" :key="a" cx="0" :cy="-d.r * 0.95" :rx="d.r * 0.42" :ry="d.r * 0.62" :transform="`rotate(${a})`" fill="#fffaf0" :stroke="ink" stroke-width="1.8" />
        <circle :r="d.r * 0.5" :fill="d.core" :stroke="ink" stroke-width="1.8" />
        <circle :cx="-d.r * 0.15" :cy="-d.r * 0.18" :r="d.r * 0.18" fill="#fff" opacity="0.7" />
      </g>
    </g>
    <!-- the name, on a candy plaque -->
    <g transform="translate(520 -112) rotate(-6)">
      <rect x="-58" y="-16" width="116" height="32" rx="16" fill="#ff2e88" :stroke="ink" stroke-width="3" />
      <rect x="-52" y="-12" width="104" height="10" rx="5" fill="#fff" opacity="0.35" />
      <text x="0" y="8" text-anchor="middle" class="plate">S·S·B</text>
    </g>
    <!-- the outline and the sky's light on its rim -->
    <path :d="HULL" fill="none" :stroke="ink" stroke-width="6" stroke-linejoin="round" />
    <path d="M -560 -150 C -420 -200 -200 -206 -170 -206 L 380 -200 C 600 -190 760 -110 800 10" fill="none" stroke="#ffcf2a" stroke-width="2.5" opacity="0.7" transform="translate(0 4)" />
    <path d="M 760 110 C 650 190 500 208 380 210 L -170 214 C -470 210 -690 164 -700 20" fill="none" stroke="#18c4b4" stroke-width="3" opacity="0.7" transform="translate(0 -4)" />
  </g>
</template>

<style scoped>
.plate {
  font-family: 'Cooper Black', 'Arial Rounded MT Bold', sans-serif;
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 3px;
  fill: #fff6c2;
  paint-order: stroke;
  stroke: #241036;
  stroke-width: 3px;
}
.spin {
  animation: spin 40s steps(400) infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.twinkle {
  animation: twinkle 4s steps(16) infinite;
}
@keyframes twinkle {
  0%,
  100% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
  }
  50% {
    transform: scale(0.82) rotate(8deg);
    opacity: 0.75;
  }
}
.breathe {
  animation: breathe 5s steps(16) infinite;
}
@keyframes breathe {
  0%,
  100% {
    transform: scale(1) rotate(0deg);
  }
  50% {
    transform: scale(1.1) rotate(12deg);
  }
}
</style>
