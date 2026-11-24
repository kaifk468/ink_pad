import { DESKTOP_SHORTCUTS, type ShortcutEntry } from './desktopShortcuts'

/** One line of the Desktop command palette (Ctrl/Cmd+K). `keys` is the shortcut shown on the right; `keywords` are extra search words. */
export type PaletteEntry = { id: string; label: string; group: string; keys?: string; keywords?: string }

/** Id of the palette row made from a DESKTOP_SHORTCUTS row. */
export function shortcutEntryId(row: ShortcutEntry): string {
  return `shortcut:${row.group}:${row.label}`
}

/** One entry for every shortcut row that is a keyboard command (rows with `input`), in table order. */
export function shortcutPaletteEntries(rows: readonly ShortcutEntry[] = DESKTOP_SHORTCUTS): PaletteEntry[] {
  return rows.filter((row) => row.input).map((row) => ({ id: shortcutEntryId(row), label: row.label, group: row.group, keys: row.keys }))
}

const WORD_START = /[\s\-_/+(),.:]/

/** How well one word matches an entry: lower is better, null = no match. */
function wordScore(word: string, label: string, keywords: string, group: string): number | null {
  if (label.startsWith(word)) return 0
  const at = label.indexOf(word)
  if (at > 0 && WORD_START.test(label[at - 1])) return 1
  for (const other of [keywords, group]) {
    const found = other.indexOf(word)
    if (found === 0 || (found > 0 && WORD_START.test(other[found - 1]))) return 2
  }
  if (at >= 0) return 3
  if (keywords.includes(word) || group.includes(word)) return 4
  return null
}

/**
 * The entries that match `query`: every word must match the label, keywords or group (case-insensitive).
 * Label prefix and word-start matches rank first; ties keep table order. An empty query returns all entries in table order.
 */
export function filterCommands<T extends PaletteEntry>(entries: readonly T[], query: string): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...entries]
  const ranked: Array<{ entry: T; score: number; order: number }> = []
  entries.forEach((entry, order) => {
    const label = entry.label.toLowerCase()
    const keywords = (entry.keywords ?? '').toLowerCase()
    const group = entry.group.toLowerCase()
    let score = 0
    for (const word of words) {
      const part = wordScore(word, label, keywords, group)
      if (part === null) return
      score += part
    }
    ranked.push({ entry, score, order })
  })
  ranked.sort((a, b) => a.score - b.score || a.order - b.order)
  return ranked.map((item) => item.entry)
}
