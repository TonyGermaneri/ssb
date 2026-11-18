<script setup lang="ts">
import type { CockpitDesign, Skin } from '../../../lib/voyage/cockpit/design'

/**
 * The NINETIES' cockpit, behind its controls, as a pre-rendered CGI still: a banded indigo bulkhead with fat chrome
 * ribs, the bubble windscreen in a ray-traced chrome torus with chunky bolts and a hard highlight across its glass,
 * and three candy-plastic pods -- translucent teal, purple, lime over their circuit boards (chips, traces, a fan,
 * capacitors), smoked wells bevelled in chrome for the controls, a big swoosh decal, a hard white gloss. Past the
 * stage: more bulkhead, ribs, the pods' rounded feet.
 */
const props = defineProps<{ design: CockpitDesign; skin: Skin }>()
const C = props.skin.vco
const NAMES = ['BOW', 'MIDSHIPS', 'STERN']

// the side pod (drawn for VCO 1, mirrored for VCO 3), rel coords from its outer edge at x = 16
const SIDE = 'M 2 176 Q 2 98 84 98 L 318 98 Q 398 98 400 182 L 404 1080 L 2 1080 Z'
const CENTRE = 'M 432 612 Q 432 560 492 558 L 1108 558 Q 1168 560 1168 612 L 1168 1080 L 432 1080 Z'
interface Well {
  x: number
  y: number
  w: number
  h: number
  r: number
}
const sideWells: Well[] = [
  { x: 24, y: 116, w: 340, h: 142, r: 34 },
  { x: 38, y: 262, w: 284, h: 78, r: 26 },
  { x: 14, y: 346, w: 300, h: 136, r: 36 },
  { x: 318, y: 334, w: 58, h: 228, r: 29 },
  { x: 12, y: 494, w: 294, h: 222, r: 30 },
  { x: 12, y: 738, w: 392, h: 154, r: 34 },
]
const centreWells: Well[] = [
  { x: 444, y: 648, w: 56, h: 226, r: 28 },
  { x: 496, y: 572, w: 278, h: 124, r: 36 },
  { x: 982, y: 576, w: 150, h: 80, r: 24 },
  { x: 512, y: 700, w: 476, h: 92, r: 30 },
  { x: 990, y: 640, w: 162, h: 182, r: 28 },
  { x: 512, y: 798, w: 258, h: 98, r: 30 },
  { x: 976, y: 828, w: 178, h: 66, r: 30 },
]
// the circuit board under the candy: chips, capacitors (fixed, so it doesn't shimmer between frames)
const chips = [
  [60, 300, 46, 30],
  [210, 470, 60, 22],
  [120, 720, 36, 36],
  [300, 600, 50, 26],
  [40, 900, 70, 34],
  [260, 930, 44, 44],
  [340, 250, 30, 60],
]
const caps = [
  [30, 360],
  [196, 330],
  [332, 486],
  [170, 486],
  [20, 728],
  [380, 720],
  [210, 900],
  [120, 960],
]
const cChips = [
  [520, 690, 50, 20],
  [700, 690, 40, 30],
  [880, 692, 60, 20],
  [960, 600, 30, 40],
  [800, 790, 40, 20],
  [1080, 900, 60, 30],
  [600, 900, 50, 40],
]
// the bubble's bolts, round its torus (along the path's two arcs and its sides)
function bez(p0: number[], p1: number[], p2: number[], p3: number[], t: number) {
  const u = 1 - t
  return [0, 1].map((i) => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i])
}
const bolts = [
  ...[0.12, 0.38, 0.64, 0.9].map((t) => bez([420, 300], [420, 120], [600, 40], [800, 40], t)),
  ...[0.1, 0.36, 0.62, 0.88].map((t) => bez([800, 40], [1000, 40], [1180, 120], [1180, 300], t)),
  [420, 400],
  [1180, 400],
  [520, 545],
  [700, 545],
  [900, 545],
  [1080, 545],
]
const ribs = [-520, -380, -240, 1840, 1980, 2120]
const vents = Array.from({ length: 7 }, (_, i) => i * 18)
</script>

<template>
  <g class="back1990">
    <defs>
      <!-- banded on purpose: an early renderer's 8-bit gradient -->
      <linearGradient id="b90-bulk" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0a0b38" />
        <stop offset="0.2" stop-color="#0a0b38" />
        <stop offset="0.2" stop-color="#140f4c" />
        <stop offset="0.38" stop-color="#140f4c" />
        <stop offset="0.38" stop-color="#1e1260" />
        <stop offset="0.55" stop-color="#1e1260" />
        <stop offset="0.55" stop-color="#2a1474" />
        <stop offset="0.72" stop-color="#2a1474" />
        <stop offset="0.72" stop-color="#3a168a" />
        <stop offset="1" stop-color="#4a18a0" />
      </linearGradient>
      <linearGradient id="b90-chrome" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.18" stop-color="#bfeaff" />
        <stop offset="0.42" stop-color="#5865b0" />
        <stop offset="0.5" stop-color="#170c3c" />
        <stop offset="0.58" stop-color="#7a3fb8" />
        <stop offset="0.78" stop-color="#ffd2f6" />
        <stop offset="1" stop-color="#6d58c0" />
      </linearGradient>
      <linearGradient id="b90-chromeH" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#2a1a5a" />
        <stop offset="0.2" stop-color="#ffffff" />
        <stop offset="0.35" stop-color="#9fdcff" />
        <stop offset="0.5" stop-color="#3a3a8a" />
        <stop offset="0.65" stop-color="#ffe0fa" />
        <stop offset="0.85" stop-color="#ffffff" />
        <stop offset="1" stop-color="#2a1a5a" />
      </linearGradient>
      <radialGradient id="b90-gloss" cx="0.3" cy="0" r="0.9">
        <stop offset="0" stop-color="#fff" stop-opacity="0.55" />
        <stop offset="0.35" stop-color="#fff" stop-opacity="0.12" />
        <stop offset="0.6" stop-color="#fff" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="b90-smoke" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#05031a" stop-opacity="0.92" />
        <stop offset="1" stop-color="#140c3a" stop-opacity="0.82" />
      </linearGradient>
      <linearGradient id="b90-rimlight" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.9" />
        <stop offset="0.5" stop-color="#ffffff" stop-opacity="0" />
        <stop offset="1" stop-color="#ffffff" stop-opacity="0.35" />
      </linearGradient>
      <radialGradient v-for="(c, i) in C" :id="`b90-candy${i}`" :key="i" cx="0.35" cy="0.15" r="1.1">
        <stop offset="0" :stop-color="c" stop-opacity="0.55" />
        <stop offset="0.5" :stop-color="c" stop-opacity="0.42" />
        <stop offset="1" :stop-color="c" stop-opacity="0.22" />
      </radialGradient>
      <radialGradient id="b90-bolt" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.35" stop-color="#c8d8ff" />
        <stop offset="0.7" stop-color="#4a3a98" />
        <stop offset="1" stop-color="#140a38" />
      </radialGradient>
      <radialGradient id="b90-cap" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#d8fff0" />
        <stop offset="0.5" stop-color="#2a8a6a" />
        <stop offset="1" stop-color="#05201a" />
      </radialGradient>
      <pattern id="b90-pcb" patternUnits="userSpaceOnUse" width="64" height="64">
        <rect width="64" height="64" fill="#06241e" />
        <path d="M 0 12 H 22 L 32 22 H 64 M 8 0 V 40 L 18 50 H 64 M 40 0 V 14 M 48 22 V 64 M 0 56 H 30" stroke="#1d7a5a" stroke-width="1.6" fill="none" />
        <circle cx="22" cy="12" r="2.4" fill="#c8b25a" />
        <circle cx="40" cy="14" r="2.4" fill="#c8b25a" />
        <circle cx="18" cy="50" r="2.4" fill="#c8b25a" />
        <circle cx="30" cy="56" r="2.4" fill="#c8b25a" />
      </pattern>
      <pattern id="b90-dither" patternUnits="userSpaceOnUse" width="4" height="4">
        <rect width="1" height="1" fill="#fff" />
        <rect x="2" y="2" width="1" height="1" fill="#fff" />
      </pattern>
      <clipPath id="b90-sideclip"><path :d="SIDE" /></clipPath>
      <clipPath id="b90-centreclip"><path :d="CENTRE" /></clipPath>
    </defs>

    <!-- ── a hard highlight across the bubble's glass (a reflection, thin: the warp shows through) ── -->
    <g clip-path="url(#cp-glass)" style="mix-blend-mode: screen" opacity="0.5">
      <path d="M 470 300 C 470 150 610 82 780 76" fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round" opacity="0.45" />
      <path d="M 488 330 C 486 220 540 150 620 116" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.6" />
      <path d="M 1130 420 C 1140 470 1120 505 1080 515" fill="none" stroke="#bff" stroke-width="5" stroke-linecap="round" opacity="0.4" />
    </g>

    <!-- ── the bulkhead: everything but the glass ── -->
    <path :d="`M -700 -500 H 2300 V 1400 H -700 Z ${design.glass}`" fill-rule="evenodd" fill="url(#b90-bulk)" />
    <path :d="`M -700 -500 H 2300 V 1400 H -700 Z ${design.glass}`" fill-rule="evenodd" fill="url(#b90-dither)" opacity="0.05" />
    <!-- a big swoosh across the bulkhead, behind the bubble -->
    <path d="M -700 140 C -200 -60 300 -40 800 -10 C 1300 20 1800 -40 2300 -160 L 2300 -60 C 1800 60 1300 110 800 80 C 300 50 -200 40 -700 240 Z" :fill="C[0]" opacity="0.5" />
    <path d="M -700 240 C -200 40 300 50 800 80 C 1300 110 1800 60 2300 -60" fill="none" :stroke="C[2]" stroke-width="5" />
    <path d="M -700 140 C -200 -60 300 -40 800 -10 C 1300 20 1800 -40 2300 -160" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.6" />
    <!-- fat chrome ribs past the stage -->
    <g v-for="x in ribs" :key="`rb${x}`">
      <rect :x="x - 30" y="-500" width="60" height="1900" rx="30" fill="url(#b90-chromeH)" />
      <rect :x="x - 30" y="-500" width="60" height="1900" rx="30" fill="none" stroke="#110a2c" stroke-width="2" />
      <rect v-for="k in 6" :key="k" :x="x - 38" :y="-200 + k * 220" width="76" height="24" rx="12" fill="url(#b90-chrome)" stroke="#110a2c" stroke-width="1.5" />
    </g>
    <!-- the overhead hatch, above the bubble (tall screens) -->
    <g transform="translate(800 -150)">
      <circle r="96" fill="#110a2c" />
      <circle r="88" fill="none" stroke="url(#b90-chrome)" stroke-width="16" />
      <circle r="72" fill="url(#b90-smoke)" />
      <circle r="72" fill="url(#b90-pcb)" opacity="0.35" />
      <circle r="40" :fill="C[2]" opacity="0.25" />
      <circle r="22" :fill="C[2]" opacity="0.8" />
      <ellipse cx="-26" cy="-40" rx="34" ry="12" fill="#fff" opacity="0.45" transform="rotate(-30)" />
      <circle v-for="k in 8" :key="k" :cx="Math.cos((k * Math.PI) / 4) * 88" :cy="Math.sin((k * Math.PI) / 4) * 88" r="6" fill="url(#b90-bolt)" />
    </g>
    <!-- side blisters past the stage: candy domes with a glow inside, on chrome collars -->
    <g v-for="(bx, i) in [-170, 1770]" :key="`bl${i}`" :transform="`translate(${bx} 420)`">
      <ellipse cx="6" cy="14" rx="118" ry="150" fill="#000" opacity="0.4" />
      <ellipse rx="118" ry="150" fill="#110a2c" />
      <ellipse rx="110" ry="142" fill="none" stroke="url(#b90-chrome)" stroke-width="14" />
      <ellipse rx="96" ry="128" fill="url(#b90-pcb)" />
      <ellipse rx="96" ry="128" :fill="C[i === 0 ? 0 : 2]" opacity="0.4" />
      <circle r="34" :fill="C[i === 0 ? 1 : 1]" opacity="0.5" />
      <circle r="16" fill="#fff" opacity="0.85" />
      <ellipse rx="96" ry="128" fill="url(#b90-gloss)" />
      <path d="M -70 -70 Q -60 -110 -10 -120" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity="0.8" />
      <rect v-for="k in 5" :key="k" x="-70" :y="170 + k * 22" width="140" height="10" rx="5" fill="url(#b90-chromeH)" />
    </g>
    <!-- the badge, top left: chunky chrome type -->
    <g transform="translate(40 66)">
      <text font-family="'Arial Black', 'Impact', sans-serif" font-size="44" font-weight="900" font-style="italic" fill="#110a2c" transform="translate(3 4)">HX-2K</text>
      <text font-family="'Arial Black', 'Impact', sans-serif" font-size="44" font-weight="900" font-style="italic" fill="url(#b90-chrome)" :stroke="C[2]" stroke-width="1.5">HX-2K</text>
    </g>
    <g transform="translate(1560 60)">
      <text text-anchor="end" font-family="'Arial Black', 'Impact', sans-serif" font-size="20" font-weight="900" font-style="italic" letter-spacing="2" fill="#110a2c" transform="translate(2 3)">HYPERCRUISER</text>
      <text text-anchor="end" font-family="'Arial Black', 'Impact', sans-serif" font-size="20" font-weight="900" font-style="italic" letter-spacing="2" fill="#ffffff" :stroke="C[1]" stroke-width="1">HYPERCRUISER</text>
      <path d="M -230 14 C -150 4 -60 4 4 14 C -70 12 -150 14 -230 22 Z" :fill="C[2]" />
    </g>

    <!-- ── the side pods: VCO 1 (left), VCO 3 (right, mirrored) ── -->
    <g v-for="vco in [0, 2]" :key="`sp${vco}`" :transform="vco === 0 ? 'translate(16 0)' : 'matrix(-1 0 0 1 1584 0)'">
      <!-- its shadow, then its innards -->
      <path :d="SIDE" fill="#000" opacity="0.5" transform="translate(10 14)" />
      <g clip-path="url(#b90-sideclip)">
        <rect x="0" y="90" width="410" height="1000" fill="url(#b90-pcb)" />
        <rect v-for="(c, i) in chips" :key="`ch${i}`" :x="c[0]" :y="c[1]" :width="c[2]" :height="c[3]" rx="2" fill="#0c0a14" stroke="#3a3a4a" stroke-width="1" />
        <circle v-for="(c, i) in caps" :key="`cp${i}`" :cx="c[0]" :cy="c[1]" r="9" fill="url(#b90-cap)" />
        <!-- a little fan -->
        <g transform="translate(330 870)">
          <circle r="40" fill="#0a0a14" stroke="#4a4a5a" stroke-width="2" />
          <path v-for="k in 7" :key="k" :transform="`rotate(${k * 51.4})`" d="M 0 0 C 10 -14 26 -20 34 -10 C 22 -10 12 -4 0 0 Z" fill="#2a2a3a" />
        </g>
        <!-- the candy shell over it all -->
        <path :d="SIDE" :fill="`url(#b90-candy${vco})`" />
        <path :d="SIDE" :fill="C[vco]" opacity="0.28" />
        <!-- its swoosh decal -->
        <path d="M -20 1000 C 80 860 260 760 460 720 C 280 790 140 880 60 1040 Z" fill="#ffffff" opacity="0.18" />
        <path d="M -20 720 C 100 600 240 520 440 470" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.25" />
        <!-- the smoked wells, bevelled -->
        <g v-for="(w, i) in sideWells" :key="`w${i}`">
          <rect :x="w.x" :y="w.y" :width="w.w" :height="w.h" :rx="w.r" fill="url(#b90-smoke)" />
          <rect :x="w.x" :y="w.y" :width="w.w" :height="w.h" :rx="w.r" fill="none" stroke="url(#b90-rimlight)" stroke-width="2.5" />
          <rect :x="w.x - 3" :y="w.y - 3" :width="w.w + 6" :height="w.h + 6" :rx="w.r + 3" fill="none" stroke="#110a2c" stroke-width="2" opacity="0.6" />
        </g>
        <!-- the hard gloss across the top -->
        <path :d="SIDE" fill="url(#b90-gloss)" />
        <path d="M 30 112 Q 40 104 90 104 L 300 104 Q 360 104 380 140" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.85" />
      </g>
      <!-- the chrome bevel -->
      <path :d="SIDE" fill="none" stroke="#110a2c" stroke-width="12" />
      <path :d="SIDE" fill="none" stroke="url(#b90-chrome)" stroke-width="8" />
      <!-- the intake's chrome collar -->
      <circle cx="300" cy="640" r="32" fill="url(#b90-smoke)" stroke="url(#b90-chrome)" stroke-width="5" />
      <!-- vents down its foot (below the stage) -->
      <rect v-for="v in vents" :key="`sv${v}`" x="40" :y="930 + v" width="320" height="9" rx="4.5" fill="#05031a" opacity="0.7" />
    </g>

    <!-- ── the centre pod: VCO 2 ── -->
    <g>
      <path :d="CENTRE" fill="#000" opacity="0.5" transform="translate(0 14)" />
      <g clip-path="url(#b90-centreclip)">
        <rect x="430" y="550" width="740" height="540" fill="url(#b90-pcb)" />
        <rect v-for="(c, i) in cChips" :key="`cc${i}`" :x="c[0]" :y="c[1]" :width="c[2]" :height="c[3]" rx="2" fill="#0c0a14" stroke="#3a3a4a" stroke-width="1" />
        <path :d="CENTRE" fill="url(#b90-candy1)" />
        <path :d="CENTRE" :fill="C[1]" opacity="0.3" />
        <path d="M 400 1000 C 600 880 900 820 1220 830 C 950 850 700 920 560 1060 Z" fill="#ffffff" opacity="0.16" />
        <g v-for="(w, i) in centreWells" :key="`cw${i}`">
          <rect :x="w.x" :y="w.y" :width="w.w" :height="w.h" :rx="w.r" fill="url(#b90-smoke)" />
          <rect :x="w.x" :y="w.y" :width="w.w" :height="w.h" :rx="w.r" fill="none" stroke="url(#b90-rimlight)" stroke-width="2.5" />
        </g>
        <path :d="CENTRE" fill="url(#b90-gloss)" />
        <path d="M 470 570 Q 490 564 540 564 L 1060 564 Q 1130 564 1150 590" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.85" />
      </g>
      <path :d="CENTRE" fill="none" stroke="#110a2c" stroke-width="12" />
      <path :d="CENTRE" fill="none" stroke="url(#b90-chrome)" stroke-width="8" />
      <circle cx="1112" cy="860" r="31" fill="url(#b90-smoke)" stroke="url(#b90-chrome)" stroke-width="5" />
      <rect v-for="v in vents" :key="`cv${v}`" x="520" :y="930 + v" width="560" height="9" rx="4.5" fill="#05031a" opacity="0.7" />
    </g>

    <!-- ── the bubble's chrome torus, over the pods' shoulders ── -->
    <path :d="design.glass" fill="none" stroke="#000" stroke-width="64" opacity="0.35" transform="translate(6 10)" />
    <path :d="design.glass" fill="none" stroke="#110a2c" stroke-width="56" />
    <path :d="design.glass" fill="none" stroke="url(#b90-chrome)" stroke-width="46" />
    <path :d="design.glass" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.8" transform="translate(-2 -6)" />
    <path :d="design.glass" fill="none" stroke="#110a2c" stroke-width="3" opacity="0.7" />
    <path :d="design.glass" fill="none" :stroke="C[2]" stroke-width="2" opacity="0.8" transform="translate(0 2)" />
    <g v-for="(b, i) in bolts" :key="`bt${i}`" :transform="`translate(${b[0]} ${b[1]})`">
      <circle r="11" fill="#110a2c" />
      <circle r="9" fill="url(#b90-bolt)" />
      <path d="M -4 -1 h 8 M -1 -4 v 8" stroke="#110a2c" stroke-width="1.6" opacity="0.6" />
    </g>

    <!-- the pods' names, on chrome tabs -->
    <g v-for="vco in [0, 1, 2]" :key="`nm${vco}`" :transform="`translate(${vco === 0 ? 210 : vco === 2 ? 1390 : 800} ${vco === 1 ? 932 : 940})`">
      <rect x="-80" y="-13" width="160" height="22" rx="11" fill="url(#b90-chrome)" stroke="#110a2c" stroke-width="1.5" />
      <text y="4" text-anchor="middle" font-family="'Arial Black', 'Impact', sans-serif" font-size="11" font-weight="900" letter-spacing="2" fill="#110a2c">VCO {{ vco + 1 }} · {{ NAMES[vco] }}</text>
    </g>
  </g>
</template>
