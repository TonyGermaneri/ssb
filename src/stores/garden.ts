import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'
import { useBoard } from './board'
import { useAi } from '../lib/ai/store'
import * as engine from '../audio/engine'
import { makeSound, soundAgentFrom } from '../lib/ai/soundTools'
import { soundModelsAvailable } from '../lib/ai/soundHost'
import { soundModelFrom } from '../lib/ai/soundModels'
import { VCO_SUNG_SECONDS } from '../lib/ai/soundTools'
import { errorMessage } from '../lib/ai/types'
import { sketchAsync } from '../lib/analysis'
import {
  captionSeed, CLIP_SECONDS, DEFAULT_GARDEN_MODEL, gardenTick, MIN_SWAP_S, padMoveDelay, padTarget, migrateGarden, planNext, pushTake, takesToDrop, TAKES_KEPT, type Garden, type GardenTake,
} from '../lib/garden/garden'
import { addTags, isTake, removeTags, TAKE_TAG } from '../lib/tags'
import { padControl, type PadControl, type PadId } from '../lib/play/padControl'
import type { Point } from '../lib/play/pads'
import { defaultPadLfo, LAST_SHAPE, lfoAt, rateHz, snapShape, type PadLfo } from '../lib/play/padLfo'
import type { PatchSlot } from '../types'
import { negativeFor } from '../lib/garden/negative'
import { captionFor, checkWordModel, lyricsFor, riffAvailable, riffState, wordsFor } from '../lib/garden/riff'
import { asVerse } from '../lib/garden/lyricsText'

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
  /** GROW NOW asked for it: in as soon as it's made, not after its loops */
  rush?: boolean
  /** stitches so far (the rings flash on each) */
  stitches: number
  /** the clip's loop, s, as last heard */
  loopSec: number
  /** the pads' next move (PadGrowth): when it starts (performance.now), for which step; 0 none */
  padAt: number
  padStep: number
  /** the pads' move under way: from where to where, over how long */
  padTween: { start: number; dur: number; from: Record<string, Point>; to: Record<string, Point> } | null
}

const newRun = (): GardenRun => ({
  loopSec: 0, padAt: 0, padStep: 0, padTween: null,
  status: 'off', heard: 0, started: false, offsetUsed: 0, progress: 0, genProgress: 0, genStart: 0, genExpect: 1, next: null, growing: '', note: '', coolUntil: 0, fadeUntil: 0, stitches: 0,
})

/** the words a singing model sings for a caption with no word model to write them: its phrase, and each part after it, a line each */
export const sungLines = (prompt: string) => asVerse(prompt.split(',').map((x) => x.trim()).filter(Boolean))

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
  /** a slot's index in the patch (-1: not in it) */
  const slotIndex = (slot: PatchSlot) => board.selectedPatch?.slots.indexOf(slot) ?? -1
  /** by slot: the ring the GARDEN pad (and the ship's rings) moves -- its id */
  const picked = reactive(new Map<number, string>())
  /** VCO `i`'s ring on the pad: the one picked, else its first */
  function ringOf(i: number) {
    const g = slotOf(i)?.garden
    return g?.rings.find((r) => r.id === picked.get(i)) ?? g?.rings[0] ?? null
  }
  /** the next ring onto the pad (a double-click) */
  function nextRing(i: number) {
    const rs = slotOf(i)?.garden?.rings ?? []
    if (!rs.length) return
    const at = rs.findIndex((r) => r.id === ringOf(i)?.id)
    picked.set(i, rs[(at + 1) % rs.length].id)
  }
  /** by layer id: the words last sung (for ☰'s lyrics) */
  const sang = reactive(new Map<string, string>())
  /**
   * What a singing model sings for `prompt` on VCO `i`: its garden's OWN WORDS when ☰'s advanced mode gives them, else
   * the word model's lines about the prompt, else the prompt's own words.
   */
  async function sungLyrics(i: number, prompt: string): Promise<string> {
    const g = slotOf(i)?.garden
    const own = g?.ownLyrics ? g.lyrics.trim() : ''
    const words = own || (await lyricsFor(prompt).catch(() => null).then((l) => (l ? asVerse(l) : ''))) || sungLines(prompt)
    const id = slotOf(i)?.layer.id
    if (id) sang.set(id, words)
    return words
  }
  /** by slot: the word model listing words for the rings, ring kinds still to come (0: done) */
  const wording = reactive(new Map<number, { left: number; prompt: string; note: string }>())
  function runOf(layerId: string): GardenRun {
    let r = runs.get(layerId)
    if (!r) runs.set(layerId, (r = newRun()))
    return runs.get(layerId)!
  }
  /** slot `i`'s garden, made (off) the first time it's asked for */
  function gardenOf(i: number): Garden | null {
    const slot = slotOf(i)
    if (!slot) return null
    // made (off) the first time; one from an older SSB (a draft or a host session put back as it was saved) given what
    // it lacks -- the dialog reads every field
    if (!slot.garden || !slot.garden.pads || !Array.isArray(slot.garden.pads.pads) || typeof slot.garden.subject !== 'string') slot.garden = migrateGarden(slot.garden)
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
    const plan = planNext(g, (id) => !!board.byId(id))
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
    // a model that sings (ACE-Step) sings the rings' words, given room for the line
    const sung = !sketch && !!soundModelFrom(g.model || DEFAULT_GARDEN_MODEL)?.lyrics
    const seconds = sung ? Math.max(plan.seconds, VCO_SUNG_SECONDS) : plan.seconds
    const key = `${sketch ? SKETCH_MODEL : g.model || DEFAULT_GARDEN_MODEL}|${seconds}`
    run.genStart = started
    const page = !sketch && !!soundModelFrom(g.model || DEFAULT_GARDEN_MODEL)?.page
    run.genExpect = took.get(key) ?? (sketch ? 0.3 : sung ? 8 + seconds * 2 : page ? 2 + seconds * 4 : 6 + seconds * 0.6)
    run.genProgress = 0
    try {
      let soundId: string
      if (sketch) {
        const rate = 44100
        const snd = await board.addAgentSound(await sketchAsync(plan.prompt, plan.seconds, rate), rate, { name: takeName(plan.prompt), tags: ['garden', 'sketch', TAKE_TAG], rootNote: 60, fine: 0 })
        soundId = snd.id
        run.note = `SKETCH · ${((performance.now() - started) / 1000).toFixed(1)} s`
      } else {
        const made = await makeSound(
          board,
          agent,
          {
            prompt: plan.prompt,
            // (a sung clip is a voice by definition: AVOID's "vocals, speech" let go for it)
            negative_prompt: negativeFor(g.negative, sung ? `${plan.prompt}, singing` : plan.prompt) || undefined,
            seconds,
            model: g.model || DEFAULT_GARDEN_MODEL,
            seed: plan.seed,
            name: takeName(plan.prompt),
            tags: `garden, ${TAKE_TAG}`,
            ...(sung ? { lyrics: await sungLyrics(board.selectedPatch?.slots.indexOf(slot) ?? -1, plan.prompt) } : {}),
          },
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
    // the pads grow with it: their move starts OFFSET loops on (wrapped before the next stitch), gliding over XFADE
    if (g.pads?.pads.length) {
      const cycle = Math.max(MIN_SWAP_S, g.fade + 0.5, g.loops * run.loopSec)
      run.padAt = performance.now() + padMoveDelay(g.offset ?? 0, run.loopSec, cycle) * 1000
      run.padStep = next.step
    }
  }

  // ── the pads growing (PadGrowth): moves scheduled at each stitch, glided a frame at a time ──
  /** each growing VCO's pads, as controls (lib/play/padControl.ts: the very writes the PLAY view's pads make) */
  const padControls = new Map<string, PadControl>()
  function padsOf(slot: PatchSlot): PadControl | null {
    if (!board.layerSound(slot.layer)) return null
    let c = padControls.get(slot.layer.id)
    if (!c) {
      // (looked up each time: a patch reloaded or reverted brings new layer objects under the same id)
      const id = slot.layer.id
      const layerNow = () => board.selectedPatch?.slots.find((x) => x?.layer.id === id)?.layer ?? slot.layer
      c = padControl({ sound: () => board.layerSound(layerNow())!, bpm: () => board.bpm })
      padControls.set(id, c)
    }
    return c
  }
  /** a move due: from where each pad is now to where the garden's seed and step send it */
  function startPadMove(slot: PatchSlot, g: Garden, run: GardenRun, now: number) {
    run.padAt = 0
    const c = padsOf(slot)
    if (!c) return
    const from: Record<string, Point> = {}
    const to: Record<string, Point> = {}
    for (const id of g.pads.pads) {
      const pad = id as PadId
      // (a pad its LFO moves: the garden walks the shape's centre)
      const l = lfoOf(slotIndex(slot), pad)
      from[pad] = l ? { x: l.cx, y: l.cy } : c.pointOf(pad)
      to[pad] = padTarget(g.seed, run.padStep, pad, from[pad], g.pads.amount)
    }
    run.padTween = { start: now, dur: Math.max(0.05, g.fade) * 1000, from, to }
    if (!padFrame) padFrame = requestAnimationFrame(glidePads)
  }
  let padFrame = 0
  let padWritten = 0
  /** the moves under way, a step along (30 times a second: each write is a patch edit the engines hear) */
  function glidePads(now: number) {
    padFrame = 0
    const p = board.selectedPatch
    let any = false
    if (p && now - padWritten >= 33) {
      padWritten = now
      for (const slot of p.slots) {
        if (!slot) continue
        const run = runs.get(slot.layer.id)
        const tw = run?.padTween
        if (!run || !tw) continue
        const c = padsOf(slot)
        const k = Math.min(1, (now - tw.start) / tw.dur)
        const e = k * k * (3 - 2 * k)
        if (c)
          for (const id of Object.keys(tw.to)) {
            const a = tw.from[id]
            const b = tw.to[id]
            const at = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e }
            const i = slotIndex(slot)
            if (lfoDrives(i, id as PadId)) setLfoCenter(i, id as PadId, at)
            else c.write(id as PadId, at)
          }
        if (k >= 1) run.padTween = null
        else any = true
      }
    } else any = !!p?.slots.some((x) => x && runs.get(x.layer.id)?.padTween)
    if (any) padFrame = requestAnimationFrame(glidePads)
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
      if (cycle > 0) run.loopSec = cycle
      if (run.padAt && now >= run.padAt) startPadMove(slot, g, run, now)
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
  /**
   * A prompt typed for VCO `i` (its wave prompt, or the garden pad's): the word model lists words of each ring's kind
   * for it, and they become the rings' words as each list comes (a locked ring keeps its own). A clip already made from
   * the old words is let go. False when there's no word model to ask (AI settings › WORD MODEL).
   */
  async function seedWords(i: number, text: string): Promise<boolean> {
    const g = gardenOf(i)
    const prompt = text.trim()
    if (!g || !prompt) return false
    // (whether it's downloaded isn't known until asked, the first time)
    if (riffState.on && riffState.downloaded === null) await checkWordModel().catch(() => false)
    if (!riffAvailable()) {
      wording.set(i, { left: 0, prompt, note: 'no word model: download one in AI settings › WORD MODEL' })
      return false
    }
    g.subject = prompt
    const kinds = [...new Set(g.rings.filter((r) => !r.locked).map((r) => r.kind))]
    wording.set(i, { left: kinds.length, prompt, note: '' })
    // (the map's own, reactive: what's compared below and counted down)
    const state = wording.get(i)!
    let got = 0
    for (const kind of kinds) {
      const words = await wordsFor(prompt, kind).catch(() => [] as string[])
      // a newer prompt took over
      if (wording.get(i) !== state || g.subject !== prompt) return false
      state.left--
      if (!words.length) continue
      got++
      for (const r of g.rings) if (r.kind === kind && !r.locked) r.words = [...words]
      if (got === 1) dropNext(i)
    }
    state.note = got ? '' : 'the word model gave no words: try again, or another prompt'
    return got > 0
  }
  /**
   * VCO `i`'s sound model (☰ SOUND MODEL: its wave prompt's and its garden's): a clip made with the one before, still
   * waiting to go in, is let go, and one being made with it stopped -- the next is made with this one.
   */
  function setModel(i: number, id: string) {
    const slot = slotOf(i)
    const g = gardenOf(i)
    if (!slot || !g || (g.model ?? '') === id) return
    g.model = id
    dropNext(i)
    if (making.value === slot.layer.id) abort?.abort()
  }
  /** the model VCO `i`'s wave prompt and garden use: its ☰ choice (SKETCH where no model can run) */
  function modelOf(i: number): { id: string; sketch: boolean; info: ReturnType<typeof soundModelFrom> } {
    const id = slotOf(i)?.garden?.model || DEFAULT_GARDEN_MODEL
    const sketch = id === SKETCH_MODEL || !soundModelsAvailable()
    return { id, sketch, info: sketch ? null : soundModelFrom(id) }
  }

  /**
   * VCO `i`'s wave prompt (Rack.vue): `text` sent to its model as typed (`auto` false: ➤), or written out first by the
   * word model (`auto`: the automation button) -- a caption from the few words, and for a model that sings, the words
   * to sing. The clip goes into the slot; what was sent comes back for the prompt's status line. `note` says what it's
   * doing while it writes.
   */
  async function promptWave(i: number, text: string, auto: boolean, signal: AbortSignal, note: (s: string) => void) {
    const { id, sketch, info } = modelOf(i)
    const g = slotOf(i)?.garden
    const sings = !!info?.lyrics
    let sent = text
    if (auto) {
      note('writing the prompt…')
      sent = (await captionFor(text).catch(() => null)) ?? text
      if (signal.aborted) return null
    }
    let lyrics: string | undefined
    if (sings) {
      if (auto) note('writing the words…')
      // ➤ sings the words typed (or ☰'s OWN WORDS); the automation button, the word model's lines about them
      lyrics = auto ? await sungLyrics(i, text) : g?.ownLyrics && g.lyrics.trim() ? g.lyrics.trim() : sungLines(text)
      const lid = slotOf(i)?.layer.id
      if (lid) sang.set(lid, lyrics)
      if (signal.aborted) return null
    }
    note('')
    if (sketch) {
      const rate = 44100
      const snd = await board.addAgentSound(await sketchAsync(sent, CLIP_SECONDS, rate), rate, { name: takeName(sent), tags: ['sketch', 'vco'], rootNote: 60, fine: 0 })
      board.assignSlot(i, snd.id)
      return { sent, lyrics, model: 'SKETCH', name: snd.settings.name, seconds: CLIP_SECONDS, tune: '' }
    }
    const negative = negativeFor(g?.negative ?? '', sings ? `${sent}, singing` : sent) || undefined
    const made = await ai.promptSlotWave(i, sent, signal, { model: id, negative, ...(lyrics ? { lyrics } : {}) })
    return { sent, lyrics, model: made.model.label, name: made.name, seconds: made.seconds, tune: made.pitch?.steady ? `in tune at ${made.pitch.name}` : '' }
  }

  /** a clip made from the old words: let go, the next is made from the new */
  function dropNext(i: number) {
    const run = runFor(i)
    if (run?.next && !run.next.again) {
      board.dropTakes([run.next.soundId])
      run.next = null
      if (run.status === 'ready') run.status = 'waiting'
    }
  }

  /**
   * The takes VCO `i` can step through (◀ ▶ beside its grow toggle): each clip it grew whose audio is still here, oldest
   * first, and where the one playing is among them (-1: not one of them).
   */
  function takesOf(i: number): { takes: GardenTake[]; at: number } {
    const g = slotOf(i)?.garden
    const playing = slotOf(i)?.layer.soundId
    if (!g) return { takes: [], at: -1 }
    const seen = new Set<string>()
    const takes: GardenTake[] = []
    for (let k = g.history.length - 1; k >= 0; k--) {
      const t = g.history[k]
      if (seen.has(t.soundId) || !board.byId(t.soundId)) continue
      seen.add(t.soundId)
      takes.push(t)
    }
    return { takes, at: takes.findIndex((t) => t.soundId === playing) }
  }
  /** ◀ / ▶: the take before or after the one playing, stitched in now (false: none that way, or a stitch still fading) */
  function stepTake(i: number, dir: -1 | 1): boolean {
    const { takes, at } = takesOf(i)
    const t = takes[at < 0 ? (dir < 0 ? takes.length - 1 : -1) : at + dir]
    if (!t) return false
    goBack(i, t)
    return true
  }
  function stop() {
    abort?.abort()
  }

  // ── each pad's LFO (lib/play/padLfo.ts): its automation button ──
  /** (one saved while GROW was a SHAPE, past LINE: that was the garden's walk, now the pad's GROW button) */
  const oldGrow = (l: PadLfo) => l.shape > LAST_SHAPE + 0.5
  /** VCO `i`'s pad's LFO as it stands (null: its automation is off) */
  function lfoOf(i: number, pad: PadId): PadLfo | null {
    const l = slotOf(i)?.garden?.pads?.lfo?.[pad]
    return l?.on && !oldGrow(l) ? l : null
  }
  /** the pad's LFO moves it: dragging the pad moves the shape's centre */
  const lfoDrives = (i: number, pad: PadId) => !!lfoOf(i, pad)
  /** the garden's record for the pad, made if need be */
  function lfoRecord(i: number, pad: PadId): PadLfo | null {
    const g = gardenOf(i)
    if (!g) return null
    g.pads.lfo ??= {}
    const l = g.pads.lfo[pad]
    if (!l) g.pads.lfo[pad] = { ...defaultPadLfo({ x: 0.5, y: 0.5 }), on: false }
    else if (oldGrow(l)) Object.assign(l, { on: false, shape: 0 })
    return g.pads.lfo[pad]
  }
  /** the automation button pressed with it off: on, round where the pad is now */
  function startLfo(i: number, pad: PadId) {
    const l = lfoRecord(i, pad)
    if (!l || l.on) return
    const c = padsOf(slotOf(i)!)
    const at = c ? c.pointOf(pad) : { x: l.cx, y: l.cy }
    Object.assign(l, { on: true, cx: at.x, cy: at.y })
    kickLfos()
  }
  /** OFF (or a right-click on the button): no more LFO, the pad left at its centre */
  function stopLfo(i: number, pad: PadId) {
    const l = lfoRecord(i, pad)
    if (!l) return
    const was = l.on
    l.on = false
    lfoPhase.delete(`${slotOf(i)?.layer.id}:${pad}`)
    const c = slotOf(i) && padsOf(slotOf(i)!)
    if (was && c) c.write(pad, { x: l.cx, y: l.cy })
  }
  /** a fader moved */
  function setLfo(i: number, pad: PadId, patch: Partial<Pick<PadLfo, 'shape' | 'aspect' | 'rate' | 'amp'>>) {
    const l = lfoRecord(i, pad)
    if (!l) return
    if (patch.shape !== undefined) patch = { ...patch, shape: snapShape(patch.shape) }
    Object.assign(l, patch)
    kickLfos()
  }
  /** the pad dragged while its LFO moves it (or the garden walking it): the shape's centre goes there */
  function setLfoCenter(i: number, pad: PadId, p: Point) {
    const l = lfoRecord(i, pad)
    if (!l) return
    if (l.cx !== p.x) l.cx = p.x
    if (l.cy !== p.y) l.cy = p.y
    kickLfos()
  }

  // ── each pad's GROW button: it walks with the garden's clips (PadGrowth) ──
  const growsPad = (i: number, pad: PadId) => !!slotOf(i)?.garden?.pads?.pads.includes(pad)
  function toggleGrowPad(i: number, pad: PadId) {
    const g = gardenOf(i)
    if (!g) return
    g.pads.pads = g.pads.pads.includes(pad) ? g.pads.pads.filter((x) => x !== pad) : [...g.pads.pads, pad]
  }

  /**
   * Where VCO `i`'s pad is on its LFO's path right now (null: no LFO moves it) -- for its marker, which glides along
   * the shape while the settings it writes snap to what the pad allows (tempo divisions, half dBs, scale notes).
   */
  function lfoNow(i: number, pad: PadId): Point | null {
    const slot = slotOf(i)
    const l = slot?.garden?.pads?.lfo?.[pad]
    if (!slot || !l?.on || oldGrow(l)) return null
    return lfoAt(l, lfoPhase.get(`${slot.layer.id}:${pad}`) ?? 0)
  }
  /** how far round its shape VCO `i`'s pad's LFO is (turns, 0..1) */
  const lfoPhaseOf = (i: number, pad: PadId) => lfoPhase.get(`${slotOf(i)?.layer.id}:${pad}`) ?? 0
  /** where each LFO is round its shape (turns), by layer id and pad: kept as FREQ changes so it never jumps */
  const lfoPhase = new Map<string, number>()
  let lfoFrame = 0
  let lfoLast = 0
  let lfoWritten = 0
  /** the LFOs a frame along, writing their pads 30 times a second (as modulation: lib/stores/board.ts `modulate`) */
  function runLfos(now: number) {
    lfoFrame = 0
    const dt = lfoLast ? Math.min(0.25, (now - lfoLast) / 1000) : 0
    lfoLast = now
    const write = now - lfoWritten >= 33
    if (write) lfoWritten = now
    let any = false
    board.selectedPatch?.slots.forEach((slot) => {
      const lfos = slot?.garden?.pads?.lfo
      if (!slot || !lfos) return
      for (const [pad, l] of Object.entries(lfos)) {
        if (!l.on || oldGrow(l)) continue
        any = true
        const key = `${slot.layer.id}:${pad}`
        const phase = ((lfoPhase.get(key) ?? 0) + dt * rateHz(l.rate)) % 1
        lfoPhase.set(key, phase)
        const c = write ? padsOf(slot) : null
        if (c) board.modulate(() => c.write(pad as PadId, lfoAt(l, phase)))
      }
    })
    if (any) lfoFrame = requestAnimationFrame(runLfos)
    else lfoLast = 0
  }
  function kickLfos() {
    if (!lfoFrame) lfoFrame = requestAnimationFrame(runLfos)
  }
  // a patch chosen (or put back) with LFOs on: they run
  watch(() => board.selectedPatch?.id, kickLfos, { immediate: true })
  watch(() => board.loaded, kickLfos)

  return { lfoOf, lfoNow, lfoPhaseOf, lfoDrives, growsPad, toggleGrowPad, startLfo, stopLfo, setLfo, setLfoCenter, runs, making, wording, sang, sungLyrics, setModel, modelOf, promptWave, picked, ringOf, nextRing, runFor, gardenOf, setOn, growNow, growNowAndStitch, stitchNow, goBack, seedWords, takesOf, stepTake, stop, tick, saveTake, canSave }
})
