<script setup lang="ts">
import type { CockpitDesign, Skin } from '../../../lib/voyage/cockpit/design'

/** The SIXTIES' cockpit, nearest the eye (and out of focus): bead curtains at the edges, a prism hanging on its
 * thread at the top left, a big soft daisy creeping in at the bottom corners. */
defineProps<{ design: CockpitDesign; skin: Skin }>()
const BEADS = ['#ff2e88', '#ffd21f', '#2fe0c4', '#7a3cff', '#ff7a1a', '#a6ff2e', '#ff3df0']
const strand = (x: number, sway: number, n: number, k: number) =>
  Array.from({ length: n }, (_, i) => ({ x: x + Math.sin(i * 0.35 + k) * sway, y: -20 + i * 19, c: BEADS[(i + k * 2) % BEADS.length], r: i % 3 === 1 ? 7 : 5 }))
const strands = [
  ...[-70, -48, -26, -6].map((x, k) => strand(x, 6 + k * 2, 52 - k * 4, k)),
  ...[1606, 1626, 1648, 1670].map((x, k) => strand(x, 6 + k * 2, 40 + k * 4, k + 4)),
]
</script>

<template>
  <g class="front1960">
    <!-- bead curtains -->
    <g v-for="(s, k) in strands" :key="k">
      <path :d="`M ${s.map((b) => `${b.x} ${b.y}`).join(' L ')}`" stroke="#fff6c2" stroke-width="1" fill="none" opacity="0.6" />
      <circle v-for="(b, i) in s" :key="i" :cx="b.x" :cy="b.y" :r="b.r" :fill="b.c" opacity="0.92" />
      <circle v-for="(b, i) in s" :key="`h${i}`" :cx="b.x - b.r * 0.35" :cy="b.y - b.r * 0.35" :r="b.r * 0.35" fill="#fff" opacity="0.7" />
    </g>
    <!-- a prism on its thread -->
    <line x1="176" y1="-40" x2="176" y2="150" stroke="#fff6c2" stroke-width="1.5" opacity="0.7" />
    <g transform="translate(176 190)">
      <path d="M 0 -42 L 30 -6 L 0 58 L -30 -6 Z" fill="url(#b60-gem)" opacity="0.85" />
      <path d="M 0 -42 L 30 -6 L 0 58 Z" fill="#ff3df0" opacity="0.3" />
      <path d="M 0 -42 L -30 -6 L 0 58 Z" fill="#2fe0c4" opacity="0.25" />
      <path d="M -30 -6 H 30" stroke="#fff" stroke-width="2" opacity="0.8" />
    </g>
    <!-- daisies creeping in -->
    <g v-for="(d, i) in [{ x: -70, y: 960, r: 120, c: '#fff6c2' }, { x: 1690, y: 980, r: 120, c: '#ffc6e6' }]" :key="`d${i}`" :transform="`translate(${d.x} ${d.y})`">
      <ellipse v-for="k in 12" :key="k" cx="0" :cy="-d.r * 0.55" :rx="d.r * 0.2" :ry="d.r * 0.5" :transform="`rotate(${k * 30})`" :fill="d.c" opacity="0.95" />
      <circle :r="d.r * 0.28" fill="#ff7a1a" />
    </g>
  </g>
</template>
