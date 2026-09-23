<script setup lang="ts">
import { computed } from 'vue'
import { levels } from '../audio/engine'

const SEGMENTS = 14
/** Peak → lit segment count on a -42..0 dB scale. */
const lit = computed(() =>
  levels.value.map((peak) => {
    const db = 20 * Math.log10(Math.max(peak, 1e-6))
    return Math.round(Math.min(1, Math.max(0, (db + 42) / 42)) * SEGMENTS)
  }),
)
const segColor = (i: number) => (i >= SEGMENTS - 2 ? 'red' : i >= SEGMENTS - 5 ? 'amber' : 'green')
</script>

<template>
  <div class="vu" title="Master level">
    <div v-for="(n, ch) in lit" :key="ch" class="bar">
      <span class="ch">{{ ch ? 'R' : 'L' }}</span>
      <i v-for="i in SEGMENTS" :key="i" :class="[segColor(i - 1), { on: i <= n }]" />
    </div>
  </div>
</template>

<style scoped>
.vu {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 4px 6px;
  border-radius: 3px;
  background: #070608;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.9), 0 1px 0 rgba(255, 255, 255, 0.07);
}
.bar {
  display: flex;
  align-items: center;
  gap: 2px;
}
.ch {
  width: 8px;
  font-family: 'VT323', monospace;
  font-size: 11px;
  line-height: 1;
  color: #777;
}
i {
  width: 5px;
  height: 7px;
  border-radius: 1px;
  opacity: 0.16;
}
i.on {
  opacity: 1;
}
.green { background: var(--c-success); }
.amber { background: var(--c-primary); }
.red { background: var(--c-danger); }
.green.on { box-shadow: 0 0 4px var(--c-success); }
.amber.on { box-shadow: 0 0 4px var(--c-primary); }
.red.on { box-shadow: 0 0 4px var(--c-danger); }
</style>
