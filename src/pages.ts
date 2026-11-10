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
