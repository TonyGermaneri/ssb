/**
 * What the word model is asked for a singing sound model's words (ACE-Step), and what's kept of its answer (pure: the
 * worker and the tests share it). Given the few words someone typed -- or the garden's caption -- it writes four short
 * lines to sing about it (two worked examples show it how); the lines are cleaned and anything that isn't one (a
 * "(repeat)" note, a refusal, a heading) is dropped.
 */

export const LYRICS_SYSTEM =
  'You write short song lyrics. Given a scene, write four short lines a singer could sing about it, 4 to 7 words each, simple and vivid, one per line. No title, no labels, no quotes.'

const SHOTS: [string, string][] = [
  ['a rainy fishing harbour at night', 'lanterns swaying on the water\nthe gulls are calling home\nrain upon the rusted boats\nhold me till the morning'],
  ['dreamy synth pads, desert at noon', 'the sun is burning slow\nsand is singing in the wind\nfollow me across the dunes\nwhere the mirage glows'],
]

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
export function lyricsMessages(scene: string): ChatMessage[] {
  const m: ChatMessage[] = [{ role: 'system', content: LYRICS_SYSTEM }]
  for (const [a, b] of SHOTS) m.push({ role: 'user', content: `Scene: ${a}` }, { role: 'assistant', content: b })
  m.push({ role: 'user', content: `Scene: ${scene.trim()}` })
  return m
}

const SHOT_LINES = new Set(SHOTS.flatMap(([, b]) => b.split('\n')))

/** The lines to sing in a reply: 2-10 words each, no notes or labels, no talk about itself, none from the examples. */
export function parseLyrics(raw: string): string[] {
  const out: string[] = []
  for (const part of raw.split('\n')) {
    const l = part
      .replace(/^\s*(\d+[.)]|[-*•]|verse\s*\d*:|chorus:)\s*/i, '')
      .replace(/["“”]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!l || /[()[\]{}:]/.test(l)) continue
    if (/^(i don't|i do not|i can't|i cannot|sure|here (is|are)|as an ai|please)\b/i.test(l)) continue
    const n = l.split(' ').length
    if (n < 2 || n > 10 || !/[a-z]/i.test(l)) continue
    const low = l.toLowerCase().replace(/[.,!?;]+$/, '')
    if (SHOT_LINES.has(low) || out.some((x) => x.toLowerCase() === low)) continue
    out.push(low)
  }
  return out.slice(0, 4)
}

/** enough lines to sing (else the worker asks again) */
export const enoughLines = (l: string[]) => l.length >= 2

/** lines as a singing model takes them */
export const asVerse = (lines: string[]) => `[verse]\n${lines.join('\n')}`
