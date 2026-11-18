import { describe, expect, it, vi } from 'vitest'

const replies: unknown[] = []
vi.mock('../../native/bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../native/bridge')>()),
  inNative: () => true,
  callNative: async () => replies.shift(),
}))

const { NativeSoundHost, errorText } = await import('./soundHost')
const { SOUND_MODELS } = await import('./soundModels')
const { errorMessage } = await import('./types')

const status = (extra: object = {}) => ({ available: true, backend: 'metal', helper: 'stopped', modelsDir: '/x', ...extra })

describe('the native sound host', () => {
  it("a status carrying the last failed job's error is a status, not a failure", async () => {
    const failed = status({ error: { model: SOUND_MODELS[3].id, message: 'Stable Audio Open 1.0 is gated: …' } })
    replies.push(failed, failed)
    const host = new NativeSoundHost()
    await expect(host.status()).resolves.toMatchObject({ error: { message: /gated/ } })
    await expect(host.unload()).resolves.toBeUndefined()
  })
  it('a failed call throws its words', async () => {
    replies.push({ error: 'busy: download moss-soundeffect-v2-q8' })
    await expect(new NativeSoundHost().load(SOUND_MODELS[0])).rejects.toThrow('busy: download moss-soundeffect-v2-q8')
  })
  it('errorText reads only a string error', () => {
    expect(errorText({ error: 'why' })).toBe('why')
    expect(errorText({ error: { model: 'm', message: 'old news' } })).toBe('')
    expect(errorText([{ id: 'x' }])).toBe('')
    expect(errorText(null)).toBe('')
  })
})

describe('errorMessage', () => {
  it('never says [object Object]', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('plain')).toBe('plain')
    expect(errorMessage({ message: 'from a message' })).toBe('from a message')
    expect(errorMessage({ error: 'from an error' })).toBe('from an error')
    expect(errorMessage({ error: { model: 'm', message: 'nested' } })).toBe('nested')
    expect(errorMessage({ code: 7 })).toBe('{"code":7}')
    expect(errorMessage(undefined)).toBe('undefined')
  })
})

describe('ACE-Step: a model that sings', () => {
  it('is found by name, and a request to it carries the lyrics (others leave them out)', async () => {
    const { requestFor } = await import('./soundHost')
    const { soundModelFrom } = await import('./soundModels')
    const ace = soundModelFrom('ACE-Step')!
    expect(ace).toMatchObject({ id: 'ace-step-1.5-turbo-bf16', family: 'ace_step', lyrics: true, gated: false })
    // the BF16 package: a fully quantised ACE-Step's planner samples another song
    expect(ace.files[0].url).toMatch(/turbo-bf16\.gguf$/)
    const r = requestFor(ace, { prompt: 'dreamy female vocals', lyrics: '  [verse]\nmisty trolls  ', seconds: 10 }, 7)
    expect(r).toMatchObject({ text: 'dreamy female vocals', seed: 7, options: { lyrics: '[verse]\nmisty trolls', duration_sec: 10, num_inference_steps: 8 } })
    expect(requestFor(ace, { prompt: 'x', lyrics: '   ' }, 1).options).not.toHaveProperty('lyrics')
    expect(requestFor(SOUND_MODELS[1], { prompt: 'x', lyrics: 'la la' }, 1).options).not.toHaveProperty('lyrics')
  })
  it('a custom ACE-Step GGUF is read as one', async () => {
    const { soundModelFrom } = await import('./soundModels')
    const m = soundModelFrom('https://huggingface.co/someone/ACE-Step-1.5-GGUF/blob/main/ace-step-xl-turbo.gguf')!
    expect(m).toMatchObject({ family: 'ace_step', lyrics: true, tag: 'ace-step', custom: true })
  })
})

describe('the sound helper build', () => {
  it('compiles in every model family the catalog runs in audio.cpp', async () => {
    const { readFileSync } = await import('node:fs')
    const cmake = readFileSync(new URL('../../../native/cmake/SoundHelper.cmake', import.meta.url), 'utf8')
    const built = cmake.match(/-DAUDIOCPP_MODELS=([\w,]+)/)![1].split(',')
    // (a family left out loads as "unsupported model family hint", and the helper quits)
    for (const m of SOUND_MODELS) if (!m.page) expect(built, `${m.label}: ${m.family}`).toContain(m.family)
  })
})
