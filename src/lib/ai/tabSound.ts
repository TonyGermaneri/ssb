/**
 * A browser tab's stand-in for SoundHost (soundHost.ts), under routedSoundHost (pageSound.ts): a tab has no helper to
 * run audio.cpp, so only the page's own models (MusicGen, Stable Audio 3 Small's browser form) play there, and this fetches their files from the Hugging
 * Face Hub into the browser's storage -- the Cache API, under the same name and keys transformers.js reads its cache
 * by (the files' pinned Hub URLs), so the worker finds them there and never fetches them again.
 *
 * A download streams each file to the cache with its progress in the status; a stopped one keeps the files it
 * finished (the one it was on starts again). Loading, generating and unloading are the page engine's: asked of this,
 * they mean an audio.cpp model, which a tab can't run.
 */
import { AiError } from './types'
import type { SoundCheck, SoundHostApi, SoundStatus, SoundTask } from './soundHost'
import type { SoundModelInfo } from './soundModels'
import { forgetModel, keepModel } from './tabKeep'

/** transformers.js's cache (env.cacheKey's default) */
export const TAB_CACHE = 'transformers-cache'

const notHere = (m: SoundModelInfo) => new AiError(`${m.label} runs in the SSB app or plugin: a browser tab runs Stable Audio 3 Small Music and MusicGen Small`, 'request')

/** the Cache API, as this needs it (a stand-in in tests) */
export type CacheOpener = () => Promise<Pick<Cache, 'match' | 'put' | 'delete'>>

export class TabSoundFiles implements SoundHostApi {
  private task: (SoundTask & { started: number }) | null = null
  private failed: { model: string; message: string } | null = null
  private stop: AbortController | null = null

  constructor(
    private readonly open: CacheOpener = () => caches.open(TAB_CACHE),
    private readonly fetcher: typeof fetch = (...a) => fetch(...a),
  ) {}

  async status(): Promise<SoundStatus> {
    const t = this.task
    return {
      available: typeof caches !== 'undefined',
      backend: 'browser',
      helper: 'running',
      ...(t ? { task: { ...t, elapsed: (performance.now() - t.started) / 1000 } } : {}),
      ...(this.failed && !t ? { error: this.failed } : {}),
      modelsDir: "this browser's storage",
    }
  }

  async check(models: SoundModelInfo[]): Promise<SoundCheck[]> {
    const cache = await this.open().catch(() => null)
    return Promise.all(
      models.map(async (m) => {
        if (!m.page || !cache) return { id: m.id, downloaded: false, missing: m.files.reduce((n, f) => n + f.bytes, 0) }
        let missing = 0
        let all = true
        for (const f of m.files) {
          if (await cache.match(f.url)) continue
          all = false
          missing += f.bytes
        }
        if (all) keepModel(m.id)
        return { id: m.id, downloaded: all, missing }
      }),
    )
  }

  async download(m: SoundModelInfo): Promise<void> {
    if (!m.page) throw notHere(m)
    if (this.task) throw new AiError(`busy: ${this.task.kind} ${this.task.model}`, 'request')
    const cache = await this.open()
    const todo: SoundModelInfo['files'] = []
    for (const f of m.files) if (!(await cache.match(f.url))) todo.push(f)
    const total = todo.reduce((n, f) => n + f.bytes, 0)
    // room for it (the browser's quota for this site), and asked to keep it rather than clear it under pressure
    const est = await navigator.storage?.estimate?.().catch(() => null)
    if (est?.quota != null && est.usage != null && est.quota - est.usage < total * 1.05) {
      throw new AiError(`${m.label} needs ${Math.round(total / 1e6)} MB, and this browser allows this page about ${Math.max(0, Math.round((est.quota - est.usage) / 1e6))} MB more`, 'request')
    }
    void navigator.storage?.persist?.().catch(() => false)
    this.failed = null
    this.stop = new AbortController()
    this.task = { kind: 'download', model: m.id, message: 'downloading', done: 0, total, progress: total ? 0 : null, elapsed: 0, started: performance.now() }
    void this.fetchAll(m, todo, cache, this.stop.signal)
  }

  private async fetchAll(m: SoundModelInfo, todo: SoundModelInfo['files'], cache: Awaited<ReturnType<CacheOpener>>, signal: AbortSignal) {
    let before = 0
    try {
      for (const f of todo) {
        const res = await this.fetcher(f.url, { signal })
        if (!res.ok || !res.body) throw new AiError(`${f.path}: the Hub answered ${res.status}`, 'request')
        let got = 0
        const task = this.task!
        const counted = res.body.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, out) {
              got += chunk.byteLength
              task.done = before + got
              task.progress = task.total ? Math.min(1, task.done / task.total) : null
              out.enqueue(chunk)
            },
          }),
        )
        // streamed into the cache (never the whole file in memory)
        await cache.put(f.url, new Response(counted, { headers: { 'content-type': res.headers.get('content-type') ?? 'application/octet-stream' } })).catch((e) => {
          throw new AiError(`${f.path}: the browser couldn't store it (${e instanceof Error ? e.message : String(e)})`, 'request')
        })
        if (signal.aborted) throw new AiError('cancelled', 'aborted')
        before += f.bytes || got
      }
      // (had in this browser: if it's cleared before the next visit, it comes back by itself: tabKeep.ts)
      keepModel(m.id)
    } catch (e) {
      this.failed = { model: m.id, message: signal.aborted ? 'cancelled' : e instanceof Error ? e.message : String(e) }
    } finally {
      this.task = null
      this.stop = null
    }
  }

  async load(m: SoundModelInfo): Promise<void> {
    throw notHere(m)
  }
  async unload(): Promise<void> {}
  async cancel(): Promise<void> {
    this.stop?.abort()
  }
  async remove(m: SoundModelInfo): Promise<void> {
    if (!m.page) return
    // (deleted on purpose: not brought back)
    forgetModel(m.id)
    const cache = await this.open()
    for (const f of m.files) await cache.delete(f.url)
  }
  async generate(m: SoundModelInfo): Promise<never> {
    throw notHere(m)
  }
}
