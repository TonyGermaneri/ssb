<script setup lang="ts">
import { computed } from 'vue'
import type { Era, Part } from '../../lib/voyage/ship'

/**
 * The EIGHTIES ship's detail over its parts (lib/voyage/eras/e1980.ts): white-hot afterburner cores with magenta
 * plumes, the photon pods' and retro jets' glowing mouths, chrome lips on every nozzle, neon rings round the
 * turbines, a scanline sheen on the screens. Never takes the pointer, never hides a moving bit.
 */
const props = defineProps<{ era: Era }>()
const N = (n: number) => Array.from({ length: n }, (_, i) => i)
const byId = (id: string) => props.era.parts.find((p) => p.id === id) as Part
const rad = (d: number) => (d * Math.PI) / 180

/** the same nozzles VoyageShip.vue draws for a part of bells: each one's frame, its length, its mouth */
function bells(p: Part) {
  const n = Math.max(1, p.n)
  const dx = Math.cos(rad(p.dir))
  const dy = Math.sin(rad(p.dir))
  const vertical = Math.abs(dy) >= Math.abs(dx)
  const W = p.rect[2] - p.rect[0]
  const H = p.rect[3] - p.rect[1]
  const across = vertical ? W : H
  const L = vertical ? H : W
  const slot = across / n
  return N(n).map((i) => {
    const c = slot * (i + 0.5)
    const x = vertical ? p.rect[0] + c : dx > 0 ? p.rect[0] : p.rect[2]
    const y = vertical ? (dy > 0 ? p.rect[1] : p.rect[3]) : p.rect[1] + c
    return { t: `translate(${x} ${y}) rotate(${p.dir - 90})`, L: L - 6, mw: slot * 0.92, tw: slot * 0.42 }
  })
}
const burners = computed(() => bells(byId('2:pitch')))
const jets = computed(() => [...bells(byId('1:pitch')), ...bells(byId('0:pitch'))])
const turbines = computed(() =>
  ['0:grain', '1:grain', '2:grain'].map((id) => {
    const p = byId(id)
    return { cx: (p.rect[0] + p.rect[2]) / 2, cy: (p.rect[1] + p.rect[3]) / 2, r: Math.min(p.rect[2] - p.rect[0], p.rect[3] - p.rect[1]) / 2 - 2, c: props.era.palettes[p.vco].alt }
  }),
)
const screens = computed(() =>
  ['0:perform', '1:perform', '2:perform'].map((id) => {
    const [x0, y0, x1, y1] = byId(id).rect
    return { x0, y0, x1, y1 }
  }),
)
/** VoyageShip.vue's fin outline, with its trailing edge at `mid` (-1..1) */
function finPath(p: Part, mid: number): string {
  const [x0, y0, x1, y1] = p.rect
  const W = x1 - x0
  const H = y1 - y0
  const X = (n: number) => n * Math.min(1.6, W / 200)
  const Y = (n: number) => n * Math.min(1.6, H / 150)
  const b = mid * 22 * Math.min(W / 200, H / 150, 1.2)
  if (p.variant === 'wing')
    return `M ${x1 - X(10)} ${y0 + Y(20)} C ${x1 + X(6)} ${y0 + Y(80)} ${x1 - X(20) + b} ${y1 - Y(40)} ${x0 + X(30)} ${y1 - Y(6)} C ${x0 + X(6)} ${y1 - Y(30)} ${x0 + X(20) - b} ${y0 + Y(90)} ${x0 + X(40)} ${y0 + Y(10)} Z`
  if (p.variant === 'keel')
    return `M ${x0 + X(10)} ${y0} L ${x1 - X(6)} ${y0} C ${x1 - X(30)} ${y0 + Y(50) + b} ${x1 - X(50)} ${y1 - Y(30)} ${x1 - X(90)} ${y1} L ${x0 + X(70)} ${y1 - Y(10)} C ${x0 + X(40)} ${y1 - Y(50) - b} ${x0 + X(20)} ${y0 + Y(50)} ${x0 + X(10)} ${y0} Z`
  if (p.variant === 'delta') return `M ${x0 + X(8)} ${y0} L ${x1 - X(4)} ${y0} C ${x1 - X(20) + b} ${y0 + H * 0.45} ${x0 + W * 0.4} ${y1 - Y(10)} ${x0 + X(6)} ${y1} C ${x0 + X(14) - b} ${y0 + H * 0.6} ${x0 + X(10)} ${y0 + Y(30)} ${x0 + X(8)} ${y0} Z`
  return `M ${x1 - X(8)} ${y0} L ${x0 + X(60)} ${y0 + Y(10)} C ${x0 + X(20)} ${y0 + Y(60) + b} ${x0} ${y1 - Y(30)} ${x0 + X(10)} ${y1} L ${x1 - X(60)} ${y1 - Y(30)} C ${x1 - X(30) + b} ${y1 - Y(80)} ${x1 - X(10)} ${y0 + Y(60)} ${x1 - X(8)} ${y0} Z`
}
const fins = computed(() =>
  props.era.parts
    .filter((p) => p.form === 'fin')
    .map((p) => ({ flip: p.flip === 'y', t: p.flip === 'y' ? `translate(0 ${p.rect[1] + p.rect[3]}) scale(1 -1)` : p.flip === 'x' ? `translate(${p.rect[0] + p.rect[2]} 0) scale(-1 1)` : '', id: p.id.replace(':', '-'), lo: finPath(p, -1), hi: finPath(p, 1), rest: finPath(p, 0), x: p.rect[0] - 10, y: p.rect[1] - 10, w: p.rect[2] - p.rect[0] + 20, h: p.rect[3] - p.rect[1] + 20 })),
)
</script>

<template>
  <g class="overlay">
    <defs>
      <radialGradient id="o80-core" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.25" stop-color="#ffe6fb" stop-opacity="0.9" />
        <stop offset="0.55" stop-color="#ff2bd6" stop-opacity="0.45" />
        <stop offset="1" stop-color="#a462ff" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="o80-plume" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffe6fb" stop-opacity="0.85" />
        <stop offset="0.25" stop-color="#ff2bd6" stop-opacity="0.5" />
        <stop offset="1" stop-color="#a462ff" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="o80-sheen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.16" />
        <stop offset="0.35" stop-color="#fff" stop-opacity="0" />
        <stop offset="1" stop-color="#ff2bd6" stop-opacity="0.08" />
      </linearGradient>
      <pattern id="o80-fingrid" patternUnits="userSpaceOnUse" width="24" height="24" patternTransform="skewX(-30)">
        <path d="M 0 0 H 24 M 0 0 V 24" fill="none" stroke="#3df2ff" stroke-width="0.8" opacity="0.45" />
      </pattern>
      <linearGradient id="o80-finshade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000" stop-opacity="0.65" />
        <stop offset="0.5" stop-color="#000" stop-opacity="0.15" />
        <stop offset="1" stop-color="#ff2e7e" stop-opacity="0.35" />
      </linearGradient>
      <linearGradient id="o80-finshadeUp" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#000" stop-opacity="0.65" />
        <stop offset="0.5" stop-color="#000" stop-opacity="0.15" />
        <stop offset="1" stop-color="#3df2ff" stop-opacity="0.3" />
      </linearGradient>
      <linearGradient id="o80-bell" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#000" stop-opacity="0.55" />
        <stop offset="0.35" stop-color="#fff" stop-opacity="0.25" />
        <stop offset="0.55" stop-color="#000" stop-opacity="0" />
        <stop offset="1" stop-color="#000" stop-opacity="0.6" />
      </linearGradient>
    </defs>

    <!-- the fins: a laser grid etched on them, dark at the root (inside the fin however it flexes) -->
    <g v-for="f in fins" :key="f.id" :transform="f.t">
      <clipPath :id="`o80-fa-${f.id}`"><path :d="f.lo" /></clipPath>
      <clipPath :id="`o80-fb-${f.id}`"><path :d="f.hi" /></clipPath>
      <g :clip-path="`url(#o80-fa-${f.id})`">
        <g :clip-path="`url(#o80-fb-${f.id})`">
          <rect :x="f.x" :y="f.y" :width="f.w" :height="f.h" fill="url(#o80-fingrid)" />
          <rect :x="f.x" :y="f.y" :width="f.w" :height="f.h" fill="url(#o80-finshade)" />
        </g>
      </g>
    </g>

    <!-- the afterburners: a chrome-shaded bell, a white-hot core, a magenta plume streaming aft -->
    <g v-for="(b, i) in burners" :key="`ab${i}`" :transform="b.t">
      <path :d="`M ${-b.tw / 2} 0 C ${-b.tw / 2} ${b.L * 0.5} ${-b.mw / 2} ${b.L * 0.7} ${-b.mw / 2} ${b.L} L ${b.mw / 2} ${b.L} C ${b.mw / 2} ${b.L * 0.7} ${b.tw / 2} ${b.L * 0.5} ${b.tw / 2} 0 Z`" fill="url(#o80-bell)" />
      <path :d="`M ${-b.mw * 0.42} ${b.L} L ${b.mw * 0.42} ${b.L} L ${b.mw * 0.12} ${b.L + 70} L ${-b.mw * 0.12} ${b.L + 70} Z`" fill="url(#o80-plume)" style="mix-blend-mode: screen" />
      <ellipse cx="0" :cy="b.L + 4" :rx="b.mw * 0.48" :ry="b.mw * 0.2" fill="url(#o80-core)" style="mix-blend-mode: screen" />
      <ellipse cx="0" :cy="b.L" :rx="b.mw * 0.46" :ry="Math.max(4, b.mw * 0.14)" fill="none" stroke="#e8fbff" stroke-width="1.6" />
    </g>
    <!-- the pods' and jets' mouths -->
    <g v-for="(b, i) in jets" :key="`j${i}`" :transform="b.t">
      <path :d="`M ${-b.tw / 2} 0 C ${-b.tw / 2} ${b.L * 0.5} ${-b.mw / 2} ${b.L * 0.7} ${-b.mw / 2} ${b.L} L ${b.mw / 2} ${b.L} C ${b.mw / 2} ${b.L * 0.7} ${b.tw / 2} ${b.L * 0.5} ${b.tw / 2} 0 Z`" fill="url(#o80-bell)" />
      <ellipse cx="0" :cy="b.L + 2" :rx="b.mw * 0.5" :ry="b.mw * 0.24" fill="url(#o80-core)" opacity="0.8" style="mix-blend-mode: screen" />
    </g>
    <!-- the turbines: a neon ring inside the lip, a chrome glint -->
    <g v-for="(t, i) in turbines" :key="`t${i}`">
      <circle :cx="t.cx" :cy="t.cy" :r="t.r - 1" fill="none" :stroke="t.c" stroke-width="2" opacity="0.9" />
      <path :d="`M ${t.cx - t.r * 0.82} ${t.cy - t.r * 0.42} A ${t.r * 0.92} ${t.r * 0.92} 0 0 1 ${t.cx + t.r * 0.5} ${t.cy - t.r * 0.8}`" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity="0.55" />
    </g>
    <!-- a sheen on the screens -->
    <rect v-for="(s, i) in screens" :key="`s${i}`" :x="s.x0" :y="s.y0" :width="s.x1 - s.x0" :height="s.y1 - s.y0 - 50" rx="5" fill="url(#o80-sheen)" />
  </g>
</template>
