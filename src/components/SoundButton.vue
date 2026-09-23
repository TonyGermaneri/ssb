<script setup lang="ts">
import { computed } from 'vue'
import { activeVoices, buffers, clock } from '../audio/engine'
import { useBoard } from '../stores/board'
import { midiNoteName } from '../lib/format'
import { splitTags } from '../lib/tags'
import { TRIGGER_MODE_INFO, type Sound } from '../types'

const props = defineProps<{ sound: Sound; hue: number; keyLabel?: string; open: boolean }>()
const emit = defineEmits<{ toggle: []; dragstart: [e: DragEvent] }>()
const board = useBoard()

const voices = computed(() => activeVoices.value.filter((v) => v.soundId === props.sound.id))
const playing = computed(() => voices.value.length > 0)
const pressed = computed(() => board.pressed.has(props.sound.id))
const selected = computed(() => board.master.selectedId === props.sound.id)
const tagList = computed(() => splitTags(props.sound.settings.tag))
/** slots of the selected patch this sound is in */
const inSlots = computed(() => board.slotsOf(props.sound.id))
const midiNote = computed(() => board.noteFor.get(props.sound.id))
/** newest voice id: changes on every trigger, which replays the flash */
const lastVoice = computed(() => voices.value.reduce((m, v) => Math.max(m, v.id), 0))

/** 0..1 through the whole play (finite repeats) or through the current loop cycle. */
const progress = computed(() => {
  const v = voices.value.at(-1)?.voice
  const buf = buffers.get(props.sound.audioId)
  if (!v || !buf) return 0
  const elapsed = clock.value - v.t0
  if (Number.isFinite(v.endTime)) return Math.min(1, elapsed / (v.endTime - v.t0))
  return (elapsed % v.cycle) / v.cycle
})

function onDown(e: PointerEvent) {
  if (e.button !== 0) return
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  board.press(props.sound.id)
}
function onUp() {
  if (board.pressed.has(props.sound.id)) board.release(props.sound.id)
}
</script>

<template>
  <div
    class="pad"
    :class="{ playing, pressed, open, selected }"
    :style="{ '--hue': hue }"
    role="button"
    tabindex="0"
    :aria-label="`Play ${sound.settings.name}`"
    @pointerdown="onDown"
    @pointerup="onUp"
    @pointercancel="onUp"
    @keydown.enter.prevent.stop="!$event.repeat && board.press(sound.id)"
    @keyup.enter.stop="onUp"
    @contextmenu.prevent="emit('toggle')"
  >
    <!-- stop the pad from seeing these events, or it would trigger the sound -->
    <button
      class="corner burger"
      :class="{ active: open }"
      :aria-expanded="open"
      aria-label="Sound controls"
      title="Controls"
      @pointerdown.stop
      @pointerup.stop
      @mousedown.stop
      @keydown.stop
      @click.stop="emit('toggle')"
    >
      <v-icon size="18" icon="mdi-menu" />
    </button>
    <div
      class="corner grip"
      draggable="true"
      title="Drag to reorder"
      @pointerdown.stop
      @dragstart="emit('dragstart', $event)"
    >
      <v-icon size="16" icon="mdi-drag" />
    </div>

    <!-- light under the plastic: glows while playing, flashes on every hit -->
    <div class="backlight" />
    <div v-if="lastVoice" :key="lastVoice" class="flash" />

    <!-- 1 / 2 / 3: put this sound into that VCO slot of the selected patch (lit = it's there) -->
    <div class="slots" @pointerdown.stop @pointerup.stop @mousedown.stop>
      <button
        v-for="n in 3"
        :key="n"
        class="slot"
        :class="{ on: inSlots.has(n) }"
        :title="inSlots.has(n) ? `Remove from VCO ${n}` : `Put in VCO ${n} of the selected patch`"
        @click.stop="board.toggleSlot(n - 1, sound.id)"
      >
        {{ n }}
      </button>
    </div>
    <div class="name">{{ sound.settings.name }}</div>
    <div v-if="tagList.length" class="tag" :title="tagList.join(', ')">
      {{ tagList.slice(0, 2).join(' · ') }}<span v-if="tagList.length > 2" class="more"> +{{ tagList.length - 2 }}</span>
    </div>

    <div class="badges">
      <v-icon size="12" :icon="TRIGGER_MODE_INFO[sound.settings.mode].icon" />
      <span v-if="sound.zones?.length" class="sfz" :title="`SFZ instrument · ${sound.zones.length} zones`">SFZ</span>
      <span v-if="sound.settings.repeat === 0">∞</span>
      <span v-else-if="sound.settings.repeat > 1">×{{ sound.settings.repeat }}</span>
      <span v-if="sound.settings.choke">G{{ sound.settings.choke }}</span>
      <span v-if="midiNote !== undefined">{{ midiNoteName(midiNote) }}</span>
      <kbd v-if="keyLabel" class="key">{{ keyLabel.toUpperCase() }}</kbd>
    </div>
    <button
      class="heart"
      :class="{ on: sound.fav }"
      :title="sound.fav ? 'Unfavourite' : 'Favourite'"
      @pointerdown.stop
      @pointerup.stop
      @mousedown.stop
      @click.stop="board.toggleFav('sound', sound.id)"
    >
      <v-icon size="13" :icon="sound.fav ? 'mdi-heart' : 'mdi-heart-outline'" />
    </button>
    <button
      class="select"
      :class="{ on: selected }"
      :aria-pressed="selected"
      :title="selected ? 'Editing in the rack' : 'Edit in the rack (and play on the keyboard when there are no patches)'"
      @pointerdown.stop
      @pointerup.stop
      @mousedown.stop
      @keydown.stop
      @click.stop="board.select(sound.id)"
    >
      <v-icon size="13" icon="mdi-piano" />
    </button>
    <div class="progress"><div :style="{ transform: `scaleX(${progress})` }" /></div>
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
  padding: 26px 10px 18px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
  touch-action: none;
  outline: none;
  color: #fff;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.05) 45%, transparent 50%),
    radial-gradient(ellipse at 50% 120%, var(--face-hi) 0%, transparent 60%),
    linear-gradient(180deg, var(--face) 0%, var(--face-lo) 100%);
  border: 1px solid rgba(0, 0, 0, 0.7);
  box-shadow:
    0 6px 0 var(--lcd-bg),
    0 8px 14px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.45),
    inset 0 -3px 6px rgba(0, 0, 0, 0.35);
  transition:
    transform 60ms,
    box-shadow 60ms,
    filter 120ms;
}
.pad:focus-visible {
  outline: 2px solid var(--c-primary);
  outline-offset: 3px;
}
.pad.pressed {
  transform: translateY(5px);
  box-shadow:
    0 1px 0 var(--lcd-bg),
    0 2px 5px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.3),
    inset 0 3px 8px rgba(0, 0, 0, 0.45);
}
.pad.playing {
  filter: brightness(1.18) saturate(1.15);
  box-shadow:
    0 6px 0 var(--lcd-bg),
    0 0 22px var(--glow),
    0 0 4px var(--glow),
    inset 0 1px 0 rgba(255, 255, 255, 0.45),
    inset 0 -3px 6px rgba(0, 0, 0, 0.35);
}
.pad.playing.pressed {
  box-shadow:
    0 1px 0 var(--lcd-bg),
    0 0 22px var(--glow),
    inset 0 3px 8px rgba(0, 0, 0, 0.45);
}
.pad.open {
  outline: 2px solid color-mix(in srgb, var(--c-primary) 70%, transparent);
  outline-offset: 3px;
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
  background: radial-gradient(
    ellipse 75% 85% at 50% 55%,
    hsl(var(--hue) 100% 82% / 0.6) 0%,
    hsl(var(--hue) 100% 65% / 0.4) 42%,
    hsl(var(--hue) 100% 55% / 0) 80%
  );
}
/* frosted diffuser texture, only visible when lit */
.backlight::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.22) 0.8px, transparent 1.4px) 0 0 / 4px 4px;
}
.playing .backlight {
  opacity: 1;
  transition-duration: 0.05s;
}
.flash {
  background: radial-gradient(ellipse at 50% 55%, rgba(255, 255, 255, 0.7), hsl(var(--hue) 100% 75% / 0.4) 55%, transparent 85%);
  animation: flash 0.4s ease-out forwards;
}
@keyframes flash {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
.name,
.tag {
  position: relative;
  z-index: 1;
}
.playing .name {
  text-shadow:
    0 1px 0 rgba(0, 0, 0, 0.7),
    0 0 6px rgba(0, 0, 0, 0.55);
}
.name {
  max-width: 100%;
  font-family: 'Orbitron', sans-serif;
  font-weight: 900;
  font-size: 12px;
  letter-spacing: 0.06em;
  line-height: 1.15;
  text-align: center;
  text-transform: uppercase;
  text-shadow:
    0 1px 0 rgba(0, 0, 0, 0.6),
    0 0 8px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-word;
}
.tag {
  font-family: 'VT323', monospace;
  font-size: 13px;
  line-height: 1;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.35);
  color: #ffe9b0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag .more {
  opacity: 0.7;
}
.corner {
  position: absolute;
  top: 4px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 22px;
  padding: 0; /* default button padding pushes the icon off-center */
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(0, 0, 0, 0.3);
}
.burger {
  left: 4px;
  cursor: pointer;
}
.burger:hover,
.burger.active {
  background: rgba(0, 0, 0, 0.55);
  color: var(--c-primary);
}
.grip {
  right: 4px;
  cursor: grab;
  opacity: 0.6;
}
.grip:hover {
  opacity: 1;
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
  box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.6);
}
.playing .led {
  background: #ff4b2b;
  box-shadow:
    0 0 6px #ff4b2b,
    0 0 12px #ff4b2b;
}
.badges {
  position: absolute;
  left: 7px;
  bottom: 10px;
  display: flex;
  gap: 4px;
  align-items: center;
  font-family: 'VT323', monospace;
  font-size: 13px;
  line-height: 1;
  opacity: 0.85;
}
.sfz {
  padding: 0 3px;
  border-radius: 2px;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
}
.key {
  min-width: 16px;
  padding: 0 3px;
  font-family: 'VT323', monospace;
  font-size: 13px;
  line-height: 14px;
  text-align: center;
  color: #1a1a1a;
  background: linear-gradient(#f1ebdc, #c9c0aa);
  border-radius: 2px;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.6);
}
.slots {
  position: absolute;
  top: 5px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 2px;
  z-index: 2;
}
.slot {
  width: 17px;
  height: 17px;
  padding: 0;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 14px;
  line-height: 1;
  color: rgba(255, 255, 255, 0.75);
  background: rgba(0, 0, 0, 0.32);
  border: 1px solid rgba(0, 0, 0, 0.35);
}
.slot:hover {
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
}
.slot.on {
  color: #1a1200;
  background: var(--c-primary);
  box-shadow: 0 0 8px var(--c-primary);
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
  border: 1px solid rgba(0, 0, 0, 0.35);
  cursor: pointer;
}
.select:hover {
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
}
.select.on {
  color: #062a30;
  background: var(--c-secondary);
  box-shadow: 0 0 8px var(--c-secondary);
}
.pad.selected::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--c-secondary) 85%, transparent), inset 0 0 14px color-mix(in srgb, var(--c-secondary) 35%, transparent);
  pointer-events: none;
}
.progress {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 2px;
  height: 2px;
  border-radius: 1px;
  background: rgba(0, 0, 0, 0.3);
  overflow: hidden;
}
.progress div {
  height: 100%;
  background: #fff;
  box-shadow: 0 0 4px #fff;
  transform-origin: left;
}
</style>
