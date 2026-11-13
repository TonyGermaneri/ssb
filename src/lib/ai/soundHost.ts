/**
 * The sound models' host, as the page reaches it: the SSB app or plugin (native/plugin/SoundHost), through the
 * `ssbSound` native function. It downloads models, runs one at a time in audio.cpp (a helper process, out of the
 * DAW's), and generates clips with it. A browser tab has none: the feature is the app's and the plugin's.
 */
import { callNative, inNative } from '../../native/bridge'
import { AiError } from './types'
import type { SoundModelInfo } from './soundModels'

export interface SoundTask {
  kind: 'download' | 'load' | 'generate'
  /** the model's id */
  model: string
  message: string
  done: number
  total: number
  /** 0..1, or null when it can't tell (loading, generating) */
  progress: number | null
  /** seconds since it began */
  elapsed: number
}

export interface SoundStatus {
  /** this build carries the helper */
  available: boolean
  backend: string
  helper: 'stopped' | 'starting' | 'running'
  loaded?: { id: string; label: string; family: string; loadSeconds: number }
  task?: SoundTask
  /** the last download or load that failed (or was cancelled) */
  error?: { model: string; message: string }
  modelsDir: string
}

export interface SoundCheck {
  id: string
  downloaded: boolean
  /** bytes still to download */
  missing: number
}

export interface SoundRequest {
  prompt: string
  negative_prompt?: string
  seconds?: number
  steps?: number
  guidance?: number
  seed?: number
}

export interface SoundClip {
  wav: ArrayBuffer
  rate: number
  channels: number
  seed: number
  /** the model's id */
  model: string
  /** how long it took, s */
  elapsed: number
}

/** what the tools and the settings need of a host (the native one, or a stand-in in tests) */
export interface SoundHostApi {
  status(): Promise<SoundStatus>
  check(models: SoundModelInfo[]): Promise<SoundCheck[]>
  load(model: SoundModelInfo): Promise<void>
  download(model: SoundModelInfo): Promise<void>
  unload(): Promise<void>
  cancel(): Promise<void>
  remove(model: SoundModelInfo): Promise<void>
  generate(model: SoundModelInfo, req: SoundRequest): Promise<SoundClip>
}

export const soundModelsAvailable = () => inNative()

/** a model as the native side takes it (plus the token, for gated files) */
const specOf = (m: SoundModelInfo, token?: string) => ({ id: m.id, label: m.label, family: m.family, task: m.task, main: m.main, files: m.files, ...(m.gated && token ? { token } : {}) })

/** audio.cpp's request for one clip */
export function requestFor(m: SoundModelInfo, req: SoundRequest, seed: number) {
  return {
    text: req.prompt,
    seed,
    options: {
      duration_sec: Math.round(Math.min(Math.max(req.seconds ?? 5, 0.5), m.maxSeconds) * 10) / 10,
      [m.stepsOption]: req.steps ?? m.defaultSteps,
      guidance_scale: req.guidance ?? m.defaultGuidance,
      ...(req.negative_prompt ? { negative_prompt: req.negative_prompt } : {}),
      ...(m.extraOptions ?? {}),
    },
  }
}

function fromBase64(data: string): ArrayBuffer {
  const bin = atob(data)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

type Reply = { error?: string } & Record<string, unknown>

export class NativeSoundHost implements SoundHostApi {
  constructor(private readonly token: () => string = () => '') {}

  private async call<T>(op: string, extra: object = {}): Promise<T> {
    if (!inNative()) throw new AiError('sound models run in the SSB app or plugin, not in a browser tab', 'request')
    const r = await callNative<Reply>('ssbSound', { op, ...extra })
    if (r && typeof r === 'object' && 'error' in r && r.error) throw new AiError(String(r.error), 'request')
    return r as T
  }

  status() {
    return this.call<SoundStatus>('status')
  }
  check(models: SoundModelInfo[]) {
    return this.call<SoundCheck[]>('check', { models: models.map((m) => specOf(m)) })
  }
  async load(m: SoundModelInfo) {
    await this.call('load', { model: specOf(m, this.token()) })
  }
  async download(m: SoundModelInfo) {
    await this.call('download', { model: specOf(m, this.token()) })
  }
  async unload() {
    await this.call('unload')
  }
  async cancel() {
    await this.call('cancel')
  }
  async remove(m: SoundModelInfo) {
    await this.call('remove', { model: specOf(m) })
  }
  async generate(m: SoundModelInfo, req: SoundRequest): Promise<SoundClip> {
    const seed = req.seed ?? Math.floor(Math.random() * 2 ** 31)
    const r = await this.call<{ audio: string; sample_rate: number; channels: number; elapsed: number; model: string }>('generate', { request: requestFor(m, req, seed) })
    if (!r.audio) throw new AiError('the sound model answered without audio', 'server')
    return { wav: fromBase64(r.audio), rate: r.sample_rate, channels: r.channels, seed, model: r.model, elapsed: Math.round(r.elapsed * 10) / 10 }
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new AiError('Stopped', 'aborted'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(new AiError('Stopped', 'aborted'))), { once: true })
  })

/**
 * Load `model` (downloading what's missing first) and wait until it's loaded or fails, reporting progress; stopping
 * cancels it on the host.
 */
export async function loadAndWait(host: SoundHostApi, model: SoundModelInfo, onStatus?: (s: SoundStatus) => void, signal?: AbortSignal, pollMs = 500): Promise<SoundStatus> {
  const before = await host.status()
  if (before.loaded?.id === model.id && !before.task) return before
  if (before.task?.model !== model.id || before.task.kind === 'generate') await host.load(model)
  const onAbort = () => void host.cancel().catch(() => {})
  signal?.addEventListener('abort', onAbort)
  try {
    for (;;) {
      await sleep(pollMs, signal)
      const s = await host.status()
      onStatus?.(s)
      if (s.loaded?.id === model.id && !s.task) return s
      if (!s.task) {
        if (s.error?.model === model.id) throw new AiError(s.error.message, s.error.message === 'cancelled' ? 'aborted' : 'request')
        throw new AiError(`loading ${model.label} stopped without saying why`, 'server')
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}

/** the generation, cancelled on the host when stopped (audio.cpp can't stop part way: the model reloads) */
export async function generateWithStop(host: SoundHostApi, model: SoundModelInfo, req: SoundRequest, signal?: AbortSignal): Promise<SoundClip> {
  const onAbort = () => void host.cancel().catch(() => {})
  signal?.addEventListener('abort', onAbort)
  try {
    const clip = await host.generate(model, req)
    if (signal?.aborted) throw new AiError('Stopped', 'aborted')
    return clip
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}
