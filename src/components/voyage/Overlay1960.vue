<script setup lang="ts">
import type { Era, Part } from '../../lib/voyage/ship'

/**
 * The SIXTIES ship's detail over its parts (lib/voyage/eras/e1960.ts): an iridescent iris round the eye's window,
 * candy scallops round the portholes (the cockpit's screens wear the same), a gloss on all the glass, jelly highlights
 * and candy collars on the domes, rainbow rims on the kaleidoscope, the vents and the garden's lamps. Never over a
 * part's moving middle.
 */
const props = defineProps<{ era: Era }>()
const N = (n: number) => Array.from({ length: n }, (_, i) => i)
const f = (n: number) => n.toFixed(1)
const W = (p: Part) => p.rect[2] - p.rect[0]
const H = (p: Part) => p.rect[3] - p.rect[1]
const CX = (p: Part) => (p.rect[0] + p.rect[2]) / 2
const CY = (p: Part) => (p.rect[1] + p.rect[3]) / 2
const of = (form: string) => props.era.parts.filter((p) => p.form === form)
const pal = (p: Part) => props.era.palettes[p.vco]

const eyes = of('window')
  .filter((p) => p.variant === 'round')
  .map((p) => ({ p, cx: CX(p), cy: CY(p), rx: W(p) / 2, ry: H(p) / 2 }))
/** a porthole's centres and radius, as VoyageShip draws them */
const ports = of('window')
  .filter((p) => p.variant === 'ports')
  .flatMap((p) => {
    const n = Math.max(2, Math.round(W(p) / H(p)))
    const r = H(p) / 2 - 4
    return N(n).map((i) => {
      const cx = p.rect[0] + H(p) / 2 + i * ((W(p) - H(p)) / Math.max(1, n - 1))
      const scallops = N(16).map((k) => ({ x: cx + Math.cos((k / 16) * Math.PI * 2) * (r + 9), y: CY(p) + Math.sin((k / 16) * Math.PI * 2) * (r + 9) }))
      return { p, cx, cy: CY(p), r, scallops, key: `${p.id}-${i}` }
    })
  })
const lamps = of('lamps')
const domes = of('dome').map((p) => {
  const down = p.variant === 'down'
  const [x0, y0, x1, y1] = p.rect
  const w = x1 - x0
  const h = y1 - y0
  // a jelly highlight: a crescent hugging the upper left of the dome
  const hl = down
    ? `M ${f(x0 + w * 0.14)} ${f(y0 + h * 0.12)} Q ${f(x0 + w * 0.2)} ${f(y0 + h * 0.62)} ${f(x0 + w * 0.42)} ${f(y0 + h * 0.8)} Q ${f(x0 + w * 0.26)} ${f(y0 + h * 0.5)} ${f(x0 + w * 0.26)} ${f(y0 + h * 0.12)} Z`
    : `M ${f(x0 + w * 0.12)} ${f(y1 - h * 0.12)} Q ${f(x0 + w * 0.16)} ${f(y0 + h * 0.3)} ${f(x0 + w * 0.46)} ${f(y0 + h * 0.08)} Q ${f(x0 + w * 0.24)} ${f(y0 + h * 0.36)} ${f(x0 + w * 0.24)} ${f(y1 - h * 0.12)} Z`
  return { p, hl, x: x0 - 14, y: down ? y0 - 10 : y1 - 8, w: w + 28, dots: N(7).map((i) => x0 - 4 + ((w + 8) * i) / 6) }
})
const turbines = of('rotor')
  .filter((p) => p.variant === 'turbine')
  .map((p) => ({ p, cx: CX(p), cy: CY(p), r: Math.min(W(p), H(p)) / 2 - 2 }))
const vents = of('vents').map((p) => ({ p, x: p.rect[0] - 4, y: CY(p) - 22, w: W(p) + 8, h: 44 }))
/** a fin's outline at rest (VoyageShip's finPath, mids centred) */
function finPath(p: Part): string {
  const [x0, y0, x1, y1] = p.rect
  const X = (n: number) => n * Math.min(1.6, W(p) / 200)
  const Y = (n: number) => n * Math.min(1.6, H(p) / 150)
  if (p.variant === 'wing') return `M ${x1 - X(10)} ${y0 + Y(20)} C ${x1 + X(6)} ${y0 + Y(80)} ${x1 - X(20)} ${y1 - Y(40)} ${x0 + X(30)} ${y1 - Y(6)} C ${x0 + X(6)} ${y1 - Y(30)} ${x0 + X(20)} ${y0 + Y(90)} ${x0 + X(40)} ${y0 + Y(10)} Z`
  if (p.variant === 'keel') return `M ${x0 + X(10)} ${y0} L ${x1 - X(6)} ${y0} C ${x1 - X(30)} ${y0 + Y(50)} ${x1 - X(50)} ${y1 - Y(30)} ${x1 - X(90)} ${y1} L ${x0 + X(70)} ${y1 - Y(10)} C ${x0 + X(40)} ${y1 - Y(50)} ${x0 + X(20)} ${y0 + Y(50)} ${x0 + X(10)} ${y0} Z`
  if (p.variant === 'delta') return `M ${x0 + X(8)} ${y0} L ${x1 - X(4)} ${y0} C ${x1 - X(20)} ${y0 + H(p) * 0.45} ${x0 + W(p) * 0.4} ${y1 - Y(10)} ${x0 + X(6)} ${y1} C ${x0 + X(14)} ${y0 + H(p) * 0.6} ${x0 + X(10)} ${y0 + Y(30)} ${x0 + X(8)} ${y0} Z`
  return `M ${x1 - X(8)} ${y0} L ${x0 + X(60)} ${y0 + Y(10)} C ${x0 + X(20)} ${y0 + Y(60)} ${x0} ${y1 - Y(30)} ${x0 + X(10)} ${y1} L ${x1 - X(60)} ${y1 - Y(30)} C ${x1 - X(30)} ${y1 - Y(80)} ${x1 - X(10)} ${y0 + Y(60)} ${x1 - X(8)} ${y0} Z`
}
/** the fins' candy gloss, inset so it stays inside as the mids swell and scoop; the hull's edge (for the fins behind
 * it) a clip line it stays clear of: above `top` or below `bottom` */
const fins = of('fin').map((p) => {
  const t = `translate(${CX(p)} ${CY(p)}) scale(0.8) translate(${-CX(p)} ${-CY(p)})`
  const flip = p.flip === 'x' ? `translate(${2 * CX(p)} 0) scale(-1 1)` : p.flip === 'y' ? `translate(0 ${2 * CY(p)}) scale(1 -1)` : ''
  const clip = !p.back ? { x: p.rect[0] - 40, y: p.rect[1] - 40, w: W(p) + 80, h: H(p) + 80 } : CY(p) < 0 ? { x: p.rect[0] - 40, y: p.rect[1] - 40, w: W(p) + 80, h: H(p) - 60 } : { x: p.rect[0] - 40, y: p.rect[1] + 24, w: W(p) + 80, h: H(p) + 40 }
  return { d: finPath(p), t: `${flip} ${t}`, clip, id: p.id.replace(':', '-') }
})
/** the stacks: candy sticks, round and glossy, where they stand clear of the hull */
const sticks = of('funnel')
  .filter((p) => p.variant === 'stacks')
  .flatMap((p) => {
    const slot = W(p) / p.n
    return N(p.n).map((i) => {
      const h = H(p) * [1, 0.8, 0.92, 0.7][i % 4]
      return { x: p.rect[0] + slot * i + slot * 0.12, y: p.rect[3] - h, w: slot * 0.76, bottom: p.rect[3] - 8 }
    })
  })
const BEADS = ['#ff2e88', '#ffd21f', '#2fe0c4', '#ff7a1a', '#7a3cff', '#a6ff2e']
</script>

<template>
  <g class="o60">
    <defs>
      <linearGradient id="o60-iris" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ff3df0" />
        <stop offset="0.25" stop-color="#ffd21f" />
        <stop offset="0.5" stop-color="#2fe0c4" />
        <stop offset="0.75" stop-color="#7a3cff" />
        <stop offset="1" stop-color="#ff2e88" />
      </linearGradient>
      <linearGradient id="o60-gloss" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.45" />
        <stop offset="0.5" stop-color="#fff" stop-opacity="0.04" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="o60-round" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#241036" stop-opacity="0.55" />
        <stop offset="0.25" stop-color="#241036" stop-opacity="0" />
        <stop offset="0.7" stop-color="#241036" stop-opacity="0.05" />
        <stop offset="1" stop-color="#241036" stop-opacity="0.6" />
      </linearGradient>
      <radialGradient id="o60-bead" cx="0.35" cy="0.3" r="0.75">
        <stop offset="0" stop-color="#fff" stop-opacity="0.95" />
        <stop offset="0.35" stop-color="#fff" stop-opacity="0.15" />
        <stop offset="1" stop-color="#000" stop-opacity="0.3" />
      </radialGradient>
    </defs>

    <!-- the eye's iris: an iridescent ring round the window, a gloss across its top -->
    <g v-for="(e, i) in eyes" :key="`e${i}`">
      <ellipse :cx="e.cx" :cy="e.cy" :rx="e.rx + 4" :ry="e.ry + 4" fill="none" :stroke="era.ink" stroke-width="11" />
      <ellipse :cx="e.cx" :cy="e.cy" :rx="e.rx + 4" :ry="e.ry + 4" fill="none" stroke="url(#o60-iris)" stroke-width="7" />
      <ellipse :cx="e.cx" :cy="e.cy" :rx="e.rx + 4" :ry="e.ry + 4" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.7" stroke-dasharray="2 9" />
      <ellipse :cx="e.cx" :cy="e.cy - e.ry * 0.45" :rx="e.rx * 0.78" :ry="e.ry * 0.38" fill="url(#o60-gloss)" />
      <circle :cx="e.cx + e.rx * 0.42" :cy="e.cy - e.ry * 0.5" r="7" fill="#fff" opacity="0.6" />
      <circle :cx="e.cx + e.rx * 0.5" :cy="e.cy - e.ry * 0.3" r="3.5" fill="#fff" opacity="0.5" />
    </g>
    <!-- the portholes: candy scallops, a gloss -->
    <g v-for="o in ports" :key="o.key">
      <circle v-for="(s, k) in o.scallops" :key="k" :cx="f(s.x)" :cy="f(s.y)" r="7" :fill="k % 2 ? pal(o.p).main : pal(o.p).hi" :stroke="era.ink" stroke-width="1.6" />
      <circle :cx="o.cx" :cy="o.cy" :r="o.r + 3" fill="none" :stroke="era.ink" stroke-width="4" />
      <circle :cx="o.cx" :cy="o.cy" :r="o.r + 3" fill="none" :stroke="pal(o.p).alt" stroke-width="2.5" />
      <ellipse :cx="o.cx" :cy="o.cy - o.r * 0.45" :rx="o.r * 0.7" :ry="o.r * 0.4" fill="url(#o60-gloss)" />
    </g>
    <!-- the garden's lamps: a rainbow rim -->
    <rect v-for="p in lamps" :key="`l${p.id}`" :x="p.rect[0] - 3" :y="p.rect[1] - 3" :width="W(p) + 6" :height="H(p) + 6" :rx="H(p) / 2 + 3" fill="none" stroke="url(#o60-iris)" stroke-width="3.5" />
    <!-- the domes: jelly highlights, beaded candy collars -->
    <g v-for="(d, i) in domes" :key="`d${i}`">
      <path :d="d.hl" fill="#fff" opacity="0.55" />
      <rect :x="d.x" :y="d.y" :width="d.w" height="18" rx="9" :fill="pal(d.p).main" :stroke="era.ink" stroke-width="2.5" />
      <rect :x="d.x + 4" :y="d.y + 2" :width="d.w - 8" height="6" rx="3" fill="#fff" opacity="0.45" />
      <g v-for="(x, k) in d.dots" :key="k">
        <circle :cx="f(x)" :cy="d.y + 10" r="3.6" :fill="BEADS[(k + i) % BEADS.length]" :stroke="era.ink" stroke-width="1" />
      </g>
    </g>
    <!-- the kaleidoscope's rainbow rim -->
    <g v-for="(t, i) in turbines" :key="`t${i}`">
      <circle :cx="t.cx" :cy="t.cy" :r="t.r + 3" fill="none" :stroke="era.ink" stroke-width="12" />
      <circle :cx="t.cx" :cy="t.cy" :r="t.r + 3" fill="none" stroke="url(#o60-iris)" stroke-width="8" />
      <g v-for="k in N(12)" :key="k">
        <circle :cx="f(t.cx + Math.cos((k / 12) * Math.PI * 2) * (t.r + 3))" :cy="f(t.cy + Math.sin((k / 12) * Math.PI * 2) * (t.r + 3))" r="3.4" fill="#fff" opacity="0.8" />
      </g>
    </g>
    <!-- the fins and the stacks: a candy gloss -->
    <g v-for="fn in fins" :key="`f${fn.id}`">
      <clipPath :id="`o60-fc-${fn.id}`"><rect :x="fn.clip.x" :y="fn.clip.y" :width="fn.clip.w" :height="fn.clip.h" /></clipPath>
      <g :clip-path="`url(#o60-fc-${fn.id})`">
        <path :d="fn.d" :transform="fn.t" fill="url(#o60-gloss)" />
        <path :d="fn.d" :transform="fn.t" fill="url(#tx-speckle)" opacity="0.25" style="mix-blend-mode: screen" />
      </g>
    </g>
    <g v-for="(s, i) in sticks" :key="`k${i}`">
      <rect :x="s.x + 2" :y="s.y + 12" :width="s.w - 4" :height="s.bottom - s.y - 12" fill="url(#o60-round)" />
      <rect :x="s.x + s.w * 0.2" :y="s.y + 16" :width="s.w * 0.12" :height="s.bottom - s.y - 24" rx="3" fill="#fff" opacity="0.55" />
    </g>
    <!-- the garden's lamps and the vents: a candy-glass gloss across their tops -->
    <rect v-for="p in [...lamps, ...of('vents')]" :key="`gl${p.id}`" :x="p.rect[0] + 10" :y="p.form === 'vents' ? CY(p) - 16 : p.rect[1] + 2" :width="W(p) - 20" :height="p.form === 'vents' ? 12 : H(p) * 0.36" :rx="6" fill="url(#o60-gloss)" />
    <!-- the vents: candy rims with beads at the ends -->
    <g v-for="(v, i) in vents" :key="`v${i}`">
      <rect :x="v.x" :y="v.y" :width="v.w" :height="v.h" :rx="v.h / 2" fill="none" :stroke="era.ink" stroke-width="6" />
      <rect :x="v.x" :y="v.y" :width="v.w" :height="v.h" :rx="v.h / 2" fill="none" :stroke="pal(v.p).main" stroke-width="3.5" />
      <circle :cx="v.x + v.h / 2 - 8" :cy="v.y + 6" r="3" fill="#fff" opacity="0.7" />
    </g>
  </g>
</template>
