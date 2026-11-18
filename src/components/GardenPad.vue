<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as engine from '../audio/engine'
import { useBoard } from '../stores/board'
import { useGarden } from '../stores/garden'
import { RING_COLORS, ringPoint, setRingPoint, type Ring } from '../lib/garden/garden'
import { drawRings } from '../lib/garden/drawRings'
import { crosshair, type Colors } from '../lib/play/draw'
import type { Point } from '../lib/play/pads'
import PlayPad from './PlayPad.vue'
import GardenSettings from './GardenSettings.vue'

/**
 * The PLAY view's GARDEN pad: VCO `slot`'s prompt garden as its rings (lib/garden/drawRings.ts), and the ring picked
 * on X / Y -- left / right its STEPS (1 to 32), up / down its HITS (none to every step). A double-click picks the next
 * ring. Behind ⚙ the rest: the prompt its words grow from (the word model lists words of each ring's kind for it), the
 * rings themselves, BACK, REUSE, the seed, and how far the pads that grow step at once.
 */
const props = defineProps<{ slot: number; colors: Colors }>()
const board = useBoard()
const garden = useGarden()

const slotOf = () => board.selectedPatch?.slots[props.slot] ?? null
// (made the first time it's shown: an older patch's is filled out)
watch(() => [props.slot, slotOf()], () => void garden.gardenOf(props.slot), { immediate: true })
const g = computed(() => slotOf()?.garden ?? null)
const run = computed(() => {
  const x = slotOf()
  return x ? garden.runs.get(x.layer.id) : undefined
})

/** the ring on the pad (the store's: the ship's rings move the same one) */
const ring = computed<Ring | null>(() => garden.ringOf(props.slot))
const colorOf = (r: Ring) => RING_COLORS[(g.value?.rings.indexOf(r) ?? 0) % RING_COLORS.length]

// ── X / Y: the ring's steps and hits ──
const pointOf = (r: Ring | null): Point => (r ? ringPoint(r) : { x: 0.5, y: 0.5 })
function moved(p: Point) {
  if (!ring.value) return
  setRingPoint(ring.value, p)
  kick()
}
/** double-click: the next ring */
function nextRing() {
  garden.nextRing(props.slot)
  kick()
}

// ── drawing: a frame loop while it grows or sounds, else once whenever what it shows changes ──
type PadRef = { paint(): void; el(): HTMLElement | undefined } | undefined
const pad = ref<PadRef>()
let level = 0
let lastStitches = -1
let stitchAt = -Infinity
function draw(c: CanvasRenderingContext2D, w: number, h: number, dpr: number) {
  const v = g.value
  if (!v) return
  const now = performance.now()
  drawRings(c, w, h, {
    garden: v,
    progress: run.value?.progress ?? 0,
    level,
    sinceStitch: (now - stitchAt) / 1000,
    selected: ring.value?.id ?? null,
    line: props.colors.line,
    dpr,
    now,
  })
  crosshair(c, w, h, pointOf(ring.value), { line: ring.value ? colorOf(ring.value) : props.colors.line, cross: props.colors.cross }, dpr)
}
let raf = 0
let shown = ''
function looks(): string {
  const v = g.value
  if (!v) return ''
  const r = run.value
  const lv = engine.levels.value
  level += (Math.max(lv[0], lv[1]) - level) * 0.2
  const live = v.on || level > 0.01 || performance.now() - stitchAt < 1000
  return live
    ? `${performance.now()}`
    : `${v.step}|${ring.value?.id}|${props.colors.line}|${r?.progress ?? 0}|${v.rings.map((x) => `${x.id}${x.k}/${x.n}/${x.rot}${x.off}${x.locked}${x.lockWord}${x.drop}${x.move}${x.words.join()}`).join(';')}`
}
function tick() {
  raf = 0
  const st = run.value?.stitches ?? 0
  if (st !== lastStitches) {
    if (lastStitches >= 0) stitchAt = performance.now()
    lastStitches = st
  }
  const k = looks()
  if (k !== shown) {
    shown = k
    pad.value?.paint()
  }
  if (visible && (g.value?.on || level > 0.01 || performance.now() - stitchAt < 1000)) raf = requestAnimationFrame(tick)
}
function kick() {
  if (!raf && visible) raf = requestAnimationFrame(tick)
}
let visible = true
let io: IntersectionObserver | undefined
onMounted(() => {
  io = new IntersectionObserver((es) => {
    visible = es.some((x) => x.isIntersecting)
    kick()
  })
  const el = pad.value?.el()
  if (el) io.observe(el)
  kick()
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  io?.disconnect()
})
watch(() => [g.value?.on, g.value?.step, board.changes, engine.activeVoices.value.length, props.colors.line, ring.value?.id], kick)

const label = computed(() => (ring.value ? `GARDEN ${ring.value.k}/${ring.value.n}` : 'GARDEN'))
</script>

<template>
  <PlayPad
    v-if="g"
    ref="pad"
    :label="label"
    title="GARDEN — this VCO's prompt garden, its rings of words. The bright ring is on the pad: left / right its STEPS (1 to 32), up / down its HITS. Double-click: the next ring. ⚙: the prompt its words grow from, and the rest of the rings"
    :color="colors.line"
    :draw="draw"
    menu-settings
    @move="moved"
    @reset="nextRing"
  >
    <template #settings>
      <GardenSettings :slot="slot" />
    </template>
  </PlayPad>
</template>
