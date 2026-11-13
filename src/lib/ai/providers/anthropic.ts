import Anthropic from '@anthropic-ai/sdk'
import { parseInput, validate } from '../schema'
import {
  AiError,
  emptyUsage,
  type AiEvent,
  type AiImage,
  type AiSettings,
  type ChatSession,
  type SavedTranscript,
  type ToolCall,
  type ToolOutput,
  type ToolSpec,
  type TurnResult,
  errorMessage,
} from '../types'

type Msg = Anthropic.Beta.Messages.BetaMessageParam
type Block = Anthropic.Beta.Messages.BetaContentBlockParam
type CacheControl = Anthropic.Beta.Messages.BetaCacheControlEphemeral

/**
 * Claude through the Messages API (the official SDK; in the plugin's web view too, with a fetch the page supplies).
 *
 * Caching, so a long design session is cheap: the instructions and tools never change within a conversation (the
 * tools sorted by name), with a breakpoint on the system prompt (5-minute or 1-hour TTL); turns the user pins get
 * breakpoints of their own (at most two); and automatic caching follows the growing tail. Four breakpoints at most.
 * The transcript is append-only and keeps each reply's content blocks as they came (thinking, fallback blocks):
 * newer models tie their thinking to the conversation, and an edited history can be refused.
 */
export class AnthropicSession implements ChatSession {
  readonly provider = 'anthropic' as const
  readonly model: string
  messages: Msg[] = []
  pins: number[] = []
  private client: Anthropic
  private tools: Anthropic.Beta.Messages.BetaTool[]

  constructor(
    private settings: AiSettings,
    private system: string,
    private toolSpecs: ToolSpec[],
    fetchImpl?: typeof fetch,
    saved?: SavedTranscript,
  ) {
    this.model = saved?.model ?? settings.model
    this.client = new Anthropic({
      apiKey: settings.apiKey,
      baseURL: settings.endpoint || undefined,
      dangerouslyAllowBrowser: true,
      fetch: fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a)),
      maxRetries: 2,
    })
    // deterministic: the tools render first in the prompt, so their order is part of the cached prefix
    this.tools = [...toolSpecs]
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .map((t) => ({ name: t.name, description: t.description, input_schema: t.schema as Anthropic.Beta.Messages.BetaTool.InputSchema, eager_input_streaming: true }))
    if (saved) {
      this.messages = saved.messages as Msg[]
      this.pins = saved.pins
    }
  }

  addUser(text: string, images: AiImage[] = []) {
    const content: Block[] = [
      ...images.map((im): Block => ({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.data } })),
      { type: 'text', text },
    ]
    this.messages.push({ role: 'user', content })
    return this.messages.length - 1
  }

  addToolResults(results: ToolOutput[]) {
    this.messages.push({
      role: 'user',
      content: results.map(
        (r): Block => ({
          type: 'tool_result',
          tool_use_id: r.callId,
          is_error: r.isError || undefined,
          content: [
            { type: 'text', text: r.text || (r.isError ? 'error' : 'done') },
            ...(r.images ?? []).map((im) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: im.mediaType, data: im.data } })),
          ],
        }),
      ),
    })
  }

  /** the request for the transcript as it stands */
  request(): Anthropic.Beta.Messages.MessageCreateParamsStreaming {
    const s = this.settings
    const ttl: CacheControl = s.cacheTtl === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' }
    const thinks = adaptiveThinking(this.model)
    const params: Anthropic.Beta.Messages.MessageCreateParamsStreaming = {
      model: this.model,
      max_tokens: s.maxTokens,
      stream: true,
      system: [{ type: 'text', text: this.system, cache_control: ttl }],
      tools: this.tools,
      messages: this.withPins(ttl),
      // the conversation's tail: automatic caching moves this breakpoint along as it grows (5 minutes; a 1-hour
      // prefix before it is allowed)
      cache_control: { type: 'ephemeral' },
    }
    if (thinks) params.thinking = { type: 'adaptive', display: s.thinking }
    if (thinks || /opus-4-5/.test(this.model)) params.output_config = { effort: s.effort }
    if (s.fallback && FALLBACK_MODELS.has(this.model) && isFirstParty(s.endpoint)) {
      params.betas = ['server-side-fallback-2026-07-01']
      params.fallbacks = 'default'
    }
    return params
  }

  /** the transcript with cache breakpoints on the pinned turns (copies: the stored transcript is never edited) */
  private withPins(ttl: CacheControl): Msg[] {
    const last = this.messages.length - 1
    // the newest two, and never the last message: automatic caching marks that, and two markers there would clash
    const pinned = new Set([...this.pins].filter((i) => i >= 0 && i < last).sort((a, b) => a - b).slice(-2))
    if (!pinned.size) return this.messages
    return this.messages.map((m, i): Msg => {
      if (!pinned.has(i) || m.role !== 'user' || !Array.isArray(m.content) || !m.content.length) return m
      const content = m.content.slice()
      content[content.length - 1] = { ...content[content.length - 1], cache_control: ttl } as Block
      return { role: 'user', content }
    })
  }

  async step(onEvent: (e: AiEvent) => void, signal?: AbortSignal): Promise<TurnResult> {
    let message: Anthropic.Beta.Messages.BetaMessage
    try {
      const stream = this.client.beta.messages.stream(this.request(), { signal })
      const toolNames = new Map<number, { id: string; name: string }>()
      stream.on('text', (delta) => onEvent({ type: 'text', delta }))
      stream.on('thinking', (delta) => onEvent({ type: 'thinking', delta }))
      stream.on('streamEvent', (e) => {
        if (e.type === 'content_block_start' && e.content_block.type === 'tool_use')
          toolNames.set(e.index, { id: e.content_block.id, name: e.content_block.name })
        else if (e.type === 'content_block_delta' && e.delta.type === 'input_json_delta') {
          const t = toolNames.get(e.index)
          if (t) onEvent({ type: 'tool_input', id: t.id, name: t.name, partial: e.delta.partial_json })
        }
      })
      message = await stream.finalMessage()
    } catch (e) {
      throw anthropicError(e)
    }
    // append-only: the reply exactly as it came (thinking and fallback blocks included)
    this.messages.push({ role: 'assistant', content: message.content as unknown as Block[] })

    const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    const thinking = message.content.flatMap((b) => (b.type === 'thinking' ? [b.thinking] : [])).join('\n')
    const toolCalls: ToolCall[] = message.content.flatMap((b) => {
      if (b.type !== 'tool_use') return []
      const spec = this.toolSpecs.find((t) => t.name === b.name)
      // streamed inputs aren't validated by the API: check them here (a string means the SDK couldn't parse it)
      const input = typeof b.input === 'string' ? parseInput(b.input) : { value: b.input }
      const inputError = input.error ?? (spec ? validate(spec.schema, input.value) : `unknown tool ${b.name}`) ?? undefined
      return [{ id: b.id, name: b.name, input: input.value, inputError }]
    })
    const u = message.usage
    const usage = {
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
    }
    const stop =
      message.stop_reason === 'tool_use' ? 'tool_use'
      : message.stop_reason === 'end_turn' || message.stop_reason === 'stop_sequence' ? 'end'
      : message.stop_reason === 'max_tokens' ? 'max_tokens'
      : message.stop_reason === 'refusal' ? 'refusal'
      : 'other'
    return {
      stop,
      text,
      thinking,
      // a refused or truncated turn's tool calls never run (their input may be cut off)
      toolCalls: stop === 'tool_use' ? toolCalls : [],
      usage: { ...emptyUsage(), ...usage },
      model: message.model,
      refusal: stop === 'refusal' ? { category: message.stop_details?.category ?? null, explanation: message.stop_details?.explanation ?? null } : undefined,
    }
  }

  save(): SavedTranscript {
    return { provider: this.provider, model: this.model, messages: this.messages, pins: this.pins }
  }
}

/** the models whose declines the API can retry elsewhere with `fallbacks: "default"` (the Claude API only) */
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])
const isFirstParty = (endpoint: string) => !endpoint || /^https:\/\/api\.anthropic\.com\/?$/.test(endpoint)
/** adaptive thinking (and effort): Claude 4.6 and later; 4.5 and older models think by budget, or not at all here */
const adaptiveThinking = (model: string) => !/claude-(3|.*-4-[015]\b|.*-4$|(opus|sonnet)-4-0)/.test(model)

/** the SDK's errors as something to show */
export function anthropicError(e: unknown): AiError {
  if (e instanceof AiError) return e
  if (e instanceof Anthropic.APIUserAbortError) return new AiError('Stopped', 'aborted')
  if (e instanceof Anthropic.AuthenticationError) return new AiError('The API key was refused: check it in the AI settings', 'auth')
  if (e instanceof Anthropic.PermissionDeniedError) return new AiError(`Not allowed: ${apiMessage(e)}`, 'auth')
  if (e instanceof Anthropic.NotFoundError) return new AiError(`Not found (is the model id right?): ${apiMessage(e)}`, 'request')
  if (e instanceof Anthropic.RateLimitError) return new AiError('Rate limited: wait a moment and try again', 'rate')
  if (e instanceof Anthropic.BadRequestError) return new AiError(`The request was refused: ${apiMessage(e)}`, 'request')
  if (e instanceof Anthropic.InternalServerError) return new AiError(`The API had a problem (${e.status}): try again`, 'server')
  if (e instanceof Anthropic.APIConnectionError) return new AiError("Couldn't reach the API (offline, or the endpoint is wrong)", 'network')
  if (e instanceof Anthropic.APIError) return new AiError(`API error ${e.status ?? ''}: ${apiMessage(e)}`, 'other')
  return new AiError(errorMessage(e))
}
const apiMessage = (e: InstanceType<typeof Anthropic.APIError>) => {
  const err = (e.error as { error?: { message?: string } } | undefined)?.error
  return err?.message ?? e.message
}

/** the models this key can use */
export async function listAnthropicModels(settings: AiSettings, fetchImpl?: typeof fetch): Promise<string[]> {
  const client = new Anthropic({
    apiKey: settings.apiKey,
    baseURL: settings.endpoint || undefined,
    dangerouslyAllowBrowser: true,
    fetch: fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a)),
  })
  try {
    const out: string[] = []
    for await (const m of client.models.list()) out.push(m.id)
    return out
  } catch (e) {
    throw anthropicError(e)
  }
}
