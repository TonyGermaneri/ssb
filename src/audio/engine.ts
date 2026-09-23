import { markRaw, ref, shallowRef } from 'vue'
import { defaultMatrix, type GlobalFx, type ModMatrix, type Sound } from '../types'
import { MasterFx } from './masterFx'
import { Voice, type ModHub, type VoiceOptions } from './voice'

export interface VoiceInfo {
  id: number
  soundId: string
  name: string
  midiNote?: number
  voice: Voice
}

let ctx: AudioContext | null = null
let fx: MasterFx
let master: GainNode
let analysers: [AnalyserNode, AnalyserNode]
let hub: ModHub
let globalMatrix: ModMatrix = defaultMatrix()
const voices = new Set<Voice>() // includes voices whose tails are still ringing

/** Decoded audio by audioId. Not reactive — AudioBuffers are big. */
export const buffers = new Map<string, AudioBuffer>()
const reversedBuffers = new Map<string, AudioBuffer>()
/** Voices whose source is still playing (drives LEDs, marquee, progress). */
export const activeVoices = shallowRef<VoiceInfo[]>([])
/** AudioContext time, updated every animation frame. */
export const clock = ref(0)
/** Master output level per channel, 0..1 (peak, with decay). */
export const levels = shallowRef<[number, number]>([0, 0])

export function getCtx(): AudioContext {
  if (ctx) return ctx
  ctx = new AudioContext({ latencyHint: 'interactive' })
  fx = new MasterFx(ctx)
  master = ctx.createGain()
  const split = ctx.createChannelSplitter(2)
  analysers = [ctx.createAnalyser(), ctx.createAnalyser()]
  fx.output.connect(master)
  master.connect(ctx.destination)
  master.connect(split)
  analysers.forEach((a, i) => {
    a.fftSize = 1024
    split.connect(a, i)
  })
  const now = ctx.currentTime
  const globalLfos = [ctx.createOscillator(), ctx.createOscillator()]
  globalLfos.forEach((o) => o.start(now))
  const modWheel = ctx.createConstantSource()
  modWheel.offset.value = 0
  modWheel.start(now)
  hub = {
    globalLfos,
    globalLfoStart: now,
    modWheel,
    state: { mod: 0, bend: 0, pressure: 0 },
    matrix: () => globalMatrix,
  }
  applyGlobalLfos()
  startMeterLoop()
  return ctx
}

function applyGlobalLfos() {
  const now = getCtx().currentTime
  ;[globalMatrix.lfo1, globalMatrix.lfo2].forEach((lfo, i) => {
    hub.globalLfos[i].type = lfo.shape
    hub.globalLfos[i].frequency.setTargetAtTime(lfo.rate, now, 0.02)
  })
}

/** Global modulation matrix changed (LFO settings or routes). */
export function setGlobalMatrix(m: ModMatrix) {
  globalMatrix = m
  getCtx()
  applyGlobalLfos()
  for (const v of voices) v.apply()
}

// ── performance controllers ───────────────────────────────────────────────
export function setModWheel(v: number) {
  const c = getCtx()
  hub.state.mod = v
  hub.modWheel.offset.setTargetAtTime(v, c.currentTime, 0.01)
}

/** Channel-wide pitch bend, -1..1: every voice, and new voices start there. */
export function setBend(v: number) {
  getCtx()
  hub.state.bend = v
  for (const voice of voices) voice.setBend(v)
}

/** Channel pressure: every voice. */
export function setChannelPressure(v: number) {
  getCtx()
  hub.state.pressure = v
  for (const voice of voices) voice.setPressure(v)
}

/** Polyphonic aftertouch: only voices playing that MIDI note. */
export function setPolyPressure(note: number, v: number) {
  for (const voice of voices) if (voice.midiNote === note) voice.setPressure(v)
}

/** Browsers start AudioContexts suspended until a user gesture. */
export function resume() {
  const c = getCtx()
  if (c.state !== 'running') void c.resume()
}

export function decode(data: ArrayBuffer): Promise<AudioBuffer> {
  return getCtx().decodeAudioData(data)
}

export function forget(audioId: string) {
  buffers.delete(audioId)
  reversedBuffers.delete(audioId)
}

/** Reversed copy of a buffer, built on first use (for reverse grains). */
function reversed(audioId: string): AudioBuffer {
  let r = reversedBuffers.get(audioId)
  if (r) return r
  const src = buffers.get(audioId)!
  r = getCtx().createBuffer(src.numberOfChannels, src.length, src.sampleRate)
  for (let ch = 0; ch < src.numberOfChannels; ch++) r.getChannelData(ch).set(src.getChannelData(ch).slice().reverse())
  reversedBuffers.set(audioId, r)
  return r
}

export function setMaster(volume: number, muted: boolean) {
  const c = getCtx()
  master.gain.setTargetAtTime(muted ? 0 : volume, c.currentTime, 0.02)
}

export function setGlobalFx(settings: GlobalFx) {
  getCtx()
  fx.apply(settings)
}

export function publish() {
  activeVoices.value = [...voices]
    .filter((v) => v.playing)
    .map((v) => ({ id: v.id, soundId: v.soundId, name: v.settings.name, midiNote: v.midiNote, voice: markRaw(v) }))
}

export function startVoice(sound: Sound, opts: VoiceOptions = {}): Voice | null {
  const buffer = buffers.get(sound.audioId)
  if (!buffer) return null
  const c = getCtx()
  const v = new Voice(
    c,
    buffer,
    () => reversed(sound.audioId),
    sound.id,
    sound.settings,
    fx.input,
    opts,
    hub,
    () => publish(),
    (dead) => voices.delete(dead),
  )
  voices.add(v)
  publish()
  return v
}

/** Playing and not yet released. */
export const isHeld = (soundId: string) => [...voices].some((v) => v.soundId === soundId && v.held)

/** Note-off every voice of a sound: envelopes release, tails ring out. */
export function releaseSound(soundId: string) {
  for (const v of voices) if (v.soundId === soundId) v.release()
}

/** Hard stop (choke / restart): short fade, tails cut. */
export function stopSound(soundId: string, fade = 0.03) {
  for (const v of voices) if (v.soundId === soundId) v.stop(fade)
}

/** PANIC: stop everything, per-voice and global tails included. */
export function stopAll() {
  for (const v of voices) v.stop(0.02)
  fx?.flush()
}

/** Knobs moved — push to every live voice (they share the reactive settings object). */
export function refreshVoices() {
  for (const v of voices) v.apply()
  publish()
}

const meterData = new Float32Array(1024)

/** Instantaneous master peak per channel (0..1). */
export function readLevels(): [number, number] {
  if (!ctx) return [0, 0]
  return analysers.map((a) => {
    a.getFloatTimeDomainData(meterData)
    let peak = 0
    for (let j = 0; j < meterData.length; j++) peak = Math.max(peak, Math.abs(meterData[j]))
    return peak
  }) as [number, number]
}

function startMeterLoop() {
  const frame = () => {
    if (ctx) {
      clock.value = ctx.currentTime
      const [l, r] = levels.value
      const [pl, pr] = readLevels()
      const next: [number, number] = [Math.max(pl, l * 0.92), Math.max(pr, r * 0.92)]
      if (next[0] !== l || next[1] !== r) levels.value = next
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
