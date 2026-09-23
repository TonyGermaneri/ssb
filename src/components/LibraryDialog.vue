<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useBoard } from '../stores/board'
import type { PathFile } from '../lib/dropFiles'
import {
  dirtBank, fromUrl, gmFamily, gmInstrument, GM_SETS, listDirtBanks, listGm, listSfzRepos, repoTree, repoSfz, sfzDownloadSize,
  type GmSet, type Repo, type RepoTree,
} from '../lib/library'

const board = useBoard()
const open = defineModel<boolean>({ required: true })

type Tab = 'sfz' | 'gm' | 'drums' | 'url'
const tab = ref<Tab>('sfz')
const query = ref('')
const error = ref('')
const busy = ref<{ label: string; done: number; total: number } | null>(null)

// lists (fetched once per session, cached by the library module)
const repos = ref<Repo[]>([])
const gmSet = ref<GmSet>('FluidR3_GM')
const gmNames = ref<string[]>([])
const banks = ref<{ name: string; files: string[]; base: string }[]>([])
const url = ref('')

// SFZ repo drill-down
const repo = ref<Repo | null>(null)
const tree = ref<RepoTree | null>(null)
const sizes = ref(new Map<string, number>())

async function guard(fn: () => Promise<void>) {
  error.value = ''
  try {
    await fn()
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function refresh() {
  await guard(async () => {
    if (tab.value === 'sfz' && !repos.value.length) repos.value = await listSfzRepos()
    if (tab.value === 'gm') gmNames.value = await listGm(gmSet.value)
    if (tab.value === 'drums' && !banks.value.length) banks.value = await listDirtBanks()
  })
}
watch([open, tab, gmSet], () => open.value && refresh(), { immediate: true })

const match = (s: string) => s.toLowerCase().includes(query.value.trim().toLowerCase())
const shownRepos = computed(() => repos.value.filter((r) => match(r.name) || match(r.description)))
const shownGm = computed(() => gmNames.value.filter(match))
const shownBanks = computed(() => banks.value.filter((b) => match(b.name)))
const pretty = (s: string) => s.replace(/_/g, ' ')
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(bytes > 10 * 1048576 ? 0 : 1)} MB`

async function openRepo(r: Repo) {
  await guard(async () => {
    repo.value = r
    tree.value = null
    sizes.value = new Map()
    tree.value = await repoTree(r)
    // estimate each .sfz's download (its samples only) so heavy ones are obvious
    for (const p of tree.value.sfz.slice(0, 12)) {
      sfzDownloadSize(r, tree.value, p).then((b) => (sizes.value = new Map(sizes.value).set(p, b)))
    }
  })
}

/** Fetch, then hand the files to the normal loader (pads, SFZ zones, persistence). */
/** `tags`: where it came from, so imports are easy to find with the tag strip. */
async function load(label: string, tags: string[], get: (progress: (d: number, t: number) => void) => Promise<PathFile[]>) {
  await guard(async () => {
    busy.value = { label, done: 0, total: 0 }
    try {
      const files = await get((done, total) => (busy.value = { label, done, total }))
      if (!files.length) throw new Error('Nothing could be fetched')
      busy.value = { label: `${label} · decoding`, done: 0, total: 0 }
      await board.addFiles(files, { tags })
    } finally {
      busy.value = null
    }
  })
}

const loadSfz = (path: string) =>
  load(path.split('/').pop()!, ['sfzinstruments', repo.value!.name], (p) => repoSfz(repo.value!, tree.value!, path, p))
const loadGm = (name: string) =>
  load(pretty(name), ['gm', gmSet.value, gmFamily(gmNames.value.indexOf(name))], (p) => gmInstrument(gmSet.value, name, 3, p))
const loadBank = (b: { name: string; files: string[]; base: string }) =>
  load(b.name, ['dirt-samples', b.name], (p) => dirtBank(b, 32, p))
const urlHost = () => {
  try {
    return new URL(url.value.trim()).hostname
  } catch {
    return ''
  }
}
const loadUrl = () =>
  url.value.trim() && load(url.value.split('/').pop()!, ['url', urlHost()].filter(Boolean), (p) => fromUrl(url.value, p))

const TABS: { id: Tab; label: string }[] = [
  { id: 'sfz', label: 'SFZ INSTRUMENTS' },
  { id: 'gm', label: 'GM SOUNDFONTS' },
  { id: 'drums', label: 'DRUM BANKS' },
  { id: 'url', label: 'URL' },
]
</script>

<template>
  <v-dialog v-model="open" max-width="820" scrollable>
    <div class="lib" @keydown.stop>
      <header>
        <v-icon icon="mdi-music-box-multiple" color="primary" />
        <h3>LIBRARY</h3>
        <div class="tabs">
          <button v-for="t in TABS" :key="t.id" :class="{ on: tab === t.id }" @click="tab = t.id">{{ t.label }}</button>
        </div>
        <v-spacer />
        <button class="hw-btn icon" title="Close" @click="open = false"><v-icon size="16" icon="mdi-close" /></button>
      </header>

      <p class="hint">
        <template v-if="tab === 'sfz'">
          Free SFZ instruments from <b>github.com/sfzinstruments</b>. Only the samples an .sfz uses are fetched.
        </template>
        <template v-else-if="tab === 'gm'">
          All 128 General MIDI instruments from <b>gleitz/midi-js-soundfonts</b> — one MP3 every 3 semitones, mapped
          as an SFZ.
        </template>
        <template v-else-if="tab === 'drums'">
          Drum machines and one-shots from <b>tidalcycles/Dirt-Samples</b> — each file becomes a pad (first 32).
        </template>
        <template v-else>Any .sfz (its samples are fetched next to it), audio file or .zip. GitHub page links work.</template>
      </p>

      <div v-if="tab !== 'url'" class="search">
        <v-icon size="16" icon="mdi-magnify" />
        <input v-model="query" placeholder="FILTER…" spellcheck="false" />
        <select v-if="tab === 'gm'" v-model="gmSet">
          <option v-for="s in GM_SETS" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>

      <div class="list">
        <!-- SFZ: repos, then the chosen repo's .sfz files -->
        <template v-if="tab === 'sfz'">
          <template v-if="repo">
            <button class="row back" @click="repo = null">◀ ALL INSTRUMENTS</button>
            <div class="row head">
              {{ repo.name }} <span class="dim">{{ repo.sizeMB }} MB repo</span>
            </div>
            <div v-if="!tree" class="row dim">READING…</div>
            <div v-else-if="tree.lfs" class="row warn">Samples are stored with Git LFS — not fetchable as raw files.</div>
            <div v-else-if="!tree.sfz.length" class="row dim">No .sfz files found.</div>
            <div v-for="p in tree?.lfs ? [] : tree?.sfz ?? []" :key="p" class="row">
              <span class="name">{{ p }}</span>
              <span class="dim">{{ sizes.has(p) ? mb(sizes.get(p)!) : '…' }}</span>
              <button class="hw-btn" :disabled="!!busy" @click="loadSfz(p)">LOAD</button>
            </div>
          </template>
          <template v-else>
            <div v-for="r in shownRepos" :key="r.name" class="row" @click="openRepo(r)">
              <span class="name">{{ r.name }}</span>
              <span class="desc">{{ r.description }}</span>
              <span class="dim" :class="{ warn: r.sizeMB > 300 }">{{ r.sizeMB }} MB</span>
              <v-icon size="16" icon="mdi-chevron-right" />
            </div>
          </template>
        </template>

        <template v-else-if="tab === 'gm'">
          <div v-for="n in shownGm" :key="n" class="row">
            <span class="num">{{ String(gmNames.indexOf(n) + 1).padStart(3, '0') }}</span>
            <span class="name">{{ pretty(n) }}</span>
            <button class="hw-btn" :disabled="!!busy" @click="loadGm(n)">LOAD</button>
          </div>
        </template>

        <template v-else-if="tab === 'drums'">
          <div v-for="b in shownBanks" :key="b.name" class="row">
            <span class="name">{{ b.name }}</span>
            <span class="dim">{{ b.files.length }} files</span>
            <button class="hw-btn" :disabled="!!busy" @click="loadBank(b)">LOAD</button>
          </div>
        </template>

        <template v-else>
          <div class="url">
            <input
              v-model="url"
              placeholder="https://raw.githubusercontent.com/…/instrument.sfz"
              spellcheck="false"
              @keydown.enter="loadUrl"
            />
            <button class="hw-btn" :disabled="!!busy || !url.trim()" @click="loadUrl">LOAD</button>
          </div>
        </template>
      </div>

      <footer>
        <div v-if="busy" class="progress">
          <span>{{ busy.label }}</span>
          <div class="bar"><i :style="{ width: busy.total ? `${(100 * busy.done) / busy.total}%` : '100%' }" :class="{ indeterminate: !busy.total }" /></div>
          <span v-if="busy.total" class="dim">{{ busy.done }}/{{ busy.total }}</span>
        </div>
        <div v-else-if="error" class="warn">{{ error }}</div>
        <div v-else class="dim">Loaded sounds are saved with the board like dropped files.</div>
      </footer>
    </div>
  </v-dialog>
</template>

<style scoped>
.lib {
  display: flex;
  flex-direction: column;
  max-height: 80vh;
  padding: 12px 14px;
  border-radius: 8px;
  color: var(--text);
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.015) 0 1px, transparent 1px 3px),
    linear-gradient(180deg, var(--panel-hi) 0%, var(--panel-lo) 100%);
  border: 1px solid #000;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
}
header,
footer,
.search,
.url {
  display: flex;
  align-items: center;
  gap: 10px;
}
h3 {
  margin: 0;
  font-family: 'Orbitron', sans-serif;
  font-weight: 900;
  font-size: 15px;
  letter-spacing: 0.18em;
  color: var(--c-primary);
}
.tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.tabs button {
  padding: 3px 9px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 16px;
  color: var(--ink-mute);
  background: #111;
  border: 1px solid #000;
}
.tabs button.on {
  color: var(--c-secondary);
  text-shadow: 0 0 5px color-mix(in srgb, var(--c-secondary) 70%, transparent);
}
.hint {
  margin: 8px 0;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: var(--text-dim);
}
.search input,
.url input,
.search select {
  flex: 1;
  height: 28px;
  padding: 0 8px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 18px;
  color: var(--c-primary);
  background: var(--lcd-bg);
  border: 1px solid #000;
  outline: none;
}
.search select {
  flex: 0 0 auto;
}
.list {
  flex: 1;
  min-height: 200px;
  margin: 8px 0;
  overflow-y: auto;
  border-radius: 4px;
  background: var(--lcd-bg);
  box-shadow: inset 0 1px 6px rgba(0, 0, 0, 0.9);
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  font-family: 'VT323', monospace;
  font-size: 17px;
  cursor: default;
}
.row:hover {
  background: color-mix(in srgb, var(--c-primary) 8%, transparent);
}
.row .name {
  color: var(--c-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row .desc {
  flex: 1;
  min-width: 0;
  color: var(--text-mute);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row .name:only-of-type,
.row .name + .dim,
.row .name + .hw-btn {
  margin-left: auto;
}
.row .num {
  color: var(--text-faint);
}
.row.head {
  color: var(--c-primary);
}
.row.back {
  width: 100%;
  color: var(--text-dim);
  cursor: pointer;
}
.row[class='row']:has(.mdi-chevron-right) {
  cursor: pointer;
}
.dim {
  color: var(--text-mute);
  white-space: nowrap;
}
.warn {
  color: var(--c-danger);
}
.url {
  padding: 12px;
}
footer {
  min-height: 26px;
  font-family: 'VT323', monospace;
  font-size: 15px;
}
.progress {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  color: var(--c-primary);
}
.bar {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: #000;
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: var(--c-primary);
  box-shadow: 0 0 8px var(--c-primary);
  transition: width 0.15s;
}
.bar i.indeterminate {
  animation: pulse 1s ease-in-out infinite alternate;
}
@keyframes pulse {
  from {
    opacity: 0.3;
  }
  to {
    opacity: 1;
  }
}
</style>
