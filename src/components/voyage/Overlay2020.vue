<script setup lang="ts">
import type { Era } from '../../lib/voyage/ship'

/**
 * The TWENTIES ship's detail over its parts (lib/voyage/eras/e2020.ts): the glass catching the aurora -- a soft
 * coloured sweep and a pale sheen across each window (the canopy's broadest), an iridescent hairline round each
 * dome's glass and a soft specular at its shoulder. All faint and additive, never hiding a moving bit.
 */
const props = defineProps<{ era: Era }>()
const f = (v: number) => +v.toFixed(1)

const wins = props.era.parts
  .filter((p) => p.form === 'window')
  .map((p) => {
    const [x0, y0, x1, y1] = p.rect
    const w = x1 - x0
    const h = y1 - y0
    const r = p.variant === 'panel' ? Math.min(18, h * 0.2) : h / 2
    return { id: `o20-win-${p.vco}`, x0, y0, w, h, r, sheen: `M ${f(x0 + w * 0.08)} ${f(y1)} L ${f(x0 + w * 0.3)} ${f(y0)} H ${f(x0 + w * 0.42)} L ${f(x0 + w * 0.2)} ${f(y1)} Z` }
  })
const domes = props.era.parts
  .filter((p) => p.form === 'dome')
  .map((p) => {
    const [x0, y0, x1, y1] = p.rect
    const w = x1 - x0
    const h = y1 - y0
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    if (p.variant === 'bubble') return { d: `M ${x0 + 3} ${cy} A ${w / 2 - 3} ${h / 2 - 3} 0 1 1 ${x1 - 3} ${cy} A ${w / 2 - 3} ${h / 2 - 3} 0 1 1 ${x0 + 3} ${cy} Z`, sx: cx - w * 0.2, sy: cy - h * 0.22, vco: p.vco }
    if (p.variant === 'down') return { d: `M ${x0 + 3} ${y0} A ${w / 2 - 3} ${h - 3} 0 0 0 ${x1 - 3} ${y0}`, sx: cx - w * 0.22, sy: y0 + h * 0.45, vco: p.vco }
    return { d: `M ${x0 + 3} ${y1} A ${w / 2 - 3} ${h - 3} 0 0 1 ${x1 - 3} ${y1}`, sx: cx - w * 0.2, sy: y1 - h * 0.6, vco: p.vco }
  })
</script>

<template>
  <g class="overlay">
    <defs>
      <linearGradient id="o20-iris" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ff8f80" />
        <stop offset="0.3" stop-color="#a08cff" />
        <stop offset="0.5" stop-color="#4d7cff" />
        <stop offset="0.72" stop-color="#5ef0c4" />
        <stop offset="1" stop-color="#a08cff" />
      </linearGradient>
      <linearGradient id="o20-sweep" x1="0" y1="0" x2="1" y2="0.3">
        <stop offset="0" stop-color="#7b5cff" stop-opacity="0.22" />
        <stop offset="0.45" stop-color="#2f6bff" stop-opacity="0.04" />
        <stop offset="0.75" stop-color="#14b8a6" stop-opacity="0.16" />
        <stop offset="1" stop-color="#ff5f72" stop-opacity="0.12" />
      </linearGradient>
      <linearGradient id="o20-sheen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.16" />
        <stop offset="1" stop-color="#ffffff" stop-opacity="0.02" />
      </linearGradient>
      <radialGradient id="o20-spec" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.5" />
        <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
      </radialGradient>
      <clipPath v-for="w in wins" :id="w.id" :key="w.id"><rect :x="w.x0" :y="w.y0" :width="w.w" :height="w.h" :rx="w.r" /></clipPath>
    </defs>
    <g v-for="w in wins" :key="w.id" :clip-path="`url(#${w.id})`">
      <rect :x="w.x0" :y="w.y0" :width="w.w" :height="w.h" fill="url(#o20-sweep)" style="mix-blend-mode: screen" />
      <path :d="w.sheen" fill="url(#o20-sheen)" />
      <rect :x="w.x0" :y="w.y0" :width="w.w" :height="w.h * 0.3" fill="url(#o20-sheen)" opacity="0.6" />
    </g>
    <g v-for="(d, i) in domes" :key="`d${i}`">
      <path :d="d.d" fill="none" stroke="url(#o20-iris)" stroke-width="1.4" opacity="0.8" />
      <ellipse :cx="d.sx" :cy="d.sy" rx="22" ry="12" fill="url(#o20-spec)" />
    </g>
  </g>
</template>
