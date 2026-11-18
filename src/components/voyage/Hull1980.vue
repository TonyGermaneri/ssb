<script setup lang="ts">
import type { Era } from '../../lib/voyage/ship'

/**
 * The EIGHTIES ship's hull (lib/voyage/eras/e1980.ts): a long, low near-black wedge with a laser grid etched into it,
 * neon section slashes, a chrome sill and racing stripes, an angular canopy fairing, and a sliced-sun emblem.
 * Static; the parts are drawn around it. Glows are faked with wide translucent strokes under thin bright ones.
 */
const props = defineProps<{ era: Era }>()
const P = props.era.palettes
const ink = props.era.ink
const HULL = 'M 816 14 L 610 -100 L 330 -152 L -700 -172 L -746 -136 L -746 96 L -700 150 L 400 150 L 640 96 Z'
/** a stripe along the deck, `o` below it, kicking down to the nose */
const stripe = (o: number) => `M -760 ${-174 + o} L 330 ${-152 + o} L ${604 - o * 0.4} ${-100 + o}`
const CANOPY = 'M -136 -146 L -100 -320 L 252 -320 L 336 -146 Z'
/** section bounds: bow from 270, stern below -290 */
const sections = [
  { x0: 270, x1: 820, slash: 270 },
  { x0: -290, x1: 270, slash: -290 },
  { x0: -760, x1: -290, slash: null },
]
const N = (n: number) => Array.from({ length: n }, (_, i) => i)
/** the laser grid: lines fanning back from a vanishing point beyond the nose, and raked ribs */
const VP = { x: 1500, y: -20 }
const fan = N(11).map((i) => {
  const y = -170 + i * 34
  const x = -760
  return `M ${VP.x} ${VP.y} L ${x} ${y + (y - VP.y) * 0.25}`
})
const ribs = N(26).map((i) => {
  const x = -740 + i * i * 2.1 + i * 26
  return `M ${x + 30} -160 L ${x - 30} 160`
})
/** dome pedestals, so the bow dome sits on the sloping deck */
const pedestals = [
  'M 318 -146 L 502 -146 L 516 -122 L 304 -122 Z',
  'M -286 -146 L -110 -146 L -100 -136 L -296 -136 Z',
  'M -570 -150 L -394 -150 L -384 -140 L -580 -140 Z',
]
const slices = [-14, -2, 9, 19, 28]
</script>

<template>
  <g class="hull">
    <defs>
      <clipPath id="vy-1980-hull"><path :d="HULL" /></clipPath>
      <linearGradient id="vy-1980-body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2c1658" />
        <stop offset="0.35" stop-color="#110725" />
        <stop offset="1" stop-color="#030108" />
      </linearGradient>
      <linearGradient id="vy-1980-chrome" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0b1d5e" />
        <stop offset="0.3" stop-color="#7fd8ff" />
        <stop offset="0.5" stop-color="#ffffff" />
        <stop offset="0.52" stop-color="#3a1640" />
        <stop offset="0.75" stop-color="#ff7ac8" />
        <stop offset="1" stop-color="#fff0fa" />
      </linearGradient>
      <linearGradient id="vy-1980-chromeV" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#0b1d5e" />
        <stop offset="0.45" stop-color="#bdeeff" />
        <stop offset="0.5" stop-color="#ffffff" />
        <stop offset="0.53" stop-color="#4a1a50" />
        <stop offset="1" stop-color="#ff8ad0" />
      </linearGradient>
      <linearGradient id="vy-1980-sun" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffe14a" />
        <stop offset="0.55" stop-color="#ff6a3d" />
        <stop offset="1" stop-color="#ff2bd6" />
      </linearGradient>
      <linearGradient id="vy-1980-canopy" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3a1f74" />
        <stop offset="1" stop-color="#0b0418" />
      </linearGradient>
    </defs>

    <!-- the canopy fairing, behind the hull's top edge -->
    <path :d="CANOPY" fill="url(#vy-1980-canopy)" />
    <path d="M -100 -320 L 252 -320 L 262 -306 L -102 -306 Z" fill="url(#vy-1980-chrome)" />
    <path :d="CANOPY" fill="none" :stroke="P[1].alt" stroke-width="16" stroke-opacity="0.22" stroke-linejoin="round" />
    <path :d="CANOPY" fill="none" :stroke="P[1].alt" stroke-width="4" stroke-linejoin="round" />
    <path d="M -118 -230 L 300 -230" :stroke="P[1].alt" stroke-width="2" opacity="0.5" />

    <!-- the hull -->
    <path :d="HULL" fill="url(#vy-1980-body)" />
    <g clip-path="url(#vy-1980-hull)">
      <rect v-for="(s, i) in sections" :key="`t${i}`" :x="s.x0" y="-160" :width="s.x1 - s.x0" height="320" :fill="P[i].alt" opacity="0.1" />
      <path v-for="(d, i) in fan" :key="`f${i}`" :d="d" stroke="#ff4fd8" stroke-width="1.6" opacity="0.32" />
      <path v-for="(d, i) in ribs" :key="`r${i}`" :d="d" :stroke="ink" stroke-width="1.4" opacity="0.22" />
      <!-- racing stripes along the deck, kicking down to the nose -->
      <path :d="stripe(22)" fill="none" :stroke="P[0].alt" stroke-width="5" />
      <path :d="stripe(34)" fill="none" :stroke="P[2].alt" stroke-width="5" />
      <path :d="stripe(46)" fill="none" :stroke="P[1].alt" stroke-width="5" />
      <!-- the chrome sill -->
      <path d="M -760 120 L 410 120 L 650 66 L 700 66 L 700 160 L -760 160 Z" fill="url(#vy-1980-chrome)" />
      <path d="M -760 120 L 410 120 L 650 66" fill="none" stroke="#fff" stroke-width="2" opacity="0.9" />
      <!-- neon section slashes -->
      <g v-for="(s, i) in sections" :key="`s${i}`">
        <template v-if="s.slash !== null">
          <path :d="`M ${s.slash + 40} -160 L ${s.slash - 40} 160`" :stroke="P[i].alt" stroke-width="22" opacity="0.2" />
          <path :d="`M ${s.slash + 40} -160 L ${s.slash - 40} 160`" :stroke="P[i].alt" stroke-width="5" />
          <path :d="`M ${s.slash + 58} -160 L ${s.slash - 22} 160`" :stroke="P[i + 1].alt" stroke-width="3" opacity="0.9" />
        </template>
      </g>
      <!-- the stern's afterburner can, lit -->
      <path d="M -760 -180 L -704 -180 L -704 160 L -760 160 Z" fill="#05010c" />
      <path d="M -708 -150 L -708 130" :stroke="P[2].glow" stroke-width="10" opacity="0.25" />
      <path d="M -708 -150 L -708 130" :stroke="P[2].glow" stroke-width="3" />
      <!-- the nose cone, chrome -->
      <path d="M 812 12 L 730 -36 L 724 60 Z" fill="url(#vy-1980-chromeV)" />
      <!-- a gloss sweep -->
      <path d="M -760 -176 L 330 -152 L 610 -100 L 560 -84 L 330 -130 L -760 -150 Z" fill="#fff" opacity="0.06" />
    </g>

    <!-- dome pedestals -->
    <path v-for="(d, i) in pedestals" :key="`p${i}`" :d="d" fill="#0b0418" :stroke="P[[0, 1, 2][i]].alt" stroke-width="3" stroke-linejoin="round" />

    <!-- the sliced-sun emblem, between the core turbine and the pods -->
    <g transform="translate(-34 -52)">
      <circle r="44" fill="#ff2bd6" opacity="0.18" />
      <circle r="34" fill="url(#vy-1980-sun)" />
      <rect v-for="(y, k) in slices" :key="k" x="-40" :y="y" width="80" :height="2 + k * 1.3" fill="#110725" />
      <circle r="34" fill="none" :stroke="ink" stroke-width="2.5" />
    </g>
    <path d="M -76 4 L -56 18 L -76 32 M -52 4 L -32 18 L -52 32 M -28 4 L -8 18 L -28 32" fill="none" :stroke="P[0].alt" stroke-width="4" stroke-linejoin="miter" />

    <!-- underglow off the grid -->
    <path d="M -700 160 L 400 160 L 646 104" fill="none" stroke="#ff2bd6" stroke-width="16" stroke-opacity="0.22" stroke-linecap="round" />
    <path d="M -700 160 L 400 160 L 646 104" fill="none" stroke="#ff2bd6" stroke-width="3" stroke-linecap="round" />

    <!-- the neon outline -->
    <path :d="HULL" fill="none" :stroke="ink" stroke-width="18" stroke-opacity="0.18" stroke-linejoin="round" />
    <path :d="HULL" fill="none" :stroke="ink" stroke-width="4.5" stroke-linejoin="round" />
    <path d="M 610 -100 L 330 -152 L -700 -172" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.7" />

    <!-- the name on the sill -->
    <text x="10" y="116" class="plate" transform="skewX(-14)" fill="url(#vy-1980-chrome)">VR-84</text>
  </g>
</template>

<style scoped>
.plate {
  font-family: 'Orbitron', 'Futura', sans-serif;
  font-size: 30px;
  font-weight: 900;
  letter-spacing: 4px;
  stroke: #110725;
  stroke-width: 1.5px;
  paint-order: stroke;
}
</style>
