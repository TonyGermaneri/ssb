<script setup lang="ts">
import { computed } from 'vue'
import { useBoard } from '../stores/board'
import { WAVE_VIEWS } from '../types'

/**
 * Which view a sound's display shows (every display alike): the live ones (SCOPE, BARS, SPECTRO) or the sample (2D,
 * ISO). `tv`: the vintage scope's channel plate, on its set's front panel.
 */
defineProps<{ tv?: boolean }>()
const board = useBoard()
const cur = computed(() => WAVE_VIEWS.find((v) => v.id === board.master.waveView) ?? WAVE_VIEWS[0])
</script>

<template>
  <!-- a wrapper: v-menu has no element of its own for a parent's class (where the picker sits) to land on -->
  <div class="picker" :class="{ tv }">
  <v-menu location="bottom end">
    <template #activator="{ props: act }">
      <button
        class="pick"
        :class="{ tv }"
        v-bind="act"
        :title="`${cur.title} — click for another view`"
        @pointerdown.stop
        @click.stop
      >
        {{ cur.label }}<i />
      </button>
    </template>
    <div class="pick-menu">
      <button
        v-for="v in WAVE_VIEWS"
        :key="v.id"
        :class="{ on: v.id === board.master.waveView }"
        :title="v.title"
        @click="board.master.waveView = v.id"
      >
        {{ v.label }}
      </button>
    </div>
  </v-menu>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
}
.picker.tv {
  flex: none;
}
.pick {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 4px;
  border-radius: 2px;
  font-family: 'VT323', monospace;
  font-size: 12px;
  line-height: 12px;
  color: var(--c-secondary);
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid #000;
  opacity: 0.75;
}
.pick:hover {
  opacity: 1;
}
.pick i {
  width: 0;
  height: 0;
  border-left: 2.5px solid transparent;
  border-right: 2.5px solid transparent;
  border-top: 3px solid currentColor;
}
/* the set's channel selector: an engraved aluminium plate, worn */
.pick.tv {
  justify-content: center;
  width: 100%;
  padding: 0;
  height: 8px;
  border-radius: 1.5px;
  font-family: 'Futura', 'Century Gothic', 'Avenir Next', 'Trebuchet MS', sans-serif;
  font-size: 6px;
  font-weight: 700;
  line-height: 8px;
  letter-spacing: 0.08em;
  color: #2b2418;
  text-shadow: 0 0.5px 0 rgba(255, 248, 225, 0.35);
  background: linear-gradient(180deg, #d9d0b8, #a59b82 60%, #8e8470);
  border: 0.5px solid #4a4134;
  box-shadow:
    inset 0 0.5px 0 rgba(255, 255, 255, 0.5),
    0 0.5px 1px rgba(0, 0, 0, 0.6);
  opacity: 0.92;
}
.pick-menu {
  display: grid;
  gap: 3px;
  padding: 5px;
  border-radius: 6px;
  background: linear-gradient(180deg, var(--panel-hi), var(--panel-lo));
  border: 1px solid #000;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
}
.pick-menu button {
  padding: 1px 10px;
  border-radius: 2px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  line-height: 15px;
  text-align: left;
  color: var(--ink-dim);
  background: #111;
  border: 1px solid #000;
}
.pick-menu button:hover {
  color: var(--c-primary);
}
.pick-menu button.on {
  color: var(--c-secondary);
  text-shadow: 0 0 4px color-mix(in srgb, var(--c-secondary) 70%, transparent);
}
</style>
