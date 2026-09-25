/**
 * Keeps the plugin's native engine (native/engine) playing what the page shows.
 *
 * In the AU / VST3 the page is the editor and the engine makes the sound, so the engine needs,
 * and keeps up to date:
 * - every sound and patch layer: settings, SFZ zones, VCO links (`ssbSync` sounds, only the ones
 *   whose JSON changed);
 * - the performance: master volume / FX / mod matrix, keyboard mode, what the keyboard plays, which
 *   pads answer which MIDI notes (`ssbSync` meta);
 * - the audio itself, decoded, once per sample (`ssbAudio`) -- the engine keeps a disk cache, so
 *   it only asks for what it has never had.
 *
 * The engine plays host MIDI on its own (with or without this page open); clicks and the
 * computer keyboard reach it as commands from the board (`ssbCommand`).
 */
import { computed, effectScope, watch, type ComputedRef, type EffectScope } from 'vue'
import type { useBoard } from '../stores/board'
import * as engine from '../audio/engine'
import { divisionBeats, type ModMatrix, type Sound } from '../types'
import { callNative, onNative } from './bridge'

type Board = ReturnType<typeof useBoard>

/** the longest a change waits before it is sent (about a frame) */
const SYNC_EVERY_MS = 16

const matrix = (m: ModMatrix) => ({
  lfo1: { ...m.lfo1, divisionBeats: divisionBeats(m.lfo1.division) },
  lfo2: { ...m.lfo2, divisionBeats: divisionBeats(m.lfo2.division) },
  routes: m.routes,
})

/** zones rarely change and can be big (thousands of SFZ regions): serialised once per array */
const zoneJson = new WeakMap<object, unknown>()

function soundJson(board: Board, sound: Sound) {
  const { mod, ...rest } = sound.settings
  let zones: unknown
  if (sound.zones?.length) {
    zones = zoneJson.get(sound.zones)
    if (zones === undefined) zoneJson.set(sound.zones, (zones = JSON.parse(JSON.stringify(sound.zones))))
  }
  return {
    id: sound.id,
    audioId: sound.audioId,
    s: { ...rest, mod: matrix(mod) },
    zones,
    ccDefaults: sound.ccDefaults,
    links: board.vcoLinks(sound).map(({ index, osc, slot }) => ({
      index,
      soundId: osc.id,
      level: slot.level,
      audible: slot.audible,
      track: slot.track,
      transpose: slot.transpose,
      fine: slot.fine,
      fixedNote: slot.fixedNote,
    })),
  }
}

/** Every sound the engine may be asked to play: the pads, and every patch's layers. */
function allSounds(board: Board): Sound[] {
  const out = [...board.sounds]
  for (const p of board.patches)
    for (const x of p.slots) {
      const layer = x && board.layerSound(x.layer)
      if (layer) out.push(layer)
    }
  return out
}

function metaJson(board: Board, ids: string[]) {
  const m = board.master
  const fx = m.fx
  const bpm = board.bpm
  return {
    volume: m.volume,
    muted: m.muted,
    mono: m.mono,
    play: m.play,
    mpe: m.mpe,
    glide: m.glide,
    mpeBendRange: m.mpeBendRange,
    bpm,
    // synced delays resolve against the host's tempo in the engine (the page may be closed)
    fx: {
      ...fx,
      delayTime: fx.delaySync ? Math.min(2.4, (divisionBeats(fx.delayDivision) * 60) / bpm) : fx.delayTime,
      delayBeats: divisionBeats(fx.delayDivision),
    },
    mod: matrix(m.mod),
    playable: board.playable?.id ?? null,
    padNotes: [...board.noteFor].map(([id, note]) => [note, id]),
    pads: board.sounds.map((s) => s.id),
    ids,
  }
}

/** Planar float32 of a decoded buffer, base64 (the engine plays exactly what the page decoded). */
function encode(buffer: AudioBuffer): string {
  const channels = Math.min(2, buffer.numberOfChannels)
  const bytes = new Uint8Array(buffer.length * channels * 4)
  for (let ch = 0; ch < channels; ch++) bytes.set(new Uint8Array(buffer.getChannelData(ch).slice().buffer), ch * buffer.length * 4)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export function startEngineSync(board: Board) {
  const sent = new Map<string, string>()
  let sentMeta = ''
  let timer: ReturnType<typeof setTimeout> | undefined
  let uploading = false
  const uploaded = new Set<string>()

  async function upload(missing: string[]) {
    if (uploading) return
    uploading = true
    try {
      for (const id of missing) {
        if (uploaded.has(id)) continue
        const buffer = engine.getBuffer(id)
        if (!buffer) continue
        uploaded.add(id)
        await callNative('ssbAudio', id, buffer.sampleRate, Math.min(2, buffer.numberOfChannels), encode(buffer))
      }
    } finally {
      uploading = false
    }
  }

  /**
   * Each sound's JSON, cached by Vue until something it reads changes: a knob turned while syncing at frame
   * rate re-serialises the one sound it belongs to, not the whole library (~6 ms for 160 sounds).
   */
  const texts = new Map<Sound, { text: ComputedRef<string>; scope: EffectScope }>()
  function textOf(s: Sound): string {
    let hit = texts.get(s)
    if (!hit) {
      const scope = effectScope(true)
      const text = scope.run(() => computed(() => JSON.stringify(soundJson(board, s))))!
      texts.set(s, (hit = { text, scope }))
    }
    return hit.text.value
  }

  async function sync() {
    const sounds = allSounds(board)
    const changed: string[] = []
    const ids: string[] = []
    for (const s of sounds) {
      ids.push(s.id)
      const text = textOf(s)
      if (sent.get(s.id) !== text) {
        sent.set(s.id, text)
        changed.push(text)
      }
    }
    const live = new Set(ids)
    for (const id of [...sent.keys()]) if (!live.has(id)) sent.delete(id)
    const present = new Set(sounds)
    for (const [s, hit] of texts)
      if (!present.has(s)) {
        hit.scope.stop()
        texts.delete(s)
      }
    const metaText = JSON.stringify(metaJson(board, ids))
    if (!changed.length && metaText === sentMeta) return
    sentMeta = metaText
    const missing = await callNative<string[]>('ssbSync', `{"sounds":[${changed.join(',')}],"meta":${metaText}}`)
    if (missing?.length) void upload(missing)
  }

  /**
   * Throttled, not debounced: the first change goes out on the next frame and a knob being turned keeps
   * streaming (one sync per ~frame, never two at once), so the engine follows the knob as it moves. A
   * debounce here held every change back until the knob had been still for a moment.
   */
  let inFlight = false
  let dirty = false
  const run = async () => {
    timer = undefined
    if (inFlight) return void (dirty = true)
    inFlight = true
    try {
      await sync()
    } catch (e) {
      console.warn('engine sync failed', e)
    } finally {
      inFlight = false
      if (dirty) {
        dirty = false
        schedule()
      }
    }
  }
  const schedule = () => {
    timer ??= setTimeout(() => void run(), SYNC_EVERY_MS)
  }

  // anything that changes what a note sounds like, or which note plays what
  watch(
    () => [board.sounds, board.patches, board.master, board.bpm, board.playable?.id, board.noteFor],
    schedule,
    { deep: true, immediate: true },
  )
  // samples decode after the board loads: once it has, send what the engine lacks
  watch(() => board.loaded, (loaded) => loaded && schedule(), { immediate: true })

  // the engine's levels drive the VU meter; its voices light the pads and move the playheads
  type Meter = {
    l: number
    r: number
    list?: engine.ExternalVoice[]
    grains?: engine.ExternalGrain[]
    time?: number
    rate?: number
    host?: { bpm: number; ppq: number; playing: boolean }
  }
  onNative<Meter>('ssbMeter', ({ l, r, list, grains, time, rate, host }) => {
    engine.setExternalLevels(l, r)
    // the DAW's clock: tempo (drives synced LFOs / delays and the display), position, transport
    board.tempo.host = host && host.bpm > 0 ? Math.round(host.bpm * 100) / 100 : 0
    board.tempo.hostPpq = host?.ppq ?? -1
    board.tempo.hostPlaying = !!host?.playing
    if (list && time !== undefined) engine.setExternalVoices(list, time, grains, rate)
  })
}
