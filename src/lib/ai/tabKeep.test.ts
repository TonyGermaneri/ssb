import { beforeEach, describe, expect, it } from 'vitest'
import { TabSoundFiles } from './tabSound'
import { routedSoundHost, type PageSoundEngine } from './pageSound'
import { soundModelFrom } from './soundModels'
import { hereForm } from './soundHost'
import { keepTabModels, keptModels } from './tabKeep'

const musicgen = soundModelFrom('musicgen')!
const sa3 = hereForm(soundModelFrom('stable-audio-3-small-music-q8')!)

// a localStorage stand-in (node has none)
const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}

function fakeCache() {
  const files = new Map<string, number>()
  return {
    files,
    match: async (url: RequestInfo | URL) => (files.has(String(url)) ? new Response('x') : undefined),
    put: async (url: RequestInfo | URL, res: Response) => void files.set(String(url), (await res.arrayBuffer()).byteLength),
    delete: async (url: RequestInfo | URL) => files.delete(String(url)),
  }
}
const hub = (async () => new Response(new Uint8Array(10))) as typeof fetch
const engine: PageSoundEngine = { load: async () => {}, generate: async () => ({ wav: new ArrayBuffer(0), rate: 32000, ms: 1 }), stop: () => {} }

function setup() {
  const cache = fakeCache()
  const files = new TabSoundFiles(async () => cache, hub)
  const host = routedSoundHost(files, engine, 1)
  const said: string[] = []
  return { cache, files, host, said, deps: (tags: string[][] = []) => ({ host: () => host, boardTags: () => tags, say: (t: string) => said.push(t) }) }
}
async function settle(h: TabSoundFiles) {
  for (let i = 0; i < 200 && (await h.status()).task; i++) await new Promise((r) => setTimeout(r, 1))
}

describe('a browser tab keeping the models its user had', () => {
  beforeEach(() => store.clear())

  it('remembers a model once downloaded, and forgets it when its files are deleted on purpose', async () => {
    const { files } = setup()
    await files.download(musicgen)
    await settle(files)
    expect(keptModels().has(musicgen.id)).toBe(true)
    await files.remove(musicgen)
    expect(keptModels().has(musicgen.id)).toBe(false)
  })

  it('downloads a model it had again, by itself, when the browser cleared it, and says so', async () => {
    const a = setup()
    await a.files.download(sa3)
    await settle(a.files)
    // the next visit: the browser's storage cleared, the choice still made
    const b = setup()
    await keepTabModels([sa3.id], b.deps())
    expect((await b.files.check([sa3]))[0].downloaded).toBe(true)
    expect(b.said[0]).toMatch(/Downloading Stable Audio 3 Small Music again/)
    expect(b.said.at(-1)).toMatch(/is back/)
  })

  it('counts clips on the board the model made as having had it (before that was remembered)', async () => {
    const b = setup()
    await keepTabModels([musicgen.id], b.deps([['ai', 'generated', 'musicgen']]))
    expect((await b.files.check([musicgen]))[0].downloaded).toBe(true)
  })

  it('never downloads a model this browser never had: it is shown as not downloaded, as it is', async () => {
    const b = setup()
    await keepTabModels([sa3.id, musicgen.id, 'moss'], b.deps([['generated', 'moss']]))
    expect(b.cache.files.size).toBe(0)
    expect(b.said).toEqual([])
  })

  it('remembers one found whole', async () => {
    const b = setup()
    for (const f of musicgen.files) b.cache.files.set(f.url, 1)
    await keepTabModels([musicgen.id], b.deps())
    expect(keptModels().has(musicgen.id)).toBe(true)
  })
})
