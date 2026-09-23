import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowReactive, toRaw, watch } from 'vue'
import { del, get, keys, set } from 'idb-keyval'
import * as engine from '../audio/engine'
import { computePeaks } from '../audio/peaks'
import { connectMidi, type MidiEvent } from '../audio/midi'
import { History } from '../lib/history'
import { ClockTracker } from '../lib/midiClock'
import { THEMES, themeById } from '../theme/themes'
import type { Voice, VoiceOptions, ZonePlay } from '../audio/voice'
import { basename, dirname, type PathFile } from '../lib/dropFiles'
import { addTags, hasAllTags, tagFacets } from '../lib/tags'
import { normalisePath, parseSfz } from '../lib/sfz'
import { sniffSampleRate } from '../lib/sampleRate'
import { filterPlayable, nearestZone, pickZones, regionToZone, zoneSemis } from '../lib/zones'
import { isSynthAudioId, synthAudioId, synthWave } from '../audio/synthWaves'
import { FACTORY_PATCHES, FACTORY_WAVES, waveSettings } from '../lib/factory'
import { stripExt } from '../lib/format'
import {
  divisionBeats, defaultMaster, defaultSettings, FILTER_TYPES, migrateMaster, migrateSettings, presetSettings, TRIGGER_MODES,
  carrierSlot, headerOf, migratePatch, newSlot, PATCH_SLOTS, patchLayers, soundAudioIds, type MasterState, type Patch,
  type PatchLayer, type PatchSlot, type Preset, type Sound, type SoundSettings, type VcoSlot, type Zone,
} from '../types'

const BOARD_KEY = 'ssb:board'
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
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(toRaw(v)))
const cycle = <T>(list: readonly T[], cur: T) => list[(list.indexOf(cur) + 1) % list.length]

export const useBoard = defineStore('board', () => {
  const sounds = ref<Sound[]>([])
  const master = reactive<MasterState>(defaultMaster())
  const openPanels = reactive(new Set<string>())
  const pressed = reactive(new Set<string>())
  const tagFilter = ref<string[]>([])
  const peaks = shallowReactive(new Map<string, Float32Array>())
  const loaded = ref(false)
  const toast = ref('')
  const midi = reactive({ enabled: false, inputs: 0, learning: null as string | null })
  /** MIDI notes currently held in keyboard-play mode (for the display). */
  const heldNotes = ref<number[]>([])
  /** live performance controllers (not saved) */
  const perform = reactive({ mod: 0, bend: 0, pressure: 0, timbre: 0, sustain: false })
  /** MIDI clock follower state (runtime only) */
  const tempo = reactive({ extBpm: 0, running: false, beats: 0 })
  const bpm = computed(() => (master.clockSource === 'midi' && tempo.extBpm > 0 ? tempo.extBpm : master.bpm))
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

  // ── derived ────────────────────────────────────────────────────────────
  /** every tag in the catalog (comma-separated per pad), for tag pickers */
  const tags = computed(() => tagFacets(sounds.value.map((s) => s.settings.tag), []).map((f) => f.name))
  /** pads carrying every selected tag */
  const visible = computed(() =>
    sounds.value.filter((s) => (!master.favSounds || s.fav) && hasAllTags(s.settings.tag, tagFilter.value)),
  )
  /** tags among the visible pads, with counts — narrows as tags are selected */
  const facets = computed(() => tagFacets(sounds.value.map((s) => s.settings.tag), tagFilter.value))
  function toggleTag(tag: string) {
    const on = tagFilter.value.some((t) => t.toLowerCase() === tag.toLowerCase())
    tagFilter.value = on ? tagFilter.value.filter((t) => t.toLowerCase() !== tag.toLowerCase()) : [...tagFilter.value, tag]
  }
  // ── patches catalog ─────────────────────────────────────────────────────
  const patchTags = computed(() => tagFacets(patches.value.map((p) => p.tag), []).map((f) => f.name))
  const visiblePatches = computed(() =>
    patches.value.filter((p) => (!master.favPatches || p.fav) && hasAllTags(p.tag, patchTagFilter.value)),
  )
  const patchFacets = computed(() => tagFacets(patches.value.map((p) => p.tag), patchTagFilter.value))
  function togglePatchTag(tag: string) {
    const on = patchTagFilter.value.some((t) => t.toLowerCase() === tag.toLowerCase())
    patchTagFilter.value = on
      ? patchTagFilter.value.filter((t) => t.toLowerCase() !== tag.toLowerCase())
      : [...patchTagFilter.value, tag]
  }
  /** the tag strip follows the tab */
  const currentFacets = computed(() => (master.tab === 'patches' ? patchFacets.value : facets.value))
  const currentFilter = computed(() => (master.tab === 'patches' ? patchTagFilter.value : tagFilter.value))
  const currentTotal = computed(() => (master.tab === 'patches' ? patches.value.length : sounds.value.length))
  const currentShown = computed(() => (master.tab === 'patches' ? visiblePatches.value.length : visible.value.length))
  const toggleCurrentTag = (tag: string) => (master.tab === 'patches' ? togglePatchTag(tag) : toggleTag(tag))
  function clearCurrentTags() {
    if (master.tab === 'patches') patchTagFilter.value = []
    else tagFilter.value = []
  }

  const keyFor = computed(() => {
    const m = new Map<string, string>()
    visible.value.forEach((s, i) => i < PAD_KEYS.length && m.set(s.id, PAD_KEYS[i]))
    return m
  })
  const soundForKey = computed(() => new Map([...keyFor.value].map(([id, k]) => [k, id])))
  const byId = (id: string) => sounds.value.find((s) => s.id === id)
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
    const buf = await engine.decode(bytes) // detaches `bytes`
    engine.buffers.set(audioId, buf)
    peaks.set(audioId, computePeaks(buf))
    return rate
  }

  function addSound(sound: Sound) {
    sounds.value.push(sound)
    if (!master.selectedId) master.selectedId = sound.id
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
      const saved = await get<SavedBoard>(BOARD_KEY)
      if (saved) {
        Object.assign(master, migrateMaster(saved.master))
        presets.value = saved.presets ?? []
        patches.value = (saved.patches ?? []).map(migratePatch)
        const ok: Sound[] = []
        for (const s of saved.sounds) {
          try {
            let missing = false
            for (const audioId of new Set(soundAudioIds(s))) {
              if (engine.buffers.has(audioId)) continue
              if (isSynthAudioId(audioId)) {
                peaks.set(audioId, computePeaks(engine.getBuffer(audioId)!))
                continue
              }
              const blob = await get<Blob>(audioKey(audioId))
              if (!blob) {
                missing = true
                break
              }
              await loadAudio(audioId, blob)
            }
            if (missing) continue
            ok.push({ ...s, settings: migrateSettings(s.settings) })
          } catch (e) {
            console.error(`Dropping ${s.fileName}`, e)
          }
        }
        sounds.value = ok
        if (!selected.value) master.selectedId = ok[0]?.id ?? null
        for (const s of ok) applyCcDefaults(s)
        applyCcDefaults(selected.value)
      }
      void collectOrphanAudio()
      // first run: built-in synth sounds + factory patches
      if (!master.factory) installFactory()
    } finally {
      loaded.value = true
      scheduleSave()
      history.reset(snapshot())
    }
  }

  /** Deleted pads keep their audio for undo; blobs nothing references are dropped on the next load. */
  async function collectOrphanAudio() {
    const used = new Set(sounds.value.flatMap((s) => soundAudioIds(s).map(audioKey)))
    for (const k of await keys()) {
      if (typeof k === 'string' && k.startsWith('ssb:audio:') && !used.has(k)) await del(k)
    }
  }

  let saveTimer: ReturnType<typeof setTimeout> | undefined
  function scheduleSave() {
    if (!loaded.value) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const board: SavedBoard = { version: 1, sounds: clone(sounds.value), master: clone(master), presets: clone(presets.value), patches: clone(patches.value) }
      set(BOARD_KEY, board).catch((e) => {
        console.error(e)
        toast.value = 'Saving the board failed'
      })
    }, 300)
  }

  watch(
    sounds,
    () => {
      engine.refreshVoices()
      scheduleSave()
      scheduleHistory()
    },
    { deep: true },
  )
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
  watch(
    patches,
    () => {
      engine.refreshVoices()
      scheduleSave()
      scheduleHistory()
    },
    { deep: true },
  )
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
  watch(() => perform.mod, (v) => {
    engine.setModWheel(v)
    engine.setCC(1, v)
  })
  watch(() => perform.bend, (v) => engine.setBend(v))
  watch(() => perform.pressure, (v) => engine.setChannelPressure(v))
  watch(() => perform.timbre, (v) => engine.setTimbre(v))
  watch(() => master.mpeBendRange, (v) => engine.setMpeBendRange(v), { immediate: true })

  // ── undo / redo ────────────────────────────────────────────────────────
  /** What undo covers: pads and the sound-shaping header state (not volume, view or selection). */
  const snapshot = () =>
    JSON.stringify({ sounds: sounds.value, patches: patches.value, fx: master.fx, mod: master.mod, glide: master.glide, mono: master.mono })
  const history = new History('')
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
    if (!loaded.value) return
    clearTimeout(historyTimer)
    historyTimer = setTimeout(commitHistory, 400)
  }
  function restore(state: string) {
    const data = JSON.parse(state) as {
      sounds: Sound[]
      patches?: Patch[]
      fx: MasterState['fx']
      mod: MasterState['mod']
      glide: number
      mono: boolean
    }
    // update in place so playing voices (which hold the settings object) follow along
    const current = new Map(sounds.value.map((x) => [x.id, x]))
    sounds.value = data.sounds
      .filter((x) => engine.buffers.has(x.audioId))
      .map((x) => {
        const cur = current.get(x.id)
        if (!cur) return x
        Object.assign(cur.settings, x.settings)
        return cur
      })
    // patches too, in place (voices hold layer settings)
    const curP = new Map(patches.value.map((p) => [p.id, p]))
    patches.value = (data.patches ?? []).map((p) => {
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
    Object.assign(master.fx, data.fx)
    Object.assign(master.mod, data.mod)
    master.glide = data.glide
    master.mono = data.mono
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

  function press(id: string, velocity = 1) {
    const sound = resolveSound(id)
    if (!sound) return
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

  function noteOn(note: number, velocity = 1, channel?: number) {
    const sound = playable.value
    if (!sound) return
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

  function noteOff(note: number, channel?: number) {
    heldNotes.value = heldNotes.value.filter((n) => n !== note)
    if (master.mono && !isMember(channel)) {
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
    polyVoices.clear()
    mpeChannels.clear()
    sustainedKeys.clear()
    sustainedPads.clear()
    monoSustained = false
    monoVoices = []
  }

  function panic() {
    engine.stopAll()
    pressed.clear()
    allNotesOff()
    perform.bend = 0
    perform.pressure = 0
  }

  /** An instrument's CC defaults: on load and whenever it becomes the selected patch. */
  function applyCcDefaults(sound: Sound | null | undefined) {
    for (const [cc, v] of Object.entries(sound?.ccDefaults ?? {})) engine.setCC(+cc, v)
  }
  watch(() => master.selectedId, () => applyCcDefaults(selected.value))
  watch(() => master.patchId, () => applyCcDefaults(patchMain.value))

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
    patches.value.push(patch)
    selectPatch(patch.id)
    toast.value = `New patch "${patch.name}"`
    return patch
  }

  function duplicatePatch(id: string) {
    const i = patches.value.findIndex((p) => p.id === id)
    if (i < 0) return
    const copy = clone(patches.value[i])
    copy.id = uid()
    copy.name = `${copy.name} copy`
    for (const x of copy.slots) if (x) x.layer.id = uid()
    patches.value.splice(i + 1, 0, copy)
  }

  function removePatch(id: string) {
    const p = patches.value.find((x) => x.id === id)
    if (!p) return
    for (const l of patchLayers(p)) engine.stopSound(l.id)
    openPanels.delete(id)
    patches.value = patches.value.filter((x) => x.id !== id)
    if (master.patchId === id) selectPatch(patches.value[0]?.id ?? null)
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
  /** Built-in wave sounds (reused if already there) and the factory patches made from them. */
  function installFactory() {
    const waveSound = new Map<string, Sound>()
    for (const { wave, name } of FACTORY_WAVES) {
      const audioId = synthAudioId(wave)
      let snd = sounds.value.find((x) => x.audioId === audioId && !x.zones)
      if (!snd) {
        peaks.set(audioId, computePeaks(engine.getBuffer(audioId)!))
        const settings = { ...defaultSettings(name), ...waveSettings(), tag: 'built-in, synth, wave' }
        snd = { id: uid(), audioId, fileName: `*${wave}`, settings }
        sounds.value.push(snd)
      }
      waveSound.set(wave, snd)
    }
    const d = defaultMaster()
    for (const fp of FACTORY_PATCHES) {
      const slots = fp.slots.map((x) => {
        const src = x && waveSound.get(x.wave)
        if (!x || !src) return null
        const layer = makeLayer(src)
        Object.assign(layer.settings, x.settings ?? {})
        return { ...newSlot(layer), ...x.slot }
      })
      while (slots.length < PATCH_SLOTS) slots.push(null)
      const main = carrierSlot({ slots } as Patch)
      if (main) {
        if (fp.lfo1) Object.assign(main.layer.settings.mod.lfo1, fp.lfo1)
        main.layer.settings.mod.routes.push(...(fp.routes ?? []))
      }
      const header = headerOf({ ...d, ...fp.header, fx: { ...d.fx, ...fp.header?.fx } } as MasterState)
      patches.value.push({ id: uid(), name: fp.name, tag: fp.tag, slots, header })
    }
    master.factory = true
    toast.value = `Added ${FACTORY_PATCHES.length} factory patches`
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
    const board: SavedBoard = { version: 1, sounds: clone(sounds.value), master: clone(master), presets: clone(presets.value), patches: clone(patches.value) }
    zip.file('board.json', JSON.stringify(board, null, 2))
    for (const audioId of new Set(sounds.value.flatMap(soundAudioIds).filter((id) => !isSynthAudioId(id)))) {
      const blob = await get<Blob>(audioKey(audioId))
      if (blob) zip.file(`audio/${audioId}`, blob)
    }
    const out = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(out)
    a.download = `ssb-board-${new Date().toISOString().slice(0, 10)}.zip`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
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
      for (const s of board.sounds) {
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
        const settings = migrateSettings(s.settings)
        settings.tag = addTags(settings.tag, ['imported', stripExt(file.name)])
        const newId = uid()
        soundIds.set(s.id, newId)
        sounds.value.push({ ...s, id: newId, audioId, zones, settings })
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
  async function enableMidi() {
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
        if (master.play) return noteOn(e.note, e.velocity, e.channel)
        for (const s of padsForNote(e.note)) press(s.id, e.velocity)
        return
      case 'noteOff':
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
    sounds, master, openPanels, pressed, tagFilter, peaks, loaded, toast, midi, heldNotes,
    perform, presets, clipboard, matrixScope, canUndo, canRedo, tempo, bpm, noteFor, theme, cycleTheme,
    undo, redo, savePreset, loadPreset, deletePreset, copySettings, pasteSettings, openMatrix, onMidi,
    patches, patchTagFilter, patchTags, visiblePatches, patchFacets, togglePatchTag,
    currentFacets, currentFilter, currentTotal, currentShown, toggleCurrentTag, clearCurrentTags,
    selectedPatch, patchMain, playable, patchNumber, resolveSound, layerSound, patchLayerIds,
    installFactory, selectPatch, selectPatchStep, newPatch, duplicatePatch, removePatch, assignSlot, slotsOf, toggleSlot, toggleFav,
    pressPatch, releasePatch, patchIdOfLayer,
    tags, visible, facets, toggleTag, keyFor, soundForKey, byId, selected, selectedNumber,
    addFiles, load, press, release, panic, noteOn, noteOff,
    select, selectStep, togglePanel, cycleMode, cycleFilter, resetSettings, duplicate, remove, move,
    exportBoard, importBoard, enableMidi, learnMidi,
  }
})
