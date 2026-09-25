import { markRaw, ref, shallowRef } from 'vue'
import { defaultMatrix, lfoHz, type GlobalFx, type ModMatrix, type Sound } from '../types'
import { LfoSource } from './lfo'
import { isSynthAudioId, makeSynthBuffer, type SynthWave } from './synthWaves'
import { MasterFx } from './masterFx'
import { Voice, type GrainMark, type ModHub, type VoiceOptions } from './voice'
import { forgetGrainSample, loadGrains } from './grains'
import { nativeEngine } from '../native/bridge'

/**
 * In the AU / VST3 the native engine makes the sound (native/engine) and this one stays silent:
 * the AudioContext is suspended, no voice starts, and the VU follows the plugin's levels.
 */
export const external = nativeEngine()

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
let mpeBendRange = 48
let bpm = 120
/** mod-only VCOs play into this (silent, but still pulled so their signals flow) */
let silentBus: GainNode
const voices = new Set<Voice>() // includes voices whose tails are still ringing

/** Decoded audio by audioId. Not reactive — AudioBuffers are big. */
export const buffers = new Map<string, AudioBuffer>()
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
  const globalLfos = [globalMatrix.lfo1, globalMatrix.lfo2].map((l) => new LfoSource(ctx!, l.shape, lfoHz(l, bpm), now))
  silentBus = ctx.createGain()
  silentBus.gain.value = 0
  silentBus.connect(master)
  const zero = ctx.createConstantSource()
  zero.offset.value = 0
  zero.start(now)
  const modWheel = ctx.createConstantSource()
  modWheel.offset.value = 0
  modWheel.start(now)
  hub = {
    globalLfos,
    bpm: () => bpm,
    modWheel,
    state: { mod: 0, bend: 0, pressure: 0, timbre: 0 },
    cc: new Float32Array(128),
    matrix: () => globalMatrix,
    mpeBendRange: () => mpeBendRange,
    zero,
  }
  // MIDI's usual power-on CCs: volume 100, pan centre, expression full
  hub.cc[7] = 100 / 127
  hub.cc[10] = 64 / 127
  hub.cc[11] = 1
  applyGlobalLfos()
  startMeterLoop()
  if (external) void ctx.suspend()
  else void loadGrains(ctx)
  return ctx
}

function applyGlobalLfos() {
  getCtx()
  ;[globalMatrix.lfo1, globalMatrix.lfo2].forEach((lfo, i) => hub.globalLfos[i].set(lfo.shape, lfoHz(lfo, bpm)))
}

/** Tempo for synced LFOs (internal knob or MIDI clock). */
export function setTempo(next: number) {
  if (!(next > 0) || next === bpm) return
  bpm = next
  if (!ctx) return
  applyGlobalLfos()
  for (const v of voices) v.apply()
}

/** MIDI Start: global LFOs restart their cycle on the downbeat. */
export function restartGlobalLfos() {
  const c = getCtx()
  for (const l of hub.globalLfos) l.restart(c.currentTime)
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

/** Timbre (CC74): every voice. */
export function setTimbre(v: number) {
  getCtx()
  hub.state.timbre = v
  for (const voice of voices) voice.setTimbre(v)
}

// ── MPE: per-note controllers arrive on the note's own channel ─────────────
export function setMpeBendRange(semis: number) {
  mpeBendRange = semis
  for (const v of voices) v.apply()
}
const onChannel = (ch: number, fn: (v: Voice) => void) => {
  for (const v of voices) if (v.channel === ch) fn(v)
}
export const setNoteBend = (ch: number, v: number) => onChannel(ch, (voice) => voice.setNoteBend(v))
export const setNotePressure = (ch: number, v: number) => onChannel(ch, (voice) => voice.setPressure(v))
export const setNoteTimbre = (ch: number, v: number) => onChannel(ch, (voice) => voice.setTimbre(v))

/** Polyphonic aftertouch: only voices playing that MIDI note. */
export function setPolyPressure(note: number, v: number) {
  for (const voice of voices) if (voice.midiNote === note) voice.setPressure(v)
}

/** Browsers start AudioContexts suspended until a user gesture. */
export function resume() {
  if (external) return
  const c = getCtx()
  if (c.state !== 'running') void c.resume()
}

export function decode(data: ArrayBuffer): Promise<AudioBuffer> {
  return getCtx().decodeAudioData(data)
}

/** Buffer for an audio id; SFZ generators ("synth:sine" …) are built on first use. */
export function getBuffer(audioId: string): AudioBuffer | undefined {
  let b = buffers.get(audioId)
  if (!b && isSynthAudioId(audioId)) {
    b = makeSynthBuffer(getCtx(), audioId.slice(6) as SynthWave)
    buffers.set(audioId, b)
  }
  return b
}

/** Current CC values (0..1), shared with voices for SFZ CC opcodes. */
export function ccValues(): Float32Array {
  getCtx()
  return hub.cc
}

/** A CC moved: SFZ *_onccN offsets follow on every voice. */
export function setCC(cc: number, v: number) {
  getCtx()
  hub.cc[cc] = v
  for (const voice of voices) voice.applyCC()
}

export function forget(audioId: string) {
  buffers.delete(audioId)
  forgetGrainSample(audioId)
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

export function startVoice(sound: Sound, opts: VoiceOptions & { silent?: boolean } = {}): Voice | null {
  if (external) return null
  const audioId = opts.zone?.audioId ?? sound.audioId
  const buffer = getBuffer(audioId)
  if (!buffer) return null
  const c = getCtx()
  const v = new Voice(
    c,
    buffer,
    audioId,
    sound.id,
    sound.settings,
    opts.silent ? silentBus : fx.input,
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
/** a pad's own voices plus the VCO voices it started */
const ofSound = (v: Voice, id: string) => v.soundId === id || v.groupId === id

export const isHeld = (soundId: string) => [...voices].some((v) => ofSound(v, soundId) && v.held)

/** Note-off every voice of a sound: envelopes release, tails ring out. */
export function releaseSound(soundId: string) {
  for (const v of voices) if (ofSound(v, soundId)) v.release()
}

/** Hard stop (choke / restart): short fade, tails cut. */
export function stopSound(soundId: string, fade = 0.03) {
  for (const v of voices) if (ofSound(v, soundId)) v.stop(fade)
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

/**
 * The context time of the sound leaving the speakers now. currentTime runs ahead of it by the output latency
 * (the audio already rendered and queued: tens of ms, far more on Bluetooth), so playheads drawn at
 * currentTime lead what you hear.
 */
function heardTime(c: AudioContext): number {
  const ts = c.getOutputTimestamp?.()
  if (ts?.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0)
    return Math.min(c.currentTime, ts.contextTime + (performance.now() - ts.performanceTime) / 1000)
  return Math.max(0, c.currentTime - (c.outputLatency || c.baseLatency || 0))
}

function startMeterLoop() {
  const frame = () => {
    if (external) {
      // the plugin engine's clock, extrapolated between its ~30 Hz reports
      if (extClock.at) clock.value = extClock.time + (performance.now() - extClock.at) / 1000
    } else if (ctx) {
      clock.value = heardTime(ctx)
      const [l, r] = levels.value
      const [pl, pr] = readLevels()
      const next: [number, number] = [Math.max(pl, l * 0.92), Math.max(pr, r * 0.92)]
      if (next[0] !== l || next[1] !== r) levels.value = next
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

/** The native engine's output level (plugin), for the VU. */
export function setExternalLevels(l: number, r: number) {
  levels.value = [Math.min(1, l), Math.min(1, r)]
}

/** A voice the plugin's engine is playing, as it reports it. */
export interface ExternalVoice {
  id: number
  sound: string
  group?: string
  note?: number
  vel?: number // 0..1
  age: number // seconds since note-on
  end: number // seconds after note-on it stops, -1 = until released
  pos: number // seconds into its sample
  rate: number // sample seconds per second
  dur: number
  in: number
  out: number
  loops: boolean
  grains?: boolean // a grain cloud: no single playhead
}

/** A grain the plugin's engine started (a sample of them), in engine time. */
export interface ExternalGrain {
  voice: number
  when: number
  pos: number
  len: number
  dur: number
  rate: number
  rev?: boolean
  pan: number
  gain: number
  stream?: number
}

const extClock = { time: 0, at: 0 }
let extRate = 0
/** grain marks of the plugin's voices, by voice id, kept across reports */
const extMarks = new Map<number, GrainMark[]>()

/** The output sample rate (grain sizes are whole samples of it): the plugin's in a DAW. */
export const outputRate = () => (external && extRate ? extRate : (ctx?.sampleRate ?? 48000))

/**
 * The plugin engine's voices, shown as this engine's own: pad LEDs, progress rings and waveform
 * playheads read activeVoices, so each reported voice gets a stand-in with the fields they use.
 */
export function setExternalVoices(list: ExternalVoice[], time: number, grains: ExternalGrain[] = [], rate = 0) {
  extClock.time = time
  extClock.at = performance.now()
  if (rate > 0) extRate = rate
  if (!ctx) getCtx() // the meter loop drives the clock
  for (const g of grains) {
    let marks = extMarks.get(g.voice)
    if (!marks) extMarks.set(g.voice, (marks = []))
    marks.push({ when: g.when, pos: g.pos, len: g.len, dur: g.dur, rate: g.rate, reverse: !!g.rev, pan: g.pan, gain: g.gain, stream: g.stream ?? 0 })
    if (marks.length > 240) marks.splice(0, marks.length - 240)
  }
  const live = new Set(list.map((v) => v.id))
  for (const id of extMarks.keys()) if (!live.has(id)) extMarks.delete(id)
  activeVoices.value = list.map((v) => {
    const t0 = time - v.age
    const clipLen = Math.max(1e-6, v.out - v.in)
    const voice = {
      t0,
      kind: v.grains ? 'cloud' : 'sample',
      velocity: v.vel ?? 1,
      endTime: v.end >= 0 ? t0 + v.end : Infinity,
      cycle: clipLen / Math.max(1e-6, v.rate),
      groupId: v.group,
      bufferDuration: v.dur,
      marks: extMarks.get(v.id) ?? [],
      positionAt(t: number) {
        if (v.grains) return null
        const x = v.pos + (t - time) * v.rate
        return v.loops && x > v.out ? v.in + ((x - v.in) % clipLen) : Math.min(x, v.out)
      },
    }
    return { id: v.id, soundId: v.sound, name: '', midiNote: v.note, voice: voice as unknown as Voice }
  })
}

/** Also send the master output to `node` (measurements: comparing this engine with the plugin's). */
export function tapOutput(node: AudioNode) {
  getCtx()
  master.connect(node)
}
