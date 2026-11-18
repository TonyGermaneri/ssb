<script setup lang="ts">
import { computed } from 'vue'
import { useGarden } from '../stores/garden'
import type { PadId } from '../lib/play/padControl'
import { LAST_SHAPE, rateHz, SHAPES, snapShape } from '../lib/play/padLfo'
import MicroFader from './MicroFader.vue'

/**
 * A pad's LFO panel, on the pad's face (its automation button opens it): micro faders for SHAPE (top to bottom
 * CIRCLE, EIGHT, SQUARE, TRIANGLE, LINE, morphing between them), ASPECT, FREQ and AMP. × closes it and the LFO keeps running; OFF turns it off (and closes it), as a right-click on the button does (a right-click turns it back on, too).
 * Between the faders the pad shows through and still takes a drag: it moves the shape's centre.
 */
const props = defineProps<{ slot: number; pad: PadId }>()
const emit = defineEmits<{ close: [] }>()
const garden = useGarden()

const l = computed(() => garden.lfoOf(props.slot, props.pad))
const set = (k: 'shape' | 'aspect' | 'rate' | 'amp', v: number) => garden.setLfo(props.slot, props.pad, { [k]: v })
/** SHAPE's fader: CIRCLE at the top, LINE at the bottom */
const shapeV = computed(() => 1 - snapShape(l.value?.shape ?? 0) / LAST_SHAPE)
const shapeAt = computed(() => snapShape(l.value?.shape ?? 0))
const hz = computed(() => {
  const v = rateHz(l.value?.rate ?? 0)
  return v < 1 ? `${(1 / v).toFixed(v < 0.1 ? 0 : 1)}s` : `${v.toFixed(1)}Hz`
})
const aspect = computed(() => {
  const r = Math.pow(4, (l.value?.aspect ?? 0.5) * 2 - 1)
  return Math.abs(r - 1) < 0.05 ? '1:1' : r > 1 ? `${r.toFixed(1)}:1` : `1:${(1 / r).toFixed(1)}`
})
function off() {
  garden.stopLfo(props.slot, props.pad)
  emit('close')
}
</script>

<template>
  <div v-if="l" class="lfo-panel" @click.stop @dblclick.stop>
    <div class="top">
      <span class="head">LFO</span>
      <button class="x" title="Close — the LFO keeps running" @pointerdown.stop @click.stop="emit('close')"><v-icon size="11" icon="mdi-close" /></button>
    </div>
    <div class="body">
      <div class="names" @pointerdown.stop>
        <button
          v-for="(n, i) in SHAPES"
          :key="n"
          class="shape"
          :class="{ on: Math.abs(shapeAt - i) < 0.5 }"
          :title="n"
          @click.stop="set('shape', i)"
        >
          {{ n }}
        </button>
      </div>
      <MicroFader :model-value="shapeV" label="SHAPE" :reset="1" title="SHAPE: circle at the top, through eight, square and triangle, to line at the bottom (morphing between them)" @update:model-value="(v: number) => set('shape', (1 - v) * LAST_SHAPE)" />
      <div class="rest">
        <MicroFader :model-value="l.aspect" label="ASPECT" :readout="aspect" :reset="0.5" title="ASPECT: taller (down) or wider (up); the middle as wide as tall" @update:model-value="(v: number) => set('aspect', v)" />
        <MicroFader :model-value="l.rate" label="FREQ" :readout="hz" :reset="0.45" title="FREQ: how fast the pad goes round its shape" @update:model-value="(v: number) => set('rate', v)" />
        <MicroFader :model-value="l.amp" label="AMP" :readout="`${Math.round(l.amp * 100)}%`" :reset="0.25" title="AMP: how far from the centre it reaches (the edges hold it in: a big one squares off)" @update:model-value="(v: number) => set('amp', v)" />
      </div>
    </div>
    <div class="foot" @pointerdown.stop>
      <button class="off" title="Turn the automation off" @click.stop="off">OFF</button>
      <span class="hint">or right-click the automation button</span>
    </div>
  </div>
</template>

<style scoped>
/* over the pad's face; only its controls take the pointer: elsewhere a drag reaches the pad (the shape's centre) */
.lfo-panel {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  padding: 4px 5px 4px;
  pointer-events: none;
  background: linear-gradient(90deg, color-mix(in srgb, var(--lcd-bg) 78%, transparent), color-mix(in srgb, var(--lcd-bg) 35%, transparent));
  container-type: size;
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 14px;
}
.head {
  padding: 0 5px;
  border-radius: 6px;
  font-family: 'Orbitron', sans-serif;
  font-size: 7px;
  font-weight: 900;
  letter-spacing: 0.18em;
  color: #05030a;
  background: #7dff6a;
}
.x {
  pointer-events: auto;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border-radius: 50%;
  color: var(--line);
  background: color-mix(in srgb, var(--lcd-bg) 80%, transparent);
  border: 1px solid color-mix(in srgb, var(--line) 50%, transparent);
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 4px;
  padding-top: 3px;
}
.names {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 10px 0 12px;
  pointer-events: auto;
}
.shape {
  padding: 0 3px;
  text-align: right;
  font-family: 'VT323', monospace;
  font-size: 10px;
  line-height: 1;
  color: color-mix(in srgb, var(--line) 55%, transparent);
  background: none;
  border: none;
}
.shape.on {
  color: var(--lcd-bg);
  background: var(--line);
  border-radius: 3px;
}
.rest {
  display: flex;
  gap: 4px;
}
.foot {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 2px;
  pointer-events: auto;
  align-self: flex-start;
}
.off {
  padding: 0 8px;
  border-radius: 8px;
  font-family: 'VT323', monospace;
  font-size: 13px;
  line-height: 1.2;
  color: var(--line);
  background: color-mix(in srgb, var(--line) 12%, var(--lcd-bg));
  border: 1px solid color-mix(in srgb, var(--line) 50%, transparent);
}
.hint {
  font-family: 'VT323', monospace;
  font-size: 10px;
  line-height: 1;
  color: color-mix(in srgb, var(--line) 60%, transparent);
}
@container (max-height: 130px) {
  .names {
    padding: 8px 0 10px;
  }
  .shape {
    font-size: 8px;
  }
  .hint {
    font-size: 8px;
  }
}
</style>
