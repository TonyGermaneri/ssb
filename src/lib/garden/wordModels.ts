/**
 * The garden's word models: tiny instruction-tuned language models (SmolLM2, Hugging Face, Apache 2.0) that turn a
 * prompt someone typed into words for each ring (riff.ts, workers/riff.worker.ts), run in the page by transformers.js on
 * ONNX Runtime's WebAssembly. int8 ONNX, pinned to a revision. In the app and the plugin SoundHost downloads the files (resumably,
 * into the models folder beside the sound models) and the editor serves them at ssb-models/<id>/; in a browser tab
 * transformers.js fetches them from the Hub into the browser's cache.
 */

export interface WordModel {
  id: string
  label: string
  /** the Hugging Face repo and the revision its files are pinned to */
  repo: string
  revision: string
  params: string
  files: { path: string; bytes: number }[]
  /** the weights (what transformers.js loads with dtype int8) */
  main: string
  note: string
}

const FILES = (onnx: number, config: number) => [
  { path: 'config.json', bytes: config },
  { path: 'generation_config.json', bytes: 132 },
  { path: 'tokenizer_config.json', bytes: 3764 },
  { path: 'tokenizer.json', bytes: 2104556 },
  { path: 'onnx/model_int8.onnx', bytes: onnx },
]

export const WORD_MODELS: WordModel[] = [
  {
    id: 'smollm2-360m-int8',
    label: 'SmolLM2 360M',
    repo: 'HuggingFaceTB/SmolLM2-360M-Instruct',
    revision: 'a10cc1512eabd3dde888204e902eca88bddb4951',
    params: '360M',
    files: FILES(364564558, 846),
    main: 'onnx/model_int8.onnx',
    note: 'stays on the prompt best; a few seconds a ring',
  },
  {
    id: 'smollm2-135m-int8',
    label: 'SmolLM2 135M',
    repo: 'HuggingFaceTB/SmolLM2-135M-Instruct',
    revision: '12fd25f77366fa6b3b4b768ec3050bf629380bac',
    params: '135M',
    files: FILES(137147867, 861),
    main: 'onnx/model_int8.onnx',
    note: 'a third the size; rougher, wanders off sounds more often',
  },
]
export const DEFAULT_WORD_MODEL = WORD_MODELS[0].id

export const wordModelOf = (id: string | null | undefined) => WORD_MODELS.find((m) => m.id === id) ?? null
export const wordModelBytes = (m: WordModel) => m.files.reduce((a, f) => a + f.bytes, 0)
export const fileUrl = (m: WordModel, path: string) => `https://huggingface.co/${m.repo}/resolve/${m.revision}/${path}`

/** what SoundHost downloads (its sound-model spec: no family to load, only files to fetch) */
export const nativeSpec = (m: WordModel) => ({
  id: m.id,
  label: m.label,
  family: 'text',
  task: 'text',
  main: m.main,
  files: m.files.map((f) => ({ url: fileUrl(m, f.path), path: f.path, bytes: f.bytes })),
})
