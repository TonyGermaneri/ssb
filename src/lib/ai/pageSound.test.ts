import { describe, expect, it, vi } from 'vitest'
import { routedSoundHost, type PageSoundEngine } from './pageSound'
import { SOUND_MODELS, soundModelFrom } from './soundModels'
import type { SoundHostApi, SoundStatus } from './soundHost'

const musicgen = soundModelFrom('musicgen')!
const moss = SOUND_MODELS[0]

/** a native host that downloads at once and loads audio.cpp models */
function fakeNative(downloaded = false) {
  const st: SoundStatus = { available: true, backend: 'metal', helper: 'stopped', modelsDir: '/x' }
  let have = downloaded
  const host: SoundHostApi & { calls: string[] } = {
    calls: [],
    status: async () => ({ ...st }),
    check: async (ms) => ms.map((m) => ({ id: m.id, downloaded: have, missing: have ? 0 : 1 })),
    load: async (m) => {
      host.calls.push(`load ${m.id}`)
      st.loaded = { id: m.id, label: m.label, family: m.family, loadSeconds: 1 }
    },
    download: async (m) => {
      host.calls.push(`download ${m.id}`)
      have = true
    },
    unload: async () => {
      host.calls.push('unload')
      delete st.loaded
    },
    cancel: async () => void host.calls.push('cancel'),
    remove: async (m) => void host.calls.push(`remove ${m.id}`),
    generate: async (m) => ({ wav: new ArrayBuffer(8), rate: 48000, channels: 1, seed: 1, model: m.id, elapsed: 1 }),
  }
  return host
}
function fakeEngine(): PageSoundEngine & { loads: number; stops: number } {
  const e = {
    loads: 0,
    stops: 0,
    load: async () => void e.loads++,
    generate: async (_m: unknown, _r: unknown, seconds: number) => ({ wav: new ArrayBuffer(seconds), rate: 32000, ms: 1234 }),
    stop: () => void e.stops++,
  }
  return e
}
const until = async (f: () => Promise<boolean>) => {
  for (let i = 0; i < 100 && !(await f()); i++) await new Promise((r) => setTimeout(r, 5))
}

describe('page models behind the sound host', () => {
  it('MusicGen is a page model; the audio.cpp ones are not', () => {
    expect(musicgen).toMatchObject({ id: 'musicgen-small-q8', page: true, channels: 1, sampleRate: 32000, gated: false })
    expect(SOUND_MODELS.filter((m) => m.page).map((m) => m.id)).toEqual(['musicgen-small-q8'])
  })

  it('loading MusicGen downloads its files natively, unloads audio.cpp\'s model, then loads it in the page', async () => {
    const native = fakeNative(false)
    await native.load(moss)
    const engine = fakeEngine()
    const host = routedSoundHost(native, engine, 1)
    await host.load(musicgen)
    expect((await host.status()).task).toMatchObject({ model: musicgen.id, loads: true })
    await until(async () => (await host.status()).loaded?.id === musicgen.id)
    const st = await host.status()
    expect(st).toMatchObject({ loaded: { id: musicgen.id } })
    expect(st.task).toBeUndefined()
    expect(native.calls).toEqual([`load ${moss.id}`, 'unload', `download ${musicgen.id}`])
    expect(engine.loads).toBe(1)
  })

  it('generates in the page; an audio.cpp model generates natively, and loading one lets MusicGen go', async () => {
    const native = fakeNative(true)
    const engine = fakeEngine()
    const host = routedSoundHost(native, engine, 1)
    await expect(host.generate(musicgen, { prompt: 'x' })).rejects.toThrow(/isn't loaded/)
    await host.load(musicgen)
    await until(async () => (await host.status()).loaded?.id === musicgen.id)
    const clip = await host.generate(musicgen, { prompt: 'lofi beat', seconds: 99 })
    expect(clip).toMatchObject({ rate: 32000, channels: 1, model: musicgen.id, elapsed: 1.2 })
    // (seconds held to its max)
    expect(clip.wav.byteLength).toBe(musicgen.maxSeconds)
    await host.load(moss)
    expect(engine.stops).toBeGreaterThan(0)
    expect((await host.status()).loaded?.id).toBe(moss.id)
    expect((await host.generate(moss, { prompt: 'door' })).rate).toBe(48000)
  })

  it('a failed page load is the status\'s error; a cancel while generating unloads it', async () => {
    const native = fakeNative(true)
    const engine = fakeEngine()
    engine.load = vi.fn(async () => {
      throw new Error('no onnx here')
    })
    const host = routedSoundHost(native, engine, 1)
    await host.load(musicgen)
    await until(async () => !(await host.status()).task)
    expect((await host.status()).error).toEqual({ model: musicgen.id, message: 'no onnx here' })

    const ok = fakeEngine()
    let release: () => void = () => {}
    ok.generate = () => new Promise((r) => (release = () => r({ wav: new ArrayBuffer(1), rate: 32000, ms: 1 })))
    const h2 = routedSoundHost(fakeNative(true), ok, 1)
    await h2.load(musicgen)
    await until(async () => (await h2.status()).loaded?.id === musicgen.id)
    const pending = h2.generate(musicgen, { prompt: 'x' })
    expect((await h2.status()).task?.kind).toBe('generate')
    await h2.cancel()
    expect((await h2.status()).loaded).toBeUndefined()
    release()
    await pending
  })
})
