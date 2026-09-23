<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { activeVoices, clock } from '../audio/engine'
import { useBoard } from '../stores/board'
import type { Sound } from '../types'

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

  // grain window
  if (s.grainSize > 0) {
    const clipW = b - a
    const cx = a + s.grainPos * clipW
    const half = (s.grainWidth * clipW) / 2
    g.fillStyle = th.secondary + '2e'
    g.fillRect(cx - half, 0, half * 2, H)
    g.fillStyle = th.secondary
    g.fillRect(cx - 1, 0, 2, H)
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

  if (!voices.value.length) return
  const now = clock.value

  // every grain gets its own playhead, sweeping through its slice (backwards when reversed).
  // Positions are relative to each voice's own buffer, so SFZ zones land proportionally.
  g.save()
  g.shadowColor = th.secondary
  g.shadowBlur = 6
  for (const { voice } of voices.value) {
    const toX = (sec: number) => (sec / voice.bufferDuration) * W
    for (const m of voice.marks) {
      if (now < m.when || now > m.when + m.dur) continue
      const phase = (now - m.when) / m.dur
      const a = Math.sin(Math.PI * phase)
      const x0 = toX(m.pos)
      const x1 = toX(m.pos + m.len)
      g.globalAlpha = 0.1 * a
      g.fillStyle = th.secondary
      g.fillRect(x0, 0, Math.max(1, x1 - x0), H)
      const head = m.reverse ? x1 - (x1 - x0) * phase : x0 + (x1 - x0) * phase
      g.globalAlpha = 0.35 + 0.65 * a
      g.fillStyle = '#ffffff'
      g.fillRect(head - 0.75, 0, 1.5, H)
    }
  }
  g.restore()
  g.globalAlpha = 1

  // transport marker for every playing voice (tape / stretch / SFZ zones)
  g.save()
  g.shadowColor = th.primary
  g.shadowBlur = 8
  g.fillStyle = '#ffffff'
  for (const { voice } of voices.value) {
    const pos = voice.positionAt(now)
    if (pos === null) continue
    const x = (pos / voice.bufferDuration) * W
    g.fillRect(x - 1, 0, 2, H)
    g.beginPath()
    g.moveTo(x - 4, 0)
    g.lineTo(x + 4, 0)
    g.lineTo(x, 5)
    g.fill()
  }
  g.restore()
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
