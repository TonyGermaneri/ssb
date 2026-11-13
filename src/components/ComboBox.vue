<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

/**
 * A select you can type into: a text field with a list of suggestions under it (▾, or ↓ / ↑ in the field). Picking
 * one puts its value in the field; anything typed stands as it is. Every option stays listed while typing (the
 * ones the text matches first), since there are few and the point is often to type something that isn't there.
 */
export interface ComboOption {
  value: string
  label: string
  /** a second line: size, notes */
  detail?: string
}

const model = defineModel<string>({ required: true })
const props = defineProps<{ options: ComboOption[]; placeholder?: string; title?: string }>()
const emit = defineEmits<{ pick: [value: string] }>()

const open = ref(false)
const active = ref(-1)
const input = ref<HTMLInputElement>()

const ordered = computed(() => {
  const q = model.value.trim().toLowerCase()
  if (!q) return props.options
  const hit = (o: ComboOption) => o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q)
  return [...props.options.filter(hit), ...props.options.filter((o) => !hit(o))]
})
const current = computed(() => props.options.find((o) => o.value === model.value))

function pick(o: ComboOption) {
  model.value = o.value
  open.value = false
  emit('pick', o.value)
}
function toggle() {
  open.value = !open.value
  active.value = ordered.value.findIndex((o) => o.value === model.value)
  void nextTick(() => input.value?.focus())
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (!open.value) return toggle()
    const n = ordered.value.length
    active.value = (active.value + (e.key === 'ArrowDown' ? 1 : n - 1) + (active.value < 0 && e.key === 'ArrowUp' ? 1 : 0)) % n
  } else if (e.key === 'Enter') {
    if (open.value && active.value >= 0) {
      e.preventDefault()
      pick(ordered.value[active.value])
    } else {
      open.value = false
      emit('pick', model.value)
    }
  } else if (e.key === 'Escape' && open.value) {
    e.stopPropagation()
    open.value = false
  }
}
// close when focus leaves (after a click on an option has landed)
function onBlur() {
  setTimeout(() => (open.value = false), 150)
}
</script>

<template>
  <div class="combo" :class="{ open }">
    <div class="field">
      <input
        ref="input"
        v-model.trim="model"
        spellcheck="false"
        autocomplete="off"
        role="combobox"
        :aria-expanded="open"
        :placeholder="placeholder"
        :title="title ?? current?.label ?? model"
        @input="(open = true), (active = -1)"
        @keydown="onKey"
        @blur="onBlur"
        @change="emit('pick', model)"
      />
      <button type="button" class="drop" tabindex="-1" title="Choose" @mousedown.prevent @click="toggle">▾</button>
    </div>
    <ul v-if="open && ordered.length" class="list" role="listbox">
      <li
        v-for="(o, i) in ordered"
        :key="o.value"
        role="option"
        :aria-selected="o.value === model"
        :class="{ active: i === active, chosen: o.value === model }"
        @mousedown.prevent="pick(o)"
        @mouseenter="active = i"
      >
        <span class="label">{{ o.label }}</span>
        <small v-if="o.detail">{{ o.detail }}</small>
        <code>{{ o.value }}</code>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.combo {
  position: relative;
  min-width: 0;
}
.field {
  display: flex;
  align-items: stretch;
}
.field input {
  flex: 1;
  min-width: 0;
  font-family: 'VT323', monospace;
  font-size: 17px;
  letter-spacing: 0.02em;
  padding: 2px 8px;
  border-radius: 3px 0 0 3px;
  color: var(--c-primary);
  background: var(--lcd-bg);
  border: 1px solid #000;
  border-right: none;
  outline: none;
}
.drop {
  width: 26px;
  border-radius: 0 3px 3px 0;
  color: var(--ink-mute);
  background: #111;
  border: 1px solid #000;
  font-size: 13px;
}
.open .drop,
.drop:hover {
  color: var(--c-secondary);
}
.list {
  position: absolute;
  z-index: 20;
  left: 0;
  right: 0;
  top: calc(100% + 2px);
  margin: 0;
  padding: 3px;
  list-style: none;
  border-radius: 3px;
  background: #0c0c0c;
  border: 1px solid #000;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.6);
}
.list li {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0 10px;
  padding: 4px 8px;
  border-radius: 2px;
  cursor: pointer;
  font-family: 'VT323', monospace;
  color: var(--ink-mute);
}
.list li.active {
  background: rgba(255, 255, 255, 0.07);
}
.list li.chosen .label {
  color: var(--c-secondary);
}
.label {
  font-size: 17px;
  color: var(--c-primary);
}
.list small {
  font-size: 14px;
  align-self: center;
  color: var(--text-mute);
}
.list code {
  grid-column: 1 / -1;
  font-size: 13px;
  color: var(--text-faint);
}
</style>
