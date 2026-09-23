<script setup lang="ts">
import { computed } from 'vue'
import { clock } from '../audio/engine'
import { useBoard } from '../stores/board'
import { fmtPct, fmtRate } from '../lib/format'
import { fmtRouteAmount, lfoValue } from '../lib/modulation'
import {
  DIVISIONS, lfoHz, LFO_SHAPES, MOD_DEST_IDS, MOD_DESTS, MOD_SOURCES, type Lfo, type LfoShape, type ModDest, type ModMatrix,
  type ModSource,
} from '../types'
import Knob from './Knob.vue'

const board = useBoard()

const SHAPE_ICON: Record<LfoShape, string> = {
  sine: 'mdi-sine-wave',
  triangle: 'mdi-triangle-wave',
  square: 'mdi-square-wave',
  sawtooth: 'mdi-sawtooth-wave',
  rampDown: 'mdi-sawtooth-wave',
  random: 'mdi-stairs',
  smooth: 'mdi-waves',
}
const SHAPE_NAME: Record<LfoShape, string> = {
  sine: 'Sine',
  triangle: 'Triangle',
  square: 'Square',
  sawtooth: 'Saw up',
  rampDown: 'Saw down',
  random: 'Sample & hold (random steps)',
  smooth: 'Smooth random',
}
const divIndex = (lfo: Lfo) => Math.max(0, DIVISIONS.findIndex((d) => d.id === lfo.division))
const fmtDiv = (v: number) => DIVISIONS[Math.round(v)]?.id ?? ''
const DEST_SHORT: Record<ModDest, string> = {
  pitch: 'PITCH',
  cutoff: 'CUTOFF',
  resonance: 'RES',
  volume: 'VOL',
  pan: 'PAN',
  grainPos: 'G.POS',
  grainSize: 'G.SIZE',
  delayMix: 'DELAY',
  reverbMix: 'REVERB',
}

const open = computed({
  get: () => board.matrixScope !== null,
  set: (v) => {
    if (!v) board.matrixScope = null
  },
})
const isGlobal = computed(() => board.matrixScope === 'global')
/** the pad shown on the PAD tab: the one that opened the modal, else the selected patch */
const pad = computed(() =>
  board.matrixScope && board.matrixScope !== 'global' ? board.byId(board.matrixScope) : board.selected,
)
const matrix = computed<ModMatrix | null>(() => (isGlobal.value ? board.master.mod : pad.value?.settings.mod ?? null))
const lfos = computed<[Lfo, Lfo] | null>(() => (matrix.value ? [matrix.value.lfo1, matrix.value.lfo2] : null))

function amount(src: ModSource, dest: ModDest) {
  return matrix.value?.routes.find((r) => r.source === src && r.dest === dest)?.amount ?? 0
}
function setAmount(src: ModSource, dest: ModDest, v: number) {
  const m = matrix.value
  if (!m) return
  const i = m.routes.findIndex((r) => r.source === src && r.dest === dest)
  if (i >= 0) {
    if (v === 0) m.routes.splice(i, 1)
    else m.routes[i].amount = v
  } else if (v !== 0) m.routes.push({ source: src, dest, amount: v })
}
function clearAll() {
  if (matrix.value) matrix.value.routes.splice(0)
}
/** blinking LED per LFO (display only) */
const lfoLed = (lfo: Lfo) => (lfoValue(lfo.shape === 'random' || lfo.shape === 'smooth' ? 'square' : lfo.shape, clock.value * lfoHz(lfo, board.bpm)) + 1) / 2
const routeCount = computed(() => matrix.value?.routes.length ?? 0)
</script>

<template>
  <v-dialog v-model="open" max-width="780" scrollable>
    <div class="matrix" @keydown.stop>
      <header>
        <v-icon icon="mdi-matrix" color="primary" />
        <h3>MOD MATRIX</h3>
        <div class="tabs">
          <button :class="{ on: isGlobal }" @click="board.matrixScope = 'global'">GLOBAL</button>
          <button
            :class="{ on: !isGlobal }"
            :disabled="!pad"
            @click="pad && (board.matrixScope = pad.id)"
          >
            PAD · {{ pad?.settings.name ?? '—' }}
          </button>
        </div>
        <v-spacer />
        <button class="hw-btn icon" title="Close" @click="open = false"><v-icon size="16" icon="mdi-close" /></button>
      </header>

      <p class="hint">
        <template v-if="isGlobal">Global routes apply to every sound. Global LFOs run freely.</template>
        <template v-else>Pad routes apply only to this sound. Pad LFOs restart with every note.</template>
        Turn a cell to route that source → destination.
      </p>

      <div v-if="lfos" class="top">
        <section v-for="(lfo, i) in lfos" :key="i" class="module lfo">
          <h4>
            LFO {{ i + 1 }}
            <i class="led" :style="{ opacity: 0.15 + 0.85 * lfoLed(lfo) }" />
          </h4>
          <div class="row">
            <div class="shapes">
              <button
                v-for="sh in LFO_SHAPES"
                :key="sh"
                class="shape"
                :class="{ on: lfo.shape === sh, flip: sh === 'rampDown' }"
                :title="SHAPE_NAME[sh]"
                @click="lfo.shape = sh"
              >
                <v-icon size="16" :icon="SHAPE_ICON[sh]" />
              </button>
              <button
                class="shape sync"
                :class="{ on: lfo.sync }"
                :title="lfo.sync ? 'Synced to tempo — click for free rate (Hz)' : 'Free rate — click to sync to tempo'"
                @click="lfo.sync = !lfo.sync"
              >
                <v-icon size="15" icon="mdi-sync" />
              </button>
            </div>
            <Knob
              v-if="lfo.sync"
              :model-value="divIndex(lfo)"
              label="DIV"
              :min="0"
              :max="DIVISIONS.length - 1"
              :step="1"
              :default="6"
              :format="fmtDiv"
              color="accent"
              @update:model-value="(v: number) => (lfo.division = DIVISIONS[Math.round(v)].id)"
            />
            <Knob v-else v-model="lfo.rate" label="RATE" :min="0.02" :max="20" curve="log" :default="i ? 0.5 : 5" :format="fmtRate" color="accent" />
          </div>
        </section>
        <section class="module perform">
          <h4>PERFORM</h4>
          <div class="row">
            <Knob v-model="board.perform.mod" label="MOD" :default="0" :format="fmtPct" color="secondary" />
            <Knob v-model="board.perform.bend" label="BEND" :min="-1" :max="1" :default="0" bipolar spring :format="fmtPct" color="secondary" />
            <Knob v-model="board.perform.pressure" label="PRESS" :default="0" spring :format="fmtPct" color="secondary" />
            <Knob v-model="board.perform.timbre" label="TIMBRE" :default="0" :format="fmtPct" color="secondary" />
          </div>
        </section>
        <section class="module perform">
          <h4>
            MPE
            <button class="chip" :class="{ on: board.master.mpe }" @click="board.master.mpe = !board.master.mpe">
              {{ board.master.mpe ? 'ON' : 'OFF' }}
            </button>
          </h4>
          <div class="row">
            <Knob v-model="board.master.mpeBendRange" label="NOTE BEND" :min="1" :max="96" :step="1" :default="48" :format="(v: number) => `±${v}st`" color="secondary" />
          </div>
        </section>
      </div>

      <div v-if="matrix" class="grid-wrap">
        <table class="grid">
          <thead>
            <tr>
              <th />
              <th v-for="d in MOD_DEST_IDS" :key="d" :title="MOD_DESTS[d].label">{{ DEST_SHORT[d] }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="src in MOD_SOURCES" :key="src.id">
              <th class="src">{{ src.label }}</th>
              <td v-for="d in MOD_DEST_IDS" :key="d" :class="{ active: amount(src.id, d) !== 0 }">
                <Knob
                  :model-value="amount(src.id, d)"
                  :label="''"
                  :min="-1"
                  :max="1"
                  :step="0.01"
                  :default="0"
                  bipolar
                  :size="24"
                  :color="amount(src.id, d) ? 'primary' : 'surface-variant'"
                  :format="(v: number) => (v ? fmtRouteAmount(d, v) : '·')"
                  @update:model-value="(v: number) => setAmount(src.id, d, v)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="hint">Select a pad to edit its matrix.</p>

      <footer>
        <span class="count">{{ routeCount }} ROUTE{{ routeCount === 1 ? '' : 'S' }}</span>
        <span class="hint">Double-click a cell to clear it · Bend always bends pitch (pad BEND range; MPE notes use NOTE BEND)</span>
        <v-spacer />
        <button class="hw-btn" :disabled="!routeCount" @click="clearAll">CLEAR ALL</button>
      </footer>
    </div>
  </v-dialog>
</template>

<style scoped>
.matrix {
  padding: 12px 14px;
  border-radius: 8px;
  color: var(--text);
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.015) 0 1px, transparent 1px 3px),
    linear-gradient(180deg, var(--panel-hi) 0%, var(--panel-lo) 100%);
  border: 1px solid #000;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.8),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  overflow: auto;
}
header,
footer {
  display: flex;
  align-items: center;
  gap: 10px;
}
h3 {
  margin: 0;
  font-family: 'Orbitron', sans-serif;
  font-weight: 900;
  font-size: 15px;
  letter-spacing: 0.18em;
  color: var(--c-primary);
  text-shadow: 0 0 8px color-mix(in srgb, var(--c-primary) 50%, transparent);
}
.tabs {
  display: flex;
  gap: 4px;
}
.tabs button {
  padding: 3px 10px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 17px;
  color: var(--text-mute);
  background: #111;
  border: 1px solid #000;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-transform: uppercase;
}
.tabs button.on {
  color: var(--c-secondary);
  text-shadow: 0 0 5px color-mix(in srgb, var(--c-secondary) 70%, transparent);
  box-shadow: inset 0 0 8px color-mix(in srgb, var(--c-secondary) 20%, transparent);
}
.tabs button:disabled {
  opacity: 0.4;
}
.hint {
  margin: 6px 0;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: var(--text-mute);
}
.top {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.module {
  flex: 1 1 auto;
  padding: 4px 8px 6px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.2);
}
.module h4 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 4px;
  font-family: 'Orbitron', sans-serif;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.18em;
  color: var(--text-head);
}
.led {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--c-accent);
  box-shadow: 0 0 6px var(--c-accent);
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.shapes {
  display: grid;
  grid-template-columns: repeat(4, 26px);
  gap: 3px;
}
.shape {
  display: grid;
  place-items: center;
  height: 22px;
  padding: 0;
  border-radius: 3px;
  color: var(--text-mute);
  background: #111;
  border: 1px solid #000;
}
.chip {
  padding: 0 6px;
  border-radius: 2px;
  font-family: 'VT323', monospace;
  font-size: 13px;
  line-height: 14px;
  color: var(--text-mute);
  background: #111;
  border: 1px solid #000;
}
.chip.on {
  color: var(--c-secondary);
  text-shadow: 0 0 4px color-mix(in srgb, var(--c-secondary) 70%, transparent);
}
.shape.flip :deep(.v-icon) {
  transform: scaleX(-1);
}
.shape.on {
  color: var(--c-accent);
  box-shadow: inset 0 0 8px color-mix(in srgb, var(--c-accent) 35%, transparent);
}
.grid-wrap {
  overflow-x: auto;
  padding: 6px;
  border-radius: 4px;
  background: var(--lcd-bg);
  box-shadow: inset 0 1px 6px rgba(0, 0, 0, 0.9);
}
.grid {
  border-collapse: separate;
  border-spacing: 2px;
  margin: 0 auto;
}
.grid th {
  font-family: 'Orbitron', sans-serif;
  font-size: 7.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--text-dim);
  padding: 2px 3px;
  white-space: nowrap;
}
.grid th.src {
  text-align: right;
  color: var(--c-accent);
}
.grid td {
  padding: 2px 1px 0;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.02);
}
.grid td:not(.active) :deep(.readout) {
  color: #444;
  text-shadow: none;
}
.grid td.active {
  background: color-mix(in srgb, var(--c-primary) 9%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-primary) 35%, transparent);
}
.grid :deep(.label) {
  display: none;
}
footer {
  margin-top: 8px;
}
footer .hint {
  flex: 1;
  min-width: 0;
  margin: 0;
}
.count {
  white-space: nowrap;
  font-family: 'VT323', monospace;
  font-size: 17px;
  color: var(--c-primary);
}
</style>
