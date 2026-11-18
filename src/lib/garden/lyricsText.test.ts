import { describe, expect, it } from 'vitest'
import { asVerse, enoughLines, lyricsMessages, LYRICS_SYSTEM, parseLyrics } from './lyricsText'

describe('lyrics from the word model', () => {
  it('asks with two worked examples, then the scene', () => {
    const m = lyricsMessages(' misty trolls ')
    expect(m[0]).toEqual({ role: 'system', content: LYRICS_SYSTEM })
    expect(m.map((x) => x.role)).toEqual(['system', 'user', 'assistant', 'user', 'assistant', 'user'])
    expect(m.at(-1)!.content).toBe('Scene: misty trolls')
  })
  it('keeps the lines to sing: no notes, refusals, repeats, examples or long rambles', () => {
    const raw = 'In the shadow of the old trees\n(Repeat 4 to 7 times)\nthe gulls are calling home\n- follow me deep into the mine\nfollow me deep into the mine.\nVerse 2: where the trolls are singing\nthis line goes on and on for far too many words to sing well'
    expect(parseLyrics(raw)).toEqual(['in the shadow of the old trees', 'follow me deep into the mine', 'where the trolls are singing'])
    expect(parseLyrics("I don't have a singer assigned to me yet.")).toEqual([])
  })
  it('wants two lines, and puts them in a verse', () => {
    expect(enoughLines(['a b'])).toBe(false)
    expect(enoughLines(['a b', 'c d'])).toBe(true)
    expect(asVerse(['a b', 'c d'])).toBe('[verse]\na b\nc d')
  })
})
