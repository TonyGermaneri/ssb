<script setup lang="ts">
import { computed } from 'vue'
import { activeVoices } from '../audio/engine'
import { useBoard } from '../stores/board'
import { padHue } from '../lib/format'
import { PATCH_SLOTS, type PatchSlot, type Sound } from '../types'
import Waveform from './Waveform.vue'

/**
 * The selected patch's three VCO slots in the header: what's in each and, as it plays, its transport and grains
 * (the rack's own scopes, small). A slot's LED lights while it sounds; a click shows the rack.
 */
const board = useBoard()
const W = 104
const H = 34

const slots = computed(() => {
  const patch = board.selectedPatch
  return Array.from({ length: PATCH_SLOTS }, (_, i) => {
    const x: PatchSlot | null = patch?.slots[i] ?? null
    const sound: Sound | undefined = x ? board.layerSound(x.layer) : undefined
    const name = x ? (board.byId(x.layer.soundId)?.settings.name ?? '(missing sound)') : ''
    return { i, x, sound, name }
  })
})
const sounding = computed(() => new Set(activeVoices.value.map((v) => v.soundId)))
const hue = (s: Sound) => padHue(s.settings.tag, s.settings.name, board.theme.padHues)

function tip(i: number, x: PatchSlot | null, name: string) {
  const what = !board.selectedPatch ? 'no patch selected' : x ? `${name}${i > 0 && !x.audible ? ' (mod only)' : ''}` : 'empty'
  return `VCO ${i + 1}: ${what}${board.master.rack ? '' : ' — click to show the rack'}`
}
</script>

<template>
  <div class="vcos">
    <button
      v-for="{ i, x, sound, name } in slots"
      :key="i"
      class="vco"
      :class="{ empty: !sound, live: sound && sounding.has(sound.id) }"
      :title="tip(i, x, name)"
      @click="board.master.rack = true"
    >
      <Waveform v-if="sound" :sound="sound" :hue="hue(sound)" :width="W" :height="H" readonly />
      <span class="tag">
        <i class="led" />
        <b :class="{ main: i === 0 }">{{ i + 1 }}</b>
        <span class="name">{{ sound ? name : 'EMPTY' }}</span>
        <em v-if="x && i > 0 && !x.audible">MOD</em>
      </span>
    </button>
  </div>
</template>

<style scoped>
.vcos {
  display: flex;
  gap: 4px;
}
.vco {
  position: relative;
  width: 104px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: none;
  cursor: pointer;
  color: inherit;
}
.vco.empty {
  border: 1px dashed color-mix(in srgb, var(--c-primary) 30%, transparent);
  background: rgba(0, 0, 0, 0.25);
}
.vco:hover {
  outline: 1px solid color-mix(in srgb, var(--c-primary) 55%, transparent);
}
/* the slot's LED, number and sound along the scope's bottom edge (notes are labelled along its top) */
.tag {
  position: absolute;
  left: 2px;
  bottom: 1px;
  right: 2px;
  display: flex;
  align-items: center;
  gap: 3px;
  pointer-events: none;
  font-family: 'VT323', monospace;
  font-size: 12px;
  line-height: 11px;
  text-transform: uppercase;
  color: var(--ink-dim);
}
.tag b {
  font-family: 'Orbitron', sans-serif;
  font-size: 7px;
  font-weight: 900;
  color: var(--c-accent);
}
.tag b.main {
  color: var(--c-primary);
}
.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 2px;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.55);
}
.empty .name {
  background: none;
  color: var(--text-mute);
}
.tag em {
  font-style: normal;
  padding: 0 2px;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.55);
  color: var(--text-mute);
}
.led {
  flex: none;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--c-success) 20%, #000);
}
.empty .led {
  visibility: hidden;
}
.live .led {
  background: var(--c-success);
  box-shadow: 0 0 5px var(--c-success);
}
</style>
