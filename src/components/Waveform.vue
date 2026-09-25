<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { activeVoices, clock, type VoiceInfo } from '../audio/engine'
import { useBoard } from '../stores/board'
import { midiNoteName } from '../lib/format'
import type { Sound } from '../types'

/** seconds a grain stays visible after it ends (a one-sample grain would otherwise never be seen) */
const GRAIN_FADE = 0.35
const hsl = (h: number, s: number, l: number) => `hsl(${((h % 360) + 360) % 360} ${s}% ${Math.min(95, l)}%)`

/**
 * Each playing instance's colour: the pad's hue turned by its note's pitch class (a chord's notes differ,
 * the same note always looks the same), or by the order it started in; brighter the harder it was struck.
 */
function voiceColor(info: VoiceInfo, i: number): { hue: number; vel: number } {
  const turn = info.midiNote !== undefined ? (info.midiNote % 12) * 30 : i * 137.5
  return { hue: props.hue + turn, vel: Math.min(1, Math.max(0, info.voice.velocity ?? 1)) }
}

const props = defineProps<{ sound: Sound; hue: number; height?: number }>()
const board = useBoard()
const canvas = ref<HTMLCanvasElement>()
/** width follows the container (full-width panels), height is fixed per layout */
const Wr = ref(386)
const H = props.height ?? 52

const peaks = computed(() => board.peaks.get(props.sound.audioId))
const voices = computed(() => activeVoices.value.filter((v) => v.soundId === props.sound.id))

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
  const th = board.theme
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, W, H)

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

  // grain cloud: where POS sends grains, and how far SPRAY scatters them
  if (s.grain) {
    const clipW = b - a
    const cx = a + s.grainPos * clipW
    const half = (s.grainWidth * clipW) / 2
    g.fillStyle = th.secondary + '24'
    g.fillRect(cx - half, 0, half * 2, H)
    g.fillStyle = th.secondary + 'aa'
    g.fillRect(cx - 0.5, 0, 1, H)
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
      let logSum = 0
      for (const m of marks) logSum += Math.log2(m.rate)
      const base = logSum / marks.length
      const seen = marks.filter((m) => now >= m.when && now <= m.when + m.dur + GRAIN_FADE)
      const sounding = seen.filter((m) => now <= m.when + m.dur).length
      // a dense cloud draws each grain fainter, so it glows rather than whiting out
      const dim = Math.min(1, 2.5 / Math.sqrt(Math.max(1, seen.length)))
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
      const shown = seen.length
      g.globalAlpha = 1
      g.globalCompositeOperation = 'source-over'
      if (shown) labelX = xs / shown
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

    // which instance is which: its note (or number) in its colour, staggered so chords don't collide
    if (labelX !== null && (list.length > 1 || info.midiNote !== undefined)) {
      const text = info.midiNote !== undefined ? midiNoteName(info.midiNote) : `${i + 1}`
      g.font = '10px VT323, monospace'
      const tw = g.measureText(text).width + 4
      const lx = Math.min(W - tw, Math.max(0, labelX + 3))
      const ly = 6 + (i % 3) * 10
      g.fillStyle = 'rgba(0,0,0,0.65)'
      g.fillRect(lx, ly, tw, 10)
      g.fillStyle = hsl(hue, 100, 60 + 25 * vel)
      g.fillText(text, lx + 2, ly + 8)
    }
  })
}

let ro: ResizeObserver | undefined
onMounted(() => {
  const measure = () => (Wr.value = Math.max(160, canvas.value?.parentElement?.clientWidth ?? 386))
  measure()
  ro = new ResizeObserver(measure)
  if (canvas.value?.parentElement) ro.observe(canvas.value.parentElement)
  watchEffect(draw)
})
onBeforeUnmount(() => ro?.disconnect())

// drag the nearest clip marker
let dragging: 'clipIn' | 'clipOut' | null = null
function toPct(e: PointerEvent) {
  const r = canvas.value!.getBoundingClientRect()
  return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
}
function onDown(e: PointerEvent) {
  canvas.value!.setPointerCapture(e.pointerId)
  const x = toPct(e)
  const s = props.sound.settings
  dragging = Math.abs(x - s.clipIn) <= Math.abs(x - s.clipOut) ? 'clipIn' : 'clipOut'
  onMove(e)
}
function onMove(e: PointerEvent) {
  if (!dragging) return
  const s = props.sound.settings
  const x = toPct(e)
  if (dragging === 'clipIn') s.clipIn = Math.min(x, s.clipOut - 0.001)
  else s.clipOut = Math.max(x, s.clipIn + 0.001)
}
</script>

<template>
  <canvas
    ref="canvas"
    class="waveform"
    :style="{ width: `${Wr}px`, height: `${H}px` }"
    title="Drag to set clip in / out"
    @pointerdown.stop="onDown"
    @pointermove="onMove"
    @pointerup="dragging = null"
    @pointercancel="dragging = null"
  />
</template>

<style scoped>
.waveform {
  display: block;
  max-width: 100%;
  border-radius: 3px;
  background: radial-gradient(ellipse at center, #0c1a10 0%, #050806 100%);
  box-shadow:
    inset 0 0 12px rgba(0, 0, 0, 0.9),
    inset 0 0 0 1px color-mix(in srgb, var(--c-success) 15%, transparent);
  cursor: ew-resize;
  touch-action: none;
}
</style>
