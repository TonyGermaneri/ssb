import { describe, expect, it } from 'vitest'
import { computed, nextTick, reactive, ref, toRaw, watch } from 'vue'
import { isTracked, track, untrack } from './tracked'
import { defaultSettings, type Sound } from '../types'

const sound = (name: string): Sound => ({ id: name, audioId: `a-${name}`, fileName: `${name}.wav`, settings: defaultSettings(name) })

describe('write tracking', () => {
  it('reports writes anywhere inside the item, through Vue as well', async () => {
    let writes = 0
    const list = ref<Sound[]>([track(sound('A'), () => writes++)])
    const s = list.value[0]
    s.settings.cutoff = 900
    s.settings.mod.lfo1.rate = 3
    s.settings.mod.routes.push({ source: 'lfo1', dest: 'cutoff', amount: 0.5 })
    s.settings.mod.routes[0].amount = 0.25
    s.settings.mod.routes.splice(0, 1)
    expect(writes).toBeGreaterThanOrEqual(5)
    const before = writes
    s.settings.cutoff = 900 // unchanged
    expect(writes).toBe(before)
    s.fav = true
    delete s.fav
    expect(writes).toBe(before + 2)
    // Vue still sees every change
    const cutoff = computed(() => list.value[0].settings.cutoff)
    const seen: number[] = []
    watch(() => list.value[0].settings.mod.lfo1.rate, (v) => seen.push(v))
    s.settings.cutoff = 1200
    s.settings.mod.lfo1.rate = 7
    await nextTick()
    expect(cutoff.value).toBe(1200)
    expect(seen).toEqual([7])
  })

  it('keeps the data underneath plain', () => {
    const raw = sound('B')
    const t = track(raw, () => {})
    const v = reactive({ list: [t] }).list[0]
    expect(isTracked(v)).toBe(true)
    expect(untrack(v)).toBe(raw)
    expect(toRaw(v)).toBe(t)
    // an object stored through a tracker is stored unwrapped
    v.settings.mod = JSON.parse(JSON.stringify(t.settings.mod))
    v.settings.mod.lfo2 = v.settings.mod.lfo1
    expect(isTracked(raw.settings.mod.lfo2)).toBe(false)
    expect(raw.settings.mod.lfo2).toBe(raw.settings.mod.lfo1)
    expect(JSON.parse(JSON.stringify(v))).toEqual(JSON.parse(JSON.stringify(raw)))
    expect(() => structuredClone(untrack(v))).not.toThrow()
    // wrapping twice is the same tracker
    expect(track(t, () => {})).toBe(t)
  })

  it('finds tracked items in arrays (Vue compares raw objects)', () => {
    const items = [track(sound('C'), () => {}), track(sound('D'), () => {})]
    const list = reactive(items)
    expect(list.indexOf(list[1])).toBe(1)
    expect(list.includes(items[0])).toBe(true)
    expect(list.findIndex((s) => s.id === 'D')).toBe(1)
  })
})
