import workletUrl from './grains.worklet.ts?worker&url'
import type { FromGrains, GrainConfig, GrainEvent, ToGrains } from './grainMath'

/**
 * Grain voices play through an AudioWorklet (grains.worklet.ts). Its module loads with the AudioContext; a
 * grain note played in the first moments waits for it. Each context has its own worklet scope (the live one, and any
 * OfflineAudioContext an offline render makes), so the module and the samples sent to it are kept per context.
 */
interface Scope {
  loading: Promise<void>
  loaded: boolean
  /** samples already in this scope, by audio id: the version sent (see forgetGrainSample) */
  sent: Map<string, number>
}
const scopes = new WeakMap<BaseAudioContext, Scope>()
export function loadGrains(ctx: BaseAudioContext): Promise<void> {
  let s = scopes.get(ctx)
  if (!s) {
    const scope: Scope = { loading: Promise.resolve(), loaded: false, sent: new Map() }
    scope.loading = ctx.audioWorklet.addModule(workletUrl).then(() => {
      scope.loaded = true
    })
    scopes.set(ctx, (s = scope))
  }
  return s.loading
}
export const grainsLoaded = (ctx: BaseAudioContext) => !!scopes.get(ctx)?.loaded

/** an audio id's version: bumped when its audio is replaced, so every scope is sent it again */
const versions = new Map<string, number>()
export const forgetGrainSample = (audioId: string) => versions.set(audioId, (versions.get(audioId) ?? 0) + 1)

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
  ctx: BaseAudioContext,
  audioId: string,
  buffer: AudioBuffer,
  config: GrainConfig,
  onGrains: (list: GrainEvent[]) => void,
  onDone: () => void,
): GrainNode {
  const sent = scopes.get(ctx)?.sent ?? new Map<string, number>()
  const version = versions.get(audioId) ?? 0
  const first = sent.get(audioId) !== version
  const payload = first ? samplePayload(audioId, buffer) : undefined
  sent.set(audioId, version)
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
