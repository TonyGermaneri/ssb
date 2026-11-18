<script setup lang="ts">
import type { CockpitDesign, Skin } from '../../../lib/voyage/cockpit/design'

/**
 * The NOUGHTIES' cockpit, nearest the eye (soft): the pilot's two jelly armrests coming in at the bottom corners.
 */
defineProps<{ design: CockpitDesign; skin: Skin }>()
</script>

<template>
  <g class="front2000">
    <defs>
      <linearGradient id="f00-arm-b" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#8ae6ff" stop-opacity="0.9" />
        <stop offset="0.5" stop-color="#1aaee6" stop-opacity="0.8" />
        <stop offset="1" stop-color="#064a7a" stop-opacity="0.9" />
      </linearGradient>
      <linearGradient id="f00-arm-t" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffd27a" stop-opacity="0.9" />
        <stop offset="0.5" stop-color="#ff8a1a" stop-opacity="0.8" />
        <stop offset="1" stop-color="#7a2c02" stop-opacity="0.9" />
      </linearGradient>
    </defs>
    <!-- the armrests -->
    <path d="M -420 1180 Q -380 940 -120 905 L 30 900 Q 70 902 70 940 L 60 1180 Z" fill="url(#f00-arm-b)" />
    <path d="M -300 960 Q -160 912 20 914" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity="0.7" />
    <path d="M 2020 1180 Q 1980 940 1720 905 L 1570 900 Q 1530 902 1530 940 L 1540 1180 Z" fill="url(#f00-arm-t)" />
    <path d="M 1900 960 Q 1760 912 1580 914" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity="0.7" />
  </g>
</template>
