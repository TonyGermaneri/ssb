<script setup lang="ts">
import type { Era } from '../../lib/voyage/ship'

/**
 * The NOUGHTIES ship's hull (lib/voyage/eras/e2000.ts): three jelly pods of translucent candy plastic -- a Bondi egg
 * at the bow, a lime orb in a brushed-aluminium bezel amidships, a tangerine pod at the stern -- each with a white
 * pinstriped pearl belly, a big specular gloss, a caustic glow and its ribs showing faintly through the shell. Chrome
 * caps carry the spinner and the turbine; a BETA sticker and a glossy name badge finish it. Static.
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

interface Pod {
  vco: number
  d: string
  cx: number
  cy: number
  rx: number
  ry: number
  /** where the pearl belly starts */
  belly: number
}
const PODS: Pod[] = [
  {
    vco: 0,
    d: 'M 180 0 C 180 -122 330 -190 500 -188 C 690 -186 800 -92 800 0 C 800 92 690 186 500 188 C 330 190 180 122 180 0 Z',
    cx: 490,
    cy: 0,
    rx: 310,
    ry: 188,
    belly: 66,
  },
  { vco: 1, d: 'M -260 0 A 250 215 0 1 1 240 0 A 250 215 0 1 1 -260 0 Z', cx: -10, cy: 0, rx: 250, ry: 215, belly: 70 },
  {
    vco: 2,
    d: 'M -720 5 C -720 -100 -600 -166 -460 -166 C -320 -166 -220 -92 -220 5 C -220 102 -320 176 -460 176 C -600 176 -720 110 -720 5 Z',
    cx: -470,
    cy: 5,
    rx: 250,
    ry: 171,
    belly: 66,
  },
]
/** drawn stern, bow, then the orb over both */
const ORDER = [PODS[2], PODS[0], PODS[1]]
const N = (n: number) => Array.from({ length: n }, (_, i) => i)
const star = (cx: number, cy: number, r0: number, r1: number, n: number) =>
  N(n * 2)
    .map((i) => {
      const a = (i * Math.PI) / n
      const r = i % 2 ? r1 : r0
      return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`
    })
    .join(' ')
/** ribs seen through the plastic: vertical arcs across a pod */
const ribs = (p: Pod) => N(5).map((i) => p.cx + (i - 2) * p.rx * 0.36)
const ALU = ['#f4f6f8', '#c9d0d7', '#eef1f4', '#aeb7c0', '#e3e7eb', '#bcc4cc', '#f7f8f9']
</script>

<template>
  <g class="hull">
    <defs>
      <linearGradient v-for="(p, i) in P" :id="`vy-2000-body${i}`" :key="`b${i}`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="mix(p.main, p.deep, 0.32)" />
        <stop offset="0.42" :stop-color="p.main" />
        <stop offset="0.8" :stop-color="mix(p.main, p.glow, 0.55)" />
      </linearGradient>
      <radialGradient v-for="(p, i) in P" :id="`vy-2000-caustic${i}`" :key="`c${i}`" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" :stop-color="p.glow" stop-opacity="0.85" />
        <stop offset="1" :stop-color="p.glow" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="vy-2000-spec" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.95" />
        <stop offset="0.55" stop-color="#fff" stop-opacity="0.28" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="vy-2000-pearl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.35" stop-color="#eef3f8" />
        <stop offset="1" stop-color="#b9c9d9" />
      </linearGradient>
      <linearGradient id="vy-2000-alu" x1="0" y1="0" x2="1" y2="1">
        <stop v-for="(c, i) in ALU" :key="i" :offset="i / (ALU.length - 1)" :stop-color="c" />
      </linearGradient>
      <linearGradient id="vy-2000-aluV" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.45" stop-color="#d5dbe1" />
        <stop offset="0.55" stop-color="#b3bdc7" />
        <stop offset="1" stop-color="#eef1f4" />
      </linearGradient>
      <radialGradient id="vy-2000-cap" cx="0.38" cy="0.32" r="0.75">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.5" stop-color="#cfd6dd" />
        <stop offset="1" stop-color="#8e9aa6" />
      </radialGradient>
      <pattern id="vy-2000-pin" patternUnits="userSpaceOnUse" width="8" height="5">
        <rect width="8" height="2" fill="#6f8aa6" opacity="0.09" />
      </pattern>
      <clipPath v-for="p in PODS" :id="`vy-2000-pod${p.vco}`" :key="`k${p.vco}`"><path :d="p.d" /></clipPath>
    </defs>

    <!-- chrome caps: the stern turbine's mount and the bow spinner's -->
    <ellipse cx="-700" cy="-3" rx="54" ry="104" fill="url(#vy-2000-aluV)" :stroke="ink" stroke-width="1.5" />
    <ellipse cx="-712" cy="-3" rx="26" ry="80" fill="url(#vy-2000-cap)" opacity="0.9" />
    <circle cx="772" cy="0" r="58" fill="url(#vy-2000-cap)" :stroke="ink" stroke-width="1.5" />

    <g v-for="p in ORDER" :key="p.vco">
      <path :d="p.d" :fill="`url(#vy-2000-body${p.vco})`" />
      <g :clip-path="`url(#vy-2000-pod${p.vco})`">
        <!-- ribs inside, through the plastic -->
        <ellipse v-for="x in ribs(p)" :key="x" :cx="x" :cy="p.cy" :rx="p.rx * 0.1" :ry="p.ry" fill="none" :stroke="P[p.vco].deep" stroke-width="10" opacity="0.1" />
        <ellipse :cx="p.cx" :cy="p.belly - 34" :rx="p.rx * 0.72" ry="62" :fill="`url(#vy-2000-caustic${p.vco})`" />
        <!-- the pearl belly, pinstriped, under a brushed seam -->
        <rect :x="p.cx - p.rx - 10" :y="p.belly" :width="p.rx * 2 + 20" height="260" fill="url(#vy-2000-pearl)" />
        <rect :x="p.cx - p.rx - 10" :y="p.belly" :width="p.rx * 2 + 20" height="260" fill="url(#vy-2000-pin)" />
        <rect :x="p.cx - p.rx - 10" :y="p.belly - 5" :width="p.rx * 2 + 20" height="9" fill="url(#vy-2000-aluV)" />
        <path :d="`M ${p.cx - p.rx} ${p.belly - 6} H ${p.cx + p.rx}`" :stroke="P[p.vco].deep" stroke-width="1" opacity="0.4" />
        <!-- the light coming back up through the bottom -->
        <ellipse :cx="p.cx" :cy="p.cy + p.ry + 10" :rx="p.rx * 0.8" ry="40" :fill="`url(#vy-2000-caustic${p.vco})`" opacity="0.6" />
        <path :d="p.d" fill="none" stroke="#fff" stroke-width="10" opacity="0.35" />
      </g>
      <path v-if="p.vco === 1" :d="p.d" fill="none" :stroke="ink" stroke-width="20" />
      <path v-if="p.vco === 1" :d="p.d" fill="none" stroke="url(#vy-2000-alu)" stroke-width="16" />
      <path :d="p.d" fill="none" :stroke="ink" stroke-width="1.6" />
      <!-- the gloss -->
      <ellipse :cx="p.cx - p.rx * 0.04" :cy="p.cy - p.ry * 0.56" :rx="p.rx * 0.8" :ry="p.ry * 0.38" fill="url(#vy-2000-spec)" />
      <ellipse :cx="p.cx - p.rx * 0.5" :cy="p.cy - p.ry * 0.62" :rx="p.rx * 0.12" :ry="p.ry * 0.07" fill="#fff" opacity="0.7" :transform="`rotate(-18 ${p.cx - p.rx * 0.5} ${p.cy - p.ry * 0.62})`" />
    </g>

    <!-- jelly buttons on the bow's shoulder -->
    <g v-for="(b, i) in [{ x: 652, y: -122 }, { x: 686, y: -104 }, { x: 716, y: -82 }]" :key="`j${i}`">
      <circle :cx="b.x" :cy="b.y" r="11" :fill="P[i].main" :stroke="ink" stroke-width="1.2" />
      <ellipse :cx="b.x" :cy="b.y - 4.5" rx="7.5" ry="4.5" fill="#fff" opacity="0.8" />
    </g>

    <!-- the BETA sticker -->
    <g transform="rotate(-14 668 104)">
      <polygon :points="star(668, 104, 46, 38, 16)" fill="#ff3d7f" :stroke="ink" stroke-width="1.4" stroke-linejoin="round" />
      <circle cx="668" cy="104" r="33" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="3 4" opacity="0.8" />
      <text x="668" y="112" text-anchor="middle" class="beta">BETA</text>
      <ellipse cx="668" cy="86" rx="28" ry="12" fill="#fff" opacity="0.3" />
    </g>

    <!-- the name badge, on the orb -->
    <g>
      <rect x="-128" y="-170" width="210" height="36" rx="18" fill="url(#vy-2000-pearl)" :stroke="ink" stroke-width="1.4" />
      <rect x="-122" y="-167" width="198" height="15" rx="8" fill="#fff" opacity="0.85" />
      <text x="-23" y="-145" text-anchor="middle" class="plate">AQUAPOD <tspan class="two">2.0</tspan></text>
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
