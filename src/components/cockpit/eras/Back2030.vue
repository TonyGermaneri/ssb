<script setup lang="ts">
import type { CockpitDesign, Skin } from '../../../lib/voyage/cockpit/design'

/**
 * The THIRTIES' cockpit, behind its controls: brushed stainless bulkhead round a two-pane trapezoid windscreen (a slim
 * centre pillar, rubber seals, bolted frames), black heat-shield hex tiles on the walls, a black Alcantara glareshield
 * with master-caution lamps and a holographic flight strip, and the instrument panel -- three bays of matte composite
 * in machined stainless bezels, carbon inserts under the throttles, Torx screws, guard rails round the tone toggles
 * with their red covers flipped up, panel lines and engraved legends.
 */
const props = defineProps<{ design: CockpitDesign; skin: Skin }>()
const X0 = (vco: number) => 24 + vco * 520
const W = 512
const NAMES = ['BOW', 'MIDSHIPS', 'STERN']
const bulk = () => `M -700 -500 H 2300 V 1500 H -700 Z ${props.design.glass}`
const FONT = "'DIN Alternate', 'Eurostile', 'Helvetica Neue', Arial, sans-serif"
/** screws along a line */
const screws = (x0: number, y0: number, x1: number, y1: number, n: number) =>
  Array.from({ length: n }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / Math.max(1, n - 1), y: y0 + ((y1 - y0) * i) / Math.max(1, n - 1) }))
const frameBolts = [...screws(262, 40, 760, 30, 9), ...screws(840, 30, 1338, 40, 9), ...screws(130, 410, 760, 424, 10), ...screws(840, 424, 1470, 410, 10)]
const hex = (r: number) => [0, 1, 2, 3, 4, 5].map((k) => `${(Math.cos((k * Math.PI) / 3 + Math.PI / 6) * r).toFixed(2)},${(Math.sin((k * Math.PI) / 3 + Math.PI / 6) * r).toFixed(2)}`).join(' ')
</script>

<template>
  <g class="back2030">
    <defs>
      <linearGradient id="b30-steel" x1="0" y1="0" x2="1" y2="0.35">
        <stop offset="0" stop-color="#6c7178" />
        <stop offset="0.22" stop-color="#c9ced3" />
        <stop offset="0.4" stop-color="#8b9097" />
        <stop offset="0.62" stop-color="#e9ecef" />
        <stop offset="0.8" stop-color="#7b8087" />
        <stop offset="1" stop-color="#4b5056" />
      </linearGradient>
      <linearGradient id="b30-steelV" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f2f4f6" />
        <stop offset="0.3" stop-color="#a6abb1" />
        <stop offset="0.65" stop-color="#5d6268" />
        <stop offset="1" stop-color="#2b2e33" />
      </linearGradient>
      <linearGradient id="b30-steelH" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#2b2e33" />
        <stop offset="0.35" stop-color="#9aa0a6" />
        <stop offset="0.5" stop-color="#f4f6f8" />
        <stop offset="0.65" stop-color="#8a9096" />
        <stop offset="1" stop-color="#25282c" />
      </linearGradient>
      <linearGradient id="b30-wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3b3f45" />
        <stop offset="0.5" stop-color="#5a5f66" />
        <stop offset="1" stop-color="#1d2024" />
      </linearGradient>
      <linearGradient id="b30-alc" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2a2c30" />
        <stop offset="0.25" stop-color="#151619" />
        <stop offset="1" stop-color="#060708" />
      </linearGradient>
      <linearGradient id="b30-panel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2b2e33" />
        <stop offset="0.5" stop-color="#1d1f23" />
        <stop offset="1" stop-color="#141518" />
      </linearGradient>
      <linearGradient id="b30-face" x1="0" y1="0" x2="0.2" y2="1">
        <stop offset="0" stop-color="#26282c" />
        <stop offset="0.5" stop-color="#18191c" />
        <stop offset="1" stop-color="#0e0f11" />
      </linearGradient>
      <linearGradient id="b30-carbon" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#2a2d31" />
        <stop offset="0.5" stop-color="#121315" />
        <stop offset="1" stop-color="#1f2124" />
      </linearGradient>
      <linearGradient id="b30-sheen" x1="0" y1="0" x2="1" y2="0.6">
        <stop offset="0" stop-color="#fff" stop-opacity="0.22" />
        <stop offset="0.3" stop-color="#fff" stop-opacity="0" />
        <stop offset="0.55" stop-color="#fff" stop-opacity="0.08" />
        <stop offset="0.6" stop-color="#fff" stop-opacity="0" />
      </linearGradient>
      <radialGradient id="b30-sunpool" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#fff6e6" stop-opacity="0.55" />
        <stop offset="0.4" stop-color="#ffe8c8" stop-opacity="0.16" />
        <stop offset="1" stop-color="#ffe8c8" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="b30-earthglow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#5fb8ff" stop-opacity="0.35" />
        <stop offset="1" stop-color="#5fb8ff" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="b30-screw" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.5" stop-color="#8d9298" />
        <stop offset="1" stop-color="#26292d" />
      </radialGradient>
      <radialGradient id="b30-amber" cx="0.4" cy="0.35" r="0.7">
        <stop offset="0" stop-color="#fff4d0" />
        <stop offset="0.3" stop-color="#ffb02e" />
        <stop offset="1" stop-color="#5a2e00" />
      </radialGradient>
      <radialGradient id="b30-red" cx="0.4" cy="0.35" r="0.7">
        <stop offset="0" stop-color="#ffd6cc" />
        <stop offset="0.3" stop-color="#e2321e" />
        <stop offset="1" stop-color="#400804" />
      </radialGradient>
      <linearGradient id="b30-cover" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ff5a44" stop-opacity="0.9" />
        <stop offset="1" stop-color="#8a1206" stop-opacity="0.85" />
      </linearGradient>
      <linearGradient id="b30-holo" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#9fe3ff" stop-opacity="0" />
        <stop offset="0.15" stop-color="#9fe3ff" stop-opacity="0.9" />
        <stop offset="0.85" stop-color="#9fe3ff" stop-opacity="0.9" />
        <stop offset="1" stop-color="#9fe3ff" stop-opacity="0" />
      </linearGradient>
      <pattern id="b30-hex" patternUnits="userSpaceOnUse" width="41.57" height="72" patternTransform="rotate(8)">
        <rect width="41.57" height="72" fill="#0c0d0f" />
        <polygon :points="hex(22.6)" transform="translate(20.78 12)" fill="#1a1b1e" stroke="#000" stroke-width="2" />
        <polygon :points="hex(22.6)" transform="translate(0 48)" fill="#17181b" stroke="#000" stroke-width="2" />
        <polygon :points="hex(22.6)" transform="translate(41.57 48)" fill="#1c1d20" stroke="#000" stroke-width="2" />
        <polygon :points="hex(20)" transform="translate(20.78 12)" fill="none" stroke="#fff" stroke-opacity="0.06" stroke-width="1" />
      </pattern>
      <radialGradient id="b30-limb" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0.975" stop-color="#4da6ff" stop-opacity="0.9" />
        <stop offset="0.99" stop-color="#8fd0ff" stop-opacity="0.35" />
        <stop offset="1" stop-color="#8fd0ff" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="b30-earth" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0.97" stop-color="#020812" />
        <stop offset="0.993" stop-color="#0a2a50" />
        <stop offset="1" stop-color="#2c6fb8" />
      </radialGradient>
      <linearGradient id="b30-terminator" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#000" stop-opacity="0" />
        <stop offset="0.55" stop-color="#000" stop-opacity="0.1" />
        <stop offset="1" stop-color="#000" stop-opacity="0.65" />
      </linearGradient>
      <clipPath id="b30-panes"><path :d="design.glass" /></clipPath>
      <clipPath id="b30-walls"><path d="M -700 -500 H 2300 V 470 H -700 Z" /></clipPath>
    </defs>

    <!-- the bulkhead: brushed stainless, everything but the glass -->
    <path :d="bulk()" fill-rule="evenodd" fill="url(#b30-wall)" />
    <path :d="bulk()" fill-rule="evenodd" fill="url(#tx-brushed)" opacity="0.55" style="mix-blend-mode: overlay" />
    <!-- the walls each side: heat-shield hex tiles in a frame -->
    <g clip-path="url(#b30-walls)">
      <path d="M -700 -500 L 210 -500 L 210 30 L 70 400 L 70 470 L -700 470 Z" fill="url(#b30-hex)" />
      <path d="M 2300 -500 L 1390 -500 L 1390 30 L 1530 400 L 1530 470 L 2300 470 Z" fill="url(#b30-hex)" />
      <path d="M -700 -500 L 210 -500 L 210 30 L 70 400 L 70 470 L -700 470 Z" fill="url(#tx-speckle)" opacity="0.25" style="mix-blend-mode: screen" />
      <path d="M 2300 -500 L 1390 -500 L 1390 30 L 1530 400 L 1530 470 L 2300 470 Z" fill="url(#tx-speckle)" opacity="0.25" style="mix-blend-mode: screen" />
      <path d="M 210 -500 L 210 30 L 70 400 L 70 470" fill="none" stroke="url(#b30-steelH)" stroke-width="8" />
      <path d="M 1390 -500 L 1390 30 L 1530 400 L 1530 470" fill="none" stroke="url(#b30-steelH)" stroke-width="8" />
    </g>
    <!-- the overhead: a stainless header with its rib -->
    <rect x="-700" y="-500" width="3000" height="514" fill="url(#b30-steelV)" opacity="0.35" />
    <rect x="-700" y="4" width="3000" height="6" fill="#000" opacity="0.45" />
    <rect x="-700" y="10" width="3000" height="1.4" fill="#fff" opacity="0.25" />
    <!-- sunlight raking across the header -->
    <ellipse cx="240" cy="40" rx="520" ry="120" fill="url(#b30-sunpool)" style="mix-blend-mode: screen" />

    <!-- the overhead console (seen on taller screens): breakers, guarded switches, a grab handle -->
    <g>
      <rect x="230" y="-330" width="1140" height="318" rx="14" fill="url(#b30-face)" stroke="url(#b30-steelH)" stroke-width="5" />
      <rect x="230" y="-330" width="1140" height="318" rx="14" fill="url(#tx-carbon)" opacity="0.35" style="mix-blend-mode: overlay" />
      <g v-for="row in 3" :key="`or${row}`">
        <g v-for="k in 22" :key="`ob${k}`" :transform="`translate(${262 + k * 48} ${-310 + row * 64})`">
          <circle r="9" fill="#0a0b0c" stroke="#4a4e54" stroke-width="1" />
          <circle r="6" :fill="(k * 7 + row * 3) % 11 === 0 ? '#e2321e' : '#2a2c30'" />
          <circle cx="-2" cy="-2" r="2" fill="#fff" opacity="0.2" />
          <text y="22" text-anchor="middle" :font-family="FONT" font-size="6" fill="#e4e7ea" opacity="0.45">{{ String.fromCharCode(64 + row) }}{{ k }}</text>
        </g>
      </g>
      <g v-for="k in 10" :key="`og${k}`" :transform="`translate(${300 + k * 92} -64)`">
        <rect x="-11" y="-16" width="22" height="32" rx="3" fill="url(#b30-steelV)" stroke="#000" stroke-width="0.8" />
        <rect x="-3" y="-20" width="6" height="18" rx="3" fill="url(#b30-steelH)" />
        <path d="M -14 -22 L 14 -22 L 12 -30 L -12 -30 Z" fill="url(#b30-cover)" opacity="0.9" />
      </g>
      <rect x="680" y="-24" width="240" height="14" rx="7" fill="url(#b30-steelV)" stroke="#000" stroke-width="1" />
    </g>
    <!-- the windscreen: rubber seal, stainless frame, bolts; the pillar -->
    <!-- the Earth below, its limb glowing (low in the glass, under the rocks' lane) -->
    <g clip-path="url(#b30-panes)">
      <circle cx="800" cy="3236" r="2900" fill="url(#b30-earth)" />
      <circle cx="800" cy="3236" r="2900" fill="url(#tx-patina)" opacity="0.35" style="mix-blend-mode: screen" />
      <ellipse cx="420" cy="372" rx="260" ry="10" fill="#dfefff" opacity="0.12" />
      <ellipse cx="980" cy="360" rx="180" ry="7" fill="#dfefff" opacity="0.1" />
      <ellipse cx="660" cy="392" rx="300" ry="9" fill="#dfefff" opacity="0.08" />
      <rect x="0" y="300" width="1600" height="120" fill="url(#b30-terminator)" />
      <circle cx="800" cy="3236" r="2900" fill="none" stroke="#1f6fd0" stroke-width="30" opacity="0.22" />
      <circle cx="800" cy="3236" r="2900" fill="none" stroke="#5fb4ff" stroke-width="10" opacity="0.4" />
      <circle cx="800" cy="3236" r="2901" fill="none" stroke="#e8f6ff" stroke-width="2.2" opacity="0.85" />
      <circle cx="800" cy="3236" r="2907" fill="none" stroke="#7fc8ff" stroke-width="1" opacity="0.35" />
    </g>
    <!-- its frame: an inner chamfer, a black gasket, a slim bolted stainless ring -->
    <path :d="design.glass" fill="none" stroke="#000" stroke-width="40" opacity="0.35" transform="translate(5 9)" />
    <path :d="design.glass" fill="none" stroke="url(#b30-steel)" stroke-width="24" stroke-linejoin="round" />
    <path :d="design.glass" fill="none" stroke="url(#tx-brushed)" stroke-width="24" opacity="0.55" style="mix-blend-mode: overlay" />
    <path :d="design.glass" fill="none" stroke="#000" stroke-width="12" stroke-linejoin="round" opacity="0.5" />
    <path :d="design.glass" fill="none" stroke="#0b0c0d" stroke-width="7" stroke-linejoin="round" />
    <path :d="design.glass" fill="none" stroke="#5c6168" stroke-width="0.8" stroke-linejoin="round" opacity="0.7" />
    <path :d="design.glass" fill="none" stroke="#fff" stroke-width="1" opacity="0.35" transform="translate(-1.5 -11)" />
    <g>
      <rect x="788" y="20" width="24" height="410" fill="#0a0b0c" />
      <rect x="791" y="20" width="18" height="410" fill="url(#b30-steelH)" />
      <rect x="791" y="20" width="18" height="410" fill="url(#tx-brushed)" opacity="0.5" style="mix-blend-mode: overlay" />
      <rect x="799.4" y="40" width="1.2" height="370" fill="#000" opacity="0.4" />
      <circle v-for="k in 6" :key="`pb${k}`" cx="800" :cy="40 + k * 56" r="2.6" fill="url(#b30-screw)" />
    </g>
    <circle v-for="(b, i) in frameBolts" :key="`fb${i}`" :cx="b.x" :cy="b.y" r="2.8" fill="url(#b30-screw)" stroke="#000" stroke-width="0.5" />

    <!-- the glareshield: black Alcantara, its lip catching the Earth's glow -->
    <path d="M -700 418 L 70 396 Q 800 404 1530 396 L 2300 418 L 2300 478 Q 800 492 -700 478 Z" fill="url(#b30-alc)" />
    <path d="M -700 418 L 70 396 Q 800 404 1530 396 L 2300 418 L 2300 478 Q 800 492 -700 478 Z" fill="url(#tx-velvet)" opacity="0.6" style="mix-blend-mode: overlay" />
    <path d="M -700 418 L 70 396 Q 800 404 1530 396 L 2300 418" fill="none" stroke="#7fb8e0" stroke-width="1.4" opacity="0.45" />
    <ellipse cx="800" cy="404" rx="620" ry="20" fill="url(#b30-earthglow)" />
    <path d="M -700 478 Q 800 492 2300 478" fill="none" stroke="#000" stroke-width="5" opacity="0.7" />
    <!-- its stitching -->
    <path d="M -700 470 Q 800 484 2300 470" fill="none" stroke="#5a5e64" stroke-width="0.9" stroke-dasharray="4 4" opacity="0.6" />
    <!-- master caution / warning, left and right -->
    <g v-for="(lx, k) in [196, 1404]" :key="`mc${k}`" :transform="`translate(${lx} 440)`">
      <rect x="-58" y="-15" width="116" height="30" rx="4" fill="#0b0c0e" stroke="url(#b30-steelH)" stroke-width="1.5" />
      <rect x="-52" y="-10" width="50" height="20" rx="2.5" fill="url(#b30-amber)" opacity="0.92" />
      <rect x="2" y="-10" width="50" height="20" rx="2.5" fill="url(#b30-red)" opacity="0.55" />
      <text x="-27" y="3.4" text-anchor="middle" :font-family="FONT" font-size="7.5" font-weight="700" letter-spacing="0.6" fill="#2a1600">CAUTION</text>
      <text x="27" y="3.4" text-anchor="middle" :font-family="FONT" font-size="7.5" font-weight="700" letter-spacing="0.6" fill="#2a0604">WARN</text>
      <rect x="-52" y="-10" width="104" height="7" rx="2" fill="#fff" opacity="0.18" />
    </g>
    <!-- the holographic flight strip -->
    <g transform="translate(800 442)">
      <rect x="-300" y="-16" width="600" height="32" rx="3" fill="#020405" opacity="0.85" stroke="#9fe3ff" stroke-opacity="0.18" />
      <rect x="-300" y="-16" width="600" height="32" rx="3" fill="url(#tx-grille)" opacity="0.08" />
      <rect x="-286" y="11" width="572" height="1" fill="url(#b30-holo)" opacity="0.6" />
      <text x="-280" y="4" :font-family="FONT" font-size="11" letter-spacing="1.6" fill="#9fe3ff">ALT 412.6 KM</text>
      <text x="-150" y="4" :font-family="FONT" font-size="11" letter-spacing="1.6" fill="#9fe3ff">V 7.66 KM/S</text>
      <text x="0" y="4" text-anchor="middle" :font-family="FONT" font-size="12" font-weight="700" letter-spacing="3" fill="#e9faff">STEEL STARSHIP</text>
      <text x="150" y="4" :font-family="FONT" font-size="11" letter-spacing="1.6" fill="#9fe3ff">INC 51.6°</text>
      <text x="280" y="4" text-anchor="end" :font-family="FONT" font-size="11" letter-spacing="1.6" fill="#ffd27a">T+ 03:14:07</text>
    </g>

    <!-- the instrument panel: stainless, then the three bays -->
    <rect x="-700" y="482" width="3000" height="1000" fill="url(#b30-panel)" />
    <rect x="-700" y="482" width="3000" height="1000" fill="url(#tx-brushed)" opacity="0.28" style="mix-blend-mode: overlay" />
    <rect x="-700" y="482" width="3000" height="8" fill="#000" opacity="0.6" />
    <!-- the side consoles (seen on wider screens): vent grilles, hex inserts, switch rows, handholds -->
    <g v-for="(sx, k) in [-690, 1612]" :key="`sc${k}`">
      <rect :x="sx" y="484" width="678" height="900" rx="10" fill="url(#b30-face)" stroke="url(#b30-steelH)" stroke-width="4" />
      <rect :x="sx + 30" y="510" width="618" height="110" rx="6" fill="#0a0b0c" />
      <rect :x="sx + 30" y="510" width="618" height="110" rx="6" fill="url(#tx-grille)" opacity="0.6" />
      <rect :x="sx + 30" y="650" width="618" height="200" rx="6" fill="url(#b30-hex)" stroke="#000" stroke-width="2" />
      <g v-for="j in 12" :key="`ss${j}`" :transform="`translate(${sx + 40 + j * 48} 880)`">
        <rect x="-10" y="-14" width="20" height="28" rx="3" fill="url(#b30-steelV)" stroke="#000" stroke-width="0.8" />
        <rect x="-3" y="-18" width="6" height="16" rx="3" fill="url(#b30-steelH)" />
        <circle cy="24" r="2.4" :fill="j % 4 === 0 ? '#ffb02e' : '#39d27a'" opacity="0.8" />
      </g>
      <rect :x="sx + 60" y="950" width="560" height="18" rx="9" fill="url(#b30-steelV)" stroke="#000" stroke-width="1" />
    </g>
    <g v-for="v in [0, 1, 2]" :key="`bay${v}`">
      <!-- its bezel: machined stainless -->
      <rect :x="X0(v) - 4" y="468" :width="W + 8" height="520" rx="10" fill="#000" opacity="0.55" />
      <rect :x="X0(v) - 2" y="470" :width="W + 4" height="520" rx="9" fill="url(#b30-steel)" />
      <rect :x="X0(v) - 2" y="470" :width="W + 4" height="520" rx="9" fill="url(#tx-brushed)" opacity="0.6" style="mix-blend-mode: overlay" />
      <rect :x="X0(v) + 5" y="477" :width="W - 10" height="520" rx="5" fill="url(#b30-face)" stroke="#000" stroke-width="1.5" />
      <rect :x="X0(v) + 5" y="477" :width="W - 10" height="520" rx="5" fill="url(#tx-speckle)" opacity="0.1" style="mix-blend-mode: overlay" />
      <rect :x="X0(v) + 5" y="477" :width="W - 10" height="520" rx="5" fill="url(#b30-sheen)" />
      <!-- the top band: a recessed display well -->
      <rect :x="X0(v) + 10" y="474" width="252" height="98" rx="4" fill="#060708" stroke="#000" stroke-width="1" />
      <!-- panel lines between the bands -->
      <path :d="`M ${X0(v) + 8} 576 H ${X0(v) + W - 8}`" stroke="#000" stroke-width="1.6" opacity="0.8" />
      <path :d="`M ${X0(v) + 8} 577.4 H ${X0(v) + W - 8}`" stroke="#fff" stroke-width="0.6" opacity="0.14" />
      <path :d="`M ${X0(v) + 8} 672 H ${X0(v) + W - 8}`" stroke="#000" stroke-width="1.6" opacity="0.8" />
      <path :d="`M ${X0(v) + 8} 673.4 H ${X0(v) + W - 8}`" stroke="#fff" stroke-width="0.6" opacity="0.14" />
      <!-- the throttle quadrant's carbon insert -->
      <rect :x="X0(v) + 146" y="686" width="232" height="140" rx="6" fill="url(#b30-carbon)" stroke="#000" stroke-width="1.4" />
      <rect :x="X0(v) + 146" y="686" width="232" height="140" rx="6" fill="url(#tx-carbon)" opacity="0.85" style="mix-blend-mode: overlay" />
      <rect :x="X0(v) + 146" y="686" width="232" height="140" rx="6" fill="url(#b30-sheen)" opacity="0.8" />
      <text :x="X0(v) + 372" y="700" text-anchor="end" :font-family="FONT" font-size="6.5" letter-spacing="1" fill="#e4e7ea" opacity="0.6">MAX</text>
      <!-- the side-stick's Alcantara pad -->
      <rect :x="X0(v) + 384" y="686" width="122" height="140" rx="10" fill="url(#b30-alc)" stroke="#000" stroke-width="1" />
      <rect :x="X0(v) + 384" y="686" width="122" height="140" rx="10" fill="url(#tx-velvet)" opacity="0.7" style="mix-blend-mode: overlay" />
      <rect :x="X0(v) + 390" y="692" width="110" height="128" rx="7" fill="none" stroke="#5a5e64" stroke-width="0.8" stroke-dasharray="3 3" opacity="0.7" />
      <!-- the toggles' guard rails, their red covers flipped up -->
      <g v-for="tx in [32, 80]" :key="`tg${tx}`">
        <path :d="`M ${X0(v) + tx - 20} 634 V 582 M ${X0(v) + tx + 20} 634 V 582`" stroke="#000" stroke-width="5" opacity="0.5" transform="translate(1.5 2)" />
        <path :d="`M ${X0(v) + tx - 20} 634 V 582 M ${X0(v) + tx + 20} 634 V 582`" stroke="url(#b30-steelH)" stroke-width="4" stroke-linecap="round" />
        <path :d="`M ${X0(v) + tx - 18} 582 L ${X0(v) + tx - 14} 576 L ${X0(v) + tx + 14} 576 L ${X0(v) + tx + 18} 582 Z`" fill="url(#b30-cover)" stroke="#2a0602" stroke-width="0.8" />
        <rect :x="X0(v) + tx - 12" y="577" width="24" height="1.4" fill="#fff" opacity="0.4" />
      </g>
      <text :x="X0(v) + 56" y="664" text-anchor="middle" :font-family="FONT" font-size="6" letter-spacing="1.2" fill="#ff8a70" opacity="0.8">GUARDED · EQ</text>
      <!-- the bay's legend, engraved; its Torx screws -->
      <text :x="X0(v) + 354" y="489" :font-family="FONT" font-size="9" font-weight="700" letter-spacing="2.6" fill="#e4e7ea" opacity="0.85">{{ NAMES[v] }}</text>
      <text :x="X0(v) + 500" y="489" text-anchor="end" :font-family="FONT" font-size="6.5" letter-spacing="1.8" :fill="skin.vco[v]" opacity="0.9">VCO {{ v + 1 }}</text>
      <g v-for="(s, i) in [{ x: X0(v) + 1, y: 474 }, { x: X0(v) + W - 1, y: 474 }, { x: X0(v) + 1, y: 672 }, { x: X0(v) + W - 1, y: 672 }]" :key="`s${i}`" :transform="`translate(${s.x} ${s.y})`">
        <circle r="3.4" fill="url(#b30-screw)" stroke="#000" stroke-width="0.6" />
        <path d="M -1.8 0 H 1.8 M 0 -1.8 V 1.8" stroke="#1a1c1f" stroke-width="1.1" transform="rotate(20)" />
      </g>
    </g>
    <!-- sunlight falling across the panel's left -->
    <ellipse cx="260" cy="560" rx="460" ry="150" fill="url(#b30-sunpool)" opacity="0.45" style="mix-blend-mode: screen" />
  </g>
</template>
