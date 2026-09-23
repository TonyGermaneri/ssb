<script setup lang="ts">
import { computed } from 'vue'
import { activeVoices } from '../audio/engine'
import { useBoard } from '../stores/board'
import { splitTags } from '../lib/tags'
import { carrierSlot, patchLayers, type Patch } from '../types'

/** A patch card: click to audition, ☰ opens its layers, the piano button makes it the keyboard patch. */
const props = defineProps<{ patch: Patch; hue: number; open: boolean; number: number }>()
const emit = defineEmits<{ toggle: [] }>()
const board = useBoard()

const layers = computed(() => patchLayers(props.patch))
const playing = computed(() => activeVoices.value.some((v) => board.patchIdOfLayer(v.soundId) === props.patch.id || board.patchIdOfLayer(v.voice.groupId ?? '') === props.patch.id))
const selected = computed(() => board.master.patchId === props.patch.id)
const pressed = computed(() => {
  const c = carrierSlot(props.patch)
  return !!c && board.pressed.has(c.layer.id)
})
const tagList = computed(() => splitTags(props.patch.tag))
const lastVoice = computed(() =>
  activeVoices.value.filter((v) => board.patchIdOfLayer(v.soundId) === props.patch.id).reduce((m, v) => Math.max(m, v.id), 0),
)
const mainName = computed(() => {
  const c = carrierSlot(props.patch)
  return c ? board.byId(c.layer.soundId)?.settings.name ?? 'missing sound' : 'empty'
})

function onDown(e: PointerEvent) {
  if (e.button !== 0) return
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  board.pressPatch(props.patch.id)
}
function onUp() {
  board.releasePatch(props.patch.id)
}
</script>

<template>
  <div
    class="pad"
    :class="{ playing, pressed, open, selected }"
    :style="{ '--hue': hue }"
    role="button"
    tabindex="0"
    :aria-label="`Audition ${patch.name}`"
    @pointerdown="onDown"
    @pointerup="onUp"
    @pointercancel="onUp"
    @contextmenu.prevent="emit('toggle')"
  >
    <button
      class="corner burger"
      :class="{ active: open }"
      title="Layers"
      @pointerdown.stop
      @pointerup.stop
      @mousedown.stop
      @keydown.stop
      @click.stop="emit('toggle')"
    >
      <v-icon size="18" icon="mdi-menu" />
    </button>
    <span class="corner num">{{ String(number).padStart(2, '0') }}</span>
    <div class="backlight" />
    <div v-if="lastVoice" :key="lastVoice" class="flash" />
    <div class="led" />
    <div class="name">{{ patch.name }}</div>
    <div class="sub">{{ mainName }}<span v-if="layers.length > 1"> +{{ layers.length - 1 }} VCO</span></div>
    <div v-if="tagList.length" class="tag" :title="tagList.join(', ')">
      {{ tagList.slice(0, 2).join(' · ') }}<span v-if="tagList.length > 2"> +{{ tagList.length - 2 }}</span>
    </div>
    <button
      class="heart"
      :class="{ on: patch.fav }"
      :title="patch.fav ? 'Unfavourite' : 'Favourite'"
      @pointerdown.stop
      @pointerup.stop
      @mousedown.stop
      @click.stop="board.toggleFav('patch', patch.id)"
    >
      <v-icon size="13" :icon="patch.fav ? 'mdi-heart' : 'mdi-heart-outline'" />
    </button>
    <button
      class="select"
      :class="{ on: selected }"
      :title="selected ? 'The keyboard patch' : 'Make this the keyboard patch'"
      @pointerdown.stop
      @pointerup.stop
      @mousedown.stop
      @click.stop="board.selectPatch(patch.id)"
    >
      <v-icon size="13" icon="mdi-piano" />
    </button>
  </div>
</template>

<style scoped>
.pad {
  --face: hsl(var(--hue) var(--pad-sat, 85%) var(--pad-light, 52%));
  --face-hi: hsl(var(--hue) 100% calc(var(--pad-light, 52%) + 20%));
  --face-lo: hsl(var(--hue) calc(var(--pad-sat, 85%) - 5%) calc(var(--pad-light, 52%) - 26%));
  --glow: hsl(var(--hue) 100% 60%);
  position: relative;
  zoom: var(--pad-scale, 1);
  width: 152px;
  height: 104px;
  padding: 24px 10px 20px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  cursor: pointer;
  user-select: none;
  touch-action: none;
  color: #fff;
  /* patches: a double bezel, so they read differently from sound pads */
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.04) 45%, transparent 50%),
    radial-gradient(ellipse at 50% 120%, var(--face-hi) 0%, transparent 60%),
    linear-gradient(180deg, var(--face) 0%, var(--face-lo) 100%);
  border: 1px solid rgba(0, 0, 0, 0.7);
  box-shadow:
    0 6px 0 #0b0a0d,
    0 8px 14px rgba(0, 0, 0, 0.6),
    inset 0 0 0 3px rgba(0, 0, 0, 0.25),
    inset 0 0 0 4px rgba(255, 255, 255, 0.18),
    inset 0 -3px 6px rgba(0, 0, 0, 0.35);
  transition: transform 60ms, box-shadow 60ms, filter 120ms;
}
.pad.pressed {
  transform: translateY(5px);
  box-shadow: 0 1px 0 #0b0a0d, inset 0 3px 8px rgba(0, 0, 0, 0.45);
}
.pad.playing {
  filter: brightness(1.15) saturate(1.1);
  box-shadow: 0 6px 0 #0b0a0d, 0 0 22px var(--glow), inset 0 0 0 3px rgba(0, 0, 0, 0.25);
}
.pad.open {
  outline: 2px solid color-mix(in srgb, var(--c-primary) 70%, transparent);
  outline-offset: 3px;
}
.pad.selected::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--c-secondary) 85%, transparent);
  pointer-events: none;
}
.backlight,
.flash {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  mix-blend-mode: screen;
}
.backlight {
  opacity: 0;
  transition: opacity 0.45s ease-out;
  background: radial-gradient(ellipse 75% 85% at 50% 55%, hsl(var(--hue) 100% 82% / 0.6), hsl(var(--hue) 100% 65% / 0.4) 42%, transparent 80%);
}
.playing .backlight {
  opacity: 1;
  transition-duration: 0.05s;
}
.flash {
  background: radial-gradient(ellipse at 50% 55%, rgba(255, 255, 255, 0.7), transparent 85%);
  animation: flash 0.4s ease-out forwards;
}
@keyframes flash {
  to {
    opacity: 0;
  }
}
.name,
.sub,
.tag {
  position: relative;
  z-index: 1;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name {
  font-family: 'Orbitron', sans-serif;
  font-weight: 900;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.6);
}
.sub {
  font-family: 'VT323', monospace;
  font-size: 13px;
  line-height: 1;
  opacity: 0.85;
}
.tag {
  font-family: 'VT323', monospace;
  font-size: 12px;
  line-height: 1;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.35);
  color: #ffe9b0;
}
.corner {
  position: absolute;
  top: 4px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 22px;
  padding: 0;
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.28);
}
.burger {
  left: 4px;
}
.burger:hover,
.burger.active {
  background: rgba(0, 0, 0, 0.55);
  color: var(--c-primary);
}
.num {
  right: 4px;
  width: auto;
  padding: 0 5px;
  font-family: 'VT323', monospace;
  font-size: 14px;
}
.led {
  position: absolute;
  top: 10px;
  left: 50%;
  width: 8px;
  height: 8px;
  margin-left: -4px;
  border-radius: 50%;
  background: #2a0a06;
}
.playing .led {
  background: #ff4b2b;
  box-shadow: 0 0 8px #ff4b2b;
}
.heart {
  position: absolute;
  right: 30px;
  bottom: 8px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 18px;
  padding: 0;
  border-radius: 3px;
  color: rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.25);
  z-index: 2;
}
.heart.on {
  color: #ff3d6e;
  filter: drop-shadow(0 0 4px #ff3d6e);
}
.select {
  position: absolute;
  right: 5px;
  bottom: 8px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 18px;
  padding: 0;
  border-radius: 3px;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(0, 0, 0, 0.3);
}
.select.on {
  color: #062a30;
  background: var(--c-secondary);
  box-shadow: 0 0 8px var(--c-secondary);
}
</style>
