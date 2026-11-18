<script setup lang="ts">
import type { Era } from '../../lib/voyage/ship'

/**
 * The TWENTIES ship's hull (lib/voyage/eras/e2020.ts): a graphite pebble under a frosted-glass shell -- a glass card per
 * section tinted with its gradient (coral aft, mint midships, violet forward), thin bright edges, a gradient rim, an
 * aurora seam glowing along it, a raised glass deck, a glass engine pod aft, soft underglows faked with gradients.
 * Static; the parts are drawn round it.
 */
const props = defineProps<{ era: Era }>()
const P = props.era.palettes

const HULL =
  'M -700 -12 C -700 -104 -616 -152 -470 -152 L 360 -146 C 560 -140 716 -104 788 -42 C 812 -22 812 2 788 22 C 716 84 560 120 360 124 L -470 128 C -616 128 -700 80 -700 -12 Z'
/** the frosted shell over the top: down to a soft line along the side */
const SHELL =
  'M -700 -12 C -700 -104 -616 -152 -470 -152 L 360 -146 C 560 -140 716 -104 788 -42 C 800 -32 806 -22 806 -12 C 700 -30 560 -40 360 -38 L -470 -30 C -600 -28 -680 -20 -700 -12 Z'
const SECTIONS = [
  { x0: 236, x1: 810, a: P[0].alt, b: P[0].glow, gx: 520 },
  { x0: -236, x1: 224, a: P[1].alt, b: P[1].glow, gx: 0 },
  { x0: -710, x1: -248, a: P[2].alt, b: P[2].glow, gx: -470 },
]
/** the glass deck: a raised card over midships */
const DECK = 'M -170 -140 L -170 -322 Q -170 -348 -144 -348 L 154 -348 Q 180 -348 180 -322 L 180 -140 Z'
const POD = { x: -720, y: -312, w: 250, h: 164 }
const N = (n: number) => Array.from({ length: n }, (_, i) => i)
type Rect = [number, number, number, number]
/** a fin's resting outline (VoyageShip's finPath at mid 0): the glass over it */
function finRest([x0, y0, x1, y1]: Rect, v: string) {
  const W = x1 - x0
  const H = y1 - y0
  if (v === 'wing') return `M ${x1 - 10} ${y0 + 20} C ${x1 + 6} ${y0 + 80} ${x1 - 20} ${y1 - 40} ${x0 + 30} ${y1 - 6} C ${x0 + 6} ${y1 - 30} ${x0 + 20} ${y0 + 90} ${x0 + 40} ${y0 + 10} Z`
  if (v === 'keel') return `M ${x0 + 10} ${y0} L ${x1 - 6} ${y0} C ${x1 - 30} ${y0 + 50} ${x1 - 50} ${y1 - 30} ${x1 - 90} ${y1} L ${x0 + 70} ${y1 - 10} C ${x0 + 40} ${y1 - 50} ${x0 + 20} ${y0 + 50} ${x0 + 10} ${y0} Z`
  if (v === 'delta') return `M ${x0 + 8} ${y0} L ${x1 - 4} ${y0} C ${x1 - 20} ${y0 + H * 0.45} ${x0 + W * 0.4} ${y1 - 10} ${x0 + 6} ${y1} C ${x0 + 14} ${y0 + H * 0.6} ${x0 + 10} ${y0 + 30} ${x0 + 8} ${y0} Z`
  return `M ${x1 - 8} ${y0} L ${x0 + 60} ${y0 + 10} C ${x0 + 20} ${y0 + 60} ${x0} ${y1 - 30} ${x0 + 10} ${y1} L ${x1 - 60} ${y1 - 30} C ${x1 - 30} ${y1 - 80} ${x1 - 10} ${y0 + 60} ${x1 - 8} ${y0} Z`
}
const FINS = props.era.parts.filter((p) => p.form === 'fin' && p.back).map((p) => ({ id: p.id, d: finRest(p.rect, p.variant), vco: p.vco }))
/** the pitch parts' bells (VoyageShip's bells()), each in a frosted sleeve */
const BELLS = props.era.parts
  .filter((p) => p.form === 'funnel' && p.variant === 'bells')
  .flatMap((p) => {
    const [x0, y0, x1, y1] = p.rect
    const n = Math.max(1, p.n)
    const dx = Math.cos((p.dir * Math.PI) / 180)
    const dy = Math.sin((p.dir * Math.PI) / 180)
    const vertical = Math.abs(dy) >= Math.abs(dx)
    const slot = (vertical ? x1 - x0 : y1 - y0) / n
    const len = (vertical ? y1 - y0 : x1 - x0) - 6
    return N(n).map((i) => {
      const c = slot * (i + 0.5)
      const x = vertical ? x0 + c : dx > 0 ? x0 : x1
      const y = vertical ? (dy > 0 ? y0 : y1) : y0 + c
      const tw = slot * 0.42
      const mw = slot * 0.92
      return {
        key: `${p.id}-${i}`,
        t: `translate(${x} ${y}) rotate(${p.dir - 90})`,
        d: `M ${-tw / 2} 0 C ${-tw / 2} ${len * 0.5} ${-mw / 2} ${len * 0.7} ${-mw / 2} ${len} L ${mw / 2} ${len} C ${mw / 2} ${len * 0.7} ${tw / 2} ${len * 0.5} ${tw / 2} 0 Z`,
      }
    })
  })
/** the bells' frosted cowls: over the throat half of each bells part */
const COWLS = props.era.parts
  .filter((p) => p.form === 'funnel' && p.variant === 'bells' && p.dir !== -90)
  .map((p) => {
    const [x0, y0, x1, y1] = p.rect
    const W = x1 - x0
    const H = y1 - y0
    const a = ((p.dir % 360) + 360) % 360
    const r =
      a === 180 ? { x: x1 - W * 0.42, y: y0 - 6, w: W * 0.42 + 14, h: H + 12 }
      : a === 0 ? { x: x0 - 14, y: y0 - 6, w: W * 0.42 + 14, h: H + 12 }
      : a === 90 ? { x: x0 - 6, y: y0 - 14, w: W + 12, h: H * 0.42 + 14 }
      : { x: x0 - 6, y: y1 - H * 0.42, w: W + 12, h: H * 0.42 + 14 }
    return { id: p.id, vco: p.vco, ...r, rx: Math.min(r.w, r.h) / 2 }
  })
</script>

<template>
  <g class="hull">
    <defs>
      <clipPath id="vy-2020-hull"><path :d="HULL" /></clipPath>
      <linearGradient id="vy-2020-body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3a3e4c" />
        <stop offset="0.35" stop-color="#22252f" />
        <stop offset="1" stop-color="#0c0d12" />
      </linearGradient>
      <linearGradient id="vy-2020-frost" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.42" />
        <stop offset="0.5" stop-color="#fff" stop-opacity="0.14" />
        <stop offset="1" stop-color="#fff" stop-opacity="0.04" />
      </linearGradient>
      <linearGradient id="vy-2020-rim" x1="-700" y1="0" x2="810" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" :stop-color="P[2].alt" />
        <stop offset="0.36" :stop-color="P[2].glow" />
        <stop offset="0.5" :stop-color="P[1].main" />
        <stop offset="0.68" :stop-color="P[0].glow" />
        <stop offset="1" :stop-color="P[0].main" />
      </linearGradient>
      <linearGradient v-for="(s, i) in SECTIONS" :id="`vy-2020-tint${i}`" :key="`g${i}`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" :stop-color="s.a" stop-opacity="0.55" />
        <stop offset="1" :stop-color="s.b" stop-opacity="0.12" />
      </linearGradient>
      <radialGradient v-for="(s, i) in SECTIONS" :id="`vy-2020-glow${i}`" :key="`r${i}`">
        <stop offset="0" :stop-color="s.a" stop-opacity="0.75" />
        <stop offset="0.45" :stop-color="s.b" stop-opacity="0.26" />
        <stop offset="1" :stop-color="s.b" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="vy-2020-edge" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.9" />
        <stop offset="1" stop-color="#fff" stop-opacity="0.1" />
      </linearGradient>
      <linearGradient id="vy-2020-bellGlass" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity="0.1" />
        <stop offset="0.3" stop-color="#fff" stop-opacity="0.45" />
        <stop offset="0.5" stop-color="#fff" stop-opacity="0.12" />
        <stop offset="1" stop-color="#000" stop-opacity="0.35" />
      </linearGradient>
      <radialGradient id="vy-2020-sheen" cx="0.3" cy="0.1" r="0.8">
        <stop offset="0" stop-color="#fff" stop-opacity="0.28" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </radialGradient>
    </defs>

    <!-- the underglow: each section's colour pooling under it -->
    <ellipse v-for="(s, i) in SECTIONS" :key="`u${i}`" :cx="s.gx" cy="60" :rx="i === 1 ? 360 : 380" ry="230" :fill="`url(#vy-2020-glow${i})`" />

    <!-- glass over the fins (their colour glowing through) and frosted cowls over the bells' throats -->
    <g v-for="g in FINS" :key="`fg${g.id}`">
      <path :d="g.d" fill="#0b0c12" opacity="0.28" />
      <path :d="g.d" fill="url(#vy-2020-frost)" />
      <path :d="g.d" fill="url(#vy-2020-sheen)" />
      <path :d="g.d" fill="none" stroke="url(#vy-2020-edge)" stroke-width="1.6" stroke-linejoin="round" />
    </g>
    <g v-for="b in BELLS" :key="`bl${b.key}`" :transform="b.t">
      <path :d="b.d" fill="#0b0c12" opacity="0.3" />
      <path :d="b.d" fill="url(#vy-2020-bellGlass)" />
    </g>
    <g v-for="c in COWLS" :key="`cw${c.id}`">
      <rect :x="c.x" :y="c.y" :width="c.w" :height="c.h" :rx="c.rx" fill="#1a1c25" />
      <rect :x="c.x" :y="c.y" :width="c.w" :height="c.h" :rx="c.rx" :fill="`url(#vy-2020-tint${c.vco})`" />
      <rect :x="c.x" :y="c.y" :width="c.w" :height="c.h" :rx="c.rx" fill="url(#vy-2020-frost)" />
      <rect :x="c.x" :y="c.y" :width="c.w" :height="c.h" :rx="c.rx" fill="none" stroke="url(#vy-2020-edge)" stroke-width="1.4" />
    </g>

    <!-- the aft pod and its pylon -->
    <path d="M -630 -160 C -620 -140 -600 -138 -560 -142 L -520 -146 C -540 -150 -556 -160 -560 -170 Z" fill="#1a1c24" stroke="url(#vy-2020-edge)" stroke-width="1" />
    <rect :x="POD.x" :y="POD.y" :width="POD.w" :height="POD.h" :rx="POD.h / 2" fill="url(#vy-2020-body)" />
    <rect :x="POD.x" :y="POD.y" :width="POD.w" :height="POD.h" :rx="POD.h / 2" :fill="`url(#vy-2020-tint2)`" opacity="0.6" />
    <rect :x="POD.x" :y="POD.y" :width="POD.w" :height="POD.h / 2" :rx="POD.h / 4" fill="url(#vy-2020-frost)" />
    <rect :x="POD.x" :y="POD.y" :width="POD.w" :height="POD.h" :rx="POD.h / 2" fill="none" stroke="url(#vy-2020-rim)" stroke-width="2.4" />
    <rect :x="POD.x + 4" :y="POD.y + 4" :width="POD.w - 8" :height="POD.h - 8" :rx="POD.h / 2 - 4" fill="none" stroke="#fff" stroke-opacity="0.3" stroke-width="1" />

    <!-- the glass deck -->
    <path :d="DECK" fill="#171922" />
    <path :d="DECK" fill="url(#vy-2020-tint1)" />
    <path :d="DECK" fill="url(#vy-2020-frost)" />
    <path :d="DECK" fill="none" stroke="url(#vy-2020-edge)" stroke-width="1.6" />
    <rect x="-160" y="-190" width="330" height="6" rx="3" fill="#fff" opacity="0.18" />
    <circle v-for="k in N(5)" :key="`d${k}`" :cx="-140 + k * 14" cy="-162" r="3" :fill="k === 0 ? P[1].main : '#fff'" :opacity="k === 0 ? 0.95 : 0.35" />

    <g clip-path="url(#vy-2020-hull)">
      <path :d="HULL" fill="url(#vy-2020-body)" />
      <!-- a glass card per section, tinted with its gradient -->
      <g v-for="(s, i) in SECTIONS" :key="`c${i}`">
        <rect :x="s.x0" y="-170" :width="s.x1 - s.x0" height="320" rx="46" :fill="`url(#vy-2020-tint${i})`" opacity="0.7" />
        <rect :x="s.x0 + 1" y="-169" :width="s.x1 - s.x0 - 2" height="318" rx="46" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="1.2" />
      </g>
      <!-- the frosted shell -->
      <path :d="SHELL" fill="url(#vy-2020-frost)" />
      <path d="M -690 -14 C -600 -24 -480 -30 -470 -30 L 360 -38 C 560 -40 700 -30 806 -12" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="1.2" />
      <path :d="HULL" fill="url(#vy-2020-sheen)" />
      <!-- the aurora seam, glowing low along the side -->
      <path d="M -690 70 C -500 92 -200 98 120 96 C 400 94 620 78 790 30" fill="none" stroke="url(#vy-2020-rim)" stroke-width="30" stroke-opacity="0.1" stroke-linecap="round" />
      <path d="M -690 70 C -500 92 -200 98 120 96 C 400 94 620 78 790 30" fill="none" stroke="url(#vy-2020-rim)" stroke-width="12" stroke-opacity="0.28" stroke-linecap="round" />
      <path d="M -690 70 C -500 92 -200 98 120 96 C 400 94 620 78 790 30" fill="none" stroke="url(#vy-2020-rim)" stroke-width="3.5" stroke-linecap="round" />
      <path d="M -690 70 C -500 92 -200 98 120 96 C 400 94 620 78 790 30" fill="none" stroke="#fff" stroke-width="1" stroke-opacity="0.8" stroke-linecap="round" />
      <!-- the belly's shade -->
      <path d="M -720 104 C -500 150 400 150 820 40 L 820 200 L -720 200 Z" fill="#000" opacity="0.35" />
    </g>
    <!-- the rim: a gradient stroke and a thin bright edge inside it -->
    <path :d="HULL" fill="none" stroke="url(#vy-2020-rim)" stroke-width="3" stroke-linejoin="round" />
    <path :d="HULL" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="1" transform="translate(0 2)" />

    <!-- the bubble's collar, an island on the nose, the name -->
    <ellipse cx="525" cy="-146" rx="98" ry="9" fill="#14161d" stroke="url(#vy-2020-edge)" stroke-width="1.2" />
    <rect x="612" y="-104" width="78" height="22" rx="11" fill="#07080b" stroke="#fff" stroke-opacity="0.25" stroke-width="1" />
    <circle cx="676" cy="-93" r="5" fill="#1d2a4a" stroke="#4d7cff" stroke-width="1.2" />
    <circle cx="628" cy="-93" r="3" :fill="P[0].glow" />
    <text x="-40" y="-170" class="name">glass nomad</text>
    <text x="-40" y="-157" class="sub">GN-20 · GEN 4 · ONLINE</text>
    <!-- the sections' indicator pills -->
    <g v-for="(x, i) in [250, -222, -690]" :key="`i${i}`">
      <rect :x="x" y="104" width="36" height="8" rx="4" :fill="P[i].main" opacity="0.9" />
    </g>
  </g>
</template>

<style scoped>
.name {
  font-family: 'Avenir Next', 'Helvetica Neue', system-ui, sans-serif;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
  fill: #fff;
  fill-opacity: 0.75;
}
.sub {
  font-family: Menlo, 'SF Mono', monospace;
  font-size: 9px;
  letter-spacing: 2px;
  fill: #fff;
  fill-opacity: 0.4;
}
</style>
