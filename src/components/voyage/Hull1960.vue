<script setup lang="ts">
import type { Era } from '../../lib/voyage/ship'

/**
 * The SIXTIES ship's hull (lib/voyage/eras/e1960.ts): a fat sub, its three sections in their colours under a groovy
 * band, daisies, riveted seams, the name on the bow and the bridge on top. Static; the parts are drawn around it.
 */
const props = defineProps<{ era: Era }>()
const P = props.era.palettes
const ink = props.era.ink
const HULL =
  'M -664 10 C -650 -118 -430 -176 -160 -180 L 380 -172 C 600 -164 748 -96 788 4 C 752 118 604 190 380 198 L -160 198 C -430 194 -650 140 -664 10 Z'
const SECTION_X = [250, -220]
const N = (n: number) => Array.from({ length: n }, (_, i) => i)
const sections = [
  { x: SECTION_X[0], w: 600 },
  { x: SECTION_X[1], w: SECTION_X[0] - SECTION_X[1] },
  { x: -700, w: SECTION_X[1] + 700 },
]
function band(i: number) {
  const s = sections[i]
  const y = i === 1 ? 120 : 112
  let d = `M ${s.x} ${y}`
  for (let x = s.x; x <= s.x + s.w; x += 20) d += ` L ${x} ${y + Math.sin(x / 38 + i) * 12}`
  d += ` L ${s.x + s.w} ${y + 44}`
  for (let x = s.x + s.w; x >= s.x; x -= 20) d += ` L ${x} ${y + 44 + Math.sin(x / 38 + i + 1.2) * 12}`
  return d + ' Z'
}
const daisies = [
  { x: 640, y: -60, r: 18, vco: 0 },
  { x: 220, y: -110, r: 14, vco: 1 },
  { x: -200, y: 150, r: 16, vco: 1 },
  { x: -600, y: -40, r: 16, vco: 2 },
  { x: -300, y: 120, r: 13, vco: 2 },
  { x: 610, y: 120, r: 12, vco: 0 },
]
const petals = (r: number) => N(8).map((i) => ({ x: Math.cos((i * Math.PI) / 4) * r, y: Math.sin((i * Math.PI) / 4) * r }))
</script>

<template>
  <g class="hull">
    <defs>
      <clipPath id="vy-hull-1960"><path :d="HULL" /></clipPath>
    </defs>
    <g clip-path="url(#vy-hull-1960)">
      <rect v-for="(s, i) in sections" :key="i" :x="s.x" y="-200" :width="s.w" height="420" :fill="P[i].main" />
      <path v-for="(_, i) in sections" :key="`b${i}`" :d="band(i)" :fill="P[i].alt" :stroke="ink" stroke-width="4" />
      <g v-for="d in daisies" :key="`${d.x}`" :transform="`translate(${d.x} ${d.y})`">
        <circle v-for="(q, k) in petals(d.r * 0.9)" :key="k" :cx="q.x" :cy="q.y" :r="d.r * 0.55" fill="#fff" :stroke="ink" stroke-width="3" />
        <circle :r="d.r * 0.55" :fill="P[d.vco].alt" :stroke="ink" stroke-width="3" />
      </g>
      <rect x="-700" y="-200" width="1500" height="420" fill="url(#vy-gloss)" />
      <g v-for="x in SECTION_X" :key="x">
        <rect :x="x - 12" y="-200" width="24" height="420" :fill="ink" opacity="0.9" />
        <circle v-for="k in N(9)" :key="k" :cx="x" :cy="-160 + k * 42" r="4.5" fill="#ffe9a8" />
      </g>
    </g>
    <path :d="HULL" fill="none" :stroke="ink" stroke-width="9" stroke-linejoin="round" />
    <g transform="translate(640 150) rotate(-8)">
      <rect x="-62" y="-20" width="124" height="40" rx="20" :fill="ink" />
      <text x="0" y="10" text-anchor="middle" class="plate">S·S·B</text>
    </g>
    <path d="M -160 -178 L -144 -330 Q -140 -350 -118 -350 L 196 -350 Q 218 -350 222 -330 L 238 -178 Z" :fill="P[1].alt" :stroke="ink" stroke-width="8" stroke-linejoin="round" />
    <path d="M -150 -200 H 228" :stroke="P[1].hi" stroke-width="6" stroke-dasharray="2 16" stroke-linecap="round" />
    <rect x="-150" y="-344" width="378" height="22" rx="10" fill="url(#vy-gloss)" opacity="0.6" />
  </g>
</template>

<style scoped>
.plate {
  font-family: 'Arial Rounded MT Bold', 'Orbitron', sans-serif;
  font-size: 26px;
  font-weight: 900;
  letter-spacing: 3px;
  fill: #ffe9a8;
}
</style>
