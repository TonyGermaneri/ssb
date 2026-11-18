<script setup lang="ts">
import type { CockpitDesign, Skin } from '../../../lib/voyage/cockpit/design'

/** The FIFTIES' cockpit, nearest the eye (and out of focus): a copper pipe's elbow at the bottom left, the pilot's
 * leather armrest at the bottom right, a frayed cable dangling from the ceiling. */
defineProps<{ design: CockpitDesign; skin: Skin }>()
</script>

<template>
  <g class="front1950">
    <!-- a copper elbow coming in from below -->
    <path d="M -120 960 L -120 840 Q -120 760 -40 760 L 60 760" fill="none" stroke="#1a0804" stroke-width="86" />
    <path d="M -120 960 L -120 840 Q -120 760 -40 760 L 60 760" fill="none" stroke="url(#b50-copperV)" stroke-width="70" />
    <rect x="40" y="718" width="30" height="84" rx="6" fill="url(#b50-brassV)" />
    <!-- the armrest, oxblood leather, buttoned -->
    <path d="M 1440 1000 Q 1470 820 1660 800 L 1760 800 L 1760 1000 Z" fill="#3a0c08" />
    <path d="M 1440 1000 Q 1470 820 1660 800 L 1760 800 L 1760 1000 Z" fill="url(#tx-leather)" opacity="0.7" style="mix-blend-mode: overlay" />
    <path d="M 1470 990 Q 1495 845 1660 828" fill="none" stroke="#c99a3c" stroke-width="3" stroke-dasharray="6 6" opacity="0.6" />
    <!-- a frayed cable hanging from the ceiling -->
    <path d="M 120 -20 C 110 60 150 120 130 190" fill="none" stroke="#0e0a08" stroke-width="12" stroke-linecap="round" />
    <path d="M 130 190 l -6 14 M 130 190 l 2 16 M 130 190 l 8 12" stroke="#d88b3a" stroke-width="2.4" fill="none" />
  </g>
</template>
