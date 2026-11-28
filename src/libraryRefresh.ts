/** The library list fetched within this long ago is reused (opening the command palette must not hit Google Drive every time). */
export const LIBRARY_FRESH_MS = 30_000

/** True when the library list should be fetched again: never fetched, fetched more than 30 s ago, or the clock went backwards. */
export function shouldRefreshLibrary(lastAt: number | null, now: number): boolean {
  return lastAt === null || now < lastAt || now - lastAt >= LIBRARY_FRESH_MS
}
