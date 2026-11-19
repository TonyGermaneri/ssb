/**
 * MusicGen in the page (lib/ai/pageSound.ts starts it): transformers.js running Meta's MusicGen (an ONNX export,
 * lib/ai/soundModels.ts) on ONNX Runtime's WebAssembly, off the main thread. audio.cpp has no MusicGen, so it isn't
 * the sound helper's: SoundHost downloads its files like any model's and the editor serves them at ssb-models/<id>/ --
 * or, in a browser tab, the page fetched them from the Hub into the browser's cache (lib/ai/tabSound.ts), where
 * transformers.js finds them by their pinned URLs.
 * `init` loads it; `generate` makes one clip from a caption and answers it as a 16-bit WAV (transferred).
 */
import { AutoTokenizer, env, MusicgenForConditionalGeneration, type PreTrainedTokenizer } from '@huggingface/transformers'

export type MusicgenJob =
  | { op: 'init'; id: number; model: string; local: string | null; hub?: { repo: string; revision: string }; ort: { mjs: string; wasm: string } }
  | { op: 'generate'; id: number; prompt: string; seconds: number; guidance: number }
export type MusicgenReply =
  | { id: number; op: 'ready' }
  | { id: number; op: 'audio'; wav: ArrayBuffer; rate: number; seconds: number; ms: number }
  | { id: number; op: 'error'; error: string }

/** EnCodec's frames a second: MusicGen makes one token per codebook per frame */
const FRAME_RATE = 50
let tokenizer: PreTrainedTokenizer | null = null
let model: MusicgenForConditionalGeneration | null = null
let rate = 32000
const post = (r: MusicgenReply, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(r, transfer)

async function init(job: Extract<MusicgenJob, { op: 'init' }>) {
  const onnx = env.backends.onnx
  if (onnx.wasm) {
    onnx.wasm.wasmPaths = job.ort
    // threads need a cross-origin-isolated page (SharedArrayBuffer); the plugin's web view isn't
    onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1
    onnx.wasm.proxy = false
  }
  env.useWasmCache = false
  const tab = !job.local && job.hub
  if (job.local) {
    // the app / plugin: only what SoundHost downloaded, served by the editor
    env.allowRemoteModels = false
    env.allowLocalModels = true
    env.localModelPath = job.local
    env.useBrowserCache = false
  } else {
    // a tab: the browser's cache, which the page filled (anything missing comes from the Hub, at the pinned revision)
    env.allowRemoteModels = true
    env.allowLocalModels = false
    env.useBrowserCache = true
  }
  const name = tab ? job.hub!.repo : job.model
  const at = tab ? { revision: job.hub!.revision } : {}
  tokenizer = await AutoTokenizer.from_pretrained(name, at)
  // (the codec at full precision: quantised, EnCodec's decoder hisses)
  model = (await MusicgenForConditionalGeneration.from_pretrained(name, {
    ...at,
    device: 'wasm',
    dtype: { text_encoder: 'q8', decoder_model_merged: 'q8', encodec_decode: 'fp32' },
  })) as MusicgenForConditionalGeneration
  rate = (model.config as unknown as { audio_encoder?: { sampling_rate?: number } }).audio_encoder?.sampling_rate ?? 32000
}

/** mono float samples as a 16-bit PCM WAV */
function wavOf(x: Float32Array, sr: number): ArrayBuffer {
  const b = new ArrayBuffer(44 + x.length * 2)
  const v = new DataView(b)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + x.length * 2, true)
  str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, sr, true)
  v.setUint32(28, sr * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, x.length * 2, true)
  for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), true)
  return b
}

async function generate(job: Extract<MusicgenJob, { op: 'generate' }>) {
  if (!model || !tokenizer) throw new Error('MusicGen is not loaded')
  const t0 = performance.now()
  const inputs = tokenizer(job.prompt)
  const out = (await model.generate({
    ...inputs,
    // (three more for the codebooks' delay pattern)
    max_new_tokens: Math.max(16, Math.round(job.seconds * FRAME_RATE) + 3),
    do_sample: true,
    guidance_scale: job.guidance,
  } as never)) as unknown as { data: Float32Array }
  const samples = out.data
  const wav = wavOf(samples, rate)
  post({ id: job.id, op: 'audio', wav, rate, seconds: samples.length / rate, ms: performance.now() - t0 }, [wav])
}

// one at a time: a clip asked for while the model loads waits for it
let queue: Promise<unknown> = Promise.resolve()
self.onmessage = (e: MessageEvent<MusicgenJob>) => {
  const job = e.data
  queue = queue.then(async () => {
    try {
      if (job.op === 'init') {
        await init(job)
        post({ id: job.id, op: 'ready' })
      } else await generate(job)
    } catch (err) {
      post({ id: job.id, op: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  })
}
