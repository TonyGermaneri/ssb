<script setup lang="ts">
import type { CockpitDesign, Skin } from '../../../lib/voyage/cockpit/design'
import { eye60, X60 } from '../../../lib/voyage/cockpit/eras/c1960'

/**
 * The SIXTIES' cockpit, behind its controls: the EYE. Op-art bands of candy colour ripple out from the windscreen
 * over the whole bulkhead (screenprinted, a little off-register), glossy lids round the glass, lashes fanning off the
 * top lid, mandalas turning in the corners, lava lamps glooping under the eye's corners, diamonds drifting, daisies
 * breathing; and three melted-candy consoles, one per VCO, each with a painted flower under its ring of knobs, a lava
 * capsule round its faders, a candy-striped plinth for its throttles, petals round its kaleidoscope and its gauge.
 */
const props = defineProps<{ design: CockpitDesign; skin: Skin }>()
void props

const BANDS = ['#ff2e88', '#ff7a1a', '#ffd21f', '#a6ff2e', '#2fe0c4', '#7a3cff', '#ff3df0']
const N = 13
const scales = Array.from({ length: N }, (_, i) => 1.05 * Math.pow(3.6 / 1.05, (N - 1 - i) / (N - 1)))
const bands = scales.map((s, i) => ({ d: `${eye60(s)} ${eye60(1)}`, c: BANDS[i % BANDS.length], s }))

/** the top lid's curve at scale s: point and outward normal at t */
function lid(s: number, t: number) {
  const P = [
    [800 - 570 * s, 262],
    [800 - 370 * s, 262 - 222 * s],
    [800 + 370 * s, 262 - 222 * s],
    [800 + 570 * s, 262],
  ]
  const u = 1 - t
  const x = u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0]
  const y = u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1]
  const dx = 3 * u * u * (P[1][0] - P[0][0]) + 6 * u * t * (P[2][0] - P[1][0]) + 3 * t * t * (P[3][0] - P[2][0])
  const dy = 3 * u * u * (P[1][1] - P[0][1]) + 6 * u * t * (P[2][1] - P[1][1]) + 3 * t * t * (P[3][1] - P[2][1])
  const l = Math.hypot(dx, dy)
  return { x, y, tx: dx / l, ty: dy / l, nx: dy / l, ny: -dx / l }
}
const f = (n: number) => n.toFixed(1)
function lash(t: number, len: number, w: number, s: number, down = false) {
  const p = lid(s, t)
  const nx = down ? -p.nx : p.nx
  const ny = down ? -p.ny : p.ny
  const side = t < 0.5 ? -1 : 1
  const bend = (Math.abs(t - 0.5) * 2 + 0.25) * len * 0.55 * side
  const tip = { x: p.x + nx * len + p.tx * bend, y: p.y + ny * len + p.ty * bend }
  const bl = { x: p.x - p.tx * w, y: p.y - p.ty * w }
  const br = { x: p.x + p.tx * w, y: p.y + p.ty * w }
  const c1 = { x: bl.x + nx * len * 0.6 + p.tx * bend * 0.2, y: bl.y + ny * len * 0.6 + p.ty * bend * 0.2 }
  const c2 = { x: br.x + nx * len * 0.6 + p.tx * bend * 0.35, y: br.y + ny * len * 0.6 + p.ty * bend * 0.35 }
  return `M ${f(bl.x)} ${f(bl.y)} Q ${f(c1.x)} ${f(c1.y)} ${f(tip.x)} ${f(tip.y)} Q ${f(c2.x)} ${f(c2.y)} ${f(br.x)} ${f(br.y)} Z`
}
const lashes = Array.from({ length: 17 }, (_, i) => {
  const t = 0.1 + (i / 16) * 0.8
  const mid = 1 - Math.abs(t - 0.5) * 2
  return { d: lash(t, 46 + mid * 58, 9 + mid * 5, 1.07), c: BANDS[i % BANDS.length], i }
})
// under the bottom lid: short ones, near the corners only (the bottom lid's own curve, mirrored)
const lowerLashes = [0.12, 0.18, 0.24, 0.3, 0.7, 0.76, 0.82, 0.88].map((t, i) => {
  // the bottom lid: same x, y mirrored about the eye's line with its 200/222 depth
  const p = lid(1.06, t)
  const yb = 262 + (262 - p.y) * (200 / 222)
  const nyb = -p.ny * (200 / 222)
  const l = Math.hypot(p.nx, nyb)
  const nx = p.nx / l
  const ny = nyb / l
  const len = 22
  const side = t < 0.5 ? -1 : 1
  return { d: `M ${f(p.x - 5)} ${f(yb)} Q ${f(p.x + nx * len * 0.7)} ${f(yb + ny * len * 0.7)} ${f(p.x + nx * len + side * 9)} ${f(yb + ny * len)} Q ${f(p.x + nx * len * 0.5 + 4)} ${f(yb + ny * len * 0.6)} ${f(p.x + 5)} ${f(yb)} Z`, c: BANDS[(i * 3) % BANDS.length] }
})

/** a mandala: rings of petals */
function petalRing(n: number, r0: number, r1: number, w: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 360
    return { d: `M 0 ${-r0} C ${w} ${-(r0 + r1) / 2} ${w * 0.6} ${-r1} 0 ${-r1} C ${-w * 0.6} ${-r1} ${-w} ${-(r0 + r1) / 2} 0 ${-r0} Z`, a }
  })
}
const mandala = [
  { petals: petalRing(16, 58, 96, 13), c: '#ff2e88' },
  { petals: petalRing(12, 34, 66, 13), c: '#ffd21f' },
  { petals: petalRing(8, 14, 40, 12), c: '#2fe0c4' },
]

/** each console: its candy (lip, face), by the ship's three palettes */
const CANDY = [
  { a: '#ff5fa8', b: '#ff9a3d', deep: '#5a0a3a', hi: '#fff6c2', c: '#ffd21f' },
  { a: '#9a5cff', b: '#2fe0c4', deep: '#14104a', hi: '#e6fff8', c: '#2fe0c4' },
  { a: '#ff7a3d', b: '#ff3df0', deep: '#4a0b2e', hi: '#ffe3f1', c: '#ff6a3d' },
]
const consoleShape = (x0: number) =>
  `M ${x0 - 2} 1300 L ${x0 - 2} 470 Q ${x0 - 2} 444 ${x0 + 26} 442 C ${x0 + 120} 434 ${x0 + 170} 450 ${x0 + 260} 440 C ${x0 + 350} 432 ${x0 + 400} 450 ${x0 + 494} 442 Q ${x0 + 522} 444 ${x0 + 522} 470 L ${x0 + 522} 1300 Z`
/** the face's well: soft lobes, as if poured */
const wellShape = (x0: number) =>
  `M ${x0 + 8} 1300 L ${x0 + 8} 500 Q ${x0 + 8} 458 ${x0 + 50} 460 C ${x0 + 110} 462 ${x0 + 140} 452 ${x0 + 200} 456 C ${x0 + 260} 460 ${x0 + 300} 450 ${x0 + 360} 456 C ${x0 + 420} 462 ${x0 + 450} 454 ${x0 + 476} 460 Q ${x0 + 512} 462 ${x0 + 512} 500 L ${x0 + 512} 1300 Z`
const drips = [18, 64, 150, 196, 330, 372, 448, 506].map((dx, i) => ({ dx, len: 10 + ((i * 37) % 23) }))
const dripPath = (x: number, len: number, y = 452) => `M ${x - 7} ${y} L ${x - 6} ${y + len - 6} Q ${x - 6} ${y + len + 4} ${x} ${y + len + 4} Q ${x + 6} ${y + len + 4} ${x + 6} ${y + len - 6} L ${x + 7} ${y} Z`

/** the painted flower under each ring of knobs */
const flowerPetals = Array.from({ length: 8 }, (_, k) => k * 45 + 22.5)
/** scallops round a screen: circles along a stadium */
function scallops(x: number, y: number, w: number, h: number, r: number, step: number) {
  const out: { x: number; y: number }[] = []
  const rr = h / 2
  const straight = w - h
  const per = 2 * straight + 2 * Math.PI * rr
  const n = Math.round(per / step)
  for (let i = 0; i < n; i++) {
    let d = (i / n) * per
    if (d < straight) out.push({ x: x + rr + d, y })
    else if ((d -= straight) < Math.PI * rr) out.push({ x: x + w - rr + Math.sin(d / rr) * rr, y: y + rr - Math.cos(d / rr) * rr })
    else if ((d -= Math.PI * rr) < straight) out.push({ x: x + w - rr - d, y: y + h })
    else {
      d -= straight
      out.push({ x: x + rr - Math.sin(d / rr) * rr, y: y + rr + Math.cos(d / rr) * rr })
    }
  }
  void r
  return out
}
const screenScallops = scallops(162 - 2, 446 - 2, 204, 108, 14, 21)
const gems = [
  { x: 486, y: 52, s: 1, d: 0 },
  { x: 1120, y: 40, s: 0.8, d: 1.7 },
  { x: 300, y: 128, s: 0.6, d: 3.1 },
  { x: 1316, y: 120, s: 0.7, d: 2.3 },
  { x: 40, y: 236, s: 0.65, d: 0.9 },
  { x: 1566, y: 250, s: 0.75, d: 4 },
]
const daisies = [
  { x: 318, y: 392, r: 34, c: '#fff6c2', core: '#ff7a1a', d: 0 },
  { x: 380, y: 418, r: 20, c: '#ff8ac4', core: '#ffd21f', d: 1.2 },
  { x: 1282, y: 392, r: 34, c: '#e6fff8', core: '#ff2e88', d: 0.6 },
  { x: 1222, y: 418, r: 20, c: '#ffe36a', core: '#7a3cff', d: 2 },
]
</script>

<template>
  <g class="back1960">
    <defs>
      <radialGradient id="b60-wall" cx="0.5" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#5b1aa8" />
        <stop offset="0.6" stop-color="#2a0a4a" />
        <stop offset="1" stop-color="#12001f" />
      </radialGradient>
      <radialGradient id="b60-shade" cx="800" cy="262" r="1100" gradientUnits="userSpaceOnUse">
        <stop offset="0.25" stop-color="#fff" stop-opacity="0.18" />
        <stop offset="0.5" stop-color="#000" stop-opacity="0" />
        <stop offset="1" stop-color="#12001f" stop-opacity="0.75" />
      </radialGradient>
      <linearGradient id="b60-lid" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ff3df0" />
        <stop offset="0.3" stop-color="#ff2e88" />
        <stop offset="0.5" stop-color="#ffd21f" />
        <stop offset="0.7" stop-color="#2fe0c4" />
        <stop offset="1" stop-color="#7a3cff" />
      </linearGradient>
      <linearGradient id="b60-iris" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ff3df0" />
        <stop offset="0.25" stop-color="#ffd21f" />
        <stop offset="0.5" stop-color="#2fe0c4" />
        <stop offset="0.75" stop-color="#7a3cff" />
        <stop offset="1" stop-color="#ff2e88" />
      </linearGradient>
      <linearGradient id="b60-lash" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#241036" />
        <stop offset="0.55" stop-color="#3b0a4f" />
        <stop offset="1" stop-color="#7a3cff" />
      </linearGradient>
      <linearGradient id="b60-gloss" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.85" />
        <stop offset="0.5" stop-color="#fff" stop-opacity="0.15" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="b60-lavaglass" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity="0.35" />
        <stop offset="0.18" stop-color="#ff9ad8" stop-opacity="0.25" />
        <stop offset="0.5" stop-color="#ff3d9a" stop-opacity="0.18" />
        <stop offset="0.85" stop-color="#3b0a4f" stop-opacity="0.35" />
        <stop offset="1" stop-color="#fff" stop-opacity="0.3" />
      </linearGradient>
      <linearGradient id="b60-chromeV" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#4a1a66" />
        <stop offset="0.35" stop-color="#e9a0f5" />
        <stop offset="0.5" stop-color="#fff2ff" />
        <stop offset="0.7" stop-color="#b45ad0" />
        <stop offset="1" stop-color="#3b0a4f" />
      </linearGradient>
      <radialGradient id="b60-gem" cx="0.35" cy="0.3" r="0.9">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.4" stop-color="#bff8ff" />
        <stop offset="1" stop-color="#7a3cff" />
      </radialGradient>
      <radialGradient id="b60-well" cx="0.5" cy="0.15" r="1">
        <stop offset="0" stop-color="#3b0a4f" stop-opacity="0.55" />
        <stop offset="1" stop-color="#12001f" stop-opacity="0.85" />
      </radialGradient>
      <radialGradient id="b60-blob" cx="0.4" cy="0.35" r="0.7">
        <stop offset="0" stop-color="#fff6c2" />
        <stop offset="0.35" stop-color="#ffb03d" />
        <stop offset="1" stop-color="#ff2e88" />
      </radialGradient>
      <radialGradient id="b60-blob2" cx="0.4" cy="0.35" r="0.7">
        <stop offset="0" stop-color="#e6fff8" />
        <stop offset="0.35" stop-color="#2fe0c4" />
        <stop offset="1" stop-color="#7a3cff" />
      </radialGradient>
      <pattern id="b60-stripes" patternUnits="userSpaceOnUse" width="28" height="28" patternTransform="rotate(35)">
        <rect width="28" height="28" fill="#ff2e88" />
        <rect width="9" height="28" fill="#fff6c2" />
        <rect x="14" width="5" height="28" fill="#ffd21f" />
      </pattern>
      <pattern id="b60-dots" patternUnits="userSpaceOnUse" width="14" height="14">
        <circle cx="7" cy="7" r="2.6" fill="#fff" />
      </pattern>
      <clipPath id="b60-eyeclip"><path :d="design.glass" /></clipPath>
      <template v-for="(c, vco) in CANDY" :key="`cd${vco}`">
        <linearGradient :id="`b60-candy${vco}`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" :stop-color="c.a" />
          <stop offset="1" :stop-color="c.b" />
        </linearGradient>
        <radialGradient :id="`b60-petal${vco}`" cx="0.5" cy="0.1" r="1">
          <stop offset="0" :stop-color="c.hi" stop-opacity="0.75" />
          <stop offset="0.6" :stop-color="c.a" stop-opacity="0.55" />
          <stop offset="1" :stop-color="c.b" stop-opacity="0.2" />
        </radialGradient>
      </template>
    </defs>

    <!-- the wall, and the op-art bands rippling out of the eye -->
    <path :d="`M -700 -500 H 2300 V 1400 H -700 Z ${design.glass}`" fill-rule="evenodd" fill="url(#b60-wall)" />
    <g class="bands">
      <path v-for="(b, i) in bands" :key="`bm${i}`" :d="b.d" fill-rule="evenodd" fill="#00e5ff" opacity="0.5" transform="translate(-4 3)" />
      <path v-for="(b, i) in bands" :key="`b${i}`" :d="b.d" fill-rule="evenodd" :fill="b.c" />
    </g>
    <path :d="`M -700 -500 H 2300 V 1400 H -700 Z ${design.glass}`" fill-rule="evenodd" fill="url(#b60-shade)" />
    <path :d="`M -700 -500 H 2300 V 1400 H -700 Z ${design.glass}`" fill-rule="evenodd" fill="url(#tx-paper)" opacity="0.55" style="mix-blend-mode: multiply" />
    <path :d="`M -700 -500 H 2300 V 1400 H -700 Z ${design.glass}`" fill-rule="evenodd" fill="url(#tx-speckle)" opacity="0.3" style="mix-blend-mode: screen" />

    <!-- the corners: mandalas, turning -->
    <g v-for="(m, k) in [{ x: 112, y: 104 }, { x: 1488, y: 104 }]" :key="`m${k}`" :transform="`translate(${m.x} ${m.y})`">
      <circle r="104" fill="#241036" opacity="0.55" />
      <g class="spin" :class="{ rev: k === 1 }">
        <g v-for="(ring, ri) in mandala" :key="ri">
          <path v-for="(p, pi) in ring.petals" :key="pi" :d="p.d" :transform="`rotate(${p.a + ri * 11})`" :fill="ring.c" stroke="#241036" stroke-width="2" />
          <path v-for="(p, pi) in ring.petals" :key="`h${pi}`" :d="p.d" :transform="`rotate(${p.a + ri * 11}) scale(0.55)`" fill="#fff" opacity="0.35" />
        </g>
        <circle r="12" fill="#ff3df0" stroke="#241036" stroke-width="2" />
        <circle r="4" fill="#fff6c2" />
      </g>
    </g>

    <!-- the lashes off the top lid, and short ones under the bottom -->
    <g class="lashes">
      <path v-for="l in lashes" :key="`ls${l.i}`" :d="l.d" fill="#000" opacity="0.35" transform="translate(5 6)" />
      <path v-for="l in lashes" :key="`l${l.i}`" :d="l.d" fill="url(#b60-lash)" stroke="#12001f" stroke-width="1.5" />
      <path v-for="l in lashes" :key="`lc${l.i}`" :d="l.d" :fill="l.c" opacity="0.55" />
      <path v-for="(l, i) in lowerLashes" :key="`lo${i}`" :d="l.d" :fill="l.c" stroke="#241036" stroke-width="1.5" />
    </g>

    <!-- the lids: a glossy rim round the glass, an iridescent edge just inside it -->
    <path :d="design.glass" fill="none" stroke="#12001f" stroke-width="30" />
    <path :d="design.glass" fill="none" stroke="url(#b60-lid)" stroke-width="20" />
    <path :d="design.glass" fill="none" stroke="url(#b60-gloss)" stroke-width="8" opacity="0.7" transform="translate(0 -4)" />
    <path :d="eye60(1.035)" fill="none" stroke="#fff6c2" stroke-width="2" opacity="0.8" />
    <g clip-path="url(#b60-eyeclip)">
      <path :d="design.glass" fill="none" stroke="url(#b60-iris)" stroke-width="34" opacity="0.28" />
      <path :d="design.glass" fill="none" stroke="#12001f" stroke-width="12" opacity="0.5" />
      <ellipse cx="560" cy="150" rx="150" ry="26" fill="#fff" opacity="0.07" transform="rotate(-14 560 150)" />
    </g>
    <!-- a tear: the inner corner's diamond -->
    <g transform="translate(226 262)">
      <path d="M 0 -20 L 14 -4 L 0 26 L -14 -4 Z" fill="url(#b60-gem)" stroke="#241036" stroke-width="2" />
      <path d="M 0 -20 L 5 -4 L 0 26 M -14 -4 L 14 -4" stroke="#fff" stroke-width="1" fill="none" opacity="0.7" />
    </g>
    <g transform="translate(1374 262)">
      <path d="M 0 -20 L 14 -4 L 0 26 L -14 -4 Z" fill="url(#b60-gem)" stroke="#241036" stroke-width="2" />
      <path d="M 0 -20 L -5 -4 L 0 26 M -14 -4 L 14 -4" stroke="#fff" stroke-width="1" fill="none" opacity="0.7" />
    </g>

    <!-- the diamonds, drifting -->
    <g v-for="(g, i) in gems" :key="`gm${i}`" :transform="`translate(${g.x} ${g.y}) scale(${g.s})`">
      <g class="drift" :style="{ animationDelay: `${-g.d}s` }">
        <path d="M -26 -8 L -14 -22 L 14 -22 L 26 -8 L 0 30 Z" fill="url(#b60-gem)" stroke="#241036" stroke-width="2.5" />
        <path d="M -26 -8 H 26 M -14 -22 L -8 -8 L 0 30 L 8 -8 L 14 -22 M -8 -8 L 0 -22 L 8 -8" fill="none" stroke="#fff" stroke-width="1.3" opacity="0.8" />
        <path d="M -26 -8 L -8 -8 L 0 30 Z" fill="#ff3df0" opacity="0.35" />
        <path d="M 26 -8 L 8 -8 L 0 30 Z" fill="#2fe0c4" opacity="0.35" />
        <path class="twinkle" d="M 16 -30 l 3 9 l 9 3 l -9 3 l -3 9 l -3 -9 l -9 -3 l 9 -3 Z" fill="#fff" :style="{ animationDelay: `${-g.d * 0.7}s` }" />
      </g>
    </g>

    <!-- the lava lamps under the eye's corners -->
    <g v-for="(lx, k) in [104, 1496]" :key="`ll${k}`" :transform="`translate(${lx} 0)`">
      <ellipse cx="0" cy="440" rx="58" ry="10" fill="#000" opacity="0.4" />
      <path d="M -34 300 L -22 214 L 22 214 L 34 300 L 26 400 L -26 400 Z" fill="#3b0a4f" opacity="0.6" />
      <path d="M -34 300 L -22 214 L 22 214 L 34 300 L 26 400 L -26 400 Z" :fill="k ? '#2fe0c4' : '#ff7a1a'" opacity="0.35" />
      <clipPath :id="`b60-lamp${k}`"><path d="M -34 300 L -22 214 L 22 214 L 34 300 L 26 400 L -26 400 Z" /></clipPath>
      <g :clip-path="`url(#b60-lamp${k})`">
        <ellipse class="goo a" cx="-6" cy="380" rx="22" ry="16" :fill="k ? 'url(#b60-blob2)' : 'url(#b60-blob)'" />
        <ellipse class="goo b" cx="8" cy="330" rx="14" ry="20" :fill="k ? 'url(#b60-blob2)' : 'url(#b60-blob)'" />
        <ellipse class="goo c" cx="-4" cy="260" rx="11" ry="14" :fill="k ? 'url(#b60-blob2)' : 'url(#b60-blob)'" />
        <ellipse cx="0" cy="398" rx="30" ry="9" :fill="k ? '#7a3cff' : '#ff2e88'" />
      </g>
      <path d="M -34 300 L -22 214 L 22 214 L 34 300 L 26 400 L -26 400 Z" fill="url(#b60-lavaglass)" stroke="#241036" stroke-width="2" />
      <path d="M -28 296 L -18 222" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.55" />
      <path d="M -22 214 L -14 186 L 14 186 L 22 214 Z" fill="url(#b60-chromeV)" stroke="#241036" stroke-width="2" />
      <path d="M -26 400 L -50 438 L 50 438 L 26 400 Z" fill="url(#b60-chromeV)" stroke="#241036" stroke-width="2" />
      <path d="M -50 438 L 50 438" stroke="#fff" stroke-width="1.5" opacity="0.6" />
    </g>

    <!-- daisies at the eye's lower corners, breathing -->
    <g v-for="(d, i) in daisies" :key="`dz${i}`" :transform="`translate(${d.x} ${d.y})`">
      <g class="breathe" :style="{ animationDelay: `${-d.d}s` }">
        <ellipse v-for="k in 10" :key="k" cx="0" :cy="-d.r * 0.55" :rx="d.r * 0.22" :ry="d.r * 0.5" :transform="`rotate(${k * 36})`" :fill="d.c" stroke="#241036" stroke-width="1.6" />
        <circle :r="d.r * 0.3" :fill="d.core" stroke="#241036" stroke-width="1.6" />
        <circle :r="d.r * 0.3" fill="url(#b60-dots)" opacity="0.4" />
      </g>
    </g>

    <!-- past the stage's sides (wide screens): a giant mandala half-sunk, and more lava lamps -->
    <g v-for="(m, k) in [{ x: -300, y: 760 }, { x: 1900, y: 760 }]" :key="`sm${k}`" :transform="`translate(${m.x} ${m.y}) scale(2.2)`">
      <circle r="104" fill="#241036" opacity="0.55" />
      <g class="spin" :class="{ rev: k === 0 }">
        <g v-for="(ring, ri) in mandala" :key="ri">
          <path v-for="(p, pi) in ring.petals" :key="pi" :d="p.d" :transform="`rotate(${p.a + ri * 11})`" :fill="ring.c" stroke="#241036" stroke-width="2" />
        </g>
        <circle r="12" fill="#ff3df0" stroke="#241036" stroke-width="2" />
      </g>
    </g>
    <g v-for="(lx, k) in [-110, 1710]" :key="`sl${k}`" :transform="`translate(${lx} 210) scale(1.25)`">
      <path d="M -34 300 L -22 214 L 22 214 L 34 300 L 26 400 L -26 400 Z" :fill="k ? '#ff2e88' : '#2fe0c4'" opacity="0.45" stroke="#241036" stroke-width="2" />
      <ellipse class="goo b" cx="4" cy="340" rx="16" ry="22" :fill="k ? 'url(#b60-blob)' : 'url(#b60-blob2)'" />
      <ellipse class="goo c" cx="-4" cy="270" rx="11" ry="14" :fill="k ? 'url(#b60-blob)' : 'url(#b60-blob2)'" />
      <path d="M -34 300 L -22 214 L 22 214 L 34 300 L 26 400 L -26 400 Z" fill="url(#b60-lavaglass)" />
      <path d="M -22 214 L -14 186 L 14 186 L 22 214 Z" fill="url(#b60-chromeV)" stroke="#241036" stroke-width="2" />
      <path d="M -26 400 L -50 438 L 50 438 L 26 400 Z" fill="url(#b60-chromeV)" stroke="#241036" stroke-width="2" />
    </g>

    <!-- the consoles: melted candy -->
    <g v-for="(c, vco) in CANDY" :key="`c${vco}`">
      <path :d="consoleShape(X60(vco))" fill="#000" opacity="0.45" transform="translate(6 10)" />
      <path :d="consoleShape(X60(vco))" :fill="`url(#b60-candy${vco})`" stroke="#241036" stroke-width="3" />
      <path :d="consoleShape(X60(vco))" fill="url(#tx-speckle)" opacity="0.25" style="mix-blend-mode: soft-light" />
      <!-- the face: a deep well, the lip's drips over it -->
      <path :d="wellShape(X60(vco))" fill="url(#b60-well)" />
      <path :d="wellShape(X60(vco))" fill="url(#tx-velvet)" opacity="0.35" style="mix-blend-mode: overlay" />
      <path :d="wellShape(X60(vco))" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.35" transform="translate(0 2)" />
      <path v-for="(d, i) in drips" :key="`d${i}`" :d="dripPath(X60(vco) + d.dx, d.len)" :fill="`url(#b60-candy${vco})`" stroke="#241036" stroke-width="1.5" />
      <path v-for="(d, i) in drips" :key="`dh${i}`" :d="`M ${X60(vco) + d.dx - 3} 456 L ${X60(vco) + d.dx - 3} ${452 + d.len - 4}`" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.6" />
      <path :d="`M ${X60(vco) + 26} 446 C ${X60(vco) + 120} 438 ${X60(vco) + 170} 454 ${X60(vco) + 260} 444 C ${X60(vco) + 350} 436 ${X60(vco) + 400} 454 ${X60(vco) + 494} 446`" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity="0.75" />

      <!-- below the stage (tall screens): paisleys printed on the console's skirt -->
      <g v-for="(pz, i) in [{ x: 110, y: 980, r: -20, s: 1.3 }, { x: 270, y: 1010, r: 160, s: 1 }, { x: 420, y: 970, r: 30, s: 1.2 }]" :key="`pz${i}`" :transform="`translate(${X60(vco) + pz.x} ${pz.y}) rotate(${pz.r}) scale(${pz.s})`">
        <path d="M 0 40 C 44 30 58 -24 22 -50 C -6 -70 -46 -52 -40 -16 C -36 6 -16 12 -6 2 C 2 -6 -6 -20 -16 -14" :fill="c.hi" stroke="#241036" stroke-width="2.5" opacity="0.9" />
        <path d="M 0 40 C 30 30 40 -14 16 -36 C -2 -50 -28 -38 -26 -16" fill="none" :stroke="c.c" stroke-width="5" />
        <circle v-for="k in 6" :key="k" :cx="Math.cos(k) * 22" :cy="Math.sin(k) * 22 - 10" r="3" :fill="c.a" />
      </g>
      <path :d="`M ${X60(vco) + 20} 930 C ${X60(vco) + 140} 910 ${X60(vco) + 380} 950 ${X60(vco) + 500} 930`" fill="none" :stroke="c.hi" stroke-width="3" stroke-dasharray="1 10" stroke-linecap="round" opacity="0.8" />

      <!-- the flower under the ring -->
      <g :transform="`translate(${X60(vco) + 260} 675)`">
        <ellipse v-for="a in flowerPetals" :key="a" cx="0" cy="-74" rx="32" ry="64" :transform="`rotate(${a})`" :fill="`url(#b60-petal${vco})`" stroke="#241036" stroke-width="1.5" stroke-opacity="0.6" />
        <circle r="126" fill="none" :stroke="c.c" stroke-width="2" stroke-dasharray="2 9" stroke-linecap="round" opacity="0.8" />
        <circle r="54" fill="#241036" opacity="0.6" />
        <circle r="54" fill="none" :stroke="c.hi" stroke-width="1.5" opacity="0.5" />
      </g>

      <!-- the lava capsule round the faders -->
      <g :transform="`translate(${X60(vco)} 0)`">
        <rect x="8" y="546" width="116" height="256" rx="42" fill="#12001f" opacity="0.7" />
        <clipPath :id="`b60-cap${vco}`"><rect x="10" y="548" width="112" height="252" rx="40" /></clipPath>
        <g :clip-path="`url(#b60-cap${vco})`">
          <rect x="10" y="548" width="112" height="252" :fill="c.deep" />
          <ellipse class="goo a" cx="40" cy="760" rx="34" ry="24" :fill="vco === 1 ? 'url(#b60-blob2)' : 'url(#b60-blob)'" />
          <ellipse class="goo b" cx="86" cy="690" rx="26" ry="32" :fill="vco === 1 ? 'url(#b60-blob2)' : 'url(#b60-blob)'" />
          <ellipse class="goo c" cx="62" cy="600" rx="22" ry="18" :fill="vco === 1 ? 'url(#b60-blob2)' : 'url(#b60-blob)'" />
          <ellipse cx="66" cy="804" rx="70" ry="22" :fill="c.a" />
        </g>
        <rect x="10" y="548" width="112" height="252" rx="40" fill="url(#b60-lavaglass)" stroke="#fff" stroke-opacity="0.5" stroke-width="2" />
        <path d="M 22 600 L 22 750" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.35" />
      </g>

      <!-- the throttles' candy-striped plinth -->
      <g :transform="`translate(${X60(vco)} 0)`">
        <rect x="398" y="580" width="118" height="218" rx="28" fill="#12001f" opacity="0.6" />
        <rect x="402" y="584" width="110" height="210" rx="24" fill="url(#b60-stripes)" opacity="0.85" />
        <rect x="402" y="584" width="110" height="210" rx="24" fill="url(#b60-gloss)" opacity="0.45" />
        <rect x="402" y="584" width="110" height="210" rx="24" fill="none" stroke="#241036" stroke-width="2.5" />
      </g>

      <!-- petals round the kaleidoscope, and round the gauge -->
      <g :transform="`translate(${X60(vco)} 0)`">
        <circle v-for="(p, i) in screenScallops" :key="`sc${i}`" :cx="p.x" :cy="p.y" r="13" :fill="i % 2 ? c.c : c.hi" stroke="#241036" stroke-width="1.5" />
        <g transform="translate(404 494)">
          <ellipse v-for="k in 12" :key="k" cx="0" cy="-38" rx="9" ry="14" :transform="`rotate(${k * 30})`" :fill="k % 2 ? c.a : c.hi" stroke="#241036" stroke-width="1.2" />
        </g>
        <g transform="translate(478 494)">
          <circle r="33" fill="none" :stroke="c.hi" stroke-width="3" stroke-dasharray="5 6" opacity="0.8" />
        </g>
        <!-- the counters' cloud -->
        <path d="M 14 470 Q 14 456 30 458 Q 46 448 64 458 Q 83 446 100 458 Q 120 448 140 458 Q 158 456 158 474 L 158 516 Q 158 530 140 528 L 30 528 Q 14 530 14 516 Z" fill="#241036" opacity="0.65" />
        <!-- the rate's lead: a beaded strip under its jacks -->
        <rect x="64" y="826" width="324" height="74" rx="14" fill="#12001f" opacity="0.5" />
        <circle v-for="k in 26" :key="`bd${k}`" :cx="70 + k * 12" cy="822" r="3.6" :fill="BANDS[k % BANDS.length]" stroke="#241036" stroke-width="0.8" />
        <!-- the stick's flower -->
        <g transform="translate(462 840)">
          <ellipse v-for="k in 8" :key="k" cx="0" cy="-38" rx="12" ry="18" :transform="`rotate(${k * 45 + 22.5})`" :fill="c.hi" stroke="#241036" stroke-width="1.2" opacity="0.9" />
        </g>
      </g>
    </g>
    <!-- the names, painted down the plinths -->
    <g v-for="(n, vco) in ['BOW', 'MIDSHIPS', 'STERN']" :key="`n${vco}`">
      <text :x="X60(vco) + 460" y="582" text-anchor="middle" :font-family="skin.font" font-size="11" font-weight="900" letter-spacing="2" fill="#fff6c2" stroke="#241036" stroke-width="3" paint-order="stroke">{{ n }}</text>
    </g>
  </g>
</template>

<style scoped>
.spin {
  animation: spin 60s linear infinite;
}
.spin.rev {
  animation-direction: reverse;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.drift {
  animation: drift 9s ease-in-out infinite;
}
@keyframes drift {
  0%,
  100% {
    transform: translate(0, 0) rotate(-6deg);
  }
  50% {
    transform: translate(6px, -10px) rotate(8deg);
  }
}
.twinkle {
  transform-box: fill-box;
  transform-origin: center;
  animation: twinkle 3s ease-in-out infinite;
}
@keyframes twinkle {
  0%,
  100% {
    opacity: 0;
    transform: scale(0.4);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}
.breathe {
  animation: breathe 6s ease-in-out infinite;
}
@keyframes breathe {
  0%,
  100% {
    transform: scale(0.92) rotate(0deg);
  }
  50% {
    transform: scale(1.06) rotate(12deg);
  }
}
.goo {
  transform-box: fill-box;
  transform-origin: center;
}
.goo.a {
  animation: gooA 14s ease-in-out infinite;
}
.goo.b {
  animation: gooB 11s ease-in-out infinite;
}
.goo.c {
  animation: gooC 17s ease-in-out infinite;
}
@keyframes gooA {
  0%,
  100% {
    transform: translateY(0) scale(1, 1);
  }
  50% {
    transform: translateY(-120px) scale(0.8, 1.25);
  }
}
@keyframes gooB {
  0%,
  100% {
    transform: translateY(0) scale(1, 1);
  }
  50% {
    transform: translateY(60px) scale(1.2, 0.8);
  }
}
@keyframes gooC {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(90px) scale(1.3, 0.9);
  }
}
</style>
