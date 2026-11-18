<script setup lang="ts">
import type { Era, Part } from '../../lib/voyage/ship'

/**
 * The FIFTIES ship's detail over its parts (lib/voyage/eras/e1950.ts): riveted brass bezels round the panes and the
 * garden's lamps, a reflection of the sky on the glass, brass collars and ribs on the domes, the turbine's cowl, the
 * paddle wheel's riveted fender, grilles round the vents, steam off the stacks. Never over a part's moving middle.
 */
const props = defineProps<{ era: Era }>()
const N = (n: number) => Array.from({ length: n }, (_, i) => i)
const f = (n: number) => n.toFixed(1)
const W = (p: Part) => p.rect[2] - p.rect[0]
const H = (p: Part) => p.rect[3] - p.rect[1]
const CX = (p: Part) => (p.rect[0] + p.rect[2]) / 2
const CY = (p: Part) => (p.rect[1] + p.rect[3]) / 2
const of = (form: string) => props.era.parts.filter((p) => p.form === form)

const windows = of('window').map((p) => {
  const [x, y] = p.rect
  const w = W(p)
  const h = H(p)
  const rx = Math.min(18, h * 0.2)
  const rivets = [...N(9).map((i) => ({ x: x + 16 + ((w - 32) * i) / 8, y: y - 4 })), ...N(9).map((i) => ({ x: x + 16 + ((w - 32) * i) / 8, y: y + h + 4 }))]
  return { p, x, y, w, h, rx, rivets, glare: `M ${f(x + w * 0.55)} ${y} L ${f(x + w * 0.68)} ${y} L ${f(x + w * 0.5)} ${y + h} L ${f(x + w * 0.37)} ${y + h} Z`, glare2: `M ${f(x + w * 0.72)} ${y} L ${f(x + w * 0.76)} ${y} L ${f(x + w * 0.58)} ${y + h} L ${f(x + w * 0.54)} ${y + h} Z` }
})
const lamps = of('lamps')
const domes = of('dome').map((p) => {
  const [x0, y0, x1, y1] = p.rect
  const down = p.variant === 'down'
  const apex = down ? y1 : y0
  const base = down ? y0 : y1
  const sweepR = down ? 0 : 1
  const ribs = [0.5, 0.87].flatMap((k) => {
    const rx = (W(p) / 2) * k
    return [`M ${CX(p)} ${apex} A ${f(rx)} ${H(p)} 0 0 ${sweepR} ${f(CX(p) + rx)} ${base}`, `M ${CX(p)} ${apex} A ${f(rx)} ${H(p)} 0 0 ${1 - sweepR} ${f(CX(p) - rx)} ${base}`]
  })
  const collarY = down ? y0 - 10 : y1 - 8
  return { p, ribs, x: x0 - 14, y: collarY, w: x1 - x0 + 28, mid: `M ${CX(p)} ${apex} V ${base}`, rivets: N(9).map((i) => x0 - 6 + ((x1 - x0 + 12) * i) / 8), apex, cx: CX(p) }
})
const turbines = of('rotor')
  .filter((p) => p.variant === 'turbine')
  .map((p) => ({ cx: CX(p), cy: CY(p), r: Math.min(W(p), H(p)) / 2 - 2 }))
const wheels = of('rotor')
  .filter((p) => p.variant === 'wheel')
  .map((p) => {
    const d = `M ${p.rect[0] - 6} ${CY(p) - 10} A ${W(p) / 2 + 6} ${H(p) / 2 + 6} 0 0 1 ${p.rect[2] + 6} ${CY(p) - 10}`
    const r = W(p) / 2 + 6
    const rivets = N(11).map((i) => {
      const a = Math.PI + ((i + 0.5) / 11) * Math.PI
      return { x: CX(p) + Math.cos(a) * r, y: CY(p) - 10 + Math.sin(a) * (H(p) / 2 + 6) }
    })
    return { d, rivets, cx: CX(p), cy: CY(p) }
  })
const vents = of('vents').map((p) => ({ x: p.rect[0] - 4, y: CY(p) - 22, w: W(p) + 8, h: 44, n: Math.round(W(p) / 22) }))
/** the stacks' round, where they stand clear of the roof (stacks(): VoyageShip's layout) */
const ROOF = -364
const stackShade = of('funnel')
  .filter((p) => p.variant === 'stacks')
  .flatMap((p) => {
    const slot = W(p) / p.n
    return N(p.n).map((i) => {
      const h = H(p) * [1, 0.8, 0.92, 0.7][i % 4]
      const x = p.rect[0] + slot * i + slot * 0.12
      const y = p.rect[3] - h
      return { x, y, w: slot * 0.76, bottom: Math.min(p.rect[3], ROOF) }
    })
  })
  .filter((s) => s.bottom > s.y + 14)
/** the horns and bells: their round, where they hang clear of the hull (VoyageShip's hornPath and bells) */
const horns = of('funnel')
  .filter((p) => p.variant === 'horn')
  .map((p) => {
    const [x0, y0, x1, y1] = p.rect
    return { d: `M ${x0 + 6} ${y0} L ${x0 + 40} ${y0} C ${x0 + 60} ${y0 + 50} ${x1 - 10} ${y1 - 60} ${x1} ${y1 - 30} L ${x1 - 70} ${y1} C ${x1 - 80} ${y1 - 40} ${x0 + 20} ${y0 + 60} ${x0 + 6} ${y0} Z`, clip: { x: x0 - 20, y: y0 + 6, w: x1 - x0 + 40, h: y1 - y0 }, id: p.id.replace(':', '-') }
  })
const bells = of('funnel')
  .filter((p) => p.variant === 'bells')
  .map((p) => {
    const n = Math.max(1, p.n)
    const dx = Math.cos((p.dir * Math.PI) / 180)
    const dy = Math.sin((p.dir * Math.PI) / 180)
    const vertical = Math.abs(dy) >= Math.abs(dx)
    const across = vertical ? W(p) : H(p)
    const L = vertical ? H(p) : W(p)
    const slot = across / n
    const list = N(n).map((i) => {
      const c = slot * (i + 0.5)
      const x = vertical ? p.rect[0] + c : dx > 0 ? p.rect[0] : p.rect[2]
      const y = vertical ? (dy > 0 ? p.rect[1] : p.rect[3]) : p.rect[1] + c
      const l = L - 6
      const tw = slot * 0.42
      const mw = slot * 0.92
      return { t: `translate(${x} ${y}) rotate(${p.dir - 90})`, d: `M ${-tw / 2} 0 C ${-tw / 2} ${l * 0.5} ${-mw / 2} ${l * 0.7} ${-mw / 2} ${l} L ${mw / 2} ${l} C ${mw / 2} ${l * 0.7} ${tw / 2} ${l * 0.5} ${tw / 2} 0 Z` }
    })
    // clear of the engine house (it ends 26 short of the bells' throats)
    const clip = dx < 0 ? { x: -900, y: p.rect[1] - 40, w: p.rect[2] - 26 + 900, h: H(p) + 80 } : { x: p.rect[0] + 26, y: p.rect[1] - 40, w: 900, h: H(p) + 80 }
    return { list, clip, id: p.id.replace(':', '-') }
  })
/** steam off the stacks' tops */
const puffs = of('funnel')
  .filter((p) => p.variant === 'stacks')
  .flatMap((p) => {
    const slot = W(p) / p.n
    return N(p.n).flatMap((i) => N(3).map((k) => ({ x: p.rect[0] + slot * (i + 0.5), y: p.rect[3] - H(p) * [1, 0.8, 0.92][i % 3], k: i * 3 + k })))
  })
</script>

<template>
  <g class="o50">
    <defs>
      <linearGradient id="o50-brass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff0b0" />
        <stop offset="0.3" stop-color="#d9a748" />
        <stop offset="0.65" stop-color="#8a5c1c" />
        <stop offset="1" stop-color="#3c2408" />
      </linearGradient>
      <radialGradient id="o50-rivet" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#fff2c0" />
        <stop offset="0.45" stop-color="#a87a2a" />
        <stop offset="1" stop-color="#1a0e04" />
      </radialGradient>
      <linearGradient id="o50-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#9fb4ff" stop-opacity="0.22" />
        <stop offset="0.35" stop-color="#9fb4ff" stop-opacity="0" />
        <stop offset="0.85" stop-color="#7dffb0" stop-opacity="0" />
        <stop offset="1" stop-color="#7dffb0" stop-opacity="0.12" />
      </linearGradient>
      <linearGradient id="o50-cyl" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#000" stop-opacity="0.7" />
        <stop offset="0.22" stop-color="#000" stop-opacity="0.1" />
        <stop offset="0.3" stop-color="#fff" stop-opacity="0.45" />
        <stop offset="0.4" stop-color="#fff" stop-opacity="0" />
        <stop offset="0.75" stop-color="#000" stop-opacity="0.25" />
        <stop offset="1" stop-color="#000" stop-opacity="0.75" />
      </linearGradient>
      <linearGradient id="o50-diag" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000" stop-opacity="0.65" />
        <stop offset="0.3" stop-color="#000" stop-opacity="0.05" />
        <stop offset="0.4" stop-color="#fff" stop-opacity="0.35" />
        <stop offset="0.5" stop-color="#fff" stop-opacity="0" />
        <stop offset="1" stop-color="#000" stop-opacity="0.65" />
      </linearGradient>
      <linearGradient id="o50-brassH" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#3c2408" />
        <stop offset="0.3" stop-color="#c99a3c" />
        <stop offset="0.4" stop-color="#ffefb0" />
        <stop offset="0.7" stop-color="#8a5c1c" />
        <stop offset="1" stop-color="#2a1804" />
      </linearGradient>
      <radialGradient id="o50-steam" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#fff8ee" stop-opacity="0.55" />
        <stop offset="0.6" stop-color="#f4ece0" stop-opacity="0.16" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </radialGradient>
    </defs>

    <!-- the panes: sky on the glass, a brass bead round each, rivets -->
    <g v-for="(w, i) in windows" :key="`w${i}`">
      <rect v-for="(g, k) in [34, 22, 12]" :key="`gl${k}`" :x="w.x - 8" :y="w.y - 8" :width="w.w + 16" :height="w.h + 16" :rx="w.rx + 8" fill="none" stroke="#7dffb0" :stroke-width="g" :opacity="0.035 + k * 0.02" style="mix-blend-mode: screen" />
      <rect :x="w.x" :y="w.y" :width="w.w" :height="w.h" :rx="w.rx" fill="url(#o50-sky)" />
      <path :d="w.glare" fill="#fff" opacity="0.06" />
      <path :d="w.glare2" fill="#fff" opacity="0.05" />
      <rect :x="w.x - 2" :y="w.y - 2" :width="w.w + 4" :height="w.h + 4" :rx="w.rx + 2" fill="none" stroke="#120c08" stroke-width="3" />
      <rect :x="w.x - 5" :y="w.y - 5" :width="w.w + 10" :height="w.h + 10" :rx="w.rx + 5" fill="none" stroke="url(#o50-brass)" stroke-width="4" />
      <circle v-for="(r, k) in w.rivets" :key="k" :cx="f(r.x)" :cy="r.y" r="2.2" fill="url(#o50-rivet)" />
    </g>
    <!-- the garden's lamps: a brass bead -->
    <rect v-for="p in lamps" :key="`l${p.id}`" :x="p.rect[0] - 3" :y="p.rect[1] - 3" :width="W(p) + 6" :height="H(p) + 6" :rx="H(p) / 2 + 3" fill="none" stroke="url(#o50-brass)" stroke-width="3.5" />
    <!-- the domes: brass ribs, a riveted collar, a finial -->
    <g v-for="(d, i) in domes" :key="`d${i}`">
      <path v-for="(r, k) in d.ribs" :key="k" :d="r" fill="none" stroke="#2a1804" stroke-width="4" opacity="0.7" />
      <path v-for="(r, k) in d.ribs" :key="`h${k}`" :d="r" fill="none" stroke="#e8c070" stroke-width="1.8" opacity="0.85" />
      <path :d="d.mid" stroke="#2a1804" stroke-width="4" opacity="0.7" />
      <path :d="d.mid" stroke="#e8c070" stroke-width="1.8" opacity="0.85" />
      <rect :x="d.x" :y="d.y" :width="d.w" height="18" rx="4" fill="url(#o50-brass)" stroke="#1a0e04" stroke-width="1.2" />
      <circle v-for="(x, k) in d.rivets" :key="`c${k}`" :cx="f(x)" :cy="d.y + 9" r="2.2" fill="url(#o50-rivet)" />
    </g>
    <!-- the turbine's cowl -->
    <g v-for="(t, i) in turbines" :key="`t${i}`">
      <circle :cx="t.cx" :cy="t.cy" :r="t.r + 3" fill="none" stroke="#1a0e04" stroke-width="10" />
      <circle :cx="t.cx" :cy="t.cy" :r="t.r + 3" fill="none" stroke="url(#o50-brass)" stroke-width="7" />
      <circle v-for="k in N(16)" :key="k" :cx="f(t.cx + Math.cos((k / 16) * Math.PI * 2) * (t.r + 3))" :cy="f(t.cy + Math.sin((k / 16) * Math.PI * 2) * (t.r + 3))" r="1.8" fill="url(#o50-rivet)" />
    </g>
    <!-- the paddle wheel's fender, riveted brass -->
    <g v-for="(w, i) in wheels" :key="`p${i}`">
      <path :d="w.d" fill="none" stroke="#1a0e04" stroke-width="13" stroke-linecap="round" />
      <path :d="w.d" fill="none" stroke="url(#o50-brass)" stroke-width="9" stroke-linecap="round" />
      <circle v-for="(r, k) in w.rivets" :key="k" :cx="f(r.x)" :cy="f(r.y)" r="2" fill="url(#o50-rivet)" />
    </g>
    <!-- the vents: a brass grille frame -->
    <g v-for="(v, i) in vents" :key="`v${i}`">
      <rect :x="v.x" :y="v.y" :width="v.w" :height="v.h" :rx="v.h / 2" fill="none" stroke="#1a0e04" stroke-width="5" />
      <rect :x="v.x" :y="v.y" :width="v.w" :height="v.h" :rx="v.h / 2" fill="none" stroke="url(#o50-brass)" stroke-width="3" />
    </g>
    <!-- the stacks: round, sooty, banded -->
    <g v-for="(s, i) in stackShade" :key="`ss${i}`">
      <rect :x="s.x" :y="s.y + 12" :width="s.w" :height="s.bottom - s.y - 12" fill="url(#o50-cyl)" />
      <rect :x="s.x - 6" :y="s.y" :width="s.w + 12" height="14" rx="5" fill="url(#o50-cyl)" />
      <rect :x="s.x - 6" :y="s.y" :width="s.w + 12" height="5" rx="2" fill="#0a0604" opacity="0.6" />
      <rect :x="s.x" :y="s.bottom - 16" :width="s.w" height="10" fill="url(#o50-brassH)" opacity="0.9" />
    </g>
    <!-- the horn and the bells: round and dulled -->
    <g v-for="h in horns" :key="`h${h.id}`">
      <clipPath :id="`o50-hc-${h.id}`"><rect :x="h.clip.x" :y="h.clip.y" :width="h.clip.w" :height="h.clip.h" /></clipPath>
      <g :clip-path="`url(#o50-hc-${h.id})`">
        <path :d="h.d" fill="url(#o50-diag)" />
        <path :d="h.d" fill="url(#tx-scratches)" opacity="0.35" style="mix-blend-mode: multiply" />
      </g>
    </g>
    <g v-for="b in bells" :key="`b${b.id}`">
      <clipPath :id="`o50-bc-${b.id}`"><rect :x="b.clip.x" :y="b.clip.y" :width="b.clip.w" :height="b.clip.h" /></clipPath>
      <g :clip-path="`url(#o50-bc-${b.id})`">
        <path v-for="(q, i) in b.list" :key="i" :d="q.d" :transform="q.t" fill="url(#o50-cyl)" />
      </g>
    </g>
    <!-- steam off the stacks -->
    <g class="steam">
      <circle v-for="s in puffs" :key="`s${s.k}`" :cx="f(s.x)" :cy="f(s.y)" r="14" fill="url(#o50-steam)" :style="{ animationDelay: `${-(s.k % 3) * 1.7 - s.k * 0.3}s` }" />
    </g>
  </g>
</template>

<style scoped>
.steam circle {
  transform-box: fill-box;
  transform-origin: center;
  animation: puff 5s steps(60) infinite;
  opacity: 0;
}
@keyframes puff {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(0.5);
  }
  15% {
    opacity: 0.85;
  }
  100% {
    opacity: 0;
    transform: translate(-110px, -70px) scale(3.2);
  }
}
</style>
