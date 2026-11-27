/** Search in the Desktop navigation sheet. Pure, so the matching rules are testable without the UI. */
export type MenuSearchEntry = {
  id: string
  label: string
  /** Extra words that find the row (not shown), e.g. "download png svg" for Export and import. */
  keywords?: string
  /** True for rows that do something when activated (Enter in the search box runs the first one). Segmented settings are not actionable. */
  actionable: boolean
  /** A disabled row is shown but never run by Enter. */
  disabled?: boolean
  /** A destructive row (Clear canvas). Enter in the search box never runs it. */
  danger?: boolean
}

/** Lower-case query split into words. An empty or blank query gives no words. */
export function queryWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

/** A row matches when every word of the query is a case-insensitive substring of its label or keywords. An empty query matches all. */
export function matchesMenuQuery(entry: Pick<MenuSearchEntry, 'label' | 'keywords'>, query: string): boolean {
  const words = queryWords(query)
  if (words.length === 0) return true
  const haystack = `${entry.label} ${entry.keywords ?? ''}`.toLowerCase()
  return words.every((word) => haystack.includes(word))
}

export function filterMenuEntries<T extends Pick<MenuSearchEntry, 'label' | 'keywords'>>(entries: readonly T[], query: string): T[] {
  return entries.filter((entry) => matchesMenuQuery(entry, query))
}

/** The row Enter runs: the first visible one that is actionable, enabled and not dangerous, or null. Danger rows need a deliberate click. */
export function firstActionableEntry<T extends MenuSearchEntry>(entries: readonly T[], query: string): T | null {
  return filterMenuEntries(entries, query).find((entry) => entry.actionable && !entry.disabled && !entry.danger) ?? null
}
