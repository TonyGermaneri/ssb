<script setup lang="ts">
/**
 * The on-screen keyboard, across the bottom (the rack's 🎹 chip turns it on): for playing with no keyboard at hand.
 * Short rather than lifelike -- a strip of 32 to 88 keys -- with a pitch wheel (springs back), a mod wheel and an
 * expression strip at its left, its octave, size and fixed velocity beside them. It's a MIDI controller in the page
 * (board.screenMidi): it plays the selected patch whether PLAY is on or not.
 *
 * Every finger, pen or the mouse is its own pointer: chords on a touch screen or a tablet. On a held key the mouse
 * wheel is aftertouch (a pen's pressure is too). With MPE on (its chip here, or the header's), each note gets its own
 * channel and dragging around the key plays it: sideways bends that note, up and down its timbre (CC74). With MPE off,
 * dragging slides from key to key.
 */
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { useBoard } from '../stores/board'
import { PIANO_SIZES } from '../types'
import { midiNoteName } from '../lib/format'

const board = useBoard()
const piano = computed(() => board.master.piano)
const size = computed(() => PIANO_SIZES.find((p) => p.keys === piano.value.keys) ?? PIANO_SIZES[2])
const BLACK = new Set([1, 3, 6, 8, 10])
const isBlack = (n: number) => BLACK.has(((n % 12) + 12) % 12)
/** the lowest note, the octave shift kept within MIDI's 0..127 */
const low = computed(() => {
  const base = size.value.low
  const top = base + size.value.keys - 1
  const o = Math.max(Math.ceil(-base / 12), Math.min(Math.floor((127 - top) / 12), piano.value.octave))
  return base + 12 * o
})
const notes = computed(() => Array.from({ length: size.value.keys }, (_, i) => low.value + i))
const whites = computed(() => notes.value.filter((n) => !isBlack(n)))
/** each key's place, as fractions of the keys' width: whites side by side, blacks over the cracks between them */
const BLACK_W = 0.6
const keys = computed(() => {
  const w = 1 / whites.value.length
  let wi = 0
  return notes.value.map((n) => {
    if (isBlack(n)) return { n, black: true, x: wi * w - (w * BLACK_W) / 2, w: w * BLACK_W }
    const k = { n, black: false, x: wi * w, w }
    wi++
    return k
  })
})
const BLACK_H = 0.6

// ── who's holding what ──
interface Held {
  note: number
  ch: number
  x0: number
  pressure: number
  timbre: number
  bend: number
}
const held = reactive(new Map<number, Held>())
const down = computed(() => new Set([...held.values()].map((h) => h.note)))
const mpe = computed(() => board.master.mpe)
/** MPE member channels, least recently used first */
const free: number[] = Array.from({ length: 15 }, (_, i) => i + 1)
function takeChannel() {
  const busy = new Set([...held.values()].map((h) => h.ch))
  const i = free.findIndex((c) => !busy.has(c))
  const ch = free.splice(i < 0 ? 0 : i, 1)[0]
  free.push(ch)
  return ch
}

const keysEl = ref<HTMLElement>()
let box: DOMRect | null = null
/** the note under a point (black keys first, in their upper part), or null off the keys */
function noteAt(x: number, y: number): number | null {
  const r = box ?? keysEl.value!.getBoundingClientRect()
  const fx = (x - r.left) / r.width
  const fy = (y - r.top) / r.height
  if (fx < 0 || fx >= 1) return null
  if (fy < BLACK_H) for (const k of keys.value) if (k.black && fx >= k.x && fx < k.x + k.w) return k.n
  for (const k of keys.value) if (!k.black && fx >= k.x && fx < k.x + k.w) return k.n
  return null
}
/** a timbre from how high on the keys: 0 at the bottom, 1 at the top */
const timbreAt = (y: number) => {
  const r = box!
  return Math.min(1, Math.max(0, 1 - (y - r.top) / r.height))
}

function start(note: number, e: PointerEvent) {
  const ch = mpe.value ? takeChannel() : 0
  const h: Held = { note, ch, x0: e.clientX, pressure: penPressure(e), timbre: timbreAt(e.clientY), bend: 0 }
  if (mpe.value) {
    // a channel starts where this note wants it: no bend, its timbre, its pressure
    board.screenMidi({ type: 'pitchBend', channel: ch, value: 0 })
    board.screenMidi({ type: 'cc', channel: ch, cc: 74, value: h.timbre })
    board.screenMidi({ type: 'channelPressure', channel: ch, value: h.pressure })
  } else if (h.pressure) board.screenMidi({ type: 'channelPressure', channel: 0, value: h.pressure })
  board.screenMidi({ type: 'noteOn', channel: ch, note, velocity: piano.value.velocity })
  held.set(e.pointerId, h)
}
function stop(id: number) {
  const h = held.get(id)
  if (!h) return
  held.delete(id)
  board.screenMidi({ type: 'noteOff', channel: h.ch, note: h.note })
  // aftertouch lets go with the key (MPE: that note's channel; else once no key is down)
  if (h.ch) board.screenMidi({ type: 'channelPressure', channel: h.ch, value: 0 })
  else if (h.pressure && ![...held.values()].some((x) => !x.ch)) board.screenMidi({ type: 'channelPressure', channel: 0, value: 0 })
}
/** a pen's pressure (a mouse's is a flat 0.5 while pressed, a finger's mostly 0 or 1: neither counts) */
const penPressure = (e: PointerEvent) => (e.pointerType === 'pen' ? Math.min(1, Math.max(0, e.pressure)) : 0)

function onDown(e: PointerEvent) {
  if (e.button !== 0) return
  box = keysEl.value!.getBoundingClientRect()
  const n = noteAt(e.clientX, e.clientY)
  if (n === null) return
  e.preventDefault()
  keysEl.value!.setPointerCapture(e.pointerId)
  start(n, e)
}
function onMove(e: PointerEvent) {
  const h = held.get(e.pointerId)
  if (!h || !box) return
  if (h.ch) {
    // MPE: around the key -- sideways a semitone per key's width, up and down the timbre
    const semis = (e.clientX - h.x0) / (box.width / size.value.keys)
    const bend = Math.max(-1, Math.min(1, semis / Math.max(1, board.master.mpeBendRange)))
    if (Math.abs(bend - h.bend) > 1 / 8192) board.screenMidi({ type: 'pitchBend', channel: h.ch, value: (h.bend = bend) })
    const t = timbreAt(e.clientY)
    if (Math.abs(t - h.timbre) >= 1 / 127) board.screenMidi({ type: 'cc', channel: h.ch, cc: 74, value: (h.timbre = t) })
  } else {
    // a slide from key to key
    const n = noteAt(e.clientX, e.clientY)
    if (n !== null && n !== h.note) {
      board.screenMidi({ type: 'noteOff', channel: 0, note: h.note })
      board.screenMidi({ type: 'noteOn', channel: 0, note: n, velocity: piano.value.velocity })
      h.note = n
    }
  }
  const p = penPressure(e)
  if (p && Math.abs(p - h.pressure) >= 1 / 127) board.screenMidi({ type: 'channelPressure', channel: h.ch, value: (h.pressure = p) })
}
const onUp = (e: PointerEvent) => stop(e.pointerId)

/** the mouse wheel on a held key: its aftertouch (up presses harder) */
function onWheel(e: WheelEvent) {
  box = keysEl.value!.getBoundingClientRect()
  const n = noteAt(e.clientX, e.clientY)
  const h = [...held.values()].find((x) => x.note === n) ?? (held.size === 1 ? [...held.values()][0] : undefined)
  if (!h) return
  e.preventDefault()
  const p = Math.min(1, Math.max(0, h.pressure - e.deltaY / 400))
  if (p !== h.pressure) board.screenMidi({ type: 'channelPressure', channel: h.ch, value: (h.pressure = p) })
}

// ── the wheels: PITCH springs back to the middle; MOD and EXPR stay where they're left ──
const expr = ref(1)
type Wheel = 'pitch' | 'mod' | 'expr'
const wheelValue = (w: Wheel) => (w === 'pitch' ? (board.perform.bend + 1) / 2 : w === 'mod' ? board.perform.mod : expr.value)
function setWheel(w: Wheel, v: number) {
  if (w === 'pitch') board.screenMidi({ type: 'pitchBend', channel: 0, value: v * 2 - 1 })
  else if (w === 'mod') board.screenMidi({ type: 'cc', channel: 0, cc: 1, value: v })
  else board.screenMidi({ type: 'cc', channel: 0, cc: 11, value: (expr.value = v) })
}
let wheelBox: DOMRect | null = null
const wheelAt = (e: PointerEvent) => Math.min(1, Math.max(0, 1 - (e.clientY - wheelBox!.top) / wheelBox!.height))
function wheelDown(w: Wheel, e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  wheelBox = el.getBoundingClientRect()
  setWheel(w, wheelAt(e))
}
function wheelMove(w: Wheel, e: PointerEvent) {
  if (wheelBox && (e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) setWheel(w, wheelAt(e))
}
function wheelUp(w: Wheel) {
  wheelBox = null
  if (w === 'pitch') setWheel('pitch', 0.5)
}
const WHEELS: { id: Wheel; label: string; title: string; reset: number }[] = [
  { id: 'pitch', label: 'PB', title: 'Pitch bend: drag up or down; it springs back to the middle', reset: 0.5 },
  { id: 'mod', label: 'MOD', title: 'Mod wheel (CC1): stays where you leave it · double-click: 0', reset: 0 },
  { id: 'expr', label: 'EXP', title: 'Expression (CC11): the level of everything playing · double-click: full', reset: 1 },
]

// ── octave, size, velocity ──
const range = computed(() => `${midiNoteName(low.value)}–${midiNoteName(low.value + size.value.keys - 1)}`)
function octave(d: number) {
  const before = low.value
  piano.value.octave += d
  // (at the edge of MIDI's range it can't go further: the count stays where it took effect)
  if (low.value === before) piano.value.octave -= d
}
let velBox: DOMRect | null = null
function velDown(e: PointerEvent) {
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  velBox = el.getBoundingClientRect()
  velMove(e)
}
const velUp = () => (velBox = null)
function velMove(e: PointerEvent) {
  if (!velBox || !(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return
  piano.value.velocity = Math.round(Math.min(1, Math.max(1 / 127, (e.clientX - velBox.left) / velBox.width)) * 127) / 127
}

// closed with notes down, or with the expression turned down: nothing left hanging or muted
onBeforeUnmount(() => {
  for (const id of [...held.keys()]) stop(id)
  if (expr.value !== 1) board.screenMidi({ type: 'cc', channel: 0, cc: 11, value: 1 })
  if (board.perform.bend) board.screenMidi({ type: 'pitchBend', channel: 0, value: 0 })
})
</script>

<template>
  <div class="kbar" @contextmenu.prevent>
    <div class="wheels">
      <div
        v-for="w in WHEELS"
        :key="w.id"
        class="wheel"
        :class="w.id"
        :title="w.title"
        @pointerdown.prevent="wheelDown(w.id, $event)"
        @pointermove="wheelMove(w.id, $event)"
        @pointerup="wheelUp(w.id)"
        @pointercancel="wheelUp(w.id)"
        @dblclick="setWheel(w.id, w.reset)"
      >
        <i class="fill" :style="w.id === 'pitch' ? { bottom: `${Math.min(50, wheelValue(w.id) * 100)}%`, height: `${Math.abs(wheelValue(w.id) - 0.5) * 100}%` } : { height: `${wheelValue(w.id) * 100}%` }" />
        <i class="cap" :style="{ bottom: `${wheelValue(w.id) * 100}%` }" />
        <span>{{ w.label }}</span>
      </div>
    </div>
    <div class="side">
      <div class="row">
        <button class="kb-btn" title="Down an octave" @click="octave(-1)">−</button>
        <span class="oct" :title="`Octave ${piano.octave > 0 ? '+' : ''}${piano.octave}: ${range}`">{{ piano.octave > 0 ? '+' : '' }}{{ piano.octave }}</span>
        <button class="kb-btn" title="Up an octave" @click="octave(1)">+</button>
      </div>
      <div class="row">
        <v-menu location="top start">
          <template #activator="{ props: act }">
            <button class="kb-btn wide" v-bind="act" :title="`${piano.keys} keys (${range}): click for another size`">{{ piano.keys }}</button>
          </template>
          <div class="size-menu">
            <span>KEYS</span>
            <button v-for="s in PIANO_SIZES" :key="s.keys" :class="{ on: s.keys === piano.keys }" @click="piano.keys = s.keys">{{ s.keys }}</button>
          </div>
        </v-menu>
        <button
          class="kb-btn wide"
          :class="{ on: mpe }"
          :title="mpe ? 'MPE on: drag around a held key to bend it (sideways) and change its timbre (up and down) · click: off' : 'MPE off: dragging slides from key to key · click: on, for per-note bends and timbre'"
          @click="board.master.mpe = !board.master.mpe"
        >
          MPE
        </button>
      </div>
      <div
        class="vel"
        :title="`Velocity, every note: ${Math.round(piano.velocity * 127)} — drag`"
        @pointerdown.prevent="velDown"
        @pointermove="velMove"
        @pointerup="velUp"
      >
        <i :style="{ width: `${piano.velocity * 100}%` }" />
        <span>VEL {{ Math.round(piano.velocity * 127) }}</span>
      </div>
    </div>
    <div
      ref="keysEl"
      class="keys"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @lostpointercapture="onUp"
      @wheel="onWheel"
    >
      <i
        v-for="k in keys"
        :key="k.n"
        class="key"
        :class="{ black: k.black, down: down.has(k.n), c: k.n % 12 === 0 }"
        :style="{ left: `${k.x * 100}%`, width: `${k.w * 100}%` }"
        ><b v-if="k.n % 12 === 0 && !k.black">{{ midiNoteName(k.n) }}</b></i
      >
    </div>
  </div>
</template>

<style scoped>
.kbar {
  --kb-h: 64px;
  position: relative;
  z-index: 2500;
  flex: 0 0 auto;
  display: flex;
  gap: 6px;
  height: var(--kb-h);
  padding: 4px 8px 5px;
  background: linear-gradient(180deg, var(--panel-hi), var(--panel-lo));
  border-top: 2px solid #000;
  border-left: 14px solid var(--wood);
  border-right: 14px solid var(--wood);
  user-select: none;
  touch-action: none;
}
.wheels {
  display: flex;
  gap: 4px;
}
.wheel {
  position: relative;
  width: 22px;
  border-radius: 4px;
  background: linear-gradient(90deg, #050505, #1c1c1c 50%, #050505);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  cursor: ns-resize;
  overflow: hidden;
  touch-action: none;
}
.wheel .fill {
  position: absolute;
  left: 3px;
  right: 3px;
  bottom: 0;
  background: color-mix(in srgb, var(--c-primary) 45%, transparent);
  border-radius: 2px;
}
.wheel.pitch::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: rgba(255, 255, 255, 0.25);
}
.wheel .cap {
  position: absolute;
  left: 1px;
  right: 1px;
  height: 6px;
  margin-bottom: -3px;
  border-radius: 2px;
  background: linear-gradient(180deg, #eee, #888);
  box-shadow: 0 1px 2px #000;
}
.wheel span {
  position: absolute;
  left: 0;
  right: 0;
  top: 2px;
  text-align: center;
  font-size: 7px;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.55);
  pointer-events: none;
}
.side {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 70px;
}
.row {
  display: flex;
  align-items: center;
  gap: 2px;
}
.kb-btn {
  flex: 0 0 auto;
  height: 16px;
  min-width: 16px;
  padding: 0 3px;
  font-size: 10px;
  line-height: 14px;
  color: var(--ink, #ddd);
  background: linear-gradient(180deg, #3a3a3a, #1d1d1d);
  border: 1px solid #000;
  border-radius: 3px;
}
.kb-btn.wide {
  flex: 1 1 0;
}
.kb-btn.on {
  color: #000;
  background: rgb(var(--v-theme-primary));
}
.oct {
  flex: 1 1 0;
  text-align: center;
  font-size: 10px;
  color: rgb(var(--v-theme-primary));
}
.vel {
  position: relative;
  height: 14px;
  border-radius: 3px;
  background: #080808;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  cursor: ew-resize;
  overflow: hidden;
  touch-action: none;
}
.vel i {
  position: absolute;
  inset: 0 auto 0 0;
  background: color-mix(in srgb, var(--c-accent) 50%, transparent);
}
.vel span {
  position: relative;
  display: block;
  text-align: center;
  font-size: 8px;
  line-height: 14px;
  color: rgba(255, 255, 255, 0.8);
}
.size-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  background: var(--panel-mid, #222);
  border: 1px solid #000;
  border-radius: 4px;
}
.size-menu span {
  font-size: 9px;
  opacity: 0.6;
}
.size-menu button {
  padding: 2px 10px;
  font-size: 11px;
  text-align: left;
  border-radius: 3px;
}
.size-menu button.on {
  color: #000;
  background: rgb(var(--v-theme-primary));
}
.keys {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  touch-action: none;
  cursor: pointer;
}
.key {
  position: absolute;
  top: 0;
  bottom: 0;
  box-sizing: border-box;
  border: 1px solid #111;
  border-top: 0;
  border-radius: 0 0 3px 3px;
  background: linear-gradient(180deg, #cfcabe, #f4f0e6 30%, #fffdf6);
}
.key.down {
  background: linear-gradient(180deg, #b9b3a6, color-mix(in srgb, var(--c-primary) 55%, #fff));
}
.key.black {
  z-index: 1;
  bottom: 40%;
  border: 1px solid #000;
  background: linear-gradient(180deg, #000, #2a2a2a 85%, #3a3a3a);
  box-shadow: 0 2px 2px rgba(0, 0, 0, 0.6);
}
.key.black.down {
  background: linear-gradient(180deg, #000, color-mix(in srgb, var(--c-primary) 70%, #000));
}
.key b {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 2px;
  text-align: center;
  font-size: 7px;
  font-weight: normal;
  color: #777;
  pointer-events: none;
}
</style>
