/**
 * The grain engine: one processor per grain voice, rendering its grains sample by sample (so a grain can be a
 * single sample long, and hundreds can start each second), the way native/engine does it. Its output feeds the
 * voice's envelope / filter / FX like any other source.
 *
 * Samples are sent once per context and shared by every processor in this AudioWorkletGlobalScope.
 */
import {
  grainGain, grainInterval, grainPan, grainWindow, STRETCH_GRAIN, STRETCH_OVERLAP,
  type FromGrains, type GrainConfig, type GrainEvent, type ToGrains,
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
  length: number // output samples
  index: number
  gain: number
  pan: [number, number, number, number]
  /** the block sample it starts at (grains that start mid-block) */
  from: number
}
interface Stream {
  next: number
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
  private grains: Grain[] = []
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
    const first = cloud ? 1 / Math.max(0.5, c.rate) : STRETCH_GRAIN
    this.streams = Array.from({ length: n }, (_, i) => ({
      next: c.t0 + (i ? Math.random() * first : 0),
      offset: n > 1 ? (Math.random() - 0.5) * Math.max(c.width, 0.2) : 0,
      speed: cloud ? (Math.random() * 2 - 1) * c.drift : 0,
    }))
  }

  private spawn(st: Stream, si: number, when: number, from: number, posMod: number, sizeMod: number, smp: Sample) {
    const c = this.cfg
    const cloud = c.kind === 'cloud'
    const clipLen = Math.max(1e-4, c.clipOut - c.clipIn)
    let rate = c.kRate * semisToRate(glideSemis(c.glide, when))
    if (cloud && c.jitter > 0) rate *= semisToRate((Math.random() * 2 - 1) * c.jitter)
    const size = cloud ? Math.max(1 / sampleRate, (c.size + sizeMod) / 1000) : STRETCH_GRAIN
    const bufLen = Math.min(size * rate, clipLen)

    let start: number
    if (cloud) {
      let pos = c.pos + posMod + st.offset + (st.speed * (when - c.t0)) / clipLen
      // a single fixed stream clamps at the clip edges; drifting streams wrap around the clip
      pos = st.speed || st.offset ? ((pos % 1) + 1) % 1 : Math.min(1, Math.max(0, pos))
      start = c.clipIn + pos * clipLen + (Math.random() - 0.5) * c.width * clipLen - bufLen / 2
    } else start = c.clipIn + (((when - c.t0) * c.speed) % clipLen)
    const offset = Math.min(Math.max(start, c.clipIn), c.clipOut - bufLen)
    const reverse = cloud && c.reverse > 0 && Math.random() < c.reverse
    const dur = bufLen / rate
    const length = Math.max(1, Math.round(dur * sampleRate))
    const overlap = cloud ? size * c.rate * this.streams.length : STRETCH_OVERLAP
    const gain = cloud ? grainGain(overlap) : Math.min(1, 2 / STRETCH_OVERLAP)
    const pan = cloud && c.spread > 0 ? (Math.random() * 2 - 1) * c.spread : null
    const step = (rate * smp.rate) / sampleRate

    if (this.grains.length < POOL) {
      this.grains.push({
        pos: (reverse ? offset + bufLen : offset) * smp.rate,
        step: reverse ? -step : step,
        length,
        index: 0,
        gain,
        pan: grainPan(pan, smp.ch.length < 2),
        from,
      })
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

    // start the grains due in this block
    const blockEnd = currentTime + n / sampleRate
    const until = Math.min(blockEnd, c.end)
    const posMod = params.posMod
    const sizeMod = params.sizeMod
    for (let si = 0; si < this.streams.length; si++) {
      const st = this.streams[si]
      let guard = 0
      while (st.next < until && guard++ < 512) {
        const from = Math.max(0, Math.min(n - 1, Math.ceil((st.next - currentTime) * sampleRate)))
        const pm = posMod.length > 1 ? posMod[from] : posMod[0]
        const sm = sizeMod.length > 1 ? sizeMod[from] : sizeMod[0]
        const dur = this.spawn(st, si, st.next, from, pm, sm, smp)
        st.next += cloud
          ? Math.max(1 / sampleRate, grainInterval(c.rate, c.scatter, Math.random()))
          : Math.max(dur, 1 / sampleRate) / STRETCH_OVERLAP
      }
      // fell behind (a long pause): catch up without a burst
      if (st.next < currentTime - 0.1) st.next = currentTime
    }

    // render
    const bend = Math.pow(2, params.detune[0] / 1200)
    const a = smp.ch[0]
    const b = smp.ch[1] ?? a
    const frames = a.length
    const taper = cloud ? c.shape : 1
    let live = 0
    for (let gi = 0; gi < this.grains.length; gi++) {
      const g = this.grains[gi]
      const [ll, lr, rl, rr] = g.pan
      const step = g.step * bend
      let i = g.from
      g.from = 0
      for (; i < n && g.index < g.length; i++, g.index++) {
        const i0 = Math.floor(g.pos)
        if (i0 >= 0 && i0 + 1 < frames) {
          const f = g.pos - i0
          const w = g.gain * grainWindow(g.index, g.length, taper)
          const x = (a[i0] + (a[i0 + 1] - a[i0]) * f) * w
          const y = (b[i0] + (b[i0 + 1] - b[i0]) * f) * w
          L[i] += x * ll + y * rl
          R[i] += x * lr + y * rr
        }
        g.pos += step
      }
      if (g.index < g.length) this.grains[live++] = g
    }
    this.grains.length = live

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
