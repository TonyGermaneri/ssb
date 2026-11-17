<script setup lang="ts">
import { computed } from 'vue'
import { SHADER_DEFAULTS, SHADER_STYLES, shaderPrefs, stageStatus, WORDS_DEFAULTS, WORDS_STYLES, type PadKind } from '../lib/play/shaders'
import Knob from './Knob.vue'

/**
 * A pad's SHADER section (in its ⚙ settings): the stage on / off for every pad, this kind of pad's style, and its knobs
 * -- AMT (how strongly), GLOW (bloom, and the halo it throws on its neighbours), TRAIL (how long its light lingers
 * and drifts out over them), SPEED. Shared by this kind of pad in every VCO; the page's, not the patch's.
 */
const props = defineProps<{ kind: PadKind }>()
const p = computed(() => shaderPrefs.pads[props.kind])
const pct = (v: number) => `${Math.round(v * 100)}%`
const times = (v: number) => `×${v.toFixed(2)}`
</script>

<template>
  <div class="shader-ctl">
    <span class="sc-head">SHADER</span>
    <div class="sc-row">
      <button
        class="sc-opt"
        :class="{ on: shaderPrefs.on && stageStatus.available }"
        :disabled="!stageStatus.available"
        :title="stageStatus.available ? 'The shader stage behind every pad (all VCOs): on / off' : 'This browser has no WebGL2: the pads draw their pictures alone'"
        @click="shaderPrefs.on = !shaderPrefs.on"
      >
        {{ !stageStatus.available ? 'GL N/A' : shaderPrefs.on ? 'GL ON' : 'GL OFF' }}
      </button>
      <button v-for="(name, i) in SHADER_STYLES[kind]" :key="name" class="sc-opt" :class="{ on: p.style === i }" @click="p.style = i">{{ name }}</button>
    </div>
    <div class="sc-knobs">
      <Knob v-model="p.amount" label="AMT" :min="0" :max="1" :default="SHADER_DEFAULTS.amount" :format="pct" :size="24" />
      <Knob v-model="p.glow" label="GLOW" :min="0" :max="1" :default="SHADER_DEFAULTS.glow" :format="pct" :size="24" />
      <Knob v-model="p.trail" label="TRAIL" :min="0" :max="1" :default="SHADER_DEFAULTS.trail" :format="pct" :size="24" />
      <Knob v-model="p.speed" label="SPEED" :min="0" :max="2" :default="SHADER_DEFAULTS.speed" :format="times" :size="24" />
    </div>
    <template v-if="kind === 'perform'">
      <span class="sc-head">GARDEN WORDS</span>
      <div class="sc-row">
        <button
          class="sc-opt"
          :class="{ on: shaderPrefs.words.on }"
          title="While a VCO grows (GROW), its prompt's words drift behind its pads: on / off"
          @click="shaderPrefs.words.on = !shaderPrefs.words.on"
        >
          {{ shaderPrefs.words.on ? 'WORDS ON' : 'WORDS OFF' }}
        </button>
        <button
          v-for="st in WORDS_STYLES"
          :key="st.id"
          class="sc-opt"
          :class="{ on: shaderPrefs.words.style === st.id }"
          :title="st.title"
          @click="shaderPrefs.words.style = st.id"
        >
          {{ st.label }}
        </button>
      </div>
      <div class="sc-knobs">
        <Knob v-model="shaderPrefs.words.amount" label="AMT" :min="0" :max="1" :default="WORDS_DEFAULTS.amount" :format="pct" :size="24" />
        <Knob v-model="shaderPrefs.words.flare" label="FLARE" :min="0" :max="1" :default="WORDS_DEFAULTS.flare" :format="pct" :size="24" />
        <Knob v-model="shaderPrefs.words.defects" label="AGE" :min="0" :max="1" :default="WORDS_DEFAULTS.defects" :format="pct" :size="24" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.shader-ctl {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding-top: 4px;
  border-top: 1px dashed color-mix(in srgb, var(--line) 35%, transparent);
}
.sc-head {
  font-family: 'Orbitron', sans-serif;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.15em;
  color: var(--line);
}
.sc-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 3px;
}
.sc-opt {
  padding: 0 6px;
  border-radius: 10px;
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: color-mix(in srgb, var(--line) 75%, transparent);
  background: color-mix(in srgb, var(--line) 8%, var(--lcd-bg));
  border: 1px solid color-mix(in srgb, var(--line) 40%, transparent);
}
.sc-opt.on {
  color: var(--lcd-bg);
  background: var(--line);
}
.sc-opt:disabled {
  opacity: 0.5;
}
.sc-knobs {
  display: flex;
  gap: 2px;
}
.sc-knobs :deep(.label) {
  color: color-mix(in srgb, var(--line) 75%, transparent);
}
</style>
