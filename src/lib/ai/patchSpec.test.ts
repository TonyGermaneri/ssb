import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../../types'
import { waveSoundSettings } from '../akwf'
import { applyChange, fromSpec, toSpec, type SoundRef } from './patchSpec'
import { validate } from './schema'

const sounds: Record<string, SoundRef> = {
  saw: { id: 'snd-saw', ref: 'AKWF_saw', name: 'SAW', settings: waveSoundSettings('AKWF_saw', 'AKWF_saw') },
  sin: { id: 'snd-sin', ref: 'AKWF_sin', name: 'SIN', settings: waveSoundSettings('AKWF_sin', 'AKWF_sin') },
  mine: { id: 'snd-mine', ref: 'snd-mine', name: 'MY KICK', settings: defaultSettings('MY KICK') },
}
const byRef = async (r: string) => Object.values(sounds).find((s) => s.ref === r || s.id === r) ?? null
const byId = (id: string) => Object.values(sounds).find((s) => s.id === id) ?? null
let n = 0
const uid = () => `id${++n}`

describe('patch specs', () => {
  it('builds a patch from a spec and reads it back as the same spec', async () => {
    const spec = {
      name: 'TEST PAD',
      tags: 'pad, test',
      slots: [
        { sound: 'AKWF_saw', settings: { cutoff: 1200, attack: 0.5 }, lfo1: { rate: 0.2 }, routes: [{ source: 'lfo1' as const, dest: 'cutoff' as const, amount: 0.1 }] },
        { sound: 'AKWF_sin', slot: { audible: false, transpose: 12 } },
        null,
      ],
      header: { mono: true, fx: { reverbMix: 0.3 } },
    }
    const { patch, issues } = await fromSpec(spec, byRef, uid)
    expect(issues.errors).toEqual([])
    expect(patch!.slots[0]!.layer.settings.cutoff).toBe(1200)
    expect(patch!.slots[1]!.audible).toBe(false)
    expect(patch!.tag).toBe('pad, test, ai')
    const back = toSpec(patch!, byId)
    expect(back.slots[0]).toMatchObject({ sound: 'AKWF_saw', sound_name: 'SAW', settings: { cutoff: 1200, attack: 0.5 }, lfo1: { rate: 0.2 } })
    expect(back.slots[0]!.routes).toEqual(spec.slots[0]!.routes)
    expect(back.slots[1]).toEqual({ sound: 'AKWF_sin', sound_name: 'SIN', slot: { audible: false, transpose: 12 } })
    expect(back.slots[2]).toBeNull()
    expect(back.header).toEqual({ mono: true, fx: { reverbMix: 0.3 } })
  })

  it("takes a route's UNIPOLAR flag, keeps it, and refuses a non-boolean", async () => {
    const routes = [
      { source: 'lfo2' as const, dest: 'grainPos' as const, amount: 0.4, unipolar: true },
      { source: 'lfo1' as const, dest: 'cutoff' as const, amount: 0.1 },
    ]
    const { patch, issues } = await fromSpec({ name: 'UNI', slots: [{ sound: 'AKWF_saw', settings: { grain: true }, routes }] }, byRef, uid)
    expect(issues.errors).toEqual([])
    expect(patch!.slots[0]!.layer.settings.mod.routes).toEqual(routes)
    expect(toSpec(patch!, byId).slots[0]!.routes).toEqual(routes)
    const bad = await fromSpec({ name: 'X', slots: [{ sound: 'AKWF_saw', routes: [{ source: 'lfo2', dest: 'grainPos', amount: 0.4, unipolar: 'yes' as unknown as boolean }] }] }, byRef, uid)
    expect(bad.issues.errors.join('\n')).toMatch(/unipolar must be true or false/)
  })

  it('takes MPE bindings (slots 1..3 in the spec, 0..2 on the patch), reads them back, and asks for press and slide', async () => {
    const mpe = [
      { surface: 'press', dest: 'cutoff', amount: 0.3 },
      { surface: 'slide', dest: 'reverbMix', amount: 0.25, slots: [1] },
    ]
    const { patch, issues } = await fromSpec({ name: 'EXPRESSIVE', slots: [{ sound: 'AKWF_saw' }, { sound: 'AKWF_sin' }], mpe }, byRef, uid)
    expect(issues.errors).toEqual([])
    expect(patch!.mpe).toEqual([
      { surface: 'press', dest: 'cutoff', amount: 0.3 },
      { surface: 'slide', dest: 'reverbMix', amount: 0.25, slots: [0] },
    ])
    expect(issues.notes.join('\n')).not.toMatch(/MPE:/)
    expect(toSpec(patch!, byId).mpe).toEqual(mpe)
    // nothing bound: made, with a reminder; update_patch replaces the list
    const bare = await fromSpec({ name: 'FLAT', slots: [{ sound: 'AKWF_saw' }] }, byRef, uid)
    expect(bare.patch!.mpe).toEqual([])
    expect(bare.issues.notes.join('\n')).toMatch(/press and slide are unbound/)
    const changed = await applyChange(bare.patch!, { mpe: [{ surface: 'press', dest: 'volume', amount: 0.2 }] }, byRef, uid)
    expect(changed.patch!.mpe).toEqual([{ surface: 'press', dest: 'volume', amount: 0.2 }])
    expect(changed.issues.notes.join('\n')).toMatch(/slide is unbound/)
    // wrong surfaces and slots are refused; header.mpe is the player's, ignored with a note
    const bad = await fromSpec({ name: 'X', slots: [{ sound: 'AKWF_saw' }], mpe: [{ surface: 'lift', dest: 'cutoff', amount: 0.2 }, { surface: 'press', dest: 'cutoff', amount: 0.2, slots: [4] }] }, byRef, uid)
    expect(bad.patch).toBeUndefined()
    expect(bad.issues.errors.join('\n')).toMatch(/surface/)
    expect(bad.issues.errors.join('\n')).toMatch(/slots must list slot numbers 1..3/)
    const h = await fromSpec({ name: 'H', slots: [{ sound: 'AKWF_saw' }], header: { mpe: true } as never }, byRef, uid)
    expect(h.issues.errors).toEqual([])
    expect(h.issues.notes.join('\n')).toMatch(/header.mpe is ignored/)
  })

  it('refuses unknown knobs and sounds, naming the nearest', async () => {
    const { patch, issues } = await fromSpec({ name: 'X', slots: [{ sound: 'AKWF_nope', settings: {} }, { sound: 'AKWF_saw', settings: { cuttoff: 300 } }] }, byRef, uid)
    expect(patch).toBeUndefined()
    expect(issues.errors.join('\n')).toMatch(/AKWF_nope/)
    expect(issues.errors.join('\n')).toMatch(/no parameter "cuttoff".*cutoff/)
  })

  it('clamps out-of-range numbers and says so; refuses wrong types and enum values', async () => {
    const ok = await fromSpec({ name: 'X', slots: [{ sound: 'AKWF_saw', settings: { cutoff: 50000, resonance: 0.7 } }] }, byRef, uid)
    expect(ok.patch!.slots[0]!.layer.settings.cutoff).toBe(20000)
    expect(ok.issues.notes.join()).toMatch(/cutoff 50000 is out of range: set to 20000/)
    const bad = await fromSpec({ name: 'X', slots: [{ sound: 'AKWF_saw', settings: { filterType: 'ladder', grain: 'yes' } }] }, byRef, uid)
    expect(bad.patch).toBeUndefined()
    expect(bad.issues.errors.join('\n')).toMatch(/filterType must be one of/)
    expect(bad.issues.errors.join('\n')).toMatch(/grain must be true or false/)
  })

  it('merges an update, keeps layers whose sound stays, and changes nothing if any of it is wrong', async () => {
    const { patch } = await fromSpec({ name: 'BASE', slots: [{ sound: 'AKWF_saw', settings: { cutoff: 900 } }, { sound: 'AKWF_sin' }] }, byRef, uid)
    const layer0 = patch!.slots[0]!.layer.id
    const r = await applyChange(patch!, { name: 'BASE 2', slots: { '1': { settings: { resonance: 4 } }, '2': null, '3': { sound: 'snd-mine' } }, header: { glide: 0.1 } }, byRef, uid)
    expect(r.issues.errors).toEqual([])
    const p = r.patch!
    expect(p.name).toBe('BASE 2')
    expect(p.slots[0]!.layer.id).toBe(layer0)
    expect(p.slots[0]!.layer.settings).toMatchObject({ cutoff: 900, resonance: 4 })
    expect(p.slots[1]).toBeNull()
    expect(p.slots[2]!.layer.soundId).toBe('snd-mine')
    expect(p.header.glide).toBe(0.1)
    // the original is untouched
    expect(patch!.name).toBe('BASE')
    const bad = await applyChange(patch!, { name: 'NEVER', slots: { '1': { settings: { resonance: 'loud' } } } }, byRef, uid)
    expect(bad.patch).toBeUndefined()
    expect(patch!.name).toBe('BASE')
  })

  it('refuses a change that leaves no sound', async () => {
    const { patch } = await fromSpec({ name: 'ONE', slots: [{ sound: 'AKWF_saw' }] }, byRef, uid)
    const r = await applyChange(patch!, { slots: { '1': null } }, byRef, uid)
    expect(r.issues.errors.join()).toMatch(/no sound/)
  })
})

describe('tool input validation', () => {
  const schema = {
    type: 'object' as const,
    properties: { note: { type: 'integer' as const, minimum: 0, maximum: 127 }, images: { type: 'array' as const, items: { type: 'string' as const, enum: ['waveform', 'spectrogram'] } } },
    required: ['note'],
    additionalProperties: false,
  }
  it('passes what fits and names what does not', () => {
    expect(validate(schema, { note: 60, images: ['waveform'] })).toBeNull()
    expect(validate(schema, {})).toMatch(/note is required/)
    expect(validate(schema, { note: 60.5 })).toMatch(/note should be integer/)
    expect(validate(schema, { note: 200 })).toMatch(/at most 127/)
    expect(validate(schema, { note: 1, images: ['picture'] })).toMatch(/images\[0\] should be one of/)
    expect(validate(schema, { note: 1, color: 'red' })).toMatch(/color isn't a known field/)
  })
})

describe('tool calls written as text by local models', async () => {
  const { recoverToolCalls } = await import('./providers/openai')
  const tools = [{ name: 'list_sounds', description: '', schema: {} }, { name: 'render_patch', description: '', schema: {} }]
  it('reads Qwen3.5 XML calls and Hermes JSON calls, real tool names only', () => {
    const xml = 'Let me search.\n<tool_call>\n<function=list_sounds>\n<parameter=query>\nsoft pad\n</parameter>\n<parameter=limit>\n10\n</parameter>\n</function>\n</tool_call>'
    expect(recoverToolCalls(xml, tools)).toEqual([{ name: 'list_sounds', args: '{"query":"soft pad","limit":10}' }])
    const json = '<tool_call>{"name": "render_patch", "arguments": {"note": 48}}</tool_call>'
    expect(recoverToolCalls(json, tools)).toEqual([{ name: 'render_patch', args: '{"note":48}' }])
    expect(recoverToolCalls('<function=rm_rf><parameter=x>1</parameter></function>', tools)).toEqual([])
    expect(recoverToolCalls('just talk', tools)).toEqual([])
  })
})
