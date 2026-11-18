<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { activeVoices, clock, getBuffer, readSound, SCOPE_SAMPLES, soundSounding, watchSound } from '../audio/engine'
import { useBoard } from '../stores/board'
import { lfoHz, type Sound } from '../types'
import { echoDivisions, GRAIN_SYNC_BANDS, SYNC_TOP, type Point } from '../lib/play/pads'
import { lfoRouteOf, PAD_IDS, padControl, type PadId } from '../lib/play/padControl'
import { lfoAt, type PadLfo } from '../lib/play/padLfo'
import {
  crosshair, drawClip, drawLfoFx, type Ripple, type Spark, drawEcho, drawFx, drawGrain, drawLfo, drawPerformOverlay, drawPitch, drawSyncBands, drawTexture, drawTone,
  grainLit, lfoOffset, lfoSwing, type Colors, type GrainDot,
} from '../lib/play/draw'
import { pitchMultiplier } from '../lib/play/pads'
import { AudioFeed, registerVco, shaderPrefs, stageStatus, type PadKind, type StagePad } from '../lib/play/shaders'
import { waveMorph } from '../lib/waveMorph'
import PadSettings from './PadSettings.vue'
import PadLfoPanel from './PadLfoPanel.vue'
import LiveView from './LiveView.vue'
import PlayPad from './PlayPad.vue'
import GardenPad from './GardenPad.vue'
import { useGarden } from '../stores/garden'
import WaveViewPicker from './WaveViewPicker.vue'

/**
 * A VCO slot's Play view: the clip big, played by dragging where the grains fire (left / right) and how loud (up /
 * down), and seven pads -- GRAIN, LFO, FILTER · REVERB, PITCH · RING, TEXTURE, ECHO, TONE (lib/play/pads.ts says what each axis does; draw.ts
 * how each looks) -- with the GARDEN pad beside TONE (GardenPad.vue: the VCO's prompt garden, its rings' steps and
 * hits on X / Y). Each pad's automation button turns on its LFO (PadLfoPanel.vue: a shape its point traces), its GROW button its walk with the garden's clips. Everything here is the layer's own settings: the knobs show the same. Behind them all, the shader
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

// ── the pads as controls (lib/play/padControl.ts: the VOYAGE ship's parts are the same) ──
const pads = padControl({ sound: () => props.sound, bpm: () => board.bpm, changed: () => kick() })
const { tableOf, durationNow, moved, ended, reset } = pads
const garden = useGarden()
/**
 * Where a pad's crosshair is drawn: where its settings put it -- or, while its LFO moves it, where the LFO is along
 * its shape, gliding, though the settings it writes snap (the LFO pad's tempo divisions, the echo's, a scale's notes).
 */
const pointOf = (id: PadId, r?: Settings) => garden.lfoNow(props.slot, id) ?? pads.pointOf(id, r)
/** a pad's LFO is moving it: the pictures follow it every frame */
const lfoMoving = () => PAD_IDS.some((id) => garden.lfoDrives(props.slot, id))

/** min / max per column of the clip, for the big view (cached by what it depends on) */
let clipCache: { key: string; peaks: Float32Array } | null = null
const clipMorph = waveMorph()
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
    trace('grain', g, w, h, dpr)
    cross('grain', g, w, h, at, dpr)
  },
  lfo: (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => {
    const r = raw()
    drawLfo(g, w, h, { lfo: r.mod.lfo2, ...lfoRouteOf(r), bpm: board.bpm, now: frozen, colors: colors.value, dpr })
    trace('lfo', g, w, h, dpr)
    cross('lfo', g, w, h, pointOf('lfo', r), dpr)
  },
  fx: (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => {
    const r = raw()
    drawFx(g, w, h, { s: r, colors: colors.value, dpr })
    trace('fx', g, w, h, dpr)
    cross('fx', g, w, h, pointOf('fx', r), dpr)
  },
  pitch: (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => {
    const r = raw()
    const at = pointOf('pitch', r)
    drawPitch(g, w, h, { at, ring: r.ringMix ?? 0, tick: pitchTick, colors: colors.value, dpr })
    trace('pitch', g, w, h, dpr)
    cross('pitch', g, w, h, at, dpr)
  },
  texture: (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => {
    const at = pointOf('texture', raw())
    drawTexture(g, w, h, { at, t: frozen, colors: colors.value, dpr })
    trace('texture', g, w, h, dpr)
    cross('texture', g, w, h, at, dpr)
  },
  echo: (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => {
    const r = raw()
    const at = pointOf('echo', r)
    const divs = echoDivisions(board.bpm)
    const lit = divs.findIndex((d) => Math.abs(d.seconds - r.delayTime) < 1e-3)
    drawEcho(g, w, h, { at, feedback: r.delayFeedback, mix: r.delayMix, divisions: divs.map((d) => d.x), lit, colors: colors.value, dpr })
    trace('echo', g, w, h, dpr)
    cross('echo', g, w, h, at, dpr)
  },
  tone: (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => {
    const r = raw()
    drawTone(g, w, h, { s: r, colors: colors.value, dpr })
    trace('tone', g, w, h, dpr)
    cross('tone', g, w, h, pointOf('tone', r), dpr)
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
  const p = `${at.x.toFixed(4)},${at.y.toFixed(4)}|${colors.value.line}|${traceLooks(id)}`
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
  // grains move every frame while it plays; a wave morphing in, every frame till it's through
  if (sounding.value) return `${clock.value}`
  if (clipMorph.moving()) return `morph${performance.now()}`
  const at = pointOf('perform', r)
  const lfo = lfoRouteOf(r)
  return `${at.x},${at.y}|${traceLooks('perform')}|${live.value}|${props.sound.audioId}|${r.clipIn}|${r.clipOut}|${r.wt}|${r.wtBlend}|${lfo.amount}|${lfo.unipolar}|${r.grainPos}|${performSize.value.w}x${performSize.value.h}|${colors.value.line}`
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
  // a new wave in (a stitch, a catch): the old clip's outline morphs into it (lib/waveMorph.ts)
  if (!live.value) drawClip(g, w, h, clipMorph.at(props.sound.audioId, clipPeaks(Math.min(1200, Math.round(performSize.value.w)))) ?? null, colors.value)
  const lfo = lfoRouteOf(r)
  // (a table's grains play its wave, not where they'd sit in the whole table: no grains or firing point drawn)
  const table = !!tableOf()
  drawPerformOverlay(g, w, h, {
    at: pointOf('perform', r),
    fireX: lfo.amount > 0 && !table ? clamp01(r.grainPos + lfoOffset(r.mod.lfo2, lfo.amount, board.bpm, frozen, lfo.unipolar)) : null,
    grains: table ? [] : grainDots(clock.value),
    colors: colors.value,
    dpr,
    crossAlpha: crossAlpha('perform'),
  })
  trace('perform', g, w, h, dpr)
}

// one loop: the pointers' latest moves go in, then the pictures that changed repaint -- every frame while the sound
// plays or a pad was touched lately, else once whenever something changes
let raf = 0
let visible = true
function tick() {
  raf = 0
  pads.flush()
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
  if (visible && (sounding.value || pads.sinceTouch() < 1500 || pads.isHeld() || clipMorph.moving() || lfoMoving())) raf = requestAnimationFrame(tick)
}
function kick() {
  if (!raf && visible) raf = requestAnimationFrame(tick)
}
watch(() => [board.changes, board.modulations, board.bpm, board.master.waveView, sounding.value, props.slot, props.sound.id, props.sound.audioId], kick)

// ── the big view as a pad ──
let performBox: DOMRect | null = null
const performPointAt = (e: PointerEvent): Point => {
  const r = performBox!
  return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01(1 - (e.clientY - r.top) / r.height) }
}
function performDown(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  performBox = perform.value!.getBoundingClientRect()
  padMove('perform', performPointAt(e))
}
function performMove(e: PointerEvent) {
  if (performBox && (e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) padMove('perform', performPointAt(e))
}
function performUp() {
  if (!performBox) return
  performBox = null
  padEnd('perform')
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

// ── each pad's GROW button: it walks with the garden's clips (its LFO's centre, with one on) ──
const growsPad = (id: PadId) => garden.growsPad(props.slot, id)
const toggleGrowPad = (id: PadId) => garden.toggleGrowPad(props.slot, id)

// ── each pad's automation: its LFO (lib/play/padLfo.ts, run by the garden store) ──
/** whose LFO panel is open on its pad (one at a time) */
const lfoOpen = ref<PadId | null>(null)
const autoOn = (id: PadId) => !!garden.lfoOf(props.slot, id)
/** the button: on (a circle round where the pad is) if it's off, and its panel open */
function autoClick(id: PadId) {
  if (!autoOn(id)) garden.startLfo(props.slot, id)
  lfoOpen.value = id
  kick()
}
/** a right-click on it: on or off, without its panel (off closes it) */
function autoToggle(id: PadId) {
  if (autoOn(id)) {
    garden.stopLfo(props.slot, id)
    if (lfoOpen.value === id) lfoOpen.value = null
  } else garden.startLfo(props.slot, id)
  kick()
}
/** a drag on a pad whose LFO moves it moves the shape's centre instead */
function padMove(id: PadId, p: Point) {
  touchedAt.set(id, performance.now())
  if (garden.lfoDrives(props.slot, id)) {
    garden.setLfoCenter(props.slot, id, p)
    kick()
  } else moved(id, p)
}
function padEnd(id: PadId) {
  if (!garden.lfoDrives(props.slot, id)) ended(id)
}
function padReset(id: PadId) {
  reset(id)
  if (garden.lfoDrives(props.slot, id)) garden.setLfoCenter(props.slot, id, pads.pointOf(id))
}
// ── a pad's LFO in the picture (draw.ts drawLfoFx): its comet, its sparks and ripples; its guides only while you're at it ──
interface LfoFx {
  sparks: Spark[]
  ripples: Ripple[]
  last: number
  head: { x: number; y: number } | null
  /** the setting's point last frame (a snapping pad: a ripple when it steps) */
  snapped: string
  emit: number
  /** when the last ripple went out */
  rippled: number
  /** the guides (crosshair, path, centre): 1 while you're at it, fading to 0 after */
  ui: number
}
const lfoFx = new Map<PadId, LfoFx>()
/** the pad under the pointer, and when each was last dragged */
const hoverPad = ref<PadId | null>(null)
const touchedAt = new Map<PadId, number>()
/** a pad its LFO moves, left alone: its bright buttons dim (they come back under the pointer) */
const quiet = (id: PadId) => autoOn(id) && hoverPad.value !== id && lfoOpen.value !== id
const atIt = (id: PadId) => hoverPad.value === id || lfoOpen.value === id || performance.now() - (touchedAt.get(id) ?? -1e9) < 1500
/** how much of a pad's crosshair shows: all of it, unless its LFO moves it and no one's at it */
const crossAlpha = (id: PadId) => (garden.lfoDrives(props.slot, id) ? (lfoFx.get(id)?.ui ?? 1) : 1)
function cross(id: PadId, g: CanvasRenderingContext2D, w: number, h: number, at: Point, dpr: number) {
  const k = crossAlpha(id)
  if (k < 0.02) return
  g.globalAlpha = k
  crosshair(g, w, h, at, colors.value, dpr)
  g.globalAlpha = 1
}
const rand = (a: number, b: number) => a + Math.random() * (b - a)
function spark(f: LfoFx, x: number, y: number, l: PadLfo, speed: number) {
  // thrown outward, away from the centre, with a scatter
  const a = Math.atan2(y - l.cy, x - l.cx) + rand(-0.9, 0.9)
  const v = rand(0.05, 0.18) + speed * 0.15
  const span = rand(0.45, 1.1)
  f.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, span, size: rand(0.8, 2.2) })
}
/** a frame of a pad's LFO: its sparks and ripples moved on, new ones thrown, then drawn over its picture */
function trace(id: PadId, g: CanvasRenderingContext2D, w: number, h: number, dpr: number) {
  const l = garden.lfoOf(props.slot, id)
  if (!l) {
    lfoFx.delete(id)
    return
  }
  let f = lfoFx.get(id)
  if (!f) lfoFx.set(id, (f = { sparks: [], ripples: [], last: performance.now(), head: null, snapped: '', emit: 0, rippled: 0, ui: 1 }))
  const now = performance.now()
  const dt = Math.min(0.1, Math.max(0, (now - f.last) / 1000))
  f.last = now
  f.ui += ((atIt(id) ? 1 : 0) - f.ui) * Math.min(1, dt * (atIt(id) ? 10 : 2.5))
  const phase = garden.lfoPhaseOf(props.slot, id)
  const head = lfoAt(l, phase)
  const speed = f.head && dt > 0 ? Math.hypot(head.x - f.head.x, head.y - f.head.y) / dt : 0
  f.head = head
  // sparks: a few always, more the faster it goes
  f.emit += dt * Math.min(90, 10 + speed * 70)
  for (; f.emit >= 1; f.emit--) if (f.sparks.length < 120) spark(f, head.x, head.y, l, speed)
  // a snapping pad's setting stepping: a ripple there, and a burst
  const at = pads.pointOf(id)
  const key = `${at.x.toFixed(3)},${at.y.toFixed(3)}`
  // (one every 180 ms at most: a pad that steps often -- TONE's half dBs -- would fill with rings)
  if (f.snapped && key !== f.snapped && now - f.rippled > 180 && f.ripples.length < 4) {
    f.rippled = now
    f.ripples.push({ x: at.x, y: at.y, age: 0 })
    for (let i = 0; i < 4; i++) spark(f, at.x, at.y, l, 0.4)
  }
  f.snapped = key
  for (const s of f.sparks) {
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.vx *= 1 - 1.5 * dt
    s.vy *= 1 - 1.5 * dt
    s.life -= dt / s.span
  }
  f.sparks = f.sparks.filter((s) => s.life > 0)
  for (const r of f.ripples) r.age += dt / 0.7
  f.ripples = f.ripples.filter((r) => r.age < 1)
  drawLfoFx(g, w, h, { at: (p) => lfoAt(l, p), phase, color: colors.value.line, ui: f.ui, center: { x: l.cx, y: l.cy }, sparks: f.sparks, ripples: f.ripples, dpr })
}
/** what the trace shows, as text (a pad repaints when it changes; a running LFO changes every frame) */
function traceLooks(id: PadId): string {
  const l = garden.lfoOf(props.slot, id)
  return l ? `${garden.lfoPhaseOf(props.slot, id)}|${l.shape}|${l.aspect}|${l.amp}|${l.cx}|${l.cy}|${hoverPad.value === id}|${lfoOpen.value === id}` : ''
}
</script>

<template>
  <div ref="root" class="play" :style="{ '--line': colors.line, '--cross': colors.cross }" @pointerdown.stop @click.stop>
    <div class="main">
      <div
        ref="perform"
        class="perform"
        :class="{ quiet: quiet('perform') }"
        @pointerenter="hoverPad = 'perform'"
        @pointerleave="hoverPad === 'perform' && (hoverPad = null)"
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
        <button
          class="perform-grow"
          :class="{ on: growsPad('perform') }"
          :aria-pressed="growsPad('perform')"
          :title="growsPad('perform') ? 'GROW on: each new clip from the garden walks where the grains fire and how loud somewhere new (with an LFO on, its centre) — click to hold it still' : 'GROW: each new clip from the garden walks where the grains fire and how loud somewhere new (with an LFO on, its centre)'"
          @pointerdown.stop
          @click.stop="toggleGrowPad('perform')"
        >
          <v-icon size="11" icon="mdi-sprout" />
        </button>
        <button
          class="perform-auto"
          :class="{ on: autoOn('perform') }"
          :aria-pressed="autoOn('perform')"
          :title="autoOn('perform') ? 'LFO on: where the grains fire and how loud trace its shape — click for its panel, right-click to turn it off' : 'LFO: a shape traced round where the grains fire and how loud — click to turn it on and open its panel, right-click to turn it on'"
          @pointerdown.stop
          @click.stop="autoClick('perform')"
          @contextmenu.prevent.stop="autoToggle('perform')"
        >
          <v-icon size="11" icon="mdi-chart-timeline-variant" />
        </button>
        <button class="perform-gear" :class="{ on: performSettings }" title="Settings: stereo phase, the sample's tuning, the shader" @pointerdown.stop @click.stop="performSettings = !performSettings">
          <v-icon size="12" icon="mdi-cog" />
        </button>
        <PadLfoPanel v-if="lfoOpen === 'perform'" class="perform-lfo" :slot="slot" pad="perform" @close="lfoOpen = null" />
        <div v-if="performSettings" class="perform-settings" @pointerdown.stop @click.stop>
          <PadSettings kind="perform" :sound="sound" :slot="slot" :pads="pads" @changed="kick" />
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
          :grows="growsPad('grain')"
          @grow="toggleGrowPad('grain')"
          :auto="autoOn('grain')"
          :quiet="quiet('grain')"
          @pointerenter="hoverPad = 'grain'"
          @pointerleave="hoverPad === 'grain' && (hoverPad = null)"
          :lfo-open="lfoOpen === 'grain'"
          @auto="autoClick('grain')"
          @auto-toggle="autoToggle('grain')"
          @move="(p: Point) => padMove('grain', p)"
          @end="padEnd('grain')"
          @reset="padReset('grain')"
        >
          <template #lfo>
            <PadLfoPanel :slot="slot" pad="grain" @close="lfoOpen = null" />
          </template>
          <template #settings>
            <PadSettings kind="grain" :sound="sound" :slot="slot" :pads="pads" @changed="kick" />
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
          :grows="growsPad('lfo')"
          @grow="toggleGrowPad('lfo')"
          :auto="autoOn('lfo')"
          :quiet="quiet('lfo')"
          @pointerenter="hoverPad = 'lfo'"
          @pointerleave="hoverPad === 'lfo' && (hoverPad = null)"
          :lfo-open="lfoOpen === 'lfo'"
          @auto="autoClick('lfo')"
          @auto-toggle="autoToggle('lfo')"
          @move="(p: Point) => padMove('lfo', p)"
          @end="padEnd('lfo')"
          @reset="padReset('lfo')"
        >
          <template #lfo>
            <PadLfoPanel :slot="slot" pad="lfo" @close="lfoOpen = null" />
          </template>
          <template #settings>
            <PadSettings kind="lfo" :sound="sound" :slot="slot" :pads="pads" @changed="kick" />
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
          :grows="growsPad('fx')"
          @grow="toggleGrowPad('fx')"
          :auto="autoOn('fx')"
          :quiet="quiet('fx')"
          @pointerenter="hoverPad = 'fx'"
          @pointerleave="hoverPad === 'fx' && (hoverPad = null)"
          :lfo-open="lfoOpen === 'fx'"
          @auto="autoClick('fx')"
          @auto-toggle="autoToggle('fx')"
          @move="(p: Point) => padMove('fx', p)"
          @end="padEnd('fx')"
          @reset="padReset('fx')"
        >
          <template #lfo>
            <PadLfoPanel :slot="slot" pad="fx" @close="lfoOpen = null" />
          </template>
          <template #settings>
            <PadSettings kind="fx" :sound="sound" :slot="slot" :pads="pads" @changed="kick" />
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
          :grows="growsPad('pitch')"
          @grow="toggleGrowPad('pitch')"
          :auto="autoOn('pitch')"
          :quiet="quiet('pitch')"
          @pointerenter="hoverPad = 'pitch'"
          @pointerleave="hoverPad === 'pitch' && (hoverPad = null)"
          :lfo-open="lfoOpen === 'pitch'"
          @auto="autoClick('pitch')"
          @auto-toggle="autoToggle('pitch')"
          @move="(p: Point) => padMove('pitch', p)"
          @end="padEnd('pitch')"
          @reset="padReset('pitch')"
        >
          <template #lfo>
            <PadLfoPanel :slot="slot" pad="pitch" @close="lfoOpen = null" />
          </template>
          <template #settings>
            <PadSettings kind="pitch" :sound="sound" :slot="slot" :pads="pads" @changed="kick" />
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
          :grows="growsPad('texture')"
          @grow="toggleGrowPad('texture')"
          :auto="autoOn('texture')"
          :quiet="quiet('texture')"
          @pointerenter="hoverPad = 'texture'"
          @pointerleave="hoverPad === 'texture' && (hoverPad = null)"
          :lfo-open="lfoOpen === 'texture'"
          @auto="autoClick('texture')"
          @auto-toggle="autoToggle('texture')"
          @move="(p: Point) => padMove('texture', p)"
          @end="padEnd('texture')"
          @reset="padReset('texture')"
        >
          <template #lfo>
            <PadLfoPanel :slot="slot" pad="texture" @close="lfoOpen = null" />
          </template>
          <template #settings>
            <PadSettings kind="texture" :sound="sound" :slot="slot" :pads="pads" @changed="kick" />
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
          :grows="growsPad('echo')"
          @grow="toggleGrowPad('echo')"
          :auto="autoOn('echo')"
          :quiet="quiet('echo')"
          @pointerenter="hoverPad = 'echo'"
          @pointerleave="hoverPad === 'echo' && (hoverPad = null)"
          :lfo-open="lfoOpen === 'echo'"
          @auto="autoClick('echo')"
          @auto-toggle="autoToggle('echo')"
          @move="(p: Point) => padMove('echo', p)"
          @end="padEnd('echo')"
          @reset="padReset('echo')"
        >
          <template #lfo>
            <PadLfoPanel :slot="slot" pad="echo" @close="lfoOpen = null" />
          </template>
          <template #settings>
            <PadSettings kind="echo" :sound="sound" :slot="slot" :pads="pads" @changed="kick" />
          </template>
        </PlayPad>
        <PlayPad
          ref="tonePad"
          label="TONE"
          class="a-tone"
          title="TONE — this VCO's EQ: left / right tilts it darker (more bass, less treble) or brighter, up / down pushes or scoops the mids; flat in the middle. Double-click: flat"
          :color="colors.line"
          :draw="drawers.tone"
          :grows="growsPad('tone')"
          @grow="toggleGrowPad('tone')"
          :auto="autoOn('tone')"
          :quiet="quiet('tone')"
          @pointerenter="hoverPad = 'tone'"
          @pointerleave="hoverPad === 'tone' && (hoverPad = null)"
          :lfo-open="lfoOpen === 'tone'"
          @auto="autoClick('tone')"
          @auto-toggle="autoToggle('tone')"
          @move="(p: Point) => padMove('tone', p)"
          @end="padEnd('tone')"
          @reset="padReset('tone')"
        >
          <template #lfo>
            <PadLfoPanel :slot="slot" pad="tone" @close="lfoOpen = null" />
          </template>
          <template #settings>
            <PadSettings kind="tone" :sound="sound" :slot="slot" :pads="pads" @changed="kick" />
          </template>
        </PlayPad>
        <GardenPad class="a-garden" :slot="slot" :colors="colors" />
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
  /* it fills its column; the pads are laid out by its shape (below), stretched to fit, never past it */
  container-type: size;
  min-height: 0;
  overflow: hidden;
}
.chips {
  position: absolute;
  top: 5px;
  left: 5px;
  right: 64px;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.chip {
  white-space: nowrap;
}
/* a narrow clip view (pads in a row beside it): the chips smaller */
@container (min-aspect-ratio: 2 / 1) {
  .chip {
    padding: 1px 5px;
    font-size: 7px;
    letter-spacing: 0.08em;
  }
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
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.perform {
  position: relative;
  flex: 1 1 0;
  min-height: 48px;
  max-height: 220px;
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
  flex: 3.2 1 0;
  min-height: 0;
  display: grid;
  /* tall: two by four */
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(4, minmax(0, 1fr));
  grid-template-areas: 'grain lfo' 'fx pitch' 'texture echo' 'tone garden';
  gap: 8px;
}
/* the pads take the cells they're given: a little stretched rather than squeezed out of view */
.pads :deep(.pad),
.pads :deep(.pad.square) {
  aspect-ratio: auto;
  min-height: 0;
}
.a-grain { grid-area: grain; }
.a-lfo { grid-area: lfo; }
.a-fx { grid-area: fx; }
.a-pitch { grid-area: pitch; }
.a-texture { grid-area: texture; }
.a-echo { grid-area: echo; }
.a-tone { grid-area: tone; }
/* the GARDEN pad: the other half of the row TONE once had to itself */
.a-garden { grid-area: garden; }
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
.perform-auto {
  position: absolute;
  right: 26px;
  bottom: 4px;
  z-index: 4;
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
.perform-grow {
  position: absolute;
  right: 47px;
  bottom: 4px;
  z-index: 4;
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
.perform-auto:hover {
  opacity: 1;
}
.perform-grow:hover {
  opacity: 1;
}
.perform-auto.on {
  opacity: 1;
  color: #05030a;
  background: #7dff6a;
  border-color: #7dff6a;
  box-shadow: 0 0 6px rgba(125, 255, 106, 0.6);
}
.perform-grow.on {
  opacity: 1;
  color: #05030a;
  background: #7dff6a;
  border-color: #7dff6a;
  box-shadow: 0 0 6px rgba(125, 255, 106, 0.6);
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
/* squarish: four by two */
@container (min-aspect-ratio: 3 / 4) {
  .pads {
    flex-grow: 2.4;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    grid-template-areas: 'grain lfo fx pitch' 'texture echo tone garden';
  }
}
/* wide (a column of a stacked rack): the clip beside a single row of all eight */
@container (min-aspect-ratio: 2 / 1) {
  .main {
    flex-direction: row;
  }
  .perform {
    flex: 1.3 1 0;
    max-height: none;
    min-width: 120px;
  }
  .pads {
    flex: 6 1 0;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    grid-template-rows: minmax(0, 1fr);
    grid-template-areas: 'grain lfo fx pitch texture echo tone garden';
  }
}
.perform .perform-auto,
.perform .perform-grow {
  transition: opacity 0.6s, box-shadow 0.6s;
}
.perform.quiet .perform-auto.on,
.perform.quiet .perform-grow.on {
  opacity: 0.14;
  box-shadow: none;
}
</style>
