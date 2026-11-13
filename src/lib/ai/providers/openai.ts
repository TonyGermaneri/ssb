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
 * The Chat Completions API, as LM Studio and other local servers speak it (OpenAI itself: OpenAiResponsesSession below). Streams; tool calls arrive in pieces by
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

/** a Responses API input item: a message, or an output item the model returned (reasoning, function_call, message) sent back as it came */
type RItem = Record<string, unknown> & { type?: string; role?: string }
type RPart = { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string }

/**
 * OpenAI's own API, the Responses API. Its reasoning models (gpt-5.5, gpt-6…) refuse function tools with reasoning on
 * the Chat Completions route ("use /v1/responses"), so the OpenAI provider speaks this one. Stateless: `store: false`
 * keeps conversations off OpenAI's servers, and the model's reasoning comes back encrypted
 * (`reasoning.encrypted_content`) to go back with the next request, as the output items it returned. A tool's images
 * go back in its own function_call_output. A setting the model doesn't take (temperature on a reasoning model,
 * reasoning effort on gpt-4.1) is dropped for the rest of the conversation instead of failing it.
 */
export class OpenAiResponsesSession implements ChatSession {
  readonly provider = 'openai' as const
  readonly model: string
  items: RItem[]
  pins: number[] = []
  private tools: { type: 'function'; name: string; description: string; parameters: unknown; strict: false }[]
  /** request fields the model refused ('temperature', 'reasoning.effort'), left out from then on */
  private refused = new Set<string>()

  constructor(
    private settings: AiSettings,
    private system: string,
    private toolSpecs: ToolSpec[],
    private fetchImpl: typeof fetch = (...a: Parameters<typeof fetch>) => fetch(...a),
    saved?: SavedTranscript,
    private cacheKey = '',
  ) {
    this.model = saved?.model ?? settings.model
    this.items = saved ? fromChat(saved.messages as RItem[]) : []
    if (saved) this.pins = saved.pins
    // strict: false: the Responses API makes function tools strict by default, which wants every property required
    this.tools = [...toolSpecs]
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.schema, strict: false }))
  }

  addUser(text: string, images: AiImage[] = []) {
    this.items.push({ role: 'user', content: [...images.map(inputImage), { type: 'input_text', text }] })
    return this.items.length - 1
  }

  addToolResults(results: ToolOutput[]) {
    for (const r of results) {
      const text = (r.isError ? 'ERROR: ' : '') + (r.text || 'done')
      this.items.push({
        type: 'function_call_output',
        call_id: r.callId,
        output: r.images?.length ? [{ type: 'input_text', text }, ...r.images.map(inputImage)] : text,
      })
    }
  }

  /** the request body for the transcript as it stands */
  body(): Record<string, unknown> {
    const s = this.settings
    const reasoning: Record<string, unknown> = { summary: 'auto' }
    if (s.reasoningEffort && !this.refused.has('reasoning.effort')) reasoning.effort = s.reasoningEffort
    const body: Record<string, unknown> = {
      model: this.model,
      instructions: this.system,
      input: this.items,
      tools: this.tools,
      stream: true,
      store: false,
      include: ['reasoning.encrypted_content'],
      reasoning,
      max_output_tokens: s.maxTokens,
    }
    if (s.temperature !== null && !this.refused.has('temperature')) body.temperature = s.temperature
    if (this.cacheKey) body.prompt_cache_key = this.cacheKey
    return body
  }

  async step(onEvent: (e: AiEvent) => void, signal?: AbortSignal): Promise<TurnResult> {
    let res: Response | null = null
    for (let tries = 0; !res; tries++) {
      try {
        res = await request(this.fetchImpl, this.settings, '/responses', { method: 'POST', body: JSON.stringify(this.body()), signal })
      } catch (e) {
        // "Unsupported parameter: 'temperature' is not supported with this model." → without it
        const field = e instanceof AiError && e.kind === 'request' ? /Unsupported parameter: '([\w.]+)'/.exec(e.message)?.[1] : undefined
        if (!field || tries > 2 || this.refused.has(field) || !['temperature', 'reasoning.effort'].includes(field)) throw e
        this.refused.add(field)
      }
    }
    let text = ''
    let thinking = ''
    let final: ResponseObject | null = null
    const names = new Map<string, string>()
    try {
      for await (const ev of sse(res!, signal) as AsyncGenerator<unknown> as AsyncGenerator<ResponseEvent>) {
        switch (ev.type) {
          case 'response.output_text.delta':
            text += ev.delta ?? ''
            onEvent({ type: 'text', delta: ev.delta ?? '' })
            break
          case 'response.reasoning_summary_part.added':
            if (thinking) {
              thinking += '\n\n'
              onEvent({ type: 'thinking', delta: '\n\n' })
            }
            break
          case 'response.reasoning_summary_text.delta':
            thinking += ev.delta ?? ''
            onEvent({ type: 'thinking', delta: ev.delta ?? '' })
            break
          case 'response.output_item.added':
            if (ev.item?.type === 'function_call') names.set(String(ev.item.id), String(ev.item.name ?? ''))
            break
          case 'response.function_call_arguments.delta':
            onEvent({ type: 'tool_input', id: ev.item_id ?? '', name: names.get(ev.item_id ?? '') ?? '', partial: ev.delta ?? '' })
            break
          case 'response.completed':
          case 'response.incomplete':
            final = ev.response ?? null
            break
          case 'response.failed':
            throw new AiError(`The server reported: ${ev.response?.error?.message ?? 'the response failed'}`, 'server')
          case 'error':
            throw new AiError(`The server reported: ${ev.message ?? ev.error?.message ?? 'an error'}`, 'server')
        }
      }
    } catch (e) {
      throw e instanceof AiError ? e : (e as Error).name === 'AbortError' ? new AiError('Stopped', 'aborted') : new AiError(`The stream broke off: ${(e as Error).message}`, 'network')
    }
    if (!final) throw new AiError('The stream ended before the response did', 'network')
    const output = (final.output ?? []) as RItem[]
    const calls = output.filter((o) => o.type === 'function_call') as RItem[]
    const refusal = output.flatMap((o) => (o.type === 'message' ? ((o.content as { type: string; refusal?: string }[]) ?? []) : [])).find((c) => c.type === 'refusal')
    const why = final.incomplete_details?.reason
    const stop = final.status === 'incomplete' ? (why === 'content_filter' ? 'refusal' : why === 'max_output_tokens' ? 'max_tokens' : 'other')
      : refusal ? 'refusal'
      : calls.length ? 'tool_use'
      : 'end'
    // the turn goes into the transcript as the model returned it; a turn cut short keeps its words only (a call
    // with no output, or reasoning without the item it led to, would be refused next time)
    this.items.push(...(stop === 'tool_use' ? output : output.filter((o) => o.type === 'message')))
    if (!text) text = output.flatMap((o) => (o.type === 'message' ? ((o.content as { type: string; text?: string }[]) ?? []) : [])).map((c) => c.text ?? '').join('')
    const toolCalls: ToolCall[] = calls.map((c) => {
      const spec = this.toolSpecs.find((t) => t.name === c.name)
      const input = parseInput(String(c.arguments ?? ''))
      const inputError = input.error ?? (spec ? validate(spec.schema, input.value) : `unknown tool ${String(c.name)}`) ?? undefined
      return { id: String(c.call_id), name: String(c.name), input: input.value, inputError }
    })
    const u = final.usage
    const cached = u?.input_tokens_details?.cached_tokens ?? 0
    const written = u?.input_tokens_details?.cache_write_tokens ?? 0
    const usage = { input: Math.max(0, (u?.input_tokens ?? 0) - cached - written), output: u?.output_tokens ?? 0, cacheRead: cached, cacheWrite: written }
    return {
      stop,
      text,
      thinking,
      toolCalls: stop === 'tool_use' ? toolCalls : [],
      usage,
      model: final.model ?? this.model,
      ...(refusal ? { refusal: { explanation: refusal.refusal ?? null } } : {}),
    }
  }

  save(): SavedTranscript {
    return { provider: 'openai', model: this.model, messages: this.items, pins: this.pins }
  }
}

/** a conversation saved from the Chat Completions days (it starts with its system message), as Responses input */
function fromChat(messages: RItem[]): RItem[] {
  if (messages[0]?.role !== 'system') return messages
  const out: RItem[] = []
  for (const m of messages as OaiMessage[]) {
    if (m.role === 'system') continue
    if (m.role === 'user')
      out.push({
        role: 'user',
        content: typeof m.content === 'string' ? [{ type: 'input_text', text: m.content }]
          : m.content.map((p): RPart => (p.type === 'text' ? { type: 'input_text', text: p.text } : { type: 'input_image', image_url: p.image_url.url })),
      })
    else if (m.role === 'assistant') {
      if (m.content) out.push({ role: 'assistant', content: m.content })
      for (const c of m.tool_calls ?? []) out.push({ type: 'function_call', call_id: c.id, name: c.function.name, arguments: c.function.arguments })
    } else out.push({ type: 'function_call_output', call_id: m.tool_call_id, output: m.content })
  }
  return out
}

const inputImage = (im: AiImage): RPart => ({ type: 'input_image', image_url: `data:${im.mediaType};base64,${im.data}` })

interface ResponseObject {
  status?: string
  model?: string
  output?: unknown[]
  incomplete_details?: { reason?: string } | null
  error?: { message?: string } | null
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } }
}
interface ResponseEvent {
  type: string
  delta?: string
  item_id?: string
  item?: { type?: string; id?: string; name?: string }
  response?: ResponseObject
  message?: string
  error?: { message?: string }
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
  // (the Responses API's events come through here too: their errors arrive as typed events, read by its session)
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
          if (chunk.error && !(chunk as { type?: string }).type) throw new AiError(`The server reported: ${chunk.error.message ?? 'an error'}`, 'server')
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
