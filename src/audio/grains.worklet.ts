/**
 * The grain engine, one processor per grain voice, rendering sample by sample the way native/engine does.
 *
 * cloud, each side (left, right) on its own, in one of Granulator III's modes (grainMath.ts):
 *   CLASSIC -- Granulator II's voice. A phasor at the GRAIN frequency runs two grain slots, A starting when the
 *     phasor wraps and B half a period later, each windowed by the phasor's phase (B's shifted half a cycle, both
 *     bent by SKEW), so a slot's grain lasts exactly one period and two always overlap. Phase wraps are found
 *     between samples, and a grain that starts between them begins that far in.
 *   LOOP -- a segment one grain long, then the next from wherever POS is by then, crossfading (equal power) over
 *     SKEW of it; REVERSE is the chance a segment plays backwards.
 *   CLOUD -- DENSITY grains, the i-th lasting 1 + √i grains, starting staggered and restarting as each ends.
 *   Every grain draws its start position, pitch and level when it starts and reads on from there; FM swings the
 *   read position.
 * stretch: grains that walk through the clip at SPEED, played at PITCH.
 *
 * Samples are sent once per context and shared by every processor in this AudioWorkletGlobalScope.
 *
 * The matrix's LFOs run here too (LfoProcessor): two outputs, left and right. So does Granulator III's filter
 * (SvfProcessor), for the FILTER types that are its.
 */
import {
  cloudGain, cloudLength, DENSITY_MAX, DENSITY_MIN, FREQ_RND_RATE, FREQ_RND_SEMIS, grainLevel, hann, loopFade,
  loopSegment, MAX_PHASE_STEP, readAt, scanRate, scanWrap, skewExponent, skewPhase, sprayOffset, STRETCH_GRAIN,
  STRETCH_OVERLAP, tuneRndRatio, varGain, varPitchRatio, varPosOffset, varSizeRatio, windowAt, windowTable,
  type FromGrains, type GrainConfig, type GrainEvent, type ToGrains,
} from './grainMath'
import { glideSemis, semisToRate } from './timing'
import { LfoState, type LfoOptions, type ToLfo } from './lfoMath'
import { SVF_EVERY, SVF_SMOOTH, SVF_TABLE, svfG, svfQ2, svfTick, type SvfState, type SvfType } from './svfMath'

declare const sampleRate: number
declare const currentTime: number
declare function registerProcessor(name: string, ctor: unknown): void
declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor(options?: unknown)
}

interface Sample {
  ch: Float32Array[]
  rate: number
}
const samples = new Map<string, Sample>()

/** A grain: where it reads, how fast, how loud. CLASSIC's slots, LOOP's heads and CLOUD's grains are all one. */
interface Slot {
  on: boolean
  pos: number // frames into the sample
  step: number // frames per output sample
  amp: number
  e: number // CLASSIC: SKEW's exponent on its window, as it started
}
const newSlot = (): Slot => ({ on: false, pos: 0, step: 1, amp: 1, e: 1 })

/** LOOP, one side: the segment playing and the one fading out. */
interface LoopSide {
  cur: Slot & { dir: number; end: number }
  old: Slot & { dir: number }
  xf: number // crossfade 0..1 (1: done)
  xfStep: number
  room: number // frames free past the current segment's end, for the next crossfade
  due: boolean // the current segment has run out: the next starts
}
const newLoopSide = (): LoopSide => ({
  cur: { ...newSlot(), dir: 1, end: 0 },
  old: { ...newSlot(), dir: 1 },
  xf: 1,
  xfStep: 1,
  room: 0,
  due: true,
})

/** CLOUD, one grain: a slot with its own window phase. */
interface CloudGrain extends Slot {
  phase: number // 0..1 through its window; at 1 it starts again
  phaseStep: number
}
/** CLOUD's grains a side: room for the most DENSITY can ask for. */
const CLOUD_MAX = DENSITY_MAX

/** A stretch grain. */
interface StretchGrain {
  pos: number
  step: number
  k: number // PITCH / FINE (as a rate) when it started: it follows the knobs as they turn
  length: number
  index: number
  from: number
}

/** grain starts reported to the page per message (it only draws them) */
const REPORT_MAX = 48
const REPORT_EVERY = 1024
const STRETCH_POOL = 64

class GrainProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // cents from the voice's pitch bus (bend, MPE, pitch routes): part of the note, k-rate like a source's detune
      { name: 'detune', defaultValue: 0, automationRate: 'k-rate' },
      // mod matrix -> GRAIN POS (fraction of the clip), read as each grain starts
      { name: 'posMod', defaultValue: 0, automationRate: 'a-rate' },
      // mod matrix -> GRAIN (semitones), like Granulator II's Grain<LFO
      { name: 'freqMod', defaultValue: 0, automationRate: 'a-rate' },
      // mod matrix -> SKEW (0..1), VARIATION (0..1) and DETUNE (semitones), read as each grain starts
      { name: 'skewMod', defaultValue: 0, automationRate: 'a-rate' },
      { name: 'varMod', defaultValue: 0, automationRate: 'a-rate' },
      { name: 'detuneMod', defaultValue: 0, automationRate: 'a-rate' },
      // mod matrix -> SCAN's speed, × (1 + it)
      { name: 'scanMod', defaultValue: 0, automationRate: 'a-rate' },
      // each of those for the right side (an LFO's STEREO sets the sides apart; other sources feed both alike)
      ...['posMod', 'freqMod', 'skewMod', 'varMod', 'detuneMod', 'scanMod'].map((name) => ({ name: name + 'R', defaultValue: 0, automationRate: 'a-rate' })),
    ]
  }

  private cfg: GrainConfig
  private id: string
  private sample?: Sample
  private asked = false
  private events: GrainEvent[] = []
  private sinceReport = 0
  private stopped = false

  // cloud
  private started = false
  /** semitones: this note's random pitch (N<RND), drawn when it starts */
  private noteSemis = 0
  private phase = [0, 0]
  /** CLASSIC: [left A, left B, right A, right B] */
  private slots: Slot[] = [newSlot(), newSlot(), newSlot(), newSlot()]
  /** CLASSIC: each side's VARIATION on grain length, drawn as each grain starts (it sets the phasor's speed) */
  private sizeVar = [1, 1]
  private loops: LoopSide[] = [newLoopSide(), newLoopSide()]
  private clouds: CloudGrain[][] = [0, 1].map(() =>
    Array.from({ length: CLOUD_MAX }, () => ({ ...newSlot(), phase: 0, phaseStep: 0 })),
  )
  /** CLOUD: grains a side, fixed when the note starts */
  private cloudCount = 0
  /** CLOUD: each side's grains are set going (at the note, or when MODE turns to CLOUD while it sounds) */
  private cloudLive = [false, false]
  /** this sample's routes to SKEW, VARIATION and DETUNE, left and right */
  private mSkew = [0, 0]
  private mVar = [0, 0]
  private mDetune = [0, 0]
  /** SCAN: how far each side has got, as a share of S.DIST (before CURVE) */
  private scanX = [0, 0]
  private rnd = { from: 0, to: 0, phase: 1 }
  private fmPhase = 0
  private window = windowTable(0, 'std')
  private windowKey = ''

  // stretch
  private grains: StretchGrain[] = []
  private nextStretch = 0

  constructor(options: { processorOptions: { id: string; config: GrainConfig; sample?: Sample } }) {
    super()
    const o = options.processorOptions
    this.id = o.id
    this.cfg = o.config
    this.nextStretch = o.config.t0
    if (o.sample) samples.set(o.id, o.sample)
    this.port.onmessage = (e: MessageEvent<ToGrains>) => {
      const m = e.data
      if (m.type === 'config') this.cfg = m.config
      else if (m.type === 'sample') samples.set(m.id, { ch: m.channels, rate: m.rate })
      else if (m.type === 'stop') this.stopped = true
    }
  }

  private post(m: FromGrains) {
    this.port.postMessage(m)
  }

  private report(e: GrainEvent) {
    if (this.events.length < REPORT_MAX) this.events.push(e)
  }

  // ── cloud ──────────────────────────────────────────────────────────────────

  /** VARIATION, with its routes */
  private variation(side: number): number {
    return Math.min(1, Math.max(0, this.cfg.variation + this.mVar[side]))
  }

  /** SKEW, with its routes */
  private skew(side: number): number {
    return Math.min(1, Math.max(0, this.cfg.skew + this.mSkew[side]))
  }

  /** Where a grain starting now on side `side` reads from, seconds of the sample: POS (and its routes), SPRAY, SCAN
   *  and VARIATION's offset. */
  private grainAt(side: number, semis: number, posMod: number): number {
    const c = this.cfg
    const clipLen = Math.max(1e-4, c.clipOut - c.clipIn)
    const scanD = c.scanDist * clipLen
    return c.clipIn + (c.pos + posMod + c.posKey * 0.01 * semis) * clipLen +
      sprayOffset(c.spray, c.spraySlope, c.spraySign, Math.random(), Math.random()) / 1000 +
      (c.scan && scanD > 0 ? scanD * Math.pow(this.scanX[side], c.scanCurve) : 0) +
      varPosOffset(c.varPos, this.variation(side), Math.random())
  }

  /** A grain's playback rate on side `side`: PITCH / FINE, the note (T<KEY), T<RND, DETUNE and the note's N<RND. */
  private grainRate(side: number, semis: number): number {
    const c = this.cfg
    const detune = (side ? 1 : -1) * (c.detune + this.mDetune[side])
    return c.kRate * semisToRate(semis * c.tuneKey + detune + this.noteSemis) *
      (c.tuneRnd > 0 ? tuneRndRatio(c.tuneRnd, Math.random()) : 1)
  }

  /** A grain's level: FLUX / VOID, then VARIATION's. */
  private grainGain(side: number): number {
    const c = this.cfg
    return (c.amp > 0 ? grainLevel(c.ampMode, c.amp, c.voidLevel, Math.random()) : 1) *
      varGain(c.varVol, this.variation(side), Math.random())
  }

  /** CLASSIC: slot `si` of side `side` starts a grain at time `t`, `lead` samples ago (between this sample and the
   *  last). `f` is the side's GRAIN frequency; VARIATION redraws how long its grains are from here on. */
  private startSlot(si: number, side: number, t: number, lead: number, semis: number, posMod: number, smp: Sample, f: number) {
    const c = this.cfg
    const slot = this.slots[si]
    const at = this.grainAt(side, semis, posMod)
    const rate = this.grainRate(side, semis)
    slot.step = (rate * smp.rate) / sampleRate
    slot.pos = at * smp.rate + slot.step * lead
    slot.amp = this.grainGain(side)
    slot.on = true
    slot.e = skewExponent(this.skew(side))
    this.sizeVar[side] = varSizeRatio(c.varSize, this.variation(side), Math.random())
    const dur = this.sizeVar[side] / f
    this.report({ when: t - lead / sampleRate, pos: at, len: dur * rate, dur, rate, reverse: false, pan: side ? 0.5 : -0.5, gain: Math.min(1, slot.amp), stream: side })
  }

  /** CLASSIC, one side, one sample. */
  private classicSide(side: number, t: number, ending: boolean, f: number, semis: number, pm: number, smp: Sample,
    x: Float32Array, fmOffset: number, lo: number, hi: number): number {
    const slots = this.slots
    const a = side * 2
    const fv = f / this.sizeVar[side]
    if (!this.started) {
      // the note: A starts at once, and B with it at the top of its window (Granulator II retriggers both)
      this.phase[side] = 0
      if (!ending) {
        this.startSlot(a, side, t, 0, semis, pm, smp, fv)
        this.startSlot(a + 1, side, t, 0, semis, pm, smp, fv)
      }
    } else {
      const step = Math.min(MAX_PHASE_STEP, fv / sampleRate)
      const prev = this.phase[side]
      let next = prev + step
      if (next >= 1) {
        next -= 1
        if (ending) slots[a].on = false
        else this.startSlot(a, side, t, next / step, semis, pm, smp, fv)
      } else if (prev < 0.5 && next >= 0.5) {
        if (ending) slots[a + 1].on = false
        else this.startSlot(a + 1, side, t, (next - 0.5) / step, semis, pm, smp, fv)
      }
      this.phase[side] = next
    }
    const ph = this.phase[side]
    const win = this.window
    let y = 0
    const sa = slots[a]
    if (sa.on) {
      y += windowAt(win, skewPhase(ph, sa.e)) * sa.amp * readAt(x, sa.pos + fmOffset, lo, hi)
      sa.pos += sa.step
    }
    const sb = slots[a + 1]
    if (sb.on) {
      const pb = ph + 0.5
      y += windowAt(win, skewPhase(pb - Math.floor(pb), sb.e)) * sb.amp * readAt(x, sb.pos + fmOffset, lo, hi)
      sb.pos += sb.step
    }
    return y
  }

  /** LOOP, one side, one sample: the segment, and the last one while they crossfade. A segment spans one grain
   *  (1 / GRAIN seconds at its pitch) and the next starts where it ends, from wherever POS is by then. */
  private loopSide(side: number, t: number, ending: boolean, f: number, semis: number, pm: number, smp: Sample,
    x: Float32Array, fmOffset: number, lo: number, hi: number): number {
    const c = this.cfg
    const s = this.loops[side]
    if (!this.started) {
      // the note: nothing to fade from
      s.cur.on = false
      s.room = 0
      s.due = true
    }
    if (s.due) {
      s.due = false
      const { cur, old } = s
      old.on = cur.on
      old.pos = cur.pos
      old.step = cur.step
      old.amp = cur.amp
      old.dir = cur.dir
      if (ending) cur.on = false
      else {
        const dir = Math.random() < c.reverse ? -1 : 1
        const at = this.grainAt(side, semis, pm) * smp.rate
        const rate = this.grainRate(side, semis)
        const dur = varSizeRatio(c.varSize, this.variation(side), Math.random()) / f
        const span = Math.max(1, dur * rate * smp.rate)
        const fade = loopFade(this.skew(side), span, old.on ? s.room : 0)
        const seg = loopSegment(at, span, fade, lo, hi, dir)
        cur.on = true
        cur.pos = seg.head
        cur.end = seg.end
        cur.dir = dir
        cur.step = (rate * smp.rate) / sampleRate
        cur.amp = this.grainGain(side)
        s.room = seg.room
        s.xf = old.on && fade > 0 ? 0 : 1
        s.xfStep = fade > 0 ? cur.step / fade : 1
        this.report({ when: t, pos: Math.min(seg.head, seg.end) / smp.rate, len: (seg.end - seg.head) * dir / smp.rate, dur: span / (rate * smp.rate), rate, reverse: dir < 0, pan: side ? 0.5 : -0.5, gain: Math.min(1, cur.amp), stream: side })
      }
    }
    const { cur, old } = s
    let y = 0
    if (s.xf < 1) {
      // equal power: the outgoing head falls along a cosine as the new one rises along a sine
      const q = s.xf * 0.5 * Math.PI
      if (old.on) y += Math.cos(q) * old.amp * readAt(x, old.pos + fmOffset, lo, hi)
      if (cur.on) y += Math.sin(q) * cur.amp * readAt(x, cur.pos + fmOffset, lo, hi)
      old.pos += old.dir * old.step
      s.xf = Math.min(1, s.xf + s.xfStep)
      if (s.xf >= 1) old.on = false
    } else if (cur.on) y = cur.amp * readAt(x, cur.pos + fmOffset, lo, hi)
    if (cur.on) {
      cur.pos += cur.dir * cur.step
      if (cur.dir > 0 ? cur.pos > cur.end : cur.pos < cur.end) {
        if (ending) cur.on = false
        else s.due = true
      }
    }
    return y
  }

  /** CLOUD, one side, one sample: DENSITY grains, the i-th 1 + √i grains long, each starting again as it ends. */
  private cloudSide(side: number, t: number, ending: boolean, f: number, semis: number, pm: number, smp: Sample,
    x: Float32Array, fmOffset: number, lo: number, hi: number): number {
    const c = this.cfg
    const grains = this.clouds[side]
    const n = this.cloudCount
    if (!this.cloudLive[side]) {
      // the note: staggered through their windows, silent until each first starts again (the first does at once)
      this.cloudLive[side] = true
      for (let i = 0; i < n; i++) {
        const g = grains[i]
        g.on = !ending
        g.phase = 1 - i / n
        g.phaseStep = 1 / ((cloudLength(i) / f) * sampleRate)
        g.amp = 0
        g.step = 0
      }
    }
    let y = 0
    for (let i = 0; i < n; i++) {
      const g = grains[i]
      if (!g.on) continue
      if (g.phase >= 1) {
        if (ending) {
          g.on = false
          continue
        }
        const at = this.grainAt(side, semis, pm)
        const ratio = varPitchRatio(c.varPitch, this.variation(side), Math.random())
        const rate = this.grainRate(side, semis) * ratio
        const dur = (varSizeRatio(c.varSize, this.variation(side), Math.random()) * cloudLength(i)) / f
        g.phase = 0
        g.phaseStep = ratio / (dur * sampleRate)
        g.pos = at * smp.rate
        g.step = (rate * smp.rate) / sampleRate
        g.amp = this.grainGain(side)
        this.report({ when: t, pos: at, len: (dur * rate) / ratio, dur: dur / ratio, rate, reverse: false, pan: side ? 0.5 : -0.5, gain: Math.min(1, g.amp), stream: side })
      }
      if (g.amp > 0) y += Math.sin(Math.PI * g.phase) * g.amp * readAt(x, g.pos + fmOffset, lo, hi)
      g.pos += g.step
      g.phase += g.phaseStep
    }
    return y * cloudGain(n)
  }

  private renderCloud(L: Float32Array, R: Float32Array, n: number, params: Record<string, Float32Array>, smp: Sample) {
    const c = this.cfg
    const key = `${c.window}|${c.symmetry}`
    if (key !== this.windowKey) {
      this.window = windowTable(c.window, c.symmetry)
      this.windowKey = key
    }
    const bendSemis = params.detune[0] / 100
    const at = (p: Float32Array, i: number) => (p.length > 1 ? p[i] : p[0])
    const mods = (name: string) => [params[name], params[name + 'R']]
    const [posMod, freqMod, skewMod, varMod, detuneMod, scanMod] = ['posMod', 'freqMod', 'skewMod', 'varMod', 'detuneMod', 'scanMod'].map(mods)
    // SCAN's travel a second, as a share of its distance (S.KEY: faster for higher notes)
    const scanPerSec = c.scan ? scanRate(c.scanTime, c.scanDist, Math.max(1e-4, c.clipOut - c.clipIn), c.scanKey ? semisToRate(c.glide.to) : 1) : 0
    const chans = [smp.ch[0], smp.ch[1] ?? smp.ch[0]]
    const lo = Math.max(0, Math.floor(c.clipIn * smp.rate))
    const hi = Math.min(chans[0].length, Math.ceil(c.clipOut * smp.rate))
    const spread = 1 + c.stereo * c.stereo
    const fmDepth = c.fm ? ((c.fmAmount * 0.02) / 1000) * smp.rate : 0 // frames
    const rnd = this.rnd
    for (let i = 0; i < n; i++) {
      const t = currentTime + i / sampleRate
      if (t < c.t0) continue
      const ending = t >= c.end
      if (!this.started) {
        this.noteSemis = (2 * Math.random() - 1) * c.noteRnd
        this.cloudCount = Math.round(Math.min(DENSITY_MAX, Math.max(DENSITY_MIN, c.density)))
        this.scanX[0] = this.scanX[1] = 0
      }
      const semis = glideSemis(c.glide, t) + bendSemis
      // G<RND: Max's rand~ -- a straight line to a new random target, 8 × GRAIN times a second
      rnd.phase += (FREQ_RND_RATE * c.freq) / sampleRate
      if (rnd.phase >= 1) {
        rnd.phase -= Math.floor(rnd.phase)
        rnd.from = rnd.to
        rnd.to = Math.random() * 2 - 1
      }
      const wander = c.freqRnd > 0 ? (rnd.from + (rnd.to - rnd.from) * rnd.phase) * c.freqRnd * FREQ_RND_SEMIS : 0
      const base = c.freq * semisToRate(semis * c.freqKey + wander)
      let fmOffset = 0
      if (fmDepth) {
        this.fmPhase += (c.fmFreq * semisToRate(semis * c.fmKey)) / sampleRate
        this.fmPhase -= Math.floor(this.fmPhase)
        fmOffset = fmDepth * Math.sin(2 * Math.PI * this.fmPhase)
      }
      let l = 0
      let r = 0
      for (let side = 0; side < 2; side++) {
        const f = (side ? base * spread : base / spread) * semisToRate(at(freqMod[side], i))
        const pm = at(posMod[side], i)
        this.mSkew[side] = at(skewMod[side], i)
        this.mVar[side] = at(varMod[side], i)
        this.mDetune[side] = at(detuneMod[side], i)
        const y =
          c.mode === 'loop' ? this.loopSide(side, t, ending, f, semis, pm, smp, chans[side], fmOffset, lo, hi)
          : c.mode === 'cloud' ? this.cloudSide(side, t, ending, f, semis, pm, smp, chans[side], fmOffset, lo, hi)
          : this.classicSide(side, t, ending, f, semis, pm, smp, chans[side], fmOffset, lo, hi)
        if (side) r = y
        else l = y
      }
      this.started = true
      if (scanPerSec)
        for (let side = 0; side < 2; side++)
          this.scanX[side] = scanWrap(this.scanX[side] + (scanPerSec * (1 + at(scanMod[side], i))) / sampleRate, c.scanLoop)
      L[i] += l
      R[i] += r
    }
    return this.slots.some((s) => s.on) || this.loops.some((s) => s.cur.on || s.old.on) ||
      this.clouds.some((g) => g.some((x) => x.on))
  }

  // ── stretch ────────────────────────────────────────────────────────────────

  private renderStretch(L: Float32Array, R: Float32Array, n: number, params: Record<string, Float32Array>, smp: Sample) {
    const c = this.cfg
    const clipLen = Math.max(1e-4, c.clipOut - c.clipIn)
    const lastStart = currentTime + (n - 1) / sampleRate
    // steady grains, four overlapping, each starting where SPEED has got to through the clip
    while (this.nextStretch <= lastStart && this.nextStretch < c.end) {
      const when = Math.max(this.nextStretch, currentTime)
      const rate = c.kRate * semisToRate(glideSemis(c.glide, when))
      const bufLen = Math.min(STRETCH_GRAIN * rate, clipLen)
      const at = Math.min(c.clipIn + (((when - c.t0) * c.speed) % clipLen), c.clipOut - bufLen)
      const dur = bufLen / rate
      if (this.grains.length < STRETCH_POOL) {
        this.grains.push({
          pos: at * smp.rate,
          step: (rate * smp.rate) / sampleRate,
          k: c.kRate,
          length: Math.max(1, Math.round(dur * sampleRate)),
          index: 0,
          from: Math.max(0, Math.min(n - 1, Math.ceil((when - currentTime) * sampleRate))),
        })
      }
      this.report({ when, pos: at, len: bufLen, dur, rate, reverse: false, pan: 0, gain: 1, stream: 0 })
      this.nextStretch = when + Math.max(dur, 1 / sampleRate) / STRETCH_OVERLAP
    }
    const bend = Math.pow(2, params.detune[0] / 1200)
    const a = smp.ch[0]
    const b = smp.ch[1] ?? a
    const lo = 0
    const hi = a.length
    const gain = 2 / STRETCH_OVERLAP
    let live = 0
    for (const g of this.grains) {
      const step = g.step * bend * (c.kRate / g.k)
      let i = g.from
      g.from = 0
      for (; i < n && g.index < g.length; i++, g.index++) {
        const w = gain * hann(g.index, g.length)
        L[i] += w * readAt(a, g.pos, lo, hi)
        R[i] += w * readAt(b, g.pos, lo, hi)
        g.pos += step
      }
      if (g.index < g.length) this.grains[live++] = g
    }
    this.grains.length = live
    return live > 0
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean {
    const out = outputs[0]
    const L = out[0]
    const R = out[1] ?? out[0]
    const n = L.length
    const smp = (this.sample ??= samples.get(this.id))
    if (!smp) {
      if (!this.asked) this.post({ type: 'need', id: this.id })
      this.asked = true
      return !this.stopped
    }
    if (this.stopped) return false
    const ringing = this.cfg.kind === 'cloud' ? this.renderCloud(L, R, n, params, smp) : this.renderStretch(L, R, n, params, smp)

    this.sinceReport += n
    if (this.events.length && this.sinceReport >= REPORT_EVERY) {
      this.post({ type: 'grains', list: this.events })
      this.events = []
      this.sinceReport = 0
    }
    if (currentTime >= this.cfg.end && !ringing) {
      if (this.events.length) this.post({ type: 'grains', list: this.events })
      this.post({ type: 'done' })
      return false
    }
    return true
  }
}

registerProcessor('ssb-grains', GrainProcessor)

/**
 * A matrix LFO (lfoMath.ts): output 0 is its left side, output 1 its right, each × its depth. `hz` is its
 * frequency; `rate` the routes to its RATE (semitones, RATIO's note included); `depth` its AMOUNT plus the
 * routes to it (clamped 0..1).
 */
class LfoProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'hz', defaultValue: 1, minValue: 0, automationRate: 'a-rate' },
      { name: 'rate', defaultValue: 0, automationRate: 'a-rate' },
      { name: 'depth', defaultValue: 1, automationRate: 'a-rate' },
    ]
  }

  private lfo: LfoState
  private start: number
  private stopped = false

  constructor(options: { processorOptions: LfoOptions }) {
    super()
    const o = options.processorOptions
    this.lfo = new LfoState(o.shape, o.stereo, o.quant)
    this.lfo.reset(o.phase)
    this.start = o.start
    this.port.onmessage = (e: MessageEvent<ToLfo>) => {
      const m = e.data
      if (m.type === 'set') {
        const reshape = m.shape !== this.lfo.shape
        this.lfo.shape = m.shape
        this.lfo.stereo = m.stereo
        this.lfo.quant = m.quant
        if (reshape) this.lfo.reset(this.lfo.phase)
      } else if (m.type === 'restart') {
        this.lfo.reset(m.phase)
        this.start = m.at
      } else this.stopped = true
    }
  }

  process(_in: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean {
    if (this.stopped) return false
    const L = outputs[0][0]
    const R = outputs[1][0]
    const { hz, rate, depth } = params
    const lfo = this.lfo
    for (let i = 0; i < L.length; i++) {
      const d = Math.min(1, Math.max(0, depth.length > 1 ? depth[i] : depth[0]))
      L[i] = lfo.value(0) * d
      R[i] = lfo.value(1) * d
      if (currentTime + i / sampleRate < this.start) continue
      const f = (hz.length > 1 ? hz[i] : hz[0]) * semisToRate(rate.length > 1 ? rate[i] : rate[0])
      lfo.advance(f / sampleRate)
    }
    return true
  }
}

registerProcessor('ssb-lfo', LfoProcessor)

export type ToSvf = { type: 'set'; svf: SvfType } | { type: 'stop' }

/**
 * Granulator III's filter (svfMath.ts), left and right. `freq` is the knob (Hz, followed over about a millisecond);
 * `detune` / `detuneR` the cents every modulation adds on each side; `q` RES (plus its routes); `width` WIDTH in
 * semitones. Coefficients are worked out every SVF_EVERY samples.
 */
class SvfProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'freq', defaultValue: 20000, minValue: 1, automationRate: 'k-rate' },
      { name: 'q', defaultValue: 1, automationRate: 'a-rate' },
      { name: 'width', defaultValue: -12, automationRate: 'k-rate' },
      { name: 'detune', defaultValue: 0, automationRate: 'a-rate' },
      { name: 'detuneR', defaultValue: 0, automationRate: 'a-rate' },
    ]
  }

  private type: SvfType
  private st: SvfState[][] = [0, 1].map(() => [0, 1].map(() => ({ s1: 0, s2: 0 })))
  private g = [[1, 1], [1, 1]]
  private k = [[1, 1], [1, 1]]
  /** log2 of the knob's cutoff, smoothed */
  private lf = -1
  private count = 0
  private stopped = false

  constructor(options: { processorOptions: { svf: SvfType } }) {
    super()
    this.type = options.processorOptions.svf
    this.port.onmessage = (e: MessageEvent<ToSvf>) => {
      if (e.data.type === 'set') this.type = e.data.svf
      else this.stopped = true
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>): boolean {
    if (this.stopped) return false
    const out = outputs[0]
    const inp = inputs[0]
    const n = out[0].length
    if (!inp || !inp.length) {
      for (const ch of out) ch.fill(0)
      return true
    }
    const [m1, m2, useWidth] = SVF_TABLE[this.type]
    const target = Math.log2(Math.max(1, params.freq[0]))
    if (this.lf < 0) this.lf = target
    const width = useWidth ? params.width[0] : 0
    const { q, detune, detuneR } = params
    for (let i = 0; i < n; i++) {
      this.lf += SVF_SMOOTH * (target - this.lf)
      if (this.count++ % SVF_EVERY === 0) {
        const qq = Math.max(0.1, q.length > 1 ? q[i] : q[0])
        const k2 = 1 / svfQ2(this.type, qq)
        for (let side = 0; side < 2; side++) {
          const d = side ? detuneR : detune
          const fc = Math.pow(2, this.lf + (d.length > 1 ? d[i] : d[0]) / 1200)
          this.g[side][0] = svfG(fc, sampleRate)
          this.g[side][1] = svfG(fc * Math.pow(2, width / 12), sampleRate)
          this.k[side][0] = 1 / qq
          this.k[side][1] = k2
        }
      }
      for (let side = 0; side < 2; side++) {
        const x = (inp[side] ?? inp[0])[i]
        const st = this.st[side]
        const y = svfTick(st[0], m1, this.g[side][0], this.k[side][0], x)
        out[side][i] = svfTick(st[1], m2, this.g[side][1], this.k[side][1], y)
      }
    }
    return true
  }
}

registerProcessor('ssb-svf', SvfProcessor)
