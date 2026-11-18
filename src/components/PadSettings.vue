<script setup lang="ts">
import { computed } from 'vue'
import { useBoard } from '../stores/board'
import type { Sound } from '../types'
import { GRAIN_SYNC_BANDS, grainPoint, grainSyncWrite, SYNC_TOP } from '../lib/play/pads'
import { put, type PadControl, type PadId } from '../lib/play/padControl'
import { SCALES } from '../lib/play/scales'
import { PLAY_MODES } from '../lib/voyage/modes'
import Knob from './Knob.vue'
import ShaderControls from './ShaderControls.vue'

/**
 * A pad's settings (behind its ⚙): the Play view's pads and the VOYAGE ship's parts show the same. PERFORM's, on VCO
 * 1, also chooses the PLAY MODE: the pads, or the ship.
 */
const props = defineProps<{ kind: PadId; sound: Sound; slot: number; pads: PadControl }>()
const emit = defineEmits<{ changed: [] }>()
const board = useBoard()
const s = computed(() => props.sound.settings)
const playMode = computed(() => board.master.playMode ?? 'pads')

const SHAPES = [
  { id: 'sine', label: 'SINE' },
  { id: 'sawtooth', label: 'SAW' },
  { id: 'triangle', label: 'TRI' },
] as const
const MODES = ['classic', 'loop', 'cloud'] as const

/** GRAIN's ATTACK: SKEW from leaning early (a percussive grain, 0) to even (100 %) */
const grainAttack = computed({
  get: () => Math.min(1, Math.max(0, s.value.grainSkew / 0.5)),
  set: (v: number) => (s.value.grainSkew = Math.round(Math.min(1, Math.max(0, v)) * 0.5 * 1000) / 1000),
})
/** SYNC turned on: the band nearest the grains' rate now; off: GRAIN's Hz stays as the band had it */
function setSync(on: boolean) {
  if (on === s.value.grainSync) return
  s.value.grainSync = on
  if (on) {
    const r = props.pads.raw()
    const x = grainPoint(r, props.pads.sampleSeconds()).x
    // faster than the fastest band: the top band, free, at the same rate
    const free = r.grainFreq >= board.bpm / 60 / GRAIN_SYNC_BANDS.at(-1)!
    put(s.value, free ? { grainBeats: 0 } : grainSyncWrite({ x, y: grainBand(r.grainFreq) }, board.bpm))
  }
  emit('changed')
}
/** where a rate sits among SYNC's bands (by beats a grain at the tempo) */
function grainBand(hz: number): number {
  const beats = board.bpm / 60 / Math.max(1e-6, hz)
  let best = 0
  for (let i = 1; i < GRAIN_SYNC_BANDS.length; i++) if (Math.abs(Math.log(GRAIN_SYNC_BANDS[i] / beats)) < Math.abs(Math.log(GRAIN_SYNC_BANDS[best] / beats))) best = i
  return ((best + 0.5) / GRAIN_SYNC_BANDS.length) * SYNC_TOP
}

const fmtMs = (v: number) => (v > 0 ? `${v.toFixed(1)}ms` : 'OFF')
const fmtSemis = (v: number) => (v ? `${v > 0 ? '+' : ''}${Math.round(v)}st` : 'ORIG')
const fmtCents = (v: number) => (v ? `${v > 0 ? '+' : ''}${Math.round(v)}c` : 'ORIG')
const fmtSec = (v: number) => `${v.toFixed(1)}s`
const fmtNum = (v: number) => v.toFixed(1)
const fmtQ = (v: number) => v.toFixed(1)
const pct = (v: number) => `${Math.round(v * 100)}%`
const fmtMsS = (v: number) => (v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`)
const fmtDb = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}dB`
</script>

<template>
  <template v-if="kind === 'perform'">
    <div class="knobs">
      <Knob v-model="s.stereoPhase" label="PHASE" :min="0" :max="30" :default="0" :format="fmtMs" :size="30" />
      <Knob v-model="s.tuneCoarse" label="COARSE" :min="-12" :max="12" :step="1" :default="0" bipolar :format="fmtSemis" :size="30" />
      <Knob v-model="s.tuneFine" label="FINE" :min="-100" :max="100" :step="1" :default="0" bipolar :format="fmtCents" :size="30" />
    </div>
    <template v-if="slot === 0">
      <span class="head">PLAY MODE</span>
      <div class="row">
        <button v-for="m in PLAY_MODES" :key="m.id" class="opt" :class="{ on: playMode === m.id }" :title="m.title" @click="board.master.playMode = m.id">{{ m.label }}</button>
      </div>
    </template>
    <ShaderControls kind="perform" />
  </template>
  <template v-else-if="kind === 'grain'">
    <div class="row">
      <button class="opt" :class="{ on: !s.grainSync }" title="FREE: the grains' rate sweeps smoothly" @click="setSync(false)">FREE</button>
      <button class="opt" :class="{ on: s.grainSync }" title="SYNC: the heights are tempo divisions (the top band stays free, for smooth fast grains)" @click="setSync(true)">SYNC</button>
    </div>
    <div class="row">
      <button v-for="m in MODES" :key="m" class="opt" :class="{ on: s.grainMode === m }" @click="s.grainMode = m">{{ m.toUpperCase() }}</button>
    </div>
    <div class="row">
      <button class="opt" :class="{ on: !s.mpeGrain }" title="MPE: a note's sideways bend bends its pitch" @click="s.mpeGrain = false">MPE PITCH</button>
      <button class="opt" :class="{ on: s.mpeGrain }" title="MPE: a note's sideways bend moves where its grains fire, over half the clip each way" @click="s.mpeGrain = true">MPE GRAIN</button>
    </div>
    <div class="knobs">
      <Knob v-model="grainAttack" label="ATTACK" :min="0" :max="1" :default="1" :format="(v: number) => `${Math.round(v * 100)}%`" :size="26" />
    </div>
    <ShaderControls kind="grain" />
  </template>
  <template v-else-if="kind === 'lfo'">
    <span class="head">SHAPE</span>
    <div class="row">
      <button v-for="sh in SHAPES" :key="sh.id" class="opt" :class="{ on: s.mod.lfo2.shape === sh.id }" @click="s.mod.lfo2.shape = sh.id">{{ sh.label }}</button>
    </div>
    <ShaderControls kind="lfo" />
  </template>
  <template v-else-if="kind === 'fx'">
    <span class="head">REVERB · FILTER</span>
    <div class="knobs">
      <Knob v-model="s.reverbSize" label="SIZE" :min="0.1" :max="6" :default="2" :format="fmtSec" :size="26" />
      <Knob v-model="s.reverbDecay" label="DECAY" :min="0.5" :max="10" :default="3" :format="fmtNum" :size="26" />
      <Knob v-model="s.reverbDamp" label="DAMP" :min="0" :max="1" :default="0" :format="(v: number) => `${Math.round(v * 100)}%`" :size="26" />
      <Knob v-model="s.resonance" label="RES" :min="0.1" :max="20" curve="log" :default="0.7" :format="fmtQ" :size="26" />
    </div>
    <ShaderControls kind="fx" />
  </template>
  <template v-else-if="kind === 'pitch'">
    <div class="row">
      <button class="opt" :class="{ on: !s.pitchScale }" title="FREE: the pitch moves smoothly" @click="s.pitchScale = false">FREE</button>
      <button class="opt" :class="{ on: s.pitchScale }" title="SCALE: the pitch snaps to the scale below" @click="s.pitchScale = true">SCALE</button>
    </div>
    <div class="row">
      <select v-model="s.pitchScaleId" class="select" :disabled="!s.pitchScale" title="The scale SCALE snaps the pitch to (from the sample's own key)">
        <option v-for="sc in SCALES" :key="sc.id" :value="sc.id">{{ sc.label }}</option>
      </select>
    </div>
    <ShaderControls kind="pitch" />
  </template>
  <template v-else-if="kind === 'texture'">
    <div class="knobs">
      <Knob v-model="s.grainVariation" label="VARY" :min="0" :max="1" :default="0" :format="pct" :size="26" />
      <Knob v-model="s.grainStereo" label="SPREAD" :min="0" :max="1" :default="0" :format="pct" :size="26" />
      <Knob v-model="s.grainDensity" label="DENSITY" :min="2" :max="20" :step="1" :default="4" :format="(v: number) => `${Math.round(v)}`" :size="26" :class="{ dim: s.grainMode !== 'cloud' }" />
      <Knob v-model="s.grainAmp" label="FLUX" :min="0" :max="1" :default="0" :format="pct" :size="26" />
    </div>
    <ShaderControls kind="texture" />
  </template>
  <template v-else-if="kind === 'echo'">
    <div class="knobs">
      <Knob v-model="s.delayMix" label="MIX" :min="0" :max="1" :default="0" :format="pct" :size="26" />
      <Knob v-model="s.delayTime" label="TIME" :min="0.01" :max="2" curve="log" :default="0.25" :format="fmtMsS" :size="26" />
      <Knob v-model="s.delayFeedback" label="FDBK" :min="0" :max="0.9" :default="0.35" :format="pct" :size="26" />
    </div>
    <ShaderControls kind="echo" />
  </template>
  <template v-else-if="kind === 'tone'">
    <div class="knobs">
      <Knob v-model="s.eqLow" label="BASS" :min="-12" :max="12" :step="0.5" :default="0" bipolar :format="fmtDb" :size="26" />
      <Knob v-model="s.eqMid" label="MID" :min="-12" :max="12" :step="0.5" :default="0" bipolar :format="fmtDb" :size="26" />
      <Knob v-model="s.eqHigh" label="TREBLE" :min="-12" :max="12" :step="0.5" :default="0" bipolar :format="fmtDb" :size="26" />
    </div>
    <ShaderControls kind="tone" />
  </template>
</template>

<style scoped>
.knobs {
  display: flex;
  gap: 4px;
}
.knobs :deep(.label) {
  color: color-mix(in srgb, var(--line) 75%, transparent);
}
.knobs .dim {
  opacity: 0.4;
}
.select {
  appearance: auto;
  max-width: 100%;
  padding: 0 4px;
  border-radius: 4px;
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: color-mix(in srgb, var(--line) 80%, transparent);
  background: color-mix(in srgb, var(--line) 10%, var(--lcd-bg));
  border: 1px solid color-mix(in srgb, var(--line) 45%, transparent);
}
.select:disabled {
  opacity: 0.5;
}
.row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
}
.opt {
  padding: 1px 8px;
  border-radius: 10px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: color-mix(in srgb, var(--line) 75%, transparent);
  background: color-mix(in srgb, var(--line) 10%, var(--lcd-bg));
  border: 1px solid color-mix(in srgb, var(--line) 45%, transparent);
}
.opt.on {
  color: var(--lcd-bg);
  background: var(--line);
}
.head {
  font-family: 'Orbitron', sans-serif;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.15em;
  color: var(--line);
}
</style>
