/**
 * Starred diagrams. On Google Drive a star is a tag on the Drive file (appProperties.starred = "1"), so it follows the person to
 * every device. On browser and device-folder storage it is a short list of diagram ids kept in this browser. Neither touches
 * the diagram file's contents.
 */
export const STARRED_KEY = 'inkpad.starredDiagrams'
export const MAX_STARRED = 500

/** Reads the saved list; anything that is not a list of text ids is ignored. */
export function parseStarred(raw: string | null): string[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    const ids = value.filter((id): id is string => typeof id === 'string' && id.length > 0)
    return [...new Set(ids)].slice(0, MAX_STARRED)
  } catch {
    return []
  }
}

/** Adds the id if it is not starred, removes it if it is. Returns a new list. */
export function toggleStarred(ids: readonly string[], id: string): string[] {
  if (ids.includes(id)) return ids.filter((entry) => entry !== id)
  return [...ids, id].slice(-MAX_STARRED)
}

/** When saving gives a diagram a new id (a device-folder file is renamed), the star follows it. */
export function moveStarred(ids: readonly string[], from: string, to: string): string[] {
  if (from === to || !ids.includes(from)) return [...ids]
  return [...new Set(ids.map((id) => (id === from ? to : id)))]
}

/**
 * Stars made in this browser before Drive kept them: which to put on Drive (diagram listed, not starred there yet) and which
 * to simply forget here (already starred on Drive). Ids of diagrams not in the list stay local.
 */
export function starsToUpload(localIds: readonly string[], documents: ReadonlyArray<{ id: string; starred?: boolean }>): { upload: string[]; drop: string[] } {
  const byId = new Map(documents.map((entry) => [entry.id, entry]))
  const upload: string[] = []
  const drop: string[] = []
  for (const id of localIds) {
    const entry = byId.get(id)
    if (!entry) continue
    if (entry.starred) drop.push(id)
    else upload.push(id)
  }
  return { upload, drop }
}

export function readStarred(storage?: Pick<Storage, 'getItem'>): string[] {
  try {
    return parseStarred((storage ?? window.localStorage).getItem(STARRED_KEY))
  } catch {
    return []
  }
}

export function writeStarred(ids: readonly string[], storage?: Pick<Storage, 'setItem' | 'removeItem'>): void {
  try {
    const target = storage ?? window.localStorage
    if (ids.length === 0) target.removeItem(STARRED_KEY)
    else target.setItem(STARRED_KEY, JSON.stringify(ids))
  } catch { /* a per-device convenience; failing to store it must never break the app */ }
}
