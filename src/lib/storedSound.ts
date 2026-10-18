/**
 * Sounds as the board stores them (and as undo remembers them). An AKWF wave keeps its name and tag and only the
 * settings that differ from waveBaseSettings: 4,000 untouched waves are a few hundred kilobytes rather than seven
 * megabytes. Everything else is stored as it is.
 */
import { isWaveAudioId, waveBaseSettings } from './akwf'
import { migrateSettings, type Sound, type SoundSettings } from '../types'

/** a plain AKWF wave (not an SFZ pad that happens to start on one) */
export const isWaveSound = (s: Sound) => isWaveAudioId(s.audioId) && !s.zones?.length

const WAVE_BASE = waveBaseSettings() as unknown as Record<string, unknown>
const WAVE_BASE_JSON = Object.fromEntries(Object.entries(WAVE_BASE).map(([k, v]) => [k, JSON.stringify(v)]))

/** A sound as stored. */
export function compactSound(s: Sound): Sound {
  if (!isWaveSound(s)) return s
  const settings: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(s.settings)) {
    const same = v !== null && typeof v === 'object' ? JSON.stringify(v) === WAVE_BASE_JSON[k] : v === WAVE_BASE[k]
    if (!same || k === 'name' || k === 'tag') settings[k] = v
  }
  return { ...s, settings: settings as unknown as SoundSettings }
}

/** A stored sound as the board holds it, every setting there (whichever version stored it). */
export function expandSound(s: Sound): Sound {
  return { ...s, settings: migrateSettings(isWaveSound(s) ? { ...waveBaseSettings(), ...s.settings } : s.settings) }
}
