<script setup lang="ts">
import { computed } from 'vue'
import type { Era, Part } from '../../lib/voyage/ship'

/**
 * The SEVENTIES ship's detail over its parts (lib/voyage/eras/e1970.ts): the command deck's windscreen posts (three
 * panes, as from inside), amber cabin light spilling round the windows, heat-blued metal and a hot glow in the
 * nozzles, a lip of shadow and a glint in each cowled turbine, grime on the vents. Never takes the pointer, never
 * hides a moving bit: everything here is a thin post, a soft tint or a ring.
 */
const props = defineProps<{ era: Era }>()
const N = (n: number) => Array.from({ length: n }, (_, i) => i)
const byId = (id: string) => props.era.parts.find((p) => p.id === id) as Part
const rad = (d: number) => (d * Math.PI) / 180

/** the same nozzles VoyageShip.vue draws for a part of bells */
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
    const Lb = L - 6
    const tw = slot * 0.42
    const mw = slot * 0.92
    return {
      t: `translate(${x} ${y}) rotate(${p.dir - 90})`,
      d: `M ${-tw / 2} 0 C ${-tw / 2} ${Lb * 0.5} ${-mw / 2} ${Lb * 0.7} ${-mw / 2} ${Lb} L ${mw / 2} ${Lb} C ${mw / 2} ${Lb * 0.7} ${tw / 2} ${Lb * 0.5} ${tw / 2} 0 Z`,
      hi: `M ${-tw / 2 + 3} 4 C ${-tw / 2 + 3} ${Lb * 0.5} ${-mw / 2 + 5} ${Lb * 0.7} ${-mw / 2 + 6} ${Lb - 4}`,
      L: Lb,
      mw,
    }
  })
}
const nozzles = computed(() => [byId('2:pitch'), byId('0:pitch')].flatMap((p) => bells(p)))
const turbines = computed(() =>
  ['2:grain', '0:grain', '1:grain'].map((id) => {
    const p = byId(id)
    return { cx: (p.rect[0] + p.rect[2]) / 2, cy: (p.rect[1] + p.rect[3]) / 2, r: Math.min(p.rect[2] - p.rect[0], p.rect[3] - p.rect[1]) / 2 - 2 }
  }),
)
const vents = computed(() => ['0:texture', '1:texture', '2:texture'].map((id) => byId(id).rect))
/** the windows' light spilling onto the hull round them: an ellipse with the window cut out */
const spills = computed(() =>
  ['0:perform', '1:perform', '2:perform'].map((id) => {
    const [x0, y0, x1, y1] = byId(id).rect
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    const rx = (x1 - x0) / 2 + 40
    const ry = (y1 - y0) / 2 + 34
    return { cx, cy, rx, ry, d: `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z M ${x0 - 6} ${y0 - 6} V ${y1 + 6} H ${x1 + 6} V ${y0 - 6} Z` }
  }),
)
const deck = computed(() => byId('0:perform').rect)

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
    .map((p) => ({ id: p.id.replace(':', '-'), lo: finPath(p, -1), hi: finPath(p, 1), rest: finPath(p, 0), x: p.rect[0] - 10, y: p.rect[1] - 10, w: p.rect[2] - p.rect[0] + 20, h: p.rect[3] - p.rect[1] + 20 })),
)
/** the funnels VoyageShip.vue stands up for a part of stacks */
const stacks = computed(() =>
  props.era.parts
    .filter((p) => p.form === 'funnel' && p.variant === 'stacks')
    .flatMap((p) => {
      const n = Math.max(1, p.n)
      const W = p.rect[2] - p.rect[0]
      const H = p.rect[3] - p.rect[1]
      const slot = W / n
      const hs = [1, 0.8, 0.92, 0.7]
      return N(n).map((i) => {
        const h = H * hs[i % hs.length]
        const x = p.rect[0] + slot * i + slot * 0.12
        const y = p.rect[3] - h
        const w = slot * 0.76
        return { x, y, w, h, d: `M ${x + 4} ${y + h} L ${x} ${y + 10} H ${x + w} L ${x + w - 4} ${y + h} Z` }
      })
    }),
)
/** the dishes' bowls, as VoyageShip.vue draws them */
const dishes = computed(() =>
  props.era.parts
    .filter((p) => p.form === 'antenna' && p.variant === 'dish')
    .map((p) => {
      const W = p.rect[2] - p.rect[0]
      const H = p.rect[3] - p.rect[1]
      const r = Math.min(W, H) * 0.42
      const c = { x: (p.rect[0] + p.rect[2]) / 2, y: (p.rect[1] + p.rect[3]) / 2 }
      const p0 = { x: c.x + Math.cos(rad(-20)) * r, y: c.y - r * 0.2 + Math.sin(rad(-20)) * r }
      const p1 = { x: c.x + Math.cos(rad(160)) * r, y: c.y - r * 0.2 + Math.sin(rad(160)) * r }
      return { d: `M ${p0.x} ${p0.y} A ${r} ${r * 0.62} -20 0 1 ${p1.x} ${p1.y} Z`, rim: `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`, c, r }
    }),
)
/** the domes' frames: meridians and a ring of latitude */
const domes = computed(() =>
  props.era.parts
    .filter((p) => p.form === 'dome' && p.variant !== 'bubble')
    .map((p) => {
      const [x0, y0, x1, y1] = p.rect
      const cx = (x0 + x1) / 2
      const W = x1 - x0
      const H = y1 - y0
      const down = p.variant === 'down'
      const base = down ? y0 : y1
      const apex = down ? y1 : y0
      const sg = down ? 1 : -1
      let d = ''
      for (const f of [-0.75, -0.4, 0.4, 0.75]) {
        const rx = Math.abs(f) * (W / 2)
        const sweep = (f > 0) !== down ? 0 : 1
        d += `M ${cx + f * (W / 2)} ${base} A ${rx} ${H} 0 0 ${sweep} ${cx} ${apex} `
      }
      d += `M ${cx} ${base} L ${cx} ${apex} `
      const yl = base + sg * H * 0.5
      const xl = (W / 2) * Math.sqrt(1 - 0.25)
      d += `M ${cx - xl} ${yl} L ${cx + xl} ${yl}`
      return { d }
    }),
)
</script>

<template>
  <g class="overlay">
    <defs>
      <linearGradient id="o70-heat" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff0c8" />
        <stop offset="0.25" stop-color="#e8b070" />
        <stop offset="0.5" stop-color="#9a6aa8" />
        <stop offset="0.75" stop-color="#5a78c0" />
        <stop offset="1" stop-color="#2a2830" />
      </linearGradient>
      <radialGradient id="o70-exhaust" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#fff6d8" stop-opacity="0.95" />
        <stop offset="0.3" stop-color="#ffb050" stop-opacity="0.55" />
        <stop offset="1" stop-color="#ff6010" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="o70-spill" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0.55" stop-color="#ffaa40" stop-opacity="0.35" />
        <stop offset="1" stop-color="#ff8a20" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="o70-throat" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0.7" stop-color="#000" stop-opacity="0" />
        <stop offset="0.93" stop-color="#000" stop-opacity="0.55" />
        <stop offset="1" stop-color="#000" stop-opacity="0.8" />
      </radialGradient>
      <pattern id="o70-ribs" patternUnits="userSpaceOnUse" width="9" height="9">
        <rect width="9" height="2" fill="#1a0c04" opacity="0.4" />
        <rect y="2" width="9" height="1" fill="#fff4dc" opacity="0.18" />
      </pattern>
      <linearGradient id="o70-finshade" x1="0" y1="0" x2="0.2" y2="1">
        <stop offset="0" stop-color="#fff4dc" stop-opacity="0.25" />
        <stop offset="0.3" stop-color="#000" stop-opacity="0" />
        <stop offset="1" stop-color="#140800" stop-opacity="0.5" />
      </linearGradient>
      <linearGradient id="o70-cyl" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#000" stop-opacity="0.55" />
        <stop offset="0.3" stop-color="#fff4dc" stop-opacity="0.35" />
        <stop offset="0.45" stop-color="#fff" stop-opacity="0" />
        <stop offset="1" stop-color="#000" stop-opacity="0.6" />
      </linearGradient>
      <linearGradient id="o70-soot" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0a0604" stop-opacity="0.8" />
        <stop offset="0.25" stop-color="#0a0604" stop-opacity="0" />
      </linearGradient>
      <radialGradient id="o70-bowl" cx="0.45" cy="0.2" r="0.8">
        <stop offset="0" stop-color="#000" stop-opacity="0.6" />
        <stop offset="0.6" stop-color="#000" stop-opacity="0.15" />
        <stop offset="1" stop-color="#fff4dc" stop-opacity="0.3" />
      </radialGradient>
      <linearGradient id="o70-post" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#3a2416" />
        <stop offset="0.4" stop-color="#7a5236" />
        <stop offset="1" stop-color="#1a0e06" />
      </linearGradient>
    </defs>

    <!-- amber cabin light round the windows -->
    <path v-for="(s, i) in spills" :key="`sp${i}`" :d="s.d" fill-rule="evenodd" fill="url(#o70-spill)" style="mix-blend-mode: screen" />

    <!-- the windscreen's two posts: three panes, as the cockpit has -->
    <path
      v-for="k in [1, 2]"
      :key="`po${k}`"
      :d="`M ${deck[0] + ((deck[2] - deck[0]) * k) / 3 - 4 + (k - 1.5) * 6} ${deck[1] - 6} h 8 l ${-(k - 1.5) * 6} ${deck[3] - deck[1] + 12} h -8 Z`"
      fill="url(#o70-post)"
    />

    <!-- heat-blued nozzles: straw at the throat, bronze, violet, blue, soot at the lip; a glint; the hot mouth -->
    <g v-for="(b, i) in nozzles" :key="`nz${i}`" :transform="b.t">
      <path :d="b.d" fill="url(#o70-heat)" opacity="0.8" style="mix-blend-mode: multiply" />
      <path :d="b.d" fill="url(#tx-brushed)" opacity="0.35" style="mix-blend-mode: overlay" />
      <path :d="b.hi" fill="none" stroke="#fff6e0" stroke-width="2.5" stroke-linecap="round" opacity="0.5" />
      <ellipse cx="0" :cy="b.L" :rx="b.mw * 0.42" :ry="Math.max(4, b.mw * 0.12)" fill="url(#o70-exhaust)" style="mix-blend-mode: screen" />
    </g>

    <!-- the turbines: a shadowed throat under the cowling's lip, a glint on the spinner -->
    <g v-for="(t, i) in turbines" :key="`tu${i}`">
      <circle :cx="t.cx" :cy="t.cy" :r="t.r" fill="url(#o70-throat)" />
      <path :d="`M ${t.cx - t.r * 0.8} ${t.cy - t.r * 0.45} A ${t.r * 0.92} ${t.r * 0.92} 0 0 1 ${t.cx + t.r * 0.55} ${t.cy - t.r * 0.78}`" fill="none" stroke="#fff6e0" stroke-width="2" stroke-linecap="round" opacity="0.45" />
    </g>

    <!-- the fins as radiator panels: ribs, light from above, a lit leading edge (inside the fin however it flexes) -->
    <g v-for="f in fins" :key="f.id">
      <clipPath :id="`o70-fa-${f.id}`"><path :d="f.lo" /></clipPath>
      <clipPath :id="`o70-fb-${f.id}`"><path :d="f.hi" /></clipPath>
      <g :clip-path="`url(#o70-fa-${f.id})`">
        <g :clip-path="`url(#o70-fb-${f.id})`">
          <rect :x="f.x" :y="f.y" :width="f.w" :height="f.h" fill="url(#o70-ribs)" />
          <rect :x="f.x" :y="f.y" :width="f.w" :height="f.h" fill="url(#o70-finshade)" />
        </g>
      </g>
    </g>
    <!-- the stacks: round funnels, sooty at the lip -->
    <g v-for="(f, i) in stacks" :key="`st${i}`">
      <path :d="f.d" fill="url(#o70-cyl)" />
      <path :d="f.d" fill="url(#o70-soot)" />
    </g>
    <!-- the dishes: a deep bowl, a lit rim, ribs -->
    <g v-for="(d, i) in dishes" :key="`di${i}`">
      <path :d="d.d" fill="url(#o70-bowl)" />
      <path :d="d.d" fill="url(#tx-speckle)" opacity="0.5" style="mix-blend-mode: multiply" />
      <path :d="d.rim" stroke="#fff4dc" stroke-width="2" opacity="0.6" />
    </g>
    <!-- the domes' frames -->
    <path v-for="(d, i) in domes" :key="`do${i}`" :d="d.d" fill="none" stroke="#1a120b" stroke-width="2.4" opacity="0.7" />

    <!-- grime on the vents' plates -->
    <rect v-for="(v, i) in vents" :key="`ve${i}`" :x="v[0]" :y="(v[1] + v[3]) / 2 - 18" :width="v[2] - v[0]" height="36" rx="18" fill="url(#tx-speckle)" opacity="0.45" style="mix-blend-mode: multiply" />
  </g>
</template>
