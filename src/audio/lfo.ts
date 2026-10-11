import { lfoHz, type Lfo, type LfoShape } from '../types'
import { loadGrains } from './grains'
import type { LfoOptions, ToLfo } from './lfoMath'

/** What an LFO plays: the matrix's Lfo with its frequency worked out. */
export interface LfoConfig {
  shape: LfoShape
  hz: number
  stereo: number // degrees
  quant: number
  amount: number
}

export const lfoConfig = (lfo: Lfo, bpm: number): LfoConfig => ({
  shape: lfo.shape,
  hz: lfoHz(lfo, bpm),
  stereo: lfo.stereo ?? 0,
  quant: lfo.quant ?? 0,
  amount: lfo.amount ?? 1,
})

/**
 * A matrix LFO as AudioNodes: `output` is its left side (and what every route but the grains' right side reads),
 * `outputR` its right; both already × its depth. Routes to its RATE (semitones) go into `rateIn`, routes to its
 * AMOUNT into `depthIn`.
 *
 * It runs in the grain worklet's module (lfoMath.ts, sample by sample like the plugin's engine). Until that module
 * has loaded (the first moments after the AudioContext starts) the outputs are silent; the nodes themselves are
 * there from the start, so routes can connect at once.
 */
export class LfoSource {
  readonly output: GainNode
  readonly outputR: GainNode
  readonly rateIn: GainNode
  readonly depthIn: GainNode
  private node?: AudioWorkletNode
  private stopped = false

  constructor(
    private ctx: BaseAudioContext,
    private cfg: LfoConfig,
    private start = ctx.currentTime,
    /** cycles at `start`; null: FREE, where an LFO running since time 0 would be */
    private phase: number | null = 0,
  ) {
    this.output = ctx.createGain()
    this.outputR = ctx.createGain()
    this.rateIn = ctx.createGain()
    this.depthIn = ctx.createGain()
    void loadGrains(ctx as AudioContext).then(() => this.attach())
  }

  private attach() {
    if (this.stopped) return
    const now = this.ctx.currentTime
    const hz = Math.max(0, this.cfg.hz)
    let start = this.start
    let phase = this.phase ?? start * hz
    if (now > start) {
      // late (the module was still loading): carry on from where it would be by now
      phase += (now - start) * hz
      start = now
    }
    const opts: LfoOptions = { shape: this.cfg.shape, stereo: this.cfg.stereo, quant: this.cfg.quant, phase: phase - Math.floor(phase), start }
    const node = new AudioWorkletNode(this.ctx, 'ssb-lfo', {
      numberOfInputs: 0,
      numberOfOutputs: 2,
      outputChannelCount: [1, 1],
      processorOptions: opts,
    })
    node.parameters.get('hz')!.value = hz
    node.parameters.get('depth')!.value = this.cfg.amount
    node.connect(this.output, 0)
    node.connect(this.outputR, 1)
    this.rateIn.connect(node.parameters.get('rate')!)
    this.depthIn.connect(node.parameters.get('depth')!)
    this.node = node
  }

  private send(m: ToLfo) {
    this.node?.port.postMessage(m)
  }

  /** Follow changed settings; the phase runs on. */
  set(cfg: LfoConfig) {
    const was = this.cfg
    this.cfg = cfg
    if (!this.node) return
    const now = this.ctx.currentTime
    if (cfg.hz !== was.hz) this.node.parameters.get('hz')!.setValueAtTime(Math.max(0, cfg.hz), now)
    if (cfg.amount !== was.amount) this.node.parameters.get('depth')!.setTargetAtTime(cfg.amount, now, 0.01)
    if (cfg.shape !== was.shape || cfg.stereo !== was.stereo || cfg.quant !== was.quant)
      this.send({ type: 'set', shape: cfg.shape, stereo: cfg.stereo, quant: cfg.quant })
  }

  /** Start the cycle again from `phase` (cycles) at `at` (MIDI Start). */
  restart(at = this.ctx.currentTime, phase = 0) {
    this.start = at
    this.phase = phase
    this.send({ type: 'restart', phase, at })
  }

  stop() {
    this.stopped = true
    this.send({ type: 'stop' })
    this.node?.disconnect()
    for (const n of [this.output, this.outputR, this.rateIn, this.depthIn]) n.disconnect()
  }
}
