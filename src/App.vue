<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTheme } from 'vuetify'
import { applyThemeVars } from './theme/themes'
import { useBoard } from './stores/board'
import { keyToMidi } from './lib/piano'
import { fromInput } from './lib/dropFiles'
import DropZone from './components/DropZone.vue'
import MatrixDialog from './components/MatrixDialog.vue'
import MasterStrip from './components/MasterStrip.vue'
import TagStrip from './components/TagStrip.vue'
import Rack from './components/Rack.vue'
import TabBar from './components/TabBar.vue'
import PatchCards from './components/PatchCards.vue'
const PatchTable = defineAsyncComponent(() => import('./components/PatchTable.vue'))
import SoundGrid from './components/SoundGrid.vue'
import { defineAsyncComponent } from 'vue'
// canvas-datagrid is only loaded when grid mode is first opened
const GridView = defineAsyncComponent(() => import('./components/GridView.vue'))
const LibraryDialog = defineAsyncComponent(() => import('./components/LibraryDialog.vue'))
const libraryOpen = ref(false)


const board = useBoard()
const vuetifyTheme = useTheme()
watch(
  () => board.theme,
  (t) => {
    applyThemeVars(t)
    vuetifyTheme.change(t.id)
  },
  { immediate: true },
)
const fileInput = ref<HTMLInputElement>()
const folderInput = ref<HTMLInputElement>()
/** computer key → MIDI note it started, so octave changes mid-hold still release the right note */
const pianoHeld = new Map<string, number>()

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null
  return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
}

function onKeyDown(e: KeyboardEvent) {
  if (isTyping(e)) return
  const mod = e.metaKey || e.ctrlKey
  if (mod && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) {
    e.preventDefault()
    if (e.key.toLowerCase() === 'y' || e.shiftKey) board.redo()
    else board.undo()
    return
  }
  if (mod || e.altKey || board.matrixScope || libraryOpen.value) return
  if (e.code === 'Space') {
    e.preventDefault()
    board.panic()
    return
  }
  if (e.key === 'Escape') {
    board.openPanels.clear()
    return
  }
  if (e.repeat) return
  const key = e.key.toLowerCase()
  if (board.master.play) {
    if (key === '-' || key === '=') {
      board.master.octave = Math.max(-3, Math.min(3, board.master.octave + (key === '=' ? 1 : -1)))
      return
    }
    const note = keyToMidi(key, board.master.octave)
    if (note !== null) {
      e.preventDefault()
      pianoHeld.set(key, note)
      board.noteOn(note, 0.9)
    }
    return
  }
  const id = board.soundForKey.get(key)
  if (id) {
    e.preventDefault()
    board.press(id)
  }
}
function onKeyUp(e: KeyboardEvent) {
  const key = e.key.toLowerCase()
  const note = pianoHeld.get(key)
  if (note !== undefined) {
    pianoHeld.delete(key)
    board.noteOff(note)
    return
  }
  const id = board.soundForKey.get(key)
  if (id && board.pressed.has(id)) board.release(id)
}
/** the rack | list divider: dragging sets the list's share of the window */
function onDividerDown(e: PointerEvent) {
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function onDividerMove(e: PointerEvent) {
  if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return
  const w = 1 - e.clientX / window.innerWidth
  board.master.listWidth = Math.round(Math.min(0.75, Math.max(0.15, w)) * 1000) / 1000
}
function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  board.addFiles(fromInput(input.files ?? []))
  input.value = ''
}

onMounted(() => {
  board.load()
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})
</script>

<template>
  <v-app>
    <div class="console" :class="{ scanlines: board.master.scanlines }">
      <div class="chrome">
        <MasterStrip @add="fileInput?.click()" @add-folder="folderInput?.click()" @library="libraryOpen = true" />
      </div>
      <!-- rack (the selected patch's three VCO slots) on the left, the sounds / patches list on the right third -->
      <div class="body" :class="{ split: board.master.rack && board.master.list }">
        <Rack v-if="board.master.rack || !board.master.list" class="rack-pane" />
        <div
          v-if="board.master.rack && board.master.list"
          class="divider"
          title="Drag to resize the list · double-click = 33%"
          @pointerdown="onDividerDown"
          @pointermove="onDividerMove"
          @dblclick="board.master.listWidth = 0.33"
        >
          <i />
        </div>
        <div
          v-if="board.master.list"
          class="list-pane"
          :style="board.master.rack ? { width: `${board.master.listWidth * 100}vw` } : undefined"
        >
          <TabBar />
          <TagStrip v-if="board.sounds.length || board.patches.length" />
          <main class="deck">
        <template v-if="board.master.tab === 'patches'">
          <PatchTable v-if="board.master.view === 'grid' && board.patches.length" />
          <PatchCards v-else />
        </template>
        <template v-else>
          <GridView v-if="board.master.view === 'grid' && board.sounds.length" />
          <SoundGrid v-else @add="fileInput?.click()" />
        </template>
      </main>
      <footer v-if="board.master.view === 'pads'" class="legend">
        <template v-if="board.master.play">
          PLAY MODE · Z–/ AND Q–P ROWS = PIANO (Q = C4, ORIGINAL PITCH) · - / = = OCTAVE · SPACE = PANIC · ESC = CLOSE
          PANELS
        </template>
        <template v-else-if="board.master.tab === 'patches'">
          CLICK A PATCH = AUDITION · PIANO BUTTON = KEYBOARD PATCH · ☰ = EDIT ITS SLOTS · ◀ ▶ IN THE HEADER = STEP PATCHES ·
          ♥ = FAVOURITE · SPACE = PANIC
        </template>
        <template v-else>
          CLICK PAD = PLAY · 1 2 3 = PUT IN THAT VCO SLOT · DRAG ⋮⋮ INTO A SLOT · ☰ = CONTROLS · ♥ = FAVOURITE · 1–0 Q–P A–L Z–M = PADS · SPACE = PANIC ·
          ESC = CLOSE PANELS · KNOBS: DRAG / SCROLL / DOUBLE-CLICK RESET / SHIFT = FINE
        </template>
      </footer>
        </div>
      </div>
    </div>
    <DropZone />
    <MatrixDialog />
    <LibraryDialog v-if="libraryOpen" v-model="libraryOpen" />
    <input ref="fileInput" type="file" accept="audio/*,.mp3,.sfz,.zip" multiple hidden @change="onPick" />
    <!-- a folder picker keeps relative paths, which SFZ files use to find their samples -->
    <input ref="folderInput" type="file" webkitdirectory multiple hidden @change="onPick" />
    <v-snackbar
      :model-value="!!board.toast"
      timeout="3000"
      color="surface"
      location="bottom"
      @update:model-value="(v: boolean) => !v && (board.toast = '')"
    >
      <span class="toast">{{ board.toast }}</span>
    </v-snackbar>
  </v-app>
</template>

<style scoped>
.chrome {
  position: relative;
  z-index: 10;
  flex: none;
}
/* everything under the header: rack, list, or rack | list (list = right third) */
.body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.rack-pane {
  flex: 1;
  min-width: 0;
}
.list-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.split .list-pane {
  flex: none;
  box-shadow: -3px 0 8px rgba(0, 0, 0, 0.45);
}
.divider {
  flex: none;
  display: grid;
  place-items: center;
  width: 8px;
  cursor: ew-resize;
  touch-action: none;
  background: #000;
}
.divider i {
  width: 3px;
  height: 60px;
  border-radius: 2px;
  background: var(--text-faint);
}
.divider:hover i {
  background: var(--c-primary);
}
.list-pane .deck {
  flex: 1;
  min-height: 0;
  width: 100%;
}
.legend {
  flex: none;
}
.toast {
  font-family: 'VT323', monospace;
  font-size: 20px;
  color: #ffb000;
}
</style>
