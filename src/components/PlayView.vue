<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { activeVoices, clock, getBuffer, audioDuration } from '../audio/engine'
import { useBoard } from '../stores/board'
import type { Sound } from '../types'
import {
  fxPoint,
  fxWrite,
  grainPoint,
  grainWrite,
  lfoPoint,
  lfoWrite,
  performPoint,
  performWrite,
  pitchPoint,
  pitchWrite,
  type Point,
} from '../lib/play/pads'
import {
  crosshair,
  drawClip,
  drawFx,
  drawGrain,
  drawLfo,
  drawOverview,
  drawPerformOverlay,
  drawPitch,
  lfoOffset,
  type Colors,
  type GrainDot,
} from '../lib/play/draw'
import Knob from './Knob.vue'
import LiveView from './LiveView.vue'
import PlayPad from './PlayPad.vue'
import WaveViewPicker from './WaveViewPicker.vue'

/**
 * A VCO slot's Play view (SpaceCraft's performance page): the clip big, played by dragging where the grains fire
 * (left / right) and how loud (up / down), the whole sample above it with the clip boxed, and four pads -- GRAIN,
 * LFO, FILTER · REVERB, PITCH · RING (lib/play/pads.ts says what each axis does). Everything here is the layer's
 * own settings: the knobs (the ⚙ PANEL view) show the same values.
 */
const props = defineProps<{ sound: Sound; slot: number }>()
const board = useBoard()
const s = computed(() => props.sound.settings as Sound['settings'] & { grainLength?: number; grainBackwards?: boolean; ringMix?: number; ringFreq?: number })

/** SpaceCraft's two engines' colours, and a third */
const PALETTE: Colors[] = [
  { line: '#00e8ff', cross: '#ff2a2a' },
  { line: '#ff2bd6', cross: '#ffa200' },
  { line: '#a8ff1a', cross: '#b04bff' },
]
const colors = computed(() => PALETTE[props.slot % PALETTE.length])

// ── the clip ──
const duration = computed(() => getBuffer(props.sound.audioId)?.duration ?? audioDuration(props.sound.audioId))
const clipSeconds = computed(() => Math.max(1e-3, duration.value * Math.abs(s.value.clipOut - s.value.clipIn)))
const fullPeaks = computed(() => board.peaksOf(props.sound.audioId) ?? null)
/** min / max per column of the clip, for the big view (cached by what it depends on) */
let clipCache: { key: string; peaks: Float32Array } | null = null
function clipPeaks(columns: number): Float32Array | null {
  const buf = getBuffer(props.sound.audioId)
  if (!buf) return null
  const a = Math.min(s.value.clipIn, s.value.clipOut)
  const b = Math.max(s.value.clipIn, s.value.clipOut)
  const key = `${props.sound.audioId}|${a}|${b}|${columns}`
  if (clipCache?.key === key) return clipCache.peaks
  const data = buf.getChannelData(0)
  const from = Math.floor(a * data.length)
  const to = Math.max(from + 1, Math.floor(b * data.length))
  const out = new Float32Array(columns * 2)
  let peak = 1e-6
  for (let c = 0; c < columns; c++) {
    const i0 = from + Math.floor(((to - from) * c) / columns)
    const i1 = Math.max(i0 + 1, from + Math.floor(((to - from) * (c + 1)) / columns))
    let lo = 1
    let hi = -1
    for (let i = i0; i < i1; i += Math.max(1, Math.floor((i1 - i0) / 64))) {
      const v = data[i]
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    out[c * 2] = lo
    out[c * 2 + 1] = hi
    peak = Math.max(peak, Math.abs(lo), Math.abs(hi))
  }
  // fill the height, as the overview's peaks do
  for (let i = 0; i < out.length; i++) out[i] /= peak
  clipCache = { key, peaks: out }
  return out
}

// ── what's sounding ──
const voices = computed(() => activeVoices.value.filter((v) => v.soundId === props.sound.id))
const sounding = computed(() => voices.value.length > 0)
const hash = (t: number) => {
  const x = Math.sin(t * 9301.7) * 49297.3
  return x - Math.floor(x)
}
function grainDots(now: number): GrainDot[] {
  const out: GrainDot[] = []
  const a = Math.min(s.value.clipIn, s.value.clipOut)
  const span = Math.max(1e-6, Math.abs(s.value.clipOut - s.value.clipIn))
  for (const info of voices.value) {
    const v = info.voice
    const dur = v.bufferDuration || duration.value
    for (const m of v.marks ?? []) {
      if (now < m.when || now > m.when + m.dur) continue
      const p = m.dur > 0 ? (now - m.when) / m.dur : 1
      const read = m.reverse ? m.pos + m.len * (1 - p) : m.pos + m.len * p
      out.push({ x: (read / dur - a) / span, y: 0.15 + 0.7 * hash(m.when + m.pos), life: 1 - p })
      if (out.length > 64) return out
    }
  }
  return out
}
const lfoAmount = computed(() => Math.abs(s.value.mod.routes.find((r) => r.source === 'lfo2' && r.dest === 'grainPos')?.amount ?? 0))
const overlap = computed(() => (s.value.grainMode === 'cloud' ? s.value.grainDensity : s.value.grainMode === 'loop' ? 1 : 2))

// ── the pads' points, and what moving them writes ──
const pitchX = ref(0.5)
const points = computed(() => ({
  perform: performPoint(s.value),
  grain: grainPoint(s.value, clipSeconds.value),
  lfo: lfoPoint(s.value),
  fx: fxPoint(s.value),
  pitch: pitchPoint(s.value, pitchX.value),
}))
let touched = 0
const touch = () => (touched = performance.now())
function setPerform(p: Point) {
  touch()
  Object.assign(s.value, performWrite(p))
}
function setGrain(p: Point) {
  touch()
  Object.assign(s.value, grainWrite(p, clipSeconds.value))
}
function setLfo(p: Point) {
  touch()
  const w = lfoWrite(s.value, p)
  Object.assign(s.value.mod.lfo2, w.lfo2)
  s.value.mod.routes = w.routes
}
function setFx(p: Point) {
  touch()
  Object.assign(s.value, fxWrite(p))
}
function setPitch(p: Point) {
  touch()
  pitchX.value = p.x
  Object.assign(s.value, pitchWrite(p))
}
const resets = {
  perform: () => setPerform({ x: 0.5, y: 1 / 1.2 }),
  grain: () => Object.assign(s.value, { grainFreq: 5, grainLength: 1 }),
  lfo: () => setLfo({ x: 0, y: lfoPoint(s.value).y }),
  fx: () => setFx({ x: 0.5, y: 0 }),
  pitch: () => setPitch({ x: 0.5, y: 0.5 }),
}

// ── drawing ──
const frame = ref(0)
const dprOf = () => window.devicePixelRatio || 1
const drawers = {
  grain: (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => {
    drawGrain(g, w, h, {
      freq: s.value.grainFreq,
      length: s.value.grainLength ?? 1,
      overlap: overlap.value,
      now: clock.value,
      sounding: sounding.value,
      colors: colors.value,
      dpr,
    })
    crosshair(g, w, h, points.value.grain, colors.value, dpr)
  },
  lfo: (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => {
    drawLfo(g, w, h, { lfo: s.value.mod.lfo2, amount: lfoAmount.value, bpm: board.bpm, now: frozen.value, colors: colors.value, dpr })
    crosshair(g, w, h, points.value.lfo, colors.value, dpr)
  },
  fx: (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => {
    drawFx(g, w, h, { s: s.value, colors: colors.value, dpr })
    crosshair(g, w, h, points.value.fx, colors.value, dpr)
  },
  pitch: (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => {
    drawPitch(g, w, h, { at: points.value.pitch, ring: s.value.ringMix ?? 0, colors: colors.value, dpr })
    crosshair(g, w, h, points.value.pitch, colors.value, dpr)
  },
}
/** the LFO trail's clock: running while the sound plays, held still while it doesn't */
const frozen = ref(0)

// the big view: the clip (2D / ISO), or a live view under the crosshair
const live = computed(() => ['scope', 'bars', 'spectro'].includes(board.master.waveView))
const perform = ref<HTMLDivElement>()
const performCanvas = ref<HTMLCanvasElement>()
const performSize = ref({ w: 300, h: 200 })
function paintPerform() {
  const c = performCanvas.value
  if (!c) return
  const dpr = dprOf()
  const w = Math.max(1, Math.round(performSize.value.w * dpr))
  const h = Math.max(1, Math.round(performSize.value.h * dpr))
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
  const g = c.getContext('2d')!
  g.clearRect(0, 0, w, h)
  if (!live.value) drawClip(g, w, h, clipPeaks(Math.min(1200, Math.round(performSize.value.w))), colors.value)
  const now = clock.value
  drawPerformOverlay(g, w, h, {
    at: points.value.perform,
    fireX: lfoAmount.value > 0 ? Math.min(1, Math.max(0, s.value.grainPos + lfoOffset(s.value.mod.lfo2, lfoAmount.value, board.bpm, frozen.value))) : null,
    grains: grainDots(now),
    colors: colors.value,
    dpr,
  })
}
const overview = ref<HTMLCanvasElement>()
const overviewSize = ref({ w: 300, h: 28 })
function paintOverview() {
  const c = overview.value
  if (!c) return
  const dpr = dprOf()
  const w = Math.max(1, Math.round(overviewSize.value.w * dpr))
  const h = Math.max(1, Math.round(overviewSize.value.h * dpr))
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
  const g = c.getContext('2d')!
  g.clearRect(0, 0, w, h)
  drawOverview(g, w, h, { peaks: fullPeaks.value, clipIn: Math.min(s.value.clipIn, s.value.clipOut), clipOut: Math.max(s.value.clipIn, s.value.clipOut), colors: colors.value, dpr })
}

// one loop for every picture: every frame while the sound plays or a pad is being moved, else when something changes
let raf = 0
let visible = true
function tick() {
  raf = 0
  if (sounding.value) frozen.value = clock.value
  frame.value++
  paintPerform()
  paintOverview()
  if (visible && (sounding.value || performance.now() - touched < 1500)) raf = requestAnimationFrame(tick)
}
function kick() {
  if (!raf && visible) raf = requestAnimationFrame(tick)
}
watch(() => [JSON.stringify(s.value), board.bpm, board.master.waveView, sounding.value, props.slot], kick)

// ── the overview: the clip's box, dragged by its middle or its edges; a press elsewhere moves it there ──
let drag: { kind: 'in' | 'out' | 'move'; grab: number; a: number; b: number } | null = null
const fracAt = (e: PointerEvent) => {
  const r = overview.value!.getBoundingClientRect()
  return { f: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), px: r.width }
}
function overviewDown(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  const { f, px } = fracAt(e)
  const a = Math.min(s.value.clipIn, s.value.clipOut)
  const b = Math.max(s.value.clipIn, s.value.clipOut)
  const near = 7 / px
  if (Math.abs(f - a) < near) drag = { kind: 'in', grab: f, a, b }
  else if (Math.abs(f - b) < near) drag = { kind: 'out', grab: f, a, b }
  else if (f > a && f < b) drag = { kind: 'move', grab: f, a, b }
  else {
    // jump there, keeping its width
    const half = (b - a) / 2
    const c = Math.min(1 - half, Math.max(half, f))
    Object.assign(s.value, { clipIn: c - half, clipOut: c + half })
    drag = { kind: 'move', grab: f, a: c - half, b: c + half }
  }
  touch()
  kick()
}
function overviewMove(e: PointerEvent) {
  if (!drag || !(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return
  const { f } = fracAt(e)
  const d = drag
  touch()
  if (d.kind === 'in') s.value.clipIn = Math.min(f, d.b - 0.002)
  else if (d.kind === 'out') s.value.clipOut = Math.max(f, d.a + 0.002)
  else {
    const dx = Math.min(1 - d.b, Math.max(-d.a, f - d.grab))
    Object.assign(s.value, { clipIn: d.a + dx, clipOut: d.b + dx })
  }
}
const overviewUp = () => (drag = null)

// ── the big view as a pad ──
const performPointAt = (e: PointerEvent): Point => {
  const r = perform.value!.getBoundingClientRect()
  return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)) }
}
function performDown(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  setPerform(performPointAt(e))
  kick()
}
function performMove(e: PointerEvent) {
  if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) setPerform(performPointAt(e))
}

let ro: ResizeObserver | undefined
let io: IntersectionObserver | undefined
const root = ref<HTMLDivElement>()
onMounted(() => {
  ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      if (e.target === perform.value) performSize.value = { w: e.contentRect.width, h: e.contentRect.height }
      if (e.target === overview.value?.parentElement) overviewSize.value = { w: e.contentRect.width, h: e.contentRect.height }
    }
    kick()
  })
  if (perform.value) ro.observe(perform.value)
  if (overview.value?.parentElement) ro.observe(overview.value.parentElement)
  io = new IntersectionObserver((es) => {
    visible = es.some((x) => x.isIntersecting)
    kick()
  })
  if (root.value) io.observe(root.value)
  kick()
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
  io?.disconnect()
})

const SHAPES = [
  { id: 'sine', label: 'SINE' },
  { id: 'sawtooth', label: 'SAW' },
  { id: 'triangle', label: 'TRI' },
] as const
const MODES = ['classic', 'loop', 'cloud'] as const
const fmtSec = (v: number) => `${v.toFixed(1)}s`
const fmtNum = (v: number) => v.toFixed(1)
const fmtQ = (v: number) => v.toFixed(1)
</script>

<template>
  <div ref="root" class="play" :style="{ '--line': colors.line, '--cross': colors.cross }" @pointerdown.stop @click.stop>
    <div class="top">
      <button
        class="grain-chip"
        :class="{ on: s.grain }"
        :title="s.grain ? 'Grains on: the pads play the sound as grains — click for the plain sample' : 'The sound plays as a plain sample: most of the pads need grains — click to turn them on'"
        @click="board.toggleGrain(sound.id)"
      >
        GRAIN {{ s.grain ? 'ON' : 'OFF' }}
      </button>
      <div class="overview" title="The whole sample: the box is the clip the big view shows — drag it, or its edges">
        <canvas ref="overview" @pointerdown="overviewDown" @pointermove="overviewMove" @pointerup="overviewUp" @pointercancel="overviewUp" />
      </div>
    </div>

    <div class="main">
      <div
        ref="perform"
        class="perform"
        title="Drag: left / right is where in the clip the grains fire (POS), up / down how loud (VOL). The squares are the grains as they play"
        @pointerdown="performDown"
        @pointermove="performMove"
      >
        <LiveView v-if="live" class="under" :sound="sound" :hue="0" :height="Math.max(60, Math.round(performSize.h))" :width="Math.round(performSize.w)" readonly />
        <canvas ref="performCanvas" />
        <WaveViewPicker class="picker" @pointerdown.stop />
        <span class="label">PERFORM</span>
        <span v-if="!s.grain" class="off">GRAIN OFF</span>
      </div>

      <div class="pads">
        <PlayPad
          label="GRAIN"
          title="GRAIN — up / down: how often grains fire; left / right: how long each lasts. Top right: smooth granular textures; bottom right: long layered grains; middle left: short separate grains (arpeggios). Double-click: reset"
          :color="colors.line"
          :frame="frame"
          :draw="drawers.grain"
          square
          @move="setGrain"
          @reset="resets.grain"
        >
          <template #settings>
            <span class="head">MODE</span>
            <button v-for="m in MODES" :key="m" class="opt" :class="{ on: s.grainMode === m }" @click="s.grainMode = m">{{ m.toUpperCase() }}</button>
          </template>
        </PlayPad>
        <PlayPad
          label="LFO"
          title="LFO — swings where the grains fire: left / right how far (far left: off), up / down how fast (tempo divisions, slow at the bottom). It is the layer's LFO 2, routed to POS. Double-click: off"
          :color="colors.line"
          :frame="frame"
          :draw="drawers.lfo"
          square
          @move="setLfo"
          @reset="resets.lfo"
        >
          <template #settings>
            <span class="head">SHAPE</span>
            <button v-for="sh in SHAPES" :key="sh.id" class="opt" :class="{ on: s.mod.lfo2.shape === sh.id }" @click="s.mod.lfo2.shape = sh.id">{{ sh.label }}</button>
          </template>
        </PlayPad>
        <PlayPad
          label="FILTER · REVERB"
          title="FILTER · REVERB — up / down: reverb; left / right: the filter, bypassed in the middle, a low-pass closing to the left, a high-pass opening to the right. Double-click: filter off, reverb off"
          :color="colors.line"
          :frame="frame"
          :draw="drawers.fx"
          square
          @move="setFx"
          @reset="resets.fx"
        >
          <template #settings>
            <span class="head">REVERB · FILTER</span>
            <div class="knobs">
              <Knob v-model="s.reverbSize" label="SIZE" :min="0.1" :max="6" :default="2" :format="fmtSec" :size="26" />
              <Knob v-model="s.reverbDecay" label="DECAY" :min="0.5" :max="10" :default="3" :format="fmtNum" :size="26" />
              <Knob v-model="s.resonance" label="RES" :min="0.1" :max="20" curve="log" :default="0.7" :format="fmtQ" :size="26" />
            </div>
          </template>
        </PlayPad>
        <PlayPad
          label="PITCH · RING"
          title="PITCH · RING — the middle: fine pitch (±2 semitones); the left: coarse (an octave up at the top, stopped half-way, backwards below); the right brings in the ring modulator, its carrier rising with you. The thick line is the original pitch, the red one stopped. Double-click: reset"
          :color="colors.line"
          :frame="frame"
          :draw="drawers.pitch"
          square
          @move="setPitch"
          @reset="resets.pitch"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.play {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  background: #000;
  border-radius: 0 0 6px 6px;
  container-type: inline-size;
}
.top {
  display: flex;
  gap: 6px;
  align-items: stretch;
}
.grain-chip {
  flex: none;
  padding: 0 8px;
  border-radius: 5px;
  font-family: 'Orbitron', sans-serif;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.14em;
  color: color-mix(in srgb, var(--line) 60%, transparent);
  background: #000;
  border: 1.5px solid color-mix(in srgb, var(--line) 50%, transparent);
}
.grain-chip.on {
  color: #000;
  background: var(--line);
  border-color: var(--line);
}
.overview {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 30px;
  border: 1.5px solid var(--line);
  border-radius: 6px;
  overflow: hidden;
}
.overview canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: ew-resize;
  touch-action: none;
}
/* narrow (beside the list): the big view, then the pads two by two */
.main {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.perform {
  position: relative;
  aspect-ratio: 16 / 9;
  border: 1.5px solid var(--line);
  border-radius: 6px;
  overflow: hidden;
  cursor: crosshair;
  touch-action: none;
}
.perform canvas,
.perform .under {
  position: absolute;
  inset: 0;
}
.perform canvas {
  width: 100%;
  height: 100%;
}
.perform .under {
  pointer-events: none;
}
.picker {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
}
.perform .label {
  position: absolute;
  left: 6px;
  bottom: 4px;
  pointer-events: none;
  font-family: 'Orbitron', sans-serif;
  font-size: 7px;
  font-weight: 900;
  letter-spacing: 0.14em;
  color: color-mix(in srgb, var(--line) 70%, transparent);
  text-shadow: 0 0 3px #000;
}
.perform .off {
  position: absolute;
  top: 6px;
  left: 8px;
  pointer-events: none;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: var(--cross);
  text-shadow: 0 0 4px #000;
}
.pads {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.knobs {
  display: flex;
  gap: 4px;
}
.knobs :deep(.label) {
  color: color-mix(in srgb, var(--line) 75%, transparent);
}
/* wide (the rack alone): SpaceCraft's arrangement, the pads on the left and the big view beside them */
@container (min-width: 620px) {
  .main {
    flex-direction: row;
    align-items: stretch;
  }
  .pads {
    flex: 0 0 auto;
    width: min(46%, 520px);
  }
  .perform {
    flex: 1;
    aspect-ratio: auto;
  }
}
</style>
