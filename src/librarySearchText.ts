/**
 * Library search inside diagram contents. Pure and read-only: it turns an already loaded document into plain search text,
 * matches typed words against it, and keeps a small in-memory cache keyed by id + updatedAt. It never loads anything by
 * itself (the caller passes a loader that may only read local copies) and never writes to a stored document.
 */

/** Longest search text kept per diagram, so one huge diagram cannot make typing slow or use much memory. */
export const MAX_SEARCH_TEXT = 200_000
const SNIPPET_RADIUS = 36

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const str = (value: unknown): string => (typeof value === 'string' ? value : '')

function itemTexts(item: unknown, out: string[]): void {
  if (!isRecord(item)) return
  switch (item.kind) {
    case 'rectangle': {
      const box = item.classBox
      if (isRecord(box)) out.push(str(box.name), str(box.attributes), str(box.methods))
      break
    }
    case 'text':
    case 'code':
      out.push(str(item.text))
      break
    case 'connector':
      out.push(str(item.label), str(item.startLabel), str(item.endLabel))
      break
    default:
      break // strokes, opaque (unknown) kinds and anything else: no text
  }
}

/**
 * All the words a diagram holds, one fragment per line: title, page names, then the text of every item on every page
 * (labels, text items, sticky notes, class box name and members, connector labels and end labels, boundary titles, code).
 * Never throws; a malformed document gives whatever text could be read (possibly an empty string).
 */
export function documentSearchText(doc: unknown): string {
  const out: string[] = []
  try {
    if (!isRecord(doc)) return ''
    out.push(str(doc.title))
    if (Array.isArray(doc.pageNames)) for (const name of doc.pageNames) out.push(str(name))
    const pages: unknown[] = [doc.items]
    if (Array.isArray(doc.pages)) for (const page of doc.pages) pages.push(isRecord(page) ? page.items : undefined)
    for (const items of pages) if (Array.isArray(items)) for (const item of items) itemTexts(item, out)
  } catch {
    // keep what was read so far
  }
  return out.map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, MAX_SEARCH_TEXT)
}

export function searchWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

/**
 * A short snippet around the first match when every word of the query appears somewhere in the text (case-insensitive),
 * otherwise null. The snippet is ellipsized with "…" on a side where text was cut, e.g. "…the Kafka consumer reads…".
 */
export function matchContent(text: string, query: string): string | null {
  const words = searchWords(typeof query === 'string' ? query : '')
  if (words.length === 0 || typeof text !== 'string' || !text) return null
  const lower = text.toLowerCase()
  let first = -1
  let length = 0
  for (const word of words) {
    const at = lower.indexOf(word)
    if (at < 0) return null
    if (first < 0 || at < first) { first = at; length = word.length }
  }
  // The snippet comes from one line (one item's text), never across two unrelated items.
  const lineStart = lower.lastIndexOf('\n', first) + 1
  const lineEndAt = lower.indexOf('\n', first)
  const lineEnd = lineEndAt < 0 ? text.length : lineEndAt
  const from = Math.max(lineStart, first - SNIPPET_RADIUS)
  const to = Math.min(lineEnd, first + length + SNIPPET_RADIUS)
  const body = text.slice(from, to).trim()
  return `${from > lineStart ? '…' : ''}${body}${to < lineEnd ? '…' : ''}`
}

export type SearchTextIndex = {
  /** Search text of a diagram: from memory when id + updatedAt are unchanged, otherwise built from the loader's copy. null = no readable local copy. */
  textFor(entry: { id: string; updatedAt: string }): Promise<string | null>
  clear(): void
}

/** `load` must only read local copies (browser storage, Drive's browser cache); it returns null when there is none. Failures count as "no copy". */
export function createSearchTextIndex(load: (id: string) => Promise<unknown | null>, maxEntries = 500): SearchTextIndex {
  const cache = new Map<string, string>()
  return {
    async textFor(entry) {
      const key = `${entry.id}\u0000${entry.updatedAt}`
      const hit = cache.get(key)
      if (hit !== undefined) return hit
      let doc: unknown = null
      try { doc = await load(entry.id) } catch { return null }
      if (doc === null || doc === undefined) return null
      const text = documentSearchText(doc)
      for (const stale of [...cache.keys()]) if (stale.startsWith(`${entry.id}\u0000`)) cache.delete(stale)
      if (cache.size >= maxEntries) cache.delete(cache.keys().next().value as string)
      cache.set(key, text)
      return text
    },
    clear: () => cache.clear(),
  }
}
