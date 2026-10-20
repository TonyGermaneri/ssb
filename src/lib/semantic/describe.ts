/**
 * The words semantic search embeds for a sound or patch (as rolidrummer's semanticDescription: cleaned of ids and
 * vendor noise, abbreviations spelt out): its NAME words (name, tags, a patch's VCO sounds) and its SOUND words,
 * made from its settings ("slow attack", "dark", "grain cloud", "vibrato", "glide"…). The two are embedded apart,
 * so a whimsical name (WOOL BLANKET PAD) and what it does (slow, wide) both count. A sentence vector is the mean of
 * its words, so only what sets a sound apart is said, once: defaults ("instant attack", an open filter) say nothing.
 */
import { categoryLabel } from '../akwf'
import { splitTags } from '../tags'
import type { GlobalFx, ModMatrix, Patch, PatchHeader, PatchSlot, SoundSettings } from '../../types'

/** tags that say where a sound came from, not what it is */
const SOURCE_TAGS = new Set([
  'factory', 'akwf', 'dropped', 'sample', 'sfz', 'imported', 'url', 'gm', 'dirt-samples', 'sfzinstruments', 'patch',
  'search', 'freepats',
])
/** short forms in names, tags and AKWF's folders */
const SPELL: Record<string, string> = {
  squ: 'square', sqr: 'square', sin: 'sine', tri: 'triangle', ep: 'electric piano', epiano: 'electric piano',
  eorgan: 'electric organ', hvoice: 'human voice', vgame: 'video game', oscchip: 'chip', fmsynth: 'fm synth',
  vco: '', bw: '', perfectwaves: 'pure', bitreduced: 'bit crushed', dbass: 'bass', ebass: 'electric bass',
  aguitar: 'acoustic guitar', eguitar: 'electric guitar', altosax: 'sax', vgsaw: 'video game saw', vgsin: 'video game sine',
  vgsqu: 'video game square', vgtri: 'video game triangle', pwm: 'pulse width', am: 'amplitude modulation',
  fx: 'effects', sfx: 'sound effects', arp: 'arpeggio', perc: 'percussion', bd: 'kick drum', sd: 'snare drum',
  hh: 'hihat', rnd: 'random', vox: 'voice', akwf: '', symetric: 'symmetric',
}

/** a text as its words: lower case, ids dropped (0001, c604), short forms spelt out */
export function cleanWords(text: string): string[] {
  const out: string[] = []
  for (const raw of text.toLowerCase().split(/[^a-z0-9#]+/)) {
    if (!raw) continue
    // numbers that are ids, not names: 0001, 2048 (808 and 303 are names)
    if (/^\d+$/.test(raw) && (raw.length >= 4 || raw.startsWith('0'))) continue
    if (/^[a-z]\d{2,}$/.test(raw)) continue // c604, s12: AKWF's set ids
    const spelt = SPELL[raw]
    if (spelt === '') continue
    out.push(...(spelt ?? raw).split(' '))
  }
  return out
}
const unique = (words: string[]) => [...new Set(words.flatMap((w) => w.split(' ')).filter(Boolean))].join(' ')

/** a tag as words: AKWF's categories by their names (akwf_epiano → electric piano), source tags left out */
function tagWords(tag: string): string[] {
  const t = tag.trim().toLowerCase()
  if (!t || SOURCE_TAGS.has(t)) return []
  if (t.startsWith('akwf_')) return cleanWords(categoryLabel(`AKWF_${t.slice(5)}`))
  return cleanWords(t)
}
export const nameWords = (name: string, tags: string) => [...cleanWords(name), ...splitTags(tags).flatMap(tagWords)]

const routesTo = (m: ModMatrix, dests: string[], src: (s: string) => boolean) =>
  m.routes.some((r) => dests.includes(r.dest) && Math.abs(r.amount) > 0.005 && src(r.source))
const isLfo = (s: string) => s === 'lfo1' || s === 'lfo2'
const GRAIN_DESTS = ['grainPos', 'grainScan', 'grainSize', 'grainVar', 'grainSkew', 'grainDetune']

/** what a sound's settings make it: envelope, filter, grains, modulation, effects */
export function soundWords(s: SoundSettings): string[] {
  const w: string[] = []
  // the amp envelope
  const plucked = s.attack < 0.02 && s.sustain < 0.25 && s.decay < 1.2
  if (s.attack > 0.6) w.push('slow attack swell')
  else if (s.attack > 0.15) w.push('soft attack')
  if (plucked) w.push('plucked percussive')
  if (s.release > 2) w.push('long release')
  // the filter, where it does something
  const lp = s.filterType === 'lowpass' || s.filterType === 'lp12' || s.filterType === 'lp24'
  if (lp && s.cutoff < 700) w.push('dark muffled')
  else if (lp && s.cutoff < 2500) w.push('warm mellow')
  if (s.filterType === 'highpass' || s.filterType.startsWith('hp')) w.push('thin highpass')
  if (s.filterType === 'bandpass') w.push('nasal bandpass')
  if (s.filterType.includes('notch')) w.push('hollow notch')
  if (s.resonance > 6) w.push('resonant squelchy')
  else if (s.resonance > 3) w.push('resonant')
  if (s.fEnvAmount > 1.5) w.push('filter sweep')
  if (s.eqLow > 3) w.push('boomy')
  if (s.eqHigh > 3) w.push('crisp')
  if (s.eqHigh < -4) w.push('dull lofi')
  // grains
  if (s.grain) {
    if (s.grainMode === 'cloud') w.push('grain cloud shimmering')
    else if (s.grainMode === 'loop') w.push('stutter glitch')
    else w.push('granular')
    if (s.grainFreq > 20 && s.grainFreq < 45 && s.grainFreqKey > 0.5) w.push('vocal formant')
    if (s.grainSpray > 40) w.push('scattered')
    if (s.grainDetune > 0.15 || s.grainStereo > 0.3) w.push('detuned wide')
    if (s.grainFm && s.grainFmAmount > 5) w.push('metallic')
    if (s.grainAmp > 0.3) w.push(s.grainAmpMode === 'void' ? 'crackle' : 'flutter')
    if (s.grainScanOn) w.push('evolving')
  }
  // modulation
  const m = s.mod
  if (routesTo(m, ['pitch'], isLfo)) w.push('vibrato')
  if (routesTo(m, ['cutoff', 'resonance'], isLfo)) w.push('wobble')
  if (routesTo(m, ['volume'], isLfo)) w.push('tremolo')
  if (routesTo(m, ['pan'], isLfo)) w.push('auto pan')
  if (routesTo(m, GRAIN_DESTS, isLfo)) w.push('evolving')
  if (routesTo(m, ['pitch'], (x) => x.startsWith('vco'))) w.push('fm bell')
  if (routesTo(m, ['volume'], (x) => x.startsWith('vco'))) w.push('ring modulation')
  if (routesTo(m, ['cutoff', 'volume', 'pitch'], (x) => x === 'aftertouch' || x === 'mod')) w.push('expressive')
  // effects (a sound's own)
  if (s.reverbMix > 0.3) w.push('reverb')
  if (s.delayMix > 0.2) w.push('echo')
  if (s.pitch <= -12) w.push('low')
  if (s.pitch >= 12) w.push('high')
  return w
}

/** a patch's header and how its slots stack */
export function patchWords(p: Patch): string[] {
  const w: string[] = []
  const h: PatchHeader = p.header
  if (h.mono) w.push('mono')
  if (h.glide > 0.03) w.push('glide portamento')
  w.push(...fxWords(h.fx))
  const filled = p.slots.filter((x): x is PatchSlot => !!x)
  const heard = filled.filter((x, i) => i === 0 || x.audible)
  if (heard.length >= 2) w.push('layered')
  const same = heard.filter((x) => x.layer.soundId === heard[0]?.layer.soundId)
  if (same.length > 1 && same.some((x) => x.fine !== 0)) w.push('detuned unison')
  if (heard.some((x) => Math.abs(x.transpose) === 12 || Math.abs(x.transpose) === 24)) w.push('octave')
  if (heard.some((x) => Math.abs(x.transpose) === 7 || Math.abs(x.transpose) === 19)) w.push('fifth')
  if (heard.some((x) => x.transpose <= -12)) w.push('sub')
  if (filled.some((x) => !x.track)) w.push('drone')
  return w
}
function fxWords(fx: GlobalFx): string[] {
  const w: string[] = []
  if (fx.chorusMix > 0.25) w.push('chorus lush')
  if (fx.delayMix > 0.15) w.push('echo')
  if (fx.reverbMix > 0.35) w.push(fx.reverbSize > 4 ? 'spacious hall' : 'reverb')
  else if (fx.reverbMix < 0.05 && fx.delayMix < 0.05 && fx.chorusMix < 0.05) w.push('dry')
  return w
}

export interface Texts {
  name: string
  sound: string
}
export const soundTexts = (s: SoundSettings): Texts => ({
  name: unique(nameWords(s.name, s.tag)),
  sound: unique(soundWords(s)),
})
/** a patch: its name, tags and VCO sounds' names; its main VCO's sound words and its own */
export function patchTexts(p: Patch, soundName: (id: string) => string | undefined): Texts {
  const vcos = p.slots.flatMap((x) => (x ? cleanWords(soundName(x.layer.soundId) ?? '') : []))
  const main = p.slots.find((x): x is PatchSlot => !!x)
  return {
    name: unique([...nameWords(p.name, p.tag), ...vcos]),
    sound: unique([...(main ? soundWords(main.layer.settings) : []), ...patchWords(p)]),
  }
}
