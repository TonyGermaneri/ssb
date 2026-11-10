<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { activeVoices, clock, getBuffer, type VoiceInfo } from '../audio/engine'
import { clipBounds, knobRate } from '../audio/timing'
import { GRAIN_FREQ_MAX, grainFreqMin, type GrainEvent } from '../audio/grainMath'
import { computePeaks } from '../audio/peaks'
import { tableCount, tablePos } from '../audio/wavetable'
import { useBoard } from '../stores/board'
import { midiNoteName } from '../lib/format'
import { ISO_PITCH, ISO_VIEW, type Sound } from '../types'
import LiveView from './LiveView.vue'
import WaveViewPicker from './WaveViewPicker.vue'

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
/**
 * A wavetable played as one (audio/wavetable.ts): in the sample views (2D, ISO) it is always drawn in ISO, its waves
 * stacked back (the first) to front, the one WT and BLEND make lit among them.
 */
const table = computed(() => {
  const s = props.sound.settings
  if (!(s.wtSize > 0) || props.sound.zones?.length) return null
  const buf = getBuffer(props.sound.audioId)
  const count = buf ? tableCount(buf.length, s.wtSize) : 0
  return buf && count >= 1 ? { buf, size: s.wtSize, count } : null
})
/** SCOPE, BARS, SPECTRO: what the voices play, drawn live (LiveView) instead of the sample */
const live = computed(() => !['2d', 'iso'].includes(board.master.waveView))

const peaks = computed(() => board.peaksOf(props.sound.audioId))
const voices = computed(() => activeVoices.value.filter((v) => v.soundId === props.sound.id))

/** what an ISO picture is made of, in floor units: time `lu` long, `lv` deep, a full-scale wave `ah` tall */
interface IsoBox {
  lu: number
  lv: number
  ah: number
}
/** a sample: a long wall on a narrow floor, short as walls are seen from above */
const SAMPLE_BOX: IsoBox = { lu: 1, lv: 0.34, ah: 0.11 }
/** a wavetable: its waves side by side over a deeper floor, each low enough that the ones behind show */
const TABLE_BOX: IsoBox = { lu: 1, lv: 0.8, ah: 0.07 }

/**
 * The ISO camera (board.master.isoView): the floor turned `yaw` about the vertical and seen `pitch` down from level,
 * drawn without perspective (an action RPG's isometric: at 45° / 30° its grid runs 2:1 across the screen both ways),
 * fitted to the canvas whatever the angle. Points are (time 0..1, depth 0..1, level -1..1).
 */
function isoCamera(W: number, Hh: number, box: IsoBox, pad = 3) {
  const { yaw, pitch } = board.master.isoView
  const ry = (yaw * Math.PI) / 180
  const rp = (Math.min(ISO_PITCH[1], Math.max(ISO_PITCH[0], pitch)) * Math.PI) / 180
  const cy = Math.cos(ry)
  const sy = Math.sin(ry)
  const sp = Math.sin(rp)
  const cp = Math.cos(rp)
  const raw = (u: number, v: number, a: number): Pt => {
    const X = (u - 0.5) * box.lu
    const Z = (v - 0.5) * box.lv
    return [X * cy - Z * sy, (X * sy + Z * cy) * sp - a * box.ah * cp]
  }
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const u of [0, 1])
    for (const v of [0, 1])
      for (const a of [-1.1, 1.1]) {
        const [x, y] = raw(u, v, a)
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
        y0 = Math.min(y0, y)
        y1 = Math.max(y1, y)
      }
  const k = Math.min((W - 2 * pad) / Math.max(1e-6, x1 - x0), (Hh - 2 * pad) / Math.max(1e-6, y1 - y0))
  const ox = (W - k * (x1 - x0)) / 2 - k * x0
  const oy = (Hh - k * (y1 - y0)) / 2 - k * y0
  return {
    at: (u: number, v: number, a: number): Pt => {
      const [x, y] = raw(u, v, a)
      return [ox + k * x, oy + k * y]
    },
    /** pixels the whole time axis spans */
    Tx: k * box.lu * Math.hypot(cy, sy * sp),
    /** how near a floor point is to the eye: what's drawn first is the farthest */
    near: (u: number, v: number) => (u - 0.5) * box.lu * sy + (v - 0.5) * box.lv * cy,
  }
}

/**
 * The grain's stretch of the sample, as fractions of it: from POS, one grain long (GRAIN's period at ROOT, played at
 * PITCH / FINE), and the clip it sits in.
 */
function grainSpan() {
  const s = props.sound.settings
  const dur = getBuffer(props.sound.audioId)?.duration ?? 0
  if (!s.grain || !(dur > 0)) return null
  const { clipIn, clipLen } = clipBounds(s, dur)
  const a = (clipIn + s.grainPos * clipLen) / dur
  return { a, b: a + knobRate(s) / s.grainFreq / dur, c0: clipIn / dur, c1: (clipIn + clipLen) / dur, dur }
}

/** SPRAY's reach either side of POS, as fractions of the sample */
function sprayReach(at: number) {
  const s = props.sound.settings
  const seconds = getBuffer(props.sound.audioId)?.duration ?? 0
  const half = seconds > 0 ? s.grainSpray / 1000 / seconds : 0
  return { from: s.grainSpraySign === 'right' ? at : at - half, to: s.grainSpraySign === 'left' ? at : at + half }
}

/** each channel's own peaks, per buffer: the ISO view stands a stereo sample's left and right apart */
const sidePeaks = new WeakMap<AudioBuffer, Float32Array[]>()
function channelPeaks(p: Float32Array): Float32Array[] {
  const buf = getBuffer(props.sound.audioId)
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
  const t = table.value
  if (t) drawTable(g, W, t)
  else if (iso.value) drawIso(g, W, p)
  else draw2d(g, W, p)
}

// ── a wavetable ──────────────────────────────────────────────────────────────────

/**
 * The table's waves side by side on the floor, the first at the back and the last at the front (depth 1 is the first
 * again, as after the last comes the first), drawn far to near, each hiding what's behind it below its line (filled with
 * the screen's own glow), as many as there's room for; WT's wave and the next brighter, and the wave WT + BLEND make lit
 * where it sits between them.
 */
function drawTable(g: CanvasRenderingContext2D, W: number, t: { buf: AudioBuffer; size: number; count: number }) {
  const s = props.sound.settings
  const { at, Tx, near } = isoCamera(W, H, TABLE_BOX)
  const ch = t.buf.getChannelData(0)
  const cols = Math.max(16, Math.min(t.size, Math.floor(Tx / 1.5)))
  // the screen's glow, painted, so a wave's fill hides what's behind it without a seam
  const glow = g.createRadialGradient(W * 0.6, H * 0.7, 0, W * 0.6, H * 0.7, Math.max(W, H) * 0.75)
  glow.addColorStop(0, '#0f2214')
  glow.addColorStop(1, '#050806')
  g.fillStyle = glow
  g.fillRect(0, 0, W, H)
  const wave = (read: (i: number) => number, d: number) => {
    const pts: Pt[] = []
    for (let j = 0; j <= cols; j++) {
      const x = (j / cols) * t.size
      const i0 = Math.min(t.size - 1, Math.floor(x))
      const i1 = i0 + 1 >= t.size ? 0 : i0 + 1
      const v = read(i0) + (read(i1) - read(i0)) * (x - i0)
      pts.push(at(j / cols, d, Math.max(-1.2, Math.min(1.2, v))))
    }
    return pts
  }
  const cycle = (k: number) => (i: number) => ch[k * t.size + i]
  const draw = (pts: Pt[], stroke: string, width: number, hide = true) => {
    if (hide) {
      g.beginPath()
      g.moveTo(pts[0][0], pts[0][1])
      for (const p of pts) g.lineTo(p[0], p[1])
      g.lineTo(pts[pts.length - 1][0], H + 2)
      g.lineTo(pts[0][0], H + 2)
      g.closePath()
      g.fillStyle = glow
      g.fill()
    }
    g.beginPath()
    g.moveTo(pts[0][0], pts[0][1])
    for (const p of pts) g.lineTo(p[0], p[1])
    g.strokeStyle = stroke
    g.lineWidth = width
    g.stroke()
  }
  const p = tablePos(Math.round(s.wt), Math.min(1, Math.max(0, s.wtBlend)), 0, t.count)
  const ia = Math.min(t.count - 1, Math.floor(p))
  const f = p - ia
  const ib = ia + 1 >= t.count ? 0 : ia + 1
  const depth = (k: number) => k / t.count
  // as many waves as there's room for (a line every ~2.5 px across the depth), WT's and the next always among them
  const [dx, dy] = [at(0.5, 1, 0)[0] - at(0.5, 0, 0)[0], at(0.5, 1, 0)[1] - at(0.5, 0, 0)[1]]
  const room = Math.max(4, Math.floor(Math.hypot(dx, dy) / 3.5))
  const every = Math.max(1, Math.ceil(t.count / room))
  const shown = new Set<number>()
  for (let k = 0; k < t.count; k += every) shown.add(k)
  shown.add(ia)
  shown.add(ib)
  const lit = hsl(props.hue, 100, 72)
  // the floor under it
  g.strokeStyle = board.theme.success + '26'
  g.lineWidth = 1
  g.beginPath()
  g.moveTo(...at(0, 0, -1.05))
  for (const [u, v] of [[1, 0], [1, 1], [0, 1], [0, 0]]) g.lineTo(...at(u, v, -1.05))
  g.stroke()
  const blended = (i: number) => ch[ia * t.size + i] + (ch[ib * t.size + i] - ch[ia * t.size + i]) * f
  const litDepth = (ia + f) / t.count
  // far to near: the depth axis may point away, turned round
  const toward = near(0.5, 1) >= near(0.5, 0) ? 1 : -1
  const items: { d: number; paint: () => void }[] = [...shown].map((k) => ({
    d: depth(k),
    paint: () => {
      const close = k === ia || k === ib
      // bright enough to read on the dark screen, the far ones a little dimmer (depth), WT's and the next brighter still
      const toEye = toward > 0 ? k / t.count : 1 - k / t.count
      draw(wave(cycle(k), depth(k)), close ? hsl(props.hue, 100, 64) : hsl(props.hue, 85, 40 + 16 * toEye), close ? 1.6 : 1.25)
    },
  }))
  items.push({ d: litDepth + 1e-9 * toward, paint: () => draw(wave(blended, litDepth), lit, 2.4) })
  for (const it of items.sort((a, b) => (a.d - b.d) * toward)) it.paint()
  // and seen through what's in front of it, faintly: where it is in the table always shows
  g.save()
  g.globalAlpha = 0.5
  g.shadowColor = lit
  g.shadowBlur = 4
  draw(wave(blended, litDepth), lit, 1.4, false)
  g.restore()
  // which wave, when there's room to say: on a plate, over the back of the table
  if (H >= 44) {
    const text = `WT ${ia + 1}${f > 0 ? `→${ib + 1} ${Math.round(f * 100)}%` : ''} / ${t.count}`
    g.font = '11px VT323, monospace'
    g.fillStyle = 'rgba(0,0,0,0.6)'
    g.fillRect(2, 2, g.measureText(text).width + 6, 11)
    g.fillStyle = board.theme.text[0]
    g.globalAlpha = 0.85
    g.fillText(text, 5, 11)
    g.globalAlpha = 1
  }
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
  const { at, Tx, near } = isoCamera(W, H, SAMPLE_BOX)
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

  // the wave: a wall standing on the floor (a stereo sample's left at the back, its right at the front), the face away
  // dark, top lit, the face toward the eye bright; each drawn far to near (which end is far follows the camera)
  const sides = channelPeaks(p)
  const n = p.length / 2
  const cols = Math.max(1, Math.min(n, Math.floor(Tx / 2)))
  const per = n / cols
  const lateNear = near(1, 0.5) >= near(0, 0.5)
  const backAway = near(0.5, 1) >= near(0.5, 0)
  const sideOrder = sides.map((sp, k) => ({ sp, dc: sides.length > 1 ? (k ? 0.74 : 0.26) : 0.5 })).sort((a, b) => (backAway ? a.dc - b.dc : b.dc - a.dc))
  sideOrder.forEach(({ sp, dc }) => {
    const dB = backAway ? dc - 0.08 : dc + 0.08
    const dF = backAway ? dc + 0.08 : dc - 0.08
    for (let jj = 0; jj < cols; jj++) {
      const j = lateNear ? jj : cols - 1 - jj
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
// the canvas comes and goes with the view (the live ones are LiveView's): measure whichever is showing
watch(
  wrap,
  (el) => {
    ro?.disconnect()
    if (props.width || !el) return
    const measure = () => (Wr.value = Math.max(80, el.clientWidth || 386))
    measure()
    ro = new ResizeObserver(measure)
    ro.observe(el)
  },
  { flush: 'post' },
)
onMounted(() => watchEffect(draw))
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
const pxPerSample = () => Wr.value
const timeAt = (x: number) => clamp01(x / Wr.value)
/** ISO (and every wavetable): a drag turns the camera -- across its yaw, up and down its pitch; a double-click resets it */
const turning = computed(() => iso.value || !!table.value)

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

let turn: { x: number; y: number; yaw: number; pitch: number } | null = null
function turnTo(e: PointerEvent) {
  if (!turn) return
  const v = board.master.isoView
  v.yaw = Math.round((((turn.yaw + (e.clientX - turn.x) * 0.6 + 180) % 360) + 360) % 360) - 180
  v.pitch = Math.round(Math.min(ISO_PITCH[1], Math.max(ISO_PITCH[0], turn.pitch + (e.clientY - turn.y) * 0.4)))
}
function resetTurn() {
  if (props.readonly || !turning.value) return
  board.master.isoView = { ...ISO_VIEW }
}

function onDown(e: PointerEvent) {
  if (props.readonly) return
  e.stopPropagation()
  canvas.value!.setPointerCapture(e.pointerId)
  if (turning.value) {
    const v = board.master.isoView
    turn = { x: e.clientX, y: e.clientY, yaw: v.yaw, pitch: v.pitch }
    cursor.value = 'grabbing'
    return
  }
  drag = hit(e)
  cursor.value = drag.kind === 'grain' && drag.part === 'move' ? 'grabbing' : 'ew-resize'
  onMove(e)
}

function onMove(e: PointerEvent) {
  if (props.readonly) return
  if (turning.value) {
    if (turn) turnTo(e)
    else cursor.value = 'grab'
    return
  }
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
  if (turn) cursor.value = 'grab'
  turn = null
  if (drag?.kind === 'grain' && drag.part === 'move') cursor.value = 'grab'
  drag = null
}

const tip = computed(() =>
  props.readonly
    ? undefined
    : table.value
      ? 'The wavetable, its first wave at the back and the one WT and WT BLEND make lit · drag to turn the view (across: around, up and down: how far it looks down) · double-click: back to the start'
      : iso.value
        ? 'Drag to turn the view (across: around, up and down: how far it looks down) · double-click: back to the start · the 2D view drags the clip and the grain'
      : props.sound.settings.grain
      ? 'Drag the grain: its middle moves POS, its sides set its length (GRAIN) · shift-drag: clip in / out'
      : 'Drag to set clip in / out',
)
</script>

<template>
  <LiveView v-if="live" :sound="sound" :hue="hue" :height="H" :width="props.width" :readonly="readonly" />
  <div v-else ref="wrap" class="wf" :style="{ width: props.width ? `${Wr}px` : '100%' }">
    <canvas
      ref="canvas"
      class="waveform"
      :class="{ readonly, iso: iso || !!table }"
      :style="{ width: `${Wr}px`, height: `${H}px`, cursor: readonly ? undefined : cursor }"
      :title="tip"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @dblclick="resetTurn"
    />
    <WaveViewPicker v-if="!readonly" class="view" />
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
}
</style>
