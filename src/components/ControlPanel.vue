<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBoard } from '../stores/board'
import { buffers } from '../audio/engine'
import {
  fmtCents, fmtChoke, fmtDb, fmtDensity, fmtHz, fmtMs, fmtNum, fmtOct, fmtPan, fmtPct, fmtQ, fmtRatio,
  fmtRepeat, fmtSec, fmtSemis, fmtSemisJitter, midiNoteName,
} from '../lib/format'
import { joinTags, splitTags } from '../lib/tags'
import { FILTER_LABEL, type Patch, soundAudioIds, TRIGGER_MODE_INFO, TRIGGER_MODES, type Sound } from '../types'
import Knob from './Knob.vue'
import Waveform from './Waveform.vue'
import KeyMap from './KeyMap.vue'

/**
 * wide: spread across the full row (pads view); otherwise a fixed-width column (rack).
 * role: shown in the rack as the patch or as one of its VCOs (VCOs don't nest, so they hide their own VCO section).
 */
const props = defineProps<{ sound: Sound; hue: number; wide?: boolean; role?: string; patch?: Patch }>()
/** a pad in the Sounds catalog (not a patch layer) */
const isPad = computed(() => !props.role || props.role === 'sound')
const board = useBoard()
const s = computed(() => props.sound.settings)
const confirmDelete = ref(false)
const confirmReset = ref(false)
const presetMenu = ref(false)
const presetName = ref('')
const routeCount = computed(() => s.value.mod.routes.length)
const fmtNote = (v: number) => midiNoteName(Math.round(v))
/** grain SIZE reaches the whole sample (longest zone for SFZ); 500 ms until the audio is decoded */
const grainMax = () =>
  Math.max(500, Math.ceil(Math.max(0, ...soundAudioIds(props.sound).map((id) => buffers.get(id)?.duration ?? 0)) * 1000))
/** folded sections show just their title bar (state shared by every panel) */
const isFolded = (key: string) => board.master.folded.includes(key)
function toggleFold(key: string) {
  const f = board.master.folded
  board.master.folded = isFolded(key) ? f.filter((k) => k !== key) : [...f, key]
}
const fmtBend = (v: number) => `±${Math.round(v)}st`

function savePreset() {
  board.savePreset(props.sound.id, presetName.value || s.value.name)
  presetName.value = ''
}
const modeInfo = computed(() => TRIGGER_MODE_INFO[s.value.mode])
const learning = computed(() => board.midi.learning === props.sound.id)

function doReset() {
  board.resetSettings(props.sound.id)
  confirmReset.value = false
}
</script>

<template>
  <div class="panel" :class="{ wide }" @pointerdown.stop @click.stop>
    <div class="screws"><i /><i /><i /><i /></div>

    <div class="top">
      <div class="scope">
        <Waveform :sound="sound" :hue="hue" :height="wide ? 72 : 52" />
        <KeyMap v-if="sound.zones?.length" :sound="sound" />
      </div>
    <div v-if="isPad" class="fields">
      <v-text-field v-model="s.name" label="NAME" density="compact" variant="outlined" hide-details spellcheck="false" />
      <v-combobox
        :model-value="splitTags(s.tag)"
        :items="board.tags"
        label="TAGS"
        density="compact"
        variant="outlined"
        multiple
        chips
        closable-chips
        hide-details
        @update:model-value="(v: string[]) => (s.tag = joinTags(v.flatMap((t) => splitTags(t))))"
      />
    </div>
    </div>

    <div class="modules">
      <section class="module" :class="{ folded: isFolded('play') }">
        <h4>PLAY
          <button class="fold" :title="isFolded('play') ? 'Show' : 'Fold'" @click="toggleFold('play')"><i /></button>
        </h4>
        <div class="row">
          <Knob v-model="s.volume" label="VOL" :max="1.5" :default="1" :format="fmtPct" />
          <Knob v-model="s.pan" label="PAN" :min="-1" :max="1" :default="0" bipolar :format="fmtPan" />
          <Knob v-model="s.repeat" label="RPT" :min="0" :max="16" :step="1" :default="1" :format="fmtRepeat" />
          <Knob v-model="s.choke" label="CHOKE" :min="0" :max="8" :step="1" :default="0" :format="fmtChoke" />
        </div>
      </section>

      <section class="module" :class="{ folded: isFolded('tune') }">
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
          <button class="fold" :title="isFolded('tune') ? 'Show' : 'Fold'" @click="toggleFold('tune')"><i /></button>
        </h4>
        <div class="row">
          <Knob v-model="s.pitch" label="PITCH" :min="-24" :max="24" :step="1" :default="0" bipolar :format="fmtSemis" />
          <Knob v-model="s.fine" label="FINE" :min="-100" :max="100" :step="1" :default="0" bipolar :format="fmtCents" />
          <Knob v-model="s.speed" label="SPEED" :min="0.25" :max="4" curve="log" :default="1" :format="fmtRatio" />
        </div>
      </section>

      <section class="module" :class="{ folded: isFolded('keys') }">
        <h4>KEYS
          <button class="fold" :title="isFolded('keys') ? 'Show' : 'Fold'" @click="toggleFold('keys')"><i /></button>
        </h4>
        <div class="row">
          <Knob v-model="s.rootNote" label="ROOT" :min="0" :max="127" :step="1" :default="60" :format="fmtNote" />
          <Knob v-model="s.velAmount" label="VEL AMT" :default="1" :format="fmtPct" />
          <Knob v-model="s.bendRange" label="BEND" :min="0" :max="48" :step="1" :default="2" :format="fmtBend" />
        </div>
      </section>

      <section class="module" :class="{ folded: isFolded('clip') }">
        <h4>CLIP
          <button class="fold" :title="isFolded('clip') ? 'Show' : 'Fold'" @click="toggleFold('clip')"><i /></button>
        </h4>
        <div class="row">
          <Knob v-model="s.clipIn" label="IN" :default="0" :format="fmtPct" />
          <Knob v-model="s.clipOut" label="OUT" :default="1" :format="fmtPct" />
        </div>
      </section>

      <section class="module" :class="{ folded: isFolded('adsr') }">
        <h4>ADSR
          <button class="fold" :title="isFolded('adsr') ? 'Show' : 'Fold'" @click="toggleFold('adsr')"><i /></button>
        </h4>
        <div class="row">
          <Knob v-model="s.attack" label="A" :min="0.001" :max="5" curve="log" :default="0.001" :format="fmtSec" />
          <Knob v-model="s.decay" label="D" :min="0.001" :max="5" curve="log" :default="0.2" :format="fmtSec" />
          <Knob v-model="s.sustain" label="S" :default="1" :format="fmtPct" />
          <Knob v-model="s.release" label="R" :min="0.001" :max="10" curve="log" :default="0.02" :format="fmtSec" />
        </div>
      </section>

      <section class="module" :class="{ folded: isFolded('filter') }">
        <h4>
          FILTER
          <button class="chip on" title="Filter type — click to cycle LP / HP / BP" @click="board.cycleFilter(sound.id)">
            {{ FILTER_LABEL[s.filterType] }}
          </button>
          <button class="fold" :title="isFolded('filter') ? 'Show' : 'Fold'" @click="toggleFold('filter')"><i /></button>
        </h4>
        <div class="row">
          <Knob v-model="s.cutoff" label="CUTOFF" :min="20" :max="20000" curve="log" :default="20000" :format="fmtHz" color="secondary" />
          <Knob v-model="s.resonance" label="RES" :min="0.1" :max="20" curve="log" :default="0.7" :format="fmtQ" color="secondary" />
        </div>
      </section>

      <section class="module" :class="{ folded: isFolded('filter-adsr') }">
        <h4>FILTER ADSR
          <button class="fold" :title="isFolded('filter-adsr') ? 'Show' : 'Fold'" @click="toggleFold('filter-adsr')"><i /></button>
        </h4>
        <div class="row">
          <Knob v-model="s.fEnvAmount" label="AMT" :min="-5" :max="5" :step="0.1" :default="0" bipolar :format="fmtOct" color="secondary" />
          <Knob v-model="s.fAttack" label="A" :min="0.001" :max="5" curve="log" :default="0.001" :format="fmtSec" color="secondary" />
          <Knob v-model="s.fDecay" label="D" :min="0.001" :max="5" curve="log" :default="0.3" :format="fmtSec" color="secondary" />
          <Knob v-model="s.fSustain" label="S" :default="0" :format="fmtPct" color="secondary" />
          <Knob v-model="s.fRelease" label="R" :min="0.001" :max="10" curve="log" :default="0.2" :format="fmtSec" color="secondary" />
        </div>
      </section>

      <section class="module" :class="{ folded: isFolded('eq') }">
        <h4>EQ
          <button class="fold" :title="isFolded('eq') ? 'Show' : 'Fold'" @click="toggleFold('eq')"><i /></button>
        </h4>
        <div class="row">
          <Knob v-model="s.eqLow" label="BASS" :min="-12" :max="12" :step="0.5" :default="0" bipolar :format="fmtDb" color="secondary" />
          <Knob v-model="s.eqMid" label="MID" :min="-12" :max="12" :step="0.5" :default="0" bipolar :format="fmtDb" color="secondary" />
          <Knob v-model="s.eqHigh" label="TREBLE" :min="-12" :max="12" :step="0.5" :default="0" bipolar :format="fmtDb" color="secondary" />
        </div>
      </section>

      <section class="module wide" :class="{ folded: isFolded('grain') }">
        <h4>GRAIN
          <button class="fold" :title="isFolded('grain') ? 'Show' : 'Fold'" @click="toggleFold('grain')"><i /></button>
        </h4>
        <div class="row">
          <Knob v-model="s.grainSize" label="SIZE" :max="grainMax()" curve="pow" :step="1" :default="0" :format="fmtMs" color="accent" />
          <Knob v-model="s.grainPos" label="POS" :default="0.5" :format="fmtPct" color="accent" />
          <Knob v-model="s.grainWidth" label="WIDTH" :default="0" :format="fmtPct" color="accent" />
          <Knob v-model="s.grainDensity" label="DENS" :min="1" :max="8" :step="1" :default="2" :format="fmtDensity" color="accent" />
          <Knob v-model="s.grainJitter" label="JITTER" :max="12" :step="0.1" :default="0" :format="fmtSemisJitter" color="accent" />
          <Knob v-model="s.grainReverse" label="REV" :default="0" :format="fmtPct" color="accent" />
          <Knob v-model="s.grainSpread" label="SPREAD" :default="0" :format="fmtPct" color="accent" />
          <Knob v-model="s.grainStreams" label="STRMS" :min="1" :max="8" :step="1" :default="1" :format="(v: number) => `${Math.round(v)}`" color="accent" />
          <Knob v-model="s.grainScatter" label="SCATTR" :default="0" :format="fmtPct" color="accent" />
          <Knob v-model="s.grainDrift" label="DRIFT" :default="0" :format="fmtPct" color="accent" />
        </div>
      </section>

      <section class="module" :class="{ folded: isFolded('delay') }">
        <h4>DELAY
          <button class="fold" :title="isFolded('delay') ? 'Show' : 'Fold'" @click="toggleFold('delay')"><i /></button>
        </h4>
        <div class="row">
          <Knob v-model="s.delayTime" label="TIME" :min="0.01" :max="2" curve="log" :default="0.25" :format="fmtSec" color="success" />
          <Knob v-model="s.delayFeedback" label="FDBK" :max="0.9" :default="0.35" :format="fmtPct" color="success" />
          <Knob v-model="s.delayMix" label="MIX" :default="0" :format="fmtPct" color="success" />
        </div>
      </section>

      <section class="module" :class="{ folded: isFolded('reverb') }">
        <h4>REVERB
          <button class="fold" :title="isFolded('reverb') ? 'Show' : 'Fold'" @click="toggleFold('reverb')"><i /></button>
        </h4>
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
        v-if="isPad"
        class="hw-btn"
        :class="{ blink: learning }"
        title="MIDI learn: click, then play a note"
        @click="board.learnMidi(sound.id)"
      >
        <v-icon size="14" icon="mdi-piano" />
        {{ learning ? 'PLAY NOTE…' : s.midiNote !== null ? midiNoteName(s.midiNote) : 'LEARN' }}
      </button>
      <button class="hw-btn" :class="{ lit: routeCount }" title="Modulation matrix for this pad" @click="board.openMatrix(sound.id)">
        <v-icon size="14" icon="mdi-matrix" />
        <span class="lbl">MATRIX</span><span v-if="routeCount" class="badge">{{ routeCount }}</span>
      </button>
      <v-menu v-model="presetMenu" location="top" :close-on-content-click="false">
        <template #activator="{ props: act }">
          <button class="hw-btn" v-bind="act" title="Presets, copy / paste settings">
            <v-icon size="14" icon="mdi-bookmark-music" />
            <span class="lbl">PRESETS</span>
          </button>
        </template>
        <div class="preset-menu" @pointerdown.stop @keydown.stop>
          <div class="pm-row">
            <button class="hw-btn" title="Copy this pad's settings" @click="board.copySettings(sound.id)">
              <v-icon size="14" icon="mdi-content-copy" /> COPY
            </button>
            <button
              class="hw-btn"
              :disabled="!board.clipboard"
              title="Paste copied settings onto this pad"
              @click="board.pasteSettings(sound.id)"
            >
              <v-icon size="14" icon="mdi-content-paste" /> PASTE
            </button>
          </div>
          <div class="pm-row">
            <input v-model="presetName" class="pm-input" :placeholder="s.name" maxlength="40" @keydown.enter="savePreset" />
            <button class="hw-btn" title="Save these settings as a preset" @click="savePreset">
              <v-icon size="14" icon="mdi-content-save" /> SAVE
            </button>
          </div>
          <div v-if="!board.presets.length" class="pm-empty">NO PRESETS YET</div>
          <div v-for="p in board.presets" :key="p.id" class="pm-item">
            <button class="pm-load" :title="`Load ${p.name} onto this pad`" @click="board.loadPreset(sound.id, p.id)">
              {{ p.name }}
            </button>
            <button class="pm-del" title="Delete preset" @click="board.deletePreset(p.id)">
              <v-icon size="14" icon="mdi-close" />
            </button>
          </div>
          <div class="pm-hint">Presets skip name, tag, clip, root note and MIDI note.</div>
        </div>
      </v-menu>
      <button
        v-if="isPad"
        class="hw-btn"
        title="New patch from this sound (its settings become the patch's main layer)"
        @click="board.newPatch(sound.id)"
      >
        <v-icon size="14" icon="mdi-plus-box-multiple" />
        <span class="lbl">NEW PATCH</span>
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
        <span class="lbl">RESET</span>
      </button>
      <button v-if="isPad" class="hw-btn icon" title="Duplicate" @click="board.duplicate(sound.id)">
        <v-icon size="16" icon="mdi-content-copy" />
      </button>
      <template v-if="!isPad" />
      <template v-else-if="confirmDelete">
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
    linear-gradient(180deg, var(--panel-hi) 0%, var(--panel-mid) 55%, var(--panel-lo) 100%);
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
.scope {
  min-width: 0;
}
/* full-width panel: scope + name/tag side by side, modules flow across the row */
.panel.wide {
  width: 100%;
}
.panel.wide .top {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 8px;
}
.panel.wide .scope {
  flex: 1;
}
.panel.wide .fields {
  flex: 0 0 340px;
  grid-template-columns: 1fr;
  margin: 0;
}
.panel.wide .module.wide {
  flex-basis: auto;
}
.panel.wide .module {
  flex-grow: 1;
}
.fields :deep(.v-field) {
  font-family: 'VT323', monospace;
  font-size: 18px;
  background: var(--lcd-bg);
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
  gap: 4px;
}
.module {
  flex: 1 1 auto;
  padding: 2px 4px 2px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.18);
}
.module.wide {
  flex-basis: 100%;
}
.module {
  position: relative;
}
.module h4 {
  padding-right: 16px;
}
/* folded: title bar only, as narrow as it needs */
.module.folded {
  flex: 0 1 auto;
  padding-bottom: 1px;
}
.module.folded > :not(h4) {
  display: none;
}
.module.folded h4 {
  margin-bottom: 0;
  opacity: 0.7;
}
.fold {
  position: absolute;
  top: 2px;
  right: 3px;
  display: grid;
  place-items: center;
  width: 12px;
  height: 12px;
  padding: 0;
  border: 0;
  background: none;
  appearance: none;
}
/* a little triangle: ▼ open, ◀ folded */
.fold i {
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid var(--text-mute);
  transition: transform 120ms;
}
.folded .fold i {
  transform: rotate(90deg);
}
.fold:hover i {
  border-top-color: var(--c-primary);
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
  color: var(--text-head);
}
.chip {
  padding: 0 5px;
  border-radius: 2px;
  font-family: 'VT323', monospace;
  font-size: 12px;
  letter-spacing: 0.08em;
  line-height: 13px;
  color: var(--ink-dim);
  background: #111;
  border: 1px solid #000;
}
.chip.on {
  color: var(--c-secondary);
  text-shadow: 0 0 4px color-mix(in srgb, var(--c-secondary) 70%, transparent);
}
.row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-around;
}
/* narrow panels (the rack's three slots): one row of grain knobs, icon-only footer buttons */
.panel {
  container-type: inline-size;
}
@container (max-width: 440px) {
  .module.wide .row :deep(.knob) {
    width: calc(var(--size) + 2px);
  }
  .module.wide .row :deep(.label) {
    font-size: 6px;
    letter-spacing: 0;
  }
  .footer .lbl {
    display: none;
  }
}
.module.folded {
  align-self: flex-start;
}
.footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}
.vco .sub {
  font-family: 'VT323', monospace;
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.04em;
  color: var(--text-mute);
}
.slot {
  padding: 3px 0 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.slot-top {
  display: flex;
  align-items: center;
  gap: 6px;
}
.slot .num {
  font-family: 'Orbitron', sans-serif;
  font-size: 10px;
  font-weight: 900;
  color: var(--c-accent);
}
.picker {
  flex: 1;
  min-width: 0;
}
.picker :deep(.v-field) {
  font-family: 'VT323', monospace;
  font-size: 16px;
  background: var(--lcd-bg);
  color: var(--c-secondary);
}
.add-vco {
  margin-top: 4px;
}
.badge {
  margin-left: 2px;
  padding: 0 4px;
  border-radius: 6px;
  font-family: 'VT323', monospace;
  font-size: 13px;
  line-height: 13px;
  color: #111;
  background: var(--c-primary);
}
.preset-menu {
  width: 260px;
  padding: 8px;
  border-radius: 6px;
  background: linear-gradient(180deg, var(--panel-hi), var(--panel-lo));
  border: 1px solid #000;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
  font-family: 'VT323', monospace;
}
.pm-row {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}
.pm-input {
  flex: 1;
  min-width: 0;
  padding: 0 6px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 17px;
  color: var(--c-primary);
  background: var(--lcd-bg);
  border: 1px solid #000;
  outline: none;
}
.pm-empty,
.pm-hint {
  padding: 4px 2px;
  font-size: 14px;
  color: var(--text-mute);
}
.pm-item {
  display: flex;
  align-items: center;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.pm-load {
  flex: 1;
  padding: 3px 4px;
  text-align: left;
  font-family: 'VT323', monospace;
  font-size: 18px;
  color: var(--c-secondary);
  text-transform: uppercase;
}
.pm-load:hover {
  background: color-mix(in srgb, var(--c-secondary) 8%, transparent);
}
.pm-del {
  padding: 0 4px;
  color: var(--text-mute);
}
.pm-del:hover {
  color: var(--c-danger);
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
  background: var(--c-primary);
  box-shadow: 0 0 5px var(--c-primary);
}
.blink {
  animation: blink 0.6s steps(2) infinite;
}
@keyframes blink {
  50% {
    color: #111;
    background: var(--c-primary);
  }
}
</style>
