import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowReactive, toRaw, watch } from 'vue'
import { del, get, set } from 'idb-keyval'
import * as engine from '../audio/engine'
import { computePeaks } from '../audio/peaks'
import { connectMidi } from '../audio/midi'
import type { Voice } from '../audio/voice'
import { stripExt } from '../lib/format'
import { ROOT_NOTE } from '../lib/piano'
import {
  defaultGlobalFx, defaultMaster, defaultSettings, FILTER_TYPES, migrateSettings, TRIGGER_MODES,
  type MasterState, type Sound,
} from '../types'

const BOARD_KEY = 'ssb:board'
const audioKey = (audioId: string) => `ssb:audio:${audioId}`

/** Keyboard triggers, assigned to visible pads in grid order. */
export const PAD_KEYS = '1234567890qwertyuiopasdfghjklzxcvbnm'.split('')

const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|webm|opus)$/i
const isAudio = (f: File) => f.type.startsWith('audio/') || AUDIO_EXT.test(f.name)

interface SavedBoard {
  version: 1
  sounds: Sound[]
  master: MasterState
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

  // ── derived ────────────────────────────────────────────────────────────
  const tags = computed(() =>
    [...new Set(sounds.value.map((s) => s.settings.tag.trim()).filter(Boolean))].sort(),
  )
  const visible = computed(() =>
    tagFilter.value.length
      ? sounds.value.filter((s) => tagFilter.value.includes(s.settings.tag.trim()))
      : sounds.value,
  )
  const keyFor = computed(() => {
    const m = new Map<string, string>()
    visible.value.forEach((s, i) => i < PAD_KEYS.length && m.set(s.id, PAD_KEYS[i]))
    return m
  })
  const soundForKey = computed(() => new Map([...keyFor.value].map(([id, k]) => [k, id])))
  const byId = (id: string) => sounds.value.find((s) => s.id === id)
  const selected = computed(() => (master.selectedId ? byId(master.selectedId) ?? null : null))
  /** 1-based position of the selected patch in the grid. */
  const selectedNumber = computed(() => {
    const i = sounds.value.findIndex((s) => s.id === master.selectedId)
    return i < 0 ? 0 : i + 1
  })

  // ── audio loading ──────────────────────────────────────────────────────
  async function loadAudio(audioId: string, blob: Blob) {
    const buf = await engine.decode(await blob.arrayBuffer())
    engine.buffers.set(audioId, buf)
    peaks.set(audioId, computePeaks(buf))
  }

  async function addFiles(files: File[]) {
    const audio = files.filter(isAudio)
    if (!audio.length) {
      toast.value = 'No audio files in that drop'
      return
    }
    for (const file of audio) {
      const audioId = uid()
      try {
        await loadAudio(audioId, file)
        await set(audioKey(audioId), file)
        const sound: Sound = { id: uid(), audioId, fileName: file.name, settings: defaultSettings(stripExt(file.name)) }
        sounds.value.push(sound)
        if (!master.selectedId) master.selectedId = sound.id
      } catch (e) {
        console.error(e)
        toast.value = `Couldn't decode ${file.name}`
      }
    }
  }

  // ── persistence ────────────────────────────────────────────────────────
  async function load() {
    try {
      const saved = await get<SavedBoard>(BOARD_KEY)
      if (saved) {
        Object.assign(master, defaultMaster(), saved.master, { fx: { ...defaultGlobalFx(), ...saved.master?.fx } })
        const ok: Sound[] = []
        for (const s of saved.sounds) {
          try {
            if (!engine.buffers.has(s.audioId)) {
              const blob = await get<Blob>(audioKey(s.audioId))
              if (!blob) continue
              await loadAudio(s.audioId, blob)
            }
            ok.push({ ...s, settings: migrateSettings(s.settings) })
          } catch (e) {
            console.error(`Dropping ${s.fileName}`, e)
          }
        }
        sounds.value = ok
        if (!selected.value) master.selectedId = ok[0]?.id ?? null
      }
    } finally {
      loaded.value = true
    }
  }

  let saveTimer: ReturnType<typeof setTimeout> | undefined
  function scheduleSave() {
    if (!loaded.value) return
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const board: SavedBoard = { version: 1, sounds: clone(sounds.value), master: clone(master) }
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
    },
    { deep: true },
  )
  watch(
    master,
    () => {
      engine.setMaster(master.volume, master.muted)
      engine.setGlobalFx(master.fx)
      scheduleSave()
    },
    { deep: true, immediate: true },
  )

  // ── pads ───────────────────────────────────────────────────────────────
  function press(id: string) {
    const sound = byId(id)
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
    engine.startVoice(sound)
  }

  function release(id: string) {
    pressed.delete(id)
    if (byId(id)?.settings.mode === 'hold') engine.releaseSound(id)
  }

  // ── keyboard play (MIDI / computer keys → selected patch) ─────────────
  const polyVoices = new Map<number, Voice>()
  let monoVoice: Voice | null = null
  let lastSemis: number | null = null

  function noteOn(note: number, velocity = 1) {
    const sound = selected.value
    if (!sound) return
    engine.resume()
    const semis = note - ROOT_NOTE
    const glide = master.glide
    heldNotes.value = [...heldNotes.value.filter((n) => n !== note), note]
    const opts = {
      note: semis,
      velocity,
      midiNote: note,
      glideTime: glide,
      glideFrom: glide > 0 && lastSemis !== null ? lastSemis : semis,
    }
    lastSemis = semis
    if (master.mono) {
      if (monoVoice?.held && monoVoice.soundId === sound.id) {
        monoVoice.glideTo(semis, glide, note)
        engine.publish()
        return
      }
      monoVoice?.release()
      monoVoice = engine.startVoice(sound, opts)
    } else {
      polyVoices.get(note)?.release()
      const v = engine.startVoice(sound, opts)
      if (v) polyVoices.set(note, v)
    }
  }

  function noteOff(note: number) {
    heldNotes.value = heldNotes.value.filter((n) => n !== note)
    if (master.mono) {
      if (!monoVoice) return
      const top = heldNotes.value.at(-1)
      if (top === undefined) {
        monoVoice.release()
        monoVoice = null
      } else if (top !== monoVoice.midiNote) {
        // fall back to the previous held note, legato
        lastSemis = top - ROOT_NOTE
        monoVoice.glideTo(lastSemis, master.glide, top)
        engine.publish()
      }
    } else {
      polyVoices.get(note)?.release()
      polyVoices.delete(note)
    }
  }

  function allNotesOff() {
    heldNotes.value = []
    polyVoices.clear()
    monoVoice = null
  }

  function panic() {
    engine.stopAll()
    pressed.clear()
    allNotesOff()
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

  // ── editing ────────────────────────────────────────────────────────────
  function togglePanel(id: string) {
    if (openPanels.has(id)) openPanels.delete(id)
    else openPanels.add(id)
  }

  function cycleMode(id: string) {
    const s = byId(id)?.settings
    if (s) s.mode = cycle(TRIGGER_MODES, s.mode)
  }

  function cycleFilter(id: string) {
    const s = byId(id)?.settings
    if (s) s.filterType = cycle(FILTER_TYPES, s.filterType)
  }

  /** Back to defaults, keeping the pad's identity (name, tag, MIDI note). */
  function resetSettings(id: string) {
    const s = byId(id)?.settings
    if (!s) return
    const { name, tag, midiNote } = s
    Object.assign(s, defaultSettings(name), { tag, midiNote })
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
    if (!sounds.value.some((s) => s.audioId === sound.audioId)) {
      engine.forget(sound.audioId)
      peaks.delete(sound.audioId)
      await del(audioKey(sound.audioId))
    }
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

  // ── import / export ────────────────────────────────────────────────────
  async function exportBoard() {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const board: SavedBoard = { version: 1, sounds: clone(sounds.value), master: clone(master) }
    zip.file('board.json', JSON.stringify(board, null, 2))
    for (const audioId of new Set(sounds.value.map((s) => s.audioId))) {
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
      for (const s of board.sounds) {
        let audioId = idMap.get(s.audioId)
        if (!audioId) {
          const entry = zip.file(`audio/${s.audioId}`)
          if (!entry) continue
          audioId = uid()
          const blob = await entry.async('blob')
          await loadAudio(audioId, blob)
          await set(audioKey(audioId), blob)
          idMap.set(s.audioId, audioId)
        }
        sounds.value.push({ ...s, id: uid(), audioId, settings: migrateSettings(s.settings) })
        added++
      }
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
      midi.inputs = await connectMidi({
        noteOn(note, velocity) {
          if (midi.learning) {
            for (const s of sounds.value) if (s.settings.midiNote === note) s.settings.midiNote = null
            const s = byId(midi.learning)
            if (s) s.settings.midiNote = note
            midi.learning = null
            return
          }
          if (master.play) return noteOn(note, velocity / 127)
          for (const s of sounds.value) if (s.settings.midiNote === note) press(s.id)
        },
        noteOff(note) {
          if (master.play) return noteOff(note)
          for (const s of sounds.value) if (s.settings.midiNote === note) release(s.id)
        },
      })
      midi.enabled = true
      toast.value = `MIDI on · ${midi.inputs} input${midi.inputs === 1 ? '' : 's'}`
    } catch (e) {
      toast.value = `MIDI unavailable: ${(e as Error).message}`
    }
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
    tags, visible, keyFor, soundForKey, byId, selected, selectedNumber,
    addFiles, load, press, release, panic, noteOn, noteOff,
    select, selectStep, togglePanel, cycleMode, cycleFilter, resetSettings, duplicate, remove, move,
    exportBoard, importBoard, enableMidi, learnMidi,
  }
})
