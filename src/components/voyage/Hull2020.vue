<script setup lang="ts">
import type { Era, Part } from '../../lib/voyage/ship'

/**
 * The TWENTIES ship's hull (lib/voyage/eras/e2020.ts): a graphite pebble (soft-touch, the cockpit's cabin) under
 * layered frosted-glass shells -- an outer shell over its back with a bright top edge, and a tinted glass card per
 * section (violet bow, mint midships, coral stern) floating on it, each lit from beneath by its own underglow and
 * edged with a hairline of its colour, electric-blue seams between them -- a panoramic soft-cornered canopy amidships
 * framed as the cockpit frames its windscreen (thick graphite, an iridescent hairline, a sensor pill), a glass engine
 * pod aft on its strut, a frosted nose round the halo ring, soft wells under every part, thin lettering, pills of
 * light, and the aurora outside reflecting across the glass. The frost is faked: layered translucent gradients and
 * the noise tile, no filters. Static.
 */
const props = defineProps<{ era: Era }>()
const P = props.era.palettes
const parts = props.era.parts
const VC = P.map((p) => p.main)

const f = (v: number) => +v.toFixed(1)
const N = (n: number) => Array.from({ length: n }, (_, i) => i)
const rr = (x0: number, y0: number, x1: number, y1: number, r: number) => {
  r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2)
  return `M ${f(x0 + r)} ${f(y0)} H ${f(x1 - r)} Q ${f(x1)} ${f(y0)} ${f(x1)} ${f(y0 + r)} V ${f(y1 - r)} Q ${f(x1)} ${f(y1)} ${f(x1 - r)} ${f(y1)} H ${f(x0 + r)} Q ${f(x0)} ${f(y1)} ${f(x0)} ${f(y1 - r)} V ${f(y0 + r)} Q ${f(x0)} ${f(y0)} ${f(x0 + r)} ${f(y0)} Z`
}
const byKind = (vco: number, kind: string) => parts.find((p) => p.vco === vco && p.kind === kind)!
const C = (p: Part) => ({ x: (p.rect[0] + p.rect[2]) / 2, y: (p.rect[1] + p.rect[3]) / 2, w: p.rect[2] - p.rect[0], h: p.rect[3] - p.rect[1] })

// ── the pebble ──
const HULL =
  'M -722 -8 C -722 -112 -640 -170 -500 -174 L 300 -178 C 520 -174 700 -132 792 -46 C 820 -22 820 6 792 26 C 700 102 520 142 300 152 L -500 152 C -640 148 -722 92 -722 -8 Z'
/** the outer frosted shell: over the back, down to a soft line along the flank */
const SHELL =
  'M -734 -8 C -734 -120 -646 -184 -500 -188 L 300 -192 C 528 -188 712 -142 806 -52 C 822 -36 826 -22 824 -10 C 700 -60 520 -86 300 -88 L -500 -84 C -640 -80 -716 -48 -734 -8 Z'
/** the belly's glass plate */
const BELLY = 'M -660 96 C -560 140 -500 148 -300 150 L 300 148 C 480 140 620 112 720 62 C 640 120 500 156 300 164 L -500 166 C -580 162 -630 138 -660 96 Z'

// ── the canopy: the cockpit's windscreen, from outside ──
const CANOPY = 'M -232 -362 L 232 -362 Q 274 -362 276 -322 L 278 -232 Q 279 -184 246 -180 Q 0 -150 -246 -180 Q -279 -184 -278 -232 L -276 -322 Q -274 -362 -232 -362 Z'
const FAIRING = 'M -352 -168 C -306 -172 -296 -214 -284 -262 L 284 -262 C 296 -214 306 -172 352 -168 Z'

// ── the engine pod aft, on its strut ──
const tur = byKind(2, 'grain')
const TC = C(tur)
const POD = { x0: TC.x - 100, y0: TC.y - 86, x1: TC.x + 98, y1: TC.y + 84 }
const STRUT = `M ${TC.x - 46} ${POD.y1 - 10} C ${TC.x - 40} ${POD.y1 + 30} ${TC.x - 60} -150 ${TC.x - 80} -140 L ${TC.x + 70} -150 C ${TC.x + 50} -160 ${TC.x + 40} ${POD.y1 + 26} ${TC.x + 46} ${POD.y1 - 10} Z`

// ── the cards ──
const CARDS = [
  { vco: 0, x0: 282, x1: 616, y0: -130, y1: 126, name: 'BOW', tint: 'VIOLET' },
  { vco: 1, x0: -262, x1: 262, y0: -150, y1: 130, name: 'MIDSHIPS', tint: 'MINT' },
  { vco: 2, x0: -700, x1: -282, y0: -134, y1: 128, name: 'STERN', tint: 'CORAL' },
]
const SEAMS = [-272, 272]

// ── the wells under the parts ──
interface Well {
  d: string
}
const wells: Well[] = []
for (const v of [0, 1, 2]) {
  const win = byKind(v, 'perform')
  const lamps = byKind(v, 'garden')
  const vents = byKind(v, 'texture')
  if (v !== 1) {
    const [x0, y0, x1] = win.rect
    const h = win.rect[3] - y0
    wells.push({ d: rr(x0 - 10, y0 - 10, x1 + 10, lamps.rect[3] + 10, h / 2 + 10) })
  }
  const c = C(vents)
  wells.push({ d: vents.variant === 'row' ? rr(vents.rect[0] - 6, c.y - 25, vents.rect[2] + 6, c.y + 25, 25) : rr(c.x - 37, vents.rect[1] - 4, c.x + 37, vents.rect[3] + 4, 37) })
}
const core = C(byKind(1, 'grain'))
const CORE = { x: core.x, y: core.y, r: Math.min(core.w, core.h) / 2 + 10 }
const halo = C(byKind(0, 'grain'))
/** the domes hanging under the hull: a soft collar each */
const collars = parts.filter((p) => p.form === 'dome' && p.variant === 'down').map((p) => ({ ...C(p), y0: p.rect[1], vco: p.vco }))
/** where masts, struts and fins come through: a pill of glass each */
const mounts = parts
  .filter((p) => p.back && (p.form === 'antenna' || p.form === 'swinger' || p.form === 'fin' || p.form === 'funnel'))
  .map((p) => {
    const c = C(p)
    const top = p.rect[3] < -100
    const w = p.form === 'fin' ? Math.min(110, c.w * 0.5) : p.form === 'funnel' ? c.w - 8 : 48
    const x = p.form === 'fin' ? p.rect[0] + c.w * 0.18 : c.x - w / 2
    if (p.form === 'funnel' && p.dir === 180) return null
    const y = top ? p.rect[3] - 14 : p.rect[1] + (p.form === 'funnel' ? -4 : 2)
    return { d: rr(x, y, x + w, y + 18, 9), vco: p.vco, top }
  })
  .filter((m): m is NonNullable<typeof m> => !!m)
/** the stern's drive collars, over the bells' throats */
const drives = byKind(2, 'pitch')
const DR = { x0: drives.rect[2] - 34, y0: drives.rect[1] - 2, x1: drives.rect[2] + 18, y1: drives.rect[3] + 2 }

/** a fin's resting outline (VoyageShip's finPath at mid 0), for the glass laid over it */
function finRest(p: Part) {
  const [x0, y0, x1, y1] = p.rect
  const W = x1 - x0
  const H = y1 - y0
  const X = (n: number) => n * Math.min(1.6, W / 200)
  const Y = (n: number) => n * Math.min(1.6, H / 150)
  if (p.variant === 'wing') return `M ${x1 - X(10)} ${y0 + Y(20)} C ${x1 + X(6)} ${y0 + Y(80)} ${x1 - X(20)} ${y1 - Y(40)} ${x0 + X(30)} ${y1 - Y(6)} C ${x0 + X(6)} ${y1 - Y(30)} ${x0 + X(20)} ${y0 + Y(90)} ${x0 + X(40)} ${y0 + Y(10)} Z`
  if (p.variant === 'keel') return `M ${x0 + X(10)} ${y0} L ${x1 - X(6)} ${y0} C ${x1 - X(30)} ${y0 + Y(50)} ${x1 - X(50)} ${y1 - Y(30)} ${x1 - X(90)} ${y1} L ${x0 + X(70)} ${y1 - Y(10)} C ${x0 + X(40)} ${y1 - Y(50)} ${x0 + X(20)} ${y0 + Y(50)} ${x0 + X(10)} ${y0} Z`
  if (p.variant === 'delta') return `M ${x0 + X(8)} ${y0} L ${x1 - X(4)} ${y0} C ${x1 - X(20)} ${y0 + H * 0.45} ${x0 + W * 0.4} ${y1 - Y(10)} ${x0 + X(6)} ${y1} C ${x0 + X(14)} ${y0 + H * 0.6} ${x0 + X(10)} ${y0 + Y(30)} ${x0 + X(8)} ${y0} Z`
  return `M ${x1 - X(8)} ${y0} L ${x0 + X(60)} ${y0 + Y(10)} C ${x0 + X(20)} ${y0 + Y(60)} ${x0} ${y1 - Y(30)} ${x0 + X(10)} ${y1} L ${x1 - X(60)} ${y1 - Y(30)} C ${x1 - X(30)} ${y1 - Y(80)} ${x1 - X(10)} ${y0 + Y(60)} ${x1 - X(8)} ${y0} Z`
}
const fins = parts.filter((p) => p.form === 'fin').map((p) => ({ id: p.id, vco: p.vco, d: finRest(p), t: p.flip === 'x' ? `translate(${p.rect[0] + p.rect[2]} 0) scale(-1 1)` : '' }))
/** frosted sleeves over the throats of the bells that hang below */
const sleeves = parts
  .filter((p) => p.form === 'funnel' && p.variant === 'bells' && (p.dir === 90 || p.dir === 180))
  .flatMap((p) => {
    const n = Math.max(1, p.n)
    const down = p.dir === 90
    const slot = (down ? p.rect[2] - p.rect[0] : p.rect[3] - p.rect[1]) / n
    const len = (down ? p.rect[3] - p.rect[1] : p.rect[2] - p.rect[0]) * 0.42
    return N(n).map((i) => {
      const w = slot * 0.66
      if (down) {
        const cx = p.rect[0] + slot * (i + 0.5)
        return { d: rr(cx - w / 2, p.rect[1] - 8, cx + w / 2, p.rect[1] + len, w / 2), vco: p.vco }
      }
      const cy = p.rect[1] + slot * (i + 0.5)
      return { d: rr(p.rect[2] - len, cy - w / 2, p.rect[2] + 8, cy + w / 2, w / 2), vco: p.vco }
    })
  })
/** running lights: pills along the flank */
const PILLS = [-560, -440, -160, -40, 80, 200, 380, 500].map((x, i) => ({ x, c: VC[x < -272 ? 2 : x < 272 ? 1 : 0], i }))
</script>

<template>
  <g class="hull">
    <defs>
      <linearGradient id="h20-graphite" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#22243a" />
        <stop offset="0.3" stop-color="#0f1018" />
        <stop offset="0.75" stop-color="#06070b" />
        <stop offset="1" stop-color="#151229" />
      </linearGradient>
      <linearGradient id="h20-iris" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ff8f80" />
        <stop offset="0.3" stop-color="#a08cff" />
        <stop offset="0.5" stop-color="#4d7cff" />
        <stop offset="0.72" stop-color="#5ef0c4" />
        <stop offset="1" stop-color="#a08cff" />
      </linearGradient>
      <linearGradient id="h20-frost" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.14" />
        <stop offset="0.35" stop-color="#ffffff" stop-opacity="0.05" />
        <stop offset="1" stop-color="#ffffff" stop-opacity="0.02" />
      </linearGradient>
      <linearGradient id="h20-shell" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.2" />
        <stop offset="0.25" stop-color="#ffffff" stop-opacity="0.06" />
        <stop offset="1" stop-color="#ffffff" stop-opacity="0.01" />
      </linearGradient>
      <linearGradient id="h20-edge" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.6" />
        <stop offset="0.25" stop-color="#ffffff" stop-opacity="0.16" />
        <stop offset="0.8" stop-color="#ffffff" stop-opacity="0.05" />
        <stop offset="1" stop-color="#ffffff" stop-opacity="0.22" />
      </linearGradient>
      <linearGradient id="h20-well" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000" stop-opacity="0.5" />
        <stop offset="1" stop-color="#000" stop-opacity="0.2" />
      </linearGradient>
      <linearGradient id="h20-wellEdge" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000" stop-opacity="0.6" />
        <stop offset="1" stop-color="#fff" stop-opacity="0.22" />
      </linearGradient>
      <linearGradient id="h20-frame" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3a3d52" />
        <stop offset="0.5" stop-color="#15161f" />
        <stop offset="1" stop-color="#2a2c3c" />
      </linearGradient>
      <linearGradient id="h20-pod" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#34364a" />
        <stop offset="0.5" stop-color="#171822" />
        <stop offset="1" stop-color="#0c0d13" />
      </linearGradient>
      <linearGradient id="h20-auroraSweep" x1="0" y1="0" x2="1" y2="0.5">
        <stop offset="0" stop-color="#ff5f72" stop-opacity="0" />
        <stop offset="0.2" stop-color="#ff5f72" stop-opacity="0.35" />
        <stop offset="0.38" stop-color="#7b5cff" stop-opacity="0.08" />
        <stop offset="0.55" stop-color="#2f6bff" stop-opacity="0.4" />
        <stop offset="0.7" stop-color="#14b8a6" stop-opacity="0.12" />
        <stop offset="0.85" stop-color="#5ef0c4" stop-opacity="0.32" />
        <stop offset="1" stop-color="#5ef0c4" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="h20-sheen" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0" />
        <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.07" />
        <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
      </linearGradient>
      <radialGradient id="h20-shadow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#000" stop-opacity="0.75" />
        <stop offset="1" stop-color="#000" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="h20-blue" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#4d7cff" stop-opacity="0.6" />
        <stop offset="1" stop-color="#4d7cff" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="h20-spec" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.55" />
        <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
      </radialGradient>
      <template v-for="v in [0, 1, 2]" :key="`g${v}`">
        <radialGradient :id="`h20-tint${v}`" cx="0.15" cy="0" r="1.15">
          <stop offset="0" :stop-color="VC[v]" stop-opacity="0.6" />
          <stop offset="0.45" :stop-color="VC[v]" stop-opacity="0.2" />
          <stop offset="1" :stop-color="VC[v]" stop-opacity="0.04" />
        </radialGradient>
        <radialGradient :id="`h20-under${v}`" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" :stop-color="VC[v]" stop-opacity="0.6" />
          <stop offset="0.45" :stop-color="VC[v]" stop-opacity="0.18" />
          <stop offset="1" :stop-color="VC[v]" stop-opacity="0" />
        </radialGradient>
        <linearGradient :id="`h20-floor${v}`" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" :stop-color="VC[v]" stop-opacity="0" />
          <stop offset="1" :stop-color="VC[v]" stop-opacity="0.24" />
        </linearGradient>
        <linearGradient :id="`h20-hair${v}`" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" :stop-color="VC[v]" stop-opacity="0" />
          <stop offset="0.5" :stop-color="VC[v]" stop-opacity="1" />
          <stop offset="1" :stop-color="VC[v]" stop-opacity="0" />
        </linearGradient>
      </template>
      <clipPath id="h20-hull"><path :d="HULL" /></clipPath>
      <clipPath id="h20-canopy"><path :d="CANOPY" /></clipPath>
      <clipPath v-for="c in CARDS" :id="`h20-card${c.vco}`" :key="`cc${c.vco}`"><rect :x="c.x0" :y="c.y0" :width="c.x1 - c.x0" :height="c.y1 - c.y0" rx="32" /></clipPath>
    </defs>

    <!-- ── the underglows: each section's light pooling beneath the ship, and the blue between ── -->
    <g style="mix-blend-mode: screen">
      <ellipse cx="-480" cy="170" rx="420" ry="190" fill="url(#h20-under2)" />
      <ellipse cx="0" cy="180" rx="420" ry="190" fill="url(#h20-under1)" />
      <ellipse cx="480" cy="150" rx="420" ry="180" fill="url(#h20-under0)" />
      <ellipse cx="-480" cy="160" rx="300" ry="60" fill="url(#h20-under2)" />
      <ellipse cx="0" cy="166" rx="300" ry="60" fill="url(#h20-under1)" />
      <ellipse cx="480" cy="140" rx="300" ry="56" fill="url(#h20-under0)" />
      <ellipse cx="-230" cy="190" rx="300" ry="90" fill="url(#h20-blue)" opacity="0.6" />
      <ellipse cx="260" cy="180" rx="300" ry="90" fill="url(#h20-blue)" opacity="0.6" />
    </g>
    <!-- glass laid over the fins: frost, a bright leading edge (the stripes still show through) -->
    <g v-for="fn in fins" :key="fn.id" :transform="fn.t">
      <path :d="fn.d" fill="url(#h20-frost)" />
      <path :d="fn.d" fill="url(#tx-noise)" opacity="0.25" style="mix-blend-mode: soft-light" />
      <path :d="fn.d" fill="none" stroke="url(#h20-edge)" stroke-width="1.4" />
    </g>
    <!-- frosted sleeves over the hanging bells' throats -->
    <g v-for="(sl, i) in sleeves" :key="`sl${i}`">
      <path :d="sl.d" fill="#0b0c14" opacity="0.55" />
      <path :d="sl.d" :fill="`url(#h20-tint${sl.vco})`" />
      <path :d="sl.d" fill="url(#h20-frost)" />
      <path :d="sl.d" fill="none" stroke="url(#h20-edge)" stroke-width="1.2" />
    </g>
    <!-- a soft shadow under the pod and the canopy -->
    <ellipse :cx="TC.x" :cy="POD.y1 + 4" rx="110" ry="18" fill="url(#h20-shadow)" opacity="0.6" />

    <!-- ── the engine pod aft: graphite in glass, on its strut ── -->
    <path :d="STRUT" fill="url(#h20-pod)" />
    <path :d="STRUT" fill="url(#h20-frost)" />
    <path :d="rr(POD.x0, POD.y0, POD.x1, POD.y1, 84)" fill="url(#h20-pod)" />
    <path :d="rr(POD.x0, POD.y0, POD.x1, POD.y1, 84)" fill="url(#tx-noise)" opacity="0.2" style="mix-blend-mode: overlay" />
    <path :d="rr(POD.x0, POD.y0, POD.x1, POD.y1, 84)" fill="url(#h20-tint2)" />
    <path :d="rr(POD.x0, POD.y0, POD.x1, POD.y1, 84)" fill="url(#h20-frost)" />
    <path :d="rr(POD.x0 + 0.75, POD.y0 + 0.75, POD.x1 - 0.75, POD.y1 - 0.75, 83)" fill="none" stroke="url(#h20-edge)" stroke-width="1.5" />
    <circle :cx="TC.x" :cy="TC.y" :r="Math.min(TC.w, TC.h) / 2 + 6" fill="url(#h20-well)" stroke="url(#h20-wellEdge)" stroke-width="1" />
    <circle :cx="TC.x" :cy="TC.y" :r="Math.min(TC.w, TC.h) / 2 + 2" fill="none" :stroke="VC[2]" stroke-width="1.2" opacity="0.7" />
    <rect :x="POD.x0 + 50" :y="POD.y0 - 0.5" :width="POD.x1 - POD.x0 - 100" height="2" rx="1" fill="url(#h20-hair2)" />

    <!-- ── the canopy's fairing, frosted, rising from the hull ── -->
    <path :d="FAIRING" fill="url(#h20-graphite)" />
    <path :d="FAIRING" fill="url(#h20-frost)" />

    <!-- ── the pebble: soft-touch graphite ── -->
    <path :d="HULL" fill="url(#h20-graphite)" />
    <path :d="HULL" fill="url(#tx-noise)" opacity="0.22" style="mix-blend-mode: overlay" />
    <g clip-path="url(#h20-hull)">
      <!-- the underglows, bounced up onto its belly -->
      <ellipse cx="-470" cy="170" rx="360" ry="70" fill="url(#h20-under2)" opacity="0.8" />
      <ellipse cx="0" cy="175" rx="360" ry="70" fill="url(#h20-under1)" opacity="0.8" />
      <ellipse cx="480" cy="150" rx="320" ry="60" fill="url(#h20-under0)" opacity="0.8" />
      <!-- the aurora across its flank -->
      <path d="M -900 -200 L 900 -60 L 900 40 L -900 -100 Z" fill="url(#h20-auroraSweep)" opacity="0.35" style="mix-blend-mode: screen" />
      <!-- the belly's glass plate, the waterline seam -->
      <path :d="BELLY" fill="url(#h20-frost)" />
      <path d="M -680 112 C -560 150 -480 156 -300 158 L 300 156 C 480 148 620 116 740 60" fill="none" stroke="url(#h20-iris)" stroke-width="1.4" opacity="0.8" />
      <path d="M -680 112 C -560 150 -480 156 -300 158 L 300 156 C 480 148 620 116 740 60" fill="none" stroke="url(#h20-iris)" stroke-width="6" opacity="0.15" />
    </g>

    <!-- ── the outer glass casing round it all: only its edges catch the light ── -->
    <path :d="HULL" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.18" transform="translate(-14 -2) scale(1.018 1.09)" />
    <path :d="HULL" fill="none" stroke="url(#h20-iris)" stroke-width="3" opacity="0.12" transform="translate(-14 -2) scale(1.018 1.09)" />
    <!-- ── the outer frosted shell over its back ── -->
    <path :d="SHELL" fill="url(#h20-shell)" />
    <path :d="SHELL" fill="url(#tx-noise)" opacity="0.18" style="mix-blend-mode: soft-light" />
    <path d="M -726 -30 C -712 -126 -640 -180 -500 -184 L 300 -188 C 528 -184 708 -140 800 -56" fill="none" stroke="#ffffff" stroke-width="1.6" opacity="0.55" />
    <path d="M -726 -30 C -712 -126 -640 -180 -500 -184 L 300 -188 C 528 -184 708 -140 800 -56" fill="none" stroke="url(#h20-iris)" stroke-width="5" opacity="0.18" />
    <!-- the sky's light on its crown, and on the nose's shoulder -->
    <ellipse cx="-80" cy="-180" rx="460" ry="9" fill="url(#h20-spec)" opacity="0.8" />
    <ellipse cx="-80" cy="-181" rx="260" ry="3" fill="url(#h20-spec)" />
    <ellipse cx="690" cy="-128" rx="90" ry="7" fill="url(#h20-spec)" opacity="0.7" transform="rotate(24 690 -128)" />

    <!-- ── the cards: tinted frosted glass, floating, each lit from beneath ── -->
    <g v-for="c in CARDS" :key="`card${c.vco}`">
      <ellipse :cx="(c.x0 + c.x1) / 2" :cy="c.y1 - 4" :rx="(c.x1 - c.x0) * 0.5" ry="26" :fill="`url(#h20-under${c.vco})`" opacity="0.9" />
      <rect :x="c.x0" :y="c.y0" :width="c.x1 - c.x0" :height="c.y1 - c.y0" rx="32" fill="#05060a" opacity="0.88" />
      <g :clip-path="`url(#h20-card${c.vco})`">
        <!-- its underglow through the glass, the blue between, its tint from the top corner -->
        <ellipse :cx="(c.x0 + c.x1) / 2" :cy="c.y1 + 30" :rx="(c.x1 - c.x0) * 0.62" ry="150" :fill="`url(#h20-under${c.vco})`" opacity="0.85" />
        <ellipse :cx="c.x0 + (c.x1 - c.x0) * 0.88" :cy="c.y0 + 40" :rx="(c.x1 - c.x0) * 0.36" ry="110" fill="url(#h20-blue)" opacity="0.3" />
        <rect :x="c.x0" :y="c.y0" :width="c.x1 - c.x0" :height="c.y1 - c.y0" :fill="`url(#h20-floor${c.vco})`" />
        <rect :x="c.x0" :y="c.y0" :width="c.x1 - c.x0" :height="c.y1 - c.y0" :fill="`url(#h20-tint${c.vco})`" opacity="0.75" />
        <rect :x="c.x0" :y="c.y0" :width="c.x1 - c.x0" :height="c.y1 - c.y0" fill="url(#h20-frost)" />
        <rect :x="c.x0" :y="c.y0" :width="c.x1 - c.x0" :height="c.y1 - c.y0" fill="url(#tx-noise)" opacity="0.22" style="mix-blend-mode: soft-light" />
        <rect :x="c.x0" :y="c.y0" :width="c.x1 - c.x0" :height="c.y1 - c.y0" fill="url(#tx-speckle)" opacity="0.06" style="mix-blend-mode: screen" />
        <!-- a sheen across the glass, at the light's angle -->
        <path :d="`M ${c.x0 + 40} ${c.y1} L ${c.x0 + 40 + (c.y1 - c.y0) * 0.7} ${c.y0} H ${c.x0 + 130 + (c.y1 - c.y0) * 0.7} L ${c.x0 + 130} ${c.y1} Z`" fill="url(#h20-sheen)" />
        <!-- the bottom edge's darker lip -->
        <rect :x="c.x0" :y="c.y1 - 8" :width="c.x1 - c.x0" height="8" fill="#000" opacity="0.25" />
      </g>
      <rect :x="c.x0 + 0.75" :y="c.y0 + 0.75" :width="c.x1 - c.x0 - 1.5" :height="c.y1 - c.y0 - 1.5" rx="31.25" fill="none" stroke="url(#h20-edge)" stroke-width="1.5" />
      <path :d="`M ${c.x0 + 40} ${c.y0 + 1.2} H ${c.x1 - 40}`" stroke="#fff" stroke-width="1" opacity="0.5" />
      <rect :x="c.x0 + 60" :y="c.y0 - 0.5" :width="c.x1 - c.x0 - 120" height="2" rx="1" :fill="`url(#h20-hair${c.vco})`" />
      <!-- its name, thin and wide, and a status dot -->
      <circle :cx="c.x0 + 30" :cy="c.y1 - 16" r="2.6" :fill="VC[c.vco]" />
      <circle :cx="c.x0 + 30" :cy="c.y1 - 16" r="6.5" :fill="VC[c.vco]" opacity="0.2" />
      <text :x="c.x0 + 42" :y="c.y1 - 12.5" class="name">{{ c.name }}</text>
      <text :x="c.x1 - 30" :y="c.y1 - 12.5" text-anchor="end" class="sub">VCO {{ c.vco + 1 }} · {{ c.tint }}</text>
    </g>
    <!-- the electric-blue seams between them -->
    <g v-for="x in SEAMS" :key="`s${x}`">
      <path :d="`M ${x} -170 V 146`" stroke="#4d7cff" stroke-width="7" opacity="0.18" stroke-linecap="round" />
      <path :d="`M ${x} -166 V 142`" stroke="#7fa2ff" stroke-width="1.4" stroke-linecap="round" />
      <circle :cx="x" cy="-6" r="3" fill="#cfdcff" />
      <circle :cx="x" cy="-6" r="9" fill="#4d7cff" opacity="0.3" />
    </g>

    <!-- ── the wells under the parts ── -->
    <path v-for="(w, i) in wells" :key="`w${i}`" :d="w.d" fill="url(#h20-well)" stroke="url(#h20-wellEdge)" stroke-width="1" />
    <circle :cx="CORE.x" :cy="CORE.y" :r="CORE.r + 8" :fill="`url(#h20-under1)`" opacity="0.7" />
    <circle :cx="CORE.x" :cy="CORE.y" :r="CORE.r" fill="url(#h20-well)" stroke="url(#h20-wellEdge)" stroke-width="1" />
    <circle :cx="CORE.x" :cy="CORE.y" :r="CORE.r - 5" fill="none" :stroke="VC[1]" stroke-width="1" opacity="0.6" />

    <!-- ── the frosted nose round the halo ring ── -->
    <g clip-path="url(#h20-hull)">
      <path d="M 626 -170 C 700 -140 760 -100 830 -40 L 830 60 C 760 100 700 130 626 150 Z" fill="url(#h20-tint0)" />
      <path d="M 626 -170 C 700 -140 760 -100 830 -40 L 830 60 C 760 100 700 130 626 150 Z" fill="url(#h20-frost)" />
      <path d="M 626 -170 C 700 -140 760 -100 830 -40 L 830 60 C 760 100 700 130 626 150 Z" fill="url(#tx-noise)" opacity="0.3" style="mix-blend-mode: soft-light" />
      <path d="M 626 -164 C 640 -60 640 60 626 150" fill="none" stroke="#7fa2ff" stroke-width="1.4" />
      <path d="M 626 -164 C 640 -60 640 60 626 150" fill="none" stroke="#4d7cff" stroke-width="7" opacity="0.18" />
    </g>
    <ellipse :cx="halo.x" :cy="halo.y" :rx="halo.w / 2 + 6" :ry="halo.h / 2 + 6" fill="url(#h20-well)" stroke="url(#h20-wellEdge)" stroke-width="1" />
    <!-- the nose light -->
    <circle cx="806" cy="-10" r="12" fill="url(#h20-under0)" />
    <circle cx="806" cy="-10" r="2.6" fill="#e9e4ff" />

    <!-- ── the canopy: thick soft graphite, an iridescent hairline, dark glass ── -->
    <path :d="CANOPY" fill="#06070c" />
    <g clip-path="url(#h20-canopy)">
      <ellipse cx="-120" cy="-300" rx="260" ry="90" fill="url(#h20-under0)" opacity="0.35" />
      <ellipse cx="160" cy="-220" rx="240" ry="80" fill="url(#h20-under1)" opacity="0.3" />
      <path d="M -300 -380 L 300 -300 L 300 -250 L -300 -330 Z" fill="url(#h20-auroraSweep)" opacity="0.5" />
    </g>
    <path :d="CANOPY" fill="none" stroke="#000" stroke-width="22" opacity="0.35" transform="translate(0 4)" />
    <path :d="CANOPY" fill="none" stroke="url(#h20-frame)" stroke-width="16" />
    <path :d="CANOPY" fill="none" stroke="#fff" stroke-width="0.8" opacity="0.25" transform="translate(0 -7)" />
    <path :d="CANOPY" fill="none" stroke="#000" stroke-width="3" opacity="0.6" />
    <path :d="CANOPY" fill="none" stroke="url(#h20-iris)" stroke-width="1.4" opacity="0.85" />
    <!-- the sensor pill on its top -->
    <g transform="translate(0 -362)">
      <rect x="-40" y="-8" width="80" height="16" rx="8" fill="#05060a" stroke="#ffffff" stroke-opacity="0.14" />
      <circle cx="-22" cy="0" r="3" fill="#10131f" stroke="#4d7cff" stroke-opacity="0.7" />
      <circle cx="-22" cy="0" r="1.1" fill="#8fb4ff" />
      <circle cx="0" cy="0" r="2" fill="#1a1c28" />
      <circle cx="20" cy="0" r="1.6" fill="#5ef0c4" />
    </g>

    <!-- ── mounts: a glass pill where each mast, strut and fin comes through ── -->
    <g v-for="(m, i) in mounts" :key="`m${i}`">
      <path :d="m.d" fill="url(#h20-pod)" />
      <path :d="m.d" :fill="`url(#h20-tint${m.vco})`" />
      <path :d="m.d" fill="none" stroke="url(#h20-edge)" stroke-width="1" />
    </g>
    <!-- the domes' collars under the hull -->
    <g v-for="(d, i) in collars" :key="`co${i}`">
      <ellipse :cx="d.x" :cy="d.y0 + 4" :rx="d.w / 2 + 26" ry="12" :fill="`url(#h20-under${d.vco})`" />
    </g>
    <!-- the stern's drive collars -->
    <path :d="rr(DR.x0, DR.y0, DR.x1, DR.y1, 24)" fill="url(#h20-pod)" />
    <path :d="rr(DR.x0, DR.y0, DR.x1, DR.y1, 24)" fill="url(#h20-tint2)" />
    <path :d="rr(DR.x0 + 0.5, DR.y0 + 0.5, DR.x1 - 0.5, DR.y1 - 0.5, 24)" fill="none" stroke="url(#h20-edge)" stroke-width="1" />

    <!-- ── the island: a pill with the ship's state, on the mint card ── -->
    <g transform="translate(184 -112)">
      <rect x="-64" y="-11" width="128" height="22" rx="11" fill="#030407" stroke="#ffffff" stroke-opacity="0.12" />
      <circle cx="-50" cy="0" r="3.4" fill="#5ef0c4" />
      <circle cx="-50" cy="0" r="7" fill="#5ef0c4" opacity="0.18" />
      <text x="-40" y="3.4" class="island">GLASS NOMAD</text>
    </g>
    <g transform="translate(130 -70)">
      <text x="0" y="0" class="big">20</text>
      <text x="2" y="18" class="sub">GN · AURORA 72%</text>
      <rect v-for="j in N(4)" :key="`r${j}`" x="2" :y="34 + j * 16" :width="[96, 70, 112, 54][j]" height="5" rx="2.5" fill="#ffffff" :opacity="0.08 + (j % 2) * 0.06" />
      <rect x="2" y="34" :width="40" height="5" rx="2.5" :fill="VC[1]" opacity="0.8" />
    </g>

    <!-- ── running lights along the flank ── -->
    <g v-for="p in PILLS" :key="`p${p.i}`">
      <rect :x="p.x - 16" y="134" width="32" height="5" rx="2.5" :fill="p.c" opacity="0.18" />
      <rect :x="p.x - 10" y="135.5" width="20" height="2" rx="1" :fill="p.c" />
    </g>
  </g>
</template>

<style scoped>
.name,
.sub,
.island,
.big {
  font-family: 'SF Pro Display', 'Inter', 'Helvetica Neue', system-ui, sans-serif;
  fill: #f4f5ff;
}
.name {
  font-size: 12px;
  font-weight: 200;
  letter-spacing: 3.6px;
}
.sub {
  font-size: 8.5px;
  font-weight: 300;
  letter-spacing: 1.8px;
  opacity: 0.55;
}
.island {
  font-size: 9.5px;
  font-weight: 300;
  letter-spacing: 2.2px;
}
.big {
  font-size: 44px;
  font-weight: 100;
  letter-spacing: 2px;
  opacity: 0.85;
}
</style>
