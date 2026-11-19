/**
 * The sound models SSB's agent generates audio with: text-to-audio models that the SSB app and plugin run
 * natively, in audio.cpp (a helper process the bundle carries: native/plugin/SoundHost). Not in a browser tab.
 *
 * Each is a set of files to download (into Application Support) and how audio.cpp loads them. The GGUF packages
 * come from audio.cpp's own mirror, which needs no account; Stable Audio Open 1.0 comes from Stability's gated
 * repo (a Hugging Face token), arranged as audio.cpp's Stable Audio loader reads a safetensors checkpoint.
 */

export type SoundFamily = 'moss_soundeffect' | 'stable_audio' | 'ace_step' | 'musicgen'

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
  /** run in SSB's page (transformers.js in a worker: lib/ai/pageSound.ts), not by audio.cpp, which hasn't it; SoundHost
   * only downloads its files -- and in a browser tab, where there's no SoundHost, the page fetches them itself (tabSound.ts) */
  page?: boolean
  /** a page model's Hugging Face repo and pinned revision (its files' URLs are under it): what a browser tab loads it from */
  hub?: { repo: string; revision: string }
  /** which of the page's engines runs it (a page model: pageSound.ts) */
  engine?: 'musicgen' | 'sa3'
  /**
   * Its browser form, for a model audio.cpp runs in the app: what a browser tab downloads and runs instead, in the
   * page (soundHost.ts hereForm). The same id either way, so a VCO's choice carries between the app and a tab.
   */
  web?: { engine: 'sa3'; hub: { repo: string; revision: string }; files: SoundFileSpec[]; maxSeconds: number; memoryGb: number; strengths: string }
  /** it sings: a request may carry lyrics (SoundRequest.lyrics) */
  lyrics?: boolean
  /** typed in by the user: not one of the catalog's */
  custom?: boolean
}

const MIRROR = 'https://huggingface.co/audio-cpp/audio.cpp-gguf/resolve/main'
const SAO = 'https://huggingface.co/stabilityai/stable-audio-open-1.0/resolve/main'
/** Xenova's ONNX MusicGen Small, at the revision SSB was tested with */
/** Stable Audio 3 Small Music as a 4-bit ONNX bundle for the browser (lsb's export), at the revision SSB was tested with */
const SA3_WEB_HUB = { repo: 'lsb/stable-audio-3-small-music-onnx', revision: 'd523962dc41a9c632a4928ff9e02538bb11f1806' }
const SA3_WEB_FILES: [string, number][] = [
  ['onnx/text_encoder_q4.onnx', 2232988],
  ['onnx/text_encoder_q4_chunk_0.data', 98304000],
  ['onnx/text_encoder_q4_chunk_1.data', 99418112],
  ['onnx/text_encoder_q4_chunk_2.data', 14811136],
  ['onnx/text_encoder_q4_chunks.json', 330],
  ['onnx/number_conditioner.onnx', 798844],
  ['onnx/number_conditioner_chunks.json', 84],
  ['onnx/dit_q4.onnx', 5929366],
  ['onnx/dit_q4_chunk_0.data', 96468992],
  ['onnx/dit_q4_chunk_1.data', 99614720],
  ['onnx/dit_q4_chunk_2.data', 99614720],
  ['onnx/dit_q4_chunk_3.data', 84451328],
  ['onnx/dit_q4_chunks.json', 367],
  ['onnx/decoder_q4.onnx', 1653261],
  ['onnx/decoder_q4_chunk_0.data', 44894208],
  ['onnx/decoder_q4_chunks.json', 155],
  ['tokenizer/tokenizer.json', 34362428],
  ['tokenizer/tokenizer_config.json', 469],
]
const SA3_WEB_BASE = `https://huggingface.co/${SA3_WEB_HUB.repo}/resolve/${SA3_WEB_HUB.revision}`

const MUSICGEN_HUB = { repo: 'Xenova/musicgen-small', revision: '6a8096dabfff72909ef5eae41461408e29ae20fd' }
const MUSICGEN = `https://huggingface.co/${MUSICGEN_HUB.repo}/resolve/${MUSICGEN_HUB.revision}`
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
    web: {
      engine: 'sa3',
      hub: SA3_WEB_HUB,
      files: SA3_WEB_FILES.map(([path, bytes]) => ({ url: `${SA3_WEB_BASE}/${path}`, path, bytes })),
      maxSeconds: 30,
      memoryGb: 2,
      strengths:
        'music material in stereo: drum loops and grooves, basslines, chord stabs, instrument notes and phrases, pads, risers, textures. Name genre, instrument, BPM and key ("128 BPM tech house drum loop, punchy kick, crisp hats"; "single felt piano note, C3, soft, long decay"). Stereo, 44.1 kHz, up to 30 s. Runs in this browser tab (a 4-bit export, on the GPU through WebGPU where there is one): seconds a clip on a GPU, slower on the CPU.',
    },
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
    // audio.cpp runs SAO 1.0 (its "Foundation" path) with Stable Audio 3's recipe unless told otherwise, and that
    // garbles it. Stability's own recipe instead:
    // - the whole 47.55 s canvas, trimmed afterwards: audio.cpp sizes the canvas to the clip plus duration_padding_sec
    //   (6 s by default), but SAO 1.0 only ever learned the full window -- a short canvas comes out as noise.
    //   Padding past the window gives the whole of it; truncate_output_to_duration still trims to duration_sec.
    // - plain classifier-free guidance: apg_scale defaults to 1 (SA3's adaptive projected guidance)
    // - DPM++ 3M SDE over sigma 0.3..500 (stable-audio-tools' README); audio.cpp's default sampler (pingpong) is
    //   for SA3's rectified flow and goes non-finite with this v-diffusion model
    extraOptions: { sampler_mode: 'dpmpp-3m-sde', duration_padding_sec: 48, apg_scale: 0, sigma_min: 0.3, sigma_max: 500 },
  },
  {
    // ACE-Step 1.5 Turbo: music with vocals that sing the lyrics given. The BF16 package, not the 6 GB Q8: audio.cpp
    // grades a fully quantised ACE-Step "planner sampling can fail" -- its planner LM, quantised, samples another song
    // (docs/models/ace_step.md, docs/gguf.md). Turbo is guidance-distilled: 8 steps at most, guidance ignored.
    id: 'ace-step-1.5-turbo-bf16',
    label: 'ACE-Step 1.5 Turbo',
    tag: 'ace-step',
    family: 'ace_step',
    task: 'gen',
    main: 'ace-step-1.5-turbo-bf16.gguf',
    files: [{ url: `${MIRROR}/ACE-Step1.5-GGUF/turbo/ace-step-1.5-turbo-bf16.gguf`, path: 'ace-step-1.5-turbo-bf16.gguf', bytes: 10_090_406_336 }],
    memoryGb: 12,
    sampleRate: 48000,
    channels: 2,
    maxSeconds: 60,
    license: 'MIT',
    gated: false,
    url: 'https://huggingface.co/ACE-Step/Ace-Step1.5',
    strengths:
      'music with singing: a voice that sings the lyrics given (any of 50+ languages), choirs, hums and vocal lines, over a full arrangement or alone. Caption it as genre, mood, instruments and the voice ("dreamy female vocals, soft synth pads, slow ballad"; "a cappella male choir, cathedral reverb"); put the words to sing in lyrics, with [verse] / [chorus] lines, or "[instrumental]" for none. Stereo, 48 kHz. Its planner writes the song before it is rendered: slower than Stable Audio, faster than MOSS. About 12 GB of memory.',
    stepsOption: 'num_inference_steps',
    defaultSteps: 8,
    defaultGuidance: 1,
    lyrics: true,
  },
  {
    // Meta's MusicGen Small as an ONNX export (Xenova's, for transformers.js), pinned: text encoder and decoder int8,
    // the EnCodec decoder at full precision. audio.cpp has no MusicGen: it runs in the page (page: true).
    id: 'musicgen-small-q8',
    label: 'MusicGen Small',
    tag: 'musicgen',
    family: 'musicgen',
    task: 'gen',
    main: 'onnx/decoder_model_merged_quantized.onnx',
    files: [
      { url: `${MUSICGEN}/config.json`, path: 'config.json', bytes: 7796 },
      { url: `${MUSICGEN}/generation_config.json`, path: 'generation_config.json', bytes: 224 },
      { url: `${MUSICGEN}/tokenizer.json`, path: 'tokenizer.json', bytes: 2_422_191 },
      { url: `${MUSICGEN}/tokenizer_config.json`, path: 'tokenizer_config.json', bytes: 20788 },
      { url: `${MUSICGEN}/onnx/text_encoder_quantized.onnx`, path: 'onnx/text_encoder_quantized.onnx', bytes: 110_443_015 },
      { url: `${MUSICGEN}/onnx/decoder_model_merged_quantized.onnx`, path: 'onnx/decoder_model_merged_quantized.onnx', bytes: 428_422_300 },
      { url: `${MUSICGEN}/onnx/encodec_decode.onnx`, path: 'onnx/encodec_decode.onnx', bytes: 118_056_304 },
    ],
    memoryGb: 1.5,
    sampleRate: 32000,
    channels: 1,
    maxSeconds: 30,
    license: 'CC-BY-NC-4.0 (non-commercial)',
    gated: false,
    url: 'https://huggingface.co/facebook/musicgen-small',
    strengths:
      'instrumental music from a description: genre, instruments, mood and tempo ("lo-fi hip hop beat with warm rhodes chords, 85 bpm"; "80s synthwave arpeggio, driving bass"). Phrases and grooves that develop over the clip; no singing. Mono, 32 kHz, up to 30 s. Runs inside SSB (no sound helper) on one CPU core: about 4 s of work a second of music (5 s in about 20 s). Its weights are licensed for non-commercial use only.',
    stepsOption: 'num_inference_steps',
    defaultSteps: 1,
    defaultGuidance: 3,
    page: true,
    hub: MUSICGEN_HUB,
    engine: 'musicgen',
  },
]

export const DEFAULT_SOUND_MODEL = SOUND_MODELS[0].id
/** a browser tab's default: Stable Audio 3 Small Music, in its browser form */
export const TAB_SOUND_MODEL = 'stable-audio-3-small-music-q8'

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
    (/^stable audio( 3)?( small)?( music)?$/.test(n) ? SOUND_MODELS[1] : undefined) ??
    (/^ace ?step\b/.test(n) ? SOUND_MODELS[4] : undefined) ??
    (/^music ?gen\b/.test(n) ? SOUND_MODELS[5] : undefined)
  if (known) return known
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?(?:huggingface\.co|hf\.co)\/([\w.-]+)\/([\w.-]+)\/(?:blob|resolve)\/([\w.-]+)\/(.+\.gguf)(?:\?.*)?$/i)
  if (!m) return null
  const [, org, repo, rev, file] = m
  const name = file.split('/').pop()!
  const lower = `${repo}/${name}`.toLowerCase()
  const family: SoundFamily | '' = /moss.?sound/.test(lower) ? 'moss_soundeffect' : /stable.?audio/.test(lower) ? 'stable_audio' : /ace.?step/.test(lower) ? 'ace_step' : ''
  const base = family === 'moss_soundeffect' ? SOUND_MODELS[0] : family === 'ace_step' ? SOUND_MODELS[4] : SOUND_MODELS[1]
  return {
    ...base,
    id: `custom-${org}-${repo}-${name}`.replace(/\.gguf$/i, '').replace(/[^\w.-]+/g, '-').slice(0, 120),
    label: name.replace(/\.gguf$/i, ''),
    tag: family === 'moss_soundeffect' ? 'moss' : family === 'ace_step' ? 'ace-step' : family ? 'stable-audio' : 'sound-model',
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
