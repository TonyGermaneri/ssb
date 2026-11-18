<script setup lang="ts">
import { computed } from 'vue'
import type { CockpitDesign, Skin } from '../../../lib/voyage/cockpit/design'

/**
 * The TENS' cockpit, behind its controls, all flat: an indigo bulkhead with an app bar along the top and big flat
 * discs out at the sides; the windscreen one rounded app-icon square in a deep-indigo frame; three white material
 * cards (turquoise, amber, coral app bars) -- and the long 45° shadow of everything: the frame's and the cards' across
 * the bulkhead, every knob's, chip's, fader's and screen's across its card (worked out from the design itself, so
 * they follow the controls wherever they are). A floor of the three colours in stripes; a FAB.
 */
const props = defineProps<{ design: CockpitDesign; skin: Skin }>()

const CARDS = [
  { vco: 0, x: 16, y: 24, w: 434, h: 860, head: 56, c: '#1abc9c', ink: '#ffffff', n: '01', name: 'BOW', body: '#e8f8f4', sh: '#0e6b58' },
  { vco: 1, x: 470, y: 500, w: 660, h: 384, head: 44, c: '#ffb300', ink: '#283593', n: '02', name: 'MIDSHIPS', body: '#fff8e6', sh: '#8a5a00' },
  { vco: 2, x: 1150, y: 24, w: 434, h: 860, head: 56, c: '#ff7043', ink: '#ffffff', n: '03', name: 'STERN', body: '#fdeeea', sh: '#8a2c14' },
]
const L = 900
const S2 = Math.SQRT1_2

/** a rect's long shadow (down-right): the hexagon swept from it */
const rectShadow = (x: number, y: number, w: number, h: number, l = L) =>
  `M ${x + w} ${y} L ${x + w + l} ${y + l} L ${x + w + l} ${y + h + l} L ${x + l} ${y + h + l} L ${x} ${y + h} L ${x} ${y} Z`
/** a rounded rect's: the sweep between its top-right and bottom-left corners' tangents, and itself moved */
const rrShadow = (x: number, y: number, w: number, h: number, r: number, l = L) => {
  const tr = { x: x + w - r + r * S2, y: y + r - r * S2 }
  const bl = { x: x + r - r * S2, y: y + h - r + r * S2 }
  return [
    `M ${tr.x} ${tr.y} L ${tr.x + l} ${tr.y + l} L ${bl.x + l} ${bl.y + l} L ${bl.x} ${bl.y} Z`,
    `M ${x + l + r} ${y + l} H ${x + l + w - r} Q ${x + l + w} ${y + l} ${x + l + w} ${y + l + r} V ${y + l + h - r} Q ${x + l + w} ${y + l + h} ${x + l + w - r} ${y + l + h} H ${x + l + r} Q ${x + l} ${y + l + h} ${x + l} ${y + l + h - r} V ${y + l + r} Q ${x + l} ${y + l} ${x + l + r} ${y + l} Z`,
  ]
}
/** a circle's: the band from its two 45° tangents */
const circleShadow = (cx: number, cy: number, r: number, l = L) =>
  `M ${cx - r * S2} ${cy + r * S2} L ${cx + r * S2} ${cy - r * S2} L ${cx + r * S2 + l} ${cy - r * S2 + l} L ${cx - r * S2 + l} ${cy + r * S2 + l} Z`

const circlePath = (cx: number, cy: number, r: number) => `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`

/** every part's shadow on its card */
const shadows = computed(() => {
  const d = props.design
  const by: string[][] = [[], [], []]
  for (const c of d.controls) {
    const k = c.kind
    let p = ''
    if (k === 'knob' || k === 'selector') p = circleShadow(c.x, c.y, c.size * 1.2)
    else if (k === 'valve' || k === 'crank') p = circleShadow(c.x, c.y, c.size * 1.1)
    else if (k === 'slider' || k === 'lever') {
      const len = c.size + 44
      const wid = k === 'lever' ? 52 : 32
      p = (c.angle ?? 0) === 90 ? rectShadow(c.x - len / 2, c.y - wid / 2, len, wid) : rectShadow(c.x - wid / 2, c.y - len / 2, wid, len)
    } else if (k === 'toggle') p = rectShadow(c.x - 16, c.y - 22, 32, 44)
    else if (k === 'counter') p = rectShadow(c.x - 34, c.y - 26, 68, 52)
    else if (k === 'stick') p = rectShadow(c.x - c.size, c.y - c.size, c.size * 2, c.size * 2)
    else if (k === 'cable') p = rectShadow(c.x - c.size / 2 - 64, c.y - 22, c.size + 92, 70)
    if (p) by[c.vco]?.push(p)
  }
  for (const s of d.screens) by[s.vco]?.push(rectShadow(s.x - 10, s.y - 10, s.w + 20, s.h + 20))
  for (const g of d.gauges) by[g.vco]?.push(circleShadow(g.x, g.y, g.r + 6))
  for (const i of d.intakes) by[i.vco]?.push(circleShadow(i.x, i.y, 24))
  return by
})
const shell = computed(() => `M -700 -500 H 2300 V 1500 H -700 Z ${props.design.glass}`)
/** the glass's frame, as a rounded rect (for its shadow) */
const FRAME = { x: 458, y: 12, w: 684, h: 476, r: 76 }
/** big flat discs out at the sides */
const DISCS = [
  { x: -150, y: 220, r: 110, c: '#1abc9c' },
  { x: -230, y: 620, r: 150, c: '#3949ab' },
  { x: 1760, y: 260, r: 130, c: '#ff7043' },
  { x: 1800, y: 680, r: 110, c: '#ffb300' },
]
/** the app bar's icon tiles: a play triangle, a wave disc, a plus -- glyph and its long shadow */
const ICONS = [
  { x: 640, c: '#1abc9c', glyph: 'M 678 -122 L 712 -100 L 678 -78 Z', glyphShadow: 'M 678 -122 L 712 -100 L 812 0 L 778 22 L 678 -78 Z' },
  { x: 750, c: '#ffb300', glyph: circlePath(800, -100, 20), glyphShadow: circleShadow(800, -100, 20, 120) },
  { x: 860, c: '#ff7043', glyph: 'M 902 -122 h 16 v 14 h 14 v 16 h -14 v 14 h -16 v -14 h -14 v -16 h 14 Z', glyphShadow: rectShadow(888, -122, 44, 44, 120) },
]
const MID_FAB = { x: 1080, y: 840, r: 26 }
</script>

<template>
  <g class="back2010">
    <defs>
      <clipPath id="b10-shell"><path :d="shell" clip-rule="evenodd" /></clipPath>
      <clipPath id="b10-bar"><rect x="-700" y="-500" width="3000" height="510" /></clipPath>
      <clipPath v-for="(t, i) in ICONS" :id="`b10-icon${i}`" :key="`ic${i}`"><rect :x="t.x" y="-150" width="100" height="100" rx="24" /></clipPath>
      <clipPath v-for="c in CARDS" :id="`b10-card${c.vco}`" :key="c.vco"><rect :x="c.x" :y="c.y" :width="c.w" :height="c.h" rx="8" /></clipPath>
    </defs>

    <!-- ── the bulkhead ── -->
    <path :d="shell" fill-rule="evenodd" fill="#283593" />
    <g clip-path="url(#b10-shell)">
      <!-- a quiet grid of 8s, then the discs and their shadows -->
      <g opacity="0.06" stroke="#ffffff" stroke-width="1">
        <line v-for="k in 50" :key="`gx${k}`" :x1="-400 + k * 48" :x2="-400 + k * 48" y1="-500" y2="1500" />
      </g>
      <g v-for="(o, i) in DISCS" :key="`d${i}`">
        <path :d="circleShadow(o.x, o.y, o.r, 700)" fill="#1a237e" opacity="0.7" />
        <circle :cx="o.x" :cy="o.y" :r="o.r" :fill="o.c" />
        <circle :cx="o.x" :cy="o.y" :r="o.r * 0.42" fill="#ffffff" />
        <path :d="circleShadow(o.x, o.y, o.r * 0.42, o.r * 0.7)" fill="#000" opacity="0.12" />
      </g>
      <!-- the frame's long shadow, and the cards' -->
      <path v-for="(p, i) in rrShadow(FRAME.x, FRAME.y, FRAME.w, FRAME.h, FRAME.r)" :key="`fs${i}`" :d="p" fill="#1f2a7a" />
      <template v-for="c in CARDS" :key="`cs${c.vco}`">
        <path v-for="(p, i) in rrShadow(c.x, c.y, c.w, c.h, 8)" :key="i" :d="p" fill="#1a237e" />
      </template>
    </g>
    <!-- the app bar along the top (taller screens see it) -->
    <rect x="-700" y="-500" width="3000" height="510" fill="#1a237e" />
    <g font-family="'Roboto', 'Helvetica Neue', 'Avenir Next', 'Segoe UI', Arial, sans-serif" fill="#ffffff">
      <text x="40" y="-14" font-size="22" font-weight="500" letter-spacing="1">LONG SHADOW</text>
      <text x="1560" y="-14" font-size="18" text-anchor="end" opacity="0.8">09:41</text>
    </g>
    <g transform="translate(1440 -24)" fill="#ffffff" opacity="0.8">
      <rect x="0" y="6" width="4" height="8" /><rect x="7" y="2" width="4" height="12" /><rect x="14" y="-2" width="4" height="16" />
      <rect x="26" y="0" width="28" height="14" rx="2" fill="none" stroke="#fff" stroke-width="2" /><rect x="29" y="3" width="18" height="8" />
    </g>
    <rect x="-700" y="10" width="3000" height="4" fill="#ffb300" />
    <!-- the app bar's icons: three tiles, each with its glyph and long shadow -->
    <g v-for="(t, i) in ICONS" :key="`ic${i}`">
      <path :d="rrShadow(t.x, -150, 100, 100, 24, 400)[0]" fill="#141b66" clip-path="url(#b10-bar)" />
      <rect :x="t.x" y="-150" width="100" height="100" rx="24" :fill="t.c" />
      <g :clip-path="`url(#b10-icon${i})`">
        <path :d="t.glyphShadow" fill="#000" opacity="0.18" />
      </g>
      <path :d="t.glyph" fill="#ffffff" />
    </g>

    <!-- ── the windscreen's frame: deep indigo, flat ── -->
    <path :d="`M ${FRAME.x + FRAME.r} ${FRAME.y} H ${FRAME.x + FRAME.w - FRAME.r} Q ${FRAME.x + FRAME.w} ${FRAME.y} ${FRAME.x + FRAME.w} ${FRAME.y + FRAME.r} V ${FRAME.y + FRAME.h - FRAME.r} Q ${FRAME.x + FRAME.w} ${FRAME.y + FRAME.h} ${FRAME.x + FRAME.w - FRAME.r} ${FRAME.y + FRAME.h} H ${FRAME.x + FRAME.r} Q ${FRAME.x} ${FRAME.y + FRAME.h} ${FRAME.x} ${FRAME.y + FRAME.h - FRAME.r} V ${FRAME.y + FRAME.r} Q ${FRAME.x} ${FRAME.y} ${FRAME.x + FRAME.r} ${FRAME.y} Z ${design.glass}`" fill-rule="evenodd" fill="#151c60" />
    <path :d="design.glass" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.35" />
    <!-- its title chip, on the frame's top -->
    <g transform="translate(800 12)">
      <rect x="-92" y="-10" width="184" height="20" rx="10" fill="#ffb300" />
      <text y="4.5" text-anchor="middle" font-family="'Roboto', 'Helvetica Neue', 'Avenir Next', Arial, sans-serif" font-size="11" font-weight="700" letter-spacing="2.5" fill="#1a237e">LONG SHADOW · 2010</text>
    </g>

    <!-- ── the floor: the three colours in stripes ── -->
    <rect x="-700" y="892" width="3000" height="600" fill="#1a237e" />
    <rect x="-700" y="900" width="3000" height="16" fill="#1abc9c" />
    <rect x="-700" y="916" width="3000" height="16" fill="#ffb300" />
    <rect x="-700" y="932" width="3000" height="16" fill="#ff7043" />
    <!-- the floor's lights -->
    <circle v-for="k in 40" :key="`fl${k}`" :cx="-700 + k * 80" cy="984" r="6" :fill="['#1abc9c', '#ffb300', '#ff7043'][k % 3]" />

    <!-- ── the cards ── -->
    <g v-for="c in CARDS" :key="`card${c.vco}`">
      <rect :x="c.x" :y="c.y" :width="c.w" :height="c.h" rx="8" :fill="c.body" />
      <g :clip-path="`url(#b10-card${c.vco})`">
        <!-- its app bar -->
        <rect :x="c.x" :y="c.y" :width="c.w" :height="c.head" :fill="c.c" />
        <!-- the long shadows of everything on it -->
        <g opacity="0.16">
          <path v-for="(p, i) in shadows[c.vco]" :key="i" :d="p" :fill="c.sh" />
        </g>
        <!-- a band of its colour, faint, along the bottom -->
        <rect :x="c.x" :y="c.y + c.h - 6" :width="c.w" height="6" :fill="c.c" />
      </g>
      <!-- the app bar's title: its number in a disc, its name -->
      <g :transform="`translate(${c.x + 16} ${c.y + c.head / 2})`" font-family="'Roboto', 'Helvetica Neue', 'Avenir Next', 'Segoe UI', Arial, sans-serif">
        <circle cx="14" cy="0" r="14" :fill="c.ink" />
        <text x="14" y="5" text-anchor="middle" font-size="13" font-weight="700" :fill="c.c">{{ c.n }}</text>
        <text x="38" y="6" font-size="17" font-weight="500" letter-spacing="1.5" :fill="c.ink">{{ c.name }}</text>
        <text :x="c.w - 48" y="5" text-anchor="end" font-size="11" font-weight="500" letter-spacing="1.5" :fill="c.ink" opacity="0.75">VCO {{ c.vco + 1 }}</text>
      </g>
    </g>
    <!-- the side cards' menu dots, the scrubbers' captions -->
    <g v-for="c in [CARDS[0], CARDS[2]]" :key="`m${c.vco}`">
      <circle v-for="k in 3" :key="k" :cx="c.x + c.w - 18" :cy="c.y + 20 + k * 6" r="2.2" fill="#ffffff" />
      <text :x="c.x + 217" :y="322" text-anchor="middle" font-family="'Roboto', 'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="700" letter-spacing="2" fill="#90a4ae">POS</text>
      <line :x1="c.x + 24" :x2="c.x + c.w - 24" y1="414" y2="414" stroke="#eceff1" stroke-width="2" />
      <line :x1="c.x + 24" :x2="c.x + c.w - 24" y1="636" y2="636" stroke="#eceff1" stroke-width="2" />
    </g>
    <text x="609" y="733" text-anchor="middle" font-family="'Roboto', 'Helvetica Neue', Arial, sans-serif" font-size="9" font-weight="700" letter-spacing="2" fill="#90a4ae">POS</text>
    <!-- the amber card's FAB -->
    <g>
      <path :d="circleShadow(MID_FAB.x, MID_FAB.y, MID_FAB.r, 120)" fill="#000" opacity="0.12" clip-path="url(#b10-card1)" />
      <circle :cx="MID_FAB.x" :cy="MID_FAB.y" :r="MID_FAB.r" fill="#283593" />
      <path :d="`M ${MID_FAB.x - 9} ${MID_FAB.y} H ${MID_FAB.x + 9} M ${MID_FAB.x} ${MID_FAB.y - 9} V ${MID_FAB.y + 9}`" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" />
    </g>
  </g>
</template>
