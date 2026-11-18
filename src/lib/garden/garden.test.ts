import { describe, expect, it } from 'vitest'
import {
  defaultPadGrowth, padMoveDelay, padTarget,
  composeCaption, defaultGarden, euclid, MIN_SWAP_S, gardenPeriod, gardenTick, hitsUpTo, migrateGarden, newRing, planNext, pushTake,
  ringSounds, ringWordIndex, takesToDrop, TAKES_KEPT, HISTORY_MAX, type Garden, type TickIn,
} from './garden'
import { sketchClip } from './sketch'

const pat = (p: boolean[]) => p.map((x) => (x ? 'x' : '.')).join('')

describe('Euclidean rhythms', () => {
  it('spread k hits evenly over n steps, starting on one: the tresillo, the cinquillo', () => {
    expect(pat(euclid(3, 8))).toBe('x..x..x.')
    expect(pat(euclid(5, 8))).toBe('x.xx.xx.')
    expect(pat(euclid(4, 16))).toBe('x...x...x...x...')
    expect(pat(euclid(0, 4))).toBe('....')
    expect(pat(euclid(4, 4))).toBe('xxxx')
  })

  it('rotate later by rot steps (either way round), and hold k and n in range', () => {
    expect(pat(euclid(3, 8, 1))).toBe('.x..x..x')
    expect(pat(euclid(3, 8, -1))).toBe(pat(euclid(3, 8, 7)))
    expect(pat(euclid(9, 4))).toBe('xxxx')
    expect(euclid(2, 0)).toHaveLength(1)
  })

  it('count the hits up to a step, over as many repeats as it takes', () => {
    const p = euclid(3, 8)
    expect(hitsUpTo(p, -1)).toBe(0)
    expect(hitsUpTo(p, 0)).toBe(1)
    expect(hitsUpTo(p, 7)).toBe(3)
    expect(hitsUpTo(p, 8)).toBe(4)
    expect(hitsUpTo(p, 8 * 5 + 6)).toBe(3 * 5 + 3)
  })
})

/** a garden with exactly these rings and nothing else in the caption */
function bare(...rings: ReturnType<typeof newRing>[]): Garden {
  return { ...defaultGarden(), seed: 7, rings }
}

describe('a step\'s caption', () => {
  it('a ring moves on to its next word on its hits and holds it between them', () => {
    const r = newRing('noun', { words: ['a', 'b', 'c'], k: 1, n: 2 })
    // hits on even steps: words a (step 0), a, b (2), b, c (4), c, a...
    expect([0, 1, 2, 3, 4, 5, 6].map((s) => r.words[ringWordIndex(r, s, 1)])).toEqual(['b', 'b', 'c', 'c', 'a', 'a', 'b'])
  })

  it('DROP: heard only on its hits; LOCK: frozen on its word; OFF: never', () => {
    const r = newRing('texture', { words: ['hiss'], k: 1, n: 4, drop: true })
    expect([0, 1, 2, 3, 4].map((s) => ringSounds(r, s))).toEqual([true, false, false, false, true])
    const locked = { ...newRing('noun', { words: ['a', 'b', 'c'], k: 1, n: 1 }), locked: true, lockWord: 2 }
    expect([0, 5, 9].map((s) => ringWordIndex(locked, s, 1))).toEqual([2, 2, 2])
    expect(ringSounds({ ...r, off: true }, 0)).toBe(false)
  })

  it('RANDOM and WALK come out the same for the same seed, and WALK only ever steps one word', () => {
    const r = newRing('noun', { words: ['a', 'b', 'c', 'd', 'e', 'f'], k: 1, n: 1, move: 'walk' })
    const walk = Array.from({ length: 40 }, (_, s) => ringWordIndex(r, s, 42))
    expect(walk).toEqual(Array.from({ length: 40 }, (_, s) => ringWordIndex(r, s, 42)))
    for (let s = 1; s < walk.length; s++) expect([1, 5]).toContain((walk[s] - walk[s - 1] + 6) % 6)
    const rnd = { ...r, move: 'random' as const }
    expect(ringWordIndex(rnd, 9, 1)).toBe(ringWordIndex(rnd, 9, 1))
    expect(new Set(Array.from({ length: 40 }, (_, s) => ringWordIndex(rnd, s, 3))).size).toBeGreaterThan(3)
  })

  it('puts the phrase in order (what it\'s like, what, doing what, where), then the custom rings', () => {
    const g = bare(
      newRing('verb', { words: ['humming'], k: 1, n: 1 }),
      newRing('custom', { words: ['dream'], k: 1, n: 1 }),
      newRing('place', { words: ['in a mine'], k: 1, n: 1 }),
      newRing('noun', { words: ['bells'], k: 1, n: 1 }),
      newRing('adjective', { words: ['warm'], k: 1, n: 1 }),
    )
    expect(composeCaption(g, 0)).toMatchObject({ prompt: 'warm bells humming in a mine, dream', seconds: 4 })
  })

  it('a garden of cycling rings comes round again after the lcm of their periods', () => {
    const g = bare(newRing('noun', { words: ['a', 'b'], k: 1, n: 2 }), newRing('verb', { words: ['x', 'y', 'z'], k: 1, n: 1 }))
    const p = gardenPeriod(g)
    expect(p).toBe(12) // the noun ring: 2 words, a hit every 2 steps = 4; the verb ring: 3
    for (let s = 0; s < 12; s++) expect(composeCaption(g, s + p).prompt).toBe(composeCaption(g, s).prompt)
  })
})

describe('what comes next', () => {
  const alive = () => true

  it('a new caption is made, seeded by the caption (the same words make the same clip)', () => {
    const g = bare(newRing('noun', { words: ['a', 'b'], k: 1, n: 1 }))
    g.back = 0
    const n = planNext(g, alive)
    expect(n.kind).toBe('make')
    if (n.kind !== 'make') return
    expect(n.step).toBe(1)
    expect(n.seed).toBe((planNext({ ...g }, alive) as typeof n).seed)
  })

  it('a caption that came up before plays its clip again (REUSE), unless it is the one playing', () => {
    const g = bare(newRing('noun', { words: ['a', 'b'], k: 1, n: 1 }))
    g.back = 0
    // step 1 says "a" (two hits by then: index 2 % 2): the take that said "a" comes back
    pushTake(g, { soundId: 'A', prompt: composeCaption(g, 1).prompt, step: 0, at: 0 })
    pushTake(g, { soundId: 'B', prompt: 'something else', step: 0, at: 1 })
    expect(planNext(g, alive)).toMatchObject({ kind: 'again', take: { soundId: 'A' } })
    expect(planNext({ ...g, reuse: false }, alive).kind).toBe('make')
    expect(planNext(g, (id) => id !== 'A').kind).toBe('make') // gone from the board: made again
  })

  it('BACK sends a step to an earlier take, never the one playing', () => {
    const g = bare(newRing('noun', { words: ['a'], k: 1, n: 1 }))
    g.back = 1
    for (const id of ['C', 'B', 'A']) pushTake(g, { soundId: id, prompt: id, step: g.step + 1, at: 0 })
    for (let s = 0; s < 20; s++) {
      const n = planNext({ ...g, step: s }, alive)
      expect(n.kind).toBe('again')
      if (n.kind === 'again') expect(n.take.soundId).not.toBe('A')
    }
  })

  it('the history keeps the newest takes, newest first, and moves the garden to their step', () => {
    const g = defaultGarden()
    for (let i = 0; i < 60; i++) pushTake(g, { soundId: `s${i}`, prompt: '', step: i, at: i })
    expect(g.history).toHaveLength(HISTORY_MAX)
    expect(g.history[0].soundId).toBe('s59')
    expect(g.step).toBe(59)
  })

  it('a saved garden (older, partial) comes back whole', () => {
    const g = migrateGarden({ on: true, loops: 8, rings: [{ kind: 'verb', words: ['x'] } as never] })
    expect(g.on).toBe(true)
    expect(g.loops).toBe(8)
    expect(g.rings[0]).toMatchObject({ kind: 'verb', words: ['x'], k: 3, n: 8 })
    expect(g.subject).toBe('')
    expect(g.pads).toEqual(defaultPadGrowth())
  })

  it('an older garden lets go of its chips, grids and TELEPHONE; its pads grew only with PADS GROW on', () => {
    const old = { chips: { genre: ['ambient'] }, grids: { bpm: [90] }, prefix: 'x', telephone: { on: true, chain: ['now', 'moria'] }, pads: { on: false, amount: 0.5, pads: ['grain'] } }
    const g = migrateGarden(old as never) as Garden & Record<string, unknown>
    expect(g.chips).toBeUndefined()
    expect(g.grids).toBeUndefined()
    expect(g.telephone).toBeUndefined()
    expect(g.subject).toBe('moria')
    expect(g.pads).toEqual({ amount: 0.5, pads: [], lfo: {} })
    expect(migrateGarden({ pads: { on: true, amount: 0.2, pads: ['lfo'] } } as never).pads).toEqual({ amount: 0.2, pads: ['lfo'], lfo: {} })
  })
})

describe('when (the swap schedule)', () => {
  const tick = (over: Partial<TickIn>): TickIn => ({ dt: 0.2, sounding: true, loopSec: 1, loops: 4, offset: 0, fade: 0.08, paused: false, ready: false, busy: false, coolingDown: false, ...over })

  it('prepares the next clip as soon as the VCO first sounds, and only when the model is free', () => {
    expect(gardenTick({ heard: 0, started: false, offsetUsed: 0 }, tick({ sounding: false })).prepare).toBe(false)
    expect(gardenTick({ heard: 0, started: false, offsetUsed: 0 }, tick({})).prepare).toBe(true)
    expect(gardenTick({ heard: 0, started: true, offsetUsed: 0 }, tick({ sounding: false })).prepare).toBe(true)
    expect(gardenTick({ heard: 0, started: true, offsetUsed: 0 }, tick({ busy: true })).prepare).toBe(false)
    expect(gardenTick({ heard: 0, started: true, offsetUsed: 0 }, tick({ coolingDown: true })).prepare).toBe(false)
    expect(gardenTick({ heard: 0, started: true, offsetUsed: 0 }, tick({ ready: true })).prepare).toBe(false)
  })

  it('stitches after LOOPS passes of sounding time, only with the next clip ready; then counts again', () => {
    let s = { heard: 0, started: false, offsetUsed: 0 }
    let stitched = -1
    for (let i = 0; i < 40; i++) {
      // silent between 1 s and 2 s: that time doesn't count
      const o = gardenTick(s, tick({ sounding: i < 5 || i >= 10, ready: true }))
      s = o.state
      if (o.stitch && stitched < 0) stitched = i
    }
    expect(stitched).toBe(24) // 4 s of sounding (20 ticks) over 25 ticks
    expect(s.heard).toBeLessThan(4)
  })

  it('never stitches sooner than MIN_SWAP_S, however short the loop (a single-cycle wave)', () => {
    let s = { heard: 0, started: true, offsetUsed: 0 }
    let at = -1
    for (let i = 0; i < 20 && at < 0; i++) {
      const o = gardenTick(s, tick({ loopSec: 0.01, loops: 1, ready: true }))
      s = o.state
      if (o.stitch) at = i
    }
    // 2 s of 0.2 s ticks (give or take a tick of rounding), not the first tick
    expect(at).toBeGreaterThanOrEqual(MIN_SWAP_S / 0.2 - 1)
    expect(at).toBeLessThanOrEqual(MIN_SWAP_S / 0.2)
  })

  it('a clip not ready in time waits: the one playing loops on, and goes the moment it is', () => {
    const late = gardenTick({ heard: 10, started: true, offsetUsed: 0 }, tick({ ready: false }))
    expect(late.stitch).toBe(false)
    expect(late.progress).toBe(1)
    expect(gardenTick(late.state, tick({ ready: true })).stitch).toBe(true)
  })

  const firstStitch = (over: Partial<TickIn>, s0 = { heard: 0, started: true, offsetUsed: 0 }) => {
    let s = s0
    for (let i = 0; i < 400; i++) {
      const o = gardenTick(s, tick({ ready: true, ...over }))
      s = o.state
      if (o.stitch) return { at: i, s }
    }
    return { at: -1, s }
  }

  it('OFFSET pushes the swaps back by that many loops, and the stagger lasts (each swap restarts the count)', () => {
    expect(firstStitch({}).at).toBe(19) // 4 loops of 1 s at 0.2 s a tick
    const late = firstStitch({ offset: 2 })
    expect(late.at).toBe(29) // 4 + 2 loops
    // the next swap comes LOOPS later, not LOOPS + OFFSET: the two VCOs stay 2 loops apart
    expect(firstStitch({ offset: 2 }, late.s).at).toBe(19)
    // turning OFFSET down mid-way brings the swap forward by the difference
    const half = gardenTick({ heard: 1, started: true, offsetUsed: 2 }, tick({ offset: 0 }))
    expect(half.state.heard).toBeCloseTo(3.2)
  })

  it('a stitch waits for the last crossfade to finish: a 10 s fade over 1 s loops swaps no sooner than 10.5 s', () => {
    expect(firstStitch({ fade: 10 }).at).toBe(52)
  })

  it('PAUSED makes nothing, stitches nothing, and holds the time heard where it is', () => {
    const o = gardenTick({ heard: 10, started: true, offsetUsed: 0 }, tick({ paused: true, ready: true }))
    expect(o.stitch).toBe(false)
    expect(o.state.heard).toBe(10)
    expect(gardenTick({ heard: 0, started: true, offsetUsed: 0 }, tick({ paused: true })).prepare).toBe(false)
    expect(gardenTick(o.state, tick({ ready: true })).stitch).toBe(true)
  })
})

describe('SKETCH (the stand-in synth)', () => {
  it('plays a caption the same way every time but its noise, at the asked length, without clipping', () => {
    const [l, r] = sketchClip('warm glass bells, ambient, in A minor', 1, 8000)
    expect(l).toHaveLength(8000)
    expect(r).toHaveLength(8000)
    const peak = Math.max(...l.map(Math.abs))
    expect(peak).toBeGreaterThan(0.3)
    expect(peak).toBeLessThanOrEqual(0.71)
    expect(Math.abs(l[0])).toBeLessThan(1e-3) // faded in: loops without a click
  })
})

describe('letting old takes go', () => {
  const take = (id: string, o: object = {}) => ({ soundId: id, prompt: id, step: 0, at: 0, ...o })
  it('keeps the latest TAKES_KEPT takes\' audio and lets the rest go, unless saved, playing or wanted elsewhere', () => {
    const history = Array.from({ length: 12 }, (_, i) => take(`t${i}`))
    expect(takesToDrop({ history }, [])).toEqual(history.slice(TAKES_KEPT).map((t) => t.soundId))
    history[8] = take('t8', { saved: true })
    expect(takesToDrop({ history }, ['t9'])).toEqual(['t6', 't7', 't10', 't11'])
  })
  it('never lets go of a clip a kept take came back round to (BACK, REUSE)', () => {
    const history = [take('a'), take('b'), take('c'), take('d'), take('e'), take('old'), take('f'), take('old')]
    expect(takesToDrop({ history }, [])).toEqual(['f'])
  })
  it('a saved garden from before SAVE comes back with an empty list of saved takes', () => {
    expect(migrateGarden({ on: true } as never).saved).toEqual([])
  })
})

describe('the pads growing with the clips', () => {
  it('steps a pad the same way for the same seed and step, within amount, inside the pad', () => {
    const from = { x: 0.5, y: 0.5 }
    const a = padTarget(42, 7, 'grain', from, 0.2)
    expect(padTarget(42, 7, 'grain', from, 0.2)).toEqual(a)
    expect(Math.abs(a.x - 0.5)).toBeLessThanOrEqual(0.2)
    expect(Math.abs(a.y - 0.5)).toBeLessThanOrEqual(0.2)
    expect(padTarget(42, 8, 'grain', from, 0.2)).not.toEqual(a)
    expect(padTarget(42, 7, 'tone', from, 0.2)).not.toEqual(a)
    for (let s = 0; s < 200; s++) {
      const p = padTarget(1, s, 'fx', { x: 0.98, y: 0.02 }, 0.5)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(1)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(1)
    }
    expect(padTarget(3, 3, 'lfo', from, 0)).toEqual(from)
  })
  it('moves OFFSET loops after the stitch, wrapped before the next one', () => {
    expect(padMoveDelay(0, 2, 8)).toBe(0)
    expect(padMoveDelay(1.5, 2, 8)).toBe(3)
    expect(padMoveDelay(5, 2, 8)).toBe(2)
  })
  it('old gardens get the pads, off', () => {
    expect(migrateGarden({ on: true } as never).pads).toEqual(defaultPadGrowth())
  })
})

describe('a ring on the GARDEN pad', () => {
  it('x is its steps, y its hits of them; and back again', async () => {
    const { ringPoint, setRingPoint, STEPS_MAX } = await import('./garden')
    const r = newRing('noun', { k: 3, n: 8, rot: 7 })
    setRingPoint(r, { x: 0, y: 1 })
    expect([r.n, r.k, r.rot]).toEqual([1, 1, 0])
    setRingPoint(r, { x: 1, y: 0.5 })
    expect([r.n, r.k]).toEqual([STEPS_MAX, 16])
    setRingPoint(r, ringPoint(newRing('verb', { k: 5, n: 12 })))
    expect([r.n, r.k]).toEqual([12, 5])
  })
})
