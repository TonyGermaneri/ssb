import workletUrl from './grains.worklet.ts?worker&url'
import type { FromGrains, GrainConfig, GrainEvent, ToGrains } from './grainMath'

/**
 * Grain voices play through an AudioWorklet (grains.worklet.ts). Its module loads with the AudioContext; a
 * grain note played in the first moments waits for it.
 */
let loading: Promise<void> | null = null
let loaded = false
export function loadGrains(ctx: AudioContext): Promise<void> {
  loading ??= ctx.audioWorklet.addModule(workletUrl).then(() => {
    loaded = true
  })
  return loading
}
export const grainsLoaded = () => loaded

/** samples already in the worklet's scope */
const sent = new Set<string>()
export const forgetGrainSample = (audioId: string) => sent.delete(audioId)

const samplePayload = (id: string, buffer: AudioBuffer) => ({
  id,
  channels: Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, c) => buffer.getChannelData(c).slice()),
  rate: buffer.sampleRate,
})

export interface GrainNode {
  node: AudioWorkletNode
  configure(config: GrainConfig): void
  stop(): void
}

/** A voice's grain processor, playing `buffer` (sent to the worklet the first time it's used). */
export function grainNode(
  ctx: AudioContext,
  audioId: string,
  buffer: AudioBuffer,
  config: GrainConfig,
  onGrains: (list: GrainEvent[]) => void,
  onDone: () => void,
): GrainNode {
  const first = !sent.has(audioId)
  const payload = first ? samplePayload(audioId, buffer) : undefined
  sent.add(audioId)
  const node = new AudioWorkletNode(ctx, 'ssb-grains', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: { id: audioId, config, sample: payload && { ch: payload.channels, rate: payload.rate } },
  })
  const send = (m: ToGrains, transfer: Transferable[] = []) => node.port.postMessage(m, transfer)
  node.port.onmessage = (e: MessageEvent<FromGrains>) => {
    const m = e.data
    if (m.type === 'grains') onGrains(m.list)
    else if (m.type === 'done') onDone()
    else if (m.type === 'need') {
      // the worklet lost it (a context the module was reloaded in): send it again
      const p = samplePayload(audioId, buffer)
      send({ type: 'sample', ...p }, p.channels.map((c) => c.buffer))
    }
  }
  return {
    node,
    configure: (c) => send({ type: 'config', config: c }),
    stop: () => send({ type: 'stop' }),
  }
}
