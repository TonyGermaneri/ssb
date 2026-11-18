<script setup lang="ts">
import type { CockpitDesign, Skin } from '../../../lib/voyage/cockpit/design'

/** The SEVENTIES' cockpit, nearest the eye (and out of focus): the captain's tan vinyl armrests coming in at the bottom corners. */
defineProps<{ design: CockpitDesign; skin: Skin }>()
</script>

<template>
  <g class="front1970">
    <!-- the armrests -->
    <path d="M -400 1000 L -400 760 Q -200 730 -10 770 Q 20 800 10 1000 Z" fill="#8a5a34" />
    <path d="M -400 1000 L -400 760 Q -200 730 -10 770 Q 20 800 10 1000 Z" fill="url(#tx-leather)" opacity="0.7" style="mix-blend-mode: overlay" />
    <path d="M -380 776 Q -200 748 -20 786" fill="none" stroke="#e2c98a" stroke-width="2" stroke-dasharray="6 5" opacity="0.6" />
    <path d="M 2000 1000 L 2000 760 Q 1800 730 1610 770 Q 1580 800 1590 1000 Z" fill="#8a5a34" />
    <path d="M 2000 1000 L 2000 760 Q 1800 730 1610 770 Q 1580 800 1590 1000 Z" fill="url(#tx-leather)" opacity="0.7" style="mix-blend-mode: overlay" />
    <path d="M 1980 776 Q 1800 748 1620 786" fill="none" stroke="#e2c98a" stroke-width="2" stroke-dasharray="6 5" opacity="0.6" />
  </g>
</template>
