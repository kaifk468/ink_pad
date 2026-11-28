/**
 * Where library search may read diagram contents from. Local copies only: this browser's own storage and Google Drive's
 * browser cache. A device folder has no browser copy, and reading it would need the file-system permission, so it is
 * never content-searched. Nothing here calls a StorageBackend load, a Drive request or a permission prompt.
 */
export type LocalSearchSources = {
  /** This browser's own diagram store (read-only). */
  browserDocument: (id: string) => Promise<unknown | null>
  /** Google Drive's browser cache (read-only; never the network). */
  driveCached: (id: string) => Promise<{ text: string } | null>
}

export async function loadLocalCopyForSearch(kind: 'browser' | 'device' | 'drive', id: string, sources: LocalSearchSources): Promise<unknown | null> {
  if (kind === 'browser') return sources.browserDocument(id)
  if (kind === 'drive') {
    const cached = await sources.driveCached(id)
    if (!cached || typeof cached.text !== 'string') return null
    try { return JSON.parse(cached.text) } catch { return null }
  }
  return null
}
