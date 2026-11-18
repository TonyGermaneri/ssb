<script setup lang="ts">
import type { Era } from '../../lib/voyage/ship'

/**
 * The THIRTIES ship's detail over its parts (lib/voyage/eras/e2030.ts): what makes the parts sit in the photograph --
 * the flight deck's two trapezoid panes (its upper corners cut by the frame, the slim centre pillar, as the cockpit's),
 * a glass reflection and a lit seal round each window, a hairline seal round each collar, and one film of light over
 * the whole hull (the sun's warmth at the upper left, the shade toward the belly). Thin, translucent, off the moving
 * bits; never takes the pointer.
 */
const props = defineProps<{ era: Era }>()
const parts = props.era.parts

const CY = -30
const R = 158
const TAIL = -704
const NOSE0 = 380
const TIP = 806
const LN = TIP - NOSE0
const RHO = (R * R + LN * LN) / (2 * R)
function h(x: number) {
  if (x <= NOSE0) return R
  const s = Math.min(LN, x - NOSE0)
  return Math.max(0, Math.sqrt(RHO * RHO - s * s) - (RHO - R))
}
const f = (v: number) => v.toFixed(1)
const XS = [TAIL, NOSE0, ...Array.from({ length: 24 }, (_, i) => NOSE0 + ((i + 1) / 24) * (LN - 4))]
const HULL = `M ${TAIL} ${CY - R} ${XS.slice(1)
  .map((x) => `L ${f(x)} ${f(CY - h(x))}`)
  .join(' ')} Q ${TIP + 3} ${CY} ${f(XS[XS.length - 1])} ${f(CY + h(XS[XS.length - 1]))} ${XS.slice(1)
  .reverse()
  .map((x) => `L ${f(x)} ${f(CY + h(x))}`)
  .join(' ')} L ${TAIL} ${CY + R} Z`

const WINDOWS = parts
  .filter((p) => p.form === 'window')
  .map((p) => {
    const [x0, y0, x1, y1] = p.rect
    const deck = p.vco === 0
    // the flight deck's panes lean in at the top, as the cockpit's do
    const s = deck ? 13 : 0
    const cx = (x0 + x1) / 2
    return {
      p,
      deck,
      x0,
      y0,
      x1,
      y1,
      cx,
      cut: deck ? `M ${x0 - 3} ${y0 - 3} H ${x0 + s} L ${x0 - 3} ${y1 - 8} Z M ${x1 + 3} ${y0 - 3} H ${x1 - s} L ${x1 + 3} ${y1 - 8} Z` : '',
      edge: deck ? `M ${x0 + s} ${y0} L ${x0} ${y1 - 8} M ${x1 - s} ${y0} L ${x1} ${y1 - 8}` : '',
      glare: `M ${x0 + (x1 - x0) * 0.56} ${y0} L ${x0 + (x1 - x0) * 0.66} ${y0} L ${x0 + (x1 - x0) * 0.5} ${y1} L ${x0 + (x1 - x0) * 0.42} ${y1} Z`,
    }
  })
const COLLARS = parts.filter((p) => p.form === 'rotor')
const GLINTS = [
  { x: -612, y: CY - R + 1, r: 5 },
  { x: 152, y: CY - R + 1, r: 3.2 },
  { x: 452, y: CY - h(452) + 2, r: 2.6 },
]
/** the domes' base bands (VoyageShip draws them flat, in the section's colour): machined steel over them */
const DOME_BASES = parts
  .filter((p) => p.form === 'dome' && p.variant !== 'bubble')
  .map((p) => ({ id: p.id, x: p.rect[0] - 16, y: p.variant === 'down' ? p.rect[1] - 11 : p.rect[3] - 9, w: p.rect[2] - p.rect[0] + 32 }))
/** the domes' glass, for a glint (VoyageShip's domePath: a half ellipse on its base) */
const DOMES = parts
  .filter((p) => p.form === 'dome')
  .map((p) => {
    const [x0, y0, x1, y1] = p.rect
    const rx = (x1 - x0) / 2
    const cx = x0 + rx
    const down = p.variant === 'down'
    const ry = (y1 - y0) * (down ? 1 : 1) - 4
    const by = down ? y0 : y1
    const s = down ? 1 : -1
    // an arc over the upper left of the glass (or, hanging, its lower left: the sun still from up left)
    const a0 = down ? Math.PI * 0.62 : Math.PI * 1.08
    const a1 = down ? Math.PI * 0.85 : Math.PI * 1.38
    const pt = (a: number) => `${(cx + Math.cos(a) * (rx - 5)).toFixed(1)} ${(by + Math.abs(Math.sin(a)) * ry * s).toFixed(1)}`
    const shape = down ? `M ${x0} ${y0} A ${rx} ${y1 - y0} 0 0 0 ${x1} ${y0} Z` : `M ${x0} ${y1} A ${rx} ${y1 - y0} 0 0 1 ${x1} ${y1} Z`
    return { id: p.id, shape, rim: `M ${pt(a0)} A ${rx - 5} ${ry} 0 0 ${down ? 1 : 1} ${pt(a1)}`, gx: cx - rx * 0.4, gy: by + s * ry * 0.62 }
  })
/** the vents' nozzles (VoyageShip's ventsSlots): recessed, sooted */
const NOZZLES = parts
  .filter((p) => p.form === 'vents')
  .flatMap((p) => {
    const [x0, y0, x1, y1] = p.rect
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    const col = p.variant === 'column'
    const pts = col ? [0, 1, 2].map((i) => ({ x: cx, y: y0 + 40 + i * ((y1 - y0 - 80) / 2) })) : [0, 1, 2, 3, 4].map((i) => ({ x: x0 + 26 + i * ((x1 - x0 - 52) / 4), y: cy }))
    return pts.map((q, i) => ({ key: `${p.id}-${i}`, ...q, r: col ? 21 : 12 }))
  })
</script>

<template>
  <g class="o30">
    <defs>
      <linearGradient id="o30-sun" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff3df" stop-opacity="0.16" />
        <stop offset="0.35" stop-color="#fff3df" stop-opacity="0" />
        <stop offset="0.7" stop-color="#000" stop-opacity="0" />
        <stop offset="1" stop-color="#000" stop-opacity="0.2" />
      </linearGradient>
      <linearGradient id="o30-glass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#dfe9f2" stop-opacity="0.16" />
        <stop offset="0.5" stop-color="#dfe9f2" stop-opacity="0.03" />
        <stop offset="1" stop-color="#dfe9f2" stop-opacity="0" />
      </linearGradient>
      <radialGradient id="o30-nozzle" cx="0.55" cy="0.6" r="0.6">
        <stop offset="0" stop-color="#000" />
        <stop offset="0.55" stop-color="#0d0e10" />
        <stop offset="0.8" stop-color="#3a3d42" />
        <stop offset="1" stop-color="#c3c8ce" />
      </radialGradient>
      <linearGradient id="o30-collar" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f2f4f6" />
        <stop offset="0.3" stop-color="#a2a8ae" />
        <stop offset="0.7" stop-color="#5a5f65" />
        <stop offset="1" stop-color="#25282c" />
      </linearGradient>
      <linearGradient id="o30-smoke" x1="0.2" y1="0" x2="0.8" y2="1">
        <stop offset="0" stop-color="#cfe3f5" stop-opacity="0.16" />
        <stop offset="0.35" stop-color="#0a1016" stop-opacity="0.22" />
        <stop offset="1" stop-color="#000" stop-opacity="0.45" />
      </linearGradient>
      <radialGradient id="o30-glint" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#fff" stop-opacity="0.95" />
        <stop offset="0.2" stop-color="#fff6e8" stop-opacity="0.35" />
        <stop offset="1" stop-color="#fff6e8" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="o30-pillar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#3b3f45" />
        <stop offset="0.4" stop-color="#e9ecef" />
        <stop offset="1" stop-color="#55595f" />
      </linearGradient>
    </defs>

    <!-- one film of light over the whole hull and everything on it -->
    <path :d="HULL" fill="url(#o30-sun)" />

    <g v-for="w in WINDOWS" :key="w.p.id">
      <!-- the flight deck: the frame cutting its upper corners, the centre pillar -->
      <template v-if="w.deck">
        <path :d="w.cut" fill="#1a1c1f" />
        <path :d="w.edge" stroke="#d9dde1" stroke-width="1.4" stroke-opacity="0.8" />
        <rect :x="w.cx - 2.2" :y="w.y0 - 2" width="4.4" :height="w.y1 - w.y0 + 4" fill="url(#o30-pillar)" />
      </template>
      <!-- the glass: a faint sky reflection at the top, one diagonal glare, the seal lit along the top -->
      <rect :x="w.x0" :y="w.y0" :width="w.x1 - w.x0" :height="(w.y1 - w.y0) * 0.5" rx="14" fill="url(#o30-glass)" />
      <path :d="w.glare" fill="#fff" opacity="0.045" />
      <path :d="`M ${w.x0 + 18} ${w.y0 - 1} H ${w.x1 - 18}`" stroke="#fff" stroke-width="1" stroke-opacity="0.5" />
    </g>

    <!-- the domes' machined base bands -->
    <g v-for="b in DOME_BASES" :key="b.id">
      <rect :x="b.x" :y="b.y" :width="b.w" height="20" rx="3" fill="url(#o30-collar)" />
      <rect :x="b.x" :y="b.y" :width="b.w" height="20" rx="3" fill="url(#tx-brushed)" opacity="0.5" style="mix-blend-mode: overlay" />
      <circle v-for="k in 7" :key="k" :cx="b.x + 8 + ((b.w - 16) * (k - 1)) / 6" :cy="b.y + 10" r="1.5" fill="#1a1c1f" />
    </g>
    <!-- the domes' glass: a hard sun glint and a thin rim of light at the upper left -->
    <g v-for="d in DOMES" :key="`g${d.id}`">
      <path :d="d.shape" fill="url(#o30-smoke)" />
      <path :d="d.rim" fill="none" stroke="#fff" stroke-width="1.6" stroke-opacity="0.55" stroke-linecap="round" />
      <ellipse :cx="d.gx" :cy="d.gy" rx="7" ry="3.5" :transform="`rotate(-35 ${d.gx} ${d.gy})`" fill="#fff" opacity="0.5" />
    </g>
    <!-- the vents' nozzles -->
    <circle v-for="n in NOZZLES" :key="n.key" :cx="n.x" :cy="n.y" :r="n.r" fill="url(#o30-nozzle)" />

    <!-- the sun catching the hull's top edge: a hard glint with its diffraction spikes -->
    <g v-for="(g, i) in GLINTS" :key="`gl${i}`" :transform="`translate(${g.x} ${g.y})`" style="mix-blend-mode: screen">
      <circle :r="g.r * 3" fill="url(#o30-glint)" opacity="0.6" />
      <path :d="`M ${-g.r * 7} 0 H ${g.r * 7} M 0 ${-g.r * 3.5} V ${g.r * 3.5}`" stroke="#fff" stroke-width="0.8" stroke-opacity="0.55" />
      <circle :r="g.r * 0.5" fill="#fff" />
    </g>

    <!-- each collar's seal, lit at the top left -->
    <ellipse
      v-for="p in COLLARS"
      :key="p.id"
      :cx="(p.rect[0] + p.rect[2]) / 2"
      :cy="(p.rect[1] + p.rect[3]) / 2"
      :rx="p.variant === 'ring' ? (p.rect[2] - p.rect[0]) / 2 - 1 : Math.min(p.rect[2] - p.rect[0], p.rect[3] - p.rect[1]) / 2 - 1"
      :ry="p.variant === 'ring' ? (p.rect[3] - p.rect[1]) / 2 - 1 : Math.min(p.rect[2] - p.rect[0], p.rect[3] - p.rect[1]) / 2 - 1"
      fill="none"
      stroke="#fff"
      stroke-width="0.9"
      stroke-opacity="0.35"
      stroke-dasharray="40 400"
    />
  </g>
</template>
