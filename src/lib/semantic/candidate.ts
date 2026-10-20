/**
 * A candidate patch for a description: not a patch found, but settings searched for. The patches the description is
 * nearest (lib/semantic/index.ts) give the starting point (the nearest one's VCOs, filter and grain modes) and, blended
 * by how near each is, the settings themselves (each along its knob: times and frequencies by ratio); then the
 * description's own words push them (lib/semantic/axes.ts: darker, slower attack, wider…). A different seed picks
 * another of the nearest as the start and jitters the blend a little.
 */
import { PATCH_SLOTS, type Patch, type PatchSlot, type Sound, type SoundSettings } from '../../types'
import { fromUnit, SOUND_PARAMS, toUnit, type Param } from './features'
import type { Push } from './axes'

export interface Donor {
  patch: Patch
  /** 0..1, the donors' weights sum to 1 */
  weight: number
}
export interface CandidateInfo {
  query: string
  seed: number
  /** the patches it was blended from, nearest first */
  from: { id: string; name: string; weight: number }[]
  /** what the words pushed: label and amount */
  pushes: { label: string; amount: number }[]
  /** a VCO swapped for a sound the words named */
  swapped?: string
}

/** small seeded random (mulberry32) */
export function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FAMILY = (t: string) => (t === 'lowpass' || t.startsWith('lp') ? 'lp' : t === 'highpass' || t.startsWith('hp') ? 'hp' : t)
const FILTER_KEYS = new Set(['cutoff', 'resonance', 'filterKey', 'fEnvAmount', 'fAttack', 'fDecay', 'fSustain', 'fRelease'])
/** a donor's value counts only where it means the same: grain settings from a cloud of the same mode, the filter's from the same kind of filter */
function comparable(p: Param, a: SoundSettings, b: SoundSettings) {
  const k = String(p.key)
  if (k.startsWith('grain')) return a.grain && b.grain && a.grainMode === b.grainMode
  if (FILTER_KEYS.has(k)) return FAMILY(a.filterType) === FAMILY(b.filterType)
  return true
}
const slotOf = (p: Patch, i: number): PatchSlot | null => p.slots[i] ?? (i === 0 ? (p.slots.find(Boolean) ?? null) : null)
const param = (key: keyof SoundSettings) => SOUND_PARAMS.find((p) => p.key === key)!
/** move a setting along its knob by `d` (of the knob's travel) */
function nudge(s: SoundSettings, key: keyof SoundSettings, d: number) {
  const p = param(key)
  ;(s as unknown as Record<string, number>)[key] = round(fromUnit(p, toUnit(p, s[key] as number) + d))
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round = (v: number) => Math.round(v * 10000) / 10000

/** what one push does to a slot's sound (`k`: how much of it this slot takes) */
function pushSound(s: SoundSettings, axis: string, a: number, k: number) {
  const x = a * k
  switch (axis) {
    case 'bright':
      nudge(s, 'cutoff', 0.22 * x)
      s.eqHigh = clamp(s.eqHigh + 4 * x, -12, 12)
      if (s.fEnvAmount > 0.2) s.fEnvAmount = round(clamp(s.fEnvAmount + 0.8 * x, -5, 5))
      break
    case 'attack':
      nudge(s, 'attack', 0.3 * x)
      nudge(s, 'fAttack', 0.15 * x)
      break
    case 'length':
      nudge(s, 'release', 0.25 * x)
      nudge(s, 'decay', 0.2 * x)
      s.sustain = round(x > 0 ? s.sustain + (1 - s.sustain) * 0.5 * x : s.sustain * (1 + 0.7 * x))
      break
    case 'motion':
      if (x > 0) {
        if (!s.mod.routes.some((r) => r.source === 'lfo1' || r.source === 'lfo2')) {
          Object.assign(s.mod.lfo2, { shape: 'triangle', rate: 0.25, sync: false, amount: 1 })
          s.mod.routes.push({ source: 'lfo2', dest: 'cutoff', amount: round(0.12 * x) })
          if (s.grain) s.mod.routes.push({ source: 'lfo2', dest: 'grainPos', amount: round(0.15 * x) })
        } else for (const r of s.mod.routes) if (r.source.startsWith('lfo')) r.amount = round(clamp(r.amount * (1 + 0.6 * x), -1, 1))
      } else for (const r of s.mod.routes) if (r.source.startsWith('lfo')) r.amount = round(r.amount * (1 + x))
      break
    case 'grit':
      nudge(s, 'resonance', 0.2 * x)
      s.eqMid = clamp(s.eqMid + 3 * x, -12, 12)
      if (s.grain && s.grainFm) nudge(s, 'grainFmAmount', 0.15 * x)
      break
    case 'weight':
      s.eqLow = clamp(s.eqLow + 4 * x, -12, 12)
      break
  }
}

export interface CandidateRecipe {
  donors: Donor[]
  pushes: Push[]
  query: string
  seed: number
  /** a sound the words named, for the main VCO */
  swap?: Sound
  uid: () => string
}

/** The candidate patch (a plain object, not yet on the board) and how it was made. */
export function makeCandidate({ donors, pushes, query, seed, swap, uid }: CandidateRecipe): { patch: Patch; info: CandidateInfo } {
  const rnd = random(seed)
  // the start: the nearest patch, or (rerolled) one of the nearest few, likelier the nearer
  let base = donors[0].patch
  if (seed > 0) {
    let r = rnd() * donors.slice(0, 3).reduce((a, d) => a + d.weight, 0)
    for (const d of donors.slice(0, 3)) if ((r -= d.weight) <= 0) {
      base = d.patch
      break
    }
  }
  const p: Patch = JSON.parse(JSON.stringify(base))
  delete p.factoryId
  delete p.factoryLevel
  delete p.fav
  p.id = uid()
  p.name = query.trim().toUpperCase().slice(0, 28) || 'CANDIDATE'
  const tags = p.tag.split(',').map((t) => t.trim()).filter((t) => t && t.toLowerCase() !== 'factory')
  p.tag = [...new Set([...tags, 'search'])].join(', ')
  // each slot's settings: the donors' blend, where their slot means the same
  for (let i = 0; i < PATCH_SLOTS; i++) {
    const x = p.slots[i]
    if (!x) continue
    x.layer.id = uid()
    const s = x.layer.settings
    for (const prm of SOUND_PARAMS) {
      let acc = 0
      let w = 0
      for (const d of donors) {
        const ds = slotOf(d.patch, i)?.layer.settings
        if (!ds || !comparable(prm, s, ds)) continue
        acc += d.weight * toUnit(prm, ds[prm.key] as number)
        w += d.weight
      }
      let u = w > 0 ? acc / w : toUnit(prm, s[prm.key] as number)
      if (seed > 0 && JITTER.has(prm.key)) u += (rnd() - 0.5) * 0.08
      ;(s as unknown as Record<string, number>)[prm.key] = round(fromUnit(prm, u))
    }
  }
  // the header's settings likewise (voice, filter-free: glide and the effects)
  const h = p.header
  const blend = (get: (q: Patch) => number) => donors.reduce((a, d) => a + d.weight * get(d.patch), 0)
  h.glide = round(blend((q) => q.header.glide))
  for (const k of ['chorusMix', 'delayMix', 'reverbMix', 'reverbSize'] as const) h.fx[k] = round(blend((q) => q.header.fx[k]))
  // what the words asked for: all of it on the main VCO, some on the others; the effects for WIDER / DRIER
  for (const { axis, amount } of pushes) {
    p.slots.forEach((x, i) => x && (i === 0 || x.audible) && pushSound(x.layer.settings, axis.id, amount, i === 0 ? 1 : 0.6))
    if (axis.id === 'space') {
      const fx = h.fx
      if (amount > 0) {
        fx.reverbMix = round(clamp(fx.reverbMix + 0.25 * amount, 0, 0.8))
        fx.chorusMix = round(clamp(fx.chorusMix + 0.2 * amount, 0, 0.8))
        fx.reverbSize = round(clamp(fx.reverbSize + 1.5 * amount, 0.1, 8))
      } else for (const k of ['reverbMix', 'chorusMix', 'delayMix'] as const) fx[k] = round(fx[k] * (1 + amount))
    }
  }
  // a sound the words named takes the main VCO (its own root and clip; the patch's shaping)
  let swapped: string | undefined
  const main = p.slots.find((x): x is PatchSlot => !!x)
  if (swap && main && main.layer.soundId !== swap.id) {
    Object.assign(main.layer, { soundId: swap.id })
    Object.assign(main.layer.settings, {
      name: swap.settings.name,
      tag: swap.settings.tag,
      rootNote: swap.settings.rootNote,
      clipIn: swap.settings.clipIn,
      clipOut: swap.settings.clipOut,
    })
    swapped = swap.settings.name
  }
  return {
    patch: p,
    info: {
      query,
      seed,
      from: donors.map((d) => ({ id: d.patch.id, name: d.patch.name, weight: d.weight })),
      pushes: pushes.map((x) => ({ label: x.axis.label[x.amount < 0 ? 0 : 1], amount: x.amount })),
      swapped,
    },
  }
}
const JITTER = new Set<keyof SoundSettings>(['cutoff', 'resonance', 'attack', 'decay', 'sustain', 'release', 'fEnvAmount', 'grainSpray', 'grainVariation'])
