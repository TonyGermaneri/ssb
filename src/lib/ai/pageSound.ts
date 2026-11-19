/**
 * Sound models SSB runs in its page, not in audio.cpp (SoundModelInfo.page: MusicGen, which audio.cpp hasn't): the
 * model in a worker (workers/musicgen.worker.ts), its files downloaded by SoundHost like any model's and served by the
 * editor at ssb-models/<id>/ -- or, in a browser tab, fetched by the page into the browser's cache (tabSound.ts, the
 * `native` host there).
 *
 * `routedSoundHost` puts it behind the one SoundHostApi the tools, the settings and the garden use: a page model's
 * load, generate and cancel go to the worker; everything else (downloads, checks, deletes, and every audio.cpp model)
 * to the native host. One model at a time, as ever: loading a page model unloads audio.cpp's, and the reverse.
 */
import { AiError } from './types'
import { inNative } from '../../native/bridge'
import type { SoundClip, SoundHostApi, SoundRequest, SoundStatus, SoundTask } from './soundHost'
import type { SoundModelInfo } from './soundModels'
import type { MusicgenJob, MusicgenReply } from '../../workers/musicgen.worker'
import type { Sa3Job, Sa3Reply } from '../../workers/sa3.worker'
import { TAB_CACHE } from './tabSound'
import { hereForm } from './soundHost'
// ONNX Runtime's WebAssembly (its CPU build, asyncify), shipped with the page -- never a CDN: it runs offline
import ortMjs from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
// (and the plain build: Stable Audio 3's CPU path needs its 4-bit embedding kernel)
import ortPlainMjs from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url'
import ortPlainWasm from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'

/** what a page model's host does (the worker one; a stand-in in tests) */
export interface PageSoundEngine {
  load(m: SoundModelInfo): Promise<void>
  generate(
    m: SoundModelInfo,
    req: SoundRequest,
    seconds: number,
    onProgress?: (p: number) => void,
  ): Promise<{ wav: ArrayBuffer; rate: number; ms: number; channels?: 1 | 2; seed?: number; device?: string }>
  /** stop: the worker goes (a generation can't be stopped part way), and the model with it */
  stop(): void
  /** what it's running on: webgpu, wasm */
  device?(): string
}

type AnyJob = MusicgenJob | Sa3Job
type AnyReply = MusicgenReply | Sa3Reply

/** the page's workers: MusicGen's, or Stable Audio 3's (by the model's engine) */
export function workerEngine(): PageSoundEngine {
  let worker: Worker | null = null
  let kind: 'musicgen' | 'sa3' = 'musicgen'
  let device = ''
  let seq = 1
  const waiting = new Map<number, { done: (r: AnyReply) => void; progress?: (p: number) => void }>()
  const send = (job: AnyJob, progress?: (p: number) => void) =>
    new Promise<AnyReply>((resolve) => {
      waiting.set(job.id, { done: resolve, progress })
      worker!.postMessage(job)
    })
  function stop() {
    worker?.terminate()
    worker = null
    for (const [, w] of waiting) w.done({ id: 0, op: 'error', error: 'cancelled' })
    waiting.clear()
  }
  return {
    async load(m) {
      stop()
      kind = m.engine === 'sa3' ? 'sa3' : 'musicgen'
      worker =
        kind === 'sa3'
          ? new Worker(new URL('../../workers/sa3.worker.ts', import.meta.url), { type: 'module' })
          : new Worker(new URL('../../workers/musicgen.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e: MessageEvent<AnyReply>) => {
        const w = waiting.get(e.data.id)
        if (!w) return
        // (a step done: news, not the answer)
        if (e.data.op === 'progress') return w.progress?.(e.data.done / e.data.of)
        waiting.delete(e.data.id)
        w.done(e.data)
      }
      const base = document.baseURI
      const ort = { mjs: new URL(ortMjs, base).href, wasm: new URL(ortWasm, base).href }
      let r: AnyReply
      if (kind === 'sa3') {
        if (!m.hub) throw new AiError(`${m.label} has no browser files`, 'request')
        const cpu = { mjs: new URL(ortPlainMjs, base).href, wasm: new URL(ortPlainWasm, base).href }
        r = await send({ op: 'init', id: seq++, base: `https://huggingface.co/${m.hub.repo}/resolve/${m.hub.revision}`, cache: TAB_CACHE, ort: { gpu: ort, cpu }, gpu: true })
        if (r.op === 'ready' && 'device' in r) device = r.device
      } else {
        // (the app / plugin: the files SoundHost downloaded, served by the editor; a tab: the browser's cache, tabSound.ts)
        const local = inNative() || !m.hub ? new URL('ssb-models/', base).href : null
        r = await send({ op: 'init', id: seq++, model: m.id, local, ...(m.hub ? { hub: m.hub } : {}), ort })
        device = 'wasm'
      }
      if (r.op !== 'ready') {
        stop()
        throw new AiError(r.op === 'error' ? r.error : `${m.label} did not load`, 'server')
      }
    },
    async generate(m, req, seconds, onProgress) {
      if (!worker) throw new AiError(`${m.label} is not loaded`, 'request')
      const seed = req.seed ?? Math.floor(Math.random() * 2 ** 31)
      const r =
        kind === 'sa3'
          ? await send({ op: 'generate', id: seq++, prompt: req.prompt, seconds, steps: req.steps ?? m.defaultSteps, seed }, onProgress)
          : await send({ op: 'generate', id: seq++, prompt: req.prompt, seconds, guidance: req.guidance ?? m.defaultGuidance })
      if (r.op === 'error') throw new AiError(r.error, r.error === 'cancelled' ? 'aborted' : 'server')
      if (r.op !== 'audio') throw new AiError(`${m.label} answered without audio`, 'server')
      return { wav: r.wav, rate: r.rate, ms: r.ms, channels: kind === 'sa3' ? 2 : 1, seed: kind === 'sa3' ? seed : undefined, device }
    },
    stop,
    device: () => device,
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The native host with page models routed to `engine` (see the top of this file). */
export function routedSoundHost(native: SoundHostApi, engine: PageSoundEngine = workerEngine(), pollMs = 400): SoundHostApi {
  let loaded: SoundModelInfo | null = null
  let loadSeconds = 0
  let task: SoundTask | null = null
  let failed: { model: string; message: string } | null = null
  /** the load under way, superseded by a newer one (or a cancel) */
  let job = 0

  async function loadPage(m: SoundModelInfo, mine: number) {
    const t0 = performance.now()
    try {
      // its files first, downloaded by the native host (resumably, with its progress in the status)
      const [c] = await native.check([m])
      if (!c?.downloaded) {
        await native.download(m)
        for (;;) {
          await sleep(pollMs)
          if (mine !== job) return
          const st = await native.status()
          if (st.task?.model === m.id) continue
          if (st.error?.model === m.id) throw new AiError(st.error.message, st.error.message === 'cancelled' ? 'aborted' : 'request')
          break
        }
        const [after] = await native.check([m])
        if (!after?.downloaded) throw new AiError(`the download of ${m.label} stopped before it was complete`, 'request')
      }
      if (mine !== job) return
      task = { kind: 'load', model: m.id, loads: true, message: `loading ${m.label} in SSB`, done: 0, total: 0, progress: null, elapsed: 0 }
      await engine.load(m)
      if (mine !== job) return
      loaded = m
      loadSeconds = Math.round((performance.now() - t0) / 100) / 10
    } catch (e) {
      if (mine === job) failed = { model: m.id, message: e instanceof Error ? e.message : String(e) }
    } finally {
      if (mine === job) task = null
    }
  }

  return {
    async status(): Promise<SoundStatus> {
      const st = await native.status()
      const out: SoundStatus = { ...st }
      if (task) {
        // downloading its files: the native host's task, said to end loaded
        out.task = st.task?.model === task.model ? { ...st.task, loads: true } : { ...task, elapsed: task.elapsed }
      }
      if (loaded) {
        out.loaded = { id: loaded.id, label: loaded.label, family: loaded.family, loadSeconds }
        const d = engine.device?.()
        if (d) out.backend = d === 'webgpu' ? 'WebGPU' : d === 'wasm' ? 'CPU' : d
      }
      if (failed && !task) out.error = failed
      return out
    },
    // (in a browser tab a model with a browser form is that form: its files, its engine)
    check: (models) => native.check(models.map((m) => hereForm(m))),
    async load(m0) {
      const m = hereForm(m0)
      failed = null
      if (!m.page) {
        if (loaded || task) {
          job++
          task = null
          loaded = null
          engine.stop()
        }
        return native.load(m)
      }
      if (loaded?.id === m.id && !task) return
      const st = await native.status()
      if (st.task?.kind === 'generate') throw new AiError(`busy: generate ${st.task.model}`, 'request')
      if (st.loaded) await native.unload()
      engine.stop()
      loaded = null
      const mine = ++job
      task = { kind: 'download', model: m.id, loads: true, message: 'checking', done: 0, total: 0, progress: null, elapsed: 0 }
      void loadPage(m, mine)
    },
    download: (m) => native.download(hereForm(m)),
    async unload() {
      job++
      task = null
      loaded = null
      engine.stop()
      await native.unload()
    },
    async cancel() {
      if (task || loaded) {
        const was = task?.kind
        job++
        if (task) failed = { model: task.model, message: 'cancelled' }
        task = null
        // a generation can't be stopped part way: the worker goes, and the model must load again
        if (was === 'generate' || was === 'load') {
          engine.stop()
          loaded = null
        }
        if (was === 'download') await native.cancel()
        return
      }
      await native.cancel()
    },
    async remove(m0) {
      const m = hereForm(m0)
      if (loaded?.id === m.id) {
        engine.stop()
        loaded = null
      }
      await native.remove(m)
    },
    async generate(m0, req): Promise<SoundClip> {
      const m = hereForm(m0)
      if (!m.page) return native.generate(m, req)
      if (loaded?.id !== m.id) throw new AiError(`${m.label} isn't loaded: load it first`, 'request')
      if (task) throw new AiError(`busy: ${task.kind} ${task.model}`, 'request')
      const seconds = Math.round(Math.min(Math.max(req.seconds ?? 5, 0.5), m.maxSeconds) * 10) / 10
      task = { kind: 'generate', model: m.id, message: 'generating', done: 0, total: 0, progress: null, elapsed: 0 }
      const mine = job
      try {
        const r = await engine.generate(m, req, seconds, (p) => {
          if (task?.kind === 'generate' && mine === job) task.progress = p
        })
        // (MusicGen samples with the page's own randomness: a seed can't bring a clip back)
        return { wav: r.wav, rate: r.rate, channels: r.channels ?? 1, seed: r.seed ?? req.seed ?? 0, model: m.id, elapsed: Math.round(r.ms / 100) / 10 }
      } finally {
        if (mine === job) task = null
      }
    },
  }
}
