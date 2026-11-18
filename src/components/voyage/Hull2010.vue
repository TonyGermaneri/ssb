<script setup lang="ts">
import type { Era, Part } from '../../lib/voyage/ship'

/**
 * The TENS ship's hull (lib/voyage/eras/e2010.ts), as a flat-design poster: an indigo capsule (the cockpit's bulkhead)
 * under three material cards -- each its section's light body, its coloured app bar (number disc, name, VCO, menu
 * dots), a band along its foot -- an app-icon bridge tower amidships framing the bridge window as the cockpit frames
 * its windscreen (title chip, status bar, a coral FAB at its foot), a turquoise nose cap and a coral engine block, both
 * split flat at 45° like the sky's planets, stripes of the three colours along the keel, plinths where the masts and
 * fins come through, app-icon tiles beside the pinwheel -- and the long 45° shadow of all of it: the hull's, the
 * tower's, the domes' out into space (the sky's own ×0.82), the cards' across the hull, every bezel's and part's across
 * its card, worked out from the parts' own rectangles. No gradients, no outlines; pure geometry. Static.
 */
const props = defineProps<{ era: Era }>()
const P = props.era.palettes
const parts = props.era.parts

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
const mix = (a: string, b: string, t: number) =>
  '#' +
  hex(a)
    .map((v, i) => Math.round(v + (hex(b)[i] - v) * t))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
/** the sky's shade: a flat ×0.82 */
const dark = (c: string, t = 0.18) => mix(c, '#000000', t)
const f = (v: number) => +v.toFixed(1)
const N = (n: number) => Array.from({ length: n }, (_, i) => i)

// ── the hull ──
const T = -170
const B = 190
const NOSE = { x: 620, y: 10, r: 180 }
const STERN = -720
const HULL = `M ${STERN + 60} ${T} H ${NOSE.x} A ${NOSE.r} ${NOSE.r} 0 0 1 ${NOSE.x} ${B} H ${STERN + 60} Q ${STERN} ${B} ${STERN} ${B - 60} V ${T + 60} Q ${STERN} ${T} ${STERN + 60} ${T} Z`
const INDIGO = { top: '#3f51b5', low: '#303f9f', keel: '#1a237e', frame: '#151c60', rim: '#7986cb' }
const CORAL = '#ff5252'

/** a rounded rect */
const rr = (x0: number, y0: number, x1: number, y1: number, r: number) => {
  r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2)
  return `M ${x0 + r} ${y0} H ${x1 - r} Q ${x1} ${y0} ${x1} ${y0 + r} V ${y1 - r} Q ${x1} ${y1} ${x1 - r} ${y1} H ${x0 + r} Q ${x0} ${y1} ${x0} ${y1 - r} V ${y0 + r} Q ${x0} ${y0} ${x0 + r} ${y0} Z`
}
const circ = (cx: number, cy: number, r: number) => `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`
/** a disc's down-right half (the side the sky darkens) */
const half = (cx: number, cy: number, r: number) => {
  const k = r * Math.SQRT1_2
  return `M ${f(cx + k)} ${f(cy - k)} A ${r} ${r} 0 0 1 ${f(cx - k)} ${f(cy + k)} Z`
}

// ── long shadows: everything swept 45° down-right, for good ──
const L = 1800
const K = Math.SQRT1_2
function sweepRR(x0: number, y0: number, x1: number, y1: number, r: number, l = L) {
  r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2)
  const a = { x: x1 - r + r * K, y: y0 + r - r * K }
  const b = { x: x0 + r - r * K, y: y1 - r + r * K }
  return `M ${f(a.x)} ${f(a.y)} L ${f(a.x + l)} ${f(a.y + l)} L ${f(b.x + l)} ${f(b.y + l)} L ${f(b.x)} ${f(b.y)} Z `
}
function sweepEl(cx: number, cy: number, rx: number, ry: number, l = L) {
  const s = Math.hypot(rx, ry)
  const a = { x: cx + (rx * rx) / s, y: cy - (ry * ry) / s }
  const b = { x: cx - (rx * rx) / s, y: cy + (ry * ry) / s }
  return `M ${f(a.x)} ${f(a.y)} L ${f(a.x + l)} ${f(a.y + l)} L ${f(b.x + l)} ${f(b.y + l)} L ${f(b.x)} ${f(b.y)} Z `
}
/** the hull's: from the nose's up-right tangent to the stern's down-left corner */
const hullShadow = (() => {
  const a = { x: NOSE.x + NOSE.r * K, y: NOSE.y - NOSE.r * K }
  const b = { x: STERN + 60 - 60 * K, y: B - 60 + 60 * K }
  return `M ${f(a.x)} ${f(a.y)} L ${f(a.x + L)} ${f(a.y + L)} L ${f(b.x + L)} ${f(b.y + L)} L ${f(b.x)} ${f(b.y)} Z`
})()

// ── the bridge tower: an app icon standing on the hull ──
const TOWER = { x0: -168, y0: -432, x1: 168, y1: -160, r: 60 }
const FRAME = { x0: -146, y0: -410, x1: 146, y1: -174, r: 46 }
const FAB = { x: 168, y: -182, r: 28 }

// ── the cards ──
const CARDS = [
  { vco: 0, x0: 276, x1: 612, y0: -156, y1: 150, head: 34, n: '01', name: 'BOW', ink: '#ffffff', body: '#e8f8f4', sh: '#0e6b58' },
  { vco: 1, x0: -252, x1: 252, y0: -156, y1: 150, head: 34, n: '02', name: 'MIDSHIPS', ink: '#1a237e', body: '#fff8e6', sh: '#8a5a00' },
  { vco: 2, x0: -700, x1: -276, y0: -156, y1: 150, head: 34, n: '03', name: 'STERN', ink: '#ffffff', body: '#fdeeea', sh: '#8a2c14' },
].map((c) => ({ ...c, c: P[c.vco].main, well: mix(c.body, '#90a4ae', 0.28) }))
const cardOf = (p: Part) => {
  const cx = (p.rect[0] + p.rect[2]) / 2
  const cy = (p.rect[1] + p.rect[3]) / 2
  return CARDS.findIndex((c) => cx > c.x0 && cx < c.x1 && cy > c.y0 && cy < c.y1)
}

// ── what's set into the cards round the parts: a well round each window and its lamps, a tray under each vent ──
const byKind = (vco: number, kind: string) => parts.find((p) => p.vco === vco && p.kind === kind)!
interface Well {
  d: string
  sh: string
  card: number
  fill: string
}
const wells: Well[] = []
for (const v of [0, 1, 2]) {
  const win = byKind(v, 'perform')
  const lamps = byKind(v, 'garden')
  const vents = byKind(v, 'texture')
  const ci = cardOf(win)
  if (ci >= 0) {
    const [x0, y0, x1] = win.rect
    wells.push({ d: rr(x0 - 10, y0 - 10, x1 + 10, lamps.rect[3] + 10, 20), sh: sweepRR(x0 - 10, y0 - 10, x1 + 10, lamps.rect[3] + 10, 20), card: ci, fill: CARDS[ci].well })
  }
  const vi = cardOf(vents)
  if (vi >= 0) {
    const cy = (vents.rect[1] + vents.rect[3]) / 2
    wells.push({ d: rr(vents.rect[0] - 8, cy - 26, vents.rect[2] + 8, cy + 26, 26), sh: sweepRR(vents.rect[0] - 8, cy - 26, vents.rect[2] + 8, cy + 26, 26), card: vi, fill: CARDS[vi].well })
  }
}
/** the pinwheel's housing: a two-tone amber disc */
const pin = byKind(1, 'grain')
const PIN = { x: (pin.rect[0] + pin.rect[2]) / 2, y: (pin.rect[1] + pin.rect[3]) / 2, r: Math.min(pin.rect[2] - pin.rect[0], pin.rect[3] - pin.rect[1]) / 2 + 2 }
/** the nose turbine's housing, on the cap */
const tur = byKind(0, 'grain')
const TUR = { x: (tur.rect[0] + tur.rect[2]) / 2, y: (tur.rect[1] + tur.rect[3]) / 2, r: Math.min(tur.rect[2] - tur.rect[0], tur.rect[3] - tur.rect[1]) / 2 + 12 }
/** the stern's engine plate, behind the propeller, and the thruster block over the bells' throats */
const prop = byKind(2, 'grain')
const PLATE = { x: STERN + 4, y: (prop.rect[1] + prop.rect[3]) / 2, r: 54 }
const tb = byKind(2, 'pitch')
const BLOCK = { x0: STERN + 4, y0: tb.rect[1] - 4, x1: STERN + 52, y1: tb.rect[3] + 4 }

// ── the parts' own shadows, from their resting shapes ──
function shadowOf(p: Part): string {
  const [x0, y0, x1, y1] = p.rect
  const w = x1 - x0
  const h = y1 - y0
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  if (p.form === 'window') {
    if (p.variant === 'round') return sweepEl(cx, cy, w / 2, h / 2)
    const r = p.variant === 'screen' ? 5 : p.variant === 'panel' ? Math.min(18, h * 0.2) : h / 2
    return sweepRR(x0, y0, x1, y1, r)
  }
  if (p.form === 'lamps') return sweepRR(x0, y0, x1, y1, h / 2)
  if (p.form === 'rotor') {
    if (p.variant === 'ring') return sweepEl(cx, cy, w / 2, h / 2)
    const r = p.variant === 'wheel' || p.variant === 'turbine' ? Math.min(w, h) / 2 - 2 : Math.min(w, h) / 2 - 8
    return sweepEl(cx, cy, r, r)
  }
  if (p.form === 'vents') return p.variant === 'row' ? sweepRR(x0, cy - 18, x1, cy + 18, 18) : sweepRR(cx - 30, y0, cx + 30, y1, 30)
  return ''
}
const front = parts.filter((p) => !p.back && p.form !== 'dome')
/** per card, the shadows on it; and those on the bare hull or the tower */
const cardShadows = CARDS.map((_, i) => front.filter((p) => cardOf(p) === i).map(shadowOf).join(''))
const inTower = (p: Part) => {
  const cy = (p.rect[1] + p.rect[3]) / 2
  return cy > TOWER.y0 && cy < TOWER.y1 && p.rect[0] >= TOWER.x0 && p.rect[2] <= TOWER.x1
}
const hullPartShadows = front.filter((p) => cardOf(p) < 0 && !inTower(p)).map(shadowOf).join('')
const towerPartShadows = front.filter(inTower).map(shadowOf).join('')
const wellShadows = CARDS.map((_, i) => wells.filter((w) => w.card === i).map((w) => w.sh).join(''))

/** the domes': their bowls and base rails, on the hull and out into space */
const domes = parts.filter((p) => p.form === 'dome')
const domeShadows = domes
  .map((p) => {
    const [x0, y0, x1, y1] = p.rect
    const w = x1 - x0
    const h = y1 - y0
    const cx = (x0 + x1) / 2
    if (p.variant === 'bubble') return sweepEl(cx, (y0 + y1) / 2, w / 2, h / 2)
    const base = p.variant === 'down' ? y0 : y1
    return sweepRR(x0 - 14, base - 8, x1 + 14, base + 10, 8) + (p.variant === 'up' ? sweepEl(cx, y1, w / 2, h) : sweepEl(cx, y0, w / 2, h))
  })
  .join('')

// ── plinths, where the masts, fins and funnels come through the hull ──
const plinths = parts
  .filter((p) => p.back)
  .map((p) => {
    const [x0, y0, x1, y1] = p.rect
    const cx = (x0 + x1) / 2
    const top = y1 <= T + 30
    const bottom = y0 >= B - 30
    if (!top && !bottom) return null
    const w = p.form === 'funnel' && p.variant === 'stacks' ? x1 - x0 + 8 : p.form === 'fin' ? Math.min(120, (x1 - x0) * 0.6) : p.form === 'funnel' ? x1 - x0 - 10 : 56
    const y = top ? T - 12 : B - 8
    const x = p.form === 'fin' ? (p.flip === 'x' ? x1 - w - 16 : x0 + 16) : cx - w / 2
    const lower = `M ${x} ${y + 10} H ${x + w} V ${y + 13} Q ${x + w} ${y + 20} ${x + w - 7} ${y + 20} H ${x + 7} Q ${x} ${y + 20} ${x} ${y + 13} Z`
    return { d: rr(x, y, x + w, y + 20, 7), lower, sh: sweepRR(x, y, x + w, y + 20, 7), c: P[p.vco].main, top }
  })
  .filter((x): x is NonNullable<typeof x> => !!x)

// ── app-icon tiles beside the pinwheel: a glyph each, with its own long shadow ──
const TILE = 60
const tiles = [
  { x: -214, y: -98, c: P[0].main, g: 'play' },
  { x: -214, y: -14, c: P[2].main, g: 'disc' },
  { x: 154, y: -98, c: INDIGO.top, g: 'plus' },
  { x: 154, y: -14, c: P[0].main, g: 'grid' },
].map((t) => {
  const cx = t.x + TILE / 2
  const cy = t.y + TILE / 2
  let glyph = ''
  let gsh = ''
  if (t.g === 'play') {
    glyph = `M ${cx - 9} ${cy - 13} L ${cx + 14} ${cy} L ${cx - 9} ${cy + 13} Z`
    gsh = `M ${cx - 9} ${cy - 13} L ${cx + 14} ${cy} L ${cx + 114} ${cy + 100} L ${cx + 91} ${cy + 113} L ${cx - 9} ${cy + 13} Z`
  } else if (t.g === 'disc') {
    glyph = circ(cx, cy, 13) + ` M ${cx - 7} ${cy} Q ${cx - 3.5} ${cy - 8} ${cx} ${cy} T ${cx + 7} ${cy}`
    gsh = sweepEl(cx, cy, 13, 13, 100)
  } else if (t.g === 'plus') {
    glyph = `M ${cx - 4} ${cy - 14} h 8 v 10 h 10 v 8 h -10 v 10 h -8 v -10 h -10 v -8 h 10 Z`
    gsh = sweepRR(cx - 14, cy - 14, cx + 14, cy + 14, 0, 100)
  } else {
    glyph = [0, 1].flatMap((i) => [0, 1].map((j) => rr(cx - 13 + i * 15, cy - 13 + j * 15, cx - 2 + i * 15, cy - 2 + j * 15, 2))).join(' ')
    gsh = sweepRR(cx - 13, cy - 13, cx + 13, cy + 13, 0, 100)
  }
  return { ...t, glyph, gsh, d: rr(t.x, t.y, t.x + TILE, t.y + TILE, 16), sh: sweepRR(t.x, t.y, t.x + TILE, t.y + TILE, 16) }
})
const tileShadows = tiles.map((t) => t.sh).join('')

/** the funnels standing behind the hull (VoyageShip's stacks()): their long shadows, everywhere but on themselves */
const stackShapes = parts
  .filter((p) => p.form === 'funnel' && p.variant === 'stacks')
  .flatMap((p) => {
    const n = Math.max(1, p.n)
    const slot = (p.rect[2] - p.rect[0]) / n
    const hs = [1, 0.8, 0.92, 0.7]
    return N(n).map((i) => {
      const h = (p.rect[3] - p.rect[1]) * hs[i % hs.length]
      const x = p.rect[0] + slot * i + slot * 0.12
      const w = slot * 0.76
      const y = p.rect[3] - h
      return { x: x - 6, y, w: w + 12, h }
    })
  })
const stackShadows = stackShapes.map((q) => sweepRR(q.x, q.y, q.x + q.w, q.y + q.h, 5)).join('')
const stackHoles = 'M -2000 -2000 H 2000 V 2000 H -2000 Z ' + stackShapes.map((q) => rr(q.x, q.y, q.x + q.w, q.y + q.h, 5)).join(' ')
/** the nose cap's flat target rings round the turbine */
const RINGS = [TUR.r + 44, TUR.r + 22]
/** the dividers and captions on the side cards, between the window's well and the vents' tray */
const captions = [0, 2].map((v) => {
  const c = CARDS[cardOf(byKind(v, 'perform'))]
  const lamps = byKind(v, 'garden')
  const vents = byKind(v, 'texture')
  const y = (lamps.rect[3] + 10 + (vents.rect[1] + vents.rect[3]) / 2 - 26) / 2
  return { x0: c.x0 + 24, x1: c.x1 - 24, y, cx: (c.x0 + c.x1) / 2, c: c.c, label: '#90a4ae' }
})

/** the tower's app bar: the signal bars */
const BARS = N(4).map((i) => ({ x: 92 + i * 6, h: 4 + i * 2.5 }))
/** a quiet 8-grid of dots on each card's body, where nothing sits */
function dotsFor(ci: number) {
  const c = CARDS[ci]
  const out: { x: number; y: number }[] = []
  for (let x = c.x0 + 16; x < c.x1 - 8; x += 16)
    for (const y of [c.y1 - 22]) {
      const busy = parts.some((p) => !p.back && x > p.rect[0] - 14 && x < p.rect[2] + 14 && y > p.rect[1] - 14 && y < p.rect[3] + 14)
      if (!busy) out.push({ x, y })
    }
  return out
}
const dots = CARDS.map((_, i) => dotsFor(i))
</script>

<template>
  <g class="hull">
    <defs>
      <clipPath id="h10-hull"><path :d="HULL" /></clipPath>
      <clipPath id="h10-stackholes"><path :d="stackHoles" clip-rule="evenodd" /></clipPath>
      <clipPath id="h10-frame"><path :d="rr(FRAME.x0, FRAME.y0, FRAME.x1, FRAME.y1, FRAME.r)" /></clipPath>
      <clipPath id="h10-tower"><path :d="rr(TOWER.x0, TOWER.y0, TOWER.x1, TOWER.y1, TOWER.r)" /></clipPath>
      <clipPath v-for="(c, i) in CARDS" :id="`h10-card${i}`" :key="`cc${i}`"><path :d="rr(c.x0, c.y0, c.x1, c.y1, 14)" /></clipPath>
      <clipPath v-for="(t, i) in tiles" :id="`h10-tile${i}`" :key="`tc${i}`"><path :d="t.d" /></clipPath>
    </defs>

    <!-- ── out into space: the hull's, the tower's, the domes' and the FAB's long shadows, the sky's own ×0.82 ── -->
    <g opacity="0.18">
      <path :d="hullShadow + sweepRR(TOWER.x0, TOWER.y0, TOWER.x1, TOWER.y1, TOWER.r) + domeShadows + sweepEl(FAB.x, FAB.y, FAB.r, FAB.r) + sweepEl(PLATE.x, PLATE.y, PLATE.r, PLATE.r) + plinths.map((q) => q.sh).join('')" fill="#000" />
    </g>

    <g opacity="0.18" clip-path="url(#h10-stackholes)"><path :d="stackShadows" fill="#000" /></g>

    <!-- ── the hull: indigo, two-tone, a keel of the three colours ── -->
    <g clip-path="url(#h10-hull)">
      <rect :x="STERN - 10" :y="T - 10" width="1640" :height="NOSE.y - T + 10" :fill="INDIGO.top" />
      <rect :x="STERN - 10" :y="NOSE.y" width="1640" :height="B - NOSE.y + 10" :fill="INDIGO.low" />
      <!-- the nose cap: turquoise, split flat at 45° -->
      <rect :x="NOSE.x - 8" :y="T - 10" width="400" :height="B - T + 20" :fill="P[0].main" />
      <path :d="`M ${NOSE.x - 8} ${B + 10} L ${NOSE.x - 8 + (B - T) + 20} ${T - 10} H 900 V ${B + 10} Z`" :fill="dark(P[0].main)" />
      <!-- the keel's stripes and its lights -->
      <rect :x="STERN - 10" y="158" width="1640" height="8" :fill="P[0].main" />
      <rect :x="STERN - 10" y="166" width="1640" height="8" :fill="P[1].main" />
      <rect :x="STERN - 10" y="174" width="1640" height="8" :fill="P[2].main" />
      <rect :x="STERN - 10" y="182" width="1640" height="20" :fill="INDIGO.keel" />
      <!-- portlights in the band under the cards -->
      <circle v-for="k in N(60)" :key="`pl${k}`" :cx="STERN + 30 + k * 24" cy="154" r="1.8" fill="#ffffff" opacity="0.35" />
      <!-- the rim the sky lights -->
      <path :d="`M ${STERN + 20} ${T + 1.5} H ${NOSE.x}`" :stroke="INDIGO.rim" stroke-width="3" />
      <!-- a quiet grid of 8s on the bare indigo -->
      <g opacity="0.07" stroke="#ffffff" stroke-width="1">
        <line v-for="k in 40" :key="`g${k}`" :x1="STERN + k * 40" :x2="STERN + k * 40" :y1="T" :y2="158" />
      </g>
      <!-- the long shadows across the hull: the cards', the tower's, the domes', the FAB's, the plinths', the turbine's
           housing's and the block's (the cards stand above them all) -->
      <g opacity="0.32">
        <path
          :d="CARDS.map((c) => sweepRR(c.x0, c.y0, c.x1, c.y1, 14)).join('') + sweepEl(TUR.x, TUR.y, TUR.r, TUR.r) + sweepRR(BLOCK.x0, BLOCK.y0, BLOCK.x1, BLOCK.y1, 12) + sweepRR(TOWER.x0, TOWER.y0, TOWER.x1, TOWER.y1, TOWER.r) + domeShadows + sweepEl(FAB.x, FAB.y, FAB.r, FAB.r) + plinths.filter((q) => q.top).map((q) => q.sh).join('') + hullPartShadows"
          fill="#0b1040"
        />
      </g>
      <!-- flat target rings on the cap, each split at 45° -->
      <template v-for="(r, k) in RINGS" :key="`ring${k}`">
        <circle :cx="TUR.x" :cy="TUR.y" :r="r" :fill="k ? mix(P[0].main, '#ffffff', 0.18) : mix(P[0].main, '#ffffff', 0.08)" />
        <path :d="half(TUR.x, TUR.y, r)" :fill="dark(k ? mix(P[0].main, '#ffffff', 0.18) : mix(P[0].main, '#ffffff', 0.08))" />
      </template>
      <!-- the turbine's housing on the cap: a white ring, a deep well -->
      <circle :cx="TUR.x" :cy="TUR.y" :r="TUR.r" fill="#ffffff" />
      <path :d="half(TUR.x, TUR.y, TUR.r)" :fill="dark('#ffffff', 0.1)" />
      <circle :cx="TUR.x" :cy="TUR.y" :r="TUR.r - 8" :fill="P[0].deep" />
      <!-- the cap's registration -->
      <text :x="NOSE.x + 40" :y="B - 52" class="reg" fill="#ffffff" opacity="0.85">LS·10</text>
    </g>

    <!-- ── the cards ── -->
    <g v-for="(c, i) in CARDS" :key="`card${i}`">
      <path :d="rr(c.x0, c.y0, c.x1, c.y1, 14)" :fill="c.body" />
      <g :clip-path="`url(#h10-card${i})`">
        <rect :x="c.x0" :y="c.y0" :width="c.x1 - c.x0" :height="c.head" :fill="c.c" />
        <rect :x="c.x0" :y="c.y0 + c.head" :width="c.x1 - c.x0" height="4" :fill="dark(c.c, 0.12)" />
        <rect :x="c.x0" :y="c.y1 - 6" :width="c.x1 - c.x0" height="6" :fill="c.c" />
        <!-- the wells' and tiles' shadows, then the wells -->
        <g opacity="0.14">
          <path :d="wellShadows[i] + (i === 1 ? tileShadows + sweepEl(PIN.x, PIN.y, PIN.r, PIN.r) : '')" :fill="c.sh" />
        </g>
        <path v-for="(w, k) in wells.filter((w) => w.card === i)" :key="`w${k}`" :d="w.d" :fill="w.fill" />
        <template v-for="(cp, k) in captions.filter((q) => q.cx > c.x0 && q.cx < c.x1)" :key="`cap${k}`">
          <line :x1="cp.x0" :x2="cp.cx - 46" :y1="cp.y" :y2="cp.y" :stroke="c.well" stroke-width="2" />
          <line :x1="cp.cx + 46" :x2="cp.x1" :y1="cp.y" :y2="cp.y" :stroke="c.well" stroke-width="2" />
          <text :x="cp.cx" :y="cp.y + 3.5" text-anchor="middle" class="cap" :fill="cp.label">POS · VOL</text>
        </template>
        <circle v-for="(d, k) in dots[i]" :key="`d${k}`" :cx="d.x" :cy="d.y" r="2.2" :fill="c.c" opacity="0.45" />
      </g>
      <!-- the app bar: its number in a disc, its name, its VCO, its menu -->
      <g :transform="`translate(${c.x0 + 14} ${c.y0 + c.head / 2})`">
        <circle cx="12" cy="0" r="11" :fill="c.ink" />
        <text x="12" y="4" text-anchor="middle" class="num" :fill="c.c">{{ c.n }}</text>
        <text x="32" y="5.5" class="title" :fill="c.ink">{{ c.name }}</text>
        <text :x="c.x1 - c.x0 - 52" y="4.5" text-anchor="end" class="small" :fill="c.ink" opacity="0.8">VCO {{ c.vco + 1 }}</text>
      </g>
      <circle v-for="k in N(3)" :key="`m${k}`" :cx="c.x1 - 20" :cy="c.y0 + 10 + k * 7" r="2.2" :fill="c.ink" />
    </g>

    <!-- the pinwheel's housing and the app-icon tiles, on the amber card -->
    <circle :cx="PIN.x" :cy="PIN.y" :r="PIN.r" :fill="P[1].main" />
    <path :d="half(PIN.x, PIN.y, PIN.r)" :fill="dark(P[1].main)" />
    <circle :cx="PIN.x" :cy="PIN.y" :r="PIN.r - 9" fill="#fff3d6" />
    <g v-for="(t, i) in tiles" :key="`t${i}`">
      <path :d="t.d" :fill="t.c" />
      <g :clip-path="`url(#h10-tile${i})`"><path :d="t.gsh" fill="#000" opacity="0.18" /></g>
      <path :d="t.glyph" fill="#ffffff" :fill-rule="t.g === 'disc' ? 'evenodd' : 'nonzero'" />
      <path v-if="t.g === 'disc'" :d="`M ${t.x + TILE / 2 - 7} ${t.y + TILE / 2} q 3.5 -8 7 0 t 7 0`" fill="none" :stroke="t.c" stroke-width="2.5" stroke-linecap="round" />
    </g>

    <!-- ── the bridge tower ── -->
    <path :d="rr(TOWER.x0, TOWER.y0, TOWER.x1, TOWER.y1, TOWER.r)" fill="#283593" />
    <g clip-path="url(#h10-tower)">
      <rect :x="TOWER.x0" :y="TOWER.y0" :width="TOWER.x1 - TOWER.x0" height="22" fill="#1a237e" />
      <path :d="sweepRR(FRAME.x0, FRAME.y0, FRAME.x1, FRAME.y1, FRAME.r)" fill="#0b1040" opacity="0.35" />
    </g>
    <path :d="rr(FRAME.x0, FRAME.y0, FRAME.x1, FRAME.y1, FRAME.r)" :fill="INDIGO.frame" />
    <g :clip-path="`url(#h10-frame)`" opacity="0.4"><path :d="towerPartShadows" fill="#000" /></g>
    <!-- its status bar and its menu -->
    <text :x="TOWER.x0 + 44" :y="TOWER.y0 + 15" class="status" fill="#ffffff">09:41</text>
    <rect v-for="(b, k) in BARS" :key="`b${k}`" :x="b.x - 8" :y="TOWER.y0 + 16 - b.h" width="4" :height="b.h" fill="#ffffff" opacity="0.85" />
    <rect :x="TOWER.x1 - 52" :y="TOWER.y0 + 6" width="20" height="10" rx="2" fill="none" stroke="#ffffff" stroke-width="1.6" opacity="0.85" />
    <rect :x="TOWER.x1 - 50" :y="TOWER.y0 + 8" width="12" height="6" fill="#ffffff" opacity="0.85" />
    <!-- its title chip, on its top -->
    <g :transform="`translate(0 ${TOWER.y0})`">
      <rect x="-84" y="-10" width="168" height="20" rx="10" :fill="P[1].main" />
      <text y="4.4" text-anchor="middle" class="chip" fill="#1a237e">LONG SHADOW · 2010</text>
    </g>

    <!-- ── the plinths, the plate and the block ── -->
    <g v-for="(q, i) in plinths" :key="`pl${i}`">
      <path :d="q.d" :fill="q.c" />
      <path :d="q.lower" fill="#000" opacity="0.18" />
    </g>
    <path :d="rr(BLOCK.x0, BLOCK.y0, BLOCK.x1, BLOCK.y1, 12)" :fill="P[2].main" />
    <path :d="`M ${BLOCK.x0} ${BLOCK.y1} L ${BLOCK.x1} ${BLOCK.y1 - (BLOCK.x1 - BLOCK.x0)} V ${BLOCK.y1 - 12} Q ${BLOCK.x1} ${BLOCK.y1} ${BLOCK.x1 - 12} ${BLOCK.y1} Z`" :fill="dark(P[2].main)" />
    <rect v-for="k in N(4)" :key="`bk${k}`" :x="BLOCK.x0 + 12" :y="BLOCK.y0 + 16 + k * 24" width="24" height="6" rx="3" fill="#ffffff" opacity="0.7" />
    <circle :cx="PLATE.x" :cy="PLATE.y" :r="PLATE.r" :fill="P[2].main" />
    <path :d="half(PLATE.x, PLATE.y, PLATE.r)" :fill="dark(P[2].main)" />
    <circle :cx="PLATE.x" :cy="PLATE.y" :r="PLATE.r - 14" fill="#ffffff" />
    <circle :cx="PLATE.x" :cy="PLATE.y" :r="PLATE.r - 24" :fill="INDIGO.keel" />

    <!-- ── the parts' own shadows: across their cards, the hull, the tower ── -->
    <g v-for="(c, i) in CARDS" :key="`ps${i}`" :clip-path="`url(#h10-card${i})`" opacity="0.16">
      <path :d="cardShadows[i]" :fill="c.sh" />
    </g>

    <!-- ── the FAB, at the tower's foot ── -->
    <circle :cx="FAB.x" :cy="FAB.y" :r="FAB.r" :fill="CORAL" />
    <path :d="half(FAB.x, FAB.y, FAB.r)" :fill="dark(CORAL, 0.1)" />
    <path :d="`M ${FAB.x - 11} ${FAB.y} H ${FAB.x + 11} M ${FAB.x} ${FAB.y - 11} V ${FAB.y + 11}`" stroke="#ffffff" stroke-width="4.5" stroke-linecap="round" />
  </g>
</template>

<style scoped>
.title {
  font-family: 'Roboto', 'Helvetica Neue', 'Avenir Next', 'Segoe UI', Arial, sans-serif;
  font-size: 16px;
  font-weight: 500;
  letter-spacing: 1.5px;
}
.num,
.small,
.chip,
.status,
.reg {
  font-family: 'Roboto', 'Helvetica Neue', 'Avenir Next', 'Segoe UI', Arial, sans-serif;
  font-weight: 700;
}
.num {
  font-size: 10px;
}
.small {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 1.5px;
}
.chip {
  font-size: 10px;
  letter-spacing: 2.4px;
}
.status {
  font-size: 11px;
  font-weight: 500;
}
.cap {
  font-family: 'Roboto', 'Helvetica Neue', 'Avenir Next', 'Segoe UI', Arial, sans-serif;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2px;
}
.reg {
  font-size: 18px;
  font-weight: 300;
  letter-spacing: 5px;
}
</style>
