<script setup lang="ts">
import type { Era, Part } from '../../lib/voyage/ship'

/**
 * The NOUGHTIES ship's top coat (over its parts, never in the pointer's way): the big wet Aqua gloss across the top
 * of every window -- a white lozenge fading down, thin enough for the clip, its level and playhead to show through --
 * a caustic glow along each window's bottom, and a few hard sparkles on the gel.
 */
const props = defineProps<{ era: Era }>()
const R = (id: string): Part['rect'] => props.era.parts.find((p) => p.id === id)?.rect ?? [0, 0, 0, 0]
const pills = [R('0:perform'), R('2:perform')]
const orb = R('1:perform')
const o = { cx: (orb[0] + orb[2]) / 2, cy: (orb[1] + orb[3]) / 2, rx: (orb[2] - orb[0]) / 2, ry: (orb[3] - orb[1]) / 2 }
/** a pill's gloss: a rounded lozenge in its top half */
function gloss(r: Part['rect']) {
  const [x0, y0, x1, y1] = r
  const h = y1 - y0
  const i = h * 0.12
  const gh = h * 0.42
  const rr = gh / 2
  return { x: x0 + h * 0.28, y: y0 + i, width: x1 - x0 - h * 0.56, height: gh, rx: rr, ry: rr }
}
const sparkles = [
  { x: -560, y: -170, s: 1 },
  { x: 650, y: -168, s: 0.8 },
  { x: -170, y: -200, s: 0.9 },
  { x: 760, y: -40, s: 0.6 },
]
const star = (s: number) => `M 0 ${-18 * s} Q 0 0 ${18 * s} 0 Q 0 0 0 ${18 * s} Q 0 0 ${-18 * s} 0 Q 0 0 0 ${-18 * s} Z`
</script>

<template>
  <g class="overlay2000">
    <defs>
      <linearGradient id="o00-gloss" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.75" />
        <stop offset="1" stop-color="#fff" stop-opacity="0.04" />
      </linearGradient>
      <radialGradient id="o00-caustic" cx="0.5" cy="1" r="0.6">
        <stop offset="0" stop-color="#bff6ff" stop-opacity="0.5" />
        <stop offset="1" stop-color="#bff6ff" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="o00-spark" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#fff" stop-opacity="0.85" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </radialGradient>
    </defs>
    <g v-for="(r, i) in pills" :key="`p${i}`">
      <rect :x="r[0] + 10" :y="r[3] - (r[3] - r[1]) * 0.4" :width="r[2] - r[0] - 20" :height="(r[3] - r[1]) * 0.4" :rx="(r[3] - r[1]) * 0.2" fill="url(#o00-caustic)" style="mix-blend-mode: screen" />
      <rect v-bind="gloss(r)" fill="url(#o00-gloss)" />
    </g>
    <ellipse :cx="o.cx" :cy="o.cy + o.ry * 0.62" :rx="o.rx * 0.8" :ry="o.ry * 0.34" fill="url(#o00-caustic)" style="mix-blend-mode: screen" />
    <ellipse :cx="o.cx" :cy="o.cy - o.ry * 0.52" :rx="o.rx * 0.7" :ry="o.ry * 0.36" fill="url(#o00-gloss)" />
    <g v-for="(s, i) in sparkles" :key="`s${i}`" :transform="`translate(${s.x} ${s.y})`">
      <circle :r="16 * s.s" fill="url(#o00-spark)" />
      <path :d="star(s.s)" fill="#fff" />
    </g>
  </g>
</template>
