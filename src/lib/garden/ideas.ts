/**
 * Random starting ideas for a sound (GROW in the rack: a new VCO's prompt), put together from a few lists, so each
 * press begins somewhere else; the word model then writes one out as a fuller caption (stores/garden.ts randomPrompt).
 */
const WHAT = [
  'felt piano', 'analog synth pad', 'glass harmonica', 'bowed cello', 'tape-warped choir', 'marimba', 'deep 808 bass',
  'rain on a tin roof', 'plucked kalimba', 'brass swell', 'breathy vocal texture', 'modular synth bleeps', 'nylon guitar',
  'music box', 'broken drum loop', 'sub bass drone', 'steel drum', 'harp glissando', 'shimmering bells', 'dusty rhodes',
  'wooden flute', 'string ensemble', 'FM electric piano', 'vibraphone', 'gamelan gongs', 'wind chimes', 'church organ',
  'acid bassline', 'hand drums', 'distant thunder', 'singing bowl', 'detuned supersaw', 'clarinet', 'kick and hats groove',
]
const HOW = ['warm', 'icy', 'lush', 'lo-fi', 'cinematic', 'dreamy', 'gritty', 'airy', 'dark', 'bright', 'slowly evolving', 'minimal', 'hypnotic', 'nostalgic', 'metallic', 'soft']
const MORE = [
  'in C minor', 'in A major', 'slow tempo', '90 BPM', '120 BPM', 'long decay', 'close and dry', 'in a cathedral',
  'through old tape', 'with soft noise', 'one sustained note', 'a gentle rhythm', 'wide stereo', 'underwater', 'at dusk',
]

const pick = <T>(xs: readonly T[], r: () => number) => xs[Math.floor(r() * xs.length)]!

/** "dreamy marimba, through old tape" */
export function randomIdea(r: () => number = Math.random): string {
  return `${pick(HOW, r)} ${pick(WHAT, r)}, ${pick(MORE, r)}`
}
