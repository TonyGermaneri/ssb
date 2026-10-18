import {
  MOD_DESTS, type ModDest, type ModMatrix, type ModSource, type SoundSettings, type ZoneCcMod, type ZoneLfo,
} from '../types'
import { lfoConfig, LfoSource } from './lfo'
import { isSvfType, type SvfType } from './svfMath'
import type { ToSvf } from './grains.worklet'
import { scheduleAttack, scheduleRelease, type Env } from './envelope'
import { getImpulse } from './impulse'
import { grainNode, grainsLoaded, loadGrains, type GrainNode } from './grains'
import type { GrainConfig, GrainEvent } from './grainMath'
import {
  clipBounds, cycleSeconds, glideSemis, knobRate, playSeconds, semisToRate, tailSeconds,
  type ClipBounds, type Glide,
} from './timing'

const RAMP = 0.015 // smoothing time constant for live knob changes
/** grains kept for drawing (the worklet reports a sample of them) */
const MAX_MARKS = 240

/**
 * sample:  one looping AudioBufferSourceNode (tape-style pitch/speed)
 * stretch: grains that walk through the clip at SPEED, played at PITCH
 * cloud:   grains around the GRAIN POS knob
 */
export type VoiceKind = 'sample' | 'stretch' | 'cloud'

export interface VoiceOptions {
  /** semitones from the sample's recorded pitch (keyboard play) */
  note?: number
  velocity?: number // 0..1
  glideFrom?: number
  glideTime?: number
  midiNote?: number
  /** MIDI channel (0-15); MPE per-note controllers target it */
  channel?: number
  /** initial per-note values (MPE sends these before note-on) */
  noteBend?: number
  pressure?: number
  timbre?: number
  /** play one zone of a multi-sample (SFZ) instrument instead of the pad's clip */
  zone?: ZonePlay
  /** the patch this voice plays for when it's a linked VCO (note-offs / stops follow the group) */
  group?: string
  /** VCO mix level */
  level?: number
  /** extra tuning in cents (VCO fine) */
  detune?: number
  /** VCO 1–3 signals for this voice's mod matrix (audio-rate FM / AM) */
  modTaps?: (AudioNode | null)[]
  /**
   * When the note starts (context time). A note's voices -- its VCOs, layered SFZ zones -- share it, so layers at one
   * pitch keep one phase: built one after another, each reading the clock, they could straddle a render quantum
   * (three quarters of a cycle at middle C) and add up or cancel by chance.
   */
  at?: number
}

/** A zone, resolved for playback. Times in seconds of the zone's buffer. */
export interface ZonePlay {
  audioId: string
  gain: number
  pan: number // -1..1, added to the pad's pan
  start: number
  end: number // 0 = end of buffer
  loop: [number, number] | null
  oneShot: boolean
  env?: Partial<Env>
  /** SFZ filter, already resolved for this note (keytrack / veltrack applied) */
  filter?: { type: BiquadFilterType; freq: number; resonance: number; env?: Env & { depth: number } }
  lfos?: ZoneLfo[]
  ccMods?: ZoneCcMod[]
  /** base amplitude % when amplitude_onccN is used (otherwise folded into gain) */
  amplitude?: number
}

/** A grain, for drawing on the waveform. Positions are forward buffer seconds. */
export type GrainMark = GrainEvent

/** Engine-wide modulation sources shared by every voice. */
export interface ModHub {
  globalLfos: LfoSource[]
  bpm: () => number
  modWheel: ConstantSourceNode
  /** channel-wide controller values (non-MPE) */
  state: { mod: number; bend: number; pressure: number; timbre: number }
  /** CC values 0..1, for SFZ locc/hicc and *_onccN */
  cc: Float32Array
  matrix: () => ModMatrix
  mpeBendRange: () => number
  /** a silent source for unconnected VCO slots */
  zero: ConstantSourceNode
}

type Scope = 'global' | 'pad'
const LFO_INDEX = { lfo1: 0, lfo2: 1 } as const
/** matrix units → AudioParam units */
const PARAM_UNIT: Partial<Record<ModDest, number>> = { pitch: 100, cutoff: 1200 }
const BIPOLAR = new Set<ModSource>(['lfo1', 'lfo2', 'bend', 'random', 'vco1', 'vco2', 'vco3'])
const VCO_INDEX = { vco1: 0, vco2: 1, vco3: 2 } as const
/** KEY on an envelope: its times ÷ 2^(key × semis / 12), so higher notes run it faster (Granulator III's Key > Env) */
const keyEnv = (e: Env, key: number | undefined, semis: number): Env => {
  if (!key) return e
  const kr = Math.pow(2, (key * semis) / 12)
  return { ...e, a: e.a / kr, d: e.d / kr, r: e.r / kr }
}
/** Granulator III's filter types as the nearest biquad, for the moment before its worklet has loaded */
const NEAREST_BIQUAD: Record<SvfType, BiquadFilterType> = {
  lp12: 'lowpass', lp24: 'lowpass', lphp: 'bandpass', lpnotch: 'lowpass', notch: 'notch', notch2: 'notch', hpnotch: 'highpass',
  hp12: 'highpass', hp24: 'highpass',
}
/** the grain processor's parameter for each grain destination (its right side's is this + 'R') */
const GRAIN_PARAM: Partial<Record<ModDest, string>> = {
  grainPos: 'posMod', grainSize: 'freqMod', grainSkew: 'skewMod', grainVar: 'varMod', grainDetune: 'detuneMod', grainScan: 'scanMod',
}
/** the pad LFO each LFO destination drives */
const LFO_DEST: Partial<Record<ModDest, 'lfo1' | 'lfo2'>> = { lfo1Rate: 'lfo1', lfo1Amt: 'lfo1', lfo2Rate: 'lfo2', lfo2Amt: 'lfo2' }

const zoneBounds = (z: ZonePlay, duration: number): ClipBounds => {
  const clipIn = Math.min(Math.max(0, z.start), Math.max(0, duration - 0.005))
  const clipOut = z.end > clipIn ? Math.min(z.end, duration) : duration
  return { clipIn, clipOut, clipLen: clipOut - clipIn }
}

let nextId = 1

/**
 * One playing instance of a sound with its own FX chain:
 *
 *   source(s) → amp env → filter(+env) → EQ lo/mid/hi ─┬─ dry ─────────────┐
 *                                                     ├─ delay ⟲ feedback ┼→ volume → pan → kill → out
 *                                                     └─ reverb ──────────┘
 *
 * `settings` is the live (reactive) object from the store, so grain
 * schedulers always read current knob values; `apply()` pushes them into
 * AudioParams.
 */
export class Voice {
  readonly id = nextId++
  readonly t0: number
  readonly kind: VoiceKind
  midiNote?: number
  readonly channel?: number
  readonly groupId?: string
  private level: number
  private modTaps: (AudioNode | null)[]
  endTime: number
  playing = true
  /** when the release starts (Infinity until note-off / scheduled end) */
  releaseTime = Infinity
  readonly marks: GrainMark[] = []

  private clip: ClipBounds
  private zone?: ZonePlay
  private kRate: number
  private speed: number
  private glide: Glide
  /** 0..1, as the note was struck */
  readonly velocity: number
  private ampEnv: Env
  private filtEnv: Env
  private filtPeak: number // cents
  /** semitones from ROOT (the note, or a legato slide's target) */
  private keySemis = 0

  private env: GainNode
  private filter: BiquadFilterNode
  /** Granulator III's filter (svfMath.ts), before the biquad (then a pass-through) while one of its types is chosen */
  private svf?: AudioWorkletNode
  /** every cutoff modulation but the matrix's (filter envelope, F.KEY, CCs, SFZ LFOs), cents, into whichever filter */
  private cutBus: GainNode
  /** the filter envelope (fenvSrc) × its AMT */
  private fenvCut: GainNode
  /** F.KEY: KEY × 1200 × it */
  private keyCut: GainNode
  private lo: BiquadFilterNode
  private mid: BiquadFilterNode
  private hi: BiquadFilterNode
  private dry: GainNode
  private delay: DelayNode
  private feedback: GainNode
  private delayWet: GainNode
  private convolver: ConvolverNode
  private reverbWet: GainNode
  private out: GainNode
  private panner: StereoPannerNode
  private kill: GainNode
  private trem: GainNode
  /** summed pitch modulation in cents, fanned out to every source's detune */
  private pitchBus: GainNode
  private atSrc: ConstantSourceNode
  private bendSrc: ConstantSourceNode
  private velSrc: ConstantSourceNode
  private noteBendSrc: ConstantSourceNode
  private timbreSrc: ConstantSourceNode
  /** the filter's ADSR, 0..1: FILTER ENV in the matrix */
  private fenvSrc: ConstantSourceNode
  /** octaves from ROOT: KEY in the matrix */
  private keySrc: ConstantSourceNode
  /** -1..1, drawn for the note: RANDOM in the matrix */
  private rndSrc: ConstantSourceNode
  private timbreValue = 0
  private zoneLfoNodes: OscillatorNode[] = []
  private zoneLfoGains: GainNode[] = []
  private ccPitch?: ConstantSourceNode
  private ccCut?: ConstantSourceNode
  private ccGain = 1
  private ccPan = 0
  private ccRes = 0
  private padLfos: (LfoSource | null)[] = [null, null]
  /** RATIO mode: KEY into a pad LFO's rate, 12 semitones an octave */
  private lfoKeyLinks: (GainNode | null)[] = [null, null]
  private links: { from: AudioNode; gain: GainNode }[] = []
  private routeSig = ''
  private atValue = 0
  private bendValue = 0
  private src?: AudioBufferSourceNode
  /** the grain processor (cloud / stretch), once the worklet has loaded */
  private grainVoice?: GrainNode
  private impulseKey = ''
  private impulseTimer?: ReturnType<typeof setTimeout>
  private disposeTimer?: ReturnType<typeof setTimeout>
  private disposed = false

  constructor(
    private ctx: AudioContext,
    private buffer: AudioBuffer,
    private audioId: string,
    readonly soundId: string,
    readonly settings: SoundSettings,
    destination: AudioNode,
    opts: VoiceOptions,
    private hub: ModHub,
    private onEnd: (v: Voice) => void,
    private onDispose: (v: Voice) => void,
  ) {
    const c = ctx
    const s = settings
    this.env = c.createGain()
    this.filter = c.createBiquadFilter()
    this.cutBus = c.createGain()
    this.fenvCut = c.createGain()
    this.keyCut = c.createGain()
    this.cutBus.connect(this.filter.detune)
    this.lo = c.createBiquadFilter()
    this.lo.type = 'lowshelf'
    this.lo.frequency.value = 120
    this.mid = c.createBiquadFilter()
    this.mid.type = 'peaking'
    this.mid.frequency.value = 1000
    this.mid.Q.value = 0.9
    this.hi = c.createBiquadFilter()
    this.hi.type = 'highshelf'
    this.hi.frequency.value = 8000
    this.dry = c.createGain()
    this.delay = c.createDelay(2.5)
    this.feedback = c.createGain()
    this.delayWet = c.createGain()
    this.convolver = c.createConvolver()
    this.reverbWet = c.createGain()
    this.out = c.createGain()
    this.panner = c.createStereoPanner()
    this.kill = c.createGain()
    this.trem = c.createGain()
    this.pitchBus = c.createGain()
    this.atSrc = c.createConstantSource()
    this.bendSrc = c.createConstantSource()
    this.velSrc = c.createConstantSource()
    this.noteBendSrc = c.createConstantSource()
    this.timbreSrc = c.createConstantSource()
    this.fenvSrc = c.createConstantSource()
    this.keySrc = c.createConstantSource()
    this.rndSrc = c.createConstantSource()
    this.rndSrc.offset.value = 2 * Math.random() - 1
    this.fenvCut.gain.value = 0
    this.keyCut.gain.value = 0
    this.fenvSrc.connect(this.fenvCut).connect(this.cutBus)
    this.keySrc.connect(this.keyCut).connect(this.cutBus)

    this.env.connect(this.filter).connect(this.lo).connect(this.mid).connect(this.hi)
    this.hi.connect(this.dry).connect(this.out)
    this.hi.connect(this.delay).connect(this.delayWet).connect(this.out)
    this.delay.connect(this.feedback).connect(this.delay)
    this.hi.connect(this.convolver).connect(this.reverbWet).connect(this.out)
    this.out.connect(this.trem).connect(this.panner).connect(this.kill).connect(destination)

    this.midiNote = opts.midiNote
    this.velocity = opts.velocity ?? 1
    this.groupId = opts.group
    this.level = opts.level ?? 1
    this.modTaps = opts.modTaps ?? []
    this.channel = opts.channel
    this.atValue = opts.pressure ?? hub.state.pressure
    this.bendValue = hub.state.bend
    this.timbreValue = opts.timbre ?? hub.state.timbre
    this.atSrc.offset.value = this.atValue
    this.bendSrc.offset.value = this.bendValue
    this.velSrc.offset.value = this.velocity
    this.noteBendSrc.offset.value = opts.noteBend ?? 0
    this.timbreSrc.offset.value = this.timbreValue
    this.kind = s.grain ? 'cloud' : s.timeMode === 'stretch' ? 'stretch' : 'sample'
    this.zone = opts.zone
    this.clip = this.zone ? zoneBounds(this.zone, buffer.duration) : clipBounds(s, buffer.duration)
    this.kRate = knobRate(s)
    this.speed = s.speed
    // an SFZ region's own envelope wins over the pad's ADSR, field by field
    this.keySemis = (opts.note ?? 0) + (opts.detune ?? 0) / 100
    this.ampEnv = keyEnv({ a: s.attack, d: s.decay, s: s.sustain, r: s.release, ...this.zone?.env }, s.envKey, this.keySemis)
    this.filtEnv = keyEnv({ a: s.fAttack, d: s.fDecay, s: s.fSustain, r: s.fRelease }, s.fEnvKey, this.keySemis)
    this.filtPeak = s.fEnvAmount * 1200
    // an SFZ filter EG replaces the pad's filter envelope
    const zf = this.zone?.filter?.env
    if (zf) {
      this.filtEnv = keyEnv({ a: zf.a, d: zf.d, s: zf.s, r: zf.r }, s.fEnvKey, this.keySemis)
      this.filtPeak = zf.depth
    }

    this.setImpulse()
    this.apply(true)

    this.t0 = opts.at !== undefined ? Math.max(opts.at, c.currentTime) : c.currentTime + 0.005
    for (const k of [this.atSrc, this.bendSrc, this.velSrc, this.noteBendSrc, this.timbreSrc, this.fenvSrc, this.keySrc, this.rndSrc]) k.start(this.t0)
    this.wireRoutes()
    this.startZoneLfos()
    this.applyCC()
    const detune = (opts.detune ?? 0) / 100
    const note = (opts.note ?? 0) + detune
    this.glide = { from: (opts.glideFrom ?? opts.note ?? 0) + detune, to: note, start: this.t0, dur: opts.glideTime ?? 0 }
    this.keySrc.offset.setValueAtTime(this.glide.from / 12, this.t0)
    if (this.glide.dur > 0) this.keySrc.offset.linearRampToValueAtTime(note / 12, this.t0 + this.glide.dur)
    else this.keySrc.offset.setValueAtTime(note / 12, this.t0)
    this.endTime = this.t0 + (this.zone ? this.zoneSeconds(note) : playSeconds(s, this.clip.clipLen, this.kind === 'cloud', note))

    if (this.kind === 'sample') this.startSource()
    scheduleAttack(this.env.gain, this.t0, this.ampEnv, 1)
    this.fenvCut.gain.value = this.filtPeak
    scheduleAttack(this.fenvSrc.offset, this.t0, this.filtEnv, 1)
    if (Number.isFinite(this.endTime)) this.releaseAt(Math.max(this.t0, this.endTime - this.ampEnv.r))
    if (this.kind !== 'sample') this.startGrains()
  }

  /** How long a zone plays: until note-off when it loops, else to the end of its sample. */
  private zoneSeconds(note: number) {
    if (this.zone?.loop) return Infinity
    return this.kind === 'sample' ? this.clip.clipLen / this.tapeRate(note) : this.clip.clipLen / this.speed
  }

  /** Note offset (semitones) at time t, following any glide. */
  private semisAt(t: number) {
    return glideSemis(this.glide, t)
  }
  /** Tape playback rate for the sample source. */
  private tapeRate(semis: number) {
    return this.kRate * semisToRate(semis) * this.speed
  }

  /** Still held down (not yet released)? */
  get held() {
    return this.playing && this.ctx.currentTime < this.releaseTime
  }

  /** Buffer position of the playhead, or null for grain clouds (those draw grain marks). */
  positionAt(t: number): number | null {
    if (this.kind === 'cloud') return null
    const elapsed = Math.max(0, t - this.t0)
    const { clipIn, clipOut, clipLen } = this.clip
    if (this.kind === 'stretch') return clipIn + ((elapsed * this.speed) % clipLen)
    const x = clipIn + elapsed * this.tapeRate(this.glide.to)
    if (this.zone) {
      // SFZ: play into the loop, then cycle inside it; no loop = stop at the end
      const lp = this.zone.loop
      if (lp && x > lp[1]) return lp[0] + ((x - lp[0]) % (lp[1] - lp[0]))
      return Math.min(x, clipOut)
    }
    return clipIn + ((x - clipIn) % clipLen)
  }

  /** Post-envelope, post-filter signal: what this voice feeds a patch's matrix as a VCO. */
  get tap(): AudioNode {
    return this.hi
  }

  /** Length of the buffer this voice plays (zones each have their own). */
  get bufferDuration() {
    return this.buffer.duration
  }

  /** Wall-clock seconds per pass through the clip. */
  get cycle() {
    return cycleSeconds(this.settings, this.clip.clipLen, this.kind === 'cloud', this.glide.to)
  }

  private startSource() {
    const { clipIn, clipOut } = this.clip
    const src = this.ctx.createBufferSource()
    src.buffer = this.buffer
    // zones loop only between their loop points (if any); pads loop the clip (repeat count stops them)
    const loop = this.zone ? this.zone.loop : ([clipIn, clipOut] as [number, number])
    src.loop = !!loop
    if (loop) {
      src.loopStart = loop[0]
      src.loopEnd = loop[1]
    }
    const p = src.playbackRate
    const to = this.tapeRate(this.glide.to)
    if (this.glide.dur > 0 && this.glide.from !== this.glide.to) {
      p.setValueAtTime(this.tapeRate(this.glide.from), this.t0)
      p.exponentialRampToValueAtTime(to, this.t0 + this.glide.dur)
    } else p.value = to
    src.connect(this.env)
    this.pitchBus.connect(src.detune)
    src.start(this.t0, clipIn)
    src.onended = () => this.finish()
    this.src = src
  }

  /** Slide to a new note without retriggering (mono legato). */
  glideTo(semis: number, dur: number, midiNote?: number) {
    const now = this.ctx.currentTime
    const cur = this.semisAt(now)
    this.glide = { from: cur, to: semis, start: now, dur }
    this.keySemis = semis
    this.keySrc.offset.cancelScheduledValues(now)
    this.keySrc.offset.setValueAtTime(cur / 12, now)
    if (dur > 0) this.keySrc.offset.linearRampToValueAtTime(semis / 12, now + dur)
    else this.keySrc.offset.setValueAtTime(semis / 12, now)
    this.midiNote = midiNote
    if (this.src) {
      const p = this.src.playbackRate
      p.cancelScheduledValues(now)
      p.setValueAtTime(this.tapeRate(cur), now)
      if (dur > 0) p.exponentialRampToValueAtTime(this.tapeRate(semis), now + dur)
      else p.setValueAtTime(this.tapeRate(semis), now)
    }
    this.regrain()
    if (this.settings.volKey) this.apply() // K>VOL follows the new note
  }

  // ── grains ───────────────────────────────────────────────────────────────
  /** What the grain processor plays: the knobs as they are now (sent again whenever one moves). */
  private grainConfig(): GrainConfig {
    const s = this.settings
    return {
      kind: this.kind === 'cloud' ? 'cloud' : 'stretch',
      clipIn: this.clip.clipIn,
      clipOut: this.clip.clipOut,
      freq: s.grainFreq,
      freqKey: s.grainFreqKey,
      freqRnd: s.grainFreqRnd,
      stereo: s.grainStereo,
      pos: s.grainPos,
      posKey: s.grainPosKey,
      spray: s.grainSpray,
      spraySlope: s.grainSpraySlope,
      spraySign: s.grainSpraySign,
      window: s.grainWindow,
      symmetry: s.grainSymmetry,
      tuneKey: s.grainTuneKey,
      tuneRnd: s.grainTuneRnd,
      ampMode: s.grainAmpMode,
      amp: s.grainAmp,
      voidLevel: s.grainVoid,
      fm: s.grainFm,
      fmFreq: s.grainFmFreq,
      fmAmount: s.grainFmAmount,
      fmKey: s.grainFmKey,
      scan: s.grainScanOn,
      scanTime: s.grainScanTime,
      scanDist: s.grainScanDist,
      scanCurve: s.grainScanCurve,
      scanLoop: s.grainScanLoop,
      scanKey: s.grainScanKey,
      mode: s.grainMode,
      skew: s.grainSkew,
      density: s.grainDensity,
      reverse: s.grainReverse,
      variation: s.grainVariation,
      varPos: s.grainVarPos,
      varSize: s.grainVarSize,
      varPitch: s.grainVarPitch,
      varVol: s.grainVarVol,
      detune: s.grainDetune,
      noteRnd: s.grainNoteRnd,
      speed: s.speed,
      kRate: this.kRate,
      glide: { ...this.glide },
      t0: this.t0,
      end: this.endTime,
    }
  }

  /** The grain processor starts as soon as the worklet module is there (at once, after the first notes). */
  private startGrains() {
    if (this.disposed || !this.playing) return
    if (!grainsLoaded()) {
      void loadGrains(this.ctx).then(() => this.startGrains())
      return
    }
    const g = grainNode(
      this.ctx,
      this.audioId,
      this.buffer,
      this.grainConfig(),
      (list) => {
        this.marks.push(...list)
        if (this.marks.length > MAX_MARKS) this.marks.splice(0, this.marks.length - MAX_MARKS)
      },
      () => this.finish(),
    )
    g.node.connect(this.env)
    this.pitchBus.connect(g.node.parameters.get('detune')!)
    this.grainVoice = g
    this.wireRoutes() // GRAIN POS / SIZE routes land on the processor's parameters
  }

  /** Tell the grain processor about new knob values, end time or glide. */
  private regrain() {
    this.grainVoice?.configure(this.grainConfig())
  }

  // ── Granulator III's filter ──────────────────────────────────────────────
  /** Put Granulator III's filter in (as `type`) or take it out (null); rewires the routes when that changes. */
  private setSvf(type: SvfType | null): AudioWorkletNode | undefined {
    const send = (m: ToSvf) => this.svf?.port.postMessage(m)
    if (type && this.svf) {
      if (type !== this.svfType) send({ type: 'set', svf: type })
      this.svfType = type
      return this.svf
    }
    if (type) {
      if (!grainsLoaded()) return undefined
      const node = new AudioWorkletNode(this.ctx, 'ssb-svf', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
        processorOptions: { svf: type },
      })
      this.env.disconnect(this.filter)
      this.env.connect(node).connect(this.filter)
      this.cutBus.connect(node.parameters.get('detune')!)
      this.cutBus.connect(node.parameters.get('detuneR')!)
      this.svf = node
      this.svfType = type
    } else if (this.svf) {
      send({ type: 'stop' })
      this.env.disconnect(this.svf)
      this.svf.disconnect()
      this.cutBus.disconnect(this.svf.parameters.get('detune')!)
      this.cutBus.disconnect(this.svf.parameters.get('detuneR')!)
      this.env.connect(this.filter)
      this.svf = undefined
    } else return undefined
    if (this.routeSig) this.wireRoutes()
    return this.svf
  }
  private svfType?: SvfType

  // ── live knobs ───────────────────────────────────────────────────────────
  /** Push current knob values into the graph. */
  apply(immediate = false) {
    if (this.disposed) return
    const s = this.settings
    const now = this.ctx.currentTime
    const set = (p: AudioParam, v: number) => (immediate ? (p.value = v) : p.setTargetAtTime(v, now, RAMP))
    // K>VOL: dB an octave from ROOT
    const keyGain = Math.pow(10, ((s.volKey ?? 0) * this.keySemis) / 12 / 20)
    set(this.out.gain, s.volume * keyGain * (1 - s.velAmount + s.velAmount * this.velocity) * (this.zone?.gain ?? 1) * this.ccGain * this.level)
    set(this.panner.pan, Math.min(1, Math.max(-1, s.pan + (this.zone?.pan ?? 0) + this.ccPan)))
    const zf = this.zone?.filter
    if (zf) {
      // SFZ-defined filter replaces the pad's (resonance dB → Q around Butterworth)
      this.filter.type = zf.type
      set(this.filter.frequency, Math.min(20000, Math.max(10, zf.freq)))
      set(this.filter.Q, Math.max(0.1, 0.707 * Math.pow(10, (zf.resonance + this.ccRes) / 20)))
    } else {
      const q = Math.max(0.1, s.resonance * Math.pow(10, this.ccRes / 20))
      const svf = isSvfType(s.filterType) ? this.setSvf(s.filterType) : this.setSvf(null)
      if (svf) {
        this.filter.type = 'peaking' // at 0 dB: passes everything as it is
        this.filter.gain.value = 0
        set(svf.parameters.get('freq')!, s.cutoff)
        set(svf.parameters.get('q')!, q)
        set(svf.parameters.get('width')!, s.filterWidth ?? -12)
      } else {
        // (Granulator III's types before the worklet has loaded: the nearest biquad)
        this.filter.type = isSvfType(s.filterType) ? NEAREST_BIQUAD[s.filterType] : (s.filterType as BiquadFilterType)
        set(this.filter.frequency, s.cutoff)
        set(this.filter.Q, q)
      }
    }
    set(this.keyCut.gain, zf ? 0 : 1200 * (s.filterKey ?? 0))
    set(this.lo.gain, s.eqLow)
    set(this.mid.gain, s.eqMid)
    set(this.hi.gain, s.eqHigh)
    set(this.delay.delayTime, Math.max(0.01, s.delayTime))
    set(this.feedback.gain, Math.min(0.95, s.delayFeedback))
    set(this.delayWet.gain, s.delayMix)
    set(this.reverbWet.gain, s.reverbMix)
    if (immediate || !this.playing) return

    this.updatePadLfos()
    this.wireRoutes()
    if (!this.zone) this.clip = clipBounds(s, this.buffer.duration)
    const kr = knobRate(s)
    const tuned = kr !== this.kRate || s.speed !== this.speed
    this.kRate = kr
    this.speed = s.speed
    if (this.src) {
      if (!this.zone) {
        this.src.loopStart = this.clip.clipIn
        this.src.loopEnd = this.clip.clipOut
      }
      if (tuned) set(this.src.playbackRate, this.tapeRate(this.glide.to))
    }
    this.regrain()
    clearTimeout(this.impulseTimer)
    this.impulseTimer = setTimeout(() => this.setImpulse(), 150)
  }

  private setImpulse() {
    const { reverbSize, reverbDecay } = this.settings
    const key = `${reverbSize}|${reverbDecay}`
    if (key === this.impulseKey || this.disposed) return
    this.impulseKey = key
    this.convolver.buffer = getImpulse(this.ctx, reverbSize, reverbDecay)
  }

  // ── modulation ───────────────────────────────────────────────────────────
  private scopes(): [Scope, ModMatrix][] {
    return [
      ['global', this.hub.matrix()],
      ['pad', this.settings.mod],
    ]
  }

  private lfoCfg(i: 0 | 1) {
    return i ? this.settings.mod.lfo2 : this.settings.mod.lfo1
  }

  /** Pad LFOs are created on first use and start with every note at their PHASE (FREE: where one running all along
   *  would be). */
  private padLfo(i: 0 | 1): LfoSource {
    let lfo = this.padLfos[i]
    if (!lfo) {
      const cfg = this.lfoCfg(i)
      const phase = cfg.phase < 0 ? null : cfg.phase / 360
      lfo = new LfoSource(this.ctx, lfoConfig(cfg, this.hub.bpm()), Math.max(this.t0, this.ctx.currentTime), phase)
      this.padLfos[i] = lfo
      this.followNote(i)
    }
    return lfo
  }

  /** RATIO mode: a pad LFO follows the note, KEY (gliding with it) into its rate at 12 semitones an octave. */
  private followNote(i: 0 | 1) {
    const lfo = this.padLfos[i]
    if (!lfo) return
    const want = this.lfoCfg(i).ratioMode
    const link = this.lfoKeyLinks[i]
    if (want && !link) {
      const g = this.ctx.createGain()
      g.gain.value = 12
      this.keySrc.connect(g).connect(lfo.rateIn)
      this.lfoKeyLinks[i] = g
    } else if (!want && link) {
      this.keySrc.disconnect(link)
      link.disconnect()
      this.lfoKeyLinks[i] = null
    }
  }

  private updatePadLfos() {
    for (const i of [0, 1] as const) {
      this.padLfos[i]?.set(lfoConfig(this.lfoCfg(i), this.hub.bpm()))
      this.followNote(i)
    }
  }

  /** A source's right side: an LFO's own (STEREO), anything else the same as its left. */
  private sourceNodeR(scope: Scope, src: ModSource): AudioNode {
    if (src === 'lfo1' || src === 'lfo2')
      return scope === 'global' ? this.hub.globalLfos[LFO_INDEX[src]].outputR : this.padLfo(LFO_INDEX[src]).outputR
    return this.sourceNode(scope, src)
  }

  private sourceNode(scope: Scope, src: ModSource): AudioNode {
    switch (src) {
      case 'lfo1':
      case 'lfo2':
        return scope === 'global' ? this.hub.globalLfos[LFO_INDEX[src]].output : this.padLfo(LFO_INDEX[src]).output
      case 'mod':
        return this.hub.modWheel
      case 'aftertouch':
        return this.atSrc
      case 'velocity':
        return this.velSrc
      case 'bend':
        return this.bendSrc
      case 'timbre':
        return this.timbreSrc
      case 'fenv':
        return this.fenvSrc
      case 'key':
        return this.keySrc
      case 'random':
        return this.rndSrc
      case 'vco1':
      case 'vco2':
      case 'vco3':
        return this.modTaps[VCO_INDEX[src]] ?? this.hub.zero
    }
  }

  /** A grain destination's right side (each side reads its own; an LFO's STEREO plays them apart). */
  private destTargetR(dest: ModDest): AudioParam | null {
    if (dest === 'cutoff') return this.svf?.parameters.get('detuneR') ?? null
    const p = GRAIN_PARAM[dest]
    return (p && this.grainVoice?.node.parameters.get(p + 'R')) || null
  }

  private destTarget(dest: ModDest): AudioNode | AudioParam | null {
    switch (dest) {
      case 'pitch':
        return this.pitchBus
      case 'cutoff':
        return this.svf?.parameters.get('detune') ?? this.filter.detune
      case 'resonance':
        return this.svf?.parameters.get('q') ?? this.filter.Q
      case 'volume':
        return this.trem.gain
      case 'pan':
        return this.panner.pan
      case 'delayMix':
        return this.delayWet.gain
      case 'reverbMix':
        return this.reverbWet.gain
      case 'grainPos':
      case 'grainSize':
      case 'grainSkew':
      case 'grainVar':
      case 'grainDetune':
      case 'grainScan':
        return this.grainVoice?.node.parameters.get(GRAIN_PARAM[dest]!) ?? null
      case 'lfo1Rate':
        return this.padLfo(0).rateIn
      case 'lfo1Amt':
        return this.padLfo(0).depthIn
      case 'lfo2Rate':
        return this.padLfo(1).rateIn
      case 'lfo2Amt':
        return this.padLfo(1).depthIn
    }
  }

  /**
   * Audio-rate routes: source → gain(amount) → AudioParam. Rebuilt when the
   * set of routes changes; amount changes just retarget the gains.
   * Pitch bend → pitch is always wired, scaled by the pad's bend range.
   */
  private wireRoutes() {
    const wanted: { from: AudioNode; to: AudioNode | AudioParam; gain: number; key: string }[] = [
      { from: this.bendSrc, to: this.pitchBus, gain: this.settings.bendRange * 100, key: 'bend' },
      { from: this.noteBendSrc, to: this.pitchBus, gain: this.hub.mpeBendRange() * 100, key: 'noteBend' },
    ]
    // Volume is a multiplier, so two-sided sources (LFOs, bend) are mapped to 0..1 for it:
    // gain = 1 + amount·(x+1)/2. Negative amounts give true tremolo and never boost.
    let tremBase = 1
    // the pad's LFOs into each other's RATE / AMOUNT: one way only (both ways would be a loop with no delay)
    const lfoEdges = new Set<string>()
    for (const [scope, m] of this.scopes()) {
      for (const r of m.routes) {
        if (!r.amount) continue
        const into = LFO_DEST[r.dest]
        if (into) {
          if (scope !== 'pad' || r.source === into) continue
          if (r.source === 'lfo1' || r.source === 'lfo2') {
            if (lfoEdges.has(`${into}>${r.source}`)) continue
            lfoEdges.add(`${r.source}>${into}`)
          }
        }
        const to = this.destTarget(r.dest)
        if (!to) continue
        let gain = r.amount * MOD_DESTS[r.dest].scale * (PARAM_UNIT[r.dest] ?? 1)
        if (r.dest === 'volume' && BIPOLAR.has(r.source)) {
          gain /= 2
          tremBase += gain
        }
        wanted.push({ from: this.sourceNode(scope, r.source), to, gain, key: `${scope}:${r.source}>${r.dest}` })
        const toR = this.destTargetR(r.dest)
        if (toR) wanted.push({ from: this.sourceNodeR(scope, r.source), to: toR, gain, key: `${scope}:${r.source}>${r.dest}:R` })
      }
    }
    const now = this.ctx.currentTime
    this.trem.gain.setTargetAtTime(tremBase, now, RAMP)
    const sig = (this.svf ? 'svf|' : 'bq|') + wanted.map((w) => w.key).join('|')
    if (sig === this.routeSig) {
      wanted.forEach((w, i) => this.links[i].gain.gain.setTargetAtTime(w.gain, now, RAMP))
      return
    }
    this.unwire()
    for (const w of wanted) {
      const g = this.ctx.createGain()
      g.gain.value = w.gain
      w.from.connect(g)
      g.connect(w.to as AudioParam)
      this.links.push({ from: w.from, gain: g })
    }
    this.routeSig = sig
  }

  private unwire() {
    for (const { from, gain } of this.links) {
      try {
        from.disconnect(gain)
      } catch {
        /* the source (a VCO voice) may already be gone */
      }
      gain.disconnect()
    }
    this.links = []
    this.routeSig = ''
  }

  /** Aftertouch / pressure, 0..1. */
  setPressure(v: number) {
    this.atValue = v
    this.atSrc.offset.setTargetAtTime(v, this.ctx.currentTime, 0.01)
  }

  /** Pitch bend, -1..1 (scaled by the pad's bend range). */
  setBend(v: number) {
    this.bendValue = v
    this.bendSrc.offset.setTargetAtTime(v, this.ctx.currentTime, 0.005)
  }

  /** MPE per-note pitch bend, -1..1 (scaled by the MPE bend range). */
  setNoteBend(v: number) {
    this.noteBendSrc.offset.setTargetAtTime(v, this.ctx.currentTime, 0.005)
  }

  /** Timbre / CC74 / MPE Y, 0..1. */
  setTimbre(v: number) {
    this.timbreValue = v
    this.timbreSrc.offset.setTargetAtTime(v, this.ctx.currentTime, 0.01)
  }

  // ── SFZ zone LFOs and CC opcodes ──────────────────────────────────────────
  private startZoneLfos() {
    for (const l of this.zone?.lfos ?? []) {
      const osc = this.ctx.createOscillator()
      osc.type = l.wave
      osc.frequency.value = l.freq
      const g = this.ctx.createGain()
      const sign = l.invert ? -1 : 1
      switch (l.target) {
        case 'pitch':
          g.gain.value = sign * l.depth // cents
          osc.connect(g).connect(this.pitchBus)
          break
        case 'cutoff':
          g.gain.value = sign * l.depth // cents
          osc.connect(g).connect(this.cutBus)
          break
        case 'volume':
          g.gain.value = sign * (Math.pow(10, Math.abs(l.depth) / 20) - 1) // ±dB → gain swing
          osc.connect(g).connect(this.trem.gain)
          break
        case 'pan':
          g.gain.value = (sign * l.depth) / 100
          osc.connect(g).connect(this.panner.pan)
          break
      }
      osc.start(this.t0 + l.delay)
      this.zoneLfoNodes.push(osc)
      this.zoneLfoGains.push(g)
    }
  }

  /** Recompute SFZ *_onccN offsets from the current CC values. */
  applyCC() {
    const mods = this.zone?.ccMods
    if (!mods || this.disposed) return
    const cc = this.hub.cc
    let db = 0
    // amplitude_onccN modifiers multiply (as in ARIA / sfizz): 100 % at CC 127 = unity when the CC is full
    let amp = (this.zone?.amplitude ?? 100) / 100
    let pan = 0
    let cents = 0
    let cut = 0
    let res = 0
    for (const m of mods) {
      const v = cc[m.cc] ?? 0
      if (m.target === 'volume') db += m.amount * v
      else if (m.target === 'amplitude') amp *= (m.amount / 100) * v
      else if (m.target === 'pan') pan += (m.amount / 100) * v
      else if (m.target === 'pitch') cents += m.amount * v
      else if (m.target === 'cutoff') cut += m.amount * v
      else res += m.amount * v
    }
    this.ccGain = Math.pow(10, db / 20) * Math.max(0, amp)
    this.ccPan = pan
    this.ccRes = res
    const now = this.ctx.currentTime
    if (mods.some((m) => m.target === 'pitch')) {
      if (!this.ccPitch) {
        this.ccPitch = this.ctx.createConstantSource()
        this.ccPitch.connect(this.pitchBus)
        this.ccPitch.start()
      }
      this.ccPitch.offset.setTargetAtTime(cents, now, RAMP)
    }
    if (mods.some((m) => m.target === 'cutoff')) {
      if (!this.ccCut) {
        this.ccCut = this.ctx.createConstantSource()
        this.ccCut.connect(this.cutBus)
        this.ccCut.start()
      }
      this.ccCut.offset.setTargetAtTime(cut, now, RAMP)
    }
    this.apply(!this.playing)
  }

  // ── ending ───────────────────────────────────────────────────────────────
  private releaseAt(tr: number) {
    this.releaseTime = tr
    const end = scheduleRelease(this.env.gain, this.t0, tr, this.ampEnv, 1)
    scheduleRelease(this.fenvSrc.offset, this.t0, tr, this.filtEnv, 1)
    this.endTime = Math.min(this.endTime, end)
    this.src?.stop(this.endTime)
    this.regrain()
  }

  /** Note-off: run the release, then let FX tails ring out. */
  release() {
    if (this.zone?.oneShot) return // one_shot regions ignore note-off
    const now = this.ctx.currentTime
    if (!this.playing || now >= this.releaseTime) return
    this.releaseAt(Math.max(now, this.t0))
  }

  /** Source finished on its own — let delay/reverb tails ring, then clean up. */
  private finish() {
    if (!this.playing) return
    this.playing = false
    this.onEnd(this)
    const tail = tailSeconds(this.settings)
    this.disposeTimer = setTimeout(() => this.dispose(), (tail + 0.2) * 1000)
  }

  /** Hard stop now (including tails) with a short fade to avoid clicks. */
  stop(fade = 0.03) {
    if (this.disposed) return
    const now = this.ctx.currentTime
    const g = this.kill.gain
    g.cancelScheduledValues(now)
    g.setValueAtTime(g.value, now)
    g.linearRampToValueAtTime(0, now + fade)
    this.releaseTime = Math.min(this.releaseTime, now)
    try {
      this.src?.stop(now + fade)
    } catch {
      /* already stopped */
    }
    this.grainVoice?.stop()
    if (this.playing) {
      this.playing = false
      this.onEnd(this)
    }
    clearTimeout(this.disposeTimer)
    this.disposeTimer = setTimeout(() => this.dispose(), (fade + 0.05) * 1000)
  }

  private dispose() {
    if (this.disposed) return
    this.disposed = true
    clearTimeout(this.impulseTimer)
    clearTimeout(this.disposeTimer)
    if (this.src) this.src.onended = null
    this.unwire()
    const consts = [this.atSrc, this.bendSrc, this.velSrc, this.noteBendSrc, this.timbreSrc, this.fenvSrc, this.keySrc, this.rndSrc]
    for (const n of consts) n.stop()
    for (const n of this.padLfos) n?.stop()
    for (const n of this.lfoKeyLinks) n?.disconnect()
    for (const n of [...this.zoneLfoNodes, this.ccPitch, this.ccCut]) {
      n?.stop()
      n?.disconnect()
    }
    for (const g of this.zoneLfoGains) g.disconnect()
    for (const n of [this.pitchBus, this.trem, ...consts]) n.disconnect()
    this.svf?.port.postMessage({ type: 'stop' } satisfies ToSvf)
    for (const n of [this.svf, this.cutBus, this.fenvCut, this.keyCut]) n?.disconnect()
    for (const n of [this.env, this.filter, this.lo, this.mid, this.hi, this.dry, this.delay, this.feedback,
      this.delayWet, this.convolver, this.reverbWet, this.out, this.panner, this.kill]) n.disconnect()
    this.src?.disconnect()
    this.grainVoice?.node.disconnect()
    this.onDispose(this)
  }
}
