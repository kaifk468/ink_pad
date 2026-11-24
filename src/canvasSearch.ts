import { canvasItemKey, type CanvasItem } from './canvasModel'

export type SearchMatchKind = 'text' | 'connector' | 'classBox' | 'code'
export type SearchMatch = { pageIndex: number; key: string; kind: SearchMatchKind; snippet: string }

const SNIPPET_LENGTH = 60

/** A one-line excerpt of `text` around the match at `at`. */
function snippetAround(text: string, at: number, length: number): string {
  const flat = text.replace(/\s+/g, ' ')
  const flatAt = text.slice(0, at).replace(/\s+/g, ' ').length
  const start = Math.max(0, Math.min(flatAt - 15, flat.length - SNIPPET_LENGTH))
  const end = Math.min(flat.length, Math.max(start + SNIPPET_LENGTH, flatAt + length))
  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`
}

function searchableText(item: CanvasItem): { kind: SearchMatchKind; text: string } | null {
  switch (item.kind) {
    case 'text': return { kind: 'text', text: item.text }
    case 'connector': return item.label ? { kind: 'connector', text: item.label } : null
    case 'code': return { kind: 'code', text: item.text }
    case 'rectangle': return item.classBox ? { kind: 'classBox', text: [item.classBox.name, item.classBox.attributes, item.classBox.methods].join('\n') } : null
    default: return null
  }
}

/**
 * Case-insensitive search of all pages (page order, then item order): text items, connector labels, class box name/attributes/methods and code blocks.
 * One match per item. The query is trimmed; an empty query finds nothing. Opaque and other items are skipped. Locked items are found too.
 */
export function searchCanvas(pages: readonly (readonly CanvasItem[])[], query: string): SearchMatch[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const matches: SearchMatch[] = []
  pages.forEach((items, pageIndex) => {
    for (const item of items) {
      const found = searchableText(item)
      if (!found) continue
      const at = found.text.toLowerCase().indexOf(needle)
      if (at < 0) continue
      matches.push({ pageIndex, key: canvasItemKey(item), kind: found.kind, snippet: snippetAround(found.text, at, needle.length) })
    }
  })
  return matches
}
