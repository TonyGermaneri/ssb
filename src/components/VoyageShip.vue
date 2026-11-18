<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Sound } from '../types'
import { lfoRouteOf, type PadControl } from '../lib/play/padControl'
import { lfoOffset, lfoSwing } from '../lib/play/draw'
import { pitchMultiplier, type Point } from '../lib/play/pads'
import type { Era, Part } from '../lib/voyage/ship'
import { waveMorph, type WaveMorph } from '../lib/waveMorph'

/**
 * VOYAGE's ship -- any era's (lib/voyage/eras/): its hull (the era's own art) and its 24 working parts, each VCO's
 * eight pads in disguise. A part's rectangle is its pad (drag anywhere on it; double-click resets it; right-click opens
 * its settings); what it does moves the part, the same way on every ship: rotors turn with the grains (blades as wide
 * as LENGTH), swingers swing with the LFO, domes ripple with the reverb and take the filter's tint, funnels' stripes
 * run with the pitch and puff the ring modulator's smoke rings, vents bubble with the spray and split with the detune,
 * aerials ring with the echo, fins' stripes warm or cool with the tone, windows hold the clip, its level and playhead.
 * Each part draws in its VARIANT (ship.ts) to fit whatever rectangle the era gives it.
 *
 * Drawn once by Vue; moved sixty times a second by `frame`, which sets the few attributes that change, directly.
 */
export interface ShipVco {
  sound: Sound
  pads: PadControl
  /** its audio level, 0..1 */
  level: () => number
  sounding: () => boolean
  /** the clip's min / max per column (PERFORM's picture) */
  peaks: (columns: number) => Float32Array | null
  bpm: () => number
}
const props = defineProps<{ era: Era; vcos: (ShipVco | null)[]; beaming: boolean[] }>()
const emit = defineEmits<{ hover: [Part | null]; settings: [Part, number, number]; grab: [boolean] }>()

const root = ref<SVGGElement>()
const ink = computed(() => props.era.ink)
/** an outline width, in the era's weight */
const S = (n: number) => n * (props.era.partStroke ?? props.era.stroke)
const pal = (p: Part) => props.era.palettes[p.vco]
const W = (p: Part) => p.rect[2] - p.rect[0]
const H = (p: Part) => p.rect[3] - p.rect[1]
const CX = (p: Part) => (p.rect[0] + p.rect[2]) / 2
const CY = (p: Part) => (p.rect[1] + p.rect[3]) / 2
const back = computed(() => props.era.parts.filter((p) => p.back))
const front = computed(() => props.era.parts.filter((p) => !p.back))
const N = (n: number) => Array.from({ length: n }, (_, i) => i)
const rad = (deg: number) => (deg * Math.PI) / 180
/** the art mirrored in its rectangle (its pad isn't) */
function flipT(p: Part) {
  if (p.flip === 'x') return `translate(${2 * CX(p)} 0) scale(-1 1)`
  if (p.flip === 'y') return `translate(0 ${2 * CY(p)}) scale(1 -1)`
  return ''
}

// ── the dynamic elements, by part ──
const els = new Map<string, Record<string, Element>>()
const bind = (p: Part, k: string) => (el: unknown) => {
  if (!el) return
  let m = els.get(p.id)
  if (!m) els.set(p.id, (m = {}))
  m[k] = el as Element
}
function set(el: Element | undefined, attr: string, v: string) {
  if (el && el.getAttribute(attr) !== v) el.setAttribute(attr, v)
}
const f1 = (v: number) => v.toFixed(1)

// ── windows ──
function windowShape(p: Part) {
  const [x, y] = p.rect
  const w = W(p)
  const h = H(p)
  const r = p.variant === 'round' ? { rx: w / 2, ry: h / 2 } : p.variant === 'screen' ? { rx: 5, ry: 5 } : p.variant === 'panel' ? { rx: Math.min(18, h * 0.2), ry: Math.min(18, h * 0.2) } : { rx: h / 2, ry: h / 2 }
  return { x, y, width: w, height: h, ...r }
}
const portholes = (p: Part) => Math.max(2, Math.round(W(p) / H(p)))

// ── rotors ──
const rotorR = (p: Part) => Math.min(W(p), H(p)) / 2 - 8
/** a rotor's blades (the grains' LENGTH their width); a ring's lights where `angle` has turned them */
function bladesPath(p: Part, duty: number, angle = 0): string {
  const r = rotorR(p)
  const d0 = Math.max(0.12, Math.min(0.92, duty))
  if (p.variant === 'ring') {
    const rx = W(p) / 2 - 10
    const ry = H(p) / 2 - 10
    let d = ''
    for (let i = 0; i < 10; i++) {
      const a = rad(angle) + (i * Math.PI * 2) / 10
      const s = 4 + 10 * d0 * (0.6 + 0.4 * Math.max(0, Math.sin(a)))
      const x = CX(p) + Math.cos(a) * rx
      const y = CY(p) + Math.sin(a) * ry
      d += `M ${f1(x - s)} ${f1(y)} a ${f1(s)} ${f1(s)} 0 1 0 ${f1(2 * s)} 0 a ${f1(s)} ${f1(s)} 0 1 0 ${f1(-2 * s)} 0 `
    }
    return d
  }
  if (p.variant === 'wheel') {
    let d = ''
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8
      const wdt = 8 + 26 * duty
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const nx = -sa * (wdt / 2)
      const ny = ca * (wdt / 2)
      const r0 = r * 0.55
      d += `M ${f1(ca * r0 + nx)} ${f1(sa * r0 + ny)} L ${f1(ca * r + nx)} ${f1(sa * r + ny)} L ${f1(ca * r - nx)} ${f1(sa * r - ny)} L ${f1(ca * r0 - nx)} ${f1(sa * r0 - ny)} Z `
    }
    return d
  }
  if (p.variant === 'turbine') {
    let d = ''
    const n = 14
    const share = (Math.PI * 2) / n
    for (let i = 0; i < n; i++) {
      const a = i * share
      const half = (share * d0 * 0.8) / 2
      const r0 = r * 0.32
      const r1 = r * 0.84
      d += `M ${f1(Math.cos(a - half * 0.4) * r0)} ${f1(Math.sin(a - half * 0.4) * r0)} L ${f1(Math.cos(a - half + 0.25) * r1)} ${f1(Math.sin(a - half + 0.25) * r1)} L ${f1(Math.cos(a + half + 0.25) * r1)} ${f1(Math.sin(a + half + 0.25) * r1)} L ${f1(Math.cos(a + half * 0.4) * r0)} ${f1(Math.sin(a + half * 0.4) * r0)} Z `
    }
    return d
  }
  // pinwheel / prop: curved petals
  const n = p.variant === 'prop' ? 3 : 6
  const share = (Math.PI * 2) / n
  const half = (share * d0) / 2
  let d = ''
  for (let i = 0; i < n; i++) {
    const a = i * share
    const a0 = a - half
    const a1 = a + half
    d += `M 0 0 Q ${f1(Math.cos(a0 - 0.5) * r * 0.7)} ${f1(Math.sin(a0 - 0.5) * r * 0.7)} ${f1(Math.cos(a0) * r)} ${f1(Math.sin(a0) * r)} A ${f1(r)} ${f1(r)} 0 0 1 ${f1(Math.cos(a1) * r)} ${f1(Math.sin(a1) * r)} Q ${f1(Math.cos(a1 - 0.6) * r * 0.5)} ${f1(Math.sin(a1 - 0.6) * r * 0.5)} 0 0 Z `
  }
  return d
}

// ── swingers: drawn pointing up from a pivot at 0, 0, turned to `dir` ──
function swingFrame(p: Part) {
  const dx = Math.cos(rad(p.dir))
  const dy = Math.sin(rad(p.dir))
  const L = Math.abs(dx) * (W(p) - 8) + Math.abs(dy) * (H(p) - 8)
  const hw = (Math.abs(dy) * W(p) + Math.abs(dx) * H(p)) / 2
  return { x: CX(p) - dx * (W(p) / 2 - 4), y: CY(p) - dy * (H(p) / 2 - 4), L, hw, turn: p.dir + 90 }
}
const swingMax = (p: Part) => (p.variant === 'rudder' || p.variant === 'flap' ? 24 : 36)

// ── domes ──
function domePath(p: Part): string {
  const [x0, y0, x1, y1] = p.rect
  if (p.variant === 'bubble') return `M ${x0} ${CY(p)} A ${W(p) / 2} ${H(p) / 2} 0 1 1 ${x1} ${CY(p)} A ${W(p) / 2} ${H(p) / 2} 0 1 1 ${x0} ${CY(p)} Z`
  return p.variant === 'down' ? `M ${x0} ${y0} A ${W(p) / 2} ${H(p)} 0 0 0 ${x1} ${y0} Z` : `M ${x0} ${y1} A ${W(p) / 2} ${H(p)} 0 0 1 ${x1} ${y1} Z`
}
const domeApex = (p: Part) => ({ x: CX(p), y: p.variant === 'down' ? p.rect[3] : p.rect[1] })
const domeBase = (p: Part) => (p.variant === 'down' ? p.rect[1] : p.variant === 'bubble' ? CY(p) : p.rect[3])

// ── funnels ──
/** stacks: `n` funnels standing in the rectangle, of varied heights */
function stacks(p: Part): { x: number; y: number; w: number; h: number }[] {
  const n = Math.max(1, p.n)
  const slot = W(p) / n
  const hs = [1, 0.8, 0.92, 0.7]
  return N(n).map((i) => {
    const h = H(p) * hs[i % hs.length]
    return { x: p.rect[0] + slot * i + slot * 0.12, y: p.rect[3] - h, w: slot * 0.76, h }
  })
}
/** bells: `n` nozzles, throats along the side opposite `dir`, mouths along it */
function bells(p: Part): { x: number; y: number; L: number; tw: number; mw: number }[] {
  const n = Math.max(1, p.n)
  const dx = Math.cos(rad(p.dir))
  const dy = Math.sin(rad(p.dir))
  const vertical = Math.abs(dy) >= Math.abs(dx)
  const across = vertical ? W(p) : H(p)
  const L = vertical ? H(p) : W(p)
  const slot = across / n
  return N(n).map((i) => {
    const c = slot * (i + 0.5)
    const x = vertical ? p.rect[0] + c : dx > 0 ? p.rect[0] : p.rect[2]
    const y = vertical ? (dy > 0 ? p.rect[1] : p.rect[3]) : p.rect[1] + c
    return { x, y, L: L - 6, tw: slot * 0.42, mw: slot * 0.92 }
  })
}
function bellPath(b: { L: number; tw: number; mw: number }) {
  const { L, tw, mw } = b
  return `M ${-tw / 2} 0 C ${-tw / 2} ${L * 0.5} ${-mw / 2} ${L * 0.7} ${-mw / 2} ${L} L ${mw / 2} ${L} C ${mw / 2} ${L * 0.7} ${tw / 2} ${L * 0.5} ${tw / 2} 0 Z`
}
function hornPath(p: Part): string {
  const [x0, y0, x1, y1] = p.rect
  return `M ${x0 + 6} ${y0} L ${x0 + 40} ${y0} C ${x0 + 60} ${y0 + 50} ${x1 - 10} ${y1 - 60} ${x1} ${y1 - 30} L ${x1 - 70} ${y1} C ${x1 - 80} ${y1 - 40} ${x0 + 20} ${y0 + 60} ${x0 + 6} ${y0} Z`
}
const hornMouth = (p: Part) => ({ x: p.rect[2] - 35, y: p.rect[3] - 15 })
/** where a funnel's smoke rings start */
function funnelTops(p: Part): { x: number; y: number }[] {
  if (p.variant === 'horn') return [hornMouth(p)]
  if (p.variant === 'bells') return bells(p).map((b) => ({ x: b.x + Math.cos(rad(p.dir)) * b.L, y: b.y + Math.sin(rad(p.dir)) * b.L }))
  return stacks(p).map((f) => ({ x: f.x + f.w / 2, y: f.y }))
}

// ── aerials ──
function aerialTip(p: Part) {
  const [, y0, x1, y1] = p.rect
  if (p.variant === 'whisker') return { x: CX(p) + 26, y: y0 + 18 }
  if (p.variant === 'horn') return { x: x1 - 24, y: y0 + 22 }
  if (p.variant === 'spring') return { x: CX(p), y: y1 - 16 }
  if (p.variant === 'dish') return { x: CX(p) + W(p) * 0.18, y: y0 + H(p) * 0.18 }
  return { x: CX(p), y: y0 + 16 }
}
function aerialPath(p: Part): string {
  const [x0, y0, , y1] = p.rect
  const cx = CX(p)
  if (p.variant === 'whisker') return `M ${cx - 20} ${y1} C ${cx - 30} ${y0 + 120} ${cx + 40} ${y0 + 90} ${cx + 26} ${y0 + 18} M ${cx - 6} ${y1} C ${cx - 50} ${y0 + 140} ${x0 + 6} ${y0 + 100} ${x0 + 16} ${y0 + 50}`
  if (p.variant === 'spring') {
    let d = `M ${cx} ${y0}`
    const n = 9
    for (let i = 1; i <= n; i++) d += ` L ${cx + (i % 2 ? 22 : -22)} ${y0 + ((y1 - 34 - y0) * i) / n}`
    return d + ` L ${cx} ${y1 - 30}`
  }
  if (p.variant === 'dish') return `M ${cx} ${y1} L ${cx} ${CY(p)}`
  // mast: crossbars narrowing to the top
  const h = y1 - y0
  let d = `M ${cx} ${y1} L ${cx} ${y0 + 16}`
  for (let i = 1; i <= 3; i++) {
    const y = y1 - (h * i) / 4
    const w = (W(p) / 2 - 8) * (1 - i * 0.22)
    d += ` M ${cx - w} ${y} L ${cx + w} ${y}`
  }
  return d
}
function dishPath(p: Part) {
  const r = Math.min(W(p), H(p)) * 0.42
  const c = { x: CX(p), y: CY(p) }
  // a bowl tipped back, its open side up and forward
  const a0 = rad(-20)
  const a1 = rad(160)
  const p0 = { x: c.x + Math.cos(a0) * r, y: c.y - r * 0.2 + Math.sin(a0) * r }
  const p1 = { x: c.x + Math.cos(a1) * r, y: c.y - r * 0.2 + Math.sin(a1) * r }
  return `M ${f1(p0.x)} ${f1(p0.y)} A ${f1(r)} ${f1(r * 0.62)} -20 0 1 ${f1(p1.x)} ${f1(p1.y)} Z`
}

// ── vents ──
function ventsSlots(p: Part): { x: number; y: number }[] {
  const [x0, y0, x1, y1] = p.rect
  if (p.variant === 'column') return N(3).map((i) => ({ x: CX(p), y: y0 + 40 + i * ((y1 - y0 - 80) / 2) }))
  return N(5).map((i) => ({ x: x0 + 26 + i * ((x1 - x0 - 52) / 4), y: CY(p) }))
}

// ── fins ──
/** a fin's outline, its trailing edge bulging with the mids (-1..1) */
function finPath(p: Part, mid: number): string {
  const [x0, y0, x1, y1] = p.rect
  const b = mid * 22
  if (p.variant === 'wing')
    return `M ${x1 - 10} ${y0 + 20} C ${x1 + 6} ${y0 + 80} ${x1 - 20 + b} ${y1 - 40} ${x0 + 30} ${y1 - 6} C ${x0 + 6} ${y1 - 30} ${x0 + 20 - b} ${y0 + 90} ${x0 + 40} ${y0 + 10} Z`
  if (p.variant === 'keel')
    return `M ${x0 + 10} ${y0} L ${x1 - 6} ${y0} C ${x1 - 30} ${y0 + 50 + b} ${x1 - 50} ${y1 - 30} ${x1 - 90} ${y1} L ${x0 + 70} ${y1 - 10} C ${x0 + 40} ${y1 - 50 - b} ${x0 + 20} ${y0 + 50} ${x0 + 10} ${y0} Z`
  if (p.variant === 'delta') return `M ${x0 + 8} ${y0} L ${x1 - 4} ${y0} C ${x1 - 20 + b} ${y0 + H(p) * 0.45} ${x0 + W(p) * 0.4} ${y1 - 10} ${x0 + 6} ${y1} C ${x0 + 14 - b} ${y0 + H(p) * 0.6} ${x0 + 10} ${y0 + 30} ${x0 + 8} ${y0} Z`
  return `M ${x1 - 8} ${y0} L ${x0 + 60} ${y0 + 10} C ${x0 + 20} ${y0 + 60 + b} ${x0} ${y1 - 30} ${x0 + 10} ${y1} L ${x1 - 60} ${y1 - 30} C ${x1 - 30 + b} ${y1 - 80} ${x1 - 10} ${y0 + 60} ${x1 - 8} ${y0} Z`
}
const finVertical = (p: Part) => p.variant === 'wing'

// ── what each part is doing, frame to frame ──
interface Bubble {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  r: number
  c: number
}
const spin = new Map<string, number>()
const bubbles = new Map<string, Bubble[]>()
const rings = new Map<string, { t: number; at: number }[]>()
const stripes = new Map<string, number>()
const lastEmit = new Map<string, number>()
let hovered: Part | null = null
const heldPart = ref<string | null>(null)
const hot = ref<string | null>(null)
/** a #rrggbb's hue (deg), saturation and lightness (%) */
function hsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  const d = mx - mn
  if (!d) return [0, 0, l * 100]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, s * 100, l * 100]
}
const hueOf = (h: number, s: number, l: number) => `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`

/** One frame: every part of every VCO to what its pad says now. `now` is the audio clock (s), `dt` the frame's time. */
function frame(dt: number, now: number) {
  for (const p of props.era.parts) {
    const v = props.vcos[p.vco]
    const e = els.get(p.id)
    if (!v || !e) continue
    const r = v.pads.raw()
    const at = v.pads.pointOf(p.kind, r)
    const lv = v.level()
    const on = v.sounding()
    // the marker: where the pad's crosshair is
    const mx = p.rect[0] + at.x * W(p)
    const my = p.rect[3] - at.y * H(p)
    set(e.mark, 'transform', `translate(${f1(mx)} ${f1(my)})`)
    set(e.hx, 'd', `M ${p.rect[0]} ${f1(my)} H ${p.rect[2]}`)
    set(e.hy, 'd', `M ${f1(mx)} ${p.rect[1]} V ${p.rect[3]}`)
    if (p.form === 'rotor') frameRotor(p, e, at, r.grainLength ?? 1, lv, on, dt, now, r.grainFreq)
    else if (p.form === 'swinger') frameSwinger(p, e, v, r, lv, now)
    else if (p.form === 'dome') frameDome(p, e, at, r.reverbMix, r.resonance, lv, now, props.beaming[p.vco])
    else if (p.form === 'funnel') frameFunnel(p, e, at, r.ringMix ?? 0, lv, on, dt, now)
    else if (p.form === 'vents') frameVents(p, e, at, lv, on, dt)
    else if (p.form === 'antenna') frameAerial(p, e, r.delayTime, r.delayFeedback, r.delayMix, lv, on, now)
    else if (p.form === 'fin') frameFin(p, e, at, now, lv)
    else if (p.form === 'window') frameWindow(p, e, v, at, lv, on, now)
  }
}

function frameRotor(p: Part, e: Record<string, Element>, at: Point, duty: number, lv: number, on: boolean, dt: number, now: number, hz: number) {
  // faster turns, smaller faster grains; idling slow while silent
  const revs = 0.06 * Math.exp(at.y * 3.6) * (on ? 1 : 0.25)
  const a = ((spin.get(p.id) ?? 0) + revs * 360 * dt) % 360
  spin.set(p.id, a)
  if (p.variant === 'ring') set(e.blades, 'd', bladesPath(p, duty, a))
  else {
    set(e.rot, 'transform', `translate(${CX(p)} ${CY(p)}) rotate(${f1(a)})`)
    set(e.blades, 'd', bladesPath(p, duty))
  }
  // the hub flashes as grains fire
  const flash = on ? 0.5 + 0.5 * Math.max(0, Math.sin(now * Math.PI * 2 * Math.min(hz, 30))) : 0
  set(e.hub, 'opacity', (0.25 + 0.75 * flash * (0.5 + lv)).toFixed(2))
}
function frameSwinger(p: Part, e: Record<string, Element>, v: ShipVco, r: Sound['settings'], lv: number, now: number) {
  const route = lfoRouteOf(r)
  const sw = lfoSwing({ lfo: r.mod.lfo2, ...route, bpm: v.bpm(), now })
  const max = swingMax(p)
  set(e.arm, 'transform', `rotate(${f1((sw - 0.5) * 2 * max)})`)
  const amt = route.amount
  const f = swingFrame(p)
  const a = rad(amt * max)
  const R = f.L * 0.94
  set(e.range, 'd', amt > 0.01 ? `M ${f1(-Math.sin(a) * R)} ${f1(-Math.cos(a) * R)} A ${f1(R)} ${f1(R)} 0 0 1 ${f1(Math.sin(a) * R)} ${f1(-Math.cos(a) * R)}` : 'M 0 0')
  if (e.glow) set(e.glow, 'opacity', (0.25 + 0.75 * Math.min(1, amt + lv * 0.5)).toFixed(2))
}
function frameDome(p: Part, e: Record<string, Element>, at: Point, rev: number, res: number, lv: number, now: number, beaming: boolean) {
  // the filter's tint: warm amber closing to the left, clear in the middle, icy to the right
  const x = at.x
  const tint = x < 0.48 ? hueOf(34, 100, 58 + (x / 0.48) * 20) : x > 0.52 ? hueOf(190, 90, 75 - ((x - 0.52) / 0.48) * 15) : hueOf(0, 0, 92)
  const op = x < 0.48 ? 0.22 + (0.48 - x) * 1.0 : x > 0.52 ? 0.3 + (x - 0.52) * 0.9 : 0.18
  set(e.glass, 'fill', tint)
  set(e.glass, 'fill-opacity', op.toFixed(2))
  // the reverb's ripples, out from the base
  const base = domeBase(p)
  const bubble = p.variant === 'bubble'
  for (let i = 0; i < 4; i++) {
    const k = (now * 0.35 + i / 4) % 1
    const el = e[`r${i}`]
    set(el, 'rx', f1((W(p) / 2) * k))
    set(el, 'ry', f1((bubble ? H(p) / 2 : H(p) * 0.9) * k))
    set(el, 'cy', f1(base))
    set(el, 'opacity', (rev * (1 - k) * (0.6 + lv * 0.6)).toFixed(2))
  }
  // the resonance: a bright wave inside, taller as it rings
  const q = Math.min(1, Math.log(Math.max(0.1, res) / 0.1) / Math.log(200))
  const y = bubble ? CY(p) : CY(p) + (p.variant === 'down' ? -10 : 10)
  let d = `M ${p.rect[0] + 10} ${f1(y)}`
  for (let i = 1; i <= 24; i++) {
    const xx = p.rect[0] + 10 + ((W(p) - 20) * i) / 24
    d += ` L ${f1(xx)} ${f1(y + Math.sin(i * (0.5 + x * 1.4) + now * 3) * (2 + q * 18) * (0.6 + lv))}`
  }
  set(e.wave, 'd', d)
  set(e.beam, 'opacity', beaming ? (0.6 + 0.4 * Math.sin(now * 20)).toFixed(2) : '0')
}
function frameFunnel(p: Part, e: Record<string, Element>, at: Point, ring: number, lv: number, on: boolean, dt: number, now: number) {
  // the stripes run with the pitch: on at its own pitch, faster up the octave, still where it stops, back backwards
  const m = pitchMultiplier(at)
  const off = ((stripes.get(p.id) ?? 0) - m * 46 * dt * (on ? 1 : 0.35)) % 1000
  stripes.set(p.id, off)
  set(e.pat, 'patternTransform', `rotate(${p.variant === 'horn' ? -30 : p.variant === 'bells' ? p.dir - 90 : 35}) translate(0 ${f1(off)})`)
  // the ring modulator: smoke rings, more often as its carrier rises
  const tops = funnelTops(p)
  const list = rings.get(p.id) ?? []
  const every = 1.6 - at.y * 1.3
  if (ring > 0.02 && now - (lastEmit.get(p.id) ?? -9) > every) {
    lastEmit.set(p.id, now)
    list.push({ t: 0, at: list.length % tops.length })
  }
  for (const s of list) s.t += dt
  const live = list.filter((s) => s.t < 2.4).slice(-5)
  rings.set(p.id, live)
  const dx = Math.cos(rad(p.dir))
  const dy = Math.sin(rad(p.dir))
  const across = Math.abs(dx) > Math.abs(dy)
  for (let i = 0; i < 5; i++) {
    const el = e[`s${i}`]
    const s = live[i]
    if (!s) {
      set(el, 'opacity', '0')
      continue
    }
    const top = tops[s.at % tops.length]
    const big = 10 + s.t * 18 * (0.5 + ring)
    const small = 4 + s.t * 6 * (0.5 + ring)
    set(el, 'cx', f1(top.x + dx * s.t * 60))
    set(el, 'cy', f1(top.y + dy * s.t * 60))
    set(el, 'rx', f1(across ? small : big))
    set(el, 'ry', f1(across ? big : small))
    set(el, 'opacity', ((1 - s.t / 2.4) * (0.4 + ring * 0.6) * (0.7 + lv * 0.5)).toFixed(2))
  }
}
function frameVents(p: Part, e: Record<string, Element>, at: Point, lv: number, on: boolean, dt: number) {
  const list = bubbles.get(p.id) ?? []
  const slots = ventsSlots(p)
  // more while it sounds; SPRAY scatters them, DETUNE splits them into two colours drifting apart
  const rate = on ? 6 + lv * 24 : 1.5
  if (Math.random() < rate * dt && list.length < 14) {
    const s = slots[Math.floor(Math.random() * slots.length)]
    const spread = 0.15 + at.x * 1.4
    const ang = rad(p.dir) + (Math.random() - 0.5) * spread
    const sp = 40 + Math.random() * (40 + at.x * 120)
    const split = Math.random() < 0.5 ? -1 : 1
    list.push({ x: s.x, y: s.y, vx: Math.cos(ang) * sp + split * at.y * 40 * Math.sin(ang), vy: Math.sin(ang) * sp - split * at.y * 40 * Math.cos(ang), life: 0, r: 4 + Math.random() * 7, c: at.y > 0.08 ? split : 0 })
  }
  for (const b of list) {
    b.life += dt / 1.6
    b.x += b.vx * dt
    b.y += b.vy * dt
    b.vx *= Math.pow(0.5, dt)
    b.vy = b.vy * Math.pow(0.5, dt) - 12 * dt
  }
  const live = list.filter((b) => b.life < 1)
  bubbles.set(p.id, live)
  for (let i = 0; i < 14; i++) {
    const el = e[`b${i}`]
    const b = live[i]
    if (!b) {
      set(el, 'opacity', '0')
      continue
    }
    set(el, 'cx', f1(b.x))
    set(el, 'cy', f1(b.y))
    set(el, 'r', f1(b.r * (0.6 + b.life)))
    set(el, 'fill', b.c < 0 ? '#ff3d6e' : b.c > 0 ? '#3dd8ff' : pal(p).hi)
    set(el, 'opacity', (1 - b.life).toFixed(2))
  }
}
function frameAerial(p: Part, e: Record<string, Element>, time: number, fb: number, mix: number, lv: number, on: boolean, now: number) {
  // a ring each echo, fading by the feedback: many with a lot of it, one with none
  const tip = aerialTip(p)
  const every = Math.max(0.12, time)
  const list = rings.get(p.id) ?? []
  if (now - (lastEmit.get(p.id) ?? -9) > every) {
    lastEmit.set(p.id, now)
    list.push({ t: now, at: 0 })
  }
  const keep = list.filter((x) => now - x.t < every * 7 && now - x.t < 3.5)
  rings.set(p.id, keep)
  for (let i = 0; i < 7; i++) {
    const el = e[`e${i}`]
    const x = keep[keep.length - 1 - i]
    if (!x) {
      set(el, 'opacity', '0')
      continue
    }
    const age = now - x.t
    const n = age / every
    set(el, 'cx', f1(tip.x))
    set(el, 'cy', f1(tip.y))
    set(el, 'r', f1(8 + age * 70))
    set(el, 'opacity', ((0.15 + 0.85 * mix) * Math.pow(Math.max(0.05, fb), n) * (on ? 0.6 + lv : 0.35) * Math.max(0, 1 - age / 3.5)).toFixed(2))
  }
  set(e.ball, 'opacity', (0.5 + 0.5 * (on ? Math.min(1, lv * 2) : 0)).toFixed(2))
}
function frameFin(p: Part, e: Record<string, Element>, at: Point, now: number, lv: number) {
  const tilt = (at.x - 0.5) * 2
  const mid = (at.y - 0.5) * 2
  const d = finPath(p, mid)
  set(e.shape, 'd', d)
  set(e.clipShape, 'd', d)
  set(e.outline, 'd', d)
  // five bands: the middle one swells with the mids; all warm (darker) or cool (brighter) with the tilt
  const [x0, y0, x1, y1] = p.rect
  const vertical = finVertical(p)
  const span = vertical ? x1 - x0 : y1 - y0
  const weights = [1, 1, 1 + mid * 0.9, 1, 1].map((w) => Math.max(0.2, w))
  const total = weights.reduce((a, b) => a + b, 0)
  let pos = vertical ? x0 : y0
  const flutter = Math.sin(now * 6) * lv * 4
  for (let i = 0; i < 5; i++) {
    const el = e[`f${i}`]
    const size = (weights[i] / total) * span
    let hue = (tilt < 0 ? 50 + tilt * 50 : 50 + tilt * 140) + (i - 2) * 12
    let light = 55 + tilt * 12 - Math.abs(i - 2) * 4
    let sat = 95
    if (props.era.stripes === 'palette') {
      // the section's own colour, nudged warmer and darker or cooler and lighter
      const [h0, s0, l0] = hsl(pal(p).main)
      hue = h0 - tilt * 28 + (i - 2) * 6
      light = Math.min(88, Math.max(18, l0 + tilt * 16 - Math.abs(i - 2) * 3))
      sat = s0
    }
    if (vertical) {
      set(el, 'x', f1(pos))
      set(el, 'width', f1(size + 0.6))
      set(el, 'y', f1(y0 - 10 + flutter))
    } else {
      set(el, 'y', f1(pos))
      set(el, 'height', f1(size + 0.6))
      set(el, 'x', f1(x0 - 10 + flutter))
    }
    set(el, 'fill', hueOf(hue, sat, light))
    pos += size
  }
}
const waveShown = new Map<string, string>()
const waveMorphs = new Map<string, WaveMorph>()
function frameWindow(p: Part, e: Record<string, Element>, v: ShipVco, at: Point, lv: number, on: boolean, now: number) {
  const x = p.rect[0]
  const y = p.rect[1]
  const w = W(p)
  const h = H(p)
  // the liquid: as full as it's loud, its surface rippling with the sound
  const top = y + (1 - at.y) * h
  let d = `M ${x} ${y + h + 4} L ${x} ${f1(top)}`
  for (let i = 0; i <= 20; i++) d += ` L ${f1(x + (w * i) / 20)} ${f1(top + Math.sin(i * 0.9 + now * (on ? 4 : 1.2)) * (2 + lv * 8))}`
  set(e.liquid, 'd', d + ` L ${x + w} ${y + h + 4} Z`)
  // the clip, drawn once per change
  const cols = 60
  // a catch (a new wave in): the old outline morphs into it (lib/waveMorph.ts)
  let m = waveMorphs.get(p.id)
  if (!m) waveMorphs.set(p.id, (m = waveMorph()))
  const target = v.peaks(cols)
  const peaks = m.at(v.sound.audioId, target)
  const moving = m.moving()
  const key = moving ? `morph${now}` : `${v.sound.audioId}|${v.sound.settings.clipIn}|${v.sound.settings.clipOut}|${!!peaks}`
  if (waveShown.get(p.id) !== key) {
    waveShown.set(p.id, key)
    let wd = ''
    if (peaks) {
      const mid = y + h / 2
      for (let c = 0; c < cols; c++) {
        const xx = x + 12 + ((w - 24) * c) / (cols - 1)
        wd += `M ${f1(xx)} ${f1(mid - peaks[c * 2 + 1] * h * 0.36)} V ${f1(mid - peaks[c * 2] * h * 0.36)} `
      }
    }
    set(e.wave, 'd', wd || 'M 0 0')
  }
  // where the grains fire, and where the LFO has them now
  const hx = x + 12 + at.x * (w - 24)
  set(e.head, 'd', `M ${f1(hx)} ${y} V ${y + h}`)
  set(e.headDot, 'cx', f1(hx))
  set(e.headDot, 'cy', f1(top))
  const r = v.pads.raw()
  const route = lfoRouteOf(r)
  if (route.amount > 0 && !v.pads.tableOf()) {
    const fx = Math.min(1, Math.max(0, r.grainPos + lfoOffset(r.mod.lfo2, route.amount, v.bpm(), now, route.unipolar)))
    set(e.fire, 'd', `M ${f1(x + 12 + fx * (w - 24))} ${y + 6} V ${y + h - 6}`)
  } else set(e.fire, 'd', 'M 0 0')
  // bubbles rising through the liquid while it sounds
  for (let i = 0; i < 6; i++) {
    const el = e[`q${i}`]
    const k = (now * (0.3 + i * 0.07) + i * 0.37) % 1
    const bx = x + 20 + ((i * 0.618 * w) % Math.max(1, w - 40))
    set(el, 'cx', f1(bx + Math.sin(now * 3 + i) * 4))
    set(el, 'cy', f1(y + h - k * (y + h - top)))
    set(el, 'opacity', on ? ((1 - k) * 0.8).toFixed(2) : '0')
  }
}

// ── the pointer: a part's rectangle is its pad ──
let grabbing: { part: Part; id: number } | null = null
function toPad(p: Part, e: PointerEvent): Point {
  const m = root.value?.getScreenCTM()
  if (!m) return { x: 0.5, y: 0.5 }
  const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
  return {
    x: Math.min(1, Math.max(0, (q.x - p.rect[0]) / W(p))),
    y: Math.min(1, Math.max(0, 1 - (q.y - p.rect[1]) / H(p))),
  }
}
function down(p: Part, e: PointerEvent) {
  if (e.button !== 0) return
  const v = props.vcos[p.vco]
  if (!v) return
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  grabbing = { part: p, id: e.pointerId }
  heldPart.value = p.id
  emit('grab', true)
  v.pads.moved(p.kind, toPad(p, e))
}
function move(p: Part, e: PointerEvent) {
  if (grabbing?.part === p && grabbing.id === e.pointerId) props.vcos[p.vco]?.pads.moved(p.kind, toPad(p, e))
}
function up(p: Part, e: PointerEvent) {
  if (grabbing?.part !== p || grabbing.id !== e.pointerId) return
  grabbing = null
  heldPart.value = null
  emit('grab', false)
  props.vcos[p.vco]?.pads.ended(p.kind)
}
function enter(p: Part) {
  hovered = p
  hot.value = p.id
  emit('hover', p)
}
function leave(p: Part) {
  if (hot.value === p.id) hot.value = null
  if (hovered === p) {
    hovered = null
    emit('hover', null)
  }
}

defineExpose({ frame, root: () => root.value })
</script>

<template>
  <g ref="root" class="ship">
    <defs>
      <linearGradient id="vy-gloss" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.55" />
        <stop offset="0.45" stop-color="#fff" stop-opacity="0" />
        <stop offset="1" :stop-color="ink" stop-opacity="0.35" />
      </linearGradient>
      <radialGradient id="vy-glassHi" cx="0.35" cy="0.3" r="0.7">
        <stop offset="0" stop-color="#fff" stop-opacity="0.75" />
        <stop offset="0.4" stop-color="#fff" stop-opacity="0.08" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </radialGradient>
      <pattern id="vy-scan" patternUnits="userSpaceOnUse" width="8" height="6">
        <rect width="8" height="2" fill="#000" opacity="0.35" />
      </pattern>
      <template v-for="p in era.parts" :key="p.id">
        <pattern v-if="p.form === 'funnel'" :id="`vy-str-${p.id}`" :ref="bind(p, 'pat')" patternUnits="userSpaceOnUse" width="36" height="36">
          <rect width="36" height="36" :fill="pal(p).hi" />
          <rect width="36" height="18" :fill="pal(p).alt" />
        </pattern>
        <clipPath v-if="p.form === 'window'" :id="`vy-win-${p.id}`"><rect v-bind="windowShape(p)" /></clipPath>
        <clipPath v-if="p.form === 'dome'" :id="`vy-dome-${p.id}`"><path :d="domePath(p)" /></clipPath>
        <clipPath v-if="p.form === 'fin'" :id="`vy-fin-${p.id}`"><path :ref="bind(p, 'clipShape')" :d="finPath(p, 0)" /></clipPath>
      </template>
    </defs>

    <template v-for="layer in ['back', 'hull', 'front']" :key="layer">
      <!-- the era's own art, between the parts behind it and the parts on it -->
      <component :is="era.hull" v-if="layer === 'hull'" :era="era" />
      <g v-for="p in layer === 'back' ? back : layer === 'front' ? front : []" v-else :key="p.id" class="part" :class="{ dormant: !vcos[p.vco] }">
        <!-- ── windows ── -->
        <template v-if="p.form === 'window'">
          <rect v-bind="windowShape(p)" :fill="pal(p).deep" />
          <g :clip-path="`url(#vy-win-${p.id})`">
            <path :ref="bind(p, 'liquid')" d="M 0 0" :fill="pal(p).alt" fill-opacity="0.78" />
            <circle v-for="i in N(6)" :key="i" :ref="bind(p, `q${i}`)" cx="0" cy="0" r="4" fill="#fff" opacity="0" />
            <path :ref="bind(p, 'wave')" d="M 0 0" :stroke="pal(p).hi" stroke-width="4" stroke-linecap="round" />
            <path :ref="bind(p, 'fire')" d="M 0 0" :stroke="pal(p).glow" stroke-width="4" stroke-dasharray="6 6" />
            <path :ref="bind(p, 'head')" d="M 0 0" stroke="#fff" stroke-width="5" />
            <circle :ref="bind(p, 'headDot')" cx="0" cy="0" r="9" fill="#fff" :stroke="ink" :stroke-width="S(4)" />
            <rect v-if="p.variant === 'screen'" :x="p.rect[0]" :y="p.rect[1]" :width="W(p)" :height="H(p)" fill="url(#vy-scan)" />
            <path :d="`M ${p.rect[0] + W(p) * 0.08} ${p.rect[1] + H(p) * 0.85} L ${p.rect[0] + W(p) * 0.22} ${p.rect[1] + H(p) * 0.1} L ${p.rect[0] + W(p) * 0.3} ${p.rect[1] + H(p) * 0.1} L ${p.rect[0] + W(p) * 0.16} ${p.rect[1] + H(p) * 0.85} Z`" fill="#fff" opacity="0.14" />
          </g>
          <rect v-bind="windowShape(p)" fill="none" :stroke="ink" :stroke-width="S(8)" />
          <rect :x="p.rect[0] + 6" :y="p.rect[1] + 6" :width="W(p) - 12" :height="H(p) - 12" :rx="Math.max(0, windowShape(p).rx - 6)" :ry="Math.max(0, windowShape(p).ry - 6)" fill="none" :stroke="pal(p).hi" stroke-width="3" opacity="0.8" />
          <g v-if="p.variant === 'ports'">
            <circle v-for="i in N(portholes(p))" :key="i" :cx="p.rect[0] + H(p) / 2 + i * ((W(p) - H(p)) / Math.max(1, portholes(p) - 1))" :cy="CY(p)" :r="H(p) / 2 - 4" fill="none" :stroke="ink" :stroke-width="S(5)" />
          </g>
        </template>

        <!-- ── rotors ── -->
        <template v-else-if="p.form === 'rotor'">
          <g :transform="flipT(p)">
            <template v-if="p.variant === 'ring'">
              <ellipse :cx="CX(p)" :cy="CY(p)" :rx="W(p) / 2 - 2" :ry="H(p) / 2 - 2" :fill="pal(p).deep" :stroke="ink" :stroke-width="S(7)" />
              <ellipse :cx="CX(p)" :cy="CY(p)" :rx="W(p) / 2 - 10" :ry="H(p) / 2 - 10" fill="none" :stroke="pal(p).main" :stroke-width="S(5)" />
              <path :ref="bind(p, 'blades')" :d="bladesPath(p, 0.6)" :fill="pal(p).glow" :stroke="ink" :stroke-width="S(3)" />
              <circle :ref="bind(p, 'hub')" :cx="CX(p)" :cy="CY(p)" :r="Math.min(W(p), H(p)) * 0.18" :fill="pal(p).hi" opacity="0.3" />
            </template>
            <template v-else>
              <circle v-if="p.variant === 'wheel' || p.variant === 'turbine'" :cx="CX(p)" :cy="CY(p)" :r="Math.min(W(p), H(p)) / 2 - 2" :fill="pal(p).deep" :stroke="ink" :stroke-width="S(7)" />
              <line v-if="p.variant === 'prop'" :x1="p.rect[2] + 20" :y1="CY(p)" :x2="CX(p)" :y2="CY(p)" :stroke="ink" :stroke-width="S(16)" />
              <g :ref="bind(p, 'rot')" :transform="`translate(${CX(p)} ${CY(p)})`">
                <path :ref="bind(p, 'blades')" :d="bladesPath(p, 0.6)" :fill="p.variant === 'wheel' || p.variant === 'turbine' ? pal(p).main : pal(p).alt" :stroke="ink" :stroke-width="S(p.variant === 'turbine' ? 3 : 6)" stroke-linejoin="round" />
                <circle v-if="p.variant === 'wheel'" :r="rotorR(p) * 0.75" fill="none" :stroke="pal(p).hi" stroke-width="5" />
              </g>
              <circle v-if="p.variant === 'turbine'" :cx="CX(p)" :cy="CY(p)" :r="rotorR(p) * 0.92" fill="none" :stroke="pal(p).main" :stroke-width="S(8)" />
              <circle :cx="CX(p)" :cy="CY(p)" :r="p.variant === 'wheel' ? 22 : p.variant === 'turbine' ? rotorR(p) * 0.3 : 18" :fill="pal(p).main" :stroke="ink" :stroke-width="S(6)" />
              <circle :ref="bind(p, 'hub')" :cx="CX(p)" :cy="CY(p)" :r="p.variant === 'wheel' ? 12 : 9" fill="#fff" opacity="0.3" />
              <template v-if="p.variant === 'wheel'">
                <path :d="`M ${p.rect[0] - 6} ${CY(p) - 10} A ${W(p) / 2 + 6} ${H(p) / 2 + 6} 0 0 1 ${p.rect[2] + 6} ${CY(p) - 10}`" fill="none" :stroke="ink" :stroke-width="S(16)" stroke-linecap="round" />
                <path :d="`M ${p.rect[0] - 6} ${CY(p) - 10} A ${W(p) / 2 + 6} ${H(p) / 2 + 6} 0 0 1 ${p.rect[2] + 6} ${CY(p) - 10}`" fill="none" :stroke="pal(p).alt" stroke-width="8" stroke-linecap="round" />
              </template>
            </template>
          </g>
        </template>

        <!-- ── swingers ── -->
        <template v-else-if="p.form === 'swinger'">
          <g :transform="`${flipT(p)} translate(${swingFrame(p).x} ${swingFrame(p).y}) rotate(${swingFrame(p).turn})`">
            <path :ref="bind(p, 'range')" d="M 0 0" fill="none" :stroke="pal(p).hi" stroke-width="4" stroke-dasharray="3 9" stroke-linecap="round" opacity="0.8" />
            <g :ref="bind(p, 'arm')">
              <template v-if="p.variant === 'periscope'">
                <rect x="-11" :y="-swingFrame(p).L + 34" width="22" :height="swingFrame(p).L - 30" :fill="pal(p).alt" :stroke="ink" :stroke-width="S(6)" />
                <rect x="-26" :y="-swingFrame(p).L + 6" width="62" height="40" rx="10" :fill="pal(p).main" :stroke="ink" :stroke-width="S(6)" />
                <circle cx="26" :cy="-swingFrame(p).L + 26" r="12" :fill="pal(p).deep" :stroke="pal(p).hi" stroke-width="4" />
                <circle cx="22" :cy="-swingFrame(p).L + 22" r="4" fill="#fff" />
              </template>
              <template v-else-if="p.variant === 'lantern'">
                <line x1="0" y1="0" x2="0" :y2="-swingFrame(p).L + 60" :stroke="ink" :stroke-width="S(5)" stroke-dasharray="8 5" />
                <circle :ref="bind(p, 'glow')" cx="0" :cy="-swingFrame(p).L + 34" r="44" :fill="pal(p).glow" opacity="0.4" style="mix-blend-mode: screen" />
                <path :d="`M -26 ${-swingFrame(p).L + 58} H 26 L 32 ${-swingFrame(p).L + 14} H -32 Z`" :fill="pal(p).hi" :stroke="ink" :stroke-width="S(6)" stroke-linejoin="round" />
                <rect x="-18" :y="-swingFrame(p).L + 56" width="36" height="12" rx="4" :fill="pal(p).alt" :stroke="ink" :stroke-width="S(5)" />
                <rect x="-36" :y="-swingFrame(p).L + 4" width="72" height="12" rx="4" :fill="pal(p).alt" :stroke="ink" :stroke-width="S(5)" />
              </template>
              <template v-else-if="p.variant === 'rudder'">
                <path :d="`M -30 0 C -40 ${-swingFrame(p).L + 80} -10 ${-swingFrame(p).L + 10} 50 ${-swingFrame(p).L} C 40 ${-swingFrame(p).L + 90} 40 -50 30 0 Z`" :fill="pal(p).alt" :stroke="ink" :stroke-width="S(7)" stroke-linejoin="round" />
                <path :d="`M -26 -50 L 36 -70 M -22 -110 L 40 -130 M -10 -170 L 44 -186`" :stroke="pal(p).main" stroke-width="14" stroke-linecap="round" />
              </template>
              <template v-else-if="p.variant === 'flap'">
                <path :d="`M ${-swingFrame(p).hw * 0.9} 0 L ${swingFrame(p).hw * 0.9} 0 L ${swingFrame(p).hw * 0.55} ${-swingFrame(p).L} Q 0 ${-swingFrame(p).L - 14} ${-swingFrame(p).hw * 0.55} ${-swingFrame(p).L} Z`" :fill="pal(p).main" :stroke="ink" :stroke-width="S(6)" stroke-linejoin="round" />
                <path :d="`M ${-swingFrame(p).hw * 0.5} ${-swingFrame(p).L * 0.35} L ${swingFrame(p).hw * 0.5} ${-swingFrame(p).L * 0.35} M ${-swingFrame(p).hw * 0.4} ${-swingFrame(p).L * 0.65} L ${swingFrame(p).hw * 0.4} ${-swingFrame(p).L * 0.65}`" :stroke="pal(p).deep" :stroke-width="S(4)" opacity="0.6" />
                <circle r="10" :fill="pal(p).alt" :stroke="ink" :stroke-width="S(5)" />
              </template>
              <template v-else>
                <!-- arm: a rod, a knuckle, a beacon -->
                <rect x="-7" :y="-swingFrame(p).L + 24" width="14" :height="swingFrame(p).L - 24" rx="7" :fill="pal(p).alt" :stroke="ink" :stroke-width="S(5)" />
                <circle :cy="-swingFrame(p).L / 2" r="10" :fill="pal(p).main" :stroke="ink" :stroke-width="S(4)" />
                <circle :ref="bind(p, 'glow')" :cy="-swingFrame(p).L + 20" r="34" :fill="pal(p).glow" opacity="0.4" style="mix-blend-mode: screen" />
                <circle :cy="-swingFrame(p).L + 20" r="16" :fill="pal(p).hi" :stroke="ink" :stroke-width="S(5)" />
              </template>
              <circle v-if="p.variant !== 'flap'" r="9" :fill="pal(p).main" :stroke="ink" :stroke-width="S(4)" />
            </g>
          </g>
        </template>

        <!-- ── funnels ── -->
        <template v-else-if="p.form === 'funnel'">
          <g :transform="flipT(p)">
            <template v-if="p.variant === 'horn'">
              <path :d="hornPath(p)" :fill="`url(#vy-str-${p.id})`" :stroke="ink" :stroke-width="S(7)" stroke-linejoin="round" />
              <ellipse :cx="hornMouth(p).x" :cy="hornMouth(p).y" rx="42" ry="16" :transform="`rotate(-28 ${hornMouth(p).x} ${hornMouth(p).y})`" :fill="pal(p).deep" :stroke="ink" :stroke-width="S(6)" />
            </template>
            <template v-else-if="p.variant === 'bells'">
              <g v-for="(b, i) in bells(p)" :key="i" :transform="`translate(${b.x} ${b.y}) rotate(${p.dir - 90})`">
                <path :d="bellPath(b)" :fill="`url(#vy-str-${p.id})`" :stroke="ink" :stroke-width="S(5)" stroke-linejoin="round" />
                <ellipse cx="0" :cy="b.L" :rx="b.mw / 2" :ry="Math.max(4, b.mw * 0.14)" :fill="pal(p).deep" :stroke="ink" :stroke-width="S(4)" />
                <rect :x="-b.tw / 2 - 4" y="-4" :width="b.tw + 8" height="12" rx="4" :fill="pal(p).main" :stroke="ink" :stroke-width="S(4)" />
              </g>
            </template>
            <template v-else>
              <g v-for="(fu, i) in stacks(p)" :key="i">
                <path :d="`M ${fu.x + 4} ${fu.y + fu.h} L ${fu.x} ${fu.y + 10} H ${fu.x + fu.w} L ${fu.x + fu.w - 4} ${fu.y + fu.h} Z`" :fill="`url(#vy-str-${p.id})`" :stroke="ink" :stroke-width="S(6)" stroke-linejoin="round" />
                <rect :x="fu.x - 6" :y="fu.y" :width="fu.w + 12" height="14" rx="5" :fill="pal(p).main" :stroke="ink" :stroke-width="S(5)" />
              </g>
            </template>
            <ellipse v-for="i in N(5)" :key="`s${i}`" :ref="bind(p, `s${i}`)" cx="0" cy="0" rx="1" ry="1" fill="none" stroke="#fff" stroke-width="5" opacity="0" />
          </g>
        </template>

        <!-- ── aerials ── -->
        <template v-else-if="p.form === 'antenna'">
          <g :transform="flipT(p)">
            <template v-if="p.variant === 'horn'">
              <path :d="`M ${p.rect[0] + 22} ${p.rect[3]} L ${p.rect[0] + 22} ${p.rect[3] - 26} L ${p.rect[0] + 38} ${p.rect[3] - 26} L ${p.rect[0] + 38} ${p.rect[3]} Z`" :fill="pal(p).alt" :stroke="ink" :stroke-width="S(5)" />
              <path :d="`M ${p.rect[0] + 26} ${p.rect[3] - 24} C ${p.rect[0] + 30} ${p.rect[1] + 60} ${p.rect[2] - 70} ${p.rect[1] + 70} ${p.rect[2] - 54} ${p.rect[1] + 50} L ${p.rect[2] + 4} ${p.rect[1] + 2} C ${p.rect[2] - 40} ${p.rect[1] + 40} ${p.rect[0] + 60} ${p.rect[1] + 50} ${p.rect[0] + 36} ${p.rect[3] - 24} Z`" :fill="pal(p).main" :stroke="ink" :stroke-width="S(6)" stroke-linejoin="round" />
              <ellipse :cx="p.rect[2] - 24" :cy="p.rect[1] + 22" rx="34" ry="14" :transform="`rotate(-40 ${p.rect[2] - 24} ${p.rect[1] + 22})`" :fill="pal(p).alt" :stroke="ink" :stroke-width="S(6)" />
            </template>
            <template v-else>
              <path :d="aerialPath(p)" fill="none" :stroke="ink" :stroke-width="S(p.variant === 'spring' ? 6 : 7)" stroke-linecap="round" stroke-linejoin="round" />
              <path v-if="p.variant === 'dish'" :d="dishPath(p)" :fill="pal(p).main" :stroke="ink" :stroke-width="S(6)" stroke-linejoin="round" />
              <line v-if="p.variant === 'dish'" :x1="CX(p)" :y1="CY(p) - Math.min(W(p), H(p)) * 0.1" :x2="aerialTip(p).x" :y2="aerialTip(p).y" :stroke="ink" :stroke-width="S(4)" />
              <circle v-if="p.variant !== 'dish'" :cx="aerialTip(p).x" :cy="aerialTip(p).y" r="15" :fill="pal(p).alt" :stroke="ink" :stroke-width="S(6)" />
            </template>
            <circle :ref="bind(p, 'ball')" :cx="aerialTip(p).x" :cy="aerialTip(p).y" :r="p.variant === 'horn' || p.variant === 'dish' ? 9 : 7" :fill="pal(p).hi" />
            <circle v-for="i in N(7)" :key="`e${i}`" :ref="bind(p, `e${i}`)" cx="0" cy="0" r="1" fill="none" :stroke="pal(p).hi" stroke-width="4" opacity="0" />
          </g>
        </template>

        <!-- ── fins ── -->
        <template v-else-if="p.form === 'fin'">
          <g :transform="flipT(p)">
            <path :ref="bind(p, 'shape')" :d="finPath(p, 0)" :fill="pal(p).main" />
            <g :clip-path="`url(#vy-fin-${p.id})`">
              <rect v-for="i in N(5)" :key="i" :ref="bind(p, `f${i}`)" :x="p.rect[0] - 10" :y="p.rect[1] - 10" :width="finVertical(p) ? 20 : W(p) + 20" :height="finVertical(p) ? H(p) + 20 : 20" />
            </g>
            <path :ref="bind(p, 'outline')" :d="finPath(p, 0)" fill="none" :stroke="ink" :stroke-width="S(7)" stroke-linejoin="round" />
          </g>
        </template>

        <!-- ── domes ── -->
        <template v-else-if="p.form === 'dome'">
          <circle :ref="bind(p, 'beam')" :cx="domeApex(p).x" :cy="domeApex(p).y" r="40" :fill="pal(p).glow" opacity="0" style="mix-blend-mode: screen" />
          <path :d="domePath(p)" :fill="era.glass ? era.glass.fill : pal(p).deep" :opacity="era.glass ? era.glass.opacity : 1" />
          <path v-if="!era.glass" :d="domePath(p)" :fill="pal(p).alt" opacity="0.4" />
          <path :ref="bind(p, 'glass')" :d="domePath(p)" fill="#fff" fill-opacity="0.2" />
          <g :clip-path="`url(#vy-dome-${p.id})`">
            <ellipse v-for="i in N(4)" :key="i" :ref="bind(p, `r${i}`)" :cx="CX(p)" cy="0" rx="1" ry="1" fill="none" :stroke="pal(p).hi" stroke-width="4" opacity="0" />
            <path :ref="bind(p, 'wave')" d="M 0 0" fill="none" :stroke="pal(p).glow" stroke-width="4" stroke-linejoin="round" />
          </g>
          <path v-if="!era.glass || era.glass.highlight" :d="domePath(p)" fill="url(#vy-glassHi)" />
          <path :d="domePath(p)" fill="none" :stroke="ink" :stroke-width="S(7)" stroke-linejoin="round" />
          <rect v-if="p.variant !== 'bubble'" :x="p.rect[0] - 14" :y="p.variant === 'down' ? p.rect[1] - 10 : p.rect[3] - 8" :width="W(p) + 28" height="18" rx="8" :fill="pal(p).alt" :stroke="ink" :stroke-width="S(6)" />
          <circle :cx="domeApex(p).x" :cy="domeApex(p).y" r="10" :fill="pal(p).glow" :stroke="ink" :stroke-width="S(5)" />
        </template>

        <!-- ── vents ── -->
        <template v-else-if="p.form === 'vents'">
          <rect v-if="p.variant === 'row'" :x="p.rect[0]" :y="CY(p) - 18" :width="W(p)" height="36" rx="18" :fill="pal(p).deep" :stroke="ink" :stroke-width="S(6)" />
          <rect v-else :x="CX(p) - 30" :y="p.rect[1]" width="60" :height="H(p)" rx="30" :fill="pal(p).deep" :stroke="ink" :stroke-width="S(6)" />
          <circle v-for="(s, i) in ventsSlots(p)" :key="i" :cx="s.x" :cy="s.y" :r="p.variant === 'column' ? 20 : 11" :fill="pal(p).alt" :stroke="ink" :stroke-width="S(4)" />
          <circle v-for="i in N(14)" :key="`b${i}`" :ref="bind(p, `b${i}`)" cx="0" cy="0" r="4" fill="#fff" :stroke="ink" stroke-width="2.5" opacity="0" />
        </template>
      </g>
    </template>

    <!-- ── the pads themselves: each part's rectangle, over everything ── -->
    <g class="hits">
      <g
        v-for="p in era.parts"
        :key="p.id"
        class="hit"
        :class="{ dormant: !vcos[p.vco], hot: hot === p.id || heldPart === p.id }"
        @pointerenter="enter(p)"
        @pointerleave="leave(p)"
        @pointerdown.stop="(e: PointerEvent) => down(p, e)"
        @pointermove="(e: PointerEvent) => move(p, e)"
        @pointerup="(e: PointerEvent) => up(p, e)"
        @pointercancel="(e: PointerEvent) => up(p, e)"
        @lostpointercapture="(e: PointerEvent) => up(p, e)"
        @dblclick.stop="vcos[p.vco]?.pads.reset(p.kind)"
        @contextmenu.prevent.stop="(e: MouseEvent) => emit('settings', p, e.clientX, e.clientY)"
      >
        <rect :x="p.rect[0] - 6" :y="p.rect[1] - 6" :width="W(p) + 12" :height="H(p) + 12" rx="16" class="area" :stroke="pal(p).hi" />
        <path :ref="bind(p, 'hx')" d="M 0 0" class="cross" :stroke="pal(p).hi" />
        <path :ref="bind(p, 'hy')" d="M 0 0" class="cross" :stroke="pal(p).hi" />
        <g :ref="bind(p, 'mark')" class="mark">
          <path d="M 0 -16 L 4 -4 L 16 0 L 4 4 L 0 16 L -4 4 L -16 0 L -4 -4 Z" fill="#fff" :stroke="ink" stroke-width="3" stroke-linejoin="round" />
          <circle r="4" :fill="pal(p).alt" />
        </g>
        <g class="tag" :transform="`translate(${p.rect[0]} ${p.rect[1] - 16})`">
          <rect x="0" y="-22" :width="p.name.length * 13 + 22" height="28" rx="14" :fill="ink" :stroke="pal(p).hi" stroke-width="3" />
          <text x="11" y="-2" class="tagtext" :fill="pal(p).hi">{{ p.name }}</text>
        </g>
      </g>
    </g>
  </g>
</template>

<style scoped>
.ship {
  user-select: none;
}
.ship :deep(.hull),
.part {
  pointer-events: none;
}
.part.dormant {
  opacity: 0.35;
}
.hit {
  cursor: grab;
  touch-action: none;
}
.hit.hot {
  cursor: grabbing;
}
.hit.dormant {
  pointer-events: none;
}
.area {
  fill: transparent;
  stroke-width: 3;
  stroke-dasharray: 10 8;
  stroke-opacity: 0;
  transition: stroke-opacity 0.15s;
}
.hit.hot .area {
  stroke-opacity: 0.9;
}
.cross {
  stroke-width: 2;
  stroke-dasharray: 4 6;
  opacity: 0;
  pointer-events: none;
}
.hit.hot .cross {
  opacity: 0.7;
}
.mark {
  pointer-events: none;
  opacity: 0.55;
  transition: opacity 0.15s;
}
.hit.hot .mark {
  opacity: 1;
}
.hit.dormant .mark {
  opacity: 0;
}
.tag {
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
}
.hit.hot .tag {
  opacity: 1;
}
.tagtext {
  font-family: 'Orbitron', sans-serif;
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 2px;
}
</style>
