<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useBoard } from '../stores/board'
import { SKETCH_MODEL, useGarden } from '../stores/garden'
import {
  CHIP_GROUPS, CHIPS, composeCaption, ENUM_GRIDS, gardenPeriod, newRing, RING_COLORS, RING_KINDS, ringWordIndex, WORD_BANKS,
  DEFAULT_GARDEN_MODEL, FADE_MAX, OFFSET_MAX, PAD_GROWTH_PADS, TAKES_KEPT, type ChipGroup, type EnumGrid, type GardenTake, type Ring, type RingKind,
} from '../lib/garden/garden'
import { SOUND_MODELS } from '../lib/ai/soundModels'
import { soundModelsAvailable } from '../lib/ai/soundHost'
import { isTake } from '../lib/tags'
import Knob from './Knob.vue'
import GardenRings from './GardenRings.vue'
import GardenGame, { type GameWord } from './GardenGame.vue'

/**
 * The PROMPT GARDEN of VCO `slot` (lib/garden/garden.ts, stores/garden.ts): its rings of words (as circles), the chips
 * and grids every caption carries, the GAME that picks words by playing, the takes it has grown, and how it grows.
 */
const open = defineModel<boolean>({ required: true })
const props = defineProps<{ slot: number }>()
const board = useBoard()
const garden = useGarden()

const g = computed(() => (open.value ? garden.gardenOf(props.slot) : null))
const PAD_NAMES: Record<string, string> = { perform: 'PERFORM', grain: 'GRAIN', lfo: 'LFO', fx: 'FILTER · REVERB', pitch: 'PITCH · RING', texture: 'TEXTURE', echo: 'ECHO', tone: 'TONE' }
const padAmount = computed({ get: () => g.value?.pads.amount ?? 0.25, set: (v: number) => g.value && (g.value.pads.amount = Math.round(v * 100) / 100) })
function togglePad(id: string) {
  const p = g.value?.pads
  if (!p) return
  p.pads = p.pads.includes(id) ? p.pads.filter((x) => x !== id) : [...p.pads, id]
}
const run = computed(() => garden.runFor(props.slot))
const slotSound = computed(() => {
  const x = board.selectedPatch?.slots[props.slot]
  return x ? board.byId(x.layer.soundId) : undefined
})
const tab = ref<'rings' | 'chips' | 'game' | 'history' | 'grow'>('rings')
const selected = ref<string | null>(null)
const ring = computed(() => g.value?.rings.find((r) => r.id === selected.value) ?? null)
watch(g, (v) => {
  if (v && !v.rings.some((r) => r.id === selected.value)) selected.value = v.rings[0]?.id ?? null
}, { immediate: true })

const colorOf = (r: Ring) => RING_COLORS[(g.value?.rings.indexOf(r) ?? 0) % RING_COLORS.length]
const nextCaption = computed(() => (g.value ? composeCaption(g.value, g.value.step + 1, run.value?.catch.length ? run.value.catch : undefined).prompt : ''))
const period = computed(() => (g.value ? gardenPeriod(g.value) : 1))
const status = computed(() => {
  const r = run.value
  if (!g.value?.on || !r) return 'OFF'
  if (g.value.paused) return 'PAUSED · the clip playing loops on; nothing new is made or stitched in'
  if (r.status === 'growing') return `GROWING ${Math.round(r.genProgress * 100)} %: ${r.growing}`
  if (r.status === 'ready') return `NEXT READY · stitches in after ${g.value.loops} loop${g.value.loops === 1 ? '' : 's'} (${Math.round(r.progress * 100)} %)`
  if (r.status === 'error') return `⚠ ${r.note}`
  return r.started ? 'WAITING FOR THE MODEL…' : 'PLAY THE VCO: the garden grows while it sounds'
})

// ── rings ──
function addRing(kind: RingKind) {
  if (!g.value) return
  const r = newRing(kind, { k: 1 + Math.floor(Math.random() * 4), n: [4, 5, 6, 7, 8, 12, 16][Math.floor(Math.random() * 7)], rot: Math.floor(Math.random() * 4) })
  g.value.rings.push(r)
  selected.value = r.id
}
function removeRing(r: Ring) {
  if (!g.value) return
  g.value.rings = g.value.rings.filter((x) => x !== r)
}
function toggleLock(r: Ring) {
  if (!g.value) return
  if (!r.locked) r.lockWord = Math.max(0, ringWordIndex(r, g.value.step, g.value.seed))
  r.locked = !r.locked
}
const wordsText = computed({
  get: () => ring.value?.words.join(', ') ?? '',
  set: (t: string) => {
    if (ring.value) ring.value.words = t.split(',').map((w) => w.trim()).filter(Boolean)
  },
})
function onRotate(id: string, rot: number) {
  const r = g.value?.rings.find((x) => x.id === id)
  if (r) r.rot = rot
}
function onHits(id: string, d: number) {
  const r = g.value?.rings.find((x) => x.id === id)
  if (r) r.k = Math.max(0, Math.min(r.n, r.k + d))
}

// ── chips and grids ──
const customChip = ref<Record<ChipGroup, string>>({ genre: '', mood: '', style: '' })
function toggleChip(group: ChipGroup, chip: string) {
  if (!g.value) return
  const lit = g.value.chips[group]
  g.value.chips[group] = lit.includes(chip) ? lit.filter((c) => c !== chip) : [...lit, chip]
}
function addChip(group: ChipGroup) {
  const t = customChip.value[group].trim()
  if (t && g.value && !g.value.chips[group].includes(t)) g.value.chips[group] = [...g.value.chips[group], t]
  customChip.value[group] = ''
}
const chipsOf = (group: ChipGroup) => [...new Set([...CHIPS[group], ...(g.value?.chips[group] ?? [])])]
const GRID_LABEL: Record<EnumGrid, string> = { bpm: 'TEMPO (BPM)', key: 'KEY', scale: 'SCALE', seconds: 'LENGTH (S)' }
const gridKeys = Object.keys(ENUM_GRIDS) as EnumGrid[]
function toggleCell(grid: EnumGrid, v: string | number) {
  if (!g.value) return
  const lit = g.value.grids[grid] as (string | number)[]
  ;(g.value.grids[grid] as (string | number)[]) = lit.includes(v) ? lit.filter((x) => x !== v) : [...lit, v]
}
const cellOn = (grid: EnumGrid, v: string | number) => (g.value?.grids[grid] as (string | number)[] | undefined)?.includes(v) ?? false

// ── game ──
const gameWords = computed<GameWord[]>(() => {
  const v = g.value
  if (!v) return []
  return [
    ...v.rings.filter((r) => !r.off).flatMap((r) => r.words.map((word) => ({ word, ringId: r.id, color: colorOf(r) }))),
    ...CHIP_GROUPS.flatMap((c) => v.chips[c].map((word) => ({ word, ringId: null, color: '#ffffff' }))),
  ]
})
const caught = ref<GameWord[]>([])
function plantCatch() {
  garden.plant(props.slot, caught.value.map((w) => w.word))
}
function lockToCatch() {
  const v = g.value
  if (!v) return
  for (const w of caught.value) {
    const r = v.rings.find((x) => x.id === w.ringId)
    const i = r?.words.indexOf(w.word) ?? -1
    if (r && i >= 0) {
      r.locked = true
      r.lockWord = i
    }
  }
}

// ── history ──
const fmtAgo = (t: GardenTake) => {
  const s = Math.round((Date.now() - t.at) / 1000)
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`
}
const takeName = (t: GardenTake) => board.byId(t.soundId)?.settings.name ?? '(gone)'
/** a take that can still be SAVEd: its audio here, and not saved yet */
const savable = (soundId: string) => isTake(board.byId(soundId)?.settings.tag)
function audition(t: GardenTake, on: boolean) {
  if (!board.byId(t.soundId)) return
  if (on) board.press(t.soundId)
  else board.release(t.soundId)
}

// ── grow ──
const MODEL_CHOICES = computed(() => [
  { id: '', label: `${SOUND_MODELS.find((m) => m.id === DEFAULT_GARDEN_MODEL)?.label} (fastest)` },
  ...SOUND_MODELS.filter((m) => m.id !== DEFAULT_GARDEN_MODEL).map((m) => ({ id: m.id, label: m.label })),
  { id: SKETCH_MODEL, label: 'SKETCH — a little synth plays the words (no model)' },
])
const hasModels = soundModelsAvailable()
const fmtLoops = (v: number) => `${Math.round(v)}×`
const fmtFade = (v: number) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(2)} s`)
const fmtPct = (v: number) => `${Math.round(v * 100)} %`
const loops = computed({ get: () => g.value?.loops ?? 4, set: (v: number) => g.value && (g.value.loops = Math.round(v)) })
const fade = computed({ get: () => g.value?.fade ?? 0.08, set: (v: number) => g.value && (g.value.fade = v) })
const offset = computed({ get: () => g.value?.offset ?? 0, set: (v: number) => g.value && (g.value.offset = Math.round(v * 4) / 4) })
const fmtOffset = (v: number) => `+${Number.isInteger(v) ? v : v.toFixed(2)}`
const back = computed({ get: () => g.value?.back ?? 0, set: (v: number) => g.value && (g.value.back = v) })
const reroll = () => g.value && (g.value.seed = Math.floor(Math.random() * 1e6))
</script>

<template>
  <v-dialog v-model="open" max-width="1080" scrollable>
    <div v-if="g && run" class="garden" @keydown.stop>
      <header>
        <h3>PROMPT GARDEN</h3>
        <span class="vco">VCO {{ slot + 1 }} · {{ slotSound?.settings.name ?? 'empty' }}</span>
        <button class="power" :class="{ on: g.on }" :title="g.on ? 'Growing: click to stop' : 'Start growing: new clips stitch into this VCO as it plays'" @click="garden.setOn(slot, !g.on)">
          {{ g.on ? 'GROWING' : 'OFF' }}
        </button>
        <v-spacer />
        <button class="hw-btn icon" :class="{ lit: g.paused }" :disabled="!g.on" :title="g.paused ? 'Paused: click to grow again' : 'Pause growth: no new clips made or stitched in'" @click="g.paused = !g.paused"><v-icon size="14" :icon="g.paused ? 'mdi-play' : 'mdi-pause'" /></button>
        <button class="hw-btn" :disabled="!g.on || !!garden.making || !!run.next" title="Make the next clip now, playing or not" @click="garden.growNow(slot)">GROW</button>
        <button class="hw-btn" :disabled="!g.on || !run.next" title="Stitch the next clip in now, without waiting for its loops" @click="garden.stitchNow(slot)">STITCH</button>
        <button v-if="garden.making" class="hw-btn icon" title="Stop the clip being made" @click="garden.stop()"><v-icon size="14" icon="mdi-stop" /></button>
        <button class="hw-btn icon" title="Close (it goes on growing)" @click="open = false"><v-icon size="16" icon="mdi-close" /></button>
      </header>
      <div class="status" :class="run.status">
        <i class="led" />
        <span class="st">{{ status }}</span>
        <span v-if="run.note && run.status !== 'error'" class="note">{{ run.note }}</span>
        <span v-if="!hasModels && g.model !== 'sketch'" class="note">no sound models in a browser tab: SKETCH plays the words</span>
      </div>
      <div class="captions">
        <div><b>NOW</b> <span>{{ g.history[0]?.prompt ?? '—' }}</span></div>
        <div><b>NEXT</b> <span class="next">{{ run.next?.prompt ?? nextCaption }}</span></div>
      </div>

      <nav class="tabs">
        <button v-for="t in (['rings', 'chips', 'game', 'history', 'grow'] as const)" :key="t" :class="{ on: tab === t }" @click="tab = t">
          {{ { rings: 'RINGS', chips: 'CHIPS & GRIDS', game: 'GAME', history: `HISTORY (${g.history.length})`, grow: 'GROWTH' }[t] }}
        </button>
      </nav>

      <div class="body">
        <!-- RINGS: the circles, and the one picked -->
        <div v-if="tab === 'rings'" class="rings-tab">
          <div class="circle">
            <GardenRings :garden="g" :progress="run.progress" :stitches="run.stitches" :selected="selected" @select="selected = $event" @rotate="onRotate" @hits="onHits" />
            <div class="period">{{ Number.isFinite(period) ? `the garden comes round every ${period} steps` : 'never quite comes round (random rings)' }}</div>
          </div>
          <div class="editor">
            <div class="ring-list">
              <button v-for="r in g.rings" :key="r.id" class="ring-chip" :class="{ on: r.id === selected, off: r.off }" :style="{ '--rc': colorOf(r) }" @click="selected = r.id">
                <i />{{ r.label }} <small>{{ r.k }}/{{ r.n }}</small><span v-if="r.locked">🔒</span>
              </button>
              <v-menu location="bottom">
                <template #activator="{ props: act }">
                  <button class="ring-chip add" v-bind="act" title="Add a ring">+ RING</button>
                </template>
                <div class="menu">
                  <button v-for="k in RING_KINDS" :key="k" @click="addRing(k)">{{ k.toUpperCase() }} <small>{{ WORD_BANKS[k].slice(0, 3).join(', ') }}…</small></button>
                </div>
              </v-menu>
            </div>
            <div v-if="ring" class="ring-edit" :style="{ '--rc': colorOf(ring) }">
              <div class="row">
                <input v-model="ring.label" class="label-in" spellcheck="false" />
                <select v-model="ring.kind" class="sel" title="What kind of word: where it goes in the phrase">
                  <option v-for="k in RING_KINDS" :key="k" :value="k">{{ k.toUpperCase() }}</option>
                </select>
                <v-spacer />
                <button class="tog" :class="{ on: ring.locked }" title="LOCK: freeze this ring on its word" @click="toggleLock(ring)">LOCK</button>
                <button class="tog" :class="{ on: ring.off }" title="MUTE: out of the caption" @click="ring.off = !ring.off">MUTE</button>
                <button class="tog danger" title="Remove this ring" @click="removeRing(ring)"><v-icon size="12" icon="mdi-delete" /></button>
              </div>
              <div class="row knobs">
                <Knob v-model="ring.k" label="HITS" :min="0" :max="ring.n" :step="1" :default="3" :size="30" :format="(v: number) => String(Math.round(v))" />
                <Knob v-model="ring.n" label="STEPS" :min="1" :max="32" :step="1" :default="8" :size="30" :format="(v: number) => String(Math.round(v))" @update:model-value="ring.k = Math.min(ring.k, ring.n)" />
                <Knob v-model="ring.rot" label="ROTATE" :min="0" :max="Math.max(0, ring.n - 1)" :step="1" :default="0" :size="30" :format="(v: number) => String(Math.round(v))" />
                <div class="opts">
                  <div class="seg" title="How it moves on at a hit">
                    <button v-for="m in (['cycle', 'random', 'walk'] as const)" :key="m" :class="{ on: ring.move === m }" @click="ring.move = m">{{ m.toUpperCase() }}</button>
                  </div>
                  <div class="seg" title="Between hits: HOLD keeps its word in the caption, DROP leaves it out">
                    <button :class="{ on: !ring.drop }" @click="ring.drop = false">HOLD</button>
                    <button :class="{ on: ring.drop }" @click="ring.drop = true">DROP</button>
                  </div>
                </div>
              </div>
              <label class="words-lbl">WORDS <small>(comma separated: a hit moves on to the next)</small></label>
              <textarea v-model.lazy="wordsText" class="words" rows="4" spellcheck="false" />
            </div>
          </div>
        </div>

        <!-- CHIPS & GRIDS: in every caption -->
        <div v-else-if="tab === 'chips'" class="chips-tab">
          <section v-for="grp in CHIP_GROUPS" :key="grp">
            <h4>{{ grp.toUpperCase() }}</h4>
            <div class="chipset">
              <button v-for="c in chipsOf(grp)" :key="c" class="chip" :class="{ on: g.chips[grp].includes(c) }" @click="toggleChip(grp, c)">{{ c }}</button>
              <input v-model="customChip[grp]" class="chip-in" :placeholder="`+ ${grp}`" spellcheck="false" @keydown.enter="addChip(grp)" />
            </div>
          </section>
          <section v-for="grid in gridKeys" :key="grid">
            <h4>{{ GRID_LABEL[grid] }} <small>— the ones lit take turns, a step each; none: left out</small></h4>
            <div class="grid" :style="{ gridTemplateColumns: `repeat(${Math.min(12, ENUM_GRIDS[grid].length)}, 1fr)` }">
              <button v-for="v in ENUM_GRIDS[grid]" :key="v" class="cell" :class="{ on: cellOn(grid, v) }" @click="toggleCell(grid, v)">{{ v }}</button>
            </div>
          </section>
          <section class="free">
            <h4>BEFORE / AFTER EVERY CAPTION</h4>
            <input v-model="g.prefix" class="text" placeholder="before (e.g. high quality stereo)" spellcheck="false" />
            <input v-model="g.suffix" class="text" placeholder="after (e.g. no drums)" spellcheck="false" />
          </section>
        </div>

        <!-- GAME -->
        <div v-else-if="tab === 'game'" class="game-tab">
          <GardenGame :words="gameWords" @catch="caught = $event" />
          <div class="plant">
            <button class="hw-btn" :disabled="!caught.length || !g.on" title="The next clip grows from these words (with the chips and grids)" @click="plantCatch">GROW THE CATCH NEXT</button>
            <button class="hw-btn" :disabled="!caught.some((w) => w.ringId)" title="Lock each ring on the word caught from it" @click="lockToCatch">🔒 LOCK RINGS TO IT</button>
            <span v-if="run.catch.length" class="note">planted: {{ run.catch.join(' ') }}</span>
          </div>
        </div>

        <!-- HISTORY -->
        <div v-else-if="tab === 'history'" class="history-tab">
          <div v-for="(t, i) in g.history" :key="`${t.soundId}-${t.at}`" class="take" :class="{ now: i === 0, gone: !board.byId(t.soundId) }">
            <span class="ix">{{ i === 0 ? 'NOW' : `-${i}` }}</span>
            <span class="step">#{{ t.step }}</span>
            <span class="p" :title="t.prompt">{{ t.again ? '↺ ' : '' }}{{ t.prompt }}</span>
            <span class="nm">{{ takeName(t) }}</span>
            <span class="ago">{{ fmtAgo(t) }}</span>
            <button class="tog" title="Hold to hear it" @pointerdown="audition(t, true)" @pointerup="audition(t, false)" @pointerleave="audition(t, false)">▶</button>
            <button class="tog" :disabled="i === 0 || !board.byId(t.soundId)" title="Go back to it now (stitched in)" @click="garden.goBack(slot, t)">↺</button>
            <button
              class="tog save"
              :class="{ on: t.saved }"
              :disabled="!savable(t.soundId)"
              :title="t.saved ? 'Saved in the samples (generated); its prompt is kept with the patch' : savable(t.soundId) ? 'SAVE: into the samples for good, tagged generated; its prompt, seed and model kept with the patch' : 'Not a take of this garden (or its audio has been let go)'"
              @click="garden.saveTake(slot, t.soundId)"
            >
              <v-icon size="13" :icon="t.saved ? 'mdi-check' : 'mdi-content-save'" />
            </button>
          </div>
          <div v-if="!g.history.length" class="note">nothing grown yet</div>
          <p class="hint">The latest {{ TAKES_KEPT }} takes keep their audio; older ones are let go (only their prompts stay here) unless you SAVE them.</p>
          <template v-if="g.saved.length">
            <h4 class="saved-head">SAVED · {{ g.saved.length }}</h4>
            <div v-for="sv in [...g.saved].reverse()" :key="sv.soundId" class="take saved-row" :class="{ gone: !board.byId(sv.soundId) }">
              <span class="ix">VCO {{ sv.slot + 1 }}</span>
              <span class="step">#{{ sv.step }}</span>
              <span class="p" :title="`${sv.prompt}\nseed ${sv.seed} · ${sv.model}`">{{ sv.prompt }}</span>
              <span class="nm">{{ board.byId(sv.soundId)?.settings.name ?? 'deleted' }}</span>
              <span class="ago">{{ fmtAgo(sv) }}</span>
              <button class="tog" :disabled="!board.byId(sv.soundId)" title="Hold to hear it" @pointerdown="audition(sv, true)" @pointerup="audition(sv, false)" @pointerleave="audition(sv, false)">▶</button>
              <button class="tog" :disabled="!board.byId(sv.soundId)" title="Stitch it in now" @click="garden.goBack(slot, { soundId: sv.soundId, prompt: sv.prompt, step: sv.step, at: sv.at })">↺</button>
              <span />
            </div>
          </template>
        </div>

        <!-- GROWTH: how it grows -->
        <div v-else class="grow-tab">
          <div class="row knobs">
            <Knob v-model="loops" label="LOOPS" :min="1" :max="32" :step="1" :default="4" :size="38" :format="fmtLoops" title="Passes of the clip before the next is stitched in" />
            <Knob v-model="offset" label="OFFSET" :min="0" :max="OFFSET_MAX" :default="0" :size="38" :format="fmtOffset" title="Loops this VCO's swaps are pushed back by, so the VCOs don't all swap together" />
            <Knob v-model="fade" label="XFADE" :min="0.005" :max="FADE_MAX" curve="log" :default="0.08" :size="38" :format="fmtFade" title="The crossfade at the stitch: both heard on top of each other for that long; past a loop's length, several loops of each overlap" />
            <Knob v-model="back" label="BACK" :min="0" :max="1" :default="0.1" :size="38" :format="fmtPct" title="The chance a step goes back to an earlier clip instead of a new one" />
          </div>
          <!-- the PLAY view's pads grow with the clips -->
          <div v-if="g.pads" class="pads-grow">
            <div class="row">
              <span class="pg-head">PADS GROW TOO</span>
              <button class="tog" :class="{ on: g.pads.on }" title="At each new clip, the pads chosen below walk somewhere new: OFFSET loops after it comes in, gliding over XFADE" @click="g.pads.on = !g.pads.on">
                {{ g.pads.on ? 'ON' : 'OFF' }}
              </button>
              <Knob v-model="padAmount" label="AMOUNT" :min="0" :max="1" :default="0.25" :size="30" :format="fmtPct" title="How far a pad can step at once (of its width and height)" />
            </div>
            <div class="row pg-pads">
              <button
                v-for="id in PAD_GROWTH_PADS"
                :key="id"
                class="chip"
                :class="{ on: g.pads.pads.includes(id) }"
                :title="`${PAD_NAMES[id]}: moves with the clips (its x and y)`"
                @click="togglePad(id)"
              >
                {{ PAD_NAMES[id] }}
              </button>
            </div>
            <p class="hint">Each new clip moves the chosen pads too — their x and y, 16 parameters for all eight — a seeded walk from where they are (the same seed and step move them the same way). The move starts {{ fmtOffset(offset) }} loops after the clip comes in (OFFSET, wrapped before the next one) and glides over XFADE ({{ fmtFade(fade) }}).</p>
          </div>
          <label class="field">
            <span>SOUND MODEL</span>
            <select v-model="g.model" class="sel wide">
              <option v-for="m in MODEL_CHOICES" :key="m.id" :value="m.id">{{ m.label }}</option>
            </select>
          </label>
          <p class="hint">The fastest (Stable Audio 3 Small, 8 steps) makes a clip in seconds — well inside a few loops. It must be downloaded first (AI settings › SOUND MODEL); the garden never starts a download.</p>
          <label class="field">
            <span>STEER AWAY FROM</span>
            <input v-model="g.negative" class="text" spellcheck="false" />
          </label>
          <div class="field">
            <span>SEED</span>
            <input v-model.number="g.seed" type="number" class="text num" />
            <button class="tog" title="A new seed: other words come up, other clips" @click="reroll">🎲</button>
            <button class="tog" :class="{ on: g.reuse }" title="REUSE: a caption that came up before plays its clip again (the garden loops for real)" @click="g.reuse = !g.reuse">REUSE</button>
          </div>
        </div>
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
.hw-btn.lit {
  color: #05030a;
  background: #ffd23e;
}
.garden {
  display: flex;
  flex-direction: column;
  max-height: 92vh;
  padding: 10px 12px 12px;
  border-radius: 8px;
  background: linear-gradient(160deg, #0b0614, #06030b 60%);
  border: 1px solid #2a1840;
  color: #ddd;
  box-shadow: 0 0 60px rgba(125, 255, 106, 0.08);
}
header {
  display: flex;
  align-items: center;
  gap: 8px;
}
h3 {
  margin: 0;
  font-family: 'Orbitron', sans-serif;
  font-size: 14px;
  letter-spacing: 0.22em;
  background: linear-gradient(90deg, #7dff6a, #3ef0ff, #ff4fd8);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.vco {
  font-family: 'VT323', monospace;
  font-size: 16px;
  color: var(--text-mute);
}
.power {
  padding: 2px 10px;
  border-radius: 12px;
  font-family: 'Orbitron', sans-serif;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.16em;
  color: #888;
  border: 1px solid #444;
}
.power.on {
  color: #05030a;
  background: #7dff6a;
  border-color: #7dff6a;
  box-shadow: 0 0 14px rgba(125, 255, 106, 0.6);
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    box-shadow: 0 0 4px rgba(125, 255, 106, 0.3);
  }
}
.status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-family: 'VT323', monospace;
  font-size: 16px;
  min-width: 0;
}
.status .led {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #333;
}
.status.growing .led {
  background: #ffd23e;
  box-shadow: 0 0 8px #ffd23e;
}
.status.ready .led {
  background: #7dff6a;
  box-shadow: 0 0 8px #7dff6a;
}
.status.error .led {
  background: #ff3e6c;
}
.status.error .st {
  color: #ff3e6c;
}
.st {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.note {
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: var(--text-mute);
}
.captions {
  margin: 6px 0;
  padding: 6px 8px;
  border-radius: 4px;
  background: #000;
  border: 1px solid #1d1d1d;
  font-family: 'VT323', monospace;
  font-size: 15px;
}
.captions b {
  display: inline-block;
  width: 40px;
  font-family: 'Orbitron', sans-serif;
  font-size: 8px;
  letter-spacing: 0.15em;
  color: var(--text-mute);
}
.captions .next {
  color: #3ef0ff;
}
.tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid #2a1840;
}
.tabs button {
  padding: 4px 12px;
  font-family: 'Orbitron', sans-serif;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.14em;
  color: var(--text-mute);
  border-radius: 4px 4px 0 0;
}
.tabs button.on {
  color: #05030a;
  background: #7dff6a;
}
.body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-top: 10px;
}
.rings-tab {
  display: grid;
  grid-template-columns: minmax(240px, 420px) 1fr;
  gap: 14px;
  align-items: start;
}
@media (max-width: 760px) {
  .rings-tab {
    grid-template-columns: 1fr;
  }
}
.period {
  margin-top: 4px;
  text-align: center;
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: var(--text-mute);
}
.ring-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}
.ring-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 12px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: var(--rc, #aaa);
  border: 1px solid color-mix(in srgb, var(--rc, #aaa) 50%, transparent);
}
.ring-chip i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--rc);
}
.ring-chip.on {
  background: color-mix(in srgb, var(--rc) 22%, transparent);
  border-color: var(--rc);
}
.ring-chip.off {
  opacity: 0.4;
}
.ring-chip.add {
  color: #7dff6a;
  border-style: dashed;
}
.menu {
  display: flex;
  flex-direction: column;
  padding: 4px;
  background: #0b0614;
  border: 1px solid #2a1840;
  border-radius: 6px;
}
.menu button {
  padding: 3px 8px;
  text-align: left;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: #ddd;
}
.menu button:hover {
  background: #1d1230;
}
.menu small {
  color: var(--text-mute);
}
.ring-edit {
  padding: 8px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--rc) 40%, transparent);
  background: color-mix(in srgb, var(--rc) 5%, #000);
}
.row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.knobs {
  margin: 8px 0;
  gap: 14px;
}
.label-in,
.text,
.chip-in {
  height: 24px;
  padding: 0 8px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 16px;
  color: #ddd;
  background: #000;
  border: 1px solid #333;
  outline: none;
}
.label-in {
  width: 130px;
  color: var(--rc);
}
.text {
  flex: 1;
  min-width: 120px;
}
.num {
  flex: 0 0 110px;
}
.sel {
  height: 24px;
  padding: 0 4px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: #ddd;
  background: #000;
  border: 1px solid #333;
  border-radius: 3px;
  appearance: auto;
}
.sel.wide {
  flex: 1;
}
.tog {
  padding: 1px 8px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: #aaa;
  border: 1px solid #333;
  background: #0a0a0a;
}
.tog.on {
  color: #05030a;
  background: #ffd23e;
  border-color: #ffd23e;
}
.tog.danger:hover {
  color: #ff3e6c;
}
.tog:disabled {
  opacity: 0.35;
}
.opts {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.seg {
  display: flex;
}
.seg button {
  padding: 1px 8px;
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: #999;
  border: 1px solid #333;
}
.seg button + button {
  border-left: none;
}
.seg button.on {
  color: #05030a;
  background: var(--rc, #7dff6a);
  border-color: var(--rc, #7dff6a);
}
.words-lbl {
  display: block;
  margin-top: 4px;
  font-family: 'Orbitron', sans-serif;
  font-size: 8px;
  letter-spacing: 0.14em;
  color: var(--text-mute);
}
.words-lbl small {
  font-family: 'VT323', monospace;
  font-size: 13px;
  letter-spacing: 0;
}
.words {
  width: 100%;
  margin-top: 3px;
  padding: 6px 8px;
  border-radius: 4px;
  font-family: 'VT323', monospace;
  font-size: 16px;
  color: var(--rc);
  background: #000;
  border: 1px solid #333;
  resize: vertical;
  outline: none;
}
.chips-tab section {
  margin-bottom: 12px;
}
h4 {
  margin: 0 0 4px;
  font-family: 'Orbitron', sans-serif;
  font-size: 9px;
  letter-spacing: 0.16em;
  color: #7dff6a;
}
h4 small {
  font-family: 'VT323', monospace;
  font-size: 13px;
  letter-spacing: 0;
  color: var(--text-mute);
}
.chipset {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.pads-grow {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed rgba(255, 255, 255, 0.15);
}
.pg-head {
  font-family: 'Orbitron', sans-serif;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.15em;
}
.pg-pads {
  flex-wrap: wrap;
  gap: 4px;
}
.chip {
  padding: 1px 9px;
  border-radius: 12px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: #bbb;
  border: 1px solid #333;
}
.chip.on {
  color: #05030a;
  background: #3ef0ff;
  border-color: #3ef0ff;
  box-shadow: 0 0 8px rgba(62, 240, 255, 0.4);
}
.chip-in {
  width: 110px;
  height: 22px;
  border-radius: 12px;
}
.grid {
  display: grid;
  gap: 3px;
}
.cell {
  height: 26px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: #999;
  background: #0a0a0a;
  border: 1px solid #262626;
}
.cell.on {
  color: #05030a;
  background: #ff4fd8;
  border-color: #ff4fd8;
  box-shadow: 0 0 8px rgba(255, 79, 216, 0.4);
}
.free {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.free h4 {
  flex-basis: 100%;
}
.game-tab {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 420px;
}
.game-tab > :first-child {
  flex: 1;
}
.plant {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.history-tab {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.take {
  display: grid;
  grid-template-columns: 44px 40px 1fr 150px 34px auto auto auto;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 15px;
}
.take:nth-child(odd) {
  background: #0a0710;
}
.take.now {
  color: #7dff6a;
}
.take.gone {
  opacity: 0.4;
}
.tog.save.on {
  color: #05030a;
  background: #7dff6a;
}
.saved-head {
  margin: 10px 0 2px;
  font-family: 'Orbitron', sans-serif;
  font-size: 9px;
  letter-spacing: 0.16em;
  color: #7dff6a;
}
.take .p,
.take .nm {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.take .nm,
.take .ago,
.take .step,
.take .ix {
  color: var(--text-mute);
}
.grow-tab {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 640px;
}
.field {
  display: flex;
  align-items: center;
  gap: 8px;
}
.field > span {
  flex: 0 0 120px;
  font-family: 'Orbitron', sans-serif;
  font-size: 8px;
  letter-spacing: 0.14em;
  color: var(--text-mute);
}
.hint {
  margin: 0;
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: var(--text-mute);
}
</style>
