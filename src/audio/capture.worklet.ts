/**
 * CAPTURE's recorder (Granulator III's): the input, left and right, kept in a rolling buffer of CAPTURE_FRAMES
 * frames. Asked for the last few seconds, it sends them; every so often it sends the input's peak, for the meter.
 */
declare const sampleRate: number
declare function registerProcessor(name: string, ctor: unknown): void
declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor(options?: unknown)
}

/** Granulator III's buffer: 16 s at 48 kHz */
export const CAPTURE_FRAMES = 768000
/** the meter's peak goes out every this many render quanta (about 43 ms at 48 kHz) */
const METER_EVERY = 16

export type ToCapture = { type: 'grab'; seconds: number; id: number } | { type: 'stop' }
export type FromCapture =
  | { type: 'peak'; value: number }
  | { type: 'grabbed'; id: number; channels: Float32Array[]; rate: number }

class CaptureProcessor extends AudioWorkletProcessor {
  private ring = [new Float32Array(CAPTURE_FRAMES), new Float32Array(CAPTURE_FRAMES)]
  private at = 0
  private filled = 0
  private peak = 0
  private blocks = 0
  private stopped = false

  constructor() {
    super()
    this.port.onmessage = (e: MessageEvent<ToCapture>) => {
      const m = e.data
      if (m.type === 'stop') this.stopped = true
      else this.grab(m.seconds, m.id)
    }
  }

  /** the last \`seconds\` (as much as there is), oldest first */
  private grab(seconds: number, id: number) {
    const n = Math.min(this.filled, Math.round(seconds * sampleRate))
    const channels = this.ring.map((r) => {
      const out = new Float32Array(n)
      const start = (this.at - n + CAPTURE_FRAMES) % CAPTURE_FRAMES
      const first = Math.min(n, CAPTURE_FRAMES - start)
      out.set(r.subarray(start, start + first))
      if (first < n) out.set(r.subarray(0, n - first), first)
      return out
    })
    const reply: FromCapture = { type: 'grabbed', id, channels, rate: sampleRate }
    this.port.postMessage(reply, channels.map((c) => c.buffer))
  }

  process(inputs: Float32Array[][]): boolean {
    if (this.stopped) return false
    const input = inputs[0]
    if (input && input.length) {
      const n = input[0].length
      for (let i = 0; i < n; i++) {
        const l = input[0][i]
        const r = (input[1] ?? input[0])[i]
        this.ring[0][this.at] = l
        this.ring[1][this.at] = r
        this.at = (this.at + 1) % CAPTURE_FRAMES
        this.peak = Math.max(this.peak, Math.abs(l), Math.abs(r))
      }
      this.filled = Math.min(CAPTURE_FRAMES, this.filled + n)
    }
    if (++this.blocks >= METER_EVERY) {
      const m: FromCapture = { type: 'peak', value: this.peak }
      this.port.postMessage(m)
      this.blocks = 0
      this.peak = 0
    }
    return true
  }
}

registerProcessor('ssb-capture', CaptureProcessor)
