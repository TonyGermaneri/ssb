<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { activeVoices, buffers, clock, type VoiceInfo } from '../audio/engine'
import { clipBounds, knobRate } from '../audio/timing'
import { GRAIN_FREQ_MAX, grainFreqMin, type GrainEvent } from '../audio/grainMath'
import { computePeaks } from '../audio/peaks'
import { useBoard } from '../stores/board'
import { midiNoteName } from '../lib/format'
import type { Sound } from '../types'

/** seconds a grain stays visible after it ends (a one-sample grain would otherwise never be seen) */
const GRAIN_FADE = 0.35
/** how near (px) an edge has to be to grab it */
const EDGE_PX = 6
const hsl = (h: number, s: number, l: number) => `hsl(${((h % 360) + 360) % 360} ${s}% ${Math.min(95, l)}%)`
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
type Pt = [number, number]

/**
 * Each playing instance's colour: the pad's hue turned by its note's pitch class (a chord's notes differ,
 * the same note always looks the same), or by the order it started in; brighter the harder it was struck.
 */
function voiceColor(info: VoiceInfo, i: number): { hue: number; vel: number } {
  const turn = info.midiNote !== undefined ? (info.midiNote % 12) * 30 : i * 137.5
  return { hue: props.hue + turn, vel: Math.min(1, Math.max(0, info.voice.velocity ?? 1)) }
}

/** width: fixed (the header's VCO scopes), else it follows the container. readonly: a display, no dragging */
const props = defineProps<{ sound: Sound; hue: number; height?: number; width?: number; readonly?: boolean }>()
const board = useBoard()
const wrap = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
/** width follows the container (full-width panels), height is fixed per layout */
const Wr = ref(props.width ?? 386)
const H = props.height ?? 52
/** ISO: the waveform as a wall standing on a floor, the stereo field in depth (left at the back) */
const iso = computed(() => board.master.waveView === 'iso')

const peaks = computed(() => board.peaks.get(props.sound.audioId))
const voices = computed(() => activeVoices.value.filter((v) => v.soundId === props.sound.id))

/**
 * The isometric view's axes: time runs to the right (rising a little), depth (back to front) down to the right at
 * 30°, level up -- sized to the canvas, however wide.
 */
function isoAxes(W: number, Hh: number) {
  const Dy = Hh * 0.21
  const Dx = Dy * 1.73
  const Ty = -Hh * 0.11
  const Ah = Hh * 0.3
  const x0 = Math.max(2, W * 0.02)
  const y0 = Hh * 0.41 + 1.5
  const Tx = W - 2 * x0 - Dx
  return {
    Tx,
    at: (t: number, d: number, a: number): Pt => [x0 + t * Tx + d * Dx, y0 + t * Ty + d * Dy - a * Ah],
    /** the time under a pointer (taken at mid depth) */
    time: (x: number) => (x - x0 - 0.5 * Dx) / Tx,
  }
}

/**
 * The grain's stretch of the sample, as fractions of it: from POS, one grain long (GRAIN's period at ROOT, played at
 * PITCH / FINE), and the clip it sits in.
 */
function grainSpan() {
  const s = props.sound.settings
  const dur = buffers.get(props.sound.audioId)?.duration ?? 0
  if (!s.grain || !(dur > 0)) return null
  const { clipIn, clipLen } = clipBounds(s, dur)
  const a = (clipIn + s.grainPos * clipLen) / dur
  return { a, b: a + knobRate(s) / s.grainFreq / dur, c0: clipIn / dur, c1: (clipIn + clipLen) / dur, dur }
}

/** SPRAY's reach either side of POS, as fractions of the sample */
function sprayReach(at: number) {
  const s = props.sound.settings
  const seconds = buffers.get(props.sound.audioId)?.duration ?? 0
  const half = seconds > 0 ? s.grainSpray / 1000 / seconds : 0
  return { from: s.grainSpraySign === 'right' ? at : at - half, to: s.grainSpraySign === 'left' ? at : at + half }
}

/** each channel's own peaks, per buffer: the ISO view stands a stereo sample's left and right apart */
const sidePeaks = new WeakMap<AudioBuffer, Float32Array[]>()
function channelPeaks(p: Float32Array): Float32Array[] {
  const buf = buffers.get(props.sound.audioId)
  if (!buf || buf.numberOfChannels < 2) return [p]
  let got = sidePeaks.get(buf)
  if (!got) {
    const n = p.length / 2
    got = [0, 1].map((ch) => computePeaks({ numberOfChannels: 1, length: buf.length, getChannelData: () => buf.getChannelData(ch) }, n))
    sidePeaks.set(buf, got)
  }
  return got
}

/** the grains to show now: sounding, or just ended and fading */
function grainsNow(marks: GrainEvent[], now: number) {
  let logSum = 0
  for (const m of marks) logSum += Math.log2(m.rate)
  const base = marks.length ? logSum / marks.length : 0
  const seen = marks.filter((m) => now >= m.when && now <= m.when + m.dur + GRAIN_FADE)
  const sounding = seen.filter((m) => now <= m.when + m.dur).length
  // a dense cloud draws each grain fainter, so it glows rather than whiting out
  const dim = Math.min(1, 2.5 / Math.sqrt(Math.max(1, seen.length)))
  return { base, seen, sounding, dim }
}

function draw() {
  const W = Wr.value
  const c = canvas.value
  const p = peaks.value
  if (!c) return
  const dpr = window.devicePixelRatio || 1
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
    c.width = Math.round(W * dpr)
    c.height = Math.round(H * dpr)
  }
  const g = c.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, W, H)
  if (iso.value) drawIso(g, W, p)
  else draw2d(g, W, p)
}

// ── flat ─────────────────────────────────────────────────────────────────────────

function draw2d(g: CanvasRenderingContext2D, W: number, p: Float32Array | undefined) {
  const th = board.theme
  // grid
  g.strokeStyle = th.success + '18'
  g.lineWidth = 1
  for (let x = 0; x <= W; x += W / 8) {
    g.beginPath()
    g.moveTo(x + 0.5, 0)
    g.lineTo(x + 0.5, H)
    g.stroke()
  }
  g.beginPath()
  g.moveTo(0, H / 2 + 0.5)
  g.lineTo(W, H / 2 + 0.5)
  g.stroke()
  if (!p) return

  const s = props.sound.settings
  const a = Math.min(s.clipIn, s.clipOut) * W
  const b = Math.max(s.clipIn, s.clipOut) * W
  const n = p.length / 2
  const color = `hsl(${props.hue} 100% 62%)`
  for (let i = 0; i < n; i++) {
    const x = (i / n) * W
    const inside = x >= a && x <= b
    g.fillStyle = inside ? color : 'rgba(180,180,180,0.25)'
    const lo = p[i * 2]
    const hi = p[i * 2 + 1]
    const y1 = H / 2 - hi * (H / 2 - 2)
    const y2 = H / 2 - lo * (H / 2 - 2)
    g.fillRect(x, y1, Math.max(1, W / n - 0.3), Math.max(1, y2 - y1))
  }

  // the grain: SPRAY's reach about POS, and the stretch one grain plays from it (drag it: the middle moves POS,
  // its sides set its length)
  const gs = grainSpan()
  if (gs) {
    const spray = sprayReach(gs.a)
    g.fillStyle = th.secondary + '18'
    g.fillRect(spray.from * W, 0, (spray.to - spray.from) * W, H)
    const x0 = gs.a * W
    const x1 = Math.max(x0 + 1, gs.b * W)
    g.fillStyle = th.secondary + '30'
    g.fillRect(x0, 0, x1 - x0, H)
    g.fillStyle = th.secondary + 'cc'
    g.fillRect(x0 - 1, 0, 2, H)
    g.fillRect(x1 - 1, 0, 2, H)
    if (!props.readonly) {
      // grips
      g.fillStyle = th.secondary
      g.fillRect(x0 - 2, H / 2 - 5, 4, 10)
      g.fillRect(x1 - 2, H / 2 - 5, 4, 10)
    }
  }

  // clip markers
  g.fillStyle = th.primary
  g.fillRect(a - 1, 0, 2, H)
  g.fillRect(b - 1, 0, 2, H)
  g.beginPath()
  g.moveTo(a, 0)
  g.lineTo(a + 6, 0)
  g.lineTo(a, 6)
  g.moveTo(b, 0)
  g.lineTo(b - 6, 0)
  g.lineTo(b, 6)
  g.fill()

  const list = voices.value
  if (!list.length) return
  const now = clock.value

  list.forEach((info, i) => {
    const { voice } = info
    const { hue, vel } = voiceColor(info, i)
    const toX = (sec: number) => (sec / voice.bufferDuration) * W
    const marks = voice.marks
    let labelX: number | null = null

    // grains: each over the stretch of sample it plays, at its pan (left up, right down), as tall as it is
    // loud (window level × velocity), its hue turned by its pitch (JITTER), lit while it sounds and fading
    // for a moment after, so even one-sample grains show
    if (marks.length) {
      // light adds up: where grains pile on, the cloud glows; the waveform stays readable under a thin one
      g.globalCompositeOperation = 'lighter'
      const { base, seen, sounding, dim } = grainsNow(marks, now)
      let xs = 0
      for (const m of seen) {
        const end = m.when + m.dur
        const live = now <= end
        const fade = live ? 1 : 1 - (now - end) / GRAIN_FADE
        const x0 = toX(m.pos)
        const w = Math.max(2, toX(m.pos + m.len) - x0)
        const yc = H / 2 + m.pan * (H / 2 - 5)
        const h = Math.max(3, (H - 6) * m.gain * (0.3 + 0.7 * vel))
        const gh = hue + (Math.log2(m.rate) - base) * 12 * 18
        g.globalAlpha = fade * dim * (live ? 0.75 : 0.3)
        g.fillStyle = hsl(gh, 95, m.reverse ? 42 : 45 + 20 * vel)
        g.fillRect(x0, yc - h / 2, w, h)
        if (m.reverse) {
          // reversed: a notch pointing back at the grain's start
          g.fillStyle = hsl(gh, 95, 80)
          g.beginPath()
          g.moveTo(x0 + w, yc - 3)
          g.lineTo(x0 + w - 4, yc)
          g.lineTo(x0 + w, yc + 3)
          g.fill()
        }
        if (live && sounding <= 12 && m.dur > 0.012) {
          // a few long grains: each one's own playhead, sweeping through it
          const phase = (now - m.when) / m.dur
          const head = m.reverse ? x0 + w - w * phase : x0 + w * phase
          g.globalAlpha = 0.8
          g.fillStyle = '#ffffff'
          g.fillRect(head - 0.5, yc - h / 2, 1, h)
        }
        xs += x0 + w / 2
      }
      g.globalAlpha = 1
      g.globalCompositeOperation = 'source-over'
      if (seen.length) labelX = xs / seen.length
    }

    // the transport: tape, stretch and SFZ voices each have one
    const pos = voice.positionAt(now)
    if (pos !== null) {
      const x = toX(pos)
      labelX = x
      g.save()
      g.shadowColor = hsl(hue, 100, 60)
      g.shadowBlur = 8
      g.fillStyle = hsl(hue, 100, 55 + 35 * vel)
      g.fillRect(x - 1, 0, 2, H)
      g.beginPath()
      g.moveTo(x - 4, 0)
      g.lineTo(x + 4, 0)
      g.lineTo(x, 5)
      g.fill()
      g.restore()
    }
    label(g, W, info, i, labelX, hue, vel)
  })
}

/** which instance is which: its note (or number) in its colour, staggered so chords don't collide */
function label(g: CanvasRenderingContext2D, W: number, info: VoiceInfo, i: number, x: number | null, hue: number, vel: number) {
  if (x === null || (voices.value.length < 2 && info.midiNote === undefined)) return
  const text = info.midiNote !== undefined ? midiNoteName(info.midiNote) : `${i + 1}`
  g.font = '10px VT323, monospace'
  const tw = g.measureText(text).width + 4
  const lx = Math.min(W - tw, Math.max(0, x + 3))
  const ly = 6 + (i % (H < 48 ? 2 : 3)) * 10
  g.fillStyle = 'rgba(0,0,0,0.65)'
  g.fillRect(lx, ly, tw, 10)
  g.fillStyle = hsl(hue, 100, 60 + 25 * vel)
  g.fillText(text, lx + 2, ly + 8)
}

// ── isometric ────────────────────────────────────────────────────────────────────

function drawIso(g: CanvasRenderingContext2D, W: number, p: Float32Array | undefined) {
  const th = board.theme
  const { at, Tx } = isoAxes(W, H)
  const poly = (pts: Pt[]) => {
    g.beginPath()
    g.moveTo(pts[0][0], pts[0][1])
    for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1])
    g.closePath()
    g.fill()
  }
  const line = (p0: Pt, p1: Pt) => {
    g.beginPath()
    g.moveTo(p0[0], p0[1])
    g.lineTo(p1[0], p1[1])
    g.stroke()
  }
  /** a stretch of the floor, t0..t1 across its whole depth */
  const floor = (t0: number, t1: number) => poly([at(t0, 0, -1), at(t1, 0, -1), at(t1, 1, -1), at(t0, 1, -1)])

  // the floor's grid
  g.strokeStyle = th.success + '22'
  g.lineWidth = 1
  for (let k = 0; k <= 8; k++) line(at(k / 8, 0, -1), at(k / 8, 1, -1))
  for (const d of [0, 0.5, 1]) line(at(0, d, -1), at(1, d, -1))
  if (!p) return

  const s = props.sound.settings
  const ca = Math.min(s.clipIn, s.clipOut)
  const cb = Math.max(s.clipIn, s.clipOut)
  g.fillStyle = `hsla(${props.hue} 100% 60% / 0.08)`
  floor(ca, cb)

  // the grain's stretch, on the floor (and SPRAY's reach about POS), with posts at its ends
  const gs = grainSpan()
  if (gs) {
    const spray = sprayReach(gs.a)
    g.fillStyle = th.secondary + '18'
    floor(spray.from, spray.to)
    const b = Math.max(gs.b, gs.a + 1 / Tx)
    g.fillStyle = th.secondary + '40'
    floor(gs.a, b)
    g.strokeStyle = th.secondary + 'cc'
    g.lineWidth = 1.5
    for (const t of [gs.a, b]) {
      line(at(t, 0, -1), at(t, 1, -1))
      line(at(t, 1, -1), at(t, 1, 1))
    }
  }

  // the wave: a wall standing on the floor (a stereo sample's left at the back, its right at the front), back face
  // dark, top lit, front bright; each drawn far (late) to near
  const sides = channelPeaks(p)
  const n = p.length / 2
  const cols = Math.max(1, Math.min(n, Math.floor(Tx / 2)))
  const per = n / cols
  sides.forEach((sp, k) => {
    const dc = sides.length > 1 ? (k ? 0.74 : 0.26) : 0.5
    const dB = dc - 0.08
    const dF = dc + 0.08
    for (let j = cols - 1; j >= 0; j--) {
      let lo = Infinity
      let hi = -Infinity
      const i1 = Math.max(Math.floor(j * per) + 1, Math.floor((j + 1) * per))
      for (let i = Math.floor(j * per); i < i1; i++) {
        lo = Math.min(lo, sp[i * 2])
        hi = Math.max(hi, sp[i * 2 + 1])
      }
      hi = Math.max(hi, lo + 0.03)
      const t0 = j / cols
      const t1 = (j + 1) / cols
      const mid = (t0 + t1) / 2
      const inside = mid >= ca && mid <= cb
      g.fillStyle = inside ? hsl(props.hue, 100, 26) : 'rgba(110,110,110,0.2)'
      poly([at(t0, dB, hi), at(t1, dB, hi), at(t1, dB, lo), at(t0, dB, lo)])
      g.fillStyle = inside ? hsl(props.hue, 100, 44) : 'rgba(150,150,150,0.24)'
      poly([at(t0, dB, hi), at(t1, dB, hi), at(t1, dF, hi), at(t0, dF, hi)])
      g.fillStyle = inside ? hsl(props.hue, 100, 62) : 'rgba(180,180,180,0.3)'
      poly([at(t0, dF, hi), at(t1, dF, hi), at(t1, dF, lo), at(t0, dF, lo)])
    }
  })

  // clip markers: posts at the front, a line across the floor, a flag on top
  g.strokeStyle = th.primary
  g.fillStyle = th.primary
  for (const [t, dir] of [[ca, 1], [cb, -1]] as const) {
    g.lineWidth = 1
    line(at(t, 0, -1), at(t, 1, -1))
    g.lineWidth = 2
    line(at(t, 1, -1), at(t, 1, 1))
    const top = at(t, 1, 1)
    poly([top, [top[0] + 6 * dir, top[1]], [top[0], top[1] + 6]])
  }

  const list = voices.value
  if (!list.length) return
  const now = clock.value
  list.forEach((info, i) => {
    const { voice } = info
    const { hue, vel } = voiceColor(info, i)
    const toT = (sec: number) => sec / voice.bufferDuration
    const marks = voice.marks
    let labelX: number | null = null

    // grains: glassy slabs standing on the floor over the stretch each plays, at its side's depth (left at the back,
    // where a stereo sample's left wall is), as tall as it is loud, lit while they sound and fading after
    if (marks.length) {
      g.globalCompositeOperation = 'lighter'
      const { base, seen, sounding, dim } = grainsNow(marks, now)
      let ts = 0
      for (const m of seen) {
        const end = m.when + m.dur
        const live = now <= end
        const fade = live ? 1 : 1 - (now - end) / GRAIN_FADE
        const t0 = toT(m.pos)
        const t1 = Math.max(t0 + 2 / Tx, toT(m.pos + m.len))
        const d = 0.5 + m.pan * 0.48
        const top = -1 + Math.max(0.12, 1.9 * m.gain * (0.3 + 0.7 * vel))
        const gh = hue + (Math.log2(m.rate) - base) * 12 * 18
        g.globalAlpha = fade * dim * (live ? 0.35 : 0.12)
        g.fillStyle = hsl(gh, 95, 50)
        poly([at(t0, d - 0.08, -1), at(t1, d - 0.08, -1), at(t1, d + 0.08, -1), at(t0, d + 0.08, -1)])
        g.globalAlpha = fade * dim * (live ? 0.28 : 0.1)
        g.fillStyle = hsl(gh, 95, m.reverse ? 42 : 45 + 20 * vel)
        poly([at(t0, d, -1), at(t1, d, -1), at(t1, d, top), at(t0, d, top)])
        g.globalAlpha = fade * dim * (live ? 0.9 : 0.35)
        g.strokeStyle = hsl(gh, 95, 70)
        g.lineWidth = 1
        line(at(t0, d, top), at(t1, d, top))
        if (live && sounding <= 12 && m.dur > 0.012) {
          const phase = (now - m.when) / m.dur
          const head = m.reverse ? t1 - (t1 - t0) * phase : t0 + (t1 - t0) * phase
          g.globalAlpha = 0.8
          g.strokeStyle = '#ffffff'
          g.lineWidth = 1
          line(at(head, d, -1), at(head, d, top))
        }
        ts += (t0 + t1) / 2
      }
      g.globalAlpha = 1
      g.globalCompositeOperation = 'source-over'
      if (seen.length) labelX = at(ts / seen.length, 1, 1)[0]
    }

    // the transport: a lit curtain across the floor, its front edge bright
    const pos = voice.positionAt(now)
    if (pos !== null) {
      const t = toT(pos)
      labelX = at(t, 1, 1)[0]
      g.fillStyle = `hsla(${((hue % 360) + 360) % 360} 100% 60% / 0.16)`
      poly([at(t, 0, -1), at(t, 1, -1), at(t, 1, 1), at(t, 0, 1)])
      g.save()
      g.shadowColor = hsl(hue, 100, 60)
      g.shadowBlur = 8
      g.strokeStyle = hsl(hue, 100, 55 + 35 * vel)
      g.lineWidth = 2
      line(at(t, 1, -1), at(t, 1, 1))
      g.restore()
    }
    label(g, W, info, i, labelX, hue, vel)
  })
}

let ro: ResizeObserver | undefined
onMounted(() => {
  if (!props.width) {
    const measure = () => (Wr.value = Math.max(160, wrap.value?.clientWidth ?? 386))
    measure()
    ro = new ResizeObserver(measure)
    if (wrap.value) ro.observe(wrap.value)
  }
  watchEffect(draw)
})
onBeforeUnmount(() => ro?.disconnect())

// ── dragging ─────────────────────────────────────────────────────────────────────
// Without grains: the nearest clip marker. With them: the grain -- its middle moves POS, its sides set its length
// (GRAIN), anywhere else puts it there; shift-drag (or a marker's flag, flat) moves the clip instead.

type Drag =
  | { kind: 'clip'; which: 'clipIn' | 'clipOut' }
  | { kind: 'grain'; part: 'move' | 'left' | 'right'; grab: number; a0: number; b0: number }
let drag: Drag | null = null
const cursor = ref('ew-resize')

function local(e: PointerEvent) {
  const r = canvas.value!.getBoundingClientRect()
  return { x: ((e.clientX - r.left) * Wr.value) / r.width, y: ((e.clientY - r.top) * H) / r.height }
}
/** pixels per whole sample along the time axis */
const pxPerSample = () => (iso.value ? isoAxes(Wr.value, H).Tx : Wr.value)
const timeAt = (x: number) => clamp01(iso.value ? isoAxes(Wr.value, H).time(x) : x / Wr.value)

function hit(e: PointerEvent): Drag {
  const { x, y } = local(e)
  const f = timeAt(x)
  const s = props.sound.settings
  const clip = (): Drag => ({ kind: 'clip', which: Math.abs(f - s.clipIn) <= Math.abs(f - s.clipOut) ? 'clipIn' : 'clipOut' })
  const gs = grainSpan()
  if (!gs || e.shiftKey) return clip()
  const near = EDGE_PX / pxPerSample()
  if (!iso.value && y < 9 && Math.min(Math.abs(f - s.clipIn), Math.abs(f - s.clipOut)) < near) return clip()
  const dl = Math.abs(f - gs.a)
  const dr = Math.abs(f - gs.b)
  if (Math.min(dl, dr) < near) return { kind: 'grain', part: dr <= dl ? 'right' : 'left', grab: f, a0: gs.a, b0: gs.b }
  if (f > gs.a && f < gs.b) return { kind: 'grain', part: 'move', grab: f, a0: gs.a, b0: gs.b }
  // elsewhere: the grain's middle goes to the pointer, and drags on from there
  return { kind: 'grain', part: 'move', grab: (gs.a + gs.b) / 2, a0: gs.a, b0: gs.b }
}

function onDown(e: PointerEvent) {
  if (props.readonly) return
  e.stopPropagation()
  canvas.value!.setPointerCapture(e.pointerId)
  drag = hit(e)
  cursor.value = drag.kind === 'grain' && drag.part === 'move' ? 'grabbing' : 'ew-resize'
  onMove(e)
}

function onMove(e: PointerEvent) {
  if (props.readonly) return
  if (!drag) {
    const h = hit(e)
    cursor.value = h.kind === 'grain' && h.part === 'move' ? 'grab' : 'ew-resize'
    return
  }
  const d = drag
  const s = props.sound.settings
  const f = timeAt(local(e).x)
  if (d.kind === 'clip') {
    if (d.which === 'clipIn') s.clipIn = Math.min(f, s.clipOut - 0.001)
    else s.clipOut = Math.max(f, s.clipIn + 0.001)
    return
  }
  const gs = grainSpan()
  if (!gs) return
  const minSpan = 2 / pxPerSample()
  const setStart = (a: number) => (s.grainPos = clamp01((a - gs.c0) / Math.max(1e-9, gs.c1 - gs.c0)))
  const setSpan = (w: number) => {
    const freq = knobRate(s) / (Math.max(minSpan, w) * gs.dur)
    s.grainFreq = Math.min(GRAIN_FREQ_MAX, Math.max(grainFreqMin(gs.dur), freq))
  }
  if (d.part === 'move') setStart(d.a0 + f - d.grab)
  else if (d.part === 'right') setSpan(f - d.a0)
  else {
    const a = Math.min(f, d.b0 - minSpan)
    setStart(a)
    setSpan(d.b0 - a)
  }
}

function onUp() {
  if (drag?.kind === 'grain' && drag.part === 'move') cursor.value = 'grab'
  drag = null
}

const toggleView = () => (board.master.waveView = iso.value ? '2d' : 'iso')
const tip = computed(() =>
  props.readonly
    ? undefined
    : props.sound.settings.grain
      ? 'Drag the grain: its middle moves POS, its sides set its length (GRAIN) · shift-drag: clip in / out'
      : 'Drag to set clip in / out',
)
</script>

<template>
  <div ref="wrap" class="wf" :style="{ width: props.width ? `${Wr}px` : '100%' }">
    <canvas
      ref="canvas"
      class="waveform"
      :class="{ readonly, iso }"
      :style="{ width: `${Wr}px`, height: `${H}px`, cursor: readonly ? undefined : cursor }"
      :title="tip"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    />
    <button
      v-if="!readonly"
      class="view"
      :title="iso ? 'Isometric view — click for flat' : 'Flat view — click for isometric'"
      @pointerdown.stop
      @click.stop="toggleView"
    >
      {{ iso ? 'ISO' : '2D' }}
    </button>
  </div>
</template>

<style scoped>
.wf {
  position: relative;
  max-width: 100%;
}
.waveform {
  display: block;
  max-width: 100%;
  border-radius: 3px;
  background: radial-gradient(ellipse at center, #0c1a10 0%, #050806 100%);
  box-shadow:
    inset 0 0 12px rgba(0, 0, 0, 0.9),
    inset 0 0 0 1px color-mix(in srgb, var(--c-success) 15%, transparent);
  touch-action: none;
}
.waveform.iso {
  background: radial-gradient(ellipse at 60% 70%, #0f2214 0%, #050806 100%);
}
.waveform.readonly {
  cursor: inherit;
  touch-action: auto;
}
.view {
  position: absolute;
  top: 3px;
  right: 3px;
  padding: 0 4px;
  border-radius: 2px;
  font-family: 'VT323', monospace;
  font-size: 12px;
  line-height: 12px;
  color: var(--c-secondary);
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid #000;
  opacity: 0.75;
}
.view:hover {
  opacity: 1;
}
</style>
