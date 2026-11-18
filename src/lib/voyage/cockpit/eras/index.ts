/**
 * The cockpits, by era (the ships' eras: lib/voyage/eras/): every `cNNNN.ts` here that exports a CockpitDesign. An era
 * without its own yet borrows the nearest one before it.
 */
import type { CockpitDesign } from '../design'

const found = import.meta.glob<Record<string, unknown>>('./c[0-9][0-9][0-9][0-9].ts', { eager: true })
const isDesign = (v: unknown): v is CockpitDesign => !!v && typeof v === 'object' && 'era' in v && 'controls' in v && 'glass' in v
export const COCKPITS: CockpitDesign[] = Object.values(found)
  .flatMap((m) => Object.values(m).filter(isDesign))
  .sort((a, b) => a.era.localeCompare(b.era))

const ORDER = ['1950', '1960', '1970', '1980', '1990', '2000', '2010', '2020', '2030']
export function cockpitOf(era: string): CockpitDesign {
  const i = ORDER.indexOf(era)
  for (let k = i; k >= 0; k--) {
    const c = COCKPITS.find((d) => d.era === ORDER[k])
    if (c) return c
  }
  return COCKPITS[0]
}
