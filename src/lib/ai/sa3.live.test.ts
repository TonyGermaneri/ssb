/**
 * Stable Audio 3 Small's tab pipeline (sa3.ts) against the real 4-bit graphs, run by onnxruntime-node on the CPU: the
 * prompt's padded positions, and a whole clip -- the right length, stereo, not silent, not clipping, a seed that
 * brings it back. Needs the bundle on disk (lsb/stable-audio-3-small-music-onnx: onnx/, tokenizer/), so it only runs
 * when asked:
 *
 *   SSB_SA3_DIR=<the bundle> SSB_SA3_OUT=<dir for WAVs> npx vitest run src/lib/ai/sa3.live.test.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sa3Generate, sa3Tokens, SA3_DIM, SA3_RATE, SA3_TOKENS, type Sa3Graphs } from './sa3'

const dir = process.env.SSB_SA3_DIR ?? ''
const out = process.env.SSB_SA3_OUT ?? ''

async function graphs(): Promise<{ g: Sa3Graphs; encode: (s: string) => number[] }> {
  const ort = await import('onnxruntime-node')
  const { PreTrainedTokenizer } = await import('@huggingface/transformers')
  const session = async (name: string) => {
    const man = JSON.parse(readFileSync(`${dir}/onnx/${name}_chunks.json`, 'utf8')) as { chunks: { name: string }[] }
    return ort.InferenceSession.create(readFileSync(`${dir}/onnx/${name}.onnx`), {
      executionProviders: ['cpu'],
      externalData: man.chunks.map((c) => ({ path: c.name, data: readFileSync(`${dir}/onnx/${c.name}`) })),
    } as never)
  }
  const [text, seconds, dit, decoder] = await Promise.all([session('text_encoder_q4'), session('number_conditioner'), session('dit_q4'), session('decoder_q4')])
  const tok = new PreTrainedTokenizer(JSON.parse(readFileSync(`${dir}/tokenizer/tokenizer.json`, 'utf8')), JSON.parse(readFileSync(`${dir}/tokenizer/tokenizer_config.json`, 'utf8')))
  const T = ort.Tensor
  const g: Sa3Graphs = {
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
  return { g, encode: (s) => tok.encode(s, { add_special_tokens: false }) }
}

describe.skipIf(!dir)('Stable Audio 3 Small in a tab: the real graphs', () => {
  it('pads the prompt with one learned vector, and makes a clip a seed brings back', { timeout: 600_000 }, async () => {
    const { g, encode } = await graphs()
    const ids = encode('128 BPM tech house drum loop, punchy kick, crisp hats')
    expect(ids.length).toBeGreaterThan(5)
    expect(ids[0]).not.toBe(2) // no BOS
    const tok = sa3Tokens(ids)
    const states = await g.text(tok.ids, tok.mask)
    // every padded position the same learned vector (not zeros, not the encoder's own outputs)
    const row = (i: number) => states.subarray(i * SA3_DIM, (i + 1) * SA3_DIM)
    const a = row(ids.length + 3)
    const b = row(SA3_TOKENS - 1)
    let diff = 0
    let mag = 0
    for (let k = 0; k < SA3_DIM; k++) (diff = Math.max(diff, Math.abs(a[k] - b[k]))), (mag += a[k] * a[k])
    expect(diff).toBeLessThan(1e-5)
    expect(mag).toBeGreaterThan(0)

    const t0 = performance.now()
    const steps: number[] = []
    const [l, r] = await sa3Generate(g, { ids, seconds: 4, seed: 7, onStep: (d) => steps.push(d) })
    const ms = performance.now() - t0
    expect(steps).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(l.length).toBe(4 * SA3_RATE)
    expect(r.length).toBe(l.length)
    let peak = 0
    let rms = 0
    for (const s of l) (peak = Math.max(peak, Math.abs(s))), (rms += s * s)
    rms = Math.sqrt(rms / l.length)
    process.stderr.write(`4 s in ${(ms / 1000).toFixed(1)} s on the CPU · peak ${peak.toFixed(2)} · rms ${rms.toFixed(3)}\n`)
    expect(rms).toBeGreaterThan(0.01)
    expect(peak).toBeLessThanOrEqual(1)
    if (out) {
      mkdirSync(out, { recursive: true })
      const { encodeWav } = await import('../wav')
      writeFileSync(`${out}/sa3-tab-drums.wav`, Buffer.from(await encodeWav([l, r], SA3_RATE).arrayBuffer()))
      const p2 = encode('warm analog synth pad, slow evolving, C minor, lush')
      const [pl, pr] = await sa3Generate(g, { ids: p2, seconds: 8, seed: 3 })
      writeFileSync(`${out}/sa3-tab-pad.wav`, Buffer.from(await encodeWav([pl, pr], SA3_RATE).arrayBuffer()))
    }
    // the same seed: the same music. (Not every sample: the decoder adds a little noise of its own, as Stability's
    // does -- RandomNormalLike in the graph, unseeded -- so it's the loudness envelope that matches.)
    const [l2] = await sa3Generate(g, { ids, seconds: 4, seed: 7 })
    const env = (x: Float32Array) => Array.from({ length: Math.floor(x.length / 1024) }, (_, i) => Math.sqrt(x.subarray(i * 1024, i * 1024 + 1024).reduce((s, v) => s + v * v, 0) / 1024))
    const [e1, e2] = [env(l), env(l2)]
    const mean = (e: number[]) => e.reduce((s, v) => s + v, 0) / e.length
    const [m1, m2] = [mean(e1), mean(e2)]
    let num = 0
    let d1 = 0
    let d2 = 0
    for (let i = 0; i < e1.length; i++) (num += (e1[i] - m1) * (e2[i] - m2)), (d1 += (e1[i] - m1) ** 2), (d2 += (e2[i] - m2) ** 2)
    expect(num / Math.sqrt(d1 * d2)).toBeGreaterThan(0.95)
  })
})
