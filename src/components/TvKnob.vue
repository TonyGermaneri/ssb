<script setup lang="ts">
import { computed } from 'vue'

/**
 * One of the vintage scope set's knobs: under 5 px of bakelite with a cream pointer, in a hit area you can find.
 * Drag up / down (shift: fine), scroll, double-click for where it left the factory.
 */
const props = defineProps<{ label: string; default: number; title: string }>()
const value = defineModel<number>({ required: true })
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const angle = computed(() => -135 + value.value * 270)
const tip = computed(() => `${props.title}: ${Math.round(value.value * 100)} % · drag, scroll · double-click resets`)

let from: { y: number; x: number; v: number } | null = null
function onDown(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  from = { y: e.clientY, x: e.clientX, v: value.value }
}
function onMove(e: PointerEvent) {
  if (!from || !(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return
  const px = from.y - e.clientY + (e.clientX - from.x)
  value.value = clamp01(from.v + px / (e.shiftKey ? 600 : 120))
}
function onUp() {
  from = null
}
function onWheel(e: WheelEvent) {
  value.value = clamp01(value.value - Math.sign(e.deltaY) * (e.shiftKey ? 0.01 : 0.04))
}
</script>

<template>
  <div class="row">
    <button
      class="hit"
      :title="tip"
      @pointerdown.stop="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @wheel.prevent.stop="onWheel"
      @dblclick.stop="value = props.default"
      @click.stop
    >
      <i class="knob" :style="{ '--a': `${angle}deg` }" />
    </button>
    <span class="label">{{ label }}</span>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 1px;
  min-width: 0;
}
.hit {
  flex: none;
  display: grid;
  place-items: center;
  width: 9px;
  height: 9px;
  margin: -1px -1px -1px -2px;
  padding: 0;
  border: 0;
  background: none;
  cursor: ns-resize;
  touch-action: none;
}
/* 4.5 px: a chrome skirt, a bakelite cap lit from the top left, a cream pointer line */
.knob {
  position: relative;
  width: 4.5px;
  height: 4.5px;
  border-radius: 50%;
  background: radial-gradient(circle at 34% 30%, #7a6d5a 0%, #2a221a 55%, #120e0a 100%);
  box-shadow:
    0 0 0 0.5px #c9bfa6,
    0 0 0 0.9px #3d352a,
    0 0.8px 0.8px 0.6px rgba(0, 0, 0, 0.65);
}
.knob::after {
  content: '';
  position: absolute;
  left: calc(50% - 0.35px);
  top: 0.15px;
  width: 0.7px;
  height: 2.1px;
  border-radius: 0.3px;
  background: #efe3c4;
  transform: rotate(var(--a));
  transform-origin: 50% 2.1px;
}
.hit:hover .knob {
  box-shadow:
    0 0 0 0.5px #fff2cc,
    0 0 0 0.9px #3d352a,
    0 0 2px 1px rgba(255, 220, 150, 0.45);
}
/* printed on the panel decades ago: small, faded, rubbed half away */
.label {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  font-family: 'Futura', 'Century Gothic', 'Avenir Next', 'Trebuchet MS', sans-serif;
  font-size: 4.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 5px;
  text-transform: uppercase;
  color: rgba(44, 36, 24, 0.78);
  text-shadow: 0 0.4px 0 rgba(255, 246, 220, 0.3);
  -webkit-mask-image: var(--worn);
  mask-image: var(--worn);
  -webkit-mask-size: 60px 30px;
  mask-size: 60px 30px;
}
</style>
