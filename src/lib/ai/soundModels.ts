/**
 * The sound models SSB's agent generates audio with: text-to-audio models that the SSB app and plugin run
 * natively, in audio.cpp (a helper process the bundle carries: native/plugin/SoundHost). Not in a browser tab.
 *
 * Each is a set of files to download (into Application Support) and how audio.cpp loads them. The GGUF packages
 * come from audio.cpp's own mirror, which needs no account; Stable Audio Open 1.0 comes from Stability's gated
 * repo (a Hugging Face token), arranged as audio.cpp's Stable Audio loader reads a safetensors checkpoint.
 */

export type SoundFamily = 'moss_soundeffect' | 'stable_audio'

export interface SoundFileSpec {
  url: string
  /** where it goes, inside the model's folder */
  path: string
  bytes: number
}

export interface SoundModelInfo {
  /** a folder name, and how the settings and the agent name it */
  id: string
  label: string
  /** a short tag for the sounds it makes */
  tag: string
  family: SoundFamily | ''
  /** audio.cpp's task (gen: generation) */
  task: string
  /** what audio.cpp loads: a file in the model's folder, or "." for the folder itself */
  main: string
  files: SoundFileSpec[]
  /** roughly what it takes in (GPU / unified) memory while loaded */
  memoryGb: number
  sampleRate: number
  channels: 1 | 2
  maxSeconds: number
  license: string
  /** its files need a Hugging Face token (and the licence accepted on its page) */
  gated: boolean
  /** its page */
  url: string
  /** what it's good at, for the agent choosing between them */
  strengths: string
  /** audio.cpp's request option for steps, and the defaults */
  stepsOption: string
  defaultSteps: number
  defaultGuidance: number
  /** options every request carries */
  extraOptions?: Record<string, string | number | boolean>
  /** typed in by the user: not one of the catalog's */
  custom?: boolean
}

const MIRROR = 'https://huggingface.co/audio-cpp/audio.cpp-gguf/resolve/main'
const SAO = 'https://huggingface.co/stabilityai/stable-audio-open-1.0/resolve/main'
/** audio.cpp's Stable Audio loader reads the prompt encoder from this folder of a safetensors checkpoint */
const T5 = 't5gemma-b-b-ul2'

export const SOUND_MODELS: SoundModelInfo[] = [
  {
    id: 'moss-soundeffect-v2-q8',
    label: 'MOSS-SoundEffect v2',
    tag: 'moss',
    family: 'moss_soundeffect',
    task: 'gen',
    main: 'moss-soundeffect-v2-q8_0.gguf',
    files: [{ url: `${MIRROR}/MOSS-SoundEffect-v2-GGUF/moss-soundeffect-v2-q8_0.gguf`, path: 'moss-soundeffect-v2-q8_0.gguf', bytes: 4_001_175_520 }],
    memoryGb: 6,
    sampleRate: 48000,
    channels: 1,
    maxSeconds: 30,
    license: 'Apache-2.0',
    gated: false,
    url: 'https://huggingface.co/OpenMOSS-Team/MOSS-SoundEffect-v2.0',
    strengths:
      'sound effects and foley at broadcast quality: impacts, whooshes, footsteps, doors, machines, vehicles, weapons, creatures, animals, weather, ambiences and room tones, UI blips, cartoon and sci-fi effects. Literal captions work best ("a heavy wooden door creaks open slowly, then slams"). Mono, 48 kHz. Not music. Slow: it denoises a 30 s canvas whatever the length (about a second a step on Apple Silicon).',
    stepsOption: 'num_steps',
    defaultSteps: 50,
    defaultGuidance: 4,
  },
  {
    id: 'stable-audio-3-small-music-q8',
    label: 'Stable Audio 3 Small Music',
    tag: 'stable-audio',
    family: 'stable_audio',
    task: 'gen',
    main: 'stable-audio-3-small-music-q8_0.gguf',
    files: [{ url: `${MIRROR}/Stable-Audio-3-Small-Music-GGUF/stable-audio-3-small-music-q8_0.gguf`, path: 'stable-audio-3-small-music-q8_0.gguf', bytes: 1_683_576_608 }],
    memoryGb: 3,
    sampleRate: 44100,
    channels: 2,
    maxSeconds: 60,
    license: 'Stability AI Community License',
    gated: false,
    url: 'https://huggingface.co/stabilityai/stable-audio-3-small-music',
    strengths:
      'music material in stereo: drum loops and grooves, basslines, chord stabs, instrument notes and phrases, pads, risers, textures. Name genre, instrument, BPM and key ("128 BPM tech house drum loop, punchy kick, crisp hats"; "single felt piano note, C3, soft, long decay"). Stereo, 44.1 kHz. Fast (seconds).',
    stepsOption: 'num_inference_steps',
    defaultSteps: 8,
    defaultGuidance: 1,
  },
  {
    id: 'stable-audio-3-small-sfx-q8',
    label: 'Stable Audio 3 Small SFX',
    tag: 'stable-audio',
    family: 'stable_audio',
    task: 'gen',
    main: 'stable-audio-3-small-sfx-q8_0.gguf',
    files: [{ url: `${MIRROR}/Stable-Audio-3-Small-SFX-GGUF/stable-audio-3-small-sfx-q8_0.gguf`, path: 'stable-audio-3-small-sfx-q8_0.gguf', bytes: 1_683_576_512 }],
    memoryGb: 3,
    sampleRate: 44100,
    channels: 2,
    maxSeconds: 60,
    license: 'Stability AI Community License',
    gated: false,
    url: 'https://huggingface.co/stabilityai/stable-audio-3-small-sfx',
    strengths:
      'quick stereo sound effects: impacts, whooshes, footsteps, foley, ambiences, UI sounds. Less detailed than MOSS-SoundEffect, much faster (seconds). Stereo, 44.1 kHz.',
    stepsOption: 'num_inference_steps',
    defaultSteps: 8,
    defaultGuidance: 1,
  },
  {
    id: 'stable-audio-open-1.0',
    label: 'Stable Audio Open 1.0',
    tag: 'stable-audio',
    family: 'stable_audio',
    task: 'gen',
    main: '.',
    files: [
      { url: `${SAO}/model_config.json`, path: 'model_config.json', bytes: 4172 },
      { url: `${SAO}/model.safetensors`, path: 'model.safetensors', bytes: 4_853_889_016 },
      { url: `${SAO}/text_encoder/config.json`, path: `${T5}/config.json`, bytes: 1497 },
      { url: `${SAO}/text_encoder/model.safetensors`, path: `${T5}/model.safetensors`, bytes: 438_525_864 },
      { url: `${SAO}/tokenizer/tokenizer.json`, path: `${T5}/tokenizer.json`, bytes: 2_422_169 },
      { url: `${SAO}/tokenizer/spiece.model`, path: `${T5}/tokenizer.model`, bytes: 791_656 },
      { url: `${SAO}/tokenizer/tokenizer_config.json`, path: `${T5}/tokenizer_config.json`, bytes: 20768 },
    ],
    memoryGb: 6,
    sampleRate: 44100,
    channels: 2,
    maxSeconds: 47,
    license: 'Stability AI Community License',
    gated: true,
    url: 'https://huggingface.co/stabilityai/stable-audio-open-1.0',
    strengths:
      'the original Stable Audio Open: drum loops, one-shots, instrument samples, textures and effects in stereo, trained on Freesound and the Free Music Archive. Name BPM and key for loops. Stereo, 44.1 kHz, up to 47 s. Slower than Stable Audio 3 (about 100 steps).',
    stepsOption: 'num_inference_steps',
    defaultSteps: 100,
    defaultGuidance: 7,
    extraOptions: { sampler_mode: 'dpmpp-3m-sde' },
  },
]

export const DEFAULT_SOUND_MODEL = SOUND_MODELS[0].id

/**
 * A model from what the user (or the agent) typed: a catalog id or label or tag ("moss", "stable audio 3 small
 * music"), its Hugging Face page, or the URL of another GGUF on Hugging Face (huggingface.co/org/repo/blob/main/x.gguf),
 * which becomes a custom model (its family guessed from its name; audio.cpp reads it from the file otherwise).
 * Null when it's none of those.
 */
export function soundModelFrom(text: string | null | undefined): SoundModelInfo | null {
  const s = (text ?? '').trim()
  if (!s) return null
  const norm = (x: string) => x.toLowerCase().replace(/[\s_.-]+/g, ' ').trim()
  const n = norm(s)
  const known =
    SOUND_MODELS.find((m) => m.id === s || norm(m.label) === n || norm(m.id) === n || m.url.toLowerCase() === s.toLowerCase().replace(/\/+$/, '')) ??
    (/^moss\b/.test(n) ? SOUND_MODELS[0] : undefined) ??
    (/^stable audio open\b/.test(n) ? SOUND_MODELS[3] : undefined) ??
    (/^stable audio( 3)?( small)? sfx\b/.test(n) ? SOUND_MODELS[2] : undefined) ??
    (/^stable audio( 3)?( small)?( music)?$/.test(n) ? SOUND_MODELS[1] : undefined)
  if (known) return known
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?(?:huggingface\.co|hf\.co)\/([\w.-]+)\/([\w.-]+)\/(?:blob|resolve)\/([\w.-]+)\/(.+\.gguf)(?:\?.*)?$/i)
  if (!m) return null
  const [, org, repo, rev, file] = m
  const name = file.split('/').pop()!
  const lower = `${repo}/${name}`.toLowerCase()
  const family: SoundFamily | '' = /moss.?sound/.test(lower) ? 'moss_soundeffect' : /stable.?audio/.test(lower) ? 'stable_audio' : ''
  const base = family === 'moss_soundeffect' ? SOUND_MODELS[0] : SOUND_MODELS[1]
  return {
    ...base,
    id: `custom-${org}-${repo}-${name}`.replace(/\.gguf$/i, '').replace(/[^\w.-]+/g, '-').slice(0, 120),
    label: name.replace(/\.gguf$/i, ''),
    tag: family === 'moss_soundeffect' ? 'moss' : family ? 'stable-audio' : 'sound-model',
    family,
    main: name,
    files: [{ url: `https://huggingface.co/${org}/${repo}/resolve/${rev}/${file}`, path: name, bytes: 0 }],
    gated: false,
    url: `https://huggingface.co/${org}/${repo}`,
    license: 'see its model card',
    strengths: 'a custom model the user chose: see its model card',
    custom: true,
  }
}

export const downloadBytes = (m: SoundModelInfo) => m.files.reduce((n, f) => n + f.bytes, 0)

export function fmtBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 1 : 2)} GB`
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`
  return `${Math.max(0, Math.round(n / 1e3))} kB`
}
