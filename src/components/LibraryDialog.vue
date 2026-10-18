<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useBoard } from '../stores/board'
import * as engine from '../audio/engine'
import {
  akwfCategory, akwfIndex, browsing, categoryLabel, categoryTag, CYCLE_ROOT, cycleRate, waveAudioId, waveLabel,
  type AkwfIndex, type AkwfWave,
} from '../lib/akwf'
import type { PathFile } from '../lib/dropFiles'
import {
  dirtBank, fromUrl, gmFamily, gmInstrument, GM_SETS, listDirtBanks, listGm, listSfzRepos, repoTree, repoSfz, sfzDownloadSize,
  type GmSet, type Repo, type RepoTree,
} from '../lib/library'

const board = useBoard()
const open = defineModel<boolean>({ required: true })
type Tab = 'akwf' | 'sfz' | 'gm' | 'drums' | 'url'
/** start: the tab it opens on */
const props = defineProps<{ start?: Tab }>()

const tab = ref<Tab>(props.start ?? 'akwf')
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

// AKWF: the index, the category on show and its waves, the wave last heard
const akwf = ref<AkwfIndex | null>(null)
const folder = ref(browsing.folder)
const waves = shallowRef<AkwfWave[]>([])
const current = ref<AkwfWave | null>(null)

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
    if (tab.value === 'akwf' && !akwf.value) {
      akwf.value = await akwfIndex()
      if (!folder.value) folder.value = akwf.value.categories[0]?.folder ?? ''
    }
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

// ── AKWF: the single-cycle waves that ship with SSB, in AKWF's own categories ──
watch(folder, (f) => {
  browsing.folder = f
  waves.value = []
  if (f)
    void guard(async () => {
      const list = await akwfCategory(f)
      if (folder.value === f) waves.value = list
    })
}, { immediate: true })

const q = computed(() => query.value.trim().toLowerCase())
const waveMatches = (f: string, name: string) =>
  !q.value || [waveLabel(name), categoryLabel(f), f].some((s) => s.toLowerCase().includes(q.value))
/** categories with their (matching) wave counts */
const cats = computed(() =>
  (akwf.value?.categories ?? [])
    .map((c) => ({ folder: c.folder, label: categoryLabel(c.folder), n: c.waves.filter((w) => waveMatches(c.folder, w)).length }))
    .filter((c) => c.n > 0),
)
// a filter that leaves nothing in this category moves to the first that has some
watch(cats, (list) => {
  if (list.length && !list.some((c) => c.folder === folder.value)) folder.value = list[0].folder
})
const shownWaves = computed(() => waves.value.filter((w) => waveMatches(w.folder, w.name)))
/** what every wave's name in the category starts with ("EPIANO "), left off the tiles: they show "0003" */
const shared = computed(() => {
  const names = waves.value.map((w) => waveLabel(w.name))
  let p = names[0] ?? ''
  for (const n of names) while (!n.startsWith(p)) p = p.slice(0, -1)
  return names.length > 1 ? p.slice(0, p.lastIndexOf(' ') + 1) : ''
})
const tileLabel = (w: AkwfWave) => waveLabel(w.name).slice(shared.value.length)
// keep the chosen category in sight (arrow keys, a filter)
watch(folder, () => nextTick(() => document.querySelector('.cats button.on')?.scrollIntoView({ block: 'nearest' })))
const onBoard = computed(() => new Set(board.sounds.map((s) => s.audioId)))

/** a wave's outline: one polyline per channel, min and max of each column so spikes show */
const TW = 112
const TH = 40
const outlines = new WeakMap<AkwfWave, string[]>()
function outline(w: AkwfWave): string[] {
  let o = outlines.get(w)
  if (!o) {
    o = w.channels.map((ch) => {
      const pts: string[] = []
      const y = (v: number) => (TH / 2 - v * (TH / 2 - 2)).toFixed(1)
      for (let x = 0; x < TW; x++) {
        const a = Math.floor((x * ch.length) / TW)
        const b = Math.max(a + 1, Math.floor(((x + 1) * ch.length) / TW))
        let lo = a
        let hi = a
        for (let i = a; i < b; i++) {
          if (ch[i] < ch[lo]) lo = i
          if (ch[i] > ch[hi]) hi = i
        }
        for (const i of lo < hi ? [lo, hi] : [hi, lo]) pts.push(`${x},${y(ch[i])}`)
      }
      return pts.join(' ')
    })
    outlines.set(w, o)
  }
  return o
}

/** hear a wave at C3, looped for a moment */
function audition(w: AkwfWave) {
  current.value = w
  const frames = w.channels[0].length
  engine.preview(engine.cycleBuffer(w.channels, cycleRate(frames)), 2 ** ((48 - CYCLE_ROOT) / 12))
}
/**
 * Every wave is a sound of the board from the first load: + on one selects its pad, and puts it back if it was
 * deleted; ADD ALL puts back the deleted ones of what's shown.
 */
async function addAkwf(list: AkwfWave[]) {
  const missing = list.filter((w) => !onBoard.value.has(waveAudioId(w.name)))
  if (list.length === 1 && !missing.length) {
    const [snd] = await board.addWaves(list)
    board.select(snd.id)
    board.toast = `${waveLabel(list[0].name)} is on the board — selected`
    return
  }
  await guard(async () => {
    busy.value = { label: 'ADDING', done: 0, total: missing.length }
    try {
      for (const [i, w] of missing.entries()) {
        await board.addWaves([w])
        busy.value = { label: 'ADDING', done: i + 1, total: missing.length }
      }
      board.toast = missing.length === 1 ? `Put back ${waveLabel(missing[0].name)} (${categoryTag(missing[0].folder)})` : `Put back ${missing.length} waves`
    } finally {
      busy.value = null
    }
  })
}
const missingShown = computed(() => shownWaves.value.filter((w) => !onBoard.value.has(waveAudioId(w.name))))
/** put a wave in VCO slot `i` of the selected patch (a new patch if none) */
async function toSlot(w: AkwfWave, i: number) {
  await guard(async () => {
    const [snd] = await board.addWaves([w])
    board.assignSlot(i, snd.id)
    board.toast = `VCO ${i + 1}: ${waveLabel(w.name)}`
  })
}
/** ←→ the previous / next wave (heard), ↑↓ the category, Enter adds, 1 2 3 the VCO slot */
function onWaveKey(e: KeyboardEvent) {
  const list = shownWaves.value
  const at = current.value ? list.indexOf(current.value) : -1
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    const next = list[Math.max(0, Math.min(list.length - 1, at + (e.key === 'ArrowRight' ? 1 : -1)))]
    if (next) {
      audition(next)
      document.getElementById(`akwf-${next.name}`)?.scrollIntoView({ block: 'nearest' })
    }
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const i = cats.value.findIndex((c) => c.folder === folder.value)
    const next = cats.value[i + (e.key === 'ArrowDown' ? 1 : -1)]
    if (next) folder.value = next.folder
  } else if (e.key === 'Enter' && current.value) void addAkwf([current.value])
  else if (['1', '2', '3'].includes(e.key) && current.value) void toSlot(current.value, Number(e.key) - 1)
  else return
  e.preventDefault()
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'akwf', label: 'AKWF WAVES' },
  { id: 'sfz', label: 'SFZ INSTRUMENTS' },
  { id: 'gm', label: 'GM SOUNDFONTS' },
  { id: 'drums', label: 'DRUM BANKS' },
  { id: 'url', label: 'URL' },
]
</script>

<template>
  <v-dialog v-model="open" :max-width="tab === 'akwf' ? 1040 : 820" scrollable @after-leave="engine.stopPreview()">
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
        <template v-if="tab === 'akwf'">
          {{ akwf ? akwf.count.toLocaleString() : '…' }} single-cycle waveforms by <b>Adventure Kid</b> (Kristoffer Ekstrand),
          public domain, in AKWF's own categories — every one a sound of the board, tagged <b>akwf</b> and its category.
          Click to hear (C3) · <b>+</b> selects its pad (puts it back if deleted) · <b>1 2 3</b> put it in that VCO slot ·
          ← → step · ↑ ↓ category · ENTER selects.
        </template>
        <template v-else-if="tab === 'sfz'">
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

      <div v-if="tab === 'akwf'" class="akwf">
        <nav class="cats">
          <button
            v-for="c in cats"
            :key="c.folder"
            :class="{ on: c.folder === folder }"
            :title="`${c.folder} — tag: ${categoryTag(c.folder)}`"
            @click="folder = c.folder"
          >
            <span>{{ c.label }}</span>
            <small>{{ c.n }}</small>
          </button>
          <div v-if="!akwf" class="row dim">READING…</div>
        </nav>
        <div class="waves" tabindex="0" @keydown="onWaveKey">
          <div v-if="folder && !waves.length" class="row dim">LOADING {{ categoryLabel(folder) }}…</div>
          <div
            v-for="w in shownWaves"
            :id="`akwf-${w.name}`"
            :key="w.name"
            class="wave"
            :class="{ on: current === w, have: onBoard.has(waveAudioId(w.name)) }"
            :title="`${w.name}${w.channels.length > 1 ? ' (stereo)' : ''}${onBoard.has(waveAudioId(w.name)) ? ' — on the board' : ''}`"
            @click="audition(w)"
          >
            <svg :viewBox="`0 0 ${TW} ${TH}`" preserveAspectRatio="none">
              <line x1="0" :y1="TH / 2" :x2="TW" :y2="TH / 2" />
              <polyline v-for="(p, c) in outline(w)" :key="c" :points="p" :class="`ch${c}`" />
            </svg>
            <div class="wname">
              <span>{{ tileLabel(w) }}</span>
              <button :title="onBoard.has(waveAudioId(w.name)) ? 'Select its pad on the board (Enter)' : 'Put it back on the board (Enter)'" :disabled="!!busy" @click.stop="addAkwf([w])">+</button>
              <button v-for="i in 3" :key="i" :title="`Put in VCO ${i} of the patch (${i})`" :disabled="!!busy" @click.stop="toSlot(w, i - 1)">
                {{ i }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="list">
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
        <template v-else-if="tab === 'akwf'">
          <span class="dim">{{ current ? `${current.name} · ${categoryTag(current.folder)}` : 'Every wave is a sound of the board: + selects its pad. They loop while a key is held; root C2.' }}</span>
          <v-spacer />
          <button class="hw-btn" :disabled="!missingShown.length" :title="missingShown.length ? 'Put the deleted ones back on the board' : ''" @click="addAkwf(missingShown)">
            {{ missingShown.length ? `PUT BACK ${missingShown.length}` : 'ALL ON THE BOARD' }}
          </button>
        </template>
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
/* AKWF: categories on the left, the chosen one's waves as outlines on the right */
.akwf {
  flex: 1;
  min-height: 0;
  height: 60vh;
  display: flex;
  gap: 8px;
  margin: 8px 0;
}
.cats,
.waves {
  overflow-y: auto;
  border-radius: 4px;
  background: var(--lcd-bg);
  box-shadow: inset 0 1px 6px rgba(0, 0, 0, 0.9);
  scrollbar-width: thin;
}
.cats {
  flex: 0 0 210px;
  display: flex;
  flex-direction: column;
  padding: 3px 0;
}
.cats button {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 2px 10px;
  background: none;
  border: 0;
  font-family: 'VT323', monospace;
  font-size: 16px;
  color: var(--ink-dim);
  text-align: left;
}
.cats button span {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cats button small {
  font-size: 13px;
  color: var(--text-faint);
}
.cats button:hover {
  background: color-mix(in srgb, var(--c-primary) 8%, transparent);
}
.cats button.on {
  color: var(--c-secondary);
  background: color-mix(in srgb, var(--c-secondary) 12%, transparent);
  text-shadow: 0 0 5px color-mix(in srgb, var(--c-secondary) 60%, transparent);
}
.waves {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(124px, 1fr));
  align-content: start;
  gap: 6px;
  padding: 6px;
  outline: none;
}
.wave {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 4px 3px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.35);
  cursor: pointer;
}
.wave:hover {
  border-color: color-mix(in srgb, var(--c-primary) 50%, transparent);
}
.wave.on {
  border-color: var(--c-secondary);
  box-shadow: 0 0 8px color-mix(in srgb, var(--c-secondary) 45%, transparent);
}
.wave svg {
  display: block;
  width: 100%;
  height: 40px;
}
.wave line {
  stroke: color-mix(in srgb, var(--c-success) 18%, transparent);
  stroke-width: 1;
}
.wave polyline {
  fill: none;
  stroke: var(--c-success);
  stroke-width: 1.2;
  vector-effect: non-scaling-stroke;
  stroke-linejoin: round;
}
.wave polyline.ch1 {
  stroke: var(--c-accent);
  opacity: 0.8;
}
.wave.on polyline.ch0 {
  stroke: var(--c-secondary);
}
.wname {
  display: flex;
  align-items: center;
  gap: 2px;
  font-family: 'VT323', monospace;
  font-size: 13px;
  line-height: 14px;
  color: var(--text-mute);
}
.wname span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* on the board already: the name lit */
.wave.have .wname span {
  color: var(--c-primary);
}
.wname button {
  width: 15px;
  height: 14px;
  padding: 0;
  border-radius: 2px;
  font-family: 'VT323', monospace;
  font-size: 13px;
  line-height: 12px;
  color: var(--ink-dim);
  background: #111;
  border: 1px solid #000;
}
.wname button:hover:not(:disabled) {
  color: var(--c-secondary);
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
