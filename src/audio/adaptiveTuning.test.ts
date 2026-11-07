import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AdaptiveTuner } from './adaptiveTuning'
import { defaultSettings, migratePatch, type TuningMode, type Patch } from '../types'

const [C, Db, D, Eb, E, F, Gb, G, Ab, A, Bb, B] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

/** Play `notes`; those in `heard` have sounded a while, the rest are arriving now, over `tails` still ringing. */
function play(t: AdaptiveTuner, notes: number[], heard: number[] = [], at = 1, tails: number[] = []) {
  const held = new Float64Array(12).fill(-1)
  const ringing = new Float64Array(12).fill(-1)
  for (const n of tails) ringing[n] = 1
  for (const n of notes) held[n] = ringing[n] = heard.includes(n) ? 1 : Math.max(ringing[n], 0)
  t.chord(held, ringing, at)
}
const cents = (t: AdaptiveTuner, notes: number[]) => notes.map((n) => t.cents(n))
/** Check against the paper's whole-cent figures (it rounds; some of its sums are a cent out). */
const near = (got: number[], want: number[], within = 0.6) => {
  expect(got.length).toBe(want.length)
  got.forEach((g, i) => expect(Math.abs(g - want[i]), `${got} vs ${want}`).toBeLessThanOrEqual(within))
}
const tuner = (mode: TuningMode, ...chords: number[][]) => {
  const t = new AdaptiveTuner(mode)
  for (const c of chords) play(t, c)
  return t
}

describe('Adaptive tuning positions (diagrams 01-04, 09, 19)', () => {
  it('tunes triads pure, centred on equal temperament', () => {
    near(cents(tuner('eased', [C, E, G]), [C, E, G]), [4, -10, 6])
    near(cents(tuner('eased', [E, G, B]), [E, G, B]), [-6, 10, -4])
    near(cents(tuner('eased', [A, C, E]), [A, C, E]), [-6, 10, -4])
  })

  it('tunes two notes when they are a third or a fifth, and not otherwise', () => {
    near(cents(tuner('eased', [C, E]), [C, E]), [7, -7])
    near(cents(tuner('eased', [E, G]), [E, G]), [-8, 8])
    near(cents(tuner('eased', [C, G]), [C, G]), [-1, 1])
    // inverted, the same notes
    near(cents(tuner('eased', [G, C + 12 - 12]), [C, G]), [-1, 1])
    near(cents(tuner('eased', [C, D]), [C, D]), [0, 0])
    near(cents(tuner('eased', [C, Gb]), [C, Gb]), [0, 0])
  })

  it('tunes the chain F A C E G B and parts of it', () => {
    near(cents(tuner('eased', [F, A, C, E, G, B]), [F, A, C, E, G, B]), [5, -9, 7, -7, 9, -5])
    near(cents(tuner('eased', [F, A, G, B]), [F, A, G, B]), [5, -9, 9, -5])
    near(cents(tuner('eased', [F, C, G]), [F, C, G]), [-2, 0, 2])
    // a seventh chord and a sixth chord are stretches of it: Dm7 and the paper's chord 9
    near(cents(tuner('eased', [D, F, A, C]), [D, F, A, C]), [-9, 7, -7, 9])
    near(cents(tuner('eased', [C, E, G, B]), [C, E, G, B]), [6, -8, 8, -6], 0.2)
  })

  it('centres every structure: its deviations sum to zero', () => {
    for (const c of [[C, E, G], [A, C, E], [F, A, C, E, G, B], [D, F, A, C], [C, G]]) {
      const sum = cents(tuner('eased', c), c).reduce((a, b) => a + b)
      expect(Math.abs(sum)).toBeLessThan(1e-9)
    }
  })

  it('keeps a dominant seventh near tempered, except in 7-LIMIT', () => {
    near(cents(tuner('eased', [C, E, G, Bb]), [C, E, G, Bb]), [4, -10, 6, 10])
    near(cents(tuner('septimal', [G, B, D, F]), [G, B, D, F]), [4, -10, 6, -27], 0.3)
    // without its fifth it's a jazz shell, or just part of the chain
    near(cents(tuner('septimal', [C, E, Bb]), [C, E, Bb]), [4, -10, -27], 0.3)
    near(cents(tuner('eased', [C, E, Bb]), [C, E, Bb]), [6, -8, 2], 0.2)
  })

  it('gives its intervals as pure', () => {
    const [c, e, g] = cents(tuner('strict', [C, E, G]), [C, E, G])
    expect(e - c + 400).toBeCloseTo(1200 * Math.log2(5 / 4), 9)
    expect(g - c + 700).toBeCloseTo(1200 * Math.log2(3 / 2), 9)
    const t = tuner('septimal', [G, B, D, F])
    expect(t.cents(F) - t.cents(G) + 1000).toBeCloseTo(1200 * Math.log2(7 / 4), 9)
  })
})

describe('Adaptive tuning line (diagrams 11-17)', () => {
  it('rides C major into A minor: shared notes step 3 cents, the line takes the rest', () => {
    const t = tuner('eased', [C, E, G])
    play(t, [A, C, E], [C, E], 2)
    near([t.line], [-3])
    near(cents(t, [A, C, E]), [-9, 7, -7])
  })

  it('rides C major into C minor', () => {
    const t = tuner('eased', [C, E, G])
    play(t, [C, Eb, G], [C, G], 2)
    near([t.line], [7])
    near(cents(t, [C, Eb, G]), [1, 17, 3])
  })

  it('comes back a step at a time when nothing holds it', () => {
    const t = tuner('eased', [C, E, G])
    play(t, [C, Eb, G], [C, G], 2) // line +7
    play(t, [Bb, D, F], [], 3, [C, Eb, G])
    near([t.line], [3], 0.3)
    near(cents(t, [Bb, D, F]), [7, -7, 9], 0.4)
    play(t, [D, F, A], [D, F], 4, [Bb]) // D and F barely move, and the line is close enough to go home
    expect(t.line).toBe(0)
  })

  it('limits drift where it would run away (STRICT)', () => {
    const t = tuner('strict', [C, E, G])
    play(t, [E, Ab, B], [E], 2)
    near([t.line], [-11])
    near(cents(t, [E, Ab, B]), [-7, -21, -5])
    play(t, [Ab, C, Eb], [Ab], 3)
    near([t.line], [-18])
    near(cents(t, [Ab, Eb, C]), [-14, -12, -28], 0.8)
  })

  it('in EASED gives up purity instead, keeping the line', () => {
    const t = tuner('eased', [C, E, G])
    play(t, [E, Ab, B], [E], 2)
    play(t, [Ab, C, Eb], [Ab], 3)
    near([t.line], [-18])
    near(cents(t, [Ab, C]), [-15, -26], 0.8)
  })

  it('splits the step when shared notes pull apart', () => {
    const t = tuner('strict', [C, E, Ab])
    near(cents(t, [C, E, Ab]), [7, -7, 0])
    play(t, [Ab, C, Eb], [Ab, C], 2)
    near([t.line], [6], 0.6)
    near(cents(t, [Ab, Eb, C]), [10, 12, -4], 0.7)
    // and EASED meets it halfway
    const c = tuner('eased', [C, E, Ab])
    play(c, [Ab, C, Eb], [Ab, C], 2)
    near(cents(c, [Ab, Eb, C]), [8, 9, 1], 0.7)
  })

  it('stays within 20 and 30 cents, whatever is played, and STRICT stays pure', () => {
    const t = new AdaptiveTuner('strict')
    const roots = [C, E, Ab, C, A, F, Db, A, F, Db, B, G, Eb, B, Gb, D, Bb, Gb]
    roots.forEach((r, i) => {
      const chord = [r, (r + 4) % 12, (r + 7) % 12]
      play(t, chord, [chord[i % 3]], 1 + i)
      expect(Math.abs(t.line)).toBeLessThanOrEqual(20)
      for (const n of chord) expect(Math.abs(t.cents(n))).toBeLessThanOrEqual(30)
      const [a, b, c] = chord.map((n) => t.cents(n))
      expect(b - a + 400).toBeCloseTo(386.31, 1)
      expect(c - a + 700).toBeCloseTo(701.96, 1)
    })
  })

  it('leaves a natural seventh out of it, up to 47 cents', () => {
    const t = tuner('septimal', [G, B, D, F])
    play(t, [F, A, C], [F], 2) // the seventh resolves to a root: a hard step, not a shifted line
    expect(t.line).toBe(0)
    near(cents(t, [F, A, C]), [4, -10, 6])
  })
})

describe('Adaptive tuning timing (diagrams 10, 18)', () => {
  it('moves a note not yet heard freely, and a heard one by a step', () => {
    const t = tuner('eased', [E])
    expect(t.cents(E)).toBe(0)
    play(t, [E, G], [], 1.02)
    near(cents(t, [E, G]), [-8, 8])

    const heard = tuner('eased', [E])
    play(heard, [E, G], [E], 2)
    expect(heard.cents(E)).toBeCloseTo(-3, 9)
    expect(heard.cents(G) - heard.cents(E)).toBeCloseTo(15.64, 2)
  })

  it('takes notes of an unreadable chord in the order they came, and holds them on a repeat', () => {
    const t = tuner('eased', [C, E, Ab])
    near(cents(t, [C, E, Ab]), [7, -7, 0])
    // E and G sharp again: no pure third, because that would change the sound of the chord
    play(t, [E, Ab], [], 2)
    near(cents(t, [E, Ab]), [-7, 0])
  })

  it('moves nothing when a chord loses notes', () => {
    const t = tuner('eased', [C, E, G])
    play(t, [C, E], [C, E], 2)
    near(cents(t, [C, E]), [4, -10])
  })

  it('forgets in silence: the line fades, and a lone note is on it', () => {
    const t = tuner('eased', [C, E, G])
    play(t, [C, Eb, G], [C, G], 2)
    expect(t.line).toBeCloseTo(6.78, 1)
    play(t, [C], [], 32)
    expect(Math.abs(t.line)).toBeLessThan(0.01)
    expect(Math.abs(t.cents(C))).toBeLessThan(0.01)
  })

  it('counts a ringing release tail as heard', () => {
    const t = tuner('eased', [C, E, G])
    const held = new Float64Array(12).fill(-1)
    const ringing = new Float64Array(12).fill(-1)
    held[A] = held[C] = held[E] = 0
    ringing[A] = ringing[C] = ringing[E] = 0
    ringing[C] = ringing[E] = 0.5 // the old chord's tails, with the new notes struck over them
    t.chord(held, ringing, 2)
    near([t.line], [-3])
  })
})

describe('Adaptive tuning TONAL (diagrams 21-27)', () => {
  const song = [[C, E, G], [Db, E, G, A], [D, F], [C, E, G, Bb], [F, A], [D, Gb, A, C], [G, B], [E, Ab, B, D], [D, F, A, C], [C, E, G]]

  it('finds the paper\'s centre, G, in its example', () => {
    const t = new AdaptiveTuner('tonal')
    song.forEach((c, i) => {
      play(t, c, [], 1 + i * 5)
      expect(t.centre, `chord ${i + 1}`).toBe(G)
    })
  })

  it('leans chords toward the centre, at 30 % once it is clear', () => {
    const t = new AdaptiveTuner('tonal')
    for (let i = 0; i < 6; i++) play(t, [C, E, G], [], 1 + i * 5)
    expect(t.centre).toBe(G)
    // 70 % of the chord + 30 % of the basis around G
    near(cents(t, [C, E, G]), [0.7 * 3.91 + 0.3 * 6, 0.7 * -9.78 + 0.3 * 0, 0.7 * 5.87 + 0.3 * 10], 0.01)
  })

  it('is plain until there is a centre to speak of', () => {
    const t = new AdaptiveTuner('tonal')
    play(t, [C, G], [], 1)
    near(cents(t, [C, G]), [-1, 1], 0.1)
  })
})

describe('Adaptive tuning in a patch', () => {
  it('leaves patches saved before it in equal temperament', () => {
    const layer = { id: 'l', soundId: 's', settings: defaultSettings('s') }
    const old = { id: 'p', name: 'old', slots: [{ layer, level: 1, audible: true, track: true, transpose: 0, fine: 0, fixedNote: 60 }] }
    const [slot] = migratePatch(old as unknown as Patch).slots
    expect(slot?.tuning).toBe('et')
    expect(slot?.tuningDepth).toBe(1)
  })
})

describe('Adaptive tuning with the native engine', () => {
  // the same chords, the same results: native/tests/EngineTest.cpp replays this file through AdaptiveTuning.h
  const path = new URL('../../native/tests/adaptive-tuning-fixture.json', import.meta.url)
  const MODES: TuningMode[] = ['eased', 'strict', 'septimal', 'tonal']
  const EVENTS = 120

  function run() {
    let seed = 12345
    const next = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return (seed >> 8) % n
    }
    const events: { held: number[]; ringing: number[]; now: number }[] = []
    const ages = new Array<number>(12).fill(-1)
    const tails = new Array<number>(12).fill(-1)
    let now = 1
    for (let i = 0; i < EVENTS; i++) {
      const dt = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 6][next(8)]
      now += dt
      for (let pc = 0; pc < 12; pc++) {
        if (ages[pc] >= 0) ages[pc] += dt
        if (tails[pc] >= 0) tails[pc] = tails[pc] > 3 ? -1 : tails[pc] + dt
      }
      // lift some, strike one: triads and sevenths around a wandering root, with strays
      for (let pc = 0; pc < 12; pc++) {
        if (ages[pc] >= 0 && next(3) === 0) {
          tails[pc] = ages[pc]
          ages[pc] = -1
        }
      }
      const root = next(12)
      const shape = [[0, 4, 7], [0, 3, 7], [0, 4, 7, 10], [0, 3, 7, 10], [0, 4, 7, 11], [0, 2], [0, 3, 6], [0, 4, 8]][next(8)]
      const pc = (root + shape[next(shape.length)]) % 12
      ages[pc] = Math.max(ages[pc], 0)
      const short = (v: number) => Math.round(v * 1e4) / 1e4
      events.push({ held: ages.map(short), ringing: ages.map((a, k) => short(Math.max(a, tails[k]))), now: short(now) })
    }
    const tuners = MODES.map((m) => new AdaptiveTuner(m))
    return {
      events: events.map((e) => {
        const out: Record<string, number[]> = {}
        tuners.forEach((t, k) => {
          t.chord(e.held, e.ringing, e.now)
          out[MODES[k]] = [t.line, ...Array.from({ length: 12 }, (_, pc) => t.cents(pc))].map((v) => Math.round(v * 1e6) / 1e6)
        })
        return { ...e, out }
      }),
    }
  }

  it('matches its fixture', () => {
    const got = run()
    if (process.env.WRITE_TUNING_FIXTURE) writeFileSync(path, JSON.stringify(got))
    const want = JSON.parse(readFileSync(path, 'utf8')) as ReturnType<typeof run>
    expect(got.events.length).toBe(want.events.length)
    got.events.forEach((e, i) => {
      for (const m of MODES) e.out[m].forEach((v, k) => expect(v).toBeCloseTo(want.events[i].out[m][k], 6))
    })
  })
})
