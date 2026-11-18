<script setup lang="ts">
import { computed } from 'vue'
import { SKETCH_MODEL, useGarden } from '../stores/garden'
import { DEFAULT_GARDEN_MODEL, FADE_MAX, OFFSET_MAX } from '../lib/garden/garden'
import { SOUND_MODELS, soundModelFrom } from '../lib/ai/soundModels'
import { soundModelsAvailable } from '../lib/ai/soundHost'
import type { PatchSlot } from '../types'
import Knob from './Knob.vue'

/**
 * A VCO's PROMPT GARDEN in its title bar (the PLAY column's and the VCO tab's): XFADE, OFFSET and LOOPS as small knobs;
 * the grow toggle (the automation icon the pads' growth uses, green while it grows, filling as a clip is made) between
 * ◀ ▶, which step back and forth through the clips it grew; ☰ beside it for the sound model and the words to AVOID;
 * ⏸ that holds its growth and 💾 that saves the clip playing. Each VCO's own (PatchSlot.garden); its rings are the
 * PLAY view's GARDEN pad. In PLAY (`play`) the VCO's VOL leads, and while it grows a green ↻ grows a new clip now.
 */
/** compact: ◀ GROW ☰ ▶ alone (the VOYAGE HUD's) */
const props = defineProps<{ x: PatchSlot; slot: number; play?: boolean; compact?: boolean }>()
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
const run = computed(() => garden.runs.get(props.x.layer.id))
/** what it's doing, for the toggle's tooltip */
const status = computed(() => {
  const g = props.x.garden
  const r = run.value
  if (!g?.on) return 'GROW: off — click to grow: new clips, made from the GARDEN pad\'s rings of words, stitch into this VCO as it plays'
  const now = g.history[0]?.prompt
  const tail = `${now ? `\nnow: ${now}` : ''}\nclick to stop growing`
  if (g.paused) return `GROW: paused — the clip playing loops on${tail}`
  if (r?.status === 'growing') return `GROW: making the next clip, ${Math.round(r.genProgress * 100)} % — ${r.growing}${tail}`
  if (r?.status === 'ready') return `GROW: the next clip is ready, in after ${g.loops} loop${g.loops === 1 ? '' : 's'}${tail}`
  if (r?.status === 'error') return `GROW: ⚠ ${r.note}${tail}`
  return `GROW: ${r?.started ? 'waiting for the model' : 'play the VCO: it grows while it sounds'}${tail}`
})
const failed = computed(() => !!props.x.garden?.on && run.value?.status === 'error')
function toggleGrow() {
  garden.setOn(props.slot, !on.value)
}

// ◀ ▶: the clips it grew
const nav = computed(() => {
  void props.x.layer.soundId
  return garden.takesOf(props.slot)
})
const canBack = computed(() => nav.value.at !== 0 && nav.value.takes.length > (nav.value.at < 0 ? 0 : 1))
const canFwd = computed(() => nav.value.at >= 0 && nav.value.at < nav.value.takes.length - 1)
const navTitle = (dir: -1 | 1) => {
  const { takes, at } = nav.value
  const t = takes[at < 0 ? (dir < 0 ? takes.length - 1 : -1) : at + dir]
  return t ? `${dir < 0 ? 'Back to the clip before' : 'On to the clip after'}: ${t.prompt} (${at + 1 + dir} of ${takes.length})` : dir < 0 ? 'No earlier clip' : 'No later clip'
}

// ☰: the sound model and the words to avoid
const MODEL_CHOICES = [
  { id: '', label: `${SOUND_MODELS.find((m) => m.id === DEFAULT_GARDEN_MODEL)?.label} (fastest)` },
  ...SOUND_MODELS.filter((m) => m.id !== DEFAULT_GARDEN_MODEL).map((m) => ({ id: m.id, label: m.label })),
  { id: SKETCH_MODEL, label: 'SKETCH — a little synth plays the words (no model)' },
]
const hasModels = soundModelsAvailable()
// (the VCO's model: its wave prompt's and its garden's; a clip the one before made, not yet in, is let go)
const model = computed({ get: () => props.x.garden?.model ?? '', set: (v: string) => garden.setModel(props.slot, v) })
// ☰'s lyrics: for a model that sings
const sings = computed(() => !!soundModelFrom(props.x.garden?.model || DEFAULT_GARDEN_MODEL)?.lyrics)
const ownLyrics = computed({ get: () => !!props.x.garden?.ownLyrics, set: (v: boolean) => { const x = g(); if (x) x.ownLyrics = v } })
const lyrics = computed({ get: () => props.x.garden?.lyrics ?? '', set: (v: string) => { const x = g(); if (x) x.lyrics = v } })
const lastSung = computed(() => garden.sang.get(props.x.layer.id) ?? '')
const avoid = computed({ get: () => props.x.garden?.negative ?? '', set: (v: string) => { const x = g(); if (x) x.negative = v } })
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
    <template v-if="!compact">
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
    </template>
    <button class="pause nav" :disabled="!canBack" :title="navTitle(-1)" @click="garden.stepTake(slot, -1)">
      <v-icon size="13" icon="mdi-chevron-left" />
    </button>
    <button
      class="grow"
      :class="{ on, meter: growing !== null, failed }"
      :style="growing !== null ? { '--p': `${(growing * 100).toFixed(1)}%` } : undefined"
      :aria-pressed="on"
      :title="status"
      @click="toggleGrow"
    >
      <span class="fill" />
      <v-icon size="13" icon="mdi-chart-timeline-variant" />
    </button>
    <v-menu location="bottom end" :close-on-content-click="false" offset="4" :z-index="3000">
      <template #activator="{ props: act }">
        <button class="pause" v-bind="act" title="This VCO's sound model (its wave prompt's and its garden's), and the words it avoids"><v-icon size="13" icon="mdi-menu" /></button>
      </template>
      <div class="gmenu" @keydown.stop>
        <label>
          <span>SOUND MODEL</span>
          <select v-model="model">
            <option v-for="m in MODEL_CHOICES" :key="m.id" :value="m.id">{{ m.label }}</option>
          </select>
        </label>
        <small v-if="!hasModels && model !== SKETCH_MODEL">No sound models in a browser tab: SKETCH plays the words.</small>
        <small v-else>The VCO's prompt and its garden both use it. It must be downloaded first (AI settings › SOUND MODEL): neither starts a download.</small>
        <label>
          <span>AVOID</span>
          <input v-model.lazy="avoid" spellcheck="false" placeholder="speech, vocals, low quality" />
        </label>
        <small>Words the sound model steers away from, comma separated (a clip whose words ask for one of them gets it anyway).</small>
        <template v-if="sings">
          <label class="own" title="Advanced: give the words to sing yourself, instead of the word model writing them from the prompt">
            <span>LYRICS</span>
            <input v-model="ownLyrics" type="checkbox" />
            <em>OWN WORDS</em>
          </label>
          <textarea v-if="ownLyrics" v-model.lazy="lyrics" rows="4" spellcheck="false" placeholder="[verse]&#10;the words to sing, a line each&#10;[chorus]&#10;…" />
          <small v-else>The prompt's automation button has the word model write the words to sing; ➤ sings the words as typed.</small>
          <pre v-if="!ownLyrics && lastSung" class="sung" title="The words sung last">{{ lastSung }}</pre>
        </template>
      </div>
    </v-menu>
    <button class="pause nav" :disabled="!canFwd" :title="navTitle(1)" @click="garden.stepTake(slot, 1)">
      <v-icon size="13" icon="mdi-chevron-right" />
    </button>
    <template v-if="!compact">
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
    </template>
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
.grow {
  position: relative;
  overflow: hidden;
  display: grid;
  place-items: center;
  flex: none;
  width: 24px;
  height: 18px;
  padding: 0;
  border-radius: 9px;
  color: var(--ink-mute);
  background: #111;
  border: 1px solid #000;
}
.grow .v-icon {
  position: relative;
}
.grow.on {
  color: #05030a;
  background: #7dff6a;
  box-shadow: 0 0 8px rgba(125, 255, 106, 0.5);
}
.grow.failed {
  background: #ff8a3e;
}
/* making a clip: the toggle is its progress meter, the green sweeping in from the left */
.grow.on.meter {
  color: #d8ffd0;
  background: #14301a;
}
.grow .fill {
  position: absolute;
  inset: 0;
  width: 0;
  background: linear-gradient(90deg, #3fae34, #7dff6a);
}
.grow.meter .fill {
  width: var(--p);
  transition: width 0.22s linear;
}
.grow.meter .v-icon {
  color: #f2fff0;
  filter: drop-shadow(0 1px 1px #000);
}
.nav {
  width: 14px;
  border-radius: 7px;
}
.gmenu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 300px;
  padding: 8px;
  border-radius: 6px;
  background: linear-gradient(180deg, var(--panel-hi), var(--panel-lo));
  border: 1px solid #000;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
}
.gmenu label {
  display: flex;
  align-items: center;
  gap: 6px;
}
.gmenu label span {
  flex: 0 0 82px;
  font-family: 'Orbitron', sans-serif;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.14em;
  color: var(--text-head);
}
.gmenu select,
.gmenu input {
  flex: 1;
  min-width: 0;
  height: 22px;
  padding: 0 6px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: var(--text);
  background: var(--lcd-bg);
  border: 1px solid #000;
  outline: none;
  appearance: auto;
}
.gmenu .own input {
  flex: none;
  width: auto;
  height: auto;
}
.gmenu .own em {
  font-style: normal;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: var(--text);
}
.gmenu textarea {
  min-height: 70px;
  padding: 4px 6px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  line-height: 1.1;
  color: var(--text);
  background: var(--lcd-bg);
  border: 1px solid #000;
  outline: none;
  resize: vertical;
}
.gmenu .sung {
  margin: 0;
  max-height: 80px;
  overflow: auto;
  white-space: pre-wrap;
  font-family: 'VT323', monospace;
  font-size: 13px;
  line-height: 1.1;
  color: var(--c-secondary);
}
.gmenu small {
  margin: 0 0 4px;
  font-family: 'VT323', monospace;
  font-size: 13px;
  line-height: 1.1;
  color: var(--text-mute);
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
