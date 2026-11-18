<script setup lang="ts">
import type { CockpitDesign, Skin } from '../../../lib/voyage/cockpit/design'

/**
 * The NINETIES' cockpit, nearest the eye (out of focus): the seat's candy-plastic armrests coming in at the far edges.
 */
const props = defineProps<{ design: CockpitDesign; skin: Skin }>()
const C = props.skin.vco
</script>

<template>
  <g class="front1990">
    <defs>
      <linearGradient id="f90-chrome" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.3" stop-color="#9fdcff" />
        <stop offset="0.5" stop-color="#241858" />
        <stop offset="0.75" stop-color="#ffd2f6" />
        <stop offset="1" stop-color="#6d58c0" />
      </linearGradient>
    </defs>
    <!-- the armrests, past the stage -->
    <path d="M -420 1300 L -420 760 Q -220 720 -110 840 L -80 1300 Z" :fill="C[0]" opacity="0.85" />
    <path d="M -400 780 Q -230 745 -125 850" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity="0.7" />
    <path d="M 2020 1300 L 2020 760 Q 1820 720 1710 840 L 1680 1300 Z" :fill="C[2]" opacity="0.85" />
    <path d="M 2000 780 Q 1830 745 1725 850" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity="0.7" />
  </g>
</template>
