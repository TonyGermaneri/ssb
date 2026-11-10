<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useBoard } from '../stores/board'
import TagStrip from './TagStrip.vue'
import type { ListView } from '../types'

/**
 * A catalog's bar (the patches' or the samples'; the header's VIEW toggles show either or both), one row: its tag
 * filter (a drop-down), a description to order it by (and, for patches, to make one from), ≈ SIMILAR (order by
 * likeness to the selected item), card size, cards or grid (each keeps its own). Using it makes it the catalog last
 * used (master.tab).
 */
const props = defineProps<{ kind: 'sounds' | 'patches' }>()
const board = useBoard()
const tab = computed(() => props.kind)
const listView = computed(() => board.listViewOf(props.kind))
const touch = () => (board.master.tab = props.kind)
/** each tab's description, as typed */
const query = reactive({ sounds: '', patches: '' })
let typing = 0
/** the list follows the description as it's typed (a moment after the last key) */
function onInput(e: Event) {
  query[tab.value] = (e.target as HTMLInputElement).value
  clearTimeout(typing)
  typing = window.setTimeout(() => board.showMatching(query[tab.value], tab.value), 250)
}
const ordering = computed(() => board.similarTo[tab.value])
// another ordering (≈ SIMILAR, or cleared) leaves the description behind; one restored with the plugin's view
// (the host reopening a track) shows its words
function syncQuery(t: 'sounds' | 'patches') {
  const o = board.similarTo[t]
  if (o?.kind !== 'text') query[t] = ''
  else if (query[t].trim() !== o.text) query[t] = o.text
}
watch(() => board.similarTo.sounds, () => syncQuery('sounds'), { immediate: true })
watch(() => board.similarTo.patches, () => syncQuery('patches'), { immediate: true })
function clear() {
  query[tab.value] = ''
  board.clearSimilar(tab.value)
}
/** Enter in the patches' bar: a candidate patch made from the description */
function onEnter() {
  if (tab.value === 'patches' && query.patches.trim()) void board.describePatch(query.patches)
}
const similarOn = computed(() => ordering.value?.kind === 'item')
const similarTitle = computed(() =>
  tab.value === 'patches'
    ? 'Order the patches by how like the selected patch they are: settings, VCO sounds and words'
    : 'Order the sounds by how like the selected sound they are: what they sound like, settings and words',
)

const VIEWS: { id: ListView; label: string; icon: string; title: string }[] = [
  { id: 'pads', label: 'CARDS', icon: 'mdi-view-grid', title: 'Show the list as cards' },
  { id: 'grid', label: 'GRID', icon: 'mdi-table', title: 'Show the list as a spreadsheet: sort, type values, see waveforms' },
]
const scale = computed(() => `${Math.round(board.master.scale * 100)}%`)
function nudge(dir: number) {
  const s = Math.round((board.master.scale + dir * 0.1) * 100) / 100
  board.master.scale = Math.min(2, Math.max(0.5, s))
}
</script>

<template>
  <nav class="tabs" @pointerdown="touch">
    <TagStrip :kind="kind" />
    <div class="tools">
      <label class="find" :class="{ on: ordering?.kind === 'text' }">
        <v-icon size="14" icon="mdi-text-search" />
        <input
          :value="query[tab]"
          spellcheck="false"
          :placeholder="tab === 'patches' ? 'describe a patch… warm evolving pad' : 'describe a sound… airy choir'"
          :title="tab === 'patches' ? 'Order the patches by how near they are to a description; Enter (or MAKE) makes a patch from it' : 'Order the sounds by how near they are to a description'"
          @input="onInput"
          @keydown.enter="onEnter"
          @keydown.esc="clear"
          @keydown.stop
        />
        <button v-if="ordering" class="x" title="Back to the board's order" @click.prevent="clear">✕</button>
      </label>
      <button
        v-if="tab === 'patches'"
        class="chip make"
        :disabled="!query.patches.trim()"
        title="Make a patch from the description: settings searched for and blended from the nearest patches, pushed by its words. Keep it with SAVE."
        @click="onEnter"
      >
        <v-icon size="13" icon="mdi-auto-fix" /> MAKE
      </button>
      <button
        class="chip"
        :class="{ on: similarOn }"
        :title="similarOn ? `Ordered by likeness to ${ordering?.kind === 'item' ? ordering.name : ''}: click to stop` : similarTitle"
        @click="similarOn ? board.clearSimilar(tab) : board.showSimilar(undefined, tab)"
      >
        ≈ {{ similarOn && ordering?.kind === 'item' ? ordering.name : 'SIMILAR' }}
      </button>
      <div v-if="listView === 'pads'" class="scale" title="Card size (scroll or click − / +; double-click = 100%)" @wheel.prevent="nudge($event.deltaY < 0 ? 1 : -1)">
        <button class="chip" @click="nudge(-1)">−</button>
        <span class="lcd" @dblclick="board.master.scale = 1">{{ scale }}</span>
        <button class="chip" @click="nudge(1)">+</button>
      </div>
      <div class="seg" role="group" aria-label="List view">
        <button
          v-for="v in VIEWS"
          :key="v.id"
          class="chip"
          :class="{ on: listView === v.id }"
          :aria-pressed="listView === v.id"
          :title="v.title"
          @click="board.setListView(kind, v.id)"
        >
          <v-icon size="13" :icon="v.icon" /> {{ v.label }}
        </button>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.tabs {
  container-type: inline-size;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  padding: 5px 12px;
  background: linear-gradient(180deg, var(--panel-lo), color-mix(in srgb, var(--panel-lo) 70%, #000));
  border-bottom: 2px solid #000;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45);
}
/* the list's own controls, after its tag filter */
.tools {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 6px 10px;
}
.find {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 6px;
  border-radius: 3px;
  background: var(--lcd-bg);
  border: 1px solid #000;
  color: var(--text-mute);
}
.find.on {
  border-color: color-mix(in srgb, var(--c-secondary) 60%, #000);
  box-shadow: 0 0 6px color-mix(in srgb, var(--c-secondary) 35%, transparent);
}
.find input {
  width: 230px;
  border: 0;
  outline: none;
  background: none;
  font-family: 'VT323', monospace;
  font-size: 16px;
  color: var(--c-secondary);
}
.find input::placeholder {
  color: var(--text-faint);
}
.find .x {
  padding: 0 2px;
  font-size: 12px;
  color: var(--text-mute);
}
.find .x:hover {
  color: var(--c-primary);
}
.make:disabled {
  opacity: 0.45;
}
.chip.make:not(:disabled) {
  color: var(--c-primary);
}
/* beside the rack the list is narrow: its controls take a row of their own, over the tabs */
@container (max-width: 900px) {
  /* narrow: the description takes what room there is */
  .tools {
    gap: 6px;
  }
  .find {
    flex: 1;
    min-width: 160px;
  }
  .find input {
    width: 100%;
  }
}
.seg,
.scale {
  display: flex;
  align-items: center;
  gap: 2px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 8px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  letter-spacing: 0.08em;
  color: var(--ink-dim);
  background: #111;
  border: 1px solid #000;
  white-space: nowrap;
}
.chip:hover {
  color: var(--text);
}
.chip.on {
  color: var(--c-secondary);
  text-shadow: 0 0 4px color-mix(in srgb, var(--c-secondary) 70%, transparent);
  box-shadow: inset 0 0 8px color-mix(in srgb, var(--c-secondary) 25%, transparent);
}
.scale .chip {
  width: 20px;
  padding: 0;
  justify-content: center;
}
.lcd {
  min-width: 44px;
  height: 20px;
  padding: 0 4px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 16px;
  line-height: 20px;
  text-align: center;
  color: var(--c-secondary);
  background: var(--lcd-bg);
  cursor: ns-resize;
}
</style>
