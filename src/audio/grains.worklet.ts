/**
 * The grain engine, one processor per grain voice, rendering sample by sample the way native/engine does.
 *
 * cloud: Granulator II's voice (grainMath.ts). Two phasors -- left, right -- at the GRAIN frequency; each runs two
 *   grain slots, A starting when the phasor wraps and B half a period later, each windowed by the phasor's phase
 *   (B's shifted half a cycle), so a slot's grain lasts exactly one period and two always overlap. A slot draws its
 *   start position, pitch and level when it starts and reads forward from there; FM swings the read position.
 *   Phase wraps are found between samples, and a grain that starts between them begins that far in.
 * stretch: grains that walk through the clip at SPEED, played at PITCH.
 *
 * Samples are sent once per context and shared by every processor in this AudioWorkletGlobalScope.
 */
import {
  FREQ_RND_RATE, FREQ_RND_SEMIS, grainLevel, hann, MAX_PHASE_STEP, readAt, scanOffset, sprayOffset, STRETCH_GRAIN,
  STRETCH_OVERLAP, tuneRndRatio, windowAt, windowTable, type FromGrains, type GrainConfig, type GrainEvent,
  type ToGrains,
} from './grainMath'
import { glideSemis, semisToRate } from './timing'

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

/** A cloud's grain slot: the grain it is playing. */
interface Slot {
  on: boolean
  pos: number // frames into the sample
  step: number // frames per output sample
  amp: number
}
const newSlot = (): Slot => ({ on: false, pos: 0, step: 1, amp: 1 })

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
  private phase = [0, 0]
  /** [left A, left B, right A, right B] */
  private slots: Slot[] = [newSlot(), newSlot(), newSlot(), newSlot()]
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

  /** Slot `si` of side `side` starts a grain at time `t`, `lead` samples ago (between this sample and the last). */
  private startSlot(si: number, side: number, t: number, lead: number, semis: number, posMod: number, smp: Sample, f: number) {
    const c = this.cfg
    const slot = this.slots[si]
    const clipLen = Math.max(1e-4, c.clipOut - c.clipIn)
    const at = c.clipIn + (c.pos + posMod + c.posKey * 0.01 * semis) * clipLen +
      sprayOffset(c.spray, c.spraySlope, c.spraySign, Math.random(), Math.random()) / 1000 +
      (c.scan ? scanOffset(t - c.t0, c.scanTime, c.scanDist, c.scanCurve, clipLen) : 0)
    const rate = c.kRate * semisToRate(semis * c.tuneKey) * (c.tuneRnd > 0 ? tuneRndRatio(c.tuneRnd, Math.random()) : 1)
    slot.step = (rate * smp.rate) / sampleRate
    slot.pos = at * smp.rate + slot.step * lead
    slot.amp = c.amp > 0 ? grainLevel(c.ampMode, c.amp, c.voidLevel, Math.random()) : 1
    slot.on = true
    const dur = 1 / f
    this.report({ when: t - lead / sampleRate, pos: at, len: dur * rate, dur, rate, reverse: false, pan: side ? 0.5 : -0.5, gain: Math.min(1, slot.amp), stream: side })
  }

  private renderCloud(L: Float32Array, R: Float32Array, n: number, params: Record<string, Float32Array>, smp: Sample) {
    const c = this.cfg
    const key = `${c.window}|${c.symmetry}`
    if (key !== this.windowKey) {
      this.window = windowTable(c.window, c.symmetry)
      this.windowKey = key
    }
    const win = this.window
    const bendSemis = params.detune[0] / 100
    const posMod = params.posMod
    const freqMod = params.freqMod
    const chans = [smp.ch[0], smp.ch[1] ?? smp.ch[0]]
    const lo = Math.max(0, Math.floor(c.clipIn * smp.rate))
    const hi = Math.min(chans[0].length, Math.ceil(c.clipOut * smp.rate))
    const spread = 1 + c.stereo * c.stereo
    const fmDepth = c.fm ? ((c.fmAmount * 0.02) / 1000) * smp.rate : 0 // frames
    const rnd = this.rnd
    const slots = this.slots
    for (let i = 0; i < n; i++) {
      const t = currentTime + i / sampleRate
      if (t < c.t0) continue
      const ending = t >= c.end
      const semis = glideSemis(c.glide, t) + bendSemis
      // G<RND: Max's rand~ -- a straight line to a new random target, 8 × GRAIN times a second
      rnd.phase += (FREQ_RND_RATE * c.freq) / sampleRate
      if (rnd.phase >= 1) {
        rnd.phase -= Math.floor(rnd.phase)
        rnd.from = rnd.to
        rnd.to = Math.random() * 2 - 1
      }
      const wander = c.freqRnd > 0 ? (rnd.from + (rnd.to - rnd.from) * rnd.phase) * c.freqRnd * FREQ_RND_SEMIS : 0
      const fm = freqMod.length > 1 ? freqMod[i] : freqMod[0]
      const base = c.freq * semisToRate(semis * c.freqKey + wander + fm)
      const pm = posMod.length > 1 ? posMod[i] : posMod[0]
      let fmOffset = 0
      if (fmDepth) {
        this.fmPhase += (c.fmFreq * semisToRate(semis * c.fmKey)) / sampleRate
        this.fmPhase -= Math.floor(this.fmPhase)
        fmOffset = fmDepth * Math.sin(2 * Math.PI * this.fmPhase)
      }
      let l = 0
      let r = 0
      for (let side = 0; side < 2; side++) {
        const f = side ? base * spread : base / spread
        const step = Math.min(MAX_PHASE_STEP, f / sampleRate)
        const a = side * 2
        if (!this.started) {
          // the note: A starts at once, and B with it at the top of its window (Granulator II retriggers both)
          this.phase[side] = 0
          if (!ending) {
            this.startSlot(a, side, t, 0, semis, pm, smp, f)
            this.startSlot(a + 1, side, t, 0, semis, pm, smp, f)
          }
        } else {
          const prev = this.phase[side]
          let next = prev + step
          if (next >= 1) {
            next -= 1
            if (ending) slots[a].on = false
            else this.startSlot(a, side, t, next / step, semis, pm, smp, f)
          } else if (prev < 0.5 && next >= 0.5) {
            if (ending) slots[a + 1].on = false
            else this.startSlot(a + 1, side, t, (next - 0.5) / step, semis, pm, smp, f)
          }
          this.phase[side] = next
        }
        const ph = this.phase[side]
        const x = chans[side]
        let y = 0
        const sa = slots[a]
        if (sa.on) {
          y += windowAt(win, ph) * sa.amp * readAt(x, sa.pos + fmOffset, lo, hi)
          sa.pos += sa.step
        }
        const sb = slots[a + 1]
        if (sb.on) {
          y += windowAt(win, ph + 0.5) * sb.amp * readAt(x, sb.pos + fmOffset, lo, hi)
          sb.pos += sb.step
        }
        if (side) r = y
        else l = y
      }
      this.started = true
      L[i] += l
      R[i] += r
    }
    return slots.some((s) => s.on)
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
