<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { shaderPrefs, Stage, STAGE_RES, stageStatus, stageVcos } from '../lib/play/shaders'

/**
 * The shader stage (lib/play/shaders.ts): one WebGL2 canvas behind the rack's whole PLAY area. It ignores the pointer;
 * the pads above it take it. Runs a frame loop while SHADERS is on and it can be seen.
 */
const canvas = ref<HTMLCanvasElement>()
let stage: Stage | null = null
let raf = 0
let seen = true
let ro: ResizeObserver | undefined
let io: IntersectionObserver | undefined

function size() {
  const c = canvas.value
  if (!c) return
  const box = c.getBoundingClientRect()
  // at least a pixel per CSS pixel; half the screen's resolution on a dense one
  const k = Math.max(1, (window.devicePixelRatio || 1) * STAGE_RES)
  const w = Math.max(1, Math.round(box.width * k))
  const h = Math.max(1, Math.round(box.height * k))
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
}
const running = () => shaderPrefs.on && !!stage && seen && document.visibilityState === 'visible'
function loop(now: number) {
  raf = 0
  if (!running()) return
  try {
    stage!.frame(now)
  } catch (e) {
    console.warn('[play stage]', e)
  }
  if (stage?.lost) {
    stageStatus.available = false
    return
  }
  raf = requestAnimationFrame(loop)
}
function kick() {
  if (!raf && running()) raf = requestAnimationFrame(loop)
  else if (!shaderPrefs.on) stage?.clear()
}
const onVisibility = () => kick()

onMounted(() => {
  const c = canvas.value!
  size()
  try {
    stage = Stage.create(c)
  } catch (e) {
    console.warn('[play stage]', e)
    stage = null
  }
  stageStatus.available = !!stage
  ro = new ResizeObserver(() => size())
  ro.observe(c)
  io = new IntersectionObserver((es) => {
    seen = es.some((x) => x.isIntersecting)
    kick()
  })
  io.observe(c)
  document.addEventListener('visibilitychange', onVisibility)
  kick()
})
watch(() => shaderPrefs.on, kick)
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  raf = 0
  ro?.disconnect()
  io?.disconnect()
  document.removeEventListener('visibilitychange', onVisibility)
  stage = null
})
defineExpose({ count: () => stageVcos.size })
</script>

<template>
  <canvas ref="canvas" class="stage" :class="{ off: !shaderPrefs.on || !stageStatus.available }" aria-hidden="true" />
</template>

<style scoped>
.stage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  border-radius: inherit;
}
.stage.off {
  visibility: hidden;
}
</style>
