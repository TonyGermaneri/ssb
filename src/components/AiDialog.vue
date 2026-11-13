<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useAi, type Item } from '../lib/ai/store'
import { PROVIDERS, type Effort, type ProviderKind } from '../lib/ai/types'
import { downloadBytes, fmtBytes, SOUND_MODELS } from '../lib/ai/soundModels'
import ComboBox from './ComboBox.vue'
import { useBoard } from '../stores/board'
import { preview } from '../audio/engine'
import { mcpSaved, mcpStatus } from '../lib/ai/mcpStatus'
import { newMcpToken, setMcp, setMcpPort } from '../lib/ai/mcpHost'
import { inNative } from '../native/bridge'

/**
 * The AI patch maker: a conversation with a model that makes, changes, studies and tidies the board's patches with
 * tools (lib/ai/tools.ts), its saved conversations (★ keeps one), and its settings.
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
  // the sound models are the app's and the plugin's
  ...(ai.soundAvailable
    ? ['Generate a deep sci-fi door whoosh with the sound model and put it on the board.', 'Make a rainy-night ambience with the sound model, then build a slow evolving pad patch around it.']
    : []),
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
    testing.value = `✗ ${e instanceof Error ? e.message : String(e)}`
  }
}
const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

// ── the sound models (make_sound): the SSB app or plugin runs them natively (none in a browser tab) ──
const sound = computed(() => ai.soundStatus)
const pick = computed(() => ai.soundPick)
const labelOf = (id?: string) => (id ? (SOUND_MODELS.find((m) => m.id === id)?.label ?? (pick.value?.id === id ? pick.value.label : id)) : '')
const soundOptions = SOUND_MODELS.map((m) => ({
  value: m.id,
  label: m.label,
  detail: `${fmtBytes(downloadBytes(m))} · ${m.channels === 2 ? 'stereo' : 'mono'}${m.gated ? ' · token' : ''}`,
}))
const showHfToken = ref(false)
const confirmDownload = ref(false)
const testingSound = ref('')
const soundLoaded = computed(() => !!pick.value && sound.value?.loaded?.id === pick.value.id)
/** what LOAD would download (0: it's here; null: unknown) */
const toDownload = computed(() => {
  const c = ai.soundCheck
  if (c && c.id === pick.value?.id) return c.downloaded ? 0 : c.missing || (pick.value ? downloadBytes(pick.value) : 0) || null
  return pick.value ? downloadBytes(pick.value) || null : null
})
const taskLine = computed(() => {
  const t = sound.value?.task
  if (!t) return ''
  const who = labelOf(t.model)
  const pct = t.progress == null ? '' : ` · ${Math.round(t.progress * 100)} %`
  if (t.kind === 'download') return `Downloading ${who}: ${fmtBytes(t.done)} of ${t.total ? fmtBytes(t.total) : '?'}${pct}`
  if (t.kind === 'load') return `Loading ${who}… ${Math.round(t.elapsed)} s`
  return `Generating with ${who}… ${Math.round(t.elapsed)} s`
})
function loadSound() {
  confirmDownload.value = false
  if (toDownload.value !== 0 && !soundLoaded.value) return void (confirmDownload.value = true)
  void ai.loadSound()
}
function downloadAndLoad() {
  confirmDownload.value = false
  void ai.loadSound()
}
watch(() => pick.value?.id, () => ((confirmDownload.value = false), (testingSound.value = '')))
/** a clip, played where the board plays (in the plugin: the DAW's track) */
function playClip(channels: Float32Array[], rate: number) {
  const buf = new AudioBuffer({ numberOfChannels: channels.length, length: channels[0].length, sampleRate: rate })
  channels.forEach((c, i) => buf.getChannelData(i).set(c))
  preview(buf, 1, Math.max(0.1, buf.duration - 0.1))
}
async function testSound() {
  testingSound.value = 'Generating a short clip…'
  try {
    const t = await ai.testSound(pick.value?.tag === 'stable-audio' ? 'a single bright synth stab, short decay' : 'a short glass clink, close and dry')
    testingSound.value = `✓ ${t.text}`
    playClip(t.channels, t.rate)
  } catch (e) {
    testingSound.value = `✗ ${e instanceof Error ? e.message : String(e)}`
  }
}
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
  { id: 'stdio', label: 'CLAUDE CODE · STDIO', text: `claude mcp add ssb -- "${cliPath.value}"` },
  { id: 'http', label: 'CLAUDE CODE · HTTP', text: `claude mcp add --transport http ssb ${mcpUrl.value} --header "Authorization: Bearer ${mcp.value.token}"` },
  { id: 'json', label: 'JSON (CLAUDE DESKTOP, CURSOR, …)', text: JSON.stringify({ mcpServers: { ssb: { command: cliPath.value } } }) },
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
      <header>
        <v-icon icon="mdi-creation" color="primary" />
        <h3>AI PATCH MAKER</h3>
        <span class="chip on" :title="`Conversations stay with the provider and model they began with`">{{ providerName }} · {{ modelName || 'no model' }}</span>
        <span v-if="totals" class="usage" title="This conversation: input at full price · read from / written to the prompt cache · output">{{ totals }}</span>
        <button v-if="mcpStatus.state === 'on'" class="chip on mcp-chip" :title="`MCP server on at ${mcpStatus.url}: agents outside SSB can use these tools`" @click="showSettings = true">
          <i class="led" /> MCP
        </button>
        <button
          v-if="sound?.loaded || sound?.task"
          class="chip on mcp-chip"
          :class="{ busy: !!sound?.task }"
          :title="sound?.task ? taskLine : `Sound model loaded (${sound?.backend}): the agent generates audio with it`"
          @click="showSettings = true"
        >
          <i class="led" /> ♪ {{ sound?.task ? sound.task.kind.toUpperCase() + (sound.task.progress != null ? ` ${Math.round(sound.task.progress * 100)}%` : '…') : sound?.loaded?.label }}
        </button>
        <v-spacer />
        <button class="hw-btn icon" :class="{ lit: showSettings }" title="Settings: provider, key, model" @click="showSettings = !showSettings">
          <v-icon size="16" icon="mdi-cog" />
        </button>
        <button class="hw-btn icon" title="Close (a running request carries on)" @click="open = false"><v-icon size="16" icon="mdi-close" /></button>
      </header>

      <div class="body">
        <!-- saved conversations: starred first -->
        <aside class="convos">
          <button class="hw-btn new" :disabled="ai.running" @click="ai.newConversation()"><v-icon size="14" icon="mdi-plus" /> NEW</button>
          <div
            v-for="c in [...ai.list].sort((a, b) => Number(b.starred) - Number(a.starred) || b.updated - a.updated)"
            :key="c.id"
            class="convo"
            :class="{ on: ai.current?.id === c.id }"
            @click="ai.open(c.id)"
          >
            <button class="star" :class="{ on: c.starred }" :title="c.starred ? 'Starred: kept for good' : 'Star it to keep it (unstarred ones go after 30)'" @click.stop="ai.toggleStar(c.id)">
              {{ c.starred ? '★' : '☆' }}
            </button>
            <input v-if="renaming === c.id" v-model="renameText" class="rename" @click.stop @keydown.enter="finishRename" @blur="finishRename" />
            <span v-else class="title" :title="`${c.title} — double-click to rename`" @dblclick.stop="startRename(c.id, c.title)">{{ c.title }}</span>
            <small>{{ PROVIDERS[c.provider].label }} · {{ when(c.updated) }}</small>
            <button class="del" title="Delete this conversation" @click.stop="ai.remove(c.id)">✕</button>
          </div>
          <p v-if="!ai.list.length" class="empty">Conversations are kept here. ★ keeps one for good.</p>
        </aside>

        <!-- settings -->
        <section v-if="showSettings" class="settings">
          <h4>PROVIDER</h4>
          <div class="seg">
            <button v-for="(p, k) in PROVIDERS" :key="k" :class="{ on: ai.settings.provider === k }" @click="ai.switchProvider(k)">{{ p.label }}</button>
          </div>
          <p class="hint">{{ PROVIDERS[ai.settings.provider].hint }}</p>
          <label>ENDPOINT <input v-model.trim="ai.settings.endpoint" spellcheck="false" :placeholder="PROVIDERS[ai.settings.provider].endpoint" /></label>
          <label>
            API KEY{{ PROVIDERS[ai.settings.provider].needsKey ? '' : ' (usually none)' }}
            <span class="row">
              <input v-model.trim="ai.settings.apiKey" :type="showKey ? 'text' : 'password'" spellcheck="false" autocomplete="off" placeholder="kept on this computer only" />
              <button class="hw-btn icon" :title="showKey ? 'Hide' : 'Show'" @click="showKey = !showKey"><v-icon size="14" :icon="showKey ? 'mdi-eye-off' : 'mdi-eye'" /></button>
            </span>
          </label>
          <label>
            MODEL
            <span class="row">
              <input v-model.trim="ai.settings.model" list="ai-models" spellcheck="false" :placeholder="PROVIDERS[ai.settings.provider].model || 'fetch the list →'" />
              <datalist id="ai-models"><option v-for="m in ai.models" :key="m" :value="m" /></datalist>
              <button class="hw-btn" title="Ask the provider which models this key can use" @click="ai.fetchModels()">LIST</button>
            </span>
          </label>
          <p v-if="ai.modelsError" class="err">{{ ai.modelsError }}</p>
          <p v-else-if="ai.models.length" class="hint">{{ ai.models.length }} models: pick one in the field.</p>
          <div class="grid">
            <label>MAX TOKENS <input v-model.number="ai.settings.maxTokens" type="number" min="1000" max="128000" step="1000" /></label>
            <template v-if="ai.settings.provider === 'anthropic'">
              <label>
                EFFORT
                <select v-model="ai.settings.effort"><option v-for="e in EFFORTS" :key="e" :value="e">{{ e }}</option></select>
              </label>
              <label>
                THINKING
                <select v-model="ai.settings.thinking"><option value="summarized">show a summary</option><option value="omitted">hidden</option></select>
              </label>
              <label title="How long the cached instructions, tools and pinned turns live between requests: 1 hour costs more to write, pays off when you pause for longer than 5 minutes">
                CACHE
                <select v-model="ai.settings.cacheTtl"><option value="5m">5 minutes</option><option value="1h">1 hour</option></select>
              </label>
              <label class="check" title="If the model declines a request, the API retries it on a fallback model"><input v-model="ai.settings.fallback" type="checkbox" /> REFUSAL FALLBACK</label>
            </template>
            <template v-else>
              <label>
                TEMPERATURE
                <input
                  :value="ai.settings.temperature ?? ''"
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  placeholder="default"
                  @input="(e) => (ai.settings.temperature = (e.target as HTMLInputElement).value === '' ? null : Number((e.target as HTMLInputElement).value))"
                />
              </label>
              <label v-if="ai.settings.provider === 'openai'">
                REASONING
                <select v-model="ai.settings.reasoningEffort"><option value="">default</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select>
              </label>
            </template>
            <label class="check"><input v-model="ai.settings.confirmDeletes" type="checkbox" /> ASK BEFORE DELETING</label>
          </div>
          <div class="row">
            <button class="hw-btn" :disabled="!ai.configured" @click="test">TEST</button>
            <button class="hw-btn lit" @click="showSettings = false">DONE</button>
            <span class="test" :class="{ err: testing.startsWith('✗') }">{{ testing }}</span>
          </div>
          <p class="hint">
            Keys stay in this computer's browser storage: never in the board, its exports, or a plugin's saved session. Conversations keep the provider and model they began with.
          </p>

          <h4 class="mcp-head">SOUND MODEL</h4>
          <p class="hint">
            A text-to-audio model the agent briefs to generate sound effects, ambiences, loops and notes, which land on the board as samples for its
            patches. SSB runs it on this computer (audio.cpp, on the GPU), one at a time; the agent can load or switch models itself, and asks before
            anything downloads.
          </p>
          <p v-if="!ai.soundAvailable" class="mcp-state">Needs the SSB app or plugin: a browser tab can't run a model.</p>
          <template v-else>
            <p v-if="sound && !sound.available" class="err">This build of SSB doesn't carry the sound model helper.</p>
            <label>
              MODEL (PICK ONE, OR PASTE A GGUF'S HUGGING FACE URL)
              <ComboBox v-model="ai.settings.sound.model" :options="soundOptions" placeholder="huggingface.co/org/repo/blob/main/model.gguf" />
            </label>
            <template v-if="pick">
              <p class="hint">
                <a :href="pick.url" target="_blank" rel="noopener">{{ pick.url.replace('https://', '') }}</a> · {{ pick.channels === 2 ? 'stereo' : 'mono' }}
                {{ pick.sampleRate / 1000 }} kHz · up to {{ pick.maxSeconds }} s · {{ pick.license }}<template v-if="pick.custom"> · a custom GGUF: a MOSS-SoundEffect or Stable Audio model for audio.cpp</template>
              </p>
              <p v-if="soundLoaded" class="test">✓ Loaded ({{ sound?.backend }}, {{ sound?.loaded?.loadSeconds?.toFixed(0) }} s to load).</p>
              <p v-else-if="toDownload !== 0" class="warn">
                ⚠ Loading it downloads <b>{{ toDownload ? fmtBytes(toDownload) : 'a file of unknown size' }}</b> the first time, into SSB's folder on this computer, and it
                takes about {{ pick.memoryGb }} GB of memory while loaded.
              </p>
              <p v-else class="hint">Downloaded: loading it takes a few seconds.</p>
            </template>
            <p v-else-if="ai.settings.sound.model" class="err">Not a model: pick one, or give the Hugging Face URL of a .gguf file.</p>
            <template v-if="pick?.gated">
              <label>
                HUGGING FACE TOKEN
                <span class="row">
                  <input v-model.trim="ai.settings.sound.hfToken" :type="showHfToken ? 'text' : 'password'" spellcheck="false" autocomplete="off" placeholder="hf_… kept on this computer only" />
                  <button class="hw-btn icon" :title="showHfToken ? 'Hide' : 'Show'" @click="showHfToken = !showHfToken"><v-icon size="14" :icon="showHfToken ? 'mdi-eye-off' : 'mdi-eye'" /></button>
                </span>
              </label>
              <p class="hint">
                {{ pick.label }} is gated: sign in to Hugging Face, accept its licence on <a :href="pick.url" target="_blank" rel="noopener">its page</a>, and paste a read token
                from <a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener">huggingface.co/settings/tokens</a>.
              </p>
            </template>
            <div v-if="confirmDownload" class="confirm-dl">
              <v-icon icon="mdi-download" color="secondary" />
              <span>Download {{ toDownload ? fmtBytes(toDownload) : 'it' }} for {{ pick?.label }}? It's once; CANCEL stops it, and it resumes later.</span>
              <button class="hw-btn lit" @click="downloadAndLoad">DOWNLOAD</button>
              <button class="hw-btn" @click="confirmDownload = false">CANCEL</button>
            </div>
            <div class="row">
              <button v-if="!soundLoaded" class="hw-btn" :disabled="!sound?.available || !!sound?.task || !pick" title="Load it (downloading it first if it isn't here)" @click="loadSound">
                {{ toDownload !== 0 ? 'DOWNLOAD + LOAD' : 'LOAD' }}
              </button>
              <button v-if="sound?.loaded" class="hw-btn" :disabled="!!sound.task" title="Free its memory" @click="ai.unloadSound()">UNLOAD</button>
              <button v-if="sound?.task" class="hw-btn" title="Stop the download, load or generation" @click="ai.cancelSound()">CANCEL</button>
              <button v-if="soundLoaded" class="hw-btn" :disabled="!!sound?.task" title="Generate a short clip and play it" @click="testSound">TEST</button>
              <button
                v-if="pick && !soundLoaded && toDownload === 0"
                class="hw-btn"
                :disabled="!!sound?.task"
                title="Delete its downloaded files (it downloads again when loaded)"
                @click="ai.removeSound()"
              >
                DELETE FILES
              </button>
              <span class="test" :class="{ err: testingSound.startsWith('✗') }">{{ taskLine || testingSound }}</span>
            </div>
            <div v-if="sound?.task && sound.task.progress != null" class="bar"><i :style="{ width: `${Math.round(sound.task.progress * 100)}%` }" /></div>
            <p v-if="ai.soundError" class="err">{{ ai.soundError }}</p>
            <p v-else-if="sound?.error && sound.error.message !== 'cancelled'" class="err">{{ labelOf(sound.error.model) }}: {{ sound.error.message }}</p>
          </template>

          <h4 class="mcp-head">MCP SERVER</h4>
          <p class="hint">
            Lets an agent outside SSB (Claude Code, Claude Desktop, Cursor…) use these same tools on this board: over HTTP on this computer, or through
            the <code>ssb-mcp</code> command. Off unless you turn it on; SSB's window (in a DAW, the plugin's editor) must be open while it works.
          </p>
          <div class="row">
            <button class="hw-btn" :class="{ lit: mcpOn }" :disabled="!inNative()" @click="toggleMcp">{{ mcpOn ? 'ON' : 'OFF' }}</button>
            <span class="mcp-state" :class="mcpStatus.state">
              <template v-if="!inNative()">Needs the SSB app or plugin: a browser tab can't open a port.</template>
              <template v-else-if="mcpStatus.state === 'on'">Serving at {{ mcpStatus.url }}</template>
              <template v-else-if="mcpStatus.state === 'starting'">Starting…</template>
              <template v-else-if="mcpStatus.state === 'error'">{{ mcpStatus.error }}</template>
              <template v-else>Off</template>
            </span>
          </div>
          <div class="grid">
            <label>
              PORT
              <input v-model.number="mcp.port" type="number" min="1024" max="65000" @change="applyPort" />
            </label>
            <label>
              TOKEN (HTTP)
              <span class="row">
                <input :value="mcp.token" :type="showToken ? 'text' : 'password'" readonly />
                <button class="hw-btn icon" :title="showToken ? 'Hide' : 'Show'" @click="showToken = !showToken"><v-icon size="14" :icon="showToken ? 'mdi-eye-off' : 'mdi-eye'" /></button>
                <button class="hw-btn icon" title="A new token (clients using the old one stop working)" @click="regenerate"><v-icon size="14" icon="mdi-refresh" /></button>
              </span>
            </label>
          </div>
          <div v-for="c in commands" :key="c.id" class="cmd">
            <span>{{ c.label }}</span>
            <code>{{ c.id === 'http' && !showToken ? c.text.replace(mcp.token, '•••') : c.text }}</code>
            <button class="hw-btn" @click="copy(c.id, c.text)">{{ copied === c.id ? 'COPIED' : 'COPY' }}</button>
          </div>
          <p class="hint">More than one SSB with MCP on (several tracks in a DAW): each takes the next free port; <code>ssb-mcp</code> talks to the newest (<code>--list</code>, <code>--port N</code> to choose).</p>
          <div v-if="mcpStatus.activity.length" class="activity">
            <div v-for="(a, k) in mcpStatus.activity.slice(0, 8)" :key="k" :class="{ bad: !a.ok }">{{ a.ok ? '✓' : '✗' }} {{ a.tool }} · {{ a.ms }} ms · {{ ago(a.at) }}</div>
          </div>
        </section>

        <!-- the conversation -->
        <section v-else class="chat">
          <div ref="listEl" class="messages selectable">
            <div v-if="!items.length" class="welcome">
              <p>Describe a sound, or ask about a patch. The agent can find waves, read, make, change and delete patches, render notes to look at their waveform and spectrogram, and, in the SSB app or plugin, generate sound effects, ambiences, loops and notes with a sound model on this computer (⚙ SOUND MODEL).</p>
              <button v-for="s in STARTERS" :key="s" class="starter" :disabled="!ai.configured" @click="send(s)">{{ s }}</button>
              <p v-if="!ai.configured" class="err">Set up a provider first (⚙).</p>
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
                  <summary>THINKING</summary>
                  <div class="text">{{ it.thinking }}</div>
                </details>
                <!-- eslint-disable-next-line vue/no-v-html -- escaped by md() -->
                <div v-if="it.text" class="text" v-html="md(it.text)" />
                <div v-if="it.streaming && !it.text" class="dots">…</div>
                <small v-if="it.usage" class="turn-usage">{{ usageLine(it.usage) }}</small>
              </div>
              <details v-else-if="it.kind === 'tool'" class="tool" :class="it.status" :open="it.status === 'error'">
                <summary>
                  <v-icon size="13" :icon="it.status === 'running' ? 'mdi-cog-sync' : it.status === 'error' ? 'mdi-alert' : 'mdi-check'" />
                  <b>{{ it.name }}</b>
                  <span class="brief">{{ it.output?.split('\n')[0].slice(0, 110) }}</span>
                </summary>
                <pre v-if="it.input" class="io">{{ it.input }}</pre>
                <pre v-if="it.output" class="io out">{{ it.output }}</pre>
              </details>
              <div v-if="it.kind === 'tool' && it.sound && board.byId(it.sound)" class="take">
                <button class="hw-btn" title="Play it (again: stop)" @click="playSound(it.sound)"><v-icon size="13" icon="mdi-play" /> {{ board.byId(it.sound)?.settings.name }}</button>
                <span>on the board, in SAMPLES</span>
              </div>
              <div v-if="it.kind === 'tool' && it.images?.length" class="images">
                <img v-for="(im, k) in it.images" :key="k" :src="`data:image/png;base64,${im}`" alt="render" title="Click to enlarge" @click="zoom = im" />
              </div>
              <div v-else-if="it.kind === 'note'" class="note" :class="it.level">{{ it.text }}</div>
            </template>
          </div>

          <div v-if="ai.confirming" class="confirm">
            <v-icon icon="mdi-help-circle" color="secondary" />
            <span>{{ ai.confirming.question }}</span>
            <v-spacer />
            <button class="hw-btn lit" @click="ai.confirming.resolve(true)">YES</button>
            <button class="hw-btn" @click="ai.confirming.resolve(false)">NO</button>
          </div>

          <footer>
            <textarea
              v-model="draft"
              rows="2"
              :placeholder="ai.running ? 'Working…' : 'Describe a sound, or ask about a patch (Enter sends, Shift+Enter: new line)'"
              spellcheck="false"
              @keydown="onKey"
            />
            <button v-if="ai.running" class="hw-btn send stop" title="Stop" @click="ai.stop()"><v-icon size="16" icon="mdi-stop" /> STOP</button>
            <button v-else class="hw-btn send lit" :disabled="!draft.trim()" title="Send (Enter)" @click="send()"><v-icon size="16" icon="mdi-send" /> SEND</button>
          </footer>
        </section>
      </div>

      <div v-if="zoom" class="zoom" @click="zoom = null"><img :src="`data:image/png;base64,${zoom}`" alt="render" /></div>
    </div>
  </v-dialog>
</template>

<style scoped>
.ai {
  display: flex;
  flex-direction: column;
  height: min(86vh, 900px);
  padding: 10px 12px;
  border-radius: 8px;
  color: var(--text);
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.015) 0 1px, transparent 1px 3px),
    linear-gradient(180deg, var(--panel-hi) 0%, var(--panel-lo) 100%);
  border: 1px solid #000;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.8),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  position: relative;
}
header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
h3 {
  margin: 0;
  font-family: 'Orbitron', sans-serif;
  font-weight: 900;
  font-size: 15px;
  letter-spacing: 0.18em;
  color: var(--c-primary);
  text-shadow: 0 0 8px color-mix(in srgb, var(--c-primary) 50%, transparent);
}
.chip {
  padding: 1px 8px;
  border-radius: 2px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: var(--ink-dim);
  background: #111;
  border: 1px solid #000;
  max-width: 340px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip.on {
  color: var(--c-secondary);
}
.usage {
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: var(--text-mute);
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}
/* ── conversations ── */
.convos {
  flex: 0 0 210px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
  scrollbar-width: thin;
}
.convo {
  position: relative;
  display: grid;
  grid-template-columns: 16px 1fr 14px;
  grid-template-rows: auto auto;
  gap: 0 4px;
  padding: 4px 6px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid transparent;
  cursor: pointer;
}
.convo.on {
  border-color: color-mix(in srgb, var(--c-primary) 50%, transparent);
  background: rgba(0, 0, 0, 0.45);
}
.convo .star {
  grid-row: 1 / 3;
  align-self: start;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-mute);
  font-size: 14px;
  line-height: 16px;
}
.convo .star.on {
  color: #ffc23d;
  text-shadow: 0 0 5px rgba(255, 194, 61, 0.6);
}
.convo .title,
.convo .rename {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'VT323', monospace;
  font-size: 15px;
  line-height: 16px;
  color: var(--ink-dim);
}
.convo .rename {
  color: var(--c-primary);
  background: var(--lcd-bg);
  border: 1px solid #000;
  outline: none;
}
.convo small {
  grid-column: 2 / 4;
  font-family: 'VT323', monospace;
  font-size: 12px;
  color: var(--text-mute);
}
.convo .del {
  padding: 0;
  border: 0;
  background: none;
  color: var(--text-mute);
  font-size: 11px;
  opacity: 0;
}
.convo:hover .del {
  opacity: 1;
}
.new {
  justify-content: center;
}
.empty,
.hint {
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: var(--text-mute);
  margin: 4px 0;
}
.err {
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: #ff6b6b;
  margin: 4px 0;
}
/* ── settings ── */
.settings {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 6px 12px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.2);
}
.settings h4 {
  margin: 4px 0;
  font-family: 'Orbitron', sans-serif;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.18em;
  color: var(--text-head);
}
.seg {
  display: flex;
  gap: 4px;
}
.seg button {
  padding: 3px 14px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 17px;
  color: var(--ink-mute);
  background: #111;
  border: 1px solid #000;
}
.seg button.on {
  color: var(--c-secondary);
  text-shadow: 0 0 5px color-mix(in srgb, var(--c-secondary) 70%, transparent);
}
.settings label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 8px 0;
  font-family: 'Orbitron', sans-serif;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.15em;
  color: var(--text-head);
}
.settings label.check {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}
.settings input:not([type='checkbox']),
.settings select,
textarea {
  font-family: 'VT323', monospace;
  font-size: 17px;
  letter-spacing: 0.02em;
  padding: 2px 8px;
  border-radius: 3px;
  color: var(--c-primary);
  background: var(--lcd-bg);
  border: 1px solid #000;
  outline: none;
  min-width: 0;
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
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 0 12px;
}
.mcp-head {
  margin-top: 14px !important;
}
.mcp-state {
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: var(--text-mute);
}
.mcp-state.on {
  color: var(--c-success);
}
.mcp-state.error {
  color: #ff6b6b;
}
.cmd {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 6px;
  align-items: center;
  margin: 6px 0;
}
.cmd span {
  grid-column: 1 / -1;
  font-family: 'Orbitron', sans-serif;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.15em;
  color: var(--text-head);
}
.cmd code,
.settings .hint code {
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: var(--c-secondary);
  overflow-wrap: anywhere;
}
.cmd code {
  padding: 2px 6px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.4);
}
.activity {
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: var(--c-success);
}
.activity .bad {
  color: #ff8a8a;
}
.mcp-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.mcp-chip .led {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c-success);
  box-shadow: 0 0 5px var(--c-success);
}
.warn {
  margin: 4px 0;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: #ffc46b;
}
.warn b {
  color: #ffd99a;
}
.settings .hint a {
  color: var(--c-secondary);
}
.confirm-dl {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
  padding: 6px 8px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: var(--ink);
  background: rgba(255, 196, 107, 0.08);
  border: 1px solid rgba(255, 196, 107, 0.35);
}
.confirm-dl span {
  flex: 1;
}
.bar {
  height: 4px;
  margin: 6px 0;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.5);
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: var(--c-secondary);
  box-shadow: 0 0 6px var(--c-secondary);
  transition: width 0.4s;
}
.mcp-chip.busy .led {
  background: var(--c-secondary);
  box-shadow: 0 0 5px var(--c-secondary);
  animation: blink 1s infinite;
}
@keyframes blink {
  50% {
    opacity: 0.3;
  }
}
.test {
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: var(--c-success);
}
.test.err {
  color: #ff6b6b;
}
/* ── the conversation ── */
.chat {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.3);
  box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.6);
  scrollbar-width: thin;
}
.welcome {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 10px;
  font-family: 'VT323', monospace;
  font-size: 17px;
  color: var(--ink-dim);
}
.starter {
  padding: 3px 10px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 16px;
  text-align: left;
  color: var(--c-secondary);
  background: #111;
  border: 1px solid #000;
}
.starter:hover:not(:disabled) {
  color: var(--c-primary);
}
.starter:disabled {
  opacity: 0.4;
}
.msg {
  position: relative;
  max-width: 88%;
  padding: 5px 10px;
  border-radius: 6px;
  font-family: 'VT323', monospace;
  font-size: 17px;
  line-height: 19px;
}
.msg .text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.msg.user {
  align-self: flex-end;
  padding-right: 26px;
  color: #000;
  background: color-mix(in srgb, var(--c-primary) 85%, #fff);
}
.msg.assistant {
  align-self: flex-start;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.msg.assistant :deep(code) {
  padding: 0 3px;
  border-radius: 2px;
  color: var(--c-secondary);
  background: rgba(0, 0, 0, 0.4);
}
.msg.assistant :deep(.h) {
  color: var(--c-primary);
}
.pin {
  position: absolute;
  top: 3px;
  right: 3px;
  padding: 1px;
  border: 0;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.15);
  color: rgba(0, 0, 0, 0.55);
}
.pin.on {
  color: #000;
  background: rgba(255, 255, 255, 0.6);
}
.thinking summary {
  font-family: 'Orbitron', sans-serif;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.15em;
  color: var(--text-mute);
  cursor: pointer;
}
.thinking .text {
  color: var(--text-mute);
  font-size: 15px;
  line-height: 16px;
  margin-bottom: 4px;
}
.dots {
  color: var(--text-mute);
  animation: blink 1s steps(2) infinite;
}
@keyframes blink {
  50% {
    opacity: 0.2;
  }
}
/* a turn that only called tools: just its usage, quietly */
.msg.assistant.bare {
  padding: 0 4px;
  background: none;
  border: 0;
}
.msg.assistant.bare .turn-usage {
  margin: 0;
}
.turn-usage {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-mute);
}
.tool {
  align-self: flex-start;
  max-width: 92%;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: var(--ink-dim);
  background: rgba(0, 0, 0, 0.35);
  border-left: 2px solid var(--c-success);
}
.tool.running {
  border-left-color: var(--c-secondary);
}
.tool.error {
  border-left-color: #ff6b6b;
}
.tool summary {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  list-style: none;
  white-space: nowrap;
  overflow: hidden;
}
.tool b {
  font-weight: 400;
  color: var(--c-secondary);
}
.tool .brief {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-mute);
}
.io {
  max-height: 220px;
  overflow: auto;
  margin: 3px 0;
  padding: 4px 6px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 14px;
  line-height: 15px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: rgba(0, 0, 0, 0.35);
}
.io.out {
  color: var(--ink);
}
.take {
  display: flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: var(--text-faint);
}
.take .hw-btn {
  gap: 4px;
}
.images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-self: flex-start;
}
.images img {
  width: 300px;
  max-width: 100%;
  border-radius: 3px;
  border: 1px solid #000;
  cursor: zoom-in;
}
.note {
  align-self: center;
  padding: 2px 10px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: var(--text-mute);
  background: rgba(0, 0, 0, 0.3);
}
.note.error {
  color: #ff8a8a;
}
.confirm {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  font-family: 'VT323', monospace;
  font-size: 18px;
  color: var(--c-secondary);
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid color-mix(in srgb, var(--c-secondary) 50%, transparent);
}
footer {
  display: flex;
  gap: 6px;
  align-items: stretch;
}
textarea {
  flex: 1;
  resize: none;
  font-size: 18px;
}
.send {
  flex: none;
  min-width: 90px;
  justify-content: center;
}
.stop {
  color: #ff8a8a;
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
}
@media (max-width: 760px) {
  .convos {
    display: none;
  }
}
</style>
