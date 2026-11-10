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
