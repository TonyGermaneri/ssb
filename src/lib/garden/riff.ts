/**
 * The garden's word model, from the page's side: which one (a VCO's ☰ menu › Word model), whether it's downloaded, its
 * worker (workers/riff.worker.ts) and `wordsFor(prompt, kind)`, which lists words of a ring's kind for what someone
 * typed (none: no model, or nothing came back) -- the rings' words come only from it.
 *
 * In the app and the plugin SoundHost downloads it (one job at a time, with the sound models: busy while one of them
 * downloads, loads or generates), and the editor serves it at ssb-models/. In a browser tab loading it is the
 * download: transformers.js fetches it from the Hub into the browser's cache, and it's remembered as fetched.
 */
import { reactive } from 'vue'
import { callNative, inNative } from '../../native/bridge'
import type { RiffJob, RiffReply } from '../../workers/riff.worker'
import { DEFAULT_WORD_MODEL, nativeSpec, wordModelBytes, wordModelOf, type WordModel } from './wordModels'
import type { RingKind } from './garden'
// ONNX Runtime's WebAssembly (its CPU build, asyncify), shipped with the page -- never a CDN: it runs offline
import ortMjs from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'

const PREFS = 'ssb:wordModel'
const FETCHED = 'ssb:wordModel:fetched:'
function readPrefs(): { id: string; on: boolean } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? 'null')
    if (p && typeof p.id === 'string' && wordModelOf(p.id)) return { id: p.id, on: p.on !== false }
  } catch {
    /* defaults */
  }
  return { id: DEFAULT_WORD_MODEL, on: true }
}
const store = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* a private window: not remembered */
  }
}

export type RiffStatus = 'none' | 'downloading' | 'loading' | 'ready' | 'error'
export const riffState = reactive({
  ...readPrefs(),
  /** downloaded (null: not known yet) */
  downloaded: null as boolean | null,
  status: 'none' as RiffStatus,
  /** 0..1 while downloading or loading */
  progress: 0,
  doneBytes: 0,
  totalBytes: 0,
  error: '',
  /** the last words it gave and how long they took */
  last: '',
  lastMs: 0,
})
export const riffModel = (): WordModel => wordModelOf(riffState.id) ?? wordModelOf(DEFAULT_WORD_MODEL)!
const savePrefs = () => store(PREFS, JSON.stringify({ id: riffState.id, on: riffState.on }))

let worker: Worker | null = null
let workerModel = ''
let seq = 1
const waiting = new Map<number, { resolve: (r: RiffReply) => void; progress?: (r: Extract<RiffReply, { op: 'progress' }>) => void }>()

function send(job: RiffJob, progress?: (r: Extract<RiffReply, { op: 'progress' }>) => void): Promise<RiffReply> {
  return new Promise((resolve) => {
    waiting.set(job.id, { resolve, progress })
    worker!.postMessage(job)
  })
}
function stopWorker() {
  worker?.terminate()
  worker = null
  workerModel = ''
  for (const [, w] of waiting) w.resolve({ id: 0, op: 'error', error: 'stopped' })
  waiting.clear()
  if (riffState.status === 'ready' || riffState.status === 'loading') riffState.status = 'none'
}

/** whether the chosen model's files are here (the app / plugin: SoundHost's check; a tab: fetched before) */
export async function checkWordModel(): Promise<boolean> {
  const m = riffModel()
  let have = false
  if (inNative()) {
    try {
      const r = await callNative<{ id: string; downloaded: boolean; missing: number }[]>('ssbSound', { op: 'check', models: [nativeSpec(m)] })
      have = !!r?.[0]?.downloaded
    } catch {
      have = false
    }
  } else {
    try {
      have = localStorage.getItem(FETCHED + m.id) === '1'
    } catch {
      have = false
    }
  }
  if (riffModel().id === m.id) riffState.downloaded = have
  return have
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** download (the app / plugin) and load the chosen model; a tab's load is its download */
export async function downloadWordModel(): Promise<void> {
  const m = riffModel()
  riffState.error = ''
  if (inNative() && !(await checkWordModel())) {
    riffState.status = 'downloading'
    riffState.progress = 0
    riffState.totalBytes = wordModelBytes(m)
    // a failed call answers { error: "why" }; one that started answers the status (whose error, an object, is old news)
    const started = await callNative<{ error?: unknown } | null>('ssbSound', { op: 'download', model: nativeSpec(m) }).catch((e) => ({ error: String(e) }))
    const why = typeof started?.error === 'string' ? started.error : ''
    if (why) return fail(why)
    for (;;) {
      await sleep(400)
      const st = await callNative<{ task?: { kind: string; model: string; done: number; total: number; progress: number | null }; error?: { model: string; message: string } }>('ssbSound', { op: 'status' }).catch(() => null)
      const t = st?.task
      if (t && t.model === m.id) {
        riffState.doneBytes = t.done
        riffState.totalBytes = t.total || riffState.totalBytes
        riffState.progress = t.progress ?? (t.total ? t.done / t.total : 0)
        continue
      }
      if (st?.error?.model === m.id) return fail(st.error.message)
      break
    }
    if (!(await checkWordModel())) return fail('the download stopped before it was complete')
  }
  await loadWordModel()
}
function fail(why: string) {
  riffState.status = 'error'
  riffState.error = why
}

/** the chosen model into its worker (once it's downloaded); asked again while it loads, the same load */
let loading: { id: string; done: Promise<boolean> } | null = null
export function loadWordModel(): Promise<boolean> {
  const m = riffModel()
  if (loading?.id === m.id) return loading.done
  const done = startLoad().finally(() => {
    if (loading?.done === done) loading = null
  })
  loading = { id: m.id, done }
  return done
}
async function startLoad(): Promise<boolean> {
  const m = riffModel()
  if (worker && workerModel === m.id && riffState.status === 'ready') return true
  stopWorker()
  try {
    worker = new Worker(new URL('../../workers/riff.worker.ts', import.meta.url), { type: 'module' })
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e))
    return false
  }
  worker.onmessage = (e: MessageEvent<RiffReply>) => {
    const r = e.data
    const w = waiting.get(r.id)
    if (!w) return
    if (r.op === 'progress') return w.progress?.(r)
    waiting.delete(r.id)
    w.resolve(r)
  }
  worker.onerror = (e) => {
    fail(e.message || 'the word model worker failed')
    stopWorker()
  }
  workerModel = m.id
  riffState.status = 'loading'
  riffState.progress = 0
  const base = document.baseURI
  const r = await send(
    { op: 'init', id: seq++, model: m.id, repo: m.repo, revision: m.revision, local: inNative() ? new URL('ssb-models/', base).href : null, ort: { mjs: new URL(ortMjs, base).href, wasm: new URL(ortWasm, base).href } },
    (p) => {
      riffState.doneBytes = p.loaded
      riffState.totalBytes = p.total
      riffState.progress = p.total ? p.loaded / p.total : 0
    },
  )
  if (workerModel !== m.id) return false
  if (r.op !== 'ready') {
    fail(r.op === 'error' ? r.error : 'the word model did not load')
    stopWorker()
    return false
  }
  riffState.status = 'ready'
  riffState.downloaded = true
  if (!inNative()) store(FETCHED + m.id, '1')
  return true
}

/** delete the chosen model's files (the app / plugin) or forget it was fetched (a tab: the browser's cache keeps it) */
export async function removeWordModel() {
  const m = riffModel()
  stopWorker()
  if (inNative()) await callNative('ssbSound', { op: 'remove', model: nativeSpec(m) }).catch(() => {})
  else store(FETCHED + m.id, null)
  riffState.downloaded = false
  riffState.status = 'none'
}

export function chooseWordModel(id: string) {
  if (!wordModelOf(id) || id === riffState.id) return
  stopWorker()
  riffState.id = id
  riffState.status = 'none'
  riffState.error = ''
  riffState.downloaded = null
  savePrefs()
  void checkWordModel()
}
export function setRiffOn(on: boolean) {
  riffState.on = on
  savePrefs()
  if (!on) stopWorker()
}

/** riffs can be had: on, and downloaded (it loads on first use) */
export const riffAvailable = () => riffState.on && (riffState.status === 'ready' || riffState.downloaded === true)

/**
 * Words of `kind` for a prompt someone typed, by the word model: [] when there's none to ask (off, not downloaded) or
 * nothing came back. Loads the model on first use.
 */
export async function wordsFor(scene: string, kind: RingKind, temperature = 0.7): Promise<string[]> {
  if (!riffState.on || !scene.trim()) return []
  if (riffState.status !== 'ready') {
    if (riffState.status === 'downloading') return []
    if (riffState.downloaded === null) await checkWordModel()
    if (!riffState.downloaded || !(await loadWordModel())) return []
  }
  const r = await send({ op: 'words', id: seq++, scene, kind, temperature })
  if (r.op !== 'words') return []
  riffState.last = r.words.slice(0, 4).join(', ')
  riffState.lastMs = Math.round(r.ms)
  return r.words
}

/**
 * Lines for a singing model (ACE-Step) to sing about `scene` (what someone typed, or the garden's caption), by the word
 * model: null when there's none to ask or nothing worth singing came back (the caller then sings the scene's own words).
 */
export async function lyricsFor(scene: string, temperature = 0.8): Promise<string[] | null> {
  if (!riffState.on || !scene.trim()) return null
  if (riffState.status !== 'ready') {
    if (riffState.status === 'downloading') return null
    if (riffState.downloaded === null) await checkWordModel()
    if (!riffState.downloaded || !(await loadWordModel())) return null
  }
  const r = await send({ op: 'lyrics', id: seq++, scene, temperature })
  return r.op === 'lyrics' && r.lines.length >= 2 ? r.lines : null
}

/**
 * A few typed words written out as a sound model's caption (a VCO prompt sent with its automation button), by the word
 * model: null when there's none to ask or nothing came back (the caller then sends the words as typed).
 */
export async function captionFor(words: string, temperature = 0.7): Promise<string | null> {
  if (!riffState.on || !words.trim()) return null
  if (riffState.status !== 'ready') {
    if (riffState.status === 'downloading') return null
    if (riffState.downloaded === null) await checkWordModel()
    if (!riffState.downloaded || !(await loadWordModel())) return null
  }
  const r = await send({ op: 'caption', id: seq++, words, temperature })
  return r.op === 'caption' && r.caption ? r.caption : null
}
