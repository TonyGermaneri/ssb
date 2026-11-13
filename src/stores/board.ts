import { defineStore } from 'pinia'
import { computed, markRaw, nextTick, reactive, ref, shallowReactive, shallowRef, toRaw, watch, type Ref } from 'vue'
import { del, get, keys, set } from 'idb-keyval'
import * as engine from '../audio/engine'
import { computePeaks } from '../audio/peaks'
import { connectMidi, parseMidi, type MidiEvent } from '../audio/midi'
import { callNative, inNative, nativeBoardKey, nativeInfo, onNative, onNativeMidi, saveFile } from '../native/bridge'
import { encodeTableWav, encodeWav, planarFromBase64, readCycleWav, readTableWav } from '../lib/wav'
import { History } from '../lib/history'
import { compactSound, expandSound, isAkwfSound, isWaveSound } from '../lib/storedSound'
import { isTracked, track, untrack } from '../lib/tracked'
import { ClockTracker } from '../lib/midiClock'
import { THEMES, themeById } from '../theme/themes'
import { AdaptiveTuner } from '../audio/adaptiveTuning'
import { MpeZones } from '../audio/mpe'
import type { Voice, VoiceOptions, VoiceTuning, ZonePlay } from '../audio/voice'
import type { SoundRef } from '../lib/ai/patchSpec'
import { basename, dirname, type PathFile } from '../lib/dropFiles'
import { addTags, passesTags, splitTags, tagFacets } from '../lib/tags'
import { normalisePath, parseSfz } from '../lib/sfz'
import { sniffSampleRate } from '../lib/sampleRate'
import { filterPlayable, nearestZone, pickZones, regionToZone, zoneSemis } from '../lib/zones'
import { isSynthAudioId, synthAudioId, synthWave } from '../audio/synthWaves'
import { FACTORY_PATCHES, factoryMpe, LAYER_VOLUME, LEGACY_FACTORY_NAMES, type FactoryPatch } from '../lib/factory'
import { fillFactoryMpe } from '../lib/factoryMpe'
import { FACTORY_LEVELS, FACTORY_LEVELS_V3 } from '../lib/factoryLevels'
import {
  akwfReady, allWaves, boardOrder, categoryLabel, categoryTag, CYCLE_ROOT, cycleRate, isAkwfAudioId, isTableAudioId, isWaveAudioId, loadAkwf,
  tableAudioId, tableCycle, tableFolderOf, tableLength, tableSoundSettings, waveAudioId, waveChannels, waveFolder,
  waveAt, waveLabel, waveNameOf, waveSettings, waveSoundSettings, waveSpot,
} from '../lib/akwf'
import { QUIET_MS, SemanticIndex } from '../lib/semantic'
import { makeCandidate, type CandidateInfo } from '../lib/semantic/candidate'
import { stripExt } from '../lib/format'
import {
  divisionBeats, defaultMaster, defaultMatrix, defaultSettings, FILTER_TYPES, migrateMaster, migratePresetSettings, presetSettings,
  TRIGGER_MODES,
  carrierSlot, headerOf, migratePatch, mpeRoutes, newSlot, PATCH_SLOTS, patchLayers, soundAudioIds, type TuningMode, type ListView,
  type MasterState, type ModRoute, type Patch, type PatchLayer, type PatchSlot, type Preset, type Sound, type SoundSettings,
  type VcoSlot, type Zone,
} from '../types'

/**
 * The library: sounds, patches, presets. One board, shared by every SSB in the same place (browser
 * tabs; plugin instances in one DAW). What a plugin instance plays -- its patch, keyboard mode,
 * volume, FX -- is its own and lives in the host session (INSTANCE_FIELDS).
 */
const BOARD_KEY = 'ssb:board'
/** plugin instances once kept a board each, under 'ssb:board:<instance>': merged into the library */
const LEGACY_BOARD = 'ssb:board:'
/** a plugin instance's own settings, saved with the host session */
const INSTANCE_FIELDS = [
  'play', 'mono', 'glide', 'octave', 'volume', 'muted', 'selectedId', 'patchId', 'mpe', 'mpeBendRange',
  'midiAuto', 'midiBase', 'bpm', 'clockSource', 'fx', 'mod',
] as const
/**
 * How a plugin instance's editor looked, saved with the host session beside INSTANCE_FIELDS (with InstanceView): a
 * track reopened, or duplicated, shows what it showed -- its tab, layout, folds, scope settings and scroll.
 */
const VIEW_FIELDS = [
  'tab', 'view', 'patchView', 'gridPanel', 'showPatches', 'showSamples', 'paneSplit', 'listWidth', 'folded',
  'headerFolded', 'rack', 'waveView', 'scope', 'isoView', 'favSounds', 'favPatches', 'scale', 'vcoPlay', 'rackTab',
] as const
/** tells the other tabs / instances the library was saved, so they reload it */
const libraryChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ssb-library') : null
const pageId = crypto.randomUUID()
const audioKey = (audioId: string) => `ssb:audio:${audioId}`

/** Keyboard triggers, assigned to visible pads in grid order. */
export const PAD_KEYS = '1234567890qwertyuiopasdfghjklzxcvbnm'.split('')

const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|webm|opus)$/i
const isAudio = (path: string) => AUDIO_EXT.test(path)
const isSfz = (path: string) => /\.sfz$/i.test(path)
const isZip = (path: string) => /\.zip$/i.test(path)

/** what of a plugin instance's view isn't in the master state */
interface InstanceView {
  openPanels: string[]
  tagFilter: string[]
  tagHidden: string[]
  patchTagFilter: string[]
  patchTagHidden: string[]
  similarTo: { sounds: unknown; patches: unknown }
  /** each scrolled pane's [top, left] (lib/scrollMemory.ts) */
  scroll: Record<string, [number, number]>
}

interface SavedBoard {
  version: 1
  sounds: Sound[]
  master: MasterState
  presets?: Preset[]
  /** each patch as saved (edits wait for SAVE) */
  patches?: Patch[]
  /** the selected patch's unsaved edits (its body), so the app reopens where it was; a plugin keeps its own in the session */
  edit?: { id: string; body: string } | null
}

const uid = () => crypto.randomUUID()
/** 2: the factory patches are made of AKWF waves; 3: every AKWF wave is a sound, and the built-in patches; 4: those
 *  patches with headroom for chords; 5: the built-ins dry (their chorus, delay and reverb mixes at 0; see upgradeFactory);
 *  6: AKWF's categories are wavetables, the board's waves and patches moved onto them (wavesToTables); 7: PRESS is
 *  the built-ins' WT BLEND (factory.ts pressBlends) */
const FACTORY_VERSION = 7
/** AKWF's cycles are all this long: a table's WT SIZE */
const AKWF_FRAMES = 600
/** the global FX mixes at 0: how the built-in patches start */
const DRY = { chorusMix: 0, delayMix: 0, reverbMix: 0 } as const
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(toRaw(v)))
const cycle = <T>(list: readonly T[], cur: T) => list[(list.indexOf(cur) + 1) % list.length]

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export const useBoard = defineStore('board', () => {
  const sounds = ref<Sound[]>([])
  const master = reactive<MasterState>(defaultMaster())
  const openPanels = reactive(new Set<string>())
  const pressed = reactive(new Set<string>())
  const tagFilter = ref<string[]>([])
  /** tags hidden with a right-click: pads carrying any of them are filtered out */
  const tagHidden = ref<string[]>([])
  const peaks = shallowReactive(new Map<string, Float32Array>())
  const loaded = ref(false)
  const toast = ref('')
  const midi = reactive({ enabled: false, inputs: 0, learning: null as string | null })
  /** MIDI notes currently held in keyboard-play mode (for the display). */
  const heldNotes = ref<number[]>([])
  /** live performance controllers (not saved) */
  /** the performance values the host last sent (MIDI in the plugin): the engine has those already, not to be echoed */
  const fromHost: { mod?: number; sustain?: boolean; timbre?: number; pressure?: number; bend?: number } = {}
  const perform = reactive({ mod: 0, bend: 0, pressure: 0, timbre: 0, sustain: false })
  /** MIDI clock follower state (runtime only) */
  /** host: the DAW's transport (plugin only) -- its tempo wins over the knob and MIDI clock */
  const tempo = reactive({ extBpm: 0, running: false, beats: 0, host: 0, hostPpq: -1, hostPlaying: false })
  const bpm = computed(() =>
    tempo.host > 0 ? tempo.host : master.clockSource === 'midi' && tempo.extBpm > 0 ? tempo.extBpm : master.bpm,
  )
  const presets = ref<Preset[]>([])
  /** settings copied with COPY, for PASTE onto another pad */
  const clipboard = ref<Partial<SoundSettings> | null>(null)
  /** open matrix modal: 'global', a sound id, or null */
  const matrixScope = ref<string | null>(null)
  const canUndo = ref(false)
  const canRedo = ref(false)
  /** patch catalog: sets of layered sound settings + header settings */
  const patches = ref<Patch[]>([])
  const patchTagFilter = ref<string[]>([])
  const patchTagHidden = ref<string[]>([])
  /**
   * Where each scrolled pane is (lib/scrollMemory.ts), kept with a plugin instance's view; `restored` counts the
   * times a saved view was put back, so the panes scroll to it.
   */
  const view = reactive({ scroll: {} as Record<string, [number, number]>, restored: 0 })

  // ── change tracking (lib/tracked.ts) ───────────────────────────────────
  /** bumped by any write to a sound or patch, and when sounds or patches are added, removed or moved */
  const changes = shallowRef(0)
  /** each sound's / patch's JSON (sounds as stored, see compactSound), until it is next written to */
  const texts = new WeakMap<object, string>()
  /**
   * Patches aren't saved by being edited. Each patch's body (what it sounds like: slots, header, MPE bindings) as last
   * saved is kept here; that is what the library stores and the other instances see, until SAVE (savePatch) makes the
   * edits the patch, or REVERT, or choosing another patch, drops them. Name, tags and ♥ save as they change.
   */
  const savedBodies = new Map<string, string>()
  /** bumped as savedBodies changes (it isn't reactive) */
  const savedTick = shallowRef(0)
  /** ids of patches written to since their body was saved or put back (only these can have edits) */
  const touched = new Set<string>()
  /** A sound or patch whose writes mark it changed. */
  function tracked<T extends object>(item: T): T {
    const raw = untrack(item)
    // (a patch has slots: its writes may be edits, which wait for SAVE)
    const patchId = 'slots' in raw ? (raw as unknown as Patch).id : null
    return track(item, () => {
      texts.delete(raw)
      semantic.forget(raw)
      if (patchId) touched.add(patchId)
      changes.value++
    })
  }

  // ── semantic search (lib/semantic): every sound's and patch's words, settings and sound, as vectors ──
  // (raw: the store would wrap it, unwrapping its own refs under its methods; they're what's reactive about it)
  const semantic = markRaw(new SemanticIndex({
    sounds: () => sounds.value,
    patches: () => patches.value,
    layerSound: (layer) => layerSound(layer),
    soundName: (id) => byId(id)?.settings.name,
    audioOf(s) {
      const id = s.zones?.[0]?.audioId ?? s.audioId
      if (isWaveAudioId(id)) {
        const ch = waveChannels(waveNameOf(id))
        return ch ? { cycle: ch[0] } : null
      }
      // a wavetable sounds like the cycle it's at
      if (isTableAudioId(id) && !s.zones?.length) {
        const c = tableCycle(tableFolderOf(id), Math.round(s.settings.wt) + s.settings.wtBlend)
        return c ? { cycle: c } : null
      }
      const b = engine.buffers.get(id)
      if (!b) return null
      const whole = !!s.zones?.length
      return { data: b.getChannelData(0), rate: b.sampleRate, from: whole ? 0 : s.settings.clipIn * b.duration, to: whole ? b.duration : s.settings.clipOut * b.duration }
    },
  }))

  // ── derived ────────────────────────────────────────────────────────────
  /** every tag in the catalog (comma-separated per pad), for tag pickers */
  const tags = computed(() => tagFacets(sounds.value.map((s) => s.settings.tag), []).map((f) => f.name))
  /** pads carrying every selected tag */
  const visible = computed(() =>
    sounds.value.filter((s) => (!master.favSounds || s.fav) && passesTags(s.settings.tag, tagFilter.value, tagHidden.value)),
  )
  /** tags among the visible pads, with counts — narrows as tags are selected */
  const facets = computed(() => tagFacets(sounds.value.map((s) => s.settings.tag), tagFilter.value, tagHidden.value))
  const same = (a: string) => (b: string) => a.toLowerCase() === b.toLowerCase()
  /** click: a hidden tag is shown again; otherwise the tag toggles in the AND filter */
  function toggleIn(tag: string, filter: Ref<string[]>, hidden: Ref<string[]>) {
    if (hidden.value.some(same(tag))) return void (hidden.value = hidden.value.filter((t) => !same(tag)(t)))
    const on = filter.value.some(same(tag))
    filter.value = on ? filter.value.filter((t) => !same(tag)(t)) : [...filter.value, tag]
  }
  /** right-click: hide the pads carrying the tag (or show them again) */
  function toggleOut(tag: string, filter: Ref<string[]>, hidden: Ref<string[]>) {
    filter.value = filter.value.filter((t) => !same(tag)(t))
    hidden.value = hidden.value.some(same(tag)) ? hidden.value.filter((t) => !same(tag)(t)) : [...hidden.value, tag]
  }
  const toggleTag = (tag: string) => toggleIn(tag, tagFilter, tagHidden)
  // ── patches catalog ─────────────────────────────────────────────────────
  const patchTags = computed(() => tagFacets(patches.value.map((p) => p.tag), []).map((f) => f.name))
  const visiblePatches = computed(() =>
    patches.value.filter((p) => (!master.favPatches || p.fav) && passesTags(p.tag, patchTagFilter.value, patchTagHidden.value)),
  )
  const patchFacets = computed(() => tagFacets(patches.value.map((p) => p.tag), patchTagFilter.value, patchTagHidden.value))
  const togglePatchTag = (tag: string) => toggleIn(tag, patchTagFilter, patchTagHidden)
  /** each catalog's tag strip (the patches' and the samples', which can show together) */
  type Catalog = 'sounds' | 'patches'
  const tagsOf = (kind: Catalog) =>
    kind === 'patches'
      ? { facets: patchFacets.value, filter: patchTagFilter.value, hidden: patchTagHidden.value, total: patches.value.length, shown: visiblePatches.value.length }
      : { facets: facets.value, filter: tagFilter.value, hidden: tagHidden.value, total: sounds.value.length, shown: visible.value.length }
  const toggleTagOf = (kind: Catalog, tag: string) => (kind === 'patches' ? togglePatchTag(tag) : toggleTag(tag))
  const hideTagOf = (kind: Catalog, tag: string) =>
    kind === 'patches' ? toggleOut(tag, patchTagFilter, patchTagHidden) : toggleOut(tag, tagFilter, tagHidden)
  function clearTagsOf(kind: Catalog) {
    if (kind === 'patches') patchTagFilter.value = patchTagHidden.value = []
    else tagFilter.value = tagHidden.value = []
  }

  const keyFor = computed(() => {
    const m = new Map<string, string>()
    visible.value.forEach((s, i) => i < PAD_KEYS.length && m.set(s.id, PAD_KEYS[i]))
    return m
  })
  const soundForKey = computed(() => new Map([...keyFor.value].map(([id, k]) => [k, id])))
  const soundIndex = computed(() => new Map(sounds.value.map((s) => [s.id, s])))
  const byId = (id: string) => soundIndex.value.get(id)
  /** MIDI note → pad: auto-assign (grid order from BASE) or each pad's learned note. */
  const noteFor = computed(() => {
    const m = new Map<string, number>()
    if (master.midiAuto) visible.value.forEach((s, i) => master.midiBase + i <= 127 && m.set(s.id, master.midiBase + i))
    else for (const s of sounds.value) if (s.settings.midiNote !== null) m.set(s.id, s.settings.midiNote)
    return m
  })
  const padsForNote = (note: number) => sounds.value.filter((s) => noteFor.value.get(s.id) === note)
  /** the sound being edited in the samples (its panel, a grid row) */
  const selected = computed(() => (master.selectedId ? byId(master.selectedId) ?? null : null))

  /**
   * Patch layers as playable sounds: the layer's own settings over its source sound's audio / zones. Cached per layer
   * so panels and voices keep a stable object.
   */
  const layerCache = new Map<string, Sound>()
  function layerSound(layer: PatchLayer): Sound | undefined {
    const src = byId(layer.soundId)
    if (!src) return undefined
    const hit = layerCache.get(layer.id)
    if (hit && hit.settings === layer.settings && hit.audioId === src.audioId && hit.zones === src.zones) return hit
    const snd: Sound = { id: layer.id, audioId: src.audioId, fileName: src.fileName, zones: src.zones, ccDefaults: src.ccDefaults, settings: layer.settings }
    layerCache.set(layer.id, snd)
    return snd
  }
  /**
   * The patch a description made (lib/semantic/candidate.ts), loaded and playable but not on the board: kept out of
   * the catalog, saving, undo and exports until SAVE puts it there.
   */
  const candidate = ref<Patch | null>(null)
  const candidateInfo = shallowRef<CandidateInfo | null>(null)
  /** a patch by id: the board's, or the candidate */
  const patchById = (id: string | null) =>
    (id && (patches.value.find((p) => p.id === id) ?? (candidate.value?.id === id ? candidate.value : null))) || null
  const layerIndex = computed(() => {
    const m = new Map<string, { patch: Patch; layer: PatchLayer }>()
    for (const p of candidate.value ? [...patches.value, candidate.value] : patches.value)
      for (const l of patchLayers(p)) m.set(l.id, { patch: p, layer: l })
    return m
  })
  /** A patch layer's MPE routes: its patch's bindings for its slot, while MPE is on (none otherwise). */
  function mpeRoutesFor(layerId: string): ModRoute[] {
    if (!master.mpe) return []
    const hit = layerIndex.value.get(layerId)
    if (!hit?.patch.mpe?.length) return []
    return mpeRoutes(hit.patch.mpe, hit.patch.slots.findIndex((x) => x?.layer.id === layerId))
  }
  engine.setMpeRoutes(mpeRoutesFor)
  /** a sound pad, or a patch layer (by layer id) */
  function resolveSound(id: string): Sound | undefined {
    const hit = byId(id)
    if (hit) return hit
    const l = layerIndex.value.get(id)
    return l ? layerSound(l.layer) : undefined
  }
  const selectedPatch = computed(() => patchById(master.patchId))
  const patchMain = computed(() => {
    const c = selectedPatch.value && carrierSlot(selectedPatch.value)
    return c ? layerSound(c.layer) ?? null : null
  })
  /** what the keyboard plays: the selected patch, or (with no patches yet) the sound being edited */
  const playable = computed(() => patchMain.value ?? selected.value)
  /** a catalog's view: cards or the grid (each keeps its own) */
  const listViewOf = (kind: Catalog): ListView => (kind === 'patches' ? master.patchView : master.view)
  function setListView(kind: Catalog, v: ListView) {
    if (kind === 'patches') master.patchView = v
    else master.view = v
  }
  const patchNumber = computed(() => patches.value.findIndex((p) => p.id === master.patchId) + 1)
  /** 1-based position of the selected patch in the grid. */
  const selectedNumber = computed(() => {
    const i = sounds.value.findIndex((s) => s.id === master.selectedId)
    return i < 0 ? 0 : i + 1
  })

  // ── audio loading ──────────────────────────────────────────────────────
  /** Decode and cache one audio blob. Returns the file's own sample rate (for SFZ sample offsets). */
  async function loadAudio(audioId: string, blob: Blob): Promise<number> {
    const bytes = await blob.arrayBuffer()
    const rate = sniffSampleRate(bytes) ?? 44100
    // a single cycle (an AKWF wave) plays at its own rate: resampled, its loop would no longer be exact
    const cycle = readCycleWav(bytes)
    // a wavetable likewise, each cycle at the rate that makes it C2 (as AKWF's): a cycle has no pitch of its own
    const tbl = cycle ? null : readTableWav(bytes)
    let buf: AudioBuffer
    if (tbl) {
      buf = new AudioBuffer({ numberOfChannels: tbl.channels.length, length: tbl.channels[0].length, sampleRate: cycleRate(tbl.size) })
      tbl.channels.forEach((c, i) => buf.getChannelData(i).set(c))
      tableSizes.set(audioId, tbl.size)
    } else buf = cycle ? engine.cycleBuffer(cycle.channels, cycle.rate) : await engine.decode(bytes) // detaches `bytes`
    engine.buffers.set(audioId, buf)
    peaks.set(audioId, computePeaks(buf))
    semantic.audioChanged()
    return rate
  }

  /** the cycle length of each wavetable WAV loaded (readTableWav), by audio id: a dropped one plays as a table */
  const tableSizes = new Map<string, number>()

  /** AKWF waves' peaks, made when first drawn (kept out of `peaks`: thousands of waves needn't all have them) */
  const wavePeaks = new Map<string, Float32Array>()
  /** Peaks for the waveform: decoded audio's, or an AKWF wave's (once the waves are in memory). */
  function peaksOf(audioId: string): Float32Array | undefined {
    const p = peaks.get(audioId)
    if (p || !isAkwfAudioId(audioId) || !akwfReady.value) return p
    let w = wavePeaks.get(audioId)
    if (!w) {
      const buf = engine.getBuffer(audioId)
      if (buf) wavePeaks.set(audioId, (w = computePeaks(buf)))
    }
    return w
  }

  function addSound(sound: Sound) {
    sounds.value.push(tracked(sound))
    if (!master.selectedId) master.selectedId = sound.id
  }

  /**
   * CAPTURE (Granulator III's): the input's last seconds as a new pad right after `fromId`, with that pad's
   * settings, selected.
   */
  async function addCapture(fromId: string, channels: Float32Array[], rate: number) {
    const from = byId(fromId)
    const audioId = uid()
    const now = new Date()
    const stamp = [now.getHours(), now.getMinutes(), now.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')
    const name = `CAPTURE ${stamp}`
    const blob = encodeWav(channels, rate)
    await loadAudio(audioId, blob)
    await set(audioKey(audioId), blob)
    const settings: SoundSettings = from ? { ...JSON.parse(JSON.stringify(toRaw(from.settings))), name } : defaultSettings(name)
    settings.tag = addTags(from?.settings.tag ?? '', ['capture'])
    const sound: Sound = { id: uid(), audioId, fileName: `${name.replace(/:/g, '-')}.wav`, settings }
    const i = sounds.value.findIndex((s) => s.id === fromId)
    sounds.value.splice(i < 0 ? sounds.value.length : i + 1, 0, sound)
    master.selectedId = sound.id
    toast.value = `${name}: ${(channels[0].length / rate).toFixed(1)} s`
  }

  /**
   * A clip the AI agent generated (a sound model's), as a new sample sound at the end of the list (tagged "ai" and its own
   * tags), playing at its recorded pitch from `rootNote` (+ `fine` cents). Not selected: the agent puts it in patches.
   */
  async function addAgentSound(channels: Float32Array[], rate: number, o: { name: string; tags: string[]; rootNote: number; fine: number }): Promise<Sound> {
    const audioId = uid()
    const blob = encodeWav(channels, rate)
    await loadAudio(audioId, blob)
    await set(audioKey(audioId), blob)
    const settings = defaultSettings(o.name)
    settings.tag = addTags('', ['ai', ...o.tags])
    settings.rootNote = o.rootNote
    settings.fine = o.fine
    const sound: Sound = { id: uid(), audioId, fileName: `${o.name.replace(/[^\w -]+/g, '').trim() || 'TAKE'}.wav`, settings }
    addSound(sound)
    return sounds.value[sounds.value.length - 1]
  }

  /**
   * Load dropped / picked files: audio files become pads, .sfz files become multi-sample instruments (their samples
   * are looked up among the other files), and .zip files are either a board export or a sample pack to unpack.
   */
  /**
   * `tags` are added to every pad this creates (library imports pass their source + collection).
   * Plain drops are tagged "dropped" plus their top folder; SFZ instruments also get "sfz".
   */
  async function addFiles(input: (File | PathFile)[], opts: { tags?: string[] } = {}) {
    let items: PathFile[] = input.map((f) => ('path' in f ? f : { file: f, path: f.webkitRelativePath || f.name }))
    const tagsFor = (path: string, kind: 'sfz' | 'sample') => {
      const folder = path.includes('/') ? path.slice(0, path.indexOf('/')) : ''
      return [...(opts.tags ?? ['dropped', folder]), kind].filter(Boolean)
    }
    importTags = tagsFor
    // zips: board exports import as boards; anything else is unpacked like a dropped folder
    const zips = items.filter((i) => isZip(i.path))
    items = items.filter((i) => !isZip(i.path))
    for (const z of zips) {
      try {
        const { default: JSZip } = await import('jszip')
        const zip = await JSZip.loadAsync(z.file)
        if (zip.file('board.json')) {
          await importBoard(z.file as File)
          continue
        }
        for (const entry of Object.values(zip.files)) {
          if (!entry.dir) items.push({ file: await entry.async('blob'), path: entry.name })
        }
      } catch (e) {
        console.error(e)
        toast.value = `Couldn't open ${basename(z.path)}`
      }
    }

    const used = new Set<string>()
    for (const sfz of items.filter((i) => isSfz(i.path))) await loadSfz(sfz, items, used)

    const audio = items.filter((i) => isAudio(i.path) && !used.has(i.path))
    if (!audio.length && !used.size && !zips.length) {
      toast.value = 'No audio or SFZ files in that drop'
      return
    }
    for (const { file, path } of audio) {
      const audioId = uid()
      const name = basename(path)
      try {
        await loadAudio(audioId, file)
        await set(audioKey(audioId), file)
        const settings = defaultSettings(stripExt(name))
        settings.tag = addTags('', tagsFor(path, 'sample'))
        // a wavetable WAV: a VCO plays it a cycle at a time (WT, BLEND), held, from C2
        const size = tableSizes.get(audioId)
        if (size) Object.assign(settings, waveSettings(), { wtSize: size, rootNote: CYCLE_ROOT, tag: addTags(settings.tag, ['wavetable']) })
        addSound({ id: uid(), audioId, fileName: name, settings })
      } catch (e) {
        console.error(e)
        toast.value = `Couldn't decode ${name}`
      }
    }
  }

  let importTags: (path: string, kind: 'sfz' | 'sample') => string[] = () => []

  /** One .sfz → one instrument pad whose zones map keys × velocities to samples. */
  async function loadSfz(sfz: PathFile, items: PathFile[], used: Set<string>) {
    const name = basename(sfz.path)
    const dir = dirname(sfz.path)
    const byPath = new Map(items.map((i) => [normalisePath(i.path).toLowerCase(), i]))
    const byName = new Map<string, PathFile>()
    for (const i of items) if (!byName.has(basename(i.path).toLowerCase())) byName.set(basename(i.path).toLowerCase(), i)
    // relative to the .sfz, then to the drop root, then by file name alone (packs get reorganised)
    const find = (rel: string) =>
      byPath.get(normalisePath(dir + rel).toLowerCase()) ??
      byPath.get(normalisePath(rel).toLowerCase()) ??
      byName.get(basename(rel).toLowerCase())

    // #include targets are read up front so the parser can stay synchronous
    const texts = new Map<string, string>()
    // any small non-audio file may be an #include target (.sfzh, .txt, .inc, …)
    for (const i of items) {
      if (isAudio(i.path) || isZip(i.path) || i.file.size > 2_000_000) continue
      texts.set(i.path, await i.file.text())
    }
    const { regions, control } = parseSfz(texts.get(sfz.path) ?? (await sfz.file.text()), (p) => {
      const hit = find(p)
      return hit ? texts.get(hit.path) ?? null : null
    })
    const playable = filterPlayable(regions.map((r) => ({ ...r.opcodes, sample: r.sample })))
    if (!playable.length) {
      toast.value = `${name}: no playable regions`
      return
    }

    const loaded = new Map<string, { audioId: string; rate: number } | null>()
    const samples = [...new Set(playable.map((o) => o.sample))]
    let done = 0
    for (const sample of samples) {
      toast.value = `Loading ${name} · ${++done}/${samples.length}`
      // *sine, *saw, … : built-in wavetables, generated rather than loaded
      const wave = sample.startsWith('*') ? synthWave(sample) : null
      if (sample.startsWith('*')) {
        if (!wave) {
          loaded.set(sample, null)
          continue
        }
        const audioId = synthAudioId(wave)
        const buf = engine.getBuffer(audioId)!
        peaks.set(audioId, computePeaks(buf))
        loaded.set(sample, { audioId, rate: buf.sampleRate })
        continue
      }
      const item = find(sample)
      if (!item) {
        loaded.set(sample, null)
        continue
      }
      try {
        const audioId = uid()
        const rate = await loadAudio(audioId, item.file)
        await set(audioKey(audioId), item.file)
        loaded.set(sample, { audioId, rate })
        used.add(item.path)
      } catch (e) {
        console.error(`${name}: couldn't decode ${sample}`, e)
        loaded.set(sample, null)
      }
    }
    used.add(sfz.path)

    const zones: Zone[] = []
    for (const o of playable) {
      const hit = loaded.get(o.sample)
      const zone = hit && regionToZone(o, hit.audioId, hit.rate)
      if (!zone) continue
      if (isSynthAudioId(zone.audioId)) {
        // generators loop their whole wavetable unless told otherwise; noise doesn't follow the keyboard
        const len = engine.getBuffer(zone.audioId)!.duration
        // (release regions and ones with an explicit end play once)
        if (!o.loop_mode && zone.trigger !== 'release' && !zone.end) zone.loopMode = 'loop_continuous'
        if (zone.loopEnd <= zone.loopStart) Object.assign(zone, { loopStart: 0, loopEnd: len })
        if (zone.audioId === synthAudioId('noise')) zone.keytrack = 0
      }
      zones.push(zone)
    }
    // <control> set_ccN / set_hdccN: the instrument's starting controller values (kept with the pad)
    const ccDefaults: Record<number, number> = {}
    for (const [k, v] of Object.entries(control)) {
      const m = /^set_(hd)?cc(\d+)$/.exec(k)
      // set_ccN is 0..127, set_hdccN is already 0..1
      if (m) ccDefaults[+m[2]] = Math.min(1, Math.max(0, parseFloat(v) / (m[1] ? 1 : 127)))
    }
    const missing = [...loaded.values()].filter((v) => !v).length
    if (!zones.length) {
      toast.value = `${name}: none of its ${samples.length} samples were found`
      return
    }
    const rep = nearestZone(zones, 60)!
    const settings = defaultSettings(stripExt(name))
    settings.tag = addTags('', importTags(sfz.path, 'sfz'))
    // the pad plays middle C, or the nearest key the instrument covers
    settings.rootNote = Math.min(rep.hikey, Math.max(rep.lokey, 60))
    const sound: Sound = { id: uid(), audioId: rep.audioId, fileName: name, settings, zones }
    if (Object.keys(ccDefaults).length) sound.ccDefaults = ccDefaults
    addSound(sound)
    applyCcDefaults(sound)
    toast.value = `${name}: ${zones.length} zones${missing ? ` · ${missing} samples missing` : ''}`
  }

  // ── persistence ────────────────────────────────────────────────────────
  async function load() {
    try {
      let saved = await get<SavedBoard>(BOARD_KEY)
      if (!saved && inNative()) saved = (await mergeLegacyBoards()) ?? undefined
      if (saved) {
        Object.assign(master, migrateMaster(saved.master))
        // every launch starts as a soundboard: the samples as a grid, the VCO rack and the patches put away
        Object.assign(master, { rack: false, view: 'grid', patchView: 'grid', showPatches: false, showSamples: true, tab: 'sounds' })
        presets.value = (saved.presets ?? []).map((p) => ({ ...p, settings: migratePresetSettings(p.settings) }))
        patches.value = (saved.patches ?? []).map((p) => tracked(migratePatch(p)))
        const ok = await readSounds(saved.sounds)
        sounds.value = ok
        if (!selected.value) master.selectedId = ok[0]?.id ?? null
        for (const s of ok) applyCcDefaults(s)
        applyCcDefaults(selected.value)
      }
      // first run: every AKWF wavetable, then the built-in patches made of them; older boards get what they lack
      if (!master.factory) await installFactory()
      else if (master.factoryVersion < FACTORY_VERSION) await upgradeFactory()
      // built-in patches installed before they had MPE bindings get them, whatever the board's factory version (a patch
      // with a list of its own keeps it)
      fillFactoryMpe(patches.value, factoryMpe)
      // what's stored is what's saved (the upgrades just now included); the app's unsaved edits come back as edits
      markAllSaved()
      if (nativeBoardKey()) await restoreInstance()
      else applyDraft(saved?.edit)
      void collectOrphanAudio()
    } finally {
      loaded.value = true
      scheduleSave()
      history.reset(snapshot())
    }
  }

  /**
   * Saved sounds whose audio can be found (in the page's storage, else the plugin's sample cache), tracked. AKWF
   * waves need nothing stored: their audio is made from the waves that ship with SSB.
   */
  async function readSounds(list: Sound[]): Promise<Sound[]> {
    if (list.some(isAkwfSound) && !akwfReady.value) {
      await loadAkwf().catch((e) => {
        console.error(e)
        toast.value = 'Couldn\'t load the AKWF waves'
      })
    }
    const ok: Sound[] = []
    for (const s of list) {
      try {
        let missing = false
        for (const audioId of new Set(soundAudioIds(s))) {
          if (engine.hasAudio(audioId)) {
            if (isSynthAudioId(audioId) && !peaks.has(audioId)) peaks.set(audioId, computePeaks(engine.getBuffer(audioId)!))
            continue
          }
          const blob = (await get<Blob>(audioKey(audioId))) ?? (await audioFromPlugin(audioId))
          if (!blob) {
            missing = true
            break
          }
          await loadAudio(audioId, blob)
        }
        if (missing) continue
        ok.push(tracked(expandSound(s)))
      } catch (e) {
        console.error(`Dropping ${s.fileName}`, e)
      }
    }
    return ok
  }

  /** the sound's stored JSON, kept until it is next written to */
  function soundText(item: Sound): string {
    const raw = untrack(item)
    let t = texts.get(raw)
    if (t === undefined) texts.set(raw, (t = JSON.stringify(compactSound(raw))))
    return t
  }
  function patchText(item: Patch): string {
    const raw = untrack(item)
    let t = texts.get(raw)
    if (t === undefined) texts.set(raw, (t = JSON.stringify(raw)))
    return t
  }

  /**
   * The plugin keeps every sample it was ever sent in a disk cache of its own. When the page's
   * storage has lost one (browsers and hosts do clear it), the cached copy comes back as a WAV and
   * is stored again.
   */
  async function audioFromPlugin(audioId: string): Promise<Blob | null> {
    if (!inNative()) return null
    const pcm = await callNative<{ rate: number; channels: number; data: string } | null>('ssbGetAudio', audioId).catch(() => null)
    if (!pcm?.data) return null
    const blob = encodeWav(planarFromBase64(pcm.data, pcm.channels), pcm.rate)
    await set(audioKey(audioId), blob)
    return blob
  }

  /**
   * Before the library was shared, each plugin instance kept a board of its own, so every new
   * instance started blank. The first load since merges them all: every sound and patch once (the
   * built-in waves and factory patches each board installed, once by name), presets by id.
   */
  async function mergeLegacyBoards(): Promise<SavedBoard | null> {
    const boards: SavedBoard[] = []
    for (const k of await keys()) {
      if (typeof k !== 'string' || !k.startsWith(LEGACY_BOARD)) continue
      const b = await get<SavedBoard>(k)
      if (b?.sounds) boards.push(b)
    }
    if (!boards.length) return null
    const size = (b: SavedBoard) => b.sounds.length + (b.patches?.length ?? 0)
    boards.sort((a, b) => size(b) - size(a))
    const out: SavedBoard = { version: 1, master: boards[0].master, sounds: [], presets: [], patches: [] }
    const soundIds = new Set<string>()
    const builtIn = new Map<string, string>() // name -> kept id
    const remap = new Map<string, string>() // dropped duplicate id -> kept id
    for (const b of boards)
      for (const s of b.sounds) {
        if (soundIds.has(s.id)) continue
        if (isSynthAudioId(s.audioId)) {
          const kept = builtIn.get(s.settings.name)
          if (kept) {
            remap.set(s.id, kept)
            continue
          }
          builtIn.set(s.settings.name, s.id)
        }
        soundIds.add(s.id)
        out.sounds.push(s)
      }
    const patchIds = new Set<string>()
    const factory = new Set<string>()
    for (const b of boards)
      for (const p of b.patches ?? []) {
        if (patchIds.has(p.id)) continue
        const isFactory = /\bfactory\b/.test(p.tag)
        if (isFactory && factory.has(p.name)) continue
        if (isFactory) factory.add(p.name)
        patchIds.add(p.id)
        for (const x of p.slots ?? []) if (x && remap.has(x.layer.soundId)) x.layer.soundId = remap.get(x.layer.soundId)!
        out.patches!.push(p)
      }
    const presetIds = new Set<string>()
    for (const b of boards) for (const p of b.presets ?? []) if (!presetIds.has(p.id)) (presetIds.add(p.id), out.presets!.push(p))
    out.master = { ...out.master, factory: true }
    toast.value = `Library restored: ${out.sounds.length} sounds, ${out.patches!.length} patches`
    return out
  }

  // ── a plugin instance's own settings (saved with the host session) ─────
  const INSTANCE_ALL = [...INSTANCE_FIELDS, ...VIEW_FIELDS]
  const pickInstance = (m: MasterState) => Object.fromEntries(INSTANCE_ALL.map((k) => [k, clone(m[k])]))
  const instanceView = (): InstanceView =>
    clone({
      openPanels: [...openPanels],
      tagFilter: tagFilter.value,
      tagHidden: tagHidden.value,
      patchTagFilter: patchTagFilter.value,
      patchTagHidden: patchTagHidden.value,
      similarTo,
      scroll: view.scroll,
    })
  const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [])
  function applyInstance(json: string | undefined | null) {
    if (!json) return false
    try {
      const st = JSON.parse(json) as { master?: Partial<MasterState>; view?: Partial<InstanceView>; edit?: { id: string; body: string } }
      const m = st.master ?? {}
      for (const k of INSTANCE_ALL) if (k in m) (master as Record<string, unknown>)[k] = clone(m[k])
      // the patch as the session left it: its unsaved edits, still unsaved
      if (st.edit?.id === master.patchId) applyDraft(st.edit)
      // a session saved before the view was kept opens as the editor always did
      const v = st.view
      if (v) {
        openPanels.clear()
        for (const id of strings(v.openPanels)) openPanels.add(id)
        tagFilter.value = strings(v.tagFilter)
        tagHidden.value = strings(v.tagHidden)
        patchTagFilter.value = strings(v.patchTagFilter)
        patchTagHidden.value = strings(v.patchTagHidden)
        Object.assign(similarTo, { sounds: null, patches: null }, v.similarTo ?? {})
        view.scroll = { ...(v.scroll ?? {}) }
        view.restored++
      }
      return true
    } catch {
      return false
    }
  }
  let instanceTimer: ReturnType<typeof setTimeout> | undefined
  async function restoreInstance() {
    const info = await nativeInfo().catch(() => null)
    if (!applyInstance(info?.state)) {
      // an instance from before the shared library had a board of its own: keep its settings;
      // a new instance starts in keyboard play, with pads mapped to notes automatically
      const own = await get<SavedBoard>(LEGACY_BOARD + nativeBoardKey())
      if (own?.master) applyInstance(JSON.stringify({ master: pickInstance(migrateMaster(own.master)) }))
      else Object.assign(master, { play: true, midiAuto: true })
    }
    watch(
      () => [INSTANCE_ALL.map((k) => master[k]), instanceView(), editDraft.value?.body],
      () => {
        clearTimeout(instanceTimer)
        instanceTimer = setTimeout(() => {
          const state = { v: 2, master: pickInstance(master), view: instanceView(), edit: editDraft.value ?? undefined }
          void callNative('ssbSetState', JSON.stringify(state)).catch(() => {})
        }, 300)
      },
      { deep: true, immediate: true },
    )
    // a host that restores the session after the window opened
    onNative<string>('ssbState', (json) => applyInstance(json))
  }

  // ── several SSBs, one library: the others reload after one saves ──────
  let applyingRemote = false
  libraryChannel?.addEventListener('message', (e: MessageEvent<{ type: string; from: string }>) => {
    if (e.data?.type === 'saved' && e.data.from !== pageId && loaded.value) void reloadLibrary()
  })
  async function reloadLibrary() {
    const saved = await get<SavedBoard>(BOARD_KEY)
    if (!saved) return
    // sounds and patches that didn't change stay as they are (thousands of waves needn't be built again)
    const keep = new Map(toRaw(sounds.value).map((x) => [soundText(x), x]))
    const fresh = saved.sounds.filter((x) => !keep.has(JSON.stringify(x)))
    const read = new Map((await readSounds(fresh)).map((x) => [x.id, x]))
    const list = saved.sounds.map((x) => keep.get(JSON.stringify(x)) ?? read.get(x.id)).filter((x): x is Sound => !!x)
    const keepP = new Map(toRaw(patches.value).map((x) => [patchText(x), x]))
    // this instance's edits stay its own, over whatever was saved meanwhile
    const draft = editDraft.value
    applyingRemote = true
    try {
      presets.value = (saved.presets ?? []).map((p) => ({ ...p, settings: migratePresetSettings(p.settings) }))
      patches.value = (saved.patches ?? []).map((x) => keepP.get(JSON.stringify(x)) ?? tracked(migratePatch(x)))
      sounds.value = list
      markAllSaved()
      applyDraft(draft)
      await nextTick()
    } finally {
      applyingRemote = false
    }
  }

  /** Deleted pads keep their audio for undo; blobs nothing references are dropped on the next load. */
  async function collectOrphanAudio() {
    const used = new Set(sounds.value.flatMap((s) => soundAudioIds(s).map(audioKey)))
    // audio any stored board still needs (other tabs; boards from before the shared library)
    const all = await keys()
    for (const k of all) {
      if (typeof k !== 'string' || !k.startsWith('ssb:board')) continue
      const b = await get<SavedBoard>(k)
      for (const s of b?.sounds ?? []) for (const id of soundAudioIds(s)) used.add(audioKey(id))
    }
    for (const k of all) {
      if (typeof k !== 'string' || !k.startsWith('ssb:audio:')) continue
      // AKWF waves' audio is made from the waves that ship with SSB (0.5 stored a copy)
      if (!used.has(k) || isAkwfAudioId(k.slice('ssb:audio:'.length))) await del(k)
    }
  }

  let saveTimer: ReturnType<typeof setTimeout> | undefined
  function scheduleSave() {
    if (!loaded.value || applyingRemote) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const board = savedBoard()
      set(BOARD_KEY, board).then(() => libraryChannel?.postMessage({ type: 'saved', from: pageId })).catch((e) => {
        console.error(e)
        toast.value = 'Saving the board failed'
      })
    }, 300)
  }

  /**
   * The board as stored: sounds and patches from their kept JSON (only what changed is serialised again); a patch
   * with edits as it was saved.
   */
  function savedBoard(): SavedBoard {
    const snap = snapshot()
    const stored = toRaw(patches.value).map((p, i) => {
      if (!isEdited(p)) return snap.patches[i]
      const [slots, header, mpe] = JSON.parse(savedBodies.get(p.id)!)
      return JSON.stringify({ ...untrack(p), slots, header: { ...untrack(p).header, ...header }, mpe })
    })
    return {
      version: 1,
      sounds: JSON.parse(`[${snap.sounds.join(',')}]`),
      master: clone(master),
      presets: clone(presets.value),
      patches: JSON.parse(`[${stored.join(',')}]`),
      edit: editDraft.value,
    }
  }

  /** Track whatever joined the list untracked (code that pushed a plain object), and note the change. */
  function adopt<T extends object>(list: Ref<T[]>) {
    const arr = list.value
    toRaw(arr).forEach((item, i) => {
      if (!isTracked(item)) arr[i] = tracked(item)
    })
    changes.value++
  }
  // Writes inside sounds and patches arrive as `changes` (a deep watch over thousands of sounds would walk every
  // setting on every knob step); the lists themselves are watched one level deep, for adds, removes and moves.
  watch(sounds, () => adopt(sounds), { deep: 1 })
  watch(
    patches,
    () => {
      adopt(patches)
      // a patch new to the board is saved as it arrives (made, duplicated, imported, undeleted)
      for (const p of patches.value) if (!savedBodies.has(p.id)) markSaved(p)
    },
    { deep: 1 },
  )
  watch(changes, () => {
    engine.refreshVoices()
    scheduleSave()
    scheduleHistory()
  })
  watch(
    master,
    () => {
      engine.setMaster(master.volume, master.muted)
      pushGlobalFx()
      engine.setGlobalMatrix(master.mod)
      scheduleSave()
      scheduleHistory()
    },
    { deep: true, immediate: true },
  )
  watch(presets, scheduleSave, { deep: true })
  // the selected patch remembers the header knobs: edits there save into it
  watch(
    () => headerOf(master),
    (h) => {
      const p = selectedPatch.value
      if (p && JSON.stringify(h) !== JSON.stringify(p.header)) p.header = h
    },
    { deep: true },
  )
  function pushGlobalFx() {
    const fx = master.fx
    const delayTime = fx.delaySync ? Math.min(2.4, (divisionBeats(fx.delayDivision) * 60) / bpm.value) : fx.delayTime
    engine.setGlobalFx({ ...fx, delayTime })
  }
  watch(bpm, (v) => {
    engine.setTempo(v)
    pushGlobalFx()
  }, { immediate: true })
  watch(() => perform.sustain, (on) => !on && releaseSustained())
  // In the plugin the header's performance controls reach the engine as MIDI -- when they were moved here. What the
  // host sent went to the engine directly; echoing it back arrived late (after the page had seen it, behind any
  // pending sync) and could undo a newer value: a sustain-on landing after the pedal's off held every note released
  // after it (in MONO the last note rang on, stuck).
  if (engine.external) {
    const midi7 = (v: number) => Math.max(0, Math.min(127, Math.round(v * 127)))
    const send = (bytes: number[]) => toEngine({ type: 'midi', bytes })
    const echo = <K extends keyof typeof fromHost>(k: K, v: (typeof perform)[K], bytes: () => number[]) => {
      if (fromHost[k] !== v) send(bytes())
    }
    watch(() => perform.mod, (v) => echo('mod', v, () => [0xb0, 1, midi7(v)]))
    watch(() => perform.sustain, (on) => echo('sustain', on, () => [0xb0, 64, on ? 127 : 0]))
    watch(() => perform.timbre, (v) => echo('timbre', v, () => [0xb0, 74, midi7(v)]))
    watch(() => perform.pressure, (v) => echo('pressure', v, () => [0xd0, midi7(v), 0]))
    watch(() => perform.bend, (v) =>
      echo('bend', v, () => {
        const raw = Math.max(0, Math.min(16383, Math.round(8192 + v * (v >= 0 ? 8191 : 8192))))
        return [0xe0, raw & 0x7f, raw >> 7]
      }),
    )
  }
  watch(() => perform.mod, (v) => {
    engine.setModWheel(v)
    engine.setCC(1, v)
  })
  watch(() => perform.bend, (v) => engine.setBend(v))
  watch(() => perform.pressure, (v) => engine.setChannelPressure(v))
  watch(() => perform.timbre, (v) => engine.setTimbre(v))
  watch(() => master.mpeBendRange, (v) => engine.setMpeBendRange(v), { immediate: true })
  // MPE on / off brings the patches' MPE bindings in or out
  watch(() => master.mpe, () => engine.refreshVoices())

  // ── undo / redo ────────────────────────────────────────────────────────
  /**
   * What undo covers: pads and the sound-shaping header state (not volume, view or selection). Each sound and patch
   * is its own JSON, kept until it is written to, so a snapshot is cheap and shares what didn't change.
   */
  interface Snapshot {
    sounds: string[]
    patches: string[]
    rest: string
  }
  const snapshot = (): Snapshot => ({
    sounds: toRaw(sounds.value).map(soundText),
    patches: toRaw(patches.value).map(patchText),
    rest: JSON.stringify({ fx: master.fx, mod: master.mod, glide: master.glide, mono: master.mono }),
  })
  const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])
  const history = new History<Snapshot>(
    { sounds: [], patches: [], rest: '' },
    100,
    (a, b) => a.rest === b.rest && sameList(a.sounds, b.sounds) && sameList(a.patches, b.patches),
  )
  let historyTimer: ReturnType<typeof setTimeout> | undefined
  function syncHistoryFlags() {
    canUndo.value = history.canUndo
    canRedo.value = history.canRedo
  }
  function commitHistory() {
    clearTimeout(historyTimer)
    historyTimer = undefined
    history.commit(snapshot())
    syncHistoryFlags()
  }
  /** Coalesce a burst of edits (e.g. a knob drag) into one undo step. */
  function scheduleHistory() {
    if (!loaded.value || applyingRemote) return
    clearTimeout(historyTimer)
    historyTimer = setTimeout(commitHistory, 400)
  }
  function restore(state: Snapshot) {
    const rest = JSON.parse(state.rest) as { fx: MasterState['fx']; mod: MasterState['mod']; glide: number; mono: boolean }
    // unchanged sounds stay as they are; changed ones take the snapshot's settings in place, so playing voices
    // (which hold the settings object) follow along
    const same = new Map(sounds.value.map((x) => [soundText(x), x]))
    const current = new Map(sounds.value.map((x) => [x.id, x]))
    sounds.value = state.sounds
      .map((text) => {
        const hit = same.get(text)
        if (hit) return hit
        const x = expandSound(JSON.parse(text) as Sound)
        const cur = current.get(x.id)
        if (!cur) return x
        Object.assign(cur.settings, x.settings)
        if (!!cur.fav !== !!x.fav) cur.fav = x.fav
        return cur
      })
      .filter((x) => soundAudioIds(x).every(engine.hasAudio))
    // patches too, in place (voices hold layer settings)
    const sameP = new Map(patches.value.map((p) => [patchText(p), p]))
    const curP = new Map(patches.value.map((p) => [p.id, p]))
    patches.value = state.patches.map((text) => {
      const hit = sameP.get(text)
      if (hit) return hit
      const p = JSON.parse(text) as Patch
      const cur = curP.get(p.id)
      if (!cur) return p
      const curL = new Map(patchLayers(cur).map((l) => [l.id, l]))
      cur.name = p.name
      cur.tag = p.tag
      cur.fav = p.fav
      cur.header = p.header
      cur.mpe = p.mpe
      cur.slots = p.slots.map((x) => {
        if (!x) return null
        const c = curL.get(x.layer.id)
        if (!c) return x
        Object.assign(c.settings, x.layer.settings)
        c.soundId = x.layer.soundId
        return { ...x, layer: c }
      })
      return cur
    })
    Object.assign(master.fx, rest.fx)
    Object.assign(master.mod, rest.mod)
    master.glide = rest.glide
    master.mono = rest.mono
    if (!selected.value) master.selectedId = sounds.value[0]?.id ?? null
  }
  function undo() {
    if (historyTimer) commitHistory()
    const st = history.undo()
    if (st) restore(st)
    syncHistoryFlags()
  }
  function redo() {
    if (historyTimer) commitHistory()
    const st = history.redo()
    if (st) restore(st)
    syncHistoryFlags()
  }

  // ── pads ───────────────────────────────────────────────────────────────
  // ── notes: plain pads shift their one sample; SFZ pads pick zones by key × velocity ──
  const roundRobin = new Map<string, number>()
  const semisFor = (sound: Sound, zone: Zone | undefined, note: number) =>
    zone ? zoneSemis(zone, note) : note - sound.settings.rootNote
  const zonePlay = (z: Zone, note: number, velocity: number, extraDb = 0): ZonePlay => ({
    audioId: z.audioId,
    gain: Math.pow(10, (z.volume + extraDb) / 20),
    pan: z.pan / 100,
    start: z.offset,
    end: z.end,
    loop: (z.loopMode === 'loop_continuous' || z.loopMode === 'loop_sustain') && z.loopEnd > z.loopStart ? [z.loopStart, z.loopEnd] : null,
    oneShot: z.loopMode === 'one_shot',
    env: z.env,
    // filter cutoff follows the key (fil_keytrack) and velocity (fil_veltrack), in cents
    filter: z.filter && {
      type: z.filter.type,
      freq: z.filter.cutoff * Math.pow(2, ((note - z.filter.keycenter) * z.filter.keytrack + velocity * z.filter.veltrack) / 1200),
      resonance: z.filter.resonance,
      env: z.filter.env,
    },
    lfos: z.lfos,
    ccMods: z.ccMods,
    amplitude: z.amplitude,
  })

  /**
   * Start every voice a note needs: the pad's own (several when SFZ regions layer) plus its linked VCO pads.
   * VCOs start first so their signals can feed this pad's mod matrix (VCO 1–3). `fromNote` = note to glide from.
   */
  function startNote(
    sound: Sound,
    note: number,
    velocity: number,
    base: VoiceOptions & { silent?: boolean } = {},
    fromNote: number | null = null,
    asVco = false,
  ): Voice[] {
    const vcoVoices: Voice[] = []
    const taps: (AudioNode | null)[] = [null, null, null]
    // one start time for every voice of the note (see VoiceOptions.at)
    if (base.at === undefined && !engine.external) base = { ...base, at: engine.noteStart() }
    // what the keyboard plays in a patch joins adaptive tuning; pads and release samples stay as they are
    const slots = !asVco && base.midiNote !== undefined ? tunedSlots(sound) : null
    const played = base.midiNote ?? note
    if (!asVco) {
      vcoLinks(sound).forEach(({ index: i, osc, slot }) => {
        if (osc.id === sound.id) return
        // TRACK follows the played key (so the VCO keeps its interval to the patch); FIXED always plays its note
        const vNote = (slot.track ? note - sound.settings.rootNote + osc.settings.rootNote : slot.fixedNote) + slot.transpose
        const vFrom = slot.track && fromNote !== null ? fromNote - sound.settings.rootNote + osc.settings.rootNote + slot.transpose : null
        const started = startNote(
          osc,
          vNote,
          velocity,
          {
            ...base,
            group: sound.id,
            level: slot.level,
            detune: slot.fine,
            silent: !slot.audible,
            tuning: slots ? voiceTuning(slots, i, played, slot.track ? null : vNote) : undefined,
          },
          vFrom,
          true,
        )
        vcoVoices.push(...started)
        taps[i] = started[0]?.tap ?? null
      })
    }
    const tuning = slots ? voiceTuning(slots, slots.findIndex((x) => x?.layer.id === sound.id), played, null) : base.tuning
    return [...startOwn(sound, note, velocity, { ...base, modTaps: taps, tuning }, fromNote), ...vcoVoices]
  }

  /**
   * Oscillators layered onto a sound: for a patch's main voice, the patch's other slots (tap index = slot number, so
   * VCO n in the matrix is slot n); for a plain pad, its legacy settings.vcos links.
   */
  function vcoLinks(sound: Sound): { index: number; osc: Sound; slot: Omit<VcoSlot, 'soundId'> }[] {
    const hit = layerIndex.value.get(sound.id)
    if (hit) {
      return hit.patch.slots
        .map((x, index) => (x && x.layer.id !== sound.id ? { index, osc: layerSound(x.layer), slot: x } : null))
        .filter((x): x is { index: number; osc: Sound; slot: PatchSlot } => !!x?.osc)
    }
    return sound.settings.vcos
      .map((slot, index) => {
        const osc = slot.soundId ? resolveSound(slot.soundId) : undefined
        return osc ? { index, osc, slot } : null
      })
      .filter((x): x is { index: number; osc: Sound; slot: VcoSlot } => !!x)
  }

  function startOwn(sound: Sound, note: number, velocity: number, base: VoiceOptions & { silent?: boolean }, fromNote: number | null): Voice[] {
    const glide = base.glideTime ?? 0
    const opts = (zone?: Zone): VoiceOptions => {
      const semis = semisFor(sound, zone, note)
      return {
        ...base,
        velocity,
        note: semis,
        glideFrom: glide > 0 && fromNote !== null ? semisFor(sound, zone, fromNote) : semis,
        zone: zone && zonePlay(zone, note, velocity),
      }
    }
    if (!sound.zones?.length) {
      const v = engine.startVoice(sound, opts())
      return v ? [v] : []
    }
    const n = roundRobin.get(sound.id) ?? 0
    roundRobin.set(sound.id, n + 1)
    noteStarts.set(`${sound.id}:${note}`, { velocity, at: performance.now() })
    return pickZones(sound.zones, note, velocity * 127, n, Math.random(), { cc: engine.ccValues() })
      .map((z) => engine.startVoice(sound, opts(z)))
      .filter((v): v is Voice => !!v)
  }

  /** Note-off for SFZ release regions (trigger=release): quieter the longer the note was held (rt_decay). */
  const noteStarts = new Map<string, { velocity: number; at: number }>()
  function triggerRelease(sound: Sound | null | undefined, note: number) {
    if (!sound?.zones?.some((z) => z.trigger === 'release')) return
    const start = noteStarts.get(`${sound.id}:${note}`)
    noteStarts.delete(`${sound.id}:${note}`)
    const velocity = start?.velocity ?? 1
    const held = start ? (performance.now() - start.at) / 1000 : 0
    const zones = pickZones(sound.zones, note, velocity * 127, roundRobin.get(sound.id) ?? 0, Math.random(), {
      trigger: 'release',
      cc: engine.ccValues(),
    })
    for (const z of zones) {
      const semis = semisFor(sound, z, note)
      // release voices never get a note-off, so they must not loop
      const zone = { ...zonePlay(z, note, velocity, -(z.rtDecay ?? 0) * held), loop: null }
      engine.startVoice(sound, { velocity, note: semis, midiNote: note, zone })
    }
  }

  /**
   * In the plugin the native engine plays; the page sends it what was clicked or typed. The engine holds only the
   * sounds it may play (native/engineSync.ts), so a command naming a sound waits until the engine has it; commands
   * keep their order.
   */
  let engineGate: (id?: string) => Promise<void> = async () => {}
  let engineQueue: Promise<unknown> = Promise.resolve()
  const toEngine = (command: Record<string, unknown>) => {
    engineQueue = engineQueue
      .then(() => engineGate(typeof command.id === 'string' ? command.id : undefined))
      .then(() => callNative('ssbCommand', command))
      .catch(() => {})
  }
  const setEngineGate = (gate: (id?: string) => Promise<void>) => void (engineGate = gate)

  function press(id: string, velocity = 1) {
    const sound = resolveSound(id)
    if (!sound) return
    if (engine.external) {
      pressed.add(id)
      return toEngine({ type: 'press', id, velocity })
    }
    engine.resume()
    pressed.add(id)
    const { mode, choke } = sound.settings
    if (engine.isHeld(id)) {
      if (mode === 'stop') return engine.releaseSound(id)
      if (mode !== 'stack') engine.stopSound(id)
    }
    if (choke > 0) {
      for (const other of sounds.value) {
        if (other.id !== id && other.settings.choke === choke) engine.stopSound(other.id)
      }
    }
    startNote(sound, sound.settings.rootNote, velocity)
  }

  function release(id: string) {
    pressed.delete(id)
    if (engine.external) return toEngine({ type: 'release', id })
    const sound = resolveSound(id)
    if (sound?.settings.mode !== 'hold') return
    if (perform.sustain) sustainedPads.add(id)
    else {
      engine.releaseSound(id)
      triggerRelease(sound, sound.settings.rootNote)
    }
  }

  // ── sustain pedal ─────────────────────────────────────────────────────
  const sustainedPads = new Set<string>()
  /** poly voice keys released while the pedal was down */
  const sustainedKeys = new Set<string>()
  let monoSustained = false
  function releaseSustained() {
    for (const id of sustainedPads) {
      if (pressed.has(id)) continue
      engine.releaseSound(id)
      const sound = byId(id)
      if (sound) triggerRelease(sound, sound.settings.rootNote)
    }
    sustainedPads.clear()
    for (const key of sustainedKeys) {
      const vs = polyVoices.get(key)
      releaseAll(vs)
      polyVoices.delete(key)
      if (vs?.[0]?.midiNote !== undefined) triggerRelease(playable.value, vs[0].midiNote)
    }
    sustainedKeys.clear()
    if (monoSustained && !heldNotes.value.length) {
      releaseAll(monoVoices)
      monoVoices = []
    }
    monoSustained = false
  }

  // ── Adaptive tuning: each VCO's mode follows the chord the keyboard is holding (audio/adaptiveTuning.ts) ──
  const tuners = new Map<TuningMode, AdaptiveTuner>()
  const tunerFor = (mode: TuningMode) => {
    let t = tuners.get(mode)
    if (!t) tuners.set(mode, (t = new AdaptiveTuner(mode)))
    return t
  }
  /** a patch's VCO slots, when `sound` is its main voice */
  const tunedSlots = (sound: Sound | null | undefined) => (sound && layerIndex.value.get(sound.id)?.patch.slots) || null
  /** A VCO's tuning in cents: its own key's, or for a FIXED VCO the chord's for the note it sounds. */
  function slotCents(slots: (PatchSlot | null)[], slot: number, key: number, fixed: number | null) {
    const x = slots[slot]
    return x && x.tuning !== 'et' ? tunerFor(x.tuning).cents(fixed ?? key) * x.tuningDepth : 0
  }
  const voiceTuning = (slots: (PatchSlot | null)[], slot: number, key: number, fixed: number | null): VoiceTuning => {
    const pc = fixed === null ? null : ((fixed % 12) + 12) % 12
    return { slot, pc, cents: slotCents(slots, slot, key, pc) }
  }
  const heldAges = new Float64Array(12)
  const ringAges = new Float64Array(12)
  /**
   * The chord changed, or a VCO's mode or depth did: tune for what's sounding, plus `note` when it is about to start.
   * The chord is read from the voices, so the pedal, HOLD and stolen notes need nothing from here.
   */
  function retune(note?: number) {
    const slots = tunedSlots(playable.value)
    if (engine.external || !slots) return
    const voices = engine.keyboardVoices()
    const now = engine.voiceTime()
    heldAges.fill(-1)
    ringAges.fill(-1)
    for (const v of voices) {
      if (v.midiNote === undefined) continue
      const pc = v.midiNote % 12
      const age = Math.max(0, now - v.t0)
      ringAges[pc] = Math.max(ringAges[pc], age)
      if (v.held) heldAges[pc] = Math.max(heldAges[pc], age)
    }
    if (note !== undefined) {
      heldAges[note % 12] = Math.max(heldAges[note % 12], 0)
      ringAges[note % 12] = Math.max(ringAges[note % 12], 0)
    }
    const modes = new Set(slots.map((x) => x?.tuning ?? 'et'))
    for (const mode of modes) if (mode !== 'et') tunerFor(mode).chord(heldAges, ringAges, now)
    for (const v of voices) {
      if (v.held && v.tuning && v.midiNote !== undefined) v.retune(slotCents(slots, v.tuning.slot, v.midiNote, v.tuning.pc))
    }
  }

  // ── keyboard play (MIDI / computer keys → selected patch) ─────────────
  const polyVoices = new Map<string, Voice[]>()
  let monoVoices: Voice[] = []
  let lastNote: number | null = null
  const releaseAll = (vs?: Voice[]) => vs?.forEach((v) => v.release())
  /** MPE member-channel controller values, kept so a note starts where its channel already is */
  const mpeChannels = new Map<number, { bend: number; pressure: number; timbre: number }>()
  /** which channels are MPE members: a lower zone of 15 until a device's MCM says otherwise (audio/mpe.ts) */
  const mpeZones = new MpeZones()
  const isMember = (ch?: number): ch is number => master.mpe && ch !== undefined && mpeZones.isMember(ch)
  const mpeState = (ch: number) => {
    let st = mpeChannels.get(ch)
    if (!st) mpeChannels.set(ch, (st = { bend: 0, pressure: 0, timbre: perform.timbre }))
    return st
  }
  const voiceKey = (note: number, ch?: number) => (isMember(ch) ? `${ch}:${note}` : `${note}`)

  // ── HOLD: Granulator III's latch, in front of mono / poly ──────────────
  // (with the native engine playing, it latches: the page passes every note on as it comes)
  /** keys physically down, and the ones HOLD keeps sounding after they came up */
  const downKeys = new Set<string>()
  const latched = new Map<string, { note: number; channel?: number }>()
  function releaseLatched() {
    const notes = [...latched.values()]
    latched.clear()
    for (const n of notes) playNoteOff(n.note, n.channel)
  }
  watch(() => master.hold, (on) => !on && releaseLatched())

  function noteOn(note: number, velocity = 1, channel?: number) {
    const key = voiceKey(note, channel)
    // a note with no key down lets the latched chord go first; one played while keys are down joins it
    if (!engine.external && master.hold && !downKeys.size) releaseLatched()
    downKeys.add(key)
    latched.delete(key)
    return playNoteOn(note, velocity, channel)
  }

  function noteOff(note: number, channel?: number) {
    const key = voiceKey(note, channel)
    downKeys.delete(key)
    if (!engine.external && master.hold) return void latched.set(key, { note, channel })
    return playNoteOff(note, channel)
  }

  function playNoteOn(note: number, velocity = 1, channel?: number) {
    const sound = playable.value
    if (!sound) return
    if (engine.external) {
      heldNotes.value = [...heldNotes.value.filter((n) => n !== note), note]
      return toEngine({ type: 'noteOn', note, velocity, channel: channel ?? 0 })
    }
    engine.resume()
    const glide = master.glide
    heldNotes.value = [...heldNotes.value.filter((n) => n !== note), note]
    // the channel is this note's now: one still releasing from it keeps the bend it ended with
    if (isMember(channel)) engine.claimChannel(channel)
    const base: VoiceOptions = {
      midiNote: note,
      glideTime: glide,
      ...(isMember(channel) ? { channel, noteBend: mpeState(channel).bend, pressure: mpeState(channel).pressure, timbre: mpeState(channel).timbre } : {}),
    }
    const from = lastNote
    lastNote = note
    // MPE is inherently polyphonic: every note has its own channel
    if (master.mono && !isMember(channel)) {
      // legato: slide the held voice (single-sample pads; SFZ zones change sample, so they retrigger)
      const [only] = monoVoices
      if (monoVoices.length === 1 && only.held && only.soundId === sound.id && !sound.zones?.length) {
        only.glideTo(semisFor(sound, undefined, note), glide, note)
        retune()
        engine.publish()
        return
      }
      releaseAll(monoVoices)
      retune(note)
      monoVoices = startNote(sound, note, velocity, base, from)
    } else {
      const key = voiceKey(note, channel)
      releaseAll(polyVoices.get(key))
      sustainedKeys.delete(key)
      retune(note)
      polyVoices.set(key, startNote(sound, note, velocity, base, from))
    }
  }

  function playNoteOff(note: number, channel?: number) {
    heldNotes.value = heldNotes.value.filter((n) => n !== note)
    if (engine.external) return toEngine({ type: 'noteOff', note, channel: channel ?? 0 })
    // MONO can change while keys are down (another patch selected): what a note started under the other mode ends
    // with it too, or it would sound on with nothing left to release it (the plugin's engine does the same)
    const monoNow = master.mono && !isMember(channel)
    const held = voiceKey(note, channel)
    if (monoNow && polyVoices.has(held)) {
      if (perform.sustain) sustainedKeys.add(held)
      else {
        releaseAll(polyVoices.get(held))
        polyVoices.delete(held)
      }
    }
    if (!monoNow && monoVoices.length && (!heldNotes.value.length || monoVoices[0].midiNote === note)) {
      if (perform.sustain) monoSustained = true
      else {
        releaseAll(monoVoices)
        monoVoices = []
      }
    }
    if (monoNow) {
      if (!monoVoices.length) return
      const top = heldNotes.value.at(-1)
      const sound = playable.value
      if (top === undefined) {
        if (perform.sustain) monoSustained = true
        else {
          releaseAll(monoVoices)
          monoVoices = []
          triggerRelease(sound, note)
        }
      } else if (sound && top !== monoVoices[0].midiNote) {
        // fall back to the previous held note, legato
        const from = lastNote
        lastNote = top
        if (monoVoices.length === 1 && !sound.zones?.length) {
          monoVoices[0].glideTo(semisFor(sound, undefined, top), master.glide, top)
          retune()
          engine.publish()
        } else {
          releaseAll(monoVoices)
          retune(top)
          monoVoices = startNote(sound, top, 1, { midiNote: top, glideTime: master.glide }, from)
        }
      }
    } else {
      const key = voiceKey(note, channel)
      if (perform.sustain) return void sustainedKeys.add(key)
      releaseAll(polyVoices.get(key))
      polyVoices.delete(key)
      triggerRelease(playable.value, note)
    }
  }

  function allNotesOff() {
    heldNotes.value = []
    downKeys.clear()
    latched.clear()
    polyVoices.clear()
    mpeChannels.clear()
    sustainedKeys.clear()
    sustainedPads.clear()
    monoSustained = false
    monoVoices = []
  }

  function panic() {
    if (engine.external) toEngine({ type: 'panic' })
    engine.stopAll()
    pressed.clear()
    allNotesOff()
    for (const t of tuners.values()) t.reset()
    perform.bend = 0
    perform.pressure = 0
  }

  /** An instrument's CC defaults: on load and whenever it becomes what the keys play. */
  function applyCcDefaults(sound: Sound | null | undefined) {
    for (const [cc, v] of Object.entries(sound?.ccDefaults ?? {})) engine.setCC(+cc, v)
  }
  // clicking a pad selects it: that only changes what the keys play when no patch is selected
  watch(playable, (s) => applyCcDefaults(s))
  // a held chord (HOLD, the pedal) follows MODE and DEPTH as they're turned
  watch(() => tunedSlots(playable.value)?.map((x) => x && `${x.tuning} ${x.tuningDepth}`).join(), () => retune())

  // ── themes ─────────────────────────────────────────────────────────────
  const theme = computed(() => themeById(master.theme))
  function cycleTheme(dir: 1 | -1 = 1) {
    const i = THEMES.findIndex((t) => t.id === theme.value.id)
    master.theme = THEMES[(i + dir + THEMES.length) % THEMES.length].id
    toast.value = `THEME · ${theme.value.name}`
  }

  // ── patch selection ────────────────────────────────────────────────────
  function select(id: string) {
    master.selectedId = id
  }

  /** The item after `id` in `list` (or else the nearest before it) that isn't `gone`. */
  function survivor(list: { id: string }[], id: string | null, gone: Set<string>) {
    const i = list.findIndex((x) => x.id === id)
    if (i < 0) return undefined
    return (list.slice(i + 1).find((x) => !gone.has(x.id)) ?? list.slice(0, i).reverse().find((x) => !gone.has(x.id)))?.id
  }

  /** Step the selected patch through the grid order, wrapping. */
  function selectStep(dir: 1 | -1) {
    const list = visible.value
    if (!list.length) return
    const i = list.findIndex((s) => s.id === master.selectedId)
    const next = i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length
    master.selectedId = list[next].id
  }

  // ── patches ────────────────────────────────────────────────────────────
  /** A layer: the patch's own copy of a sound's settings (VCO links don't nest). */
  const makeLayer = (sound: Sound): PatchLayer => {
    const settings = clone(sound.settings)
    settings.vcos = []
    settings.midiNote = null
    return { id: uid(), soundId: sound.id, settings }
  }

  function selectPatch(id: string | null) {
    master.patchId = id
    const p = selectedPatch.value
    if (p) loadHeader(p)
  }
  /**
   * The header knobs take a patch's (not MPE nor its bend range: they're the controller's, and stay with the instance;
   * a patch's MPE bindings act whenever MPE is on).
   */
  function loadHeader(p: Patch) {
    const h = clone(p.header)
    Object.assign(master, { volume: h.volume, glide: h.glide, mono: h.mono, bpm: h.bpm })
    Object.assign(master.fx, h.fx)
    Object.assign(master.mod, h.mod)
  }

  // ── saving patches: edits wait for SAVE (see savedBodies) ──
  /**
   * What a patch sounds like: what an edit changes and SAVE keeps. (The header's MPE on / off and bend range are the
   * controller's: they follow it into the header but aren't edits.)
   */
  function bodyOf(p: Patch): string {
    const r = untrack(p)
    const { mpe: _on, mpeBendRange: _range, ...header } = r.header
    return JSON.stringify([r.slots, header, r.mpe ?? []])
  }
  /** a built-in patch: SAVE leaves it as it was made, and keeps its edits as a patch of your own */
  const isBuiltIn = (p: Patch | null | undefined) => !!p?.factoryId
  /** a copy of a built-in made yours: not built in, nor tagged so */
  function ownCopy<T extends Patch>(p: T): T {
    delete p.factoryId
    delete p.factoryLevel
    p.tag = addTags(splitTags(p.tag).filter((t) => t.toLowerCase() !== 'factory').join(', '), ['patch'])
    return p
  }
  /** the patch differs from what was saved of it (a candidate, not on the board yet, has nothing saved) */
  function isEdited(p: Patch): boolean {
    if (!touched.has(p.id)) return false
    const saved = savedBodies.get(p.id)
    return saved !== undefined && bodyOf(p) !== saved
  }
  /** the selected patch has edits: SAVE keeps them, REVERT (or another patch) drops them */
  const patchEdited = computed(() => {
    void changes.value
    void savedTick.value
    const p = selectedPatch.value
    return !!p && isEdited(p)
  })
  /** the selected patch's edits, while it has some: kept with the board / the host session, not in the patch */
  const editDraft = computed(() => {
    void changes.value
    void savedTick.value
    const p = selectedPatch.value
    return p && isEdited(p) ? { id: p.id, body: bodyOf(p) } : null
  })
  /** what's there now is what's saved */
  function markSaved(p: Patch) {
    savedBodies.set(p.id, bodyOf(p))
    touched.delete(p.id)
    savedTick.value++
  }
  /** every patch as it is now is what's saved (after loading, upgrading or reloading the library) */
  function markAllSaved() {
    savedBodies.clear()
    touched.clear()
    for (const p of patches.value) markSaved(p)
  }
  /**
   * A body put back into a patch in place, as undo does: playing voices hold their layer's settings. Layers it hasn't
   * got stop.
   */
  function setBody(p: Patch, [slots, header, mpe]: [(PatchSlot | null)[], Patch['header'], Patch['mpe']]) {
    const curL = new Map(patchLayers(p).map((l) => [l.id, l]))
    const keep = new Set(slots.flatMap((x) => (x ? [x.layer.id] : [])))
    for (const l of curL.values()) if (!keep.has(l.id)) engine.stopSound(l.id)
    p.header = { ...p.header, ...header }
    p.mpe = mpe
    p.slots = slots.map((x) => {
      if (!x) return null
      const c = curL.get(x.layer.id)
      if (!c) return x
      Object.assign(c.settings, x.layer.settings)
      c.soundId = x.layer.soundId
      return { ...x, layer: c }
    })
  }
  /** a patch back as it was saved (the header knobs follow, if it's the selected one) */
  function revertPatch(id = master.patchId) {
    const p = patchById(id)
    const saved = p ? savedBodies.get(p.id) : undefined
    if (!p || saved === undefined) return
    setBody(p, JSON.parse(saved))
    touched.delete(p.id)
    if (p.id === master.patchId) loadHeader(p)
  }
  /** apply a draft (editDraft) kept from before: the patch takes those edits, unsaved */
  function applyDraft(d: { id?: unknown; body?: unknown } | null | undefined) {
    const p = typeof d?.id === 'string' && typeof d.body === 'string' ? patches.value.find((x) => x.id === d.id) : undefined
    if (!p) return
    try {
      const body = JSON.parse(d!.body as string)
      // a draft from before the wavetables: its layers' waves are on the tables now
      for (const x of (body?.[0] ?? []) as (PatchSlot | null)[]) {
        const m = x && movedWaves.get(x.layer.soundId)
        if (x && m) Object.assign(x.layer, { soundId: m.table, settings: { ...x.layer.settings, wtSize: AKWF_FRAMES, wt: m.wt, wtBlend: 0 } })
      }
      setBody(p, body)
      if (p.id === master.patchId) loadHeader(p)
    } catch {
      // a draft that doesn't read is no draft
    }
  }
  /**
   * SAVE: the selected patch's edits become the patch. A built-in stays as it was made: its edits go to a new patch of
   * yours with the same name, beside it, which is selected (the built-in goes back as it was).
   */
  function savePatch(id = master.patchId) {
    const p = patchById(id)
    if (!p) return
    if (p === candidate.value) return saveCandidate()
    if (!isEdited(p)) return void (toast.value = `"${p.name}" has no edits to save`)
    if (!isBuiltIn(p)) {
      markSaved(p)
      scheduleSave()
      toast.value = `Saved "${p.name}"`
      return
    }
    const copy = ownCopy(clone(p))
    copy.id = uid()
    copy.fav = false
    for (const x of copy.slots) if (x) x.layer.id = uid()
    const i = patches.value.findIndex((x) => x.id === p.id)
    patches.value.splice(i + 1, 0, tracked(copy))
    // (choosing it puts the built-in back as it was)
    selectPatch(copy.id)
    toast.value = `Saved "${copy.name}" as a patch of your own: the built-in stays as it was`
  }
  // choosing another patch drops the edits of the one before (and any other, e.g. edits undo brought back)
  watch(
    () => master.patchId,
    (id) => {
      for (const pid of [...touched]) {
        if (pid === id) continue
        const p = patches.value.find((x) => x.id === pid)
        if (p && isEdited(p)) {
          revertPatch(pid)
          toast.value = `"${p.name}": unsaved edits dropped`
        } else touched.delete(pid)
      }
    },
    { flush: 'sync' },
  )

  /** A patch card's ☰: load the patch and show the rack (the one place a patch is edited). */
  function editPatch(id: string) {
    selectPatch(id)
    master.rack = true
  }

  /** Step through the patch catalog (in the tag-filtered order), wrapping. */
  function selectPatchStep(dir: 1 | -1) {
    const list = visiblePatches.value.length ? visiblePatches.value : patches.value
    if (!list.length) return
    const i = list.findIndex((p) => p.id === master.patchId)
    const next = i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length
    selectPatch(list[next].id)
  }

  const emptySlots = (): (PatchSlot | null)[] => Array.from({ length: PATCH_SLOTS }, () => null)

  /** New patch: `soundId` in slot 1 (or empty), with the current header knobs. */
  function newPatch(soundId?: string, name?: string) {
    const src = soundId ? byId(soundId) : undefined
    const slots = emptySlots()
    if (src) slots[0] = newSlot(makeLayer(src))
    const patch: Patch = {
      id: uid(),
      name: name ?? src?.settings.name ?? `Patch ${patches.value.length + 1}`,
      tag: src ? addTags(src.settings.tag, ['patch']) : 'patch',
      slots,
      header: headerOf(master),
    }
    patches.value.push(tracked(patch))
    selectPatch(patch.id)
    toast.value = `New patch "${patch.name}"`
    // the list's own (reactive) patch: callers fill its slots, and the cards should see it
    return patches.value[patches.value.length - 1]
  }

  function duplicatePatch(id: string) {
    const i = patches.value.findIndex((p) => p.id === id)
    if (i < 0) return
    const copy = ownCopy(clone(patches.value[i]))
    copy.id = uid()
    copy.name = `${copy.name} copy`
    for (const x of copy.slots) if (x) x.layer.id = uid()
    patches.value.splice(i + 1, 0, copy)
    // edit the copy, not the original
    selectPatch(copy.id)
  }

  const removePatch = (id: string) => (id === candidate.value?.id ? discardCandidate() : removePatches([id]))

  /** Delete several patches at once (one undo step); the selection moves to the nearest survivor. */
  function removePatches(ids: string[]) {
    const gone = new Set(ids)
    const next = survivor(visiblePatches.value, master.patchId, gone) ?? patches.value.find((p) => !gone.has(p.id))?.id ?? null
    for (const p of patches.value) {
      if (!gone.has(p.id)) continue
      for (const l of patchLayers(p)) engine.stopSound(l.id)
    }
    patches.value = patches.value.filter((p) => !gone.has(p.id))
    if (master.patchId && gone.has(master.patchId)) selectPatch(next)
  }

  /**
   * Put a sound into a slot (0-based) of a patch — the selected one by default, or a new patch if none is selected.
   * The slot gets a fresh layer (a copy of the sound's settings); whatever was there is replaced. null empties it.
   */
  function assignSlot(slot: number, soundId: string | null, patchId = master.patchId) {
    let p = patchById(patchId)
    if (!p) {
      if (!soundId) return
      p = newPatch(undefined, byId(soundId)?.settings.name)
      if (!p) return
    }
    const old = p.slots[slot]
    if (old) engine.stopSound(old.layer.id)
    const src = soundId ? byId(soundId) : undefined
    // keep the slot's mix / tuning when swapping sounds
    p.slots[slot] = src ? { ...(old ?? newSlot(makeLayer(src))), layer: makeLayer(src) } : null
    if (src && p.slots.filter(Boolean).length === 1 && p.name.startsWith('Patch ')) p.name = src.settings.name
  }

  /** Slots (1-based) of the selected patch that hold `soundId` — for the 1 / 2 / 3 buttons on sound cards. */
  function slotsOf(soundId: string): Set<number> {
    const out = new Set<number>()
    selectedPatch.value?.slots.forEach((x, i) => x?.layer.soundId === soundId && out.add(i + 1))
    return out
  }
  /** press 1 / 2 / 3 on a sound: toggle it in that slot of the selected patch */
  function toggleSlot(slot: number, soundId: string) {
    const cur = selectedPatch.value?.slots[slot]
    assignSlot(slot, cur?.layer.soundId === soundId ? null : soundId)
  }

  /** Audition a patch (its main voice at its root note, other slots included). */
  const pressPatch = (id: string, velocity = 1) => {
    const p = patchById(id)
    const c = p && carrierSlot(p)
    if (c) press(c.layer.id, velocity)
  }
  const releasePatch = (id: string) => {
    const p = patchById(id)
    const c = p && carrierSlot(p)
    if (c) release(c.layer.id)
  }
  /** layer ids of a patch (for LEDs) */
  const patchLayerIds = (p: Patch) => new Set(patchLayers(p).map((l) => l.id))

  /**
   * One note of a patch (as the keyboard plays it: slot 1 with its VCOs) or of a sound, rendered offline and silently
   * with the page's engine (engine.renderOffline): held for `hold` s, then `tail` s after the release. At unity gain
   * (the header's VOLUME and the master volume are left out), dry unless `wet` (the patch header's chorus / delay /
   * reverb). Works in the plugin too. For the AI agent's analysis tools (lib/ai/analysis.ts).
   */
  async function renderOffline(req: {
    patchId?: string
    soundId?: string
    note?: number
    velocity?: number
    hold?: number
    tail?: number
    wet?: boolean
    sampleRate?: number
    /**
     * Play it as an MPE note with its surfaces where given (0..1: PRESS the pressure, SLIDE the CC74 it starts and
     * stays at; STRIKE is the velocity): the patch's MPE bindings act, as with MPE on. Absent: as with MPE off.
     */
    mpe?: { press?: number; slide?: number }
  }): Promise<{ channels: Float32Array[]; sampleRate: number; noteOffAt: number }> {
    const note = Math.round(req.note ?? 60)
    const velocity = Math.min(1, Math.max(0.01, req.velocity ?? 0.9))
    const hold = Math.min(30, Math.max(0.05, req.hold ?? 1.5))
    const tail = Math.min(30, Math.max(0, req.tail ?? 1))
    const patch = req.patchId ? patchById(req.patchId) : undefined
    if (req.patchId && !patch) throw new Error(`no patch ${req.patchId}`)
    const main = patch ? carrierSlot(patch) : null
    const sound = patch ? (main ? layerSound(main.layer) : undefined) : req.soundId ? resolveSound(req.soundId) : undefined
    if (!sound) throw new Error(patch ? `patch ${patch.name} has no sound in its slots` : `no sound ${req.soundId ?? ''}`)
    const layers = patch ? patchLayers(patch).map((l) => byId(l.soundId)).filter((x): x is Sound => !!x) : [sound]
    // AKWF waves are made from the waves in memory: have them before the voices look for their buffers
    if (layers.some(isAkwfSound) && !akwfReady.value) await loadAkwf()
    const h = patch?.header
    const surfaces = req.mpe ? { pressure: clamp01(req.mpe.press ?? 0), timbre: clamp01(req.mpe.slide ?? 0) } : {}
    const r = await engine.renderOffline(() => startNote(sound, note, velocity, { midiNote: note, glideTime: 0, at: 0, ...surfaces }), {
      seconds: hold + tail,
      releaseAt: hold,
      sampleRate: req.sampleRate,
      matrix: h?.mod,
      bpm: h?.bpm,
      fx: req.wet ? (h?.fx ?? master.fx) : null,
      mpeRoutes: req.mpe && patch ? (id) => mpeRoutes(patch.mpe, patch.slots.findIndex((x) => x?.layer.id === id)) : undefined,
    })
    return { ...r, noteOffAt: hold }
  }

  // ── factory content ──
  /** The board's sound for each AKWF wave, by audio id (the first, if it has two): boards from before the tables. */
  function waveSounds(): Map<string, Sound> {
    const m = new Map<string, Sound>()
    for (const x of sounds.value) if (isWaveSound(x) && !m.has(x.audioId)) m.set(x.audioId, x)
    return m
  }
  const newWaveSound = (name: string, folder: string): Sound =>
    tracked({ id: uid(), audioId: waveAudioId(name), fileName: `${name}.wav`, settings: waveSoundSettings(name, folder) })

  /**
   * The board's wavetable for each AKWF category, by folder: the one still named after it if there are several (a
   * wave of yours moved onto the tables is a sound on one too).
   */
  function tableSounds(): Map<string, Sound> {
    const m = new Map<string, Sound>()
    for (const x of sounds.value) {
      if (!isTableAudioId(x.audioId) || x.zones?.length) continue
      const folder = tableFolderOf(x.audioId)
      const had = m.get(folder)
      if (!had || (had.settings.name !== categoryLabel(folder) && x.settings.name === categoryLabel(folder))) m.set(folder, x)
    }
    return m
  }
  const newTableSound = (folder: string): Sound =>
    tracked({ id: uid(), audioId: tableAudioId(folder), fileName: `${folder}.wav`, settings: tableSoundSettings(folder, AKWF_FRAMES) })
  /** a category's table on the board (added after the others if it hasn't got it) */
  function tableFor(folder: string, have = tableSounds()): Sound {
    let t = have.get(folder)
    if (!t) {
      addSound((t = newTableSound(folder)))
      have.set(folder, t)
    }
    return t
  }

  /**
   * A category's table as a sound of the board (the library's ADD): the board's own, unless `copy`, then a sound of its
   * own (as a wave of the table: named after it, at it).
   */
  async function addTable(folder: string, opts: { copy?: boolean; wave?: number } = {}): Promise<Sound> {
    await loadAkwf()
    if (!opts.copy) return tableFor(folder)
    const snd = newTableSound(folder)
    if (opts.wave !== undefined) {
      snd.settings.wt = opts.wave
      const name = waveAt(folder, opts.wave)
      if (name) snd.settings.name = waveLabel(name)
    }
    addSound(snd)
    return snd
  }

  /** Every AKWF table the board hasn't got, as sounds after what's there (in boardOrder). Returns how many. */
  async function importTables(): Promise<number> {
    const { index } = await loadAkwf()
    const have = tableSounds()
    const add = boardOrder(index).filter((c) => !have.has(c.folder)).map((c) => newTableSound(c.folder))
    if (add.length) sounds.value = [...toRaw(sounds.value), ...add]
    if (!selected.value) master.selectedId = sounds.value[0]?.id ?? null
    return add.length
  }

  /** a sound you made of a wave: anything about it not as the wave came (or starred) */
  function changedWave(x: Sound, folder: string): boolean {
    if (x.fav) return true
    const base = waveSoundSettings(waveNameOf(x.audioId), folder) as unknown as Record<string, unknown>
    return Object.entries(x.settings).some(([k, v]) => JSON.stringify(v) !== JSON.stringify(base[k]))
  }
  /** a table sound's settings as its category's table comes (WT and BLEND aside: a patch's layers carry their own) */
  function sameTable(settings: SoundSettings, folder: string): boolean {
    const base = tableSoundSettings(folder, AKWF_FRAMES) as unknown as Record<string, unknown>
    return Object.entries(settings).every(([k, v]) => k === 'wt' || k === 'wtBlend' || JSON.stringify(v) === JSON.stringify(base[k]))
  }
  /** the waves wavesToTables moved, by their old sound ids: a draft saved before it still finds its layers' sounds */
  const movedWaves = new Map<string, { table: string; wt: number }>()

  /**
   * 0.14: AKWF's categories are wavetables (lib/akwf.ts). Every patch layer on an AKWF wave plays its category's table
   * at that wave instead (WT, BLEND 0: the same cycle, so the same sound); the board's waves go, but for any you renamed,
   * retagged, changed or starred, which stays as a sound of yours on the table at its wave; the tables take the waves'
   * place in the board's order. Returns how many waves went.
   */
  async function wavesToTables(): Promise<number> {
    const waves = sounds.value.filter((x) => isWaveSound(x))
    if (!waves.length) return 0
    const { index } = await loadAkwf()
    const spots = new Map(waves.map((x) => [x.id, waveSpot(waveNameOf(x.audioId))]))
    const have = tableSounds()
    const added = boardOrder(index).filter((c) => !have.has(c.folder)).map((c) => newTableSound(c.folder))
    for (const t of added) have.set(tableFolderOf(t.audioId), t)
    const onTable = (sp: { folder: string; index: number }) => ({ wtSize: AKWF_FRAMES, wt: sp.index, wtBlend: 0 })
    // the layers, onto the tables
    for (const p of candidate.value ? [...patches.value, candidate.value] : patches.value)
      for (const x of p.slots) {
        const sp = x ? spots.get(x.layer.soundId) : undefined
        if (!x || !sp) continue
        x.layer.soundId = have.get(sp.folder)!.id
        Object.assign(x.layer.settings, onTable(sp))
      }
    // the waves: gone, or yours, on their table
    const gone = new Set<string>()
    for (const x of waves) {
      const sp = spots.get(x.id)
      if (!sp) continue
      if (changedWave(x, sp.folder)) {
        x.audioId = tableAudioId(sp.folder)
        x.fileName = `${sp.folder}.wav`
        Object.assign(x.settings, onTable(sp))
        x.settings.tag = addTags(x.settings.tag, ['wavetable'])
      } else {
        gone.add(x.id)
        movedWaves.set(x.id, { table: have.get(sp.folder)!.id, wt: sp.index })
      }
    }
    const all = toRaw(sounds.value)
    const at = all.findIndex((x) => gone.has(x.id) || added.length === 0)
    const keep = (x: Sound) => !gone.has(x.id)
    sounds.value = at < 0 ? [...all.filter(keep), ...added] : [...all.slice(0, at).filter(keep), ...added, ...all.slice(at).filter(keep)]
    if (!selected.value) master.selectedId = sounds.value[0]?.id ?? null
    return gone.size
  }

  /** the AI's view of every AKWF wave as a sound: its table at it (made once the waves are in; not on the board) */
  let waveList: Sound[] | null = null
  function akwfWaves(): Sound[] {
    if (waveList || !akwfReady.value) return waveList ?? []
    return (waveList = allWaves().map(({ name, folder, index }) => ({
      id: `wave:${name}`,
      audioId: tableAudioId(folder),
      fileName: `${name}.wav`,
      settings: { ...tableSoundSettings(folder, AKWF_FRAMES), name: waveLabel(name), tag: addTags('', ['akwf', categoryTag(folder)]), wt: index },
    })))
  }

  /**
   * A built-in patch, each layer its wave's table at that wave (the table added if the board lacks it); `have`: the
   * board's tables by folder.
   */
  async function buildPatch(fp: FactoryPatch, have: Map<string, Sound>): Promise<Patch> {
    await loadAkwf()
    const slots: (PatchSlot | null)[] = fp.slots.map((x) => {
      const sp = x && waveSpot(x.wave)
      if (!x || !sp) return null
      const layer = makeLayer(tableFor(sp.folder, have))
      Object.assign(layer.settings, { wt: sp.index, wtBlend: 0 }, clone(x.settings ?? {}))
      const m = layer.settings.mod
      Object.assign(m.lfo1, x.lfo1)
      Object.assign(m.lfo2, x.lfo2)
      m.routes.push(...clone(x.routes ?? []))
      const s = { ...newSlot(layer), ...x.slot }
      // the patch's level trim (lib/factoryLevels.ts) on what is heard: a silent layer's level is its depth as a modulator
      const volume = x.settings?.volume ?? LAYER_VOLUME
      layer.settings.volume = s.audible ? Math.min(1.5, volume * 10 ** ((FACTORY_LEVELS[fp.id] ?? 0) / 20)) : volume
      return s
    })
    while (slots.length < PATCH_SLOTS) slots.push(null)
    const d = defaultMaster()
    const h = fp.header ?? {}
    const mod = defaultMatrix()
    Object.assign(mod.lfo1, h.mod?.lfo1)
    Object.assign(mod.lfo2, h.mod?.lfo2)
    mod.routes.push(...clone(h.mod?.routes ?? []))
    // dry: the global FX mixes start at 0 (each patch's chorus, delay and reverb are voiced for when they're turned up)
    const header = headerOf({ ...d, ...h, fx: { ...d.fx, ...h.fx, ...DRY }, mod } as MasterState)
    return { id: uid(), name: fp.name, tag: fp.tag, factoryId: fp.id, factoryLevel: FACTORY_LEVELS[fp.id] ?? 0, slots, header, mpe: clone(fp.mpe ?? []) }
  }

  /** The built-in patches the board hasn't got (by their factory id), after the others. Returns how many. */
  async function addFactoryPatches(): Promise<number> {
    const had = new Set(patches.value.map((x) => x.factoryId).filter(Boolean))
    const have = tableSounds()
    const add: Patch[] = []
    for (const fp of FACTORY_PATCHES) if (!had.has(fp.id)) add.push(await buildPatch(fp, have))
    if (add.length) patches.value = [...toRaw(patches.value), ...add.map(tracked)]
    return add.length
  }

  /** One built-in patch, added to the catalog again (and selected): for auditioning a definition. */
  async function addFactoryPatch(fp: FactoryPatch): Promise<Patch> {
    patches.value.push(tracked(await buildPatch(fp, tableSounds())))
    const p = patches.value[patches.value.length - 1]
    selectPatch(p.id)
    return p
  }

  // ── the AI agent's patch access (lib/ai/tools.ts, lib/ai/patchSpec.ts) ──
  /**
   * A sound as a patch spec names it: an AKWF table by its category's folder (AKWF_epiano: the layer's WT says which
   * wave), an AKWF wave by its name, anything else by its id.
   */
  function soundRef(id: string): SoundRef | null {
    const x = byId(id)
    if (!x) return null
    const ref = isWaveSound(x) ? waveNameOf(x.audioId) : isTableAudioId(x.audioId) && !x.zones?.length && tableSounds().get(tableFolderOf(x.audioId)) === x ? tableFolderOf(x.audioId) : x.id
    return { id: x.id, ref, name: x.settings.name, settings: x.settings }
  }
  /**
   * The sound a spec names: a sound's id, an AKWF wave's name (with or without "AKWF_": its category's table at it,
   * the table added to the board if it isn't there), a category's folder (its table), or a sound's exact name.
   */
  async function resolveSoundRef(ref: string): Promise<SoundRef | null> {
    const r = ref.trim()
    if (byId(r)) return soundRef(r)
    const { waves, index } = await loadAkwf()
    const lower = r.toLowerCase()
    const name = [...waves.keys()].find((w) => w.toLowerCase() === lower || w.toLowerCase() === `akwf_${lower}`)
    const sp = name ? waveSpot(name) : null
    if (sp) {
      const t = tableFor(sp.folder)
      return { ...soundRef(t.id)!, ref: name!, settings: { ...t.settings, wt: sp.index, wtBlend: 0 } }
    }
    const cat = index.categories.find((c) => c.folder.toLowerCase() === lower || c.folder.toLowerCase() === `akwf_${lower}`)
    if (cat) return soundRef(tableFor(cat.folder).id)
    const named = sounds.value.find((x) => x.settings.name.toLowerCase() === lower)
    return named ? soundRef(named.id) : null
  }
  /** a patch the agent made, into the catalog after the others, and selected (so the keys play it) */
  function addAgentPatch(p: Patch): Patch {
    patches.value.push(tracked(p))
    const added = patches.value[patches.value.length - 1]
    selectPatch(added.id)
    return added
  }
  /** a patch's content replaced by the agent's version of it (one undo step); voices of layers it dropped stop */
  function replacePatch(id: string, next: Patch) {
    const p = patchById(id)
    if (!p) throw new Error(`no patch ${id}`)
    const keep = new Set(patchLayers(next).map((l) => l.id))
    for (const l of patchLayers(p)) if (!keep.has(l.id)) engine.stopSound(l.id)
    Object.assign(p, { name: next.name, tag: next.tag, slots: next.slots, header: next.header, mpe: next.mpe })
    // the selected patch's header is the header knobs: they follow
    if (master.patchId === id) selectPatch(id)
  }

  /**
   * First run: every AKWF category becomes a wavetable sound of the board (65), then the built-in patches made of them.
   * Also the menu's RESTORE: puts back whatever of either has been deleted.
   */
  async function installFactory(nothingAdded = 'Every AKWF wavetable and built-in patch is here') {
    try {
      const tables = await importTables()
      const added = await addFactoryPatches()
      if (!master.patchId && patches.value.length) selectPatch(patches.value[0].id)
      Object.assign(master, { factory: true, factoryVersion: FACTORY_VERSION })
      const n = (k: number, one: string, many: string) => `${k.toLocaleString()} ${k === 1 ? one : many}`
      toast.value = tables || added ? `Added ${n(tables, 'AKWF wavetable', 'AKWF wavetables')} and ${n(added, 'patch', 'patches')}` : nothingAdded
    } catch (e) {
      console.error(e) // try again next launch
      toast.value = 'Couldn\'t load the AKWF waves'
    }
  }

  /**
   * Boards from earlier versions. Before 0.5 (factoryVersion < 2) the factory sounds were generated (SAW WAVE …
   * NOISE): patches made of them move to the AKWF waves that replace them, keeping their settings (the root note
   * follows the new wave, C2 for C4), the factory WIND (all NOISE) goes, and only a NOISE that a patch of your own
   * still plays stays. 0.5's factory patches take their new names (their settings are kept); 0.14's waves become
   * wavetables (wavesToTables); then every AKWF wavetable and built-in patch the board hasn't got is added.
   */
  async function upgradeFactory() {
    try {
      await loadAkwf()
    } catch (e) {
      console.error(e) // try again next launch
      return
    }
    const have = waveSounds()
    const soundFor = (name: string) => {
      let snd = have.get(waveAudioId(name))
      if (!snd) {
        addSound((snd = newWaveSound(name, waveFolder(name) ?? '')))
        have.set(snd.audioId, snd)
      }
      return snd
    }
    if (master.factoryVersion < 2) {
      const OLD: Record<string, { name: string; wave: string | null }> = {
        '*saw': { name: 'SAW WAVE', wave: 'AKWF_saw' },
        '*square': { name: 'SQUARE WAVE', wave: 'AKWF_squ' },
        '*sine': { name: 'SINE WAVE', wave: 'AKWF_sin' },
        '*triangle': { name: 'TRIANGLE WAVE', wave: 'AKWF_tri' },
        '*noise': { name: 'NOISE', wave: null },
      }
      const old = sounds.value.filter((x) => isSynthAudioId(x.audioId) && !x.zones && OLD[x.fileName]?.name === x.settings.name)
      if (old.length) {
        const oldIds = new Set(old.map((x) => x.id))
        const isWind = (p: Patch) =>
          p.name === 'WIND' && /\bfactory\b/.test(p.tag) && p.slots.every((x) => !x || OLD[byId(x.layer.soundId)?.fileName ?? '']?.wave === null)
        patches.value = patches.value.filter((p) => !isWind(p))
        for (const p of patches.value)
          for (const x of p.slots) {
            const was = x && oldIds.has(x.layer.soundId) ? byId(x.layer.soundId) : undefined
            const wave = was && OLD[was.fileName].wave
            if (!x || !wave) continue
            x.layer.soundId = soundFor(wave).id
            x.layer.settings.rootNote = Math.max(0, x.layer.settings.rootNote - (60 - CYCLE_ROOT))
          }
        const stillPlayed = new Set(patches.value.flatMap((p) => p.slots.map((x) => x?.layer.soundId)))
        const gone = new Set(old.filter((x) => !stillPlayed.has(x.id)).map((x) => x.id))
        sounds.value = sounds.value.filter((x) => !gone.has(x.id))
        if (master.selectedId && gone.has(master.selectedId)) master.selectedId = sounds.value[0]?.id ?? null
      }
    }
    // 0.5's nine factory patches: renamed, and known by their factory id from now on
    for (const p of patches.value) {
      const id = !p.factoryId && /\bfactory\b/.test(p.tag) ? LEGACY_FACTORY_NAMES[p.name] : undefined
      const fp = id && FACTORY_PATCHES.find((x) => x.id === id)
      if (!fp || patches.value.some((x) => x.factoryId === id)) continue
      p.factoryId = id
      p.name = fp.name
      p.tag = fp.tag
    }
    // 0.5 installed its nine untrimmed and 0.6's first build matched each built-in to one note, which left a chord no
    // headroom: all of them to the current levels (after the renaming, so 0.5's are included)
    const relevelled = master.factoryVersion < 4 ? relevelFactory() : 0
    // 0.13: the built-ins dry, their global FX mixes at 0, and the header's CHORUS, DELAY and REVERB folded
    if (master.factoryVersion < 5) {
      // a DUPLICATE of a built-in was one too, till now: the first of each is the built-in (copies go after it)
      const seen = new Set<string>()
      for (const p of patches.value) {
        if (!p.factoryId) continue
        if (seen.has(p.factoryId)) ownCopy(p)
        else seen.add(p.factoryId)
      }
      for (const p of patches.value) if (p.factoryId) Object.assign(p.header.fx, DRY)
      const sel = selectedPatch.value
      if (sel?.factoryId) loadHeader(sel)
      master.headerFolded = [...new Set([...master.headerFolded, 'chorus', 'delay', 'reverb'])]
    }
    // 0.14: the waves into wavetables, the patches onto them
    const moved = master.factoryVersion < 6 ? await wavesToTables() : 0
    // 0.15: PRESS is the built-ins' WT BLEND (a built-in is never the user's own: SAVE makes a copy)
    if (master.factoryVersion < 7)
      for (const p of patches.value) {
        const mpe = p.factoryId ? factoryMpe(p.factoryId) : undefined
        if (mpe) p.mpe = clone(mpe)
      }
    await installFactory(
      relevelled ? `Built-in patches turned down for headroom (${relevelled})`
        : moved ? `AKWF's waves are wavetables now: ${moved.toLocaleString()} waves folded into their categories' tables` : undefined,
    )
  }

  /**
   * Built-in patches go to the current level trims (lib/factoryLevels.ts) from the ones they were installed with: what
   * is heard scales by the difference, so a layer you turned up or down keeps its place. Returns how many changed.
   */
  function relevelFactory(): number {
    let changed = 0
    for (const p of patches.value) {
      const fp = p.factoryId ? FACTORY_PATCHES.find((x) => x.id === p.factoryId) : undefined
      if (!fp) continue
      const now = FACTORY_LEVELS[fp.id] ?? 0
      const was = p.factoryLevel ?? installedLevel(p, fp)
      if (was !== now) {
        const g = 10 ** ((now - was) / 20)
        for (const x of p.slots) if (x?.audible) x.layer.settings.volume = Math.min(1.5, x.layer.settings.volume * g)
        changed++
      }
      p.factoryLevel = now
    }
    return changed
  }
  /**
   * The trim a built-in from before factoryLevel was installed with: 0.6's first build trimmed them all (V3), but 0.5's
   * nine (renamed since) went in untrimmed -- their main layer's level tells which.
   */
  function installedLevel(p: Patch, fp: FactoryPatch): number {
    const v3 = FACTORY_LEVELS_V3[fp.id] ?? 0
    if (!Object.values(LEGACY_FACTORY_NAMES).includes(fp.id)) return v3
    const main = p.slots[0]?.layer.settings.volume ?? 0
    const trimmed = Math.min(1.5, (fp.slots[0]?.settings?.volume ?? LAYER_VOLUME) * 10 ** (v3 / 20))
    return Math.abs(main - trimmed) < 0.005 ? v3 : 0
  }

  // ── favourites ──
  function toggleFav(kind: 'sound' | 'patch', id: string) {
    const item = kind === 'sound' ? byId(id) : patchById(id)
    if (item) item.fav = !item.fav
  }

  /** which patch a (layer) voice belongs to */
  const patchIdOfLayer = (layerId: string) => layerIndex.value.get(layerId)?.patch.id

  // ── semantic search: "similar to", descriptions, candidates ──
  // the index fills in as things arrive: after the board loads (the model is fetched then, in the background), after
  // imports and new patches (any change), and once the waves are in memory (their spectra)
  watch(changes, () => loaded.value && semantic.soon(QUIET_MS))
  watch(akwfReady, (ready) => ready && semantic.audioChanged())
  watch(loaded, (ok) => ok && window.setTimeout(() => void semantic.load().catch((e) => console.warn('semantic search:', e)), 1200))

  /** what a tab's list is ordered by, if not the board's order: likeness to an item, or to a description */
  type SimilarTo = { kind: 'item'; id: string; name: string } | { kind: 'text'; text: string }
  const similarTo = reactive<{ sounds: SimilarTo | null; patches: SimilarTo | null }>({ sounds: null, patches: null })
  const tabKey = () => (master.tab === 'patches' ? 'patches' : 'sounds')
  /** which catalog an id is in (else the one last used) */
  const catalogOf = (id?: string): Catalog => (id && patchById(id) ? 'patches' : id && byId(id) ? 'sounds' : tabKey())
  /** order a catalog by likeness to its selected sound or patch (or `id`) */
  function showSimilar(id?: string, kind: Catalog = catalogOf(id)) {
    const tab = kind
    const item = tab === 'patches' ? patchById(id ?? master.patchId) : byId(id ?? master.selectedId ?? '')
    const name = item ? ('slots' in item ? item.name : item.settings.name) : ''
    similarTo[tab] = item ? { kind: 'item', id: item.id, name } : null
  }
  /** order a catalog by how near each item's words are to `text` (empty: the board's order again) */
  function showMatching(text: string, kind: Catalog = tabKey()) {
    similarTo[kind] = text.trim() ? { kind: 'text', text: text.trim() } : null
    if (text.trim()) void semantic.load().catch(() => {})
  }
  const clearSimilar = (kind: Catalog = tabKey()) => (similarTo[kind] = null)
  /** likeness scores for one tab's ordering (null: the board's order) */
  function scoresFor<T extends Sound | Patch>(kind: 'sound' | 'patch', to: SimilarTo | null, items: T[]): Map<string, number> | null {
    void semantic.version.value
    void semantic.ready.value
    if (!to) return null
    if (to.kind === 'text') return semantic.ready.value ? semantic.matchText(kind, to.text, items) : null
    const ref = kind === 'patch' ? patchById(to.id) : byId(to.id)
    return ref ? semantic.similar(kind, ref as T, items) : null
  }
  const soundScores = computed(() => scoresFor('sound', similarTo.sounds, visible.value))
  const patchScores = computed(() => scoresFor('patch', similarTo.patches, visiblePatches.value))
  const byScore = <T extends { id: string }>(list: T[], s: Map<string, number> | null) =>
    s ? [...list].sort((a, b) => (s.get(b.id) ?? -2) - (s.get(a.id) ?? -2)) : list
  /** the lists as shown: the tag-filtered pads and patches, in order of likeness while a tab is ordered so */
  const shownSounds = computed(() => byScore(visible.value, soundScores.value))
  const shownPatches = computed(() => byScore(visiblePatches.value, patchScores.value))

  /** where the keyboard was before a candidate was loaded, for DISCARD */
  let beforeCandidate: string | null = null
  /**
   * Search a description's settings: the patches its words are nearest give a blend, the words push it (darker,
   * slower…), a sound it names may take the main VCO. The result is loaded as the candidate; `seed` > 0 rerolls.
   */
  async function describePatch(query: string, seed = 0) {
    const q = query.trim()
    if (!q) return
    await semantic.load()
    const list = patches.value
    if (!list.length) {
      toast.value = 'No patches to search yet'
      return
    }
    const scores = semantic.matchText('patch', q, list)
    const ranked = [...list].sort((a, b) => scores.get(b.id)! - scores.get(a.id)!)
    const best = scores.get(ranked[0].id)!
    // the nearest few, within reach of the best (rolidrummer keeps matches within 0.12), sharply weighted
    const near = ranked.filter((p) => scores.get(p.id)! >= best - 0.12).slice(0, 6)
    const ws = near.map((p) => Math.exp((scores.get(p.id)! - best) / 0.035))
    const sum = ws.reduce((a, b) => a + b, 0)
    const donors = near.map((patch, i) => ({ patch: untrack(patch), weight: ws[i] / sum }))
    // a sound the description names outright ("choir", "organ") for the main VCO, if it's clearly nearer than the patch's
    let swap: Sound | undefined
    const names = semantic.matchText('sound', q, sounds.value)
    const top = [...names].sort((a, b) => b[1] - a[1])[0]
    const mainId = carrierSlot(donors[0].patch)?.layer.soundId
    if (top && top[1] > 0.5 && top[1] - (names.get(mainId ?? '') ?? 0) > 0.15) swap = byId(top[0])
    const { patch, info } = makeCandidate({ donors, pushes: semantic.pushes(q), query: q, seed, swap: swap && untrack(swap), uid })
    const prev = candidate.value
    if (prev) for (const l of patchLayers(prev)) engine.stopSound(l.id)
    if (!prev) beforeCandidate = master.patchId
    candidate.value = tracked(patch)
    candidateInfo.value = info
    selectPatch(patch.id)
  }
  const rerollCandidate = () => candidateInfo.value && describePatch(candidateInfo.value.query, candidateInfo.value.seed + 1)
  /** keep the candidate: it joins the board's patches, still selected */
  function saveCandidate() {
    const c = candidate.value
    if (!c) return
    candidate.value = null
    candidateInfo.value = null
    patches.value.push(tracked(untrack(c)))
    toast.value = `Saved "${c.name}"`
  }
  /** let it go: back to the patch that was loaded before */
  function discardCandidate() {
    const c = candidate.value
    if (!c) return
    for (const l of patchLayers(c)) engine.stopSound(l.id)
    candidate.value = null
    candidateInfo.value = null
    selectPatch(patchById(beforeCandidate)?.id ?? patches.value[0]?.id ?? null)
  }

  // ── editing ────────────────────────────────────────────────────────────
  function togglePanel(id: string) {
    if (openPanels.has(id)) openPanels.delete(id)
    else openPanels.add(id)
  }

  function cycleMode(id: string) {
    const s = resolveSound(id)?.settings
    if (s) s.mode = cycle(TRIGGER_MODES, s.mode)
  }

  function cycleFilter(id: string) {
    const s = resolveSound(id)?.settings
    if (s) s.filterType = cycle(FILTER_TYPES, s.filterType)
  }

  /** RPT as it was before GRAIN went on (this session), per sound or layer id */
  const repeatBeforeGrain = new Map<string, number>()
  /**
   * A cloud plays for as long as the key is held: GRAIN on sets RPT to ∞; off puts RPT back to what it was
   * (×1 if that isn't known), so a sample goes back to ×1 and a looping synth wave keeps looping.
   */
  function toggleGrain(id: string) {
    const s = resolveSound(id)?.settings
    if (!s) return
    s.grain = !s.grain
    if (s.grain) {
      repeatBeforeGrain.set(id, s.repeat)
      s.repeat = 0
    } else {
      s.repeat = repeatBeforeGrain.get(id) ?? 1
      repeatBeforeGrain.delete(id)
    }
  }

  /** Back to defaults, keeping the pad's identity (name, tag, MIDI note). */
  function resetSettings(id: string) {
    const s = resolveSound(id)?.settings
    if (!s) return
    const { name, tag, midiNote, vcos } = s
    Object.assign(s, defaultSettings(name), { tag, midiNote, vcos })
  }

  function duplicate(id: string) {
    const i = sounds.value.findIndex((s) => s.id === id)
    if (i < 0) return
    const src = sounds.value[i]
    const copy: Sound = { ...clone(src), id: uid() }
    copy.settings.name = `${src.settings.name} copy`
    copy.settings.midiNote = null
    sounds.value.splice(i + 1, 0, copy)
  }

  async function remove(id: string) {
    const sound = byId(id)
    if (!sound) return
    engine.stopSound(id)
    openPanels.delete(id)
    if (master.selectedId === id) selectStep(1)
    sounds.value = sounds.value.filter((s) => s.id !== id)
    if (master.selectedId === id) master.selectedId = sounds.value[0]?.id ?? null
    // audio stays in memory + IndexedDB so undo can bring the pad back
  }

  /** Delete several sounds at once (one undo step); the selection moves to the nearest survivor. */
  function removeSounds(ids: string[]) {
    const gone = new Set(ids)
    const next = survivor(visible.value, master.selectedId, gone) ?? sounds.value.find((s) => !gone.has(s.id))?.id ?? null
    for (const id of gone) {
      engine.stopSound(id)
      openPanels.delete(id)
    }
    sounds.value = sounds.value.filter((s) => !gone.has(s.id))
    if (master.selectedId && gone.has(master.selectedId)) master.selectedId = next
  }

  /** Drag-reorder: put `fromId` where `toId` is. */
  function move(fromId: string, toId: string) {
    if (fromId === toId) return
    const list = [...sounds.value]
    const from = list.findIndex((s) => s.id === fromId)
    const to = list.findIndex((s) => s.id === toId)
    if (from < 0 || to < 0) return
    const [item] = list.splice(from, 1)
    list.splice(to, 0, item)
    sounds.value = list
  }

  // ── presets ────────────────────────────────────────────────────────────
  function applySettings(id: string, patch: Partial<SoundSettings>) {
    const s = resolveSound(id)?.settings
    if (s) Object.assign(s, JSON.parse(JSON.stringify(patch)))
  }
  function savePreset(id: string, name: string) {
    const s = resolveSound(id)?.settings
    if (!s) return
    presets.value.push({ id: uid(), name: name.trim() || s.name, settings: presetSettings(s) })
    toast.value = `Saved preset "${presets.value.at(-1)!.name}"`
  }
  function loadPreset(id: string, presetId: string) {
    const p = presets.value.find((x) => x.id === presetId)
    if (p) applySettings(id, p.settings)
  }
  function deletePreset(presetId: string) {
    presets.value = presets.value.filter((p) => p.id !== presetId)
  }
  function copySettings(id: string) {
    const s = resolveSound(id)?.settings
    if (!s) return
    clipboard.value = presetSettings(s)
    toast.value = `Copied ${s.name}'s settings`
  }
  function pasteSettings(id: string) {
    if (clipboard.value) applySettings(id, clipboard.value)
  }

  // ── import / export ────────────────────────────────────────────────────
  /**
   * What exporting these takes: the sounds asked for and every sound the patches' slots use, the patches, and the
   * samples that travel (AKWF waves and generators are part of every SSB: not those).
   */
  function exportPlan(soundIds: Iterable<string>, patchIds: Iterable<string>) {
    const wantPatches = new Set(patchIds)
    const chosen = patches.value.filter((p) => wantPatches.has(p.id))
    const asked = new Set(soundIds)
    const needed = new Set(asked)
    for (const p of chosen) for (const l of patchLayers(p)) needed.add(l.soundId)
    const list = sounds.value.filter((s) => needed.has(s.id))
    const audio = [...new Set(list.flatMap(soundAudioIds))].filter((id) => !isSynthAudioId(id) && !isAkwfAudioId(id))
    return { sounds: list, patches: chosen, extra: list.filter((s) => !asked.has(s.id)).length, audio }
  }
  /** A sample to export: as stored, else from the plugin's cache, else its decoded audio written as a WAV. */
  async function exportAudio(audioId: string): Promise<Blob | null> {
    const stored = await get<Blob>(audioKey(audioId)).catch(() => undefined)
    if (stored) return stored
    const cached = await audioFromPlugin(audioId).catch(() => null)
    if (cached) return cached
    const buf = engine.getBuffer(audioId)
    if (!buf) return null
    const channels = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i))
    const size = tableSizes.get(audioId)
    return size ? encodeTableWav(channels, buf.sampleRate, size) : encodeWav(channels, buf.sampleRate)
  }
  /**
   * Export these sounds and patches (and every sound the patches use) as a board .zip, which IMPORT BOARD reads.
   * Returns the sounds whose samples couldn't be found anywhere (an import would drop them), by name.
   */
  async function exportSelection(soundIds: Iterable<string>, patchIds: Iterable<string>, everything = false): Promise<{ missing: string[] }> {
    const plan = exportPlan(soundIds, patchIds)
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const out: SavedBoard = {
      version: 1,
      sounds: plan.sounds.map((s) => JSON.parse(soundText(s))),
      master: clone(master),
      presets: clone(presets.value),
      patches: plan.patches.map((p) => JSON.parse(patchText(p))),
    }
    zip.file('board.json', JSON.stringify(out))
    const lost = new Set<string>()
    for (const audioId of plan.audio) {
      const blob = await exportAudio(audioId)
      if (blob) zip.file(`audio/${audioId}`, blob)
      else lost.add(audioId)
    }
    const day = new Date().toISOString().slice(0, 10)
    await saveFile(everything ? `ssb-board-${day}.zip` : `ssb-export-${day}.zip`, await zip.generateAsync({ type: 'blob' }))
    return { missing: plan.sounds.filter((s) => soundAudioIds(s).some((id) => lost.has(id))).map((s) => s.settings.name) }
  }
  /** Everything on the board, as a .zip. */
  function exportBoard() {
    return exportSelection(
      sounds.value.map((s) => s.id),
      patches.value.map((p) => p.id),
      true,
    )
  }

  /** Merge an exported board into this one (new ids, so importing twice duplicates). */
  async function importBoard(file: File) {
    try {
      const { default: JSZip } = await import('jszip')
      const zip = await JSZip.loadAsync(file)
      const json = await zip.file('board.json')?.async('string')
      if (!json) throw new Error('board.json missing')
      const board = JSON.parse(json) as SavedBoard
      const idMap = new Map<string, string>()
      let added = 0
      /** New id for an exported audio blob, loading it on first use. Null if it's missing from the zip. */
      const remap = async (old: string) => {
        if (isSynthAudioId(old)) {
          peaks.set(old, computePeaks(engine.getBuffer(old)!))
          return old
        }
        if (isAkwfAudioId(old)) return old
        if (idMap.has(old)) return idMap.get(old)!
        const entry = zip.file(`audio/${old}`)
        if (!entry) return null
        const audioId = uid()
        const blob = await entry.async('blob')
        await loadAudio(audioId, blob)
        await set(audioKey(audioId), blob)
        idMap.set(old, audioId)
        return audioId
      }
      const soundIds = new Map<string, string>()
      // an untouched AKWF wave (as earlier versions stored them: only its name and tag) is a wave of this board's tables
      if (board.sounds.some(isAkwfSound)) await loadAkwf().catch(() => {})
      const tables = tableSounds()
      const onTables = new Map<string, { table: string; wt: number }>()
      for (const s of board.sounds) {
        const pristine = isWaveSound(s) && Object.keys(s.settings).every((k) => k === 'name' || k === 'tag')
        const sp = pristine ? waveSpot(waveNameOf(s.audioId)) : null
        if (sp) {
          onTables.set(s.id, { table: tableFor(sp.folder, tables).id, wt: sp.index })
          continue
        }
        // an AKWF table as it comes is this board's (its layers carry their own settings)
        const folder = isTableAudioId(s.audioId) && !s.zones?.length ? tableFolderOf(s.audioId) : ''
        if (folder && tableLength(folder) && sameTable(expandSound(s).settings, folder)) {
          soundIds.set(s.id, tableFor(folder, tables).id)
          continue
        }
        const audioId = await remap(s.audioId)
        if (!audioId) continue
        let zones: Zone[] | undefined
        if (s.zones) {
          zones = []
          for (const z of s.zones) {
            const id = await remap(z.audioId)
            if (id) zones.push({ ...z, audioId: id })
          }
        }
        const settings = expandSound(s).settings
        settings.tag = addTags(settings.tag, ['imported', stripExt(file.name)])
        const newId = uid()
        soundIds.set(s.id, newId)
        sounds.value.push(tracked({ ...s, id: newId, audioId, zones, settings }))
        added++
      }
      // patches: new ids, layers pointed at the re-imported sounds
      for (const raw of board.patches ?? []) {
        const p = migratePatch(clone(raw))
        p.id = uid()
        p.tag = addTags(p.tag, ['imported', stripExt(file.name)])
        p.slots = p.slots.map((x) => {
          const w = x && onTables.get(x.layer.soundId)
          if (x && w) return { ...x, layer: { ...x.layer, id: uid(), soundId: w.table, settings: { ...x.layer.settings, wtSize: AKWF_FRAMES, wt: w.wt, wtBlend: 0 } } }
          return x && soundIds.has(x.layer.soundId) ? { ...x, layer: { ...x.layer, id: uid(), soundId: soundIds.get(x.layer.soundId)! } } : null
        })
        if (p.slots.some(Boolean)) patches.value.push(p)
      }
      // waves of earlier versions that were changed: onto the tables too, as this board's own did
      await wavesToTables()
      const known = new Set(presets.value.map((p) => p.id))
      presets.value.push(...(board.presets ?? []).filter((p) => !known.has(p.id)))
      if (!selected.value) master.selectedId = sounds.value[0]?.id ?? null
      toast.value = `Imported ${added} sound${added === 1 ? '' : 's'}`
    } catch (e) {
      console.error(e)
      toast.value = `Import failed: ${(e as Error).message}`
    }
  }

  // ── MIDI ───────────────────────────────────────────────────────────────
  /** In the native app / plugin MIDI comes from the host (or the standalone's MIDI inputs), not Web MIDI. */
  let nativeMidi = false
  async function enableNativeMidi() {
    if (!nativeMidi) {
      nativeMidi = true
      onNativeMidi((messages) => {
        const now = performance.now()
        for (const m of messages) {
          const e = parseMidi(m)
          if (e) onMidi(e, now)
        }
      })
    }
    midi.enabled = true
    try {
      const info = await nativeInfo()
      toast.value = info.standalone ? 'MIDI on · inputs are chosen in Options' : `MIDI on · from the host (${info.wrapper})`
    } catch {
      toast.value = 'MIDI on'
    }
  }

  async function enableMidi() {
    if (inNative()) return enableNativeMidi()
    try {
      midi.inputs = await connectMidi(onMidi)
      midi.enabled = true
      toast.value = `MIDI on · ${midi.inputs} input${midi.inputs === 1 ? '' : 's'}`
    } catch (e) {
      toast.value = `MIDI unavailable: ${(e as Error).message}`
    }
  }

  const clockTracker = new ClockTracker()

  function onMidi(e: MidiEvent, time = performance.now()) {
    switch (e.type) {
      case 'clock': {
        const v = clockTracker.tick(time)
        if (clockTracker.ticks % 24 === 0) tempo.beats++
        // only update once per beat, and only on a meaningful change
        if (v && clockTracker.ticks % 24 === 0 && Math.abs(v - tempo.extBpm) > 0.2) tempo.extBpm = Math.round(v * 10) / 10
        return
      }
      case 'start':
        clockTracker.reset()
        tempo.running = true
        tempo.beats = 0
        if (master.clockSource === 'midi') engine.restartGlobalLfos()
        return
      case 'continue':
        tempo.running = true
        return
      case 'stop':
        tempo.running = false
        return
      case 'noteOn':
        if (midi.learning) {
          for (const s of sounds.value) if (s.settings.midiNote === e.note) s.settings.midiNote = null
          const s = byId(midi.learning)
          if (s) s.settings.midiNote = e.note
          midi.learning = null
          return
        }
        // in the plugin the engine already played the host's notes itself
        if (engine.external) return
        if (master.play) return noteOn(e.note, e.velocity, e.channel)
        for (const s of padsForNote(e.note)) press(s.id, e.velocity)
        return
      case 'noteOff':
        if (engine.external) return
        if (master.play) return noteOff(e.note, e.channel)
        for (const s of padsForNote(e.note)) release(s.id)
        return
      case 'polyPressure':
        return engine.setPolyPressure(e.note, e.value)
      // MPE: on a member channel these are per-note; on the master channel (or without MPE) they're global
      case 'channelPressure':
        if (isMember(e.channel)) {
          mpeState(e.channel).pressure = e.value
          return engine.setNotePressure(e.channel, e.value)
        }
        fromHost.pressure = e.value
        perform.pressure = e.value
        return
      case 'pitchBend':
        if (isMember(e.channel)) {
          mpeState(e.channel).bend = e.value
          return engine.setNoteBend(e.channel, e.value)
        }
        fromHost.bend = e.value
        perform.bend = e.value
        return
      case 'cc': {
        // RPN 0 on a member channel: the device's per-note bend range (RPN 6, its zones, is kept in mpeZones)
        const range = mpeZones.cc(e.channel, e.cc, Math.round(e.value * 127))
        if (range !== null && master.mpe) master.mpeBendRange = range
        engine.setCC(e.cc, e.value)
        if (e.cc === 1) perform.mod = fromHost.mod = e.value
        else if (e.cc === 64) perform.sustain = fromHost.sustain = e.value >= 0.5
        else if (e.cc === 74) {
          if (isMember(e.channel)) {
            mpeState(e.channel).timbre = e.value
            return engine.setNoteTimbre(e.channel, e.value)
          }
          perform.timbre = fromHost.timbre = e.value
        }
        return
      }
    }
  }

  function openMatrix(scope: string) {
    matrixScope.value = scope
  }

  async function learnMidi(id: string) {
    if (!midi.enabled) await enableMidi()
    if (!midi.enabled) return
    midi.learning = midi.learning === id ? null : id
  }

  // leaving keyboard-play mode releases anything still held
  watch(
    () => master.play,
    (on) => {
      if (on) return
      for (const n of [...heldNotes.value]) noteOff(n)
    },
  )

  return {
    sounds, master, listViewOf, setListView, openPanels, view, pressed, tagFilter, peaks, peaksOf, changes, setEngineGate, loaded, toast, midi, heldNotes,
    perform, presets, clipboard, matrixScope, canUndo, canRedo, tempo, bpm, noteFor, theme, cycleTheme,
    undo, redo, savePreset, loadPreset, deletePreset, copySettings, pasteSettings, openMatrix, onMidi,
    patches, patchTagFilter, patchTags, visiblePatches, patchFacets, togglePatchTag,
    tagsOf, toggleTagOf, hideTagOf, clearTagsOf,
    tagHidden, patchTagHidden,
    selectedPatch, patchMain, playable, patchNumber, resolveSound, layerSound, patchLayerIds, vcoLinks, tunedSlots, patchById,
    semantic, similarTo, showSimilar, showMatching, clearSimilar, soundScores, patchScores, shownSounds, shownPatches,
    candidate, candidateInfo, describePatch, rerollCandidate, saveCandidate, discardCandidate,
    installFactory, addFactoryPatch, selectPatch, editPatch, selectPatchStep, newPatch, duplicatePatch, removePatch, removePatches, assignSlot, slotsOf, toggleSlot, toggleFav,
    patchEdited, isEdited, isBuiltIn, savePatch, revertPatch,
    pressPatch, releasePatch, patchIdOfLayer, soundRef, resolveSoundRef, addAgentPatch, replacePatch, renderOffline,
    tags, visible, facets, toggleTag, keyFor, soundForKey, byId, selected, selectedNumber,
    addFiles, addCapture, addAgentSound, load, press, release, panic, noteOn, noteOff,
    select, selectStep, togglePanel, cycleMode, cycleFilter, toggleGrain, addTable, akwfWaves, resetSettings, duplicate, remove, removeSounds, move,
    mpeRoutesFor,
    exportBoard, exportPlan, exportSelection, importBoard, enableMidi, learnMidi,
  }
})
