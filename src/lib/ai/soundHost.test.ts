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
