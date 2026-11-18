<script setup lang="ts">
import type { CockpitDesign, Skin } from '../../../lib/voyage/cockpit/design'

/**
 * The EIGHTIES' cockpit, nearest the eye (out of focus): a rear-view mirror clipped to the canopy rail at the top
 * right, a mixtape swinging on its lanyard from the top left, and the seat's bolsters, piped in neon, at the edges.
 */
const props = defineProps<{ design: CockpitDesign; skin: Skin }>()
const C = props.skin.vco
</script>

<template>
  <g class="front1980">
    <defs>
      <linearGradient id="f80-mirror" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#2a1a4a" />
        <stop offset="0.45" stop-color="#7a2a7a" />
        <stop offset="0.5" stop-color="#ffb0e8" />
        <stop offset="0.56" stop-color="#3a1a5a" />
        <stop offset="1" stop-color="#0a0618" />
      </linearGradient>
      <linearGradient id="f80-tape" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f4f0ff" />
        <stop offset="1" stop-color="#b8b0d0" />
      </linearGradient>
    </defs>
    <!-- the mirror on its arm -->
    <path d="M 1500 -40 L 1470 12" stroke="#05040a" stroke-width="14" />
    <rect x="1350" y="6" width="210" height="52" rx="12" fill="#05040a" />
    <rect x="1358" y="12" width="194" height="40" rx="9" fill="url(#f80-mirror)" />
    <path d="M 1380 46 L 1530 20" :stroke="C[1]" stroke-width="3" opacity="0.6" />
    <!-- the mixtape on its lanyard -->
    <path d="M 60 -40 C 70 40 140 70 168 118" fill="none" stroke="#120a18" stroke-width="4" />
    <g transform="translate(168 118) rotate(18)">
      <rect x="-40" y="0" width="80" height="52" rx="4" fill="#120a18" />
      <rect x="-36" y="4" width="72" height="44" rx="3" fill="#2a1a3a" />
      <rect x="-32" y="8" width="64" height="12" rx="2" fill="url(#f80-tape)" />
      <rect x="-32" y="40" width="64" height="5" :fill="C[0]" />
      <rect x="-32" y="35" width="64" height="4" :fill="C[1]" />
      <rect x="-26" y="22" width="52" height="16" rx="8" fill="#1a1222" />
      <circle cx="-14" cy="30" r="5" fill="#f4f0ff" />
      <circle cx="14" cy="30" r="5" fill="#f4f0ff" />
    </g>
    <!-- the seat's bolsters, piped in neon -->
    <path d="M -300 1300 L -300 700 Q -120 720 -40 1300 Z" fill="#06050a" />
    <path d="M -280 720 Q -130 740 -60 1300" fill="none" :stroke="C[0]" stroke-width="4" />
    <path d="M 1900 1300 L 1900 700 Q 1720 720 1640 1300 Z" fill="#06050a" />
    <path d="M 1880 720 Q 1730 740 1660 1300" fill="none" :stroke="C[2]" stroke-width="4" />
  </g>
</template>
