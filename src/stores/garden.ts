import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { useBoard } from './board'
import { useAi } from '../lib/ai/store'
import * as engine from '../audio/engine'
import { makeSound, soundAgentFrom } from '../lib/ai/soundTools'
import { soundModelsAvailable } from '../lib/ai/soundHost'
import { errorMessage } from '../lib/ai/types'
import { sketchClip } from '../lib/garden/sketch'
import {
  captionSeed, DEFAULT_GARDEN_MODEL, gardenTick, migrateGarden, planNext, pushTake, takesToDrop, TAKES_KEPT, type Garden, type GardenTake,
} from '../lib/garden/garden'
import { addTags, isTake, removeTags, TAKE_TAG } from '../lib/tags'
import type { PatchSlot } from '../types'

/** the garden's model id for the stand-in synth (lib/garden/sketch.ts) */
export const SKETCH_MODEL = 'sketch'
const TICK_MS = 200
/** after a failed clip, before the next try */
const COOL_MS = 8000

/** A growing VCO's state as it runs (not saved: the garden itself is the patch slot's, `PatchSlot.garden`). */
export interface GardenRun {
  status: 'off' | 'waiting' | 'growing' | 'ready' | 'error'
  /** seconds the clip playing has sounded */
  heard: number
  /** it has sounded since the garden came on */
  started: boolean
  /** the OFFSET already taken off `heard`, loops */
  offsetUsed: number
  /** 0..1 of the way to the next stitch */
  progress: number
  /** 0..1 of the way through making the clip being made (an estimate: the model says nothing until it's done) */
  genProgress: number
  /** when the clip being made was started (performance.now), and how long it should take (s) */
  genStart: number
  genExpect: number
  /** the clip to stitch in next */
  next: { soundId: string; prompt: string; step: number; again: boolean; seed?: number; model?: string } | null
  /** the caption being made */
  growing: string
  /** the last clip's model and time, or what went wrong */
  note: string
  coolUntil: number
  /** performance.now() the last stitch's crossfade is through */
  fadeUntil: number
  /** the game's catch: the next caption's words, once */
  catch: string[]
  /** GROW NOW asked for it: in as soon as it's made, not after its loops */
  rush?: boolean
  /** stitches so far (the rings flash on each) */
  stitches: number
}

const newRun = (): GardenRun => ({
  status: 'off', heard: 0, started: false, offsetUsed: 0, progress: 0, genProgress: 0, genStart: 0, genExpect: 1, next: null, growing: '', note: '', coolUntil: 0, fadeUntil: 0, catch: [], stitches: 0,
})

/** a short sound name from a caption: WARM GLASS BELLS */
const takeName = (prompt: string) => prompt.split(',')[0]!.trim().slice(0, 24).toUpperCase() || 'TAKE'

/**
 * The PROMPT GARDEN running (lib/garden/garden.ts is the model): for each VCO of the selected patch whose garden is on,
 * a tick five times a second counts how long its clip has sounded, has the next clip made (the sound model in the app
 * and plugin, one at a time across VCOs; SKETCH, a little synth, anywhere) as soon as there's none, and after LOOPS
 * passes stitches it in -- the slot's layer plays the new sound, the engines crossfade it into the sounding voices at
 * their next loop boundary (engine.stitch here, Engine.cpp's adopt in the plugin).
 */
export const useGarden = defineStore('garden', () => {
  const board = useBoard()
  const ai = useAi()
  const agent = soundAgentFrom(() => ai.settings.sound)
  /** by layer id */
  const runs = reactive(new Map<string, GardenRun>())
  /** the layer whose clip is being made (the model makes one at a time) */
  const making = ref<string | null>(null)
  let abort: AbortController | null = null

  const slotOf = (i: number): PatchSlot | null => board.selectedPatch?.slots[i] ?? null
  function runOf(layerId: string): GardenRun {
    let r = runs.get(layerId)
    if (!r) runs.set(layerId, (r = newRun()))
    return runs.get(layerId)!
  }
  /** slot `i`'s garden, made (off) the first time it's asked for */
  function gardenOf(i: number): Garden | null {
    const slot = slotOf(i)
    if (!slot) return null
    if (!slot.garden) slot.garden = migrateGarden(null)
    return slot.garden
  }
  const runFor = (i: number) => {
    const slot = slotOf(i)
    return slot ? runOf(slot.layer.id) : null
  }

  /** On / off. Coming on, the clip there now is the garden's first take (BACK can return to it). */
  function setOn(i: number, on: boolean) {
    const slot = slotOf(i)
    const g = gardenOf(i)
    if (!slot || !g) return
    g.on = on
    const run = runOf(slot.layer.id)
    if (on) {
      run.status = 'waiting'
      // counted afresh, OFFSET with it
      run.heard = 0
      run.offsetUsed = 0
      if (!g.history.some((t) => t.soundId === slot.layer.soundId))
        pushTake(g, { soundId: slot.layer.soundId, prompt: board.byId(slot.layer.soundId)?.settings.name ?? 'the seed', step: g.step, at: Date.now() })
    } else {
      run.status = 'off'
      if (making.value === slot.layer.id) abort?.abort()
    }
  }

  /** Make (or pick) the next clip for slot `i`. */
  async function prepare(slot: PatchSlot, g: Garden, run: GardenRun) {
    const layerId = slot.layer.id
    const override = run.catch.length ? [...run.catch] : undefined
    const plan = planNext(g, (id) => !!board.byId(id), override)
    run.catch = []
    if (plan.kind === 'again') {
      run.next = { soundId: plan.take.soundId, prompt: plan.prompt, step: plan.step, again: true }
      run.status = 'ready'
      run.note = 'coming back round'
      return
    }
    making.value = layerId
    run.status = 'growing'
    run.growing = plan.prompt
    const ctl = new AbortController()
    abort = ctl
    const started = performance.now()
    const sketch = g.model === SKETCH_MODEL || !soundModelsAvailable()
    const key = `${sketch ? SKETCH_MODEL : g.model || DEFAULT_GARDEN_MODEL}|${plan.seconds}`
    run.genStart = started
    run.genExpect = took.get(key) ?? (sketch ? 0.3 : 6 + plan.seconds * 0.6)
    run.genProgress = 0
    try {
      let soundId: string
      if (sketch) {
        const rate = 44100
        const snd = await board.addAgentSound(sketchClip(plan.prompt, plan.seconds, rate), rate, { name: takeName(plan.prompt), tags: ['garden', 'sketch', TAKE_TAG], rootNote: 60, fine: 0 })
        soundId = snd.id
        run.note = `SKETCH · ${((performance.now() - started) / 1000).toFixed(1)} s`
      } else {
        const made = await makeSound(
          board,
          agent,
          { prompt: plan.prompt, negative_prompt: g.negative || undefined, seconds: plan.seconds, model: g.model || DEFAULT_GARDEN_MODEL, seed: plan.seed, name: takeName(plan.prompt), tags: `garden, ${TAKE_TAG}` },
          ctl.signal,
          { requireDownloaded: true },
        )
        soundId = made.snd.id
        run.note = `${made.model.label} · ${made.elapsed} s`
      }
      if (ctl.signal.aborted) return board.dropTakes([soundId])
      // how long it took, for the next one's estimate (a running average)
      const secs = (performance.now() - started) / 1000
      took.set(key, took.has(key) ? took.get(key)! * 0.6 + secs * 0.4 : secs)
      run.genProgress = 1
      run.next = { soundId, prompt: plan.prompt, step: plan.step, again: false, seed: plan.seed, model: sketch ? SKETCH_MODEL : g.model || DEFAULT_GARDEN_MODEL }
      if (run.rush) {
        run.rush = false
        run.status = 'ready'
        const s = slotOf(board.selectedPatch?.slots.indexOf(slot) ?? -1)
        if (s === slot && performance.now() >= run.fadeUntil) return stitch(slot, g, run)
      }
      run.status = 'ready'
    } catch (e) {
      if (ctl.signal.aborted) {
        run.status = g.on ? 'waiting' : 'off'
        return
      }
      run.status = 'error'
      run.note = errorMessage(e)
      run.coolUntil = Date.now() + COOL_MS
    } finally {
      if (making.value === layerId) making.value = null
      if (abort === ctl) abort = null
    }
  }

  /** The next clip into slot `slot` now: its layer plays it, the engines stitch it into what's sounding. */
  function stitch(slot: PatchSlot, g: Garden, run: GardenRun) {
    const next = run.next
    if (!next) return
    run.next = null
    const src = board.byId(next.soundId)
    if (!src) {
      run.status = 'waiting'
      return
    }
    slot.layer.soundId = next.soundId
    // a garden's clips are samples: a VCO that played a wavetable plays them through, not cycle by cycle
    if (slot.layer.settings.wtSize) slot.layer.settings.wtSize = 0
    // the page's engine; the plugin's stitches as the layer arrives with its new audio (engineSync's `stitch`)
    engine.stitch(slot.layer.id, src.audioId, g.fade)
    pushTake(g, { soundId: next.soundId, prompt: next.prompt, step: next.step, at: Date.now(), ...(next.again ? { again: true } : {}) })
    if (!next.again) takeInfo.set(next.soundId, { seed: next.seed ?? captionSeed(g, next.prompt), model: next.model ?? (g.model || DEFAULT_GARDEN_MODEL) })
    prune(slot, g, run)
    run.heard = 0
    run.progress = 0
    // the engines wait up to a loop for the boundary, then fade: STITCH and ↺ wait for it all to pass
    run.fadeUntil = performance.now() + (g.fade > 0.5 ? g.fade + 4 : 0) * 1000
    run.stitches++
    run.status = 'waiting'
  }

  /** how long each model took to make a clip of each length (s), lately: the next one's progress is timed by it */
  const took = new Map<string, number>()

  let last = performance.now()
  function tick() {
    const now = performance.now()
    const dt = Math.min(1, (now - last) / 1000)
    last = now
    const p = board.selectedPatch
    if (!p) return
    const voices = engine.activeVoices.value
    p.slots.forEach((slot) => {
      const g = slot?.garden
      if (!slot || !g?.on) return
      const run = runOf(slot.layer.id)
      // making a clip: how far, by the clock (never quite there until it is), easing out as it passes the estimate
      if (run.status === 'growing') {
        const x = (now - run.genStart) / 1000 / Math.max(0.1, run.genExpect)
        run.genProgress = Math.min(0.97, x < 0.9 ? x : 0.9 + 0.07 * (1 - Math.exp(-(x - 0.9) * 3)))
      }
      const mine = voices.filter((v) => v.soundId === slot.layer.id)
      const cycle = mine.map((v) => v.voice.cycle).find((c) => Number.isFinite(c) && c > 0) ?? 0
      const out = gardenTick(
        { heard: run.heard, started: run.started, offsetUsed: run.offsetUsed },
        {
          dt,
          sounding: mine.length > 0,
          loopSec: cycle,
          loops: g.loops,
          offset: g.offset ?? 0,
          fade: g.fade,
          paused: !!g.paused,
          ready: !!run.next,
          busy: making.value !== null,
          coolingDown: Date.now() < run.coolUntil,
        },
      )
      run.heard = out.state.heard
      run.started = out.state.started
      run.offsetUsed = out.state.offsetUsed
      run.progress = out.progress
      if (out.prepare) void prepare(slot, g, run)
      else if (out.stitch) stitch(slot, g, run)
    })
  }
  setInterval(tick, TICK_MS)

  /** what made each take (its seed and model), for SAVE */
  const takeInfo = new Map<string, { seed: number; model: string }>()

  /**
   * Takes past the latest TAKES_KEPT let go: their audio leaves memory, storage and the plugin, so a garden can grow
   * for hours. What's playing, what's next and anything SAVEd stay; so does anything another VCO's garden still keeps.
   */
  function prune(slot: PatchSlot, g: Garden, run: GardenRun) {
    const keep = new Set<string>([slot.layer.soundId, ...(run.next ? [run.next.soundId] : [])])
    for (const x of board.selectedPatch?.slots ?? []) {
      if (!x?.garden || x === slot) continue
      for (const t of x.garden.history.slice(0, TAKES_KEPT)) keep.add(t.soundId)
      const r = runs.get(x.layer.id)
      if (r?.next) keep.add(r.next.soundId)
    }
    const drop = takesToDrop(g, keep)
    if (!drop.length) return
    board.dropTakes(drop)
    for (const id of drop) takeInfo.delete(id)
  }

  /**
   * SAVE: a take (the one playing, by default) into the samples for good, tagged `generated` (no longer a take that
   * goes when newer ones push it out), and what made it -- prompt, step, seed, model, VCO -- kept with the patch
   * (Garden.saved). False when there's nothing to save (an earlier sound, or saved already).
   */
  function saveTake(i: number, soundId?: string): boolean {
    const g = gardenOf(i)
    if (!g) return false
    const take = soundId ? g.history.find((t) => t.soundId === soundId) : g.history[0]
    const snd = take && board.byId(take.soundId)
    if (!take || !snd || !isTake(snd.settings.tag)) return false
    snd.settings.tag = addTags(removeTags(snd.settings.tag, [TAKE_TAG]), ['generated'])
    for (const t of g.history) if (t.soundId === take.soundId) t.saved = true
    const info = takeInfo.get(take.soundId)
    g.saved.push({
      soundId: take.soundId,
      prompt: take.prompt,
      step: take.step,
      seed: info?.seed ?? captionSeed(g, take.prompt),
      model: info?.model ?? (g.model || DEFAULT_GARDEN_MODEL),
      slot: i,
      at: Date.now(),
    })
    board.toast = `Saved "${snd.settings.name}" to the samples (generated)`
    return true
  }
  /** the take playing on VCO `i` can be SAVEd */
  function canSave(i: number): boolean {
    const t = slotOf(i)?.garden?.history[0]
    const snd = t && board.byId(t.soundId)
    return !!snd && isTake(snd.settings.tag)
  }

  /** GROW: make the next clip now, sounding or not */
  function growNow(i: number) {
    const slot = slotOf(i)
    const g = gardenOf(i)
    if (!slot || !g || making.value) return
    const run = runOf(slot.layer.id)
    run.started = true
    run.coolUntil = 0
    if (!run.next) void prepare(slot, g, run)
  }
  /** STITCH: the next clip in now, without waiting for its loops */
  function stitchNow(i: number) {
    const slot = slotOf(i)
    const g = gardenOf(i)
    const run = slot && runOf(slot.layer.id)
    if (slot && g && run && performance.now() >= run.fadeUntil) stitch(slot, g, run)
  }
  /**
   * GROW NOW (PLAY's ↻): a clip ready is stitched in at once; otherwise the next one is started now (unless one is
   * being made already), and goes in as soon as it's made.
   */
  function growNowAndStitch(i: number) {
    const slot = slotOf(i)
    const g = gardenOf(i)
    if (!slot || !g?.on) return
    const run = runOf(slot.layer.id)
    if (run.next) return stitchNow(i)
    run.rush = true
    growNow(i)
  }
  /** back to an earlier take, now */
  function goBack(i: number, t: GardenTake) {
    const slot = slotOf(i)
    const g = gardenOf(i)
    if (!slot || !g || !board.byId(t.soundId)) return
    const run = runOf(slot.layer.id)
    if (performance.now() < run.fadeUntil) return
    const pending = run.next
    run.next = { soundId: t.soundId, prompt: t.prompt, step: g.step, again: true }
    stitch(slot, g, run)
    // a clip that was waiting still comes next
    run.next = pending
    if (pending) run.status = 'ready'
  }
  /** the game's catch: the next caption is these words (with the chips and grids) */
  function plant(i: number, words: string[]) {
    const run = runFor(i)
    if (!run) return
    run.catch = words.filter(Boolean)
    // a clip already made goes after this one: drop it, the catch is grown next
    if (run.next && !run.next.again) {
      board.dropTakes([run.next.soundId])
      run.next = null
    }
    if (run.status === 'ready') run.status = 'waiting'
  }
  function stop() {
    abort?.abort()
  }

  return { runs, making, runFor, gardenOf, setOn, growNow, growNowAndStitch, stitchNow, goBack, plant, stop, tick, saveTake, canSave }
})
