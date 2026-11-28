import { DEFAULT_DOCUMENT_TITLE, MAX_TITLE_LENGTH, cleanTitle, isLossyParse, type InkPadDocument } from './documentFormat'
import type { StorageBackend } from './storageBackend'

const COPY_SUFFIX = ' (copy)'

/** "Order flow" becomes "Order flow (copy)"; an empty title becomes "Untitled diagram (copy)". Long titles are shortened so the suffix always fits. */
export function copyTitle(title: string): string {
  const base = cleanTitle(title || DEFAULT_DOCUMENT_TITLE)
  return `${base.slice(0, MAX_TITLE_LENGTH - COPY_SUFFIX.length).trimEnd()}${COPY_SUFFIX}`
}

export const COPY_LOSSY_MESSAGE = 'This diagram has items or fields this version of InkPad cannot copy safely. Open it, make a change so it is saved again, or export it instead.'

/** The document to store for a copy: everything of the original (pages, page style, unknown items) with a new title and fresh created/edited times. Null when the original was only partly understood, because a copy would silently lose data. */
export function buildCopy(stored: InkPadDocument, now: string = new Date().toISOString()): InkPadDocument | null {
  if (isLossyParse(stored)) return null
  return { ...stored, title: copyTitle(stored.title), createdAt: now, updatedAt: now }
}

/**
 * Copies a stored diagram inside the same folder as a new document. The original is only read, never written. `folderId` is where the
 * original lives. Throws an Error with a message fit for the person when the diagram is missing or cannot be copied without loss.
 * Returns the new diagram's id and its real title: a device folder numbers a clash ("X (copy) (2)"), so the stored copy is read back for
 * its title (falling back to the requested one if that read fails). The caller is responsible for running this inside the save chain.
 */
export async function copyStoredDiagram(backend: StorageBackend, id: string, folderId: string | null): Promise<{ id: string; title: string }> {
  const stored = await (backend.loadFresh ? backend.loadFresh(id) : backend.load(id))
  if (!stored) throw new Error('That diagram no longer exists.')
  const copy = buildCopy(stored)
  if (!copy) throw new Error(COPY_LOSSY_MESSAGE)
  const newId = await backend.save(null, copy, folderId)
  let title = copy.title
  try {
    const stored = await backend.load(newId)
    if (stored?.title) title = stored.title
  } catch { /* the copy is saved; the toast falls back to the title that was asked for */ }
  return { id: newId, title }
}
