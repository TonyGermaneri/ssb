<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Point } from '../lib/play/pads'

/**
 * One of the Play view's XY pads: a canvas the parent paints (`draw`, when the parent calls `paint()` -- it knows
 * when the picture changed -- and on a resize), a crosshair dragged anywhere on it (`move`, y = 1 at the top, as
 * fast as the pointer moves: the parent takes the latest once a frame), a double-click for its starting point
 * (`reset`), and its settings behind ⚙ (the `settings` slot).
 */
const props = defineProps<{
  label: string
  title: string
  color: string
  draw: (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => void
  square?: boolean
}>()
const emit = defineEmits<{ move: [Point]; reset: []; end: [] }>()
const wrap = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
const showSettings = ref(false)
let size = { w: 100, h: 100 }
let g: CanvasRenderingContext2D | null = null

function paint() {
  const c = canvas.value
  if (!c) return
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(1, Math.round(size.w * dpr))
  const h = Math.max(1, Math.round(size.h * dpr))
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
  g ??= c.getContext('2d')
  if (!g) return
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, w, h)
  props.draw(g, w, h, dpr)
}
defineExpose({ paint, el: () => wrap.value })

let ro: ResizeObserver | undefined
onMounted(() => {
  ro = new ResizeObserver(([e]) => {
    size = { w: e.contentRect.width, h: e.contentRect.height }
    paint()
  })
  if (wrap.value) ro.observe(wrap.value)
})
onBeforeUnmount(() => ro?.disconnect())

let box: DOMRect | null = null
const point = (e: PointerEvent): Point => {
  const r = box ?? canvas.value!.getBoundingClientRect()
  return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)) }
}
function down(e: PointerEvent) {
  if (showSettings.value) return
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  // measured once per drag, not on every move (a layout read each time)
  box = canvas.value!.getBoundingClientRect()
  emit('move', point(e))
}
function move(e: PointerEvent) {
  if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) emit('move', point(e))
}
/** the drag's over: released, cancelled, or the capture lost */
function up() {
  if (!box) return
  box = null
  emit('end')
}
</script>

<template>
  <div ref="wrap" class="pad" :class="{ square }" :style="{ '--line': color }" :title="title">
    <canvas ref="canvas" @pointerdown.stop="down" @pointermove="move" @pointerup="up" @pointercancel="up" @lostpointercapture="up" @dblclick.stop="emit('reset')" />
    <span class="label">{{ label }}</span>
    <button v-if="$slots.settings" class="gear" :class="{ on: showSettings }" title="Settings" @pointerdown.stop @click.stop="showSettings = !showSettings">
      <v-icon size="12" icon="mdi-cog" />
    </button>
    <div v-if="showSettings" class="settings" @pointerdown.stop @click.stop>
      <slot name="settings" />
      <button class="done" @click="showSettings = false">DONE</button>
    </div>
  </div>
</template>
<style scoped>
.pad {
  position: relative;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--line) 55%, transparent);
  border-radius: 14px;
  background: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--line) 7%, var(--lcd-bg)), var(--lcd-bg) 75%);
  box-shadow: inset 0 0 18px color-mix(in srgb, var(--line) 18%, transparent);
  overflow: hidden;
  touch-action: none;
}
.pad.square {
  aspect-ratio: 1;
}
.pad {
  /* (its label and gear shrink in a narrow pad: below) */
  container-type: inline-size;
}
canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
}
.label {
  position: absolute;
  left: 6px;
  top: 5px;
  /* one line, cut short in a narrow pad (the pads stretch to fit their column) */
  max-width: calc(100% - 26px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
  padding: 0 5px;
  border-radius: 6px;
  font-family: 'Orbitron', sans-serif;
  font-size: 7px;
  font-weight: 900;
  letter-spacing: 0.18em;
  color: var(--lcd-bg);
  background: color-mix(in srgb, var(--line) 70%, transparent);
}
.gear {
  position: absolute;
  top: 4px;
  right: 5px;
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
.gear:hover,
.gear.on {
  opacity: 1;
}
.settings {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* (safe: a tall panel in a small pad scrolls from its top, not cut off above it) */
  justify-content: safe center;
  gap: 5px;
  padding: 6px;
  overflow: auto;
  background: color-mix(in srgb, var(--lcd-bg) 92%, transparent);
}
.settings :deep(button.opt),
.done {
  min-width: 84px;
  padding: 2px 10px;
  border-radius: 10px;
  font-family: 'VT323', monospace;
  font-size: 16px;
  color: color-mix(in srgb, var(--line) 75%, transparent);
  background: color-mix(in srgb, var(--line) 10%, var(--lcd-bg));
  border: 1px solid color-mix(in srgb, var(--line) 45%, transparent);
}
.settings :deep(button.opt.on) {
  color: var(--lcd-bg);
  background: var(--line);
}
.done {
  margin-top: 4px;
  min-width: 60px;
  opacity: 0.8;
}
.settings :deep(.row) {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
}
.settings :deep(.row button.opt) {
  min-width: 0;
  padding: 1px 8px;
  font-size: 15px;
}
.settings :deep(.knobs) {
  display: flex;
  gap: 4px;
}
.settings :deep(.knobs .label) {
  color: color-mix(in srgb, var(--line) 75%, transparent);
}
.settings :deep(.head) {
  font-family: 'Orbitron', sans-serif;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.15em;
  color: var(--line);
}
@container (max-width: 96px) {
  .label {
    left: 3px;
    top: 3px;
    padding: 0 3px;
    font-size: 6px;
    letter-spacing: 0.04em;
    max-width: calc(100% - 18px);
  }
  .gear {
    top: 2px;
    right: 2px;
    width: 13px;
    height: 13px;
  }
}
</style>
