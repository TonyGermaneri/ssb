import { ref, shallowRef } from 'vue'
import captureUrl from './capture.worklet.ts?worker&url'
import type { FromCapture, ToCapture } from './capture.worklet'

/** CAPTURE's lengths, seconds (Granulator III's) */
export const CAPTURE_SECONDS = [1, 2, 4, 8]

/**
 * CAPTURE (Granulator III's): while it's on, the audio input runs into a rolling buffer (capture.worklet.ts, in an
 * AudioContext of its own, so it works whichever engine is playing); grab() takes the last few seconds,
 * peak-normalised to 1 as Granulator III does.
 */
class Capture {
  readonly on = ref(false)
  readonly starting = ref(false)
  /** the input's recent peak, 0..1 */
  readonly level = ref(0)
  readonly error = shallowRef<string | null>(null)
  private ctx?: AudioContext
  private node?: AudioWorkletNode
  private stream?: MediaStream
  private nextId = 1
  private waiting = new Map<number, (r: { channels: Float32Array[]; rate: number }) => void>()

  async start() {
    if (this.on.value || this.starting.value) return
    this.error.value = null
    this.starting.value = true
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('No audio input here')
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 },
      })
      const ctx = new AudioContext()
      await ctx.audioWorklet.addModule(captureUrl)
      const node = new AudioWorkletNode(ctx, 'ssb-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 2,
        channelCountMode: 'explicit',
        channelInterpretation: 'speakers',
      })
      node.port.onmessage = (e: MessageEvent<FromCapture>) => {
        const m = e.data
        if (m.type === 'peak') this.level.value = Math.min(1, m.value)
        else {
          this.waiting.get(m.id)?.({ channels: m.channels, rate: m.rate })
          this.waiting.delete(m.id)
        }
      }
      ctx.createMediaStreamSource(this.stream).connect(node)
      // (silent: a node only runs while something pulls on it)
      node.connect(ctx.destination)
      await ctx.resume()
      this.ctx = ctx
      this.node = node
      this.on.value = true
    } catch (e) {
      console.error(e)
      this.error.value = e instanceof Error && e.name === 'NotAllowedError' ? 'Input not allowed' : 'No audio input here'
      this.stop()
    } finally {
      this.starting.value = false
    }
  }

  stop() {
    const m: ToCapture = { type: 'stop' }
    this.node?.port.postMessage(m)
    this.node?.disconnect()
    for (const t of this.stream?.getTracks() ?? []) t.stop()
    void this.ctx?.close()
    this.ctx = this.node = this.stream = undefined
    this.on.value = false
    this.level.value = 0
    for (const resolve of this.waiting.values()) resolve({ channels: [], rate: 0 })
    this.waiting.clear()
  }

  /** The last `seconds` of the input, peak-normalised; null when there's nothing (or only silence). */
  async grab(seconds: number): Promise<{ channels: Float32Array[]; rate: number } | null> {
    const node = this.node
    if (!node) return null
    const id = this.nextId++
    const got = await new Promise<{ channels: Float32Array[]; rate: number }>((resolve) => {
      this.waiting.set(id, resolve)
      const m: ToCapture = { type: 'grab', seconds, id }
      node.port.postMessage(m)
    })
    if (!got.channels.length || !got.channels[0].length) return null
    return normalise(got.channels) ? got : null
  }
}

/** Scale to a peak of 1 (in place); false for silence. */
export function normalise(channels: Float32Array[]): boolean {
  let peak = 0
  for (const c of channels) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]))
  if (peak < 1e-6) return false
  const g = 1 / peak
  for (const c of channels) for (let i = 0; i < c.length; i++) c[i] *= g
  return true
}

export const capture = new Capture()
