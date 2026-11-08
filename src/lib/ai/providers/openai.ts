import { parseInput, validate } from '../schema'
import {
  AiError,
  type AiEvent,
  type AiImage,
  type AiSettings,
  type ChatSession,
  type SavedTranscript,
  type ToolCall,
  type ToolOutput,
  type ToolSpec,
  type TurnResult,
} from '../types'

/** a Chat Completions message, as sent */
type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
type OaiToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }
type OaiMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | Part[] }
  | { role: 'assistant'; content: string | null; tool_calls?: OaiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

/**
 * OpenAI's Chat Completions API, and the servers that speak it (LM Studio). Streams; tool calls arrive in pieces by
 * index and are put together here. Tool results go back as `role: "tool"` messages; a tool's images follow them in
 * a user message (a tool message carries text only). OpenAI caches a prompt's prefix by itself (prompt_cache_key
 * keeps a conversation on one cache); local servers reuse what they can of their own context.
 */
export class OpenAiSession implements ChatSession {
  readonly model: string
  messages: OaiMessage[]
  pins: number[] = []
  private tools: { type: 'function'; function: { name: string; description: string; parameters: unknown } }[]

  constructor(
    readonly provider: 'openai' | 'lmstudio',
    private settings: AiSettings,
    system: string,
    private toolSpecs: ToolSpec[],
    private fetchImpl: typeof fetch = (...a: Parameters<typeof fetch>) => fetch(...a),
    saved?: SavedTranscript,
    private cacheKey = '',
  ) {
    this.model = saved?.model ?? settings.model
    this.messages = (saved?.messages as OaiMessage[]) ?? [{ role: 'system', content: system }]
    if (saved) this.pins = saved.pins
    this.tools = [...toolSpecs]
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } }))
  }

  addUser(text: string, images: AiImage[] = []) {
    this.messages.push({
      role: 'user',
      content: images.length ? [...images.map(imagePart), { type: 'text', text }] : text,
    })
    return this.messages.length - 1
  }

  addToolResults(results: ToolOutput[]) {
    for (const r of results) this.messages.push({ role: 'tool', tool_call_id: r.callId, content: (r.isError ? 'ERROR: ' : '') + (r.text || 'done') })
    const shown = results.filter((r) => r.images?.length)
    if (shown.length)
      this.messages.push({
        role: 'user',
        content: shown.flatMap((r) => [{ type: 'text' as const, text: `The images ${r.name} returned (call ${r.callId}):` }, ...r.images!.map(imagePart)]),
      })
  }

  /** the request body for the transcript as it stands */
  body(): Record<string, unknown> {
    const s = this.settings
    const body: Record<string, unknown> = {
      model: this.model,
      messages: this.messages,
      tools: this.tools,
      stream: true,
      stream_options: { include_usage: true },
    }
    // OpenAI's newer models take max_completion_tokens (and reject max_tokens); local servers take max_tokens
    if (this.provider === 'openai') body.max_completion_tokens = s.maxTokens
    else body.max_tokens = s.maxTokens
    if (s.temperature !== null) body.temperature = s.temperature
    if (s.reasoningEffort) body.reasoning_effort = s.reasoningEffort
    if (this.provider === 'openai' && this.cacheKey) body.prompt_cache_key = this.cacheKey
    return body
  }

  async step(onEvent: (e: AiEvent) => void, signal?: AbortSignal): Promise<TurnResult> {
    const res = await request(this.fetchImpl, this.settings, '/chat/completions', { method: 'POST', body: JSON.stringify(this.body()), signal })
    let text = ''
    let thinking = ''
    let finish = ''
    let model = this.model
    const calls: { id: string; name: string; args: string }[] = []
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
    try {
      for await (const chunk of sse(res, signal)) {
        if (chunk.model) model = chunk.model
        if (chunk.usage) {
          const cached = chunk.usage.prompt_tokens_details?.cached_tokens ?? 0
          usage.cacheRead = cached
          usage.input = (chunk.usage.prompt_tokens ?? 0) - cached
          usage.output = chunk.usage.completion_tokens ?? 0
        }
        const choice = chunk.choices?.[0]
        if (!choice) continue
        const d = choice.delta ?? {}
        // reasoning, as servers name it: reasoning_content (LM Studio, DeepSeek), reasoning (others)
        const r = d.reasoning_content ?? d.reasoning
        if (typeof r === 'string' && r) {
          thinking += r
          onEvent({ type: 'thinking', delta: r })
        }
        if (typeof d.content === 'string' && d.content) {
          text += d.content
          onEvent({ type: 'text', delta: d.content })
        }
        for (const tc of d.tool_calls ?? []) {
          const i = tc.index ?? calls.length
          const c = (calls[i] ??= { id: '', name: '', args: '' })
          if (tc.id) c.id = tc.id
          if (tc.function?.name) c.name += tc.function.name
          if (tc.function?.arguments) {
            c.args += tc.function.arguments
            onEvent({ type: 'tool_input', id: c.id, name: c.name, partial: tc.function.arguments })
          }
        }
        if (choice.finish_reason) finish = choice.finish_reason
      }
    } catch (e) {
      throw e instanceof AiError ? e : (e as Error).name === 'AbortError' ? new AiError('Stopped', 'aborted') : new AiError(`The stream broke off: ${(e as Error).message}`, 'network')
    }
    // a local model that wrote its call as text (often inside its thinking) instead of a structured tool call
    if (!calls.filter(Boolean).length && finish !== 'length') {
      for (const r of recoverToolCalls(`${thinking}\n${text}`, this.toolSpecs)) calls.push({ id: '', name: r.name, args: r.args })
    }
    const toolCalls: ToolCall[] = calls.filter(Boolean).map((c, i) => {
      const id = c.id || `call_${Date.now().toString(36)}_${i}`
      const spec = this.toolSpecs.find((t) => t.name === c.name)
      const input = parseInput(c.args)
      const inputError = input.error ?? (spec ? validate(spec.schema, input.value) : `unknown tool ${c.name}`) ?? undefined
      return { id, name: c.name, input: input.value, inputError }
    })
    this.messages.push({
      role: 'assistant',
      content: text || null,
      ...(toolCalls.length ? { tool_calls: toolCalls.map((c, i) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: calls[i]?.args || '{}' } })) } : {}),
    })
    // some servers say "stop" even when they called tools
    const stop = toolCalls.length && (finish === 'tool_calls' || finish === 'stop' || finish === 'function_call' || !finish) ? 'tool_use'
      : finish === 'length' ? 'max_tokens'
      : finish === 'content_filter' ? 'refusal'
      : finish === 'stop' || !finish ? 'end'
      : 'other'
    return { stop, text, thinking, toolCalls: stop === 'tool_use' ? toolCalls : [], usage, model }
  }

  save(): SavedTranscript {
    return { provider: this.provider, model: this.model, messages: this.messages, pins: this.pins }
  }
}

/**
 * Tool calls a model wrote out as text, in the chat templates' own formats: Qwen3.5 / Qwen3-coder's
 * `<function=name><parameter=key>value</parameter></function>` and Hermes / Qwen's `<tool_call>{"name", "arguments"}</tool_call>`.
 * Only names of real tools count.
 */
export function recoverToolCalls(text: string, tools: ToolSpec[]): { name: string; args: string }[] {
  const names = new Set(tools.map((t) => t.name))
  const out: { name: string; args: string }[] = []
  for (const m of text.matchAll(/<function=([\w.-]+)>([\s\S]*?)<\/function>/g)) {
    if (!names.has(m[1])) continue
    const args: Record<string, unknown> = {}
    for (const p of m[2].matchAll(/<parameter=([\w.-]+)>([\s\S]*?)<\/parameter>/g)) {
      const raw = p[2].trim()
      try {
        args[p[1]] = JSON.parse(raw)
      } catch {
        args[p[1]] = raw
      }
    }
    out.push({ name: m[1], args: JSON.stringify(args) })
  }
  if (out.length) return out
  for (const m of text.matchAll(/<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g)) {
    try {
      const v = JSON.parse(m[1]) as { name?: string; arguments?: unknown }
      if (v.name && names.has(v.name)) out.push({ name: v.name, args: typeof v.arguments === 'string' ? v.arguments : JSON.stringify(v.arguments ?? {}) })
    } catch {
      /* not a call */
    }
  }
  return out
}

const imagePart = (im: AiImage): Part => ({ type: 'image_url', image_url: { url: `data:${im.mediaType};base64,${im.data}` } })

/** a request to the server, its failures as something to show */
async function request(fetchImpl: typeof fetch, s: AiSettings, path: string, init: RequestInit): Promise<Response> {
  const url = s.endpoint.replace(/\/+$/, '') + path
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (s.apiKey) headers.authorization = `Bearer ${s.apiKey}`
  let res: Response
  try {
    res = await fetchImpl(url, { ...init, headers })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new AiError('Stopped', 'aborted')
    throw new AiError(
      s.provider === 'lmstudio'
        ? `Couldn't reach LM Studio at ${s.endpoint}: is its server running, with CORS on?`
        : `Couldn't reach ${s.endpoint} (offline, or the endpoint is wrong)`,
      'network',
    )
  }
  if (res.ok) return res
  const detail = await res.text().catch(() => '')
  let message = detail
  try {
    message = JSON.parse(detail)?.error?.message ?? detail
  } catch {
    /* not JSON */
  }
  const kind = res.status === 401 || res.status === 403 ? 'auth' : res.status === 429 ? 'rate' : res.status >= 500 ? 'server' : 'request'
  const what = kind === 'auth' ? 'The API key was refused' : kind === 'rate' ? 'Rate limited' : `Error ${res.status}`
  throw new AiError(`${what}: ${message.slice(0, 400)}`, kind)
}

interface Chunk {
  model?: string
  choices?: {
    delta?: {
      content?: string | null
      reasoning_content?: string
      reasoning?: string
      tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[]
    }
    finish_reason?: string | null
  }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }
}

/** the data events of a server-sent event stream, parsed */
async function* sse(res: Response, signal?: AbortSignal): AsyncGenerator<Chunk> {
  if (!res.body) throw new AiError('The server sent no stream', 'server')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    for (;;) {
      if (signal?.aborted) throw new AiError('Stopped', 'aborted')
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let cut: number
      while ((cut = buf.search(/\r?\n\r?\n/)) >= 0) {
        const event = buf.slice(0, cut)
        buf = buf.slice(cut).replace(/^\r?\n\r?\n/, '')
        const data = event
          .split(/\r?\n/)
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n')
        if (!data) continue
        if (data === '[DONE]') return
        try {
          const chunk = JSON.parse(data) as Chunk & { error?: { message?: string } }
          if (chunk.error) throw new AiError(`The server reported: ${chunk.error.message ?? 'an error'}`, 'server')
          yield chunk
        } catch (e) {
          if (e instanceof AiError) throw e
          /* a keep-alive or a line we don't read */
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/** the chat models the server offers (embedding models left out) */
export async function listOpenAiModels(settings: AiSettings, fetchImpl: typeof fetch = (...a: Parameters<typeof fetch>) => fetch(...a)): Promise<string[]> {
  const res = await request(fetchImpl, settings, '/models', { method: 'GET' })
  const json = (await res.json()) as { data?: { id: string }[] }
  return (json.data ?? []).map((m) => m.id).filter((id) => !/embed|whisper|tts|dall-e|moderation/i.test(id))
}
