import type { GlobalFx } from '../types'
import { getImpulse } from './impulse'

const RAMP = 0.02
const CHORUS_BASE = 0.018 // seconds
const CHORUS_MAX_DEPTH = 0.008

/**
 * Global send effects on the master bus, all in parallel with the dry signal:
 *
 *   input ─┬─ dry ──────────────────────────────┐
 *          ├─ chorus (2 LFO'd delays, L/R) ─────┤
 *          ├─ delay ⟲ damped feedback ──────────┼→ output
 *          └─ reverb ───────────────────────────┘
 */
export class MasterFx {
  readonly input: GainNode
  readonly output: GainNode
  private chorusWet: GainNode
  private lfos: OscillatorNode[] = []
  private depths: GainNode[] = []
  private delay!: DelayNode
  private feedback!: GainNode
  private damp!: BiquadFilterNode
  private delayWet: GainNode
  private convolver!: ConvolverNode
  private reverbWet: GainNode
  private impulseKey = ''
  private impulseTimer?: ReturnType<typeof setTimeout>
  private fx?: GlobalFx

  constructor(private ctx: AudioContext) {
    const c = ctx
    this.input = c.createGain()
    this.output = c.createGain()
    this.input.connect(this.output)

    // chorus: two modulated delays, one per side, LFOs a quarter-cycle apart
    this.chorusWet = c.createGain()
    this.chorusWet.gain.value = 0
    const merger = c.createChannelMerger(2)
    for (let ch = 0; ch < 2; ch++) {
      const d = c.createDelay(0.1)
      d.delayTime.value = CHORUS_BASE
      const lfo = c.createOscillator()
      const depth = c.createGain()
      lfo.connect(depth).connect(d.delayTime)
      this.input.connect(d).connect(merger, 0, ch)
      this.lfos.push(lfo)
      this.depths.push(depth)
    }
    merger.connect(this.chorusWet).connect(this.output)

    this.delayWet = c.createGain()
    this.delayWet.gain.value = 0
    this.delayWet.connect(this.output)
    this.reverbWet = c.createGain()
    this.reverbWet.gain.value = 0
    this.reverbWet.connect(this.output)
    this.buildTails()
  }

  /** (Re)create the delay line and convolver — also how PANIC kills their tails. */
  private buildTails() {
    const c = this.ctx
    this.delay = c.createDelay(2.5)
    this.feedback = c.createGain()
    this.damp = c.createBiquadFilter()
    this.damp.type = 'lowpass'
    this.damp.frequency.value = 5000
    this.input.connect(this.delay).connect(this.delayWet)
    this.delay.connect(this.damp).connect(this.feedback).connect(this.delay)
    this.convolver = c.createConvolver()
    this.input.connect(this.convolver).connect(this.reverbWet)
    this.impulseKey = ''
    if (this.fx) this.apply(this.fx, true)
  }

  private started = false
  apply(fx: GlobalFx, immediate = false) {
    this.fx = { ...fx }
    const c = this.ctx
    const now = c.currentTime
    const set = (p: AudioParam, v: number) => (immediate ? (p.value = v) : p.setTargetAtTime(v, now, RAMP))
    for (const lfo of this.lfos) set(lfo.frequency, fx.chorusRate)
    for (const d of this.depths) set(d.gain, fx.chorusDepth * CHORUS_MAX_DEPTH)
    set(this.chorusWet.gain, fx.chorusMix)
    if (!this.started) {
      this.started = true
      this.lfos[0].start(now)
      this.lfos[1].start(now + 0.25 / Math.max(0.05, fx.chorusRate))
    }
    set(this.delay.delayTime, Math.max(0.01, fx.delayTime))
    set(this.feedback.gain, Math.min(0.95, fx.delayFeedback))
    set(this.delayWet.gain, fx.delayMix)
    set(this.reverbWet.gain, fx.reverbMix)
    clearTimeout(this.impulseTimer)
    const key = `${fx.reverbSize}|${fx.reverbDecay}`
    if (key !== this.impulseKey) {
      const load = () => {
        this.impulseKey = key
        this.convolver.buffer = getImpulse(c, fx.reverbSize, fx.reverbDecay)
      }
      if (immediate) load()
      else this.impulseTimer = setTimeout(load, 150)
    }
  }

  /** Silence delay + reverb tails immediately. */
  flush() {
    this.delay.disconnect()
    this.feedback.disconnect()
    this.damp.disconnect()
    this.convolver.disconnect()
    this.buildTails()
  }
}
