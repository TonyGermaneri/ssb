<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBoard } from '../stores/board'
import { padHue } from '../lib/format'

/**
 * A catalog's tag filter as a drop-down: one chip in the list's bar saying what's showing (ALL, or the tags picked and
 * how many that leaves), opening a menu of every tag with its count; picking a tag narrows the rest (AND), right-click
 * hides what carries it. One per catalog.
 */
const props = defineProps<{ kind: 'sounds' | 'patches' }>()
const board = useBoard()
const open = ref(false)
const tags = computed(() => board.tagsOf(props.kind))
const favOnly = computed(() => (props.kind === 'patches' ? board.master.favPatches : board.master.favSounds))
function toggleFav() {
  if (props.kind === 'patches') board.master.favPatches = !board.master.favPatches
  else board.master.favSounds = !board.master.favSounds
}
const filtered = computed(() => tags.value.filter.length > 0 || tags.value.hidden.length > 0 || favOnly.value)
/** what the chip says: everything, or what the filter is and what it leaves */
const label = computed(() => {
  const t = tags.value
  if (!filtered.value) return `ALL ${t.total}`
  const parts = [...(favOnly.value ? ['♥'] : []), ...t.filter, ...t.hidden.map((h) => `−${h}`)]
  return `${parts.length > 2 ? `${parts.slice(0, 2).join(', ')} +${parts.length - 2}` : parts.join(', ')} · ${t.shown}`
})
</script>

<template>
  <v-menu v-model="open" location="bottom start" :close-on-content-click="false" max-height="70vh">
    <template #activator="{ props: act }">
      <button
        class="tag-pick"
        :class="{ on: filtered, open }"
        v-bind="act"
        :title="filtered ? `Filtered by tags: ${tags.shown} of ${tags.total} showing — click to change` : 'Filter by tags'"
      >
        <v-icon size="14" icon="mdi-tag-multiple" />
        <span class="what">{{ label }}</span>
        <i class="caret" />
      </button>
    </template>
    <div class="tag-menu" @keydown.esc="open = false">
      <div class="lead">
        <button
          class="chip all"
          :class="{ on: !tags.filter.length && !tags.hidden.length }"
          title="Show everything (clears hidden tags too)"
          @click="board.clearTagsOf(kind)"
        >
          ALL <b>{{ tags.total }}</b>
        </button>
        <button class="chip fav" :class="{ on: favOnly }" title="Show favourites only" @click="toggleFav">♥ FAV</button>
        <span v-if="filtered" class="shown">{{ tags.shown }} SHOWN</span>
        <span class="hint">CLICK = ONLY THESE · RIGHT-CLICK = HIDE THESE</span>
      </div>
      <div class="chips">
        <button
          v-for="f in tags.facets"
          :key="f.name"
          class="chip"
          :class="{ on: f.selected, hidden: f.excluded }"
          :style="{ '--hue': padHue(f.name, f.name, board.theme.padHues) }"
          :title="
            f.excluded
              ? `Hiding ${f.count} tagged ${f.name} — click (or right-click) to show them again`
              : f.selected
                ? `Remove ${f.name} from the filter · right-click to hide these instead`
                : `Show only what's tagged ${f.name} · right-click to hide them`
          "
          @click="board.toggleTagOf(kind, f.name)"
          @contextmenu.prevent="board.hideTagOf(kind, f.name)"
        >
          <i class="dot" />
          <span class="nm">{{ f.name }}</span>
          <b>{{ f.count }}</b>
          <span v-if="f.selected" class="x">✕</span>
          <v-icon v-else-if="f.excluded" size="12" icon="mdi-eye-off" />
        </button>
        <span v-if="!tags.facets.length" class="empty">NO TAGS YET (COMMA-SEPARATED, IN EACH ITEM'S PANEL)</span>
      </div>
    </div>
  </v-menu>
</template>

<style scoped>
/* the chip in the list's bar */
.tag-pick {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  max-width: 260px;
  padding: 0 8px;
  border-radius: 4px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  line-height: 1;
  color: var(--ink-dim);
  background: #0c0c0e;
  border: 1px solid #000;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.6);
  white-space: nowrap;
}
.tag-pick:hover,
.tag-pick.open {
  color: var(--text);
  border-color: color-mix(in srgb, var(--c-primary) 40%, #000);
}
.tag-pick.on {
  color: var(--c-primary);
  border-color: color-mix(in srgb, var(--c-primary) 55%, #000);
}
.tag-pick .what {
  overflow: hidden;
  text-overflow: ellipsis;
}
.caret {
  width: 0;
  height: 0;
  border-left: 3px solid transparent;
  border-right: 3px solid transparent;
  border-top: 4px solid currentColor;
}
/* the menu: every tag, wrapping */
.tag-menu {
  width: min(560px, 92vw);
  padding: 8px;
  border-radius: 6px;
  background: linear-gradient(180deg, var(--panel-hi), var(--panel-lo));
  border: 1px solid #000;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
}
.lead {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.shown {
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: var(--c-primary);
}
.hint {
  margin-left: auto;
  font-family: 'VT323', monospace;
  font-size: 12px;
  color: var(--text-faint);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 20px;
  padding: 0 7px;
  border-radius: 10px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  line-height: 1;
  color: var(--ink-dim);
  background: #141317;
  border: 1px solid #000;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07);
  white-space: nowrap;
}
.chip:hover {
  color: var(--text);
  border-color: color-mix(in srgb, var(--c-primary) 40%, #000);
}
.chip b {
  font-weight: 400;
  color: var(--text-mute);
}
.chip.on {
  color: #111;
  background: var(--c-primary);
  box-shadow: 0 0 8px color-mix(in srgb, var(--c-primary) 55%, transparent);
}
.chip.on b {
  color: #3a2a00;
}
.chip.fav.on {
  color: #fff;
  background: #d8245a;
  box-shadow: 0 0 8px #ff3d6e;
}
/* hidden (right-click): struck through and dimmed, the count is how many it hides */
.chip.hidden {
  color: var(--c-danger);
  border-color: color-mix(in srgb, var(--c-danger) 45%, #000);
  background: color-mix(in srgb, var(--c-danger) 12%, #141317);
}
.chip.hidden .nm {
  text-decoration: line-through;
}
.chip.hidden .dot {
  opacity: 0.35;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: hsl(var(--hue) 85% 55%);
  box-shadow: 0 0 4px hsl(var(--hue) 85% 55%);
}
.x {
  font-size: 12px;
}
.empty {
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: var(--text-faint);
}
</style>
