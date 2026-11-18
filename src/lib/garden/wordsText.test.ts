import { describe, expect, it } from 'vitest'
import { enoughWords, parseWords, wordMessages, WORDS_SYSTEM } from './wordsText'

describe('word lists for the rings', () => {
  it('asks with two worked examples, then the scene', () => {
    const m = wordMessages('  in the depths of moria ', 'noun')
    expect(m[0]).toEqual({ role: 'system', content: WORDS_SYSTEM })
    expect(m.map((x) => x.role)).toEqual(['system', 'user', 'assistant', 'user', 'assistant', 'user'])
    expect(m.at(-1)!.content).toBe('Scene: in the depths of moria\nList 8 things, creatures and characters from that scene or story.')
  })

  it('cleans a reply: numbering, quotes, repeats, example words and long phrases go', () => {
    expect(parseWords('1. Goblins, "drums", goblins, gulls, a very long phrase that runs on, Balrog.', 'noun')).toEqual(['goblins', 'drums', 'balrog'])
    expect(parseWords('dwarves\nmithril\n- elves', 'noun')).toEqual(['dwarves', 'mithril', 'elves'])
    // cut off at its last token: the half word goes
    expect(parseWords('fog, mist, elves, mages, moat, mith', 'noun', true)).toEqual(['fog', 'mist', 'elves', 'mages', 'moat'])
    expect(parseWords('fog, m, ox', 'noun')).toEqual(['fog'])
  })

  it('gives a place a preposition, and keeps a verb ring to -ing words', () => {
    expect(parseWords('in a mithril mine, the black gate, under the mountain', 'place')).toEqual(['in a mithril mine', 'in the black gate', 'under the mountain'])
    expect(parseWords('echoing, drums, hammering, dripping water', 'verb')).toEqual(['echoing', 'hammering', 'dripping water'])
  })

  it('wants at least five words', () => {
    expect(enoughWords(['a', 'b', 'c', 'd'])).toBe(false)
    expect(enoughWords(['a', 'b', 'c', 'd', 'e'])).toBe(true)
  })
})
