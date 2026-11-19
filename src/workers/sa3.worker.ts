/**
 * Stable Audio 3 Small in a browser tab (lib/ai/pageSound.ts starts it): its four 4-bit ONNX graphs on ONNX Runtime
 * Web -- on the GPU through WebGPU where the browser has it, else on the CPU (WebAssembly) -- off the main thread,
 * around the pipeline in lib/ai/sa3.ts. The files are the ones lib/ai/tabSound.ts put in the browser's cache, read
 * back by their URLs (fetched from the Hub if one is missing).
 * `init` makes the sessions; `generate` makes one clip and answers it as a 16-bit stereo WAV (transferred).
 */
import type * as Ort from 'onnxruntime-web'
import { PreTrainedTokenizer } from '@huggingface/transformers'
import { sa3Generate, SA3_DIM, SA3_RATE, SA3_TOKENS, type Sa3Graphs } from '../lib/ai/sa3'

export type Sa3Job =
  /** ort: the WebGPU build's binaries, and the plain WebAssembly build's (the CPU path: the only one with the 4-bit
   *  embedding op, GatherBlockQuantized, on the CPU) */
  | { op: 'init'; id: number; base: string; cache: string; ort: { gpu: { mjs: string; wasm: string }; cpu: { mjs: string; wasm: string } }; gpu: boolean }
  | { op: 'generate'; id: number; prompt: string; seconds: number; steps: number; seed: number }
export type Sa3Reply =
  | { id: number; op: 'ready'; device: 'webgpu' | 'wasm' }
  | { id: number; op: 'progress'; done: number; of: number }
  | { id: number; op: 'audio'; wav: ArrayBuffer; rate: number; seconds: number; ms: number; seed: number }
  | { id: number; op: 'error'; error: string }

const post = (r: Sa3Reply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(r, transfer)
let graphs: Sa3Graphs | null = null
let encode: ((s: string) => number[]) | null = null

/** a file of the bundle: from the cache the page filled, else the Hub */
async function file(base: string, cacheName: string, path: string): Promise<Uint8Array> {
  const url = `${base}/${path}`
  const cache = await caches.open(cacheName).catch(() => null)
  const hit = await cache?.match(url)
  const res = hit ?? (await fetch(url))
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** a GPU through WebGPU -- not a software stand-in for one (slower than the CPU path) */
async function realGpu(): Promise<boolean> {
  type Adapter = { isFallbackAdapter?: boolean; info?: { isFallbackAdapter?: boolean } }
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<Adapter | null> } }).gpu
  const a = await gpu?.requestAdapter().catch(() => null)
  return !!a && !a.isFallbackAdapter && !a.info?.isFallbackAdapter
}

async function init(job: Extract<Sa3Job, { op: 'init' }>): Promise<'webgpu' | 'wasm'> {
  const device: 'webgpu' | 'wasm' = job.gpu && (await realGpu()) ? 'webgpu' : 'wasm'
  const ort: typeof Ort = device === 'webgpu' ? await import('onnxruntime-web/webgpu') : await import('onnxruntime-web/wasm')
  ort.env.wasm.wasmPaths = device === 'webgpu' ? job.ort.gpu : job.ort.cpu
  // threads need a cross-origin-isolated page (SharedArrayBuffer), which a GitHub Pages site isn't
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1
  ort.env.wasm.proxy = false
  ort.env.logLevel = 'error'
  const f = (p: string) => file(job.base, job.cache, p)
  const session = async (name: string) => {
    const man = JSON.parse(new TextDecoder().decode(await f(`onnx/${name}_chunks.json`))) as { chunks: { name: string }[] }
    const externalData = await Promise.all(man.chunks.map(async (c) => ({ path: c.name, data: await f(`onnx/${c.name}`) })))
    return ort.InferenceSession.create(await f(`onnx/${name}.onnx`), {
      executionProviders: device === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'],
      graphOptimizationLevel: 'all',
      externalData,
    })
  }
  // one at a time: each graph's weights held only while its session is made
  const text = await session('text_encoder_q4')
  const seconds = await session('number_conditioner')
  const dit = await session('dit_q4')
  const decoder = await session('decoder_q4')
  const tok = new PreTrainedTokenizer(JSON.parse(new TextDecoder().decode(await f('tokenizer/tokenizer.json'))), JSON.parse(new TextDecoder().decode(await f('tokenizer/tokenizer_config.json'))))
  encode = (s) => tok.encode(s, { add_special_tokens: false })
  const T = ort.Tensor
  graphs = {
    text: async (ids, mask) => (await text.run({ input_ids: new T('int64', ids, [1, SA3_TOKENS]), attention_mask: new T('int64', mask, [1, SA3_TOKENS]) })).last_hidden_state.data as Float32Array,
    seconds: async (s) => (await seconds.run({ seconds: new T('float32', new Float32Array([s]), [1]) })).embedding.data as Float32Array,
    dit: async (x, t, cross, global, local, mask, L) =>
      (
        await dit.run({
          x: new T('float32', x, [1, 256, L]),
          t: new T('float32', new Float32Array([t]), [1]),
          cross_attn_cond: new T('float32', cross, [1, SA3_TOKENS + 1, SA3_DIM]),
          global_embed: new T('float32', global, [1, SA3_DIM]),
          local_add_cond: new T('float32', local, [1, SA3_TOKENS + 1, L]),
          padding_mask: new T('bool', mask, [1, L]),
        })
      ).out.data as Float32Array,
    decode: async (lat, L) => (await decoder.run({ latents: new T('float32', lat, [1, 256, L]) })).audio.data as Float32Array,
  }
  return device
}

/** stereo float samples as a 16-bit PCM WAV */
function wavOf(l: Float32Array, r: Float32Array, sr: number): ArrayBuffer {
  const n = l.length
  const b = new ArrayBuffer(44 + n * 4)
  const v = new DataView(b)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + n * 4, true)
  str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 2, true)
  v.setUint32(24, sr, true)
  v.setUint32(28, sr * 4, true)
  v.setUint16(32, 4, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, n * 4, true)
  const q = (x: number) => Math.max(-32768, Math.min(32767, Math.round(x * 32767)))
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, q(l[i]), true)
    v.setInt16(46 + i * 4, q(r[i]), true)
  }
  return b
}

async function generate(job: Extract<Sa3Job, { op: 'generate' }>) {
  if (!graphs || !encode) throw new Error('Stable Audio 3 is not loaded')
  const t0 = performance.now()
  const [l, r] = await sa3Generate(graphs, {
    ids: encode(job.prompt),
    seconds: job.seconds,
    steps: job.steps,
    seed: job.seed,
    onStep: (done, of) => post({ id: job.id, op: 'progress', done, of }),
  })
  const wav = wavOf(l, r, SA3_RATE)
  post({ id: job.id, op: 'audio', wav, rate: SA3_RATE, seconds: l.length / SA3_RATE, ms: performance.now() - t0, seed: job.seed }, [wav])
}

// one at a time: a clip asked for while the model loads waits for it
let queue: Promise<unknown> = Promise.resolve()
self.onmessage = (e: MessageEvent<Sa3Job>) => {
  const job = e.data
  queue = queue.then(async () => {
    try {
      if (job.op === 'init') post({ id: job.id, op: 'ready', device: await init(job) })
      else await generate(job)
    } catch (err) {
      post({ id: job.id, op: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  })
}
