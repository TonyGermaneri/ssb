<script setup lang="ts">
import type { Era } from '../../lib/voyage/ship'

/**
 * The NINETIES ship's hull (lib/voyage/eras/e1990.ts): a fat bean, each section a tube of fake-3D gradient joined by
 * S-curved bevelled seams, a big two-tone swoosh, a hot specular streak and a lime rim light, a chrome-ringed rear fan
 * and an afterburner pod slung below. Static; the parts are drawn around it. No filters: everything is gradients.
 */
const props = defineProps<{ era: Era }>()
const P = props.era.palettes
const ink = props.era.ink
const HULL =
  'M 792 14 C 792 -110 684 -190 520 -198 C 320 -206 170 -242 -40 -242 C -250 -242 -420 -208 -560 -196 C -690 -190 -744 -120 -744 -10 C -744 80 -690 146 -560 166 C -380 194 -160 208 40 208 C 260 208 420 200 540 184 C 690 164 792 116 792 14 Z'
const SEAM_BOW = 'M 250 -260 C 210 -100 270 60 220 260'
const SEAM_STERN = 'M -280 -260 C -320 -100 -260 60 -310 260'
const regions = [
  `${SEAM_BOW} L 830 260 L 830 -260 Z`,
  `${SEAM_STERN} L 220 260 C 270 60 210 -100 250 -260 Z`,
  `${SEAM_STERN} L -830 260 L -830 -260 Z`,
]
const SWOOSH = 'M -730 84 C -360 140 160 150 680 18 C 420 140 60 186 -200 182 C -420 178 -600 140 -730 84 Z'
const SWOOSH2 = 'M -720 116 C -560 166 -380 190 -180 196 C 80 198 380 150 600 70 C 420 190 60 220 -180 218 C -420 216 -600 180 -720 116 Z'
const POD = 'M -712 132 C -712 92 -690 64 -640 64 L -500 64 C -470 64 -452 96 -452 132 C -452 170 -470 202 -500 202 L -640 202 C -690 202 -712 172 -712 132 Z'
/** sphere-shaded bolts in the gaps between parts */
const bolts = [
  { x: 600, y: 120, vco: 0 },
  { x: 330, y: 110, vco: 0 },
  { x: -10, y: -16, vco: 1 },
  { x: 160, y: 120, vco: 1 },
  { x: -660, y: 40, vco: 2 },
  { x: -380, y: 130, vco: 2 },
]
</script>

<template>
  <g class="hull">
    <defs>
      <clipPath id="vy-1990-hull"><path :d="HULL" /></clipPath>
      <linearGradient v-for="(p, i) in P" :id="`vy-1990-tube${i}`" :key="i" gradientUnits="userSpaceOnUse" x1="0" y1="-242" x2="0" y2="208">
        <stop offset="0" :stop-color="p.main" />
        <stop offset="0.13" :stop-color="p.hi" />
        <stop offset="0.34" :stop-color="p.main" />
        <stop offset="0.66" :stop-color="p.main" />
        <stop offset="1" :stop-color="p.deep" />
      </linearGradient>
      <linearGradient id="vy-1990-swoosh" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" :stop-color="P[2].glow" />
        <stop offset="0.55" stop-color="#ff9fe4" />
        <stop offset="1" stop-color="#ffffff" />
      </linearGradient>
      <linearGradient id="vy-1990-chrome" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.35" stop-color="#9fb2dc" />
        <stop offset="0.5" stop-color="#2c3770" />
        <stop offset="0.62" stop-color="#e8f0ff" />
        <stop offset="1" stop-color="#7180b8" />
      </linearGradient>
      <linearGradient id="vy-1990-pod" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f4f7ff" />
        <stop offset="0.3" stop-color="#a8b6e0" />
        <stop offset="0.7" :stop-color="P[2].alt" />
        <stop offset="1" stop-color="#0b1440" />
      </linearGradient>
      <linearGradient id="vy-1990-spec" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.85" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </linearGradient>
      <radialGradient id="vy-1990-ball" cx="0.35" cy="0.3" r="0.75">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.35" stop-color="#b9c6ee" />
        <stop offset="1" stop-color="#1c2252" />
      </radialGradient>
    </defs>

    <!-- the afterburner pod, slung under the stern -->
    <path :d="POD" fill="url(#vy-1990-pod)" :stroke="ink" stroke-width="8" />
    <path d="M -690 96 C -640 80 -540 80 -480 96" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity="0.7" />
    <path d="M -560 64 L -560 202 M -600 64 L -600 202" :stroke="ink" stroke-width="4" opacity="0.5" />

    <!-- the hull: three tubes of gradient -->
    <path :d="HULL" :fill="P[1].main" />
    <g clip-path="url(#vy-1990-hull)">
      <path v-for="(d, i) in regions" :key="`g${i}`" :d="d" :fill="`url(#vy-1990-tube${i})`" />
      <!-- a soft core shadow along the belly, for the bulge -->
      <ellipse cx="20" cy="250" rx="900" ry="110" :fill="ink" opacity="0.28" />
      <!-- the swoosh -->
      <path :d="SWOOSH" fill="url(#vy-1990-swoosh)" :stroke="ink" stroke-width="5" stroke-linejoin="round" />
      <path :d="SWOOSH2" :fill="P[2].alt" :stroke="ink" stroke-width="4" stroke-linejoin="round" />
      <!-- bevelled seams -->
      <g v-for="(d, i) in [SEAM_BOW, SEAM_STERN]" :key="`s${i}`">
        <path :d="d" fill="none" :stroke="ink" stroke-width="16" opacity="0.55" />
        <path :d="d" fill="none" :stroke="ink" stroke-width="7" />
        <path :d="d" fill="none" stroke="#fff" stroke-width="3" opacity="0.75" transform="translate(7 -2)" />
      </g>
      <!-- a waist panel line, bevelled -->
      <path d="M -760 -60 C -400 -40 200 -40 800 -70" fill="none" :stroke="ink" stroke-width="4" opacity="0.45" />
      <path d="M -760 -56 C -400 -36 200 -36 800 -66" fill="none" stroke="#fff" stroke-width="2" opacity="0.4" />
      <!-- the lime rim light under the belly -->
      <path d="M -744 -10 C -744 80 -690 146 -560 166 C -380 194 -160 208 40 208 C 260 208 420 200 540 184 C 690 164 792 116 792 14" fill="none" :stroke="P[0].glow" stroke-width="14" opacity="0.55" />
      <!-- the hot specular streak along the back -->
      <path d="M -640 -168 C -420 -200 -250 -230 -40 -230 C 170 -230 320 -194 520 -186 C 640 -182 720 -140 760 -80 C 700 -150 600 -166 520 -170 C 320 -178 170 -206 -40 -206 C -250 -206 -420 -180 -640 -168 Z" fill="url(#vy-1990-spec)" />
    </g>

    <!-- ray-traced glints -->
    <ellipse cx="700" cy="-96" rx="34" ry="12" transform="rotate(38 700 -96)" fill="#fff" opacity="0.8" />
    <ellipse cx="-660" cy="-150" rx="26" ry="9" transform="rotate(-34 -660 -150)" fill="#fff" opacity="0.65" />

    <!-- the hull's outline -->
    <path :d="HULL" fill="none" :stroke="ink" stroke-width="9" stroke-linejoin="round" />

    <!-- a fillet under the tail fin -->
    <path d="M -736 -96 C -712 -170 -660 -196 -566 -200 L -566 -182 C -650 -180 -700 -150 -720 -92 Z" fill="url(#vy-1990-tube2)" :stroke="ink" stroke-width="5" stroke-linejoin="round" />

    <!-- the rear fan's chrome cowl and its pylon -->
    <path d="M -760 -40 L -700 -40 L -700 -10 L -760 -10 Z" fill="url(#vy-1990-chrome)" :stroke="ink" stroke-width="5" />
    <circle cx="-752" cy="-56" r="70" fill="none" :stroke="ink" stroke-width="22" />
    <circle cx="-752" cy="-56" r="70" fill="none" stroke="url(#vy-1990-chrome)" stroke-width="13" />

    <!-- bolts -->
    <g v-for="(b, i) in bolts" :key="`b${i}`">
      <circle :cx="b.x" :cy="b.y" r="11" fill="url(#vy-1990-ball)" :stroke="ink" stroke-width="3.5" />
    </g>

    <!-- the badge -->
    <g transform="translate(500 154) rotate(-8)">
      <rect x="-82" y="-26" width="164" height="44" rx="22" :fill="ink" />
      <rect x="-76" y="-21" width="152" height="12" rx="6" fill="#fff" opacity="0.18" />
      <text x="0" y="10" text-anchor="middle" class="plate" fill="url(#vy-1990-chrome)">HX-2K</text>
    </g>
  </g>
</template>

<style scoped>
.plate {
  font-family: 'Arial Black', 'Impact', sans-serif;
  font-size: 30px;
  font-style: italic;
  font-weight: 900;
  letter-spacing: 1px;
}
</style>
