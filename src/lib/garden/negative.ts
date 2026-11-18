/**
 * The garden's AVOID words (its negative prompt), per clip: terms the clip's own caption asks for are let go for it --
 * a garden steered off "speech, vocals" still sings when its words ask for monks chanting. (By word, not by meaning.)
 */

export const CLASHES: { asks: RegExp; drops: RegExp }[] = [
  // a voice wanted, words or not: "speech" in the negative takes the human out of it as surely as "vocals"
  { asks: /\b(sing|sang|sung|singer|singing|vocal|vocals|voice|voices|choir|choral|chorus|chant|chanting|hum|humming|croon|opera|operatic|aria|hymn|gospel|rap|rapping|yodel|lullaby|falsetto|soprano|alto|tenor|baritone|acapella|a cappella|scat|beatbox|whisper|whispering|breathy|moan|sigh|wail|wailing|monks|mermaids|sirens sing|angels)/i, drops: /\b(vocals?|voices?|singing|choir|speech|talking|spoken|humans?)\b/i },
  { asks: /\b(speech|speak|speaking|spoken|talk|talking|words|narrat\w*|whisper\w*|poem|poetry|radio host|announcer)/i, drops: /\b(speech|talking|spoken|voices?)\b/i },
  { asks: /\b(drums?|drumming|beats?|percussion|808|909|breakbeat|kick|snare|hi-?hats?)/i, drops: /\b(drums?|percussion|beats?)\b/i },
  { asks: /\b(noise|noisy|static|hiss|distort\w*|fuzz|glitch\w*|bitcrush\w*|clipping|harsh)/i, drops: /\b(noise|noisy|distortion|clipping|low quality)\b/i },
]

/** the negative-prompt terms a caption overrides (CLASHES) */
function clashing(terms: string[], text: string): string[] {
  const rules = CLASHES.filter((c) => c.asks.test(text))
  return terms.filter((x) => rules.some((c) => c.drops.test(x)))
}

/**
 * The negative prompt to generate `caption` with: the AVOID words without the terms the caption itself asks for (a
 * garden whose words come to "monks chanting" isn't steered off voices for that clip; AVOID stays as set).
 */
export function negativeFor(negative: string, caption: string): string {
  const terms = negative.split(',').map((x) => x.trim()).filter(Boolean)
  const drop = clashing(terms, caption)
  return terms.filter((x) => !drop.includes(x)).join(', ')
}
