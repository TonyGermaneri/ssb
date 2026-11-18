<script setup lang="ts">
import type { Era } from '../../lib/voyage/ship'

/**
 * The SEVENTIES ship's hull (lib/voyage/eras/e1970.ts): a brown engine block, an avocado spine under three cargo
 * pods, a cream wedge of a command module, a triple racing stripe kinking down the bow, greebles, grilles, hazard
 * chevrons and stencils. Static; the parts are drawn around it.
 */
const props = defineProps<{ era: Era }>()
const P = props.era.palettes
const ink = props.era.ink
const N = (n: number) => Array.from({ length: n }, (_, i) => i)

const STERN = 'M -735 -160 L -700 -200 L -300 -200 L -300 180 L -700 180 L -735 140 Z'
const SPINE = 'M -310 -120 L 350 -120 L 350 120 L -310 120 Z'
const BOW = 'M 340 -165 L 600 -165 L 790 -45 L 802 10 L 760 95 L 600 145 L 340 145 Z'
const KEEL = 'M -290 116 L 330 116 L 314 146 L -274 146 Z'
/** the racing stripe's centre line: along the spine, a kink down the bow */
const STRIPE = 'M -760 -92 L 345 -92 L 385 81 L 820 81'
const pods = [
  { x: -296, w: 196, c: P[1].alt, n: '01' },
  { x: -92, w: 200, c: P[0].alt, n: '02' },
  { x: 116, w: 220, c: P[0].main, n: '03' },
]
const grille = N(15).map((i) => -690 + i * 26).filter((x) => x < -572 || x > -392)
const chevrons = N(18).map((i) => -760 + i * 28)
const bolts = (x: number) => N(6).map((i) => ({ x, y: -104 + i * 41.6 }))
const greebles = [
  { x: -292, y: -60, w: 30, h: 22 },
  { x: -258, y: -60, w: 18, h: 40 },
  { x: -292, y: -32, w: 30, h: 14 },
  { x: -292, y: 4, w: 48, h: 18 },
  { x: -292, y: 30, w: 22, h: 30 },
  { x: -266, y: 30, w: 26, h: 16 },
  { x: 118, y: 86, w: 26, h: 22 },
  { x: 316, y: -100, w: 26, h: 30 },
  { x: 316, y: 50, w: 26, h: 40 },
  { x: -400, y: 136, w: 40, h: 0 },
]
</script>

<template>
  <g class="hull">
    <defs>
      <clipPath id="vy-1970-all">
        <path :d="STERN" />
        <path :d="SPINE" />
        <path :d="BOW" />
      </clipPath>
      <clipPath id="vy-1970-chev"><rect x="-735" y="142" width="435" height="36" /></clipPath>
      <linearGradient id="vy-1970-air" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff3d6" stop-opacity="0.5" />
        <stop offset="0.3" stop-color="#fff3d6" stop-opacity="0" />
        <stop offset="0.75" :stop-color="ink" stop-opacity="0.05" />
        <stop offset="1" :stop-color="ink" stop-opacity="0.45" />
      </linearGradient>
    </defs>

    <!-- the keel beam under the spine, a truss -->
    <path :d="KEEL" :fill="P[1].deep" :stroke="ink" stroke-width="6" stroke-linejoin="round" />
    <path :d="`M -274 120 ${N(12).map((i) => `L ${-250 + i * 50} ${i % 2 ? 120 : 142}`).join(' ')}`" fill="none" :stroke="P[1].main" stroke-width="5" />

    <!-- a coolant tank on the engine block -->
    <rect x="-394" y="-246" width="84" height="54" rx="22" :fill="P[2].alt" :stroke="ink" stroke-width="6" />
    <path d="M -372 -244 V -194 M -332 -244 V -194" :stroke="ink" stroke-width="5" />
    <rect x="-386" y="-238" width="68" height="10" rx="5" fill="#fff" opacity="0.3" />
    <!-- cargo pods on the spine -->
    <g v-for="(p, i) in pods" :key="`p${i}`">
      <rect :x="p.x" y="-234" :width="p.w" height="120" rx="14" :fill="p.c" :stroke="ink" stroke-width="7" />
      <path :d="N(Math.floor(p.w / 30)).map((k) => `M ${p.x + 24 + k * 30} -222 V -126`).join(' ')" :stroke="ink" stroke-width="3" opacity="0.35" />
      <rect :x="p.x + 8" y="-226" :width="p.w - 16" height="18" rx="8" fill="#fff" opacity="0.25" />
      <rect :x="p.x + p.w / 2 - 30" y="-196" width="60" height="34" rx="4" :fill="ink" opacity="0.8" />
      <text :x="p.x + p.w / 2" y="-170" text-anchor="middle" class="stencil" :fill="p.c">{{ p.n }}</text>
    </g>

    <!-- the three blocks -->
    <path :d="SPINE" :fill="P[1].main" />
    <path :d="STERN" :fill="P[2].main" />
    <path :d="BOW" :fill="P[0].main" />
    <g clip-path="url(#vy-1970-all)">
      <!-- stern: a back plate, grilles along the top, hazard chevrons along the bottom -->
      <rect x="-740" y="-210" width="26" height="400" :fill="P[2].deep" />
      <rect x="-700" y="-192" width="390" height="30" rx="4" :fill="P[2].deep" opacity="0.55" />
      <rect v-for="x in grille" :key="`g${x}`" :x="x" y="-186" width="14" height="18" rx="3" :fill="P[2].hi" opacity="0.55" />
      <g clip-path="url(#vy-1970-chev)">
        <rect x="-735" y="142" width="435" height="36" fill="#e3a52c" />
        <path v-for="x in chevrons" :key="`c${x}`" :d="`M ${x} 178 L ${x + 14} 178 L ${x + 50} 142 L ${x + 36} 142 Z`" :fill="ink" />
      </g>
      <path d="M -735 142 H -300" :stroke="ink" stroke-width="5" />
      <path d="M -580 -160 V -70 M -580 60 V 140 M -440 132 V 140" :stroke="ink" stroke-width="3" opacity="0.4" />
      <!-- spine: seams and greebles -->
      <path d="M -224 -116 V -66 M 132 -116 V -88 M 132 88 V 116 M -224 62 V 116" :stroke="ink" stroke-width="3" opacity="0.45" />
      <rect v-for="(g, i) in greebles" :key="`r${i}`" :x="g.x" :y="g.y" :width="g.w" :height="g.h" rx="3" :fill="i % 3 ? P[1].deep : P[1].hi" :stroke="ink" stroke-width="3" opacity="0.85" />
      <!-- bow: a visor round the command deck, a chin, panel lines -->
      <rect x="368" y="-152" width="284" height="134" rx="16" :fill="P[0].deep" />
      <path d="M 560 145 L 760 95 L 784 50 L 640 104 L 560 112 Z" :fill="P[0].alt" opacity="0.9" />
      <path d="M 610 -152 L 772 -50 M 780 -30 L 780 40" fill="none" :stroke="ink" stroke-width="3" opacity="0.4" />
      <!-- the racing stripe -->
      <path :d="STRIPE" fill="none" :stroke="ink" stroke-width="46" stroke-linejoin="miter" />
      <path :d="STRIPE" fill="none" stroke="#d9622b" stroke-width="12" stroke-linejoin="miter" transform="translate(0 -13)" />
      <path :d="STRIPE" fill="none" stroke="#e3a52c" stroke-width="12" stroke-linejoin="miter" />
      <path :d="STRIPE" fill="none" stroke="#f3e2b8" stroke-width="12" stroke-linejoin="miter" transform="translate(0 13)" />
      <!-- airbrushed light -->
      <rect x="-740" y="-210" width="1550" height="400" fill="url(#vy-1970-air)" />
      <path d="M -690 -172 H -320 M 360 -150 H 590" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity="0.35" />
    </g>
    <path :d="SPINE" fill="none" :stroke="ink" stroke-width="8" stroke-linejoin="round" />
    <path :d="STERN" fill="none" :stroke="ink" stroke-width="9" stroke-linejoin="round" />
    <path :d="BOW" fill="none" :stroke="ink" stroke-width="9" stroke-linejoin="round" />

    <!-- the joints between the blocks -->
    <g v-for="x in [-300, 340]" :key="`j${x}`">
      <rect :x="x - 13" y="-128" width="26" height="256" rx="6" :fill="P[1].deep" :stroke="ink" stroke-width="5" />
      <circle v-for="(b, k) in bolts(x)" :key="k" :cx="b.x" :cy="b.y" r="4.5" :fill="P[1].alt" />
    </g>
    <!-- stencils -->
    <text x="470" y="128" text-anchor="middle" class="stencil big" :fill="P[0].deep">HX·77</text>
    <text x="-440" y="-120" text-anchor="middle" class="stencil" :fill="P[2].hi" opacity="0.8">REACTOR</text>
  </g>
</template>

<style scoped>
.stencil {
  font-family: 'Futura', 'Avenir Next', sans-serif;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 2px;
}
.big {
  font-size: 30px;
  letter-spacing: 4px;
}
</style>
