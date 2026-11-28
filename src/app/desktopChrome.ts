import type { SaveStatus } from '../FilePanel'

/** Desktop pill tone: 'idle' is a neutral dot (nothing to save yet), the rest match the existing tones. */
export type StatusTone = 'ok' | 'bad' | 'pending' | 'idle'

/**
 * Save-status wording for the desktop pill. 'idle' means "never saved in this document": with content on the page and the autosave
 * timer actually pending it reads "Saving soon"; with content but no timer it keeps the shared "Not saved yet"; with an empty page it reads "Autosave on".
 * Every other status keeps the shared wording (`base`), and tablet always keeps it.
 */
export function desktopStatusText(status: SaveStatus, base: string, hasContent: boolean, desktop: boolean, autosavePending = false): string {
  if (!desktop || status !== 'idle') return base
  if (!hasContent) return 'Autosave on'
  return autosavePending ? 'Saving soon' : base
}

export function desktopStatusTone(status: SaveStatus, hasContent: boolean): StatusTone {
  if (status === 'saved') return 'ok'
  if (status === 'error' || status === 'locked') return 'bad'
  if (status === 'idle' && !hasContent) return 'idle'
  return 'pending'
}

/** Desktop page chip: "1 / 3" on one line; screen readers and the tooltip get "Page 1 of 3". */
export const desktopPageAria = (index: number, count: number, name?: string): string => `Page ${index + 1} of ${count}${name ? ` · ${name}` : ''}`

/** The empty toast keeps its padding while it fades out; on desktop it must not show as a blank pill. */
export const hideEmptyToast = (text: string | undefined, desktop: boolean): boolean => desktop && !text

/** The connector button under the account button opens the UML connector tools (not in the dock), so it stays, with a tooltip. */
export const UML_RESTORE_TIP = 'UML connector tools'
