/**
 * The AI patch maker's provider-neutral shapes. A conversation is bound to one provider and model when it starts
 * (caches are model-scoped, and each provider keeps its own transcript format: providers/anthropic.ts keeps the
 * Messages API's content blocks exactly as they came back, thinking included, as preserved thinking requires);
 * the agent loop (agent.ts) and the tools (tools.ts) only see what's here.
 */
import { DEFAULT_SOUND_MODEL } from './soundModels'

export type ProviderKind = 'anthropic' | 'openai' | 'lmstudio'

/** the sound models' settings (part of the AI settings, kept in this browser's storage with the rest) */
export interface SoundSettings {
  /** the model picked: a catalog id (soundModels.ts) or a GGUF's Hugging Face URL, as typed into the combobox */
  model: string
  /** a Hugging Face token (read access), for gated models (Stable Audio Open 1.0) */
  hfToken: string
}
export const defaultSoundSettings = (): SoundSettings => ({ model: DEFAULT_SOUND_MODEL, hfToken: '' })

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface AiSettings {
  provider: ProviderKind
  /** API base: https://api.anthropic.com, https://api.openai.com/v1, http://localhost:1234/v1 */
  endpoint: string
  /** kept in this browser's storage only: never in the board, its exports or a plugin session */
  apiKey: string
  model: string
  maxTokens: number
  /** Anthropic: how hard the model thinks (output_config.effort) */
  effort: Effort
  /** Anthropic: show a summary of the model's thinking, or keep it hidden (it thinks either way) */
  thinking: 'summarized' | 'omitted'
  /** Anthropic: how long the cached prefix (instructions, tools, pinned turns) lives between requests */
  cacheTtl: '5m' | '1h'
  /** Anthropic: when a request is declined, the API retries it on a fallback model (server-side fallbacks) */
  fallback: boolean
  /** OpenAI-compatible: sampling temperature (null: the server's default; reasoning models reject it) */
  temperature: number | null
  /** OpenAI reasoning models: reasoning_effort ('' leaves it out) */
  reasoningEffort: '' | 'low' | 'medium' | 'high'
  /** ask before the agent deletes a patch */
  confirmDeletes: boolean
  /** the sound models make_sound briefs (soundTools.ts) */
  sound: SoundSettings
}

export const PROVIDERS: Record<ProviderKind, { label: string; endpoint: string; model: string; needsKey: boolean; hint: string }> = {
  anthropic: {
    label: 'Anthropic',
    endpoint: 'https://api.anthropic.com',
    model: 'claude-opus-5-5',
    needsKey: true,
    hint: 'An API key from platform.claude.com',
  },
  openai: {
    label: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    model: '',
    needsKey: true,
    hint: 'An API key from platform.openai.com',
  },
  lmstudio: {
    label: 'LM Studio',
    endpoint: 'http://localhost:1234/v1',
    model: '',
    needsKey: false,
    hint: "LM Studio's local server (Developer tab), with CORS enabled; a model that does tool calling (and vision, for the images)",
  },
}

export const defaultAiSettings = (provider: ProviderKind = 'anthropic'): AiSettings => ({
  provider,
  endpoint: PROVIDERS[provider].endpoint,
  apiKey: '',
  model: PROVIDERS[provider].model,
  maxTokens: 32000,
  effort: 'high',
  thinking: 'summarized',
  cacheTtl: '5m',
  fallback: true,
  temperature: null,
  reasoningEffort: '',
  confirmDeletes: true,
  sound: defaultSoundSettings(),
})

/** a JSON Schema, as tools describe their input (the subset schema.ts validates) */
export interface JsonSchema {
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'null' | ('string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null')[]
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean | JsonSchema
  items?: JsonSchema
  enum?: (string | number | boolean | null)[]
  minimum?: number
  maximum?: number
  minItems?: number
  maxItems?: number
}

/** a tool the model may call */
export interface ToolSpec {
  name: string
  description: string
  schema: JsonSchema
}

export interface AiImage {
  mediaType: 'image/png' | 'image/jpeg'
  /** base64, no data: prefix */
  data: string
}

/** a call the model made; `inputError` when its input didn't parse or doesn't fit the tool's schema */
export interface ToolCall {
  id: string
  name: string
  input: unknown
  inputError?: string
}

/** what a tool returns to the model */
export interface ToolOutput {
  callId: string
  name: string
  text: string
  images?: AiImage[]
  isError?: boolean
  /** a sound the tool put on the board (not sent to the model) */
  soundId?: string
}

export interface Usage {
  /** input at full price (the uncached remainder) */
  input: number
  output: number
  /** input served from the prompt cache */
  cacheRead: number
  /** input written to the prompt cache (Anthropic) */
  cacheWrite: number
}
export const emptyUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
export const addUsage = (a: Usage, b: Usage): Usage => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
})

/** what streams out of a model call, for the dialog */
export type AiEvent =
  | { type: 'text'; delta: string }
  | { type: 'thinking'; delta: string }
  /** a tool call's input as it streams (partial JSON) */
  | { type: 'tool_input'; id: string; name: string; partial: string }

export type StopKind = 'end' | 'tool_use' | 'max_tokens' | 'refusal' | 'other'

export interface TurnResult {
  stop: StopKind
  /** the turn's text (all its text blocks) */
  text: string
  /** the turn's thinking summary, if any */
  thinking: string
  toolCalls: ToolCall[]
  usage: Usage
  /** the model that answered (a fallback model, after a decline) */
  model: string
  refusal?: { category?: string | null; explanation?: string | null }
}

/**
 * One conversation with one provider: its own transcript (append-only), its instructions and tools fixed when it
 * started, so every request repeats the same prefix and the prompt cache holds.
 */
export interface ChatSession {
  readonly provider: ProviderKind
  readonly model: string
  /** the user's turn */
  addUser(text: string, images?: AiImage[]): void
  /** one model call over the transcript; appends the model's reply to it */
  step(onEvent: (e: AiEvent) => void, signal?: AbortSignal): Promise<TurnResult>
  /** every result of the last turn's tool calls, together (one message, as parallel calls want) */
  addToolResults(results: ToolOutput[]): void
  /** user turns (by their index among user turns) kept as cache checkpoints (Anthropic; others cache automatically) */
  pins: number[]
  /** the transcript, to save and resume */
  save(): SavedTranscript
}

export interface SavedTranscript {
  provider: ProviderKind
  model: string
  messages: unknown[]
  pins: number[]
}

/** an error worth showing as it is (a bad key, the server unreachable, CORS) */
export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'network' | 'rate' | 'request' | 'server' | 'aborted' | 'other' = 'other',
  ) {
    super(message)
  }
}

/**
 * What went wrong, as words, whatever was thrown: an Error's message, or a plain object's `message` or `error`
 * (a native reply, a JSON error body), never "[object Object]".
 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message || e.name
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>
    for (const k of ['message', 'error'] as const) {
      const v = o[k]
      if (typeof v === 'string' && v) return v
      if (v && typeof v === 'object') return errorMessage(v)
    }
    try {
      return JSON.stringify(e).slice(0, 400)
    } catch {
      /* falls through */
    }
  }
  return String(e)
}
