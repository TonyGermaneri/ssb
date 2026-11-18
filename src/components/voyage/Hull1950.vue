<script setup lang="ts">
import type { Era } from '../../lib/voyage/ship'

/**
 * The FIFTIES ship's hull (lib/voyage/eras/e1950.ts): the XS-57 under steam. A shallow riveted lens of iron plates
 * (each plate lit for where it faces: the pulp sun up ahead, the sky's blue bouncing up from below), a brass rim of
 * green-lit portholes, copper ribs down the belly; the wheelhouse on top in iron and brass round the cockpit's
 * three-pane windscreen, a mahogany sill with the garden's lamps and a copper steam pipe under it, a railed mahogany
 * roof with a whistle and a searchlight; the copper-nosed bow boiler with its brass hoops, a leather strap and a gauge;
 * the engine house astern with its louvres, valve wheel and sunburst paddle box. Static but for a little steam and
 * the gauges' needles; the parts are drawn around it (their bezels in Overlay1950).
 */
const props = defineProps<{ era: Era }>()
const ink = props.era.ink
const N = (n: number) => Array.from({ length: n }, (_, i) => i)
const f = (n: number) => n.toFixed(1)
const rnd = (i: number) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

// ── the saucer: a shallow lens seen from a little above ──
const RIM = 60
const R = 620
const HU = 170
const HD = 150
const T = 0.07
const B = 18
const sq = (x: number) => Math.sqrt(Math.max(0, R * R - x * x))
const upTop = (x: number) => RIM - B - HU * (1 - (x * x) / (R * R)) - 3
const bandMid = (x: number) => RIM + sq(x) * T
const bandTop = (x: number) => bandMid(x) - B
const bandBot = (x: number) => bandMid(x) + B
const dnBot = (x: number) => RIM + B + HD * (1 - (x * x) / (R * R)) + 3
function trace(fn: (x: number) => number, x0: number, x1: number, n = 48, first = 'M') {
  return N(n + 1)
    .map((i) => {
      const x = x0 + ((x1 - x0) * i) / n
      return `${i ? 'L' : first} ${f(x)} ${f(fn(x))}`
    })
    .join(' ')
}
const UPPER = `${trace(upTop, -R, R)} ${trace(bandTop, R, -R, 48, 'L')} Z`
const LOWER = `${trace(bandBot, -R, R)} ${trace(dnBot, R, -R, 48, 'L')} Z`
const BAND_LINE = trace(bandMid, -R, R, 60)
const UP_EDGE = trace(upTop, -R, R, 60)
const DN_EDGE = trace(dnBot, -R, R, 60)
const BAND_BOT_LINE = trace(bandBot, -R + 10, R - 10, 60)

/** a point on the upper (s = 1) or lower (s = -1) skin: r out from the axis, th round it (0 right, PI/2 toward us) */
function skin(s: number, r: number, th: number) {
  const k = 1 - (r * r) / (R * R)
  return { x: r * Math.cos(th), y: s > 0 ? RIM - B - HU * k + r * Math.sin(th) * T : RIM + B + HD * k + r * Math.sin(th) * T }
}
const norm = (v: number[]) => {
  const l = Math.hypot(...v)
  return v.map((c) => c / l)
}
const KEY = norm([0.55, 0.35, 0.78])
const FILL = norm([-0.35, 0.35, -0.85])
const hex = (c: number[]) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
/** materials' albedo */
const IRON = [0.62, 0.55, 0.48]
const BRASS = [1, 0.74, 0.36]
const COPPER = [0.92, 0.5, 0.3]
function lit(s: number, r: number, th: number, alb: number[], j: number) {
  const x = r * Math.cos(th)
  const d = r * Math.sin(th)
  const h = s > 0 ? HU : HD
  const n = norm([(2 * h * x) / (R * R), (2 * h * d) / (R * R), s])
  const k = Math.max(0, n[0] * KEY[0] + n[1] * KEY[1] + n[2] * KEY[2])
  const fl = Math.max(0, n[0] * FILL[0] + n[1] * FILL[1] + n[2] * FILL[2])
  const v = 0.78 + rnd(j) * 0.4
  return hex([0, 1, 2].map((c) => (34 + 250 * Math.pow(k, 2.2) * [1, 0.84, 0.62][c] + 90 * fl * [0.45, 0.58, 0.95][c]) * alb[c] * v))
}
const TH = 16
const UP_RINGS = [1, 0.84, 0.66, 0.46, 0.24, 0.02]
const DN_RINGS = [1, 0.84, 0.6, 0.34, 0.02]
function plates(s: number, rings: number[], mat: (ring: number, cell: number) => number[]) {
  const out: { d: string; fill: string }[] = []
  for (let j = 0; j < rings.length - 1; j++)
    for (let i = 0; i < TH; i++) {
      const t0 = (i / TH) * Math.PI
      const t1 = ((i + 1) / TH) * Math.PI
      const r0 = rings[j] * R
      const r1 = rings[j + 1] * R
      const pts = [...N(4).map((k) => skin(s, r0, t0 + ((t1 - t0) * k) / 3)), ...N(4).map((k) => skin(s, r1, t1 - ((t1 - t0) * k) / 3))]
      out.push({ d: 'M ' + pts.map((p) => `${f(p.x)} ${f(p.y)}`).join(' L ') + ' Z', fill: lit(s, (r0 + r1) / 2, (t0 + t1) / 2, mat(j, i), j * 31 + i + (s > 0 ? 0 : 500)) })
    }
  return out
}
/** oxblood enamel, worn */
const OXBLOOD = [0.78, 0.26, 0.18]
const upPlates = plates(1, UP_RINGS, (j, i) => (j === 2 ? BRASS : j === 1 ? (i % 6 === 3 || rnd(i + 77) > 0.82 ? IRON : OXBLOOD) : j === 0 && i % 5 === 2 ? COPPER : IRON))
const dnPlates = plates(-1, DN_RINGS, (j) => (j === 1 ? COPPER : IRON))
function ringRivets(s: number, r: number, step: number) {
  const n = Math.round(Math.PI / step)
  return N(n - 1).map((i) => skin(s, r, ((i + 1) / n) * Math.PI))
}
const rivets = [...ringRivets(1, R * 0.84, Math.PI / 52), ...ringRivets(1, R * 0.66, Math.PI / 44), ...ringRivets(1, R * 0.46, Math.PI / 36), ...ringRivets(-1, R * 0.84, Math.PI / 52), ...ringRivets(-1, R * 0.6, Math.PI / 40)]
/** grime: short streaks running down from some of the rivets */
const streaks = rivets
  .filter((_, i) => rnd(i + 900) > 0.86)
  .map((p, i) => ({ x: p.x, y: p.y + 3, l: 10 + rnd(i + 40) * 26, rust: rnd(i + 70) > 0.5 }))
/** the belly's copper ribs: meridians */
const ribs = N(7).map((k) => {
  const th = ((k + 0.5) / 7) * Math.PI
  return N(9)
    .map((i) => {
      const p = skin(-1, R * (1 - i * 0.1), th)
      return `${i ? 'L' : 'M'} ${f(p.x)} ${f(p.y)}`
    })
    .join(' ')
})
/** meridian seams on the top skin */
const seams = N(TH - 1).map((k) => {
  const th = ((k + 1) / TH) * Math.PI
  return N(7)
    .map((i) => {
      const p = skin(1, R * (1 - i * 0.12), th)
      return `${i ? 'L' : 'M'} ${f(p.x)} ${f(p.y)}`
    })
    .join(' ')
})
/** the rim's portholes, foreshortened round the curve, where no part covers them */
const CLEAR = [
  [-470, -230],
  [-140, 140],
  [220, 460],
]
const portholes = N(26)
  .map((i) => {
    const th = 0.12 + (i / 25) * (Math.PI - 0.24)
    const x = R * Math.cos(th)
    return { x, y: bandMid(x), rx: 11 * Math.max(0.35, Math.sin(th)), ry: 11, i }
  })
  .filter((p) => Math.abs(p.x) < 560 && !CLEAR.some(([a, b]) => p.x > a && p.x < b))

// ── the wheelhouse ──
const CAB = 'M -392 -112 L -392 -330 Q -392 -346 -376 -346 L 356 -346 C 392 -346 406 -322 406 -290 L 406 -150 C 406 -128 398 -112 380 -112 Z'
const SKIRT = 'M -394 -116 C -398 -70 -436 -34 -500 -4 C -300 -40 300 -40 514 -4 C 452 -34 414 -70 408 -116 Z'
/** the skirt's strakes (its plate rows, following its foot) and the portholes along the upper one */
const strake = (k: number) => {
  const y0 = -116 + k * 110
  const xl = -394 - k * (500 - 394) * (0.4 + 0.6 * k)
  const xr = 408 + k * (514 - 408) * (0.4 + 0.6 * k)
  return `M ${f(xl)} ${f(y0 + k * 10)} C ${f(xl * 0.6)} ${f(y0 - 24 * k)} ${f(xr * 0.6)} ${f(y0 - 24 * k)} ${f(xr)} ${f(y0 + k * 10)}`
}
const STRAKES = [0.3, 0.62].map(strake)
const skirtPorts = [-300, -200, -100, 0, 100, 200, 300].map((x) => ({ x, y: -78 - 8 * (1 - (x * x) / 90000) }))
const GLASS = { x: -376, y: -324, w: 752, h: 140 }
const MULLIONS = [-125, 125]
const line = (x0: number, y0: number, x1: number, y1: number, step: number) => {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step))
  return N(n + 1).map((i) => ({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n }))
}
const cabRivets = [...line(-380, -336, 380, -336, 22), ...line(-380, -120, 390, -120, 22), ...line(-384, -320, -384, -132, 22)]
const glassRivets = [...line(GLASS.x + 18, GLASS.y - 2, GLASS.x + GLASS.w - 18, GLASS.y - 2, 26), ...line(GLASS.x + 18, GLASS.y + GLASS.h + 2, GLASS.x + GLASS.w - 18, GLASS.y + GLASS.h + 2, 26)]
const railPosts = line(-388, -362, 398, -362, 36)
const pipeFlanges = [-330, -200, -50, 60, 200, 330]
const skirtSeams = [-250, -50, 150, 350].map((x) => `M ${x} -114 Q ${x * 1.05} -70 ${x * 1.1} -30`)

// ── the bow boiler ──
const BOW = { x0: 470, x1: 665, y0: -32, y1: 128 }
const CONE = 'M 665 -32 C 706 -26 732 2 744 26 L 744 70 C 732 94 706 122 665 128 Z'
const HOOPS = [492, 604, 650]

// ── the engine house astern ──
const EH = 'M -746 -52 Q -746 -82 -716 -82 L -470 -82 Q -440 -82 -440 -52 L -440 122 Q -440 152 -470 152 L -716 152 Q -746 152 -746 122 Z'
const WHEEL = { cx: -550, cy: 50, r: 118 }
const slats = N(9).map((i) => {
  const a0 = Math.PI + (i / 9) * Math.PI
  const a1 = Math.PI + ((i + 1) / 9) * Math.PI
  const { cx, cy, r } = WHEEL
  return { d: `M ${cx} ${cy} L ${f(cx + Math.cos(a0) * r)} ${f(cy + Math.sin(a0) * r)} A ${r} ${r} 0 0 1 ${f(cx + Math.cos(a1) * r)} ${f(cy + Math.sin(a1) * r)} Z`, wood: i % 2 === 0 }
})
const boxRivets = N(15).map((i) => {
  const a = Math.PI + ((i + 0.5) / 15) * Math.PI
  return { x: WHEEL.cx + Math.cos(a) * (WHEEL.r - 6), y: WHEEL.cy + Math.sin(a) * (WHEEL.r - 6) }
})
const louvres = N(7).map((i) => -40 + i * 22)
const ehRivets = [...line(-736, -74, -450, -74, 20), ...line(-736, 144, -450, 144, 20), ...line(-738, -60, -738, 130, 20)]

/** a pressure gauge's dial ticks */
const ticks = (r0: number, r1: number) =>
  N(9).map((k) => {
    const a = ((-120 + k * 30) * Math.PI) / 180
    return `M ${f(Math.sin(a) * r0)} ${f(-Math.cos(a) * r0)} L ${f(Math.sin(a) * r1)} ${f(-Math.cos(a) * r1)}`
  }).join(' ')
/** a valve wheel's spokes */
const spokes = (r: number) =>
  N(6)
    .map((k) => {
      const a = (k * Math.PI) / 3
      return `M 0 0 L ${f(Math.cos(a) * r)} ${f(Math.sin(a) * r)}`
    })
    .join(' ')

/** steam: where it leaks (a whistle, the safety valves), how big, when */
const steam = [
  ...N(4).map((i) => ({ x: -250, y: -402, i })),
  ...N(3).map((i) => ({ x: 528, y: -66, i: i + 4 })),
  ...N(3).map((i) => ({ x: -700, y: -104, i: i + 7 })),
].map((p) => ({ ...p, r: 10 + rnd(p.i + 3) * 10, d: -rnd(p.i + 11) * 6, t: 4 + rnd(p.i + 17) * 3, dx: -30 - rnd(p.i + 23) * 70 }))
</script>

<template>
  <g class="hull h50">
    <defs>
      <clipPath id="h50-upper"><path :d="UPPER" /></clipPath>
      <clipPath id="h50-lower"><path :d="LOWER" /></clipPath>
      <clipPath id="h50-cab"><path :d="CAB" /></clipPath>
      <clipPath id="h50-eh"><path :d="EH" /></clipPath>
      <linearGradient id="h50-iron" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#5a4c40" />
        <stop offset="0.18" stop-color="#3e342c" />
        <stop offset="0.7" stop-color="#241d18" />
        <stop offset="1" stop-color="#120d0a" />
      </linearGradient>
      <linearGradient id="h50-cyl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#120d0a" />
        <stop offset="0.12" stop-color="#3a3028" />
        <stop offset="0.28" stop-color="#8a7864" />
        <stop offset="0.36" stop-color="#5a4c40" />
        <stop offset="0.75" stop-color="#2a221c" />
        <stop offset="0.92" stop-color="#3a4058" />
        <stop offset="1" stop-color="#0e0b09" />
      </linearGradient>
      <linearGradient id="h50-brass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff0b0" />
        <stop offset="0.25" stop-color="#d9a748" />
        <stop offset="0.6" stop-color="#8a5c1c" />
        <stop offset="1" stop-color="#3c2408" />
      </linearGradient>
      <linearGradient id="h50-brassCyl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3c2408" />
        <stop offset="0.2" stop-color="#b8862e" />
        <stop offset="0.3" stop-color="#ffefb0" />
        <stop offset="0.45" stop-color="#c99a3c" />
        <stop offset="0.85" stop-color="#5a3a10" />
        <stop offset="1" stop-color="#2a1804" />
      </linearGradient>
      <linearGradient id="h50-brassV" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#3c2408" />
        <stop offset="0.3" stop-color="#c99a3c" />
        <stop offset="0.55" stop-color="#ffefb0" />
        <stop offset="0.75" stop-color="#b8862e" />
        <stop offset="1" stop-color="#3c2408" />
      </linearGradient>
      <linearGradient id="h50-copper" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2a0c04" />
        <stop offset="0.22" stop-color="#b4562a" />
        <stop offset="0.34" stop-color="#ffc8a0" />
        <stop offset="0.5" stop-color="#d07a46" />
        <stop offset="0.85" stop-color="#6a2a10" />
        <stop offset="1" stop-color="#1a0802" />
      </linearGradient>
      <linearGradient id="h50-mahogany" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#7a3418" />
        <stop offset="0.5" stop-color="#4a1c0c" />
        <stop offset="1" stop-color="#2a0e06" />
      </linearGradient>
      <linearGradient id="h50-leather" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#2a0806" />
        <stop offset="0.4" stop-color="#8a2a20" />
        <stop offset="1" stop-color="#3a0c08" />
      </linearGradient>
      <radialGradient id="h50-rivet" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#fff2c0" />
        <stop offset="0.45" stop-color="#a87a2a" />
        <stop offset="1" stop-color="#1a0e04" />
      </radialGradient>
      <radialGradient id="h50-rivetI" cx="0.35" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#c8b8a0" />
        <stop offset="0.5" stop-color="#4a3e34" />
        <stop offset="1" stop-color="#0e0a08" />
      </radialGradient>
      <radialGradient id="h50-port" cx="0.4" cy="0.38" r="0.7">
        <stop offset="0" stop-color="#e8fff0" />
        <stop offset="0.25" stop-color="#7dffb0" />
        <stop offset="0.7" stop-color="#1f8a52" />
        <stop offset="1" stop-color="#062414" />
      </radialGradient>
      <radialGradient id="h50-portGlow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#7dffb0" stop-opacity="0.55" />
        <stop offset="1" stop-color="#7dffb0" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="h50-dial" cx="0.5" cy="0.45" r="0.6">
        <stop offset="0" stop-color="#fbf4e2" />
        <stop offset="1" stop-color="#c8b890" />
      </radialGradient>
      <radialGradient id="h50-steam" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#fff8ee" stop-opacity="0.7" />
        <stop offset="0.6" stop-color="#f4ece0" stop-opacity="0.22" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="h50-beam" cx="0" cy="0.5" r="1">
        <stop offset="0" stop-color="#fff2c8" stop-opacity="0.5" />
        <stop offset="1" stop-color="#fff2c8" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="h50-rimWarm" x1="-620" y1="0" x2="620" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0.35" stop-color="#f2a541" stop-opacity="0" />
        <stop offset="0.8" stop-color="#ffd08a" stop-opacity="0.9" />
        <stop offset="1" stop-color="#f2a541" stop-opacity="0.5" />
      </linearGradient>
      <linearGradient id="h50-rimCool" x1="-620" y1="0" x2="620" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#8aa0e8" stop-opacity="0.8" />
        <stop offset="0.55" stop-color="#7086c8" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="h50-skirt" x1="-500" y1="0" x2="514" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#1a1410" />
        <stop offset="0.45" stop-color="#3a3029" />
        <stop offset="0.8" stop-color="#6a5a4a" />
        <stop offset="0.93" stop-color="#9a8268" />
        <stop offset="1" stop-color="#3a3029" />
      </linearGradient>
      <linearGradient id="h50-copperV" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#2a0c04" />
        <stop offset="0.35" stop-color="#c46a3a" />
        <stop offset="0.5" stop-color="#ffd0a8" />
        <stop offset="0.7" stop-color="#9a4420" />
        <stop offset="1" stop-color="#2a0c04" />
      </linearGradient>
      <linearGradient id="h50-shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#000" stop-opacity="0.55" />
        <stop offset="1" stop-color="#000" stop-opacity="0" />
      </linearGradient>
      <mask id="h50-verdigris" maskContentUnits="userSpaceOnUse">
        <rect x="-820" y="-440" width="1640" height="840" fill="url(#tx-patina)" />
      </mask>
    </defs>

    <!-- ══ the saucer ══ -->
    <!-- its belly -->
    <path :d="LOWER" fill="#1a1410" />
    <g clip-path="url(#h50-lower)">
      <path v-for="(p, i) in dnPlates" :key="`d${i}`" :d="p.d" :fill="p.fill" stroke="#0a0604" stroke-width="1.4" stroke-linejoin="round" />
      <rect x="-640" y="30" width="1280" height="240" fill="url(#tx-patina)" opacity="0.5" style="mix-blend-mode: overlay" />
      <rect x="-640" y="30" width="1280" height="240" fill="#3fae8e" opacity="0.22" mask="url(#h50-verdigris)" style="mix-blend-mode: soft-light" />
      <g v-for="(d, i) in ribs" :key="`rb${i}`">
        <path :d="d" fill="none" stroke="#120804" stroke-width="11" stroke-linecap="round" />
        <path :d="d" fill="none" stroke="#a24e24" stroke-width="7" stroke-linecap="round" />
        <path :d="d" fill="none" stroke="#ffb88a" stroke-width="1.6" stroke-linecap="round" opacity="0.7" transform="translate(-1.5 -1.5)" />
      </g>
      <!-- the rim's shadow on the belly -->
      <path :d="BAND_BOT_LINE" fill="none" stroke="#000" stroke-width="26" opacity="0.4" />
    </g>
    <!-- its top -->
    <path :d="UPPER" fill="#2a221c" />
    <g clip-path="url(#h50-upper)">
      <path v-for="(p, i) in upPlates" :key="`u${i}`" :d="p.d" :fill="p.fill" stroke="#0a0604" stroke-width="1.4" stroke-linejoin="round" />
      <path v-for="(d, i) in seams" :key="`sm${i}`" :d="d" fill="none" stroke="#fff3d8" stroke-width="1" opacity="0.12" transform="translate(1.2 0)" />
      <rect x="-640" y="-130" width="1280" height="200" fill="url(#tx-patina)" opacity="0.55" style="mix-blend-mode: overlay" />
      <rect x="-640" y="-130" width="1280" height="200" fill="url(#tx-scratches)" opacity="0.3" style="mix-blend-mode: screen" />
      <!-- soot and shadow where the skin meets the rim -->
      <path :d="BAND_LINE" fill="none" stroke="#0a0604" stroke-width="80" opacity="0.28" />
      <path :d="BAND_LINE" fill="none" stroke="#0a0604" stroke-width="52" opacity="0.3" />
    </g>
    <g class="grime">
      <path v-for="(s, i) in streaks" :key="`g${i}`" :d="`M ${f(s.x)} ${f(s.y)} l ${f(rnd(i) * 3 - 1.5)} ${f(s.l)}`" :stroke="s.rust ? '#7a3010' : '#0a0604'" stroke-width="2.4" stroke-linecap="round" opacity="0.35" />
    </g>
    <circle v-for="(r, i) in rivets" :key="`r${i}`" :cx="f(r.x)" :cy="f(r.y)" r="2.3" fill="url(#h50-rivetI)" />
    <!-- the brass rim, a cylinder seen round its curve -->
    <path :d="BAND_LINE" fill="none" stroke="#1a0e04" :stroke-width="B * 2 + 4" />
    <path :d="BAND_LINE" fill="none" stroke="#6a4512" :stroke-width="B * 2" />
    <path :d="BAND_LINE" fill="none" stroke="#b8862e" :stroke-width="B * 1.3" transform="translate(0 -2)" />
    <path :d="BAND_LINE" fill="none" stroke="#ffe7a3" stroke-width="4" transform="translate(0 -9)" opacity="0.8" />
    <path :d="BAND_LINE" fill="none" stroke="#2a1804" stroke-width="2" transform="translate(0 12)" opacity="0.8" />
    <path :d="BAND_LINE" fill="none" stroke="url(#tx-brushed)" :stroke-width="B * 2" opacity="0.35" style="mix-blend-mode: overlay" />
    <g v-for="p in portholes" :key="`p${p.i}`">
      <ellipse :cx="f(p.x)" :cy="f(p.y)" :rx="f(p.rx * 2.6)" :ry="f(p.ry * 2.2)" fill="url(#h50-portGlow)" class="flicker" :style="{ animationDelay: `${-rnd(p.i) * 3}s` }" />
      <ellipse :cx="f(p.x)" :cy="f(p.y)" :rx="f(p.rx + 4)" :ry="p.ry + 4" fill="url(#h50-brass)" stroke="#1a0e04" stroke-width="1.2" />
      <ellipse :cx="f(p.x)" :cy="f(p.y)" :rx="f(p.rx)" :ry="p.ry" fill="url(#h50-port)" stroke="#0a0604" stroke-width="1.5" />
      <ellipse :cx="f(p.x - p.rx * 0.3)" :cy="f(p.y - 4)" :rx="f(p.rx * 0.35)" ry="2.5" fill="#fff" opacity="0.7" />
    </g>
    <!-- rim light from the sky -->
    <path :d="UP_EDGE" fill="none" stroke="url(#h50-rimWarm)" stroke-width="3" />
    <path :d="DN_EDGE" fill="none" stroke="url(#h50-rimCool)" stroke-width="3" />

    <!-- ══ the bow boiler ══ -->
    <path d="M 300 108 C 380 110 430 112 470 110 L 668 110" fill="none" stroke="#1a0802" stroke-width="12" />
    <path d="M 300 108 C 380 110 430 112 470 110 L 668 110" fill="none" stroke="url(#h50-copper)" stroke-width="8" />
    <rect :x="BOW.x0" :y="BOW.y0" :width="BOW.x1 - BOW.x0" :height="BOW.y1 - BOW.y0" fill="url(#h50-cyl)" />
    <rect :x="BOW.x0" :y="BOW.y0" :width="BOW.x1 - BOW.x0" :height="BOW.y1 - BOW.y0" fill="url(#tx-patina)" opacity="0.5" style="mix-blend-mode: overlay" />
    <rect :x="BOW.x0" :y="BOW.y0" :width="BOW.x1 - BOW.x0" :height="BOW.y1 - BOW.y0" fill="url(#tx-scratches)" opacity="0.25" style="mix-blend-mode: screen" />
    <path :d="`M ${BOW.x0} 2 H ${BOW.x1} M ${BOW.x0} 96 H ${BOW.x1}`" stroke="#0a0604" stroke-width="1.5" opacity="0.8" />
    <circle v-for="(r, i) in [...line(BOW.x0 + 30, 6, BOW.x1 - 10, 6, 16), ...line(BOW.x0 + 30, 100, BOW.x1 - 10, 100, 16)]" :key="`bw${i}`" :cx="r.x" :cy="r.y" r="2.2" fill="url(#h50-rivetI)" />
    <path :d="CONE" fill="url(#h50-copper)" />
    <path :d="CONE" fill="#2f9a7c" opacity="0.5" mask="url(#h50-verdigris)" />
    <path :d="CONE" fill="url(#tx-scratches)" opacity="0.3" style="mix-blend-mode: screen" />
    <path d="M 668 -30 C 704 -24 728 2 740 24" fill="none" stroke="#ffd08a" stroke-width="2.5" opacity="0.8" />
    <ellipse cx="744" cy="48" rx="6" ry="24" fill="url(#h50-brassCyl)" stroke="#1a0e04" stroke-width="1.2" />
    <g v-for="x in HOOPS" :key="`h${x}`">
      <rect :x="x - 8" :y="BOW.y0 - 4" width="16" :height="BOW.y1 - BOW.y0 + 8" rx="3" fill="url(#h50-brassCyl)" stroke="#1a0e04" stroke-width="1.2" />
      <circle v-for="k in N(6)" :key="k" :cx="x" :cy="BOW.y0 + 10 + k * 28" r="2.2" fill="url(#h50-rivet)" />
    </g>
    <!-- a leather strap with a buckle, a plate, a gauge, a safety valve -->
    <rect x="620" :y="BOW.y0 - 2" width="18" :height="BOW.y1 - BOW.y0 + 4" fill="url(#h50-leather)" />
    <rect x="620" :y="BOW.y0 - 2" width="18" :height="BOW.y1 - BOW.y0 + 4" fill="url(#tx-leather)" opacity="0.6" style="mix-blend-mode: overlay" />
    <path :d="`M 622 ${BOW.y0} V ${BOW.y1} M 636 ${BOW.y0} V ${BOW.y1}`" stroke="#e8c890" stroke-width="0.8" stroke-dasharray="3 3" opacity="0.6" />
    <rect x="616" y="54" width="26" height="22" rx="3" fill="none" stroke="url(#h50-brass)" stroke-width="4" />
    <g transform="translate(548 40)">
      <rect x="-40" y="-14" width="80" height="28" rx="4" fill="#efe6cf" stroke="#3a2408" stroke-width="2" />
      <rect x="-36" y="-10" width="72" height="20" rx="2" fill="none" stroke="#9a2a1a" stroke-width="1.2" />
      <text y="5" text-anchor="middle" class="plate">XS-57</text>
      <circle cx="-36" cy="0" r="1.6" fill="#3a2408" />
      <circle cx="36" cy="0" r="1.6" fill="#3a2408" />
    </g>
    <g transform="translate(548 84)">
      <circle r="13" fill="url(#h50-brass)" stroke="#1a0e04" stroke-width="1" />
      <circle r="10" fill="url(#h50-dial)" />
      <path :d="ticks(6.5, 9)" stroke="#2a1a10" stroke-width="0.9" />
      <path d="M -1 2 L 0 -8 L 1 2 Z" fill="#9a1a10" class="quiver" />
    </g>
    <g transform="translate(528 -32)">
      <rect x="-5" y="-30" width="10" height="30" fill="url(#h50-brassV)" />
      <rect x="-9" y="-34" width="18" height="6" rx="2" fill="url(#h50-brass)" />
      <path d="M 0 -31 L 34 -24" stroke="#2a1a10" stroke-width="3" stroke-linecap="round" />
      <circle cx="34" cy="-24" r="6" fill="url(#h50-brass)" stroke="#1a0e04" stroke-width="1" />
    </g>
    <!-- mounts for the parts on the bow: the sight dome's riser, the periscope's gland, the wireless horn's stanchion -->
    <rect x="576" y="-50" width="108" height="22" fill="url(#h50-brassCyl)" stroke="#1a0e04" stroke-width="1.2" />
    <circle v-for="k in N(8)" :key="`sr${k}`" :cx="584 + k * 13" cy="-39" r="2" fill="url(#h50-rivet)" />
    <rect x="455" y="-50" width="30" height="34" fill="url(#h50-brassV)" stroke="#1a0e04" stroke-width="1.2" />
    <ellipse cx="470" cy="-50" rx="19" ry="5" fill="url(#h50-brass)" stroke="#1a0e04" stroke-width="1" />
    <rect x="722" y="-14" width="16" height="30" fill="url(#h50-brassV)" stroke="#1a0e04" stroke-width="1" />
    <rect x="460" y="-36" width="24" height="168" rx="4" fill="url(#h50-brassV)" stroke="#1a0e04" stroke-width="1.2" />

    <!-- ══ the engine house ══ -->
    <path d="M -760 -100 C -720 -110 -670 -100 -640 -82 L -746 -82 Z" fill="url(#h50-iron)" />
    <path :d="EH" fill="url(#h50-iron)" />
    <g clip-path="url(#h50-eh)">
      <rect x="-750" y="-90" width="320" height="250" fill="url(#tx-patina)" opacity="0.55" style="mix-blend-mode: overlay" />
      <rect x="-750" y="-90" width="320" height="250" fill="url(#tx-scratches)" opacity="0.25" style="mix-blend-mode: screen" />
      <path d="M -746 0 H -440 M -746 90 H -440 M -666 -82 V 152" stroke="#0a0604" stroke-width="1.6" opacity="0.8" />
      <rect x="-746" y="-82" width="306" height="10" fill="#ffd08a" opacity="0.12" />
    </g>
    <path :d="EH" fill="none" stroke="#0a0604" stroke-width="2" />
    <circle v-for="(r, i) in ehRivets" :key="`eh${i}`" :cx="r.x" :cy="r.y" r="2.2" fill="url(#h50-rivetI)" />
    <!-- louvres -->
    <g v-for="y in louvres" :key="`lv${y}`">
      <rect x="-734" :y="y" width="56" height="12" rx="2" fill="#0a0604" />
      <rect x="-732" :y="y + 1" width="52" height="5" rx="2" fill="url(#h50-brass)" opacity="0.85" />
    </g>
    <!-- the bells' manifold -->
    <g v-for="y in [10, 90]" :key="`mf${y}`">
      <ellipse cx="-748" :cy="y" rx="8" ry="26" fill="url(#h50-brassV)" stroke="#1a0e04" stroke-width="1.2" />
      <circle v-for="k in N(4)" :key="k" cx="-748" :cy="y - 18 + k * 12" r="1.8" fill="url(#h50-rivet)" />
    </g>
    <!-- a gauge and a valve wheel on its flank -->
    <g transform="translate(-706 128)">
      <circle r="17" fill="url(#h50-brass)" stroke="#1a0e04" stroke-width="1.2" />
      <circle r="13" fill="url(#h50-dial)" />
      <path :d="ticks(8.5, 12)" stroke="#2a1a10" stroke-width="1" />
      <path d="M -1.3 2.5 L 0 -11 L 1.3 2.5 Z" fill="#9a1a10" class="quiver" />
      <circle r="2" fill="#2a1a10" />
    </g>
    <!-- a steam pipe from the house to the safety valve -->
    <path d="M -680 -82 V -100 Q -680 -112 -692 -112 L -700 -112" fill="none" stroke="#1a0802" stroke-width="12" />
    <path d="M -680 -82 V -100 Q -680 -112 -692 -112 L -700 -112" fill="none" stroke="url(#h50-copper)" stroke-width="8" />
    <rect x="-708" y="-120" width="14" height="18" rx="3" fill="url(#h50-brassV)" stroke="#1a0e04" stroke-width="1" />
    <!-- the paddle box: sunburst slats in mahogany and brass, a riveted rim, its name round it -->
    <path v-for="(s, i) in slats" :key="`sl${i}`" :d="s.d" :fill="s.wood ? 'url(#h50-mahogany)' : 'url(#h50-brass)'" stroke="#1a0e04" stroke-width="1.5" />
    <path v-for="(s, i) in slats" :key="`sw${i}`" :d="s.d" :fill="s.wood ? 'url(#tx-wood)' : 'url(#tx-brushed)'" :opacity="s.wood ? 0.55 : 0.35" :style="{ mixBlendMode: s.wood ? 'multiply' : 'overlay' }" />
    <path :d="`M ${WHEEL.cx - WHEEL.r} ${WHEEL.cy} A ${WHEEL.r} ${WHEEL.r} 0 0 1 ${WHEEL.cx + WHEEL.r} ${WHEEL.cy}`" fill="none" stroke="#1a0e04" stroke-width="15" />
    <path :d="`M ${WHEEL.cx - WHEEL.r} ${WHEEL.cy} A ${WHEEL.r} ${WHEEL.r} 0 0 1 ${WHEEL.cx + WHEEL.r} ${WHEEL.cy}`" fill="none" stroke="url(#h50-brass)" stroke-width="10" />
    <circle v-for="(r, i) in boxRivets" :key="`bx${i}`" :cx="f(r.x)" :cy="f(r.y)" r="2.3" fill="url(#h50-rivetI)" />
    <rect :x="WHEEL.cx - WHEEL.r - 6" :y="WHEEL.cy - 6" :width="WHEEL.r * 2 + 12" height="14" rx="3" fill="url(#h50-brassCyl)" stroke="#1a0e04" stroke-width="1.2" />
    <!-- the steam dome's riser and its valve wheel -->
    <rect x="-584" y="-92" width="108" height="30" fill="url(#h50-brassCyl)" stroke="#1a0e04" stroke-width="1.2" />
    <circle v-for="k in N(8)" :key="`dr${k}`" :cx="-576 + k * 13" cy="-77" r="2" fill="url(#h50-rivet)" />
    <!-- mounts below: the rudder's hinge, the coil's insulator -->
    <rect x="-548" y="140" width="26" height="18" rx="3" fill="url(#h50-brassV)" stroke="#1a0e04" stroke-width="1.2" />
    <g transform="translate(-410 160)">
      <rect x="-9" y="-8" width="18" height="10" rx="3" fill="url(#h50-brassV)" />
      <ellipse cy="4" rx="11" ry="4" fill="#efe6cf" stroke="#3a2408" stroke-width="1" />
      <ellipse cy="9" rx="9" ry="3.5" fill="#d8ccb0" stroke="#3a2408" stroke-width="1" />
    </g>
    <!-- the turbine pod's drum and pylon, the lantern's hook -->
    <path d="M -292 150 L -228 150 L -238 140 L -282 140 Z" fill="url(#h50-iron)" />
    <rect x="-294" y="150" width="68" height="40" fill="url(#h50-iron)" stroke="#0a0604" stroke-width="1.5" />
    <circle cx="-260" cy="210" r="92" fill="url(#h50-iron)" stroke="#0a0604" stroke-width="2" />
    <circle cx="-260" cy="210" r="92" fill="url(#tx-patina)" opacity="0.5" style="mix-blend-mode: overlay" />
    <circle v-for="k in N(20)" :key="`tp${k}`" :cx="f(-260 + Math.cos((k / 20) * Math.PI * 2) * 86)" :cy="f(210 + Math.sin((k / 20) * Math.PI * 2) * 86)" r="2.2" fill="url(#h50-rivetI)" />
    <path d="M 176 212 L 194 212 L 190 226 L 180 226 Z" fill="url(#h50-brassV)" stroke="#1a0e04" stroke-width="1" />

    <!-- ══ the wheelhouse ══ -->
    <path d="M -510 0 C -300 -34 300 -34 524 0" fill="none" stroke="#000" stroke-width="16" opacity="0.35" transform="translate(0 8)" />
    <path :d="SKIRT" fill="url(#h50-skirt)" />
    <path :d="SKIRT" fill="url(#tx-patina)" opacity="0.5" style="mix-blend-mode: overlay" />
    <path :d="SKIRT" fill="url(#tx-scratches)" opacity="0.2" style="mix-blend-mode: screen" />
    <path :d="SKIRT" fill="url(#h50-shade)" opacity="0.6" />
    <path v-for="(d, i) in skirtSeams" :key="`ss${i}`" :d="d" fill="none" stroke="#0a0604" stroke-width="1.5" opacity="0.7" />
    <g v-for="(d, i) in STRAKES" :key="`sk${i}`">
      <path :d="d" fill="none" stroke="#0a0604" stroke-width="2" />
      <path :d="d" fill="none" stroke="#ffe0b0" stroke-width="1" opacity="0.18" transform="translate(0 2)" />
    </g>
    <g v-for="(p, i) in skirtPorts" :key="`sp${i}`">
      <circle :cx="p.x" :cy="p.y" r="17" fill="url(#h50-portGlow)" class="flicker" :style="{ animationDelay: `${-i * 0.7}s` }" />
      <circle :cx="p.x" :cy="p.y" r="9" fill="url(#h50-brass)" stroke="#1a0e04" stroke-width="1" />
      <circle :cx="p.x" :cy="p.y" r="6" fill="url(#h50-port)" />
      <circle :cx="p.x - 2" :cy="p.y - 2.5" r="1.6" fill="#fff" opacity="0.8" />
    </g>
    <!-- copper pipes down the skirt from the sill's steam pipe, with a valve each -->
    <g v-for="(x, i) in [-352, 366]" :key="`dp${i}`">
      <path :d="`M ${x} -124 C ${x} -80 ${x + (x < 0 ? -40 : 40)} -40 ${x + (x < 0 ? -90 : 90)} -14`" fill="none" stroke="#1a0802" stroke-width="12" stroke-linecap="round" />
      <path :d="`M ${x} -124 C ${x} -80 ${x + (x < 0 ? -40 : 40)} -40 ${x + (x < 0 ? -90 : 90)} -14`" fill="none" stroke="url(#h50-copperV)" stroke-width="8" stroke-linecap="round" />
      <g :transform="`translate(${x + (x < 0 ? -6 : 6)} -86)`">
        <circle r="10" fill="none" stroke="#7a1a10" stroke-width="3" />
        <path :d="spokes(9)" stroke="#7a1a10" stroke-width="2" />
        <circle r="3" fill="url(#h50-brass)" />
      </g>
    </g>
    <path d="M -500 -4 C -300 -40 300 -40 514 -4" fill="none" stroke="url(#h50-brass)" stroke-width="6" />
    <circle v-for="(r, i) in line(-480, -14, 490, -14, 30)" :key="`sb${i}`" :cx="r.x" :cy="f(r.y - 22 * (1 - (r.x * r.x) / 250000))" r="2.2" fill="url(#h50-rivet)" />
    <path :d="CAB" fill="url(#h50-iron)" />
    <g clip-path="url(#h50-cab)">
      <rect x="-400" y="-350" width="810" height="240" fill="url(#tx-patina)" opacity="0.55" style="mix-blend-mode: overlay" />
      <rect x="-400" y="-350" width="810" height="240" fill="url(#tx-scratches)" opacity="0.25" style="mix-blend-mode: screen" />
      <rect x="300" y="-350" width="110" height="240" fill="#ffd08a" opacity="0.08" />
    </g>
    <path :d="CAB" fill="none" stroke="#0a0604" stroke-width="2.5" />
    <path d="M 360 -344 C 392 -344 404 -322 404 -290 L 404 -150" fill="none" stroke="#ffd08a" stroke-width="2.5" opacity="0.7" />
    <circle v-for="(r, i) in cabRivets" :key="`cr${i}`" :cx="r.x" :cy="r.y" r="2.3" fill="url(#h50-rivetI)" />
    <!-- the windscreen: iron frame, brass bead, mullions -->
    <rect :x="GLASS.x" :y="GLASS.y" :width="GLASS.w" :height="GLASS.h" rx="24" fill="#0a0705" stroke="#120c08" stroke-width="14" />
    <rect :x="GLASS.x" :y="GLASS.y" :width="GLASS.w" :height="GLASS.h" rx="24" fill="none" stroke="url(#h50-brass)" stroke-width="5" />
    <circle v-for="(r, i) in glassRivets" :key="`gr${i}`" :cx="r.x" :cy="r.y" r="2.6" fill="url(#h50-rivet)" />
    <g v-for="mx in MULLIONS" :key="`m${mx}`">
      <rect :x="mx - 13" :y="GLASS.y" width="26" :height="GLASS.h" fill="#120c08" />
      <rect :x="mx - 8" :y="GLASS.y" width="16" :height="GLASS.h" fill="url(#h50-brassV)" />
      <circle v-for="k in N(5)" :key="k" :cx="mx" :cy="GLASS.y + 14 + k * 28" r="2.6" fill="url(#h50-rivet)" />
    </g>
    <!-- the sill: mahogany, the garden's lamps set in it; the steam pipe under it -->
    <rect x="-388" y="-188" width="790" height="48" fill="url(#h50-mahogany)" />
    <rect x="-388" y="-188" width="790" height="48" fill="url(#tx-wood)" opacity="0.6" style="mix-blend-mode: multiply" />
    <rect x="-388" y="-190" width="790" height="4" fill="url(#h50-brass)" />
    <rect x="-388" y="-142" width="790" height="3" fill="#000" opacity="0.6" />
    <g v-for="mx in MULLIONS" :key="`bo${mx}`">
      <circle :cx="mx" cy="-164" r="9" fill="url(#h50-brass)" stroke="#1a0e04" stroke-width="1" />
      <circle :cx="mx" cy="-164" r="4" fill="#ff8a3d" class="flicker" />
    </g>
    <rect x="-392" y="-140" width="798" height="16" fill="url(#h50-copper)" />
    <rect x="-392" y="-140" width="798" height="16" fill="#2f9a7c" opacity="0.35" mask="url(#h50-verdigris)" />
    <g v-for="x in pipeFlanges" :key="`pf${x}`">
      <rect :x="x - 6" y="-144" width="12" height="24" rx="2" fill="url(#h50-brassV)" stroke="#1a0e04" stroke-width="1" />
    </g>
    <g transform="translate(-300 -132)">
      <circle r="13" fill="none" stroke="#7a1a10" stroke-width="3.5" />
      <path :d="spokes(12)" stroke="#7a1a10" stroke-width="2.5" />
      <circle r="4" fill="url(#h50-brass)" />
    </g>
    <!-- the roof: a mahogany deck, a brass lip, a railing -->
    <rect x="-400" y="-362" width="812" height="20" rx="4" fill="url(#h50-mahogany)" />
    <rect x="-400" y="-362" width="812" height="20" rx="4" fill="url(#tx-wood)" opacity="0.6" style="mix-blend-mode: multiply" />
    <rect x="-402" y="-346" width="816" height="5" rx="2" fill="url(#h50-brass)" />
    <rect x="-400" y="-363" width="812" height="2" fill="#ffd08a" opacity="0.5" />
    <g class="rail">
      <path d="M -388 -386 H 398" stroke="#1a0e04" stroke-width="5" stroke-linecap="round" />
      <path d="M -388 -386 H 398" stroke="url(#h50-brass)" stroke-width="3" stroke-linecap="round" />
      <path d="M -388 -374 H 398" stroke="#1a0e04" stroke-width="1.6" opacity="0.8" />
      <rect v-for="(p, i) in railPosts" :key="`rp${i}`" :x="p.x - 1.6" y="-388" width="3.2" height="26" fill="url(#h50-brassV)" />
    </g>
    <!-- a steam whistle -->
    <g transform="translate(-250 -362)">
      <rect x="-5" y="-30" width="10" height="30" fill="url(#h50-brassV)" stroke="#1a0e04" stroke-width="1" />
      <path d="M -9 -30 L 9 -30 L 7 -40 Q 0 -46 -7 -40 Z" fill="url(#h50-brassV)" stroke="#1a0e04" stroke-width="1" />
      <path d="M 5 -16 L 22 -20" stroke="#2a1a10" stroke-width="2.5" stroke-linecap="round" />
    </g>
    <!-- a searchlight -->
    <g transform="translate(330 -362)">
      <path d="M 26 -26 L 230 -70 L 230 30 L 26 -6 Z" fill="url(#h50-beam)" style="mix-blend-mode: screen" />
      <path d="M -12 0 L -4 -14 L 4 -14 L 12 0 Z" fill="url(#h50-iron)" />
      <rect x="-16" y="-34" width="40" height="24" rx="6" fill="url(#h50-brassCyl)" stroke="#1a0e04" stroke-width="1.2" />
      <ellipse cx="25" cy="-22" rx="5" ry="12" fill="#fff4d0" stroke="#3a2408" stroke-width="1.5" />
      <path d="M -8 -34 V -10 M 4 -34 V -10" stroke="#1a0e04" stroke-width="1" opacity="0.6" />
    </g>
    <!-- collars for the stacks and the mast where they pass through the roof -->
    <rect x="-75" y="-368" width="65" height="8" rx="2" fill="url(#h50-brassCyl)" stroke="#1a0e04" stroke-width="1" />
    <rect x="0" y="-368" width="65" height="8" rx="2" fill="url(#h50-brassCyl)" stroke="#1a0e04" stroke-width="1" />
    <rect x="155" y="-368" width="20" height="8" rx="2" fill="url(#h50-brassCyl)" stroke="#1a0e04" stroke-width="1" />
    <path d="M 165 -420 L 118 -362 M 165 -420 L 214 -362" stroke="#1a0e04" stroke-width="1.2" opacity="0.8" />

    <!-- steam -->
    <g class="steam">
      <circle v-for="(p, i) in steam" :key="`st${i}`" :cx="p.x" :cy="p.y" :r="f(p.r)" fill="url(#h50-steam)" :style="{ animationDelay: `${p.d}s`, animationDuration: `${p.t}s`, '--dx': `${p.dx}px` }" />
    </g>
    <path :d="UPPER" fill="none" :stroke="ink" stroke-width="0" />
  </g>
</template>

<style scoped>
.plate {
  font-family: 'Courier New', 'Courier', monospace;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 3px;
  fill: #2a1a10;
}
.steam circle {
  transform-box: fill-box;
  transform-origin: center;
  animation: steam 5s ease-out infinite;
  opacity: 0;
}
@keyframes steam {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(0.4);
  }
  15% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
    transform: translate(var(--dx), -90px) scale(3);
  }
}
.quiver {
  transform-origin: 0 0;
  animation: quiver 0.2s ease-in-out infinite alternate;
}
@keyframes quiver {
  from {
    transform: rotate(28deg);
  }
  to {
    transform: rotate(36deg);
  }
}
.flicker {
  animation: flicker 2.6s ease-in-out infinite alternate;
}
@keyframes flicker {
  0%,
  60% {
    opacity: 1;
  }
  70% {
    opacity: 0.6;
  }
  100% {
    opacity: 0.9;
  }
}
</style>
