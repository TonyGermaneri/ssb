<script setup lang="ts">
import { computed } from 'vue'
import { useGarden } from '../stores/garden'
import { FADE_MAX, OFFSET_MAX } from '../lib/garden/garden'
import type { PatchSlot } from '../types'
import Knob from './Knob.vue'

/**
 * A VCO's PROMPT GARDEN in its title bar (the PLAY column's and the VCO tab's): XFADE, OFFSET and LOOPS as small knobs,
 * the GROW chip that opens the garden, ⏸ that holds its growth and 💾 that saves the clip playing. Each VCO's own
 * (PatchSlot.garden). In PLAY (`play`) the VCO's VOL leads, and while it grows a green ↻ grows a new clip now.
 */
const props = defineProps<{ x: PatchSlot; slot: number; chip: string; title: string; chipClass?: string; play?: boolean }>()
const emit = defineEmits<{ open: [] }>()
const garden = useGarden()
const g = () => garden.gardenOf(props.slot)

const loops = computed({ get: () => props.x.garden?.loops ?? 4, set: (v: number) => { const x = g(); if (x) x.loops = Math.round(v) } })
const offset = computed({ get: () => props.x.garden?.offset ?? 0, set: (v: number) => { const x = g(); if (x) x.offset = Math.round(v * 4) / 4 } })
const fade = computed({ get: () => props.x.garden?.fade ?? 0.08, set: (v: number) => { const x = g(); if (x) x.fade = v } })
const on = computed(() => !!props.x.garden?.on)
/** the VCO's own VOL (its layer's, as its control panel's) */
const volume = computed({ get: () => props.x.layer.settings.volume ?? 1, set: (v: number) => (props.x.layer.settings.volume = v) })
const fmtVol = (v: number) => `VOL ${Math.round(v * 100)}%`
const busy = computed(() => {
  const r = garden.runs.get(props.x.layer.id)
  return !!r && r.status === 'growing'
})
/** how far the clip being made has got (0..1), or null when none is being made */
const growing = computed(() => {
  const r = garden.runs.get(props.x.layer.id)
  if (!on.value || !r) return null
  return r.status === 'growing' ? r.genProgress : r.status === 'ready' ? 1 : null
})
const paused = computed(() => !!props.x.garden?.paused)
const canSave = computed(() => garden.canSave(props.slot))
function togglePause() {
  const x = g()
  if (x) x.paused = !x.paused
}

const fmtLoops = (v: number) => `LOOP ${Math.round(v)}×`
const fmtOffset = (v: number) => `OFS +${Number.isInteger(v) ? v : v.toFixed(2)}`
const fmtFade = (v: number) => `XF ${v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(1)}s`}`
</script>

<template>
  <div class="gbar" :class="{ off: !on }" @click.stop>
    <Knob
      v-if="play"
      v-model="volume"
      class="mini vol"
      label="VOL — this VCO's level (its control panel's VOL)"
      :min="0"
      :max="1.5"
      :default="1"
      :size="16"
      :format="fmtVol"
    />
    <Knob
      v-model="fade"
      class="mini"
      label="XFADE — the crossfade a new clip comes in over (both heard on top of each other for that long; past a loop's length, several loops of each overlap)"
      :min="0.005"
      :max="FADE_MAX"
      curve="log"
      :default="0.08"
      :size="16"
      :format="fmtFade"
    />
    <Knob
      v-model="offset"
      class="mini"
      label="OFFSET — loops this VCO's swaps are pushed back by, so the VCOs don't all swap together"
      :min="0"
      :max="OFFSET_MAX"
      :default="0"
      :size="16"
      :format="fmtOffset"
    />
    <Knob
      v-model="loops"
      class="mini"
      label="LOOPS — passes of the clip before the next is stitched in"
      :min="1"
      :max="32"
      :step="1"
      :default="4"
      :size="16"
      :format="fmtLoops"
    />
    <button
      class="garden-chip"
      :class="[chipClass, { on, meter: growing !== null }]"
      :style="growing !== null ? { '--p': `${(growing * 100).toFixed(1)}%` } : undefined"
      :title="growing !== null && growing < 1 ? `Making the next clip: ${Math.round(growing * 100)} % (estimated from how long the last ones took) — click to tend the garden` : title"
      @click="emit('open')"
    >
      <span class="fill" />
      <span class="txt">{{ chip }}</span>
    </button>
    <button
      v-if="play && on"
      class="pause grow-now"
      :class="{ busy }"
      :title="busy ? 'GROW NOW: a clip is being made — it goes in as soon as it is ready' : 'GROW NOW: the clip ready goes in at once, or a new one is made now and goes in as soon as it is'"
      @click="garden.growNowAndStitch(slot)"
    >
      <v-icon size="13" icon="mdi-refresh" />
    </button>
    <button
      class="pause"
      :class="{ on: paused }"
      :disabled="!on"
      :title="paused ? 'Growth paused: the clip playing loops on — click to grow again' : 'Pause growth: no new clips made or stitched in for this VCO'"
      @click="togglePause"
    >
      <v-icon size="12" :icon="paused ? 'mdi-play' : 'mdi-pause'" />
    </button>
    <button
      class="pause save"
      :disabled="!canSave"
      :title="canSave ? 'SAVE the clip playing into the samples for good (tagged generated); its prompt, seed and model are kept with the patch' : 'Nothing to save: no take playing, or it is saved already'"
      @click="garden.saveTake(slot)"
    >
      <v-icon size="12" icon="mdi-content-save" />
    </button>
  </div>
</template>

<style scoped>
.gbar {
  display: flex;
  align-items: center;
  gap: 3px;
  flex: 0 1 auto;
  min-width: 0;
}
.gbar.off .mini {
  opacity: 0.55;
}
.mini {
  flex-direction: row !important;
  width: auto !important;
  gap: 2px;
}
.mini :deep(.label) {
  display: none;
}
.mini :deep(.knob-body) {
  border-radius: 50%;
  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.16);
}
.mini :deep(.readout) {
  white-space: nowrap;
  text-transform: none;
  font-family: 'VT323', monospace;
  font-size: 12px;
  line-height: 1;
  color: var(--ink-dim, #aaa);
}
.garden-chip {
  flex: none;
  padding: 0 6px;
  border-radius: 9px;
  font-family: 'VT323', monospace;
  font-size: 14px;
  line-height: 18px;
  color: var(--ink-mute);
  background: #111;
  border: 1px solid #000;
}
.garden-chip {
  position: relative;
  overflow: hidden;
}
.garden-chip .txt {
  position: relative;
}
.garden-chip.on {
  color: #05030a;
  background: #7dff6a;
  box-shadow: 0 0 8px rgba(125, 255, 106, 0.5);
}
/* making a clip: the chip is its progress meter, the green sweeping in from the left */
.garden-chip.on.meter {
  color: #d8ffd0;
  background: #14301a;
}
.garden-chip .fill {
  position: absolute;
  inset: 0;
  width: 0;
  background: linear-gradient(90deg, #3fae34, #7dff6a);
  box-shadow: 0 0 8px rgba(125, 255, 106, 0.6);
}
.garden-chip.meter .fill {
  width: var(--p);
  transition: width 0.22s linear;
}
.garden-chip.meter .txt {
  color: #f2fff0;
  text-shadow: 0 1px 2px #000, 0 0 2px #000;
}
.pause {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border-radius: 9px;
  color: var(--ink-mute);
  background: #111;
  border: 1px solid #000;
}
.pause.on {
  color: #05030a;
  background: #ffd23e;
  box-shadow: 0 0 8px rgba(255, 210, 62, 0.5);
}
.grow-now {
  color: #7dff6a;
  border-color: color-mix(in srgb, #7dff6a 40%, #000);
  box-shadow: 0 0 6px rgba(125, 255, 106, 0.35);
}
.grow-now:hover {
  color: #05030a;
  background: #7dff6a;
}
.grow-now.busy :deep(.v-icon) {
  animation: spin 1.2s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.gbar.off .mini.vol {
  opacity: 1;
}
.pause:disabled {
  opacity: 0.35;
}
/* a narrow title bar: the knobs alone (their arcs and tooltips still tell) */
@container (max-width: 430px) {
  .mini :deep(.readout) {
    display: none;
  }
}
</style>
