/**
 * The grain engine: one processor per grain voice, rendering its grains sample by sample (so a grain can be a
 * single sample long, and thousands can start each second), the way native/engine does it. Its output feeds the
 * voice's envelope / filter / FX like any other source.
 *
 * Samples are sent once per context and shared by every processor in this AudioWorkletGlobalScope.
 */
import {
  grainGain, grainInterval, grainPan, grainsPerSecond, grainWindow, hermite, KEY_MAX_OVERLAP, MAX_STARTS_PER_SAMPLE,
  noteHz, STRETCH_GRAIN, STRETCH_OVERLAP, type FromGrains, type GrainConfig, type GrainEvent, type PanGains,
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

interface Grain {
  pos: number // frames into the sample (moves backwards when reversed)
  step: number // frames per output sample, before pitch modulation
  /** PITCH / FINE (as a rate) when it started: a sounding grain follows those knobs as they turn */
  k: number
  length: number // output samples
  /** samples into the grain; fractional: a grain due between two samples starts part-way into its first */
  index: number
  gain: number
  pan: PanGains
  /** the block sample it starts at (grains that start mid-block) */
  from: number
}
const newGrain = (): Grain => ({ pos: 0, step: 0, k: 1, length: 0, index: 0, gain: 0, pan: [1, 0, 0, 1], from: 0 })
/**
 * One grain stream. Its next grain is due `gap` after the `last`: for a cloud `gap` is a random multiple of the
 * period (1 on average), divided by the grain rate when it is read -- so turning DENSITY or SIZE, or bending a
 * KEY cloud's note, takes effect at once, not after the interval that was drawn at the old rate; for STRETCH it
 * is seconds.
 */
interface Stream {
  last: number
  gap: number
  offset: number
  speed: number
}

const POOL = 256
/** grain starts reported to the page per message (it only draws them) */
const REPORT_MAX = 48
const REPORT_EVERY = 1024

class GrainProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // cents from the voice's pitch bus (bend, MPE, pitch routes); k-rate like a buffer source's detune
      { name: 'detune', defaultValue: 0, automationRate: 'k-rate' },
      // mod matrix → GRAIN POS (fraction of the clip) and GRAIN SIZE (ms), read as each grain starts
      { name: 'posMod', defaultValue: 0, automationRate: 'a-rate' },
      { name: 'sizeMod', defaultValue: 0, automationRate: 'a-rate' },
    ]
  }

  private cfg: GrainConfig
  private id: string
  private sample?: Sample
  private asked = false
  /** every grain this processor will ever use, made up front: [0, live) are sounding, the rest are free */
  private grains: Grain[] = Array.from({ length: POOL }, newGrain)
  private live = 0
  private streams: Stream[] = []
  private events: GrainEvent[] = []
  private sinceReport = 0
  private stopped = false

  constructor(options: { processorOptions: { id: string; config: GrainConfig; sample?: Sample } }) {
    super()
    const o = options.processorOptions
    this.id = o.id
    this.cfg = o.config
    if (o.sample) samples.set(o.id, o.sample)
    this.startStreams()
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

  /** Poly grains: each stream starts at a random time and offset, and drifts at its own speed. */
  private startStreams() {
    const c = this.cfg
    const cloud = c.kind === 'cloud'
    const n = cloud ? Math.min(8, Math.max(1, Math.round(c.streams))) : 1
    // the first grain at the note, the other streams' somewhere in their first period
    this.streams = Array.from({ length: n }, (_, i) => ({
      last: c.t0,
      gap: i ? Math.random() * (cloud ? 1 : STRETCH_GRAIN) : 0,
      offset: n > 1 ? (Math.random() - 0.5) * Math.max(c.width, 0.2) : 0,
      speed: cloud ? (Math.random() * 2 - 1) * c.drift : 0,
    }))
  }

  /**
   * Grains per second per stream right now: DENSITY of them per SIZE, or (KEY) the note's frequency, bent by
   * the pitch bus. Stretch's streams keep their gap in seconds (0 here: unused).
   */
  private perSecond(bend: number, sizeMod: number): number {
    const c = this.cfg
    if (c.kind !== 'cloud') return 0
    if (c.key) return noteHz(c.rootNote + glideSemis(c.glide, currentTime)) * bend
    return grainsPerSecond(c.density, Math.max(1 / sampleRate, (c.size + sizeMod) / 1000))
  }

  /**
   * Start a grain due at `when`, rendering from block sample `from`, which is `lead` samples (0..1) after it is
   * due: the grain begins that far into its window and its sample, so grain trains keep their exact period.
   */
  private spawn(
    st: Stream, si: number, when: number, from: number, lead: number,
    posMod: number, sizeMod: number, perSecond: number, smp: Sample,
  ) {
    const c = this.cfg
    const cloud = c.kind === 'cloud'
    const key = cloud && c.key
    const clipLen = Math.max(1e-4, c.clipOut - c.clipIn)
    // the sample's playback rate inside the grain: PITCH / FINE, and the note -- unless KEY, where the note is
    // the grain rate and PITCH / FINE move the formants alone
    let rate = c.kRate * (key ? 1 : semisToRate(glideSemis(c.glide, when)))
    if (cloud && c.jitter > 0) rate *= semisToRate((Math.random() * 2 - 1) * c.jitter)
    let size = cloud ? Math.max(1 / sampleRate, (c.size + sizeMod) / 1000) : STRETCH_GRAIN
    if (key) size = Math.min(size, KEY_MAX_OVERLAP / perSecond)
    const bufLen = Math.min(size * rate, clipLen)

    let start: number
    if (cloud) {
      const elapsed = when - c.t0
      const moving = st.speed + c.scan
      let pos = c.pos + posMod + st.offset + (moving * elapsed) / clipLen
      // a single fixed stream clamps at the clip edges; moving streams wrap around the clip
      pos = moving || st.offset ? ((pos % 1) + 1) % 1 : Math.min(1, Math.max(0, pos))
      start = c.clipIn + pos * clipLen + (Math.random() - 0.5) * c.width * clipLen - bufLen / 2
    } else start = c.clipIn + (((when - c.t0) * c.speed) % clipLen)
    const offset = Math.min(Math.max(start, c.clipIn), c.clipOut - bufLen)
    const reverse = cloud && c.reverse > 0 && Math.random() < c.reverse
    const dur = bufLen / rate
    const length = Math.max(1, Math.round(dur * sampleRate))
    const overlap = cloud ? size * perSecond * this.streams.length : STRETCH_OVERLAP
    const gain = cloud ? grainGain(overlap) : Math.min(1, 2 / STRETCH_OVERLAP)
    const pan = cloud && c.spread > 0 ? (Math.random() * 2 - 1) * c.spread : null
    const step = (rate * smp.rate) / sampleRate
    const dir = reverse ? -step : step

    if (this.live < POOL) {
      // reused, not allocated: a cloud of one-sample grains starts ~100 000 a second
      const g = this.grains[this.live++]
      g.pos = (reverse ? offset + bufLen : offset) * smp.rate + dir * lead
      g.step = dir
      g.k = c.kRate
      g.length = length
      g.index = lead
      g.gain = gain
      grainPan(pan, smp.ch.length < 2, g.pan)
      g.from = from
    }
    if (this.events.length < REPORT_MAX)
      this.events.push({ when, pos: offset, len: bufLen, dur, rate, reverse, pan: pan ?? 0, gain, stream: si })
    return dur
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
    const c = this.cfg
    const cloud = c.kind === 'cloud'
    const key = cloud && c.key
    const bend = Math.pow(2, params.detune[0] / 1200)
    const posMod = params.posMod
    const sizeMod = params.sizeMod
    const perSecond = this.perSecond(bend, sizeMod[0])

    // start the grains due in this block; one due after its last sample waits for the next block
    const lastStart = currentTime + (n - 1) / sampleRate
    const maxStarts = MAX_STARTS_PER_SAMPLE * n
    for (let si = 0; si < this.streams.length; si++) {
      const st = this.streams[si]
      let guard = 0
      for (;;) {
        const due = st.last + Math.max(1 / sampleRate, cloud ? st.gap / perSecond : st.gap)
        if (due > lastStart || due >= c.end || guard++ >= maxStarts) break
        // the rate turned up past a grain's time: it starts now, not in the past (no burst of catch-up grains)
        const when = Math.max(due, currentTime)
        const x = (when - currentTime) * sampleRate
        const from = Math.min(n - 1, Math.ceil(x))
        const lead = Math.max(0, from - x)
        const pm = posMod.length > 1 ? posMod[from] : posMod[0]
        const sm = sizeMod.length > 1 ? sizeMod[from] : sizeMod[0]
        const dur = this.spawn(st, si, when, from, lead, pm, sm, perSecond, smp)
        st.last = when
        st.gap = cloud ? grainInterval(1, c.scatter, Math.random()) : Math.max(dur, 1 / sampleRate) / STRETCH_OVERLAP
      }
    }

    // render
    const contentBend = key ? 1 : bend // KEY: the bend is in the grain rate already
    const a = smp.ch[0]
    const b = smp.ch[1] ?? a
    const frames = a.length
    const taper = cloud ? c.shape : 1
    const grains = this.grains
    let live = 0
    for (let gi = 0; gi < this.live; gi++) {
      const g = grains[gi]
      const [ll, lr, rl, rr] = g.pan
      const step = g.step * contentBend * (c.kRate / g.k)
      let i = g.from
      g.from = 0
      for (; i < n && g.index < g.length; i++, g.index++) {
        const i0 = Math.floor(g.pos)
        const f = g.pos - i0
        let x: number
        let y: number
        if (i0 >= 1 && i0 + 2 < frames) {
          x = hermite(a[i0 - 1], a[i0], a[i0 + 1], a[i0 + 2], f)
          y = hermite(b[i0 - 1], b[i0], b[i0 + 1], b[i0 + 2], f)
        } else if (i0 >= 0 && i0 + 1 < frames) {
          x = a[i0] + (a[i0 + 1] - a[i0]) * f
          y = b[i0] + (b[i0 + 1] - b[i0]) * f
        } else {
          g.pos += step
          continue
        }
        const w = g.gain * grainWindow(g.index, g.length, taper)
        x *= w
        y *= w
        L[i] += x * ll + y * rl
        R[i] += x * lr + y * rr
        g.pos += step
      }
      if (g.index < g.length) {
        // still sounding: keep it in the front part; the finished one it displaces goes back to the free part
        grains[gi] = grains[live]
        grains[live++] = g
      }
    }
    this.live = live

    this.sinceReport += n
    if (this.events.length && this.sinceReport >= REPORT_EVERY) {
      this.post({ type: 'grains', list: this.events })
      this.events = []
      this.sinceReport = 0
    }
    if (currentTime >= c.end && !live) {
      if (this.events.length) this.post({ type: 'grains', list: this.events })
      this.post({ type: 'done' })
      return false
    }
    return true
  }
}

registerProcessor('ssb-grains', GrainProcessor)
