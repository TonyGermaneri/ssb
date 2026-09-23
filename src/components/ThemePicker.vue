<script setup lang="ts">
import { computed, watch } from 'vue'
import { useBoard } from '../stores/board'
import { applyThemeVars, THEME_GROUPS, THEMES, themeGroup, type Theme } from '../theme/themes'

/** Theme picker: every theme by group, with swatches. Hovering previews a theme; clicking picks it. */
const open = defineModel<boolean>({ default: false })
const board = useBoard()

const groups = computed(() => THEME_GROUPS.map((g) => ({ name: g, themes: THEMES.filter((t) => themeGroup(t) === g) })))

const preview = (t: Theme) => applyThemeVars(t)
const restore = () => applyThemeVars(board.theme)
function pick(t: Theme) {
  board.master.theme = t.id
  open.value = false
}
// closing (Esc, click outside) always drops a preview
watch(open, (v) => !v && restore())
</script>

<template>
  <div class="picker" @pointerdown.stop @keydown.stop>
    <div class="head">
      <button class="hw-btn icon" title="Previous theme" @click="board.cycleTheme(-1)">
        <v-icon size="18" icon="mdi-chevron-left" />
      </button>
      <div class="current">{{ board.theme.name }}</div>
      <button class="hw-btn icon" title="Next theme" @click="board.cycleTheme(1)">
        <v-icon size="18" icon="mdi-chevron-right" />
      </button>
      <span class="count">{{ THEMES.length }} THEMES · HOVER TO PREVIEW</span>
    </div>
    <div class="body" @mouseleave="restore">
      <section v-for="g in groups" :key="g.name">
        <h6>{{ g.name }} <b>{{ g.themes.length }}</b></h6>
        <div class="tiles">
          <button
            v-for="t in g.themes"
            :key="t.id"
            class="tile"
            :class="{ on: t.id === board.theme.id }"
            :style="{ background: `linear-gradient(180deg, ${t.panel[0]}, ${t.panel[2]})`, color: t.text[0] }"
            @mouseenter="preview(t)"
            @focus="preview(t)"
            @click="pick(t)"
          >
            <span class="sw">
              <i :style="{ background: t.bg[2] }" />
              <i :style="{ background: t.primary }" />
              <i :style="{ background: t.secondary }" />
              <i :style="{ background: t.accent }" />
              <i :style="{ background: t.wood[1] }" />
            </span>
            <span class="nm">{{ t.name }}</span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.picker {
  width: min(880px, calc(100vw - 32px));
  max-height: calc(100vh - 110px);
  display: flex;
  flex-direction: column;
  border-radius: 6px;
  background: linear-gradient(180deg, var(--panel-hi), var(--panel-lo));
  border: 1px solid #000;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.7);
}
.head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.5);
}
.current {
  min-width: 180px;
  padding: 2px 10px;
  border-radius: 3px;
  text-align: center;
  font-family: 'VT323', monospace;
  font-size: 22px;
  color: var(--c-primary);
  background: var(--lcd-bg);
}
.count {
  margin-left: auto;
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: var(--text-mute);
}
.body {
  overflow-y: auto;
  padding: 4px 10px 10px;
  scrollbar-width: thin;
}
h6 {
  margin: 8px 0 4px;
  font-family: 'Orbitron', sans-serif;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.2em;
  color: var(--text-head);
}
h6 b {
  font-weight: 400;
  color: var(--text-mute);
}
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 5px;
}
.tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 5px 7px 4px;
  border-radius: 4px;
  border: 1px solid #000;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
  text-align: left;
}
.tile:hover,
.tile:focus-visible {
  outline: 2px solid var(--c-secondary);
  outline-offset: 1px;
}
.tile.on {
  outline: 2px solid var(--c-primary);
  outline-offset: 1px;
}
.sw {
  display: flex;
  gap: 2px;
}
.sw i {
  width: 16px;
  height: 10px;
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
}
.nm {
  font-family: 'VT323', monospace;
  font-size: 16px;
  line-height: 1;
  white-space: nowrap;
}
</style>
