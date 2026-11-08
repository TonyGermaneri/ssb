<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { activeVoices, clock, getBuffer, audioDuration } from '../audio/engine'
import { useBoard } from '../stores/board'
import type { Sound } from '../types'
import { fxPoint, fxWrite, grainPoint, grainWrite, lfoPoint, lfoWrite, performPoint, performWrite, pitchPoint, pitchWrite, type Point } from '../lib/play/pads'
import { crosshair, drawClip, drawFx, drawGrain, drawLfo, drawPerformOverlay, drawPitch, grainHot, grainRows, lfoOffset, type Colors, type GrainDot } from '../lib/play/draw'
import Knob from './Knob.vue'
import LiveView from './LiveView.vue'
import PlayPad from './PlayPad.vue'
import WaveViewPicker from './WaveViewPicker.vue'

/**
 * A VCO slot's Play view (SpaceCraft's performance page): the clip big, played by dragging where the grains fire
 * (left / right) and how loud (up / down), and four pads -- GRAIN, LFO, FILTER · REVERB, PITCH · RING
 * (lib/play/pads.ts says what each axis does). Everything here is the layer's own settings: the knobs show the same.
 *
 * Kept off the reactive path where it can be: a pointer's moves are held here and written to the settings once a
 * frame (the latest), its crosshair follows the pointer at once, and one frame loop repaints only the pictures whose
 * look changed, reading the settings raw.
 */
const props = defineProps<{ sound: Sound; slot: number }>()
const board = useBoard()
type Settings = Sound['settings'] & { grainLength?: number; grainBackwards?: boolean; ringMix?: number; ringFreq?: number }
/** the settings, reactive: what writes and the template use */
const s = computed(() => props.sound.settings as Settings)
/** the same object, raw: what the frame loop reads (no tracking, no proxies, sixty times a second) */
const raw = () => toRaw(props.sound.settings) as Settings

/** SpaceCraft's two engines' colours, and a third */
const PALETTE: Colors[] = [
  { line: '#00e8ff', cross: '#ff2a2a' },
  { line: '#ff2bd6', cross: '#ffa200' },
  { line: '#a8ff1a', cross: '#b04bff' },
]
const colors = computed(() => PALETTE[props.slot % PALETTE.length])
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

// ── the clip ──
const durationNow = () => getBuffer(props.sound.audioId)?.duration ?? audioDuration(props.sound.audioId)
const clipSeconds = () => {
  const r = raw()
  return Math.max(1e-3, durationNow() * Math.abs(r.clipOut - r.clipIn))
}
/** min / max per column of the clip, for the big view (cached by what it depends on) */
let clipCache: { key: string; peaks: Float32Array } | null = null
function clipPeaks(columns: number): Float32Array | null {
  const buf = getBuffer(props.sound.audioId)
  if (!buf) return null
  const r = raw()
  const a = Math.min(r.clipIn, r.clipOut)
  const b = Math.max(r.clipIn, r.clipOut)
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
  // fill the height
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
  const r = raw()
  const a = Math.min(r.clipIn, r.clipOut)
  const span = Math.max(1e-6, Math.abs(r.clipOut - r.clipIn))
  for (const info of voices.value) {
    const v = info.voice
    const dur = v.bufferDuration || durationNow()
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
const lfoAmountOf = (r: Settings) => Math.abs(r.mod.routes.find((x) => x.source === 'lfo2' && x.dest === 'grainPos')?.amount ?? 0)
const overlapOf = (r: Settings) => (r.grainMode === 'cloud' ? r.grainDensity : r.grainMode === 'loop' ? 1 : 2)

// ── the pads: where their crosshairs are, and what moving them writes ──
type PadId = 'perform' | 'grain' | 'lfo' | 'fx' | 'pitch'
/** the pitch pad's column: several give the same pitch, so it remembers which one you're in */
let pitchX = 0.5
/** each pad's pointer while it's held: the crosshair follows it exactly, ahead of the settings */
const held: Partial<Record<PadId, Point>> = {}
/** each pad's latest point since the last frame, written to the settings once a frame */
const pending: Partial<Record<PadId, Point>> = {}
/** write only what changes: an unchanged value written still counts as an edit */
function put<T extends object>(target: T, patch: Partial<T>) {
  const r = toRaw(target) as Record<string, unknown>
  for (const [k, v] of Object.entries(patch)) if (!Object.is(r[k], v)) (target as Record<string, unknown>)[k] = v
}
const writers: Record<PadId, (p: Point) => void> = {
  perform: (p) => put(s.value, performWrite(p)),
  grain: (p) => put(s.value, grainWrite(p, clipSeconds())),
  lfo: (p) => {
    const w = lfoWrite(raw(), p)
    put(s.value.mod.lfo2, w.lfo2)
    if (JSON.stringify(w.routes) !== JSON.stringify(raw().mod.routes)) s.value.mod.routes = w.routes
  },
  fx: (p) => put(s.value, fxWrite(p)),
  pitch: (p) => {
    pitchX = p.x
    put(s.value, pitchWrite(p))
  },
}
function pointOf(id: PadId, r: Settings): Point {
  const h = held[id]
  if (h) return h
  if (id === 'perform') return performPoint(r)
  if (id === 'grain') return grainPoint(r, clipSeconds())
  if (id === 'lfo') return lfoPoint(r)
  if (id === 'fx') return fxPoint(r)
  return pitchPoint(r, pitchX)
}
let touched = 0
function moved(id: PadId, p: Point) {
  held[id] = p
  pending[id] = p
  touched = performance.now()
  kick()
}
function ended(id: PadId) {
  // the last move goes in before the crosshair goes back to following the settings
  const p = pending[id]
  if (p) writers[id](p)
  delete pending[id]
  delete held[id]
  kick()
}
const resets: Record<PadId, () => void> = {
  perform: () => writers.perform({ x: 0.5, y: 1 / 1.2 }),
  grain: () => put(s.value, { grainFreq: 5, grainLength: 1 }),
  lfo: () => writers.lfo({ x: 0, y: lfoPoint(raw()).y }),
  fx: () => writers.fx({ x: 0.5, y: 0 }),
  pitch: () => writers.pitch({ x: 0.5, y: 0.5 }),
}
function reset(id: PadId) {
  delete pending[id]
  delete held[id]
  resets[id]()
  touched = performance.now()
  kick()
}

// ── drawing ──
/** the LFO trail's clock: running while the sound plays, held still while it doesn't */
let frozen = 0
/** the ring's scatter: a new one ~15 times a second while it sounds */
let pitchTick = 0
const drawers = {
  grain: (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => {
    const r = raw()
    const at = pointOf('grain', r)
    const rows = grainRows(at.y)
    const overlap = overlapOf(r)
    const hot = grainHot({ freq: r.grainFreq, overlap, now: clock.value, rows, sounding: sounding.value })
    drawGrain(g, w, h, { freq: r.grainFreq, length: r.grainLength ?? 1, overlap, rows, hot, colors: colors.value, dpr })
    crosshair(g, w, h, at, colors.value, dpr)
  },
  lfo: (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => {
    const r = raw()
    drawLfo(g, w, h, { lfo: r.mod.lfo2, amount: lfoAmountOf(r), bpm: board.bpm, now: frozen, colors: colors.value, dpr })
    crosshair(g, w, h, pointOf('lfo', r), colors.value, dpr)
  },
  fx: (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => {
    const r = raw()
    drawFx(g, w, h, { s: r, colors: colors.value, dpr })
    crosshair(g, w, h, pointOf('fx', r), colors.value, dpr)
  },
  pitch: (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => {
    const r = raw()
    const at = pointOf('pitch', r)
    drawPitch(g, w, h, { at, ring: r.ringMix ?? 0, tick: pitchTick, colors: colors.value, dpr })
    crosshair(g, w, h, at, colors.value, dpr)
  },
}
type PadRef = { paint(): void } | undefined
const grainPad = ref<PadRef>()
const lfoPad = ref<PadRef>()
const fxPad = ref<PadRef>()
const pitchPad = ref<PadRef>()
const padRefs = { grain: grainPad, lfo: lfoPad, fx: fxPad, pitch: pitchPad }
/** what each picture shows, as text: a pad repaints when its changes */
function looks(id: keyof typeof padRefs, r: Settings): string {
  const at = pointOf(id, r)
  const p = `${at.x.toFixed(4)},${at.y.toFixed(4)}|${colors.value.line}`
  if (id === 'grain') {
    const rows = grainRows(at.y)
    const overlap = overlapOf(r)
    return `${p}|${r.grainFreq}|${r.grainLength}|${overlap}|${grainHot({ freq: r.grainFreq, overlap, now: clock.value, rows, sounding: sounding.value })}`
  }
  if (id === 'lfo') {
    const a = lfoAmountOf(r)
    return `${p}|${a}|${JSON.stringify(r.mod.lfo2)}|${board.bpm}|${a ? frozen : 0}`
  }
  if (id === 'fx') return `${p}|${r.filterType}|${r.cutoff}|${r.resonance}|${r.reverbMix}`
  return `${p}|${r.ringMix ?? 0}|${pitchTick}`
}
const shown: Record<string, string> = {}

// the big view: the clip (2D / ISO), or a live view under the crosshair
const live = computed(() => ['scope', 'bars', 'spectro'].includes(board.master.waveView))
const perform = ref<HTMLDivElement>()
const performCanvas = ref<HTMLCanvasElement>()
const performSize = ref({ w: 300, h: 200 })
const dprOf = () => window.devicePixelRatio || 1
function performLooks(r: Settings): string {
  // grains move every frame while it plays
  if (sounding.value) return `${clock.value}`
  const at = pointOf('perform', r)
  return `${at.x},${at.y}|${live.value}|${props.sound.audioId}|${r.clipIn}|${r.clipOut}|${lfoAmountOf(r)}|${r.grainPos}|${performSize.value.w}x${performSize.value.h}|${colors.value.line}`
}
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
  const r = raw()
  if (!live.value) drawClip(g, w, h, clipPeaks(Math.min(1200, Math.round(performSize.value.w))), colors.value)
  const amount = lfoAmountOf(r)
  drawPerformOverlay(g, w, h, {
    at: pointOf('perform', r),
    fireX: amount > 0 ? clamp01(r.grainPos + lfoOffset(r.mod.lfo2, amount, board.bpm, frozen)) : null,
    grains: grainDots(clock.value),
    colors: colors.value,
    dpr,
  })
}

// one loop: the pointers' latest moves go in, then the pictures that changed repaint -- every frame while the sound
// plays or a pad was touched lately, else once whenever something changes
let raf = 0
let visible = true
function tick() {
  raf = 0
  for (const id of Object.keys(pending) as PadId[]) {
    writers[id](pending[id]!)
    delete pending[id]
  }
  if (sounding.value) frozen = clock.value
  const r = raw()
  pitchTick = (r.ringMix ?? 0) > 0 && sounding.value ? Math.floor(clock.value * 15) : 0
  for (const id of Object.keys(padRefs) as (keyof typeof padRefs)[]) {
    const k = looks(id, r)
    if (k === shown[id]) continue
    shown[id] = k
    padRefs[id].value?.paint()
  }
  const k = performLooks(r)
  if (k !== shown.perform) {
    shown.perform = k
    paintPerform()
  }
  if (visible && (sounding.value || performance.now() - touched < 1500 || Object.keys(held).length)) raf = requestAnimationFrame(tick)
}
function kick() {
  if (!raf && visible) raf = requestAnimationFrame(tick)
}
watch(() => [board.changes, board.bpm, board.master.waveView, sounding.value, props.slot, props.sound.id], kick)

// ── the big view as a pad ──
let performBox: DOMRect | null = null
const performPointAt = (e: PointerEvent): Point => {
  const r = performBox!
  return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01(1 - (e.clientY - r.top) / r.height) }
}
function performDown(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  performBox = perform.value!.getBoundingClientRect()
  moved('perform', performPointAt(e))
}
function performMove(e: PointerEvent) {
  if (performBox && (e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) moved('perform', performPointAt(e))
}
function performUp() {
  if (!performBox) return
  performBox = null
  ended('perform')
}

let ro: ResizeObserver | undefined
let io: IntersectionObserver | undefined
const root = ref<HTMLDivElement>()
onMounted(() => {
  ro = new ResizeObserver(([e]) => {
    performSize.value = { w: e.contentRect.width, h: e.contentRect.height }
    kick()
  })
  if (perform.value) ro.observe(perform.value)
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
    <div class="main">
      <div
        ref="perform"
        class="perform"
        title="Drag: left / right is where in the clip the grains fire (POS), up / down how loud (VOL). The squares are the grains as they play"
        @pointerdown="performDown"
        @pointermove="performMove"
        @pointerup="performUp"
        @pointercancel="performUp"
        @lostpointercapture="performUp"
      >
        <LiveView v-if="live" class="under" :sound="sound" :hue="0" :height="Math.max(60, Math.round(performSize.h))" :width="Math.round(performSize.w)" readonly />
        <canvas ref="performCanvas" />
        <button
          class="grain-chip"
          :class="{ on: s.grain }"
          :title="s.grain ? 'Grains on: the pads play the sound as grains — click for the plain sample' : 'The sound plays as a plain sample: most of the pads need grains — click to turn them on'"
          @pointerdown.stop
          @click.stop="board.toggleGrain(sound.id)"
        >
          GRAIN {{ s.grain ? 'ON' : 'OFF' }}
        </button>
        <WaveViewPicker class="picker" @pointerdown.stop />
        <span class="label">PERFORM</span>
      </div>

      <div class="pads">
        <PlayPad
          ref="grainPad"
          label="GRAIN"
          title="GRAIN — up / down: how often grains fire; left / right: how long each lasts. Each line is a grain, one after another down the pad: long ones overlap (a smooth texture), short ones are dots apart (separate grains, arpeggios). Double-click: reset"
          :color="colors.line"
          :draw="drawers.grain"
          square
          @move="(p: Point) => moved('grain', p)"
          @end="ended('grain')"
          @reset="reset('grain')"
        >
          <template #settings>
            <span class="head">MODE</span>
            <button v-for="m in MODES" :key="m" class="opt" :class="{ on: s.grainMode === m }" @click="s.grainMode = m">{{ m.toUpperCase() }}</button>
          </template>
        </PlayPad>
        <PlayPad
          ref="lfoPad"
          label="LFO"
          title="LFO — swings where the grains fire: left / right how far (far left: off), up / down how fast (tempo divisions, slow at the bottom). It is the layer's LFO 2, routed to POS. Double-click: off"
          :color="colors.line"
          :draw="drawers.lfo"
          square
          @move="(p: Point) => moved('lfo', p)"
          @end="ended('lfo')"
          @reset="reset('lfo')"
        >
          <template #settings>
            <span class="head">SHAPE</span>
            <button v-for="sh in SHAPES" :key="sh.id" class="opt" :class="{ on: s.mod.lfo2.shape === sh.id }" @click="s.mod.lfo2.shape = sh.id">{{ sh.label }}</button>
          </template>
        </PlayPad>
        <PlayPad
          ref="fxPad"
          label="FILTER · REVERB"
          title="FILTER · REVERB — up / down: reverb; left / right: the filter, bypassed in the middle, a low-pass closing to the left, a high-pass opening to the right. Double-click: filter off, reverb off"
          :color="colors.line"
          :draw="drawers.fx"
          square
          @move="(p: Point) => moved('fx', p)"
          @end="ended('fx')"
          @reset="reset('fx')"
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
          ref="pitchPad"
          label="PITCH · RING"
          title="PITCH · RING — the middle: fine pitch (±2 semitones); the left: coarse (an octave up at the top, stopped half-way, backwards below); the right brings in the ring modulator, its carrier rising with you. The thick line is the original pitch, the red one stopped. Double-click: reset"
          :color="colors.line"
          :draw="drawers.pitch"
          square
          @move="(p: Point) => moved('pitch', p)"
          @end="ended('pitch')"
          @reset="reset('pitch')"
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
.grain-chip {
  position: absolute;
  top: 5px;
  left: 5px;
  z-index: 1;
  padding: 2px 7px;
  border-radius: 4px;
  font-family: 'Orbitron', sans-serif;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.14em;
  color: var(--cross);
  background: rgba(0, 0, 0, 0.7);
  border: 1.5px solid color-mix(in srgb, var(--cross) 60%, transparent);
}
.grain-chip.on {
  color: #000;
  background: var(--line);
  border-color: var(--line);
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
