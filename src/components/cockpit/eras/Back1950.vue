<script setup lang="ts">
import type { CockpitDesign, Skin } from '../../../lib/voyage/cockpit/design'

/**
 * The FIFTIES' cockpit, behind its controls: iron bulkhead round a riveted windscreen in three panes, the mahogany
 * switchboard overhead, a copper steam pipe along the sill with its flanges and a valve, pipes down the walls, and the
 * dash -- three oxblood-leather consoles, tufted, in riveted brass bezels with enamel nameplates and jewel lamps.
 */
const props = defineProps<{ design: CockpitDesign; skin: Skin }>()
const X0 = (vco: number) => 30 + vco * 515
const NAMES = ['BOW · VCO 1', 'MIDSHIPS · VCO 2', 'STERN · VCO 3']
const rivets = (x0: number, y0: number, x1: number, y1: number, step: number) => {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step))
  return Array.from({ length: n + 1 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n }))
}
const frameRivets = [
  ...rivets(70, 150, 1530, 150, 38),
  ...rivets(70, 456, 1530, 456, 38),
  ...rivets(36, 190, 36, 420, 38),
  ...rivets(1564, 190, 1564, 420, 38),
]
const mullions = [545, 1060]
const tufts = (x0: number) => {
  const out: { x: number; y: number }[] = []
  for (let r = 0; r < 6; r++) for (let c = 0; c < 9; c++) out.push({ x: x0 + 28 + c * 56 + (r % 2) * 28, y: 610 + r * 52 })
  return out.filter((p) => p.x < x0 + 490)
}
/** steam puffs: where along the sill, how big, when and how long they rise, how far they drift */
const steam = Array.from({ length: 14 }, (_, i) => ({
  x: [-32 + 185 * 2, -32 + 185 * 5, -32 + 185 * 8][i % 3] + (Math.random() - 0.5) * 20,
  r: 18 + Math.random() * 26,
  d: -Math.random() * 7,
  t: 5 + Math.random() * 4,
  dx: (Math.random() - 0.5) * 120,
}))
void props
</script>

<template>
  <g class="back1950">
    <defs>
      <linearGradient id="b50-iron" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2a2420" />
        <stop offset="0.5" stop-color="#3b322a" />
        <stop offset="1" stop-color="#16110d" />
      </linearGradient>
      <linearGradient id="b50-brass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff0b0" />
        <stop offset="0.25" stop-color="#d9a748" />
        <stop offset="0.6" stop-color="#8a5c1c" />
        <stop offset="1" stop-color="#3c2408" />
      </linearGradient>
      <linearGradient id="b50-brassV" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#3c2408" />
        <stop offset="0.3" stop-color="#c99a3c" />
        <stop offset="0.5" stop-color="#ffefb0" />
        <stop offset="0.7" stop-color="#b8862e" />
        <stop offset="1" stop-color="#3c2408" />
      </linearGradient>
      <linearGradient id="b50-copper" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3a1206" />
        <stop offset="0.3" stop-color="#e08a52" />
        <stop offset="0.45" stop-color="#ffd0a8" />
        <stop offset="0.65" stop-color="#b4562a" />
        <stop offset="1" stop-color="#2a0c04" />
      </linearGradient>
      <linearGradient id="b50-copperV" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#2a0c04" />
        <stop offset="0.35" stop-color="#c46a3a" />
        <stop offset="0.5" stop-color="#ffd0a8" />
        <stop offset="0.7" stop-color="#9a4420" />
        <stop offset="1" stop-color="#2a0c04" />
      </linearGradient>
      <linearGradient id="b50-mahogany" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#5a2410" />
        <stop offset="1" stop-color="#2a0e06" />
      </linearGradient>
      <radialGradient id="b50-leather" cx="0.5" cy="0.25" r="0.9">
        <stop offset="0" stop-color="#8a2a20" />
        <stop offset="0.6" stop-color="#5a1612" />
        <stop offset="1" stop-color="#2a0806" />
      </radialGradient>
      <radialGradient id="b50-rivet" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#fff2c0" />
        <stop offset="0.5" stop-color="#a87a2a" />
        <stop offset="1" stop-color="#2a1804" />
      </radialGradient>
      <radialGradient id="b50-tuft" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#000" stop-opacity="0.75" />
        <stop offset="0.5" stop-color="#000" stop-opacity="0.35" />
        <stop offset="1" stop-color="#000" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="b50-jewelR" cx="0.4" cy="0.35" r="0.7">
        <stop offset="0" stop-color="#fff" />
        <stop offset="0.25" stop-color="#ff6a4a" />
        <stop offset="1" stop-color="#5a0a04" />
      </radialGradient>
      <radialGradient id="b50-jewelA" cx="0.4" cy="0.35" r="0.7">
        <stop offset="0" stop-color="#fff" />
        <stop offset="0.25" stop-color="#ffc040" />
        <stop offset="1" stop-color="#5a3004" />
      </radialGradient>
      <linearGradient id="b50-enamel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f5efe0" />
        <stop offset="1" stop-color="#cfc4a8" />
      </linearGradient>
      <filter id="b50-lampglow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="6" /></filter>
      <radialGradient id="b50-steam" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#fff8ee" stop-opacity="0.55" />
        <stop offset="0.6" stop-color="#f4ece0" stop-opacity="0.18" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="b50-dial" cx="0.5" cy="0.45" r="0.6">
        <stop offset="0" stop-color="#fbf4e2" />
        <stop offset="1" stop-color="#d8c9a4" />
      </radialGradient>
    </defs>

    <!-- the bulkhead: everything but the glass -->
    <path :d="`M -500 -400 H 2100 V 1300 H -500 Z ${design.glass}`" fill-rule="evenodd" fill="url(#b50-iron)" />
    <path :d="`M -500 -400 H 2100 V 1300 H -500 Z ${design.glass}`" fill-rule="evenodd" fill="url(#tx-patina)" opacity="0.55" style="mix-blend-mode: overlay" />

    <!-- the overhead switchboard: mahogany, brass-trimmed -->
    <rect x="-500" y="-400" width="2600" height="550" fill="url(#b50-mahogany)" />
    <rect x="-500" y="-400" width="2600" height="550" fill="url(#tx-wood)" opacity="0.6" style="mix-blend-mode: multiply" />
    <rect x="-500" y="-400" width="2600" height="550" fill="url(#tx-scratches)" opacity="0.25" style="mix-blend-mode: screen" />
    <rect x="-500" y="68" width="2600" height="4" fill="#000" opacity="0.5" />
    <rect x="-500" y="140" width="2600" height="14" fill="url(#b50-brass)" />
    <circle v-for="(r, i) in rivets(-60, 147, 1660, 147, 30)" :key="`o${i}`" :cx="r.x" :cy="r.y" r="3" fill="url(#b50-rivet)" />

    <!-- the windscreen's frame and mullions, riveted -->
    <path :d="design.glass" fill="none" stroke="#120c08" stroke-width="30" />
    <path :d="design.glass" fill="none" stroke="url(#b50-brassV)" stroke-width="10" />
    <path :d="design.glass" fill="none" stroke="#000" stroke-width="2" opacity="0.6" transform="translate(0 6)" />
    <g v-for="mx in mullions" :key="mx">
      <rect :x="mx - 14" y="150" width="28" height="306" fill="#18100a" />
      <rect :x="mx - 9" y="150" width="18" height="306" fill="url(#b50-brassV)" />
      <rect :x="mx - 9" y="150" width="18" height="306" fill="url(#tx-patina)" opacity="0.5" style="mix-blend-mode: multiply" />
      <circle v-for="(r, i) in rivets(mx, 175, mx, 435, 32)" :key="i" :cx="r.x" :cy="r.y" r="3.4" fill="url(#b50-rivet)" />
    </g>
    <circle v-for="(r, i) in frameRivets" :key="`f${i}`" :cx="r.x" :cy="r.y" r="3.6" fill="url(#b50-rivet)" />

    <!-- the walls' pipes -->
    <g v-for="px in [8, 1592]" :key="px">
      <rect :x="px - 13" y="-400" width="26" height="1700" fill="url(#b50-copperV)" />
      <rect v-for="k in 6" :key="k" :x="px - 18" :y="-60 + k * 170" width="36" height="14" rx="3" fill="url(#b50-brassV)" />
    </g>

    <!-- the sill: a steam pipe with flanges, a valve, the nameplate -->
    <rect x="-500" y="452" width="2600" height="26" fill="url(#b50-copper)" />
    <rect x="-500" y="452" width="2600" height="26" fill="url(#tx-patina)" opacity="0.35" style="mix-blend-mode: multiply" />
    <g v-for="k in 9" :key="`fl${k}`">
      <rect :x="-40 + k * 185" y="446" width="16" height="38" rx="3" fill="url(#b50-brassV)" stroke="#1a0d06" stroke-width="1" />
      <circle :cx="-32 + k * 185" cy="451" r="2" fill="#1a0d06" />
      <circle :cx="-32 + k * 185" cy="479" r="2" fill="#1a0d06" />
    </g>
    <g transform="translate(800 465)">
      <rect x="-130" y="-13" width="260" height="26" rx="5" fill="url(#b50-enamel)" stroke="#3a2408" stroke-width="2" />
      <rect x="-126" y="-9" width="252" height="18" rx="3" fill="none" stroke="#9a2a1a" stroke-width="1.2" />
      <text y="5" text-anchor="middle" font-family="'Courier New', monospace" font-size="11" font-weight="700" letter-spacing="2.5" fill="#2a1a10">XS-57 · ATOMIC SAUCER</text>
    </g>

    <!-- steam from the flanges, curling up the glass -->
    <g class="steam">
      <circle v-for="(p, i) in steam" :key="`st${i}`" :cx="p.x" :cy="440" :r="p.r" fill="url(#b50-steam)" :style="{ animationDelay: `${p.d}s`, animationDuration: `${p.t}s`, '--dx': `${p.dx}px` }" />
    </g>
    <!-- the wall pipes' pressure gauges -->
    <g v-for="(gx, i) in [8, 1592]" :key="`pg${i}`" :transform="`translate(${gx} 300)`">
      <rect x="-6" y="-30" width="12" height="20" :fill="'url(#b50-brassV)'" />
      <circle r="26" fill="url(#b50-brass)" stroke="#1a0d06" stroke-width="1.5" />
      <circle r="21" fill="url(#b50-dial)" />
      <line v-for="k in 7" :key="k" :x1="Math.sin(((-110 + k * 30) * Math.PI) / 180) * 15" :y1="-Math.cos(((-110 + k * 30) * Math.PI) / 180) * 15" :x2="Math.sin(((-110 + k * 30) * Math.PI) / 180) * 19" :y2="-Math.cos(((-110 + k * 30) * Math.PI) / 180) * 19" stroke="#2a1a10" stroke-width="1.2" />
      <path d="M -1.5 3 L 0 -16 L 1.5 3 Z" fill="#9a1a10" class="quiver" />
      <circle r="2.5" fill="#2a1a10" />
    </g>

    <!-- the dash: mahogany, then three consoles -->
    <rect x="-500" y="478" width="2600" height="900" fill="url(#b50-mahogany)" />
    <rect x="-500" y="478" width="2600" height="900" fill="url(#tx-wood)" opacity="0.55" style="mix-blend-mode: multiply" />
    <rect x="-500" y="478" width="2600" height="10" fill="#000" opacity="0.55" />
    <g v-for="vco in [0, 1, 2]" :key="`c${vco}`">
      <!-- shadow, bezel, leather, tufting -->
      <rect :x="X0(vco) + 4" y="500" width="505" height="420" rx="22" fill="#000" opacity="0.6" filter="url(#cp-soft)" />
      <rect :x="X0(vco)" y="490" width="505" height="420" rx="22" fill="url(#b50-brass)" stroke="#1a0d06" stroke-width="2" />
      <rect :x="X0(vco) + 10" y="500" width="485" height="400" rx="16" fill="url(#b50-leather)" />
      <rect :x="X0(vco) + 10" y="500" width="485" height="400" rx="16" fill="url(#tx-leather)" opacity="0.7" style="mix-blend-mode: overlay" />
      <circle v-for="(t, i) in tufts(X0(vco))" :key="`t${i}`" :cx="t.x" :cy="t.y" r="7" fill="url(#b50-tuft)" />
      <rect :x="X0(vco) + 10" y="500" width="485" height="400" rx="16" fill="none" stroke="#000" stroke-width="6" opacity="0.35" />
      <circle v-for="(r, i) in rivets(X0(vco) + 20, 495, X0(vco) + 485, 495, 26)" :key="`r${i}`" :cx="r.x" :cy="r.y" r="2.6" fill="url(#b50-rivet)" />
      <!-- its well behind the screen and gauge (a darker inset) -->
      <rect :x="X0(vco) + 12" y="466" width="480" height="134" rx="14" fill="#140806" opacity="0.6" />
      <!-- its nameplate -->
      <g :transform="`translate(${X0(vco) + 252} 604)`">
        <rect x="-74" y="-9" width="148" height="18" rx="3" fill="url(#b50-enamel)" stroke="#3a2408" stroke-width="1.5" />
        <text y="4" text-anchor="middle" font-family="'Courier New', monospace" font-size="9.5" font-weight="700" letter-spacing="2" fill="#7a1a10">{{ NAMES[vco] }}</text>
      </g>
      <!-- jewel lamps -->
      <circle :cx="X0(vco) + 470" cy="584" r="12" fill="#ff4a2a" opacity="0.5" filter="url(#b50-lampglow)" />
      <circle :cx="X0(vco) + 470" cy="584" r="8" fill="url(#b50-brassV)" />
      <circle :cx="X0(vco) + 470" cy="584" r="5.5" fill="url(#b50-jewelR)" />
    </g>
    <!-- cable looms sagging between the consoles -->
    <path v-for="k in 2" :key="`w${k}`" :d="`M ${X0(k) - 30} 905 C ${X0(k) - 20} 960 ${X0(k) + 20} 960 ${X0(k) + 30} 905`" fill="none" stroke="#1a1410" stroke-width="12" />
  </g>
</template>

<style scoped>
.steam circle {
  transform-box: fill-box;
  transform-origin: center;
  animation: steam 7s ease-out infinite;
  opacity: 0;
}
@keyframes steam {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(0.4);
  }
  15% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
    transform: translate(var(--dx), -230px) scale(2.6);
  }
}
.quiver {
  transform-origin: 0 0;
  animation: quiver 0.18s ease-in-out infinite alternate;
}
@keyframes quiver {
  from {
    transform: rotate(18deg);
  }
  to {
    transform: rotate(23deg);
  }
}
</style>
