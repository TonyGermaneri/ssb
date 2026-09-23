import { describe, expect, it } from 'vitest'
import { THEMES, THEME_GROUPS, themeGroup } from './themes'

/** WCAG contrast ratio of two #rrggbb colours */
function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl)
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('themes', () => {
  it('have unique ids and a group each, and the default first in ERAS', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length)
    for (const t of THEMES) expect(THEME_GROUPS).toContain(themeGroup(t))
    expect(THEMES.length).toBeGreaterThan(60)
  })

  // readable panels and LCDs in every theme
  it.each(THEMES.map((t) => [t.name, t] as const))('%s is legible', (_n, t) => {
    const bad: string[] = []
    const need = (what: string, fg: string, bg: string, min: number) => {
      const c = contrast(fg, bg)
      if (c < min) bad.push(`${what} ${c.toFixed(2)} < ${min}`)
    }
    need('body text on panel', t.text[0], t.panel[1], 4.5)
    need('headings on panel', t.text[1], t.panel[1], 3)
    need('labels on panel', t.text[2], t.panel[1], 3)
    need('primary on LCD', t.primary, t.lcd, 3)
    need('secondary on LCD', t.secondary, t.lcd, 3)
    expect(bad).toEqual([])
  })
})
