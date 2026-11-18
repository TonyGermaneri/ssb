<script setup lang="ts">
import type { Era } from '../../lib/voyage/ship'

/**
 * The SEVENTIES ship's hull (lib/voyage/eras/e1970.ts): the HX-77 ore freighter, painted like a hard-SF concept
 * plate -- no outlines, only light, shadow and wear. A brown engine block with a crinkle-black machinery deck, a
 * thrust frame for its three nozzles and a cowled intake turbine; an avocado habitat drum (lit as a cylinder) under a
 * deck of four corrugated cargo containers on a keel truss; a cream wedge of a command module whose trapezoid
 * windscreen frame matches the cockpit's. A racing stripe kinks down the bow; panel seams, rivets, stencils, hazard
 * bands, grime streaks, lit portholes, nav lights, and every part's bezel, cowling or plinth. Lit from the starburst
 * up to the right, with a warm bounce from the planet below. Static; the parts are drawn around it.
 */
const props = defineProps<{ era: Era }>()
const P = props.era.palettes
const N = (n: number) => Array.from({ length: n }, (_, i) => i)
/** a deterministic scatter (grime, greebles) */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── the silhouette ──
const STERN = 'M -712 -184 L -688 -206 L -318 -206 L -300 -190 L -300 170 L -318 186 L -690 186 L -712 164 Z'
const THRUST = 'M -746 -170 L -712 -186 L -712 166 L -746 152 Z'
const MID = 'M -300 -122 L 340 -122 L 340 122 L -300 122 Z'
const BOW = 'M 340 -176 L 650 -176 L 800 -56 L 816 2 L 798 64 L 746 114 L 600 152 L 340 152 Z'
/** the bow's top edge and nose, for the rim light */
const BOW_RIM = 'M 342 -175 L 650 -175 L 799 -55 L 815 2'
const STERN_RIM = 'M -710 -183 L -688 -205 L -318 -205 L -301 -190'

// the windscreen: a trapezoid frame round the COMMAND DECK's screen, wider at the top, as from inside
const SCREEN = { x0: 384, y0: -144, x1: 644, y1: -82 }
const FRAME = 'M 360 -160 L 670 -160 L 650 -72 L 378 -72 Z'
const FRAME_IN = 'M 370 -152 L 660 -152 L 644 -80 L 386 -80 Z'

// the racing stripe's centre line: along the stern and the drum, a kink down the bow
const STRIPE = 'M -760 -92 L 344 -92 L 376 66 L 830 66'

// the cargo deck: four containers on the drum
const containers = [
  { x: -292, w: 152, c: '#b0782a', code: 'HX 0114', mark: 'ORE · 40T' },
  { x: -132, w: 180, c: '#9a4a22', code: 'HX 0221', mark: 'NO STEP' },
  { x: 56, w: 152, c: '#d2c39a', code: 'HX 0307', mark: 'VOLATILES' },
  { x: 216, w: 116, c: '#5f6a2c', code: 'HX 0412', mark: 'ORE · 40T' },
]
const CT = -238
const CB = -122

// the stern's machinery deck: louvres along the top, but not under the dome or the dish's pylon
const louvres = N(30)
  .map((i) => -680 + i * 12)
  .filter((x) => (x < -578 || x > -398) && x < -330)
// the keel truss under the drum
const truss = (x0: number, x1: number) => {
  const n = Math.round((x1 - x0) / 34)
  return N(n).map((i) => `M ${x0 + i * 34} 122 L ${x0 + i * 34 + 17} 146 L ${x0 + i * 34 + 34} 122`).join(' ')
}
// panel seams (each drawn as a dark line with a light lip under it)
const SEAMS = [
  // stern
  'M -640 -176 V 186',
  'M -548 -176 V -100 M -548 130 V 186',
  'M -430 -176 V -100 M -430 132 V 150',
  'M -300 -176 V 186',
  'M -712 -120 H -300',
  'M -712 140 H -300',
  // drum
  'M -230 -122 V 122',
  'M -100 -122 V -70 M -100 64 V 122',
  'M 40 -122 V -70 M 40 64 V 122',
  'M 130 -122 V 122',
  'M -300 -104 H 340',
  'M -300 104 H 340',
  // bow
  'M 470 -176 V -164 M 470 -72 V -20',
  'M 340 -40 H 384',
  'M 560 -72 V 152',
  'M 644 -20 L 700 -120',
  'M 360 100 H 600 L 740 116',
  'M 470 46 V 152',
]
/** rivet rows along some seams */
const rivetRows: [number, number, number, number, number][] = [
  // x0, y0, x1, y1, count
  [-704, -112, -306, -112, 34],
  [-704, 132, -306, 132, 34],
  [-292, -114, 334, -114, 52],
  [-292, 114, 334, 114, 52],
  [348, -168, 640, -168, 26],
  [348, 144, 596, 144, 22],
  [-640, -170, -640, 182, 22],
  [-300, -170, -300, 182, 22],
]
const rivets = rivetRows.flatMap(([x0, y0, x1, y1, n]) => N(n).map((i) => ({ x: x0 + ((x1 - x0) * i) / (n - 1), y: y0 + ((y1 - y0) * i) / (n - 1) })))
// grime: streaks running aft and down from the vents, the seams and the louvres
const grime = (() => {
  const r = rng(77)
  const out: { x: number; y: number; w: number; h: number; o: number }[] = []
  const spots: [number, number, number, number][] = [
    [-700, -176, -320, 10],
    [-536, 124, -316, 8],
    [-214, 116, 110, 9],
    [-290, -104, 330, 12],
    [390, 42, 630, 7],
    [356, -176, 640, 6],
    [-700, 40, -560, 5],
  ]
  for (const [x0, y, x1, n] of spots)
    for (let i = 0; i < n; i++) out.push({ x: x0 + r() * (x1 - x0), y: y + r() * 6, w: 3 + r() * 10, h: 24 + r() * 70, o: 0.12 + r() * 0.2 })
  return out
})()
// greebles: small boxes of machinery, crinkle black and aluminium, round the joints and on the stern's deck
const greebles = (() => {
  const r = rng(1970)
  const out: { x: number; y: number; w: number; h: number; k: number }[] = []
  const zones: [number, number, number, number, number][] = [
    [-400, -224, -322, -206, 5],
    [-660, -224, -604, -206, 4],
    [-296, 100, -230, 120, 3],
    [292, 100, 336, 120, 2],
    [600, -192, 646, -176, 3],
  ]
  for (const [x0, y0, x1, y1, n] of zones)
    for (let i = 0; i < n; i++) {
      const w = 8 + r() * 18
      const h = (y1 - y0) * (0.4 + r() * 0.6)
      out.push({ x: x0 + r() * (x1 - x0 - w), y: y1 - h, w, h, k: Math.floor(r() * 3) })
    }
  return out
})()
// lit portholes: the drum's cabins over the stripe, the bow's crew quarters under it
const portholes = [...N(14).map((i) => ({ x: -282 + i * 44, y: -114, w: 14, h: 7 })), ...N(7).map((i) => ({ x: 396 + i * 22, y: 84, w: 10, h: 10 }))]
const pipes = [
  { x0: -700, x1: -320, y: 134, h: 6 },
  { x0: -690, x1: -330, y: 142, h: 4 },
  { x0: -290, x1: 330, y: 116, h: 5 },
  { x0: 352, x1: 590, y: -4, h: 0 },
].filter((r) => r.h > 0)
const bolts = (x: number) => N(9).map((i) => ({ x, y: -124 + i * 31 }))
const bodies = [
  { d: STERN, box: [-712, -206, 412, 392] },
  { d: BOW, box: [340, -176, 476, 328] },
]
</script>

<template>
  <g class="hull">
    <defs>
      <clipPath id="h70-all">
        <path :d="STERN" />
        <path :d="MID" />
        <path :d="BOW" />
        <path :d="THRUST" />
      </clipPath>
      <clipPath id="h70-stern"><path :d="STERN" /></clipPath>
      <clipPath id="h70-mid"><path :d="MID" /></clipPath>
      <clipPath id="h70-bow"><path :d="BOW" /></clipPath>
      <clipPath id="h70-chev"><rect x="-700" y="150" width="380" height="30" /></clipPath>
      <!-- a painted block, lit from above: a sunlit top edge, the side falling into shadow -->
      <linearGradient id="h70-shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff2d6" stop-opacity="0.5" />
        <stop offset="0.05" stop-color="#fff2d6" stop-opacity="0.16" />
        <stop offset="0.4" stop-color="#000" stop-opacity="0" />
        <stop offset="0.8" stop-color="#1a0c04" stop-opacity="0.32" />
        <stop offset="1" stop-color="#1a0c04" stop-opacity="0.62" />
      </linearGradient>
      <!-- the drum, a cylinder side-on: a specular band high up, a terminator low down -->
      <linearGradient id="h70-cyl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000" stop-opacity="0.35" />
        <stop offset="0.08" stop-color="#fff4d8" stop-opacity="0.18" />
        <stop offset="0.2" stop-color="#fff4d8" stop-opacity="0.42" />
        <stop offset="0.32" stop-color="#fff4d8" stop-opacity="0.06" />
        <stop offset="0.62" stop-color="#000" stop-opacity="0.12" />
        <stop offset="0.9" stop-color="#140a02" stop-opacity="0.55" />
        <stop offset="1" stop-color="#140a02" stop-opacity="0.75" />
      </linearGradient>
      <!-- the planet's warm bounce from below and behind -->
      <linearGradient id="h70-bounce" x1="0" y1="1" x2="0.3" y2="0">
        <stop offset="0" stop-color="#ff8a3a" stop-opacity="0.32" />
        <stop offset="0.3" stop-color="#ff8a3a" stop-opacity="0" />
      </linearGradient>
      <!-- the starburst's falloff along the ship: brighter forward -->
      <linearGradient id="h70-key" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#000" stop-opacity="0.28" />
        <stop offset="0.5" stop-color="#000" stop-opacity="0" />
        <stop offset="1" stop-color="#fff0d0" stop-opacity="0.1" />
      </linearGradient>
      <!-- brushed aluminium, a horizontal sheen -->
      <linearGradient id="h70-alu" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f4f0e6" />
        <stop offset="0.3" stop-color="#b8b3a8" />
        <stop offset="0.55" stop-color="#6e6a62" />
        <stop offset="0.8" stop-color="#a8a49c" />
        <stop offset="1" stop-color="#3a3430" />
      </linearGradient>
      <linearGradient id="h70-aluV" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#3a3430" />
        <stop offset="0.25" stop-color="#a8a49c" />
        <stop offset="0.5" stop-color="#f4f0e6" />
        <stop offset="0.7" stop-color="#8a857c" />
        <stop offset="1" stop-color="#2a2622" />
      </linearGradient>
      <!-- crinkle black -->
      <linearGradient id="h70-crinkle" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4a443e" />
        <stop offset="0.12" stop-color="#2a2622" />
        <stop offset="1" stop-color="#100e0c" />
      </linearGradient>
      <!-- a recess: dark at its top lip (in the shadow of the hull), a lit bottom lip -->
      <linearGradient id="h70-recess" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#050302" />
        <stop offset="0.7" stop-color="#1e140c" />
        <stop offset="0.92" stop-color="#5a4430" />
        <stop offset="1" stop-color="#d8c4a0" />
      </linearGradient>
      <!-- a cowling round a turbine: a lit rim at the top, shadow below -->
      <radialGradient id="h70-cowl" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0.78" stop-color="#0a0806" />
        <stop offset="0.84" stop-color="#2a2622" />
        <stop offset="0.9" stop-color="#5a544c" />
        <stop offset="0.95" stop-color="#1a1714" />
        <stop offset="1" stop-color="#0a0806" />
      </radialGradient>
      <linearGradient id="h70-lip" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff6e0" stop-opacity="0.9" />
        <stop offset="0.5" stop-color="#fff6e0" stop-opacity="0" />
        <stop offset="1" stop-color="#ffb060" stop-opacity="0.35" />
      </linearGradient>
      <!-- a glass's smoked side panes, reflecting the sky -->
      <linearGradient id="h70-smoke" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stop-color="#8a5a3a" />
        <stop offset="0.45" stop-color="#2a1610" />
        <stop offset="1" stop-color="#0c0604" />
      </linearGradient>
      <radialGradient id="h70-amber" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ffd27a" stop-opacity="0.95" />
        <stop offset="0.35" stop-color="#ffa030" stop-opacity="0.45" />
        <stop offset="1" stop-color="#ff7a10" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="h70-red" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#fff0e0" />
        <stop offset="0.2" stop-color="#ff3a20" stop-opacity="0.9" />
        <stop offset="1" stop-color="#ff2000" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="h70-green" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#f0fff0" />
        <stop offset="0.2" stop-color="#40ff70" stop-opacity="0.9" />
        <stop offset="1" stop-color="#20ff40" stop-opacity="0" />
      </radialGradient>
      <!-- corrugated container sides -->
      <pattern id="h70-corr" patternUnits="userSpaceOnUse" width="12" height="12">
        <rect width="12" height="12" fill="#000" opacity="0.18" />
        <rect x="1" width="4" height="12" fill="#fff" opacity="0.22" />
        <rect x="5" width="2" height="12" fill="#fff" opacity="0.08" />
        <rect x="9" width="3" height="12" fill="#000" opacity="0.2" />
      </pattern>
      <linearGradient id="h70-streak" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#140a04" stop-opacity="1" />
        <stop offset="1" stop-color="#140a04" stop-opacity="0" />
      </linearGradient>
    </defs>

    <!-- ── behind: the dish's pylon, the scanner's turret, the radar mast's foot, the crane's base, the keel truss ── -->
    <path d="M -712 -206 L -666 -206 L -676 -230 L -702 -230 Z" fill="url(#h70-crinkle)" />
    <rect x="-704" y="-238" width="30" height="10" rx="2" fill="url(#h70-alu)" />
    <path d="M -300 122 L 340 122 L 340 132 L -300 132 Z" fill="#1a1410" />
    <path :d="truss(-290, -100)" fill="none" stroke="#3a342e" stroke-width="5" />
    <path :d="truss(-290, -100)" fill="none" stroke="#8a8478" stroke-width="1.2" transform="translate(-1 -1.5)" />
    <path :d="truss(96, 130)" fill="none" stroke="#3a342e" stroke-width="5" />
    <rect x="-290" y="142" width="190" height="7" fill="#2a2420" />
    <rect x="96" y="142" width="34" height="7" fill="#2a2420" />

    <!-- ── the cargo deck ── -->
    <g v-for="(c, i) in containers" :key="`c${i}`">
      <rect :x="c.x" :y="CT" :width="c.w" :height="CB - CT" :fill="c.c" />
      <rect :x="c.x" :y="CT" :width="c.w" :height="CB - CT" fill="url(#tx-patina)" opacity="0.45" style="mix-blend-mode: overlay" />
      <rect :x="c.x + 8" :y="CT + 8" :width="c.w - 16" :height="CB - CT - 16" fill="url(#h70-corr)" />
      <!-- corner castings and the frame -->
      <path :d="`M ${c.x} ${CT} h ${c.w} v ${CB - CT} h ${-c.w} Z M ${c.x + 8} ${CT + 8} v ${CB - CT - 16} h ${c.w - 16} v ${-(CB - CT - 16)} Z`" fill-rule="evenodd" :fill="c.c" />
      <path :d="`M ${c.x} ${CT} h ${c.w} v ${CB - CT} h ${-c.w} Z M ${c.x + 8} ${CT + 8} v ${CB - CT - 16} h ${c.w - 16} v ${-(CB - CT - 16)} Z`" fill-rule="evenodd" fill="#000" opacity="0.18" />
      <rect v-for="k in [0, 1, 2, 3]" :key="k" :x="k % 2 ? c.x + c.w - 14 : c.x" :y="k < 2 ? CT : CB - 12" width="14" height="12" fill="#2a221a" />
      <!-- the stencils -->
      <rect :x="c.x + 16" :y="CT + 18" :width="Math.min(84, c.w - 32)" height="20" fill="#1a120b" opacity="0.8" />
      <text :x="c.x + 22" :y="CT + 33" class="stencil s" :fill="c.c">{{ c.code }}</text>
      <text :x="c.x + c.w - 16" :y="CB - 20" text-anchor="end" class="stencil xs" fill="#1a120b" opacity="0.75">{{ c.mark }}</text>
      <!-- hazard tape on the doors -->
      <rect :x="c.x + c.w - 22" :y="CT + 46" width="8" :height="CB - CT - 76" fill="#e8b02a" />
      <path v-for="k in N(5)" :key="k" :d="`M ${c.x + c.w - 22} ${CT + 54 + k * 7} l 8 -5 v 3 l -8 5 Z`" fill="#1a120b" />
      <!-- lit from above, dirty below -->
      <rect :x="c.x" :y="CT" :width="c.w" :height="CB - CT" fill="url(#h70-shade)" />
      <rect :x="c.x" :y="CT" :width="c.w" height="2.5" fill="#fff4d8" opacity="0.7" />
      <rect :x="c.x" :y="CT" :width="c.w" :height="CB - CT" fill="url(#tx-speckle)" opacity="0.4" style="mix-blend-mode: multiply" />
    </g>
    <!-- container clamps on the drum -->
    <rect v-for="x in [-296, -138, 50, 210, 328]" :key="`k${x}`" :x="x" :y="CB - 14" width="10" height="20" fill="url(#h70-aluV)" />

    <!-- ── the blocks, painted ── -->
    <path :d="THRUST" fill="#2a2420" />
    <path :d="STERN" :fill="P[2].main" />
    <path :d="MID" :fill="P[1].main" />
    <path :d="BOW" :fill="P[0].main" />

    <g clip-path="url(#h70-all)">
      <!-- (the paint again inside the clip: a clipped group blends only with what's in it) -->
      <path :d="STERN" :fill="P[2].main" />
      <path :d="MID" :fill="P[1].main" />
      <path :d="BOW" :fill="P[0].main" />
      <!-- the paint's wear: mottled patina, speckle, scuffs -->
      <rect x="-760" y="-220" width="1590" height="420" fill="url(#tx-patina)" opacity="0.5" style="mix-blend-mode: overlay" />
      <rect x="-760" y="-220" width="1590" height="420" fill="url(#tx-speckle)" opacity="0.7" style="mix-blend-mode: overlay" />
      <rect x="-760" y="-220" width="1590" height="420" fill="url(#tx-scratches)" opacity="0.1" style="mix-blend-mode: screen" />

      <!-- the bow's two-tone: a burnt-orange chin, a brown brow over the windscreen -->
      <path d="M 340 104 L 600 104 L 744 116 L 600 152 L 340 152 Z" fill="#a8461c" opacity="0.92" />
      <path d="M 340 -176 L 650 -176 L 690 -143 L 340 -143 Z" fill="#7a4a26" opacity="0.85" />
      <!-- the nose's upper facet, turned to the light -->
      <path d="M 650 -176 L 800 -56 L 816 2 L 796 2 L 780 -48 L 640 -160 Z" fill="#fff4dc" opacity="0.28" />
      <path d="M 640 -160 L 780 -48 L 796 2" fill="none" stroke="#2a160a" stroke-width="1.5" opacity="0.45" />
      <!-- the stern's machinery deck and its hazard band -->
      <rect x="-712" y="-206" width="412" height="30" fill="url(#h70-crinkle)" />
      <rect x="-712" y="-206" width="412" height="30" fill="url(#tx-speckle)" opacity="0.6" style="mix-blend-mode: overlay" />
      <rect v-for="x in louvres" :key="`l${x}`" :x="x" y="-200" width="8" height="18" rx="1" fill="#0a0806" />
      <rect v-for="x in louvres" :key="`m${x}`" :x="x" y="-200" width="8" height="2" fill="#8a847a" opacity="0.6" />
      <g clip-path="url(#h70-chev)">
        <rect x="-700" y="150" width="380" height="30" fill="#e3a52c" />
        <path v-for="k in N(16)" :key="`v${k}`" :d="`M ${-720 + k * 28} 180 L ${-706 + k * 28} 180 L ${-676 + k * 28} 150 L ${-690 + k * 28} 150 Z`" fill="#1a120b" />
        <rect x="-700" y="150" width="380" height="30" fill="url(#tx-scratches)" opacity="0.5" style="mix-blend-mode: multiply" />
      </g>
      <!-- the thrust frame: crinkle black, with collars for the nozzles -->
      <path :d="THRUST" fill="url(#h70-crinkle)" />

      <!-- panel seams and rivets -->
      <path v-for="(s, i) in SEAMS" :key="`s${i}`" :d="s" fill="none" stroke="#120a04" stroke-width="1.6" opacity="0.55" />
      <path v-for="(s, i) in SEAMS" :key="`t${i}`" :d="s" fill="none" stroke="#fff4d8" stroke-width="1" opacity="0.18" transform="translate(1.2 1.2)" />
      <g>
        <circle v-for="(r, i) in rivets" :key="`r${i}`" :cx="r.x" :cy="r.y" r="1.9" fill="#1a1008" opacity="0.5" />
        <circle v-for="(r, i) in rivets" :key="`q${i}`" :cx="r.x - 0.6" :cy="r.y - 0.6" r="1" fill="#fff4d8" opacity="0.4" />
      </g>

      <!-- the racing stripe: orange, gold, cream on a dark band -->
      <path :d="STRIPE" fill="none" stroke="#1a120b" stroke-width="34" stroke-linejoin="miter" opacity="0.9" />
      <path :d="STRIPE" fill="none" stroke="#ee6a2a" stroke-width="7" transform="translate(0 -10)" />
      <path :d="STRIPE" fill="none" stroke="#f4b42e" stroke-width="7" />
      <path :d="STRIPE" fill="none" stroke="#efdcae" stroke-width="7" transform="translate(0 10)" />
      <path :d="STRIPE" fill="none" stroke="url(#tx-scratches)" stroke-width="34" opacity="0.35" style="mix-blend-mode: multiply" />

      <!-- stencils and decals -->
      <text x="-688" y="-146" class="stencil xs" fill="#f0d6a4" opacity="0.7">PROPULSION MODULE · AFT</text>
      <text x="-452" y="-126" class="stencil s" fill="#1a120b" opacity="0.55">REACTOR · 3.2 GW</text>
      <g transform="translate(-338 -140)">
        <path d="M 0 -16 L 15 10 L -15 10 Z" fill="#e8b02a" />
        <path d="M 0 -10 V 2 M 0 5 V 7" stroke="#1a120b" stroke-width="3" />
      </g>
      <text x="-280" y="-56" class="stencil xs" fill="#1a120b" opacity="0.5" transform="rotate(-90 -280 -56)">HAB · DRUM 2</text>
      <text x="424" y="136" class="stencil big" fill="#f3e2b8" opacity="0.85">HX·77</text>
      <text x="566" y="132" class="stencil xs" fill="#f6e8c6" opacity="0.7">REG 1977-LH</text>
      <text x="576" y="-152" class="stencil xs" fill="#f0d6a4" opacity="0.7">NO STEP</text>
      <!-- the line's crest on the bow: an original roundel -->
      <g transform="translate(-374 -148)">
        <circle r="13" fill="#1a120b" opacity="0.85" />
        <circle r="10" fill="none" stroke="#f4b42e" stroke-width="2" />
        <path d="M -7 4 L 0 -7 L 7 4 M -4 4 L 0 -2 L 4 4" fill="none" stroke="#ee6a2a" stroke-width="2" />
      </g>
      <!-- grime streaks -->
      <rect v-for="(g, i) in grime" :key="`g${i}`" :x="g.x" :y="g.y" :width="g.w" :height="g.h" fill="url(#h70-streak)" :opacity="g.o" />

      <!-- the drum's cylinder light, the blocks' light, the bounce, the key's falloff -->
      <rect x="-300" y="-122" width="640" height="244" fill="url(#h70-cyl)" />
      <path v-for="(b, i) in bodies" :key="`b${i}`" :d="b.d" fill="url(#h70-shade)" />
      <rect x="-760" y="-220" width="1590" height="420" fill="url(#h70-bounce)" />
      <rect x="-760" y="-220" width="1590" height="420" fill="url(#h70-key)" />
    </g>

    <!-- rim light along the top edges, a warm edge along the bottom -->
    <path :d="STERN_RIM" fill="none" stroke="#fff4dc" stroke-width="2.5" opacity="0.75" stroke-linejoin="round" />
    <path :d="BOW_RIM" fill="none" stroke="#fff4dc" stroke-width="2.5" opacity="0.85" stroke-linejoin="round" />
    <path d="M -300 -121 H 340" stroke="#fff4dc" stroke-width="1.5" opacity="0.5" />
    <path d="M -688 186 H -318 M 340 151 H 600 L 746 114" fill="none" stroke="#ff9a4a" stroke-width="2" opacity="0.5" />

    <!-- the joints: docking collars between the blocks -->
    <g v-for="x in [-300, 340]" :key="`j${x}`">
      <rect :x="x - 16" y="-142" width="32" height="284" rx="4" fill="url(#h70-crinkle)" />
      <rect :x="x - 16" y="-142" width="32" height="284" rx="4" fill="url(#tx-speckle)" opacity="0.6" style="mix-blend-mode: overlay" />
      <rect :x="x - 18" y="-146" width="36" height="8" rx="2" fill="url(#h70-alu)" />
      <rect :x="x - 18" y="138" width="36" height="8" rx="2" fill="url(#h70-alu)" />
      <rect :x="x - 10" y="-136" width="4" height="272" fill="#d8d0c0" opacity="0.35" />
      <circle v-for="(b, k) in bolts(x)" :key="k" :cx="b.x + 6" :cy="b.y + 8" r="3" fill="url(#h70-alu)" />
    </g>

    <!-- ── the parts' housings ── -->
    <!-- REACTOR MONITOR: a deep bezel, the garden's channel under it -->
    <rect x="-548" y="-82" width="244" height="94" rx="6" fill="#120c08" />
    <rect x="-544" y="-78" width="236" height="86" rx="5" fill="url(#h70-recess)" />
    <rect x="-526" y="8" width="200" height="46" rx="23" fill="url(#h70-recess)" />
    <!-- EXHAUST VENTS: a louvred plate, screwed down -->
    <rect x="-546" y="72" width="240" height="50" rx="6" fill="url(#h70-crinkle)" />
    <circle v-for="x in [-540, -312]" :key="`ev${x}`" :cx="x" cy="97" r="3" fill="url(#h70-alu)" />
    <!-- MAIN TURBINE: a cowled intake -->
    <circle cx="-636" cy="-26" r="84" fill="#0c0a08" />
    <circle cx="-636" cy="-26" r="84" fill="url(#h70-cowl)" />
    <circle cx="-636" cy="-26" r="80" fill="none" stroke="url(#h70-lip)" stroke-width="4" />
    <circle v-for="k in N(12)" :key="`tb${k}`" :cx="-636 + Math.cos((k * Math.PI) / 6) * 77" :cy="-26 + Math.sin((k * Math.PI) / 6) * 77" r="2" fill="#c8c0b0" opacity="0.6" />
    <!-- the nozzles' collars on the thrust frame -->
    <g v-for="y in [-110, -10, 90]" :key="`n${y}`">
      <rect x="-752" :y="y - 30" width="22" height="60" rx="4" fill="url(#h70-aluV)" />
      <rect x="-752" :y="y - 30" width="22" height="60" rx="4" fill="url(#tx-brushed)" opacity="0.5" style="mix-blend-mode: multiply" />
      <rect x="-756" :y="y - 34" width="8" height="68" rx="2" fill="#1a1612" />
    </g>
    <!-- REACTOR DOME: a plinth with a shadow gap -->
    <path d="M -584 -206 L -392 -206 L -400 -196 L -576 -196 Z" fill="#100c08" />
    <!-- AIRBRAKE hinge, HEAT SINK root -->
    <rect x="-690" y="174" width="60" height="16" rx="4" fill="url(#h70-alu)" />
    <rect x="-560" y="180" width="220" height="10" rx="3" fill="#1a1410" />

    <!-- CREW DECK: a long bezel, the garden's channel -->
    <rect x="-226" y="-76" width="348" height="96" rx="20" fill="#0e0a06" />
    <rect x="-221" y="-71" width="338" height="86" rx="18" fill="url(#h70-recess)" />
    <rect x="-200" y="10" width="296" height="52" rx="26" fill="url(#h70-recess)" />
    <!-- BLEED VALVES -->
    <rect x="-222" y="68" width="340" height="46" rx="8" fill="url(#h70-crinkle)" />
    <!-- CARGO WINCH: a drum housing with a hood -->
    <circle cx="231" cy="-1" r="90" fill="#0e0a06" />
    <circle cx="231" cy="-1" r="90" fill="url(#h70-cowl)" />
    <circle cx="231" cy="-1" r="86" fill="none" stroke="url(#h70-lip)" stroke-width="3" />
    <!-- BELLY BLISTER: a mounting ring -->
    <rect x="-108" y="114" width="216" height="14" rx="5" fill="url(#h70-alu)" />

    <!-- COMMAND DECK: the trapezoid windscreen, its smoked side panes, a rubber gasket, the instrument channel -->
    <path :d="FRAME" fill="#24160c" />
    <path :d="FRAME" fill="url(#tx-leather)" opacity="0.5" style="mix-blend-mode: overlay" />
    <path :d="FRAME_IN" fill="url(#h70-smoke)" />
    <path d="M 370 -152 L 660 -152" stroke="#ffe0b0" stroke-width="1.5" opacity="0.4" />
    <rect :x="SCREEN.x0 - 4" :y="SCREEN.y0 - 4" :width="SCREEN.x1 - SCREEN.x0 + 8" :height="SCREEN.y1 - SCREEN.y0 + 8" rx="7" fill="#0a0604" />
    <path d="M 360 -160 L 670 -160" stroke="#fff4dc" stroke-width="2" opacity="0.6" />
    <rect x="396" y="-76" width="236" height="48" rx="24" fill="url(#h70-recess)" />
    <!-- COOLANT VENTS -->
    <rect x="382" y="-12" width="256" height="52" rx="8" fill="url(#h70-crinkle)" />
    <!-- THRUSTER INTAKE: the chin's cowled intake -->
    <circle cx="712" cy="18" r="66" fill="#0c0a08" />
    <circle cx="712" cy="18" r="66" fill="url(#h70-cowl)" />
    <circle cx="712" cy="18" r="62" fill="none" stroke="url(#h70-lip)" stroke-width="3.5" />
    <!-- SENSOR DOME plinth, SCANNER turret, RADAR mast foot -->
    <path d="M 394 -176 L 534 -176 L 526 -188 L 402 -188 Z" fill="url(#h70-crinkle)" />
    <path d="M 574 -176 L 616 -176 L 610 -188 L 580 -188 Z" fill="url(#h70-alu)" />
    <path d="M 704 -126 L 744 -94 L 744 -104 L 712 -130 Z" fill="url(#h70-crinkle)" />
    <!-- RCS pod under the chin -->
    <path d="M 590 136 L 760 106 L 766 116 L 600 150 Z" fill="url(#h70-crinkle)" />

    <!-- conduit: aluminium pipe runs in their brackets -->
    <g v-for="(r, i) in pipes" :key="`pp${i}`">
      <rect :x="r.x0" :y="r.y" :width="r.x1 - r.x0" :height="r.h" :rx="r.h / 2" fill="url(#h70-alu)" />
      <rect v-for="k in Math.floor((r.x1 - r.x0) / 46)" :key="k" :x="r.x0 + k * 46 - 3" :y="r.y - 2" width="6" :height="r.h + 4" fill="#1a1410" />
    </g>

    <!-- greebles -->
    <g v-for="(g, i) in greebles" :key="`e${i}`">
      <rect :x="g.x" :y="g.y" :width="g.w" :height="g.h" :fill="g.k === 0 ? 'url(#h70-alu)' : 'url(#h70-crinkle)'" />
      <rect :x="g.x" :y="g.y" :width="g.w" height="1.5" fill="#fff4dc" opacity="0.6" />
    </g>

    <!-- lit portholes, warm amber -->
    <g v-for="(w, i) in portholes" :key="`w${i}`">
      <rect :x="w.x - 3" :y="w.y - 3" :width="w.w + 6" :height="w.h + 6" :rx="(w.h + 6) / 2" fill="#120a04" />
      <rect :x="w.x" :y="w.y" :width="w.w" :height="w.h" :rx="w.h / 2" fill="#ffb84a" />
      <ellipse :cx="w.x + w.w / 2" :cy="w.y + w.h / 2" :rx="w.w * 1.4" :ry="w.h * 1.8" fill="url(#h70-amber)" opacity="0.6" />
    </g>

    <!-- nav lights: red aft on the deck, green on the containers, a white strobe at the nose -->
    <circle cx="-330" cy="-214" r="16" fill="url(#h70-red)" />
    <circle cx="-330" cy="-212" r="3" fill="#ff5030" />
    <circle cx="326" cy="-244" r="16" fill="url(#h70-green)" />
    <circle cx="326" cy="-242" r="3" fill="#50ff70" />
    <circle cx="812" cy="0" r="12" fill="url(#h70-amber)" />
  </g>
</template>

<style scoped>
.stencil {
  font-family: 'Futura', 'Avenir Next Condensed', 'Avenir Next', sans-serif;
  font-weight: 800;
  letter-spacing: 1.5px;
}
.s {
  font-size: 14px;
}
.xs {
  font-size: 10px;
  letter-spacing: 1.2px;
}
.big {
  font-size: 34px;
  letter-spacing: 5px;
}
</style>
