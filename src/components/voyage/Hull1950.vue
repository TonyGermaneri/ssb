<script setup lang="ts">
import type { Era } from '../../lib/voyage/ship'

/**
 * The FIFTIES ship's hull (lib/voyage/eras/e1950.ts): a candy-red rocket fuselage run through a chrome saucer -- the
 * disc's turquoise cap and belly, its chrome rim, the cupola collar, landing legs, the booster's red bands and
 * chrome boat-tail, Googie starbursts and an atom on the side. Static; the parts are drawn around it.
 */
const props = defineProps<{ era: Era }>()
const P = props.era.palettes
const ink = props.era.ink
const N = (n: number) => Array.from({ length: n }, (_, i) => i)

/** the rocket: a boat-tailed booster, a long body, an ogive nose */
const FUSE = 'M -735 -74 L -640 -100 L 430 -100 C 600 -100 742 -62 800 4 C 742 70 600 100 430 100 L -640 100 L -735 74 Z'
/** the saucer, edge-on: a lens */
const DISC = 'M -492 22 C -410 -52 -270 -166 -40 -174 C 190 -166 330 -52 412 22 C 330 94 190 172 -40 180 C -270 172 -410 94 -492 22 Z'
/** its chrome rim */
const RIM = 'M -500 22 C -300 -6 220 -6 420 22 C 220 50 -300 50 -500 22 Z'

/** a Googie starburst: n long and n short points */
function burst(x: number, y: number, r: number, n = 4) {
  let d = ''
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n - Math.PI / 2
    const rr = i % 2 ? r * 0.28 : r
    d += `${i ? 'L' : 'M'} ${(x + Math.cos(a) * rr).toFixed(1)} ${(y + Math.sin(a) * rr).toFixed(1)} `
  }
  return d + 'Z'
}
const bursts = [
  { x: 560, y: -84, r: 22, c: P[0].alt },
  { x: 292, y: -44, r: 24, c: '#ffd23f' },
  { x: -420, y: 52, r: 18, c: '#ffd23f' },
  { x: -620, y: -86, r: 16, c: P[2].alt },
]
const rivets = (x: number, y0: number, y1: number, n: number) => N(n).map((i) => ({ x, y: y0 + ((y1 - y0) * i) / (n - 1) }))
const legs = [
  { x0: -262, y0: 120, x1: -292, y1: 320 },
  { x0: 96, y0: 120, x1: 118, y1: 320 },
]
</script>

<template>
  <g class="hull">
    <defs>
      <clipPath id="vy-1950-fuse"><path :d="FUSE" /></clipPath>
      <clipPath id="vy-1950-disc"><path :d="DISC" /></clipPath>
      <linearGradient id="vy-1950-chrome" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.35" stop-color="#cfd8e0" />
        <stop offset="0.55" stop-color="#7d8b9a" />
        <stop offset="0.7" stop-color="#e6edf2" />
        <stop offset="1" stop-color="#8e9cab" />
      </linearGradient>
      <linearGradient id="vy-1950-disc-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f4f8fb" />
        <stop offset="0.5" :stop-color="P[1].main" />
        <stop offset="0.62" stop-color="#8795a4" />
        <stop offset="1" stop-color="#b9c4ce" />
      </linearGradient>
    </defs>

    <!-- landing legs, folded down under the disc -->
    <g v-for="(l, i) in legs" :key="`l${i}`">
      <path :d="`M ${l.x0} ${l.y0} L ${l.x1} ${l.y1}`" :stroke="ink" stroke-width="22" stroke-linecap="round" />
      <path :d="`M ${l.x0} ${l.y0} L ${l.x1} ${l.y1}`" stroke="url(#vy-1950-chrome)" stroke-width="10" stroke-linecap="round" />
      <path :d="`M ${l.x0 + (l.x1 - l.x0) * 0.4} ${l.y0 + (l.y1 - l.y0) * 0.4} L ${l.x0 + (i ? -40 : 40)} ${l.y0 + 10}`" :stroke="ink" stroke-width="8" stroke-linecap="round" />
      <path :d="`M ${l.x1 - 34} ${l.y1 + 8} Q ${l.x1} ${l.y1 - 16} ${l.x1 + 34} ${l.y1 + 8} Z`" :fill="P[0].main" :stroke="ink" stroke-width="6" stroke-linejoin="round" />
    </g>

    <!-- the rocket -->
    <g clip-path="url(#vy-1950-fuse)">
      <rect x="-760" y="-110" width="360" height="220" :fill="P[2].main" />
      <rect x="-400" y="-110" width="740" height="220" fill="url(#vy-1950-chrome)" />
      <rect x="340" y="-110" width="480" height="220" :fill="P[0].main" />
      <!-- bow: a cream speed stripe tapering to the nose, chrome tip -->
      <path d="M 420 -100 L 800 -100 L 800 -40 C 700 -76 560 -84 420 -82 Z" :fill="P[0].alt" :stroke="ink" stroke-width="4" />
      <path d="M 420 100 L 800 100 L 800 50 C 700 84 560 90 420 88 Z" :fill="P[0].deep" opacity="0.35" />
      <rect x="758" y="-110" width="60" height="220" fill="url(#vy-1950-chrome)" />
      <path d="M 758 -110 V 110" :stroke="ink" stroke-width="5" />
      <!-- speed lines behind the flight deck -->
      <path d="M 352 -40 H 384 M 344 -14 H 384 M 352 12 H 384" :stroke="P[0].alt" stroke-width="7" stroke-linecap="round" />
      <!-- stern: red bands round the booster and a chrome boat-tail -->
      <rect x="-462" y="-110" width="22" height="220" :fill="P[2].alt" />
      <rect x="-650" y="-110" width="40" height="220" fill="url(#vy-1950-chrome)" />
      <rect x="-760" y="-110" width="110" height="220" fill="url(#vy-1950-chrome)" />
      <rect x="-610" y="-110" width="16" height="220" :fill="P[2].alt" />
      <path d="M -650 -110 V 110 M -610 -110 V 110 M -594 -110 V 110" :stroke="ink" stroke-width="4" />
      <path d="M -735 -100 H 400 M -735 102 H 430" :stroke="P[1].deep" stroke-width="0" />
      <rect x="-760" y="-110" width="1580" height="220" fill="url(#vy-gloss)" />
      <path d="M -630 -66 H 420" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.45" />
    </g>
    <path :d="FUSE" fill="none" :stroke="ink" stroke-width="9" stroke-linejoin="round" />
    <!-- chrome collars where the rocket runs into the disc -->
    <g v-for="x in [-500, 414]" :key="`c${x}`">
      <rect :x="x - 11" y="-106" width="22" height="212" rx="6" fill="url(#vy-1950-chrome)" :stroke="ink" stroke-width="5" />
      <circle v-for="(r, k) in rivets(x, -86, 86, 7)" :key="k" :cx="r.x" :cy="r.y" r="3.5" :fill="ink" />
    </g>

    <!-- the saucer -->
    <g clip-path="url(#vy-1950-disc)">
      <rect x="-490" y="-140" width="900" height="290" fill="url(#vy-1950-disc-g)" />
      <ellipse cx="-40" cy="-124" rx="330" ry="82" :fill="P[1].alt" :stroke="ink" stroke-width="5" />
      <ellipse cx="-40" cy="190" rx="330" ry="76" :fill="P[1].alt" :stroke="ink" stroke-width="5" />
      <path d="M -450 -4 C -300 -64 220 -64 370 -4 M -440 52 C -300 104 220 104 360 52" fill="none" :stroke="P[1].deep" stroke-width="3" opacity="0.45" />
      <path d="M -360 -60 C -250 -140 -130 -160 -40 -164" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity="0.7" />
    </g>
    <path :d="RIM" fill="url(#vy-1950-chrome)" :stroke="ink" stroke-width="6" stroke-linejoin="round" />
    <path d="M -484 22 C -300 7 220 7 404 22" fill="none" :stroke="P[0].main" stroke-width="5" />
    <path :d="DISC" fill="none" :stroke="ink" stroke-width="9" stroke-linejoin="round" />
    <!-- the cupola's collar, under the bubble -->
    <ellipse cx="-50" cy="-174" rx="128" ry="18" fill="url(#vy-1950-chrome)" :stroke="ink" stroke-width="6" />
    <circle v-for="k in N(7)" :key="`cr${k}`" :cx="-140 + k * 30" cy="-170" r="3.5" :fill="ink" />

    <!-- an atom on the booster's flank -->
    <g transform="translate(-392 -54)">
      <ellipse v-for="a in [0, 60, 120]" :key="a" rx="34" ry="11" :transform="`rotate(${a})`" fill="none" :stroke="ink" stroke-width="7" />
      <ellipse v-for="a in [0, 60, 120]" :key="`h${a}`" rx="34" ry="11" :transform="`rotate(${a})`" fill="none" :stroke="P[0].main" stroke-width="3" />
      <circle r="8" fill="#ffd23f" :stroke="ink" stroke-width="4" />
    </g>
    <!-- Googie starbursts -->
    <path v-for="(b, i) in bursts" :key="`s${i}`" :d="burst(b.x, b.y, b.r)" :fill="b.c" :stroke="ink" stroke-width="4" stroke-linejoin="round" />
    <!-- the plate on the rim -->
    <g transform="translate(-330 24)">
      <rect x="-56" y="-14" width="112" height="28" rx="14" :fill="ink" />
      <text x="0" y="8" text-anchor="middle" class="plate">XS-57</text>
    </g>
  </g>
</template>

<style scoped>
.plate {
  font-family: 'Futura', 'Avenir Next', sans-serif;
  font-size: 20px;
  font-weight: 800;
  font-style: italic;
  letter-spacing: 3px;
  fill: #ffd23f;
}
</style>
