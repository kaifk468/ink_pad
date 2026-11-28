import type { DocumentSummary, FolderRecord } from './documentStore'
import { canMoveFolder } from './folderTree'

export type DropDecision = { ok: true; folderId: string | null } | { ok: false; reason: 'missing-diagram' | 'missing-folder' | 'same-folder' }

/** The folder a diagram really lives in: a folder id the Library no longer knows counts as the top level. */
function effectiveFolder(entry: DocumentSummary, folders: FolderRecord[]): string | null {
  return entry.folderId && folders.some((folder) => folder.id === entry.folderId) ? entry.folderId : null
}

/**
 * Decides whether dropping a dragged diagram on a folder (or on the top-level entry, `targetFolderId` null) should move it.
 * Dropping on the folder it is already in does nothing; a diagram or folder that is gone is refused.
 */
export function decideDrop(library: DocumentSummary[], folders: FolderRecord[], diagramId: string | null, targetFolderId: string | null): DropDecision {
  const entry = diagramId === null ? undefined : library.find((item) => item.id === diagramId)
  if (!entry) return { ok: false, reason: 'missing-diagram' }
  if (targetFolderId !== null && !folders.some((folder) => folder.id === targetFolderId)) return { ok: false, reason: 'missing-folder' }
  if (effectiveFolder(entry, folders) === targetFolderId) return { ok: false, reason: 'same-folder' }
  return { ok: true, folderId: targetFolderId }
}

/** Drag data type of a dragged folder row (diagram cards only carry text/plain), so a folder is never mistaken for a diagram. */
export const FOLDER_DRAG_TYPE = 'application/x-inkpad-folder'

/** Whether dropping a dragged folder on another folder or the top-level entry should move it; an invalid target gets no highlight. */
export function decideFolderDrop(folders: FolderRecord[], folderId: string | null, targetFolderId: string | null): { ok: boolean } {
  if (folderId === null) return { ok: false }
  return { ok: canMoveFolder(folders, folderId, targetFolderId).ok }
}

/** Cards can be dragged only with a mouse: desktop input mode, or a fine primary pointer. Touch and pen tablets keep the Move dialog. */
export function canDragCards(desktopMode: boolean, finePointer: boolean): boolean {
  return desktopMode || finePointer
}

/** True when the browser reports a fine primary pointer (a mouse or trackpad). */
export function hasFinePointer(): boolean {
  try { return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches } catch { return false }
}
