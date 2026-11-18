/**
 * VOYAGE's ships, a decade each, from the fifties' saucer to the thirties' steel starship (ship.ts says what an era
 * carries). The viewer picks one in the voyage's HUD.
 */
import { E1950 } from './e1950'
import { E1960 } from './e1960'
import { E1970 } from './e1970'
import { E1980 } from './e1980'
import { E1990 } from './e1990'
import { E2000 } from './e2000'
import { E2010 } from './e2010'
import { E2020 } from './e2020'
import { E2030 } from './e2030'
import type { Era } from '../ship'

export const ERAS: Era[] = [E1950, E1960, E1970, E1980, E1990, E2000, E2010, E2020, E2030]
export const DEFAULT_ERA = '1960'
export const eraOf = (id: string): Era => ERAS.find((e) => e.id === id) ?? ERAS.find((e) => e.id === DEFAULT_ERA)!
