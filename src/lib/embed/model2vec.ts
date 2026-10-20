/**
 * potion-base-8M (Model2Vec static embeddings, scripts/model2vec.mjs) in the page: a text's vector is the mean of its
 * WordPiece tokens' rows (the unknown token left out, as Model2Vec does), normalised to unit length, so cosine
 * similarity is a dot product. The int8 table stays as it ships (7.6 MB); a row is scaled back as it's summed.
 */
import { WordPiece } from './wordpiece'

export interface TextModel {
  readonly dims: number
  /** a unit vector (all zeros for a text with no known token) */
  embed(text: string): Float32Array
  /** the token ids a text gives (for tests and the query rewriter) */
  tokens(text: string): number[]
}

/** The model from its two files' contents (vocab.txt, vectors.bin). */
export function textModel(vocabText: string, vectors: ArrayBuffer): TextModel {
  const head = new DataView(vectors, 0, 16)
  const magic = String.fromCharCode(...new Uint8Array(vectors, 0, 4))
  if (magic !== 'SSBE' || head.getUint32(4, true) !== 1) throw new Error('vectors.bin: not an SSBE v1 table')
  const rows = head.getUint32(8, true)
  const dims = head.getUint32(12, true)
  const scales = new Float32Array(vectors.slice(16, 16 + rows * 4))
  const table = new Int8Array(vectors, 16 + rows * 4, rows * dims)
  const vocab = vocabText.split('\n')
  if (vocab.at(-1) === '') vocab.pop()
  if (vocab.length !== rows) throw new Error(`vocab.txt has ${vocab.length} tokens for ${rows} rows`)
  const wp = new WordPiece(vocab)
  return {
    dims,
    tokens: (text) => wp.encode(text),
    embed(text) {
      const v = new Float32Array(dims)
      let n = 0
      for (const id of wp.encode(text)) {
        if (id === wp.unk) continue
        const s = scales[id]
        const o = id * dims
        for (let d = 0; d < dims; d++) v[d] += table[o + d] * s
        n++
      }
      if (!n) return v
      let norm = 0
      for (let d = 0; d < dims; d++) norm += v[d] * v[d]
      norm = Math.sqrt(norm) || 1
      for (let d = 0; d < dims; d++) v[d] /= norm
      return v
    },
  }
}

const BASE = 'models/potion-base-8m/'
let loading: Promise<TextModel> | null = null
/** The model, fetched once (it ships in public/, so this works offline: in the browser, the app and the plugin). */
export function loadTextModel(): Promise<TextModel> {
  if (!loading) {
    loading = (async () => {
      const [vocab, vectors] = await Promise.all([
        fetch(`${BASE}vocab.txt`).then((r) => {
          if (!r.ok) throw new Error(`text model vocab: HTTP ${r.status}`)
          return r.text()
        }),
        fetch(`${BASE}vectors.bin`).then((r) => {
          if (!r.ok) throw new Error(`text model vectors: HTTP ${r.status}`)
          return r.arrayBuffer()
        }),
      ])
      return textModel(vocab, vectors)
    })()
    loading.catch(() => (loading = null)) // try again next time
  }
  return loading
}

/** a · b for unit vectors: their cosine similarity */
export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}
