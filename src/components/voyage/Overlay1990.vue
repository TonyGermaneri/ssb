<script setup lang="ts">
import type { Era, Part } from '../../lib/voyage/ship'

/**
 * The NINETIES ship's top coat (drawn over its parts, never in the pointer's way): the bolts round the canopy's torus
 * and the windows' bezels, hard ray-traced glare across the glass (thin, so the clips and their playheads show
 * through), and lens-flare glints where the chrome catches the sky.
 */
const props = defineProps<{ era: Era }>()
const ink = props.era.ink
const R = (id: string): Part['rect'] => props.era.parts.find((p) => p.id === id)?.rect ?? [0, 0, 0, 0]
const canopy = R('0:fx')
const can = { cx: (canopy[0] + canopy[2]) / 2, cy: (canopy[1] + canopy[3]) / 2, rx: (canopy[2] - canopy[0]) / 2 + 15, ry: (canopy[3] - canopy[1]) / 2 + 15 }
const canopyBolts = Array.from({ length: 12 }, (_, i) => {
  const a = Math.PI + (i / 11) * Math.PI * 1.02 - 0.01
  return { x: can.cx + Math.cos(a) * can.rx, y: can.cy + Math.sin(a) * can.ry }
}).filter((b) => b.y < can.cy + 20)
const rear = R('2:perform')
const rearE = { cx: (rear[0] + rear[2]) / 2, cy: (rear[1] + rear[3]) / 2, rx: (rear[2] - rear[0]) / 2 + 15, ry: (rear[3] - rear[1]) / 2 + 15 }
const rearBolts = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2 + 0.3
  return { x: rearE.cx + Math.cos(a) * rearE.rx, y: rearE.cy + Math.sin(a) * rearE.ry }
}).filter((b) => b.y < rearE.cy + 30)
/** a window's glare: two hard diagonal bands across its top-left, kept thin */
function glare(r: Part['rect']) {
  const [x0, y0, x1, y1] = r
  const w = x1 - x0
  const h = y1 - y0
  const a = `M ${x0 + w * 0.1} ${y0 + h * 0.08} L ${x0 + w * 0.2} ${y0 + h * 0.08} L ${x0 + w * 0.12} ${y0 + h * 0.62} L ${x0 + w * 0.05} ${y0 + h * 0.5} Z`
  const b = `M ${x0 + w * 0.24} ${y0 + h * 0.08} L ${x0 + w * 0.27} ${y0 + h * 0.08} L ${x0 + w * 0.19} ${y0 + h * 0.7} L ${x0 + w * 0.16} ${y0 + h * 0.7} Z`
  return [a, b]
}
const windows = ['0:perform', '1:perform', '2:perform'].map(R)
const visor = R('0:perform')
/** lens glints: four-point stars where the chrome catches the light */
const glints = [
  { x: can.cx - can.rx * 0.7, y: can.cy - can.ry * 0.72, s: 1.2 },
  { x: -560, y: -200, s: 0.9 },
  { x: 250, y: -224, s: 0.8 },
  { x: 700, y: -130, s: 0.7 },
  { x: -770, y: -130, s: 1 },
  { x: -690, y: 82, s: 0.7 },
]
const star = (s: number) => `M 0 ${-26 * s} L ${4 * s} ${-4 * s} L ${26 * s} 0 L ${4 * s} ${4 * s} L 0 ${26 * s} L ${-4 * s} ${4 * s} L ${-26 * s} 0 L ${-4 * s} ${-4 * s} Z`
</script>

<template>
  <g class="overlay1990">
    <defs>
      <radialGradient id="o90-bolt" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#ffffff" />
        <stop offset="0.35" stop-color="#c8d8ff" />
        <stop offset="0.7" stop-color="#4a3a98" />
        <stop offset="1" stop-color="#140a38" />
      </radialGradient>
      <radialGradient id="o90-flare" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.9" />
        <stop offset="0.3" stop-color="#bfffff" stop-opacity="0.35" />
        <stop offset="1" stop-color="#7ef9ff" stop-opacity="0" />
      </radialGradient>
    </defs>

    <!-- bolts round the canopy's torus and the rear porthole -->
    <circle v-for="(b, i) in [...canopyBolts, ...rearBolts]" :key="`b${i}`" :cx="b.x" :cy="b.y" r="6.5" fill="url(#o90-bolt)" :stroke="ink" stroke-width="1.6" />

    <!-- hard glare across the glass -->
    <g style="mix-blend-mode: screen">
      <template v-for="(r, i) in windows" :key="`g${i}`">
        <path v-for="(d, k) in glare(r)" :key="k" :d="d" fill="#ffffff" :opacity="k ? 0.22 : 0.16" />
      </template>
      <path :d="`M ${visor[0] + 40} ${visor[1] + 10} C ${visor[0] + 100} ${visor[1] + 2} ${visor[2] - 100} ${visor[1] + 2} ${visor[2] - 40} ${visor[1] + 10}`" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.5" />
      <path :d="`M ${can.cx - can.rx * 0.62} ${can.cy - can.ry * 0.1} C ${can.cx - can.rx * 0.6} ${can.cy - can.ry * 0.5} ${can.cx - can.rx * 0.3} ${can.cy - can.ry * 0.68} ${can.cx} ${can.cy - can.ry * 0.72}`" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.6" />
      <path :d="`M ${can.cx + can.rx * 0.5} ${can.cy + can.ry * 0.2} C ${can.cx + can.rx * 0.56} ${can.cy} ${can.cx + can.rx * 0.54} ${can.cy - can.ry * 0.2} ${can.cx + can.rx * 0.46} ${can.cy - can.ry * 0.34}`" fill="none" stroke="#bff" stroke-width="3" stroke-linecap="round" opacity="0.5" />
      <!-- the glints -->
      <g v-for="(g, i) in glints" :key="`l${i}`" :transform="`translate(${g.x} ${g.y})`">
        <circle :r="30 * g.s" fill="url(#o90-flare)" />
        <path :d="star(g.s)" fill="#fff" opacity="0.95" />
      </g>
    </g>
  </g>
</template>
