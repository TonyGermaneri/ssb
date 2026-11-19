<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useAi, type Item } from '../lib/ai/store'
import { errorMessage, PROVIDERS, type Effort, type ProviderKind } from '../lib/ai/types'
import { fmtBytes, SOUND_MODELS } from '../lib/ai/soundModels'
import { useBoard } from '../stores/board'
import { mcpSaved, mcpStatus } from '../lib/ai/mcpStatus'
import { newMcpToken, setMcp, setMcpPort } from '../lib/ai/mcpHost'
import { inNative } from '../native/bridge'

/**
 * The AI patch maker: a conversation with a model that makes, changes, studies and tidies the board's patches with
 * tools (lib/ai/tools.ts), its saved conversations (★ keeps one), and its settings: the provider and model it talks to,
 * and the MCP server. (The sound and word models are chosen per VCO, in its ☰ menu: VcoMenu.vue.)
 */
const open = defineModel<boolean>({ required: true })
const ai = useAi()
const board = useBoard()
const showSettings = ref(!ai.configured)
const draft = ref('')
const listEl = ref<HTMLElement>()
const zoom = ref<string | null>(null)
const renaming = ref<string | null>(null)
const renameText = ref('')
const testing = ref('')
const showKey = ref(false)

const items = computed<Item[]>(() => ai.current?.items ?? [])
const fmtK = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)
/** a local server reports no cache use: say nothing rather than "0" */
const reportsCache = computed(() => (ai.current?.transcript?.provider ?? ai.settings.provider) !== 'lmstudio')
const usageLine = (u?: { input: number; output: number; cacheRead: number; cacheWrite: number }) =>
  u
    ? `in ${fmtK(u.input)}${reportsCache.value || u.cacheRead ? ` · cache ${fmtK(u.cacheRead)} read${u.cacheWrite ? ` / ${fmtK(u.cacheWrite)} written` : ''}` : ''} · out ${fmtK(u.output)}`
    : ''
const totals = computed(() => usageLine(ai.current?.usage))
const providerName = computed(() => PROVIDERS[(ai.current?.transcript?.provider ?? ai.settings.provider) as ProviderKind].label)
const modelName = computed(() => ai.current?.transcript?.model ?? ai.settings.model)

/** text as HTML: escaped, then **bold**, `code` and headings; line breaks kept by the CSS */
function md(text: string) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc
    .replace(/^#{1,4} (.*)$/gm, '<b class="h">$1</b>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .trim()
}

// keep the newest message in view while it streams
watch(
  () => [items.value.length, items.value.at(-1)],
  () => void nextTick(() => listEl.value && (listEl.value.scrollTop = listEl.value.scrollHeight)),
  { deep: true },
)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}
function send(text = draft.value) {
  if (!text.trim() || ai.running) return
  draft.value = ''
  void ai.send(text)
}
const STARTERS = [
  'Make a warm, slowly evolving analog pad and check how it sounds.',
  'Make a punchy FM bass for techno; keep it mono with a short glide.',
  'Look at the selected patch: what does it sound like, and how could it be better?',
  'Find three bell-like waves and build a glassy keys patch from them.',
  // (a browser tab's models make music, not effects)
  ...(inNative()
    ? ['Generate a deep sci-fi door whoosh with the sound model and put it on the board.', 'Make a rainy-night ambience with the sound model, then build a slow evolving pad patch around it.']
    : ['Generate a lo-fi rhodes groove with the sound model and build a patch that plays it as a loop.']),
]
function startRename(id: string, title: string) {
  renaming.value = id
  renameText.value = title
}
function finishRename() {
  if (renaming.value) void ai.rename(renaming.value, renameText.value)
  renaming.value = null
}
async function test() {
  testing.value = 'Testing…'
  try {
    testing.value = `✓ ${await ai.testConnection()}`
  } catch (e) {
    testing.value = `✗ ${errorMessage(e)}`
  }
}
const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

// ── the sound model's state, for the header (chosen, downloaded and loaded in a VCO's ☰ menu: VcoMenu.vue) ──
const sound = computed(() => ai.soundStatus)
const labelOf = (id?: string) => (id ? (SOUND_MODELS.find((m) => m.id === id)?.label ?? id) : '')
const taskLine = computed(() => {
  const t = sound.value?.task
  if (!t) return ''
  const who = labelOf(t.model)
  const pct = t.progress == null ? '' : ` · ${Math.round(t.progress * 100)}%`
  if (t.kind === 'download') return `Downloading ${who}: ${fmtBytes(t.done)} of ${t.total ? fmtBytes(t.total) : '?'}${pct}`
  if (t.kind === 'load') return `Loading ${who}… ${Math.round(t.elapsed)} s`
  return `Generating with ${who}… ${Math.round(t.elapsed)} s`
})
watch(open, (o) => ai.watchSound(o), { immediate: true })
onBeforeUnmount(() => open.value && ai.watchSound(false))
/** ▷ on a clip in the conversation: the board's sound, played once (again: stops it) */
function playSound(id: string) {
  board.press(id)
  setTimeout(() => board.release(id), 150)
}

// ── the MCP server: the same tools, for agents outside SSB ──
const mcp = ref(mcpSaved())
const showToken = ref(false)
const copied = ref('')
const mcpOn = computed(() => mcpStatus.state === 'on' || mcpStatus.state === 'starting')
async function toggleMcp() {
  await setMcp(!mcpOn.value)
  mcp.value = mcpSaved()
}
async function regenerate() {
  await newMcpToken()
  mcp.value = mcpSaved()
}
async function applyPort() {
  const p = Math.round(Number(mcp.value.port))
  if (p >= 1024 && p <= 65000) await setMcpPort(p)
  mcp.value = mcpSaved()
}
const mcpUrl = computed(() => mcpStatus.url || `http://127.0.0.1:${mcp.value.port}/mcp`)
const cliPath = computed(() => mcpStatus.cli || '<path to ssb-mcp>')
const commands = computed(() => [
  { id: 'stdio', label: 'Claude Code · stdio', text: `claude mcp add ssb -- "${cliPath.value}"` },
  { id: 'http', label: 'Claude Code · HTTP', text: `claude mcp add --transport http ssb ${mcpUrl.value} --header "Authorization: Bearer ${mcp.value.token}"` },
  { id: 'json', label: 'JSON (Claude Desktop, Cursor, …)', text: JSON.stringify({ mcpServers: { ssb: { command: cliPath.value } } }) },
])
async function copy(id: string, text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = id
    setTimeout(() => copied.value === id && (copied.value = ''), 1500)
  } catch {
    copied.value = ''
  }
}
const ago = (t: number) => `${Math.max(0, Math.round((Date.now() - t) / 1000))}s ago`
const when = (t: number) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
watch(open, (o) => o && !ai.current && ai.newConversation())
</script>

<template>
  <v-dialog v-model="open" max-width="1180" scrollable>
    <div class="ai" @keydown.stop>
      <header class="top">
        <div class="brand">
          <span class="mark"><v-icon size="16" icon="mdi-creation" /></span>
          <div>
            <h3>AI Patch Maker</h3>
            <p class="sub" title="Conversations stay with the provider and model they began with">{{ providerName }} · {{ modelName || 'no model set' }}</p>
          </div>
        </div>
        <div class="badges">
          <span v-if="totals" class="usage" title="This conversation: input at full price · read from / written to the prompt cache · output">{{ totals }}</span>
          <span v-if="mcpStatus.state === 'on'" class="badge ok" :title="`MCP server on at ${mcpStatus.url}: agents outside SSB can use these tools`"><i />MCP</span>
          <span
            v-if="sound?.loaded || sound?.task"
            class="badge"
            :class="sound?.task ? 'busy' : 'ok'"
            :title="sound?.task ? taskLine : `Sound model loaded (${sound?.backend}): the agent generates audio with it. Choose it in a VCO's ☰ menu.`"
          >
            <i />{{ sound?.task ? sound.task.kind[0].toUpperCase() + sound.task.kind.slice(1) + (sound.task.progress != null ? ` ${Math.round(sound.task.progress * 100)}%` : '…') : sound?.loaded?.label }}
          </span>
        </div>
        <div class="tools">
          <button class="btn ghost" :class="{ on: showSettings }" :title="showSettings ? 'Back to the conversation' : 'Settings: provider, key, model, MCP'" @click="showSettings = !showSettings">
            <v-icon size="15" :icon="showSettings ? 'mdi-message-text-outline' : 'mdi-tune-variant'" />
            {{ showSettings ? 'Chat' : 'Settings' }}
          </button>
          <button class="btn ghost icon" title="Close (a running request carries on)" @click="open = false"><v-icon size="16" icon="mdi-close" /></button>
        </div>
      </header>

      <div class="body">
        <!-- saved conversations: starred first -->
        <aside class="convos">
          <button class="btn new" :disabled="ai.running" @click="ai.newConversation()"><v-icon size="15" icon="mdi-plus" /> New conversation</button>
          <p class="group">History</p>
          <div class="list">
            <div
              v-for="c in [...ai.list].sort((a, b) => Number(b.starred) - Number(a.starred) || b.updated - a.updated)"
              :key="c.id"
              class="convo"
              :class="{ on: ai.current?.id === c.id }"
              @click="ai.open(c.id)"
            >
              <button class="star" :class="{ on: c.starred }" :title="c.starred ? 'Starred: kept for good' : 'Star it to keep it (unstarred ones go after 30)'" @click.stop="ai.toggleStar(c.id)">
                <v-icon size="13" :icon="c.starred ? 'mdi-star' : 'mdi-star-outline'" />
              </button>
              <input v-if="renaming === c.id" v-model="renameText" class="rename" @click.stop @keydown.enter="finishRename" @blur="finishRename" />
              <span v-else class="title" :title="`${c.title} — double-click to rename`" @dblclick.stop="startRename(c.id, c.title)">{{ c.title }}</span>
              <small>{{ PROVIDERS[c.provider].label }} · {{ when(c.updated) }}</small>
              <button class="del" title="Delete this conversation" @click.stop="ai.remove(c.id)"><v-icon size="13" icon="mdi-trash-can-outline" /></button>
            </div>
            <p v-if="!ai.list.length" class="empty">Conversations are kept here. Star one to keep it for good.</p>
          </div>
        </aside>

        <!-- settings -->
        <section v-if="showSettings" class="settings">
          <div class="page">
            <div class="card">
              <div class="card-head">
                <h4>Model provider</h4>
                <p>The language model the agent thinks with. Keys stay in this computer's browser storage: never in the board, its exports, or a plugin's saved session.</p>
              </div>
              <div class="seg">
                <button v-for="(p, k) in PROVIDERS" :key="k" :class="{ on: ai.settings.provider === k }" @click="ai.switchProvider(k)">{{ p.label }}</button>
              </div>
              <p class="help">{{ PROVIDERS[ai.settings.provider].hint }}</p>
              <div class="fields two">
                <label class="field">
                  <span>Endpoint</span>
                  <input v-model.trim="ai.settings.endpoint" spellcheck="false" :placeholder="PROVIDERS[ai.settings.provider].endpoint" />
                </label>
                <label class="field">
                  <span>API key{{ PROVIDERS[ai.settings.provider].needsKey ? '' : ' (usually none)' }}</span>
                  <span class="row">
                    <input v-model.trim="ai.settings.apiKey" :type="showKey ? 'text' : 'password'" spellcheck="false" autocomplete="off" placeholder="Kept on this computer only" />
                    <button class="btn icon" :title="showKey ? 'Hide' : 'Show'" @click.prevent="showKey = !showKey"><v-icon size="14" :icon="showKey ? 'mdi-eye-off' : 'mdi-eye'" /></button>
                  </span>
                </label>
                <label class="field wide">
                  <span>Model</span>
                  <span class="row">
                    <input v-model.trim="ai.settings.model" list="ai-models" spellcheck="false" :placeholder="PROVIDERS[ai.settings.provider].model || 'Fetch the list →'" />
                    <datalist id="ai-models"><option v-for="m in ai.models" :key="m" :value="m" /></datalist>
                    <button class="btn" title="Ask the provider which models this key can use" @click.prevent="ai.fetchModels()">Fetch list</button>
                  </span>
                  <small v-if="ai.modelsError" class="err">{{ ai.modelsError }}</small>
                  <small v-else-if="ai.models.length" class="help">{{ ai.models.length }} models available: pick one in the field.</small>
                </label>
              </div>
            </div>

            <div class="card">
              <div class="card-head">
                <h4>Behaviour</h4>
                <p>How much it may write and think per turn. Conversations keep the provider and model they began with.</p>
              </div>
              <div class="fields">
                <label class="field">
                  <span>Max tokens</span>
                  <input v-model.number="ai.settings.maxTokens" type="number" min="1000" max="128000" step="1000" />
                </label>
                <template v-if="ai.settings.provider === 'anthropic'">
                  <label class="field">
                    <span>Effort</span>
                    <select v-model="ai.settings.effort"><option v-for="e in EFFORTS" :key="e" :value="e">{{ e }}</option></select>
                  </label>
                  <label class="field">
                    <span>Thinking</span>
                    <select v-model="ai.settings.thinking"><option value="summarized">Show a summary</option><option value="omitted">Hidden</option></select>
                  </label>
                  <label class="field" title="How long the cached instructions, tools and pinned turns live between requests: 1 hour costs more to write, pays off when you pause for longer than 5 minutes">
                    <span>Prompt cache</span>
                    <select v-model="ai.settings.cacheTtl"><option value="5m">5 minutes</option><option value="1h">1 hour</option></select>
                  </label>
                </template>
                <template v-else>
                  <label class="field">
                    <span>Temperature</span>
                    <input
                      :value="ai.settings.temperature ?? ''"
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      placeholder="Default"
                      @input="(e) => (ai.settings.temperature = (e.target as HTMLInputElement).value === '' ? null : Number((e.target as HTMLInputElement).value))"
                    />
                  </label>
                  <label v-if="ai.settings.provider === 'openai'" class="field">
                    <span>Reasoning</span>
                    <select v-model="ai.settings.reasoningEffort"><option value="">Default</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
                  </label>
                </template>
              </div>
              <div class="checks">
                <label class="check"><input v-model="ai.settings.confirmDeletes" type="checkbox" /> Ask before deleting patches or sounds</label>
                <label v-if="ai.settings.provider === 'anthropic'" class="check" title="If the model declines a request, the API retries it on a fallback model">
                  <input v-model="ai.settings.fallback" type="checkbox" /> Retry refusals on a fallback model
                </label>
              </div>
              <div class="card-foot">
                <span class="result" :class="{ err: testing.startsWith('✗') }">{{ testing }}</span>
                <button class="btn" :disabled="!ai.configured" @click="test">Test connection</button>
                <button class="btn primary" @click="showSettings = false">Done</button>
              </div>
            </div>

            <div class="card slim">
              <v-icon size="18" icon="mdi-waveform" class="lead" />
              <div>
                <h4>Sound and word models</h4>
                <p>Chosen, downloaded and deleted per VCO: open <b>☰</b> in a VCO's title bar. The agent generates audio with the sound model picked there last.</p>
              </div>
            </div>

            <div class="card">
              <div class="card-head with-action">
                <div>
                  <h4>MCP server</h4>
                  <p>Lets an agent outside SSB (Claude Code, Claude Desktop, Cursor…) use these same tools on this board, over HTTP on this computer or through the <code>ssb-mcp</code> command. SSB's window must stay open while it works.</p>
                </div>
                <label class="switch" :class="{ disabled: !inNative() }" :title="mcpOn ? 'On' : 'Off'">
                  <input type="checkbox" :checked="mcpOn" :disabled="!inNative()" @change="toggleMcp" />
                  <span />
                </label>
              </div>
              <p class="state" :class="mcpStatus.state">
                <i />
                <template v-if="!inNative()">Needs the SSB app or plugin: a browser tab can't open a port.</template>
                <template v-else-if="mcpStatus.state === 'on'">Serving at {{ mcpStatus.url }}</template>
                <template v-else-if="mcpStatus.state === 'starting'">Starting…</template>
                <template v-else-if="mcpStatus.state === 'error'">{{ mcpStatus.error }}</template>
                <template v-else>Off</template>
              </p>
              <div class="fields">
                <label class="field">
                  <span>Port</span>
                  <input v-model.number="mcp.port" type="number" min="1024" max="65000" @change="applyPort" />
                </label>
                <label class="field wide">
                  <span>Token (HTTP)</span>
                  <span class="row">
                    <input :value="mcp.token" :type="showToken ? 'text' : 'password'" readonly />
                    <button class="btn icon" :title="showToken ? 'Hide' : 'Show'" @click.prevent="showToken = !showToken"><v-icon size="14" :icon="showToken ? 'mdi-eye-off' : 'mdi-eye'" /></button>
                    <button class="btn icon" title="A new token (clients using the old one stop working)" @click.prevent="regenerate"><v-icon size="14" icon="mdi-refresh" /></button>
                  </span>
                </label>
              </div>
              <div v-for="c in commands" :key="c.id" class="cmd">
                <span>{{ c.label }}</span>
                <code>{{ c.id === 'http' && !showToken ? c.text.replace(mcp.token, '•••') : c.text }}</code>
                <button class="btn" @click="copy(c.id, c.text)"><v-icon size="13" :icon="copied === c.id ? 'mdi-check' : 'mdi-content-copy'" /> {{ copied === c.id ? 'Copied' : 'Copy' }}</button>
              </div>
              <p class="help">More than one SSB with MCP on (several tracks in a DAW): each takes the next free port; <code>ssb-mcp</code> talks to the newest (<code>--list</code>, <code>--port N</code> to choose).</p>
              <div v-if="mcpStatus.activity.length" class="activity">
                <div v-for="(a, k) in mcpStatus.activity.slice(0, 8)" :key="k" :class="{ bad: !a.ok }">
                  <v-icon size="12" :icon="a.ok ? 'mdi-check' : 'mdi-close'" /> {{ a.tool }} <span>{{ a.ms }} ms · {{ ago(a.at) }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- the conversation -->
        <section v-else class="chat">
          <div ref="listEl" class="messages selectable">
            <div v-if="!items.length" class="welcome">
              <span class="mark big"><v-icon size="22" icon="mdi-creation" /></span>
              <h4>What should we make?</h4>
              <p>
                Describe a sound or ask about a patch. The agent finds waves; reads, makes, changes and deletes patches; renders notes to study their
                waveform and spectrogram; and can generate audio with the sound model chosen in a VCO's ☰ menu.
              </p>
              <div class="starters">
                <button v-for="s in STARTERS" :key="s" class="starter" :disabled="!ai.configured" @click="send(s)">{{ s }}</button>
              </div>
              <p v-if="!ai.configured" class="err">Set up a model provider first: <a href="#" @click.prevent="showSettings = true">open Settings</a>.</p>
            </div>
            <template v-for="(it, i) in items" :key="i">
              <div v-if="it.kind === 'user'" class="msg user">
                <div class="text">{{ it.text }}</div>
                <button
                  v-if="ai.pinnable"
                  class="pin"
                  :class="{ on: ai.pins.has(it.msg) }"
                  :title="ai.pins.has(it.msg) ? 'A cache checkpoint: everything up to here stays cached between requests. Click to unpin.' : 'Pin as a cache checkpoint (at most two): keeps the conversation up to here cached, cheaper and faster to continue'"
                  @click="ai.togglePin(it.msg)"
                >
                  <v-icon size="13" :icon="ai.pins.has(it.msg) ? 'mdi-pin' : 'mdi-pin-outline'" />
                </button>
              </div>
              <div v-else-if="it.kind === 'assistant'" class="msg assistant" :class="{ streaming: it.streaming, bare: !it.text && !it.thinking && !it.streaming }">
                <details v-if="it.thinking" class="thinking">
                  <summary>Thinking</summary>
                  <div class="text">{{ it.thinking }}</div>
                </details>
                <!-- eslint-disable-next-line vue/no-v-html -- escaped by md() -->
                <div v-if="it.text" class="text" v-html="md(it.text)" />
                <div v-if="it.streaming && !it.text" class="dots"><i /><i /><i /></div>
                <small v-if="it.usage" class="turn-usage">{{ usageLine(it.usage) }}</small>
              </div>
              <details v-else-if="it.kind === 'tool'" class="tool" :class="it.status" :open="it.status === 'error'">
                <summary>
                  <v-icon size="13" :icon="it.status === 'running' ? 'mdi-loading' : it.status === 'error' ? 'mdi-alert-circle-outline' : 'mdi-check-circle-outline'" :class="{ spin: it.status === 'running' }" />
                  <b>{{ it.name }}</b>
                  <span class="brief">{{ it.output?.split('\n')[0].slice(0, 110) }}</span>
                </summary>
                <pre v-if="it.input" class="io">{{ it.input }}</pre>
                <pre v-if="it.output" class="io out">{{ it.output }}</pre>
              </details>
              <div v-if="it.kind === 'tool' && it.sound && board.byId(it.sound)" class="take">
                <button class="btn" title="Play it (again: stop)" @click="playSound(it.sound)"><v-icon size="13" icon="mdi-play" /> {{ board.byId(it.sound)?.settings.name }}</button>
                <span>Added to Samples</span>
              </div>
              <div v-if="it.kind === 'tool' && it.images?.length" class="images">
                <img v-for="(im, k) in it.images" :key="k" :src="`data:image/png;base64,${im}`" alt="render" title="Click to enlarge" @click="zoom = im" />
              </div>
              <div v-else-if="it.kind === 'note'" class="note" :class="it.level">{{ it.text }}</div>
            </template>
          </div>

          <div v-if="ai.confirming" class="confirm">
            <v-icon size="18" icon="mdi-help-circle-outline" />
            <span>{{ ai.confirming.question }}</span>
            <button class="btn" @click="ai.confirming.resolve(false)">No</button>
            <button class="btn primary" @click="ai.confirming.resolve(true)">Yes</button>
          </div>

          <footer class="composer">
            <textarea
              v-model="draft"
              rows="2"
              :placeholder="ai.running ? 'Working…' : 'Describe a sound, or ask about a patch'"
              spellcheck="false"
              @keydown="onKey"
            />
            <div class="composer-bar">
              <small>Enter to send · Shift+Enter for a new line</small>
              <button v-if="ai.running" class="btn stop" title="Stop" @click="ai.stop()"><v-icon size="15" icon="mdi-stop" /> Stop</button>
              <button v-else class="btn primary" :disabled="!draft.trim()" title="Send (Enter)" @click="send()"><v-icon size="15" icon="mdi-arrow-up" /> Send</button>
            </div>
          </footer>
        </section>
      </div>

      <div v-if="zoom" class="zoom" @click="zoom = null"><img :src="`data:image/png;base64,${zoom}`" alt="render" /></div>
    </div>
  </v-dialog>
</template>

<style scoped>
/* A calm, app-like panel: one sans-serif type scale, quiet surfaces, the theme's primary as the only accent. */
.ai {
  --line: rgba(255, 255, 255, 0.08);
  --line-strong: rgba(255, 255, 255, 0.14);
  --surface: rgba(255, 255, 255, 0.03);
  --surface-hi: rgba(255, 255, 255, 0.06);
  --field: rgba(0, 0, 0, 0.32);
  --accent: var(--c-primary);
  --sans: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  position: relative;
  display: flex;
  flex-direction: column;
  height: min(86vh, 900px);
  border-radius: 12px;
  overflow: hidden;
  font-family: var(--sans);
  font-size: 13px;
  line-height: 1.45;
  color: var(--text);
  background: color-mix(in srgb, var(--panel-lo) 94%, #000);
  border: 1px solid var(--line-strong);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.75);
}
code {
  font-family: var(--mono);
  font-size: 0.92em;
}
/* ── buttons ── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 30px;
  padding: 0 12px;
  border-radius: 7px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
  color: var(--text);
  background: var(--surface-hi);
  border: 1px solid var(--line-strong);
  transition: background 0.12s, border-color 0.12s;
}
.btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}
.btn:disabled {
  opacity: 0.4;
}
.btn.primary {
  color: #06040b;
  background: var(--accent);
  border-color: transparent;
}
.btn.primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 85%, #fff);
}
.btn.ghost {
  background: none;
  border-color: transparent;
  color: var(--text-mute);
}
.btn.ghost:hover,
.btn.ghost.on {
  color: var(--text);
  background: var(--surface-hi);
}
.btn.icon {
  flex: none;
  width: 30px;
  padding: 0;
}
.btn.stop {
  color: #ff8a8a;
  border-color: rgba(255, 138, 138, 0.35);
}
/* ── header ── */
.top {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 14px 12px 18px;
  border-bottom: 1px solid var(--line);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.mark {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
}
.mark.big {
  width: 44px;
  height: 44px;
  border-radius: 12px;
}
h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--text);
}
.sub {
  margin: 0;
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-mute);
}
.badges {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}
.usage {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  color: var(--text-mute);
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 260px;
  height: 22px;
  padding: 0 9px;
  border-radius: 11px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text);
  background: var(--surface-hi);
  border: 1px solid var(--line);
}
.badge i,
.state i {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-mute);
}
.badge.ok i,
.state.on i {
  background: var(--c-success);
}
.badge.busy i,
.state.starting i {
  background: var(--c-secondary);
  animation: blink 1s infinite;
}
.state.error i {
  background: #ff6b6b;
}
.tools {
  display: flex;
  gap: 4px;
}
@keyframes blink {
  50% {
    opacity: 0.3;
  }
}
/* ── layout ── */
.body {
  flex: 1;
  min-height: 0;
  display: flex;
}
/* ── conversations ── */
.convos {
  flex: 0 0 236px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  padding: 12px 10px;
  border-right: 1px solid var(--line);
  background: rgba(0, 0, 0, 0.18);
}
.new {
  width: 100%;
}
.group {
  margin: 6px 6px 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-mute);
}
.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
  scrollbar-width: thin;
}
.convo {
  position: relative;
  display: grid;
  grid-template-columns: 18px 1fr 18px;
  grid-template-rows: auto auto;
  gap: 1px 6px;
  padding: 7px 8px;
  border-radius: 7px;
  cursor: pointer;
}
.convo:hover {
  background: var(--surface);
}
.convo.on {
  background: var(--surface-hi);
  box-shadow: inset 2px 0 0 var(--accent);
}
.convo .star,
.convo .del {
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-mute);
}
.convo .star {
  grid-row: 1 / 3;
  align-self: start;
  margin-top: 1px;
}
.convo .star.on {
  color: #ffc23d;
}
.convo .title,
.convo .rename {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font: inherit;
  font-size: 13px;
  color: var(--text);
}
.convo .rename {
  padding: 0 4px;
  border-radius: 4px;
  background: var(--field);
  border: 1px solid var(--accent);
  outline: none;
}
.convo small {
  grid-column: 2 / 4;
  font-size: 11px;
  color: var(--text-mute);
}
.convo .del {
  opacity: 0;
}
.convo:hover .del {
  opacity: 0.8;
}
.convo .del:hover {
  color: #ff8a8a;
}
.empty {
  margin: 8px 6px;
  font-size: 12px;
  color: var(--text-mute);
}
.err {
  margin: 4px 0;
  font-size: 12px;
  color: #ff7b7b;
}
.err a {
  color: inherit;
}
.help {
  margin: 0;
  font-size: 12px;
  color: var(--text-mute);
}
/* ── settings ── */
.settings {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}
.page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 760px;
  margin: 0 auto;
  padding: 20px 24px 28px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--line);
}
.card h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.card-head p,
.card.slim p {
  margin: 3px 0 0;
  font-size: 12.5px;
  color: var(--text-mute);
}
.card-head.with-action {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.card.slim {
  flex-direction: row;
  align-items: flex-start;
  gap: 12px;
}
.card.slim .lead {
  margin-top: 1px;
  color: var(--accent);
}
.card.slim b {
  color: var(--text);
}
.card-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.result {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--c-success);
}
.result.err {
  margin: 0;
  color: #ff7b7b;
}
.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  align-self: flex-start;
  padding: 3px;
  border-radius: 8px;
  background: var(--field);
  border: 1px solid var(--line);
}
.seg button {
  height: 26px;
  padding: 0 14px;
  border-radius: 6px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-mute);
  background: none;
  border: 0;
}
.seg button:hover {
  color: var(--text);
}
.seg button.on {
  color: var(--text);
  background: var(--surface-hi);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.4),
    inset 0 0 0 1px var(--line-strong);
}
.fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px 14px;
}
.fields.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.field.wide {
  grid-column: 1 / -1;
}
.field > span:first-child {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-mute);
}
.settings input:not([type='checkbox']),
.settings select,
.composer textarea {
  min-width: 0;
  font: inherit;
  font-size: 13px;
  color: var(--text);
  background: var(--field);
  border: 1px solid var(--line-strong);
  outline: none;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.settings input:not([type='checkbox']),
.settings select {
  height: 32px;
  padding: 0 10px;
  border-radius: 7px;
}
.settings input:focus,
.settings select:focus {
  border-color: color-mix(in srgb, var(--accent) 65%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
}
.settings select option {
  color: #000;
}
.row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.row input {
  flex: 1;
}
.checks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
}
.check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text);
  cursor: pointer;
}
.check input,
.switch input {
  accent-color: var(--accent);
}
.state {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 12.5px;
  color: var(--text-mute);
}
.state.on {
  color: var(--text);
}
.state.error {
  color: #ff7b7b;
}
.cmd {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 5px 8px;
  align-items: center;
}
.cmd span {
  grid-column: 1 / -1;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-mute);
}
.cmd code {
  padding: 7px 10px;
  border-radius: 7px;
  font-size: 12px;
  color: var(--text);
  background: var(--field);
  border: 1px solid var(--line);
  overflow-wrap: anywhere;
}
.help code,
.card-head code {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--field);
}
.activity {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 7px;
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--c-success);
  background: var(--field);
}
.activity span {
  color: var(--text-mute);
}
.activity .bad {
  color: #ff8a8a;
}
/* an on/off switch */
.switch {
  position: relative;
  flex: none;
  display: inline-block;
  width: 36px;
  height: 20px;
  cursor: pointer;
}
.switch.disabled {
  opacity: 0.4;
  cursor: default;
}
.switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.switch span {
  position: absolute;
  inset: 0;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.16);
  transition: background 0.15s;
}
.switch span::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  transition: transform 0.15s;
}
.switch input:checked + span {
  background: var(--c-success);
}
.switch input:checked + span::after {
  transform: translateX(16px);
}
/* ── the conversation ── */
.chat {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 20px max(20px, calc((100% - 780px) / 2));
  scrollbar-width: thin;
}
.welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin: auto 0;
  padding: 20px 0;
  text-align: center;
}
.welcome h4 {
  margin: 4px 0 0;
  font-size: 18px;
  font-weight: 600;
}
.welcome > p {
  max-width: 560px;
  margin: 0;
  font-size: 13px;
  color: var(--text-mute);
}
.starters {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px;
  width: 100%;
  margin-top: 10px;
}
.starter {
  padding: 10px 12px;
  border-radius: 9px;
  font: inherit;
  font-size: 12.5px;
  text-align: left;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--line);
  transition: background 0.12s, border-color 0.12s;
}
.starter:hover:not(:disabled) {
  background: var(--surface-hi);
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
}
.starter:disabled {
  opacity: 0.4;
}
.msg {
  position: relative;
  max-width: 85%;
  font-size: 13.5px;
  line-height: 1.55;
}
.msg .text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.msg.user {
  align-self: flex-end;
  padding: 8px 32px 8px 13px;
  border-radius: 12px 12px 3px 12px;
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
}
.msg.assistant {
  align-self: flex-start;
  max-width: 100%;
  padding: 2px 2px;
  color: var(--text);
}
.msg.assistant :deep(code) {
  padding: 1px 5px;
  border-radius: 4px;
  font-family: var(--mono);
  font-size: 0.9em;
  background: var(--surface-hi);
}
.msg.assistant :deep(b) {
  font-weight: 600;
}
.msg.assistant :deep(.h) {
  display: inline-block;
  margin-top: 4px;
  font-size: 14px;
}
.pin {
  position: absolute;
  top: 6px;
  right: 6px;
  display: grid;
  place-items: center;
  padding: 2px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--text-mute);
  opacity: 0.6;
}
.msg.user:hover .pin,
.pin.on {
  opacity: 1;
}
.pin.on {
  color: var(--accent);
}
.thinking {
  margin-bottom: 6px;
}
.thinking summary {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-mute);
  cursor: pointer;
}
.thinking .text {
  margin: 4px 0 0;
  padding-left: 10px;
  font-size: 12.5px;
  color: var(--text-mute);
  border-left: 2px solid var(--line-strong);
}
.dots {
  display: flex;
  gap: 4px;
  padding: 6px 0;
}
.dots i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-mute);
  animation: blink 1.2s infinite;
}
.dots i:nth-child(2) {
  animation-delay: 0.2s;
}
.dots i:nth-child(3) {
  animation-delay: 0.4s;
}
/* a turn that only called tools: just its usage, quietly */
.msg.assistant.bare {
  padding: 0;
}
.turn-usage {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-mute);
}
.tool {
  align-self: flex-start;
  max-width: 100%;
  min-width: min(420px, 100%);
  border-radius: 8px;
  font-size: 12.5px;
  color: var(--text-mute);
  background: var(--surface);
  border: 1px solid var(--line);
}
.tool summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  list-style: none;
  white-space: nowrap;
  overflow: hidden;
}
.tool summary::-webkit-details-marker {
  display: none;
}
.tool summary .v-icon {
  color: var(--c-success);
}
.tool.running summary .v-icon {
  color: var(--c-secondary);
}
.tool.error summary .v-icon {
  color: #ff7b7b;
}
.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.tool b {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
}
.tool .brief {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.io {
  max-height: 220px;
  overflow: auto;
  margin: 0;
  padding: 8px 10px;
  font-family: var(--mono);
  font-size: 11.5px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  border-top: 1px solid var(--line);
  background: rgba(0, 0, 0, 0.25);
}
.io.out {
  color: var(--text);
}
.take {
  display: flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  font-size: 12px;
  color: var(--text-mute);
}
.images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-self: flex-start;
}
.images img {
  width: 300px;
  max-width: 100%;
  border-radius: 8px;
  border: 1px solid var(--line-strong);
  cursor: zoom-in;
}
.note {
  align-self: center;
  padding: 3px 12px;
  border-radius: 11px;
  font-size: 12px;
  color: var(--text-mute);
  background: var(--surface);
}
.note.error {
  color: #ff8a8a;
}
.confirm {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 max(20px, calc((100% - 780px) / 2)) 10px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  color: var(--text);
  background: color-mix(in srgb, var(--c-secondary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--c-secondary) 35%, transparent);
}
.confirm .v-icon {
  color: var(--c-secondary);
}
.confirm span {
  flex: 1;
}
.composer {
  margin: 0 max(20px, calc((100% - 780px) / 2)) 16px;
  border-radius: 12px;
  background: var(--field);
  border: 1px solid var(--line-strong);
  transition: border-color 0.12s, box-shadow 0.12s;
}
.composer:focus-within {
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent);
}
.composer textarea {
  display: block;
  width: 100%;
  padding: 12px 14px 4px;
  font-size: 13.5px;
  resize: none;
  background: none;
  border: 0;
  box-shadow: none;
}
.composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px 8px 14px;
}
.composer-bar small {
  font-size: 11px;
  color: var(--text-mute);
}
.zoom {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.85);
  cursor: zoom-out;
}
.zoom img {
  max-width: 96%;
  max-height: 96%;
  border-radius: 8px;
}
@media (max-width: 760px) {
  .convos,
  .usage {
    display: none;
  }
  .fields.two {
    grid-template-columns: 1fr;
  }
}
</style>
