<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useBoard } from '../stores/board'
import { collectDropped } from '../lib/dropFiles'

const board = useBoard()
const active = ref(false)
let depth = 0

const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files')

function onEnter(e: DragEvent) {
  if (!hasFiles(e)) return
  depth++
  active.value = true
}
function onLeave(e: DragEvent) {
  if (!hasFiles(e)) return
  depth = Math.max(0, depth - 1)
  if (!depth) active.value = false
}
function onOver(e: DragEvent) {
  if (!hasFiles(e)) return
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'copy'
}
function onDrop(e: DragEvent) {
  if (!hasFiles(e)) return
  e.preventDefault()
  depth = 0
  active.value = false
  // folders are walked, so an SFZ can be dropped with its sample directory
  if (e.dataTransfer) void collectDropped(e.dataTransfer).then((files) => board.addFiles(files))
}

onMounted(() => {
  window.addEventListener('dragenter', onEnter)
  window.addEventListener('dragleave', onLeave)
  window.addEventListener('dragover', onOver)
  window.addEventListener('drop', onDrop)
})
onBeforeUnmount(() => {
  window.removeEventListener('dragenter', onEnter)
  window.removeEventListener('dragleave', onLeave)
  window.removeEventListener('dragover', onOver)
  window.removeEventListener('drop', onDrop)
})
</script>

<template>
  <Transition name="fade">
    <div v-if="active" class="dropzone">
      <div class="msg">
        <div class="big">DROP TO LOAD</div>
        <div class="small">MP3 · WAV · OGG · M4A · FLAC · SFZ + SAMPLES · FOLDERS · ZIP</div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.dropzone {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: rgba(5, 4, 6, 0.8);
  pointer-events: none;
}
.msg {
  padding: 40px 60px;
  border: 3px dashed var(--c-success);
  border-radius: 12px;
  text-align: center;
  color: var(--c-success);
  text-shadow: 0 0 12px color-mix(in srgb, var(--c-success) 80%, transparent);
}
.big {
  font-family: 'Orbitron', sans-serif;
  font-weight: 900;
  font-size: 32px;
  letter-spacing: 0.2em;
}
.small {
  font-family: 'VT323', monospace;
  font-size: 20px;
  letter-spacing: 0.2em;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 120ms;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
