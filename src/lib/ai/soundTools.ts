/**
 * The agent's sound models: text-to-audio models (MOSS-SoundEffect v2, Stable Audio 3 Small, Stable Audio Open 1.0,
 * or a GGUF the user points at) that the SSB app or plugin runs natively (soundHost.ts). The agent treats them as
 * sub-agents: it sees which are there, loads or switches one (asking the user first when that means a download),
 * and briefs the loaded one with a caption to generate a clip, which lands on the board as a new sample.
 */
import type { useBoard } from '../../stores/board'
import type { AgentTool, ToolReply } from './agent'
import { clipPitch, readPcmWav, shapeClip } from './audio'
import { DEFAULT_SOUND_MODEL, downloadBytes, fmtBytes, SOUND_MODELS, soundModelFrom, type SoundModelInfo } from './soundModels'
import { generateWithStop, loadAndWait, NativeSoundHost, type SoundHostApi, type SoundStatus } from './soundHost'
import { defaultSoundSettings, type SoundSettings } from './types'

type Board = ReturnType<typeof useBoard>

/** how the tools reach the host, as the settings have it when they run */
export interface SoundAgent {
  host(): SoundHostApi
  /** the model picked in the settings, the one to load when the agent names none */
  selected(): SoundModelInfo | null
  /** a Hugging Face token is set (gated models need one) */
  hasToken(): boolean
  /** the agent loaded a model: the settings' pick follows it */
  onLoaded?(model: SoundModelInfo): void
  /** progress while a model downloads and loads */
  onStatus?(s: SoundStatus): void
}

const json = (v: unknown) => JSON.stringify(v)
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d

const describe = (m: SoundModelInfo) => ({
  model: m.id,
  label: m.label,
  good_for: m.strengths,
  max_seconds: m.maxSeconds,
  sample_rate: m.sampleRate,
  channels: m.channels === 2 ? 'stereo' : 'mono',
  default_steps: m.defaultSteps,
})

export function createSoundTools(board: Board, agent: SoundAgent): AgentTool[] {
  const resolve = (model: string | undefined): SoundModelInfo => {
    if (!model) {
      const s = agent.selected()
      if (!s) throw new Error('no sound model is chosen: call sound_models, then load_sound_model with one')
      return s
    }
    const m = soundModelFrom(model)
    if (!m) throw new Error(`"${model}" isn't a sound model: give one of sound_models' ids, or the Hugging Face URL of a GGUF`)
    return m
  }
  /** what the host has loaded, as a catalog model (a custom one: the settings' pick, when it's that) */
  const loadedModel = (st: SoundStatus): SoundModelInfo | null => {
    if (!st.loaded) return null
    const sel = agent.selected()
    return SOUND_MODELS.find((m) => m.id === st.loaded!.id) ?? (sel?.id === st.loaded.id ? sel : null)
  }

  /** the question to ask before loading `m`, when that means a download (null: it's here, or already loaded) */
  async function downloadQuestion(m: SoundModelInfo): Promise<string | null> {
    try {
      const host = agent.host()
      const st = await host.status()
      if (st.loaded?.id === m.id) return null
      const [c] = await host.check([m])
      if (c?.downloaded) return null
      const size = c?.missing ? fmtBytes(c.missing) : downloadBytes(m) ? fmtBytes(downloadBytes(m)) : 'an unknown amount'
      const gated = m.gated && !agent.hasToken() ? ' It is gated: it needs its licence accepted on Hugging Face and a token in the AI settings.' : ''
      return `The agent wants to load the sound model ${m.label}: that downloads ${size} (once), and it takes about ${m.memoryGb} GB of memory while loaded. Download it?${gated}`
    } catch {
      return null // no host: run() says so
    }
  }

  async function ensureLoaded(m: SoundModelInfo, signal?: AbortSignal) {
    const host = agent.host()
    const st = await host.status()
    if (!st.available) throw new Error('this build of SSB has no sound model helper')
    if (st.loaded?.id === m.id && !st.task) return { switched: false, from: null as string | null }
    if (st.task?.kind === 'generate') throw new Error('the sound model is busy generating; try again when it is done')
    await loadAndWait(host, m, agent.onStatus, signal)
    agent.onLoaded?.(m)
    return { switched: true, from: st.loaded?.id ?? null }
  }

  return [
    {
      name: 'sound_models',
      description:
        "The sound models (text-to-audio generators SSB runs on the user's computer) you can brief with make_sound: which one is loaded, which are downloaded, what each is good for. Call it before the first make_sound of a conversation, or to choose between models.",
      schema: { type: 'object', properties: {}, additionalProperties: false },
      run: async (): Promise<ToolReply> => {
        const host = agent.host()
        const selected = agent.selected()
        const models = [...SOUND_MODELS, ...(selected?.custom ? [selected] : [])]
        let st: SoundStatus
        try {
          st = await host.status()
        } catch (e) {
          return { text: json({ available: false, error: (e as Error).message, models: models.map(describe) }) }
        }
        const checks = await host.check(models).catch(() => [])
        return {
          text: json({
            available: st.available,
            busy: st.task ? `${st.task.kind} ${st.task.model}` : null,
            loaded: st.loaded ? { model: st.loaded.id, label: st.loaded.label } : null,
            ...(st.error && st.error.message !== 'cancelled' ? { last_error: st.error } : {}),
            models: models.map((m) => {
              const c = checks.find((x) => x.id === m.id)
              return {
                ...describe(m),
                loaded: st.loaded?.id === m.id,
                selected_in_settings: m.id === selected?.id,
                downloaded: c?.downloaded ?? null,
                ...(c && !c.downloaded ? { download: c.missing ? fmtBytes(c.missing) : 'size unknown' } : {}),
                ...(m.gated ? { gated: agent.hasToken() ? 'yes (a token is set)' : 'yes: needs its licence accepted and a Hugging Face token in the AI settings' } : {}),
              }
            }),
          }),
        }
      },
    },
    {
      name: 'load_sound_model',
      description:
        'Load a sound model (SSB holds one at a time: loading another unloads the one there). A model not yet downloaded is downloaded first, which the user is asked to approve (GB). Loading from disk takes seconds; a download, minutes. make_sound with "model" does this for you; use this to switch ahead of time.',
      schema: {
        type: 'object',
        properties: { model: { type: 'string', description: 'a model id from sound_models (e.g. "moss-soundeffect-v2-q8", "stable-audio-3-small-music-q8")' } },
        required: ['model'],
        additionalProperties: false,
      },
      confirm: async (input: { model: string }) => {
        const m = soundModelFrom(input.model)
        return m ? downloadQuestion(m) : null
      },
      run: async (input: { model: string }, signal?: AbortSignal): Promise<ToolReply> => {
        const m = resolve(input.model)
        const started = Date.now()
        const r = await ensureLoaded(m, signal)
        return {
          text: json({
            loaded: m.id,
            ...(r.switched ? { unloaded: r.from, took_seconds: round((Date.now() - started) / 1000, 1) } : { note: 'it was already loaded' }),
            ...describe(m),
          }),
        }
      },
    },
    {
      name: 'unload_sound_model',
      description: 'Unload the sound model, freeing its memory (when the user asks, or before heavy work of theirs).',
      schema: { type: 'object', properties: {}, additionalProperties: false },
      run: async (): Promise<ToolReply> => {
        const host = agent.host()
        const before = (await host.status()).loaded?.id ?? null
        await host.unload()
        return { text: json({ unloaded: before }) }
      },
    },
    {
      name: 'make_sound',
      description:
        "Brief the loaded sound model (a text-to-audio model on the user's computer) to generate one clip from a caption; it lands on the board as a new sample sound (tagged \"ai\" and the model) you can play, render and put in patch slots. Sound effects, foley, ambiences, textures; with the Stable Audio models also drum loops, one-shots, instrument notes and musical phrases. The clip is trimmed, faded and normalised (-1 dBFS); a clip that holds a steady pitch gets it as its rootNote (and fine) so it plays in tune from the keys. Answers its \"sound\" reference, length, pitch, seed and the model.",
      schema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description:
              'the caption: what is heard, concretely, as a sound designer would label the file ("a heavy steel door slams shut in a large concrete hall, long reverb tail"; "120 BPM boom bap drum loop, dusty vinyl, swung hats"; "single plucked kalimba note, C4, dry, close mic"). For a note to play from the keys, ask for one sustained note at a named pitch',
          },
          negative_prompt: { type: 'string', description: 'what to steer away from (e.g. "music, speech, low quality, distortion")' },
          seconds: { type: 'number', minimum: 0.5, maximum: 60, description: 'how long to generate (default 5; each model has its max_seconds). Silence after it is trimmed' },
          model: { type: 'string', description: 'which sound model (an id from sound_models); default the loaded one. Another loads first (a download asks the user)' },
          steps: { type: 'integer', minimum: 1, maximum: 250, description: "diffusion steps: more is slower and cleaner (default: the model's default_steps). Fewer for a quick sketch" },
          guidance: { type: 'number', minimum: 1, maximum: 15, description: "how literally to follow the caption (default: the model's own)" },
          seed: { type: 'integer', minimum: 0, description: 'repeat a clip exactly (its seed is in the answer); default random' },
          name: { type: 'string', description: 'the sound\'s name, UPPER CASE (e.g. "STEEL DOOR SLAM"); a clip that holds a note gets the note added' },
          tags: { type: 'string', description: 'comma separated (e.g. "sfx, impact, metal")' },
          root_note: { type: 'integer', minimum: 0, maximum: 127, description: 'the MIDI note it sounds at, when you know better than the detection (default: the detected steady pitch, else 60)' },
        },
        required: ['prompt'],
        additionalProperties: false,
      },
      confirm: async (input: { model?: string }) => {
        try {
          const st = await agent.host().status()
          const m = input.model ? soundModelFrom(input.model) : (loadedModel(st) ?? agent.selected())
          return m ? downloadQuestion(m) : null
        } catch {
          return null
        }
      },
      run: async (
        input: { prompt: string; negative_prompt?: string; seconds?: number; model?: string; steps?: number; guidance?: number; seed?: number; name?: string; tags?: string; root_note?: number },
        signal?: AbortSignal,
      ): Promise<ToolReply> => {
        const host = agent.host()
        const m = input.model ? resolve(input.model) : (loadedModel(await host.status()) ?? resolve(undefined))
        const { switched } = await ensureLoaded(m, signal)
        const seconds = Math.min(input.seconds ?? 5, m.maxSeconds)
        const clip = await generateWithStop(host, m, { prompt: input.prompt, negative_prompt: input.negative_prompt, seconds, steps: input.steps, guidance: input.guidance, seed: input.seed }, signal)
        const pcm = readPcmWav(clip.wav)
        if (!pcm) throw new Error('the clip came back in a form that could not be read (not a PCM WAV)')
        const shaped = shapeClip(pcm.channels, pcm.rate, { maxSeconds: seconds + 0.5, keepChannels: true })
        if (shaped.silent) throw new Error('the clip came back silent; try another caption or seed')
        const p = clipPitch(shaped.mono, shaped.rate)
        const tuned = input.root_note === undefined && !!p?.steady
        const rootNote = input.root_note ?? (tuned ? Math.round(p!.midi) : 60)
        const fine = tuned ? -p!.cents : 0
        const base = (input.name?.trim() || input.prompt.trim().replace(/[,.;:].*$/, '').slice(0, 28).trim() || 'CLIP').toUpperCase()
        const name = tuned ? `${base.replace(/\s*\b[A-G]#?-?\d\b/g, '').trim()} ${p!.name}`.trim() : base
        const tags = ['generated', m.tag, ...(input.tags ?? '').split(',').map((t) => t.trim().toLowerCase())].filter(Boolean)
        const snd = await board.addAgentSound(shaped.channels, shaped.rate, { name, tags, rootNote, fine })
        const notes: string[] = []
        if (shaped.peakDb < -30) notes.push(`it came back quiet (peak ${shaped.peakDb} dBFS) and was raised a lot: expect some noise`)
        if (shaped.seconds < seconds * 0.4 && seconds > 2) notes.push(`most of it was silence: ${round(shaped.seconds)} s of ${seconds} s kept`)
        return {
          text: json({
            sound: board.soundRef(snd.id)?.ref ?? snd.id,
            name,
            seconds: round(shaped.seconds),
            channels: shaped.channels.length === 2 ? 'stereo' : 'mono',
            pitch: p ? { note: p.name, cents: p.cents, hz: p.hz, steady: p.steady, voiced_share: p.voiced } : 'none: unpitched (noise, impact, texture)',
            rootNote,
            fine,
            model: m.id,
            ...(switched ? { loaded_model_first: true } : {}),
            seed: clip.seed,
            generated_in_seconds: clip.elapsed,
            ...(notes.length ? { notes } : {}),
          }),
          soundId: snd.id,
        }
      },
    },
  ]
}

/** the sound agent over settings read when each tool runs (the dialog's live settings, or the stored ones for MCP) */
export function soundAgentFrom(settings: () => SoundSettings | null | undefined, hooks: Pick<SoundAgent, 'onLoaded' | 'onStatus'> = {}, host?: SoundHostApi): SoundAgent {
  const s = () => ({ ...defaultSoundSettings(), ...(settings() ?? {}) })
  const native = host ?? new NativeSoundHost(() => s().hfToken)
  return {
    host: () => native,
    selected: () => soundModelFrom(s().model) ?? soundModelFrom(DEFAULT_SOUND_MODEL),
    hasToken: () => !!s().hfToken,
    ...hooks,
  }
}

/** the same from the AI settings as stored: for the MCP server, which answers without the dialog's store */
export function storedSoundAgent(): SoundAgent {
  return soundAgentFrom(() => {
    try {
      return (JSON.parse(localStorage.getItem('ssb:ai:settings') ?? 'null') as { current?: { sound?: SoundSettings } } | null)?.current?.sound
    } catch {
      return null
    }
  })
}
