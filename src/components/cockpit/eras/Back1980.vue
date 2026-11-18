<script setup lang="ts">
import type { CockpitDesign, Skin } from '../../../lib/voyage/cockpit/design'

/**
 * The EIGHTIES' cockpit, behind its controls: a near-black matte canopy round a wedge windscreen, a HUD reticle and
 * pitch ladder etched on the glass, a sliced sun sinking into a laser grid at the horizon, a rubber glare shield with
 * a chrome lip and a neon strip, the A-pillars' keypads and amber readouts, and three angular consoles edge-lit in
 * their VCO's colour: a hooded CRT well, an LCD strip, a fader bank on a grid, a knob deck, a throttle gate, and the
 * kick panel's patch bay. Past the stage: side walls with more keypads and vents, the canopy bow above, the footwell.
 */
const props = defineProps<{ design: CockpitDesign; skin: Skin }>()
const X0 = (vco: number) => 14 + vco * 530
const NAMES = ['BOW', 'MIDSHIPS', 'STERN']
const C = props.skin.vco
const N = (n: number) => Array.from({ length: n }, (_, i) => i)
const VP = props.design.vp

/** a console: an angular plate, chamfered at the top */
const consolePath = (x0: number) => `M ${x0} 462 L ${x0 + 20} 442 L ${x0 + 490} 442 L ${x0 + 510} 462 L ${x0 + 510} 1300 L ${x0} 1300 Z`
/** a well: a chamfered inset */
const well = (x: number, y: number, w: number, h: number, c = 8) => `M ${x + c} ${y} L ${x + w - c} ${y} L ${x + w} ${y + c} L ${x + w} ${y + h - c} L ${x + w - c} ${y + h} L ${x + c} ${y + h} L ${x} ${y + h - c} L ${x} ${y + c} Z`

// the HUD: a reticle round the vanishing point, a pitch ladder, a heading tape along the top of the glass
const ladder = [-150, -80, 80, 150].map((dy) => ({ y: VP.y + dy, n: Math.abs(dy) > 100 ? 20 : 10, up: dy < 0 }))
const heading = N(29).map((i) => ({ x: 520 + i * 20, major: i % 5 === 0, n: String((30 + i) % 36).padStart(2, '0') }))
// the horizon's laser grid: lines fanning from a point on the horizon, rungs closing up towards it
const HZ = 372
const fan = N(25).map((i) => {
  const x = 800 + (i - 12) * 160
  return `M ${800 + (i - 12) * 6} ${HZ} L ${x} 440`
})
const rungs = [0, 1, 2, 3, 4, 5].map((k) => HZ + 3 + k * k * 2.2 + k * 3)
const slices = [0, 1, 2, 3, 4].map((k) => ({ y: HZ - 10 - k * k * 3 - k * 7, h: 2 + k * 0.9 }))
// a rubber keypad: chunky keys with their legends
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'E']
const keypad = (x: number, y: number, cols = 3, pitch = 24) => KEYS.map((k, i) => ({ k, x: x + (i % cols) * pitch, y: y + Math.floor(i / cols) * pitch }))
// LED ladders beside the faders (static meters), and the throttle gate's ticks
const leds = N(10).map((i) => ({ y: 724 - i * 12, c: i > 7 ? '#ff2a4a' : i > 5 ? '#ffb02e' : '#3dff8a' }))
const screws = (x0: number) => [
  [x0 + 12, 476],
  [x0 + 498, 476],
  [x0 + 12, 892],
  [x0 + 498, 892],
]
const sideVents = N(9).map((i) => i * 16)
</script>

<template>
  <g class="back1980">
    <defs>
      <linearGradient id="b80-matte" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1a1526" />
        <stop offset="0.5" stop-color="#0c0a14" />
        <stop offset="1" stop-color="#050409" />
      </linearGradient>
      <linearGradient id="b80-canopy" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#05040a" />
        <stop offset="0.6" stop-color="#120d1f" />
        <stop offset="1" stop-color="#1d1530" />
      </linearGradient>
      <linearGradient id="b80-console" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2a2540" />
        <stop offset="0.06" stop-color="#191527" />
        <stop offset="0.5" stop-color="#0f0d18" />
        <stop offset="1" stop-color="#040308" />
      </linearGradient>
      <linearGradient id="b80-well" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#020104" />
        <stop offset="0.15" stop-color="#0a0812" />
        <stop offset="1" stop-color="#14111e" />
      </linearGradient>
      <!-- eighties chrome: a sky band, a hard horizon, a hot ground -->
      <linearGradient id="b80-chrome" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1a2a6e" />
        <stop offset="0.38" stop-color="#9fe6ff" />
        <stop offset="0.5" stop-color="#ffffff" />
        <stop offset="0.53" stop-color="#3a1640" />
        <stop offset="0.78" stop-color="#ff7ac8" />
        <stop offset="1" stop-color="#ffe6f6" />
      </linearGradient>
      <linearGradient id="b80-chromeV" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#1a2a6e" />
        <stop offset="0.4" stop-color="#9fe6ff" />
        <stop offset="0.5" stop-color="#ffffff" />
        <stop offset="0.54" stop-color="#3a1640" />
        <stop offset="1" stop-color="#ff7ac8" />
      </linearGradient>
      <linearGradient id="b80-neon" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" :stop-color="C[0]" />
        <stop offset="0.5" :stop-color="C[1]" />
        <stop offset="1" :stop-color="C[2]" />
      </linearGradient>
      <linearGradient id="b80-sun" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff27a" />
        <stop offset="0.45" stop-color="#ff9a3c" />
        <stop offset="0.8" stop-color="#ff2e7e" />
        <stop offset="1" stop-color="#c2186b" />
      </linearGradient>
      <radialGradient id="b80-sunhalo" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ff5ca8" stop-opacity="0.55" />
        <stop offset="0.5" stop-color="#ff2e7e" stop-opacity="0.18" />
        <stop offset="1" stop-color="#ff2e7e" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="b80-lcd" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1f2a1c" />
        <stop offset="1" stop-color="#0b120a" />
      </linearGradient>
      <linearGradient id="b80-amber" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2a1404" />
        <stop offset="1" stop-color="#120802" />
      </linearGradient>
      <radialGradient id="b80-key" cx="0.4" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#4a4658" />
        <stop offset="0.6" stop-color="#26232f" />
        <stop offset="1" stop-color="#0e0c14" />
      </radialGradient>
      <radialGradient id="b80-screw" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#e8ecf8" />
        <stop offset="0.5" stop-color="#6a6f84" />
        <stop offset="1" stop-color="#14121c" />
      </radialGradient>
      <radialGradient id="b80-hoodshade" cx="0.5" cy="0" r="1">
        <stop offset="0" stop-color="#000" stop-opacity="0.8" />
        <stop offset="1" stop-color="#000" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="b80-grid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ff2bd6" stop-opacity="0" />
        <stop offset="1" stop-color="#ff2bd6" stop-opacity="0.9" />
      </linearGradient>
      <mask id="b80-sunslice" maskUnits="userSpaceOnUse" x="600" y="200" width="400" height="200">
        <rect x="600" y="200" width="400" height="200" fill="#fff" />
        <rect v-for="(s, i) in slices" :key="i" x="600" :y="s.y" width="400" :height="s.h" fill="#000" />
        <rect x="600" :y="HZ" width="400" height="40" fill="#000" />
      </mask>
    </defs>

    <!-- ── outside, at the horizon: the sliced sun sinking into a laser grid (faint: the sky is behind it) ── -->
    <g clip-path="url(#cp-glass)" style="mix-blend-mode: screen">
      <ellipse cx="800" :cy="HZ" rx="320" ry="120" fill="url(#b80-sunhalo)" />
      <circle cx="800" :cy="HZ" r="118" fill="url(#b80-sun)" mask="url(#b80-sunslice)" opacity="0.8" />
      <rect x="-100" :y="HZ" width="1800" height="60" fill="#12021e" opacity="0.6" />
      <g stroke="url(#b80-grid)" stroke-width="1.2" fill="none" opacity="0.75">
        <path v-for="(d, i) in fan" :key="i" :d="d" />
      </g>
      <line v-for="(y, i) in rungs" :key="`r${i}`" x1="0" :x2="1600" :y1="y" :y2="y" :stroke="C[0]" :stroke-width="0.8 + i * 0.25" :opacity="0.25 + i * 0.1" />
      <line x1="0" x2="1600" :y1="HZ" :y2="HZ" stroke="#ffd0f0" stroke-width="1.4" opacity="0.8" />
    </g>

    <!-- ── the HUD, etched on the glass ── -->
    <g clip-path="url(#cp-glass)" fill="none" stroke="#7dffc0" stroke-width="1.2" opacity="0.55" class="hud">
      <g :transform="`translate(${VP.x} ${VP.y})`">
        <path d="M -40 0 A 40 40 0 0 1 -12 -38 M 12 -38 A 40 40 0 0 1 40 0 M 40 0 A 40 40 0 0 1 12 38 M -12 38 A 40 40 0 0 1 -40 0" />
        <path d="M -58 0 H -46 M 46 0 H 58 M 0 -58 V -46 M 0 46 V 58" stroke-width="2" />
        <circle r="2" fill="#7dffc0" />
        <path d="M -16 14 L 0 6 L 16 14" />
        <path d="M -150 0 H -96 L -88 8 M 150 0 H 96 L 88 8" stroke-width="1.6" />
      </g>
      <g v-for="(l, i) in ladder" :key="`l${i}`">
        <path :d="`M ${VP.x - 120} ${l.y} H ${VP.x - 44} M ${VP.x + 44} ${l.y} H ${VP.x + 120}`" :stroke-dasharray="l.up ? 'none' : '8 5'" />
        <path :d="`M ${VP.x - 120} ${l.y} v ${l.up ? 8 : -8} M ${VP.x + 120} ${l.y} v ${l.up ? 8 : -8}`" />
        <text :x="VP.x - 128" :y="l.y + 3" text-anchor="end" font-family="'VT323', 'Courier New', monospace" font-size="13" fill="#7dffc0" stroke="none">{{ l.up ? '' : '-' }}{{ l.n }}</text>
        <text :x="VP.x + 128" :y="l.y + 3" font-family="'VT323', 'Courier New', monospace" font-size="13" fill="#7dffc0" stroke="none">{{ l.up ? '' : '-' }}{{ l.n }}</text>
      </g>
      <!-- heading tape -->
      <g>
        <line v-for="h in heading" :key="h.x" :x1="h.x" :x2="h.x" y1="52" :y2="h.major ? 66 : 60" />
        <template v-for="h in heading" :key="`t${h.x}`">
          <text v-if="h.major" :x="h.x" y="80" text-anchor="middle" font-family="'VT323', 'Courier New', monospace" font-size="13" fill="#7dffc0" stroke="none">{{ h.n }}</text>
        </template>
        <path d="M 794 92 L 800 84 L 806 92" />
      </g>
      <!-- airspeed and altitude boxes -->
      <rect x="470" :y="VP.y - 10" width="52" height="20" />
      <text x="496" :y="VP.y + 5" text-anchor="middle" font-family="'VT323', 'Courier New', monospace" font-size="16" fill="#7dffc0" stroke="none">0884</text>
      <rect x="1078" :y="VP.y - 10" width="52" height="20" />
      <text x="1104" :y="VP.y + 5" text-anchor="middle" font-family="'VT323', 'Courier New', monospace" font-size="16" fill="#7dffc0" stroke="none">24.9K</text>
      <text x="560" y="350" font-family="'VT323', 'Courier New', monospace" font-size="15" fill="#7dffc0" stroke="none">G 1.4  · ARM ·  VECTOR LOCK</text>
    </g>

    <!-- ── the canopy: everything but the glass ── -->
    <path :d="`M -600 -500 H 2200 V 1400 H -600 Z ${design.glass}`" fill-rule="evenodd" fill="url(#b80-canopy)" />
    <path :d="`M -600 -500 H 2200 V 1400 H -600 Z ${design.glass}`" fill-rule="evenodd" fill="url(#tx-carbon)" opacity="0.35" style="mix-blend-mode: overlay" />
    <path :d="`M -600 -500 H 2200 V 1400 H -600 Z ${design.glass}`" fill-rule="evenodd" fill="url(#tx-noise)" opacity="0.18" style="mix-blend-mode: overlay" />

    <!-- the canopy bow above: ribs and a roof console -->
    <g>
      <path d="M -600 -500 H 2200 V -10 L 1240 -10 L 1200 18 L 400 18 L 360 -10 L -600 -10 Z" fill="#07060c" />
      <path v-for="k in 7" :key="`rib${k}`" :d="`M ${-560 + k * 330} -500 L ${-500 + k * 300} -12`" stroke="#1d1830" stroke-width="10" />
      <rect x="640" y="-150" width="320" height="130" rx="6" fill="#0d0b16" stroke="#2c2840" stroke-width="2" />
      <g v-for="k in 8" :key="`rl${k}`">
        <rect :x="652 + (k - 1) * 38" y="-60" width="30" height="16" rx="3" fill="url(#b80-key)" stroke="#000" />
        <rect :x="658 + (k - 1) * 38" y="-56" width="18" height="3" rx="1.5" :fill="C[(k - 1) % 3]" opacity="0.85" />
      </g>
      <text x="800" y="-90" text-anchor="middle" font-family="'Orbitron', 'Futura', sans-serif" font-size="11" letter-spacing="4" fill="#5a5470">CANOPY · SEAL · EJECT</text>
      <!-- the HUD projector at the top of the glass -->
      <path d="M 740 18 L 860 18 L 846 36 L 754 36 Z" fill="#0a0910" stroke="#38334c" stroke-width="1.5" />
      <rect x="770" y="30" width="60" height="5" rx="2" fill="#7dffc0" opacity="0.55" />
      <rect x="770" y="30" width="60" height="5" rx="2" fill="#7dffc0" opacity="0.4" filter="url(#cp-soft)" />
    </g>

    <!-- the windscreen frame: black, a chrome bead, a neon tube along the pillars -->
    <path :d="design.glass" fill="none" stroke="#020104" stroke-width="34" stroke-linejoin="miter" />
    <path :d="design.glass" fill="none" stroke="#2a2440" stroke-width="22" stroke-linejoin="miter" />
    <path :d="design.glass" fill="none" stroke="url(#b80-chrome)" stroke-width="5" stroke-linejoin="miter" />
    <path :d="design.glass" fill="none" stroke="#000" stroke-width="1.5" opacity="0.8" />
    <g>
      <path d="M 52 330 L 316 26" :stroke="C[0]" stroke-width="12" opacity="0.18" stroke-linecap="round" />
      <path d="M 52 330 L 316 26" :stroke="C[0]" stroke-width="2.5" stroke-linecap="round" :style="{ color: C[0] }" class="neon" />
      <path d="M 1548 330 L 1284 26" :stroke="C[2]" stroke-width="12" opacity="0.18" stroke-linecap="round" />
      <path d="M 1548 330 L 1284 26" :stroke="C[2]" stroke-width="2.5" stroke-linecap="round" :style="{ color: C[2] }" class="neon" />
      <path d="M 346 22 L 1254 22" :stroke="C[1]" stroke-width="10" opacity="0.15" />
      <path d="M 346 22 L 1254 22" :stroke="C[1]" stroke-width="2" :style="{ color: C[1] }" class="neon" />
    </g>

    <!-- ── the A-pillars: a keypad and readouts left, amber readouts and warning lamps right ── -->
    <g>
      <path d="M -600 40 L 300 40 L 56 318 L 56 400 L -600 400 Z" fill="url(#b80-matte)" opacity="0.6" />
      <path d="M 14 120 L 168 120 L 64 238 L 14 238 Z" fill="#06050a" stroke="#2c2840" stroke-width="1.5" />
      <g v-for="(k, i) in keypad(-150, 104)" :key="`kp${i}`">
        <rect :x="k.x - 10" :y="k.y - 9" width="20" height="18" rx="4" fill="#000" opacity="0.6" transform="translate(1.5 2)" />
        <rect :x="k.x - 10" :y="k.y - 9" width="20" height="18" rx="4" fill="url(#b80-key)" stroke="#000" stroke-width="0.8" />
        <text :x="k.x" :y="k.y + 4" text-anchor="middle" font-family="'Orbitron', sans-serif" font-size="9" font-weight="700" :fill="k.k === 'E' ? C[1] : k.k === 'C' ? C[0] : '#c8c4d8'">{{ k.k }}</text>
      </g>
      <rect x="-160" y="210" width="96" height="30" rx="2" fill="url(#b80-amber)" stroke="#3a2a10" />
      <text x="-112" y="232" text-anchor="middle" font-family="'VT323', 'Courier New', monospace" font-size="20" fill="#ffb02e" class="amber">NAV 07</text>
      <text x="24" y="138" font-family="'VT323', 'Courier New', monospace" font-size="14" fill="#ffb02e" class="amber">TGT</text>
      <text x="24" y="156" font-family="'VT323', 'Courier New', monospace" font-size="20" fill="#ffb02e" class="amber">88.4</text>
      <text x="24" y="182" font-family="'VT323', 'Courier New', monospace" font-size="14" fill="#3dff8a" opacity="0.9">RNG</text>
      <text x="24" y="200" font-family="'VT323', 'Courier New', monospace" font-size="20" fill="#3dff8a">1.07</text>
      <g v-for="k in 4" :key="`wl${k}`">
        <rect :x="24 + (k - 1) * 9" y="212" width="6" height="18" rx="1" :fill="k === 4 ? '#ff2a4a' : '#3dff8a'" :opacity="k === 4 ? 0.9 : 0.75" :class="{ blink: k === 4 }" />
      </g>
    </g>
    <g>
      <path d="M 2200 40 L 1300 40 L 1544 318 L 1544 400 L 2200 400 Z" fill="url(#b80-matte)" opacity="0.6" />
      <path d="M 1586 120 L 1432 120 L 1536 238 L 1586 238 Z" fill="#06050a" stroke="#2c2840" stroke-width="1.5" />
      <text x="1576" y="140" text-anchor="end" font-family="'VT323', 'Courier New', monospace" font-size="14" fill="#ffb02e" class="amber">FUEL</text>
      <text x="1576" y="160" text-anchor="end" font-family="'VT323', 'Courier New', monospace" font-size="22" fill="#ffb02e" class="amber">72%</text>
      <text x="1576" y="186" text-anchor="end" font-family="'VT323', 'Courier New', monospace" font-size="14" fill="#00e5ff">SHLD</text>
      <g v-for="k in 6" :key="`sh${k}`">
        <rect :x="1576 - k * 9" y="196" width="6" height="14" rx="1" :fill="k > 4 ? '#2a2440' : '#00e5ff'" opacity="0.85" />
      </g>
      <g v-for="k in 3" :key="`wr${k}`">
        <rect :x="1504 + (k - 1) * 26" y="216" width="22" height="16" rx="2" fill="#120a14" stroke="#000" />
        <rect :x="1506 + (k - 1) * 26" y="218" width="18" height="12" rx="1.5" :fill="['#ff2a4a', '#ffb02e', '#3dff8a'][k - 1]" :opacity="k === 1 ? 0.95 : 0.35" :class="{ blink: k === 1 }" />
      </g>
      <g v-for="(k, i) in keypad(1690, 104, 3, 24)" :key="`kq${i}`">
        <rect :x="k.x - 10" :y="k.y - 9" width="20" height="18" rx="4" fill="url(#b80-key)" stroke="#000" stroke-width="0.8" />
        <text :x="k.x" :y="k.y + 4" text-anchor="middle" font-family="'Orbitron', sans-serif" font-size="9" font-weight="700" fill="#c8c4d8">{{ k.k }}</text>
      </g>
    </g>

    <!-- ── the glare shield: rubber, a chrome lip, a neon strip ── -->
    <path d="M -600 404 L 90 404 L 800 420 L 1510 404 L 2200 404 L 2200 450 L -600 450 Z" fill="#08070d" />
    <path d="M -600 404 L 90 404 L 800 420 L 1510 404 L 2200 404 L 2200 450 L -600 450 Z" fill="url(#tx-speckle)" opacity="0.25" style="mix-blend-mode: overlay" />
    <path d="M -600 412 L 90 412 L 800 428 L 1510 412 L 2200 412" fill="none" stroke="url(#b80-neon)" stroke-width="12" opacity="0.18" />
    <path d="M -600 412 L 90 412 L 800 428 L 1510 412 L 2200 412" fill="none" stroke="url(#b80-neon)" stroke-width="2.2" style="color: #ff6ae8" class="neon" />
    <rect x="-600" y="438" width="2800" height="6" fill="url(#b80-chrome)" />
    <rect x="-600" y="444" width="2800" height="6" fill="#000" opacity="0.7" />
    <text x="800" y="12" text-anchor="middle" font-family="'Orbitron', 'Futura', sans-serif" font-size="8" font-weight="700" letter-spacing="6" fill="#6a6488">VR-84 · VECTOR RUNNER</text>

    <!-- ── the dash below: matte black, then the three consoles ── -->
    <rect x="-600" y="450" width="2800" height="950" fill="#050409" />
    <g v-for="vco in [0, 1, 2]" :key="`c${vco}`">
      <!-- the plate, edge-lit -->
      <path :d="consolePath(X0(vco))" fill="url(#b80-console)" />
      <path :d="consolePath(X0(vco))" fill="url(#tx-carbon)" opacity="0.5" style="mix-blend-mode: overlay" />
      <path :d="consolePath(X0(vco))" fill="none" :stroke="C[vco]" stroke-width="9" opacity="0.16" />
      <path :d="consolePath(X0(vco))" fill="none" :stroke="C[vco]" stroke-width="1.6" :style="{ color: C[vco] }" class="neon" />
      <path :d="`M ${X0(vco) + 22} 446 L ${X0(vco) + 488} 446`" stroke="#fff" stroke-width="1" opacity="0.35" />

      <!-- the CRT hood: a shade over the tube -->
      <path :d="well(X0(vco) + 4, 448, 220, 116, 10)" fill="#010003" stroke="#2c2840" stroke-width="1.5" />
      <rect :x="X0(vco) + 6" y="448" width="216" height="40" fill="url(#b80-hoodshade)" />
      <!-- the LCD strip: counters and level -->
      <path :d="well(X0(vco) + 226, 454, 228, 92, 8)" fill="url(#b80-well)" stroke="#2c2840" stroke-width="1" />
      <text :x="X0(vco) + 300" y="465" text-anchor="middle" font-family="'Orbitron', sans-serif" font-size="6.5" letter-spacing="2" fill="#6a6488">GARDEN · SEQ</text>
      <!-- the scrub fader's legend -->
      <text :x="X0(vco) + 216" y="586" font-family="'Orbitron', sans-serif" font-size="9.5" font-weight="700" letter-spacing="1" :fill="C[vco]" :style="{ color: C[vco] }" class="neontext">POS</text>
      <path :d="`M ${X0(vco) + 30} 602 h 168`" :stroke="C[vco]" stroke-width="0.8" opacity="0.35" stroke-dasharray="2 4" />

      <!-- the fader bank: a grid well, LED ladders -->
      <path :d="well(X0(vco) + 6, 604, 214, 158, 8)" fill="url(#b80-well)" stroke="#2c2840" stroke-width="1" />
      <g :opacity="0.22">
        <line v-for="k in 9" :key="`gv${k}`" :x1="X0(vco) + 6 + k * 22" :x2="X0(vco) + 6 + k * 22" y1="608" y2="758" :stroke="C[vco]" stroke-width="0.6" />
        <line v-for="k in 7" :key="`gh${k}`" :x1="X0(vco) + 10" :x2="X0(vco) + 204" :y1="604 + k * 22" :y2="604 + k * 22" :stroke="C[vco]" stroke-width="0.6" />
      </g>
      <g v-for="f in 3" :key="`ld${f}`">
        <rect v-for="(l, i) in leds" :key="i" :x="X0(vco) + 28 + (f - 1) * 56 + 26" :y="l.y - 100" width="4" height="7" rx="1" :fill="l.c" :opacity="i < 4 + ((f * 3 + vco) % 5) ? 0.85 : 0.12" />
      </g>
      <text :x="X0(vco) + 112" y="616" text-anchor="middle" font-family="'Orbitron', sans-serif" font-size="6.5" letter-spacing="2.5" fill="#6a6488">GRAIN BANK</text>

      <!-- the knob deck -->
      <path :d="well(X0(vco) + 226, 600, 210, 162, 8)" fill="url(#b80-well)" stroke="#2c2840" stroke-width="1" />
      <line :x1="X0(vco) + 234" :x2="X0(vco) + 428" y1="681" y2="681" stroke="#2c2840" stroke-width="1" />

      <!-- the throttle gate -->
      <path :d="well(X0(vco) + 446, 548, 62, 214, 6)" fill="#030206" stroke="#2c2840" stroke-width="1" />
      <g v-for="k in 6" :key="`tg${k}`">
        <path :d="`M ${X0(vco) + 448} ${560 + k * 30} l 8 -6 M ${X0(vco) + 506} ${560 + k * 30} l -8 -6`" :stroke="C[vco]" stroke-width="1.4" opacity="0.5" />
      </g>
      <text :x="X0(vco) + 478" y="560" text-anchor="middle" font-family="'Orbitron', sans-serif" font-size="6.5" letter-spacing="1.5" fill="#6a6488">THR</text>

      <!-- a chrome rule over the kick panel -->
      <rect :x="X0(vco) + 4" y="760" width="440" height="3" fill="url(#b80-chrome)" />
      <!-- the kick panel: the patch bay -->
      <path :d="well(X0(vco) + 2, 764, 352, 140, 8)" fill="#020104" stroke="#2c2840" stroke-width="1" />
      <rect :x="X0(vco) + 2" y="764" width="352" height="140" fill="url(#tx-grille)" opacity="0.25" style="mix-blend-mode: overlay" />
      <!-- the stick's boot well -->
      <circle :cx="X0(vco) + 412" cy="812" r="54" fill="#020104" stroke="#2c2840" stroke-width="1.5" />
      <circle :cx="X0(vco) + 412" cy="812" r="54" fill="none" :stroke="C[vco]" stroke-width="1" opacity="0.4" stroke-dasharray="3 5" />
      <text :x="X0(vco) + 412" y="896" text-anchor="middle" font-family="'Orbitron', sans-serif" font-size="6.5" letter-spacing="2" fill="#6a6488">PITCH · RING</text>
      <!-- the intake's chrome collar -->
      <circle :cx="X0(vco) + 478" cy="850" r="31" fill="none" stroke="url(#b80-chrome)" stroke-width="3" />

      <!-- its name, in neon, on the glare shield lip -->
      <g :transform="`translate(${X0(vco) + 255} 1006)`">
        <text text-anchor="middle" font-family="'Orbitron', sans-serif" font-size="22" font-weight="900" letter-spacing="8" :fill="C[vco]" :style="{ color: C[vco] }" class="neontext" opacity="0.8">{{ NAMES[vco] }}</text>
      </g>
      <text :x="X0(vco) + 255" y="434" text-anchor="middle" font-family="'Orbitron', sans-serif" font-size="8.5" font-weight="700" letter-spacing="5" :fill="C[vco]" :style="{ color: C[vco] }" class="neontext">VCO {{ vco + 1 }} · {{ NAMES[vco] }}</text>
      <!-- screws -->
      <g v-for="(s, i) in screws(X0(vco))" :key="`s${i}`">
        <circle :cx="s[0]" :cy="s[1]" r="3.2" fill="url(#b80-screw)" />
        <path :d="`M ${s[0] - 2} ${s[1]} h 4 M ${s[0]} ${s[1] - 2} v 4`" stroke="#111" stroke-width="0.9" />
      </g>
      <!-- the footwell vents, below the stage -->
      <rect v-for="k in 8" :key="`v${k}`" :x="X0(vco) + 40" :y="960 + k * 18" width="430" height="7" rx="3.5" fill="#000" opacity="0.8" />
    </g>

    <!-- ── the side walls, for wide screens ── -->
    <g>
      <path d="M -600 450 L 0 450 L 0 1400 L -600 1400 Z" fill="url(#b80-matte)" />
      <path d="M -340 470 L -20 470 L -20 880 L -340 880 Z" fill="#0b0912" stroke="#2c2840" stroke-width="1.5" />
      <path d="M -340 470 L -20 470 L -20 880 L -340 880 Z" fill="none" :stroke="C[0]" stroke-width="1.2" opacity="0.6" />
      <rect v-for="v in sideVents" :key="`lv${v}`" x="-300" :y="520 + v" width="240" height="8" rx="4" fill="#000" />
      <text x="-180" y="694" text-anchor="middle" font-family="'Orbitron', sans-serif" font-size="12" font-weight="900" letter-spacing="6" :fill="C[0]" :style="{ color: C[0] }" class="neontext">AFT · COOL</text>
      <g v-for="(k, i) in keypad(-280, 740, 4, 32)" :key="`kl${i}`">
        <rect :x="k.x - 12" :y="k.y - 10" width="24" height="20" rx="5" fill="url(#b80-key)" stroke="#000" />
        <text :x="k.x" :y="k.y + 4" text-anchor="middle" font-family="'Orbitron', sans-serif" font-size="9" font-weight="700" fill="#c8c4d8">{{ k.k }}</text>
      </g>
      <path d="M 1600 450 L 2200 450 L 2200 1400 L 1600 1400 Z" fill="url(#b80-matte)" />
      <path d="M 1620 470 L 1940 470 L 1940 880 L 1620 880 Z" fill="#0b0912" stroke="#2c2840" stroke-width="1.5" />
      <path d="M 1620 470 L 1940 470 L 1940 880 L 1620 880 Z" fill="none" :stroke="C[2]" stroke-width="1.2" opacity="0.6" />
      <rect x="1650" y="500" width="260" height="120" rx="4" fill="#020104" stroke="#2c2840" />
      <g stroke="#00e5ff" fill="none" opacity="0.7" stroke-width="1">
        <circle cx="1780" cy="560" r="50" />
        <circle cx="1780" cy="560" r="30" />
        <path d="M 1730 560 H 1830 M 1780 510 V 610" />
        <path d="M 1780 560 L 1818 528" stroke-width="2" class="sweep" />
      </g>
      <text x="1780" y="650" text-anchor="middle" font-family="'Orbitron', sans-serif" font-size="12" font-weight="900" letter-spacing="6" :fill="C[2]" :style="{ color: C[2] }" class="neontext">RADAR</text>
      <rect v-for="v in sideVents" :key="`rv${v}`" x="1660" :y="690 + v" width="240" height="8" rx="4" fill="#000" />
    </g>
  </g>
</template>

<style scoped>
.neon {
  filter: drop-shadow(0 0 3px currentColor);
}
.neontext {
  filter: drop-shadow(0 0 4px currentColor);
}
.amber {
  filter: drop-shadow(0 0 3px #ff8a00);
}
.blink {
  animation: b80blink 1.1s steps(2) infinite;
}
@keyframes b80blink {
  50% {
    opacity: 0.15;
  }
}
.sweep {
  transform-origin: 1780px 560px;
  animation: b80sweep 3s steps(45) infinite;
}
@keyframes b80sweep {
  to {
    transform: rotate(360deg);
  }
}
</style>
