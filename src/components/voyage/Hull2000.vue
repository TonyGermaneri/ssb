<script setup lang="ts">
import type { Era, Part } from '../../lib/voyage/ship'

/**
 * The NOUGHTIES ship's hull (lib/voyage/eras/e2000.ts): one long jelly bean of translucent candy gel -- tangerine
 * at the stern, Bondi blue at the bow, deep at the top and glowing at the bottom where the light comes through, soft
 * innards and air bubbles suspended in it -- over a pearl-white pinstriped belly under a brushed seam, the Aqua
 * planet shining back off it. Amidships, the lime orb in a fat brushed-aluminium bezel; round every window a Bondi
 * jelly rim in an aluminium pill (the canopy the flight pod's own pill); aluminium caps on the spinner and turbine,
 * cups under the gumball domes, collars for everything standing on it; huge wet speculars, aqua pinstripes, a BETA
 * starburst and a glossy name plate. Static; no filters.
 */
const props = defineProps<{ era: Era }>()
const P = props.era.palettes
const ink = props.era.ink
const R = (id: string): Part['rect'] => props.era.parts.find((p) => p.id === id)?.rect ?? [0, 0, 0, 0]

const BEAN =
  'M 800 0 C 800 -112 712 -196 566 -204 C 400 -212 220 -192 0 -194 C -220 -196 -420 -210 -566 -200 C -712 -190 -776 -110 -776 0 C -776 110 -712 196 -566 204 C -420 212 -220 204 0 204 C 220 204 400 212 566 204 C 712 196 800 110 800 0 Z'
/** the gels: the light through them, top to bottom */
const GEL = [
  { id: 'blue', top: '#0b6fae', mid: '#0b86c8', main: '#1aaee6', glow: '#a6f4ff', deep: '#064a7a', hi: '#53cdf8' },
  { id: 'lime', top: '#4f8c06', mid: '#6fae0c', main: '#8acf1c', glow: '#ecffa6', deep: '#2c5404', hi: '#d4f75a' },
  { id: 'tang', top: '#c84a00', mid: '#e86a06', main: '#ff8a1a', glow: '#ffe2a0', deep: '#7a2c02', hi: '#ffbe5c' },
]
const ORB = { cx: -40, cy: -8, r: 232, bezel: 30 }
const BELLY = 92
/** soft innards seen through the gel */
const innards = [
  { x: 420, y: 100, w: 150, h: 60, r: 30, g: 0 },
  { x: 620, y: -150, w: 90, h: 90, r: 45, g: 0 },
  { x: 260, y: -170, w: 110, h: 50, r: 25, g: 0 },
  { x: -700, y: -110, w: 70, h: 120, r: 35, g: 2 },
  { x: -400, y: 70, w: 140, h: 50, r: 25, g: 2 },
  { x: -340, y: -180, w: 60, h: 60, r: 30, g: 2 },
]
/** air bubbles caught in the gel [x, y, r] */
const bubbles = [
  [300, -100, 9],
  [326, -70, 5],
  [610, -120, 6],
  [700, 70, 7],
  [660, 18, 4],
  [470, -180, 4],
  [250, 40, 6],
  [-300, -110, 8],
  [-280, -150, 4],
  [-700, 60, 6],
  [-610, -170, 5],
  [-660, 90, 4],
  [-320, 30, 5],
  [-150, 100, 5],
  [120, -150, 6],
  [150, 60, 4],
  [-200, -170, 4],
  [60, 140, 3.5],
]
const pad = (r: Part['rect'], p: number, rr: number) => ({ x: r[0] - p, y: r[1] - p, width: r[2] - r[0] + p * 2, height: r[3] - r[1] + p * 2, rx: rr + p, ry: rr + p })
const span = (a: Part['rect'], b: Part['rect']): Part['rect'] => [Math.min(a[0], b[0]), a[1], Math.max(a[2], b[2]), b[3]]
const canopy = R('0:perform')
const canopyG = R('0:garden')
const cap = R('2:perform')
const capG = R('2:garden')
const orbW = R('1:perform')
const orbG = R('1:garden')
const orbE = { cx: (orbW[0] + orbW[2]) / 2, cy: (orbW[1] + orbW[3]) / 2, rx: (orbW[2] - orbW[0]) / 2, ry: (orbW[3] - orbW[1]) / 2 }
const circ = (r: Part['rect']) => ({ cx: (r[0] + r[2]) / 2, cy: (r[1] + r[3]) / 2, r: Math.min(r[2] - r[0], r[3] - r[1]) / 2 })
const spinner = circ(R('0:grain'))
const turbine = circ(R('2:grain'))
const halo = R('1:grain')
const haloE = { cx: (halo[0] + halo[2]) / 2, cy: (halo[1] + halo[3]) / 2, rx: (halo[2] - halo[0]) / 2, ry: (halo[3] - halo[1]) / 2 }
/** the cups the gumball domes sit in */
const cups = (['0:fx', '1:fx', '2:fx'] as const).map((id) => {
  const r = R(id)
  const cx = (r[0] + r[2]) / 2
  const w = r[2] - r[0]
  return `M ${cx - w * 0.36} ${r[3] - 26} C ${cx - w * 0.34} ${r[3] - 4} ${cx - w * 0.26} ${r[3] + 10} ${cx - w * 0.22} ${r[3] + 16} L ${cx + w * 0.22} ${r[3] + 16} C ${cx + w * 0.26} ${r[3] + 10} ${cx + w * 0.34} ${r[3] - 4} ${cx + w * 0.36} ${r[3] - 26} Z`
})
/** gumballs inside each dome, seen through the glass */
const gumballs = (['0:fx', '1:fx', '2:fx'] as const).flatMap((id, k) => {
  const r = R(id)
  const cx = (r[0] + r[2]) / 2
  const cy = (r[1] + r[3]) / 2
  const w = r[2] - r[0]
  const h = r[3] - r[1]
  const cols = ['#1aaee6', '#8acf1c', '#ff8a1a', '#ff3d7f', '#ffffff', '#ffd23f']
  return [
    [-0.26, 0.2],
    [0, 0.26],
    [0.26, 0.2],
    [-0.13, 0.02],
    [0.13, 0.04],
    [0.02, -0.16],
  ].map(([dx, dy], i) => ({ x: cx + dx * w, y: cy + dy * h, r: Math.min(w, h) * 0.12, c: cols[(i + k * 2) % cols.length] }))
})
const vents = (['0:texture', '1:texture', '2:texture'] as const).map((id) => {
  const r = R(id)
  const column = props.era.parts.find((p) => p.id === id)?.variant === 'column'
  const cx = (r[0] + r[2]) / 2
  const cy = (r[1] + r[3]) / 2
  return column ? { x: cx - 38, y: r[1] - 8, w: 76, h: r[3] - r[1] + 16, r: 38 } : { x: r[0] - 8, y: cy - 26, w: r[2] - r[0] + 16, h: 52, r: 26 }
})
/** the collars of the things standing on it [x, y, w] */
const collars = [
  [670, -180, 34],
  [320, -198, 44],
  [191, -196, 104],
  [-245, -196, 40],
  [-356, -200, 30],
  [-665, -160, 50],
]
/** the bells' throats: [x, y, w] collars where they leave the gel */
const throats = (() => {
  const out: number[][] = []
  for (const [id, n] of [['0:pitch', 3], ['2:pitch', 2]] as const) {
    const r = R(id)
    const slot = (r[2] - r[0]) / n
    for (let i = 0; i < n; i++) out.push([r[0] + slot * (i + 0.5), Math.min(196, r[1] + 46), slot * 0.62])
  }
  return out
})()
const N = (n: number) => Array.from({ length: n }, (_, i) => i)
const burst = (r0: number, r1: number, n: number) =>
  N(n * 2)
    .map((i) => {
      const a = (i * Math.PI) / n
      const r = i % 2 ? r1 : r0
      return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`
    })
    .join(' ')
</script>

<template>
  <g class="hull">
    <defs>
      <clipPath id="h00-bean"><path :d="BEAN" /></clipPath>
      <clipPath id="h00-orb"><circle :cx="ORB.cx" :cy="ORB.cy" :r="ORB.r" /></clipPath>
      <template v-for="g in GEL" :key="g.id">
        <linearGradient :id="`h00-${g.id}`" gradientUnits="userSpaceOnUse" x1="0" y1="-210" x2="0" y2="210">
          <stop offset="0" :stop-color="g.top" />
          <stop offset="0.3" :stop-color="g.mid" />
          <stop offset="0.62" :stop-color="g.main" />
          <stop offset="0.9" :stop-color="g.hi" />
          <stop offset="1" :stop-color="g.glow" />
        </linearGradient>
        <radialGradient :id="`h00-${g.id}-pool`" cx="0.5" cy="1" r="0.75">
          <stop offset="0" :stop-color="g.glow" stop-opacity="0.95" />
          <stop offset="0.5" :stop-color="g.hi" stop-opacity="0.4" />
          <stop offset="1" :stop-color="g.hi" stop-opacity="0" />
        </radialGradient>
      </template>
      <radialGradient id="h00-orbgel" :cx="0.5" cy="0.62" r="0.62">
        <stop offset="0" stop-color="#ecffa6" />
        <stop offset="0.35" stop-color="#b6ea3a" />
        <stop offset="0.72" stop-color="#6fae0c" />
        <stop offset="1" stop-color="#2c5404" />
      </radialGradient>
      <linearGradient id="h00-pearl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.4" stop-color="#eef4f9" />
        <stop offset="0.8" stop-color="#d3e1ec" />
        <stop offset="1" stop-color="#b5c8d8" />
      </linearGradient>
      <radialGradient id="h00-planet" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#2f9cf0" stop-opacity="0.8" />
        <stop offset="0.55" stop-color="#7fd6ff" stop-opacity="0.4" />
        <stop offset="1" stop-color="#9fe9ff" stop-opacity="0" />
      </radialGradient>
      <pattern id="h00-pin" patternUnits="userSpaceOnUse" width="8" height="5">
        <rect width="8" height="2" fill="#6f9fc6" opacity="0.16" />
      </pattern>
      <linearGradient id="h00-gloss" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.97" />
        <stop offset="0.5" stop-color="#fff" stop-opacity="0.45" />
        <stop offset="1" stop-color="#fff" stop-opacity="0.12" />
      </linearGradient>
      <linearGradient id="h00-alu" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.22" stop-color="#b9c4ce" />
        <stop offset="0.45" stop-color="#f4f7fa" />
        <stop offset="0.62" stop-color="#97a5b2" />
        <stop offset="0.85" stop-color="#e8edf2" />
        <stop offset="1" stop-color="#7d8b98" />
      </linearGradient>
      <linearGradient id="h00-aluV" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.45" stop-color="#d5dbe1" />
        <stop offset="0.55" stop-color="#aeb9c4" />
        <stop offset="1" stop-color="#eef1f4" />
      </linearGradient>
      <linearGradient id="h00-rim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#8ae6ff" />
        <stop offset="0.5" stop-color="#1aaee6" />
        <stop offset="1" stop-color="#0b6fae" />
      </linearGradient>
      <linearGradient id="h00-rimT" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffd09a" />
        <stop offset="0.5" stop-color="#ff8a1a" />
        <stop offset="1" stop-color="#c84a00" />
      </linearGradient>
      <linearGradient id="h00-rimL" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e6ff9a" />
        <stop offset="0.5" stop-color="#8acf1c" />
        <stop offset="1" stop-color="#4f8c06" />
      </linearGradient>
      <radialGradient id="h00-cap" cx="0.38" cy="0.3" r="0.75">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.5" stop-color="#cfd6dd" />
        <stop offset="1" stop-color="#8e9aa6" />
      </radialGradient>
      <radialGradient id="h00-sticker" cx="0.4" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#ff9ab8" />
        <stop offset="0.5" stop-color="#ff2f6d" />
        <stop offset="1" stop-color="#b3003a" />
      </radialGradient>
      <radialGradient id="h00-bub" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#fff" stop-opacity="0.05" />
        <stop offset="0.75" stop-color="#fff" stop-opacity="0.2" />
        <stop offset="1" stop-color="#fff" stop-opacity="0.8" />
      </radialGradient>
      <radialGradient id="h00-gum" cx="0.35" cy="0.3" r="0.75">
        <stop offset="0" stop-color="#fff" stop-opacity="0.9" />
        <stop offset="0.3" stop-color="#fff" stop-opacity="0" />
        <stop offset="1" stop-color="#000" stop-opacity="0.25" />
      </radialGradient>
      <radialGradient id="h00-shade" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#0b2f73" stop-opacity="0.4" />
        <stop offset="1" stop-color="#0b2f73" stop-opacity="0" />
      </radialGradient>
    </defs>

    <!-- ── the aluminium tail cone and the turbine's cowl; the spinner's nose cap ── -->
    <path :d="`M -700 -120 C -760 -110 ${turbine.cx - 10} ${turbine.cy - turbine.r - 20} ${turbine.cx} ${turbine.cy - turbine.r - 12} L ${turbine.cx} ${turbine.cy + turbine.r + 12} C ${turbine.cx - 10} ${turbine.cy + turbine.r + 20} -760 110 -700 120 Z`" fill="url(#h00-aluV)" :stroke="ink" stroke-width="1.6" />
    <path :d="`M -700 -120 C -760 -110 ${turbine.cx - 10} ${turbine.cy - turbine.r - 20} ${turbine.cx} ${turbine.cy - turbine.r - 12} L ${turbine.cx} ${turbine.cy + turbine.r + 12} C ${turbine.cx - 10} ${turbine.cy + turbine.r + 20} -760 110 -700 120 Z`" fill="url(#tx-brushed)" opacity="0.4" style="mix-blend-mode: multiply" />
    <circle :cx="turbine.cx" :cy="turbine.cy" :r="turbine.r + 12" fill="url(#h00-alu)" :stroke="ink" stroke-width="1.6" />
    <circle :cx="turbine.cx" :cy="turbine.cy" :r="turbine.r + 4" fill="url(#h00-rimT)" :stroke="ink" stroke-width="1.2" />
    <path :d="`M 760 -70 C 800 -60 830 -30 832 -4 C 830 22 800 52 760 62 Z`" fill="url(#h00-aluV)" :stroke="ink" stroke-width="1.6" />
    <circle :cx="spinner.cx" :cy="spinner.cy" :r="spinner.r + 8" fill="url(#h00-alu)" :stroke="ink" stroke-width="1.6" />
    <circle :cx="spinner.cx" :cy="spinner.cy" :r="spinner.r" fill="url(#h00-rim)" :stroke="ink" stroke-width="1.2" />
    <circle :cx="spinner.cx" :cy="spinner.cy" :r="spinner.r - 6" fill="#effbff" opacity="0.6" />

    <!-- ── the bean: gel over a pearl belly ── -->
    <g clip-path="url(#h00-bean)">
      <rect x="-800" y="-230" width="760" height="460" fill="url(#h00-tang)" />
      <rect x="-40" y="-230" width="860" height="460" fill="url(#h00-blue)" />
      <!-- the innards, soft through the gel -->
      <rect v-for="(n, i) in innards" :key="`in${i}`" :x="n.x" :y="n.y" :width="n.w" :height="n.h" :rx="n.r" :fill="GEL[n.g].deep" opacity="0.2" />
      <rect v-for="(n, i) in innards" :key="`ih${i}`" :x="n.x + 6" :y="n.y + 4" :width="n.w - 12" :height="n.h * 0.3" :rx="n.r * 0.6" fill="#fff" opacity="0.12" />
      <!-- the light pooled at the bottom of the gel -->
      <ellipse cx="520" :cy="BELLY" rx="320" ry="110" fill="url(#h00-blue-pool)" style="mix-blend-mode: screen" />
      <ellipse cx="-520" :cy="BELLY" rx="300" ry="110" fill="url(#h00-tang-pool)" style="mix-blend-mode: screen" />
      <!-- aqua pinstripes along the flank -->
      <path :d="`M -800 ${BELLY - 16} C -400 ${BELLY - 2} 400 ${BELLY - 2} 820 ${BELLY - 20}`" fill="none" stroke="#d8fbff" stroke-width="3" opacity="0.85" />
      <path :d="`M -800 ${BELLY - 24} C -400 ${BELLY - 10} 400 ${BELLY - 10} 820 ${BELLY - 28}`" fill="none" stroke="#d8fbff" stroke-width="1.4" opacity="0.7" />
      <!-- bubbles caught in the gel -->
      <g v-for="(b, i) in bubbles" :key="`bb${i}`">
        <circle :cx="b[0]" :cy="b[1]" :r="b[2]" fill="url(#h00-bub)" />
        <circle :cx="b[0] - b[2] * 0.35" :cy="b[1] - b[2] * 0.35" :r="b[2] * 0.3" fill="#fff" opacity="0.9" />
      </g>
      <!-- the pearl belly, pinstriped, under a brushed seam; the planet shining back off it -->
      <path :d="`M -800 ${BELLY} C -400 ${BELLY + 14} 400 ${BELLY + 14} 820 ${BELLY - 4} L 820 240 L -800 240 Z`" fill="url(#h00-pearl)" />
      <path :d="`M -800 ${BELLY} C -400 ${BELLY + 14} 400 ${BELLY + 14} 820 ${BELLY - 4} L 820 240 L -800 240 Z`" fill="url(#h00-pin)" />
      <ellipse cx="0" cy="236" rx="860" ry="96" fill="url(#h00-planet)" />
      <path d="M -720 150 C -400 192 400 192 740 140" fill="none" stroke="#ffffff" stroke-width="6" opacity="0.8" />
      <path d="M -700 188 C -300 214 300 214 720 182" fill="none" stroke="#9fe9ff" stroke-width="5" opacity="0.9" />
      <path :d="`M -800 ${BELLY} C -400 ${BELLY + 14} 400 ${BELLY + 14} 820 ${BELLY - 4}`" fill="none" :stroke="ink" stroke-width="12" opacity="0.18" transform="translate(0 4)" />
      <path :d="`M -800 ${BELLY} C -400 ${BELLY + 14} 400 ${BELLY + 14} 820 ${BELLY - 4}`" fill="none" stroke="url(#h00-aluV)" stroke-width="10" />
      <path :d="`M -800 ${BELLY - 3} C -400 ${BELLY + 11} 400 ${BELLY + 11} 820 ${BELLY - 7}`" fill="none" stroke="#fff" stroke-width="2" />
      <!-- light through the edge of the gel -->
      <path :d="BEAN" fill="none" stroke="#fff" stroke-width="12" opacity="0.4" />
      <!-- the huge wet gloss across the top -->
      <path d="M -720 -110 C -700 -176 -620 -190 -480 -192 C -300 -194 -200 -184 -40 -182 C 160 -180 380 -198 560 -192 C 690 -186 760 -130 766 -90 C 700 -100 640 -104 560 -104 C 380 -104 160 -96 -40 -96 C -200 -96 -340 -100 -480 -100 C -600 -100 -680 -100 -720 -110 Z" fill="url(#h00-gloss)" />
      <ellipse cx="-600" cy="-156" rx="70" ry="16" fill="#fff" opacity="0.85" transform="rotate(-8 -600 -156)" />
      <ellipse cx="690" cy="-150" rx="40" ry="10" fill="#fff" opacity="0.8" transform="rotate(24 690 -150)" />
    </g>
    <path :d="BEAN" fill="none" :stroke="ink" stroke-width="1.8" />

    <!-- ── collars for everything standing on the bean, cups for the gumball domes ── -->
    <g v-for="(c, i) in collars" :key="`co${i}`">
      <rect :x="c[0] - c[2] / 2" :y="c[1] - 9" :width="c[2]" height="18" rx="9" fill="url(#h00-aluV)" :stroke="ink" stroke-width="1.2" />
      <rect :x="c[0] - c[2] / 2 + 4" :y="c[1] - 7" :width="c[2] - 8" height="5" rx="2.5" fill="#fff" opacity="0.9" />
    </g>
    <g v-for="(d, i) in cups" :key="`cu${i}`">
      <path :d="d" fill="url(#h00-aluV)" :stroke="ink" stroke-width="1.4" />
      <path :d="d" fill="url(#tx-brushed)" opacity="0.35" style="mix-blend-mode: multiply" />
    </g>
    <g v-for="(g, i) in gumballs" :key="`gb${i}`">
      <circle :cx="g.x" :cy="g.y" :r="g.r" :fill="g.c" />
      <circle :cx="g.x" :cy="g.y" :r="g.r" fill="url(#h00-gum)" />
    </g>

    <!-- ── the bells' throat collars (the bells hang behind the bean) ── -->
    <g v-for="(t, i) in throats" :key="`th${i}`">
      <rect :x="t[0] - t[2] / 2" :y="t[1] - 8" :width="t[2]" height="16" rx="8" fill="url(#h00-aluV)" :stroke="ink" stroke-width="1.2" />
    </g>

    <!-- ── the lime orb, in its brushed-aluminium bezel ── -->
    <circle :cx="ORB.cx + 6" :cy="ORB.cy + 14" :r="ORB.r + ORB.bezel + 6" fill="url(#h00-shade)" />
    <circle :cx="ORB.cx" :cy="ORB.cy" :r="ORB.r" fill="url(#h00-orbgel)" />
    <g clip-path="url(#h00-orb)">
      <circle :cx="ORB.cx" :cy="ORB.cy + ORB.r * 0.9" :r="ORB.r * 0.7" fill="url(#h00-lime-pool)" style="mix-blend-mode: screen" />
      <circle v-for="k in N(4)" :key="`or${k}`" :cx="ORB.cx" :cy="ORB.cy" :r="ORB.r * (0.5 + k * 0.14)" fill="none" stroke="#2c5404" stroke-width="2" opacity="0.12" />
      <g v-for="(b, i) in [[-200, -40, 7], [-180, 60, 4], [100, -120, 6], [120, 60, 5], [-120, -170, 4], [40, 170, 5]]" :key="`ob${i}`">
        <circle :cx="b[0]" :cy="b[1]" :r="b[2]" fill="url(#h00-bub)" />
        <circle :cx="b[0] - b[2] * 0.35" :cy="b[1] - b[2] * 0.35" :r="b[2] * 0.3" fill="#fff" opacity="0.9" />
      </g>
      <path :d="`M ${ORB.cx - ORB.r} ${ORB.cy} A ${ORB.r} ${ORB.r * 0.5} 0 0 1 ${ORB.cx + ORB.r} ${ORB.cy}`" fill="none" stroke="#f0ffd0" stroke-width="2" opacity="0.45" transform="translate(0 -60)" />
    </g>
    <circle :cx="ORB.cx" :cy="ORB.cy" :r="ORB.r + ORB.bezel / 2" fill="none" :stroke="ink" :stroke-width="ORB.bezel + 3" />
    <circle :cx="ORB.cx" :cy="ORB.cy" :r="ORB.r + ORB.bezel / 2" fill="none" stroke="url(#h00-alu)" :stroke-width="ORB.bezel" />
    <circle :cx="ORB.cx" :cy="ORB.cy" :r="ORB.r + ORB.bezel / 2" fill="none" stroke="url(#tx-brushed)" :stroke-width="ORB.bezel" opacity="0.5" style="mix-blend-mode: multiply" />
    <circle :cx="ORB.cx" :cy="ORB.cy" :r="ORB.r + 3" fill="none" stroke="#fff" stroke-width="2" opacity="0.8" />
    <path :d="`M ${ORB.cx - ORB.r - 22} ${ORB.cy + 20} A ${ORB.r + 22} ${ORB.r + 22} 0 0 1 ${ORB.cx + 40} ${ORB.cy - ORB.r - 20}`" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.9" />
    <circle v-for="(a, i) in [-150, -30, 30, 150]" :key="`led${i}`" :cx="ORB.cx + Math.cos((a * Math.PI) / 180) * (ORB.r + ORB.bezel / 2)" :cy="ORB.cy + Math.sin((a * Math.PI) / 180) * (ORB.r + ORB.bezel / 2)" r="6" :fill="P[i % 3].main" :stroke="ink" stroke-width="1" />

    <!-- ── the window wells: Bondi jelly rims in aluminium pills ── -->
    <template v-for="(w, i) in [{ win: canopy, g: canopyG, rim: 'h00-rim' }, { win: cap, g: capG, rim: 'h00-rimT' }]" :key="`ww${i}`">
      <rect v-bind="pad(span(w.win, w.g), 20, (w.win[3] - w.win[1]) / 2)" :fill="ink" opacity="0.18" transform="translate(4 8)" />
      <rect v-bind="pad(span(w.win, w.g), 18, (w.win[3] - w.win[1]) / 2)" fill="url(#h00-aluV)" :stroke="ink" stroke-width="1.4" />
      <rect v-bind="pad(span(w.win, w.g), 18, (w.win[3] - w.win[1]) / 2)" fill="url(#tx-brushed)" opacity="0.35" style="mix-blend-mode: multiply" />
      <rect v-bind="pad(w.g, 7, (w.g[3] - w.g[1]) / 2)" fill="url(#h00-pearl)" :stroke="ink" stroke-width="1" />
      <rect v-bind="pad(w.win, 10, (w.win[3] - w.win[1]) / 2)" :fill="`url(#${w.rim})`" :stroke="ink" stroke-width="1.2" />
      <rect v-bind="pad(w.win, 7, (w.win[3] - w.win[1]) / 2)" fill="none" stroke="#fff" stroke-width="2" opacity="0.7" />
    </template>
    <!-- the orb's window -->
    <ellipse :cx="orbE.cx" :cy="orbE.cy" :rx="orbE.rx + 14" :ry="orbE.ry + 14" fill="url(#h00-alu)" :stroke="ink" stroke-width="1.4" />
    <ellipse :cx="orbE.cx" :cy="orbE.cy" :rx="orbE.rx + 7" :ry="orbE.ry + 7" fill="url(#h00-rimL)" :stroke="ink" stroke-width="1.2" />
    <rect v-bind="pad(orbG, 7, (orbG[3] - orbG[1]) / 2)" fill="url(#h00-pearl)" :stroke="ink" stroke-width="1" />
    <!-- the halo's track -->
    <ellipse :cx="haloE.cx" :cy="haloE.cy" :rx="haloE.rx + 8" :ry="haloE.ry + 8" fill="none" stroke="url(#h00-aluV)" stroke-width="10" />
    <ellipse :cx="haloE.cx" :cy="haloE.cy" :rx="haloE.rx + 8" :ry="haloE.ry + 8" fill="none" :stroke="ink" stroke-width="1" />

    <!-- ── the vents' pearl wells ── -->
    <g v-for="(v, i) in vents" :key="`vw${i}`">
      <rect :x="v.x" :y="v.y" :width="v.w" :height="v.h" :rx="v.r" fill="url(#h00-pearl)" :stroke="ink" stroke-width="1.2" />
      <rect :x="v.x + 4" :y="v.y + 3" :width="v.w - 8" :height="Math.min(v.h, v.w) * 0.3" :rx="v.r * 0.7" fill="#fff" opacity="0.9" />
    </g>

    <!-- ── the BETA starburst ── -->
    <g transform="translate(700 104) rotate(-14)">
      <polygon :points="burst(46, 38, 16)" fill="url(#h00-sticker)" :stroke="ink" stroke-width="1.2" stroke-linejoin="round" />
      <circle r="33" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="3 4" opacity="0.8" />
      <text x="0" y="8" text-anchor="middle" class="beta">BETA</text>
      <ellipse cx="-4" cy="-18" rx="28" ry="12" fill="#fff" opacity="0.35" />
    </g>

    <!-- ── the name plate, on the pearl belly ── -->
    <g transform="translate(-470 152)">
      <rect x="-104" y="-19" width="208" height="38" rx="19" fill="url(#h00-pearl)" :stroke="ink" stroke-width="1.2" />
      <rect x="-98" y="-16" width="196" height="15" rx="8" fill="#fff" opacity="0.9" />
      <text x="0" y="7" text-anchor="middle" class="plate">AQUAPOD <tspan class="two">2.0</tspan></text>
    </g>
  </g>
</template>

<style scoped>
.beta {
  font-family: 'Helvetica Neue', 'Lucida Grande', sans-serif;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 1px;
  fill: #fff;
  font-style: italic;
}
.plate {
  font-family: 'Lucida Grande', 'Helvetica Neue', sans-serif;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 2px;
  fill: #1c3b5a;
}
.two {
  fill: #1aaee6;
}
</style>
