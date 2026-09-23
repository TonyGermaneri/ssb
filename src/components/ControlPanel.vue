<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBoard } from '../stores/board'
import {
  fmtCents, fmtChoke, fmtDb, fmtDensity, fmtHz, fmtMs, fmtNum, fmtOct, fmtPan, fmtPct, fmtQ, fmtRatio,
  fmtRepeat, fmtSec, fmtSemis, fmtSemisJitter, midiNoteName,
} from '../lib/format'
import { FILTER_LABEL, TRIGGER_MODE_INFO, TRIGGER_MODES, type Sound } from '../types'
import Knob from './Knob.vue'
import Waveform from './Waveform.vue'

const props = defineProps<{ sound: Sound; hue: number }>()
const board = useBoard()
const s = computed(() => props.sound.settings)
const confirmDelete = ref(false)
const confirmReset = ref(false)
const modeInfo = computed(() => TRIGGER_MODE_INFO[s.value.mode])
const learning = computed(() => board.midi.learning === props.sound.id)

function doReset() {
  board.resetSettings(props.sound.id)
  confirmReset.value = false
}
</script>

<template>
  <div class="panel" @pointerdown.stop @click.stop>
    <div class="screws"><i /><i /><i /><i /></div>

    <Waveform :sound="sound" :hue="hue" />

    <div class="fields">
      <v-text-field v-model="s.name" label="NAME" density="compact" variant="outlined" hide-details spellcheck="false" />
      <v-combobox
        :model-value="s.tag"
        :items="board.tags"
        label="TAG"
        density="compact"
        variant="outlined"
        hide-details
        @update:model-value="(v: string | null) => (s.tag = (v ?? '').trim())"
      />
    </div>

    <div class="modules">
      <section class="module">
        <h4>PLAY</h4>
        <div class="row">
          <Knob v-model="s.volume" label="VOL" :max="1.5" :default="1" :format="fmtPct" />
          <Knob v-model="s.pan" label="PAN" :min="-1" :max="1" :default="0" bipolar :format="fmtPan" />
          <Knob v-model="s.repeat" label="RPT" :min="0" :max="16" :step="1" :default="1" :format="fmtRepeat" />
          <Knob v-model="s.choke" label="CHOKE" :min="0" :max="8" :step="1" :default="0" :format="fmtChoke" />
        </div>
      </section>

      <section class="module">
        <h4>
          TUNE
          <button
            class="chip"
            :class="{ on: s.timeMode === 'stretch' }"
            :title="s.timeMode === 'tape'
              ? 'TAPE: pitch and speed change together, like a sampler. Click for STRETCH.'
              : 'STRETCH: granular — speed and pitch are independent. Click for TAPE.'"
            @click="s.timeMode = s.timeMode === 'tape' ? 'stretch' : 'tape'"
          >
            {{ s.timeMode === 'tape' ? 'TAPE' : 'STRETCH' }}
          </button>
        </h4>
        <div class="row">
          <Knob v-model="s.pitch" label="PITCH" :min="-24" :max="24" :step="1" :default="0" bipolar :format="fmtSemis" />
          <Knob v-model="s.fine" label="FINE" :min="-100" :max="100" :step="1" :default="0" bipolar :format="fmtCents" />
          <Knob v-model="s.speed" label="SPEED" :min="0.25" :max="4" curve="log" :default="1" :format="fmtRatio" />
        </div>
      </section>

      <section class="module">
        <h4>CLIP</h4>
        <div class="row">
          <Knob v-model="s.clipIn" label="IN" :default="0" :format="fmtPct" />
          <Knob v-model="s.clipOut" label="OUT" :default="1" :format="fmtPct" />
        </div>
      </section>

      <section class="module">
        <h4>ADSR</h4>
        <div class="row">
          <Knob v-model="s.attack" label="A" :min="0.001" :max="5" curve="log" :default="0.001" :format="fmtSec" />
          <Knob v-model="s.decay" label="D" :min="0.001" :max="5" curve="log" :default="0.2" :format="fmtSec" />
          <Knob v-model="s.sustain" label="S" :default="1" :format="fmtPct" />
          <Knob v-model="s.release" label="R" :min="0.001" :max="10" curve="log" :default="0.02" :format="fmtSec" />
        </div>
      </section>

      <section class="module">
        <h4>
          FILTER
          <button class="chip on" title="Filter type — click to cycle LP / HP / BP" @click="board.cycleFilter(sound.id)">
            {{ FILTER_LABEL[s.filterType] }}
          </button>
        </h4>
        <div class="row">
          <Knob v-model="s.cutoff" label="CUTOFF" :min="20" :max="20000" curve="log" :default="20000" :format="fmtHz" color="secondary" />
          <Knob v-model="s.resonance" label="RES" :min="0.1" :max="20" curve="log" :default="0.7" :format="fmtQ" color="secondary" />
        </div>
      </section>

      <section class="module">
        <h4>FILTER ADSR</h4>
        <div class="row">
          <Knob v-model="s.fEnvAmount" label="AMT" :min="-5" :max="5" :step="0.1" :default="0" bipolar :format="fmtOct" color="secondary" />
          <Knob v-model="s.fAttack" label="A" :min="0.001" :max="5" curve="log" :default="0.001" :format="fmtSec" color="secondary" />
          <Knob v-model="s.fDecay" label="D" :min="0.001" :max="5" curve="log" :default="0.3" :format="fmtSec" color="secondary" />
          <Knob v-model="s.fSustain" label="S" :default="0" :format="fmtPct" color="secondary" />
          <Knob v-model="s.fRelease" label="R" :min="0.001" :max="10" curve="log" :default="0.2" :format="fmtSec" color="secondary" />
        </div>
      </section>

      <section class="module">
        <h4>EQ</h4>
        <div class="row">
          <Knob v-model="s.eqLow" label="BASS" :min="-12" :max="12" :step="0.5" :default="0" bipolar :format="fmtDb" color="secondary" />
          <Knob v-model="s.eqMid" label="MID" :min="-12" :max="12" :step="0.5" :default="0" bipolar :format="fmtDb" color="secondary" />
          <Knob v-model="s.eqHigh" label="TREBLE" :min="-12" :max="12" :step="0.5" :default="0" bipolar :format="fmtDb" color="secondary" />
        </div>
      </section>

      <section class="module wide">
        <h4>GRAIN</h4>
        <div class="row">
          <Knob v-model="s.grainSize" label="SIZE" :max="500" :step="1" :default="0" :format="fmtMs" color="accent" />
          <Knob v-model="s.grainPos" label="POS" :default="0.5" :format="fmtPct" color="accent" />
          <Knob v-model="s.grainWidth" label="WIDTH" :default="0" :format="fmtPct" color="accent" />
          <Knob v-model="s.grainDensity" label="DENSITY" :min="1" :max="8" :step="1" :default="2" :format="fmtDensity" color="accent" />
          <Knob v-model="s.grainJitter" label="JITTER" :max="12" :step="0.1" :default="0" :format="fmtSemisJitter" color="accent" />
          <Knob v-model="s.grainReverse" label="REVERSE" :default="0" :format="fmtPct" color="accent" />
          <Knob v-model="s.grainSpread" label="SPREAD" :default="0" :format="fmtPct" color="accent" />
        </div>
      </section>

      <section class="module">
        <h4>DELAY</h4>
        <div class="row">
          <Knob v-model="s.delayTime" label="TIME" :min="0.01" :max="2" curve="log" :default="0.25" :format="fmtSec" color="success" />
          <Knob v-model="s.delayFeedback" label="FDBK" :max="0.9" :default="0.35" :format="fmtPct" color="success" />
          <Knob v-model="s.delayMix" label="MIX" :default="0" :format="fmtPct" color="success" />
        </div>
      </section>

      <section class="module">
        <h4>REVERB</h4>
        <div class="row">
          <Knob v-model="s.reverbSize" label="SIZE" :min="0.1" :max="6" :default="2" :format="fmtSec" color="success" />
          <Knob v-model="s.reverbDecay" label="DECAY" :min="0.5" :max="10" :default="3" :format="fmtNum" color="success" />
          <Knob v-model="s.reverbMix" label="MIX" :default="0" :format="fmtPct" color="success" />
        </div>
      </section>
    </div>

    <div class="footer">
      <button class="hw-btn mode" :title="`${modeInfo.hint} — click to cycle`" @click="board.cycleMode(sound.id)">
        <span class="leds">
          <i v-for="m in TRIGGER_MODES" :key="m" :class="{ on: m === s.mode }" />
        </span>
        <v-icon size="14" :icon="modeInfo.icon" />
        {{ modeInfo.label }}
      </button>
      <button
        class="hw-btn"
        :class="{ blink: learning }"
        title="MIDI learn: click, then play a note"
        @click="board.learnMidi(sound.id)"
      >
        <v-icon size="14" icon="mdi-piano" />
        {{ learning ? 'PLAY NOTE…' : s.midiNote !== null ? midiNoteName(s.midiNote) : 'LEARN' }}
      </button>
      <v-spacer />
      <template v-if="confirmReset">
        <button class="hw-btn danger" @click="doReset">RESET?</button>
        <button class="hw-btn icon" title="Cancel" @click="confirmReset = false">
          <v-icon size="16" icon="mdi-close" />
        </button>
      </template>
      <button v-else class="hw-btn" title="Reset all knobs to defaults (keeps name, tag, MIDI note)" @click="confirmReset = true">
        <v-icon size="14" icon="mdi-restore" />
        RESET
      </button>
      <button class="hw-btn icon" title="Duplicate" @click="board.duplicate(sound.id)">
        <v-icon size="16" icon="mdi-content-copy" />
      </button>
      <template v-if="confirmDelete">
        <button class="hw-btn danger" @click="board.remove(sound.id)">DELETE?</button>
        <button class="hw-btn icon" title="Cancel" @click="confirmDelete = false">
          <v-icon size="16" icon="mdi-close" />
        </button>
      </template>
      <button v-else class="hw-btn icon" title="Delete" @click="confirmDelete = true">
        <v-icon size="16" icon="mdi-delete" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.panel {
  position: relative;
  width: 412px;
  padding: 12px 12px 10px;
  margin-bottom: 8px;
  border-radius: 6px;
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.015) 0 1px, transparent 1px 3px),
    linear-gradient(180deg, #3a3940 0%, #2a292f 55%, #222126 100%);
  box-shadow:
    0 10px 24px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    inset 0 -2px 0 rgba(0, 0, 0, 0.4);
  border: 1px solid #111;
  cursor: default;
}
.screws i {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #9a98a0, #3c3b40);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.5);
}
.screws i:nth-child(1) { top: 4px; left: 4px; }
.screws i:nth-child(2) { top: 4px; right: 4px; }
.screws i:nth-child(3) { bottom: 4px; left: 4px; }
.screws i:nth-child(4) { bottom: 4px; right: 4px; }
.fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 8px 0 6px;
}
.fields :deep(.v-field) {
  font-family: 'VT323', monospace;
  font-size: 18px;
  background: #0d0c0f;
  color: rgb(var(--v-theme-primary));
}
.fields :deep(.v-label) {
  font-family: 'Orbitron', sans-serif;
  font-size: 9px;
  letter-spacing: 0.1em;
}
.modules {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.module {
  flex: 1 1 auto;
  padding: 3px 4px 4px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.18);
}
.module.wide {
  flex-basis: 100%;
}
.module h4 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 2px 2px;
  font-family: 'Orbitron', sans-serif;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.18em;
  color: #e8dcc0;
}
.chip {
  padding: 0 5px;
  border-radius: 2px;
  font-family: 'VT323', monospace;
  font-size: 12px;
  letter-spacing: 0.08em;
  line-height: 13px;
  color: #b9b4a8;
  background: #111;
  border: 1px solid #000;
}
.chip.on {
  color: #27e0ff;
  text-shadow: 0 0 4px rgba(39, 224, 255, 0.7);
}
.row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-around;
}
.footer {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}
.mode {
  min-width: 108px;
}
.leds {
  display: inline-flex;
  gap: 2px;
  margin-right: 2px;
}
.leds i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #3a1a08;
}
.leds i.on {
  background: #ffb000;
  box-shadow: 0 0 5px #ffb000;
}
.blink {
  animation: blink 0.6s steps(2) infinite;
}
@keyframes blink {
  50% {
    color: #111;
    background: #ffb000;
  }
}
</style>
