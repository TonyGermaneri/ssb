/**
 * SKETCH: the garden's stand-in for a sound model where there is none (a browser tab: the models run in the app and
 * the plugin). Not a model -- a little synth the caption plays: its words pick a chord, a timbre, a Euclidean pulse,
 * noise and shimmer, always the same for the same caption, so a garden can be grown and heard (and tested) anywhere.
 */
import { euclid, hash32, rand01 } from './garden'

const KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

const NOISY = /rain|thunder|tide|static|hiss|crackle|furnace|wind|engine|field|storm|surf|water/i
const BRIGHT = /glass|bells|icy|metallic|shimmer|wire|kalimba|marimba|gong|bleep/i
const DARK = /sub|dark|hollow|cave|underwater|dub|drone|velvet|warm|cello/i
const PULSE = /loop|drum|techno|house|jungle|stutter|glitch|heartbeat|pulse|arpeggio|808|bassline/i

const MAJOR = [0, 4, 7, 11, 14]
const MINOR = [0, 3, 7, 10, 14]

/** A clip for `prompt`: `seconds` long at `rate`, stereo, peaking near -3 dBFS. */
export function sketchClip(prompt: string, seconds: number, rate = 44100): Float32Array[] {
  const n = Math.max(1, Math.round(Math.min(30, Math.max(0.5, seconds)) * rate))
  const L = new Float32Array(n)
  const R = new Float32Array(n)
  const h = (s: string | number) => rand01(prompt, s)
  // the root: the caption's key when it names one, else from its words
  const keyMatch = prompt.match(/\bin ([A-G][b#]?)\b/)
  const keyIdx = keyMatch ? KEYS.indexOf(keyMatch[1]) : -1
  const semis = keyIdx >= 0 ? keyIdx : hash32(prompt, 'root') % 12
  const minor = /minor|dark|melancholy|eerie|tense|phrygian/i.test(prompt) || (!/major|euphoric|playful/i.test(prompt) && h('mode') < 0.5)
  const root = 110 * 2 ** (semis / 12) * (DARK.test(prompt) ? 0.5 : BRIGHT.test(prompt) ? 2 : 1)
  const chord = (minor ? MINOR : MAJOR).slice(0, 3 + (hash32(prompt, 'voices') % 3))
  const bright = BRIGHT.test(prompt) ? 0.8 : DARK.test(prompt) ? 0.15 : 0.4
  const noise = NOISY.test(prompt) ? 0.35 : 0.04
  const bpmMatch = prompt.match(/(\d+) BPM/)
  const bpm = bpmMatch ? Number(bpmMatch[1]) : 80 + (hash32(prompt, 'bpm') % 60)
  const pulse = PULSE.test(prompt)
  const steps = euclid(3 + (hash32(prompt, 'k') % 5), 16, hash32(prompt, 'rot') % 16)
  const stepLen = (60 / bpm / 4) * rate
  const vib = 2 + h('vib') * 5
  let nz = 0
  for (let i = 0; i < n; i++) {
    const t = i / rate
    let x = 0
    chord.forEach((iv, j) => {
      const f = root * 2 ** (iv / 12) * (1 + 0.002 * Math.sin(2 * Math.PI * vib * t + j))
      const ph = 2 * Math.PI * f * t
      // a little additive timbre: brighter words, more upper partials
      x += (Math.sin(ph) + bright * 0.5 * Math.sin(2 * ph) + bright * bright * 0.33 * Math.sin(3 * ph)) / chord.length
    })
    nz = nz * (0.6 + 0.35 * (1 - bright)) + (Math.random() * 2 - 1) * (1 - (0.6 + 0.35 * (1 - bright)))
    x = x * (1 - noise) + nz * noise * 3
    if (pulse) {
      const k = Math.floor(i / stepLen)
      const into = (i - k * stepLen) / stepLen
      x *= steps[k % 16] ? Math.exp(-into * 3) * 1.2 : 0.15
    } else x *= 0.75 + 0.25 * Math.sin(2 * Math.PI * (bpm / 240) * t)
    // a breath at each end, so it loops without a click
    const edge = Math.min(1, i / (0.01 * rate), (n - 1 - i) / (0.01 * rate))
    L[i] = x * edge
    R[i] = x * edge
  }
  // a touch of width: the right a few ms behind
  const lag = Math.round(rate * (0.004 + 0.008 * h('width')))
  for (let i = n - 1; i >= lag; i--) R[i] = R[i] * 0.6 + R[i - lag] * 0.4
  let peak = 1e-9
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
  const g = 0.7 / peak
  for (let i = 0; i < n; i++) {
    L[i] *= g
    R[i] *= g
  }
  return [L, R]
}
