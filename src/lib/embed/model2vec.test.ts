import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dot, textModel } from './model2vec'
import ref from './fixtures/potion-ref.json'

// the model as it ships, and Hugging Face tokenizers' ids + float32 sentence vectors for the same texts
// (made with the Python libraries from the original files: tokenizer.json, model.safetensors)
const dir = join(__dirname, '../../../public/models/potion-base-8m')
const buf = readFileSync(join(dir, 'vectors.bin'))
const model = textModel(readFileSync(join(dir, 'vocab.txt'), 'utf8'), buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length))

describe('potion-base-8M in the page', () => {
  it('tokenizes as Hugging Face tokenizers does', () => {
    for (const r of ref) expect(model.tokens(r.text), r.text).toEqual(r.ids)
  })
  it("gives the float32 model's vectors, give or take the int8 table", () => {
    for (const r of ref.filter((x) => x.vec)) {
      const v = model.embed(r.text)
      const want = Float32Array.from(r.vec!)
      expect(dot(v, want), r.text).toBeGreaterThan(0.999)
    }
  })
  it('is unit length, or zero with nothing known', () => {
    expect(dot(model.embed('warm pad'), model.embed('warm pad'))).toBeCloseTo(1, 4)
    expect(model.embed('').every((x) => x === 0)).toBe(true)
  })
  it('puts related words nearer each other', () => {
    const e = (t: string) => model.embed(t)
    expect(dot(e('choir'), e('voices singing'))).toBeGreaterThan(dot(e('choir'), e('drum machine')))
    expect(dot(e('dark mellow'), e('warm'))).toBeGreaterThan(dot(e('dark mellow'), e('harsh')))
    expect(dot(e('electric piano'), e('rhodes keys'))).toBeGreaterThan(dot(e('electric piano'), e('noise sweep')))
  })
})
