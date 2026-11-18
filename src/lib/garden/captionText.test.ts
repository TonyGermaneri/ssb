import { describe, expect, it } from 'vitest'
import { captionMessages, parseCaption } from './captionText'

describe('the caption the word model writes from a few words', () => {
  it('asks with two examples, then the words', () => {
    const m = captionMessages('  moria drums ')
    expect(m[0]!.role).toBe('system')
    expect(m.length).toBe(6)
    expect(m.at(-1)).toEqual({ role: 'user', content: 'moria drums' })
  })
  it('keeps the first line that reads as a caption', () => {
    expect(parseCaption('Caption: "Deep war drums, echoing stone halls, low male choir."')).toBe('deep war drums, echoing stone halls, low male choir')
    expect(parseCaption('\n\nok\nslow cello drone, dusty room tone, warm')).toBe('slow cello drone, dusty room tone, warm')
  })
  it('lets go of refusals and the examples', () => {
    expect(parseCaption("I'm sorry, I can't help with that")).toBe('')
    expect(parseCaption("Sure! here's one")).toBe('')
    expect(parseCaption('rain on wooden docks, distant foghorn, creaking ropes, soft waves, calm night ambience')).toBe('')
  })
  it('each part once, eight at most, none saying what is not there', () => {
    expect(parseCaption('sighing violin, wet rain, mournful, mournful, melancholy, Mournful, melancholy')).toBe('sighing violin, wet rain, mournful, melancholy')
    expect(parseCaption('a, b c, d, e, f, g, h, i, j, k')).toBe('a, b c, d, e, f, g, h, i')
    expect(parseCaption('lofi beat, soft vinyl crackle, no words, no meter')).toBe('lofi beat, soft vinyl crackle')
  })
  it('a reply cut off loses its last part', () => {
    expect(parseCaption('bright marimba, wooden mallets, playful bounce, sunny afterno', true)).toBe('bright marimba, wooden mallets, playful bounce')
  })
})
