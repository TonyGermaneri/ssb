<script setup lang="ts">
import type { Era } from '../../lib/voyage/ship'

/**
 * The EIGHTIES ship's hull (lib/voyage/eras/e1980.ts): the VR-84 VECTOR RUNNER, a long low wedge of black carbon
 * faceted into three planes -- a top deck reflecting the dusk (and the sliced sun, smeared along it), a flank etched
 * with a laser grid, a belly catching the magenta horizon -- split by chrome bead lines, edged in neon (cyan along the
 * top, magenta along the keel, violet at the tail), with a raised canopy whose six-sided windscreen is the cockpit's,
 * chamfered wells, nacelles and plinths for every part, vector-wireframe trim, chevrons and a chrome VR-84. Static;
 * the parts are drawn round it.
 */
const props = defineProps<{ era: Era }>()
const P = props.era.palettes
const N = (n: number) => Array.from({ length: n }, (_, i) => i)

// ── the wedge: its outline and its three planes ──
const BODY = 'M -736 -132 L -300 -150 L -110 -162 L 380 -162 L 820 -6 L 812 8 L 600 112 L -300 122 L -736 112 Z'
const TOP = 'M -736 -132 L -300 -150 L -110 -162 L 380 -162 L 820 -6 L 760 -14 L 380 -128 L -110 -128 L -300 -118 L -736 -102 Z'
const BELLY = 'M -736 74 L -300 82 L 600 76 L 812 8 L 600 112 L -300 122 L -736 112 Z'
/** the chines: the top plane's edge, the belly's */
const CHINE_U = 'M -736 -102 L -300 -118 L -110 -128 L 380 -128 L 760 -14 L 820 -6'
const CHINE_L = 'M -736 74 L -300 82 L 600 76 L 812 8'
const TOP_EDGE = 'M -736 -132 L -300 -150 L -110 -162 L 380 -162 L 820 -6'
const KEEL = 'M -736 112 L -300 122 L 600 112 L 812 8'
// the canopy: a raised fairing, its six-sided glass (the cockpit's windscreen), a sill for the garden's lamps
const CANOPY = 'M -176 -160 L -96 -344 L 270 -344 L 404 -160 Z'
const GLASS = 'M -66 -334 L 256 -334 L 318 -248 L 300 -224 L -88 -224 L -104 -248 Z'
const SILL = 'M -110 -222 L 306 -222 L 330 -170 L -130 -170 Z'
// the tail: an engine block for the afterburners
const TAILPLATE = 'M -748 -126 L -716 -132 L -716 112 L -748 104 Z'

/** a chamfered well round a rectangle */
function well(x0: number, y0: number, x1: number, y1: number, c = 10) {
  return `M ${x0 + c} ${y0} L ${x1 - c} ${y0} L ${x1} ${y0 + c} L ${x1} ${y1 - c} L ${x1 - c} ${y1} L ${x0 + c} ${y1} L ${x0} ${y1 - c} L ${x0} ${y0 + c} Z`
}
/** an octagonal nacelle round a turbine */
function octagon(cx: number, cy: number, r: number) {
  return (
    N(8)
      .map((i) => {
        const a = ((i + 0.5) * Math.PI) / 4
        return `${i ? 'L' : 'M'} ${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`
      })
      .join(' ') + ' Z'
  )
}
const wells = [
  { d: well(-612, -122, -308, 42), c: P[2].alt },
  { d: well(278, -92, 542, 64), c: P[0].alt },
]
const slots = [
  { d: well(-600, 54, -320, 96, 8), c: P[2].alt },
  { d: well(-70, 28, 250, 72, 8), c: P[1].alt },
  { d: well(290, 66, 530, 104, 8), c: P[0].alt },
]
const turbines = [
  { cx: -170, cy: -40, r: 92, c: P[1].alt },
  { cx: 600, cy: 16, r: 64, c: P[0].alt },
  { cx: -665, cy: 15, r: 66, c: P[2].alt },
]
// vector wireframe: a truss of triangles along the top plane
const truss = (() => {
  const xs = N(24).map((i) => -720 + i * 46)
  const top = (x: number) => (x < -300 ? -132 - ((x + 736) / 436) * 18 : x < -110 ? -150 - ((x + 300) / 190) * 12 : x < 380 ? -162 : -162 + ((x - 380) / 440) * 156)
  const low = (x: number) => (x < -300 ? -102 - ((x + 736) / 436) * 16 : x < -110 ? -118 - ((x + 300) / 190) * 10 : x < 380 ? -128 : -128 + ((x - 380) / 380) * 114)
  return xs
    .filter((x) => x < 740)
    .map((x, i) => `M ${x} ${(i % 2 ? top(x) : low(x)).toFixed(1)} L ${x + 46} ${(i % 2 ? low(x + 46) : top(x + 46)).toFixed(1)}`)
    .join(' ')
})()
// the sliced sun, smeared along the top deck's chrome
const slices = N(6).map((k) => ({ y: -150 + k * 4.2, h: 2.6 - k * 0.25 }))
// LED ticks along the belly chine
const ticks = N(40).map((i) => -700 + i * 32)
</script>

<template>
  <g class="hull">
    <defs>
      <clipPath id="h80-body"><path :d="BODY" /></clipPath>
      <clipPath id="h80-top"><path :d="TOP" /></clipPath>
      <clipPath id="h80-glass"><path :d="GLASS" /></clipPath>
      <linearGradient id="h80-top" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4a3878" />
        <stop offset="0.5" stop-color="#22184a" />
        <stop offset="1" stop-color="#120c26" />
      </linearGradient>
      <linearGradient id="h80-flank" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#14101f" />
        <stop offset="0.5" stop-color="#0a0812" />
        <stop offset="1" stop-color="#050409" />
      </linearGradient>
      <linearGradient id="h80-belly" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0a0410" />
        <stop offset="0.55" stop-color="#3a0a3c" />
        <stop offset="1" stop-color="#c2186b" />
      </linearGradient>
      <!-- the sunset's warmth from ahead: stronger toward the nose -->
      <linearGradient id="h80-dusk" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ff2e7e" stop-opacity="0" />
        <stop offset="0.6" stop-color="#ff2e7e" stop-opacity="0.05" />
        <stop offset="1" stop-color="#ff7a40" stop-opacity="0.28" />
      </linearGradient>
      <linearGradient id="h80-canopy" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3e2c6a" />
        <stop offset="0.2" stop-color="#1a1230" />
        <stop offset="1" stop-color="#07050c" />
      </linearGradient>
      <linearGradient id="h80-glass" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stop-color="#5a2a8a" />
        <stop offset="0.45" stop-color="#1a0830" />
        <stop offset="0.8" stop-color="#3a0a3a" />
        <stop offset="1" stop-color="#ff2e7e" />
      </linearGradient>
      <linearGradient id="h80-sun" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffd23f" />
        <stop offset="0.5" stop-color="#ff7a3a" />
        <stop offset="1" stop-color="#ff2e7e" />
      </linearGradient>
      <radialGradient id="h80-sunfade" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#fff" />
        <stop offset="0.6" stop-color="#fff" stop-opacity="0.6" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </radialGradient>
      <mask id="h80-sunmask" maskUnits="userSpaceOnUse" x="-200" y="-170" width="700" height="60">
        <ellipse cx="160" cy="-142" rx="300" ry="26" fill="url(#h80-sunfade)" />
      </mask>
      <!-- eighties chrome: a blue sky band, a hard horizon, a hot ground -->
      <linearGradient id="h80-chrome" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1a2a6e" />
        <stop offset="0.4" stop-color="#9fe6ff" />
        <stop offset="0.5" stop-color="#ffffff" />
        <stop offset="0.54" stop-color="#3a1640" />
        <stop offset="0.8" stop-color="#ff7ac8" />
        <stop offset="1" stop-color="#ffe6f6" />
      </linearGradient>
      <linearGradient id="h80-well" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#010003" />
        <stop offset="0.2" stop-color="#08060f" />
        <stop offset="1" stop-color="#1a1528" />
      </linearGradient>
      <radialGradient id="h80-nacelle" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0.7" stop-color="#020104" />
        <stop offset="0.86" stop-color="#1e1a30" />
        <stop offset="0.93" stop-color="#4a4470" />
        <stop offset="1" stop-color="#0a0812" />
      </radialGradient>
      <!-- the laser grid, etched -->
      <pattern id="h80-grid" patternUnits="userSpaceOnUse" width="32" height="32" patternTransform="skewX(-24)">
        <path d="M 0 0 H 32 M 0 0 V 32" fill="none" stroke="#3df2ff" stroke-width="0.8" />
      </pattern>
      <pattern id="h80-grid2" patternUnits="userSpaceOnUse" width="128" height="128" patternTransform="skewX(-24)">
        <path d="M 0 0 H 128 M 0 0 V 128" fill="none" stroke="#ff5ce1" stroke-width="1.2" />
      </pattern>
    </defs>

    <!-- ── behind: the canopy fairing, the tail plate ── -->
    <path :d="CANOPY" fill="url(#h80-canopy)" />
    <path :d="CANOPY" fill="url(#tx-carbon)" opacity="0.5" style="mix-blend-mode: overlay" />
    <path d="M -176 -160 L -96 -344 L 270 -344 L 404 -160" fill="none" stroke="#e8fbff" stroke-width="1.6" opacity="0.7" stroke-linejoin="round" />
    <path d="M -96 -344 L 270 -344" stroke="#3df2ff" stroke-width="6" opacity="0.18" />
    <path d="M -170 -168 L -94 -338 M 268 -338 L 396 -168" fill="none" stroke="#ff2bd6" stroke-width="7" opacity="0.2" />
    <path d="M -170 -168 L -94 -338 M 268 -338 L 396 -168" fill="none" stroke="#ff8ef0" stroke-width="1.4" />
    <path d="M -150 -170 L -84 -320 L -70 -320 L -128 -170 Z" fill="url(#h80-grid)" opacity="0.4" />
    <path :d="TAILPLATE" fill="#0c0a14" />

    <!-- ── the wedge ── -->
    <path :d="BODY" fill="url(#h80-flank)" />
    <g clip-path="url(#h80-body)">
      <!-- (the paint again inside the clip: a clipped group blends only with what's in it) -->
      <path :d="BODY" fill="url(#h80-flank)" />
      <rect x="-760" y="-170" width="1600" height="300" fill="url(#tx-carbon)" opacity="0.7" style="mix-blend-mode: overlay" />
      <!-- the laser grid on the flank, brighter lines every fourth -->
      <rect x="-760" y="-130" width="1600" height="220" fill="url(#h80-grid)" opacity="0.28" />
      <rect x="-760" y="-130" width="1600" height="220" fill="url(#h80-grid2)" opacity="0.4" />
      <!-- the top deck, reflecting the dusk, the sliced sun smeared along it -->
      <path :d="TOP" fill="url(#h80-top)" />
      <path :d="TOP" fill="url(#tx-carbon)" opacity="0.4" style="mix-blend-mode: overlay" />
      <g clip-path="url(#h80-top)" mask="url(#h80-sunmask)" opacity="0.75">
        <rect v-for="(s, i) in slices" :key="`ss${i}`" x="-200" :y="s.y" width="700" :height="s.h + 1.6" fill="url(#h80-sun)" />
      </g>
      <path :d="truss" fill="none" stroke="#3df2ff" stroke-width="0.9" opacity="0.35" />
      <!-- the belly, catching the horizon -->
      <path :d="BELLY" fill="url(#h80-belly)" />
      <path :d="BELLY" fill="url(#h80-grid)" opacity="0.18" />
      <rect x="-760" y="-170" width="1600" height="300" fill="url(#h80-dusk)" />
      <!-- panel seams on the flank -->
      <path d="M -300 -118 V 82 M -110 -128 V 80 M 270 -128 V 78 M 560 -76 L 560 78 M -480 -110 V 80" fill="none" stroke="#000" stroke-width="2" opacity="0.8" />
      <path d="M -299 -118 V 82 M -109 -128 V 80 M 271 -128 V 78 M 561 -76 L 561 78 M -479 -110 V 80" fill="none" stroke="#6a5a9a" stroke-width="0.8" opacity="0.5" />
      <!-- LED ticks along the belly chine -->
      <rect v-for="(x, i) in ticks" :key="`tk${i}`" :x="x" :y="84 + (x + 700) * -0.004" width="12" height="2.5" :fill="i % 5 ? '#ff2bd6' : '#ffd23f'" :opacity="i % 5 ? 0.45 : 0.9" />
    </g>

    <!-- chrome bead lines along the chines -->
    <path :d="CHINE_U" fill="none" stroke="#e8fbff" stroke-width="2" stroke-linejoin="round" />
    <path :d="CHINE_U" fill="none" stroke="#ff7ac8" stroke-width="1.4" stroke-linejoin="round" transform="translate(0 2.2)" />
    <path :d="CHINE_L" fill="none" stroke="#9fe6ff" stroke-width="1.6" stroke-linejoin="round" />
    <path :d="CHINE_L" fill="none" stroke="#ff7ac8" stroke-width="1.6" stroke-linejoin="round" transform="translate(0 2)" />

    <!-- neon edge light: cyan along the top, magenta along the keel -->
    <path :d="TOP_EDGE" fill="none" stroke="#3df2ff" stroke-width="14" opacity="0.1" stroke-linejoin="round" />
    <path :d="TOP_EDGE" fill="none" stroke="#3df2ff" stroke-width="5" opacity="0.35" stroke-linejoin="round" />
    <path :d="TOP_EDGE" fill="none" stroke="#e8fdff" stroke-width="1.6" stroke-linejoin="round" />
    <path :d="KEEL" fill="none" stroke="#ff2bd6" stroke-width="16" opacity="0.12" stroke-linejoin="round" />
    <path :d="KEEL" fill="none" stroke="#ff2bd6" stroke-width="6" opacity="0.4" stroke-linejoin="round" />
    <path :d="KEEL" fill="none" stroke="#ffd6f6" stroke-width="1.8" stroke-linejoin="round" />
    <path d="M -748 -126 L -716 -132 M -748 104 L -716 112" fill="none" stroke="#a462ff" stroke-width="3" />

    <!-- ── the canopy: the cockpit's six-sided glass, the sill ── -->
    <path :d="GLASS" fill="url(#h80-glass)" />
    <g clip-path="url(#h80-glass)">
      <path d="M -40 -334 L 30 -334 L -50 -224 L -120 -224 Z M 60 -334 L 80 -334 L 0 -224 L -20 -224 Z" fill="#fff" opacity="0.12" />
      <path d="M -104 -236 H 320" stroke="#ff7ac8" stroke-width="2" opacity="0.6" />
    </g>
    <path :d="GLASS" fill="none" stroke="#c8fbff" stroke-width="2.5" stroke-linejoin="round" />
    <path :d="GLASS" fill="none" stroke="#00e5ff" stroke-width="8" opacity="0.18" stroke-linejoin="round" />
    <path :d="SILL" fill="#07050c" />
    <path :d="SILL" fill="url(#tx-carbon)" opacity="0.5" style="mix-blend-mode: overlay" />
    <path d="M -130 -170 L 330 -170" stroke="#00e5ff" stroke-width="2" />
    <path d="M -130 -170 L 330 -170" stroke="#00e5ff" stroke-width="10" opacity="0.15" />
    <path d="M -110 -222 L 306 -222" stroke="#e8fbff" stroke-width="1.2" opacity="0.6" />

    <!-- ── the parts' housings ── -->
    <g v-for="(w, i) in wells" :key="`w${i}`">
      <path :d="w.d" fill="url(#h80-well)" />
      <path :d="w.d" fill="none" :stroke="w.c" stroke-width="2" />
      <path :d="w.d" fill="none" :stroke="w.c" stroke-width="9" opacity="0.15" />
    </g>
    <g v-for="(s, i) in slots" :key="`sl${i}`">
      <path :d="s.d" fill="url(#h80-well)" />
      <path :d="s.d" fill="none" :stroke="s.c" stroke-width="1.5" opacity="0.8" />
    </g>
    <g v-for="(t, i) in turbines" :key="`t${i}`">
      <path :d="octagon(t.cx, t.cy, t.r)" fill="#05040a" />
      <path :d="octagon(t.cx, t.cy, t.r)" fill="url(#tx-carbon)" opacity="0.6" style="mix-blend-mode: overlay" />
      <path :d="octagon(t.cx, t.cy, t.r)" fill="none" stroke="#c8c4e8" stroke-width="1.6" />
      <circle :cx="t.cx" :cy="t.cy" :r="t.r * 0.86" fill="url(#h80-nacelle)" />
      <circle :cx="t.cx" :cy="t.cy" :r="t.r * 0.86" fill="none" :stroke="t.c" stroke-width="2.4" />
      <circle :cx="t.cx" :cy="t.cy" :r="t.r * 0.86" fill="none" :stroke="t.c" stroke-width="10" opacity="0.18" />
    </g>
    <!-- the photon pods' pylon -->
    <path d="M 232 -150 L 268 -150 L 278 -10 L 232 -10 Z" fill="#0c0a16" />
    <path d="M 232 -150 L 268 -150 L 278 -10" fill="none" stroke="#c8fbff" stroke-width="1.4" />
    <!-- domes' plinths: angular collars -->
    <path d="M 326 -162 L 494 -162 L 484 -174 L 336 -174 Z" fill="#0c0a16" stroke="#ff2bd6" stroke-width="1.2" />
    <path d="M -304 -150 L -136 -158 L -146 -168 L -294 -162 Z" fill="#0c0a16" stroke="#00e5ff" stroke-width="1.2" />
    <path d="M -574 -140 L -396 -146 L -406 -156 L -564 -152 Z" fill="#0c0a16" stroke="#a462ff" stroke-width="1.2" />
    <!-- the afterburners' rings on the tail plate -->
    <g v-for="y in [-62.5, 32.5]" :key="`ab${y}`">
      <rect x="-756" :y="y - 30" width="22" height="60" rx="3" fill="url(#h80-chrome)" />
      <rect x="-736" :y="y - 26" width="6" height="52" fill="#a462ff" opacity="0.8" />
    </g>

    <!-- decals: chevrons, the chrome VR-84, a wireframe ghost of it -->
    <path v-for="k in N(3)" :key="`cv${k}`" :d="`M ${-50 + k * 20} -100 l 12 10 l -12 10 h -7 l 12 -10 l -12 -10 Z`" fill="#ff2bd6" />
    <text x="30" y="103" class="vec" font-size="18" fill="url(#h80-chrome)" transform="skewX(-14)">VR-84</text>
    <text x="31.5" y="104.5" class="vec" font-size="18" fill="none" stroke="#ff2bd6" stroke-width="0.7" opacity="0.7" transform="skewX(-14)">VR-84</text>
    <text x="-440" y="-124" class="vec" font-size="11" fill="#c8fbff" opacity="0.8" letter-spacing="5">VECTOR · RUNNER</text>
    <text x="606" y="96" class="vec" font-size="9" fill="#ffd23f" opacity="0.8" letter-spacing="2" transform="rotate(-27 606 96)">DANGER INTAKE</text>
    <!-- running lights -->
    <circle cx="816" cy="-4" r="10" fill="#fff" opacity="0.25" />
    <circle cx="816" cy="-4" r="3" fill="#fff" />
    <circle cx="-730" cy="-130" r="8" fill="#a462ff" opacity="0.35" />
    <circle cx="-730" cy="-130" r="2.5" fill="#e2d2ff" />
  </g>
</template>

<style scoped>
.vec {
  font-family: 'Orbitron', 'Futura', 'Avenir Next', sans-serif;
  font-weight: 900;
  font-style: italic;
  letter-spacing: 3px;
}
</style>
