import type { DocumentSummary, FolderRecord } from './documentStore'

/** "1 diagram" / "3 diagrams". */
export function diagramsText(count: number): string {
  return `${count} diagram${count === 1 ? '' : 's'}`
}

/** Flips one id in the selection (returns a new set). */
export function toggleSelected(selection: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selection)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/** Selects every id given (the diagrams visible now). */
export function selectAllIds(ids: readonly string[]): Set<string> {
  return new Set(ids)
}

/** The ids an action may touch: selected AND visible now, in the visible order. What is hidden (search, folder, pending delete) is never touched. */
export function effectiveSelection(selection: ReadonlySet<string>, visibleIds: readonly string[]): string[] {
  return visibleIds.filter((id) => selection.has(id))
}

export function allSelected(selection: ReadonlySet<string>, visibleIds: readonly string[]): boolean {
  return visibleIds.length > 0 && visibleIds.every((id) => selection.has(id))
}

export function selectionLabel(count: number): string {
  return `${count} selected`
}

export function deleteConfirmText(count: number): string {
  return `Delete ${diagramsText(count)}?`
}

export function movedMessage(moved: number, total: number, destination: string): string {
  return moved === total ? `Moved ${diagramsText(total)} to ${destination}` : `Moved ${moved} of ${total} to ${destination}`
}

/** Ids that really need a store move: those not already in the destination (an unknown folder id counts as the top level). */
export function idsToMove(library: DocumentSummary[], folders: FolderRecord[], ids: readonly string[], destinationId: string | null): string[] {
  return ids.filter((id) => {
    const entry = library.find((item) => item.id === id)
    if (!entry) return false
    const current = entry.folderId && folders.some((folder) => folder.id === entry.folderId) ? entry.folderId : null
    return current !== destinationId
  })
}

/**
 * Moves one diagram after another through the same single-diagram move call (never in parallel, so the save chain keeps its order).
 * A failure or throw on one does not stop the rest. Returns how many worked.
 */
export async function runMoves(ids: readonly string[], move: (id: string) => Promise<boolean | void> | void): Promise<{ moved: number; failed: number }> {
  let moved = 0
  let failed = 0
  for (const id of ids) {
    try {
      if ((await move(id)) === false) failed += 1
      else moved += 1
    } catch { failed += 1 }
  }
  return { moved, failed }
}
