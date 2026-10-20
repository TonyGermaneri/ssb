#!/usr/bin/env node
/**
 * Packs Model2Vec's potion-base-8M (MinishLab, MIT: huggingface.co/minishlab/potion-base-8M), static text embeddings
 * distilled from BAAI's bge-base-en-v1.5, into public/models/potion-base-8m for the page's semantic search
 * (src/lib/embed):
 *   vocab.txt    its WordPiece vocabulary, one token a line, in id order
 *   vectors.bin  'SSBE', u32 version, u32 rows, u32 dims, then a float32 scale per row and the rows as int8
 *                (each row's largest magnitude = 127 × its scale): 7.6 MB where the float32 table is 30 MB
 *   NOTICE.md    where it came from, and its licence
 *
 *   node scripts/model2vec.mjs            (downloads the pinned revision, checking each file's SHA-256)
 *   node scripts/model2vec.mjs <folder>   (or uses that folder's copy of the same files)
 *
 * A static model's sentence vector is the mean of its tokens' rows, normalised (no transformer runs), so the page
 * embeds thousands of names and descriptions in well under a second, offline, in the browser and the plugin alike.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = 'minishlab/potion-base-8M'
const REVISION = 'bf8b056651a2c21b8d2565580b8569da283cab23'
const FILES = {
  'config.json': '2a6ac0e9aaa356a68a5688070db78fc3a464fefe85d2f06a1905ce3718687553',
  'tokenizer.json': 'e67e803f624fb4d67dea1c730d06e1067e1b14d830e2c2202569e3ef0f70bb50',
  'model.safetensors': 'f65d0f325faadc1e121c319e2faa41170d3fa07d8c89abd48ca5358d9a223de2',
}
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models', 'potion-base-8m')

async function read(name) {
  const local = process.argv[2]
  const buf = local
    ? readFileSync(join(local, name))
    : Buffer.from(await (await fetch(`https://huggingface.co/${REPO}/resolve/${REVISION}/${name}`)).arrayBuffer())
  const sha = createHash('sha256').update(buf).digest('hex')
  if (sha !== FILES[name]) throw new Error(`${name}: SHA-256 ${sha}, expected ${FILES[name]}`)
  return buf
}

const config = JSON.parse((await read('config.json')).toString())
const tokenizer = JSON.parse((await read('tokenizer.json')).toString())
const model = await read('model.safetensors')
if (config.normalize !== true) throw new Error('expected a normalising model')
if (tokenizer.model.type !== 'WordPiece' || tokenizer.normalizer.type !== 'BertNormalizer' || !tokenizer.normalizer.lowercase)
  throw new Error('expected an uncased BERT WordPiece tokenizer')

// the vocabulary, in id order
const vocab = Object.entries(tokenizer.model.vocab).sort((a, b) => a[1] - b[1])
vocab.forEach(([tok, id], i) => {
  if (id !== i || /[\n\r]/.test(tok)) throw new Error(`vocab: ${JSON.stringify(tok)} at ${id}`)
})

// safetensors: u64 header length, the JSON header, then the tensors
const headerLen = Number(model.readBigUInt64LE(0))
const header = JSON.parse(model.subarray(8, 8 + headerLen).toString())
const t = header.embeddings
if (!t || t.dtype !== 'F32' || header.weights) throw new Error(`unexpected tensors: ${Object.keys(header)}`)
const [rows, dims] = t.shape
if (rows !== vocab.length) throw new Error(`${rows} rows for ${vocab.length} tokens`)
const base = 8 + headerLen + t.data_offsets[0]
const table = new Float32Array(model.buffer.slice(model.byteOffset + base, model.byteOffset + base + rows * dims * 4))

// int8 per row
const head = 16
const bin = Buffer.alloc(head + rows * 4 + rows * dims)
bin.write('SSBE', 0, 'ascii')
bin.writeUInt32LE(1, 4)
bin.writeUInt32LE(rows, 8)
bin.writeUInt32LE(dims, 12)
let worst = 0
for (let r = 0; r < rows; r++) {
  let max = 0
  for (let d = 0; d < dims; d++) max = Math.max(max, Math.abs(table[r * dims + d]))
  const scale = max / 127 || 1
  bin.writeFloatLE(scale, head + r * 4)
  for (let d = 0; d < dims; d++) {
    const v = table[r * dims + d]
    const q = Math.round(v / scale)
    bin.writeInt8(q, head + rows * 4 + r * dims + d)
    worst = Math.max(worst, Math.abs(q * scale - v) / (max || 1))
  }
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'vocab.txt'), vocab.map(([tok]) => tok).join('\n') + '\n')
writeFileSync(join(out, 'vectors.bin'), bin)
writeFileSync(
  join(out, 'NOTICE.md'),
  `# potion-base-8M

Static text embeddings by [MinishLab](https://github.com/MinishLab/model2vec) (Model2Vec, distilled from
BAAI's bge-base-en-v1.5): [${REPO}](https://huggingface.co/${REPO}) at revision \`${REVISION}\`, MIT licence.

Repacked by \`scripts/model2vec.mjs\`: \`vocab.txt\` is its tokenizer's WordPiece vocabulary in id order;
\`vectors.bin\` its ${rows} × ${dims} embedding table as int8 with a float32 scale per row.

MIT License — Copyright (c) 2024 Thomas van Dongen (as github.com/MinishLab/model2vec states it)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
`,
)
console.log(`${rows} × ${dims} → ${(bin.length / 1e6).toFixed(1)} MB (worst int8 error ${(worst * 100).toFixed(2)} % of a row's peak)`)
