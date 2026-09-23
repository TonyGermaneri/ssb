import { MOD_DESTS, type ModDest, type ModMatrix, type ModSource, type SoundSettings } from '../types'
import { lfoValue, modSum } from '../lib/modulation'
import { scheduleAttack, scheduleRelease, type Env } from './envelope'
import { getImpulse } from './impulse'
import {
  clipBounds, cycleSeconds, glideSemis, knobRate, playSeconds, semisToRate, tailSeconds,
  type ClipBounds, type Glide,
} from './timing'

const RAMP = 0.015 // smoothing time constant for live knob changes
const LOOKAHEAD = 0.1 // seconds of grains scheduled ahead
const TICK_MS = 25
const STRETCH_GRAIN = 0.09 // seconds
const STRETCH_OVERLAP = 4
const MAX_MARKS = 64

/** Hann window: overlapping copies sum to (roughly) constant gain. */
const HANN = (() => {
  const n = 128
  const w = new Float32Array(n)
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
  return w
})()

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
}

/** A grain, for drawing on the waveform. Positions are forward buffer seconds. */
export interface GrainMark {
  pos: number
  len: number
  when: number
  dur: number
}

/** Hann windows overlapping N times sum to N/2; scale grains so density doesn't change loudness. */
const hannCache = new Map<number, Float32Array>()
function grainWindow(overlap: number): Float32Array {
  const gain = Math.min(1, 2 / overlap)
  let w = hannCache.get(gain)
  if (!w) hannCache.set(gain, (w = HANN.map((x) => x * gain)))
  return w
}

/** Engine-wide modulation sources shared by every voice. */
export interface ModHub {
  globalLfos: OscillatorNode[]
  globalLfoStart: number
  modWheel: ConstantSourceNode
  /** channel-wide controller values (non-MPE) */
  state: { mod: number; bend: number; pressure: number; timbre: number }
  matrix: () => ModMatrix
  mpeBendRange: () => number
}

type Scope = 'global' | 'pad'
const LFO_INDEX = { lfo1: 0, lfo2: 1 } as const
/** matrix units → AudioParam units */
const PARAM_UNIT: Partial<Record<ModDest, number>> = { pitch: 100, cutoff: 1200 }
const BIPOLAR = new Set<ModSource>(['lfo1', 'lfo2', 'bend'])

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
  endTime: number
  playing = true
  /** when the release starts (Infinity until note-off / scheduled end) */
  releaseTime = Infinity
  readonly marks: GrainMark[] = []

  private clip: ClipBounds
  private kRate: number
  private speed: number
  private glide: Glide
  private velocity: number
  private ampEnv: Env
  private filtEnv: Env
  private filtPeak: number // cents

  private env: GainNode
  private filter: BiquadFilterNode
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
  private timbreValue = 0
  private padLfos: (OscillatorNode | null)[] = [null, null]
  private padLfoStart = [0, 0]
  private links: { from: AudioNode; gain: GainNode }[] = []
  private routeSig = ''
  private atValue = 0
  private bendValue = 0
  private src?: AudioBufferSourceNode
  private grains = new Set<AudioBufferSourceNode>()
  private nextGrain = 0
  private timer?: ReturnType<typeof setInterval>
  private impulseKey = ''
  private impulseTimer?: ReturnType<typeof setTimeout>
  private disposeTimer?: ReturnType<typeof setTimeout>
  private disposed = false

  constructor(
    private ctx: AudioContext,
    private buffer: AudioBuffer,
    private reversed: () => AudioBuffer,
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

    this.env.connect(this.filter).connect(this.lo).connect(this.mid).connect(this.hi)
    this.hi.connect(this.dry).connect(this.out)
    this.hi.connect(this.delay).connect(this.delayWet).connect(this.out)
    this.delay.connect(this.feedback).connect(this.delay)
    this.hi.connect(this.convolver).connect(this.reverbWet).connect(this.out)
    this.out.connect(this.trem).connect(this.panner).connect(this.kill).connect(destination)

    this.midiNote = opts.midiNote
    this.velocity = opts.velocity ?? 1
    this.channel = opts.channel
    this.atValue = opts.pressure ?? hub.state.pressure
    this.bendValue = hub.state.bend
    this.timbreValue = opts.timbre ?? hub.state.timbre
    this.atSrc.offset.value = this.atValue
    this.bendSrc.offset.value = this.bendValue
    this.velSrc.offset.value = this.velocity
    this.noteBendSrc.offset.value = opts.noteBend ?? 0
    this.timbreSrc.offset.value = this.timbreValue
    this.kind = s.grainSize > 0 ? 'cloud' : s.timeMode === 'stretch' ? 'stretch' : 'sample'
    this.clip = clipBounds(s, buffer.duration)
    this.kRate = knobRate(s)
    this.speed = s.speed
    this.ampEnv = { a: s.attack, d: s.decay, s: s.sustain, r: s.release }
    this.filtEnv = { a: s.fAttack, d: s.fDecay, s: s.fSustain, r: s.fRelease }
    this.filtPeak = s.fEnvAmount * 1200

    this.setImpulse()
    this.apply(true)

    this.t0 = c.currentTime + 0.005
    for (const k of [this.atSrc, this.bendSrc, this.velSrc, this.noteBendSrc, this.timbreSrc]) k.start(this.t0)
    this.wireRoutes()
    const note = opts.note ?? 0
    this.glide = { from: opts.glideFrom ?? note, to: note, start: this.t0, dur: opts.glideTime ?? 0 }
    this.endTime = this.t0 + playSeconds(s, this.clip.clipLen, this.kind === 'cloud', note)

    if (this.kind === 'sample') this.startSource()
    scheduleAttack(this.env.gain, this.t0, this.ampEnv, 1)
    if (this.filtPeak) scheduleAttack(this.filter.detune, this.t0, this.filtEnv, this.filtPeak)
    if (Number.isFinite(this.endTime)) this.releaseAt(Math.max(this.t0, this.endTime - this.ampEnv.r))
    if (this.kind !== 'sample') this.startGrains()
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
    const { clipIn, clipLen } = this.clip
    const rate = this.kind === 'stretch' ? this.speed : this.tapeRate(this.glide.to)
    return clipIn + ((elapsed * rate) % clipLen)
  }

  /** Wall-clock seconds per pass through the clip. */
  get cycle() {
    return cycleSeconds(this.settings, this.clip.clipLen, this.kind === 'cloud', this.glide.to)
  }

  private startSource() {
    const { clipIn, clipOut } = this.clip
    const src = this.ctx.createBufferSource()
    src.buffer = this.buffer
    src.loop = true
    src.loopStart = clipIn
    src.loopEnd = clipOut
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
    this.midiNote = midiNote
    if (this.src) {
      const p = this.src.playbackRate
      p.cancelScheduledValues(now)
      p.setValueAtTime(this.tapeRate(cur), now)
      if (dur > 0) p.exponentialRampToValueAtTime(this.tapeRate(semis), now + dur)
      else p.setValueAtTime(this.tapeRate(semis), now)
    }
  }

  // ── grains ───────────────────────────────────────────────────────────────
  private startGrains() {
    this.nextGrain = this.t0
    this.tick()
    this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  private get overlap() {
    return this.kind === 'cloud' ? Math.max(1, this.settings.grainDensity) : STRETCH_OVERLAP
  }

  private tick() {
    const s = this.settings
    const cloud = this.kind === 'cloud'
    const horizon = Math.min(this.ctx.currentTime + LOOKAHEAD, this.endTime)
    let size = STRETCH_GRAIN
    while (this.nextGrain < horizon) {
      if (cloud) size = Math.max(0.005, (s.grainSize + this.jsMod('grainSize', this.nextGrain)) / 1000)
      this.spawnGrain(this.nextGrain, size)
      this.nextGrain += size / this.overlap
    }
    if (this.nextGrain >= this.endTime && this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
      const wait = (this.endTime - this.ctx.currentTime + size) * 1000
      setTimeout(() => this.finish(), Math.max(0, wait))
    }
  }

  private spawnGrain(when: number, size: number) {
    const s = this.settings
    const cloud = this.kind === 'cloud'
    const { clipIn, clipOut, clipLen } = this.clip
    let rate = this.kRate * semisToRate(this.semisAt(when))
    if (cloud && s.grainJitter > 0) rate *= semisToRate((Math.random() * 2 - 1) * s.grainJitter)
    const bufLen = Math.min(size * rate, clipLen)

    let start: number
    if (cloud) {
      const pos = Math.min(1, Math.max(0, s.grainPos + this.jsMod('grainPos', when)))
      const center = clipIn + pos * clipLen + (Math.random() - 0.5) * s.grainWidth * clipLen
      start = center - bufLen / 2
    } else {
      start = clipIn + (((when - this.t0) * s.speed) % clipLen)
    }
    const offset = Math.min(Math.max(start, clipIn), clipOut - bufLen)
    const reverse = cloud && s.grainReverse > 0 && Math.random() < s.grainReverse
    const buf = reverse ? this.reversed() : this.buffer
    const bufOffset = reverse ? this.buffer.duration - offset - bufLen : offset
    const dur = bufLen / rate

    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate
    const g = this.ctx.createGain()
    g.gain.value = 0
    g.gain.setValueCurveAtTime(grainWindow(this.overlap), when, dur)
    let tail: AudioNode = src.connect(g)
    if (cloud && s.grainSpread > 0) {
      const pan = this.ctx.createStereoPanner()
      pan.pan.value = (Math.random() * 2 - 1) * s.grainSpread
      tail = tail.connect(pan)
    }
    tail.connect(this.env)
    this.pitchBus.connect(src.detune)
    src.start(when, Math.max(0, bufOffset), bufLen)
    src.onended = () => {
      this.pitchBus.disconnect(src.detune)
      src.disconnect()
      g.disconnect()
      this.grains.delete(src)
    }
    this.grains.add(src)
    this.marks.push({ pos: offset, len: bufLen, when, dur })
    if (this.marks.length > MAX_MARKS) this.marks.shift()
  }

  // ── live knobs ───────────────────────────────────────────────────────────
  /** Push current knob values into the graph. */
  apply(immediate = false) {
    if (this.disposed) return
    const s = this.settings
    const now = this.ctx.currentTime
    const set = (p: AudioParam, v: number) => (immediate ? (p.value = v) : p.setTargetAtTime(v, now, RAMP))
    set(this.out.gain, s.volume * (1 - s.velAmount + s.velAmount * this.velocity))
    set(this.panner.pan, s.pan)
    this.filter.type = s.filterType
    set(this.filter.frequency, s.cutoff)
    set(this.filter.Q, s.resonance)
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
    this.clip = clipBounds(s, this.buffer.duration)
    const kr = knobRate(s)
    const tuned = kr !== this.kRate || s.speed !== this.speed
    this.kRate = kr
    this.speed = s.speed
    if (this.src) {
      this.src.loopStart = this.clip.clipIn
      this.src.loopEnd = this.clip.clipOut
      if (tuned) set(this.src.playbackRate, this.tapeRate(this.glide.to))
    }
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

  private padLfo(i: 0 | 1): OscillatorNode {
    let osc = this.padLfos[i]
    if (!osc) {
      osc = this.ctx.createOscillator()
      const lfo = i ? this.settings.mod.lfo2 : this.settings.mod.lfo1
      osc.type = lfo.shape
      osc.frequency.value = lfo.rate
      // pad LFOs restart with every note
      this.padLfoStart[i] = Math.max(this.t0, this.ctx.currentTime)
      osc.start(this.padLfoStart[i])
      this.padLfos[i] = osc
    }
    return osc
  }

  private updatePadLfos() {
    const now = this.ctx.currentTime
    this.padLfos.forEach((osc, i) => {
      if (!osc) return
      const lfo = i ? this.settings.mod.lfo2 : this.settings.mod.lfo1
      osc.type = lfo.shape
      osc.frequency.setTargetAtTime(lfo.rate, now, RAMP)
    })
  }

  private sourceNode(scope: Scope, src: ModSource): AudioNode {
    switch (src) {
      case 'lfo1':
      case 'lfo2':
        return scope === 'global' ? this.hub.globalLfos[LFO_INDEX[src]] : this.padLfo(LFO_INDEX[src])
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
    }
  }

  private destTarget(dest: ModDest): AudioNode | AudioParam | null {
    switch (dest) {
      case 'pitch':
        return this.pitchBus
      case 'cutoff':
        return this.filter.detune
      case 'resonance':
        return this.filter.Q
      case 'volume':
        return this.trem.gain
      case 'pan':
        return this.panner.pan
      case 'delayMix':
        return this.delayWet.gain
      case 'reverbMix':
        return this.reverbWet.gain
      default:
        return null // grain destinations are read per grain
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
    for (const [scope, m] of this.scopes()) {
      for (const r of m.routes) {
        const to = this.destTarget(r.dest)
        if (!to || !r.amount) continue
        let gain = r.amount * MOD_DESTS[r.dest].scale * (PARAM_UNIT[r.dest] ?? 1)
        if (r.dest === 'volume' && BIPOLAR.has(r.source)) {
          gain /= 2
          tremBase += gain
        }
        wanted.push({ from: this.sourceNode(scope, r.source), to, gain, key: `${scope}:${r.source}>${r.dest}` })
      }
    }
    const now = this.ctx.currentTime
    this.trem.gain.setTargetAtTime(tremBase, now, RAMP)
    const sig = wanted.map((w) => w.key).join('|')
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
      from.disconnect(gain)
      gain.disconnect()
    }
    this.links = []
    this.routeSig = ''
  }

  /** Current value of a source, for destinations evaluated in JS (grains). */
  private sourceValue(scope: Scope, src: ModSource, t: number): number {
    switch (src) {
      case 'lfo1':
      case 'lfo2': {
        const i = LFO_INDEX[src]
        const m = scope === 'global' ? this.hub.matrix() : this.settings.mod
        const lfo = i ? m.lfo2 : m.lfo1
        const start = scope === 'global' ? this.hub.globalLfoStart : this.padLfoStart[i] || this.t0
        return lfoValue(lfo.shape, (t - start) * lfo.rate)
      }
      case 'mod':
        return this.hub.state.mod
      case 'aftertouch':
        return this.atValue
      case 'velocity':
        return this.velocity
      case 'bend':
        return this.bendValue
      case 'timbre':
        return this.timbreValue
    }
  }

  private jsMod(dest: ModDest, t: number): number {
    let sum = 0
    for (const [scope, m] of this.scopes()) sum += modSum(m.routes, dest, (src) => this.sourceValue(scope, src, t))
    return sum
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

  // ── ending ───────────────────────────────────────────────────────────────
  private releaseAt(tr: number) {
    this.releaseTime = tr
    const end = scheduleRelease(this.env.gain, this.t0, tr, this.ampEnv, 1)
    if (this.filtPeak) scheduleRelease(this.filter.detune, this.t0, tr, this.filtEnv, this.filtPeak)
    this.endTime = Math.min(this.endTime, end)
    this.src?.stop(this.endTime)
  }

  /** Note-off: run the release, then let FX tails ring out. */
  release() {
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
    clearInterval(this.timer)
    this.timer = undefined
    this.releaseTime = Math.min(this.releaseTime, now)
    for (const src of [this.src, ...this.grains]) {
      try {
        src?.stop(now + fade)
      } catch {
        /* already stopped */
      }
    }
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
    clearInterval(this.timer)
    clearTimeout(this.impulseTimer)
    clearTimeout(this.disposeTimer)
    if (this.src) this.src.onended = null
    this.unwire()
    const consts = [this.atSrc, this.bendSrc, this.velSrc, this.noteBendSrc, this.timbreSrc]
    for (const n of [...consts, ...this.padLfos]) n?.stop()
    for (const n of [this.pitchBus, this.trem, ...consts, ...this.padLfos]) n?.disconnect()
    for (const n of [this.env, this.filter, this.lo, this.mid, this.hi, this.dry, this.delay, this.feedback,
      this.delayWet, this.convolver, this.reverbWet, this.out, this.panner, this.kill]) n.disconnect()
    this.src?.disconnect()
    this.onDispose(this)
  }
}
