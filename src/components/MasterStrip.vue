<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { activeVoices, clock } from '../audio/engine'
import { useBoard } from '../stores/board'
import { fmtNum, fmtPct, fmtRate, fmtScale, fmtSec, midiNoteName } from '../lib/format'
import { DIVISIONS } from '../types'
import Knob from './Knob.vue'
import VuMeter from './VuMeter.vue'

const board = useBoard()
const emit = defineEmits<{ add: []; addFolder: []; library: [] }>()
const importInput = ref<HTMLInputElement>()
const strip = ref<HTMLElement>()

// publish the header's height for layouts that fill the rest of the window (grid mode)
let ro: ResizeObserver | undefined
const publishHeight = () => {
  if (strip.value)
    document.documentElement.style.setProperty('--strip-h', `${Math.ceil(strip.value.getBoundingClientRect().height)}px`)
}
onMounted(() => {
  publishHeight()
  ro = new ResizeObserver(publishHeight)
  if (strip.value) ro.observe(strip.value)
})
onBeforeUnmount(() => ro?.disconnect())
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

// tempo
const following = computed(() => board.master.clockSource === 'midi')
const beatLed = computed(() => (clock.value * board.bpm) / 60 % 1 < 0.15)
const bpmLabel = computed(() => (following.value && !board.tempo.extBpm ? '---' : board.bpm.toFixed(board.bpm % 1 ? 1 : 0)))
const delayDiv = computed(() => Math.max(0, DIVISIONS.findIndex((d) => d.id === fx.value.delayDivision)))
const fmtDiv = (v: number) => DIVISIONS[Math.round(v)]?.id ?? ''
const fmtNote = (v: number) => midiNoteName(Math.round(v))

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
  <header ref="strip" class="strip">
    <button
      class="brand"
      :title="`Theme: ${board.theme.name} — click for next, Shift-click for previous`"
      @click="(e: MouseEvent) => board.cycleTheme(e.shiftKey ? -1 : 1)"
    >
      <span class="logo">SSB</span>
      <span class="theme-name">{{ board.theme.name }}</span>
    </button>

    <section class="group">
      <h5>OUTPUT</h5>
      <div class="controls">
        <Knob v-model="board.master.volume" label="MASTER" :max="1.2" :default="0.8" :format="fmtPct" :size="K" />
        <button
          class="hw-btn icon"
          :class="{ lit: board.master.muted }"
          :title="board.master.muted ? 'Unmute' : 'Mute'"
          @click="board.master.muted = !board.master.muted"
        >
          <v-icon size="16" :icon="board.master.muted ? 'mdi-volume-off' : 'mdi-volume-high'" />
        </button>
        <button class="panic" title="PANIC — stop all sounds (Space)" @click="board.panic()">
          <v-icon size="18" icon="mdi-alert-octagon" />
        </button>
        <VuMeter />
      </div>
    </section>

    <section class="group">
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
          class="hw-btn icon play"
          :class="{ lit: board.master.play }"
          title="PLAY: MIDI and the computer keyboard (Z / Q rows, - = octave) play the selected patch. C4 = original pitch."
          @click="board.master.play = !board.master.play"
        >
          <v-icon size="16" icon="mdi-piano" />
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
        <div class="stack">
          <button
            class="chip"
            :class="{ on: board.perform.sustain }"
            title="Sustain pedal (MIDI CC64) — click to latch"
            @click="board.perform.sustain = !board.perform.sustain"
          >
            SUS
          </button>
        </div>
        <button
          class="hw-btn icon"
          :class="{ lit: board.master.mod.routes.length }"
          title="Global modulation matrix (LFOs, mod wheel, aftertouch, velocity, bend, timbre)"
          @click="board.openMatrix('global')"
        >
          <v-icon size="16" icon="mdi-matrix" />
        </button>
      </div>
    </section>

    <section class="group">
      <h5>TEMPO · MIDI</h5>
      <div class="controls">
        <div class="bpm-knob" :title="following ? 'Following MIDI clock (knob sets the fallback tempo)' : 'Internal tempo'">
          <Knob
            v-model="board.master.bpm"
            label="BPM"
            :min="40"
            :max="240"
            :step="0.5"
            :default="120"
            :format="() => bpmLabel"
            :size="K"
          />
          <i class="beat" :class="{ on: beatLed && (!following || board.tempo.extBpm) }" />
        </div>
        <div class="stack">
          <button
            class="chip"
            :class="{ on: following }"
            title="Tempo source: INT = BPM knob, EXT = incoming MIDI clock (MIDI Start restarts global LFOs)"
            @click="board.master.clockSource = following ? 'internal' : 'midi'"
          >
            {{ following ? 'EXT' : 'INT' }}
          </button>
          <button
            class="chip"
            :class="{ on: board.master.midiAuto }"
            title="MIDI pad mapping: AUTO = notes map to pads in grid order from BASE; LRN = each pad's learned note"
            @click="board.master.midiAuto = !board.master.midiAuto"
          >
            {{ board.master.midiAuto ? 'AUTO' : 'LRN' }}
          </button>
        </div>
        <Knob
          v-if="board.master.midiAuto"
          v-model="board.master.midiBase"
          label="BASE"
          :min="0"
          :max="127"
          :step="1"
          :default="36"
          :format="fmtNote"
          :size="K"
        />
        <button
          class="hw-btn icon"
          :class="{ lit: board.midi.enabled }"
          :title="board.midi.enabled ? `MIDI on (${board.midi.inputs} inputs)` : 'Enable MIDI'"
          @click="board.enableMidi()"
        >
          <v-icon size="16" icon="mdi-midi-port" />
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
      <h5>
        DELAY
        <button
          class="chip tiny"
          :class="{ on: fx.delaySync }"
          title="Sync delay time to tempo"
          @click="fx.delaySync = !fx.delaySync"
        >
          SYNC
        </button>
      </h5>
      <div class="controls">
        <Knob
          v-if="fx.delaySync"
          :model-value="delayDiv"
          label="DIV"
          :min="0"
          :max="DIVISIONS.length - 1"
          :step="1"
          :default="8"
          :format="fmtDiv"
          :size="K"
          color="success"
          @update:model-value="(v: number) => (fx.delayDivision = DIVISIONS[Math.round(v)].id)"
        />
        <Knob v-else v-model="fx.delayTime" label="TIME" :min="0.01" :max="2" curve="log" :default="0.375" :format="fmtSec" :size="K" color="success" />
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
        <button
          class="hw-btn icon"
          :class="{ lit: board.master.view === 'grid' }"
          :title="board.master.view === 'grid' ? 'Show pads' : 'Show grid (spreadsheet view)'"
          @click="board.master.view = board.master.view === 'grid' ? 'pads' : 'grid'"
        >
          <v-icon size="16" :icon="board.master.view === 'grid' ? 'mdi-view-grid' : 'mdi-table'" />
        </button>
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
        <v-menu location="bottom end">
          <template #activator="{ props: act }">
            <button class="hw-btn icon" title="Add sounds" v-bind="act"><v-icon size="16" icon="mdi-plus" /></button>
          </template>
          <div class="add-menu">
            <button @click="emit('add')"><v-icon size="16" icon="mdi-file-music" /> ADD FILES… <small>audio · .sfz · .zip</small></button>
            <button @click="emit('addFolder')"><v-icon size="16" icon="mdi-folder-music" /> ADD FOLDER… <small>SFZ instrument + samples</small></button>
            <button @click="emit('library')"><v-icon size="16" icon="mdi-music-box-multiple" /> BROWSE LIBRARY… <small>SFZ · GM · drums · URL</small></button>
          </div>
        </v-menu>
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
  gap: 4px;
  padding: 5px 8px;
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.02) 0 1px, transparent 1px 4px),
    linear-gradient(180deg, var(--panel-hi) 0%, var(--panel-mid) 50%, var(--panel-lo) 100%);
  border-bottom: 2px solid #000;
  border-left: 14px solid var(--wood);
  border-right: 14px solid var(--wood);
  border-image: linear-gradient(90deg, var(--wood-hi), var(--wood), var(--wood-lo)) 1;
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}
@media (min-width: 1500px) {
  .strip {
    position: sticky;
    top: 0;
  }
}
.brand {
  background: none;
  border: 0;
  color: inherit;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  border-radius: 4px;
  cursor: pointer;
}
.brand:hover {
  background: rgba(255, 255, 255, 0.05);
}
.logo {
  font-family: 'Orbitron', sans-serif;
  font-weight: 900;
  font-style: italic;
  font-size: 22px;
  line-height: 1;
  letter-spacing: 0.04em;
  background: linear-gradient(180deg, var(--logo-1) 0%, var(--logo-2) 50%, var(--logo-3) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 1px 0 #000);
}
.theme-name {
  margin-top: 3px;
  font-family: 'VT323', monospace;
  font-size: 12px;
  line-height: 1;
  letter-spacing: 0.06em;
  color: var(--text-mute);
  white-space: nowrap;
}
.group {
  display: flex;
  flex-direction: column;
  padding: 2px 4px 3px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.16);
}
.group h5 {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0 0 1px;
  font-family: 'Orbitron', sans-serif;
  font-size: 7px;
  font-weight: 900;
  letter-spacing: 0.2em;
  color: var(--text-head);
  opacity: 0.75;
}
.controls {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 5px;
}
.panic {
  display: grid;
  place-items: center;
  width: 34px;
  height: 32px;
  padding: 0;
  border-radius: 5px;
  color: #fff;
  background: linear-gradient(180deg, #ff5a4a 0%, #c81d10 55%, #8e0f06 100%);
  border: 1px solid #3a0400;
  box-shadow:
    0 3px 0 #2a0200,
    0 0 12px rgba(255, 60, 40, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
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
  background: var(--lcd-bg);
  box-shadow:
    inset 0 1px 4px rgba(0, 0, 0, 0.95),
    0 1px 0 rgba(255, 255, 255, 0.07);
  font-family: 'VT323', monospace;
  font-size: 22px;
  color: var(--c-primary);
  text-shadow: 0 0 6px color-mix(in srgb, var(--c-primary) 80%, transparent);
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
/* fixed width: content changes never move the rest of the strip */
.marquee {
  width: 150px;
  flex: none;
}
.marquee.idle {
  color: var(--lcd-idle);
  text-shadow: none;
  justify-content: center;
}
.lcd {
  width: 104px;
  flex: none;
  color: var(--c-secondary);
  text-shadow: 0 0 6px color-mix(in srgb, var(--c-secondary) 80%, transparent);
  text-overflow: ellipsis;
}
.bpm-knob {
  position: relative;
}
.beat {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--c-danger) 25%, #000);
}
.beat.on {
  background: var(--c-danger);
  box-shadow: 0 0 6px var(--c-danger);
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
  color: var(--c-secondary);
  text-shadow: 0 0 6px color-mix(in srgb, var(--c-secondary) 80%, transparent);
  box-shadow:
    0 2px 0 #0a0a0b,
    inset 0 0 10px color-mix(in srgb, var(--c-secondary) 30%, transparent);
}
.stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.chip {
  padding: 0 5px;
  border-radius: 2px;
  font-family: 'VT323', monospace;
  font-size: 13px;
  letter-spacing: 0.08em;
  line-height: 12px;
  color: var(--text-dim);
  background: #111;
  border: 1px solid #000;
  white-space: nowrap;
}
.chip.on {
  color: var(--c-secondary);
  text-shadow: 0 0 4px color-mix(in srgb, var(--c-secondary) 70%, transparent);
}
.chip.dim {
  color: var(--text-mute);
}
.chip.tiny {
  font-size: 11px;
  line-height: 9px;
  padding: 0 3px;
  letter-spacing: 0.04em;
}
.add-menu {
  display: flex;
  flex-direction: column;
  padding: 4px;
  border-radius: 6px;
  background: linear-gradient(180deg, var(--panel-hi), var(--panel-lo));
  border: 1px solid #000;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
}
.add-menu button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 4px;
  font-family: 'Orbitron', sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--text);
  text-align: left;
}
.add-menu button:hover {
  background: color-mix(in srgb, var(--c-primary) 18%, transparent);
  color: var(--c-primary);
}
.add-menu small {
  margin-left: auto;
  padding-left: 12px;
  font-family: 'VT323', monospace;
  font-size: 14px;
  font-weight: 400;
  letter-spacing: 0.04em;
  color: var(--text-mute);
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
  color: var(--text-dim);
  background: #19181c;
  border: 1px solid #000;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  white-space: nowrap;
}
.tag-chip.on {
  color: #111;
  background: var(--c-primary);
  box-shadow: 0 0 8px color-mix(in srgb, var(--c-primary) 60%, transparent);
}
</style>
