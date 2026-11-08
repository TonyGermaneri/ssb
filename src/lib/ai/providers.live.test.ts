/**
 * Contract tests against the real APIs: the request shapes, streaming, tool calls and results, images in tool
 * results, prompt caching and errors, per provider. They cost money (a few cents a run on Anthropic / OpenAI), so
 * they only run when asked:
 *
 *   SSB_AI_LIVE=1 npx vitest run src/lib/ai/providers.live.test.ts
 *
 * with ANTHROPIC_API_KEY / OPENAI_API_KEY in the environment (each provider's tests skip without its key), and
 * LM Studio's server up (LMSTUDIO_URL, default http://localhost:1234/v1; LMSTUDIO_MODEL, default its first chat
 * model). ANTHROPIC_MODEL / OPENAI_MODEL pick the models.
 */
import { describe, expect, it } from 'vitest'
import { runAgent, type AgentTool } from './agent'
import { createSession, listModels } from './providers'
import { AnthropicSession } from './providers/anthropic'
import { squarePng } from './testPng'
import { SYSTEM_PROMPT } from './prompt'
import { createTools } from './tools'
import { AiError, defaultAiSettings, type AiEvent, type AiSettings, type ChatSession, type ProviderKind } from './types'

const live = process.env.SSB_AI_LIVE === '1'
const env = (k: string) => process.env[k] ?? ''

interface Target {
  provider: ProviderKind
  ready: boolean
  settings: () => Promise<AiSettings>
}

let lmModel = ''
let oaModel = ''
const pickOpenAi = (ids: string[]) => {
  const general = ids.filter((id) => /^gpt-\d(\.\d+)?$/.test(id)).sort((a, b) => parseFloat(b.slice(4)) - parseFloat(a.slice(4)))
  return general[0] ?? ids.find((id) => /^gpt-/.test(id)) ?? ids[0] ?? ''
}
const targets: Target[] = [
  {
    provider: 'anthropic',
    ready: live && !!env('ANTHROPIC_API_KEY'),
    settings: async () => ({
      ...defaultAiSettings('anthropic'),
      apiKey: env('ANTHROPIC_API_KEY'),
      model: env('ANTHROPIC_MODEL') || 'claude-opus-5-5',
      effort: 'low',
      maxTokens: 8000,
    }),
  },
  {
    provider: 'openai',
    ready: live && !!env('OPENAI_API_KEY'),
    settings: async () => {
      const s = { ...defaultAiSettings('openai'), apiKey: env('OPENAI_API_KEY'), maxTokens: 8000 }
      // OPENAI_MODEL, else the newest general GPT model the key can use
      oaModel ||= env('OPENAI_MODEL') || pickOpenAi(await listModels(s))
      return { ...s, model: oaModel }
    },
  },
  {
    provider: 'lmstudio',
    ready: live,
    settings: async () => {
      const s = { ...defaultAiSettings('lmstudio'), endpoint: env('LMSTUDIO_URL') || 'http://localhost:1234/v1', maxTokens: 6000 }
      lmModel ||= env('LMSTUDIO_MODEL') || (await listModels(s))[0] || ''
      return { ...s, model: lmModel }
    },
  },
]

/** a stand-in patch catalog for the tool tests */
const LEVELS: Record<string, number> = { 'WOOL BLANKET PAD': -12.5, 'SQUARE DEAL LEAD': -7.25 }
const tools: AgentTool[] = [
  {
    name: 'get_patch_level',
    description: 'The measured loudness of a patch, in dB, by its exact name.',
    schema: { type: 'object', properties: { name: { type: 'string', description: 'the patch name, e.g. WOOL BLANKET PAD' } }, required: ['name'], additionalProperties: false },
    run: (input: { name: string }) => {
      const level = LEVELS[input.name.toUpperCase().trim()]
      if (level === undefined) throw new Error(`no patch named ${input.name}`)
      return { text: `${input.name}: ${level} dB` }
    },
  },
  {
    name: 'render_swatch',
    description: 'Renders the colour swatch of the current patch as an image to look at.',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    run: () => ({ text: 'Here is the swatch.', images: [{ mediaType: 'image/png', data: squarePng([220, 20, 20]) }] }),
  },
]
const SYSTEM = 'You are a test assistant for a synthesizer app. Use the tools when asked; answer briefly.'

async function session(t: Target, system = SYSTEM): Promise<ChatSession> {
  return createSession(await t.settings(), system, tools)
}
const noop = () => {}

for (const t of targets) {
  describe.skipIf(!t.ready)(`${t.provider} contract`, () => {
    it('lists models', async () => {
      const models = await listModels(await t.settings())
      expect(models.length).toBeGreaterThan(0)
      console.log(`${t.provider} models:`, models.slice(0, 12).join(', '))
    }, 60_000)

    it('streams a plain answer', async () => {
      const s = await session(t)
      s.addUser('Reply with exactly the word: pong')
      const deltas: AiEvent[] = []
      const r = await s.step((e) => deltas.push(e))
      expect(r.stop).toBe('end')
      expect(r.text.toLowerCase()).toContain('pong')
      expect(deltas.filter((d) => d.type === 'text').length).toBeGreaterThan(0)
      console.log(t.provider, 'usage', r.usage, 'model', r.model)
    }, 120_000)

    it('runs the tool loop to an answer', async () => {
      const s = await session(t)
      const calls: string[] = []
      const out = await runAgent(s, tools, { text: 'What is the level of the patch WOOL BLANKET PAD? Use the tool, then tell me the number.' }, {
        onEvent: (e) => e.type === 'tool_start' && calls.push(`${e.call.name}(${JSON.stringify(e.call.input)})`),
      })
      console.log(t.provider, 'calls', calls, '→', out.text.slice(0, 200))
      expect(calls.some((c) => c.startsWith('get_patch_level'))).toBe(true)
      expect(out.stop).toBe('end')
      expect(out.text).toMatch(/12[.,]5/)
    }, 240_000)

    it('answers several tool calls in one turn', async () => {
      const s = await session(t)
      const out = await runAgent(s, tools, { text: 'Get the levels of both WOOL BLANKET PAD and SQUARE DEAL LEAD (call the tool for each, in one go if you can), then say which is louder.' }, { onEvent: noop })
      expect(out.stop).toBe('end')
      expect(out.text.toUpperCase()).toContain('SQUARE')
      // the transcript went back to the API intact after every round
      console.log(t.provider, 'steps', out.steps, '→', out.text.slice(0, 160))
    }, 240_000)

    it('sees an image a tool returns', async () => {
      const s = await session(t)
      const out = await runAgent(s, tools, { text: 'Call render_swatch and tell me, in one word, the colour of the square in the image.' }, { onEvent: noop })
      console.log(t.provider, 'swatch →', out.text.slice(0, 160))
      expect(out.text.toLowerCase()).toMatch(/red|crimson|scarlet/)
    }, 240_000)

    it('resumes a saved conversation', async () => {
      const s = await session(t)
      s.addUser('Remember the code word: TANGERINE. Reply only "ok".')
      await s.step(noop)
      const again = createSession(await t.settings(), SYSTEM, tools, { saved: JSON.parse(JSON.stringify(s.save())) })
      again.addUser('What was the code word? One word.')
      const r = await again.step(noop)
      expect(r.text.toUpperCase()).toContain('TANGERINE')
    }, 180_000)

    it("takes SSB's real instructions and tool catalog (and caches them where the provider does)", async () => {
      // the specs only: nothing here runs a tool, so no board is needed
      const real = createTools({} as never, { confirmDeletes: true })
      const s = createSession(await t.settings(), SYSTEM_PROMPT, real)
      s.addUser('Without calling any tool, reply with exactly: ready')
      const a = await s.step(noop)
      s.addUser('Again without tools, reply with exactly: steady')
      const b = await s.step(noop)
      console.log(t.provider, 'real catalog usage', a.usage, b.usage)
      expect(a.stop).toBe('end')
      expect(b.text.toLowerCase()).toContain('steady')
      if (t.provider !== 'lmstudio') expect(b.usage.cacheRead).toBeGreaterThan(0)
    }, 240_000)

    it('stops when aborted, leaving the transcript as it was', async () => {
      const s = await session(t)
      s.addUser('Count from 1 to 400, one number per line.')
      const before = s.save().messages.length
      const ctl = new AbortController()
      const err = await s
        .step((e) => e.type === 'text' && ctl.abort(), ctl.signal)
        .then(() => null)
        .catch((e) => e)
      expect(err).toBeInstanceOf(AiError)
      expect((err as AiError).kind).toBe('aborted')
      expect(s.save().messages.length).toBe(before)
    }, 120_000)
  })
}

describe.skipIf(!targets[0].ready)('anthropic caching and errors', () => {
  // a system prompt well over the minimum cacheable prefix
  const big = SYSTEM + '\n\nReference table:\n' + Array.from({ length: 220 }, (_, i) => `- setting ${i}: ranges from ${i} to ${i * 3 + 7}, default ${i + 1}`).join('\n')

  it('caches the instructions and the conversation', async () => {
    const s = (await session(targets[0], big)) as AnthropicSession
    s.addUser('Reply with exactly: one')
    const a = await s.step(noop)
    s.addUser('Reply with exactly: two')
    const b = await s.step(noop)
    console.log('cache usage', a.usage, b.usage)
    expect(a.usage.cacheWrite + a.usage.cacheRead).toBeGreaterThan(0)
    expect(b.usage.cacheRead).toBeGreaterThan(0)
  }, 180_000)

  it('takes a 1-hour prefix with pinned turns (system + 2 pins + the automatic tail = 4 breakpoints)', async () => {
    const settings = { ...(await targets[0].settings()), cacheTtl: '1h' as const }
    const s = createSession(settings, big, tools) as AnthropicSession
    for (const w of ['alpha', 'beta', 'gamma']) {
      const i = s.addUser(`Reply with exactly: ${w}`)
      if (w !== 'gamma') s.pins.push(i)
      const r = await s.step(noop)
      expect(r.stop).toBe('end')
    }
    const req = s.request()
    const marks = JSON.stringify(req.messages).split('"cache_control"').length - 1
    expect(marks).toBe(2)
    console.log('1h usage ok, pinned marks', marks)
  }, 240_000)

  it('names a bad key as one', async () => {
    const s = createSession({ ...(await targets[0].settings()), apiKey: 'sk-ant-invalid' }, SYSTEM, tools)
    s.addUser('hi')
    const err = await s.step(noop).catch((e) => e)
    expect(err).toBeInstanceOf(AiError)
    expect((err as AiError).kind).toBe('auth')
  }, 60_000)
})
