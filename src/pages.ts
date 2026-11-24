import type { CanvasItem } from './canvasModel'
import { pasteItems, type IdCounters } from './clipboard'
/** Rules for the pages of one diagram. A diagram always has at least one page; every page shares the diagram's size, template and colour. */
export const MAX_PAGES = 50

export const canAddPage = (count: number): boolean => count < MAX_PAGES

export function clampPageIndex(index: number, count: number): number {
  if (!Number.isFinite(index) || count <= 0) return 0
  return Math.max(0, Math.min(count - 1, Math.trunc(index)))
}

/** The pages with `page` inserted right after `index`. Unchanged at the page limit. */
export function insertPageAfter<T>(pages: readonly T[], index: number, page: T): T[] {
  if (!canAddPage(pages.length)) return pages.slice()
  const at = clampPageIndex(index, pages.length) + 1
  return [...pages.slice(0, at), page, ...pages.slice(at)]
}

/** The pages without the one at `index`, and the page to show afterwards (the one that took its place, or the new last one). The last remaining page is never removed. */
export function removePageAt<T>(pages: readonly T[], index: number): { pages: T[]; index: number } {
  if (pages.length <= 1) return { pages: pages.slice(), index: 0 }
  const at = clampPageIndex(index, pages.length)
  const next = [...pages.slice(0, at), ...pages.slice(at + 1)]
  return { pages: next, index: clampPageIndex(at, next.length) }
}

export const pageLabel = (index: number, count: number): string => `${index + 1} / ${count}`

/** The pages with `page` put at position `at` (so it ends up at that index). Unchanged at the page limit. */
export function insertPageAt<T>(pages: readonly T[], at: number, page: T): T[] {
  if (!canAddPage(pages.length)) return pages.slice()
  const position = Math.max(0, Math.min(pages.length, Math.trunc(at) || 0))
  return [...pages.slice(0, position), page, ...pages.slice(position)]
}

/** The pages with the one at `from` moved to index `to` (both clamped). Pages are moved whole, so a page keeps everything stored with it (drawing, undo history). A no-op returns an unchanged copy. */
export function movePage<T>(pages: readonly T[], from: number, to: number): T[] {
  const next = pages.slice()
  if (next.length < 2) return next
  const source = clampPageIndex(from, next.length)
  const target = clampPageIndex(to, next.length)
  if (source === target) return next
  const [page] = next.splice(source, 1)
  next.splice(target, 0, page)
  return next
}

/** Where the page that was at `current` is after `movePage(pages, from, to)`: the moved page follows itself, the pages it passed shift by one. */
export function indexAfterMove(current: number, from: number, to: number): number {
  if (current === from) return to
  if (from < to && current > from && current <= to) return current - 1
  if (from > to && current >= to && current < from) return current + 1
  return current
}

/** The page of each diagram you were last on, so reopening a diagram lands where you left it. A view detail, kept on this device only and never inside the diagram. */
export const LAST_PAGE_KEY = 'inkpad.lastPage'
const MAX_REMEMBERED = 200

export function parseLastPages(raw: string | null): Record<string, number> {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
    const result: Record<string, number> = {}
    for (const [id, page] of Object.entries(value)) if (typeof page === 'number' && Number.isInteger(page) && page > 0) result[id] = page
    return result
  } catch {
    return {}
  }
}

/** Remembers `index` for `id` (page 1 is the default, so it is forgotten instead), keeping at most 200 diagrams. */
export function withLastPage(map: Record<string, number>, id: string, index: number): Record<string, number> {
  const { [id]: _old, ...rest } = map
  if (!Number.isInteger(index) || index <= 0) return rest
  const next = { ...rest, [id]: index }
  const ids = Object.keys(next)
  for (const old of ids.slice(0, Math.max(0, ids.length - MAX_REMEMBERED))) delete next[old]
  return next
}

export function readLastPage(id: string): number {
  try { return parseLastPages(localStorage.getItem(LAST_PAGE_KEY))[id] ?? 0 } catch { return 0 }
}

export function writeLastPage(id: string, index: number): void {
  try {
    const current = parseLastPages(localStorage.getItem(LAST_PAGE_KEY))
    if ((current[id] ?? 0) === (index > 0 ? index : 0)) return
    localStorage.setItem(LAST_PAGE_KEY, JSON.stringify(withLastPage(current, id, index)))
  } catch { /* the page is only a convenience */ }
}

/** A workspace too large to clamp anything: a duplicated page keeps every coordinate exactly. */
const UNBOUNDED_WORKSPACE = { x: -1e9, y: -1e9, width: 2e9, height: 2e9 }

/**
 * The items of a duplicated page: every item cloned at the same position with fresh ids from the shared per-kind counters (ids are global across
 * pages), connectors re-attached to the copied boxes (never to the original page's boxes), groups renumbered, locks kept. Pure; `items` is not changed.
 * Returns the counters to continue from.
 */
export function duplicatePageItems(items: readonly CanvasItem[], counters: IdCounters): { items: CanvasItem[]; counters: IdCounters; skipped: number } {
  // Items of a kind this version does not know cannot be given new ids, so they are left out of the copy (never copied with their old ids).
  const known = items.filter((item) => item.kind !== 'opaque')
  const skipped = items.length - known.length
  const pasted = pasteItems(known, counters, 0, UNBOUNDED_WORKSPACE)
  if (!pasted) return { items: [], counters: { ...counters }, skipped }
  // Pasting never keeps a lock; a duplicate page does. Order is unchanged, so the items line up one to one.
  const copy = pasted.items.map((item, index): CanvasItem => {
    const source = known[index]
    return item.kind !== 'opaque' && source.locked === true ? ({ ...item, locked: true } as CanvasItem) : item
  })
  return { items: copy, counters: pasted.counters, skipped }
}
