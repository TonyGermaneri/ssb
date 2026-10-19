import { defineStore } from 'pinia'
import { computed, nextTick, reactive, ref, shallowReactive, shallowRef, toRaw, watch, type Ref } from 'vue'
import { del, get, keys, set } from 'idb-keyval'
import * as engine from '../audio/engine'
import { computePeaks } from '../audio/peaks'
import { connectMidi, parseMidi, type MidiEvent } from '../audio/midi'
import { callNative, inNative, nativeBoardKey, nativeInfo, onNative, onNativeMidi, saveFile } from '../native/bridge'
import { encodeWav, planarFromBase64, readCycleWav } from '../lib/wav'
import { History } from '../lib/history'
import { compactSound, expandSound, isWaveSound } from '../lib/storedSound'
import { isTracked, track, untrack } from '../lib/tracked'
import { ClockTracker } from '../lib/midiClock'
import { THEMES, themeById } from '../theme/themes'
import type { Voice, VoiceOptions, ZonePlay } from '../audio/voice'
import { basename, dirname, type PathFile } from '../lib/dropFiles'
import { addTags, passesTags, tagFacets } from '../lib/tags'
import { normalisePath, parseSfz } from '../lib/sfz'
import { sniffSampleRate } from '../lib/sampleRate'
import { filterPlayable, nearestZone, pickZones, regionToZone, zoneSemis } from '../lib/zones'
import { isSynthAudioId, synthAudioId, synthWave } from '../audio/synthWaves'
import { FACTORY_PATCHES, LAYER_VOLUME, LEGACY_FACTORY_NAMES, type FactoryPatch } from '../lib/factory'
import { FACTORY_LEVELS, FACTORY_LEVELS_V3 } from '../lib/factoryLevels'
import {
  akwfReady, boardOrder, CYCLE_ROOT, isWaveAudioId, loadAkwf, waveAudioId, waveFolder, waveSoundSettings,
  type AkwfWave,
} from '../lib/akwf'
import { stripExt } from '../lib/format'
import {
  divisionBeats, defaultMaster, defaultMatrix, defaultSettings, FILTER_TYPES, migrateMaster, migratePresetSettings, presetSettings,
  TRIGGER_MODES,
  carrierSlot, headerOf, migratePatch, newSlot, PATCH_SLOTS, patchLayers, soundAudioIds, type MasterState, type Patch,
  type PatchLayer, type PatchSlot, type Preset, type Sound, type SoundSettings, type VcoSlot, type Zone,
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

interface SavedBoard {
  version: 1
  sounds: Sound[]
  master: MasterState
  presets?: Preset[]
  patches?: Patch[]
}

const uid = () => crypto.randomUUID()
/** 2: the factory patches are made of AKWF waves; 3: every AKWF wave is a sound, and the built-in patches; 4: those
 *  patches with headroom for chords (see upgradeFactory) */
const FACTORY_VERSION = 4
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(toRaw(v)))
const cycle = <T>(list: readonly T[], cur: T) => list[(list.indexOf(cur) + 1) % list.length]

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

  // ── change tracking (lib/tracked.ts) ───────────────────────────────────
  /** bumped by any write to a sound or patch, and when sounds or patches are added, removed or moved */
  const changes = shallowRef(0)
  /** each sound's / patch's JSON (sounds as stored, see compactSound), until it is next written to */
  const texts = new WeakMap<object, string>()
  /** A sound or patch whose writes mark it changed. */
  function tracked<T extends object>(item: T): T {
    const raw = untrack(item)
    return track(item, () => {
      texts.delete(raw)
      changes.value++
    })
  }

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
  /** the tag strip follows the tab */
  const currentFacets = computed(() => (master.tab === 'patches' ? patchFacets.value : facets.value))
  const currentFilter = computed(() => (master.tab === 'patches' ? patchTagFilter.value : tagFilter.value))
  const currentTotal = computed(() => (master.tab === 'patches' ? patches.value.length : sounds.value.length))
  const currentShown = computed(() => (master.tab === 'patches' ? visiblePatches.value.length : visible.value.length))
  const currentHidden = computed(() => (master.tab === 'patches' ? patchTagHidden.value : tagHidden.value))
  const toggleCurrentTag = (tag: string) => (master.tab === 'patches' ? togglePatchTag(tag) : toggleTag(tag))
  const hideCurrentTag = (tag: string) =>
    master.tab === 'patches' ? toggleOut(tag, patchTagFilter, patchTagHidden) : toggleOut(tag, tagFilter, tagHidden)
  function clearCurrentTags() {
    if (master.tab === 'patches') patchTagFilter.value = patchTagHidden.value = []
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
  /** the sound being edited in the Sounds tab (rack, grid row) */
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
  const layerIndex = computed(() => {
    const m = new Map<string, { patch: Patch; layer: PatchLayer }>()
    for (const p of patches.value) for (const l of patchLayers(p)) m.set(l.id, { patch: p, layer: l })
    return m
  })
  /** a sound pad, or a patch layer (by layer id) */
  function resolveSound(id: string): Sound | undefined {
    const hit = byId(id)
    if (hit) return hit
    const l = layerIndex.value.get(id)
    return l ? layerSound(l.layer) : undefined
  }
  const selectedPatch = computed(() => patches.value.find((p) => p.id === master.patchId) ?? null)
  const patchMain = computed(() => {
    const c = selectedPatch.value && carrierSlot(selectedPatch.value)
    return c ? layerSound(c.layer) ?? null : null
  })
  /** what the keyboard plays: the selected patch, or (with no patches yet) the sound being edited */
  const playable = computed(() => patchMain.value ?? selected.value)
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
    const buf = cycle ? engine.cycleBuffer(cycle.channels, cycle.rate) : await engine.decode(bytes) // detaches `bytes`
    engine.buffers.set(audioId, buf)
    peaks.set(audioId, computePeaks(buf))
    return rate
  }

  /** AKWF waves' peaks, made when first drawn (kept out of `peaks`: thousands of waves needn't all have them) */
  const wavePeaks = new Map<string, Float32Array>()
  /** Peaks for the waveform: decoded audio's, or an AKWF wave's (once the waves are in memory). */
  function peaksOf(audioId: string): Float32Array | undefined {
    const p = peaks.get(audioId)
    if (p || !isWaveAudioId(audioId) || !akwfReady.value) return p
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
        // every launch starts as a soundboard: the pads as cards, the VCO rack put away
        Object.assign(master, { rack: false, view: 'pads', list: true, tab: 'sounds' })
        presets.value = (saved.presets ?? []).map((p) => ({ ...p, settings: migratePresetSettings(p.settings) }))
        patches.value = (saved.patches ?? []).map((p) => tracked(migratePatch(p)))
        const ok = await readSounds(saved.sounds)
        sounds.value = ok
        if (!selected.value) master.selectedId = ok[0]?.id ?? null
        for (const s of ok) applyCcDefaults(s)
        applyCcDefaults(selected.value)
      }
      // first run: every AKWF wave, then the built-in patches made of them; older boards get what they lack
      if (!master.factory) await installFactory()
      else if (master.factoryVersion < FACTORY_VERSION) await upgradeFactory()
      if (nativeBoardKey()) await restoreInstance()
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
    if (list.some(isWaveSound) && !akwfReady.value) {
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
  const pickInstance = (m: MasterState) => Object.fromEntries(INSTANCE_FIELDS.map((k) => [k, clone(m[k])]))
  function applyInstance(json: string | undefined | null) {
    if (!json) return false
    try {
      const st = JSON.parse(json) as { master?: Partial<MasterState> }
      const m = st.master ?? {}
      for (const k of INSTANCE_FIELDS) if (k in m) (master as Record<string, unknown>)[k] = clone(m[k])
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
      () => INSTANCE_FIELDS.map((k) => master[k]),
      () => {
        clearTimeout(instanceTimer)
        instanceTimer = setTimeout(() => void callNative('ssbSetState', JSON.stringify({ v: 1, master: pickInstance(master) })).catch(() => {}), 300)
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
    applyingRemote = true
    try {
      presets.value = (saved.presets ?? []).map((p) => ({ ...p, settings: migratePresetSettings(p.settings) }))
      patches.value = (saved.patches ?? []).map((x) => keepP.get(JSON.stringify(x)) ?? tracked(migratePatch(x)))
      sounds.value = list
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
      if (!used.has(k) || isWaveAudioId(k.slice('ssb:audio:'.length))) await del(k)
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

  /** The board as stored: sounds and patches from their kept JSON (only what changed is serialised again). */
  function savedBoard(): SavedBoard {
    const snap = snapshot()
    return {
      version: 1,
      sounds: JSON.parse(`[${snap.sounds.join(',')}]`),
      master: clone(master),
      presets: clone(presets.value),
      patches: JSON.parse(`[${snap.patches.join(',')}]`),
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
  watch(patches, () => adopt(patches), { deep: 1 })
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
  // in the plugin the header's performance controls reach the engine as MIDI (host MIDI already
  // did, so these echo the same values back; harmless)
  if (engine.external) {
    const midi7 = (v: number) => Math.max(0, Math.min(127, Math.round(v * 127)))
    const send = (bytes: number[]) => toEngine({ type: 'midi', bytes })
    watch(() => perform.mod, (v) => send([0xb0, 1, midi7(v)]))
    watch(() => perform.sustain, (on) => send([0xb0, 64, on ? 127 : 0]))
    watch(() => perform.timbre, (v) => send([0xb0, 74, midi7(v)]))
    watch(() => perform.pressure, (v) => send([0xd0, midi7(v), 0]))
    watch(() => perform.bend, (v) => {
      const raw = Math.max(0, Math.min(16383, Math.round(8192 + v * (v >= 0 ? 8191 : 8192))))
      send([0xe0, raw & 0x7f, raw >> 7])
    })
  }
  watch(() => perform.mod, (v) => {
    engine.setModWheel(v)
    engine.setCC(1, v)
  })
  watch(() => perform.bend, (v) => engine.setBend(v))
  watch(() => perform.pressure, (v) => engine.setChannelPressure(v))
  watch(() => perform.timbre, (v) => engine.setTimbre(v))
  watch(() => master.mpeBendRange, (v) => engine.setMpeBendRange(v), { immediate: true })

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
          { ...base, group: sound.id, level: slot.level, detune: slot.fine, silent: !slot.audible },
          vFrom,
          true,
        )
        vcoVoices.push(...started)
        taps[i] = started[0]?.tap ?? null
      })
    }
    return [...startOwn(sound, note, velocity, { ...base, modTaps: taps }, fromNote), ...vcoVoices]
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

  // ── keyboard play (MIDI / computer keys → selected patch) ─────────────
  const polyVoices = new Map<string, Voice[]>()
  let monoVoices: Voice[] = []
  let lastNote: number | null = null
  const releaseAll = (vs?: Voice[]) => vs?.forEach((v) => v.release())
  /** MPE member-channel controller values, kept so a note starts where its channel already is */
  const mpeChannels = new Map<number, { bend: number; pressure: number; timbre: number }>()
  const isMember = (ch?: number): ch is number => master.mpe && ch !== undefined && ch !== 0
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
        engine.publish()
        return
      }
      releaseAll(monoVoices)
      monoVoices = startNote(sound, note, velocity, base, from)
    } else {
      const key = voiceKey(note, channel)
      releaseAll(polyVoices.get(key))
      sustainedKeys.delete(key)
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
          engine.publish()
        } else {
          releaseAll(monoVoices)
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
    perform.bend = 0
    perform.pressure = 0
  }

  /** An instrument's CC defaults: on load and whenever it becomes what the keys play. */
  function applyCcDefaults(sound: Sound | null | undefined) {
    for (const [cc, v] of Object.entries(sound?.ccDefaults ?? {})) engine.setCC(+cc, v)
  }
  // clicking a pad selects it: that only changes what the keys play when no patch is selected
  watch(playable, (s) => applyCcDefaults(s))

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
    if (!p) return
    // load the patch's header knobs
    const h = clone(p.header)
    Object.assign(master, { volume: h.volume, glide: h.glide, mono: h.mono, mpe: h.mpe, mpeBendRange: h.mpeBendRange, bpm: h.bpm })
    Object.assign(master.fx, h.fx)
    Object.assign(master.mod, h.mod)
  }

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
    const copy = clone(patches.value[i])
    copy.id = uid()
    copy.name = `${copy.name} copy`
    for (const x of copy.slots) if (x) x.layer.id = uid()
    patches.value.splice(i + 1, 0, copy)
    // edit the copy, not the original
    selectPatch(copy.id)
  }

  const removePatch = (id: string) => removePatches([id])

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
    let p = patches.value.find((x) => x.id === patchId)
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
    const p = patches.value.find((x) => x.id === id)
    const c = p && carrierSlot(p)
    if (c) press(c.layer.id, velocity)
  }
  const releasePatch = (id: string) => {
    const p = patches.value.find((x) => x.id === id)
    const c = p && carrierSlot(p)
    if (c) release(c.layer.id)
  }
  /** layer ids of a patch (for LEDs) */
  const patchLayerIds = (p: Patch) => new Set(patchLayers(p).map((l) => l.id))

  // ── factory content ──
  /** The board's sound for each AKWF wave, by audio id (the first, if it has two). */
  function waveSounds(): Map<string, Sound> {
    const m = new Map<string, Sound>()
    for (const x of sounds.value) if (isWaveSound(x) && !m.has(x.audioId)) m.set(x.audioId, x)
    return m
  }
  const newWaveSound = (name: string, folder: string): Sound =>
    tracked({ id: uid(), audioId: waveAudioId(name), fileName: `${name}.wav`, settings: waveSoundSettings(name, folder) })

  /**
   * AKWF waves as sounds, tagged "akwf" + their category, looping while held. A wave already on the board is
   * reused rather than added twice (its sound is returned) unless `copy`.
   */
  async function addWaves(waves: AkwfWave[], opts: { copy?: boolean } = {}): Promise<Sound[]> {
    const have = opts.copy ? new Map<string, Sound>() : waveSounds()
    const out: Sound[] = []
    for (const w of waves) {
      let snd = have.get(waveAudioId(w.name))
      if (!snd) {
        addSound((snd = newWaveSound(w.name, w.folder)))
        have.set(snd.audioId, snd)
      }
      out.push(snd)
    }
    return out
  }

  /** Every AKWF wave the board hasn't got, as sounds after what's there (in boardOrder). Returns how many. */
  async function importWaves(): Promise<number> {
    const { index } = await loadAkwf()
    const have = waveSounds()
    const add: Sound[] = []
    for (const c of boardOrder(index)) for (const name of c.waves) if (!have.has(waveAudioId(name))) add.push(newWaveSound(name, c.folder))
    if (add.length) sounds.value = [...toRaw(sounds.value), ...add]
    if (!selected.value) master.selectedId = sounds.value[0]?.id ?? null
    return add.length
  }

  /** A built-in patch, its layers made from the board's sounds of its waves (added if the board lacks one). */
  async function buildPatch(fp: FactoryPatch, have: Map<string, Sound>): Promise<Patch> {
    const { waves } = await loadAkwf()
    const soundFor = (name: string) => {
      const id = waveAudioId(name)
      let snd = have.get(id)
      const folder = waves.get(name)?.folder
      if (!snd && folder) {
        addSound((snd = newWaveSound(name, folder)))
        have.set(id, snd)
      }
      return snd
    }
    const slots: (PatchSlot | null)[] = fp.slots.map((x) => {
      const src = x && soundFor(x.wave)
      if (!x || !src) return null
      const layer = makeLayer(src)
      Object.assign(layer.settings, clone(x.settings ?? {}))
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
    const header = headerOf({ ...d, ...h, fx: { ...d.fx, ...h.fx }, mod } as MasterState)
    return { id: uid(), name: fp.name, tag: fp.tag, factoryId: fp.id, factoryLevel: FACTORY_LEVELS[fp.id] ?? 0, slots, header }
  }

  /** The built-in patches the board hasn't got (by their factory id), after the others. Returns how many. */
  async function addFactoryPatches(): Promise<number> {
    const had = new Set(patches.value.map((x) => x.factoryId).filter(Boolean))
    const have = waveSounds()
    const add: Patch[] = []
    for (const fp of FACTORY_PATCHES) if (!had.has(fp.id)) add.push(await buildPatch(fp, have))
    if (add.length) patches.value = [...toRaw(patches.value), ...add.map(tracked)]
    return add.length
  }

  /** One built-in patch, added to the catalog again (and selected): for auditioning a definition. */
  async function addFactoryPatch(fp: FactoryPatch): Promise<Patch> {
    patches.value.push(tracked(await buildPatch(fp, waveSounds())))
    const p = patches.value[patches.value.length - 1]
    selectPatch(p.id)
    return p
  }

  /**
   * First run: every AKWF wave becomes a sound of the board (4,358, in AKWF's categories), then the built-in patches
   * made of them. Also the menu's RESTORE: puts back whatever of either has been deleted.
   */
  async function installFactory(nothingAdded = 'Every AKWF wave and built-in patch is here') {
    try {
      const waves = await importWaves()
      const added = await addFactoryPatches()
      if (!master.patchId && patches.value.length) selectPatch(patches.value[0].id)
      Object.assign(master, { factory: true, factoryVersion: FACTORY_VERSION })
      const n = (k: number, one: string, many: string) => `${k.toLocaleString()} ${k === 1 ? one : many}`
      toast.value = waves || added ? `Added ${n(waves, 'AKWF wave', 'AKWF waves')} and ${n(added, 'patch', 'patches')}` : nothingAdded
    } catch (e) {
      console.error(e) // try again next launch
      toast.value = 'Couldn\'t load the AKWF waves'
    }
  }

  /**
   * Boards from earlier versions. Before 0.5 (factoryVersion < 2) the factory sounds were generated (SAW WAVE …
   * NOISE): patches made of them move to the AKWF waves that replace them, keeping their settings (the root note
   * follows the new wave, C2 for C4), the factory WIND (all NOISE) goes, and only a NOISE that a patch of your own
   * still plays stays. 0.5's factory patches take their new names (their settings are kept); then every AKWF wave
   * and built-in patch the board hasn't got is added.
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
    await installFactory(relevelled ? `Built-in patches turned down for headroom (${relevelled})` : undefined)
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
    const item = kind === 'sound' ? byId(id) : patches.value.find((p) => p.id === id)
    if (item) item.fav = !item.fav
  }

  /** which patch a (layer) voice belongs to */
  const patchIdOfLayer = (layerId: string) => layerIndex.value.get(layerId)?.patch.id

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
  async function exportBoard() {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    zip.file('board.json', JSON.stringify(savedBoard()))
    // generators and AKWF waves are part of every SSB: only real samples travel
    for (const audioId of new Set(sounds.value.flatMap(soundAudioIds).filter((id) => !isSynthAudioId(id) && !isWaveAudioId(id)))) {
      const blob = await get<Blob>(audioKey(audioId))
      if (blob) zip.file(`audio/${audioId}`, blob)
    }
    const out = await zip.generateAsync({ type: 'blob' })
    await saveFile(`ssb-board-${new Date().toISOString().slice(0, 10)}.zip`, out)
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
        if (isWaveAudioId(old)) return old
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
      // an untouched AKWF wave is the one this board already has (only its name and tag were stored)
      if (board.sounds.some(isWaveSound)) await loadAkwf().catch(() => {})
      const waves = waveSounds()
      for (const s of board.sounds) {
        const pristine = isWaveSound(s) && Object.keys(s.settings).every((k) => k === 'name' || k === 'tag')
        const mine = pristine ? waves.get(s.audioId) : undefined
        if (mine) {
          soundIds.set(s.id, mine.id)
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
        p.slots = p.slots.map((x) =>
          x && soundIds.has(x.layer.soundId) ? { ...x, layer: { ...x.layer, id: uid(), soundId: soundIds.get(x.layer.soundId)! } } : null,
        )
        if (p.slots.some(Boolean)) patches.value.push(p)
      }
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
        perform.pressure = e.value
        return
      case 'pitchBend':
        if (isMember(e.channel)) {
          mpeState(e.channel).bend = e.value
          return engine.setNoteBend(e.channel, e.value)
        }
        perform.bend = e.value
        return
      case 'cc':
        engine.setCC(e.cc, e.value)
        if (e.cc === 1) perform.mod = e.value
        else if (e.cc === 64) perform.sustain = e.value >= 0.5
        else if (e.cc === 74) {
          if (isMember(e.channel)) {
            mpeState(e.channel).timbre = e.value
            return engine.setNoteTimbre(e.channel, e.value)
          }
          perform.timbre = e.value
        }
        return
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
    sounds, master, openPanels, pressed, tagFilter, peaks, peaksOf, changes, setEngineGate, loaded, toast, midi, heldNotes,
    perform, presets, clipboard, matrixScope, canUndo, canRedo, tempo, bpm, noteFor, theme, cycleTheme,
    undo, redo, savePreset, loadPreset, deletePreset, copySettings, pasteSettings, openMatrix, onMidi,
    patches, patchTagFilter, patchTags, visiblePatches, patchFacets, togglePatchTag,
    currentFacets, currentFilter, currentTotal, currentShown, toggleCurrentTag, clearCurrentTags, currentHidden, hideCurrentTag,
    tagHidden, patchTagHidden,
    selectedPatch, patchMain, playable, patchNumber, resolveSound, layerSound, patchLayerIds, vcoLinks,
    installFactory, addFactoryPatch, selectPatch, editPatch, selectPatchStep, newPatch, duplicatePatch, removePatch, removePatches, assignSlot, slotsOf, toggleSlot, toggleFav,
    pressPatch, releasePatch, patchIdOfLayer,
    tags, visible, facets, toggleTag, keyFor, soundForKey, byId, selected, selectedNumber,
    addFiles, addCapture, load, press, release, panic, noteOn, noteOff,
    select, selectStep, togglePanel, cycleMode, cycleFilter, toggleGrain, addWaves, resetSettings, duplicate, remove, removeSounds, move,
    exportBoard, importBoard, enableMidi, learnMidi,
  }
})
