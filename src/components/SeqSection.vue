<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useBoard } from '../stores/board'
import type { Sound } from '../types'
import { gridLayout, SCALES, toggleGrid } from '../lib/play/seq'
import { envPoint, envWrite, type Point } from '../lib/play/pads'
import { crosshair, drawEnv, type Colors } from '../lib/play/draw'
import PlayPad from './PlayPad.vue'

/**
 * The Play view's SEQUENCER (SpaceCraft's notes grid, its manual's section 4): a piano in rows, an octave a row, the
 * scale's notes across, the pad with the triangle the sample's own key. With SEQ on, a pad clicked goes into the grid
 * and stays until clicked again; the keys and MIDI put their notes in while they're held; the VCO's grains take turns
 * through all of them (board.ts, Engine.cpp). ENVELOPE ON adds its pad: each note's attack (up / down) and release
 * (left / right). ✕ takes every note out; LATCH holds what the keys play (HOLD).
 */
const props = defineProps<{ sound: Sound; colors: Colors; keyNotes: number[] }>()
const board = useBoard()
const s = computed(() => props.sound.settings)
const layout = computed(() => gridLayout(s.value.seqScale))
const lit = computed(() => new Set(s.value.seqGrid ?? []))
const keyed = computed(() => new Set(props.keyNotes))
const showSettings = ref(false)

function toggleSeq() {
  const on = !s.value.seq
  s.value.seq = on
  // the grid's notes are its grains': SEQ plays grains
  if (on && !s.value.grain) board.toggleGrain(props.sound.id)
}
function pad(semis: number) {
  s.value.seqGrid = toggleGrid(s.value.seqGrid ?? [], semis, !!s.value.seqSingle)
}
const padTitle = (semis: number) =>
  `${semis === 0 ? 'The sample\'s own key' : `${semis > 0 ? '+' : ''}${semis} semitones`} — click: into the grid (again: out)`

// the envelope pad
const envPad = ref<{ paint(): void }>()
let held: Point | null = null
const envAt = () => held ?? envPoint(s.value)
const drawEnvPad = (g: CanvasRenderingContext2D, w: number, h: number, dpr: number) => {
  const at = envAt()
  drawEnv(g, w, h, { at, colors: props.colors, dpr })
  crosshair(g, w, h, at, props.colors, dpr)
}
function envMove(p: Point) {
  held = p
  const w = envWrite(p)
  if (w.seqAttack !== s.value.seqAttack) s.value.seqAttack = w.seqAttack
  if (w.seqRelease !== s.value.seqRelease) s.value.seqRelease = w.seqRelease
  envPad.value?.paint()
}
function envEnd() {
  held = null
  envPad.value?.paint()
}
function envReset() {
  s.value.seqAttack = 0.05
  s.value.seqRelease = 0.4
}
watch(() => [s.value.seqAttack, s.value.seqRelease, props.colors.line, s.value.seqEnv], () => requestAnimationFrame(() => envPad.value?.paint()))

const fmtS = (v: number) => (v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`)
</script>

<template>
  <div class="seq" :class="{ off: !s.seq }" :style="{ '--line': colors.line, '--cross': colors.cross }" @pointerdown.stop>
    <PlayPad
      v-if="s.seqEnv"
      ref="envPad"
      class="env"
      label="ENVELOPE"
      :title="`ENVELOPE — each grid note fades in and out: up / down its attack (${fmtS(s.seqAttack)}), left / right its release (${fmtS(s.seqRelease)}). Double-click: reset`"
      :color="colors.line"
      :draw="drawEnvPad"
      square
      @move="envMove"
      @end="envEnd"
      @reset="envReset"
    />
    <div class="body">
      <div class="bar">
        <button
          class="chip"
          :class="{ on: s.seq }"
          :title="s.seq ? 'SEQ on: the keys, MIDI and the pads put notes in the grid, and the grains take turns through them — click to play the keys as voices again' : 'SEQ off: the keys play this VCO as voices — click to play it through the grid (grains)'"
          @click="toggleSeq"
        >
          SEQ {{ s.seq ? 'ON' : 'OFF' }}
        </button>
        <button class="chip" title="ALL NOTES OFF: every pad off, and the keys' notes out of the grid" @click="board.seqClear(sound.id)">✕</button>
        <button
          class="chip"
          :class="{ on: board.master.hold }"
          title="LATCH (HOLD): the keys' notes stay in the grid after you let go, until you play with no key down"
          @click="board.master.hold = !board.master.hold"
        >
          LATCH
        </button>
        <span class="scale">{{ SCALES.find((x) => x.id === s.seqScale)?.label ?? '' }}</span>
        <button class="gear" :class="{ on: showSettings }" title="Settings" @click.stop="showSettings = !showSettings">
          <v-icon size="12" icon="mdi-cog" />
        </button>
      </div>
      <div class="grid" :style="{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }">
        <template v-for="(row, r) in layout.cells" :key="r">
          <button
            v-for="semis in row"
            :key="semis"
            class="cell"
            :class="{ on: lit.has(semis), keyed: keyed.has(semis), home: semis === 0, octave: r === layout.top }"
            :title="padTitle(semis)"
            @click="pad(semis)"
          >
            <span v-if="semis === 0" class="tri">▲</span>
          </button>
        </template>
      </div>
      <span class="label">SEQUENCER</span>
    </div>
    <div v-if="showSettings" class="settings" @click.stop>
      <div class="row">
        <button class="opt" :class="{ on: !s.seqEnv }" @click="s.seqEnv = false">ENVELOPE OFF</button>
        <button class="opt" :class="{ on: s.seqEnv }" @click="s.seqEnv = true">ENVELOPE ON</button>
      </div>
      <div class="row">
        <button class="opt" :class="{ on: !s.seqSingle }" title="Any number of notes in the grid at once" @click="s.seqSingle = false">MULTI NOTES</button>
        <button class="opt" :class="{ on: s.seqSingle }" title="One note at a time: a new one replaces the last (melodies from the pads)" @click="s.seqSingle = true">SINGLE NOTE</button>
      </div>
      <div class="row">
        <select v-model="s.seqScale" class="select" title="The grid's columns; with a scale other than CHROMATIC, MIDI's white keys play its notes from the patch's root">
          <option v-for="sc in SCALES" :key="sc.id" :value="sc.id">{{ sc.label }}</option>
        </select>
      </div>
      <div class="row">
        <button class="opt" :class="{ on: !s.mpeGrain }" title="MPE: a note's sideways bend bends its pitch" @click="s.mpeGrain = false">MPE PITCH</button>
        <button class="opt" :class="{ on: s.mpeGrain }" title="MPE: a note's sideways bend moves where its grains fire, over half the clip each way" @click="s.mpeGrain = true">MPE GRAIN</button>
      </div>
      <button class="done" @click="showSettings = false">DONE</button>
    </div>
  </div>
</template>

<style scoped>
.seq {
  position: relative;
  display: flex;
  gap: 6px;
  min-width: 0;
}
.env {
  flex: 0 0 auto;
  height: 100%;
  /* square where there's room; never more than a third of the section, so the grid keeps its pads */
  max-width: 34%;
}
.body {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 5px 14px;
  border: 1.5px solid var(--line);
  border-radius: 6px;
  background: var(--lcd-bg);
}
.seq.off .grid {
  opacity: 0.45;
}
.bar {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.chip {
  flex: 0 0 auto;
  padding: 1px 5px;
  border-radius: 4px;
  font-family: 'Orbitron', sans-serif;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.12em;
  color: var(--cross);
  background: color-mix(in srgb, var(--lcd-bg) 75%, transparent);
  border: 1.5px solid color-mix(in srgb, var(--cross) 60%, transparent);
  white-space: nowrap;
}
.chip.on {
  color: var(--lcd-bg);
  background: var(--line);
  border-color: var(--line);
}
.scale {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  font-family: 'VT323', monospace;
  font-size: 13px;
  color: color-mix(in srgb, var(--line) 70%, transparent);
}
.gear {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border-radius: 3px;
  color: color-mix(in srgb, var(--line) 70%, transparent);
  background: color-mix(in srgb, var(--lcd-bg) 55%, transparent);
  border: 1px solid color-mix(in srgb, var(--line) 35%, transparent);
  opacity: 0.6;
}
.gear:hover,
.gear.on {
  opacity: 1;
}
.grid {
  flex: 1;
  display: grid;
  gap: 3px;
  grid-auto-rows: minmax(10px, 1fr);
}
.cell {
  position: relative;
  min-width: 0;
  padding: 0;
  border-radius: 3px;
  background: color-mix(in srgb, var(--line) 6%, var(--lcd-bg));
  border: 1px solid color-mix(in srgb, var(--line) 40%, transparent);
}
.cell.octave {
  border-color: color-mix(in srgb, var(--line) 65%, transparent);
}
.cell:hover {
  background: color-mix(in srgb, var(--line) 18%, var(--lcd-bg));
}
.cell.keyed {
  background: color-mix(in srgb, var(--cross) 45%, var(--lcd-bg));
  border-color: var(--cross);
}
.cell.on {
  background: var(--line);
  border-color: var(--line);
}
.tri {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 9px;
  line-height: 1;
  color: var(--line);
}
.cell.on .tri {
  color: var(--lcd-bg);
}
.label {
  position: absolute;
  left: 5px;
  bottom: 3px;
  pointer-events: none;
  font-family: 'Orbitron', sans-serif;
  font-size: 7px;
  font-weight: 900;
  letter-spacing: 0.14em;
  color: color-mix(in srgb, var(--line) 70%, transparent);
}
.settings {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: safe center;
  gap: 5px;
  padding: 6px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--lcd-bg) 92%, transparent);
  border: 1.5px solid var(--line);
  overflow: auto;
}
.row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
}
.opt,
.done,
.select {
  padding: 1px 8px;
  border-radius: 4px;
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
.select {
  appearance: auto;
  max-width: 100%;
}
.done {
  opacity: 0.8;
}
</style>
