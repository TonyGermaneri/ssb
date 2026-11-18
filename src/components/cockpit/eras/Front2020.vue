<script setup lang="ts">
import type { CockpitDesign, Skin } from '../../../lib/voyage/cockpit/design'

/** The TWENTIES' cockpit, nearest the eye (very soft): the seat's frosted-glass armrests rising at the bottom
 * corners, each with a lit edge, and a card's reflection ghosting faintly in the windscreen. */
defineProps<{ design: CockpitDesign; skin: Skin }>()
</script>

<template>
  <g class="front2020">
    <defs>
      <linearGradient id="f20-arm" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3a3c52" />
        <stop offset="0.25" stop-color="#1c1d29" />
        <stop offset="1" stop-color="#07080c" />
      </linearGradient>
      <linearGradient id="f20-armedge" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#a08cff" />
        <stop offset="0.5" stop-color="#4d7cff" />
        <stop offset="1" stop-color="#ff8f80" />
      </linearGradient>
      <linearGradient id="f20-ghost" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0" />
        <stop offset="1" stop-color="#fff" stop-opacity="0.05" />
      </linearGradient>
    </defs>
    <!-- the armrests -->
    <path d="M -260 1100 L -260 840 Q -250 790 -180 786 L -60 780 Q 10 780 14 840 L 20 1100 Z" fill="url(#f20-arm)" />
    <path d="M -180 786 L -60 780 Q 10 780 14 840" fill="none" stroke="url(#f20-armedge)" stroke-width="3" opacity="0.8" />
    <path d="M 1860 1100 L 1860 840 Q 1850 790 1780 786 L 1660 780 Q 1590 780 1586 840 L 1580 1100 Z" fill="url(#f20-arm)" />
    <path d="M 1780 786 L 1660 780 Q 1590 780 1586 840" fill="none" stroke="url(#f20-armedge)" stroke-width="3" opacity="0.8" />
    <!-- the cards, ghosting in the glass -->
    <g opacity="0.8">
      <rect x="120" y="300" width="360" height="110" rx="26" fill="url(#f20-ghost)" transform="skewX(-8)" />
      <rect x="640" y="320" width="340" height="96" rx="26" fill="url(#f20-ghost)" transform="skewX(-2)" />
      <rect x="1180" y="300" width="360" height="110" rx="26" fill="url(#f20-ghost)" transform="skewX(6)" />
    </g>
  </g>
</template>
