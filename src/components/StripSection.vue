<script setup lang="ts">
import { computed } from 'vue'
import { useBoard } from '../stores/board'

/**
 * One of the header's groups. Folds sideways (◀) to a thin strip, its title turned to read upwards, like the control
 * panel's sections fold up to theirs; a folded group is one button that opens it again (▶). Which are folded is kept
 * in master.headerFolded. A `fixed` group (the console's core: output, patch, VCOs, view, board) never folds.
 */
const props = defineProps<{ id: string; title: string; fixed?: boolean }>()
const board = useBoard()
const folded = computed(() => !props.fixed && board.master.headerFolded.includes(props.id))
function toggle() {
  const f = board.master.headerFolded
  board.master.headerFolded = folded.value ? f.filter((k) => k !== props.id) : [...f, props.id]
}
</script>

<template>
  <button v-if="folded" class="group folded" :title="`Show ${title}`" @click="toggle">
    <i class="tri" />
    <h5>{{ title }}</h5>
  </button>
  <section v-else class="group">
    <h5>
      {{ title }}
      <slot name="title" />
      <button v-if="!fixed" class="fold" :title="`Fold ${title}`" @click="toggle"><i class="tri" /></button>
    </h5>
    <div class="controls"><slot /></div>
  </section>
</template>

<style scoped>
.group {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 2px 4px 3px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.16);
}
.group h5 {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0 0 1px;
  padding-right: 14px;
  font-family: 'Orbitron', sans-serif;
  font-size: 7px;
  font-weight: 900;
  letter-spacing: 0.2em;
  white-space: nowrap;
  color: var(--text-head);
  opacity: 0.75;
}
.controls {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 5px;
}
.fold {
  position: absolute;
  top: 1px;
  right: 2px;
  display: grid;
  place-items: center;
  width: 12px;
  height: 11px;
  padding: 0;
  border: 0;
  background: none;
  appearance: none;
}
/* a little triangle: ◀ open (folds to the left), ▶ folded */
.tri {
  width: 0;
  height: 0;
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  border-right: 5px solid var(--text-mute);
}
.fold:hover .tri {
  border-right-color: var(--c-primary);
}
/* folded: a strip the header's height, the title turned a quarter counter-clockwise (reads bottom to top), ▶ where ◀ was */
.group.folded {
  align-items: flex-start;
  justify-content: center;
  padding: 4px 9px 4px 3px;
  color: inherit;
  cursor: pointer;
}
.group.folded h5 {
  margin: 0;
  padding: 0;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  letter-spacing: 0.12em;
  opacity: 0.6;
}
.group.folded .tri {
  position: absolute;
  top: 3px;
  right: 3px;
  border-right: 0;
  border-left: 5px solid var(--text-mute);
}
.group.folded:hover {
  background: rgba(255, 255, 255, 0.05);
}
.group.folded:hover h5 {
  opacity: 1;
  color: var(--c-primary);
}
.group.folded:hover .tri {
  border-left-color: var(--c-primary);
}
</style>
