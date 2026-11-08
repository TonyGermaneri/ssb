<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTheme } from 'vuetify'
import { applyThemeVars } from './theme/themes'
import { useBoard } from './stores/board'
import { keyToMidi } from './lib/piano'
import { fromInput } from './lib/dropFiles'
import { forwardConsole, inNative, nativeEngine, routeExternalLinks } from './native/bridge'
import { startEngineSync } from './native/engineSync'
import { mcpSaved, mcpStatus } from './lib/ai/mcpStatus'
import { activeVoices, getCtx, levels, readSound, soundSounding, SCOPE_SAMPLES, watchSound } from './audio/engine'
import DropZone from './components/DropZone.vue'
import MatrixDialog from './components/MatrixDialog.vue'
import MasterStrip from './components/MasterStrip.vue'
import TagStrip from './components/TagStrip.vue'
import Rack from './components/Rack.vue'
import TabBar from './components/TabBar.vue'
import CandidateBar from './components/CandidateBar.vue'
import PatchCards from './components/PatchCards.vue'
const PatchTable = defineAsyncComponent(() => import('./components/PatchTable.vue'))
import SoundGrid from './components/SoundGrid.vue'
import { defineAsyncComponent } from 'vue'
// canvas-datagrid is only loaded when grid mode is first opened
const GridView = defineAsyncComponent(() => import('./components/GridView.vue'))
const LibraryDialog = defineAsyncComponent(() => import('./components/LibraryDialog.vue'))
// the AI patch maker (and the provider SDKs it brings) loads when first opened
const AiDialog = defineAsyncComponent(() => import('./components/AiDialog.vue'))
const aiOpen = ref(false)
const aiUsed = ref(false)
const openAi = () => ((aiUsed.value = true), (aiOpen.value = true))
const libraryOpen = ref(false)
/** the library's tab when it opens: the AKWF waves, or the online sources */
const libraryTab = ref<'akwf' | 'sfz'>('akwf')
const openLibrary = (tab: 'akwf' | 'sfz') => {
  libraryTab.value = tab
  libraryOpen.value = true
}


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
/**
 * Physical key (KeyboardEvent.code) → the MIDI note it started, or the pad it pressed: the key-up releases what the
 * key-down played, whatever changed between (the octave, ⇧ turning ";" into ":").
 */
const pianoHeld = new Map<string, number>()
const padHeld = new Map<string, string>()
const keyOf = (e: KeyboardEvent) => e.code || e.key.toLowerCase()
/** the window lost the keys (another app, a host's window, a hidden tab): their key-ups will never come */
function releaseKeys() {
  for (const note of pianoHeld.values()) board.noteOff(note)
  pianoHeld.clear()
  for (const id of padHeld.values()) if (board.pressed.has(id)) board.release(id)
  padHeld.clear()
}
const onVisibility = () => document.visibilityState === 'hidden' && releaseKeys()

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
  if (mod || e.altKey || board.matrixScope || libraryOpen.value || aiOpen.value) return
  if (e.code === 'Space') {
    e.preventDefault()
    board.panic()
    return
  }
  if (e.key === 'Escape') {
    board.openPanels.clear()
    board.master.gridPanel = false
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
      // a key-down whose key-up went missing: end that note before this one
      const before = pianoHeld.get(keyOf(e))
      if (before !== undefined) board.noteOff(before)
      pianoHeld.set(keyOf(e), note)
      board.noteOn(note, 0.9)
    }
    return
  }
  const id = board.soundForKey.get(key)
  if (id) {
    e.preventDefault()
    padHeld.set(keyOf(e), id)
    board.press(id)
  }
}
function onKeyUp(e: KeyboardEvent) {
  const code = keyOf(e)
  const note = pianoHeld.get(code)
  if (note !== undefined) {
    pianoHeld.delete(code)
    board.noteOff(note)
    return
  }
  const id = padHeld.get(code) ?? board.soundForKey.get(e.key.toLowerCase())
  padHeld.delete(code)
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
  // for SSB_PROBE scripts (the native page has no inspector in a release build) and for poking at a dev server
  if (inNative() || import.meta.env.DEV) {
    const w = window as unknown as { __ssb: unknown }
    w.__ssb = { board, audio: () => getCtx().state, voices: () => activeVoices.value.length, activeVoices, levels, mcp: () => import('./lib/ai/mcpHost'),
      // what a live view reads for a sound (for probes: the scopes' data path, page engine or plugin)
      scope: (id: string) => {
        const buf = new Float32Array(SCOPE_SAMPLES)
        const seq = readSound(id, buf)
        let peak = 0
        for (const v of buf) peak = Math.max(peak, Math.abs(v))
        return { seq, peak, sounding: soundSounding(id) }
      },
      watchSound,
    }
  }
  // in the native app / plugin: MIDI comes from the host, links open in the system browser
  if (inNative()) {
    forwardConsole()
    void board.enableMidi()
    routeExternalLinks()
    // in a DAW the native engine plays: keep it in step with the board
    if (nativeEngine()) startEngineSync(board)
    // the MCP server, if it was left on (its code loads only then)
    if (mcpSaved().enabled) void import('./lib/ai/mcpHost').then((m) => m.bootMcp())
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', releaseKeys)
  document.addEventListener('visibilitychange', onVisibility)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', releaseKeys)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <v-app>
    <div class="console" :class="{ scanlines: board.master.scanlines }">
      <div class="chrome">
        <MasterStrip @add="fileInput?.click()" @add-folder="folderInput?.click()" @library="openLibrary('sfz')" @waves="openLibrary('akwf')" @ai="openAi" />
      </div>
      <CandidateBar />
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
          <PatchTable v-if="board.listView === 'grid' && board.patches.length" />
          <PatchCards v-else />
        </template>
        <template v-else>
          <GridView v-if="board.listView === 'grid' && board.sounds.length" />
          <SoundGrid v-else @add="fileInput?.click()" />
        </template>
      </main>
      <footer v-if="board.listView === 'pads'" class="legend">
        <template v-if="board.master.play">
          PLAY MODE · Z–/ AND Q–P ROWS = PIANO (Q = C4, ORIGINAL PITCH) · - / = = OCTAVE · SPACE = PANIC · ESC = CLOSE
          PANELS
        </template>
        <template v-else-if="board.master.tab === 'patches'">
          CLICK A PATCH = LOAD + PLAY · ☰ = EDIT IN THE RACK · DESCRIBE ONE + ENTER = MAKE IT · ≈ = ORDER BY LIKENESS ·
          ◀ ▶ IN THE HEADER = STEP PATCHES · ♥ = FAVOURITE · SPACE = PANIC
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
    <LibraryDialog v-if="libraryOpen" v-model="libraryOpen" :start="libraryTab" />
    <!-- kept once opened: a running request carries on with the dialog closed -->
    <AiDialog v-if="aiUsed" v-model="aiOpen" />
    <!-- an agent connected over MCP wants to do something that needs a yes -->
    <v-dialog :model-value="!!mcpStatus.approval" max-width="480" persistent>
      <div v-if="mcpStatus.approval" class="mcp-ask">
        <v-icon icon="mdi-connection" color="secondary" />
        <div>
          <b>AN AGENT CONNECTED OVER MCP ASKS</b>
          <p>{{ mcpStatus.approval.question }}</p>
        </div>
        <div class="row">
          <button class="hw-btn lit" @click="mcpStatus.approval.resolve(true)">ALLOW</button>
          <button class="hw-btn" @click="mcpStatus.approval.resolve(false)">DENY</button>
        </div>
      </div>
    </v-dialog>
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
.mcp-ask {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 8px;
  color: var(--text);
  background: linear-gradient(180deg, var(--panel-hi), var(--panel-lo));
  border: 1px solid #000;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
}
.mcp-ask b {
  font-family: 'Orbitron', sans-serif;
  font-size: 9px;
  letter-spacing: 0.15em;
  color: var(--text-head);
}
.mcp-ask p {
  margin: 2px 0 0;
  font-family: 'VT323', monospace;
  font-size: 19px;
  color: var(--c-secondary);
}
.mcp-ask .row {
  display: flex;
  gap: 6px;
  margin-left: auto;
}
.toast {
  font-family: 'VT323', monospace;
  font-size: 20px;
  color: #ffb000;
}
</style>
