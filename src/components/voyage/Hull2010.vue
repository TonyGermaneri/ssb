<script setup lang="ts">
import type { Era, Part } from '../../lib/voyage/ship'

/**
 * The TENS ship's hull (lib/voyage/eras/e2010.ts): a flat capsule liner of three two-tone colour blocks parted by
 * clean gaps, an indigo app-bar bridge (hamburger, overflow dots, a floating action button straddling its edge), a
 * tidy grid of dots, and every part on it casting a flat 45° long shadow down-right across the hull -- worked out from
 * the parts' own rectangles, so they sit on it. No gradients. Static.
 */
const props = defineProps<{ era: Era }>()
const P = props.era.palettes
const ink = props.era.ink

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
const mix = (a: string, b: string, t: number) =>
  '#' +
  hex(a)
    .map((v, i) => Math.round(v + (hex(b)[i] - v) * t))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
const shade = (c: string, t = 0.2) => mix(c, '#000000', t)

const TOP = -150
const BOT = 170
/** where the light upper half meets the shaded lower */
const SPLIT = 62
const NOSE = { x: 600, y: 10, r: 160 }
const HULL = `M -650 ${TOP} L ${NOSE.x} ${TOP} A ${NOSE.r} ${NOSE.r} 0 0 1 ${NOSE.x} ${BOT} L -650 ${BOT} Q -700 ${BOT} -700 ${BOT - 50} L -700 ${TOP + 50} Q -700 ${TOP} -650 ${TOP} Z`
const CAB = { x0: -200, y0: -325, x1: 200, y1: TOP }
const CABIN = `M ${CAB.x0} ${CAB.y1} L ${CAB.x0} ${CAB.y0 + 22} Q ${CAB.x0} ${CAB.y0} ${CAB.x0 + 22} ${CAB.y0} L ${CAB.x1 - 22} ${CAB.y0} Q ${CAB.x1} ${CAB.y0} ${CAB.x1} ${CAB.y0 + 22} L ${CAB.x1} ${CAB.y1} Z`
const CUTS = [230, -230]
const sections = [
  { x0: CUTS[0], x1: 800 },
  { x0: CUTS[1], x1: CUTS[0] },
  { x0: -720, x1: CUTS[1] },
]
const INDIGO = '#3f51b5'
const CORAL = '#ff5252'
const GAP = props.era.sky.colors[0]

// ── long shadows: each part swept 45° down-right ──
const L = 700
const K = Math.SQRT1_2
const f = (v: number) => v.toFixed(1)
/** a rounded rectangle (corner radius r) swept: from its top-right tangent to its bottom-left */
function sweepRR(x0: number, y0: number, x1: number, y1: number, r: number) {
  r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2)
  const a = { x: x1 - r + r * K, y: y0 + r - r * K }
  const b = { x: x0 + r - r * K, y: y1 - r + r * K }
  return `M ${f(a.x)} ${f(a.y)} L ${f(a.x + L)} ${f(a.y + L)} L ${f(b.x + L)} ${f(b.y + L)} L ${f(b.x)} ${f(b.y)} Z `
}
/** an ellipse swept */
function sweepEl(cx: number, cy: number, rx: number, ry: number) {
  const s = Math.hypot(rx, ry)
  const a = { x: cx + (rx * rx) / s, y: cy - (ry * ry) / s }
  const b = { x: cx - (rx * rx) / s, y: cy + (ry * ry) / s }
  return `M ${f(a.x)} ${f(a.y)} L ${f(a.x + L)} ${f(a.y + L)} L ${f(b.x + L)} ${f(b.y + L)} L ${f(b.x)} ${f(b.y)} Z `
}
function shadowOf(p: Part): string {
  const [x0, y0, x1, y1] = p.rect
  const w = x1 - x0
  const h = y1 - y0
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  if (p.form === 'window') {
    if (p.variant === 'round') return sweepEl(cx, cy, w / 2, h / 2)
    const r = p.variant === 'screen' ? 5 : p.variant === 'panel' ? Math.min(18, h * 0.2) : h / 2
    return sweepRR(x0, y0, x1, y1, r)
  }
  if (p.form === 'rotor') {
    if (p.variant === 'ring') return sweepEl(cx, cy, w / 2, h / 2)
    const r = p.variant === 'wheel' || p.variant === 'turbine' ? Math.min(w, h) / 2 - 2 : Math.min(w, h) / 2 - 8
    return sweepEl(cx, cy, r, r)
  }
  if (p.form === 'vents') return p.variant === 'row' ? sweepRR(x0, cy - 18, x1, cy + 18, 18) : sweepRR(cx - 30, y0, cx + 30, y1, 30)
  if (p.form === 'dome') {
    if (p.variant === 'bubble') return sweepEl(cx, cy, w / 2, h / 2)
    const base = p.variant === 'down' ? y0 : y1
    return sweepRR(x0 - 14, base - 8, x1 + 14, base + 10, 8) + (p.variant === 'up' ? sweepEl(cx, y1, w / 2, h) : '')
  }
  return ''
}
const partShadows = props.era.parts.filter((p) => !p.back).map(shadowOf).join('')
const cabinShadow = sweepRR(CAB.x0, CAB.y0, CAB.x1, CAB.y1 + 1, 22)
const FAB = { x: 196, y: TOP, r: 26 }
const fabShadow = sweepEl(FAB.x, FAB.y, FAB.r, FAB.r)

const N = (n: number) => Array.from({ length: n }, (_, i) => i)
/** the dot grid on the light band, where it's clear */
const dots = [
  ...N(10).map((i) => ({ x: 270 + i * 32, y: -118, c: 0 })),
  ...N(4).map((i) => ({ x: -660 + i * 32, y: -118, c: 2 })),
  ...N(4).map((i) => ({ x: -370 + i * 32, y: -118, c: 2 })),
]
</script>

<template>
  <g class="hull">
    <defs>
      <clipPath id="vy-2010-hull"><path :d="HULL" /></clipPath>
      <clipPath id="vy-2010-cab"><path :d="CABIN" /></clipPath>
    </defs>

    <!-- the fuselage: three two-tone blocks -->
    <g clip-path="url(#vy-2010-hull)">
      <g v-for="(s, i) in sections" :key="i">
        <rect :x="s.x0" y="-200" :width="s.x1 - s.x0" :height="SPLIT + 200" :fill="P[i].main" />
        <rect :x="s.x0" :y="SPLIT" :width="s.x1 - s.x0" height="200" :fill="shade(P[i].main, 0.16)" />
      </g>
      <!-- the nose cap -->
      <path :d="`M ${NOSE.x + 10} ${TOP} A ${NOSE.r} ${NOSE.r} 0 0 1 ${NOSE.x + 10} ${BOT} Z`" :fill="mix(P[0].main, '#ffffff', 0.18)" />
      <path :d="`M ${NOSE.x + 10} ${SPLIT} H 800 V 300 H ${NOSE.x + 10} Z`" :fill="P[0].main" />
      <circle v-for="d in dots" :key="`${d.x}`" :cx="d.x" :cy="d.y" r="4" :fill="P[d.c].hi" opacity="0.55" />
      <text x="0" y="-116" text-anchor="middle" class="name" :fill="shade(P[1].main, 0.55)">LONG SHADOW</text>
      <g opacity="0.2">
        <path :d="partShadows + cabinShadow" fill="#000" />
      </g>
      <path :d="`M -720 ${SPLIT} H 800`" stroke="#fff" stroke-width="2" opacity="0.5" />
      <rect v-for="x in CUTS" :key="x" :x="x - 3" y="-200" width="6" height="400" :fill="GAP" />
    </g>

    <!-- the bridge: an app bar -->
    <path :d="CABIN" :fill="INDIGO" />
    <g clip-path="url(#vy-2010-cab)">
      <rect :x="CAB.x0" :y="CAB.y0" :width="CAB.x1 - CAB.x0" height="34" :fill="shade(INDIGO, 0.22)" />
      <rect :x="CAB.x0" y="-165" :width="CAB.x1 - CAB.x0" height="20" :fill="shade(INDIGO, 0.12)" />
      <g opacity="0.22"><path :d="partShadows" fill="#000" /></g>
    </g>
    <!-- hamburger and overflow -->
    <rect v-for="i in N(3)" :key="`h${i}`" :x="CAB.x0 + 14" :y="CAB.y0 + 9 + i * 6" width="22" height="3" rx="1.5" fill="#fff" />
    <circle v-for="i in N(3)" :key="`k${i}`" :cx="CAB.x1 - 18" :cy="CAB.y0 + 10 + i * 7" r="2.2" fill="#fff" />

    <!-- the floating action button, over the bridge's edge -->
    <g clip-path="url(#vy-2010-hull)" opacity="0.2"><path :d="fabShadow" fill="#000" /></g>
    <circle :cx="FAB.x" :cy="FAB.y" :r="FAB.r" :fill="CORAL" />
    <path :d="`M ${FAB.x - 10} ${FAB.y} H ${FAB.x + 10} M ${FAB.x} ${FAB.y - 10} V ${FAB.y + 10}`" stroke="#fff" stroke-width="4" stroke-linecap="round" />

    <path :d="HULL" fill="none" :stroke="ink" stroke-width="0.8" opacity="0.6" />
  </g>
</template>

<style scoped>
.name {
  font-family: 'Helvetica Neue', 'Avenir Next', sans-serif;
  font-size: 22px;
  font-weight: 300;
  letter-spacing: 7px;
}
</style>
