<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { SKETCH_MODEL, useGarden } from '../stores/garden'
import { DEFAULT_GARDEN_MODEL } from '../lib/garden/garden'
import { downloadBytes, fmtBytes, SOUND_MODELS, soundModelFrom } from '../lib/ai/soundModels'
import { canRunHere, hereForm } from '../lib/ai/soundHost'
import { useAi } from '../lib/ai/store'
import { inNative } from '../native/bridge'
import { WORD_MODELS, wordModelBytes } from '../lib/garden/wordModels'
import { checkWordModel, chooseWordModel, downloadWordModel, removeWordModel, riffModel, riffState, setRiffOn } from '../lib/garden/riff'
import type { PatchSlot } from '../types'

/**
 * A VCO's ☰ menu (GardenBar): the models it makes sound with, where they're chosen, downloaded and deleted.
 *  SOUND MODEL  the text-to-audio model of its wave prompt and its garden (also the AI agent's: the last one picked
 *               here is the one the agent starts with), with its download, its Hugging Face token where it's gated,
 *               the words it AVOIDs and, for one that sings, the words to sing;
 *  WORD MODEL   the small language model (lib/garden/riff.ts) that writes the prompt out and lists the garden rings'
 *               words: one for all the VCOs.
 */
const props = defineProps<{ x: PatchSlot; slot: number }>()
const garden = useGarden()
const ai = useAi()
const g = () => garden.gardenOf(props.slot)

// ── the sound model: only what runs here (a browser tab: Stable Audio 3 Small Music and MusicGen; where the default
// can't run, the default is SKETCH) ──
const native = inNative()
const CUSTOM = '__custom'
const tab = !canRunHere(soundModelFrom(DEFAULT_GARDEN_MODEL))
const SKETCH = { id: SKETCH_MODEL, label: 'Sketch — a small synth plays the words' }
const CHOICES = tab
  ? [{ ...SKETCH, id: '' }, ...SOUND_MODELS.filter(canRunHere).map((m) => ({ id: m.id, label: m.label }))]
  : [
      { id: '', label: `${SOUND_MODELS.find((m) => m.id === DEFAULT_GARDEN_MODEL)?.label} (default)` },
      ...SOUND_MODELS.filter((m) => m.id !== DEFAULT_GARDEN_MODEL && canRunHere(m)).map((m) => ({ id: m.id, label: m.label })),
      SKETCH,
      ...(native ? [{ id: CUSTOM, label: 'Custom GGUF from Hugging Face…' }] : []),
    ]
const model = computed({ get: () => props.x.garden?.model ?? '', set: (v: string) => garden.setModel(props.slot, v) })
const customOpen = ref(false)
const choice = computed({
  get: () => (customOpen.value || (model.value && !CHOICES.some((c) => c.id === model.value)) ? CUSTOM : model.value),
  set: (v: string) => {
    customOpen.value = v === CUSTOM
    if (v !== CUSTOM) model.value = v
  },
})
const customUrl = ref(soundModelFrom(model.value)?.custom ? model.value : '')
function applyCustom() {
  if (soundModelFrom(customUrl.value)) model.value = customUrl.value.trim()
}
/** the model this VCO makes sound with, as it runs here (null: SKETCH) */
const info = computed(() => {
  const id = model.value || (tab ? SKETCH_MODEL : DEFAULT_GARDEN_MODEL)
  const m = id === SKETCH_MODEL ? null : soundModelFrom(id)
  return m && canRunHere(m) ? hereForm(m) : null
})
const badUrl = computed(() => choice.value === CUSTOM && !!customUrl.value.trim() && !soundModelFrom(customUrl.value))
// the store's download, load and delete act on its pick: the VCO's model, while this menu shows it
function sync() {
  if (info.value && ai.soundPick?.id !== info.value.id) ai.settings.sound.model = info.value.custom ? model.value : info.value.id
}
watch(() => info.value?.id, sync, { immediate: true })
onMounted(() => ai.watchSound(true))
onBeforeUnmount(() => ai.watchSound(false))

const sound = computed(() => ai.soundStatus)
const mine = computed(() => !!info.value && ai.soundPick?.id === info.value.id)
const loaded = computed(() => mine.value && sound.value?.loaded?.id === info.value?.id)
const task = computed(() => (sound.value?.task && sound.value.task.model === info.value?.id ? sound.value.task : null))
const busy = computed(() => !!sound.value?.task)
/** bytes left to download (0: it's here; null: not known yet) */
const missing = computed(() => {
  const c = ai.soundCheck
  if (!mine.value || !c || c.id !== info.value?.id) return null
  return c.downloaded ? 0 : c.missing || downloadBytes(info.value!) || null
})
const size = computed(() => (info.value ? downloadBytes(info.value) : 0))
const asking = ref(false)
watch(() => info.value?.id, () => (asking.value = false))
function download() {
  asking.value = false
  sync()
  void ai.loadSound()
}
const taskLine = computed(() => {
  const t = task.value
  if (!t) return ''
  const pct = t.progress == null ? '' : ` · ${Math.round(t.progress * 100)}%`
  if (t.kind === 'download') return `Downloading ${fmtBytes(t.done)} of ${t.total ? fmtBytes(t.total) : '?'}${pct}`
  if (t.kind === 'load') return `Loading… ${Math.round(t.elapsed)} s`
  return `Generating… ${Math.round(t.elapsed)} s`
})
const soundErr = computed(() => (mine.value ? ai.soundError || (sound.value?.error && sound.value.error.message !== 'cancelled' && sound.value.error.model === info.value?.id ? sound.value.error.message : '') : ''))
const showToken = ref(false)

// the words to avoid, and to sing
const sings = computed(() => !!info.value?.lyrics)
const ownLyrics = computed({ get: () => !!props.x.garden?.ownLyrics, set: (v: boolean) => { const x = g(); if (x) x.ownLyrics = v } })
const lyrics = computed({ get: () => props.x.garden?.lyrics ?? '', set: (v: string) => { const x = g(); if (x) x.lyrics = v } })
const lastSung = computed(() => garden.sang.get(props.x.layer.id) ?? '')
const avoid = computed({ get: () => props.x.garden?.negative ?? '', set: (v: string) => { const x = g(); if (x) x.negative = v } })

// ── the word model ──
const word = computed(() => riffModel())
const wordBusy = computed(() => riffState.status === 'downloading' || riffState.status === 'loading')
const askingWords = ref(false)
watch(() => riffState.id, () => (askingWords.value = false))
const wordLine = computed(() => {
  const pct = `${Math.round(riffState.progress * 100)}%`
  if (riffState.status === 'downloading') return `Downloading ${fmtBytes(riffState.doneBytes)} of ${fmtBytes(riffState.totalBytes)} · ${pct}`
  if (riffState.status === 'loading') return 'Loading…'
  if (riffState.status === 'ready') return 'Ready'
  if (riffState.downloaded === true) return 'Downloaded'
  if (riffState.downloaded === false) return 'Not downloaded'
  return ''
})
function getWords() {
  askingWords.value = false
  void downloadWordModel()
}
void checkWordModel()
</script>

<template>
  <div class="vmenu" @keydown.stop>
    <!-- ── sound model ── -->
    <section>
      <header>
        <h5>Sound model</h5>
        <span v-if="info" class="state" :class="loaded ? 'ok' : missing === 0 ? 'ok' : task ? 'busy' : 'idle'">
          <i />{{ loaded ? 'Loaded' : task ? task.kind[0].toUpperCase() + task.kind.slice(1) + 'ing' : missing === 0 ? 'Downloaded' : missing === null ? '' : 'Not downloaded' }}
        </span>
      </header>
      <select v-model="choice" title="The model this VCO's wave prompt and garden make sound with">
        <option v-for="c in CHOICES" :key="c.id" :value="c.id">{{ c.label }}</option>
      </select>
      <template v-if="choice === CUSTOM">
        <input v-model.trim="customUrl" spellcheck="false" placeholder="huggingface.co/org/repo/blob/main/model.gguf" @change="applyCustom" @keydown.enter="applyCustom" />
        <p v-if="badUrl" class="err">Not a model: the Hugging Face URL of a .gguf file (MOSS-SoundEffect or Stable Audio for audio.cpp).</p>
      </template>
      <template v-if="info">
        <p class="meta">
          {{ fmtBytes(size) }} · {{ info.channels === 2 ? 'Stereo' : 'Mono' }} {{ info.sampleRate / 1000 }} kHz · up to {{ info.maxSeconds }} s ·
          <a :href="info.url" target="_blank" rel="noopener">{{ info.license }}</a>
        </p>
        <div v-if="info.gated" class="field">
          <label>Hugging Face token</label>
          <div class="row">
            <input v-model.trim="ai.settings.sound.hfToken" :type="showToken ? 'text' : 'password'" spellcheck="false" autocomplete="off" placeholder="hf_…" />
            <button class="btn icon" :title="showToken ? 'Hide' : 'Show'" @click="showToken = !showToken"><v-icon size="13" :icon="showToken ? 'mdi-eye-off' : 'mdi-eye'" /></button>
          </div>
          <p class="note">
            Gated: accept its licence on <a :href="info.url" target="_blank" rel="noopener">its page</a>, then paste a read token from
            <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener">huggingface.co/settings/tokens</a>. Kept on this computer only.
          </p>
        </div>
        <div v-if="asking" class="confirm">
          <span>Download {{ fmtBytes(missing || size) }} into {{ native ? "SSB's folder" : "this browser's storage" }}? About {{ info.memoryGb }} GB of memory while loaded.</span>
          <button class="btn primary" @click="download">Download</button>
          <button class="btn" @click="asking = false">Cancel</button>
        </div>
        <div v-else class="row actions">
          <button v-if="missing !== 0 && !task" class="btn primary" :disabled="busy || missing === null || (info.gated && !ai.settings.sound.hfToken)" @click="asking = true">
            <v-icon size="13" icon="mdi-download" /> Download
          </button>
          <button v-if="task" class="btn" @click="ai.cancelSound()">Cancel</button>
          <button v-if="loaded" class="btn" :disabled="busy" title="Free its memory" @click="ai.unloadSound()">Unload</button>
          <button v-if="missing === 0 && !loaded" class="btn" :disabled="busy" title="Delete its files (it downloads again when asked)" @click="ai.removeSound()">Delete files</button>
          <span class="status">{{ taskLine }}</span>
        </div>
        <div v-if="task && task.progress != null" class="bar"><i :style="{ width: `${Math.round(task.progress * 100)}%` }" /></div>
        <p v-if="soundErr" class="err">{{ soundErr }}</p>
      </template>
      <p v-else-if="model && model !== SKETCH_MODEL && choice !== CUSTOM" class="note">That model needs the SSB app or plugin: in a browser tab Sketch plays the words.</p>
      <p v-else-if="choice !== CUSTOM" class="note">No download: a small synth sketches the words.</p>

      <div class="field">
        <label>Avoid</label>
        <input v-model.lazy="avoid" spellcheck="false" placeholder="speech, vocals, low quality" title="Words the sound model steers away from, comma separated" />
      </div>
      <template v-if="sings">
        <div class="field">
          <label class="check"><input v-model="ownLyrics" type="checkbox" /> Write my own lyrics</label>
          <textarea v-if="ownLyrics" v-model.lazy="lyrics" rows="4" spellcheck="false" placeholder="[verse]&#10;the words to sing, a line each&#10;[chorus]&#10;…" />
          <p v-else class="note">The prompt's automation button has the word model write them; ➤ sings the words as typed.</p>
          <pre v-if="!ownLyrics && lastSung" class="sung" title="The words sung last">{{ lastSung }}</pre>
        </div>
      </template>
    </section>

    <!-- ── word model ── -->
    <section>
      <header>
        <h5>Word model</h5>
        <label class="switch" :title="riffState.on ? 'On: it writes prompts and the rings\' words' : 'Off: the rings keep their words'">
          <input type="checkbox" :checked="riffState.on" @change="setRiffOn(($event.target as HTMLInputElement).checked)" />
          <span />
        </label>
      </header>
      <select :value="riffState.id" :disabled="wordBusy" title="The small language model that writes this rack's prompts and the garden rings' words (one for all VCOs)" @change="chooseWordModel(($event.target as HTMLSelectElement).value)">
        <option v-for="m in WORD_MODELS" :key="m.id" :value="m.id">{{ m.label }}</option>
      </select>
      <p class="meta">
        {{ word.note[0].toUpperCase() + word.note.slice(1) }} · {{ fmtBytes(wordModelBytes(word)) }} · offline ·
        <a :href="`https://huggingface.co/${word.repo}`" target="_blank" rel="noopener">Apache 2.0</a>
      </p>
      <div v-if="askingWords" class="confirm">
        <span>Download {{ fmtBytes(wordModelBytes(word)) }} {{ native ? "into SSB's folder" : 'into this browser' }}?</span>
        <button class="btn primary" @click="getWords">Download</button>
        <button class="btn" @click="askingWords = false">Cancel</button>
      </div>
      <div v-else class="row actions">
        <button v-if="riffState.downloaded !== true" class="btn primary" :disabled="wordBusy" @click="askingWords = true"><v-icon size="13" icon="mdi-download" /> Download</button>
        <button v-if="riffState.downloaded === true" class="btn" :disabled="wordBusy" title="Delete its files (it downloads again when needed)" @click="removeWordModel">Delete files</button>
        <span class="status">{{ wordLine }}</span>
      </div>
      <div v-if="wordBusy && riffState.progress > 0" class="bar"><i :style="{ width: `${Math.round(riffState.progress * 100)}%` }" /></div>
      <p v-if="riffState.error" class="err">{{ riffState.error }}</p>
    </section>
  </div>
</template>

<style scoped>
.vmenu {
  display: flex;
  flex-direction: column;
  width: 340px;
  max-height: min(80vh, 640px);
  overflow-y: auto;
  border-radius: 8px;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 12px;
  color: var(--text);
  background: color-mix(in srgb, var(--panel-lo) 92%, #000);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
  scrollbar-width: thin;
}
section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
}
section + section {
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 18px;
}
h5 {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-head);
}
.state {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-mute);
}
.state i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.state.ok {
  color: var(--c-success);
}
.state.busy {
  color: var(--c-secondary);
}
.state.busy i {
  animation: blink 1s infinite;
}
@keyframes blink {
  50% {
    opacity: 0.3;
  }
}
select,
input:not([type='checkbox']),
textarea {
  width: 100%;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border-radius: 5px;
  font: inherit;
  font-size: 12px;
  color: var(--text);
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.1);
  outline: none;
}
select option {
  color: #000;
}
textarea {
  height: auto;
  min-height: 72px;
  padding: 6px 8px;
  line-height: 1.35;
  resize: vertical;
}
select:focus,
input:focus,
textarea:focus {
  border-color: color-mix(in srgb, var(--c-primary) 60%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--c-primary) 20%, transparent);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}
.field > label {
  font-size: 11px;
  color: var(--text-mute);
}
.field > label.check {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
}
.row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.actions {
  min-height: 26px;
}
.meta,
.note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-mute);
}
.meta a,
.note a {
  color: var(--c-secondary);
  text-decoration: none;
}
.meta a:hover,
.note a:hover {
  text-decoration: underline;
}
.err {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: #ff7b7b;
}
.status {
  font-size: 11px;
  color: var(--text-mute);
  font-variant-numeric: tabular-nums;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border-radius: 5px;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  color: var(--text);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}
.btn.primary {
  color: #05030a;
  background: var(--c-primary);
  border-color: transparent;
}
.btn.primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--c-primary) 85%, #fff);
}
.btn.icon {
  flex: none;
  width: 28px;
  height: 28px;
  padding: 0;
  justify-content: center;
}
.btn:disabled {
  opacity: 0.4;
}
.confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.4;
  background: rgba(255, 196, 107, 0.07);
  border: 1px solid rgba(255, 196, 107, 0.3);
}
.confirm span {
  flex: 1 1 100%;
}
.bar {
  height: 3px;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: var(--c-secondary);
  transition: width 0.4s;
}
.sung {
  margin: 0;
  max-height: 80px;
  overflow: auto;
  white-space: pre-wrap;
  font: inherit;
  font-size: 11px;
  line-height: 1.35;
  color: var(--c-secondary);
}
/* an on/off switch */
.switch {
  position: relative;
  display: inline-block;
  width: 28px;
  height: 16px;
  cursor: pointer;
}
.switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.switch span {
  position: absolute;
  inset: 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.14);
  transition: background 0.15s;
}
.switch span::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s;
}
.switch input:checked + span {
  background: var(--c-success);
}
.switch input:checked + span::after {
  transform: translateX(12px);
}
</style>
