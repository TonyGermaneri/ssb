/**
 * What the agent can do to the board: find sounds and patches, read a patch as a spec, create / change / delete
 * patches (every change one undo step, checked before anything moves), select one for the user to play, render
 * a note offline into measurements and pictures it can look at, and brief the audio agent (audio.ts) to record a
 * take that becomes a sample sound.
 */
import type { useBoard } from '../../stores/board'
import { patchLayers, type Patch, type Sound } from '../../types'
import type { AgentTool, ToolReply } from './agent'
import { analyse } from './analysis'
import { isTableAudioId, loadAkwf, tableFolderOf, tableLength } from '../akwf'
import { applyChange, fromSpec, toSpec, type PatchChange, type PatchSpec } from './patchSpec'
import { matchesScript, OPENAI_VOICES, performTake, readPcmWav, shapeTake, takePitch, type AudioAgentConfig } from './audio'
import type { JsonSchema } from './types'

type Board = ReturnType<typeof useBoard>

const json = (v: unknown) => JSON.stringify(v)
const uid = () => crypto.randomUUID()

const routeSchema: JsonSchema = {
  type: 'object',
  properties: { source: { type: 'string' }, dest: { type: 'string' }, amount: { type: 'number', minimum: -1, maximum: 1 } },
  required: ['source', 'dest', 'amount'],
}
const values = (description: string): JsonSchema => ({ type: 'object', description, additionalProperties: true })
const slotSchema = (forUpdate: boolean): JsonSchema => ({
  type: ['object', 'null'],
  description: forUpdate
    ? 'Changes to the slot: settings / slot / lfo1 / lfo2 merge into what is there; routes replaces the list; a new "sound" swaps the sound (a fresh layer). null empties the slot.'
    : 'A slot: its sound and the knobs that differ from the sound\'s own. null = empty.',
  properties: {
    sound: { type: 'string', description: 'an AKWF wave name (e.g. "AKWF_saw") or a sound id from list_sounds' },
    settings: values('layer settings (see the parameter reference): only what differs from the sound\'s own'),
    slot: values('level, audible, track, transpose, fine, fixedNote, tuning, tuningDepth'),
    lfo1: values('the layer\'s LFO 1: shape, rate, sync, division, amount, …'),
    lfo2: values('the layer\'s LFO 2'),
    routes: { type: 'array', items: routeSchema, description: 'the layer\'s mod routes' },
  },
  ...(forUpdate ? {} : { required: ['sound'] }),
})
const mpeSchema: JsonSchema = {
  type: 'array',
  description: 'what an MPE controller\'s surfaces do to the patch, only while the player has MPE on: bind press and slide on every patch, strike where it adds expression',
  items: {
    type: 'object',
    properties: {
      surface: { type: 'string', enum: ['strike', 'press', 'slide'] },
      dest: { type: 'string', description: 'a route destination (cutoff, resonance, volume, reverbMix, delayMix, grainSize, grainVar, lfo1Amt, …)' },
      amount: { type: 'number', minimum: -1, maximum: 1 },
      slots: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 3 }, description: 'only these slots (default: every slot)' },
    },
    required: ['surface', 'dest', 'amount'],
  },
}
const headerSchema: JsonSchema = {
  type: 'object',
  description: 'volume, mono, glide, bpm; fx: master chorus/delay/reverb; mod: {lfo1, lfo2, routes} (global)',
  properties: {
    volume: { type: 'number' },
    mono: { type: 'boolean' },
    glide: { type: 'number' },
    bpm: { type: 'number' },
    fx: values('chorusRate, chorusDepth, chorusMix, delayTime, delaySync, delayDivision, delayFeedback, delayMix, reverbSize, reverbDecay, reverbMix'),
    mod: { type: 'object', properties: { lfo1: values('global LFO 1'), lfo2: values('global LFO 2'), routes: { type: 'array', items: routeSchema } } },
  },
}

export interface ToolOptions {
  /** ask before delete_patch */
  confirmDeletes: boolean
  /** the audio agent make_audio briefs, as configured when it runs (null: not set up) */
  audio?: () => AudioAgentConfig | null
}

export function createTools(board: Board, o: ToolOptions): AgentTool[] {
  const patchOf = (id?: string): Patch => {
    const p = id ? board.patchById(id) : board.selectedPatch
    if (!p) throw new Error(id ? `no patch with id ${id} (list_patches shows them)` : 'no patch is selected; give a patch_id')
    return p
  }
  const slotNames = (p: Patch) => p.slots.map((x) => (x ? (board.byId(x.layer.soundId)?.settings.name ?? '?') : null))
  /** the semantic index, loaded (for ordering by a description) */
  const semantic = async () => {
    await board.semantic.load().catch(() => {})
    return board.semantic.ready.value ? board.semantic : null
  }
  const page = <T>(list: T[], offset = 0, limit = 20) => list.slice(Math.max(0, offset), Math.max(0, offset) + Math.min(50, Math.max(1, limit)))

  const tools: AgentTool[] = [
    {
      name: 'board_state',
      description: 'What is on the board now: the selected patch, how many patches and sounds, and the AKWF categories (each a wavetable; with their wave counts) list_sounds can filter by.',
      schema: { type: 'object', properties: {}, additionalProperties: false },
      run: () => {
        const cats = new Map<string, number>()
        for (const s of board.akwfWaves()) for (const t of s.settings.tag.split(',').map((x) => x.trim())) if (t.startsWith('akwf_')) cats.set(t, (cats.get(t) ?? 0) + 1)
        const sel = board.selectedPatch
        return {
          text: json({
            selected_patch: sel ? { id: sel.id, name: sel.name } : null,
            patches: board.patches.length,
            sounds: board.sounds.length,
            own_samples: board.sounds.filter((s) => !/^akw[ft]-|^synth:/.test(s.audioId)).length,
            wave_categories: Object.fromEntries([...cats].sort((a, b) => b[1] - a[1])),
          }),
        }
      },
    },
    {
      name: 'list_sounds',
      description:
        'Find sounds for patch slots: the board\'s sounds (its AKWF wavetables, the user\'s samples) and every single AKWF wave. With a query, ordered by how well each matches it (what it sounds like, its name and tags: "bright buzzy saw", "breathy choir", "glassy bell"); a category (e.g. "akwf_epiano") narrows to one. Returns each one\'s "sound" reference for specs (a wave\'s is its name: its table at that wave), its name and tags, and for a wavetable how many waves it holds.',
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'what you are looking for, in words' },
          category: { type: 'string', description: 'a tag to filter by, e.g. akwf_saw (board_state lists them)' },
          limit: { type: 'integer', minimum: 1, maximum: 50 },
          offset: { type: 'integer', minimum: 0 },
        },
        additionalProperties: false,
      },
      run: async (input: { query?: string; category?: string; limit?: number; offset?: number }) => {
        await loadAkwf().catch(() => {})
        let list: Sound[] = [...board.sounds, ...board.akwfWaves()]
        if (input.category) {
          const c = input.category.toLowerCase()
          list = list.filter((s) => s.settings.tag.toLowerCase().split(',').some((t) => t.trim() === c))
        }
        if (input.query?.trim()) {
          const idx = await semantic()
          if (idx) {
            const scores = idx.matchText('sound', input.query, list)
            list = [...list].sort((a, b) => (scores.get(b.id) ?? -2) - (scores.get(a.id) ?? -2))
          } else {
            const words = input.query.toLowerCase().split(/\s+/).filter(Boolean)
            list = list.filter((s) => words.some((w) => `${s.settings.name} ${s.settings.tag}`.toLowerCase().includes(w)))
          }
        }
        const shown = page(list, input.offset, input.limit ?? 20).map((s) => {
          if (s.id.startsWith('wave:')) return { sound: s.id.slice(5), name: s.settings.name, tags: s.settings.tag, table: tableFolderOf(s.audioId), wt: s.settings.wt }
          const r = board.soundRef(s.id)!
          const waves = isTableAudioId(s.audioId) ? tableLength(tableFolderOf(s.audioId)) : 0
          return { sound: r.ref, name: s.settings.name, tags: s.settings.tag, ...(waves ? { wavetable_waves: waves } : {}) }
        })
        return { text: json({ total: list.length, sounds: shown }) }
      },
    },
    {
      name: 'list_patches',
      description: 'The board\'s patches: id, name, tags and the sounds in their slots. With a query, ordered by likeness to it; with a tag, only those carrying it (e.g. "factory", "ai", "pad").',
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          tag: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 50 },
          offset: { type: 'integer', minimum: 0 },
        },
        additionalProperties: false,
      },
      run: async (input: { query?: string; tag?: string; limit?: number; offset?: number }) => {
        let list: Patch[] = board.patches
        if (input.tag) {
          const t = input.tag.toLowerCase()
          list = list.filter((p) => p.tag.toLowerCase().split(',').some((x) => x.trim() === t))
        }
        if (input.query?.trim()) {
          const idx = await semantic()
          if (idx) {
            const scores = idx.matchText('patch', input.query, list)
            list = [...list].sort((a, b) => (scores.get(b.id) ?? -2) - (scores.get(a.id) ?? -2))
          } else {
            const words = input.query.toLowerCase().split(/\s+/).filter(Boolean)
            list = list.filter((p) => words.some((w) => `${p.name} ${p.tag}`.toLowerCase().includes(w)))
          }
        }
        const shown = page(list, input.offset, input.limit ?? 20).map((p) => ({ id: p.id, name: p.name, tags: p.tag, slots: slotNames(p) }))
        return { text: json({ total: list.length, selected: board.master.patchId, patches: shown }) }
      },
    },
    {
      name: 'read_patch',
      description: 'A patch as a spec (the form create_patch and update_patch take): each slot\'s sound and the knobs that differ from it, the header\'s changes from a new patch. Without patch_id, the selected patch.',
      schema: { type: 'object', properties: { patch_id: { type: 'string' } }, additionalProperties: false },
      run: (input: { patch_id?: string }) => ({ text: json(toSpec(patchOf(input.patch_id), board.soundRef)) }),
    },
    {
      name: 'create_patch',
      description: 'Make a new patch from a spec, add it to the board and select it (the user can play it at once). Answers its id. Check it with render_patch.',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'UPPER CASE, evocative, like the built-ins (e.g. "VELVET HAMMER KEYS")' },
          tags: { type: 'string', description: 'comma separated: kind (pad, lead, bass, keys, pluck, fx…), character, technique' },
          slots: { type: 'array', minItems: 1, maxItems: 3, items: slotSchema(false) },
          mpe: mpeSchema,
          header: headerSchema,
        },
        required: ['name', 'slots'],
        additionalProperties: false,
      },
      run: async (input: PatchSpec) => {
        const { patch, issues } = await fromSpec(input, board.resolveSoundRef, uid)
        if (!patch) throw new Error(`nothing was created:\n- ${issues.errors.join('\n- ')}`)
        const added = board.addAgentPatch(patch)
        return { text: json({ created: added.id, name: added.name, notes: issues.notes }) }
      },
    },
    {
      name: 'update_patch',
      description:
        'Change a patch: name, tags, header (merged; fx merged; mod.routes replaced if given), mpe (replaced if given) and slots by number ("1".."3": settings / slot / lfo1 / lfo2 merge, routes replace, a new sound swaps the layer, null empties). All of it is checked first; nothing changes unless all of it is valid. One undo step. It plays at once and is kept when the user presses SAVE.',
      schema: {
        type: 'object',
        properties: {
          patch_id: { type: 'string' },
          name: { type: 'string' },
          tags: { type: 'string' },
          header: headerSchema,
          mpe: mpeSchema,
          slots: { type: 'object', properties: { '1': slotSchema(true), '2': slotSchema(true), '3': slotSchema(true) }, additionalProperties: false },
        },
        required: ['patch_id'],
        additionalProperties: false,
      },
      run: async (input: PatchChange & { patch_id: string }) => {
        const p = patchOf(input.patch_id)
        const { patch_id: _id, ...change } = input
        const { patch, issues } = await applyChange(p, change, board.resolveSoundRef, uid)
        if (!patch) throw new Error(`nothing was changed:\n- ${issues.errors.join('\n- ')}`)
        board.replacePatch(p.id, patch)
        if (board.master.patchId !== p.id) board.selectPatch(p.id)
        const saved = 'playing, not saved: the user keeps it with SAVE (choosing another patch drops it)' + (board.isBuiltIn(p) ? '; a built-in stays as it is, SAVE makes it a patch of their own' : '')
        return { text: json({ updated: p.id, name: patch.name, saved, notes: issues.notes }) }
      },
    },
    {
      name: 'delete_patch',
      description: 'Delete a patch (only when the user asks). It can be undone.',
      schema: { type: 'object', properties: { patch_id: { type: 'string' } }, required: ['patch_id'], additionalProperties: false },
      confirm: (input: { patch_id: string }) => {
        if (!o.confirmDeletes) return null
        const p = board.patchById(input.patch_id)
        return p ? `Delete the patch “${p.name}”?` : null
      },
      run: (input: { patch_id: string }) => {
        const p = patchOf(input.patch_id)
        board.removePatches([p.id])
        return { text: json({ deleted: p.id, name: p.name }) }
      },
    },
    {
      name: 'select_patch',
      description: 'Select a patch, so the keyboard plays it and the rack shows it.',
      schema: { type: 'object', properties: { patch_id: { type: 'string' } }, required: ['patch_id'], additionalProperties: false },
      run: (input: { patch_id: string }) => {
        const p = patchOf(input.patch_id)
        board.selectPatch(p.id)
        return { text: json({ selected: p.id, name: p.name }) }
      },
    },
    {
      name: 'make_audio',
      description:
        'Brief the audio agent (a separate voice model) to perform and record one take; it lands on the board as a new sample sound (tagged "ai") you can put in patch slots. It is a voice: speech in any delivery, sung or hummed sustained notes and vowels ("ooh", "aah", "mmm"), whispers, breaths, shouts and vocal chops, beatbox and mouth percussion, vocal sound effects. Not instruments, not music beyond one voice. The take is trimmed, faded and normalised (-1 dBFS); a steadily pitched take gets that pitch as its rootNote (and fine) so it plays in tune on the keys. Answers its "sound" reference, length, pitch and what it voiced. Each take costs the user a little (OpenAI audio); make one when it serves what they asked for.',
      schema: {
        type: 'object',
        properties: {
          script: {
            type: 'string',
            description: 'exactly what it voices, nothing else: the words ("Super Sound Board"), or the sound spelled out ("Ooooooh", "Mmmmmm", "Shhhhh", "pff tss k tss"). Never put directions here: they get read aloud',
          },
          delivery: {
            type: 'string',
            description: 'how to perform it: voice quality, emotion, pace, pitch and length (e.g. "sung: one long steady note on middle C, soft and pure, about 4 seconds, no vibrato"; "deep, slow, robotic announcer, a pause between words")',
          },
          voice: { type: 'string', enum: [...OPENAI_VOICES], description: 'whose voice (default: the one in the settings)' },
          name: { type: 'string', description: 'the sound\'s name, UPPER CASE (e.g. "SOFT HUM"); a take that holds a note gets the note it holds added (any note you wrote is replaced)' },
          tags: { type: 'string', description: 'comma separated (e.g. "vocal, hum, sustained")' },
          max_seconds: { type: 'number', minimum: 0.5, maximum: 60, description: 'cut the take there (default 20)' },
          root_note: { type: 'integer', minimum: 0, maximum: 127, description: 'the MIDI note the take sounds at, when you know better than the detection (default: the detected steady pitch, else 60)' },
        },
        required: ['script'],
        additionalProperties: false,
      },
      run: async (
        input: { script: string; delivery?: string; voice?: string; name?: string; tags?: string; max_seconds?: number; root_note?: number },
        signal?: AbortSignal,
      ): Promise<ToolReply> => {
        const cfg = o.audio?.()
        if (!cfg) throw new Error('the audio agent is not set up: it needs an OpenAI API key (the user adds one in the AI settings, under AUDIO AGENT or as the OpenAI provider\'s key). Tell the user.')
        const take = await performTake(cfg, { script: input.script, delivery: input.delivery, voice: input.voice }, signal)
        const pcm = readPcmWav(take.wav)
        if (!pcm) throw new Error('the take came back in a form that could not be read (not a PCM WAV)')
        const shaped = shapeTake(pcm.channels, pcm.rate, { maxSeconds: input.max_seconds ?? 20 })
        if (shaped.silent) throw new Error(`the take came back silent${take.transcript ? ` (it says it voiced: “${take.transcript}”)` : ''}; try again, reworded`)
        const p = takePitch(shaped.data, shaped.rate)
        const tuned = input.root_note === undefined && !!p?.steady
        const rootNote = input.root_note ?? (tuned ? Math.round(p!.midi) : 60)
        const fine = tuned ? -p!.cents : 0
        // a take that holds a note is named with the note it holds (not one guessed before it was heard)
        const base = (input.name?.trim() || input.script.trim().slice(0, 24) || 'TAKE').toUpperCase()
        const name = tuned ? `${base.replace(/\s*\b[A-G]#?-?\d\b/g, '').trim()} ${p!.name}`.trim() : base
        const tags = ['take', ...(input.tags ?? '').split(',').map((t) => t.trim().toLowerCase())].filter(Boolean)
        const snd = await board.addAgentSound([shaped.data], shaped.rate, { name, tags, rootNote, fine })
        const notes: string[] = []
        if (shaped.cut) notes.push(`it ran past ${input.max_seconds ?? 20} s and was cut there`)
        if (!matchesScript(input.script, take.transcript)) notes.push('what it says it voiced differs from the script (it may have answered or improvised): listen with render_patch, or try again with the script reworded')
        if (shaped.peakDb < -30) notes.push(`it came back quiet (peak ${shaped.peakDb} dBFS) and was raised a lot: expect some noise`)
        return {
          text: json({
            sound: board.soundRef(snd.id)?.ref ?? snd.id,
            name,
            seconds: Math.round(shaped.seconds * 100) / 100,
            voiced: take.transcript,
            pitch: p
              ? { note: p.name, cents: p.cents, hz: p.hz, steady: p.steady, voiced_share: p.voiced }
              : 'none: unpitched (noise, whisper, percussion)',
            rootNote,
            fine,
            voice: take.voice,
            model: take.model,
            audio_tokens: { in: take.usage.audioIn, out: take.usage.audioOut },
            ...(notes.length ? { notes } : {}),
          }),
          soundId: snd.id,
        }
      },
    },
    {
      name: 'render_patch',
      description:
        'Play one note of a patch (or a single sound) offline and silently, then measure it: peak / RMS level, pitch, brightness (spectral centroid), attack / decay / release, harmonics, noise, stereo, clipping; and return a waveform picture (with a zoom on a few cycles) and a spectrogram (log frequency, dB colour) to look at. Without patch_id or sound, the selected patch.',
      schema: {
        type: 'object',
        properties: {
          patch_id: { type: 'string' },
          sound: { type: 'string', description: 'render a single sound instead (an AKWF wave name or sound id)' },
          note: { type: 'integer', minimum: 0, maximum: 127, description: 'MIDI note (60 = C4, default)' },
          velocity: { type: 'number', minimum: 0.01, maximum: 1 },
          hold: { type: 'number', minimum: 0.05, maximum: 10, description: 'seconds the key is held (default 1.5)' },
          tail: { type: 'number', minimum: 0, maximum: 10, description: 'seconds after release (default 1)' },
          wet: { type: 'boolean', description: 'include the header\'s master chorus/delay/reverb (default false: dry)' },
          mpe: {
            type: 'object',
            description: 'play it as an MPE note with its surfaces held here (0..1), its "mpe" bindings acting; leave out to hear it as with MPE off. Strike is the velocity',
            properties: { press: { type: 'number', minimum: 0, maximum: 1 }, slide: { type: 'number', minimum: 0, maximum: 1 } },
            additionalProperties: false,
          },
          images: { type: 'array', items: { type: 'string', enum: ['waveform', 'spectrogram'] }, description: 'which pictures (default both; [] for numbers only)' },
        },
        additionalProperties: false,
      },
      run: async (input: {
        patch_id?: string
        sound?: string
        note?: number
        velocity?: number
        hold?: number
        tail?: number
        wet?: boolean
        mpe?: { press?: number; slide?: number }
        images?: string[]
      }): Promise<ToolReply> => {
        let title = ''
        let req: Parameters<Board['renderOffline']>[0]
        if (input.sound) {
          const s = await board.resolveSoundRef(input.sound)
          if (!s) throw new Error(`no sound "${input.sound}"`)
          req = { soundId: s.id }
          title = s.name
        } else {
          const p = patchOf(input.patch_id)
          if (!patchLayers(p).length) throw new Error(`patch ${p.name} has no sounds`)
          req = { patchId: p.id }
          title = p.name
        }
        const r = await board.renderOffline({ ...req, note: input.note, velocity: input.velocity, hold: input.hold, tail: input.tail, wet: input.wet, mpe: input.mpe })
        const a = analyse(r, title)
        const want = input.images ?? ['waveform', 'spectrogram']
        const images = (['waveform', 'spectrogram'] as const).filter((k) => want.includes(k)).map((k) => ({ mediaType: 'image/png' as const, data: a.images[k] }))
        const how = `${input.wet ? ' (wet)' : ' (dry)'}${input.mpe ? ` (MPE: press ${input.mpe.press ?? 0}, slide ${input.mpe.slide ?? 0})` : ''}`
        return { text: `${title}${how}\n${a.summary}`, images }
      },
    },
  ]
  return tools
}
