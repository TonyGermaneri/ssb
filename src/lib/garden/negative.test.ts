import { describe, expect, it } from 'vitest'
import { negativeFor } from './negative'

describe('the avoid words, per clip', () => {
  it('lets go of the terms a caption asks for', () => {
    const neg = 'speech, vocals, low quality, clipping'
    expect(negativeFor(neg, 'monks chanting in a cave, ambient')).toBe('low quality, clipping')
    expect(negativeFor(neg, 'breathy female voice humming, dreamy')).toBe('low quality, clipping')
    expect(negativeFor(neg, 'rusty gears grinding in a factory')).toBe(neg)
  })
})
