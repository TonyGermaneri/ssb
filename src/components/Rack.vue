<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBoard } from '../stores/board'
import { fmtCents, fmtSemis, midiNoteName, padHue } from '../lib/format'
import { PATCH_SLOTS, type Patch, type PatchSlot, type Sound } from '../types'
import ControlPanel from './ControlPanel.vue'
import Knob from './Knob.vue'

/**
 * A patch's three VCO slots, side by side across the width. Empty slots are drop zones for sounds (drag a pad by its
 * grip, or press 1 / 2 / 3 on it). Fills its pane (left of the list, or the whole window); `inline`: inside a patch
 * card's open row, at natural height.
 */
const props = defineProps<{ patch?: Patch | null; inline?: boolean }>()
const board = useBoard()
const REORDER_TYPE = 'application/x-ssb-sound'

const patch = computed(() => (props.inline ? props.patch : board.selectedPatch) ?? null)
const slots = computed<(PatchSlot | null)[]>(() => patch.value?.slots ?? Array.from({ length: PATCH_SLOTS }, () => null))
const layerOf = (x: PatchSlot | null): Sound | undefined => (x ? board.layerSound(x.layer) : undefined)
const sourceName = (x: PatchSlot | null) => (x ? board.byId(x.layer.soundId)?.settings.name ?? '(missing sound)' : '')
const hue = (s: Sound) => padHue(s.settings.tag, s.settings.name, board.theme.padHues)
const fmtLevel = (v: number) => `${Math.round(v * 100)}`
const fmtNote = (v: number) => midiNoteName(Math.round(v))

// ── drop sounds into slots ──
const dropTarget = ref(-1)
function onDragOver(e: DragEvent, i: number) {
  if (!e.dataTransfer?.types.includes(REORDER_TYPE)) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'copy'
  dropTarget.value = i
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
  <div class="rack" :class="{ inline }">
    <div v-if="!inline" class="title">
      <template v-if="patch">
        <span class="lbl">PATCH {{ String(board.patchNumber).padStart(2, '0') }}</span>
        <input
          :value="patch.name"
          class="name"
          spellcheck="false"
          title="Patch name"
          @change="(e) => (patch!.name = (e.target as HTMLInputElement).value.trim() || patch!.name)"
          @keydown.stop
        />
        <input
          :value="patch.tag"
          class="tags"
          spellcheck="false"
          placeholder="tags, comma, separated"
          title="Patch tags"
          @change="(e) => (patch!.tag = (e.target as HTMLInputElement).value)"
          @keydown.stop
        />
        <button class="heart" :class="{ on: patch.fav }" title="Favourite" @click="board.toggleFav('patch', patch.id)">
          <v-icon size="16" :icon="patch.fav ? 'mdi-heart' : 'mdi-heart-outline'" />
        </button>
      </template>
      <span v-else class="lbl">NO PATCH — drop a sound into a slot (or press 1 / 2 / 3 on a sound) to start one</span>
    </div>

    <div class="slots">
      <div
        v-for="(x, i) in slots"
        :key="i"
        class="slot"
        :class="{ empty: !x, target: dropTarget === i }"
        @dragover="(e) => onDragOver(e, i)"
        @dragleave="dropTarget = -1"
        @drop="(e) => onDrop(e, i)"
      >
        <div class="bar">
          <b :class="{ main: i === 0 }">VCO {{ i + 1 }}</b>
          <span class="src">{{ x ? sourceName(x) : 'empty' }}</span>
          <template v-if="x && i > 0">
            <button class="chip" :class="{ on: x.audible }" :title="x.audible ? 'Heard — click for MOD only' : 'Mod source only — click to hear it'" @click="x.audible = !x.audible">
              {{ x.audible ? 'MIX' : 'MOD' }}
            </button>
            <button class="chip" :class="{ on: x.track }" :title="x.track ? 'Follows the keyboard — click for a fixed note' : 'Fixed note — click to follow the keyboard'" @click="x.track = !x.track">
              {{ x.track ? 'TRACK' : 'FIXED' }}
            </button>
          </template>
          <span v-else-if="x" class="chip dim" title="VCO 1 is the main voice: heard, follows the keyboard">MAIN</span>
          <v-spacer />
          <template v-if="x && i > 0">
            <Knob v-model="x.level" label="LEVEL" :max="1.5" :default="1" :format="fmtLevel" :size="22" color="accent" />
            <Knob v-model="x.transpose" label="TRANS" :min="-24" :max="24" :step="1" :default="0" bipolar :format="fmtSemis" :size="22" color="accent" />
            <Knob v-model="x.fine" label="FINE" :min="-100" :max="100" :step="1" :default="0" bipolar :format="fmtCents" :size="22" color="accent" />
            <Knob v-if="!x.track" v-model="x.fixedNote" label="NOTE" :min="0" :max="127" :step="1" :default="60" :format="fmtNote" :size="22" color="accent" />
          </template>
          <button v-if="x" class="hw-btn remove" title="Remove this sound from the slot" @click="board.assignSlot(i, null, patch?.id ?? null)">
            <v-icon size="14" icon="mdi-close" /> REMOVE
          </button>
        </div>
        <div class="body">
          <ControlPanel v-if="x && layerOf(x)" :sound="layerOf(x)!" :hue="hue(layerOf(x)!)" :role="i === 0 ? 'patch' : 'vco'" :patch="patch ?? undefined" wide />
          <div v-else class="drop">
            <v-icon size="28" icon="mdi-tray-arrow-down" />
            <div>DRAG A SOUND HERE</div>
            <small>or press <b>{{ i + 1 }}</b> on a sound card</small>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rack {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 6px 22px 8px;
  background: color-mix(in srgb, var(--bg-lo) 85%, #000);
  border-bottom: 2px solid #000;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45);
}
.rack.inline {
  padding: 4px 0 8px;
  background: none;
  border: 0;
  box-shadow: none;
}
.title {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.lbl {
  font-family: 'Orbitron', sans-serif;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.15em;
  color: var(--c-primary);
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
.title .name {
  width: 240px;
}
.title .tags {
  width: 300px;
  color: var(--c-secondary);
}
.heart {
  color: var(--text-mute);
}
.heart.on {
  color: #ff3d6e;
  filter: drop-shadow(0 0 4px #ff3d6e);
}
/* three slots share the width: 3 wide at 1920 */
.slots {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.slot {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.18);
}
.slot.empty {
  border: 2px dashed color-mix(in srgb, var(--c-primary) 30%, transparent);
}
.slot.target {
  border: 2px solid var(--c-secondary);
  box-shadow: 0 0 14px color-mix(in srgb, var(--c-secondary) 45%, transparent);
}
.bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  height: 53px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: var(--text-dim);
  text-transform: uppercase;
  border-bottom: 1px solid rgba(0, 0, 0, 0.5);
}
.bar b {
  flex: none;
  white-space: nowrap;
  font-family: 'Orbitron', sans-serif;
  font-size: 10px;
  letter-spacing: 0.15em;
  color: var(--c-accent);
}
.bar b.main {
  color: var(--c-primary);
}
.src {
  min-width: 0;
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
  padding: 0 5px;
  border-radius: 2px;
  font-size: 13px;
  line-height: 14px;
  color: var(--text-dim);
  background: #111;
  border: 1px solid #000;
}
.chip.on {
  color: var(--c-secondary);
}
.chip.dim {
  color: var(--text-mute);
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
.inline .body {
  overflow: visible;
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
