/**
 * The AI patch maker's state: settings (each provider keeps its own endpoint, key and model), saved conversations
 * (starred ones kept for good, the rest pruned after a while) and the one that's open, with its agent run.
 *
 * Keys live in this browser's (or web view's) local storage only: never in the board, its exports, or a plugin's
 * saved session.
 */
import { defineStore } from 'pinia'
import { computed, markRaw, reactive, ref, shallowRef, watch } from 'vue'
import { del, get, set } from 'idb-keyval'
import { useBoard } from '../../stores/board'
import { runAgent, type AgentEvent } from './agent'
import { SYSTEM_PROMPT } from './prompt'
import { createSession, listModels } from './providers'
import { createTools } from './tools'
import { performTake, readPcmWav, resolveAudioAgent, shapeTake, type AudioAgentConfig } from './audio'
import {
  addUsage,
  AiError,
  defaultAiSettings,
  defaultAudioSettings,
  emptyUsage,
  PROVIDERS,
  type AiSettings,
  type ChatSession,
  type ProviderKind,
  type SavedTranscript,
  type ToolCall,
  type Usage,
} from './types'

/** what the dialog shows of a conversation */
export type Item =
  | { kind: 'user'; text: string; msg: number }
  | { kind: 'assistant'; text: string; thinking: string; streaming: boolean; model?: string; usage?: Usage }
  | { kind: 'tool'; id: string; name: string; input: string; status: 'running' | 'done' | 'error'; output?: string; images?: string[]; sound?: string }
  | { kind: 'note'; text: string; level: 'info' | 'error' }

export interface Conversation {
  id: string
  title: string
  provider: ProviderKind
  model: string
  created: number
  updated: number
  starred: boolean
  usage: Usage
  items: Item[]
  transcript: SavedTranscript | null
}
type ConversationMeta = Omit<Conversation, 'items' | 'transcript'>

const SETTINGS_KEY = 'ssb:ai:settings'
const INDEX_KEY = 'ssb:ai:conversations'
const convoKey = (id: string) => `ssb:ai:conversation:${id}`
/** unstarred conversations beyond this many (most recent first) are dropped */
const KEEP = 30

interface StoredSettings {
  current: AiSettings
  /** each provider's own endpoint, key and model */
  profiles: Partial<Record<ProviderKind, Pick<AiSettings, 'endpoint' | 'apiKey' | 'model'>>>
}

function loadSettings(): StoredSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as StoredSettings | null
    if (raw?.current)
      return {
        current: { ...defaultAiSettings(raw.current.provider), ...raw.current, audio: { ...defaultAudioSettings(), ...(raw.current.audio ?? {}) } },
        profiles: raw.profiles ?? {},
      }
  } catch {
    /* storage blocked or broken: defaults */
  }
  return { current: defaultAiSettings(), profiles: {} }
}

export const useAi = defineStore('ai', () => {
  const board = useBoard()
  const stored = loadSettings()
  const settings = reactive<AiSettings>(stored.current)
  const profiles = reactive(stored.profiles)
  watch(
    settings,
    () => {
      profiles[settings.provider] = { endpoint: settings.endpoint, apiKey: settings.apiKey, model: settings.model }
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ current: settings, profiles }))
      } catch {
        /* private window: kept for this session only */
      }
    },
    { deep: true },
  )
  /** another provider: its own endpoint / key / model come back */
  function switchProvider(p: ProviderKind) {
    if (p === settings.provider) return
    const saved = profiles[p]
    Object.assign(settings, { provider: p, endpoint: saved?.endpoint ?? PROVIDERS[p].endpoint, apiKey: saved?.apiKey ?? '', model: saved?.model ?? PROVIDERS[p].model })
  }
  const configured = computed(() => !!settings.model && !!settings.endpoint && (!PROVIDERS[settings.provider].needsKey || !!settings.apiKey))
  /** the audio agent make_audio briefs: its own key, else the OpenAI provider's (null: neither) */
  const audioAgent = (): AudioAgentConfig | null => resolveAudioAgent({ current: settings, profiles })
  const audioReady = computed(() => !!audioAgent())
  const toolsFor = () => createTools(board, { confirmDeletes: settings.confirmDeletes, audio: audioAgent })

  // ── models ──
  const models = ref<string[]>([])
  const modelsError = ref('')
  async function fetchModels() {
    modelsError.value = ''
    try {
      models.value = await listModels(settings)
      if (!settings.model && models.value.length) settings.model = models.value[0]
    } catch (e) {
      models.value = []
      modelsError.value = e instanceof Error ? e.message : String(e)
    }
  }

  // ── conversations ──
  const list = ref<ConversationMeta[]>([])
  const current = ref<Conversation | null>(null)
  let session: ChatSession | null = null
  const loadedList = get<ConversationMeta[]>(INDEX_KEY).then((l) => (list.value = l ?? []))

  const meta = (c: Conversation): ConversationMeta => {
    const { items: _i, transcript: _t, ...m } = c
    return { ...m }
  }
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  function saveSoon() {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void save(), 400)
  }
  async function save() {
    const c = current.value
    if (!c || !c.items.length) return
    c.transcript = session ? JSON.parse(JSON.stringify(session.save())) : c.transcript
    c.updated = Date.now()
    await set(convoKey(c.id), JSON.parse(JSON.stringify(c)))
    const rest = list.value.filter((x) => x.id !== c.id)
    const all = [meta(c), ...rest].sort((a, b) => b.updated - a.updated)
    // starred ones stay; of the others, the most recent KEEP
    const keep: ConversationMeta[] = []
    let unstarred = 0
    for (const x of all) {
      if (x.starred || unstarred++ < KEEP) keep.push(x)
      else void del(convoKey(x.id))
    }
    list.value = keep
    await set(INDEX_KEY, JSON.parse(JSON.stringify(keep)))
  }

  function newConversation() {
    stop()
    session = null
    current.value = {
      id: crypto.randomUUID(),
      title: 'New conversation',
      provider: settings.provider,
      model: settings.model,
      created: Date.now(),
      updated: Date.now(),
      starred: false,
      usage: emptyUsage(),
      items: [],
      transcript: null,
    }
  }

  async function open(id: string) {
    if (running.value) return
    await loadedList
    const c = await get<Conversation>(convoKey(id))
    if (!c) {
      list.value = list.value.filter((x) => x.id !== id)
      return
    }
    session = null
    current.value = c
  }

  async function remove(id: string) {
    if (current.value?.id === id) {
      stop()
      current.value = null
      session = null
    }
    list.value = list.value.filter((x) => x.id !== id)
    await del(convoKey(id))
    await set(INDEX_KEY, JSON.parse(JSON.stringify(list.value)))
  }

  async function toggleStar(id: string) {
    const m = list.value.find((x) => x.id === id)
    if (current.value?.id === id) current.value.starred = !current.value.starred
    if (m) m.starred = current.value?.id === id ? current.value.starred : !m.starred
    if (current.value?.id === id) await save()
    else {
      const c = await get<Conversation>(convoKey(id))
      if (c && m) await set(convoKey(id), { ...c, starred: m.starred })
      await set(INDEX_KEY, JSON.parse(JSON.stringify(list.value)))
    }
  }

  async function rename(id: string, title: string) {
    const t = title.trim()
    if (!t) return
    if (current.value?.id === id) {
      current.value.title = t
      await save()
      return
    }
    const m = list.value.find((x) => x.id === id)
    const c = await get<Conversation>(convoKey(id))
    if (m && c) {
      m.title = t
      await set(convoKey(id), { ...c, title: t })
      await set(INDEX_KEY, JSON.parse(JSON.stringify(list.value)))
    }
  }

  /** the open conversation's session, made when first needed (resumed from its transcript) */
  function sessionFor(c: Conversation): ChatSession {
    if (session) return session
    // a conversation stays with the provider and model it began with (caches are per model; each keeps its own format)
    const s = c.transcript ? { ...settings, ...(profiles[c.provider] ?? {}), provider: c.provider, model: c.model } : { ...settings }
    session = markRaw(createSession(s, SYSTEM_PROMPT, toolsFor(), { saved: c.transcript ?? undefined, cacheKey: c.id }))
    return session
  }

  // ── pins: cache checkpoints on user turns (Anthropic; at most two) ──
  const pins = computed(() => new Set(current.value?.transcript?.pins ?? []))
  const pinnable = computed(() => (current.value?.transcript?.provider ?? settings.provider) === 'anthropic')
  function togglePin(msg: number) {
    const c = current.value
    if (!c) return
    const s = sessionFor(c)
    const i = s.pins.indexOf(msg)
    if (i >= 0) s.pins.splice(i, 1)
    else {
      s.pins.push(msg)
      while (s.pins.length > 2) s.pins.shift()
    }
    c.transcript = JSON.parse(JSON.stringify(s.save()))
    saveSoon()
  }

  // ── running the agent ──
  const running = ref(false)
  const confirming = shallowRef<{ question: string; call: ToolCall; resolve: (yes: boolean) => void } | null>(null)
  let abort: AbortController | null = null

  async function send(text: string) {
    const prompt = text.trim()
    if (!prompt || running.value) return
    if (!current.value) newConversation()
    const c = current.value!
    if (!configured.value && !c.transcript) {
      c.items.push({ kind: 'note', level: 'error', text: 'Set up a provider first: the ⚙ settings.' })
      return
    }
    const s = sessionFor(c)
    if (!c.items.length) c.title = prompt.length > 48 ? `${prompt.slice(0, 46)}…` : prompt
    c.provider = s.provider
    c.model = s.model
    c.items.push({ kind: 'user', text: prompt, msg: s.save().messages.length })
    running.value = true
    abort = new AbortController()
    let reply: Extract<Item, { kind: 'assistant' }> | null = null
    const tools = new Map<string, Extract<Item, { kind: 'tool' }>>()
    const onEvent = (e: AgentEvent) => {
      switch (e.type) {
        case 'text':
        case 'thinking': {
          if (!reply) {
            c.items.push({ kind: 'assistant', text: '', thinking: '', streaming: true })
            reply = c.items[c.items.length - 1] as Extract<Item, { kind: 'assistant' }>
          }
          if (e.type === 'text') reply.text += e.delta
          else reply.thinking += e.delta
          return
        }
        case 'tool_input': {
          let t = tools.get(e.id)
          if (!t && e.id) {
            c.items.push({ kind: 'tool', id: e.id, name: e.name, input: '', status: 'running' })
            t = c.items[c.items.length - 1] as Extract<Item, { kind: 'tool' }>
            tools.set(e.id, t)
          }
          if (t) t.input += e.partial
          return
        }
        case 'turn': {
          if (reply) {
            reply.streaming = false
            reply.model = e.result.model
            reply.usage = e.result.usage
          } else if (e.result.usage.input + e.result.usage.output) {
            // a turn of tool calls only: its usage still counts
            c.items.push({ kind: 'assistant', text: '', thinking: e.result.thinking, streaming: false, model: e.result.model, usage: e.result.usage })
          }
          c.usage = addUsage(c.usage, e.result.usage)
          if (e.result.stop === 'max_tokens') c.items.push({ kind: 'note', level: 'error', text: 'The reply hit the token limit (raise MAX TOKENS in the settings).' })
          if (e.result.stop === 'refusal')
            c.items.push({ kind: 'note', level: 'error', text: `The model declined${e.result.refusal?.explanation ? `: ${e.result.refusal.explanation}` : '.'}` })
          reply = null
          return
        }
        case 'tool_start': {
          let t = tools.get(e.call.id)
          if (!t) {
            c.items.push({ kind: 'tool', id: e.call.id, name: e.call.name, input: '', status: 'running' })
            t = c.items[c.items.length - 1] as Extract<Item, { kind: 'tool' }>
            tools.set(e.call.id, t)
          }
          t.input = JSON.stringify(e.call.input ?? {}, null, 1)
          return
        }
        case 'tool_done': {
          const t = tools.get(e.call.id)
          if (!t) return
          t.status = e.output.isError ? 'error' : 'done'
          t.output = e.output.text
          t.images = e.output.images?.map((im) => im.data)
          if (e.output.soundId) t.sound = e.output.soundId
          saveSoon()
          return
        }
      }
    }
    try {
      const out = await runAgent(
        s,
        toolsFor(),
        { text: prompt },
        {
          onEvent,
          approve: (call, question) =>
            new Promise<boolean>((resolve) => {
              confirming.value = { call, question, resolve: (yes) => ((confirming.value = null), resolve(yes)) }
            }),
        },
        abort.signal,
      )
      if (out.stop === 'max_steps') c.items.push({ kind: 'note', level: 'info', text: 'Stopped after many steps; say "go on" to continue.' })
      if (out.stop === 'aborted') c.items.push({ kind: 'note', level: 'info', text: 'Stopped.' })
    } catch (e) {
      c.items.push({ kind: 'note', level: 'error', text: e instanceof AiError || e instanceof Error ? e.message : String(e) })
    } finally {
      for (const it of c.items) if (it.kind === 'assistant') it.streaming = false
      for (const t of tools.values()) if (t.status === 'running') t.status = 'error'
      running.value = false
      abort = null
      confirming.value?.resolve(false)
      await save()
    }
  }

  function stop() {
    abort?.abort()
    confirming.value?.resolve(false)
  }

  /** a tiny request with the current settings: the setup works, or why not */
  async function testConnection(): Promise<string> {
    const s = createSession({ ...settings, maxTokens: 400 }, 'Reply with exactly: ok', [])
    s.addUser('ping')
    const r = await s.step(() => {})
    return `${r.model} answered: ${(r.text || r.thinking).trim().slice(0, 60) || '(empty)'}`
  }

  /** one short take with the audio agent's settings: it works (and how it sounds), or why not */
  async function testAudio(): Promise<{ text: string; channels: Float32Array[]; rate: number }> {
    const cfg = audioAgent()
    if (!cfg) throw new AiError('No OpenAI key: add one here, or as the OpenAI provider’s key', 'auth')
    const take = await performTake(cfg, { script: 'Super Sound Board.', delivery: 'warm and clear, like a radio station ident.' })
    const pcm = readPcmWav(take.wav)
    if (!pcm) throw new AiError('The take could not be read', 'other')
    const shaped = shapeTake(pcm.channels, pcm.rate, { maxSeconds: 10 })
    return { text: `${take.model} · ${take.voice}: “${take.transcript}” (${shaped.seconds.toFixed(1)} s)`, channels: [shaped.data], rate: shaped.rate }
  }

  return {
    settings, switchProvider, configured, audioReady, testAudio, models, modelsError, fetchModels,
    list, current, newConversation, open, remove, toggleStar, rename,
    pins, pinnable, togglePin, running, confirming, send, stop, testConnection,
  }
})
