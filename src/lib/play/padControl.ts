/**
 * A VCO's pads as controls, apart from how they look: where each crosshair sits for the layer's settings (or the
 * pointer, while it's held), what moving one writes, and its double-click reset. The Play view's pads (PlayView.vue)
 * and the VOYAGE ship's parts (VoyageView.vue) are two faces of this one set: they write exactly the same settings.
 *
 * A pointer's moves are held here and written to the settings once a frame (`flush`, the latest); the crosshair
 * follows the pointer at once. Everything reads the settings raw (no tracking) so a frame loop can call it freely.
 */
import { toRaw } from 'vue'
import { audioDuration, getBuffer } from '../../audio/engine'
import { cycleFillSeconds, tableCount } from '../../audio/wavetable'
import type { Sound } from '../../types'
import {
  echoPoint, echoWrite, fxPoint, fxWrite, grainPoint, grainSyncPoint, grainSyncWrite, grainWrite, lfoPoint, lfoWrite, performPoint,
  performWrite, pitchPoint, pitchWrite, texturePoint, textureWrite, tonePoint, toneWrite, type Point,
} from './pads'

export type PadId = 'perform' | 'grain' | 'lfo' | 'fx' | 'pitch' | 'texture' | 'echo' | 'tone'
export const PAD_IDS: readonly PadId[] = ['perform', 'grain', 'lfo', 'fx', 'pitch', 'texture', 'echo', 'tone']
type Settings = Sound['settings']

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** write only what changes: an unchanged value written still counts as an edit */
export function put<T extends object>(target: T, patch: Partial<T>) {
  const r = toRaw(target) as Record<string, unknown>
  for (const [k, v] of Object.entries(patch)) if (!Object.is(r[k], v)) (target as Record<string, unknown>)[k] = v
}

/** LFO 2's route to POS: how far it sweeps, and whether only forward (the pad's) */
export function lfoRouteOf(r: Settings) {
  const route = r.mod.routes.find((x) => x.source === 'lfo2' && x.dest === 'grainPos')
  return { amount: Math.abs(route?.amount ?? 0), unipolar: !!route?.unipolar }
}

/**
 * One VCO's pads. `sound` is read each call (a slot's layer can change under it); `changed` is told whenever a
 * crosshair moves, so a frame loop can wake.
 */
export function padControl(o: { sound: () => Sound; bpm: () => number; changed?: () => void }) {
  /** the settings, reactive: what writes go to */
  const s = () => o.sound().settings as Settings
  /** the same object, raw: what reads use */
  const raw = () => toRaw(o.sound().settings) as Settings

  const durationNow = () => getBuffer(o.sound().audioId)?.duration ?? audioDuration(o.sound().audioId)
  /**
   * A wavetable (audio/wavetable.ts): its cycles and their length. PERFORM's left / right is then where in the table
   * it plays (WT + BLEND); its grains (and the GRAIN pad) are the chosen wave's.
   */
  function tableOf() {
    const r = raw()
    if (!(r.wtSize > 0) || o.sound().zones?.length) return null
    const buf = getBuffer(o.sound().audioId)
    const count = buf ? tableCount(buf.length, r.wtSize) : 0
    return buf && count >= 1 ? { count, size: r.wtSize, rate: buf.sampleRate } : null
  }
  /** the whole sample's length: the GRAIN pad's bottom is one grain that long (a table's: the wave its grains play) */
  function sampleSeconds() {
    const t = tableOf()
    return t ? cycleFillSeconds(t.size, t.rate) : durationNow() || 0
  }
  /** a wavetable's position as PERFORM's x: its first wave at the left, its last at the right */
  const tableX = (r: Settings, count: number) => (count > 1 ? clamp01((Math.round(r.wt) + r.wtBlend) / (count - 1)) : 0)
  function tableWrite(p: Point, count: number) {
    const at = clamp01(p.x) * Math.max(0, count - 1)
    const wt = Math.min(count - 1, Math.floor(at))
    return { wt, wtBlend: Math.round((at - wt) * 1000) / 1000, volume: performWrite(p).volume }
  }

  /** the pitch pad's column: several give the same pitch, so it remembers which one you're in */
  let pitchX = 0.5
  /** each pad's pointer while it's held: the crosshair follows it exactly, ahead of the settings */
  const held: Partial<Record<PadId, Point>> = {}
  /** each pad's latest point since the last frame, written to the settings once a frame */
  const pending: Partial<Record<PadId, Point>> = {}
  /** performance.now() a crosshair last moved */
  let touched = 0

  const writers: Record<PadId, (p: Point) => void> = {
    perform: (p) => {
      const t = tableOf()
      put(s(), t ? tableWrite(p, t.count) : performWrite(p))
    },
    // SYNC: the rows are tempo divisions (the top band free)
    grain: (p) => put(s(), raw().grainSync ? grainSyncWrite(p, o.bpm()) : grainWrite(p, sampleSeconds())),
    lfo: (p) => {
      const w = lfoWrite(raw(), p)
      put(s().mod.lfo2, w.lfo2)
      if (JSON.stringify(w.routes) !== JSON.stringify(raw().mod.routes)) s().mod.routes = w.routes
    },
    fx: (p) => put(s(), fxWrite(p)),
    pitch: (p) => {
      pitchX = p.x
      // SCALE: snapped to the chosen scale
      put(s(), pitchWrite(p, raw().pitchScale ? (raw().pitchScaleId ?? 'major') : null))
    },
    texture: (p) => put(s(), textureWrite(p)),
    echo: (p) => put(s(), echoWrite(p, o.bpm(), raw().delayMix)),
    tone: (p) => put(s(), toneWrite(p)),
  }

  function pointOf(id: PadId, r: Settings = raw()): Point {
    const h = held[id]
    if (h) return h
    if (id === 'perform') {
      const t = tableOf()
      return t ? { x: tableX(r, t.count), y: performPoint(r).y } : performPoint(r)
    }
    if (id === 'grain') return r.grainSync ? grainSyncPoint(r, o.bpm()) : grainPoint(r, sampleSeconds())
    if (id === 'lfo') return lfoPoint(r)
    if (id === 'fx') return fxPoint(r)
    if (id === 'texture') return texturePoint(r)
    if (id === 'echo') return echoPoint(r)
    if (id === 'tone') return tonePoint(r)
    return pitchPoint(r, pitchX)
  }

  function moved(id: PadId, p: Point) {
    held[id] = p
    pending[id] = p
    touched = performance.now()
    o.changed?.()
  }
  function ended(id: PadId) {
    // the last move goes in before the crosshair goes back to following the settings
    const p = pending[id]
    if (p) writers[id](p)
    delete pending[id]
    delete held[id]
    o.changed?.()
  }
  const resets: Record<PadId, () => void> = {
    perform: () => writers.perform({ x: 0.5, y: 1 / 1.2 }),
    grain: () => put(s(), { grainFreq: 5, grainLength: 1 }),
    lfo: () => writers.lfo({ x: 0, y: lfoPoint(raw()).y }),
    fx: () => writers.fx({ x: 0.5, y: 0 }),
    pitch: () => writers.pitch({ x: 0.5, y: 0.5 }),
    texture: () => put(s(), { grainSpray: 0, grainDetune: 0 }),
    // the echo out (its time and feedback kept)
    echo: () => put(s(), { delayMix: 0 }),
    tone: () => put(s(), { eqLow: 0, eqMid: 0, eqHigh: 0 }),
  }
  function reset(id: PadId) {
    delete pending[id]
    delete held[id]
    resets[id]()
    touched = performance.now()
    o.changed?.()
  }
  /**
   * A point written straight to the settings, as a pad would but not from a pointer (the garden's pads growing): the
   * crosshair follows the settings. An ECHO moved this way keeps its MIX (a pad touched turns an echo on; this doesn't).
   */
  function write(id: PadId, p: Point) {
    if (id === 'echo') {
      const w = echoWrite(p, o.bpm(), 1)
      put(s(), { delayTime: w.delayTime, delayFeedback: w.delayFeedback })
      return
    }
    writers[id](p)
  }
  /** the pointers' latest moves into the settings (once a frame) */
  function flush() {
    for (const id of Object.keys(pending) as PadId[]) {
      writers[id](pending[id]!)
      delete pending[id]
    }
  }

  return {
    s,
    raw,
    tableOf,
    sampleSeconds,
    durationNow,
    pointOf,
    moved,
    ended,
    reset,
    flush,
    write,
    isHeld: (id?: PadId) => (id ? !!held[id] : Object.keys(held).length > 0),
    /** ms since a crosshair last moved */
    sinceTouch: () => performance.now() - touched,
  }
}
export type PadControl = ReturnType<typeof padControl>
