<script setup lang="ts">
import { computed } from 'vue'
import { useBoard } from '../stores/board'

/**
 * The patch a description made, while it's on trial: what it was blended from, what the words pushed, and SAVE (onto
 * the board), REROLL (another blend of the nearest patches) or DISCARD (back to the patch before). It plays and edits
 * like any patch meanwhile; it just isn't on the board until it's saved.
 */
const board = useBoard()
const info = computed(() => board.candidateInfo)
const pct = (w: number) => `${Math.round(w * 100)}%`
</script>

<template>
  <div v-if="board.candidate && info" class="candidate">
    <v-icon size="16" icon="mdi-auto-fix" class="star" />
    <b>CANDIDATE</b>
    <span class="q" :title="`Made from the description: ${info.query}`">“{{ info.query }}”</span>
    <span class="from" :title="info.from.map((f) => `${f.name} ${pct(f.weight)}`).join('\n')">
      FROM
      <template v-for="(f, i) in info.from.slice(0, 3)" :key="f.id">
        <i v-if="i">·</i> {{ f.name }} <em>{{ pct(f.weight) }}</em>
      </template>
      <template v-if="info.from.length > 3"> +{{ info.from.length - 3 }}</template>
    </span>
    <span v-for="p in info.pushes" :key="p.label" class="push" :title="`The words pushed it ${p.label.toLowerCase()} (${Math.round(Math.abs(p.amount) * 100)} %)`">
      {{ p.label }}
    </span>
    <span v-if="info.swapped" class="push" title="A sound the words named took VCO 1">VCO 1 → {{ info.swapped }}</span>
    <v-spacer />
    <button class="hw-btn" title="Another blend of the nearest patches, jittered a little" @click="board.rerollCandidate()">
      <v-icon size="14" icon="mdi-dice-5" /> REROLL
    </button>
    <button class="hw-btn save" title="Keep it: it joins the board's patches" @click="board.saveCandidate()">
      <v-icon size="14" icon="mdi-content-save" /> SAVE
    </button>
    <button class="hw-btn" title="Let it go: back to the patch that was loaded before" @click="board.discardCandidate()">
      <v-icon size="14" icon="mdi-close" /> DISCARD
    </button>
  </div>
</template>

<style scoped>
.candidate {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 22px;
  font-family: 'VT323', monospace;
  font-size: 17px;
  color: var(--ink-dim);
  text-transform: uppercase;
  background: linear-gradient(90deg, color-mix(in srgb, var(--c-primary) 22%, #000), color-mix(in srgb, var(--panel-lo) 80%, #000) 60%);
  border-bottom: 1px solid #000;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  white-space: nowrap;
  overflow: hidden;
}
.star {
  color: var(--c-primary);
  filter: drop-shadow(0 0 4px var(--c-primary));
}
b {
  font-family: 'Orbitron', sans-serif;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.18em;
  color: var(--c-primary);
}
.q {
  color: var(--c-secondary);
  text-transform: none;
}
.from {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-mute);
}
.from i {
  font-style: normal;
  opacity: 0.6;
}
.from em {
  font-style: normal;
  color: var(--c-secondary);
}
.push {
  padding: 0 6px;
  border-radius: 3px;
  font-size: 14px;
  color: var(--c-accent);
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid #000;
}
.hw-btn {
  height: 24px;
  font-size: 9px;
}
.save {
  color: var(--c-primary);
}
</style>
