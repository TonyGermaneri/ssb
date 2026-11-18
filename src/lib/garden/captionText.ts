/**
 * What the word model is asked when a VCO's prompt is sent with its automation button (Rack.vue): the few words someone
 * typed, written out as the caption a sound model is briefed with -- what's heard, its instruments or sources, its
 * character -- and what's kept of the answer (pure: the worker and the tests share it).
 */
import type { ChatMessage } from './lyricsText'

export const CAPTION_SYSTEM =
  'You brief a text-to-audio model. Given a few words, write one caption for the sound to make: what is heard, its instruments or sources, texture and mood, 8 to 20 words, comma separated, no sentences about yourself.'

const SHOTS: [string, string][] = [
  ['rainy harbour', 'rain on wooden docks, distant foghorn, creaking ropes, soft waves, calm night ambience'],
  ['dreamy desert synth', 'warm analog synth pad, slow shimmering arpeggio, wide reverb, hazy and dreamy, desert heat'],
]

export function captionMessages(words: string): ChatMessage[] {
  const m: ChatMessage[] = [{ role: 'system', content: CAPTION_SYSTEM }]
  for (const [a, b] of SHOTS) m.push({ role: 'user', content: a }, { role: 'assistant', content: b })
  m.push({ role: 'user', content: words.trim() })
  return m
}

const SHOT_CAPTIONS = new Set(SHOTS.map(([, b]) => b))

/**
 * The caption in a reply: its first line that reads as one (a label, quotes and a trailing stop let go; each part once,
 * eight at most), 3-30 words,
 * not a refusal, not an example's; '' when there's none. `cut`: the reply ran out of tokens, so its last part goes.
 */
export function parseCaption(raw: string, cut = false): string {
  for (const part of raw.split('\n')) {
    let l: string = part
      .replace(/^\s*(caption|prompt|sound)\s*:\s*/i, '')
      .replace(/["“”*]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.;:]+$/, '')
    if (!l) continue
    if (/^(i'm|i am|i don't|i do not|i can't|i cannot|sure|here('s| is| are)|as an ai|please|sorry)\b/i.test(l)) return ''
    // its parts once each (a small model loops: "mournful, mournful, …"), none saying what's not there, eight at most
    const parts = l.split(',').map((x) => x.trim()).filter(Boolean)
    if (cut && parts.length > 1) parts.pop()
    const kept: string[] = []
    for (const x of parts) if (!/^no\b/i.test(x) && !kept.some((k) => k.toLowerCase() === x.toLowerCase())) kept.push(x)
    l = kept.slice(0, 8).join(', ')
    const n = l.split(' ').length
    if (n < 3 || n > 30 || !/[a-z]/i.test(l)) continue
    const low = l.toLowerCase()
    if (SHOT_CAPTIONS.has(low)) continue
    return low
  }
  return ''
}
