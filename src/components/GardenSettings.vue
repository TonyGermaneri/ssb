<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useBoard } from '../stores/board'
import { useGarden } from '../stores/garden'
import { newRing, RING_COLORS, RING_KINDS, ringWordIndex, type Ring, type RingKind } from '../lib/garden/garden'
import { riffAvailable, riffModel, riffState } from '../lib/garden/riff'
import Knob from './Knob.vue'

/**
 * A VCO's prompt garden, the rest of it (the GARDEN pad's ⚙, the ship's rings' settings): the PROMPT its rings' words
 * grow from (the word model lists words of each ring's kind for it), the rings themselves -- which is on the pad, add,
 * remove, kind, LOCK, MUTE, CYCLE / RANDOM / WALK, HOLD / DROP, ROTATE, their words -- BACK, PAD STEP, REUSE and the seed.
 */
const props = defineProps<{ slot: number }>()
const board = useBoard()
const garden = useGarden()
watch(() => props.slot, () => void garden.gardenOf(props.slot), { immediate: true })
const g = computed(() => board.selectedPatch?.slots[props.slot]?.garden ?? null)
const ring = computed<Ring | null>(() => garden.ringOf(props.slot))
const pick = (id: string) => garden.picked.set(props.slot, id)
const colorOf = (r: Ring) => RING_COLORS[(g.value?.rings.indexOf(r) ?? 0) % RING_COLORS.length]

const prompt = ref('')
const wording = computed(() => garden.wording.get(props.slot))
const wordLine = computed(() => {
  const w = wording.value
  if (w?.left) return `listing words for "${w.prompt}"… ${w.left} ring kind${w.left === 1 ? '' : 's'} to go`
  if (w?.note) return w.note
  if (!riffAvailable()) return riffState.on ? 'download a WORD MODEL in AI settings: the rings\' words come from it' : 'the WORD MODEL is off (AI settings)'
  return g.value?.subject ? `words from "${g.value.subject}" · ${riffModel().label}` : `type a prompt: ${riffModel().label} lists the rings' words from it`
})
async function seed() {
  const t = prompt.value.trim()
  if (!t) return
  prompt.value = ''
  await garden.seedWords(props.slot, t)
}
function addRing(kind: RingKind) {
  const v = g.value
  if (!v) return
  // a new ring of a kind already there shares its words; a new kind waits for the next prompt (or asks now)
  const same = v.rings.find((r) => r.kind === kind)
  const r = newRing(kind, { k: 1 + Math.floor(Math.random() * 4), n: [4, 5, 6, 7, 8, 12, 16][Math.floor(Math.random() * 7)], rot: Math.floor(Math.random() * 4), ...(same ? { words: [...same.words] } : {}) })
  v.rings.push(r)
  pick(r.id)
  if (!same && v.subject && riffAvailable()) void garden.seedWords(props.slot, v.subject)
}
function removeRing(r: Ring) {
  const v = g.value
  if (!v || v.rings.length <= 1) return
  v.rings = v.rings.filter((x) => x !== r)
}
function toggleLock(r: Ring) {
  const v = g.value
  if (!v) return
  if (!r.locked) r.lockWord = Math.max(0, ringWordIndex(r, v.step, v.seed))
  r.locked = !r.locked
}
const fmtInt = (v: number) => String(Math.round(v))
const fmtPct = (v: number) => `${Math.round(v * 100)}%`
const back = computed({ get: () => g.value?.back ?? 0, set: (v: number) => g.value && (g.value.back = v) })
const amount = computed({ get: () => g.value?.pads.amount ?? 0.25, set: (v: number) => g.value && (g.value.pads.amount = Math.round(v * 100) / 100) })
const reroll = () => g.value && (g.value.seed = Math.floor(Math.random() * 1e6))

</script>

<template>
  <div v-if="g" class="gp" @keydown.stop>
    <span class="head">PROMPT</span>
    <div class="row prompt-row">
      <input v-model="prompt" class="text" spellcheck="false" placeholder="in the depths of moria…" @keydown.enter="seed" />
      <button class="opt" :disabled="!prompt.trim()" title="The word model lists words for each ring from this prompt" @click="seed">WORDS</button>
    </div>
    <small class="note">{{ wordLine }}</small>

    <span class="head">RINGS</span>
    <div class="row">
      <button v-for="r in g.rings" :key="r.id" class="opt ring" :class="{ on: r.id === ring?.id, muted: r.off }" :style="{ '--rc': colorOf(r) }" @click="pick(r.id)">
        {{ r.label }} {{ r.k }}/{{ r.n }}<span v-if="r.locked">🔒</span>
      </button>
      <v-menu location="bottom" :z-index="3000">
        <template #activator="{ props: act }">
          <button class="opt" v-bind="act" title="Add a ring">+ RING</button>
        </template>
        <div class="kinds">
          <button v-for="k in RING_KINDS" :key="k" @click="addRing(k)">{{ k.toUpperCase() }}</button>
        </div>
      </v-menu>
    </div>
    <template v-if="ring">
      <div class="row">
        <select v-model="ring.kind" class="select" title="What kind of word: where it goes in the phrase, and what the word model lists for it">
          <option v-for="k in RING_KINDS" :key="k" :value="k">{{ k.toUpperCase() }}</option>
        </select>
        <button class="opt" :class="{ on: ring.locked }" title="LOCK: frozen on its word (a new prompt leaves its words alone)" @click="toggleLock(ring)">LOCK</button>
        <button class="opt" :class="{ on: ring.off }" title="MUTE: out of the caption" @click="ring.off = !ring.off">MUTE</button>
        <button class="opt" :disabled="g.rings.length <= 1" title="Remove this ring" @click="removeRing(ring)"><v-icon size="12" icon="mdi-delete" /></button>
      </div>
      <div class="row">
        <button v-for="m in (['cycle', 'random', 'walk'] as const)" :key="m" class="opt" :class="{ on: ring.move === m }" title="How it moves on at a hit" @click="ring.move = m">{{ m.toUpperCase() }}</button>
      </div>
      <div class="row">
        <button class="opt" :class="{ on: !ring.drop }" title="HOLD: its word stays in the caption between hits" @click="ring.drop = false">HOLD</button>
        <button class="opt" :class="{ on: ring.drop }" title="DROP: heard only on its hits" @click="ring.drop = true">DROP</button>
      </div>
      <div class="knobs">
        <Knob v-model="ring.rot" label="ROTATE" :min="0" :max="Math.max(0, ring.n - 1)" :step="1" :default="0" :size="26" :format="fmtInt" />
        <Knob v-model="back" label="BACK" :min="0" :max="1" :default="0.1" :size="26" :format="fmtPct" title="The chance a step goes back to an earlier clip instead of a new one" />
        <Knob v-model="amount" label="PAD STEP" :min="0" :max="1" :default="0.25" :size="26" :format="fmtPct" title="How far a pad that grows (its automation toggle) steps at each new clip, of its width and height" />
      </div>
      <div class="words" :style="{ '--rc': colorOf(ring) }" title="This ring's words (from the word model)">
        <span v-for="(w, k) in ring.words" :key="k">{{ w }}</span>
      </div>
    </template>
    <div class="row">
      <button class="opt" :class="{ on: g.reuse }" title="REUSE: a caption that came up before plays its clip again (the garden loops for real)" @click="g.reuse = !g.reuse">REUSE</button>
      <button class="opt" :title="`SEED ${g.seed}: click for a new one — other words come up, other clips`" @click="reroll">🎲 {{ g.seed }}</button>
    </div>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
}
.opt {
  padding: 1px 8px;
  border-radius: 10px;
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
.knobs {
  display: flex;
  gap: 4px;
}
.knobs :deep(.label) {
  color: color-mix(in srgb, var(--line) 75%, transparent);
}
.head {
  font-family: 'Orbitron', sans-serif;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.15em;
  color: var(--line);
}
.gp {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  width: 100%;
}
.prompt-row {
  width: 100%;
  flex-wrap: nowrap !important;
}
.text {
  flex: 1;
  min-width: 0;
  height: 22px;
  padding: 0 6px;
  border-radius: 8px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: var(--line);
  background: color-mix(in srgb, var(--line) 8%, var(--lcd-bg));
  border: 1px solid color-mix(in srgb, var(--line) 45%, transparent);
  outline: none;
}
.note {
  max-width: 100%;
  text-align: center;
  font-family: 'VT323', monospace;
  font-size: 13px;
  line-height: 1.1;
  color: color-mix(in srgb, var(--line) 70%, transparent);
}
.opt.ring {
  color: var(--rc);
  border-color: color-mix(in srgb, var(--rc) 55%, transparent);
}
.opt.ring.on {
  color: #05030a;
  background: var(--rc);
}
.opt.ring.muted {
  opacity: 0.45;
}
.opt:disabled {
  opacity: 0.4;
}
.select {
  appearance: auto;
  padding: 0 4px;
  border-radius: 4px;
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: color-mix(in srgb, var(--line) 80%, transparent);
  background: color-mix(in srgb, var(--line) 10%, var(--lcd-bg));
  border: 1px solid color-mix(in srgb, var(--line) 45%, transparent);
}
.words {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 2px 8px;
  max-width: 100%;
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: var(--rc);
}
.kinds {
  display: flex;
  flex-direction: column;
  padding: 4px;
  border-radius: 6px;
  background: linear-gradient(180deg, var(--panel-hi), var(--panel-lo));
  border: 1px solid #000;
}
.kinds button {
  padding: 3px 10px;
  text-align: left;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: var(--text);
}
.kinds button:hover {
  color: var(--c-primary);
}
</style>
