import type { AiSettings, ChatSession, SavedTranscript, ToolSpec } from '../types'
import { AnthropicSession, listAnthropicModels } from './anthropic'
import { OpenAiResponsesSession, OpenAiSession, listOpenAiModels } from './openai'

export interface SessionOptions {
  /** how requests leave the page (the plugin's web view may need its own) */
  fetch?: typeof fetch
  /** a conversation to resume */
  saved?: SavedTranscript
  /** keeps a conversation on one prompt cache (OpenAI's prompt_cache_key) */
  cacheKey?: string
}

/** A conversation with the provider the settings name, its instructions and tools fixed from here on. */
export function createSession(settings: AiSettings, system: string, tools: ToolSpec[], o: SessionOptions = {}): ChatSession {
  const provider = o.saved?.provider ?? settings.provider
  if (provider === 'anthropic') return new AnthropicSession(settings, system, tools, o.fetch, o.saved)
  // OpenAI itself: the Responses API (its reasoning models take tools there only); LM Studio: Chat Completions
  if (provider === 'openai') return new OpenAiResponsesSession(settings, system, tools, o.fetch, o.saved, o.cacheKey)
  return new OpenAiSession(provider, settings, system, tools, o.fetch, o.saved, o.cacheKey)
}

/** the models the provider offers with these settings (key, endpoint) */
export function listModels(settings: AiSettings, fetchImpl?: typeof fetch): Promise<string[]> {
  return settings.provider === 'anthropic' ? listAnthropicModels(settings, fetchImpl) : listOpenAiModels(settings, fetchImpl)
}
