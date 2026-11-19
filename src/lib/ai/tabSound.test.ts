import { describe, expect, it } from 'vitest'
import { TabSoundFiles } from './tabSound'
import { routedSoundHost, type PageSoundEngine } from './pageSound'
import { SOUND_MODELS, soundModelFrom } from './soundModels'

const musicgen = soundModelFrom('musicgen')!
const moss = SOUND_MODELS[0]

/** a Cache API stand-in (bodies read through, as the browser's cache stores them) */
function fakeCache() {
  const files = new Map<string, number>()
  const cache = {
    files,
    match: async (url: RequestInfo | URL) => (files.has(String(url)) ? new Response('x') : undefined),
    put: async (url: RequestInfo | URL, res: Response) => void files.set(String(url), (await res.arrayBuffer()).byteLength),
    delete: async (url: RequestInfo | URL) => files.delete(String(url)),
  }
  return cache
}
/** the Hub: each file a few bytes; `fail` answers 404 for one */
const hub = (fail?: string) => (async (url: RequestInfo | URL) => (String(url).endsWith(fail ?? '\0') ? new Response('no', { status: 404 }) : new Response(new Uint8Array(10)))) as typeof fetch

async function settle(h: TabSoundFiles) {
  for (let i = 0; i < 100 && (await h.status()).task; i++) await new Promise((r) => setTimeout(r, 1))
}

describe('a browser tab\'s sound files', () => {
  it('downloads a page model\'s files into the cache, with progress, and then has them', async () => {
    const cache = fakeCache()
    const h = new TabSoundFiles(async () => cache, hub())
    expect((await h.check([musicgen]))[0]).toMatchObject({ downloaded: false })
    await h.download(musicgen)
    expect((await h.status()).task).toMatchObject({ kind: 'download', model: musicgen.id })
    await settle(h)
    expect([...cache.files.keys()].sort()).toEqual(musicgen.files.map((f) => f.url).sort())
    expect((await h.check([musicgen]))[0]).toEqual({ id: musicgen.id, downloaded: true, missing: 0 })
    await h.remove(musicgen)
    expect(cache.files.size).toBe(0)
  })

  it('keeps the files it finished when one fails, and says why', async () => {
    const cache = fakeCache()
    const h = new TabSoundFiles(async () => cache, hub('encodec_decode.onnx'))
    await h.download(musicgen)
    await settle(h)
    const st = await h.status()
    expect(st.error).toMatchObject({ model: musicgen.id })
    expect(st.error!.message).toMatch(/404/)
    const c = (await h.check([musicgen]))[0]
    expect(c.downloaded).toBe(false)
    expect(c.missing).toBe(musicgen.files.find((f) => f.path.endsWith('encodec_decode.onnx'))!.bytes)
  })

  it('refuses audio.cpp\'s models: a tab can\'t run them', async () => {
    const h = new TabSoundFiles(async () => fakeCache(), hub())
    await expect(h.download(moss)).rejects.toThrow(/app or plugin/)
    await expect(h.load(moss)).rejects.toThrow(/app or plugin/)
    expect((await h.check([moss]))[0].downloaded).toBe(false)
  })

  it('under the routed host, loading MusicGen downloads it, then loads it in the page', async () => {
    const cache = fakeCache()
    let loads = 0
    const engine: PageSoundEngine = { load: async () => void loads++, generate: async () => ({ wav: new ArrayBuffer(4), rate: 32000, ms: 1 }), stop: () => {} }
    const host = routedSoundHost(new TabSoundFiles(async () => cache, hub()), engine, 1)
    await host.load(musicgen)
    for (let i = 0; i < 200 && !(await host.status()).loaded; i++) await new Promise((r) => setTimeout(r, 1))
    expect((await host.status()).loaded?.id).toBe(musicgen.id)
    expect(loads).toBe(1)
    expect(cache.files.size).toBe(musicgen.files.length)
    await expect(host.load(moss)).rejects.toThrow(/app or plugin/)
  })
})
