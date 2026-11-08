import { markRaw, ref, shallowRef } from 'vue'
import { defaultMatrix, type GlobalFx, type ModMatrix, type Sound } from '../types'
import { lfoConfig, LfoSource } from './lfo'
import { isSynthAudioId, makeSynthBuffer, type SynthWave } from './synthWaves'
import { MasterFx } from './masterFx'
import { Voice, type GrainMark, type ModHub, type VoiceOptions } from './voice'
import { forgetGrainSample, loadGrains } from './grains'
import { callNative, nativeEngine } from '../native/bridge'
import { cycleRate, isWaveAudioId, waveChannels, waveNameOf } from '../lib/akwf'

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

/**
 * An offline render being built (renderOffline): while one is set, startVoice builds voices in its context, with its
 * own modulation hub and output, and keeps them in its own set -- the live engine never sees them (no sound, no LEDs,
 * no adaptive tuning). It works in the plugin too, where the live engine is the native one.
 */
interface RenderTarget {
  ctx: BaseAudioContext
  hub: ModHub
  input: AudioNode
  silent: AudioNode
  voices: Set<Voice>
}
let target: RenderTarget | null = null

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
  const globalLfos = [globalMatrix.lfo1, globalMatrix.lfo2].map((l) => new LfoSource(ctx!, lfoConfig(l, bpm), now, 0))
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
  ;[globalMatrix.lfo1, globalMatrix.lfo2].forEach((lfo, i) => hub.globalLfos[i].set(lfoConfig(lfo, bpm)))
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
/** when each channel's last bend came (performance.now()) */
const bendAt = new Float64Array(16)
/** a bend this close before a note-on is the new note's starting bend (MPE sends one first), not the old note's */
const PRE_NOTE_MS = 10
/**
 * A new note takes an MPE channel: notes still releasing from it keep the bend they ended with instead of following
 * the new one's -- including the bend the controller sent just before the note-on, meant for the new note.
 */
export function claimChannel(ch: number) {
  const fresh = performance.now() - (bendAt[ch] ?? 0) < PRE_NOTE_MS
  for (const v of voices) {
    if (v.channel !== ch || v.held) continue
    if (fresh) v.setNoteBend(v.bendBefore)
    v.channel = undefined
  }
}
export function setNoteBend(ch: number, v: number) {
  bendAt[ch & 15] = performance.now()
  onChannel(ch, (voice) => voice.setNoteBend(v))
}
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

/** seconds a single cycle is repeated to fill (as long as a built-in generator's buffer) */
const CYCLE_FILL = 0.25
/**
 * A single cycle (an AKWF wave, or any one-cycle WAV with a whole-file loop) at its own rate, repeated to fill
 * a quarter second: never resampled, so the loop stays exact, and grains / STRETCH have room to move.
 */
const cycleTimes = (n: number, rate: number) => Math.max(1, Math.round((rate * CYCLE_FILL) / n))
export function cycleBuffer(channels: Float32Array[], rate: number): AudioBuffer {
  const n = channels[0].length
  const times = cycleTimes(n, rate)
  const buf = new AudioBuffer({ numberOfChannels: channels.length, length: n * times, sampleRate: rate })
  channels.forEach((ch, c) => {
    const d = buf.getChannelData(c)
    for (let k = 0; k < times; k++) d.set(ch, k * n)
  })
  return buf
}

let previewCtx: AudioContext | null = null
let previewing: { src: AudioBufferSourceNode; gain: GainNode } | null = null
/**
 * Audition a buffer that isn't a pad yet (the library's waves): looped at `rate`, faded in and out, dry. In the
 * plugin this page's engine is silent, so it plays from a little context of its own.
 */
export function preview(buffer: AudioBuffer, rate: number, seconds = 0.9) {
  const c = external ? (previewCtx ??= new AudioContext({ latencyHint: 'interactive' })) : getCtx()
  void c.resume()
  stopPreview()
  const src = c.createBufferSource()
  src.buffer = buffer
  src.loop = true
  src.playbackRate.value = rate
  const gain = c.createGain()
  const t = c.currentTime
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(0.45, t + 0.008)
  gain.gain.setValueAtTime(0.45, t + seconds)
  gain.gain.linearRampToValueAtTime(0, t + seconds + 0.12)
  src.connect(gain).connect(external ? c.destination : master)
  src.start(t)
  src.stop(t + seconds + 0.15)
  previewing = { src, gain }
  src.onended = () => {
    gain.disconnect()
    if (previewing?.src === src) previewing = null
  }
}
export function stopPreview() {
  if (!previewing) return
  const { src, gain } = previewing
  const t = src.context.currentTime
  gain.gain.cancelScheduledValues(t)
  gain.gain.setValueAtTime(gain.gain.value, t)
  gain.gain.linearRampToValueAtTime(0, t + 0.03)
  src.stop(t + 0.05)
  previewing = null
}

/**
 * Buffer for an audio id. SFZ generators ("synth:sine" …) and AKWF waves ("akwf-…", once lib/akwf has them in memory)
 * are built on first use: the board holds thousands of waves, and a wave nobody plays or draws needs no buffer.
 */
export function getBuffer(audioId: string): AudioBuffer | undefined {
  let b = buffers.get(audioId)
  if (!b && isSynthAudioId(audioId)) {
    b = makeSynthBuffer(getCtx(), audioId.slice(6) as SynthWave)
    buffers.set(audioId, b)
  }
  if (!b && isWaveAudioId(audioId)) {
    const ch = waveChannels(waveNameOf(audioId))
    if (ch) buffers.set(audioId, (b = cycleBuffer(ch, cycleRate(ch[0].length))))
  }
  return b
}

/** Whether an id's audio is here, or is made on demand (generators, AKWF waves). */
export const hasAudio = (audioId: string) => buffers.has(audioId) || isSynthAudioId(audioId) || isWaveAudioId(audioId)

/** AKWF's cycles are all this long */
const WAVE_FRAMES = 600
/** Seconds of audio an id plays, without building a wave's buffer to find out (0 if unknown). */
export function audioDuration(audioId: string): number {
  const b = buffers.get(audioId)
  if (b) return b.duration
  if (!isWaveAudioId(audioId)) return 0
  const rate = cycleRate(WAVE_FRAMES)
  return (cycleTimes(WAVE_FRAMES, rate) * WAVE_FRAMES) / rate
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

/** A start time for a note about to be played: its voices all start then (VoiceOptions.at). */
export const noteStart = () => getCtx().currentTime + 0.005

/** The clock voices run on, and the keyboard notes sounding (held, or in their release), for adaptive tuning. */
export const voiceTime = () => getCtx().currentTime
export const keyboardVoices = () => [...voices].filter((v) => v.tuning && v.playing)

export function startVoice(sound: Sound, opts: VoiceOptions & { silent?: boolean } = {}): Voice | null {
  const t = target
  if (external && !t) return null
  const audioId = opts.zone?.audioId ?? sound.audioId
  const buffer = getBuffer(audioId)
  if (!buffer) return null
  if (t) {
    const v = new Voice(t.ctx, buffer, audioId, sound.id, sound.settings, opts.silent ? t.silent : t.input, opts, t.hub,
      () => {}, (dead) => t.voices.delete(dead))
    t.voices.add(v)
    return v
  }
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

/** The master's spectrum (dB per bin, fftSize / 2 of them) into `out`; false when this page isn't the one playing. */
export function readSpectrum(out: Float32Array<ArrayBuffer>): boolean {
  if (!ctx || external) return false
  analysers[0].getFloatFrequencyData(out)
  return true
}
/** The master's last fftSize samples (left), for a scope. */
export function readScope(out: Float32Array<ArrayBuffer>): boolean {
  if (!ctx || external) return false
  analysers[0].getFloatTimeDomainData(out)
  return true
}
export const ANALYSER_SIZE = 1024

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

// ── live views (the waveform's SCOPE, BARS and SPECTRO): what a sound's voices are playing, as it sounds ─────────
/** samples a live view reads at a time */
export const SCOPE_SAMPLES = 2048
/** the plugin engine stops sending a sound when its voices stop: older than this, it's silence */
const EXT_STALE_MS = 250
/** each watched sound: an analyser its voices' taps (post-filter, as a VCO feeds the matrix) play into */
interface SoundTap {
  analyser: AnalyserNode
  taps: Map<Voice, AudioNode>
  users: number
  seq: number
}
const soundTaps = new Map<string, SoundTap>()
/** the plugin engine's latest block of each sound it's playing (ssbMeter `scopes`), while a live view asks */
const extScopes = new Map<string, { data: Float32Array; seq: number; at: number }>()
let extScopeRate = 0
let extScopeSeq = 0
let extWatchers = 0

/** A live view shows `soundId`: its voices are tapped until the returned function is called. */
export function watchSound(soundId: string): () => void {
  if (external) {
    // the plugin sends its voices' audio only while some view wants it
    if (extWatchers++ === 0) void callNative('ssbScope', true).catch(() => {})
    return () => {
      if (--extWatchers === 0) void callNative('ssbScope', false).catch(() => {})
    }
  }
  let t = soundTaps.get(soundId)
  if (!t) {
    const analyser = getCtx().createAnalyser()
    analyser.fftSize = SCOPE_SAMPLES
    analyser.smoothingTimeConstant = 0
    soundTaps.set(soundId, (t = { analyser, taps: new Map(), users: 0, seq: 0 }))
  }
  t.users++
  const tap = t
  return () => {
    if (--tap.users > 0) return
    for (const node of tap.taps.values()) unplug(node, tap.analyser)
    soundTaps.delete(soundId)
  }
}
function unplug(node: AudioNode, from: AudioNode) {
  try {
    node.disconnect(from)
  } catch {
    /* the voice already let go of it */
  }
}

/**
 * The last SCOPE_SAMPLES of what `soundId`'s voices play (their sum, mono) into `out`. Answers a number that changes
 * when there is new audio (0: none yet); the plugin's arrives ~30 times a second, the page's every frame.
 */
export function readSound(soundId: string, out: Float32Array<ArrayBuffer>): number {
  if (external) {
    const got = extScopes.get(soundId)
    if (!got || performance.now() - got.at > EXT_STALE_MS) {
      out.fill(0)
      return got ? -got.seq : 0
    }
    const n = Math.min(out.length, got.data.length)
    out.fill(0, 0, out.length - n)
    out.set(got.data.subarray(got.data.length - n), out.length - n)
    return got.seq
  }
  const t = soundTaps.get(soundId)
  if (!t) return 0
  // voices come and go: their taps join and leave the sound's analyser (release tails included)
  for (const v of voices) {
    if (v.soundId !== soundId || t.taps.has(v)) continue
    const node = v.tap
    node.connect(t.analyser)
    t.taps.set(v, node)
  }
  for (const [v, node] of t.taps) {
    if (voices.has(v)) continue
    unplug(node, t.analyser)
    t.taps.delete(v)
  }
  t.analyser.getFloatTimeDomainData(out)
  return ++t.seq
}

/** the rate a live view's samples are at */
export const soundRate = () => (external ? extScopeRate || outputRate() : (ctx?.sampleRate ?? 48000))

/** Whether any voice of `soundId` is sounding (held or ringing out): a live view at rest needn't redraw. */
export function soundSounding(soundId: string): boolean {
  if (external) {
    const got = extScopes.get(soundId)
    return !!got && performance.now() - got.at <= EXT_STALE_MS
  }
  for (const v of voices) if (v.soundId === soundId) return true
  return false
}

/** The plugin engine's audio per sound (base64 16-bit, ±2 full scale), from its meter report. */
export function setExternalScopes(scopes: Record<string, string>, rate: number) {
  if (rate > 0) extScopeRate = rate
  const now = performance.now()
  extScopeSeq++
  for (const [id, b64] of Object.entries(scopes)) {
    const bin = atob(b64)
    const n = bin.length >> 1
    const data = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)
      data[i] = ((v << 16) >> 16) / 16383
    }
    extScopes.set(id, { data, seq: extScopeSeq, at: now })
  }
}

// ── offline renders (the AI agent's ears): a note of a patch or sound, faster than real time, heard by nobody ──
export interface OfflineRender {
  /** left, right */
  channels: Float32Array[]
  sampleRate: number
}
export interface OfflineOptions {
  /** seconds rendered in all */
  seconds: number
  /** when the note is let go (every voice the build started is released then) */
  releaseAt: number
  sampleRate?: number
  /** the global mod matrix it plays under (a patch's header's); default: the live one */
  matrix?: ModMatrix
  bpm?: number
  /** master chorus / delay / reverb to play through (a patch's header FX); null: dry */
  fx?: GlobalFx | null
}

/**
 * Render whatever `build` starts (with startVoice: board.startNote for a keyboard note) into an OfflineAudioContext.
 * The render is at unity gain -- before master volume, mute and the header's VOLUME -- and neutral: mod wheel, bend,
 * pressure and timbre at rest, CCs at MIDI's power-on values. Voices' own delay / reverb are part of their sound;
 * `fx` adds the patch's master effects. Live voices, the live hub and master FX are untouched.
 */
export async function renderOffline(build: () => unknown, o: OfflineOptions): Promise<OfflineRender> {
  const rate = o.sampleRate ?? 48000
  const c = new OfflineAudioContext({ numberOfChannels: 2, length: Math.max(128, Math.ceil(o.seconds * rate)), sampleRate: rate })
  await loadGrains(c)
  const matrix = o.matrix ?? globalMatrix
  const tempo = o.bpm ?? bpm
  const constant = (v: number) => {
    const n = c.createConstantSource()
    n.offset.value = v
    n.start(0)
    return n
  }
  const cc = new Float32Array(128)
  cc[7] = 100 / 127
  cc[10] = 64 / 127
  cc[11] = 1
  const renderHub: ModHub = {
    globalLfos: [matrix.lfo1, matrix.lfo2].map((l) => new LfoSource(c, lfoConfig(l, tempo), 0, 0)),
    bpm: () => tempo,
    modWheel: constant(0),
    state: { mod: 0, bend: 0, pressure: 0, timbre: 0 },
    cc,
    matrix: () => matrix,
    mpeBendRange: () => mpeBendRange,
    zero: constant(0),
  }
  let input: AudioNode
  if (o.fx) {
    const mfx = new MasterFx(c)
    mfx.apply(o.fx)
    mfx.output.connect(c.destination)
    input = mfx.input
  } else {
    input = c.createGain()
    input.connect(c.destination)
  }
  const silent = c.createGain()
  silent.gain.value = 0
  silent.connect(c.destination)
  const t: RenderTarget = { ctx: c, hub: renderHub, input, silent, voices: new Set() }
  const was = target
  target = t
  try {
    build()
  } finally {
    target = was
  }
  // pad LFOs attach once the worklet module is there (it is): let those callbacks run before rendering starts
  await loadGrains(c)
  const startedVoices = [...t.voices]
  const quantum = 128 / rate
  const off = Math.max(quantum, Math.round(o.releaseAt / quantum) * quantum)
  if (off < o.seconds) {
    void c.suspend(off).then(() => {
      for (const v of startedVoices) v.release()
      void c.resume()
    })
  }
  const out = await c.startRendering()
  for (const v of t.voices) v.stop(0)
  for (const l of renderHub.globalLfos) l.stop()
  return { channels: [out.getChannelData(0), out.getChannelData(1)], sampleRate: rate }
}

/** Also send the master output to `node` (measurements: comparing this engine with the plugin's). */
export function tapOutput(node: AudioNode) {
  getCtx()
  master.connect(node)
}
