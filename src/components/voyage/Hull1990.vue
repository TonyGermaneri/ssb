<script setup lang="ts">
import type { Era, Part } from '../../lib/voyage/ship'

/**
 * The NINETIES ship's hull (lib/voyage/eras/e1990.ts), as a pre-rendered CGI hero shot: a fat organic bean of
 * translucent candy plastic -- teal, purple, lime, banded like an early renderer's 8-bit gradients -- over its circuit
 * boards (traces, chips, capacitors glowing through), the sections joined by fat ray-traced chrome tori, a chrome
 * dorsal spine with a collar for everything standing on it, chrome bezels and smoked wells round every window, cowls
 * round the intakes, a bolted torus round the bubble canopy (a seat and a lit console inside), an afterburner pod
 * slung under the stern, a magenta swoosh, cyan and magenta rim light from the sky, hard white speculars, dither.
 * Static; the parts are drawn on and round it. No filters: everything is gradients and patterns.
 */
const props = defineProps<{ era: Era }>()
const P = props.era.palettes
const ink = props.era.ink
const R = (id: string): Part['rect'] => props.era.parts.find((p) => p.id === id)?.rect ?? [0, 0, 0, 0]

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
const mix = (a: string, b: string, t: number) =>
  '#' +
  hex(a)
    .map((v, i) => Math.round(v + (hex(b)[i] - v) * t))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')

/** the hull's back (stern to nose) and belly (nose to stern), as cubic segments, so the parts' mounts can find it */
type Pt = [number, number]
const TOP_S: Pt[][] = [
  [[-770, -40], [-778, -150], [-700, -240], [-560, -248]],
  [[-560, -248], [-440, -254], [-370, -226], [-260, -226]],
  [[-260, -226], [-140, -226], [40, -252], [200, -240]],
  [[200, -240], [300, -232], [360, -206], [440, -208]],
  [[440, -208], [560, -212], [700, -180], [762, -100]],
  [[762, -100], [800, -50], [810, -6], [806, 30]],
]
const BOT_S: Pt[][] = [
  [[806, 30], [800, 110], [720, 150], [620, 170]],
  [[620, 170], [540, 186], [500, 214], [400, 216]],
  [[400, 216], [240, 220], [60, 226], [-100, 222]],
  [[-100, 222], [-300, 218], [-460, 196], [-580, 176]],
  [[-580, 176], [-720, 150], [-772, 70], [-770, -40]],
]
const d = (segs: Pt[][], move = true) => (move ? `M ${segs[0][0][0]} ${segs[0][0][1]} ` : '') + segs.map((s) => `C ${s[1].join(' ')} ${s[2].join(' ')} ${s[3].join(' ')}`).join(' ')
function bz(s: Pt[], t: number): Pt {
  const u = 1 - t
  return [0, 1].map((i) => u * u * u * s[0][i] + 3 * u * u * t * s[1][i] + 3 * u * t * t * s[2][i] + t * t * t * s[3][i]) as Pt
}
/** the hull's edge at x (its back, or its belly) */
function edgeAt(segs: Pt[][], x: number): number {
  let best: Pt = [0, 0]
  let dist = Infinity
  for (const s of segs)
    for (let i = 0; i <= 60; i++) {
      const q = bz(s, i / 60)
      if (Math.abs(q[0] - x) < dist) {
        dist = Math.abs(q[0] - x)
        best = q
      }
    }
  return best[1]
}
const TOP = d(TOP_S)
const BOTTOM = d(BOT_S)
const HULL = `${TOP} ${d(BOT_S, false)} Z`
const SEAM_BOW = 'M 300 -260 C 262 -120 318 40 268 240'
const SEAM_STERN = 'M -296 -270 C -334 -110 -274 60 -322 240'
const regions = [
  `${SEAM_BOW} L 900 240 L 900 -300 Z`,
  `${SEAM_STERN} L 268 240 C 318 40 262 -120 300 -260 Z`,
  `${SEAM_STERN} L -900 240 L -900 -300 Z`,
]
/** each section's banded candy (hard stops: posterized) -- [offset, colour, opacity] */
const bands = (i: number): [number, string, number][] => {
  const p = P[i]
  const lite = mix(p.main, '#ffffff', 0.55)
  const up = mix(p.main, '#ffffff', 0.22)
  const core = mix(p.main, p.deep, 0.28)
  const low = mix(p.main, p.deep, 0.5)
  const bounce = mix(p.main, p.alt, 0.55)
  const deep = mix(p.deep, '#000000', 0.1)
  return [
    [0, lite, 0.96],
    [0.075, lite, 0.96],
    [0.075, up, 0.92],
    [0.2, up, 0.9],
    [0.2, p.main, 0.8],
    [0.44, p.main, 0.68],
    [0.44, core, 0.5],
    [0.62, core, 0.46],
    [0.62, low, 0.74],
    [0.8, low, 0.8],
    [0.8, bounce, 0.9],
    [0.9, bounce, 0.92],
    [0.9, deep, 0.96],
    [1, deep, 0.96],
  ]
}
/** the circuit boards under the candy: chips [x, y, w, h], capacitors [x, y] */
const chips = [
  [560, -150, 60, 34],
  [680, -120, 40, 40],
  [430, 110, 70, 26],
  [610, 130, 44, 30],
  [330, -180, 50, 30],
  [-120, -228, 80, 26],
  [150, -200, 40, 40],
  [-260, 130, 54, 34],
  [100, 120, 66, 30],
  [-40, 140, 40, 40],
  [-560, -190, 60, 28],
  [-700, 40, 40, 50],
  [-470, 120, 70, 30],
  [-330, -200, 40, 40],
]
const caps = [
  [520, 150],
  [360, -120],
  [700, 140],
  [-200, -210],
  [60, -210],
  [-150, 160],
  [200, 170],
  [-640, -160],
  [-520, 150],
  [-380, 130],
  [-720, 0],
]
/** glowing traces running between the parts */
const traces = [
  'M 320 -190 H 380 L 400 -170 V -150',
  'M 660 -140 V -100 L 680 -80',
  'M 300 120 H 360 L 380 104 H 420',
  'M 520 120 V 150 H 600',
  'M -260 -200 H -230 L -210 -220 H -140',
  'M 110 -10 H 125 V 80 L 140 96 H 200',
  'M -280 120 V 160 H -210',
  'M 30 130 L 60 160 H 120',
  'M -680 -120 L -650 -150 H -600',
  'M -660 100 V 130 H -620',
  'M -330 120 H -360 L -380 140',
]

const bez = (x0: number, y0: number, x1: number, y1: number, pad: number, r: number) => ({ x: x0 - pad, y: y0 - pad, width: x1 - x0 + pad * 2, height: y1 - y0 + pad * 2, rx: r + pad, ry: r + pad })
const vis = R('0:perform')
const visG = R('0:garden')
const deck = R('1:perform')
const deckG = R('1:garden')
const rear = R('2:perform')
const rearG = R('2:garden')
const canopy = R('0:fx')
const can = { cx: (canopy[0] + canopy[2]) / 2, cy: (canopy[1] + canopy[3]) / 2, rx: (canopy[2] - canopy[0]) / 2, ry: (canopy[3] - canopy[1]) / 2 }
const circ = (r: Part['rect']) => ({ cx: (r[0] + r[2]) / 2, cy: (r[1] + r[3]) / 2, r: Math.min(r[2] - r[0], r[3] - r[1]) / 2 })
const nose = circ(R('0:grain'))
const fan = circ(R('2:grain'))
const halo = R('1:grain')
const haloE = { cx: (halo[0] + halo[2]) / 2, cy: (halo[1] + halo[3]) / 2, rx: (halo[2] - halo[0]) / 2, ry: (halo[3] - halo[1]) / 2 }
const vents = (['0:texture', '1:texture', '2:texture'] as const).map((id) => {
  const r = R(id)
  const column = props.era.parts.find((p) => p.id === id)?.variant === 'column'
  const cx = (r[0] + r[2]) / 2
  const cy = (r[1] + r[3]) / 2
  return column ? { x: cx - 38, y: r[1] - 8, w: 76, h: r[3] - r[1] + 16, r: 38 } : { x: r[0] - 8, y: cy - 26, w: r[2] - r[0] + 16, h: 52, r: 26 }
})
/** the bells' throats (where they leave the hull): collars, and the thrusters' glow at their mouths */
const jets = (() => {
  const h = R('0:pitch')
  const slot = (h[2] - h[0]) / 2
  return [0, 1].map((i) => {
    const x = h[0] + slot * (i + 0.5)
    return { x, collar: edgeAt(BOT_S, x) - 10, mouth: h[3] + 6 }
  })
})()
const burners = (() => {
  const b = R('2:pitch')
  const slot = (b[3] - b[1]) / 2
  return [0, 1].map((i) => ({ y: b[1] + slot * (i + 0.5), mouth: b[0] - 4 }))
})()
const POD = 'M -736 128 C -736 86 -708 66 -664 66 L -560 66 C -520 66 -500 100 -500 132 C -500 168 -520 198 -560 198 L -664 198 C -708 198 -736 172 -736 128 Z'
const HOSES = ['M -500 170 C -440 200 -360 206 -300 200', 'M -510 120 C -470 140 -420 146 -372 140']
const PANELS = [
  'M 330 -160 C 340 -60 340 40 320 130',
  'M 660 -150 C 690 -100 700 -40 690 0',
  'M -270 -170 C -262 -100 -262 -40 -268 10',
  'M 120 -170 C 128 -90 128 0 120 90',
  'M -640 -150 C -660 -80 -664 0 -650 60',
  'M -330 -160 C -322 -60 -324 40 -330 120',
]
const SWOOSH = 'M -760 70 C -420 150 120 160 700 40 C 460 156 80 196 -200 192 C -440 188 -620 140 -760 70 Z'
const SWOOSH2 = 'M -740 108 C -560 170 -380 196 -180 202 C 80 206 380 160 620 82 C 420 200 60 226 -180 224 C -420 222 -600 184 -740 108 Z'
/** the collars of the things standing on the spine (x, y on the hull's top) */
const mount = (id: string, w: number, at?: number) => {
  const r = R(id)
  const x = at ?? (r[0] + r[2]) / 2
  return { x, y: edgeAt(TOP_S, x) + 8, w }
}
const stacks = R('1:pitch')
const collars = [
  mount('0:lfo', 40),
  mount('1:lfo', 30),
  mount('1:echo', 34),
  mount('2:echo', 30),
  mount('1:pitch', 46, stacks[0] + (stacks[2] - stacks[0]) / 4),
  mount('1:pitch', 46, stacks[0] + ((stacks[2] - stacks[0]) * 3) / 4),
  mount('2:fx', 64),
]
/** the domes' cores, seen through their glass */
const cores = (['1:fx', '2:fx'] as const).map((id) => {
  const r = R(id)
  const down = props.era.parts.find((p) => p.id === id)?.variant === 'down'
  return { x: (r[0] + r[2]) / 2, y: down ? r[1] + (r[3] - r[1]) * 0.42 : r[3] - (r[3] - r[1]) * 0.42, r: Math.min(r[2] - r[0], r[3] - r[1]) * 0.2 }
})
const N = (n: number) => Array.from({ length: n }, (_, i) => i)
</script>

<template>
  <g class="hull">
    <defs>
      <clipPath id="h90-body"><path :d="HULL" /></clipPath>
      <clipPath id="h90-canopy"><ellipse :cx="can.cx" :cy="can.cy" :rx="can.rx" :ry="can.ry" /></clipPath>
      <linearGradient v-for="(_, i) in P" :id="`h90-band${i}`" :key="`bd${i}`" gradientUnits="userSpaceOnUse" x1="0" y1="-250" x2="0" y2="218">
        <stop v-for="(s, k) in bands(i)" :key="k" :offset="s[0]" :stop-color="s[1]" :stop-opacity="s[2]" />
      </linearGradient>
      <pattern v-for="(p, i) in P" :id="`h90-pcb${i}`" :key="`pc${i}`" patternUnits="userSpaceOnUse" width="64" height="64">
        <rect width="64" height="64" :fill="mix(p.main, p.deep, 0.62)" />
        <path d="M 0 12 H 22 L 32 22 H 64 M 8 0 V 40 L 18 50 H 64 M 40 0 V 14 M 48 22 V 64 M 0 56 H 30" :stroke="mix(p.main, '#ffffff', 0.25)" stroke-width="1.8" fill="none" opacity="0.7" />
        <circle cx="22" cy="12" r="2.6" fill="#e8d27a" />
        <circle cx="40" cy="14" r="2.6" fill="#e8d27a" />
        <circle cx="18" cy="50" r="2.6" fill="#e8d27a" />
        <circle cx="30" cy="56" r="2.6" fill="#e8d27a" />
      </pattern>
      <linearGradient id="h90-chrome" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.18" stop-color="#bfeaff" />
        <stop offset="0.42" stop-color="#5865b0" />
        <stop offset="0.5" stop-color="#170c3c" />
        <stop offset="0.58" stop-color="#7a3fb8" />
        <stop offset="0.78" stop-color="#ffd2f6" />
        <stop offset="1" stop-color="#6d58c0" />
      </linearGradient>
      <linearGradient id="h90-chromeH" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#2a1a5a" />
        <stop offset="0.2" stop-color="#ffffff" />
        <stop offset="0.35" stop-color="#9fdcff" />
        <stop offset="0.5" stop-color="#3a3a8a" />
        <stop offset="0.65" stop-color="#ffe0fa" />
        <stop offset="0.85" stop-color="#ffffff" />
        <stop offset="1" stop-color="#2a1a5a" />
      </linearGradient>
      <linearGradient id="h90-well" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#05031a" />
        <stop offset="1" stop-color="#1e1258" />
      </linearGradient>
      <linearGradient id="h90-swoosh" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ff3db8" />
        <stop offset="0.55" stop-color="#ff9fe4" />
        <stop offset="1" stop-color="#ffffff" />
      </linearGradient>
      <linearGradient id="h90-swoosh2" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#2b5dff" />
        <stop offset="0.6" stop-color="#7b2ff7" />
        <stop offset="1" stop-color="#1fe0d2" />
      </linearGradient>
      <linearGradient id="h90-spec" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.95" />
        <stop offset="0.5" stop-color="#fff" stop-opacity="0.5" />
        <stop offset="0.5" stop-color="#fff" stop-opacity="0.22" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </linearGradient>
      <radialGradient id="h90-bolt" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.35" stop-color="#c8d8ff" />
        <stop offset="0.7" stop-color="#4a3a98" />
        <stop offset="1" stop-color="#140a38" />
      </radialGradient>
      <radialGradient id="h90-cap" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#d8fff0" />
        <stop offset="0.5" stop-color="#2a8a6a" />
        <stop offset="1" stop-color="#05201a" />
      </radialGradient>
      <radialGradient id="h90-thrust" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.95" />
        <stop offset="0.25" stop-color="#d4ff3f" stop-opacity="0.85" />
        <stop offset="0.6" stop-color="#b8ff1f" stop-opacity="0.3" />
        <stop offset="1" stop-color="#b8ff1f" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="h90-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#7ef9ff" stop-opacity="0.55" />
        <stop offset="1" stop-color="#7ef9ff" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="h90-core" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" :stop-color="ink" stop-opacity="0.5" />
        <stop offset="1" :stop-color="ink" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="h90-pod" cx="0.4" cy="0.25" r="0.9">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.2" stop-color="#c9f8ff" />
        <stop offset="0.5" stop-color="#4b55a8" />
        <stop offset="0.56" stop-color="#1b1048" />
        <stop offset="0.75" stop-color="#8a58d0" />
        <stop offset="1" stop-color="#2a1a5a" />
      </radialGradient>
      <pattern id="h90-dither" patternUnits="userSpaceOnUse" width="4" height="4">
        <rect width="1" height="1" fill="#fff" />
        <rect x="2" y="2" width="1" height="1" fill="#fff" />
      </pattern>
      <pattern id="h90-hatch" patternUnits="userSpaceOnUse" width="16" height="16" patternTransform="rotate(45)">
        <rect width="8" height="16" fill="#ffd400" />
        <rect x="8" width="8" height="16" :fill="ink" />
      </pattern>
    </defs>

    <!-- ── the thrusters' glow, under everything of the hull's ── -->
    <g style="mix-blend-mode: screen">
      <ellipse v-for="(j, i) in jets" :key="`jg${i}`" :cx="j.x" :cy="j.mouth + 26" rx="58" ry="46" fill="url(#h90-thrust)" />
      <ellipse v-for="(b, i) in burners" :key="`bg${i}`" :cx="b.mouth - 30" :cy="b.y" rx="64" ry="40" fill="url(#h90-thrust)" />
    </g>

    <!-- ── the whiskers' ear bulb, up on a neck from the nose ── -->
    <path d="M 724 -112 C 728 -132 738 -150 756 -158 C 774 -150 782 -132 786 -110 Z" fill="url(#h90-chromeH)" :stroke="ink" stroke-width="4" />
    <ellipse cx="756" cy="-156" rx="26" ry="16" fill="url(#h90-band0)" :stroke="ink" stroke-width="4" />
    <ellipse cx="750" cy="-162" rx="12" ry="5" fill="#fff" opacity="0.8" />

    <!-- ── the stern nacelle: a chrome cowl round the fan ── -->
    <ellipse :cx="fan.cx + 52" :cy="fan.cy" rx="70" :ry="fan.r + 26" fill="url(#h90-chrome)" :stroke="ink" stroke-width="6" />
    <ellipse :cx="fan.cx + 44" :cy="fan.cy - 44" rx="30" ry="10" fill="#fff" opacity="0.8" />

    <!-- ── the hull: candy over its circuit boards ── -->
    <path :d="HULL" :fill="mix(P[1].deep, '#000000', 0.2)" />
    <g clip-path="url(#h90-body)">
      <path v-for="(d, i) in regions" :key="`pcb${i}`" :d="d" :fill="`url(#h90-pcb${i})`" />
      <g v-for="(c, i) in chips" :key="`ch${i}`">
        <rect :x="c[0] - 4" :y="c[1] + 4" :width="c[2] + 8" :height="c[3]" fill="none" stroke="#e8d27a" stroke-width="3" stroke-dasharray="2 4" />
        <rect :x="c[0]" :y="c[1]" :width="c[2]" :height="c[3]" rx="3" fill="#0b0920" />
        <rect :x="c[0] + 3" :y="c[1] + 3" :width="c[2] - 6" height="4" fill="#fff" opacity="0.25" />
      </g>
      <g v-for="(c, i) in caps" :key="`cp${i}`">
        <circle :cx="c[0]" :cy="c[1]" r="11" fill="url(#h90-cap)" />
        <circle :cx="c[0]" :cy="c[1]" r="11" fill="none" stroke="#fff" stroke-width="1.4" opacity="0.4" />
      </g>
      <g style="mix-blend-mode: screen">
        <path v-for="(d, i) in traces" :key="`tr${i}`" :d="d" fill="none" :stroke="P[0].glow" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.35" />
        <path v-for="(d, i) in traces" :key="`tq${i}`" :d="d" fill="none" stroke="#f4ffc8" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" />
      </g>
      <!-- the candy itself, banded -->
      <path v-for="(d, i) in regions" :key="`cd${i}`" :d="d" :fill="`url(#h90-band${i})`" />
      <!-- the light inside the candy, and the core shadow under the bulge -->
      <ellipse cx="520" cy="60" rx="300" ry="120" fill="url(#h90-glow)" style="mix-blend-mode: screen" />
      <ellipse cx="-500" cy="40" rx="280" ry="120" fill="url(#h90-glow)" style="mix-blend-mode: screen" opacity="0.6" />
      <ellipse cx="0" cy="250" rx="900" ry="90" fill="url(#h90-core)" />
      <!-- the swoosh: a fat decal down the flank -->
      <path :d="SWOOSH2" fill="url(#h90-swoosh2)" :stroke="ink" stroke-width="4" stroke-linejoin="round" />
      <path :d="SWOOSH" fill="url(#h90-swoosh)" :stroke="ink" stroke-width="4" stroke-linejoin="round" />
      <path d="M -760 70 C -420 150 120 160 700 40" fill="none" stroke="#fff" stroke-width="3" opacity="0.85" />
      <path d="M -740 108 C -560 170 -380 196 -180 202 C 80 206 380 160 620 82" fill="none" :stroke="P[2].main" stroke-width="3" />
      <!-- panel seams in the candy -->
      <g v-for="(d, i) in PANELS" :key="`pn${i}`">
        <path :d="d" fill="none" :stroke="ink" stroke-width="3" opacity="0.55" />
        <path :d="d" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.35" transform="translate(2 2)" />
      </g>
      <!-- the dorsal spine: a fat chrome band along the back -->
      <path :d="TOP" fill="none" :stroke="ink" stroke-width="56" />
      <path :d="TOP" fill="none" stroke="url(#h90-chrome)" stroke-width="48" />
      <path :d="TOP" fill="none" stroke="#ffffff" stroke-width="6" transform="translate(0 16)" opacity="0.8" />
      <path :d="TOP" fill="none" :stroke="ink" stroke-width="3" transform="translate(0 25)" opacity="0.7" />
      <!-- the keel: chrome along the belly -->
      <path :d="BOTTOM" fill="none" :stroke="ink" stroke-width="34" />
      <path :d="BOTTOM" fill="none" stroke="url(#h90-chromeH)" stroke-width="28" />
      <path :d="BOTTOM" fill="none" stroke="#ff5cf0" stroke-width="5" transform="translate(0 -10)" opacity="0.8" />
      <!-- the chrome tori between the sections -->
      <g v-for="(d, i) in [SEAM_BOW, SEAM_STERN]" :key="`s${i}`">
        <path :d="d" fill="none" :stroke="ink" stroke-width="46" />
        <path :d="d" fill="none" stroke="#2a1a6a" stroke-width="40" />
        <path :d="d" fill="none" stroke="#8f9ccc" stroke-width="30" transform="translate(-2 0)" />
        <path :d="d" fill="none" stroke="#ffd2f6" stroke-width="8" transform="translate(9 0)" opacity="0.85" />
        <path :d="d" fill="none" stroke="#d8f2ff" stroke-width="14" transform="translate(-6 0)" />
        <path :d="d" fill="none" stroke="#ffffff" stroke-width="4" transform="translate(-9 0)" />
        <path :d="d" fill="none" stroke="#170c3c" stroke-width="3" transform="translate(3 0)" opacity="0.7" />
      </g>
      <!-- the sky's rim light: cyan along the back, magenta under the belly -->
      <path :d="TOP" fill="none" stroke="#7ef9ff" stroke-width="10" opacity="0.9" />
      <path :d="BOTTOM" fill="none" stroke="#ff5cf0" stroke-width="10" opacity="0.7" />
      <!-- softbox reflections: the render's studio lights, hard-edged on the candy -->
      <path d="M -742 -150 C -730 -186 -700 -206 -660 -214 L -650 -196 C -686 -188 -712 -170 -722 -140 Z" fill="#fff" opacity="0.75" />
      <path d="M -716 -120 C -712 -136 -702 -148 -688 -154 L -682 -142 C -694 -136 -700 -126 -702 -114 Z" fill="#fff" opacity="0.6" />
      <path d="M 700 -140 C 730 -120 752 -90 764 -56 L 748 -52 C 738 -84 720 -110 694 -128 Z" fill="#fff" opacity="0.7" />
      <path d="M 120 186 C 200 192 260 190 300 184 L 300 196 C 260 202 200 204 120 198 Z" fill="#fff" opacity="0.35" />
      <!-- the hard specular along the back, and the dither of an early renderer -->
      <path d="M -660 -150 C -480 -184 -300 -200 -120 -200 C 60 -200 200 -186 320 -174 C 460 -162 560 -164 640 -140 C 560 -150 460 -146 320 -156 C 200 -166 60 -178 -120 -178 C -300 -178 -480 -166 -660 -150 Z" fill="url(#h90-spec)" />
      <path :d="HULL" fill="url(#h90-dither)" opacity="0.06" />
    </g>

    <!-- ── the outline ── -->
    <path :d="HULL" fill="none" :stroke="ink" stroke-width="7" stroke-linejoin="round" />

    <!-- ── the afterburner pod, slung under the stern: chrome, the burners' collars in it ── -->
    <path :d="POD" fill="url(#h90-pod)" :stroke="ink" stroke-width="6" />
    <path d="M -716 90 C -680 76 -560 76 -500 86" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.85" />
    <path d="M -700 172 C -640 182 -560 182 -500 174" fill="none" stroke="#ff5cf0" stroke-width="5" stroke-linecap="round" opacity="0.7" />
    <rect v-for="x in [-640, -600, -560]" :key="`pv${x}`" :x="x" y="112" width="14" height="44" rx="7" fill="url(#h90-well)" :stroke="ink" stroke-width="2" />
    <g v-for="(b, i) in burners" :key="`bc${i}`">
      <ellipse :cx="-716" :cy="b.y" rx="14" ry="26" fill="url(#h90-chrome)" :stroke="ink" stroke-width="4" />
      <ellipse :cx="-720" :cy="b.y - 10" rx="4" ry="8" fill="#fff" opacity="0.85" />
    </g>

    <!-- ── ribbed chrome hoses along the flank, stern to midships (organic plumbing) ── -->
    <g v-for="(h, i) in HOSES" :key="`ho${i}`">
      <path :d="h" fill="none" :stroke="ink" stroke-width="20" stroke-linecap="round" />
      <path :d="h" fill="none" stroke="#8f9ccc" stroke-width="14" stroke-linecap="round" />
      <path :d="h" fill="none" stroke="#e8f4ff" stroke-width="5" stroke-linecap="round" transform="translate(0 -3)" />
      <path :d="h" fill="none" :stroke="ink" stroke-width="15" stroke-dasharray="2.5 7" opacity="0.65" />
    </g>

    <!-- ── the fillet under the tail fin ── -->
    <path d="M -762 -110 C -742 -192 -684 -236 -584 -244 L -584 -222 C -664 -216 -714 -180 -738 -104 Z" fill="url(#h90-chromeH)" :stroke="ink" stroke-width="4" stroke-linejoin="round" />

    <!-- ── the collars of everything standing on the spine ── -->
    <g v-for="(c, i) in collars" :key="`co${i}`">
      <rect :x="c.x - c.w / 2" :y="c.y - 9" :width="c.w" height="20" rx="8" fill="url(#h90-chrome)" :stroke="ink" stroke-width="3.5" />
      <rect :x="c.x - c.w / 2 + 4" :y="c.y - 6" :width="c.w * 0.4" height="4" rx="2" fill="#fff" opacity="0.85" />
    </g>

    <!-- ── the domes' cores, glowing under their glass ── -->
    <g v-for="(c, i) in cores" :key="`cr${i}`">
      <circle :cx="c.x" :cy="c.y" :r="c.r * 2.4" fill="url(#h90-thrust)" opacity="0.55" style="mix-blend-mode: screen" />
      <circle :cx="c.x" :cy="c.y" :r="c.r" fill="url(#h90-bolt)" :stroke="ink" stroke-width="3" />
      <circle :cx="c.x" :cy="c.y" :r="c.r * 0.45" :fill="P[0].glow" />
      <ellipse :cx="c.x" :cy="c.y" :rx="c.r * 1.7" :ry="c.r * 0.5" fill="none" stroke="#7ef9ff" stroke-width="3" opacity="0.8" />
    </g>

    <!-- ── the bubble canopy's cowl and torus, a seat and a console inside ── -->
    <path :d="`M ${can.cx - can.rx - 40} ${can.cy + 70} C ${can.cx - can.rx - 20} ${can.cy + 10} ${can.cx - can.rx + 10} ${can.cy - 10} ${can.cx} ${can.cy - 6} C ${can.cx + can.rx - 10} ${can.cy - 10} ${can.cx + can.rx + 30} ${can.cy + 20} ${can.cx + can.rx + 60} ${can.cy + 80} Z`" fill="url(#h90-band0)" :stroke="ink" stroke-width="5" stroke-linejoin="round" />
    <ellipse :cx="can.cx" :cy="can.cy" :rx="can.rx + 4" :ry="can.ry + 4" fill="url(#h90-well)" />
    <g clip-path="url(#h90-canopy)">
      <ellipse :cx="can.cx" :cy="can.cy + can.ry * 0.6" :rx="can.rx * 1.1" :ry="can.ry * 0.6" fill="#2a1474" />
      <path :d="`M ${can.cx - 50} ${can.cy + 60} L ${can.cx - 40} ${can.cy - 30} C ${can.cx - 36} ${can.cy - 48} ${can.cx - 6} ${can.cy - 48} ${can.cx - 4} ${can.cy - 30} L ${can.cx + 4} ${can.cy + 30} Z`" fill="#3a2a8a" :stroke="ink" stroke-width="3" />
      <path :d="`M ${can.cx - 36} ${can.cy - 28} C ${can.cx - 30} ${can.cy - 40} ${can.cx - 14} ${can.cy - 40} ${can.cx - 10} ${can.cy - 28}`" fill="none" stroke="#bfeaff" stroke-width="3" opacity="0.7" />
      <path :d="`M ${can.cx + 20} ${can.cy + 40} L ${can.cx + 60} ${can.cy + 4} L ${can.cx + can.rx} ${can.cy + 10} L ${can.cx + can.rx} ${can.cy + 60} Z`" fill="#1e1260" :stroke="ink" stroke-width="3" />
      <circle v-for="k in N(5)" :key="`cl${k}`" :cx="can.cx + 50 + k * 10" :cy="can.cy + 18 - k * 1.5" r="2.6" :fill="['#b8ff1f', '#1fe0d2', '#ff3db8', '#b8ff1f', '#ffd400'][k]" />
      <rect :x="can.cx + 36" :y="can.cy + 26" width="34" height="14" rx="3" fill="#1fe0d2" opacity="0.8" />
    </g>
    <ellipse :cx="can.cx" :cy="can.cy" :rx="can.rx + 15" :ry="can.ry + 15" fill="none" :stroke="ink" stroke-width="30" />
    <ellipse :cx="can.cx" :cy="can.cy" :rx="can.rx + 15" :ry="can.ry + 15" fill="none" stroke="url(#h90-chrome)" stroke-width="22" />
    <path :d="`M ${can.cx - can.rx - 8} ${can.cy - 10} A ${can.rx + 8} ${can.ry + 8} 0 0 1 ${can.cx + 10} ${can.cy - can.ry - 8}`" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.9" />
    <path :d="`M ${can.cx} ${can.cy + can.ry + 22} A ${can.rx + 22} ${can.ry + 22} 0 0 0 ${can.cx + can.rx + 20} ${can.cy + 14}`" fill="none" :stroke="P[0].glow" stroke-width="3" opacity="0.8" />

    <!-- ── the window bezels: fat chrome round smoked wells ── -->
    <!-- WRAP VISOR -->
    <rect v-bind="bez(vis[0], vis[1], vis[2], visG[3], 16, 48)" :fill="ink" />
    <rect v-bind="bez(vis[0], vis[1], vis[2], visG[3], 13, 48)" fill="url(#h90-chrome)" />
    <rect v-bind="bez(vis[0], vis[1], vis[2], visG[3], 5, 48)" fill="url(#h90-well)" :stroke="ink" stroke-width="3" />
    <rect v-bind="bez(vis[0], vis[1], vis[2], visG[3], 11, 48)" fill="none" stroke="#fff" stroke-width="2" opacity="0.6" stroke-dasharray="120 900" stroke-dashoffset="-40" />
    <!-- MEGA DECK: a CRT in a chunky chrome monitor bezel -->
    <rect v-bind="bez(deck[0], deck[1], deck[2], deckG[3], 22, 20)" :fill="ink" />
    <rect v-bind="bez(deck[0], deck[1], deck[2], deckG[3], 19, 20)" fill="url(#h90-chromeH)" />
    <rect v-bind="bez(deck[0], deck[1], deck[2], deckG[3], 19, 20)" fill="url(#h90-chrome)" opacity="0.55" />
    <rect v-bind="bez(deck[0], deck[1], deck[2], deckG[3], 7, 14)" fill="url(#h90-well)" :stroke="ink" stroke-width="3" />
    <circle v-for="(c, i) in [[deck[0] - 12, deck[1] - 12], [deck[2] + 12, deck[1] - 12], [deck[0] - 12, deckG[3] + 12], [deck[2] + 12, deckG[3] + 12]]" :key="`dk${i}`" :cx="c[0]" :cy="c[1]" r="6" fill="url(#h90-bolt)" :stroke="ink" stroke-width="1.5" />
    <!-- REAR VIEWER: a chrome porthole ring over a pill for its lamps -->
    <rect v-bind="bez(rearG[0], rearG[1], rearG[2], rearG[3], 12, 20)" :fill="ink" />
    <rect v-bind="bez(rearG[0], rearG[1], rearG[2], rearG[3], 9, 20)" fill="url(#h90-chrome)" />
    <ellipse :cx="(rear[0] + rear[2]) / 2" :cy="(rear[1] + rear[3]) / 2" :rx="(rear[2] - rear[0]) / 2 + 18" :ry="(rear[3] - rear[1]) / 2 + 18" :fill="ink" />
    <ellipse :cx="(rear[0] + rear[2]) / 2" :cy="(rear[1] + rear[3]) / 2" :rx="(rear[2] - rear[0]) / 2 + 15" :ry="(rear[3] - rear[1]) / 2 + 15" fill="url(#h90-chrome)" />
    <ellipse :cx="(rear[0] + rear[2]) / 2" :cy="(rear[1] + rear[3]) / 2" :rx="(rear[2] - rear[0]) / 2 + 5" :ry="(rear[3] - rear[1]) / 2 + 5" fill="url(#h90-well)" :stroke="ink" stroke-width="3" />

    <!-- ── the cowls: chrome tori round the intakes and the halo ── -->
    <g v-for="(c, i) in [nose, fan]" :key="`cw${i}`">
      <circle :cx="c.cx" :cy="c.cy" :r="c.r + 10" fill="url(#h90-well)" />
      <circle :cx="c.cx" :cy="c.cy" :r="c.r + 10" fill="none" :stroke="ink" stroke-width="28" />
      <circle :cx="c.cx" :cy="c.cy" :r="c.r + 10" fill="none" stroke="url(#h90-chrome)" stroke-width="21" />
      <path :d="`M ${c.cx - c.r - 6} ${c.cy} A ${c.r + 6} ${c.r + 6} 0 0 1 ${c.cx} ${c.cy - c.r - 6}`" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" />
    </g>
    <ellipse :cx="haloE.cx" :cy="haloE.cy" :rx="haloE.rx + 12" :ry="haloE.ry + 12" fill="none" :stroke="ink" stroke-width="22" />
    <ellipse :cx="haloE.cx" :cy="haloE.cy" :rx="haloE.rx + 12" :ry="haloE.ry + 12" fill="none" stroke="url(#h90-chrome)" stroke-width="16" />
    <ellipse :cx="haloE.cx" :cy="haloE.cy" :rx="haloE.rx" :ry="haloE.ry" fill="url(#h90-well)" />

    <!-- ── the gills' chrome housings ── -->
    <g v-for="(v, i) in vents" :key="`vh${i}`">
      <rect :x="v.x - 4" :y="v.y - 4" :width="v.w + 8" :height="v.h + 8" :rx="v.r + 4" :fill="ink" />
      <rect :x="v.x" :y="v.y" :width="v.w" :height="v.h" :rx="v.r" fill="url(#h90-chrome)" />
    </g>

    <!-- ── the hover jets' collars ── -->
    <g v-for="(j, i) in jets" :key="`jc${i}`">
      <rect :x="j.x - 28" :y="j.collar - 10" width="56" height="20" rx="9" fill="url(#h90-chrome)" :stroke="ink" stroke-width="4" />
      <rect :x="j.x - 22" :y="j.collar - 6" width="20" height="4" rx="2" fill="#fff" opacity="0.85" />
    </g>

    <!-- ── decals: hazard chevrons by the intake, the badge, the name ── -->
    <path d="M 640 128 L 700 112 L 704 126 L 644 142 Z" fill="url(#h90-hatch)" :stroke="ink" stroke-width="2" />
    <g transform="translate(560 160) rotate(-7)">
      <rect x="-84" y="-24" width="168" height="44" rx="22" :fill="ink" />
      <rect x="-80" y="-20" width="160" height="36" rx="18" fill="none" stroke="url(#h90-chrome)" stroke-width="3" />
      <rect x="-74" y="-18" width="148" height="10" rx="5" fill="#fff" opacity="0.18" />
      <text x="0" y="10" text-anchor="middle" class="plate" fill="url(#h90-chrome)">HX-2K</text>
    </g>
    <text x="-266" y="182" class="name" :fill="P[1].hi" transform="rotate(1.5 -266 182)">HYPERCRUISER</text>
    <text x="-690" y="190" class="small" fill="#fff" opacity="0.7">AFTERBURNER</text>
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
.name {
  font-family: 'Arial Black', 'Impact', sans-serif;
  font-size: 22px;
  font-style: italic;
  font-weight: 900;
  letter-spacing: 3px;
}
.small {
  font-family: 'Arial', sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
}
</style>
