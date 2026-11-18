<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, reactive, ref, shallowRef, watch } from 'vue'
import type { Era } from '../../lib/voyage/ship'
import { rgb } from '../../lib/voyage/ship'
import type { ShipVco } from '../VoyageShip.vue'
import type { CockpitDesign, ControlSpec, ScreenStyle } from '../../lib/voyage/cockpit/design'
import { STAGE } from '../../lib/voyage/cockpit/design'
import { Field3, type Intake, type Rock3 } from '../../lib/voyage/cockpit/field3d'
import { paramOf, stopsOf, writeParam, type PointIO } from '../../lib/voyage/cockpit/params'
import { Ahead, Air } from '../../lib/voyage/cockpit/cockpitGL'
import { texture, TEXTURE_SIZE, type TextureId } from '../../lib/voyage/cockpit/textures'
import type { Payload } from '../../lib/voyage/field'
import { ringPoint } from '../../lib/garden/garden'
import { drawClip, drawEcho, drawFx, drawLfo, drawTexture, drawTone, type Colors } from '../../lib/play/draw'
import { echoDivisions } from '../../lib/play/pads'
import { lfoRouteOf } from '../../lib/play/padControl'
import { clock } from '../../audio/engine'
import CockpitControl from './CockpitControl.vue'
import TextureDefs from './TextureDefs.vue'

/**
 * VOYAGE from the pilot's seat (VoyageView's COCKPIT): the era's cockpit (cockpit/eras/) round you, the voyage's sky
 * through its windscreen with the stars streaking past and the rocks coming at you (cockpit/field3d.ts, drawn by
 * cockpitGL.ts's AHEAD), every VCO's controls on its dash (CockpitControl.vue), its screens showing what the PLAY pads
 * draw, its gauges the VCOs' levels; and over it all the AIR -- light shafts, dust, grain, interference -- and the
 * era's film: its vignette, scanlines, tint.
 *
 * The stage is 1600 × 900 design units scaled to fit; the art reaches past it. A rock meant for an open intake that
 * comes near is beamed down into it (or click one), and VoyageView stitches its sound in, as outside.
 */
const props = defineProps<{
  era: Era
  design: CockpitDesign
  vcos: (ShipVco | null)[]
  /** the VCO's intake can take a catch now */
  open: (vco: number) => boolean
  /** what a new rock for the VCO carries (null: none for it now) */
  payloadFor: (vco: number) => Payload | null
  /** the field's thickness, 0..1 */
  density: number
  /** the light, film and print: 0..1 */
  amount: number
  bpm: number
}>()
const emit = defineEmits<{ catch: [vco: number, payload: Payload]; hover: [string | null]; grab: [boolean] }>()

const root = ref<HTMLDivElement>()
const aheadEl = ref<HTMLCanvasElement>()
const airEl = ref<HTMLCanvasElement>()
const svg = ref<SVGSVGElement>()
const glassEl = ref<SVGPathElement>()
const size = reactive({ w: 1200, h: 800 })
/** the stage's fit: design → css px */
const fit = computed(() => {
  const k = Math.min(size.w / STAGE.w, size.h / STAGE.h)
  return { k, x: (size.w - STAGE.w * k) / 2, y: (size.h - STAGE.h * k) / 2 }
})
const toPx = (x: number, y: number): [number, number] => [fit.value.x + x * fit.value.k, fit.value.y + y * fit.value.k]
provide('cockpitPoint', (e: PointerEvent) => {
  const r = svg.value!.getBoundingClientRect()
  return { x: ((e.clientX - r.left) / r.width) * STAGE.w, y: ((e.clientY - r.top) / r.height) * STAGE.h }
})

const skin = computed(() => props.design.skin)
const colorOf = (vco: number) => skin.value.vco[vco] ?? '#fff'

// ── the controls: what each reads and writes ──
function io(vco: number): PointIO | null {
  const v = props.vcos[vco]
  if (!v) return null
  return {
    read: (pad) => (pad === 'garden' ? (v.garden.ring() ? ringPoint(v.garden.ring()!) : { x: 0.5, y: 0.5 }) : v.pads.pointOf(pad)),
    move: (pad, p) => (pad === 'garden' ? v.garden.moved(p) : v.pads.moved(pad, p)),
    end: (pad) => {
      if (pad !== 'garden') v.pads.ended(pad)
    },
  }
}
const controls = computed(() => props.design.controls.filter((c) => props.vcos[c.vco]))
/** each control's value(s), refreshed a frame at a time (an LFO turns its knob) */
const vals = reactive<number[]>([])
const vals2 = reactive<number[]>([])
function readAll() {
  controls.value.forEach((c, i) => {
    const x = io(c.vco)
    if (!x) return
    const d = paramOf(c.param)
    const p = x.read(d.pad)
    const v = p[d.axis]
    if (vals[i] === undefined || Math.abs(vals[i] - v) > 0.0004) vals[i] = v
    if (c.kind === 'stick' && (vals2[i] === undefined || Math.abs(vals2[i] - p.y) > 0.0004)) vals2[i] = p.y
  })
}
/** a garden counter's digits: the picked ring's steps, or its hits */
function counterOf(c: ControlSpec): string {
  void vals[controls.value.indexOf(c)]
  const r = props.vcos[c.vco]?.garden.ring()
  if (!r) return '--'
  return String(c.param === 'steps' ? r.n : r.k)
}
const stopsFor = (c: ControlSpec) => stopsOf(c.param, { bpm: props.bpm, grainSync: !!props.vcos[c.vco]?.pads.raw().grainSync })
function setControl(c: ControlSpec, v: number, v2?: number) {
  const x = io(c.vco)
  if (!x) return
  if (c.kind === 'stick') x.move('pitch', { x: v, y: v2 ?? 0.5 })
  else writeParam(x, paramOf(c.param), v)
  emit('grab', true)
}
function endControl(c: ControlSpec) {
  io(c.vco)?.end(paramOf(c.param).pad)
  emit('grab', false)
}

// ── the screens ──
const screenEls: (HTMLCanvasElement | null)[] = []
const PHOSPHOR: Record<ScreenStyle, (vco: string) => Colors & { bg: string }> = {
  crtGreen: () => ({ line: '#7dffa0', cross: '#e9ffe9', bg: '#031408' }),
  crtAmber: () => ({ line: '#ffb43d', cross: '#fff0c8', bg: '#140902' }),
  crtColor: (c) => ({ line: c, cross: '#ffffff', bg: '#05040c' }),
  vector: (c) => ({ line: c, cross: '#ffffff', bg: '#02010a' }),
  lcd: () => ({ line: '#1d2a1a', cross: '#0c140b', bg: '#9fb08a' }),
  vfd: () => ({ line: '#5ff8e8', cross: '#d8fffb', bg: '#020a0b' }),
  oled: (c) => ({ line: c, cross: '#ffffff', bg: '#000000' }),
  holo: (c) => ({ line: c, cross: '#ffffff', bg: '#00000000' }),
  plasma: () => ({ line: '#ff7a2e', cross: '#ffd3a8', bg: '#120400' }),
  kaleido: (c) => ({ line: c, cross: '#ffffff', bg: '#12001a' }),
  aqua: (c) => ({ line: c, cross: '#ffffff', bg: '#062038' }),
  flat: (c) => ({ line: c, cross: '#ffffff', bg: '#1b2430' }),
}
function drawScreen(i: number) {
  const sc = props.design.screens[i]
  const c = screenEls[i]
  const v = props.vcos[sc.vco]
  if (!c || !v) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = Math.max(1, Math.round(sc.w * fit.value.k * dpr))
  const h = Math.max(1, Math.round(sc.h * fit.value.k * dpr))
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
  const g = c.getContext('2d')!
  const ph = PHOSPHOR[skin.value.screen](colorOf(sc.vco))
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = ph.bg
  g.fillRect(0, 0, w, h)
  const r = v.pads.raw()
  const colors = { line: ph.line, cross: ph.cross }
  g.save()
  if (sc.show === 'clip') {
    drawClip(g, w, h, v.peaks(Math.min(600, Math.round(sc.w * 2))), colors)
    // the playhead / where the grains fire
    const at = v.pads.pointOf('perform')
    g.fillStyle = ph.cross
    g.globalAlpha = 0.8
    g.fillRect(at.x * w - dpr, 0, 2 * dpr, h)
  } else if (sc.show === 'fx') drawFx(g, w, h, { s: r, colors, dpr })
  else if (sc.show === 'tone') drawTone(g, w, h, { s: r, colors, dpr })
  else if (sc.show === 'echo') {
    const at = v.pads.pointOf('echo')
    const divs = echoDivisions(props.bpm)
    drawEcho(g, w, h, { at, feedback: r.delayFeedback, mix: r.delayMix, divisions: divs.map((d) => d.x), lit: divs.findIndex((d) => Math.abs(d.seconds - r.delayTime) < 1e-3), colors, dpr })
  } else if (sc.show === 'lfo') drawLfo(g, w, h, { lfo: r.mod.lfo2, ...lfoRouteOf(r), bpm: props.bpm, now: clock.value, colors, dpr })
  else if (sc.show === 'texture') drawTexture(g, w, h, { at: v.pads.pointOf('texture'), t: clock.value, colors, dpr })
  g.restore()
}
const screenGlass = computed(() => skin.value.screen)
/** a paper-faced dial (the old eras) or a dark one with a lit needle */
const paperGauge = computed(() => ['bakelite', 'brass', 'wood', 'chickenhead'].includes(skin.value.knob) || ['crtGreen', 'crtAmber'].includes(skin.value.screen))

// ── the gauges: needles, set a frame at a time ──
const needleEls: (SVGGElement | null)[] = []
const needle = props.design.gauges.map(() => 0)

// ── the rocks ──
const field = new Field3()
const labelEls: (HTMLDivElement | null)[] = []
let spawnIn = 1
const intakePx = () => props.design.intakes.map((p) => ({ vco: p.vco, xy: toPx(p.x, p.y) }))
function intakes(): Intake[] {
  return intakePx().map((p) => ({ vco: p.vco, x: p.xy[0] / size.h, y: p.xy[1] / size.h, open: props.open(p.vco) && !!props.vcos[p.vco] }))
}
function inGlass(sx: number, sy: number): boolean {
  const el = glassEl.value
  if (!el) return true
  const dx = (sx * size.h - fit.value.x) / fit.value.k
  const dy = (sy * size.h - fit.value.y) / fit.value.k
  const pt = svg.value!.createSVGPoint()
  pt.x = dx
  pt.y = dy
  return el.isPointInFill(pt)
}
function spawn() {
  const want = [0, 1, 2].filter((i) => props.vcos[i] && field.rocks.filter((r) => r.vco === i).length < 2)
  if (!want.length) return
  const vco = want[Math.floor(Math.random() * want.length)]
  const payload = props.payloadFor(vco)
  if (!payload) return
  const a = Math.random() * Math.PI * 2
  const d = 0.04 + Math.random() * 0.34
  field.add({
    vco,
    x: Math.cos(a) * d,
    y: Math.sin(a) * d * 0.6,
    z: 1.1,
    speed: 0.09 + Math.random() * 0.06,
    r: payload.kind === 'pod' ? 0.016 : 0.01 + Math.random() * 0.008,
    spin: (Math.random() - 0.5) * 1.4,
    seed: Math.random(),
    payload,
  })
}
function clickSky(e: PointerEvent) {
  const box = root.value!.getBoundingClientRect()
  const x = (e.clientX - box.left) / size.h
  const y = (e.clientY - box.top) / size.h
  const r = field.at(x, y)
  if (r) field.lock(r, intakes())
}

// ── the frame ──
const ahead = shallowRef<Ahead | null>(null)
const air = shallowRef<Air | null>(null)
let raf = 0
let last = 0
let t = 0
const levels = [0, 0, 0]
function loop(now: number) {
  raf = requestAnimationFrame(loop)
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016)
  last = now
  t += dt
  for (let i = 0; i < 3; i++) levels[i] += ((props.vcos[i]?.level() ?? 0) - levels[i]) * 0.3
  // the rocks
  const vpPx = toPx(props.design.vp.x, props.design.vp.y)
  field.vp = { x: vpPx[0] / size.h, y: vpPx[1] / size.h }
  field.focal = (fit.value.k * STAGE.h * 0.95) / size.h
  spawnIn -= dt
  if (spawnIn <= 0) {
    spawn()
    spawnIn = (7 - props.density * 5.5) * (0.6 + Math.random() * 0.8)
  }
  const ins = intakes()
  for (const r of field.step(dt, ins, inGlass)) emit('catch', r.vco, r.payload)
  // the controls, the screens, the needles
  readAll()
  props.design.screens.forEach((_, i) => drawScreen(i))
  props.design.gauges.forEach((gd, i) => {
    const target = gd.show === 'level' ? levels[gd.vco] : gd.show === 'beam' ? (field.beaming(gd.vco) ? 1 : props.open(gd.vco) ? 0.6 : 0.1) : Math.min(1, (props.vcos[gd.vco]?.pads.raw().grainFreq ?? 0) / 60)
    needle[i] += (target - needle[i]) * Math.min(1, dt * 9)
    needleEls[i]?.setAttribute('transform', `rotate(${(-60 + needle[i] * 120).toFixed(2)})`)
  })
  // the GL
  const px = (aheadEl.value?.width ?? size.w) / Math.max(1, size.w)
  const E = props.era
  const pal = E.palettes.map((p) => p.gl)
  const sunPx = toPx(props.design.sun.x, props.design.sun.y)
  const sd = [vpPx[0] - sunPx[0], vpPx[1] - sunPx[1]]
  const sl = Math.hypot(sd[0], sd[1]) || 1
  const shown = (r: Rock3) => field.shown(r, ins)
  ahead.value?.frame({
    time: t,
    vp: [vpPx[0] * px, vpPx[1] * px],
    scale: size.h * px,
    speed: 0.16 + 0.1 * (levels[0] + levels[1] + levels[2]),
    tint: rgb(E.sky.colors[4]),
    palettes: pal,
    levels,
    sunDir: [sd[0] / sl, sd[1] / sl],
    rocks: field.rocks.map((r) => {
      const s = shown(r)
      return { x: s.x * size.h * px, y: s.y * size.h * px, r: s.r * size.h * px, angle: r.angle, seed: r.seed, vco: r.vco, beam: r.beam, pod: r.payload.kind === 'pod', open: !!ins[r.vco]?.open }
    }),
    beams: field.rocks
      .filter((r) => r.beam >= 0)
      .map((r) => {
        const s = shown(r)
        const to = intakePx().find((p) => p.vco === r.vco)?.xy ?? [s.x * size.h, s.y * size.h]
        return { from: [s.x * size.h * px, s.y * size.h * px] as [number, number], to: [to[0] * px, to[1] * px] as [number, number], vco: r.vco, k: Math.sin(Math.min(1, r.beam * 1.2) * Math.PI) * 0.9 + 0.1 }
      }),
  })
  const at = props.design.atmosphere
  const apx = (airEl.value?.width ?? size.w) / Math.max(1, size.w)
  air.value?.frame({
    time: t,
    sun: [sunPx[0] * apx, sunPx[1] * apx],
    sunC: [1, 0.9, 0.72],
    dust: at.dust * props.amount,
    shafts: at.shafts * props.amount,
    grain: at.grain * props.amount,
    emf: at.emf * props.amount,
    trip: at.trip * props.amount,
    level: Math.max(...levels),
  })
  // the rocks' names
  for (let i = 0; i < 10; i++) {
    const el = labelEls[i]
    if (!el) continue
    const r = field.rocks[i]
    if (!r || r.beam >= 0 || r.z > 0.75) {
      el.style.opacity = '0'
      continue
    }
    const s = shown(r)
    el.style.opacity = String(Math.min(1, (0.75 - r.z) * 4))
    el.style.transform = `translate(${(s.x * size.h).toFixed(1)}px, ${((s.y + s.r * 1.6) * size.h).toFixed(1)}px) translateX(-50%)`
    if (el.textContent !== r.payload.label) el.textContent = r.payload.label
    el.style.color = props.era.palettes[r.vco].hi
  }
}

let ro: ResizeObserver | undefined
function resize() {
  const el = root.value
  if (!el) return
  size.w = el.clientWidth
  size.h = el.clientHeight
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  for (const [c, k] of [[aheadEl.value, 0.85 * dpr], [airEl.value, 0.5]] as const) {
    if (!c) continue
    c.width = Math.max(1, Math.round(size.w * k))
    c.height = Math.max(1, Math.round(size.h * k))
  }
}
onMounted(() => {
  resize()
  ro = new ResizeObserver(resize)
  ro.observe(root.value!)
  ahead.value = aheadEl.value ? Ahead.create(aheadEl.value) : null
  air.value = airEl.value ? Air.create(airEl.value) : null
  raf = requestAnimationFrame(loop)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
  ahead.value?.dispose()
  air.value?.dispose()
})
watch(() => props.design.era, () => (field.rocks = []))

// the materials, as patterns (grey tiles laid over the art's own colours)
const TEXTURES: TextureId[] = ['brushed', 'leather', 'wood', 'patina', 'carbon', 'speckle', 'scratches', 'grille', 'noise', 'paper', 'velvet', 'knurl']
const tex = computed(() => TEXTURES.map((id) => ({ id, href: texture(id), size: TEXTURE_SIZE[id] })))
const hover = (s: string | null) => emit('hover', s)
const stageStyle = computed(() => ({ transform: `translate(${fit.value.x}px, ${fit.value.y}px) scale(${fit.value.k})` }))
const atmo = computed(() => props.design.atmosphere)
const tintCss = computed(() => `rgb(${atmo.value.tint.map((v) => Math.round(v * 255)).join(',')})`)
</script>

<template>
  <div ref="root" class="cockpit" :class="`era-${design.era}`" @pointerdown="clickSky">
    <canvas ref="aheadEl" class="ahead" />
    <div class="labels">
      <div v-for="i in 10" :key="i" :ref="(el) => (labelEls[i - 1] = el as HTMLDivElement)" class="rock-label" />
    </div>

    <div class="stage" :style="stageStyle">
      <svg ref="svg" class="art" :width="STAGE.w" :height="STAGE.h" :viewBox="`0 0 ${STAGE.w} ${STAGE.h}`">
        <defs>
          <TextureDefs />
          <pattern id="cp-knurl" patternUnits="userSpaceOnUse" width="6" height="6">
            <image :href="tex.find((x) => x.id === 'knurl')?.href" width="6" height="6" />
          </pattern>
          <pattern id="cp-scratch" patternUnits="userSpaceOnUse" width="256" height="256">
            <image :href="tex.find((x) => x.id === 'scratches')?.href" width="256" height="256" />
          </pattern>
          <filter id="cp-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
          <filter id="cp-blur-near" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur :stdDeviation="3 + atmo.depth" /></filter>
          <filter id="cp-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="cp-boot" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stop-color="#000" />
            <stop offset="0.7" stop-color="#1a1a1a" />
            <stop offset="1" stop-color="#3a3a3a" />
          </radialGradient>
          <linearGradient id="cp-tube" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#fff" stop-opacity="0.25" />
            <stop offset="0.25" stop-color="#fff" stop-opacity="0.04" />
            <stop offset="0.8" stop-color="#fff" stop-opacity="0" />
            <stop offset="1" stop-color="#fff" stop-opacity="0.12" />
          </linearGradient>
          <linearGradient id="cp-glass-sheen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#fff" stop-opacity="0.09" />
            <stop offset="0.35" stop-color="#fff" stop-opacity="0" />
            <stop offset="0.5" stop-color="#fff" stop-opacity="0.05" />
            <stop offset="0.56" stop-color="#fff" stop-opacity="0" />
            <stop offset="1" stop-color="#fff" stop-opacity="0.03" />
          </linearGradient>
          <clipPath id="cp-glass"><path :d="design.glass" /></clipPath>
        </defs>
        <!-- the windscreen: what the sky shows through (clicks on it reach the rocks); its glass, smudged -->
        <path ref="glassEl" :d="design.glass" fill="transparent" class="glass-hit" />
        <g clip-path="url(#cp-glass)" class="glass" :opacity="atmo.glass">
          <rect x="0" y="0" :width="STAGE.w" :height="STAGE.h" fill="url(#cp-glass-sheen)" />
          <rect x="0" y="0" :width="STAGE.w" :height="STAGE.h" fill="url(#tx-scratches)" opacity="0.18" style="mix-blend-mode: screen" />
        </g>

        <component :is="design.back" :design="design" :skin="skin" />

        <!-- the screens' bezels (their pictures are canvases over them) -->
        <g v-for="(sc, i) in design.screens" :key="`b${i}`">
          <rect :x="sc.x - 10" :y="sc.y - 10" :width="sc.w + 20" :height="sc.h + 20" :rx="(sc.r ?? 6) + 8" :fill="skin.metal[0]" :stroke="skin.ink" :stroke-width="skin.stroke" />
          <rect :x="sc.x - 6" :y="sc.y - 6" :width="sc.w + 12" :height="sc.h + 12" :rx="(sc.r ?? 6) + 5" fill="none" :stroke="skin.metal[2]" stroke-width="1.5" opacity="0.5" />
        </g>
        <!-- the intakes: where a caught rock goes down -->
        <g v-for="it in design.intakes" :key="`i${it.vco}`" :transform="`translate(${it.x} ${it.y})`" class="intake" :class="{ open: open(it.vco) && vcos[it.vco] }">
          <circle r="24" :fill="skin.metal[0]" :stroke="skin.ink" :stroke-width="skin.stroke" />
          <circle r="18" fill="#000" />
          <circle r="14" fill="none" :stroke="colorOf(it.vco)" stroke-width="3" class="ring" />
          <circle r="5" :fill="colorOf(it.vco)" class="core" />
        </g>
        <!-- the gauges: a paper dial in the old eras, a dark one with a lit needle in the new -->
        <g v-for="(gd, i) in design.gauges" :key="`g${i}`" :transform="`translate(${gd.x} ${gd.y})`" :style="{ color: colorOf(gd.vco) }">
          <circle :r="gd.r + 6" :fill="skin.metal[1]" :stroke="skin.ink" :stroke-width="skin.stroke" />
          <circle :r="gd.r + 2" fill="none" :stroke="skin.metal[2]" stroke-width="1.2" opacity="0.6" />
          <template v-if="paperGauge">
            <circle :r="gd.r" fill="#f2ead6" />
            <circle :r="gd.r" fill="url(#tx-paper)" opacity="0.4" style="mix-blend-mode: multiply" />
          </template>
          <circle v-else :r="gd.r" fill="#05060a" />
          <line
            v-for="k in 9"
            :key="k"
            :x1="Math.sin(((-60 + (k - 1) * 15) * Math.PI) / 180) * gd.r * 0.72"
            :y1="-Math.cos(((-60 + (k - 1) * 15) * Math.PI) / 180) * gd.r * 0.72"
            :x2="Math.sin(((-60 + (k - 1) * 15) * Math.PI) / 180) * gd.r * 0.88"
            :y2="-Math.cos(((-60 + (k - 1) * 15) * Math.PI) / 180) * gd.r * 0.88"
            :stroke="paperGauge ? '#1a1410' : k > 7 ? '#ff3b5c' : colorOf(gd.vco)"
            :stroke-width="k > 7 ? 2.4 : 1.2"
            :opacity="paperGauge ? 1 : 0.8"
          />
          <path v-if="paperGauge" :d="`M ${Math.sin(Math.PI / 4) * gd.r * 0.8} ${-Math.cos(Math.PI / 4) * gd.r * 0.8} A ${gd.r * 0.8} ${gd.r * 0.8} 0 0 1 ${Math.sin(Math.PI / 3) * gd.r * 0.8} ${-Math.cos(Math.PI / 3) * gd.r * 0.8}`" stroke="#c0281e" stroke-width="5" fill="none" />
          <text y="14" text-anchor="middle" class="glabel" :font-family="skin.font" :fill="paperGauge ? '#2a2018' : colorOf(gd.vco)">{{ gd.label ?? (gd.show === 'level' ? `VCO ${gd.vco + 1}` : gd.show === 'beam' ? 'BEAM' : 'GRAIN') }}</text>
          <g :ref="(el) => (needleEls[i] = el as SVGGElement)" transform="rotate(-60)">
            <path :d="`M -2 6 L 0 ${-gd.r * 0.86} L 2 6 Z`" :fill="paperGauge ? '#1a0e08' : colorOf(gd.vco)" :class="{ lit: !paperGauge }" />
          </g>
          <circle r="4" :fill="skin.metal[2]" stroke="#000" stroke-width="1" />
          <ellipse :cx="-gd.r * 0.3" :cy="-gd.r * 0.45" :rx="gd.r * 0.55" :ry="gd.r * 0.25" fill="#fff" :opacity="paperGauge ? 0.25 : 0.1" />
        </g>

        <CockpitControl
          v-for="(c, i) in controls"
          :key="`${c.vco}-${c.param}`"
          :spec="c"
          :skin="skin"
          :value="vals[i] ?? 0.5"
          :value2="vals2[i]"
          :stops="stopsFor(c)"
          :readout="c.kind === 'counter' ? counterOf(c) : undefined"
          :color="colorOf(c.vco)"
          :style="{ color: colorOf(c.vco) }"
          :hint="`VCO ${c.vco + 1} · ${paramOf(c.param).label} — ${c.kind === 'stick' ? 'PITCH · RING: left / right coarse, up / down the pitch (far right: the ring mod)' : paramOf(c.param).help}`"
          @set="(v: number, v2?: number) => setControl(c, v, v2)"
          @end="endControl(c)"
          @hover="hover"
        />

        <g v-if="design.front" class="front" filter="url(#cp-blur-near)">
          <component :is="design.front" :design="design" :skin="skin" />
        </g>
      </svg>
      <div
        v-for="(sc, i) in design.screens"
        :key="`s${i}`"
        class="screen"
        :class="[screenGlass, { round: sc.round }]"
        :style="{ left: `${sc.x}px`, top: `${sc.y}px`, width: `${sc.w}px`, height: `${sc.h}px`, borderRadius: sc.round ? '50%' : `${sc.r ?? 6}px`, '--c': colorOf(sc.vco) }"
      >
        <canvas :ref="(el) => (screenEls[i] = el as HTMLCanvasElement)" />
        <i class="tube" />
      </div>
    </div>

    <canvas ref="airEl" class="air" />
    <div class="film vignette" :style="{ opacity: atmo.vignette * (0.4 + 0.6 * amount) }" />
    <div class="film scan" :style="{ opacity: atmo.scanlines * amount }" />
    <div class="film tint" :style="{ background: tintCss, opacity: 0.18 * amount }" />
    <div class="film grain" :style="{ opacity: atmo.grain * amount * 0.28, backgroundImage: `url(${tex.find((x) => x.id === 'noise')?.href})` }" />
  </div>
</template>

<style scoped>
.cockpit {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.ahead,
.air {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.air {
  mix-blend-mode: screen;
}
.labels {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.rock-label {
  position: absolute;
  left: 0;
  top: 0;
  padding: 1px 6px;
  border-radius: 8px;
  font: 700 10px/1.3 'Orbitron', sans-serif;
  letter-spacing: 0.12em;
  white-space: nowrap;
  background: rgba(0, 0, 0, 0.55);
  opacity: 0;
}
.stage {
  position: absolute;
  left: 0;
  top: 0;
  width: 1600px;
  height: 900px;
  transform-origin: 0 0;
  pointer-events: none;
}
.art {
  position: absolute;
  inset: 0;
  overflow: visible;
}
.art :deep(*) {
  pointer-events: none;
}
.art :deep(.cp),
.art :deep(.cp *) {
  pointer-events: auto;
}
.glass-hit {
  pointer-events: none;
}
.lit {
  filter: drop-shadow(0 0 3px currentColor);
}
.glabel {
  font-size: 8px;
  letter-spacing: 0.1em;
}
.intake .ring {
  opacity: 0.35;
}
.intake.open .ring {
  opacity: 1;
  filter: drop-shadow(0 0 4px currentColor);
  animation: breathe 2s ease-in-out infinite;
}
.intake .core {
  opacity: 0.3;
}
.intake.open .core {
  opacity: 1;
}
@keyframes breathe {
  50% {
    opacity: 0.45;
  }
}
/* a screen: its picture, behind its tube's glass (curvature, sheen, scanlines by kind) */
.screen {
  position: absolute;
  overflow: hidden;
  background: #000;
  box-shadow: inset 0 0 18px rgba(0, 0, 0, 0.9);
}
.screen canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.screen .tube {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.16), transparent 45%),
    radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.65) 100%);
  border-radius: inherit;
}
.screen.crtGreen canvas,
.screen.crtAmber canvas,
.screen.crtColor canvas,
.screen.vector canvas,
.screen.kaleido canvas,
.screen.plasma canvas {
  filter: blur(0.4px) brightness(1.25) saturate(1.2) drop-shadow(0 0 3px var(--c));
}
.screen.crtGreen .tube,
.screen.crtAmber .tube,
.screen.crtColor .tube,
.screen.plasma .tube {
  background:
    repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.35) 0 1px, transparent 1px 3px),
    radial-gradient(ellipse at 30% 20%, rgba(255, 255, 255, 0.18), transparent 45%),
    radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, 0.75) 100%);
}
.screen.lcd .tube {
  background: repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.06) 0 1px, transparent 1px 3px), linear-gradient(160deg, rgba(255, 255, 255, 0.25), transparent 40%);
}
.screen.kaleido canvas {
  animation: hue 12s linear infinite;
}
@keyframes hue {
  to {
    filter: hue-rotate(360deg) blur(0.4px) brightness(1.25) saturate(1.4);
  }
}
.film {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.vignette {
  background: radial-gradient(ellipse at 50% 45%, transparent 45%, rgba(0, 0, 0, 0.55) 80%, rgba(0, 0, 0, 0.9) 110%);
}
.scan {
  background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.18) 0 1px, transparent 1px 3px);
  mix-blend-mode: multiply;
}
.tint {
  mix-blend-mode: soft-light;
}
.grain {
  background-size: 256px 256px;
  mix-blend-mode: overlay;
  animation: grain 0.5s steps(5) infinite;
}
@keyframes grain {
  0% {
    background-position: 0 0;
  }
  20% {
    background-position: -40px 30px;
  }
  40% {
    background-position: 60px -20px;
  }
  60% {
    background-position: -30px -50px;
  }
  80% {
    background-position: 20px 60px;
  }
}
</style>
