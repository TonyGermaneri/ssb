import { describe, expect, it } from 'vitest'
import { MAX_WORDS, promptWords, WordField } from './words'

describe('the garden\'s words on the shader stage', () => {
  it('takes a prompt\'s words, leaving out the glue words and commas', () => {
    expect(promptWords('warm glass bells in a cathedral, ambient, seamless loop')).toEqual(['warm', 'glass', 'bells', 'cathedral', 'ambient', 'seamless', 'loop'])
    expect(promptWords('')).toEqual([])
  })

  it('brings a new prompt\'s words in one after another, sends the old ones out, and forgets them once faded', () => {
    const f = new WordField()
    f.setPrompt(0, 'warm glass bells')
    expect(f.words.map((w) => w.text)).toEqual(['warm', 'glass', 'bells'])
    for (let i = 0; i < 3; i++) f.step(0.1, i * 0.1, () => 0)
    const [a, , c] = f.words
    expect(a.alpha).toBeGreaterThan(c.alpha) // staggered
    for (let i = 0; i < 40; i++) f.step(0.1, i * 0.1, () => 0)
    expect(f.words.every((w) => w.alpha === 1)).toBe(true)
    f.setPrompt(0, 'icy wire')
    f.step(0.5, 5, () => 0)
    expect(f.words.filter((w) => w.gone >= 0)).toHaveLength(3)
    for (let i = 0; i < 30; i++) f.step(0.1, 6 + i * 0.1, () => 0)
    expect(f.words.map((w) => w.text)).toEqual(['icy', 'wire'])
  })

  it('keeps every word inside its column however loud, and never more than MAX_WORDS', () => {
    const f = new WordField()
    for (let s = 0; s < 3; s++) f.setPrompt(s, Array.from({ length: 20 }, (_, i) => `w${s}${i}`).join(' '))
    expect(f.words.length).toBeLessThanOrEqual(MAX_WORDS)
    for (let i = 0; i < 600; i++) f.step(1 / 60, i / 60, () => 1)
    for (const w of f.words) {
      expect(w.x).toBeGreaterThan(-0.05)
      expect(w.x).toBeLessThan(1.05)
      expect(w.y).toBeGreaterThan(-0.05)
      expect(w.y).toBeLessThan(1.05)
    }
  })
})
