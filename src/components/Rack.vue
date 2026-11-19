<script setup lang="ts">
import { computed, reactive, ref, shallowReactive, watch } from 'vue'
import { activeVoices } from '../audio/engine'
import { useBoard } from '../stores/board'
import { rememberElementScroll } from '../lib/scrollMemory'
import { fmtCents, fmtPct, fmtSec, fmtSemis, midiNoteName, padHue } from '../lib/format'
import { PATCH_SLOTS, TUNING_MODES, vcoHeard, type PatchSlot, type Sound, type TuningMode } from '../types'
import ControlPanel from './ControlPanel.vue'
import PlayView from './PlayView.vue'
import ShaderStage from './ShaderStage.vue'
import VoyageView from './VoyageView.vue'
import { shaderPrefs, stageStatus } from '../lib/play/shaders'
import Knob from './Knob.vue'
import { useAi } from '../lib/ai/store'
import { errorMessage } from '../lib/ai/types'
import GardenBar from './GardenBar.vue'
import VcoMeter from './VcoMeter.vue'
import { useGarden } from '../stores/garden'

/**
 * The selected patch's three VCO slots as tabs, one showing at a time across the width: the one place a patch is
 * edited. A tab lights while its VCO sounds; a sound dragged over a tab opens it, and dropped there goes into that slot
 * (as into an empty slot's panel, or pressing 1 / 2 / 3 on a sound). Each tab has a mixer's M / S, and after them the
 * PLAY tab shows all three VCOs' Play views side by side. Fills its pane (left of the lists, or the window).
 */
const board = useBoard()
const REORDER_TYPE = 'application/x-ssb-sound'

const patch = computed(() => board.selectedPatch)
const slots = computed<(PatchSlot | null)[]>(() => patch.value?.slots ?? Array.from({ length: PATCH_SLOTS }, () => null))
const layerOf = (x: PatchSlot | null): Sound | undefined => (x ? board.layerSound(x.layer) : undefined)
const sourceName = (x: PatchSlot | null) => (x ? board.byId(x.layer.soundId)?.settings.name ?? '(missing sound)' : '')
const hue = (s: Sound) => padHue(s.settings.tag, s.settings.name, board.theme.padHues)
const fmtLevel = (v: number) => `${Math.round(v * 100)}`
const fmtNote = (v: number) => midiNoteName(Math.round(v))
const TUNING: Record<TuningMode, { chip: string; label: string; hint: string }> = {
  et: { chip: 'ET', label: 'ET', hint: 'Equal temperament: every note where the keys put it' },
  eased: { chip: 'AJI 5-E', label: 'AJI 5-LIMIT EASED', hint: 'Pure fifths and thirds, eased where they conflict. For anything' },
  strict: { chip: 'AJI 5-S', label: 'AJI 5-LIMIT STRICT', hint: 'Pure fifths and thirds, whatever it takes: notes step further on hard changes' },
  septimal: { chip: 'AJI 7', label: 'AJI 7-LIMIT', hint: 'Adds natural sevenths (7:4). For held chords, at DEPTH 90 % or more; part-writing can lurch' },
  tonal: { chip: 'AJI TC', label: 'AJI TONAL CENTRE', hint: 'Purest near the harmonic centre, less so further out: keys get a character' },
}
const TUNING_TITLE =
  'Tuning. ET is equal temperament; AJI (adaptive just intonation) retunes this VCO to each chord you hold, staying close to ET. Each VCO has its own'

// PLAY: the rack's own view, every VCO's Play view (the clip big and its XY pads) side by side in place of a tab's
// knobs; kept with the instance's view
const playView = computed({
  get: () => !!board.master.rackPlay,
  set: (on: boolean) => (board.master.rackPlay = on),
})

// PLAY opens the pads, VOYAGE the ship (lib/voyage); the one already open, clicked again, closes the PLAY view
const padsOn = computed(() => playView.value && board.master.playMode !== 'voyage')
const voyageOn = computed(() => playView.value && board.master.playMode === 'voyage')
function openPlay(mode: 'pads' | 'voyage') {
  if (playView.value && (board.master.playMode ?? 'pads') === mode) {
    playView.value = false
    return
  }
  board.master.playMode = mode
  playView.value = true
}

// the VCO tab showing (kept with a plugin instance's view); choosing one leaves the PLAY view
const tab = computed({
  get: () => Math.min(PATCH_SLOTS - 1, Math.max(0, board.master.rackTab ?? 0)),
  set: (i: number) => {
    board.master.rackTab = i
    board.master.rackPlay = false
  },
})

// M / S: a mixer's mute and solo per VCO (types.ts vcoHeard); the instance's, not saved in the patch
const muted = (i: number) => !!board.master.vcoMute?.[i]
const soloed = (i: number) => !!board.master.vcoSolo?.[i]
const heard = (i: number) => vcoHeard(board.master, i)
function toggleMix(kind: 'vcoMute' | 'vcoSolo', i: number) {
  const next = [0, 1, 2].map((j) => !!board.master[kind]?.[j])
  next[i] = !next[i]
  board.master[kind] = next
}
const muteTitle = (i: number) => (muted(i) ? `VCO ${i + 1} muted — click to hear it` : `Mute VCO ${i + 1} (it still feeds the mod matrix)`)
const soloTitle = (i: number) =>
  soloed(i) ? `VCO ${i + 1} soloed — click to unsolo` : `Solo VCO ${i + 1}: while any VCO is soloed, only the soloed ones are heard (mute still wins)`
const sounding = computed(() => new Set(activeVoices.value.map((v) => v.soundId)))
const tabTitle = (x: PatchSlot | null, i: number) =>
  `VCO ${i + 1}${i === 0 ? ' (the main voice)' : ''}: ${x ? sourceName(x) + (i > 0 && !x.audible ? ' — mod only' : '') + (heard(i) ? '' : muted(i) ? ' — muted' : ' — silent while another is soloed') : 'empty — drop a sound here'}`

// each slot's panel scrolls on its own; where, is kept with a plugin instance's view
const bodies = shallowReactive<(HTMLElement | null)[]>([null, null, null])
for (const i of [0, 1, 2]) rememberElementScroll(() => `rack:${i}`, () => bodies[i])
const playBody = ref<HTMLElement | null>(null)
rememberElementScroll(() => 'rack:play', () => playBody.value)

// ── the patch's name and tags: typed into drafts (a re-render -- the garden ticks, the meters -- would put the saved
// name back over what's being typed), saved on change; the patch's own shown whenever they're not being edited ──
const nameDraft = ref('')
const tagDraft = ref('')
const editing = ref<'name' | 'tag' | null>(null)
watch(
  () => [patch.value?.id, patch.value?.name, patch.value?.tag, editing.value] as const,
  () => {
    if (editing.value !== 'name') nameDraft.value = patch.value?.name ?? ''
    if (editing.value !== 'tag') tagDraft.value = patch.value?.tag ?? ''
  },
  { immediate: true },
)

// ── the VCO wave prompt: a few words → the VCO's model (☰ SOUND MODEL) → its clip → this slot's sound. ➤ sends the
// words as typed; the automation button has the word model write them out first (a caption, and words to sing) ──
const ai = useAi()
const prompts = reactive(['', '', ''])
const promptBusy = reactive([false, false, false])
/** which button sent it (its spinner) */
const promptAuto = reactive([false, false, false])
const promptNote = reactive(['', '', ''])
const promptErr = reactive([false, false, false])
const promptAborts: (AbortController | null)[] = [null, null, null]
/** the model VCO `i` prompts, for its status line */
const modelLabel = (i: number) => {
  const m = garden.modelOf(i)
  return m.sketch ? 'SKETCH' : (m.info?.label ?? m.id)
}
async function promptWave(i: number, auto: boolean) {
  const text = prompts[i]!.trim()
  if (!text || promptBusy[i]) return
  promptBusy[i] = true
  promptAuto[i] = auto
  promptErr[i] = false
  promptNote[i] = `${modelLabel(i)} · ${auto ? 'writing…' : `“${text}”`}`
  const ctl = new AbortController()
  promptAborts[i] = ctl
  try {
    const made = await garden.promptWave(i, text, auto, ctl.signal, (n) => (promptNote[i] = `${modelLabel(i)} · ${n || 'making…'}`))
    if (!made || ctl.signal.aborted) return
    const sung = made.lyrics ? ` · ♪ ${made.lyrics.replace(/^\[[^\]]*\]\s*/gm, '').split('\n').filter(Boolean).join(' / ')}` : ''
    promptNote[i] = `${made.model} · “${made.sent}”${sung} → ${made.name} · ${made.seconds.toFixed(1)} s${made.tune ? ` · ${made.tune}` : ''}`
    // what was typed seeds this VCO's garden: the word model lists words for its rings from it
    void garden.seedWords(i, text).catch(() => {})
  } catch (e) {
    if (!ctl.signal.aborted) {
      promptErr[i] = true
      promptNote[i] = `${modelLabel(i)} · ${errorMessage(e)}`
    }
  } finally {
    promptBusy[i] = false
    promptAborts[i] = null
  }
}
const stopPrompt = (i: number) => promptAborts[i]?.abort()

// ── the PROMPT GARDEN (stores/garden.ts): a VCO regrowing its sample from rings of words ──
const garden = useGarden()
/** each VCO's colour, as its PLAY column and meters show it */
const vcoColor = (i: number) => [board.theme.primary, board.theme.secondary, board.theme.accent][i % 3]

// ── drop sounds into slots ──
const dropTarget = ref(-1)
function onDragOver(e: DragEvent, i: number) {
  if (!e.dataTransfer?.types.includes(REORDER_TYPE)) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
  dropTarget.value = i
  // (a tab dragged over opens; in the PLAY view the slots are all showing)
  if (!playView.value) tab.value = i
}
function onDrop(e: DragEvent, i: number) {
  dropTarget.value = -1
  const id = e.dataTransfer?.getData(REORDER_TYPE)
  if (!id) return
  e.preventDefault()
  board.assignSlot(i, id, patch.value?.id ?? null)
}

</script>

<template>
  <div class="rack">
    <div class="title">
      <template v-if="patch">
        <span class="lbl">{{ patch === board.candidate ? '★ CANDIDATE' : `PATCH ${String(board.patchNumber).padStart(2, '0')}` }}</span>
        <span
          v-if="board.isBuiltIn(patch)"
          class="built-in"
          title="Built in: SAVE leaves it as it is and makes your edits a patch of your own (RESTORE BUILT-INS in the + menu brings back any you delete)"
          >BUILT-IN</span
        >
        <input
          v-model="nameDraft"
          class="name"
          spellcheck="false"
          title="Patch name"
          @focus="editing = 'name'"
          @blur="editing = null"
          @change="patch!.name = nameDraft.trim() || patch!.name"
          @keydown.stop
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
        <input
          v-model="tagDraft"
          class="tags"
          spellcheck="false"
          placeholder="tags, comma, separated"
          title="Patch tags"
          @focus="editing = 'tag'"
          @blur="editing = null"
          @change="patch!.tag = tagDraft"
          @keydown.stop
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
        <button class="heart" :class="{ on: patch.fav }" title="Favourite" @click="board.toggleFav('patch', patch.id)">
          <v-icon size="16" :icon="patch.fav ? 'mdi-heart' : 'mdi-heart-outline'" />
        </button>
        <!-- (the global ones, moved here from the header: GLIDE and the global modulation matrix) -->
        <div class="inline-knob">
          <Knob v-model="board.master.glide" label="GLIDE" :min="0" :max="2" :step="0.005" :default="0" :format="fmtSec" :size="20" />
        </div>
        <button
          class="mpe-chip matrix-chip"
          :class="{ on: board.master.mod.routes.length, live: board.master.mod.routes.length }"
          :title="`Global modulation matrix: LFOs, mod wheel, aftertouch, velocity, bend and timbre on every voice (${board.master.mod.routes.length} route${board.master.mod.routes.length === 1 ? '' : 's'}). Click to edit`"
          @click="board.openMatrix('global')"
        >
          <v-icon size="13" icon="mdi-matrix" />
        </button>
        <button
          class="mpe-chip"
          :class="{ on: patch.mpe?.length, live: board.master.mpe }"
          :title="`MPE: what an MPE controller's STRIKE, PRESS and SLIDE do to this patch (${patch.mpe?.length ?? 0} binding${patch.mpe?.length === 1 ? '' : 's'}; only while MPE is ${board.master.mpe ? 'on, as now' : 'on — it is off'}). Click to edit`"
          @click="board.openMatrix('mpe')"
        >
          MPE<small v-if="patch.mpe?.length"> {{ patch.mpe.length }}</small>
        </button>
        <button
          class="mpe-chip play-chip"
          :class="{ on: padsOn }"
          :aria-pressed="padsOn"
          :title="padsOn ? 'PLAY view on: all three VCOs side by side, under their tabs — click (or a VCO tab) for one VCO\'s controls' : 'PLAY: all three VCOs side by side, each played from its clip and its XY pads'"
          @click="openPlay('pads')"
        >
          <v-icon size="12" icon="mdi-gamepad-variant" /> PLAY
        </button>
        <button
          class="mpe-chip play-chip voyage-chip"
          :class="{ on: voyageOn }"
          :aria-pressed="voyageOn"
          title="VOYAGE: straight into the ship, full screen — its parts are the three VCOs' pads (✕ at its top right comes back)"
          @click="openPlay('voyage')"
        >
          <v-icon size="12" icon="mdi-rocket-launch" /> VOYAGE
        </button>
        <button
          class="mpe-chip play-chip piano-chip"
          :class="{ on: board.master.piano.on }"
          :aria-pressed="board.master.piano.on"
          :title="board.master.piano.on ? 'Hide the on-screen keyboard' : 'An on-screen keyboard across the bottom, for playing with no keyboard at hand (touch, pen and multi-touch too)'"
          @click="board.master.piano.on = !board.master.piano.on"
        >
          <v-icon size="14" icon="mdi-piano" />
        </button>
        <v-spacer />
        <!-- (a candidate's SAVE / DISCARD are on its bar, under the header) -->
        <template v-if="patch !== board.candidate">
          <button
            class="hw-btn save"
            :class="{ lit: board.patchEdited }"
            :disabled="!board.patchEdited"
            :title="
              !board.patchEdited
                ? 'Nothing to save: edits to a patch wait for SAVE (choosing another patch drops them)'
                : board.isBuiltIn(patch)
                  ? 'SAVE: a built-in stays as it is; your edits become a patch of your own with its name, beside it'
                  : 'SAVE the edits into this patch'
            "
            @click="board.savePatch()"
          >
            <v-icon size="14" icon="mdi-content-save" /> SAVE
          </button>
          <button class="hw-btn" :disabled="!board.patchEdited" title="Drop the edits: the patch as it was saved" @click="board.revertPatch()">
            <v-icon size="14" icon="mdi-restore" /> REVERT
          </button>
          <button class="hw-btn" title="Duplicate this patch: the copy goes at the end of the list, and the rack shows it" @click="board.duplicatePatch(patch.id)">
            <v-icon size="14" icon="mdi-content-copy" /> DUPLICATE
          </button>
          <button class="hw-btn danger" title="Delete this patch (the rack then shows the next one)" @click="board.removePatch(patch.id)">
            <v-icon size="14" icon="mdi-delete" /> DELETE
          </button>
        </template>
      </template>
      <span v-else class="lbl">NO PATCH — drop a sound into a slot (or press 1 / 2 / 3 on a sound) to start one</span>
    </div>

    <div class="vtabs" role="tablist" aria-label="VCOs">
      <div
        v-for="(x, i) in slots"
        :key="i"
        class="vtab"
        :class="{ on: !playView && tab === i, empty: !x, live: !!x && sounding.has(x.layer.id), target: dropTarget === i, unheard: !heard(i) }"
        @dragover="(e) => onDragOver(e, i)"
        @dragleave="dropTarget = -1"
        @drop="(e) => onDrop(e, i)"
      >
        <VcoMeter v-if="x" kind="vu" :sound-id="x.layer.id" :color="vcoColor(i)" />
        <button class="pick" role="tab" :aria-selected="!playView && tab === i" :title="tabTitle(x, i)" @click="tab = i">
          <i class="led" />
          <b>{{ i + 1 }}</b>
          <span class="nm">{{ x ? sourceName(x) : 'EMPTY' }}</span>
          <em v-if="x && i > 0 && !x.audible">MOD</em>
        </button>
        <button class="ms mute" :class="{ on: muted(i) }" :aria-pressed="muted(i)" :title="muteTitle(i)" @click="toggleMix('vcoMute', i)">M</button>
        <button class="ms solo" :class="{ on: soloed(i) }" :aria-pressed="soloed(i)" :title="soloTitle(i)" @click="toggleMix('vcoSolo', i)">S</button>
      </div>
    </div>
    <!-- PLAY: the three VCOs' Play views together, a column each (stacked when the rack is narrow) -->
    <!-- VOYAGE (VCO 1's PERFORM settings): the pads as a ship, full screen -->
    <VoyageView v-if="playView && board.master.playMode === 'voyage'" />
    <div v-if="playView" class="playwrap" :class="{ 'gl-on': shaderPrefs.on && stageStatus.available }">
    <!-- the shader stage: one canvas behind every VCO's pads (lib/play/shaders.ts) -->
    <ShaderStage v-if="board.master.playMode !== 'voyage'" />
    <div ref="playBody" class="plays">
      <div v-if="board.master.playMode !== 'voyage'" class="pgrid">
      <div
        v-for="(x, i) in slots"
        :key="i"
        class="pslot"
        :class="{ empty: !x, target: dropTarget === i, unheard: !heard(i) }"
        @dragover="(e) => onDragOver(e, i)"
        @dragleave="dropTarget = -1"
        @drop="(e) => onDrop(e, i)"
      >
        <!-- its spectrogram, rising behind the column -->
        <VcoMeter v-if="x" kind="spectrum" class="pspec" :sound-id="x.layer.id" :color="vcoColor(i)" />
        <div class="phead">
          <b>{{ i + 1 }}</b>
          <span class="src" :title="tabTitle(x, i)">{{ x ? sourceName(x) : 'empty' }}</span>
          <em v-if="!heard(i)">{{ muted(i) ? 'MUTED' : 'SOLO OFF' }}</em>
          <em v-else-if="x && i > 0 && !x.audible">MOD</em>
          <GardenBar v-if="x" class="phead-garden" play :x="x" :slot="i" />
        </div>
        <PlayView v-if="x && layerOf(x)" :sound="layerOf(x)!" :slot="i" />
        <div v-else class="drop">
          <v-icon size="28" icon="mdi-tray-arrow-down" />
          <div>DRAG A SOUND HERE</div>
          <small>or press <b>{{ i + 1 }}</b> on a sound</small>
        </div>
      </div>
      </div>
    </div>
    </div>
    <div v-else class="slots">
      <template v-for="(x, i) in slots" :key="i">
      <div
        v-if="i === tab"
        class="slot"
        :class="{ empty: !x, target: dropTarget === i }"
        @dragover="(e) => onDragOver(e, i)"
        @dragleave="dropTarget = -1"
        @drop="(e) => onDrop(e, i)"
      >
        <div class="bar">
          <span class="src" :class="{ main: i === 0 }" :title="`VCO ${i + 1}${x ? ': ' + sourceName(x) : ''}`">{{ x ? sourceName(x) : 'empty' }}</span>
          <template v-if="x && i > 0">
            <button class="chip" :class="{ on: x.audible }" :title="x.audible ? 'Heard — click for MOD only' : 'Mod source only — click to hear it'" @click="x.audible = !x.audible">
              {{ x.audible ? 'MIX' : 'MOD' }}
            </button>
            <button class="chip" :class="{ on: x.track }" :title="x.track ? 'Follows the keyboard — click for a fixed note' : 'Fixed note — click to follow the keyboard'" @click="x.track = !x.track">
              {{ x.track ? 'TRACK' : 'FIXED' }}
            </button>
          </template>
          <span v-else-if="x" class="chip dim" title="VCO 1 is the main voice: heard, follows the keyboard">MAIN</span>
          <v-menu v-if="x" location="bottom start">
            <template #activator="{ props: act }">
              <button class="chip" :class="{ on: x.tuning !== 'et' }" v-bind="act" :title="`${TUNING_TITLE}. Now: ${TUNING[x.tuning].label}`">{{ TUNING[x.tuning].chip }}</button>
            </template>
            <div class="tuning-menu">
              <button v-for="m in TUNING_MODES" :key="m" :class="{ on: m === x.tuning }" @click="x.tuning = m">
                <b>{{ TUNING[m].label }}</b>
                <span>{{ TUNING[m].hint }}</span>
              </button>
            </div>
          </v-menu>
          <button
            v-if="x"
            class="chip"
            title="PLAY view: all three VCOs side by side, each played from its clip and its XY pads (grain, LFO, filter · reverb, pitch · ring, texture, echo, tone)"
            @click="playView = true"
          >
            PLAY
          </button>
          <GardenBar v-if="x" :x="x" :slot="i" />
          <v-spacer />
          <Knob
            v-if="x && x.tuning !== 'et'"
            v-model="x.tuningDepth"
            label="DEPTH"
            :default="1"
            :format="fmtPct"
            :size="22"
            color="accent"
            title="How far AJI goes: 100 % pure, 0 % equal temperament. Under an ET VCO, about 60-70 % sits best"
          />
          <template v-if="x && i > 0">
            <Knob v-model="x.level" label="LEVEL" :max="1.5" :default="1" :format="fmtLevel" :size="22" color="accent" />
            <Knob v-model="x.transpose" label="TRANS" :min="-24" :max="24" :step="1" :default="0" bipolar :format="fmtSemis" :size="22" color="accent" />
            <Knob v-model="x.fine" label="FINE" :min="-100" :max="100" :step="1" :default="0" bipolar :format="fmtCents" :size="22" color="accent" />
            <Knob v-if="!x.track" v-model="x.fixedNote" label="NOTE" :min="0" :max="127" :step="1" :default="60" :format="fmtNote" :size="22" color="accent" />
          </template>
          <button v-if="x" class="hw-btn remove" title="Remove this sound from the slot" @click="board.assignSlot(i, null, patch?.id ?? null)">
            <v-icon size="14" icon="mdi-close" /> <span class="word">REMOVE</span>
          </button>
        </div>
        <!-- The VCO wave prompt: the sound model picked in the AI settings makes a clip from a few words, and it
             becomes this slot's sound (no conversation, no download from here). In the app and the plugin. -->
        <form v-if="ai.soundAvailable" class="prompt" @submit.prevent="promptWave(i, false)">
          <v-icon size="14" icon="mdi-creation" />
          <input
            v-model="prompts[i]"
            class="prompt-text"
            spellcheck="false"
            :placeholder="x ? 'PROMPT A NEW WAVE FOR THIS VCO…' : 'PROMPT A WAVE FOR THIS VCO…'"
            :disabled="promptBusy[i]"
            :title="`A few words for this VCO's sound model (${modelLabel(i)} — ☰ beside GROW picks it): Enter or ➤ sends them as typed`"
            @keydown.stop
          />
          <button
            class="hw-btn icon send"
            type="submit"
            :class="{ busy: promptBusy[i] && !promptAuto[i] }"
            :disabled="promptBusy[i] || !prompts[i]!.trim()"
            :title="`Send the words as typed to ${modelLabel(i)}`"
          >
            <v-icon size="14" icon="mdi-send" />
          </button>
          <button
            class="hw-btn icon auto"
            type="button"
            :class="{ busy: promptBusy[i] && promptAuto[i] }"
            :disabled="promptBusy[i] || !prompts[i]!.trim()"
            :title="`The word model writes the words out — a fuller caption, and for a model that sings, the words to sing — then sends them to ${modelLabel(i)}`"
            @click="promptWave(i, true)"
          >
            <v-icon size="14" icon="mdi-chart-timeline-variant" />
          </button>
          <button v-if="promptBusy[i]" class="hw-btn icon" type="button" title="Stop" @click="stopPrompt(i)">
            <v-icon size="14" icon="mdi-stop" />
          </button>
          <span class="prompt-note" :class="{ err: promptErr[i] }">{{ promptNote[i] || `${modelLabel(i)} · ready` }}</span>
        </form>
        <div :ref="(el) => (bodies[i] = el as HTMLElement | null)" class="body">
          <ControlPanel v-if="x && layerOf(x)" :sound="layerOf(x)!" :hue="hue(layerOf(x)!)" :role="i === 0 ? 'patch' : 'vco'" :patch="patch ?? undefined" wide />
          <div v-else class="drop">
            <v-icon size="28" icon="mdi-tray-arrow-down" />
            <div>DRAG A SOUND HERE</div>
            <small>or press <b>{{ i + 1 }}</b> on a sound</small>
          </div>
        </div>
      </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.phead-garden {
  margin-left: auto;
}
.prompt {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin: 4px 0 2px;
  color: var(--text-mute);
}
.prompt-text {
  flex: 1 1 220px;
  min-width: 0;
  height: 22px;
  padding: 0 8px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 16px;
  color: var(--c-primary);
  background: var(--lcd-bg);
  border: 1px solid #000;
  outline: none;
}
.prompt-text::placeholder {
  color: var(--text-mute);
}
.prompt-note {
  flex: 1 1 100%;
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: var(--text-mute);
}
.prompt .hw-btn.icon.busy {
  color: rgb(var(--v-theme-success));
  animation: prompt-busy 1s ease-in-out infinite alternate;
}
@keyframes prompt-busy {
  to {
    opacity: 0.4;
  }
}
.prompt .hw-btn.auto:not(:disabled):hover {
  color: rgb(var(--v-theme-success));
}
.prompt-note.err {
  color: rgb(var(--v-theme-error));
}
.mpe-chip {
  flex: none;
  padding: 0 6px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 14px;
  line-height: 18px;
  color: var(--ink-mute);
  background: #111;
  border: 1px solid #000;
}
/* GLIDE, sat in the header's row: its readout and label beside a small knob */
.inline-knob :deep(.knob) {
  display: grid;
  grid-template-columns: auto auto;
  grid-template-rows: auto auto;
  column-gap: 4px;
  align-items: center;
  width: auto;
}
.inline-knob :deep(.knob-body) {
  grid-row: 1 / 3;
}
.inline-knob :deep(.readout) {
  margin: 0;
  font-size: 12px;
}
.inline-knob :deep(.label) {
  font-size: 6.5px;
}
.matrix-chip {
  display: inline-flex;
  align-items: center;
  height: 20px;
}
.mpe-chip.on {
  color: color-mix(in srgb, var(--c-secondary) 60%, var(--ink-mute));
}
.mpe-chip.on.live {
  color: var(--c-secondary);
  box-shadow: 0 0 6px color-mix(in srgb, var(--c-secondary) 40%, transparent);
}
.play-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.play-chip.on {
  color: #111;
  background: var(--c-accent);
  box-shadow: 0 0 8px color-mix(in srgb, var(--c-accent) 50%, transparent);
}
.voyage-chip:hover {
  color: var(--c-accent);
}
.mpe-chip small {
  font-size: 11px;
}
/* a built-in patch: SAVE keeps edits as a patch of your own */
.built-in {
  flex: none;
  padding: 0 5px;
  border-radius: 2px;
  font-family: 'Orbitron', sans-serif;
  font-size: 7.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  line-height: 14px;
  color: var(--text-mute);
  border: 1px solid color-mix(in srgb, var(--text-mute) 50%, transparent);
}
.save.lit {
  color: var(--c-accent);
  text-shadow: 0 0 6px color-mix(in srgb, var(--c-accent) 80%, transparent);
  box-shadow:
    0 2px 0 #0a0a0b,
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    inset 0 0 10px color-mix(in srgb, var(--c-accent) 30%, transparent);
}
.rack {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 6px 22px 8px;
  background: color-mix(in srgb, var(--bg-lo) 85%, #000);
  border-bottom: 2px solid #000;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45);
}
.title {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin-bottom: 6px;
}
.lbl {
  font-family: 'Orbitron', sans-serif;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.15em;
  color: var(--text-head);
}
.title input {
  height: 24px;
  padding: 0 8px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 17px;
  color: var(--c-primary);
  background: var(--lcd-bg);
  border: 1px solid #000;
  outline: none;
}
/* (they give way before the buttons wrap) */
.title .name {
  flex: 1 1 120px;
  min-width: 0;
  max-width: 240px;
}
.title .tags {
  flex: 1 1 100px;
  min-width: 0;
  max-width: 300px;
  color: var(--c-secondary);
}
.heart {
  color: var(--text-mute);
}
.heart.on {
  color: #ff3d6e;
  filter: drop-shadow(0 0 4px #ff3d6e);
}
/* the VCO tabs, folder tabs on the slot showing */
.vtabs {
  flex: none;
  /* a tab over each PLAY column: the same three columns, gaps and inset (.plays' padding and border, .pgrid's gap) */
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 0 7px;
}
.vtab {
  /* its meters (VcoTabMeter) lie behind the name, M and S */
  position: relative;
  overflow: hidden;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 3px;
  height: 26px;
  padding: 0 5px 0 0;
  border-radius: 6px 6px 0 0;
  font-family: 'VT323', monospace;
  font-size: 16px;
  text-transform: uppercase;
  color: var(--ink-mute);
  background: #141317;
  border: 1px solid #000;
  border-bottom: 0;
}
.vtab:hover {
  color: var(--text);
}
/* the tab's name picks it; M / S beside it */
.vtab .pick,
.vtab .ms {
  position: relative;
  z-index: 1;
}
.vtab .pick {
  /* (no button face of its own: the tab's colour, and its meters, show through) */
  background: none;
  border: 0;
  flex: 1;
  min-width: 0;
  align-self: stretch;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px 0 10px;
  font: inherit;
  color: inherit;
  text-transform: inherit;
}
.ms {
  flex: none;
  width: 17px;
  height: 16px;
  border-radius: 2px;
  font-family: 'Orbitron', sans-serif;
  font-size: 8px;
  font-weight: 900;
  line-height: 14px;
  color: var(--ink-mute);
  background: #111;
  border: 1px solid #000;
}
.ms:hover {
  color: var(--text);
}
.ms.mute.on {
  color: #111;
  background: var(--c-danger);
  box-shadow: 0 0 6px color-mix(in srgb, var(--c-danger) 60%, transparent);
}
.ms.solo.on {
  color: #111;
  background: var(--c-accent);
  box-shadow: 0 0 6px color-mix(in srgb, var(--c-accent) 60%, transparent);
}
/* muted, or soloed away: the name dims */
.vtab.unheard .nm,
.pslot.unheard .phead .src {
  opacity: 0.45;
}
.vtab b {
  font-family: 'Orbitron', sans-serif;
  font-size: 10px;
  font-weight: 900;
  color: var(--text-mute);
}
.vtab .nm {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vtab em {
  font-style: normal;
  font-size: 12px;
  color: var(--text-mute);
}
.vtab.empty .nm {
  color: var(--text-faint);
}
.vtab.on {
  color: var(--c-secondary);
  background: rgba(0, 0, 0, 0.5);
  border-color: rgba(255, 255, 255, 0.08);
}
.vtab.on b {
  color: var(--c-primary);
}
.vtab.target {
  color: var(--c-secondary);
  box-shadow: 0 0 10px color-mix(in srgb, var(--c-secondary) 45%, transparent);
}
.vtab .led {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #1a2a1a;
  box-shadow: inset 0 0 2px #000;
}
.vtab.live .led {
  background: var(--c-success);
  box-shadow: 0 0 6px var(--c-success);
}
/* the slot showing takes the width */
.slots {
  flex: 1;
  min-height: 0;
  display: flex;
}
.slot {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-radius: 0 6px 6px 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.18);
}
/* PLAY: a column per VCO; stacked, one under another, when the rack is too narrow for three. The wrap holds the
   shader stage behind the scrolling view, so it always covers what's in sight */
.playwrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: 6px;
}
.plays {
  position: relative;
  flex: 1;
  min-height: 0;
  /* the columns fill it exactly (the pads fit, never past it); it scrolls only if the window is too small for any */
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  scrollbar-width: thin;
  padding: 6px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.18);
  container-type: inline-size;
}
.playwrap.gl-on {
  background: rgba(0, 0, 0, 0.32);
}
.playwrap.gl-on .plays {
  background: transparent;
}
.playwrap.gl-on .pslot {
  background: transparent;
}
/* over the stage the Play views are see-through, so its light shows between and through their pads */
.playwrap.gl-on :deep(.play) {
  background: color-mix(in srgb, var(--panel-lo) 25%, transparent);
}
.playwrap.gl-on :deep(.play .pad),
.playwrap.gl-on :deep(.play .perform) {
  background: color-mix(in srgb, var(--lcd-bg) 35%, transparent);
}
.pgrid {
  flex: 1 0 auto;
  min-height: 100%;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: minmax(280px, 1fr);
  align-items: stretch;
  gap: 6px;
}
/* narrow: the VCOs one above another, a third of the height each (each lays its pads out wide, in a row) */
@container (max-width: 720px) {
  .pgrid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: repeat(3, minmax(170px, 1fr));
  }
}
.pslot {
  /* its spectrogram (VcoMeter) lies behind the header and the Play view */
  position: relative;
  isolation: isolate;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.18);
}
.pslot :deep(.play) {
  border-radius: 0 0 6px 6px;
  flex: 1;
  min-height: 0;
}
.pslot > .phead {
  flex: none;
}
.pspec {
  z-index: 0;
}
.pslot > .phead,
.pslot > :deep(.play),
.pslot > .drop {
  position: relative;
  z-index: 1;
}
.phead {
  /* the garden's knobs drop their readouts in a narrow column (GardenBar.vue) */
  container-type: inline-size;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 8px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  text-transform: uppercase;
  color: var(--ink-dim);
  border-radius: 5px 5px 0 0;
  background: rgba(0, 0, 0, 0.5);
}
.phead b {
  font-family: 'Orbitron', sans-serif;
  font-size: 10px;
  font-weight: 900;
  color: var(--c-primary);
}
.phead em {
  margin-left: auto;
  font-style: normal;
  font-size: 12px;
  color: var(--text-mute);
}
.pslot .drop {
  height: 160px;
}
.slot.empty,
.pslot.empty {
  border: 2px dashed color-mix(in srgb, var(--c-primary) 30%, transparent);
}
.pslot.target,
.slot.target {
  border: 2px solid var(--c-secondary);
  box-shadow: 0 0 14px color-mix(in srgb, var(--c-secondary) 45%, transparent);
}
.bar {
  flex: none;
  display: flex;
  /* a narrow slot: its chips and knobs wrap onto another line rather than spill out of the rack */
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 4px;
  padding: 3px 6px;
  min-height: 53px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  /* a dark strip (like the LCDs) so names and chips read on light themes too */
  color: var(--ink-dim);
  text-transform: uppercase;
  border-radius: 0 5px 0 0;
  background: rgba(0, 0, 0, 0.5);
  border-bottom: 1px solid rgba(0, 0, 0, 0.5);
  container-type: inline-size;
}
.bar :deep(.knob .label) {
  color: var(--ink-dim);
}
/* the sound's name gives way first (to … then a few letters) before anything wraps onto a second line */
.src {
  flex: 1 1 4ch;
  max-width: max-content;
  min-width: 4ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--c-secondary);
}
.bar :deep(.knob) {
  width: 36px;
}
.bar :deep(.label) {
  font-size: 6.5px;
}
.chip {
  flex: none;
  padding: 0 5px;
  white-space: nowrap;
  border-radius: 2px;
  font-size: 13px;
  line-height: 14px;
  color: var(--ink-dim);
  background: #111;
  border: 1px solid #000;
}
.chip.on {
  color: var(--c-secondary);
}
.chip.dim {
  color: var(--text-mute);
}
/* beside the list a slot is narrow, and tuning adds a knob: everything still fits on one line (after the rules above) */
@container (max-width: 560px) {
  .bar > .remove {
    min-width: 0;
    width: 22px;
    height: 22px;
    padding: 0;
  }
  .bar > .remove .word {
    display: none;
  }
  .bar :deep(.knob) {
    width: 30px;
  }
  .chip {
    padding: 0 3px;
  }
}
.tuning-menu {
  display: grid;
  gap: 4px;
  width: 340px;
  padding: 6px;
  border-radius: 6px;
  background: linear-gradient(180deg, var(--panel-hi), var(--panel-lo));
  border: 1px solid #000;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
}
.tuning-menu button {
  display: grid;
  padding: 3px 8px;
  border-radius: 2px;
  font-family: 'VT323', monospace;
  text-align: left;
  color: var(--ink-mute);
  background: #111;
  border: 1px solid #000;
}
.tuning-menu b {
  font-size: 15px;
  font-weight: 400;
}
.tuning-menu span {
  font-size: 13px;
  line-height: 13px;
  color: var(--ink-dim);
}
.tuning-menu button.on b {
  color: var(--c-secondary);
  text-shadow: 0 0 4px color-mix(in srgb, var(--c-secondary) 70%, transparent);
}
.remove {
  height: 24px;
  font-size: 9px;
}
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}
.body :deep(.panel) {
  margin: 0;
  padding: 8px 10px 8px;
  border-radius: 0 0 6px 6px;
}
.drop {
  height: 100%;
  min-height: 90px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-family: 'Orbitron', sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: color-mix(in srgb, var(--c-primary) 70%, transparent);
}
.drop small {
  font-family: 'VT323', monospace;
  font-size: 15px;
  letter-spacing: 0.05em;
  color: var(--text-mute);
}
</style>
