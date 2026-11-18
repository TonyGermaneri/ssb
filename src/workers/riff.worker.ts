/**
 * The garden's word model (lib/garden/riff.ts starts one): transformers.js running a SmolLM2 (lib/garden/wordModels.ts)
 * on ONNX Runtime's WebAssembly, off the main thread. `init` loads it -- from the editor's ssb-models/ route in the app
 * and the plugin (downloaded there by SoundHost), or from the Hub into the browser's cache in a tab -- reporting
 * progress; `words` lists words of a ring's kind for a prompt (lib/garden/wordsText.ts: asked again when too few come);
 * `lyrics` writes a few lines for a singing model to sing about it (lib/garden/lyricsText.ts); `caption` writes a few
 * typed words out as a sound model's caption (lib/garden/captionText.ts).
 */
import { env, pipeline, type TextGenerationPipeline } from '@huggingface/transformers'
import { enoughWords, parseWords, wordMessages } from '../lib/garden/wordsText'
import { enoughLines, lyricsMessages, parseLyrics } from '../lib/garden/lyricsText'
import { captionMessages, parseCaption } from '../lib/garden/captionText'
import type { RingKind } from '../lib/garden/garden'

export type RiffJob =
  | { op: 'init'; id: number; model: string; repo: string; revision: string; local: string | null; ort: { mjs: string; wasm: string } }
  | { op: 'words'; id: number; scene: string; kind: RingKind; temperature: number }
  | { op: 'lyrics'; id: number; scene: string; temperature: number }
  | { op: 'caption'; id: number; words: string; temperature: number }
export type RiffReply =
  | { id: number; op: 'progress'; loaded: number; total: number; file: string }
  | { id: number; op: 'ready' }
  | { id: number; op: 'words'; words: string[]; ms: number }
  | { id: number; op: 'lyrics'; lines: string[]; ms: number }
  | { id: number; op: 'caption'; caption: string; ms: number }
  | { id: number; op: 'error'; error: string }

/** a list of eight is under 50 tokens */
const MAX_TOKENS = 64
let gen: TextGenerationPipeline | null = null
const post = (r: RiffReply) => (self as unknown as Worker).postMessage(r)

async function init(job: Extract<RiffJob, { op: 'init' }>) {
  const onnx = env.backends.onnx
  if (onnx.wasm) {
    onnx.wasm.wasmPaths = job.ort
    // threads need a cross-origin-isolated page (SharedArrayBuffer); the plugin's web view isn't
    onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1
    onnx.wasm.proxy = false
  }
  env.useWasmCache = false
  if (job.local) {
    // the app / plugin: only what SoundHost downloaded, served by the editor
    env.allowRemoteModels = false
    env.allowLocalModels = true
    env.localModelPath = job.local
    env.useBrowserCache = false
  } else {
    env.allowRemoteModels = true
    env.allowLocalModels = false
    env.useBrowserCache = true
  }
  const files = new Map<string, { loaded: number; total: number }>()
  gen = (await pipeline('text-generation', job.local ? job.model : job.repo, {
    dtype: 'int8',
    device: 'wasm',
    ...(job.local ? {} : { revision: job.revision }),
    progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== 'progress' || !p.file) return
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 })
      let loaded = 0
      let total = 0
      for (const f of files.values()) (loaded += f.loaded), (total += f.total)
      post({ id: job.id, op: 'progress', loaded, total, file: p.file })
    },
  })) as TextGenerationPipeline
}

async function words(job: Extract<RiffJob, { op: 'words' }>) {
  if (!gen) throw new Error('the word model is not loaded')
  const t0 = performance.now()
  const got: string[] = []
  // a second ask adds to the first when it came back short (a small model sometimes stops at two)
  for (let tries = 0; tries < 3 && !enoughWords(got); tries++) {
    const out = (await gen(wordMessages(job.scene, job.kind) as never, {
      max_new_tokens: MAX_TOKENS,
      do_sample: true,
      temperature: job.temperature + tries * 0.1,
      top_p: 0.9,
    })) as unknown as { generated_text: { role: string; content: string }[] }[]
    const said = out[0]?.generated_text.at(-1)?.content ?? ''
    const cut = gen.tokenizer.encode(said).length >= MAX_TOKENS - 1
    for (const w of parseWords(said, job.kind, cut)) if (!got.includes(w)) got.push(w)
  }
  post({ id: job.id, op: 'words', words: got.slice(0, 12), ms: performance.now() - t0 })
}

async function lyrics(job: Extract<RiffJob, { op: 'lyrics' }>) {
  if (!gen) throw new Error('the word model is not loaded')
  const t0 = performance.now()
  let lines: string[] = []
  for (let tries = 0; tries < 3 && !enoughLines(lines); tries++) {
    const out = (await gen(lyricsMessages(job.scene) as never, {
      max_new_tokens: MAX_TOKENS,
      do_sample: true,
      temperature: job.temperature + tries * 0.1,
      top_p: 0.9,
    })) as unknown as { generated_text: { role: string; content: string }[] }[]
    const said = out[0]?.generated_text.at(-1)?.content ?? ''
    // (a reply cut off at its last token ends mid-line: that line goes)
    const cut = gen.tokenizer.encode(said).length >= MAX_TOKENS - 1
    lines = parseLyrics(cut ? said.split('\n').slice(0, -1).join('\n') : said)
  }
  post({ id: job.id, op: 'lyrics', lines, ms: performance.now() - t0 })
}

async function caption(job: Extract<RiffJob, { op: 'caption' }>) {
  if (!gen) throw new Error('the word model is not loaded')
  const t0 = performance.now()
  let got = ''
  for (let tries = 0; tries < 3 && !got; tries++) {
    const out = (await gen(captionMessages(job.words) as never, {
      max_new_tokens: MAX_TOKENS,
      do_sample: true,
      temperature: job.temperature + tries * 0.1,
      top_p: 0.9,
      repetition_penalty: 1.1,
    })) as unknown as { generated_text: { role: string; content: string }[] }[]
    const said = out[0]?.generated_text.at(-1)?.content ?? ''
    got = parseCaption(said, gen.tokenizer.encode(said).length >= MAX_TOKENS - 1)
  }
  post({ id: job.id, op: 'caption', caption: got, ms: performance.now() - t0 })
}

// one at a time: words asked for while the model loads wait for it
let queue: Promise<unknown> = Promise.resolve()
self.onmessage = (e: MessageEvent<RiffJob>) => {
  const job = e.data
  queue = queue.then(async () => {
    try {
      if (job.op === 'init') {
        await init(job)
        post({ id: job.id, op: 'ready' })
      } else if (job.op === 'lyrics') await lyrics(job)
      else if (job.op === 'caption') await caption(job)
      else await words(job)
    } catch (err) {
      post({ id: job.id, op: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  })
}
