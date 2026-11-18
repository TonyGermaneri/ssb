<script setup lang="ts">
/**
 * A micro fader: a thin vertical slot and its cap, for a pad's LFO panel (PadLfoPanel.vue). `modelValue` 0..1, the
 * top 1; drag anywhere along it (or click) to set it, double-click for `reset`. Its label under it, its value over.
 */
const props = defineProps<{ modelValue: number; label: string; readout?: string; reset?: number; title?: string }>()
const emit = defineEmits<{ 'update:modelValue': [number] }>()

let box: DOMRect | null = null
const at = (e: PointerEvent) => {
  const r = box!
  return Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))
}
function down(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  box = el.getBoundingClientRect()
  emit('update:modelValue', at(e))
}
function move(e: PointerEvent) {
  if (box && (e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) emit('update:modelValue', at(e))
}
const up = () => (box = null)
</script>

<template>
  <div class="fader" :title="title">
    <span class="readout">{{ readout }}</span>
    <div
      class="slot"
      @pointerdown.stop="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
      @lostpointercapture="up"
      @dblclick.stop="props.reset !== undefined && emit('update:modelValue', props.reset)"
    >
      <div class="fill" :style="{ height: `${modelValue * 100}%` }" />
      <div class="cap" :style="{ bottom: `${modelValue * 100}%` }" />
    </div>
    <span class="name">{{ label }}</span>
  </div>
</template>

<style scoped>
.fader {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-height: 0;
  width: 32px;
  pointer-events: auto;
}
.readout,
.name {
  font-family: 'VT323', monospace;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  color: color-mix(in srgb, var(--line) 85%, white);
}
.name {
  font-family: 'Orbitron', sans-serif;
  font-size: 6px;
  font-weight: 900;
  letter-spacing: 0.08em;
}
.slot {
  position: relative;
  flex: 1;
  min-height: 30px;
  width: 14px;
  cursor: ns-resize;
  touch-action: none;
}
.slot::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 0;
  bottom: 0;
  width: 2px;
  border-radius: 1px;
  background: color-mix(in srgb, var(--line) 30%, transparent);
}
.fill {
  position: absolute;
  left: 6px;
  bottom: 0;
  width: 2px;
  border-radius: 1px;
  background: var(--line);
  box-shadow: 0 0 4px var(--line);
}
.cap {
  position: absolute;
  left: 1px;
  width: 12px;
  height: 5px;
  margin-bottom: -2.5px;
  border-radius: 2px;
  background: var(--line);
  border: 1px solid color-mix(in srgb, var(--lcd-bg) 60%, transparent);
}
</style>
