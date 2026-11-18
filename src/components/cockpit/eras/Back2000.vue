<script setup lang="ts">
import type { CockpitDesign, Skin } from '../../../lib/voyage/cockpit/design'

/**
 * The NOUGHTIES' cockpit, behind its controls: a pearl-white candy shell with Aqua pinstripes round a pill-shaped
 * windscreen in a Bondi-jelly rim and a brushed-aluminium ring; two jelly capsules standing beside the glass (blue on
 * the left, tangerine on the right); a lime tray on the sill; and the dash -- a Bondi-blue jelly console, the lime orb
 * in its aluminium bezel, a tangerine console -- translucent candy with soft innards showing through, big wet
 * speculars, a glow pooled in the bottom of every gel, and their reflections in the wet floor. A BETA sticker.
 */
const props = defineProps<{ design: CockpitDesign; skin: Skin }>()
void props

const CANDY = [
  { id: 'blue', top: '#53cdf8', mid: '#0b86c8', low: '#1aaee6', glow: '#a6f4ff', deep: '#064a7a', name: 'BOW · VCO 1' },
  { id: 'lime', top: '#d4f75a', mid: '#5e9c0a', low: '#8acf1c', glow: '#ecffa6', deep: '#2c5404', name: 'MIDSHIPS · VCO 2' },
  { id: 'tang', top: '#ffbe5c', mid: '#e05a00', low: '#ff8a1a', glow: '#ffe2a0', deep: '#7a2c02', name: 'STERN · VCO 3' },
]
/** the flank consoles and capsules (VCO 1 left, VCO 3 mirrored right) */
const CONSOLE = [
  { x: 16, y: 452, w: 514, h: 440, c: CANDY[0] },
  { x: 1070, y: 452, w: 514, h: 440, c: CANDY[2] },
]
const CAPSULE = [
  { x: 18, y: 44, w: 176, h: 404, c: CANDY[0] },
  { x: 1406, y: 44, w: 176, h: 404, c: CANDY[2] },
]
const ORB = { x: 800, y: 690, r: 222 }
/** the soft innards seen through the jelly: a board, some round parts (relative to a console's corner) */
const INNARDS = [
  { x: 40, y: 150, w: 180, h: 70, r: 14 },
  { x: 260, y: 120, w: 120, h: 120, r: 60 },
  { x: 300, y: 300, w: 160, h: 60, r: 30 },
  { x: 60, y: 300, w: 90, h: 90, r: 45 },
]
/** air bubbles caught in a capsule's jelly */
const BUBBLES = [
  { x: 40, y: 380, r: 6 },
  { x: 118, y: 250, r: 4 },
  { x: 100, y: 120, r: 3 },
  { x: 26, y: 300, r: 3.5 },
  { x: 146, y: 70, r: 3 },
]
const glassD = 'M 390 26 H 1210 A 171 171 0 0 1 1210 368 H 390 A 171 171 0 0 1 390 26 Z'
const shell = `M -700 -500 H 2300 V 1500 H -700 Z ${glassD}`
/** a starburst for the BETA sticker */
const burst = Array.from({ length: 28 }, (_, i) => {
  const a = (i / 28) * Math.PI * 2
  const r = i % 2 ? 26 : 32
  return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`
}).join(' ')
</script>

<template>
  <g class="back2000">
    <defs>
      <linearGradient id="b00-pearl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.45" stop-color="#eef4f9" />
        <stop offset="0.75" stop-color="#dbe6ef" />
        <stop offset="1" stop-color="#c3d3e1" />
      </linearGradient>
      <radialGradient id="b00-skyspill" cx="0.5" cy="0.2" r="0.6">
        <stop offset="0" stop-color="#bff0ff" stop-opacity="0.7" />
        <stop offset="1" stop-color="#bff0ff" stop-opacity="0" />
      </radialGradient>
      <pattern id="b00-pin" patternUnits="userSpaceOnUse" width="8" height="4">
        <rect width="8" height="2" fill="#ffffff" />
        <rect y="2" width="8" height="2" fill="#9fb6c9" opacity="0.35" />
      </pattern>
      <linearGradient id="b00-gloss" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.95" />
        <stop offset="0.6" stop-color="#fff" stop-opacity="0.35" />
        <stop offset="1" stop-color="#fff" stop-opacity="0.04" />
      </linearGradient>
      <linearGradient id="b00-glossH" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity="0.9" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="b00-alu" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.22" stop-color="#b9c4ce" />
        <stop offset="0.45" stop-color="#f4f7fa" />
        <stop offset="0.62" stop-color="#97a5b2" />
        <stop offset="0.85" stop-color="#e8edf2" />
        <stop offset="1" stop-color="#7d8b98" />
      </linearGradient>
      <linearGradient id="b00-rim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#8ae6ff" stop-opacity="0.85" />
        <stop offset="0.5" stop-color="#1aaee6" stop-opacity="0.7" />
        <stop offset="1" stop-color="#0b6fae" stop-opacity="0.85" />
      </linearGradient>
      <template v-for="c in CANDY" :key="c.id">
        <linearGradient :id="`b00-${c.id}`" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" :stop-color="c.top" stop-opacity="0.92" />
          <stop offset="0.45" :stop-color="c.mid" stop-opacity="0.86" />
          <stop offset="0.8" :stop-color="c.low" stop-opacity="0.9" />
          <stop offset="1" :stop-color="c.glow" stop-opacity="0.95" />
        </linearGradient>
        <radialGradient :id="`b00-${c.id}-orb`" cx="0.5" cy="0.38" r="0.62">
          <stop offset="0" :stop-color="c.glow" />
          <stop offset="0.35" :stop-color="c.top" />
          <stop offset="0.8" :stop-color="c.mid" />
          <stop offset="1" :stop-color="c.deep" />
        </radialGradient>
        <radialGradient :id="`b00-${c.id}-pool`" cx="0.5" cy="1" r="0.7">
          <stop offset="0" :stop-color="c.glow" stop-opacity="0.95" />
          <stop offset="1" :stop-color="c.glow" stop-opacity="0" />
        </radialGradient>
      </template>
      <linearGradient id="b00-floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e9f3fa" />
        <stop offset="1" stop-color="#b7cbdc" />
      </linearGradient>
      <linearGradient id="b00-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.55" />
        <stop offset="0.35" stop-color="#fff" stop-opacity="0" />
      </linearGradient>
      <mask id="b00-reflect" maskUnits="userSpaceOnUse" x="-700" y="880" width="3000" height="500">
        <rect x="-700" y="890" width="3000" height="300" fill="url(#b00-fade)" />
      </mask>
      <radialGradient id="b00-sticker" cx="0.4" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#ff9ab8" />
        <stop offset="0.5" stop-color="#ff2f6d" />
        <stop offset="1" stop-color="#b3003a" />
      </radialGradient>
      <radialGradient id="b00-dome" cx="0.4" cy="0.3" r="0.75">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.6" stop-color="#dce8f2" />
        <stop offset="1" stop-color="#9fb4c6" />
      </radialGradient>
      <radialGradient id="b00-shadow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#16406a" stop-opacity="0.35" />
        <stop offset="1" stop-color="#16406a" stop-opacity="0" />
      </radialGradient>
    </defs>

    <!-- ── the shell: pearl candy plastic, pinstriped, round the pill ── -->
    <path :d="shell" fill-rule="evenodd" fill="url(#b00-pearl)" />
    <path :d="shell" fill-rule="evenodd" fill="url(#b00-pin)" opacity="0.32" />
    <path :d="shell" fill-rule="evenodd" fill="url(#b00-skyspill)" />
    <!-- big speaker domes out at the sides (wide screens) -->
    <g v-for="sx in [-230, 1830]" :key="`dome${sx}`">
      <circle :cx="sx" cy="330" r="150" fill="url(#b00-shadow)" />
      <circle :cx="sx" cy="300" r="120" fill="url(#b00-dome)" stroke="#fff" stroke-width="4" />
      <circle :cx="sx" cy="300" r="92" fill="url(#tx-grille)" opacity="0.45" />
      <circle :cx="sx" cy="300" r="92" fill="none" stroke="url(#b00-alu)" stroke-width="7" />
      <ellipse :cx="sx - 30" :cy="250" rx="60" ry="30" fill="#fff" opacity="0.6" />
    </g>
    <!-- side windows of jelly below the domes -->
    <g v-for="(sx, i) in [-330, 1650]" :key="`sw${sx}`">
      <rect :x="sx" y="500" width="280" height="380" rx="60" :fill="`url(#b00-${i ? 'tang' : 'blue'})`" opacity="0.55" />
      <rect :x="sx + 16" y="512" width="248" height="120" rx="50" fill="url(#b00-gloss)" opacity="0.7" />
    </g>

    <!-- ── the ceiling (taller screens): a pearl ledge with three gel lamps ── -->
    <rect x="-700" y="-520" width="3000" height="500" fill="#e4eef6" />
    <rect x="-700" y="-520" width="3000" height="500" fill="url(#b00-pin)" opacity="0.3" />
    <rect x="-700" y="-34" width="3000" height="16" fill="#ffffff" />
    <rect x="-700" y="-20" width="3000" height="8" fill="#16406a" opacity="0.08" />
    <g v-for="(c, i) in CANDY" :key="`lamp${i}`" :transform="`translate(${380 + i * 420} -80)`">
      <ellipse cx="0" cy="58" rx="150" ry="22" :fill="`url(#b00-${c.id}-pool)`" opacity="0.5" />
      <rect x="-130" y="-34" width="260" height="68" rx="34" fill="#ffffff" stroke="#c4d2df" stroke-width="1.5" />
      <rect x="-122" y="-26" width="244" height="52" rx="26" :fill="`url(#b00-${c.id})`" />
      <rect x="-110" y="-23" width="220" height="18" rx="9" fill="url(#b00-gloss)" opacity="0.9" />
      <rect x="-90" y="6" width="180" height="14" rx="7" :fill="c.glow" opacity="0.8" />
    </g>

    <!-- ── the windscreen's rim: a Bondi-blue jelly tube, an aluminium ring ── -->
    <path :d="glassD" fill="none" stroke="#16406a" stroke-width="34" opacity="0.12" transform="translate(0 8)" />
    <path :d="glassD" fill="none" stroke="url(#b00-rim)" stroke-width="26" />
    <path d="M 238 150 A 165 165 0 0 1 390 34 H 1180" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity="0.85" transform="translate(0 -8)" />
    <path d="M 1362 260 A 165 165 0 0 1 1300 345" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.6" transform="translate(8 6)" />
    <path :d="glassD" fill="none" stroke="url(#b00-alu)" stroke-width="6" />
    <path :d="glassD" fill="none" stroke="#0b3f66" stroke-width="1.2" opacity="0.5" />

    <!-- ── the capsules beside the glass ── -->
    <g v-for="(k, i) in CAPSULE" :key="`cap${i}`">
      <rect :x="k.x + 4" :y="k.y + 14" :width="k.w" :height="k.h" rx="70" fill="#16406a" opacity="0.18" filter="url(#cp-soft)" />
      <rect :x="k.x - 6" :y="k.y - 6" :width="k.w + 12" :height="k.h + 12" rx="76" fill="#ffffff" stroke="#c9d6e2" stroke-width="1.5" />
      <rect :x="k.x" :y="k.y" :width="k.w" :height="k.h" rx="70" :fill="`url(#b00-${k.c.id})`" />
      <rect :x="k.x + 30" :y="k.y + 120" width="110" height="60" rx="12" fill="#ffffff" opacity="0.12" />
      <circle :cx="k.x + 88" :cy="k.y + 260" r="40" fill="#ffffff" opacity="0.1" />
      <rect :x="k.x" :y="k.y" :width="k.w" :height="k.h" rx="70" fill="url(#b00-pin)" opacity="0.12" />
      <rect :x="k.x" :y="k.y + k.h * 0.55" :width="k.w" :height="k.h * 0.45" rx="70" :fill="`url(#b00-${k.c.id}-pool)`" opacity="0.6" />
      <!-- the wet specular: a tall streak down the outer side -->
      <rect :x="i ? k.x + k.w - 34 : k.x + 12" :y="k.y + 40" width="20" :height="k.h - 90" rx="10" fill="url(#b00-gloss)" opacity="0.8" />
      <path :d="`M ${k.x + 34} ${k.y + 52} Q ${k.x + k.w / 2} ${k.y + 4} ${k.x + k.w - 34} ${k.y + 52} Q ${k.x + k.w / 2} ${k.y + 26} ${k.x + 34} ${k.y + 52} Z`" fill="#fff" opacity="0.8" />
      <g v-for="(b, j) in BUBBLES" :key="`bb${j}`">
        <circle :cx="k.x + b.x" :cy="k.y + b.y" :r="b.r" fill="#ffffff" opacity="0.14" />
        <circle :cx="k.x + b.x - b.r * 0.35" :cy="k.y + b.y - b.r * 0.35" :r="b.r * 0.3" fill="#ffffff" opacity="0.7" />
      </g>
    </g>

    <!-- ── the sill: a lime jelly tray for the orb's chips; the badges ── -->
    <rect x="540" y="384" width="520" height="66" rx="33" fill="#16406a" opacity="0.15" transform="translate(0 5)" />
    <rect x="536" y="380" width="528" height="70" rx="35" fill="#ffffff" stroke="#c9d6e2" stroke-width="1.2" />
    <rect x="542" y="386" width="516" height="58" rx="29" fill="url(#b00-lime)" />
    <rect x="556" y="389" width="488" height="20" rx="10" fill="url(#b00-gloss)" opacity="0.85" />
    <g v-for="(b, i) in [{ x: 330, t: 'AQUAPOD', s: '2.0' }, { x: 1270, t: 'FLIGHT POD', s: '' }]" :key="`badge${i}`" :transform="`translate(${b.x} 418)`">
      <rect x="-86" y="-17" width="172" height="34" rx="17" fill="#16406a" opacity="0.15" transform="translate(0 4)" />
      <rect x="-86" y="-17" width="172" height="34" rx="17" fill="url(#b00-alu)" stroke="#fff" stroke-width="2" />
      <rect x="-86" y="-17" width="172" height="34" rx="17" fill="url(#tx-brushed)" opacity="0.4" style="mix-blend-mode: multiply" />
      <text :x="b.s ? -16 : 0" y="6" text-anchor="middle" font-family="'Lucida Grande', 'Helvetica Neue', 'Arial Rounded MT Bold', sans-serif" font-size="16" font-weight="700" letter-spacing="1" fill="#17406a">{{ b.t }}</text>
      <text v-if="b.s" x="54" y="6" text-anchor="middle" font-family="'Lucida Grande', 'Helvetica Neue', sans-serif" font-size="16" font-weight="700" fill="#0b86c8">{{ b.s }}</text>
    </g>

    <!-- ── the wet floor and the dash's reflections in it ── -->
    <rect x="-700" y="886" width="3000" height="600" fill="url(#b00-floor)" />
    <rect x="-700" y="886" width="3000" height="600" fill="url(#b00-pin)" opacity="0.18" />
    <g mask="url(#b00-reflect)">
      <g transform="translate(0 1782) scale(1 -1)">
        <rect v-for="(k, i) in CONSOLE" :key="`rf${i}`" :x="k.x" :y="k.y" :width="k.w" :height="k.h" rx="44" :fill="`url(#b00-${k.c.id})`" />
        <circle :cx="ORB.x" :cy="ORB.y" :r="ORB.r + 18" fill="url(#b00-alu)" />
        <circle :cx="ORB.x" :cy="ORB.y" :r="ORB.r" fill="url(#b00-lime-orb)" />
      </g>
    </g>

    <!-- ── the flank consoles: Bondi blue, tangerine ── -->
    <g v-for="(k, i) in CONSOLE" :key="`con${i}`">
      <rect :x="k.x + 6" :y="k.y + 18" :width="k.w" :height="k.h" rx="46" fill="#16406a" opacity="0.22" filter="url(#cp-soft)" />
      <rect :x="k.x - 8" :y="k.y - 8" :width="k.w + 16" :height="k.h + 16" rx="52" fill="#ffffff" stroke="#c4d2df" stroke-width="1.5" />
      <rect :x="k.x - 8" :y="k.y - 8" :width="k.w + 16" :height="k.h + 16" rx="52" fill="url(#b00-pin)" opacity="0.25" />
      <rect :x="k.x" :y="k.y" :width="k.w" :height="k.h" rx="44" :fill="`url(#b00-${k.c.id})`" />
      <!-- the innards, soft through the jelly -->
      <rect v-for="(n, j) in INNARDS" :key="j" :x="i ? k.x + k.w - n.x - n.w : k.x + n.x" :y="k.y + n.y" :width="n.w" :height="n.h" :rx="n.r" fill="#ffffff" opacity="0.09" />
      <path :d="`M ${k.x + 40} ${k.y + 260} h 120 v 60 h 200 M ${k.x + 100} ${k.y + 200} v 160 h 280`" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.1" />
      <rect :x="k.x" :y="k.y" :width="k.w" :height="k.h" rx="44" fill="url(#b00-pin)" opacity="0.1" />
      <!-- the glow pooled in the bottom, the wet gloss on top -->
      <rect :x="k.x" :y="k.y + k.h * 0.5" :width="k.w" :height="k.h * 0.5" rx="44" :fill="`url(#b00-${k.c.id}-pool)`" opacity="0.55" />
      <path :d="`M ${k.x + 18} ${k.y + 60} Q ${k.x + 18} ${k.y + 14} ${k.x + 64} ${k.y + 14} L ${k.x + k.w - 64} ${k.y + 14} Q ${k.x + k.w - 18} ${k.y + 14} ${k.x + k.w - 18} ${k.y + 60} L ${k.x + k.w - 18} ${k.y + 92} Q ${k.x + k.w / 2} ${k.y + 140} ${k.x + 18} ${k.y + 92} Z`" fill="url(#b00-gloss)" opacity="0.55" />
      <!-- a pearl well behind its screen and chips -->
      <rect :x="k.x + 10" :y="k.y + 10" :width="k.w - 20" :height="126" rx="34" fill="#ffffff" opacity="0.22" />
      <rect :x="k.x + 10" :y="k.y + 10" :width="k.w - 20" :height="126" rx="34" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.6" />
      <!-- its pinstriped scrubber groove and caption -->
      <rect :x="i ? k.x + k.w - 260 : k.x + 8" :y="k.y + 142" width="252" height="36" rx="18" fill="#ffffff" opacity="0.18" />
      <text :x="i ? k.x + k.w - 136 : k.x + 136" :y="k.y + 192" text-anchor="middle" font-family="'Lucida Grande', 'Helvetica Neue', sans-serif" font-size="9" font-weight="700" letter-spacing="2" fill="#ffffff" opacity="0.9">◂ POSITION ▸</text>
      <!-- a pearl speaker grille in the free corner by the scrubber -->
      <g :transform="`translate(${i ? k.x + 150 : k.x + k.w - 150} ${k.y + 160})`">
        <rect x="-96" y="-18" width="192" height="36" rx="18" fill="#ffffff" opacity="0.35" />
        <circle v-for="d in 15" :key="d" :cx="-84 + (d - 1) * 12" cy="0" r="3.2" :fill="k.c.deep" opacity="0.45" />
      </g>
      <!-- its name, on a candy pill on the top edge -->
      <g :transform="`translate(${k.x + k.w / 2} ${k.y - 2})`">
        <rect x="-70" y="-11" width="140" height="22" rx="11" fill="#ffffff" stroke="#c4d2df" stroke-width="1" />
        <rect x="-64" y="-9" width="128" height="8" rx="4" fill="url(#b00-gloss)" opacity="0.6" />
        <text y="4" text-anchor="middle" font-family="'Lucida Grande', 'Helvetica Neue', sans-serif" font-size="10" font-weight="700" letter-spacing="1.5" :fill="k.c.deep">{{ k.c.name }}</text>
      </g>
    </g>

    <!-- ── the lime orb in its brushed-aluminium bezel ── -->
    <circle :cx="ORB.x + 6" :cy="ORB.y + 18" :r="ORB.r + 22" fill="#16406a" opacity="0.25" filter="url(#cp-soft)" />
    <circle :cx="ORB.x" :cy="ORB.y" :r="ORB.r + 20" fill="url(#b00-alu)" stroke="#fff" stroke-width="2" />
    <circle :cx="ORB.x" :cy="ORB.y" :r="ORB.r + 20" fill="url(#tx-brushed)" opacity="0.45" style="mix-blend-mode: multiply" />
    <circle :cx="ORB.x" :cy="ORB.y" :r="ORB.r + 9" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.8" />
    <circle :cx="ORB.x" :cy="ORB.y" :r="ORB.r + 2" fill="none" stroke="#3d5468" stroke-width="3" opacity="0.6" />
    <circle v-for="k in 12" :key="`screw${k}`" :cx="ORB.x + Math.cos((k * Math.PI) / 6) * (ORB.r + 11)" :cy="ORB.y + Math.sin((k * Math.PI) / 6) * (ORB.r + 11)" r="2.2" fill="#8798a8" />
    <circle :cx="ORB.x" :cy="ORB.y" :r="ORB.r" fill="url(#b00-lime-orb)" />
    <circle :cx="ORB.x" :cy="ORB.y" :r="ORB.r * 0.78" fill="none" stroke="#ffffff" stroke-width="40" opacity="0.06" />
    <circle :cx="ORB.x" :cy="ORB.y" :r="ORB.r" fill="url(#b00-pin)" opacity="0.1" />
    <ellipse :cx="ORB.x" :cy="ORB.y + ORB.r * 0.62" :rx="ORB.r * 0.8" :ry="ORB.r * 0.36" fill="url(#b00-lime-pool)" opacity="0.6" />
    <!-- its well round the screen -->
    <circle cx="800" cy="628" r="84" fill="#ffffff" opacity="0.2" />
    <circle cx="800" cy="628" r="84" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.55" />
    <!-- the big wet gloss over the top of the orb -->
    <path :d="`M ${ORB.x - ORB.r * 0.8} ${ORB.y - ORB.r * 0.28} A ${ORB.r * 0.86} ${ORB.r * 0.72} 0 0 1 ${ORB.x + ORB.r * 0.8} ${ORB.y - ORB.r * 0.28} Q ${ORB.x} ${ORB.y - ORB.r * 0.5} ${ORB.x - ORB.r * 0.8} ${ORB.y - ORB.r * 0.28} Z`" fill="url(#b00-gloss)" opacity="0.6" />
    <text x="800" y="752" text-anchor="middle" font-family="'Lucida Grande', 'Helvetica Neue', sans-serif" font-size="8" font-weight="700" letter-spacing="2" fill="#ffffff" opacity="0.85">◂ POS ▸</text>
    <g transform="translate(800 874)">
      <rect x="-74" y="-11" width="148" height="22" rx="11" fill="#ffffff" stroke="#c4d2df" stroke-width="1" />
      <rect x="-68" y="-9" width="136" height="8" rx="4" fill="url(#b00-gloss)" opacity="0.6" />
      <text y="4" text-anchor="middle" font-family="'Lucida Grande', 'Helvetica Neue', sans-serif" font-size="10" font-weight="700" letter-spacing="1.5" fill="#2c5404">{{ CANDY[1].name }}</text>
    </g>

    <!-- ── the BETA sticker, stuck on a bit crooked ── -->
    <g transform="translate(1528 36) rotate(14)">
      <polygon :points="burst" fill="#7a0026" opacity="0.25" transform="translate(2 4)" />
      <polygon :points="burst" fill="url(#b00-sticker)" stroke="#fff" stroke-width="2.5" stroke-linejoin="round" />
      <text y="5" text-anchor="middle" font-family="'Arial Rounded MT Bold', 'Lucida Grande', 'Helvetica Neue', sans-serif" font-size="14" font-weight="700" fill="#fff" letter-spacing="0.5">BETA</text>
      <ellipse cx="-8" cy="-14" rx="12" ry="5" fill="#fff" opacity="0.5" transform="rotate(-20)" />
    </g>
  </g>
</template>
