<script setup lang="ts">
import type { Era } from '../../lib/voyage/ship'

/**
 * The TENS ship's detail over its parts (lib/voyage/eras/e2010.ts): flat glare -- a white crescent on each dome's
 * upper left, its right side shaded flat at 45° as the sky shades its planets, a pair of 45° bars across each window's
 * glass. Translucent, never hiding a moving bit.
 */
const props = defineProps<{ era: Era }>()
const f = (v: number) => +v.toFixed(1)

const domes = props.era.parts
  .filter((p) => p.form === 'dome' && p.variant === 'up')
  .map((p) => {
    const [x0, , x1, y1] = p.rect
    const w = x1 - x0
    const h = p.rect[3] - p.rect[1]
    const cx = (x0 + x1) / 2
    // a crescent hugging the bowl's upper left: the outer arc the bowl's own, the inner a smaller one
    const rx = w / 2 - 12
    const ry = h - 12
    const a0 = Math.PI * 1.08
    const a1 = Math.PI * 1.42
    const P = (a: number, kx: number, ky: number) => `${f(cx + Math.cos(a) * kx)} ${f(y1 + Math.sin(a) * ky)}`
    return `M ${P(a0, rx, ry)} A ${f(rx)} ${f(ry)} 0 0 1 ${P(a1, rx, ry)} A ${f(rx * 0.86)} ${f(ry * 0.8)} 0 0 0 ${P(a0, rx * 0.9, ry * 0.7)} Z`
  })

/** each dome's flat dark side: right of the 45° line up from its base's middle, the way the sky shades its planets */
const shade = props.era.parts
  .filter((p) => p.form === 'dome' && p.variant !== 'bubble')
  .map((p) => {
    const [x0, y0, x1, y1] = p.rect
    const cx = (x0 + x1) / 2
    const w = x1 - x0
    const h = y1 - y0
    const down = p.variant === 'down'
    const by = down ? y0 : y1
    const bowl = down ? `M ${x0} ${y0} A ${w / 2} ${h} 0 0 0 ${x1} ${y0} Z` : `M ${x0} ${y1} A ${w / 2} ${h} 0 0 1 ${x1} ${y1} Z`
    return { id: `o10-dome-${p.vco}`, bowl, d: `M ${cx - 300} ${by + 300} L ${cx + 300} ${by - 300} L ${cx + 700} ${by + 100} Z` }
  })

const glare = props.era.parts
  .filter((p) => p.form === 'window')
  .map((p) => {
    const [x0, y0, x1, y1] = p.rect
    const h = y1 - y0
    const id = `o10-win-${p.vco}`
    const bar = (x: number, w: number) => `M ${f(x)} ${f(y1)} L ${f(x + h)} ${f(y0)} H ${f(x + h + w)} L ${f(x + w)} ${f(y1)} Z`
    return { id, x0, y0, x1, y1, d: bar(x1 - h - 70, 18) + bar(x1 - h - 40, 8) }
  })
</script>

<template>
  <g class="overlay">
    <defs>
      <clipPath v-for="g in glare" :id="g.id" :key="g.id"><rect :x="g.x0 + 4" :y="g.y0 + 4" :width="g.x1 - g.x0 - 8" :height="g.y1 - g.y0 - 8" rx="12" /></clipPath>
      <clipPath v-for="d in shade" :id="d.id" :key="d.id"><path :d="d.bowl" /></clipPath>
    </defs>
    <path v-for="d in shade" :key="d.id" :d="d.d" fill="#000" opacity="0.18" :clip-path="`url(#${d.id})`" />
    <path v-for="(d, i) in domes" :key="`d${i}`" :d="d" fill="#ffffff" opacity="0.28" />
    <path v-for="g in glare" :key="g.id" :d="g.d" fill="#ffffff" opacity="0.1" :clip-path="`url(#${g.id})`" />
  </g>
</template>
