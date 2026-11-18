<script setup lang="ts">
import type { CockpitDesign, Skin } from '../../../lib/voyage/cockpit/design'
import { OH70, X70 } from '../../../lib/voyage/cockpit/eras/c1970'

/**
 * The SEVENTIES' cockpit, behind its controls: a chocolate vinyl cab, tuck-and-roll pleated round a wedge windscreen
 * in three panes; a harvest-gold overhead in three screwed-down sections with piano-key switches; a clock and an
 * attitude ball in the cheeks; a padded glare shield with the racing stripe running along it and up the windscreen's
 * sides; and a walnut dash -- three consoles in brushed-aluminium bezels, each with a chunky moulded CRT hood, a
 * backlit VU housing, a crinkle-black throttle pedestal, a hi-fi tuning dial glowing amber, rocker switches, Dymo tape.
 */
const props = defineProps<{ design: CockpitDesign; skin: Skin }>()
void props

const NAMES = ['BOW · VCO 1', 'MIDSHIPS · VCO 2', 'STERN · VCO 3']
const STRIPES = ['#e8662a', '#f2b233', '#8a4a1e']
/** the racing stripe: along the glare shield and up the windscreen's sides (offset k outward) */
const stripe = (k: number) => {
  const o = 22 + k * 11
  return `M ${178 - o * 0.9} 160 L ${290 - o * 0.4} ${436 + k * 11} L ${1310 + o * 0.4} ${436 + k * 11} L ${1422 + o * 0.9} 160`
}
const posts = [
  { x0: 620, x1: 646 },
  { x0: 980, x1: 954 },
]
const pleats = Array.from({ length: 14 }, (_, i) => 176 + i * 19)
const screws = (x: number, y: number, w: number, h: number, inset = 9) => [
  { x: x + inset, y: y + inset },
  { x: x + w - inset, y: y + inset },
  { x: x + inset, y: y + h - inset },
  { x: x + w - inset, y: y + h - inset },
]
const KEYS = ['#efe2c0', '#e8662a', '#a8c23c', '#7a4a26']
const dialNums = Array.from({ length: 11 }, (_, i) => i)
const hourAngle = 300
const minAngle = 140
</script>

<template>
  <g class="back1970">
    <defs>
      <linearGradient id="b70-vinyl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4a2c18" />
        <stop offset="0.5" stop-color="#3a2212" />
        <stop offset="1" stop-color="#1e1008" />
      </linearGradient>
      <linearGradient id="b70-pleat" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#6a4226" />
        <stop offset="0.35" stop-color="#8a5a34" />
        <stop offset="0.7" stop-color="#4a2c18" />
        <stop offset="1" stop-color="#1e1008" />
      </linearGradient>
      <linearGradient id="b70-gold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f1e2b0" />
        <stop offset="0.6" stop-color="#e2c98a" />
        <stop offset="1" stop-color="#c4a462" />
      </linearGradient>
      <linearGradient id="b70-alu" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fbf8f0" />
        <stop offset="0.45" stop-color="#b8b4aa" />
        <stop offset="0.55" stop-color="#9a968c" />
        <stop offset="1" stop-color="#e6e2d8" />
      </linearGradient>
      <linearGradient id="b70-aluV" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#5a5650" />
        <stop offset="0.3" stop-color="#e6e2d8" />
        <stop offset="0.5" stop-color="#ffffff" />
        <stop offset="0.75" stop-color="#9a968c" />
        <stop offset="1" stop-color="#4a4640" />
      </linearGradient>
      <linearGradient id="b70-walnut" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#7a4422" />
        <stop offset="0.5" stop-color="#5a2e14" />
        <stop offset="1" stop-color="#2e160a" />
      </linearGradient>
      <linearGradient id="b70-walnutD" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#5a3018" />
        <stop offset="1" stop-color="#2a1408" />
      </linearGradient>
      <linearGradient id="b70-shield" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#7a4c2c" />
        <stop offset="0.3" stop-color="#5a3620" />
        <stop offset="1" stop-color="#24140a" />
      </linearGradient>
      <linearGradient id="b70-hood" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#d9c79a" />
        <stop offset="0.12" stop-color="#bfa878" />
        <stop offset="1" stop-color="#7a6440" />
      </linearGradient>
      <linearGradient id="b70-crinkle" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2e2a26" />
        <stop offset="1" stop-color="#121010" />
      </linearGradient>
      <linearGradient id="b70-dial" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3a1c04" />
        <stop offset="0.5" stop-color="#7a3e08" />
        <stop offset="1" stop-color="#2a1404" />
      </linearGradient>
      <radialGradient id="b70-vu" cx="0.5" cy="0.8" r="0.9">
        <stop offset="0" stop-color="#ffd27a" />
        <stop offset="0.6" stop-color="#e09a3a" />
        <stop offset="1" stop-color="#7a4210" />
      </radialGradient>
      <radialGradient id="b70-screw" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.5" stop-color="#a8a49c" />
        <stop offset="1" stop-color="#3a3430" />
      </radialGradient>
      <radialGradient id="b70-lampA" cx="0.4" cy="0.35" r="0.7">
        <stop offset="0" stop-color="#fff6d0" />
        <stop offset="0.3" stop-color="#ffb43d" />
        <stop offset="1" stop-color="#6a3004" />
      </radialGradient>
      <radialGradient id="b70-ball" cx="0.4" cy="0.35" r="0.8">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.5" stop-color="#d8cdb0" />
        <stop offset="1" stop-color="#5a4a30" />
      </radialGradient>
      <pattern id="b70-quilt" patternUnits="userSpaceOnUse" width="40" height="40" patternTransform="rotate(45)">
        <rect width="40" height="40" fill="#5a3620" />
        <rect width="40" height="40" fill="#3a2212" opacity="0.4" x="20" />
        <path d="M 0 0 H 40 M 0 0 V 40" stroke="#d9a05a" stroke-width="1" stroke-dasharray="3 3" opacity="0.45" />
      </pattern>
      <filter id="b70-glow" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="5" /></filter>
      <clipPath id="b70-ballclip"><circle r="34" /></clipPath>
    </defs>

    <!-- the cab: chocolate vinyl, everything but the glass -->
    <path :d="`M -600 -500 H 2200 V 1400 H -600 Z ${design.glass}`" fill-rule="evenodd" fill="url(#b70-vinyl)" />
    <path :d="`M -600 -500 H 2200 V 1400 H -600 Z ${design.glass}`" fill-rule="evenodd" fill="url(#tx-leather)" opacity="0.6" style="mix-blend-mode: overlay" />

    <!-- the cheeks: tuck-and-roll pleats -->
    <g v-for="side in [0, 1]" :key="`ch${side}`">
      <clipPath :id="`b70-cheek${side}`">
        <path v-if="!side" d="M -600 168 L 200 168 L 300 430 L -600 430 Z" />
        <path v-else d="M 2200 168 L 1400 168 L 1300 430 L 2200 430 Z" />
      </clipPath>
      <g :clip-path="`url(#b70-cheek${side})`">
        <rect v-for="(y, i) in pleats" :key="i" x="-600" :y="y" width="2800" height="19" fill="url(#b70-pleat)" />
        <rect x="-600" y="168" width="2800" height="270" fill="url(#tx-leather)" opacity="0.5" style="mix-blend-mode: overlay" />
        <line v-for="(y, i) in pleats" :key="`s${i}`" x1="-600" :x2="2200" :y1="y + 1" :y2="y + 1" stroke="#d9a05a" stroke-width="0.8" stroke-dasharray="3 3" opacity="0.4" />
      </g>
    </g>

    <!-- a clock in the left cheek, an attitude ball in the right -->
    <g transform="translate(130 300)">
      <circle r="52" fill="#000" opacity="0.4" transform="translate(4 6)" />
      <circle r="50" fill="url(#b70-aluV)" stroke="#26170c" stroke-width="1.5" />
      <circle r="42" fill="#efe2c0" />
      <circle r="42" fill="url(#tx-paper)" opacity="0.5" style="mix-blend-mode: multiply" />
      <line v-for="k in 12" :key="k" :x1="Math.sin((k * Math.PI) / 6) * 33" :y1="-Math.cos((k * Math.PI) / 6) * 33" :x2="Math.sin((k * Math.PI) / 6) * 39" :y2="-Math.cos((k * Math.PI) / 6) * 39" stroke="#26170c" :stroke-width="k % 3 ? 1.4 : 3" />
      <text y="16" text-anchor="middle" :font-family="skin.font" font-size="6.5" letter-spacing="1.5" fill="#8a4a1e">MISSION</text>
      <line x1="0" y1="0" :x2="Math.sin((hourAngle * Math.PI) / 180) * 22" :y2="-Math.cos((hourAngle * Math.PI) / 180) * 22" stroke="#26170c" stroke-width="4" stroke-linecap="round" />
      <line x1="0" y1="0" :x2="Math.sin((minAngle * Math.PI) / 180) * 33" :y2="-Math.cos((minAngle * Math.PI) / 180) * 33" stroke="#26170c" stroke-width="2.5" stroke-linecap="round" />
      <line class="sweep" x1="0" y1="6" x2="0" y2="-36" stroke="#e8662a" stroke-width="1.2" />
      <circle r="3.5" fill="#e8662a" />
      <ellipse cx="-14" cy="-20" rx="22" ry="10" fill="#fff" opacity="0.3" transform="rotate(-25)" />
    </g>
    <g transform="translate(1504 300)">
      <circle r="52" fill="#000" opacity="0.4" transform="translate(4 6)" />
      <circle r="50" fill="url(#b70-aluV)" stroke="#26170c" stroke-width="1.5" />
      <circle r="42" fill="#141010" />
      <g clip-path="url(#b70-ballclip)">
        <g transform="rotate(-8)">
          <rect x="-40" y="-40" width="80" height="44" fill="url(#b70-ball)" />
          <rect x="-40" y="4" width="80" height="40" fill="#7a4a26" />
          <line x1="-40" x2="40" y1="4" y2="4" stroke="#fff" stroke-width="2" />
          <line v-for="k in 5" :key="k" x1="-8" x2="8" :y1="4 - k * 8" :y2="4 - k * 8" stroke="#26170c" stroke-width="1" />
        </g>
      </g>
      <path d="M -26 0 L -8 0 L 0 8 L 8 0 L 26 0" fill="none" stroke="#f2b233" stroke-width="3" />
      <ellipse cx="-12" cy="-18" rx="20" ry="9" fill="#fff" opacity="0.25" transform="rotate(-25)" />
    </g>

    <!-- the overhead: harvest-gold panels in three sections -->
    <rect x="-600" y="-500" width="2800" height="668" fill="url(#b70-vinyl)" />
    <rect x="-600" y="-500" width="2800" height="668" fill="url(#tx-leather)" opacity="0.6" style="mix-blend-mode: overlay" />

    <!-- above the overhead (tall screens): a quilted headliner and a dome light -->
    <rect x="-600" y="-500" width="2800" height="464" fill="url(#b70-quilt)" />
    <rect x="-600" y="-500" width="2800" height="464" fill="url(#tx-leather)" opacity="0.5" style="mix-blend-mode: overlay" />
    <rect x="-600" y="-48" width="2800" height="12" fill="url(#b70-alu)" />
    <g transform="translate(800 -96)">
      <ellipse rx="92" ry="34" fill="url(#b70-aluV)" stroke="#26170c" stroke-width="1.5" />
      <ellipse rx="78" ry="26" fill="#ffe7b0" />
      <ellipse rx="78" ry="26" fill="url(#tx-grille)" opacity="0.3" style="mix-blend-mode: multiply" />
      <ellipse rx="150" ry="60" fill="#ffd27a" opacity="0.18" filter="url(#b70-glow)" />
    </g>
    <g v-for="vco in [0, 1, 2]" :key="`oh${vco}`">
      <rect :x="OH70(vco) + 6" y="-30" width="521" height="194" rx="10" fill="#000" opacity="0.5" transform="translate(3 4)" />
      <rect :x="OH70(vco) + 6" y="-30" width="521" height="194" rx="10" fill="url(#b70-gold)" stroke="#26170c" stroke-width="1.5" />
      <rect :x="OH70(vco) + 6" y="-30" width="521" height="194" rx="10" fill="url(#tx-speckle)" opacity="0.35" style="mix-blend-mode: multiply" />
      <rect :x="OH70(vco) + 12" y="-24" width="509" height="182" rx="7" fill="none" stroke="#fff" stroke-width="1" opacity="0.5" />
      <circle v-for="(s, i) in screws(OH70(vco) + 6, -30, 521, 194)" :key="i" :cx="s.x" :cy="s.y" r="4" fill="url(#b70-screw)" stroke="#26170c" stroke-width="0.6" />
      <!-- the selectors' recess -->
      <rect :x="OH70(vco) + 24" y="14" width="292" height="132" rx="12" fill="#8a6a34" opacity="0.18" />
      <rect :x="OH70(vco) + 24" y="14" width="292" height="132" rx="12" fill="none" stroke="#7a5a2a" stroke-width="1" opacity="0.6" />
      <!-- the counters' window -->
      <rect :x="OH70(vco) + 320" y="30" width="156" height="84" rx="8" fill="#3a2a18" opacity="0.85" />
      <rect :x="OH70(vco) + 320" y="30" width="156" height="84" rx="8" fill="url(#tx-brushed)" opacity="0.25" style="mix-blend-mode: screen" />
      <!-- piano-key switches -->
      <g :transform="`translate(${OH70(vco) + 478} 30)`">
        <rect x="-3" y="-3" width="50" height="76" rx="3" fill="#26170c" />
        <g v-for="(c, k) in KEYS" :key="k">
          <rect :x="k * 11" :y="k === 1 ? 6 : 0" width="10" height="64" rx="1.5" :fill="c" stroke="#26170c" stroke-width="0.6" />
          <rect :x="k * 11 + 1.5" :y="(k === 1 ? 6 : 0) + 2" width="3" height="54" fill="#fff" opacity="0.35" />
        </g>
      </g>
      <!-- its section's tape -->
      <g :transform="`translate(${OH70(vco) + 398} 138)`">
        <rect x="-62" y="-8" width="124" height="16" rx="1" fill="#1d1d1f" />
        <rect x="-62" y="-8" width="124" height="3" fill="#fff" opacity="0.08" />
        <text y="4" text-anchor="middle" :font-family="skin.font" font-size="9" font-weight="700" letter-spacing="1.6" fill="#f2f2f2">{{ NAMES[vco] }}</text>
      </g>
    </g>
    <!-- the aluminium strips between the sections -->
    <rect v-for="x in [533, 1066]" :key="`st${x}`" :x="x - 5" y="-40" width="10" height="210" fill="url(#b70-aluV)" />

    <!-- the racing stripe, along the glare shield and up the windscreen's sides -->
    <path v-for="k in [2, 1, 0]" :key="`rs${k}`" :d="stripe(k)" fill="none" :stroke="STRIPES[k]" stroke-width="10" stroke-linejoin="round" />

    <!-- the windscreen's frame and posts -->
    <path :d="design.glass" fill="none" stroke="#1a0e06" stroke-width="30" stroke-linejoin="round" />
    <path :d="design.glass" fill="none" stroke="url(#b70-aluV)" stroke-width="9" stroke-linejoin="round" />
    <path :d="design.glass" fill="none" stroke="#000" stroke-width="3" stroke-linejoin="round" opacity="0.8" />
    <g v-for="(p, i) in posts" :key="`p${i}`">
      <path :d="`M ${p.x0 - 14} 170 L ${p.x0 + 14} 170 L ${p.x1 + 14} 432 L ${p.x1 - 14} 432 Z`" fill="#1a0e06" />
      <path :d="`M ${p.x0 - 8} 170 L ${p.x0 + 8} 170 L ${p.x1 + 8} 432 L ${p.x1 - 8} 432 Z`" fill="url(#b70-vinyl)" />
      <path :d="`M ${p.x0 - 3} 170 L ${p.x0 + 1} 170 L ${p.x1 + 1} 432 L ${p.x1 - 3} 432 Z`" fill="#fff" opacity="0.25" />
    </g>

    <!-- the glare shield: padded, stitched -->
    <path d="M -600 420 L 2200 420 L 2200 462 Q 800 474 -600 462 Z" fill="url(#b70-shield)" />
    <path d="M -600 420 L 2200 420 L 2200 462 Q 800 474 -600 462 Z" fill="url(#tx-leather)" opacity="0.7" style="mix-blend-mode: overlay" />
    <path d="M -600 425 L 2200 425" stroke="#c48a52" stroke-width="2" opacity="0.5" />
    <path d="M -600 455 Q 800 466 2200 455" stroke="#d9a05a" stroke-width="1.2" stroke-dasharray="5 4" fill="none" opacity="0.6" />
    <path v-for="k in [0, 1, 2]" :key="`gs${k}`" :d="`M -600 ${432 + k * 7} L 2200 ${432 + k * 7}`" :stroke="STRIPES[k]" stroke-width="5" opacity="0.92" />
    <g transform="translate(1500 384)">
      <rect x="-70" y="-9" width="140" height="18" rx="1" fill="#1d1d1f" />
      <text y="4" text-anchor="middle" :font-family="skin.font" font-size="9.5" font-weight="700" letter-spacing="2" fill="#f2f2f2">DEEP SPACE HAULER</text>
    </g>
    <g transform="translate(130 384)">
      <rect x="-50" y="-9" width="100" height="18" rx="1" fill="#1d1d1f" />
      <text y="4" text-anchor="middle" :font-family="skin.font" font-size="9.5" font-weight="700" letter-spacing="2" fill="#f2f2f2">SHIP TIME</text>
    </g>

    <!-- the dash: walnut -->
    <rect x="-600" y="462" width="2800" height="900" fill="url(#b70-walnut)" />
    <rect x="-600" y="462" width="2800" height="900" fill="url(#tx-wood)" opacity="0.85" style="mix-blend-mode: multiply" />
    <rect x="-600" y="462" width="2800" height="900" fill="url(#tx-scratches)" opacity="0.15" style="mix-blend-mode: screen" />
    <rect x="-600" y="462" width="2800" height="14" fill="#000" opacity="0.45" />
    <g v-for="vco in [0, 1, 2]" :key="`c${vco}`">
      <!-- the console's bezel and its walnut face -->
      <rect :x="X70(vco) - 4" y="446" width="528" height="460" rx="12" fill="#000" opacity="0.55" transform="translate(4 6)" />
      <rect :x="X70(vco) - 4" y="446" width="528" height="460" rx="12" fill="url(#b70-alu)" stroke="#26170c" stroke-width="1.5" />
      <rect :x="X70(vco) - 4" y="446" width="528" height="460" rx="12" fill="url(#tx-brushed)" opacity="0.5" style="mix-blend-mode: multiply" />
      <rect :x="X70(vco) + 4" y="454" width="512" height="444" rx="7" fill="url(#b70-walnutD)" />
      <rect :x="X70(vco) + 4" y="454" width="512" height="444" rx="7" fill="url(#tx-wood)" opacity="0.9" style="mix-blend-mode: overlay" />
      <rect :x="X70(vco) + 4" y="454" width="512" height="444" rx="7" fill="none" stroke="#000" stroke-width="4" opacity="0.4" />
      <circle v-for="(s, i) in screws(X70(vco) - 4, 446, 528, 460, 6)" :key="i" :cx="s.x" :cy="s.y" r="3.2" fill="url(#b70-screw)" />

      <!-- the CRT's moulded hood -->
      <rect :x="X70(vco) + 0" y="448" width="228" height="152" rx="18" fill="#000" opacity="0.45" transform="translate(3 5)" />
      <rect :x="X70(vco) + 0" y="448" width="228" height="152" rx="18" fill="url(#b70-hood)" stroke="#26170c" stroke-width="1.5" />
      <rect :x="X70(vco) + 0" y="448" width="228" height="152" rx="18" fill="url(#tx-speckle)" opacity="0.3" style="mix-blend-mode: multiply" />
      <path :d="`M ${X70(vco) + 14} 452 L ${X70(vco) + 214} 452`" stroke="#fff" stroke-width="2" opacity="0.5" stroke-linecap="round" />
      <text :x="X70(vco) + 114" y="597" text-anchor="middle" :font-family="skin.font" font-size="6.5" font-weight="700" letter-spacing="2" fill="#4a3418">WAVEFORM · CH {{ vco + 1 }}</text>

      <!-- the VU's backlit housing, and the intake's collar -->
      <rect :x="X70(vco) + 228" y="462" width="76" height="150" rx="8" fill="#1a1008" stroke="#26170c" stroke-width="1" />
      <rect :x="X70(vco) + 232" y="468" width="68" height="78" rx="5" fill="url(#b70-vu)" opacity="0.7" />
      <circle :cx="X70(vco) + 266" cy="576" r="30" fill="url(#b70-aluV)" stroke="#26170c" stroke-width="1" />
      <text :x="X70(vco) + 266" y="609" text-anchor="middle" :font-family="skin.font" font-size="6" font-weight="700" letter-spacing="1.5" fill="#d9c79a">CARGO</text>

      <!-- the throttle pedestal: crinkle black, its quadrant printed -->
      <rect :x="X70(vco) + 316" y="458" width="192" height="222" rx="10" fill="url(#b70-crinkle)" stroke="#000" stroke-width="1.5" />
      <rect :x="X70(vco) + 316" y="458" width="192" height="222" rx="10" fill="url(#tx-noise)" opacity="0.35" style="mix-blend-mode: overlay" />
      <text :x="X70(vco) + 412" y="472" text-anchor="middle" :font-family="skin.font" font-size="7" font-weight="700" letter-spacing="2" fill="#f2b233">FULL</text>
      <rect :x="X70(vco) + 322" y="500" width="4" height="136" :fill="STRIPES[0]" opacity="0.7" />
      <rect :x="X70(vco) + 498" y="500" width="4" height="136" :fill="STRIPES[1]" opacity="0.7" />

      <!-- the knobs' aluminium strip -->
      <rect :x="X70(vco) + 10" y="610" width="282" height="190" rx="8" fill="#000" opacity="0.18" />
      <rect :x="X70(vco) + 10" y="610" width="282" height="190" rx="8" fill="none" stroke="#c48a52" stroke-width="1" opacity="0.35" />

      <!-- the hand controller's pad -->
      <rect :x="X70(vco) + 352" y="684" width="116" height="114" rx="14" fill="#1a0e06" opacity="0.8" />
      <rect :x="X70(vco) + 352" y="684" width="116" height="114" rx="14" fill="url(#tx-leather)" opacity="0.6" style="mix-blend-mode: overlay" />
      <rect :x="X70(vco) + 358" y="690" width="104" height="102" rx="10" fill="none" stroke="#d9a05a" stroke-width="1" stroke-dasharray="3 3" opacity="0.6" />

      <!-- rocker switches -->
      <g v-for="k in 3" :key="`rk${k}`" :transform="`translate(${X70(vco) + 490} ${672 + k * 34})`">
        <rect x="-11" y="-14" width="22" height="28" rx="3" fill="#120c08" />
        <path :d="k === 2 ? 'M -8 -11 L 8 -11 L 8 2 L -8 11 Z' : 'M -8 -11 L 8 -2 L 8 11 L -8 11 Z'" :fill="k === 2 ? STRIPES[0] : '#3a3430'" stroke="#000" stroke-width="0.8" />
        <circle cx="0" :cy="k === 2 ? -6 : 6" r="1.8" :fill="k === 2 ? '#fff6d0' : '#6a6460'" />
      </g>
      <circle :cx="X70(vco) + 490" cy="808" r="5" fill="url(#b70-lampA)" />

      <!-- the tuning dial: backlit amber glass -->
      <rect :x="X70(vco) + 24" y="806" width="472" height="88" rx="9" fill="url(#b70-aluV)" />
      <rect :x="X70(vco) + 28" y="810" width="464" height="80" rx="6" fill="url(#b70-dial)" />
      <rect :x="X70(vco) + 60" y="818" width="400" height="18" rx="6" fill="#ffb43d" opacity="0.35" filter="url(#b70-glow)" />
      <g v-for="n in dialNums" :key="`dn${n}`">
        <line :x1="X70(vco) + 70 + n * 38" :x2="X70(vco) + 70 + n * 38" y1="828" y2="834" stroke="#ffd27a" stroke-width="1.2" />
        <line v-if="n < 10" :x1="X70(vco) + 89 + n * 38" :x2="X70(vco) + 89 + n * 38" y1="831" y2="834" stroke="#ffd27a" stroke-width="0.8" opacity="0.7" />
        <text :x="X70(vco) + 70 + n * 38" y="825" text-anchor="middle" :font-family="skin.font" font-size="7.5" fill="#ffe0a0">{{ n * 10 }}</text>
      </g>
      <text :x="X70(vco) + 40" y="825" :font-family="skin.font" font-size="6" font-weight="700" fill="#ffb43d">%</text>
      <g :transform="`translate(${X70(vco) + 260} 882)`">
        <rect x="-46" y="-7" width="92" height="13" rx="1" fill="#1d1d1f" />
        <text y="3" text-anchor="middle" :font-family="skin.font" font-size="7.5" font-weight="700" letter-spacing="1.6" fill="#f2f2f2">POS · WAVE</text>
      </g>
      <rect :x="X70(vco) + 28" y="810" width="464" height="20" rx="6" fill="#fff" opacity="0.06" />
    </g>

    <!-- below the dash (tall screens): the kick panel, chrome strip, tape decks, shag -->
    <rect x="-600" y="912" width="2800" height="500" fill="url(#b70-vinyl)" />
    <rect x="-600" y="912" width="2800" height="500" fill="url(#tx-leather)" opacity="0.6" style="mix-blend-mode: overlay" />
    <rect x="-600" y="912" width="2800" height="10" fill="url(#b70-alu)" />
    <g v-for="vco in [0, 1, 2]" :key="`td${vco}`" :transform="`translate(${X70(vco) + 260} 966)`">
      <rect x="-120" y="-26" width="240" height="52" rx="6" fill="url(#b70-alu)" stroke="#26170c" stroke-width="1.2" />
      <rect x="-120" y="-26" width="240" height="52" rx="6" fill="url(#tx-brushed)" opacity="0.5" style="mix-blend-mode: multiply" />
      <rect x="-80" y="-10" width="160" height="14" rx="2" fill="#0a0604" />
      <rect x="-76" y="-8" width="152" height="3" fill="#f2b233" opacity="0.5" />
      <circle v-for="k in 4" :key="k" :cx="-108 + (k > 2 ? 196 : 0) + ((k - 1) % 2) * 20" cy="0" r="6" fill="#1a1410" stroke="#a8a49c" stroke-width="1" />
      <text y="18" text-anchor="middle" :font-family="skin.font" font-size="6.5" font-weight="700" letter-spacing="2" fill="#4a3418">TAPE · CH {{ vco + 1 }}</text>
    </g>
    <rect x="-600" y="1010" width="2800" height="400" fill="#b4561e" />
    <rect x="-600" y="1010" width="2800" height="400" fill="url(#tx-velvet)" opacity="0.9" style="mix-blend-mode: multiply" />
    <rect x="-600" y="1010" width="2800" height="400" fill="url(#tx-noise)" opacity="0.6" style="mix-blend-mode: overlay" />
    <rect x="-600" y="1004" width="2800" height="8" fill="#000" opacity="0.4" />

    <!-- past the stage's sides (wide screens): breaker panels -->
    <g v-for="(bx, k) in [-330, 1622]" :key="`bp${k}`" :transform="`translate(${bx} 470)`">
      <rect width="308" height="420" rx="10" fill="#000" opacity="0.5" transform="translate(4 6)" />
      <rect width="308" height="420" rx="10" fill="url(#b70-gold)" stroke="#26170c" stroke-width="1.5" />
      <rect width="308" height="420" rx="10" fill="url(#tx-speckle)" opacity="0.35" style="mix-blend-mode: multiply" />
      <g v-for="r in 8" :key="r">
        <g v-for="c in 6" :key="c" :transform="`translate(${30 + (c - 1) * 50} ${40 + (r - 1) * 46})`">
          <circle r="11" fill="#1a1410" />
          <circle r="7" :fill="(r * 7 + c * 3) % 11 === 0 ? '#e8662a' : '#f4f0e6'" stroke="#26170c" stroke-width="0.8" />
          <rect x="-14" y="15" width="28" height="7" rx="1" fill="#1d1d1f" />
        </g>
      </g>
      <g :transform="`translate(154 404)`">
        <rect x="-60" y="-8" width="120" height="16" rx="1" fill="#1d1d1f" />
        <text y="4" text-anchor="middle" :font-family="skin.font" font-size="8.5" font-weight="700" letter-spacing="2" fill="#f2f2f2">{{ k ? 'AUX BUS B' : 'MAIN BUS A' }}</text>
      </g>
    </g>
  </g>
</template>

<style scoped>
.sweep {
  animation: sweep 60s steps(60) infinite;
}
@keyframes sweep {
  to {
    transform: rotate(360deg);
  }
}
</style>
