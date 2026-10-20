/**
 * BERT's uncased WordPiece tokenizer, as Hugging Face's tokenizers runs it for potion-base-8M (tokenizer.json:
 * BertNormalizer with lowercase (so accents stripped too), BertPreTokenizer, WordPiece with "##" continuations, no
 * special tokens). wordpiece.test.ts checks it against the Rust library's ids.
 */

const isChinese = (cp: number) =>
  (cp >= 0x4e00 && cp <= 0x9fff) ||
  (cp >= 0x3400 && cp <= 0x4dbf) ||
  (cp >= 0x20000 && cp <= 0x2a6df) ||
  (cp >= 0x2a700 && cp <= 0x2b73f) ||
  (cp >= 0x2b740 && cp <= 0x2b81f) ||
  (cp >= 0x2b820 && cp <= 0x2ceaf) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0x2f800 && cp <= 0x2fa1f)
const CONTROL = /[\p{Cc}\p{Cf}\p{Cn}\p{Co}\p{Cs}]/u
const SPACE = /[\t\n\r\p{Zs}]/u
const MARK = /\p{Mn}/u
const PUNCT = /\p{P}/u
const isPunct = (c: string, cp: number) =>
  (cp >= 33 && cp <= 47) || (cp >= 58 && cp <= 64) || (cp >= 91 && cp <= 96) || (cp >= 123 && cp <= 126) || PUNCT.test(c)

/** BertNormalizer: control characters out, whitespace to spaces, CJK spaced apart, accents stripped, lower case */
export function normalize(text: string): string {
  let out = ''
  for (const c of text) {
    const cp = c.codePointAt(0)!
    if (cp === 0 || cp === 0xfffd || (CONTROL.test(c) && c !== '\t' && c !== '\n' && c !== '\r')) continue
    if (SPACE.test(c)) out += ' '
    else if (isChinese(cp)) out += ` ${c} `
    else out += c
  }
  let bare = ''
  for (const c of out.normalize('NFD')) if (!MARK.test(c)) bare += c
  return bare.toLowerCase()
}

/** BertPreTokenizer: split on whitespace, every punctuation character a word of its own */
export function preTokenize(text: string): string[] {
  const words: string[] = []
  let cur = ''
  const flush = () => {
    if (cur) words.push(cur)
    cur = ''
  }
  for (const c of text) {
    if (/\s/u.test(c)) flush()
    else if (isPunct(c, c.codePointAt(0)!)) {
      flush()
      words.push(c)
    } else cur += c
  }
  flush()
  return words
}

export class WordPiece {
  readonly ids = new Map<string, number>()
  readonly unk: number
  constructor(
    vocab: readonly string[],
    private maxChars = 100,
  ) {
    vocab.forEach((tok, i) => this.ids.set(tok, i))
    this.unk = this.ids.get('[UNK]') ?? -1
  }

  /** a word's pieces, longest first; a word with a piece the vocabulary hasn't got is [UNK] as a whole */
  private word(w: string, out: number[]) {
    const chars = [...w]
    if (chars.length > this.maxChars) return out.push(this.unk)
    const pieces: number[] = []
    let start = 0
    while (start < chars.length) {
      let end = chars.length
      let id = -1
      while (start < end) {
        const sub = (start > 0 ? '##' : '') + chars.slice(start, end).join('')
        const hit = this.ids.get(sub)
        if (hit !== undefined) {
          id = hit
          break
        }
        end--
      }
      if (id < 0) return out.push(this.unk)
      pieces.push(id)
      start = end
    }
    out.push(...pieces)
  }

  /** token ids, no [CLS] / [SEP] */
  encode(text: string): number[] {
    const out: number[] = []
    for (const w of preTokenize(normalize(text))) this.word(w, out)
    return out
  }
}
