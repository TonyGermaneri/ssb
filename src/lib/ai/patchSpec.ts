/**
 * A patch as the agent reads and writes it: the built-in patches' compact form (lib/factory.ts) — each slot names
 * its sound and lists only the knobs that differ from that sound's own, the header only what differs from a new
 * patch's. Reads come out small enough to reason about; writes are checked against params.ts (unknown keys
 * refused with suggestions, numbers clamped into range with a note) before anything changes.
 */
import {
  defaultGlobalFx,
  defaultMatrix,
  defaultVco,
  PATCH_SLOTS,
  type GlobalFx,
  type Lfo,
  type ModMatrix,
  type ModRoute,
  type MpeBinding,
  type Patch,
  type PatchHeader,
  type PatchLayer,
  type PatchSlot,
  type SoundSettings,
} from '../../types'
import { checkValue, FX_PARAMS, HEADER_PARAMS, LFO_PARAMS, MPE_PARAMS, ROUTE_PARAMS, SLOT_PARAMS, SOUND_PARAMS, suggest, type Param } from './params'

type Values = Record<string, unknown>

export interface SpecSlot {
  /** an AKWF wave by name (e.g. "AKWF_saw") or a sound's id */
  sound: string
  /** the sound's name (read only: what `sound` is) */
  sound_name?: string
  /** knobs that differ from the sound's own settings */
  settings?: Values
  /** how the slot joins the patch: level, audible, track, transpose, fine, fixedNote, tuning, tuningDepth */
  slot?: Values
  /** the layer's LFOs: what differs from their defaults */
  lfo1?: Values
  lfo2?: Values
  /** the layer's mod routes (on slot 1, vco1..vco3 are the patch's slots) */
  routes?: ModRoute[]
}

/** an MPE binding as a spec writes it: slots numbered 1..3 (absent: every slot) */
export interface SpecMpe {
  surface: string
  dest: string
  amount: number
  slots?: number[]
}
export interface PatchSpec {
  name: string
  tags?: string
  /** slots 1..3; null = empty */
  slots: (SpecSlot | null)[]
  /** what the MPE surfaces do to the patch (only while the player has MPE on) */
  mpe?: SpecMpe[]
  header?: {
    volume?: number
    mono?: boolean
    glide?: number
    bpm?: number
    fx?: Values
    mod?: { lfo1?: Values; lfo2?: Values; routes?: ModRoute[] }
  }
}

/** a slot's change in update_patch: like SpecSlot, every field optional; `routes` replaces, the rest merge */
export type SlotChange = Partial<SpecSlot>
export interface PatchChange {
  name?: string
  tags?: string
  header?: PatchSpec['header']
  /** replaces the patch's MPE bindings */
  mpe?: SpecMpe[]
  /** by slot number "1".."3"; null empties the slot */
  slots?: Record<string, SlotChange | null>
}

/** what the board tells the spec code about a sound */
export interface SoundRef {
  id: string
  /** how a spec names it: the wave name for AKWF waves, else the id */
  ref: string
  name: string
  settings: SoundSettings
}

/** fields of a layer's settings that aren't knobs */
const NOT_KNOBS = new Set(['name', 'tag', 'mod', 'vcos', 'midiNote'])
const same = (a: unknown, b: unknown) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : JSON.stringify(a) === JSON.stringify(b))
const round = (v: unknown) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v)

function diff(obj: object, base: object, skip: Set<string> = new Set()): Values | undefined {
  const out: Values = {}
  for (const [k, v] of Object.entries(obj)) if (!skip.has(k) && !same(v, (base as Values)[k])) out[k] = round(v)
  return Object.keys(out).length ? out : undefined
}

// ── read ──────────────────────────────────────────────────────────────────

/** A patch in spec form. `sound` describes the sound each slot plays (null: it's gone from the board). */
export function toSpec(patch: Patch, sound: (id: string) => SoundRef | null): PatchSpec & { id: string } {
  const d = defaultMatrix()
  const slotSpec = (x: PatchSlot | null): SpecSlot | null => {
    if (!x) return null
    const src = sound(x.layer.soundId)
    const s = x.layer.settings
    const spec: SpecSlot = { sound: src?.ref ?? x.layer.soundId, sound_name: src?.name ?? '(missing sound)' }
    const settings = src ? diff(s, src.settings, NOT_KNOBS) : diff(s, {}, NOT_KNOBS)
    if (settings) spec.settings = settings
    const { layer: _layer, ...params } = x
    const slot = diff(params, defaultVco(), new Set(['soundId']))
    if (slot) spec.slot = slot
    const lfo1 = diff(s.mod.lfo1, d.lfo1)
    const lfo2 = diff(s.mod.lfo2, d.lfo2)
    if (lfo1) spec.lfo1 = lfo1
    if (lfo2) spec.lfo2 = lfo2
    if (s.mod.routes.length) spec.routes = s.mod.routes.map((r) => ({ ...r, amount: round(r.amount) as number }))
    return spec
  }
  const h = patch.header
  const header: NonNullable<PatchSpec['header']> = {}
  for (const p of HEADER_PARAMS) {
    const v = (h as unknown as Values)[p.key]
    if (v !== undefined && !same(v, HEADER_DEFAULTS[p.key])) (header as Values)[p.key] = round(v)
  }
  const fx = diff(h.fx, defaultGlobalFx())
  if (fx) header.fx = fx
  const mod: NonNullable<NonNullable<PatchSpec['header']>['mod']> = {}
  const l1 = diff(h.mod.lfo1, d.lfo1)
  const l2 = diff(h.mod.lfo2, d.lfo2)
  if (l1) mod.lfo1 = l1
  if (l2) mod.lfo2 = l2
  if (h.mod.routes.length) mod.routes = h.mod.routes
  if (Object.keys(mod).length) header.mod = mod
  return {
    id: patch.id,
    name: patch.name,
    tags: patch.tag,
    slots: Array.from({ length: PATCH_SLOTS }, (_, i) => slotSpec(patch.slots[i] ?? null)),
    ...(patch.mpe?.length
      ? { mpe: patch.mpe.map((b) => ({ surface: b.surface, dest: b.dest, amount: round(b.amount) as number, ...(b.slots ? { slots: b.slots.map((i) => i + 1) } : {}) })) }
      : {}),
    ...(Object.keys(header).length ? { header } : {}),
  }
}

const HEADER_DEFAULTS: Values = { volume: 0.8, mono: false, glide: 0, bpm: 120 }

// ── write ─────────────────────────────────────────────────────────────────

/** problems that stop a write, and notes about what was adjusted */
export class SpecIssues {
  errors: string[] = []
  notes: string[] = []
  get ok() {
    return !this.errors.length
  }
}

/** checked values for a group of params, merged onto `into` */
function applyValues(into: Values, values: Values | undefined, params: Param[], where: string, issues: SpecIssues) {
  if (!values) return
  if (typeof values !== 'object' || Array.isArray(values)) return void issues.errors.push(`${where} must be an object of name: value`)
  for (const [k, v] of Object.entries(values)) {
    const p = params.find((x) => x.key === k)
    if (!p) {
      issues.errors.push(`${where}: no parameter "${k}" (nearest: ${suggest(k, params).join(', ')})`)
      continue
    }
    const r = checkValue(p, v)
    if (r.error) issues.errors.push(`${where}.${r.error}`)
    else {
      into[k] = r.value
      if (r.note) issues.notes.push(`${where}.${r.note}`)
    }
  }
}

function checkRoutes(routes: unknown, where: string, issues: SpecIssues): ModRoute[] | undefined {
  if (routes === undefined) return undefined
  if (!Array.isArray(routes)) {
    issues.errors.push(`${where}.routes must be an array of {source, dest, amount}`)
    return undefined
  }
  const out: ModRoute[] = []
  routes.forEach((r, i) => {
    const v: Values = {}
    applyValues(v, r as Values, ROUTE_PARAMS, `${where}.routes[${i}]`, issues)
    if (v.source !== undefined && v.dest !== undefined && v.amount !== undefined) out.push(v as unknown as ModRoute)
    else if (r && typeof r === 'object') issues.errors.push(`${where}.routes[${i}] needs source, dest and amount`)
  })
  return out
}

/** a spec's MPE bindings, checked (slots 1..3 → 0..2) */
function checkMpe(list: unknown, issues: SpecIssues): MpeBinding[] | undefined {
  if (list === undefined) return undefined
  if (!Array.isArray(list)) {
    issues.errors.push('mpe must be an array of {surface, dest, amount, slots?}')
    return undefined
  }
  const out: MpeBinding[] = []
  list.forEach((x, i) => {
    const where = `mpe[${i}]`
    const v: Values = {}
    const { slots, ...rest } = (x ?? {}) as Values & { slots?: unknown }
    applyValues(v, rest, MPE_PARAMS, where, issues)
    if (v.surface === undefined || v.dest === undefined || v.amount === undefined) {
      issues.errors.push(`${where} needs surface, dest and amount`)
      return
    }
    const b = v as unknown as MpeBinding
    if (slots !== undefined) {
      if (!Array.isArray(slots) || !slots.length || slots.some((n) => !Number.isInteger(n) || (n as number) < 1 || (n as number) > PATCH_SLOTS))
        return void issues.errors.push(`${where}.slots must list slot numbers 1..${PATCH_SLOTS} (or be left out: every slot)`)
      b.slots = [...new Set(slots as number[])].map((n) => n - 1)
    }
    out.push(b)
  })
  return out
}
/** a reminder when the surfaces the user plays most are left doing nothing */
function mpeNote(list: MpeBinding[] | undefined, issues: SpecIssues) {
  const bound = new Set((list ?? []).filter((b) => b.amount).map((b) => b.surface))
  const missing = (['press', 'slide'] as const).filter((s) => !bound.has(s))
  if (missing.length)
    issues.notes.push(`MPE: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} unbound — give the patch tasteful "mpe" bindings (see the guide), so an MPE controller plays it expressively`)
}

function applyLfo(into: Lfo, values: Values | undefined, where: string, issues: SpecIssues) {
  applyValues(into as unknown as Values, values, LFO_PARAMS, where, issues)
}

/**
 * A slot's layer from a sound and a spec slot (a new layer: the sound's settings, the spec's over them).
 */
export function layerFrom(src: SoundRef, spec: SpecSlot | SlotChange, where: string, issues: SpecIssues, uid: () => string): PatchLayer {
  const settings: SoundSettings = JSON.parse(JSON.stringify(src.settings))
  settings.vcos = []
  settings.midiNote = null
  settings.mod = defaultMatrix()
  applyValues(settings as unknown as Values, spec.settings, SOUND_PARAMS, `${where}.settings`, issues)
  applyLfo(settings.mod.lfo1, spec.lfo1, `${where}.lfo1`, issues)
  applyLfo(settings.mod.lfo2, spec.lfo2, `${where}.lfo2`, issues)
  settings.mod.routes = checkRoutes(spec.routes, where, issues) ?? []
  return { id: uid(), soundId: src.id, settings }
}

/** the spec's header over a header (a new patch's, or the patch's own for an update) */
export function applyHeader(h: PatchHeader, spec: PatchSpec['header'] | undefined, issues: SpecIssues) {
  if (!spec) return
  const { fx, mod, ...rest } = spec
  if ('mpe' in rest) {
    // MPE mode is the player's (their controller's), not a patch's
    delete (rest as Values).mpe
    issues.notes.push('header.mpe is ignored: MPE on / off is the player\'s. Bind the surfaces with the patch\'s "mpe" list')
  }
  applyValues(h as unknown as Values, rest, HEADER_PARAMS, 'header', issues)
  applyValues(h.fx as unknown as Values, fx, FX_PARAMS, 'header.fx', issues)
  if (mod) {
    applyLfo(h.mod.lfo1, mod.lfo1, 'header.mod.lfo1', issues)
    applyLfo(h.mod.lfo2, mod.lfo2, 'header.mod.lfo2', issues)
    const routes = checkRoutes(mod.routes, 'header.mod', issues)
    if (routes) h.mod.routes = routes
  }
}

export const newHeader = (): PatchHeader => ({
  volume: 0.8,
  glide: 0,
  mono: false,
  mpe: false,
  mpeBendRange: 48,
  bpm: 120,
  fx: defaultGlobalFx() as GlobalFx,
  mod: defaultMatrix() as ModMatrix,
})

/**
 * A patch from a spec. `resolve` finds (or adds) the sound a slot names. Nothing is built if anything is wrong:
 * the issues say what, for the model to fix.
 */
export async function fromSpec(
  spec: PatchSpec,
  resolve: (ref: string) => Promise<SoundRef | null>,
  uid: () => string,
): Promise<{ patch?: Patch; issues: SpecIssues }> {
  const issues = new SpecIssues()
  if (!spec || typeof spec !== 'object') return { issues: (issues.errors.push('spec must be an object'), issues) }
  if (typeof spec.name !== 'string' || !spec.name.trim()) issues.errors.push('name is required')
  const list = Array.isArray(spec.slots) ? spec.slots : []
  if (!list.some(Boolean)) issues.errors.push('a patch needs at least one slot with a sound')
  if (list.length > PATCH_SLOTS) issues.errors.push(`a patch has at most ${PATCH_SLOTS} slots`)
  const slots: (PatchSlot | null)[] = []
  for (let i = 0; i < PATCH_SLOTS; i++) {
    const x = list[i]
    if (!x) {
      slots.push(null)
      continue
    }
    const where = `slots[${i}]`
    const src = typeof x.sound === 'string' ? await resolve(x.sound) : null
    if (!src) {
      issues.errors.push(`${where}.sound "${x.sound}" isn't a sound on the board or an AKWF wave name (list_sounds finds them)`)
      slots.push(null)
      continue
    }
    const slot: PatchSlot = { ...defaultVco(), layer: layerFrom(src, x, where, issues, uid) }
    delete (slot as Partial<PatchSlot> & { soundId?: unknown }).soundId
    applyValues(slot as unknown as Values, x.slot, SLOT_PARAMS, `${where}.slot`, issues)
    slots.push(slot)
  }
  const header = newHeader()
  applyHeader(header, spec.header, issues)
  const mpe = checkMpe(spec.mpe, issues) ?? []
  if (!issues.ok) return { issues }
  mpeNote(mpe, issues)
  return { patch: { id: uid(), name: spec.name.trim(), tag: tagsOf(spec.tags), slots, header, mpe }, issues }
}

/** a patch's tags as the board keeps them (comma separated), with "ai" added */
export const tagsOf = (tags?: string) => {
  const list = (tags ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
  if (!list.includes('ai')) list.push('ai')
  return list.join(', ')
}

/**
 * A change to a patch, worked out on a copy first: the patch itself changes only if all of it is valid. Answers the
 * new patch (same id and layer ids where a slot keeps its sound) and the issues.
 */
export async function applyChange(
  patch: Patch,
  change: PatchChange,
  resolve: (ref: string) => Promise<SoundRef | null>,
  uid: () => string,
): Promise<{ patch?: Patch; issues: SpecIssues }> {
  const issues = new SpecIssues()
  const next: Patch = JSON.parse(JSON.stringify(patch))
  if (change.name !== undefined) {
    if (typeof change.name !== 'string' || !change.name.trim()) issues.errors.push('name must be a non-empty string')
    else next.name = change.name.trim()
  }
  if (change.tags !== undefined) next.tag = tagsOf(change.tags)
  applyHeader(next.header, change.header, issues)
  for (const [key, c] of Object.entries(change.slots ?? {})) {
    const i = Number(key) - 1
    const where = `slots["${key}"]`
    if (!(i >= 0 && i < PATCH_SLOTS)) {
      issues.errors.push(`${where}: slots are "1", "2" and "3"`)
      continue
    }
    if (c === null) {
      next.slots[i] = null
      continue
    }
    const cur = next.slots[i]
    if (c.sound !== undefined || !cur) {
      // a new sound in the slot: a fresh layer from it; the slot's mix and tuning stay unless the change sets them
      const src = c.sound !== undefined ? await resolve(c.sound) : null
      if (!src) {
        issues.errors.push(`${where}.sound ${c.sound === undefined ? 'is needed for an empty slot' : `"${c.sound}" isn't a sound on the board or an AKWF wave name`}`)
        continue
      }
      const slot: PatchSlot = { ...(cur ? { ...cur } : defaultVco()), layer: layerFrom(src, c, where, issues, uid) } as PatchSlot
      delete (slot as Partial<PatchSlot> & { soundId?: unknown }).soundId
      applyValues(slot as unknown as Values, c.slot, SLOT_PARAMS, `${where}.slot`, issues)
      next.slots[i] = slot
      continue
    }
    const s = cur.layer.settings
    applyValues(s as unknown as Values, c.settings, SOUND_PARAMS, `${where}.settings`, issues)
    applyLfo(s.mod.lfo1, c.lfo1, `${where}.lfo1`, issues)
    applyLfo(s.mod.lfo2, c.lfo2, `${where}.lfo2`, issues)
    const routes = checkRoutes(c.routes, where, issues)
    if (routes) s.mod.routes = routes
    applyValues(cur as unknown as Values, c.slot, SLOT_PARAMS, `${where}.slot`, issues)
  }
  const mpe = checkMpe(change.mpe, issues)
  if (mpe) next.mpe = mpe
  if (!next.slots.some(Boolean)) issues.errors.push('that would leave the patch with no sound')
  if (issues.ok) mpeNote(next.mpe, issues)
  return issues.ok ? { patch: next, issues } : { issues }
}
