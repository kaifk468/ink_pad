/** Starred diagrams: a short list of diagram ids kept in this browser (not inside the saved diagrams, so nothing about the file format changes). */
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
