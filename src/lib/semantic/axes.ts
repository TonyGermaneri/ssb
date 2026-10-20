/**
 * What a description asks of a sound, beyond which patches it's like: "warm", "evolving", "plucky", "huge"… Each word
 * of the query (spelt out first by a small synth vocabulary, as rolidrummer rewrites "heavy rock" to "hard rock") is
 * compared with both ends of a few axes (bright ↔ dark, slow ↔ fast attack, long ↔ short, wide ↔ dry, moving ↔ still,
 * gritty ↔ clean); a word near one end and clearly further from the other pushes the candidate's settings that way.
 */
import { dot, type TextModel } from '../embed/model2vec'

/** synth words the model knows only vaguely, in words it knows */
const SPELL: Record<string, string> = {
  plucky: 'plucked short percussive', pluck: 'plucked short', glassy: 'glass bright clean bell', airy: 'light open breath wide',
  breathy: 'breath noise airy', fat: 'thick wide detuned', phat: 'thick wide detuned', detuned: 'detuned unison wide',
  metallic: 'metal bell fm', hollow: 'hollow narrow', buzzy: 'buzz bright saw', shimmering: 'shimmer bright moving wide',
  shimmery: 'shimmer bright moving wide', lofi: 'lo fi dull vintage', grimy: 'dirty gritty', crunchy: 'distorted gritty',
  squelchy: 'resonant acid', acid: 'resonant acid squelch', dubstep: 'wobble bass', wobbly: 'wobble moving',
  wobble: 'wobble moving', reese: 'detuned bass', supersaw: 'detuned saw unison wide', stab: 'short punchy',
  swell: 'slow swell', swelling: 'slow swell', bowed: 'slow bowed strings', drone: 'long sustained drone',
  ambient: 'spacious long ambient', cinematic: 'huge spacious evolving', ethereal: 'airy spacious soft',
  dreamy: 'soft spacious moving', haunting: 'dark spacious', lush: 'lush wide', huge: 'huge wide', massive: 'huge wide',
  tight: 'tight short dry', punchy: 'punchy fast', snappy: 'snappy fast short', percussive: 'percussive fast short',
  smooth: 'smooth soft clean', mellow: 'mellow warm soft', warm: 'warm', bright: 'bright', dark: 'dark',
  chip: 'chiptune video game', chiptune: 'chiptune video game', '8bit': 'chiptune video game', '16bit': 'video game', keys: 'keys keyboard',
  rhodes: 'electric piano', wurly: 'electric piano', ep: 'electric piano', organ: 'organ', choir: 'choir voices',
  vox: 'voice', vocal: 'voice', formant: 'vocal formant', arp: 'arpeggio', seq: 'sequence', sfx: 'sound effects',
  fx: 'sound effects', sub: 'sub bass deep', subby: 'sub bass deep', growl: 'growl gritty', evolving: 'evolving moving',
}
export const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'with', 'of', 'in', 'on', 'for', 'to', 'like', 'very', 'some', 'that', 'sound', 'sounds', 'sounding', 'patch', 'kind', 'sort', 'bit', 'more', 'less', 'really', 'quite', 'little', 'lot'])

/** the query's words, spelt out ("plucky bell" → "plucky plucked short percussive bell") */
export function spellQuery(q: string): string {
  const out: string[] = []
  for (const w of q.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!w) continue
    out.push(w)
    if (SPELL[w] && SPELL[w] !== w) out.push(SPELL[w])
  }
  return out.join(' ')
}

export interface Axis {
  id: string
  /** what the candidate's chip says, toward each end */
  label: [string, string]
  /** the words at each end: [−1, +1] */
  ends: [string, string]
}
export const AXES: Axis[] = [
  { id: 'bright', label: ['DARKER', 'BRIGHTER'], ends: ['dark warm mellow muffled soft', 'bright brilliant crisp sharp shiny'] },
  { id: 'attack', label: ['FASTER ATTACK', 'SLOWER ATTACK'], ends: ['fast snappy punchy percussive attack', 'slow swell fade gradual'] },
  { id: 'length', label: ['SHORTER', 'LONGER'], ends: ['short staccato plucked brief', 'long sustained drone ringing'] },
  { id: 'space', label: ['DRIER', 'WIDER'], ends: ['narrow dry tight mono small', 'wide spacious huge lush stereo'] },
  { id: 'motion', label: ['STILLER', 'MORE MOTION'], ends: ['static steady stable constant plain', 'evolving moving wobbling modulated animated'] },
  { id: 'grit', label: ['CLEANER', 'GRITTIER'], ends: ['clean pure smooth soft gentle', 'gritty harsh distorted dirty aggressive'] },
  { id: 'weight', label: ['LIGHTER', 'HEAVIER'], ends: ['thin light delicate airy', 'thick heavy fat massive'] },
]

/** a word must be this near one end, and this much nearer it than the other, to count */
const NEAR = 0.42
const MARGIN = 0.1

export interface Push {
  axis: Axis
  /** −1..1 toward the axis's ends */
  amount: number
}

/** How far the query pushes along each axis (only the axes it pushes). */
export function queryPushes(model: TextModel, query: string): Push[] {
  const ends = AXES.map((a) => a.ends.map((t) => model.embed(t)) as [Float32Array, Float32Array])
  const words = [...new Set(spellQuery(query).split(' '))].filter((w) => w.length > 1 && !STOP.has(w))
  const sum = new Float32Array(AXES.length)
  for (const w of words) {
    const v = model.embed(w)
    AXES.forEach((_, i) => {
      const lo = dot(v, ends[i][0])
      const hi = dot(v, ends[i][1])
      const d = hi - lo
      if (Math.max(lo, hi) < NEAR || Math.abs(d) < MARGIN) return
      sum[i] += Math.sign(d) * Math.min(1, (Math.abs(d) - MARGIN / 2) * 2.5)
    })
  }
  return AXES.flatMap((axis, i) => (Math.abs(sum[i]) >= 0.15 ? [{ axis, amount: Math.max(-1, Math.min(1, sum[i])) }] : []))
}
