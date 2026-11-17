<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBoard } from '../stores/board'
import { padHue } from '../lib/format'
import ControlPanel from './ControlPanel.vue'

/**
 * The SAMPLE PLAYER: the selected sound's control panel over the samples list, grid or tiles alike. SAMPLE PLAYER in
 * the samples' tab bar (or ☰ on a sound) shows it; its bottom edge drags to size it (double-click: back to the
 * default), kept per viewer.
 */
const board = useBoard()
const KEY = 'ssb:samplePlayerH'
const MIN = 120
const DEFAULT = 300
const read = () => {
  try {
    return Number(localStorage.getItem(KEY)) || DEFAULT
  } catch {
    return DEFAULT
  }
}
const height = ref(read())
const save = () => {
  try {
    localStorage.setItem(KEY, String(Math.round(height.value)))
  } catch {
    /* private window: it just isn't remembered */
  }
}
const hue = computed(() => (board.selected ? padHue(board.selected.settings.tag, board.selected.settings.name, board.theme.padHues) : 0))

let startY = 0
let startH = 0
const box = ref<HTMLElement>()
function down(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  startY = e.clientY
  startH = height.value
}
function move(e: PointerEvent) {
  if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return
  const max = (box.value?.parentElement?.clientHeight ?? 800) - 80
  height.value = Math.min(Math.max(MIN, max), Math.max(MIN, startH + e.clientY - startY))
}
function reset() {
  height.value = DEFAULT
  save()
}
</script>

<template>
  <aside v-if="board.master.gridPanel && board.selected" ref="box" class="player" :style="{ height: `${height}px` }">
    <div class="body">
      <ControlPanel :key="board.selected.id" :sound="board.selected" :hue="hue" wide />
    </div>
    <div
      class="grip"
      title="Drag to size the sample player · double-click = default"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="save"
      @dblclick="reset"
    >
      <i />
    </div>
  </aside>
</template>

<style scoped>
.player {
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: calc(100% - 80px);
}
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}
.grip {
  flex: none;
  display: grid;
  place-items: center;
  height: 8px;
  cursor: ns-resize;
  touch-action: none;
}
.grip i {
  width: 40px;
  height: 3px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--c-primary) 45%, transparent);
}
.grip:hover i {
  background: var(--c-primary);
}
</style>
