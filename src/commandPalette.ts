import { DESKTOP_SHORTCUTS, type ShortcutEntry } from './desktopShortcuts'
import { searchTechLogos, type TechLogo } from './techLogoSearch'

/** One line of the Desktop command palette (Ctrl/Cmd+K). `keys` is the shortcut shown on the right; `keywords` are extra search words; `hint` is extra text shown beside the group (a diagram's folder). */
export type PaletteEntry = { id: string; label: string; group: string; keys?: string; keywords?: string; hint?: string }

export const DIAGRAM_ENTRY_PREFIX = 'diagram:'
/** At most this many "Open: ..." rows (the most recently edited), so a huge library cannot make the palette slow. */
export const MAX_DIAGRAM_ENTRIES = 200

type LibraryDiagram = { id: string; title: string; updatedAt: string; folderId: string | null }
type LibraryFolder = { id: string; name: string; parentId: string | null }

/** Id of the diagram a palette row opens, or null for any other row. */
export function diagramIdFromEntry(entryId: string): string | null {
  return entryId.startsWith(DIAGRAM_ENTRY_PREFIX) ? entryId.slice(DIAGRAM_ENTRY_PREFIX.length) : null
}

function folderPath(folderId: string | null, folders: readonly LibraryFolder[]): string {
  const names: string[] = []
  const seen = new Set<string>()
  let id = folderId
  while (id !== null && !seen.has(id)) {
    seen.add(id)
    const folder = folders.find((candidate) => candidate.id === id)
    if (!folder) break
    names.unshift(folder.name)
    id = folder.parentId
  }
  return names.join(' / ')
}

/**
 * "Open: <title>" rows for the Library's diagrams except the open one, most recently edited first. The folder path is the hint and a search word.
 * Put these after the command rows: equal scores keep list order, so commands stay above diagrams.
 */
export function diagramPaletteEntries(library: readonly LibraryDiagram[], folders: readonly LibraryFolder[], currentId: string | null): PaletteEntry[] {
  return library
    .filter((diagram) => diagram.id !== currentId)
    .map((diagram, index) => ({ diagram, index }))
    .sort((a, b) => (b.diagram.updatedAt > a.diagram.updatedAt ? 1 : b.diagram.updatedAt < a.diagram.updatedAt ? -1 : a.index - b.index))
    .slice(0, MAX_DIAGRAM_ENTRIES)
    .map(({ diagram }) => {
      const folder = folderPath(diagram.folderId, folders)
      return { id: `${DIAGRAM_ENTRY_PREFIX}${diagram.id}`, label: `Open: ${diagram.title}`, group: 'Diagrams', keywords: `open switch diagram ${folder}`.trim(), ...(folder ? { hint: folder } : {}) }
    })
}

/** Id of the palette row made from a DESKTOP_SHORTCUTS row. */
export function shortcutEntryId(row: ShortcutEntry): string {
  return `shortcut:${row.group}:${row.label}`
}

/** One entry for every shortcut row that is a keyboard command (rows with `input`), in table order. */
export function shortcutPaletteEntries(rows: readonly ShortcutEntry[] = DESKTOP_SHORTCUTS): PaletteEntry[] {
  return rows.filter((row) => row.input).map((row) => ({ id: shortcutEntryId(row), label: row.label, group: row.group, keys: row.keys }))
}

/**
 * Splits a long label at its first " (" so the parenthetical becomes a second line: "Laser pointer (a red trail)" -> title "Laser pointer", detail "a red trail".
 * Text after the matching ")" stays in the title; an unbalanced "(" keeps everything after it as the detail. No " (" means no detail.
 */
export function splitCommandLabel(label: string): { title: string; detail: string } {
  const at = label.indexOf(' (')
  if (at < 0) return { title: label, detail: '' }
  const open = at + 1
  let depth = 0
  let close = -1
  for (let i = open; i < label.length; i++) {
    if (label[i] === '(') depth++
    else if (label[i] === ')' && --depth === 0) { close = i; break }
  }
  if (close < 0) return { title: label.slice(0, at).trim(), detail: label.slice(open + 1).trim() }
  const title = `${label.slice(0, at)}${label.slice(close + 1)}`.replace(/\s+/g, ' ').trim()
  return { title, detail: label.slice(open + 1, close).trim() }
}

/** Entries bucketed by group (groups in order of first appearance, rows keep their order), for the grouped empty-query view. */
export function groupPaletteEntries<T extends PaletteEntry>(entries: readonly T[]): Array<{ group: string; entries: T[] }> {
  const groups: Array<{ group: string; entries: T[] }> = []
  for (const entry of entries) {
    let bucket = groups.find((candidate) => candidate.group === entry.group)
    if (!bucket) { bucket = { group: entry.group, entries: [] }; groups.push(bucket) }
    bucket.entries.push(entry)
  }
  return groups
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
  // Equal scores keep list order, and diagram rows come last in the list, so a command is never pushed below a diagram of the same score.
  ranked.sort((a, b) => a.score - b.score || a.order - b.order)
  return ranked.map((item) => item.entry)
}

export const LOGO_ENTRY_PREFIX = 'logo-item:'
/** At most this many "Logo: ..." rows, and none until the query has this many characters. */
export const MAX_LOGO_ENTRIES = 8
export const MIN_LOGO_QUERY = 2

/** Slug of the logo a palette row inserts, or null for any other row. */
export function logoSlugFromEntry(entryId: string): string | null {
  return entryId.startsWith(LOGO_ENTRY_PREFIX) ? entryId.slice(LOGO_ENTRY_PREFIX.length) : null
}

/**
 * "Logo: <Brand>" rows for a query of at least 2 characters, ranked by the logo search and capped at 8 (none while `logos` is not loaded yet).
 * They are appended after the command matches, so a command never drops below a logo.
 */
export function logoPaletteEntries(query: string, logos: readonly TechLogo[] | null): PaletteEntry[] {
  // "logo kafka" and the row's own label "Logo: Apache Kafka" search for the brand, not for the word "logo".
  const text = query.trim().replace(/^logos?\b:?\s*/i, '')
  if (!logos || text.length < MIN_LOGO_QUERY) return []
  return searchTechLogos(text, logos, MAX_LOGO_ENTRIES).map((logo) => ({ id: `${LOGO_ENTRY_PREFIX}${logo.slug}`, label: `Logo: ${logo.title}`, group: 'Logos' }))
}

/** The Edit palette rows "Larger text" / "Smaller text" duplicate the "Bigger text" / "Smaller text" commands; this keeps the commands only (the shortcut table and help still list them). */
export function withoutDuplicateTextSizeEntries<T extends PaletteEntry>(entries: readonly T[]): T[] {
  return entries.filter((entry) => !/^(Larger|Smaller) text \(/.test(entry.label))
}

/** The key hint of the "Larger text" / "Smaller text" shortcut rows, shown on the single Bigger / Smaller text commands. */
export function textSizeShortcutKeys(word: 'Larger' | 'Smaller', rows: readonly ShortcutEntry[] = DESKTOP_SHORTCUTS): string | undefined {
  return rows.find((row) => row.label.startsWith(`${word} text (`))?.keys
}
