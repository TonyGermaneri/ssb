<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBoard } from '../stores/board'
import { padHue } from '../lib/format'
import type { Sound } from '../types'
import ControlPanel from './ControlPanel.vue'
import SoundButton from './SoundButton.vue'

const REORDER_TYPE = 'application/x-ssb-sound'
const props = defineProps<{ sound: Sound }>()
const board = useBoard()
const el = ref<HTMLElement>()
const dropTarget = ref(false)
const open = computed(() => board.openPanels.has(props.sound.id))
const hue = computed(() => padHue(props.sound.settings.tag, props.sound.settings.name))

function onDragStart(e: DragEvent) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData(REORDER_TYPE, props.sound.id)
  e.dataTransfer.effectAllowed = 'move'
  const pad = el.value?.querySelector('.pad')
  if (pad) e.dataTransfer.setDragImage(pad, 76, 52)
}
function onDragOver(e: DragEvent) {
  if (!e.dataTransfer?.types.includes(REORDER_TYPE)) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  dropTarget.value = true
}
function onDrop(e: DragEvent) {
  dropTarget.value = false
  const from = e.dataTransfer?.getData(REORDER_TYPE)
  if (!from) return
  e.preventDefault()
  e.stopPropagation()
  board.move(from, props.sound.id)
}
</script>

<template>
  <div
    ref="el"
    class="tile"
    :class="{ 'drop-target': dropTarget }"
    @dragover="onDragOver"
    @dragleave="dropTarget = false"
    @drop="onDrop"
  >
    <v-expand-transition>
      <ControlPanel v-if="open" :sound="sound" :hue="hue" />
    </v-expand-transition>
    <SoundButton
      :sound="sound"
      :hue="hue"
      :open="open"
      :key-label="board.keyFor.get(sound.id)"
      @toggle="board.togglePanel(sound.id)"
      @dragstart="onDragStart"
    />
  </div>
</template>

<style scoped>
.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 4px;
  border-radius: 12px;
  transition: background 120ms;
}
.drop-target {
  background: rgba(255, 176, 0, 0.12);
  box-shadow: inset 0 0 0 2px rgba(255, 176, 0, 0.6);
}
</style>
