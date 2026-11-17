<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { activeVoices, clock, getBuffer, audioDuration, readSound, SCOPE_SAMPLES, soundSounding, watchSound } from '../audio/engine'
import { useBoard } from '../stores/board'
import { lfoHz, type Sound } from '../types'
import {
  echoDivisions, echoPoint, echoWrite, fxPoint, fxWrite, GRAIN_SYNC_BANDS, grainPoint, grainSyncPoint, grainSyncWrite, grainWrite,
  lfoPoint, lfoWrite, performPoint, performWrite, pitchPoint, pitchWrite, SYNC_TOP, texturePoint, textureWrite, tonePoint,
  toneWrite, type Point,
} from '../lib/play/pads'
import {
  crosshair, drawClip, drawEcho, drawFx, drawGrain, drawLfo, drawPerformOverlay, drawPitch, drawSyncBands, drawTexture, drawTone,
  grainLit, lfoOffset, lfoSwing, type Colors, type GrainDot,
} from '../lib/play/draw'
import { pitchMultiplier } from '../lib/play/pads'
import { SCALES } from '../lib/play/scales'
import { AudioFeed, registerVco, shaderPrefs, stageStatus, type PadKind, type StagePad } from '../lib/play/shaders'
import Knob from './Knob.vue'
import ShaderControls from './ShaderControls.vue'
import LiveView from './LiveView.vue'
import PlayPad from './PlayPad.vue'
import WaveViewPicker from './WaveViewPicker.vue'
import { cycleFillSeconds, tableCount } from '../audio/wavetable'

/**
 * A VCO slot's Play view: the clip big, played by dragging where the grains fire (left / right) and how loud (up /
 * down), and seven pads -- GRAIN, LFO, FILTER · REVERB, PITCH · RING, TEXTURE, ECHO, TONE (lib/play/pads.ts says what each axis does; draw.ts
 * how each looks). Everything here is the layer's own settings: the knobs show the same. Behind them all, the shader
 * stage (lib/play/shaders.ts, mounted by the rack) reads this VCO's pads and audio through registerVco.
 *
 * Kept off the reactive path where it can be: a pointer's moves are held here and written to the settings once a
 * frame (the latest), its crosshair follows the pointer at once, and one frame loop repaints only the pictures whose
 * look changed, reading the settings raw.
 */
const props = defineProps<{ sound: Sound; slot: number }>()
const board = useBoard()
type Settings = Sound['settings']
/** the settings, reactive: what writes and the template use */
const s = computed(() => props.sound.settings as Settings)
/** the same object, raw: what the frame loop reads (no tracking, no proxies, sixty times a second) */
const raw = () => toRaw(props.sound.settings) as Settings

/**
 * The theme's colours: each VCO's pictures in one of its LED colours (primary, secondary, accent), the crosshair in the
 * first of danger / accent / secondary / primary that stands apart from it.
 */
const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const apart = (a: string, b: string) => {
  const [x, y] = [rgbOf(a), rgbOf(b)]
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) > 110
}
const colors = computed<Colors>(() => {
  const t = board.theme
  const line = [t.primary, t.secondary, t.accent][props.slot % 3]
  const cross = [t.danger, t.accent, t.secondary, t.primary].find((c) => c !== line && apart(c, line)) ?? t.text[0]
  return { line, cross }
})
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

// ── the clip ──
const durationNow = () => getBuffer(props.sound.audioId)?.duration ?? audioDuration(props.sound.audioId)
/**
 * A wavetable (audio/wavetable.ts): its cycles and their length. The big view's left / right is then where in the table
 * it plays (WT + BLEND), the table drawn whole; its grains (and the GRAIN pad) are the chosen wave's.
 */
const tableOf = () => {
  const r = raw()
  if (!(r.wtSize > 0) || props.sound.zones?.length) return null
  const buf = getBuffer(props.sound.audioId)
  const count = buf ? tableCount(buf.length, r.wtSize) : 0
  return buf && count >= 1 ? { count, size: r.wtSize, rate: buf.sampleRate } : null
}
/** the whole sample's length: the GRAIN pad's bottom is one grain that long (a table's: the wave its grains play) */
const sampleSeconds = () => {
  const t = tableOf()
  return t ? cycleFillSeconds(t.size, t.rate) : durationNow() || 0
}
/** a wavetable's position as the big view's x: its first wave at the left, its last at the right */
const tableX = (r: Settings, count: number) => (count > 1 ? clamp01((Math.round(r.wt) + r.wtBlend) / (count - 1)) : 0)
function tableWrite(p: Point, count: number) {
  const at = clamp01(p.x) * Math.max(0, count - 1)
  const wt = Math.min(count - 1, Math.floor(at))
  return { wt, wtBlend: Math.round((at - wt) * 1000) / 1000, volume: performWrite(p).volume }
}
/** min / max per column of the clip, for the big view (cached by what it depends on) */
let clipCache: { key: string; peaks: Float32Array } | null = null
function clipPeaks(columns: number): Float32Array | null {
  const buf = getBuffer(props.sound.audioId)
  if (!buf) return null
  const r = raw()
  // (a wavetable is drawn whole: its x is the position in it)
  const whole = !!tableOf()
  const a = whole ? 0 : Math.min(r.clipIn, r.clipOut)
  const b = whole ? 1 : Math.max(r.clipIn, r.clipOut)
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
/** LFO 2's route to POS: how far it sweeps, and whether only forward (the pad's) */
const lfoRouteOf = (r: Settings) => {
  const route = r.mod.routes.find((x) => x.source === 'lfo2' && x.dest === 'grainPos')
  return { amount: Math.abs(route?.amount ?? 0), unipolar: !!route?.unipolar }
}

// ── the pads: where their crosshairs are, and what moving them writes ──
type PadId = 'perform' | 'grain' | 'lfo' | 'fx' | 'pitch' | 'texture' | 'echo' | 'tone'
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
  perform: (p) => {
    const t = tableOf()
    put(s.value, t ? tableWrite(p, t.count) : performWrite(p))
  },
  // SYNC: the rows are tempo divisions (the top band free)
  grain: (p) => put(s.value, raw().grainSync ? grainSyncWrite(p, board.bpm) : grainWrite(p, sampleSeconds())),
  lfo: (p) => {
    const w = lfoWrite(raw(), p)
    put(s.value.mod.lfo2, w.lfo2)
    if (JSON.stringify(w.routes) !== JSON.stringify(raw().mod.routes)) s.value.mod.routes = w.routes
  },
  fx: (p) => put(s.value, fxWrite(p)),
  pitch: (p) => {
    pitchX = p.x
    // SCALE: snapped to the chosen scale
    put(s.value, pitchWrite(p, raw().pitchScale ? (raw().pitchScaleId ?? 'major') : null))
  },
  texture: (p) => put(s.value, textureWrite(p)),
  echo: (p) => put(s.value, echoWrite(p, board.bpm, raw().delayMix)),
  tone: (p) => put(s.value, toneWrite(p)),
}
function pointOf(id: PadId, r: Settings): Point {
  const h = held[id]
  if (h) return h
  if (id === 'perform') {
    const t = tableOf()
    return t ? { x: tableX(r, t.count), y: performPoint(r).y } : performPoint(r)
  }
  if (id === 'grain') return r.grainSync ? grainSyncPoint(r, board.bpm) : grainPoint(r, sampleSeconds())
  if (id === 'lfo') return lfoPoint(r)
  if (id === 'fx') return fxPoint(r)
  if (id === 'texture') return texturePoint(r)
  if (id === 'echo') return echoPoint(r)
  if (id === 'tone') return tonePoint(r)
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
  texture: () => put(s.value, { grainSpray: 0, grainDetune: 0 }),
  // the echo out (its time and feedback kept)
  echo: () => put(s.value, { delayMix: 0 }),
  tone: () => put(s.value, { eqLow: 0, eqMid: 0, eqHigh: 0 }),
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
    const lit = grainLit({ freq: r.grainFreq, y: at.y, now: clock.value, sounding: sounding.value })
    drawGrain(g, w, h, { duty: r.grainLength ?? 1, y: at.y, lit, colors: colors.value, dpr })
    if (r.grainSync) drawSyncBands(g, w, h, { bands: GRAIN_SYNC_BANDS.length, top: SYNC_TOP, at, colors: colors.value, dpr })
    crosshair(g, w, h, at, colors.value, dpr)
  },
  lfo: (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => {
    const r = raw()
    drawLfo(g, w, h, { lfo: r.mod.lfo2, ...lfoRouteOf(r), bpm: board.bpm, now: frozen, colors: colors.value, dpr })
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
  texture: (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => {
    const at = pointOf('texture', raw())
    drawTexture(g, w, h, { at, t: frozen, colors: colors.value, dpr })
    crosshair(g, w, h, at, colors.value, dpr)
  },
  echo: (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => {
    const r = raw()
    const at = pointOf('echo', r)
    const divs = echoDivisions(board.bpm)
    const lit = divs.findIndex((d) => Math.abs(d.seconds - r.delayTime) < 1e-3)
    drawEcho(g, w, h, { at, feedback: r.delayFeedback, mix: r.delayMix, divisions: divs.map((d) => d.x), lit, colors: colors.value, dpr })
    crosshair(g, w, h, at, colors.value, dpr)
  },
  tone: (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => {
    const r = raw()
    drawTone(g, w, h, { s: r, colors: colors.value, dpr })
    crosshair(g, w, h, pointOf('tone', r), colors.value, dpr)
  },
}
type PadRef = { paint(): void; el(): HTMLElement | undefined } | undefined
const grainPad = ref<PadRef>()
const lfoPad = ref<PadRef>()
const fxPad = ref<PadRef>()
const pitchPad = ref<PadRef>()
const texturePad = ref<PadRef>()
const echoPad = ref<PadRef>()
const tonePad = ref<PadRef>()
const padRefs = { grain: grainPad, lfo: lfoPad, fx: fxPad, pitch: pitchPad, texture: texturePad, echo: echoPad, tone: tonePad }
/** what each picture shows, as text: a pad repaints when its changes */
function looks(id: keyof typeof padRefs, r: Settings): string {
  const at = pointOf(id, r)
  const p = `${at.x.toFixed(4)},${at.y.toFixed(4)}|${colors.value.line}`
  if (id === 'grain') return `${p}|${r.grainFreq}|${r.grainLength}|${r.grainSync}|${r.grainBeats}|${grainLit({ freq: r.grainFreq, y: at.y, now: clock.value, sounding: sounding.value })}`
  if (id === 'lfo') {
    const { amount, unipolar } = lfoRouteOf(r)
    return `${p}|${amount}|${unipolar}|${JSON.stringify(r.mod.lfo2)}|${board.bpm}|${amount ? frozen : 0}`
  }
  if (id === 'fx') return `${p}|${r.filterType}|${r.cutoff}|${r.resonance}|${r.reverbMix}`
  // the pollen drifts while it plays (a few times a second is plenty)
  if (id === 'texture') return `${p}|${sounding.value ? Math.floor(frozen * 20) : 0}`
  if (id === 'echo') return `${p}|${r.delayTime}|${r.delayFeedback}|${r.delayMix}|${board.bpm}`
  if (id === 'tone') return `${p}|${r.eqLow}|${r.eqMid}|${r.eqHigh}`
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
  const lfo = lfoRouteOf(r)
  return `${at.x},${at.y}|${live.value}|${props.sound.audioId}|${r.clipIn}|${r.clipOut}|${r.wt}|${r.wtBlend}|${lfo.amount}|${lfo.unipolar}|${r.grainPos}|${performSize.value.w}x${performSize.value.h}|${colors.value.line}`
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
  const lfo = lfoRouteOf(r)
  // (a table's grains play its wave, not where they'd sit in the whole table: no grains or firing point drawn)
  const table = !!tableOf()
  drawPerformOverlay(g, w, h, {
    at: pointOf('perform', r),
    fireX: lfo.amount > 0 && !table ? clamp01(r.grainPos + lfoOffset(r.mod.lfo2, lfo.amount, board.bpm, frozen, lfo.unipolar)) : null,
    grains: table ? [] : grainDots(clock.value),
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

/** GRAIN's ATTACK (SpaceCraft's grain attack): SKEW from leaning early (a percussive grain, 0) to even (100 %) */
const grainAttack = computed({
  get: () => Math.min(1, Math.max(0, s.value.grainSkew / 0.5)),
  set: (v: number) => (s.value.grainSkew = Math.round(Math.min(1, Math.max(0, v)) * 0.5 * 1000) / 1000),
})
/** SYNC turned on: the band nearest the grains' rate now; off: GRAIN's Hz stays as the band had it */
function setSync(on: boolean) {
  if (on === s.value.grainSync) return
  s.value.grainSync = on
  if (on) {
    const r = raw()
    const x = grainPoint(r, sampleSeconds()).x
    // faster than the fastest band: the top band, free, at the same rate
    const free = r.grainFreq >= (board.bpm / 60) / GRAIN_SYNC_BANDS.at(-1)!
    put(s.value, free ? { grainBeats: 0 } : grainSyncWrite({ x, y: grainBand(r.grainFreq) }, board.bpm))
  }
  kick()
}
/** where a rate sits among SYNC's bands (by beats a grain at the tempo) */
function grainBand(hz: number): number {
  const beats = board.bpm / 60 / Math.max(1e-6, hz)
  let best = 0
  for (let i = 1; i < GRAIN_SYNC_BANDS.length; i++) if (Math.abs(Math.log(GRAIN_SYNC_BANDS[i] / beats)) < Math.abs(Math.log(GRAIN_SYNC_BANDS[best] / beats))) best = i
  return ((best + 0.5) / GRAIN_SYNC_BANDS.length) * SYNC_TOP
}

// ── the shader stage: this VCO's pads and audio, read once a frame ──
const feed = new AudioFeed()
const scopeBuf = new Float32Array(SCOPE_SAMPLES)
let scopeSeq = 0
function feedNow(): AudioFeed {
  const n = readSound(props.sound.id, scopeBuf)
  const fresh = n > 0 && n !== scopeSeq && soundSounding(props.sound.id)
  if (n > 0) scopeSeq = n
  feed.update(scopeBuf, fresh)
  return feed
}
const logTo = (v: number, lo: number, hi: number) => clamp01(Math.log(Math.max(lo, v) / lo) / Math.log(hi / lo))
function stagePads(): StagePad[] {
  const r = raw()
  const lfo = lfoRouteOf(r)
  const now = frozen
  const perfAt = pointOf('perform', r)
  const el = (x: { value: PadRef }) => x.value?.el()
  const pad = (kind: PadKind, e: HTMLElement | undefined, a: StagePad['a'], p: { x: number; y: number }): StagePad => ({ kind, el: e, a, p })
  const grainAt = pointOf('grain', r)
  const pitchAt = pointOf('pitch', r)
  const texAt = pointOf('texture', r)
  const echoAt = pointOf('echo', r)
  const toneAt = pointOf('tone', r)
  return [
    pad('perform', perform.value, [perfAt.x, perfAt.y, lfo.amount > 0 ? clamp01(r.grainPos + lfoOffset(r.mod.lfo2, lfo.amount, board.bpm, now, lfo.unipolar)) : -1, sounding.value ? 1 : 0], perfAt),
    pad('grain', el(grainPad), [r.grainLength ?? 1, grainAt.y, r.grainFreq, 0], grainAt),
    pad('lfo', el(lfoPad), [lfo.amount, lfoHz(r.mod.lfo2, board.bpm), lfoSwing({ lfo: r.mod.lfo2, ...lfo, bpm: board.bpm, now }), 0], pointOf('lfo', r)),
    pad('fx', el(fxPad), [pointOf('fx', r).x, r.reverbMix, logTo(r.resonance, 0.1, 20), r.reverbDamp ?? 0], pointOf('fx', r)),
    pad('pitch', el(pitchPad), [pitchMultiplier(pitchAt), r.ringMix ?? 0, logTo(r.ringFreq ?? 440, 30, 3840), pitchAt.x], pitchAt),
    pad('texture', el(texturePad), [texAt.x, texAt.y, 0, 0], texAt),
    pad('echo', el(echoPad), [echoAt.x, echoAt.y, r.delayMix, 0], echoAt),
    pad('tone', el(tonePad), [(toneAt.x - 0.5) * 2, (toneAt.y - 0.5) * 2, 0, 0], toneAt),
  ]
}
const unregister = registerVco({
  get slot() {
    return props.slot
  },
  colors: () => colors.value,
  audio: feedNow,
  pads: stagePads,
  // growing: the prompt playing, its words drifting behind this column (lib/play/words.ts)
  prompt: () => {
    const g = board.selectedPatch?.slots[props.slot]?.garden
    return g?.on ? (g.history[0]?.prompt ?? '') : ''
  },
  area: () => root.value ?? undefined,
})
// the plugin sends its voices' audio only while something wants it
let unwatch: (() => void) | null = null
watch(
  () => [shaderPrefs.on && stageStatus.available, props.sound.id] as const,
  ([on]) => {
    unwatch?.()
    unwatch = on ? watchSound(props.sound.id) : null
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  unregister()
  unwatch?.()
})

// PERFORM's settings: STEREO PHASE, the sample's tuning, its shader
const performSettings = ref(false)
const fmtMs = (v: number) => (v > 0 ? `${v.toFixed(1)}ms` : 'OFF')
const fmtSemis = (v: number) => (v ? `${v > 0 ? '+' : ''}${Math.round(v)}st` : 'ORIG')
const fmtCents = (v: number) => (v ? `${v > 0 ? '+' : ''}${Math.round(v)}c` : 'ORIG')
const fmtSec = (v: number) => `${v.toFixed(1)}s`
const fmtNum = (v: number) => v.toFixed(1)
const fmtQ = (v: number) => v.toFixed(1)
const pct = (v: number) => `${Math.round(v * 100)}%`
const fmtMsS = (v: number) => (v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`)
const fmtDb = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB`
</script>

<template>
  <div ref="root" class="play" :style="{ '--line': colors.line, '--cross': colors.cross }" @pointerdown.stop @click.stop>
    <div class="main">
      <div
        ref="perform"
        class="perform"
        :title="s.wtSize > 0 ? 'A wavetable — drag: left / right moves through its waves (WT, and WT BLEND between them), up / down how loud (VOL). Its grains, when on, play the wave chosen' : 'Drag: left / right is where in the clip the grains fire (POS), up / down how loud (VOL). The diamonds are the grains as they play'"
        @pointerdown="performDown"
        @pointermove="performMove"
        @pointerup="performUp"
        @pointercancel="performUp"
        @lostpointercapture="performUp"
      >
        <LiveView v-if="live" class="under" :sound="sound" :hue="0" :height="Math.max(60, Math.round(performSize.h))" :width="Math.round(performSize.w)" readonly />
        <canvas ref="performCanvas" />
        <div class="chips" @pointerdown.stop>
          <button
            class="chip"
            :class="{ on: s.grain }"
            :title="s.grain ? 'Grains on: the pads play the sound as grains — click for the plain sample' : 'The sound plays as a plain sample: most of the pads need grains — click to turn them on'"
            @click.stop="board.toggleGrain(sound.id)"
          >
            GRAIN {{ s.grain ? 'ON' : 'OFF' }}
          </button>
          <button
            class="chip"
            :class="{ on: shaderPrefs.on && stageStatus.available }"
            :disabled="!stageStatus.available"
            :title="stageStatus.available ? 'SHADERS: the light show behind every pad, driven by the sound and the pads (every VCO) — click to turn it on / off' : 'No WebGL2 here: the pads draw their pictures alone'"
            @click.stop="shaderPrefs.on = !shaderPrefs.on"
          >
            GL {{ !stageStatus.available ? 'N/A' : shaderPrefs.on ? 'ON' : 'OFF' }}
          </button>
        </div>
        <WaveViewPicker class="picker" @pointerdown.stop />
        <span class="label">PERFORM</span>
        <button class="perform-gear" :class="{ on: performSettings }" title="Settings: stereo phase, the sample's tuning, the shader" @pointerdown.stop @click.stop="performSettings = !performSettings">
          <v-icon size="12" icon="mdi-cog" />
        </button>
        <div v-if="performSettings" class="perform-settings" @pointerdown.stop @click.stop>
          <div class="knobs">
            <Knob v-model="s.stereoPhase" label="PHASE" :min="0" :max="30" :default="0" :format="fmtMs" :size="30" />
            <Knob v-model="s.tuneCoarse" label="COARSE" :min="-12" :max="12" :step="1" :default="0" bipolar :format="fmtSemis" :size="30" />
            <Knob v-model="s.tuneFine" label="FINE" :min="-100" :max="100" :step="1" :default="0" bipolar :format="fmtCents" :size="30" />
          </div>
          <ShaderControls kind="perform" />
          <button class="done" @click="performSettings = false">DONE</button>
        </div>
      </div>

      <div class="pads">
        <PlayPad
          ref="grainPad"
          label="GRAIN"
          class="a-grain"
          title="GRAIN — up / down: the grains' size (small and fast at the top, long and slow at the bottom); left / right: how much of each grain's turn it sounds (1 % at the far left, mostly silence; all of it at the right). Time runs out along the spiral: a dash is a grain sounding, a gap silence. Double-click: reset"
          :color="colors.line"
          :draw="drawers.grain"
          square
          @move="(p: Point) => moved('grain', p)"
          @end="ended('grain')"
          @reset="reset('grain')"
        >
          <template #settings>
            <div class="row">
              <button class="opt" :class="{ on: !s.grainSync }" title="FREE: the grains' rate sweeps smoothly" @click="setSync(false)">FREE</button>
              <button class="opt" :class="{ on: s.grainSync }" title="SYNC: the heights are tempo divisions (the top band stays free, for smooth fast grains)" @click="setSync(true)">SYNC</button>
            </div>
            <div class="row">
              <button v-for="m in MODES" :key="m" class="opt" :class="{ on: s.grainMode === m }" @click="s.grainMode = m">{{ m.toUpperCase() }}</button>
            </div>
            <div class="row">
              <button class="opt" :class="{ on: !s.mpeGrain }" title="MPE: a note's sideways bend bends its pitch" @click="s.mpeGrain = false">MPE PITCH</button>
              <button class="opt" :class="{ on: s.mpeGrain }" title="MPE: a note's sideways bend moves where its grains fire, over half the clip each way" @click="s.mpeGrain = true">MPE GRAIN</button>
            </div>
            <div class="knobs">
              <Knob v-model="grainAttack" label="ATTACK" :min="0" :max="1" :default="1" :format="(v: number) => `${Math.round(v * 100)}%`" :size="26" />
            </div>
            <ShaderControls kind="grain" />
          </template>
        </PlayPad>
        <PlayPad
          ref="lfoPad"
          label="LFO"
          class="a-lfo"
          title="LFO — sweeps where the grains fire, forward of the position (never behind it): left / right how far (far left: off), up / down how fast (tempo divisions, slow at the bottom). The pendulum swings as it does. It is the layer's LFO 2, routed to POS. Double-click: off"
          :color="colors.line"
          :draw="drawers.lfo"
          square
          @move="(p: Point) => moved('lfo', p)"
          @end="ended('lfo')"
          @reset="reset('lfo')"
        >
          <template #settings>
            <span class="head">SHAPE</span>
            <div class="row">
              <button v-for="sh in SHAPES" :key="sh.id" class="opt" :class="{ on: s.mod.lfo2.shape === sh.id }" @click="s.mod.lfo2.shape = sh.id">{{ sh.label }}</button>
            </div>
            <ShaderControls kind="lfo" />
          </template>
        </PlayPad>
        <PlayPad
          ref="fxPad"
          label="FILTER · REVERB"
          class="a-fx"
          title="FILTER · REVERB — up / down: reverb (the ripples); left / right: the filter (the horizon), bypassed in the middle, a low-pass closing to the left, a high-pass opening to the right. Double-click: filter off, reverb off"
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
              <Knob v-model="s.reverbDamp" label="DAMP" :min="0" :max="1" :default="0" :format="(v: number) => `${Math.round(v * 100)}%`" :size="26" />
              <Knob v-model="s.resonance" label="RES" :min="0.1" :max="20" curve="log" :default="0.7" :format="fmtQ" :size="26" />
            </div>
            <ShaderControls kind="fx" />
          </template>
        </PlayPad>
        <PlayPad
          ref="pitchPad"
          label="PITCH · RING"
          class="a-pitch"
          title="PITCH · RING — each needle points the way the sample plays there: right at its own pitch, tipping down towards ×2, up where it stops, left backwards. The middle is fine pitch (±2 semitones), the edges coarse; the right brings in the ring modulator (the haloed needles), its carrier rising with you. The lit needles play what the crosshair plays. Double-click: reset"
          :color="colors.line"
          :draw="drawers.pitch"
          square
          @move="(p: Point) => moved('pitch', p)"
          @end="ended('pitch')"
          @reset="reset('pitch')"
        >
          <template #settings>
            <div class="row">
              <button class="opt" :class="{ on: !s.pitchScale }" title="FREE: the pitch moves smoothly" @click="s.pitchScale = false">FREE</button>
              <button class="opt" :class="{ on: s.pitchScale }" title="SCALE: the pitch snaps to the scale below" @click="s.pitchScale = true">SCALE</button>
            </div>
            <div class="row">
              <select v-model="s.pitchScaleId" class="select" :disabled="!s.pitchScale" title="The scale SCALE snaps the pitch to (from the sample's own key)">
                <option v-for="sc in SCALES" :key="sc.id" :value="sc.id">{{ sc.label }}</option>
              </select>
            </div>
            <ShaderControls kind="pitch" />
          </template>
        </PlayPad>
        <PlayPad
          ref="texturePad"
          label="TEXTURE"
          class="a-texture"
          title="TEXTURE — the grain cloud's scatter: left / right SPRAY (each grain thrown up to 2 s from where it should fire), up / down DETUNE (the grains split, left lower and right higher, a shimmer that widens). Needs GRAIN on. Double-click: back to tight"
          :color="colors.line"
          :draw="drawers.texture"
          square
          @move="(p: Point) => moved('texture', p)"
          @end="ended('texture')"
          @reset="reset('texture')"
        >
          <template #settings>
            <div class="knobs">
              <Knob v-model="s.grainVariation" label="VARY" :min="0" :max="1" :default="0" :format="pct" :size="26" />
              <Knob v-model="s.grainStereo" label="SPREAD" :min="0" :max="1" :default="0" :format="pct" :size="26" />
              <Knob v-model="s.grainDensity" label="DENSITY" :min="2" :max="20" :step="1" :default="4" :format="(v: number) => `${Math.round(v)}`" :size="26" :class="{ dim: s.grainMode !== 'cloud' }" />
              <Knob v-model="s.grainAmp" label="FLUX" :min="0" :max="1" :default="0" :format="pct" :size="26" />
            </div>
            <ShaderControls kind="texture" />
          </template>
        </PlayPad>
        <PlayPad
          ref="echoPad"
          label="ECHO"
          class="a-echo"
          title="ECHO — this VCO's delay: left / right its time (20 ms to 1.5 s; it catches on the tempo's divisions, the ticks along the floor), up / down its feedback (how many repeats). Touching it gives an echo with no MIX some. Double-click: echo off"
          :color="colors.line"
          :draw="drawers.echo"
          square
          @move="(p: Point) => moved('echo', p)"
          @end="ended('echo')"
          @reset="reset('echo')"
        >
          <template #settings>
            <div class="knobs">
              <Knob v-model="s.delayMix" label="MIX" :min="0" :max="1" :default="0" :format="pct" :size="26" />
              <Knob v-model="s.delayTime" label="TIME" :min="0.01" :max="2" curve="log" :default="0.25" :format="fmtMsS" :size="26" />
              <Knob v-model="s.delayFeedback" label="FDBK" :min="0" :max="0.9" :default="0.35" :format="pct" :size="26" />
            </div>
            <ShaderControls kind="echo" />
          </template>
        </PlayPad>
        <PlayPad
          ref="tonePad"
          label="TONE"
          class="a-tone"
          title="TONE — this VCO's EQ: left / right tilts it darker (more bass, less treble) or brighter, up / down pushes or scoops the mids; flat in the middle. Double-click: flat"
          :color="colors.line"
          :draw="drawers.tone"
          @move="(p: Point) => moved('tone', p)"
          @end="ended('tone')"
          @reset="reset('tone')"
        >
          <template #settings>
            <div class="knobs">
              <Knob v-model="s.eqLow" label="BASS" :min="-12" :max="12" :step="0.5" :default="0" bipolar :format="fmtDb" :size="26" />
              <Knob v-model="s.eqMid" label="MID" :min="-12" :max="12" :step="0.5" :default="0" bipolar :format="fmtDb" :size="26" />
              <Knob v-model="s.eqHigh" label="TREBLE" :min="-12" :max="12" :step="0.5" :default="0" bipolar :format="fmtDb" :size="26" />
            </div>
            <ShaderControls kind="tone" />
          </template>
        </PlayPad>
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
  background: var(--panel-lo);
  border-radius: 0 0 6px 6px;
  container-type: inline-size;
}
.chips {
  position: absolute;
  top: 5px;
  left: 5px;
  z-index: 1;
  display: flex;
  gap: 4px;
}
.chip {
  padding: 2px 8px;
  border-radius: 10px;
  font-family: 'Orbitron', sans-serif;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.14em;
  color: var(--cross);
  background: color-mix(in srgb, var(--lcd-bg) 75%, transparent);
  border: 1.5px solid color-mix(in srgb, var(--cross) 60%, transparent);
}
.chip.on {
  color: var(--lcd-bg);
  background: var(--line);
  border-color: var(--line);
  box-shadow: 0 0 8px color-mix(in srgb, var(--line) 60%, transparent);
}
.chip:disabled {
  opacity: 0.5;
}
/* the big view on top, the four pads under it: two by two when narrow, a row of four when there's room */
.main {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.perform {
  position: relative;
  height: 110px;
  background: var(--lcd-bg);
  border: 1px solid color-mix(in srgb, var(--line) 55%, transparent);
  border-radius: 14px;
  box-shadow: inset 0 0 18px color-mix(in srgb, var(--line) 18%, transparent);
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
  left: 50%;
  bottom: 4px;
  transform: translateX(-50%);
  pointer-events: none;
  padding: 0 6px;
  border-radius: 6px;
  font-family: 'Orbitron', sans-serif;
  font-size: 7px;
  font-weight: 900;
  letter-spacing: 0.3em;
  color: var(--lcd-bg);
  background: color-mix(in srgb, var(--line) 70%, transparent);
}
.pads {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-areas: 'grain lfo' 'fx pitch' 'texture echo' 'tone tone';
  gap: 8px;
}
.a-grain { grid-area: grain; }
.a-lfo { grid-area: lfo; }
.a-fx { grid-area: fx; }
.a-pitch { grid-area: pitch; }
.a-texture { grid-area: texture; }
.a-echo { grid-area: echo; }
/* TONE lies wide (the EQ's curve reads across), two pads' width and one's height */
.a-tone {
  grid-area: tone;
  aspect-ratio: 2.06;
}
.knobs .dim {
  opacity: 0.4;
}
.perform-gear {
  position: absolute;
  right: 6px;
  bottom: 4px;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border-radius: 50%;
  color: color-mix(in srgb, var(--line) 70%, transparent);
  background: color-mix(in srgb, var(--lcd-bg) 55%, transparent);
  border: 1px solid color-mix(in srgb, var(--line) 35%, transparent);
  opacity: 0.6;
}
.perform-gear:hover,
.perform-gear.on {
  opacity: 1;
}
.perform-settings {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: safe center;
  gap: 6px 14px;
  padding: 6px;
  overflow: auto;
  cursor: default;
  background: color-mix(in srgb, var(--lcd-bg) 90%, transparent);
}
.perform-settings :deep(.label) {
  color: color-mix(in srgb, var(--line) 75%, transparent);
}
.perform-settings .done {
  padding: 1px 10px;
  border-radius: 10px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: color-mix(in srgb, var(--line) 75%, transparent);
  background: color-mix(in srgb, var(--line) 10%, var(--lcd-bg));
  border: 1px solid color-mix(in srgb, var(--line) 45%, transparent);
}
.knobs {
  display: flex;
  gap: 4px;
}
.knobs :deep(.label) {
  color: color-mix(in srgb, var(--line) 75%, transparent);
}
.select {
  appearance: auto;
  max-width: 100%;
  padding: 0 4px;
  border-radius: 4px;
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: color-mix(in srgb, var(--line) 80%, transparent);
  background: color-mix(in srgb, var(--line) 10%, var(--lcd-bg));
  border: 1px solid color-mix(in srgb, var(--line) 45%, transparent);
}
.select:disabled {
  opacity: 0.5;
}
@container (min-width: 520px) {
  .pads {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-areas: 'grain lfo fx pitch' 'texture echo tone tone';
  }
  .perform {
    height: 150px;
  }
}
</style>
