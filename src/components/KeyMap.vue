<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { activeVoices } from '../audio/engine'
import { useBoard } from '../stores/board'
import { mix } from '../theme/gridStyle'
import { midiNoteName } from '../lib/format'
import type { Sound } from '../types'

/** SFZ zone map: key ranges across, velocity layers up; lit where notes are sounding. */
const props = defineProps<{ sound: Sound }>()
const board = useBoard()
const canvas = ref<HTMLCanvasElement>()
const W = ref(300)
const H = 46
const KEYS_H = 12
const BLACK = new Set([1, 3, 6, 8, 10])

const zones = computed(() => props.sound.zones ?? [])
const range = computed(() => {
  const lo = Math.min(...zones.value.map((z) => z.lokey))
  const hi = Math.max(...zones.value.map((z) => z.hikey))
  // pad to whole octaves so the keyboard reads naturally
  return { lo: Math.max(0, Math.floor(lo / 12) * 12), hi: Math.min(127, Math.ceil((hi + 1) / 12) * 12 - 1) }
})
const sounding = computed(
  () =>
    new Set(
      activeVoices.value
        .filter((v) => v.soundId === props.sound.id)
        .map((v) => v.midiNote ?? props.sound.settings.rootNote),
    ),
)

function draw() {
  const c = canvas.value
  if (!c || !zones.value.length) return
  const t = board.theme
  const dpr = window.devicePixelRatio || 1
  const w = W.value
  if (c.width !== Math.round(w * dpr)) {
    c.width = Math.round(w * dpr)
    c.height = H * dpr
  }
  const g = c.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, w, H)
  const { lo, hi } = range.value
  const n = hi - lo + 1
  const kw = w / n
  const x = (k: number) => (k - lo) * kw
  const zoneH = H - KEYS_H - 2
  const on = sounding.value

  // zones: x = key range, y = velocity range
  for (const z of zones.value) {
    const lit = [...on].some((k) => k >= z.lokey && k <= z.hikey)
    const y0 = zoneH - (z.hivel / 127) * zoneH
    const y1 = zoneH - ((z.lovel - 1) / 127) * zoneH
    g.fillStyle = lit ? t.primary : mix(t.panel[2], t.secondary, 0.35)
    g.globalAlpha = lit ? 0.9 : 0.55
    g.fillRect(x(z.lokey) + 0.5, y0 + 0.5, Math.max(1, (z.hikey - z.lokey + 1) * kw - 1), Math.max(1, y1 - y0 - 1))
  }
  g.globalAlpha = 1

  // keyboard
  const ky = H - KEYS_H
  for (let k = lo; k <= hi; k++) {
    const black = BLACK.has(k % 12)
    g.fillStyle = on.has(k) ? t.primary : black ? '#111' : '#d8d4c8'
    g.fillRect(x(k), ky + (black ? 0 : 0), Math.max(1, kw - (black ? 0 : 0.6)), black ? KEYS_H * 0.62 : KEYS_H)
  }
  // root key marker
  const root = props.sound.settings.rootNote
  if (root >= lo && root <= hi) {
    g.fillStyle = t.danger
    g.fillRect(x(root), ky - 2, Math.max(2, kw), 2)
  }
}

let ro: ResizeObserver | undefined
onMounted(() => {
  const measure = () => (W.value = Math.max(120, canvas.value?.parentElement?.clientWidth ?? 300))
  measure()
  ro = new ResizeObserver(measure)
  if (canvas.value?.parentElement) ro.observe(canvas.value.parentElement)
  watchEffect(draw)
})
onBeforeUnmount(() => ro?.disconnect())

const label = computed(
  () =>
    `${zones.value.length} ZONES · ${midiNoteName(range.value.lo)}–${midiNoteName(range.value.hi)} · PAD PLAYS ${midiNoteName(props.sound.settings.rootNote)}`,
)
</script>

<template>
  <div class="keymap">
    <canvas ref="canvas" :style="{ width: `${W}px`, height: `${H}px` }" />
    <div class="label">{{ label }}</div>
  </div>
</template>

<style scoped>
.keymap {
  margin-top: 6px;
}
canvas {
  display: block;
  border-radius: 3px;
  background: var(--lcd-bg);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.6);
}
.label {
  margin-top: 2px;
  font-family: 'VT323', monospace;
  font-size: 13px;
  letter-spacing: 0.06em;
  color: var(--text-mute);
}
</style>
