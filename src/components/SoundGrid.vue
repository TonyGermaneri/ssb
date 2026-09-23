<script setup lang="ts">
import { useBoard } from '../stores/board'
import SoundTile from './SoundTile.vue'

const board = useBoard()
defineEmits<{ add: [] }>()
</script>

<template>
  <div v-if="!board.loaded" class="empty">
    <div class="cart">LOADING…</div>
  </div>
  <div v-else-if="!board.sounds.length" class="empty">
    <button class="cart" @click="$emit('add')">
      <div class="slot" />
      <div class="big">INSERT SOUNDS</div>
      <div class="small">drop .mp3 files anywhere · or click to browse</div>
    </button>
  </div>
  <div v-else-if="!board.visible.length" class="empty">
    <div class="cart small">NO PADS MATCH THE TAG FILTER</div>
  </div>
  <div v-else class="grid" :style="{ '--pad-scale': board.master.scale }">
    <SoundTile v-for="s in board.visible" :key="s.id" :sound="s" />
  </div>
</template>

<style scoped>
.grid {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px 8px;
  padding: 16px 12px 40px;
}
.empty {
  display: grid;
  place-items: center;
  min-height: 60vh;
  padding: 16px;
}
.cart {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 36px 48px;
  max-width: 100%;
  border-radius: 10px;
  border: 2px dashed rgba(255, 176, 0, 0.45);
  background: rgba(0, 0, 0, 0.25);
  color: #ffb000;
  font-family: 'Orbitron', sans-serif;
  cursor: pointer;
  text-align: center;
}
.cart:hover {
  background: rgba(255, 176, 0, 0.06);
}
.slot {
  width: 160px;
  height: 10px;
  border-radius: 5px;
  background: #050406;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.9), 0 1px 0 rgba(255, 255, 255, 0.1);
}
.big {
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 0.2em;
  text-shadow: 0 0 10px rgba(255, 176, 0, 0.6);
  animation: pulse 1.6s ease-in-out infinite;
}
.small {
  font-family: 'VT323', monospace;
  font-size: 18px;
  color: #b9b4a8;
  letter-spacing: 0.05em;
}
@keyframes pulse {
  50% {
    opacity: 0.55;
  }
}
</style>
