import type { LfoShape } from '../types'
import { lfoValue } from '../lib/modulation'

const LOOKAHEAD = 0.25 // seconds of random steps scheduled ahead
const TICK_MS = 50
const MAX_STEPS = 16

const isRandom = (s: LfoShape) => s === 'random' || s === 'smooth'

/**
 * An LFO as an AudioNode (`output`, -1..1) plus a matching JS reading (`valueAt`)
 * for things evaluated outside the audio graph (grain position/size).
 *
 * Periodic shapes run an OscillatorNode (ramp-down = inverted sawtooth).
 * Random shapes step a ConstantSourceNode once per cycle: sample & hold jumps,
 * smooth glides. `output` survives shape changes, so routes stay connected.
 */
export class LfoSource {
  readonly output: GainNode
  private osc?: OscillatorNode
  private cs?: ConstantSourceNode
  private timer?: ReturnType<typeof setInterval>
  private shape: LfoShape
  private hz: number
  /** phase(t) = phase0 + (t - tRef) · hz, in cycles */
  private phase0 = 0
  private tRef: number
  private steps: { t: number; v: number }[] = []
  private nextStep = 0

  constructor(
    private ctx: BaseAudioContext,
    shape: LfoShape,
    hz: number,
    start = ctx.currentTime,
  ) {
    this.output = ctx.createGain()
    this.shape = shape
    this.hz = Math.max(0.001, hz)
    this.tRef = start
    this.build(start)
  }

  private phaseAt(t: number) {
    return this.phase0 + (t - this.tRef) * this.hz
  }

  private build(at: number) {
    this.teardown()
    this.output.gain.value = this.shape === 'rampDown' ? -1 : 1
    if (isRandom(this.shape)) {
      const cs = this.ctx.createConstantSource()
      cs.offset.value = 0
      cs.connect(this.output)
      cs.start(at)
      this.cs = cs
      this.steps = [{ t: at, v: 0 }]
      this.nextStep = Math.floor(this.phaseAt(at)) + 1
      this.schedule()
      this.timer = setInterval(() => this.schedule(), TICK_MS)
    } else {
      const osc = this.ctx.createOscillator()
      osc.type = this.shape === 'rampDown' ? 'sawtooth' : this.shape
      osc.frequency.value = this.hz
      osc.connect(this.output)
      // an oscillator always starts at phase 0, so the JS mirror restarts with it
      this.phase0 = 0
      this.tRef = at
      osc.start(at)
      this.osc = osc
    }
  }

  /** Random shapes: new value at every whole cycle. */
  private schedule() {
    const cs = this.cs
    if (!cs) return
    const horizon = this.ctx.currentTime + LOOKAHEAD
    for (;;) {
      const t = this.tRef + (this.nextStep - this.phase0) / this.hz
      if (t > horizon) break
      const v = Math.random() * 2 - 1
      if (this.shape === 'smooth') cs.offset.linearRampToValueAtTime(v, t)
      else cs.offset.setValueAtTime(v, t)
      this.steps.push({ t, v })
      if (this.steps.length > MAX_STEPS) this.steps.shift()
      this.nextStep++
    }
  }

  private teardown() {
    clearInterval(this.timer)
    this.timer = undefined
    for (const n of [this.osc, this.cs]) {
      if (!n) continue
      try {
        n.stop()
      } catch {
        /* not started */
      }
      n.disconnect()
    }
    this.osc = this.cs = undefined
  }

  /** Change shape and/or rate, keeping phase continuous. */
  set(shape: LfoShape, hz: number) {
    const now = this.ctx.currentTime
    hz = Math.max(0.001, hz)
    if (shape === this.shape && Math.abs(hz - this.hz) < 1e-9) return
    this.phase0 = this.phaseAt(now)
    this.tRef = now
    this.hz = hz
    if (shape !== this.shape) {
      this.shape = shape
      this.build(now)
      return
    }
    if (this.osc) this.osc.frequency.setValueAtTime(hz, now)
    if (this.cs) {
      // reschedule future steps at the new rate
      this.cs.offset.cancelScheduledValues(now)
      this.steps = this.steps.filter((s) => s.t <= now)
      this.nextStep = Math.floor(this.phase0) + 1
      this.schedule()
    }
  }

  /** Restart the cycle from phase 0 at `at` (MIDI Start). */
  restart(at = this.ctx.currentTime) {
    this.phase0 = 0
    this.tRef = at
    this.build(at)
  }

  /** Value (-1..1) at time t, matching the audio output. */
  valueAt(t: number): number {
    if (!isRandom(this.shape)) return lfoValue(this.shape, this.phaseAt(t))
    const s = this.steps
    let i = s.length - 1
    while (i > 0 && s[i].t > t) i--
    if (this.shape === 'random' || i === s.length - 1) return s[i].v
    const a = s[i]
    const b = s[i + 1]
    return a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t)
  }

  stop() {
    this.teardown()
    this.output.disconnect()
  }
}
