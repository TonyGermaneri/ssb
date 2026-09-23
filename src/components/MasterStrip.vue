<script setup lang="ts">
import { computed, ref } from 'vue'
import { activeVoices } from '../audio/engine'
import { useBoard } from '../stores/board'
import { fmtNum, fmtRate, fmtPct, fmtScale, fmtSec, midiNoteName } from '../lib/format'
import Knob from './Knob.vue'
import VuMeter from './VuMeter.vue'

const board = useBoard()
const emit = defineEmits<{ add: [] }>()
const importInput = ref<HTMLInputElement>()
const fx = computed(() => board.master.fx)
const K = 28 // header knob size

/** "AIRHORN ×2 · PAD C4 E4" */
const nowPlaying = computed(() => {
  const counts = new Map<string, { n: number; notes: string[] }>()
  for (const v of activeVoices.value) {
    const name = board.byId(v.soundId)?.settings.name ?? v.name
    const e = counts.get(name) ?? { n: 0, notes: [] }
    e.n++
    if (v.midiNote !== undefined) e.notes.push(midiNoteName(v.midiNote))
    counts.set(name, e)
  }
  return [...counts]
    .map(([name, e]) => (e.notes.length ? `${name} ${e.notes.join(' ')}` : e.n > 1 ? `${name} ×${e.n}` : name))
    .join('  ·  ')
})

const patchLabel = computed(() =>
  board.selected ? `${String(board.selectedNumber).padStart(2, '0')} ${board.selected.settings.name}` : '-- NO PATCH',
)
const octaveLabel = computed(() => {
  const o = board.master.octave
  return `OCT ${o > 0 ? '+' : ''}${o}`
})

function toggleTag(tag: string) {
  const f = board.tagFilter
  board.tagFilter = f.includes(tag) ? f.filter((t) => t !== tag) : [...f, tag]
}
function onImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) board.importBoard(file)
  ;(e.target as HTMLInputElement).value = ''
}
</script>

<template>
  <header class="strip">
    <div class="brand">
      <span class="logo">SSB</span>
      <span class="model">SOUNDBOARD<br />MODEL 85</span>
    </div>

    <section class="group">
      <h5>OUTPUT</h5>
      <div class="controls">
        <Knob v-model="board.master.volume" label="MASTER" :max="1.2" :default="0.8" :format="fmtPct" :size="K" />
        <button
          class="hw-btn"
          :class="{ lit: board.master.muted }"
          title="Master mute"
          @click="board.master.muted = !board.master.muted"
        >
          <v-icon size="15" :icon="board.master.muted ? 'mdi-volume-off' : 'mdi-volume-high'" />
          MUTE
        </button>
        <button class="panic" title="Stop all sounds (Space)" @click="board.panic()">
          <v-icon size="16" icon="mdi-alert-octagon" />
          PANIC!
        </button>
        <VuMeter />
      </div>
    </section>

    <section class="group display">
      <h5>NOW PLAYING</h5>
      <div class="controls">
        <div class="marquee" :class="{ idle: !nowPlaying }">
          <span v-if="nowPlaying" :key="nowPlaying" class="scroll">▸ {{ nowPlaying }}</span>
          <span v-else>— READY —</span>
        </div>
      </div>
    </section>

    <section class="group">
      <h5>PATCH</h5>
      <div class="controls">
        <button class="hw-btn icon" title="Previous patch" @click="board.selectStep(-1)">
          <v-icon size="18" icon="mdi-chevron-left" />
        </button>
        <div class="lcd" :title="board.selected ? `Selected patch: ${board.selected.settings.name}` : 'Select a pad with its piano button'">
          {{ patchLabel }}
        </div>
        <button class="hw-btn icon" title="Next patch" @click="board.selectStep(1)">
          <v-icon size="18" icon="mdi-chevron-right" />
        </button>
        <button
          class="hw-btn play"
          :class="{ lit: board.master.play }"
          title="Keyboard play: MIDI and the computer keyboard (Z / Q rows, - = octave) play the selected patch. C4 = original pitch."
          @click="board.master.play = !board.master.play"
        >
          <v-icon size="15" icon="mdi-piano" />
          PLAY
        </button>
        <div class="stack">
          <button
            class="chip"
            :class="{ on: board.master.mono }"
            title="MONO: one voice, legato glide between held notes. POLY: every note its own voice."
            @click="board.master.mono = !board.master.mono"
          >
            {{ board.master.mono ? 'MONO' : 'POLY' }}
          </button>
          <button
            class="chip"
            :class="{ on: board.master.mpe }"
            title="MPE (lower zone): channel 1 is global; notes on channels 2-16 get their own bend, pressure and timbre"
            @click="board.master.mpe = !board.master.mpe"
          >
            MPE
          </button>
          <span class="chip dim" title="Computer-keyboard octave (- / = keys)">{{ octaveLabel }}</span>
        </div>
        <Knob v-model="board.master.glide" label="GLIDE" :min="0" :max="2" :step="0.005" :default="0" :format="fmtSec" :size="K" />
      </div>
    </section>

    <section class="group">
      <h5>PERFORM</h5>
      <div class="controls">
        <Knob v-model="board.perform.mod" label="MOD" :default="0" :format="fmtPct" :size="K" color="secondary" />
        <Knob v-model="board.perform.bend" label="BEND" :min="-1" :max="1" :default="0" bipolar spring :format="fmtPct" :size="K" color="secondary" />
        <button
          class="hw-btn"
          :class="{ lit: board.master.mod.routes.length }"
          title="Global modulation matrix (LFOs, mod wheel, aftertouch, velocity, bend)"
          @click="board.openMatrix('global')"
        >
          <v-icon size="15" icon="mdi-matrix" />
          MATRIX
        </button>
      </div>
    </section>

    <section class="group">
      <h5>CHORUS</h5>
      <div class="controls">
        <Knob v-model="fx.chorusRate" label="RATE" :min="0.05" :max="8" curve="log" :default="0.6" :format="fmtRate" :size="K" color="accent" />
        <Knob v-model="fx.chorusDepth" label="DEPTH" :default="0.5" :format="fmtPct" :size="K" color="accent" />
        <Knob v-model="fx.chorusMix" label="MIX" :default="0" :format="fmtPct" :size="K" color="accent" />
      </div>
    </section>

    <section class="group">
      <h5>DELAY</h5>
      <div class="controls">
        <Knob v-model="fx.delayTime" label="TIME" :min="0.01" :max="2" curve="log" :default="0.375" :format="fmtSec" :size="K" color="success" />
        <Knob v-model="fx.delayFeedback" label="FDBK" :max="0.9" :default="0.4" :format="fmtPct" :size="K" color="success" />
        <Knob v-model="fx.delayMix" label="MIX" :default="0" :format="fmtPct" :size="K" color="success" />
      </div>
    </section>

    <section class="group">
      <h5>REVERB</h5>
      <div class="controls">
        <Knob v-model="fx.reverbSize" label="SIZE" :min="0.1" :max="8" :default="3" :format="fmtSec" :size="K" color="success" />
        <Knob v-model="fx.reverbDecay" label="DECAY" :min="0.5" :max="10" :default="3" :format="fmtNum" :size="K" color="success" />
        <Knob v-model="fx.reverbMix" label="MIX" :default="0" :format="fmtPct" :size="K" color="success" />
      </div>
    </section>


    <section v-if="board.tags.length" class="group">
      <h5>TAGS</h5>
      <div class="controls tags">
        <button
          v-for="t in board.tags"
          :key="t"
          class="tag-chip"
          :class="{ on: board.tagFilter.includes(t) }"
          @click="toggleTag(t)"
        >
          {{ t }}
        </button>
        <button v-if="board.tagFilter.length" class="tag-chip clear" title="Clear filter" @click="board.tagFilter = []">
          ✕
        </button>
      </div>
    </section>

    <section class="group">
      <h5>BOARD</h5>
      <div class="controls">
        <Knob v-model="board.master.scale" label="SCALE" :min="0.5" :max="2" :step="0.05" :default="1" :format="fmtScale" :size="K" color="secondary" />
        <button
          class="hw-btn icon"
          :class="{ lit: board.master.scanlines }"
          title="CRT scanlines"
          @click="board.master.scanlines = !board.master.scanlines"
        >
          <v-icon size="16" icon="mdi-television-classic" />
        </button>
        <button class="hw-btn icon" title="Undo (⌘Z)" :disabled="!board.canUndo" @click="board.undo()">
          <v-icon size="16" icon="mdi-undo" />
        </button>
        <button class="hw-btn icon" title="Redo (⇧⌘Z)" :disabled="!board.canRedo" @click="board.redo()">
          <v-icon size="16" icon="mdi-redo" />
        </button>
        <button class="hw-btn icon" title="Add sounds" @click="emit('add')"><v-icon size="16" icon="mdi-plus" /></button>
        <button
          class="hw-btn icon"
          :class="{ lit: board.midi.enabled }"
          :title="board.midi.enabled ? `MIDI on (${board.midi.inputs} inputs)` : 'Enable MIDI'"
          @click="board.enableMidi()"
        >
          <v-icon size="16" icon="mdi-midi-port" />
        </button>
        <button class="hw-btn icon" title="Export board (.zip)" @click="board.exportBoard()">
          <v-icon size="16" icon="mdi-download" />
        </button>
        <button class="hw-btn icon" title="Import board (.zip)" @click="importInput?.click()">
          <v-icon size="16" icon="mdi-upload" />
        </button>
        <input ref="importInput" type="file" accept=".zip" hidden @change="onImport" />
      </div>
    </section>
  </header>
</template>

<style scoped>
.strip {
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 6px 6px;
  padding: 6px 10px;
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.02) 0 1px, transparent 1px 4px),
    linear-gradient(180deg, #4a4850 0%, #2d2c32 50%, #232227 100%);
  border-bottom: 2px solid #000;
  border-left: 14px solid #5b3a22;
  border-right: 14px solid #5b3a22;
  border-image: linear-gradient(90deg, #6d4527, #3e2615) 1;
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}
/* one row on wide screens: keep it pinned */
@media (min-width: 1500px) {
  .strip {
    position: sticky;
    top: 0;
  }
}
.brand {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-right: 4px;
}
.logo {
  font-family: 'Orbitron', sans-serif;
  font-weight: 900;
  font-style: italic;
  font-size: 22px;
  letter-spacing: 0.04em;
  background: linear-gradient(180deg, #ffe07a 0%, #ff8a00 50%, #ff2d6f 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 1px 0 #000);
}
@media (max-width: 2100px) {
  .model {
    display: none;
  }
}
.model {
  font-family: 'Orbitron', sans-serif;
  font-size: 7px;
  font-weight: 700;
  letter-spacing: 0.2em;
  line-height: 1.4;
  color: #b9b4a8;
}
.group {
  display: flex;
  flex-direction: column;
  padding: 2px 6px 3px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.16);
}
.group h5 {
  margin: 0 0 1px;
  font-family: 'Orbitron', sans-serif;
  font-size: 7px;
  font-weight: 900;
  letter-spacing: 0.2em;
  color: #e8dcc0;
  opacity: 0.6;
}
.controls {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
}
.display {
  flex: 1 1 40px;
  min-width: 0;
}
.display .controls {
  min-width: 0;
}
.panic {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border-radius: 5px;
  font-family: 'Orbitron', sans-serif;
  font-weight: 900;
  font-size: 12px;
  letter-spacing: 0.12em;
  color: #fff;
  background: linear-gradient(180deg, #ff5a4a 0%, #c81d10 55%, #8e0f06 100%);
  border: 1px solid #3a0400;
  box-shadow:
    0 3px 0 #2a0200,
    0 0 12px rgba(255, 60, 40, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.5);
}
.panic:active {
  transform: translateY(2px);
  box-shadow:
    0 1px 0 #2a0200,
    0 0 18px rgba(255, 60, 40, 0.6),
    inset 0 2px 4px rgba(0, 0, 0, 0.4);
}
.marquee,
.lcd {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 10px;
  border-radius: 3px;
  background: #0b0703;
  box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.95), 0 1px 0 rgba(255, 255, 255, 0.07);
  font-family: 'VT323', monospace;
  font-size: 22px;
  color: #ffb000;
  text-shadow: 0 0 6px rgba(255, 176, 0, 0.8);
  white-space: nowrap;
  text-transform: uppercase;
}
.marquee::after,
.lcd::after {
  /* LED dot-matrix mask */
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle, transparent 55%, rgba(0, 0, 0, 0.45) 60%) 0 0 / 3px 3px;
  pointer-events: none;
}
.marquee {
  flex: 1 1 60px;
  min-width: 0;
}
.marquee.idle {
  color: #5a3d00;
  text-shadow: none;
  justify-content: center;
}
.lcd {
  width: 110px;
  color: #27e0ff;
  text-shadow: 0 0 6px rgba(39, 224, 255, 0.8);
  text-overflow: ellipsis;
}
.scroll {
  display: inline-block;
  padding-left: 100%;
  animation: scroll 9s linear infinite;
}
@keyframes scroll {
  to {
    transform: translateX(-100%);
  }
}
.play.lit {
  color: #27e0ff;
  text-shadow: 0 0 6px rgba(39, 224, 255, 0.8);
  box-shadow:
    0 2px 0 #0a0a0b,
    inset 0 0 10px rgba(39, 224, 255, 0.3);
}
.stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stack .chip {
  line-height: 12px;
}
.chip {
  padding: 0 5px;
  border-radius: 2px;
  font-family: 'VT323', monospace;
  font-size: 13px;
  letter-spacing: 0.08em;
  line-height: 14px;
  color: #b9b4a8;
  background: #111;
  border: 1px solid #000;
  white-space: nowrap;
}
.chip.on {
  color: #27e0ff;
  text-shadow: 0 0 4px rgba(39, 224, 255, 0.7);
}
.chip.dim {
  color: #8a8579;
}
.tags {
  max-width: 280px;
  overflow-x: auto;
}
.tag-chip {
  padding: 2px 8px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 16px;
  color: #b9b4a8;
  background: #19181c;
  border: 1px solid #000;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  white-space: nowrap;
}
.tag-chip.on {
  color: #111;
  background: #ffb000;
  box-shadow: 0 0 8px rgba(255, 176, 0, 0.6);
}
</style>
