<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import type { ControlSpec, Skin } from '../../lib/voyage/cockpit/design'
import { KNOBS, LEVERS, PLATES } from '../../lib/voyage/cockpit/looks'
import { nearestStop, paramOf, type Stop } from '../../lib/voyage/cockpit/params'

/**
 * One of a cockpit's controls (cockpit/design.ts ControlKind), drawn in its era's skin and played by dragging: a
 * knob up / down, a lever along its quadrant, a crank or valve wheel round, a chain pulled down, a patch lead from
 * jack to jack, a stick anywhere. `value` is its axis (0..1, a stick's x; `value2` its y); `set` says where it's been
 * moved to, `end` when let go. A stepped one (`stops`) moves from detent to detent.
 */
const props = defineProps<{ spec: ControlSpec; skin: Skin; value: number; value2?: number; stops: Stop[] | null; color: string; hint?: string; readout?: string }>()
const emit = defineEmits<{ set: [number, number?]; end: []; hover: [string | null] }>()
const toDesign = inject<(e: PointerEvent) => { x: number; y: number }>('cockpitPoint')!

const s = computed(() => props.spec)
const id = computed(() => `cp-${s.value.vco}-${s.value.param}`)
const def = computed(() => paramOf(s.value.param))
const knob = computed(() => KNOBS[props.skin.knob])
const lever = computed(() => LEVERS[props.skin.lever])
const plate = computed(() => PLATES[props.skin.plate])
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const rad = (d: number) => (d * Math.PI) / 180
const snap = (v: number) => (props.stops ? nearestStop(props.stops, v).at : v)
const held = ref(false)

// ── dragging ──
let start = { x: 0, y: 0, v: 0, v2: 0, a: 0, turns: 0 }
const angleAt = (p: { x: number; y: number }) => Math.atan2(p.y - s.value.y, p.x - s.value.x)
function down(e: PointerEvent) {
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  held.value = true
  const p = toDesign(e)
  start = { x: p.x, y: p.y, v: props.value, v2: props.value2 ?? 0.5, a: angleAt(p), turns: 0 }
  // a lever, slider, chain or stick goes straight to where it's grabbed along its travel; a cable picks up its plug
  if (s.value.kind === 'stick') stickTo(p)
  move(e)
}
function move(e: PointerEvent) {
  if (!held.value || !(e.currentTarget as Element).hasPointerCapture(e.pointerId)) return
  const p = toDesign(e)
  const k = s.value.kind
  const fine = e.shiftKey ? 0.2 : 1
  if (k === 'knob' || k === 'counter' || k === 'toggle') {
    const span = k === 'counter' ? 260 : k === 'toggle' ? 60 : 220
    emit('set', snap(clamp01(start.v + ((start.y - p.y) / span) * fine)))
  } else if (k === 'selector') {
    // round its dial, from stop to stop
    const a = Math.atan2(p.y - s.value.y, p.x - s.value.x)
    let deg = ((a * 180) / Math.PI + 90 + 360) % 360
    if (deg > 180) deg -= 360
    emit('set', snap(clamp01((deg + 135) / 270)))
  } else if (k === 'crank' || k === 'valve') {
    const a = angleAt(p)
    let d = a - start.a
    if (d > Math.PI) d -= Math.PI * 2
    if (d < -Math.PI) d += Math.PI * 2
    start.a = a
    const full = (k === 'crank' ? 2.5 : 1.25) * Math.PI * 2
    start.v = clamp01(start.v + (d / full) * fine)
    emit('set', snap(start.v))
  } else if (k === 'lever' || k === 'slider') {
    const a = rad(s.value.angle ?? 0)
    const ux = Math.sin(a)
    const uy = -Math.cos(a)
    const t = ((p.x - s.value.x) * ux + (p.y - s.value.y) * uy) / s.value.size + 0.5
    emit('set', snap(clamp01(t)))
  } else if (k === 'chain') {
    emit('set', snap(clamp01((p.y - chainTop.value - CHAIN_REST) / s.value.size)))
  } else if (k === 'cable') {
    plugAt.value = p
    emit('set', nearestJack(p).at)
  } else if (k === 'stick') stickTo(p)
}
function up(e: PointerEvent) {
  if (!held.value) return
  held.value = false
  plugAt.value = null
  ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
  emit('end')
}
function stickTo(p: { x: number; y: number }) {
  const R = s.value.size
  emit('set', clamp01(0.5 + (p.x - s.value.x) / (2 * R)), clamp01(0.5 - (p.y - s.value.y) / (2 * R)))
}

// ── rotary ──
const sweep = (v: number) => -135 + 270 * v
const R = computed(() => s.value.size)
/** a scalloped edge (bakelite flutes) or a toothed one (knurl) */
function edgePath(r: number, n: number, depth: number) {
  let d = ''
  for (let i = 0; i <= n * 4; i++) {
    const a = (i / (n * 4)) * Math.PI * 2
    const rr = r - depth * (0.5 + 0.5 * Math.cos(a * n))
    d += `${i ? 'L' : 'M'} ${(Math.cos(a) * rr).toFixed(2)} ${(Math.sin(a) * rr).toFixed(2)} `
  }
  return d + 'Z'
}
const ticks = computed(() => {
  const n = props.stops ? props.stops.length : 11
  return Array.from({ length: n }, (_, i) => {
    const v = props.stops ? (s.value.kind === 'selector' ? i / Math.max(1, n - 1) : props.stops[i].at) : i / (n - 1)
    const a = rad(sweep(v) - 90)
    return { a, major: !props.stops && i % 5 === 0, label: props.stops?.[i]?.label ?? '' }
  })
})
/** a selector's needle: which stop, evenly round its dial */
const selIndex = computed(() => (props.stops ? props.stops.indexOf(nearestStop(props.stops, props.value)) : 0))
const selV = computed(() => (props.stops ? selIndex.value / Math.max(1, props.stops.length - 1) : props.value))
const arcPath = (r: number, v0: number, v1: number) => {
  const a0 = rad(sweep(v0) - 90)
  const a1 = rad(sweep(v1) - 90)
  const large = Math.abs(v1 - v0) * 270 > 180 ? 1 : 0
  return `M ${(Math.cos(a0) * r).toFixed(2)} ${(Math.sin(a0) * r).toFixed(2)} A ${r} ${r} 0 ${large} 1 ${(Math.cos(a1) * r).toFixed(2)} ${(Math.sin(a1) * r).toFixed(2)}`
}
const arcFrom = computed(() => (def.value.bipolar ? 0.5 : 0))

// ── linear ──
const dir = computed(() => {
  const a = rad(s.value.angle ?? 0)
  return { x: Math.sin(a), y: -Math.cos(a) }
})
const along = (t: number) => ({ x: s.value.x + dir.value.x * (t - 0.5) * s.value.size, y: s.value.y + dir.value.y * (t - 0.5) * s.value.size })
const head = computed(() => along(props.value))

// ── chain ──
const CHAIN_REST = 40
const chainTop = computed(() => s.value.y - s.value.size / 2 - CHAIN_REST)
const chainEnd = computed(() => chainTop.value + CHAIN_REST + props.value * s.value.size)
const links = computed(() => {
  const n = Math.max(3, Math.round((chainEnd.value - chainTop.value) / 11))
  return Array.from({ length: n }, (_, i) => ({ y: chainTop.value + ((i + 0.5) * (chainEnd.value - chainTop.value)) / n, side: i % 2 === 0 }))
})

// ── cable ──
const plugAt = ref<{ x: number; y: number } | null>(null)
const jacks = computed(() => {
  const n = props.stops?.length ?? 0
  const w = s.value.size
  return (props.stops ?? []).map((st, i) => ({ ...st, x: s.value.x - w / 2 + (n > 1 ? (i * w) / (n - 1) : w / 2), y: s.value.y }))
})
function nearestJack(p: { x: number; y: number }) {
  return jacks.value.reduce((a, b) => (Math.hypot(b.x - p.x, b.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? b : a))
}
const plugged = computed(() => (props.stops ? jacks.value[props.stops.indexOf(nearestStop(props.stops, props.value))] : null))
const plug = computed(() => plugAt.value ?? (plugged.value ? { x: plugged.value.x, y: plugged.value.y } : { x: s.value.x, y: s.value.y }))
/** the lead: from its socket, sagging down to the plug */
const leadFrom = computed(() => {
  const x = s.value.x - s.value.size / 2 - 46
  if (s.value.lead === 'left') return { x, y: s.value.y }
  if (s.value.lead === 'above') return { x, y: s.value.y - 12 }
  return { x, y: s.value.y + 36 }
})
const leadPath = computed(() => {
  const a = leadFrom.value
  const b = plug.value
  // below: a loop hanging under the bay; left / above: a shallow droop, kept inside the bay's plate
  const sag = s.value.lead === 'left' || s.value.lead === 'above' ? 18 + Math.abs(b.x - a.x) * 0.06 : 60 + Math.abs(b.x - a.x) * 0.25
  return `M ${a.x} ${a.y} C ${a.x + 10} ${a.y + sag} ${b.x} ${b.y + sag} ${b.x} ${b.y + 14}`
})

// ── stick ──
const stickTop = computed(() => ({ x: s.value.x + ((props.value ?? 0.5) - 0.5) * 2 * s.value.size * 0.8, y: s.value.y - ((props.value2 ?? 0.5) - 0.5) * 2 * s.value.size * 0.8 }))

// ── counter ──
const STEPS_MAX = 32
const counterText = computed(() => {
  if (props.readout !== undefined) return props.readout.padStart(2, '0').slice(-2)
  if (s.value.param === 'steps') return String(Math.round(props.value * (STEPS_MAX - 1)) + 1).padStart(2, '0')
  if (s.value.param === 'hits') return String(Math.round(props.value * 99)).padStart(2, '0').slice(0, 2)
  return String(Math.round(props.value * 99)).padStart(2, '0')
})

const counterStyle = computed(() => props.skin.counter ?? (['crtGreen', 'crtAmber'].includes(props.skin.screen) ? 'nixie' : props.skin.screen === 'lcd' ? 'lcd' : props.skin.screen === 'flat' ? 'flip' : 'led'))

// ── its label ──
const showLabel = computed(() => s.value.label !== false)
/** a linear control lying across: its label goes under its middle, not past its end */
const across = computed(() => (s.value.kind === 'lever' || s.value.kind === 'slider') && Math.abs(Math.sin(rad(s.value.angle ?? 0))) > 0.7)
const labelY = computed(() => {
  const k = s.value.kind
  if (across.value) return s.value.y + (k === 'lever' ? 44 : 34)
  if (k === 'lever' || k === 'slider') return s.value.y + s.value.size / 2 + 26
  if (k === 'chain') return chainTop.value - 10
  if (k === 'cable') return s.value.y + 40
  if (k === 'counter') return s.value.y + 38
  if (k === 'toggle') return s.value.y + 40
  return s.value.y + R.value + (knob.value.skirt || s.value.kind === 'selector' ? 24 : 18)
})
const labelText = computed(() => def.value.label)
const stopLabel = computed(() => (props.stops ? nearestStop(props.stops, props.value).label : ''))
const plateW = computed(() => Math.max(38, labelText.value.length * 7.2 + 14))
const textFill = computed(() => props.skin.plateText ?? (plate.value.text || props.skin.label))
</script>

<template>
  <g
    class="cp"
    :class="[spec.kind, { held }]"
    @pointerdown.stop="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="up"
    @lostpointercapture="up"
    @pointerenter="emit('hover', hint ?? def.help)"
    @pointerleave="emit('hover', null)"
  >
    <defs>
      <radialGradient :id="`${id}-body`" cx="0.35" cy="0.3" r="0.85">
        <stop offset="0" :stop-color="knob.tintCap && knob.clear ? color : knob.body[0]" :stop-opacity="knob.clear ? 0.95 : 1" />
        <stop offset="0.55" :stop-color="knob.clear ? color : knob.body[1]" :stop-opacity="knob.clear ? 0.75 : 1" />
        <stop offset="1" :stop-color="knob.clear ? color : knob.body[2]" :stop-opacity="knob.clear ? 0.9 : 1" />
      </radialGradient>
      <radialGradient :id="`${id}-cap`" cx="0.4" cy="0.3" r="0.9">
        <stop offset="0" :stop-color="knob.tintCap ? '#ffffff' : knob.cap[0]" :stop-opacity="knob.tintCap ? 0.85 : 1" />
        <stop offset="0.35" :stop-color="knob.tintCap ? color : knob.cap[0]" />
        <stop offset="1" :stop-color="knob.tintCap ? color : knob.cap[1]" />
      </radialGradient>
      <linearGradient :id="`${id}-metal`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" :stop-color="skin.metal[2]" />
        <stop offset="0.5" :stop-color="skin.metal[1]" />
        <stop offset="1" :stop-color="skin.metal[0]" />
      </linearGradient>
      <linearGradient :id="`${id}-rod`" x1="0" y1="0" x2="1" y2="0">
        <stop v-for="(c, i) in lever.rod" :key="i" :offset="i / Math.max(1, lever.rod.length - 1)" :stop-color="c" />
      </linearGradient>
      <radialGradient :id="`${id}-grip`" cx="0.35" cy="0.3" r="0.9">
        <stop offset="0" :stop-color="lever.tint ? '#ffffff' : lever.grip[0]" :stop-opacity="lever.tint ? 0.9 : 1" />
        <stop offset="0.4" :stop-color="lever.tint ? color : lever.grip[0]" />
        <stop offset="1" :stop-color="lever.tint ? color : lever.grip[lever.grip.length - 1]" :stop-opacity="1" />
      </radialGradient>
      <linearGradient :id="`${id}-plate`" x1="0" y1="0" x2="0" y2="1">
        <stop v-for="(c, i) in plate.fill" :key="i" :offset="i / Math.max(1, plate.fill.length - 1)" :stop-color="c" />
      </linearGradient>
    </defs>

    <!-- ── rotaries: knob, selector ── -->
    <g v-if="spec.kind === 'knob' || spec.kind === 'selector'" :transform="`translate(${spec.x} ${spec.y})`">
      <ellipse :cx="R * 0.12" :cy="R * 0.22" :rx="R * 1.08" :ry="R * 1.02" fill="#000" opacity="0.45" filter="url(#cp-soft)" />
      <circle v-if="knob.skirt || spec.kind === 'selector'" :r="R * 1.32" :fill="spec.kind === 'selector' ? skin.metal[0] : knob.skirt!" opacity="0.9" />
      <g class="scale">
        <line
          v-for="(t, i) in ticks"
          :key="i"
          :x1="Math.cos(t.a) * R * 1.14"
          :y1="Math.sin(t.a) * R * 1.14"
          :x2="Math.cos(t.a) * R * (t.major ? 1.32 : 1.24)"
          :y2="Math.sin(t.a) * R * (t.major ? 1.32 : 1.24)"
          :stroke="knob.skirt && !knob.arc ? skin.label : color"
          :stroke-width="t.major ? 2 : 1.2"
          :opacity="0.85"
        />
        <template v-if="spec.kind === 'selector'">
          <text
            v-for="(t, i) in ticks"
            :key="`l${i}`"
            :x="Math.cos(t.a) * R * (ticks.length > 10 ? 1.72 : 1.62)"
            :y="Math.sin(t.a) * R * (ticks.length > 10 ? 1.72 : 1.62) + 3"
            :font-size="ticks.length > 12 ? 6.4 : ticks.length > 9 ? 7.2 : 8"
            v-show="ticks.length <= 12 || i % 2 === 0 || i === selIndex"
            class="stop"
            :class="{ lit: i === selIndex }"
            :fill="i === selIndex ? color : skin.label"
            :font-family="skin.font"
            text-anchor="middle"
          >{{ t.label }}</text>
        </template>
      </g>
      <path v-if="knob.arc" :d="arcPath(R * 1.18, arcFrom, spec.kind === 'selector' ? selV : value)" fill="none" :stroke="color" stroke-width="3.5" stroke-linecap="round" class="glowline" />
      <!-- the body -->
      <path v-if="knob.edge === 'flutes'" :d="edgePath(R, 14, R * 0.09)" :fill="`url(#${id}-body)`" :stroke="skin.ink" :stroke-width="skin.stroke" />
      <g v-else-if="knob.edge === 'knurl'">
        <circle :r="R" :fill="`url(#${id}-body)`" :stroke="skin.ink" :stroke-width="skin.stroke" />
        <circle :r="R" fill="url(#cp-knurl)" opacity="0.35" style="mix-blend-mode: multiply" />
      </g>
      <circle v-else-if="knob.edge === 'smooth'" :r="R" :fill="`url(#${id}-body)`" :stroke="knob.clear ? '#ffffff80' : skin.ink" :stroke-width="knob.clear ? 1.5 : skin.stroke" />
      <!-- the cap, turned -->
      <g :transform="`rotate(${sweep(spec.kind === 'selector' ? selV : value)})`">
        <template v-if="skin.knob === 'chickenhead' || spec.kind === 'selector'">
          <path :d="`M 0 ${-R * 1.08} C ${R * 0.28} ${-R * 0.6} ${R * 0.62} ${R * 0.1} ${R * 0.52} ${R * 0.55} C ${R * 0.3} ${R * 0.85} ${-R * 0.3} ${R * 0.85} ${-R * 0.52} ${R * 0.55} C ${-R * 0.62} ${R * 0.1} ${-R * 0.28} ${-R * 0.6} 0 ${-R * 1.08} Z`" :fill="`url(#${id}-cap)`" :stroke="skin.ink" :stroke-width="Math.max(1, skin.stroke)" />
          <line x1="0" :y1="-R * 0.95" x2="0" :y2="-R * 0.35" :stroke="knob.pointer" stroke-width="3" stroke-linecap="round" />
        </template>
        <template v-else-if="skin.knob === 'holo' || skin.knob === 'flat'">
          <circle :r="R * (skin.knob === 'flat' ? 0.92 : 0.7)" :fill="skin.knob === 'flat' ? color : 'none'" :stroke="color" :stroke-width="skin.knob === 'holo' ? 1.5 : 0" :opacity="skin.knob === 'holo' ? 0.7 : 1" />
          <line x1="0" :y1="-R * 0.85" x2="0" :y2="-R * 0.3" :stroke="skin.knob === 'flat' ? '#fff' : color" stroke-width="3" stroke-linecap="round" />
        </template>
        <template v-else>
          <circle :r="R * 0.68" :fill="`url(#${id}-cap)`" :stroke="knob.clear ? '#ffffff60' : '#00000040'" stroke-width="1" />
          <line x1="0" :y1="-R * 0.92" x2="0" :y2="-R * 0.4" :stroke="knob.pointer" stroke-width="3" stroke-linecap="round" />
          <circle v-if="skin.knob === 'wood' || skin.knob === 'brass'" :r="R * 0.18" :fill="`url(#${id}-metal)`" />
        </template>
      </g>
      <ellipse v-if="knob.gloss" :cx="-R * 0.25" :cy="-R * 0.42" :rx="R * 0.55" :ry="R * 0.3" fill="#fff" :opacity="knob.gloss * 0.55" transform="rotate(-20)" />
    </g>

    <!-- ── linear: lever, slider ── -->
    <g v-else-if="spec.kind === 'lever' || spec.kind === 'slider'">
      <!-- the slot and its quadrant -->
      <g :transform="`translate(${spec.x} ${spec.y}) rotate(${spec.angle ?? 0})`">
        <rect :x="spec.kind === 'lever' ? -26 : -16" :y="-spec.size / 2 - 22" :width="spec.kind === 'lever' ? 52 : 32" :height="spec.size + 44" :rx="spec.kind === 'lever' ? 14 : 8" :fill="`url(#${id}-metal)`" :stroke="skin.ink" :stroke-width="skin.stroke" />
        <rect x="-5" :y="-spec.size / 2" width="10" :height="spec.size" rx="5" fill="#000" opacity="0.85" />
        <rect v-if="lever.glow" x="-2" :y="spec.size / 2 - value * spec.size" width="4" :height="value * spec.size" rx="2" :fill="color" class="glowline" />
        <line
          v-for="i in (stops ? stops.length : 9)"
          :key="i"
          :x1="spec.kind === 'lever' ? 9 : 7"
          :x2="spec.kind === 'lever' ? 20 : 13"
          :y1="spec.size / 2 - (stops ? stops[i - 1].at : (i - 1) / 8) * spec.size"
          :y2="spec.size / 2 - (stops ? stops[i - 1].at : (i - 1) / 8) * spec.size"
          :stroke="skin.label"
          :stroke-width="stops || (i - 1) % 4 === 0 ? 1.6 : 0.8"
          opacity="0.8"
        />
        <line v-if="def.bipolar" :x1="-22" x2="22" y1="0" y2="0" :stroke="color" stroke-width="1.5" opacity="0.6" />
      </g>
      <!-- the handle -->
      <g :transform="`translate(${head.x} ${head.y}) rotate(${spec.angle ?? 0})`">
        <template v-if="spec.kind === 'lever'">
          <ellipse cx="6" cy="10" rx="20" ry="9" fill="#000" opacity="0.4" filter="url(#cp-soft)" />
          <rect x="-5" y="-34" width="10" height="38" rx="3" :fill="`url(#${id}-rod)`" />
          <template v-if="lever.head === 'tee'">
            <rect x="-24" y="-48" width="48" height="16" rx="8" :fill="`url(#${id}-grip)`" :stroke="skin.ink" :stroke-width="skin.stroke" />
            <rect x="-18" y="-46" width="30" height="4" rx="2" fill="#fff" :opacity="lever.gloss * 0.6" />
          </template>
          <template v-else-if="lever.head === 'paddle'">
            <path d="M -16 -30 L 16 -30 L 12 -62 Q 0 -70 -12 -62 Z" :fill="`url(#${id}-grip)`" :stroke="skin.ink" :stroke-width="skin.stroke" />
            <rect x="-8" y="-58" width="16" height="3" rx="1.5" :fill="color" class="glowline" />
          </template>
          <template v-else>
            <circle cy="-46" r="16" :fill="`url(#${id}-grip)`" :stroke="skin.ink" :stroke-width="skin.stroke" />
            <ellipse cx="-5" cy="-52" rx="7" ry="4" fill="#fff" :opacity="lever.gloss * 0.7" />
          </template>
        </template>
        <template v-else>
          <rect x="-16" y="-11" width="32" height="22" rx="4" fill="#000" opacity="0.35" transform="translate(3 4)" />
          <rect x="-16" y="-11" width="32" height="22" rx="4" :fill="`url(#${id}-grip)`" :stroke="skin.ink" :stroke-width="skin.stroke" />
          <line x1="-12" x2="12" y1="0" y2="0" :stroke="lever.tint ? '#fff' : '#000'" stroke-width="2" opacity="0.7" />
          <line x1="-12" x2="12" y1="-5" y2="-5" stroke="#000" stroke-width="0.8" opacity="0.35" />
          <line x1="-12" x2="12" y1="5" y2="5" stroke="#000" stroke-width="0.8" opacity="0.35" />
        </template>
      </g>
    </g>

    <!-- ── crank: a handle wound round a boss ── -->
    <g v-else-if="spec.kind === 'crank'" :transform="`translate(${spec.x} ${spec.y})`">
      <circle :r="R * 1.22" fill="#000" opacity="0.3" filter="url(#cp-soft)" />
      <circle :r="R * 1.12" fill="none" :stroke="skin.metal[0]" stroke-width="5" opacity="0.8" />
      <path :d="arcPath(R * 1.12, 0, value)" fill="none" :stroke="color" stroke-width="4" stroke-linecap="round" class="glowline" />
      <g :transform="`rotate(${value * 900})`">
        <path :d="`M -9 0 L -6 ${-R} L 6 ${-R} L 9 0 Z`" :fill="`url(#${id}-metal)`" :stroke="skin.ink" :stroke-width="skin.stroke" />
        <circle :cy="-R" r="13" fill="#000" opacity="0.35" transform="translate(3 4)" />
        <circle :cy="-R" r="13" :fill="`url(#${id}-grip)`" :stroke="skin.ink" :stroke-width="skin.stroke" />
        <circle :cy="-R" r="13" fill="url(#cp-knurl)" opacity="0.25" />
        <ellipse :cx="-4" :cy="-R - 5" rx="5" ry="3" fill="#fff" opacity="0.5" />
      </g>
      <circle r="16" :fill="`url(#${id}-metal)`" :stroke="skin.ink" :stroke-width="skin.stroke" />
      <circle r="5" :fill="skin.metal[0]" />
    </g>

    <!-- ── valve: a spoked hand wheel ── -->
    <g v-else-if="spec.kind === 'valve'" :transform="`translate(${spec.x} ${spec.y})`">
      <ellipse :cx="R * 0.1" :cy="R * 0.18" :rx="R * 1.05" :ry="R" fill="#000" opacity="0.45" filter="url(#cp-soft)" />
      <g :transform="`rotate(${value * 450})`">
        <line v-for="k in 5" :key="k" x1="0" y1="0" :x2="Math.cos(rad(k * 72)) * R * 0.86" :y2="Math.sin(rad(k * 72)) * R * 0.86" :stroke="color" stroke-width="9" stroke-linecap="round" />
        <line v-for="k in 5" :key="`h${k}`" x1="0" y1="0" :x2="Math.cos(rad(k * 72)) * R * 0.86" :y2="Math.sin(rad(k * 72)) * R * 0.86" stroke="#fff" stroke-width="2" opacity="0.3" />
        <circle :r="R * 0.9" fill="none" :stroke="skin.ink" stroke-width="16" opacity="0.7" />
        <circle :r="R * 0.9" fill="none" :stroke="color" stroke-width="12" />
        <circle :r="R * 0.9" fill="none" stroke="#fff" stroke-width="3" opacity="0.35" stroke-dasharray="40 30" />
        <circle v-for="k in 10" :key="`g${k}`" :cx="Math.cos(rad(k * 36)) * R * 0.9" :cy="Math.sin(rad(k * 36)) * R * 0.9" r="4.5" :fill="skin.ink" opacity="0.5" />
      </g>
      <circle :r="R * 0.24" :fill="`url(#${id}-metal)`" :stroke="skin.ink" :stroke-width="skin.stroke" />
      <polygon :points="[0, 1, 2, 3, 4, 5].map((k) => `${Math.cos(rad(k * 60)) * R * 0.11},${Math.sin(rad(k * 60)) * R * 0.11}`).join(' ')" :fill="skin.metal[0]" />
    </g>

    <!-- ── chain: hanging, with a pull ── -->
    <g v-else-if="spec.kind === 'chain'">
      <circle :cx="spec.x" :cy="chainTop" r="9" :fill="`url(#${id}-metal)`" :stroke="skin.ink" :stroke-width="skin.stroke" />
      <g v-for="(l, i) in links" :key="i">
        <ellipse v-if="l.side" :cx="spec.x" :cy="l.y" rx="4" ry="7" fill="none" :stroke="skin.metal[1]" stroke-width="3" />
        <ellipse v-else :cx="spec.x" :cy="l.y" rx="1.6" ry="7" :fill="skin.metal[2]" />
      </g>
      <g :transform="`translate(${spec.x} ${chainEnd})`">
        <path d="M -5 0 L 5 0 L 9 30 Q 0 38 -9 30 Z" fill="#000" opacity="0.35" transform="translate(3 4)" />
        <path d="M -5 0 L 5 0 L 9 30 Q 0 38 -9 30 Z" :fill="`url(#${id}-grip)`" :stroke="skin.ink" :stroke-width="skin.stroke" />
        <rect x="-8" y="10" width="16" height="3" :fill="skin.metal[2]" opacity="0.8" />
      </g>
      <!-- its reach: a scale beside it -->
      <line :x1="spec.x + 22" :x2="spec.x + 22" :y1="chainTop + CHAIN_REST" :y2="chainTop + CHAIN_REST + spec.size" :stroke="skin.label" stroke-width="1" opacity="0.5" />
      <line :x1="spec.x + 18" :x2="spec.x + 26" :y1="chainEnd" :y2="chainEnd" :stroke="color" stroke-width="3" class="glowline" />
    </g>

    <!-- ── cable: a patch lead from jack to jack ── -->
    <g v-else-if="spec.kind === 'cable'">
      <rect :x="spec.x - spec.size / 2 - 64" :y="spec.y - 22" :width="spec.size + 92" height="70" rx="8" :fill="skin.cablePlate ?? `url(#${id}-metal)`" :stroke="skin.ink" :stroke-width="skin.stroke" opacity="0.95" />
      <rect :x="spec.x - spec.size / 2 - 64" :y="spec.y - 22" :width="spec.size + 92" height="70" rx="8" fill="url(#cp-scratch)" opacity="0.25" style="mix-blend-mode: overlay" />
      <g v-for="(j, i) in jacks" :key="i">
        <circle :cx="j.x" :cy="j.y" r="8.5" :fill="skin.metal[0]" :stroke="skin.metal[2]" stroke-width="2" />
        <circle :cx="j.x" :cy="j.y" r="4" fill="#000" />
        <text :x="j.x" :y="j.y + (i % 2 ? 31 : 21)" class="jack" :font-family="skin.font" :fill="plugged === j ? color : skin.label" text-anchor="middle">{{ j.label }}</text>
      </g>
      <circle :cx="leadFrom.x" :cy="leadFrom.y" r="10" :fill="skin.metal[0]" :stroke="skin.metal[2]" stroke-width="2" />
      <!-- the lead (frayed near its plug: an old one) -->
      <path :d="leadPath" fill="none" :stroke="skin.ink" stroke-width="9" stroke-linecap="round" />
      <path :d="leadPath" fill="none" :stroke="color" stroke-width="6" stroke-linecap="round" />
      <path :d="leadPath" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity="0.35" transform="translate(-1.5 -1.5)" />
      <g :transform="`translate(${plug.x} ${plug.y})`">
        <g v-if="spec.variant === 'frayed'">
          <path d="M -3 14 l -5 10 M 0 14 l 1 12 M 3 14 l 6 9" :stroke="'#d88b3a'" stroke-width="1.3" fill="none" />
          <rect x="-6" y="10" width="12" height="6" :fill="color" opacity="0.6" />
        </g>
        <rect x="-7" y="-4" width="14" height="18" rx="3" :fill="`url(#${id}-metal)`" :stroke="skin.ink" :stroke-width="skin.stroke" />
        <rect x="-5" y="-12" width="10" height="9" rx="2" :fill="skin.metal[2]" />
        <circle v-if="held" r="16" fill="none" :stroke="color" stroke-width="2" class="glowline spark" />
      </g>
    </g>

    <!-- ── stick: PITCH's both axes ── -->
    <g v-else-if="spec.kind === 'stick'">
      <rect :x="spec.x - spec.size" :y="spec.y - spec.size" :width="spec.size * 2" :height="spec.size * 2" :rx="spec.size * 0.25" :fill="`url(#${id}-metal)`" :stroke="skin.ink" :stroke-width="skin.stroke" opacity="0.9" />
      <line :x1="spec.x - spec.size * 0.85" :x2="spec.x + spec.size * 0.85" :y1="spec.y" :y2="spec.y" :stroke="skin.label" stroke-width="1" opacity="0.4" />
      <line :y1="spec.y - spec.size * 0.85" :y2="spec.y + spec.size * 0.85" :x1="spec.x" :x2="spec.x" :stroke="skin.label" stroke-width="1" opacity="0.4" />
      <circle :cx="spec.x" :cy="spec.y" :r="spec.size * 0.42" :fill="skin.ink" opacity="0.8" />
      <circle :cx="spec.x" :cy="spec.y" :r="spec.size * 0.34" fill="url(#cp-boot)" />
      <line :x1="spec.x" :y1="spec.y" :x2="stickTop.x" :y2="stickTop.y" :stroke="skin.ink" stroke-width="14" stroke-linecap="round" />
      <line :x1="spec.x" :y1="spec.y" :x2="stickTop.x" :y2="stickTop.y" :stroke="`url(#${id}-rod)`" stroke-width="10" stroke-linecap="round" />
      <ellipse :cx="stickTop.x + 6" :cy="stickTop.y + 10" rx="24" ry="14" fill="#000" opacity="0.35" filter="url(#cp-soft)" />
      <circle :cx="stickTop.x" :cy="stickTop.y" r="22" :fill="`url(#${id}-grip)`" :stroke="skin.ink" :stroke-width="skin.stroke" />
      <circle :cx="stickTop.x - 3" :cy="stickTop.y - 3" r="7" :fill="color" class="glowline" opacity="0.9" />
      <ellipse :cx="stickTop.x - 7" :cy="stickTop.y - 10" rx="8" ry="4" fill="#fff" opacity="0.5" />
    </g>

    <!-- ── counter: nixie / flip digits ── -->
    <g v-else-if="spec.kind === 'counter'" :transform="`translate(${spec.x} ${spec.y})`">
      <rect x="-34" y="-26" width="68" height="52" rx="8" :fill="counterStyle === 'lcd' ? '#2a3324' : '#050302'" :stroke="`url(#${id}-metal)`" stroke-width="4" />
      <g v-for="(ch, i) in counterText.split('')" :key="i" :transform="`translate(${(i - 0.5) * 30} 0)`">
        <template v-if="counterStyle === 'nixie'">
          <rect x="-13" y="-21" width="26" height="42" rx="11" fill="#1a0e06" stroke="#ffffff22" stroke-width="1" />
          <text y="13" class="nixie" text-anchor="middle" :fill="color" font-family="'Courier New', monospace">{{ ch }}</text>
          <rect x="-13" y="-21" width="26" height="42" rx="11" fill="url(#cp-tube)" />
        </template>
        <template v-else-if="counterStyle === 'lcd'">
          <rect x="-13" y="-20" width="26" height="40" rx="2" fill="#a9b892" />
          <text y="12" class="seg ghost" text-anchor="middle" fill="#1c2618">8</text>
          <text y="12" class="seg" text-anchor="middle" fill="#1c2618">{{ ch }}</text>
        </template>
        <template v-else-if="counterStyle === 'flip'">
          <rect x="-13" y="-20" width="26" height="40" rx="3" fill="#1d1d20" />
          <rect x="-13" y="-20" width="26" height="20" rx="3" fill="#2a2a2e" />
          <text y="12" class="flipd" text-anchor="middle" fill="#f4f1ea" :font-family="skin.font">{{ ch }}</text>
          <line x1="-13" x2="13" y1="0" y2="0" stroke="#000" stroke-width="1.5" />
        </template>
        <template v-else>
          <rect x="-13" y="-20" width="26" height="40" rx="3" fill="#020203" />
          <text y="12" class="seg ghost" text-anchor="middle" :fill="color">8</text>
          <text y="12" class="seg lit" text-anchor="middle" :fill="color">{{ ch }}</text>
        </template>
      </g>
    </g>

    <!-- ── toggle: a bat handle ── -->
    <g v-else-if="spec.kind === 'toggle'" :transform="`translate(${spec.x} ${spec.y})`">
      <rect x="-16" y="-22" width="32" height="44" rx="5" :fill="`url(#${id}-metal)`" :stroke="skin.ink" :stroke-width="skin.stroke" />
      <circle r="9" :fill="skin.metal[0]" />
      <g :transform="`rotate(${(value - 0.5) * -70 + (value > 0.5 ? 0 : 180)})`">
        <path d="M -4 0 L -6 -26 Q 0 -32 6 -26 L 4 0 Z" :fill="`url(#${id}-rod)`" :stroke="skin.ink" stroke-width="1" />
      </g>
      <circle :cy="-30" r="4" :fill="value > 0.55 ? color : '#222'" :class="{ glowline: value > 0.55 }" />
    </g>

    <!-- its label -->
    <g v-if="showLabel" :transform="`translate(${spec.kind === 'cable' ? spec.x - spec.size / 2 - 40 : spec.x} ${(spec.kind === 'cable' ? spec.y - (spec.lead === 'left' || spec.lead === 'above' ? 20 : 4) : labelY) + (spec.labelDy ?? 0)})`" class="label">
      <rect v-if="skin.plate !== 'silk' && skin.plate !== 'neon' && skin.plate !== 'none' && skin.plate !== 'etched'" :x="-plateW / 2" y="-9" :width="plateW" height="16" rx="3" :fill="`url(#${id}-plate)`" :stroke="plate.edge" stroke-width="0.8" />
      <circle v-if="skin.plate === 'brass'" :cx="-plateW / 2 + 4" cy="-1" r="1.4" fill="#3a2408" />
      <circle v-if="skin.plate === 'brass'" :cx="plateW / 2 - 4" cy="-1" r="1.4" fill="#3a2408" />
      <text v-if="plate.engraved" y="4.6" text-anchor="middle" class="ltext" fill="#ffffff" opacity="0.35" :font-family="skin.font">{{ labelText }}</text>
      <text y="3.6" text-anchor="middle" class="ltext" :class="{ neon: plate.glow }" :fill="plate.glow ? color : textFill" :font-family="skin.font">{{ labelText }}</text>
      <text v-if="stops && spec.kind !== 'selector' && spec.kind !== 'cable'" y="18" text-anchor="middle" class="readout" :fill="color" :font-family="skin.font">{{ stopLabel }}</text>
    </g>
  </g>
</template>

<style scoped>
.cp {
  cursor: grab;
  touch-action: none;
}
.cp.held {
  cursor: grabbing;
}
.cp.cable {
  cursor: move;
}
.ltext {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  pointer-events: none;
}
.ltext.neon,
.glowline {
  filter: drop-shadow(0 0 3px currentColor) drop-shadow(0 0 6px currentColor);
}
.readout {
  font-size: 9px;
  letter-spacing: 0.08em;
  pointer-events: none;
}
.stop {
  letter-spacing: 0.04em;
  pointer-events: none;
}
.stop.lit {
  font-weight: 700;
}
.jack {
  font-size: 7.5px;
  letter-spacing: -0.02em;
  pointer-events: none;
}
.nixie {
  font-size: 34px;
  font-weight: 400;
  filter: drop-shadow(0 0 3px #ff7a1a) drop-shadow(0 0 8px #ff5a00);
}
.seg {
  font-family: 'VT323', monospace;
  font-size: 40px;
}
.seg.ghost {
  opacity: 0.12;
}
.seg.lit {
  filter: drop-shadow(0 0 3px currentColor) drop-shadow(0 0 7px currentColor);
}
.flipd {
  font-size: 30px;
  font-weight: 700;
}
.spark {
  animation: spark 0.25s linear infinite;
}
@keyframes spark {
  from {
    opacity: 1;
    transform: scale(0.6);
  }
  to {
    opacity: 0;
    transform: scale(1.4);
  }
}
</style>
