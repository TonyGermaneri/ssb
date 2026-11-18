<script setup lang="ts">
import type { CockpitDesign, Skin } from '../../../lib/voyage/cockpit/design'

/** The THIRTIES' cockpit, nearest the eye (out of focus): the seat's Alcantara bolsters at the bottom corners with
 * their harness webbing, a coiled comms lead hanging down the left wall, and dirt on the lens catching the sun. */
defineProps<{ design: CockpitDesign; skin: Skin }>()
const dirt = [
  { x: 180, y: 120, r: 46, o: 0.07 },
  { x: 330, y: 260, r: 22, o: 0.09 },
  { x: 520, y: 90, r: 30, o: 0.05 },
  { x: 1180, y: 300, r: 38, o: 0.05 },
  { x: 1420, y: 160, r: 18, o: 0.07 },
  { x: 960, y: 140, r: 14, o: 0.06 },
]
const coil = Array.from({ length: 16 }, (_, i) => `M ${18 + Math.sin(i) * 2} ${150 + i * 14} c 14 -4 14 10 0 12`).join(' ')
</script>

<template>
  <g class="front2030">
    <defs>
      <linearGradient id="f30-bolster" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3a3d42" />
        <stop offset="0.3" stop-color="#16171a" />
        <stop offset="1" stop-color="#050506" />
      </linearGradient>
      <radialGradient id="f30-dirt" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#fff4e0" stop-opacity="0.5" />
        <stop offset="0.7" stop-color="#fff4e0" stop-opacity="0.25" />
        <stop offset="1" stop-color="#fff4e0" stop-opacity="0" />
      </radialGradient>
    </defs>
    <!-- the seat's bolsters, harness webbing -->
    <path d="M -300 1120 L -300 860 Q -290 800 -200 792 L -40 786 Q 14 788 18 850 L 22 1120 Z" fill="url(#f30-bolster)" />
    <path d="M -300 1120 L -300 860 Q -290 800 -200 792 L -40 786 Q 14 788 18 850 L 22 1120 Z" fill="url(#tx-velvet)" opacity="0.6" style="mix-blend-mode: overlay" />
    <path d="M 1900 1120 L 1900 860 Q 1890 800 1800 792 L 1640 786 Q 1586 788 1582 850 L 1578 1120 Z" fill="url(#f30-bolster)" />
    <path d="M 1900 1120 L 1900 860 Q 1890 800 1800 792 L 1640 786 Q 1586 788 1582 850 L 1578 1120 Z" fill="url(#tx-velvet)" opacity="0.6" style="mix-blend-mode: overlay" />
    <path d="M 1700 1120 L 1760 800" stroke="#2c3e52" stroke-width="34" />
    <rect x="1732" y="900" width="44" height="26" rx="4" fill="#b8bdc3" transform="rotate(10 1754 913)" />
    <!-- the comms lead, coiled down the left wall -->
    <path d="M 18 -40 V 150" stroke="#0b0c0d" stroke-width="5" fill="none" />
    <path :d="coil" stroke="#0b0c0d" stroke-width="4" fill="none" />
    <!-- lens dirt -->
    <circle v-for="(d, i) in dirt" :key="i" :cx="d.x" :cy="d.y" :r="d.r" fill="url(#f30-dirt)" :opacity="d.o * 6" style="mix-blend-mode: screen" />
  </g>
</template>
