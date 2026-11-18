<script setup lang="ts">
import type { CockpitDesign, Skin } from '../../../lib/voyage/cockpit/design'

/**
 * The TWENTIES' cockpit, behind its controls: a graphite cabin (soft-touch, pebble-dark) round a wide windscreen with
 * soft corners and an iridescent hairline, a mesh-gradient aurora washing the headliner, an ambient light strip along
 * the dash's lip, and three frosted-glass cards floating over it -- each tinted its VCO's colour, lit from beneath by
 * its own underglow, its faders and dials sitting in softer wells. The frost is faked: layered translucent gradients,
 * the noise tile, a bright top edge, no backdrop filter.
 */
const props = defineProps<{ design: CockpitDesign; skin: Skin }>()
/** each card's left edge (as c2020.ts) */
const X0 = (vco: number) => 28 + vco * 520
const W = 504
const TOP = 462
const H = 432
const NAMES = ['BOW', 'MIDSHIPS', 'STERN']
const TINTS = ['VIOLET', 'MINT', 'CORAL']
const bulk = () => `M -700 -500 H 2300 V 1500 H -700 Z ${props.design.glass}`
/** the dash's top edge: following the windscreen's bowed sill */
const dashTop = 'M -700 430 L 40 404 Q 60 432 140 432 Q 800 472 1460 432 Q 1540 432 1560 404 L 2300 430 V 1500 H -700 Z'
const vcoC = (v: number) => props.skin.vco[v]
</script>

<template>
  <g class="back2020">
    <defs>
      <linearGradient id="b20-cabin" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0c0d14" />
        <stop offset="0.4" stop-color="#161722" />
        <stop offset="1" stop-color="#08090e" />
      </linearGradient>
      <radialGradient id="b20-auroraV" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#7b5cff" stop-opacity="0.55" />
        <stop offset="0.5" stop-color="#5b3cff" stop-opacity="0.18" />
        <stop offset="1" stop-color="#5b3cff" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="b20-auroraM" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#2fc9a0" stop-opacity="0.45" />
        <stop offset="0.5" stop-color="#14b8a6" stop-opacity="0.14" />
        <stop offset="1" stop-color="#14b8a6" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="b20-auroraC" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ff5f72" stop-opacity="0.45" />
        <stop offset="0.5" stop-color="#ff8f80" stop-opacity="0.12" />
        <stop offset="1" stop-color="#ff8f80" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="b20-auroraB" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#2f6bff" stop-opacity="0.5" />
        <stop offset="1" stop-color="#2f6bff" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="b20-iris" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ff8f80" />
        <stop offset="0.3" stop-color="#a08cff" />
        <stop offset="0.5" stop-color="#4d7cff" />
        <stop offset="0.72" stop-color="#5ef0c4" />
        <stop offset="1" stop-color="#ff8f80" />
      </linearGradient>
      <linearGradient id="b20-frame" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2a2c3a" />
        <stop offset="0.5" stop-color="#14151e" />
        <stop offset="1" stop-color="#262838" />
      </linearGradient>
      <linearGradient id="b20-dash" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2b2d3d" />
        <stop offset="0.06" stop-color="#1a1b27" />
        <stop offset="0.5" stop-color="#101118" />
        <stop offset="1" stop-color="#06070b" />
      </linearGradient>
      <linearGradient id="b20-lip" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.22" />
        <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
      </linearGradient>
      <!-- the cards: frost, tint, edge -->
      <linearGradient id="b20-frost" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.16" />
        <stop offset="0.35" stop-color="#ffffff" stop-opacity="0.07" />
        <stop offset="1" stop-color="#ffffff" stop-opacity="0.03" />
      </linearGradient>
      <linearGradient id="b20-edge" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.55" />
        <stop offset="0.25" stop-color="#ffffff" stop-opacity="0.14" />
        <stop offset="0.8" stop-color="#ffffff" stop-opacity="0.05" />
        <stop offset="1" stop-color="#ffffff" stop-opacity="0.18" />
      </linearGradient>
      <linearGradient id="b20-well" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000" stop-opacity="0.38" />
        <stop offset="1" stop-color="#000" stop-opacity="0.16" />
      </linearGradient>
      <linearGradient id="b20-wellEdge" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000" stop-opacity="0.5" />
        <stop offset="1" stop-color="#fff" stop-opacity="0.16" />
      </linearGradient>
      <radialGradient id="b20-shadow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#000" stop-opacity="0.7" />
        <stop offset="1" stop-color="#000" stop-opacity="0" />
      </radialGradient>
      <template v-for="v in [0, 1, 2]" :key="`d${v}`">
        <radialGradient :id="`b20-tint${v}`" cx="0.15" cy="0" r="1.1">
          <stop offset="0" :stop-color="vcoC(v)" stop-opacity="0.42" />
          <stop offset="0.45" :stop-color="vcoC(v)" stop-opacity="0.12" />
          <stop offset="1" :stop-color="vcoC(v)" stop-opacity="0.02" />
        </radialGradient>
        <radialGradient :id="`b20-under${v}`" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" :stop-color="vcoC(v)" stop-opacity="0.55" />
          <stop offset="0.45" :stop-color="vcoC(v)" stop-opacity="0.16" />
          <stop offset="1" :stop-color="vcoC(v)" stop-opacity="0" />
        </radialGradient>
        <linearGradient :id="`b20-floor${v}`" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.6" :stop-color="vcoC(v)" stop-opacity="0" />
          <stop offset="1" :stop-color="vcoC(v)" stop-opacity="0.16" />
        </linearGradient>
        <linearGradient :id="`b20-hair${v}`" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" :stop-color="vcoC(v)" stop-opacity="0" />
          <stop offset="0.5" :stop-color="vcoC(v)" stop-opacity="0.9" />
          <stop offset="1" :stop-color="vcoC(v)" stop-opacity="0" />
        </linearGradient>
      </template>
      <clipPath id="b20-dashclip"><path :d="dashTop" /></clipPath>
    </defs>

    <!-- the cabin: soft-touch graphite, everything but the glass -->
    <path :d="bulk()" fill-rule="evenodd" fill="url(#b20-cabin)" />
    <!-- the aurora washing the headliner and the walls (light from outside, bounced) -->
    <g :clip-path="undefined">
      <ellipse cx="260" cy="-10" rx="620" ry="170" fill="url(#b20-auroraV)" />
      <ellipse cx="900" cy="-40" rx="560" ry="140" fill="url(#b20-auroraB)" opacity="0.7" />
      <ellipse cx="1380" cy="-10" rx="560" ry="160" fill="url(#b20-auroraC)" />
      <ellipse cx="-80" cy="300" rx="200" ry="420" fill="url(#b20-auroraM)" opacity="0.8" />
      <ellipse cx="1690" cy="300" rx="200" ry="420" fill="url(#b20-auroraV)" opacity="0.8" />
    </g>
    <path :d="bulk()" fill-rule="evenodd" fill="url(#tx-noise)" opacity="0.18" style="mix-blend-mode: overlay" />
    <!-- headliner seams, softly stitched -->
    <path d="M -700 -6 Q 800 26 2300 -6" fill="none" stroke="#000" stroke-width="2" opacity="0.4" />
    <path d="M -700 -4 Q 800 28 2300 -4" fill="none" stroke="#fff" stroke-width="0.7" opacity="0.08" />
    <!-- the headliner (taller screens): a frosted overhead strip with soft reading lights -->
    <g>
      <rect x="200" y="-250" width="1200" height="200" rx="40" fill="url(#b20-frost)" />
      <rect x="200" y="-250" width="1200" height="200" rx="40" fill="url(#tx-noise)" opacity="0.25" style="mix-blend-mode: soft-light" />
      <rect x="200.75" y="-249.25" width="1198.5" height="198.5" rx="39.25" fill="none" stroke="url(#b20-edge)" stroke-width="1.5" />
      <g v-for="k in 4" :key="`rl${k}`" :transform="`translate(${200 + k * 240} -150)`">
        <ellipse rx="56" ry="20" fill="#e8ecff" opacity="0.08" />
        <rect x="-40" y="-6" width="80" height="12" rx="6" fill="#e8ecff" opacity="0.22" />
        <rect x="-34" y="-2" width="68" height="4" rx="2" fill="url(#b20-iris)" opacity="0.8" />
      </g>
      <rect x="640" y="-30" width="320" height="10" rx="5" fill="url(#b20-iris)" opacity="0.45" />
    </g>
    <!-- light pills down the pillars -->
    <g v-for="(px, k) in [14, 1586]" :key="`pp${k}`">
      <rect :x="px - 4" y="110" width="8" height="250" rx="4" fill="url(#b20-iris)" opacity="0.18" transform-origin="center" />
      <rect :x="px - 1.5" y="120" width="3" height="230" rx="1.5" :fill="k ? '#ff8f80' : '#a08cff'" opacity="0.8" />
    </g>

    <!-- the windscreen's frame: soft, thick, with an iridescent hairline -->
    <path :d="design.glass" fill="none" stroke="#000" stroke-width="44" opacity="0.35" transform="translate(0 6)" />
    <path :d="design.glass" fill="none" stroke="url(#b20-frame)" stroke-width="34" />
    <path :d="design.glass" fill="none" stroke="#fff" stroke-width="1" opacity="0.18" transform="translate(0 -15)" />
    <path :d="design.glass" fill="none" stroke="#000" stroke-width="6" opacity="0.55" />
    <path :d="design.glass" fill="none" stroke="url(#b20-iris)" stroke-width="1.6" opacity="0.75" />
    <!-- tiny sensor cluster at the top of the glass -->
    <g transform="translate(800 24)">
      <rect x="-46" y="-9" width="92" height="18" rx="9" fill="#05060a" stroke="#ffffff" stroke-opacity="0.12" />
      <circle cx="-26" cy="0" r="3.4" fill="#10131f" stroke="#4d7cff" stroke-opacity="0.6" />
      <circle cx="-26" cy="0" r="1.2" fill="#8fb4ff" />
      <circle cx="0" cy="0" r="2.2" fill="#1a1c28" />
      <circle cx="22" cy="0" r="1.6" fill="#5ef0c4" opacity="0.9" />
    </g>

    <!-- the dash: sculpted graphite under its soft lip -->
    <path :d="dashTop" fill="url(#b20-dash)" />
    <path :d="dashTop" fill="url(#tx-noise)" opacity="0.22" style="mix-blend-mode: overlay" />
    <g clip-path="url(#b20-dashclip)">
      <path d="M -700 430 L 40 404 Q 60 432 140 432 Q 800 472 1460 432 Q 1540 432 1560 404 L 2300 430 L 2300 480 Q 800 520 -700 480 Z" fill="url(#b20-lip)" />
      <!-- the aurora pooling on the dash -->
      <ellipse cx="290" cy="470" rx="420" ry="70" fill="url(#b20-auroraV)" opacity="0.6" />
      <ellipse cx="800" cy="480" rx="420" ry="60" fill="url(#b20-auroraM)" opacity="0.6" />
      <ellipse cx="1320" cy="470" rx="420" ry="70" fill="url(#b20-auroraC)" opacity="0.6" />
    </g>
    <!-- the ambient light strip along the lip -->
    <path d="M 140 438 Q 800 478 1460 438" fill="none" stroke="url(#b20-iris)" stroke-width="7" opacity="0.18" />
    <path d="M 140 438 Q 800 478 1460 438" fill="none" stroke="url(#b20-iris)" stroke-width="1.6" opacity="0.95" />
    <!-- side cards (wider screens): frosted, floating, with the ship's calm readouts -->
    <g v-for="(sx, k) in [-512, 1600 + 12]" :key="`sd${k}`">
      <ellipse :cx="sx + 250" cy="840" rx="320" ry="120" :fill="`url(#b20-under${k ? 2 : 0})`" opacity="0.7" />
      <rect :x="sx" y="480" width="500" height="420" rx="30" fill="#0e0f18" opacity="0.5" />
      <rect :x="sx" y="480" width="500" height="420" rx="30" :fill="`url(#b20-tint${k ? 2 : 0})`" />
      <rect :x="sx" y="480" width="500" height="420" rx="30" fill="url(#b20-frost)" />
      <rect :x="sx" y="480" width="500" height="420" rx="30" fill="url(#tx-noise)" opacity="0.3" style="mix-blend-mode: soft-light" />
      <rect :x="sx + 0.75" y="480.75" width="498.5" height="418.5" rx="29.25" fill="none" stroke="url(#b20-edge)" stroke-width="1.5" />
      <text :x="k ? sx + 40 : sx + 460" :text-anchor="k ? 'start' : 'end'" y="600" font-family="'SF Pro Display', 'Inter', 'Helvetica Neue', system-ui, sans-serif" font-size="64" font-weight="100" letter-spacing="2" fill="#f4f5ff" opacity="0.85">{{ k ? '72%' : '09:41' }}</text>
      <text :x="k ? sx + 44 : sx + 456" :text-anchor="k ? 'start' : 'end'" y="634" font-family="'SF Pro Display', 'Inter', 'Helvetica Neue', system-ui, sans-serif" font-size="11" font-weight="300" letter-spacing="3.4" fill="#ffffff" opacity="0.55">{{ k ? 'AURORA DENSITY' : 'SHIP TIME · DRIFT' }}</text>
      <rect v-for="j in 6" :key="j" :x="k ? sx + 44 : sx + 456 - (120 + ((j * 67) % 260))" :y="664 + j * 30" :width="120 + ((j * 67 + k * 31) % 260)" height="8" rx="4" fill="#ffffff" :opacity="0.06 + (j % 3) * 0.04" />
    </g>
    <!-- the island: a pill with the ship's state -->
    <g transform="translate(800 446)">
      <rect x="-118" y="-12" width="236" height="24" rx="12" fill="#030407" stroke="#ffffff" stroke-opacity="0.1" />
      <circle cx="-100" cy="0" r="4" fill="#5ef0c4" />
      <circle cx="-100" cy="0" r="8" fill="#5ef0c4" opacity="0.15" />
      <text x="-88" y="3.6" font-family="'SF Pro Display', 'Inter', 'Helvetica Neue', system-ui, sans-serif" font-size="10" font-weight="300" letter-spacing="2.4" fill="#e9ebff">GLASS NOMAD</text>
      <text x="104" y="3.6" text-anchor="end" font-family="'SF Pro Display', 'Inter', 'Helvetica Neue', system-ui, sans-serif" font-size="9" font-weight="300" letter-spacing="1" fill="#8f93b8">AURORA · 72%</text>
      <rect x="36" y="-1" width="1" height="2" fill="#8f93b8" />
    </g>

    <!-- the cards -->
    <g v-for="v in [0, 1, 2]" :key="`c${v}`">
      <!-- its underglow and its shadow -->
      <ellipse :cx="X0(v) + W / 2" :cy="TOP + H - 10" :rx="W * 0.62" ry="110" :fill="`url(#b20-under${v})`" />
      <ellipse :cx="X0(v) + W / 2" :cy="TOP + 26" :rx="W * 0.52" ry="34" fill="url(#b20-shadow)" opacity="0.6" />
      <!-- the aurora it floats over (the frost softens it) -->
      <ellipse :cx="X0(v) + W * 0.3" :cy="TOP + 120" :rx="W * 0.5" ry="170" :fill="`url(#b20-under${v})`" opacity="0.8" />
      <ellipse :cx="X0(v) + W * 0.8" :cy="TOP + 300" :rx="W * 0.4" ry="160" fill="url(#b20-auroraB)" opacity="0.55" />
      <!-- the glass -->
      <rect :x="X0(v)" :y="TOP" :width="W" :height="H" rx="30" fill="#0e0f18" opacity="0.5" />
      <rect :x="X0(v)" :y="TOP" :width="W" :height="H" rx="30" :fill="`url(#b20-floor${v})`" />
      <rect :x="X0(v)" :y="TOP" :width="W" :height="H" rx="30" :fill="`url(#b20-tint${v})`" />
      <rect :x="X0(v)" :y="TOP" :width="W" :height="H" rx="30" fill="url(#b20-frost)" />
      <rect :x="X0(v)" :y="TOP" :width="W" :height="H" rx="30" fill="url(#tx-noise)" opacity="0.32" style="mix-blend-mode: soft-light" />
      <rect :x="X0(v)" :y="TOP" :width="W" :height="H" rx="30" fill="url(#tx-speckle)" opacity="0.08" style="mix-blend-mode: screen" />
      <rect :x="X0(v) + 0.75" :y="TOP + 0.75" :width="W - 1.5" :height="H - 1.5" rx="29.25" fill="none" stroke="url(#b20-edge)" stroke-width="1.5" />
      <path :d="`M ${X0(v) + 40} ${TOP + 1.2} H ${X0(v) + W - 40}`" stroke="#fff" stroke-width="1" opacity="0.5" />
      <rect :x="X0(v) + 60" :y="TOP - 0.5" :width="W - 120" height="2" rx="1" :fill="`url(#b20-hair${v})`" />

      <!-- the clip's well -->
      <rect :x="X0(v) + 8" :y="TOP + 6" width="292" height="104" rx="26" fill="url(#b20-well)" />
      <!-- the scrub bar's well, its label -->
      <rect :x="X0(v) + 8" :y="590" width="292" height="32" rx="16" fill="url(#b20-well)" stroke="url(#b20-wellEdge)" stroke-width="0.8" />
      <text :x="X0(v) + 16" y="583" font-family="'SF Pro Display', 'Inter', 'Helvetica Neue', system-ui, sans-serif" font-size="8.5" font-weight="400" letter-spacing="2" fill="#e9ebff" opacity="0.7">POS · SCRUB</text>
      <!-- the faders' well, the dials' well, the right column's -->
      <rect :x="X0(v) + 6" :y="614" width="264" height="154" rx="22" fill="url(#b20-well)" stroke="url(#b20-wellEdge)" stroke-width="0.8" />
      <rect :x="X0(v) + 6" :y="772" width="264" height="62" rx="22" fill="url(#b20-well)" stroke="url(#b20-wellEdge)" stroke-width="0.8" />
      <rect :x="X0(v) + 284" :y="614" width="212" height="164" rx="22" fill="url(#b20-well)" opacity="0.7" stroke="url(#b20-wellEdge)" stroke-width="0.8" />
      <!-- the OLED digits' well -->
      <rect :x="X0(v) + 302" :y="TOP + 14" width="146" height="76" rx="18" fill="url(#b20-well)" />

      <!-- its name, thin and wide, and a status dot -->
      <circle :cx="X0(v) + 296" cy="808" r="3" :fill="vcoC(v)" />
      <circle :cx="X0(v) + 296" cy="808" r="7" :fill="vcoC(v)" opacity="0.18" />
      <text :x="X0(v) + 308" y="811.5" font-family="'SF Pro Display', 'Inter', 'Helvetica Neue', system-ui, sans-serif" font-size="11" font-weight="200" letter-spacing="3.4" fill="#f4f5ff">{{ NAMES[v] }}</text>
      <text :x="X0(v) + 492" y="811.5" text-anchor="end" font-family="'SF Pro Display', 'Inter', 'Helvetica Neue', system-ui, sans-serif" font-size="8" font-weight="300" letter-spacing="1.6" fill="#ffffff" opacity="0.5">VCO {{ v + 1 }} · {{ TINTS[v] }}</text>
      <!-- the intake's halo -->
      <circle :cx="X0(v) + 474" cy="514" r="34" :fill="`url(#b20-under${v})`" />
    </g>
  </g>
</template>
