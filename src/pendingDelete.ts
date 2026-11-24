import type { DocumentSummary, FolderRecord } from './documentStore'
import { diagramsInFolder, folderAndDescendantIds } from './folderTree'

/** How long the Undo toast stays. The store delete runs only after this (or earlier when another delete starts or the Library closes). */
export const UNDO_DELETE_MS = 8000

export type PendingDelete = {
  kind: 'diagram' | 'folder'
  id: string
  /** Name shown in the toast. */
  label: string
  /** Every diagram or folder id to hide from the Library while the delete is pending. */
  hiddenIds: ReadonlySet<string>
  /** The real store delete. Resolves false (the caller has already shown a notice) or throws when it failed. */
  run: () => Promise<boolean | void>
}

export type PendingDeleteOptions = {
  delayMs?: number
  /** Called whenever the pending item, and so what is hidden, changes. */
  onChange?: (pending: PendingDelete | null) => void
  /** Called when the store delete failed; the item is visible again by then. */
  onFailed?: (item: PendingDelete, error?: unknown) => void
  setTimer?: (callback: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

/** Ids hidden while a diagram delete is pending: just that diagram. */
export function hiddenForDiagram(id: string): Set<string> {
  return new Set([id])
}

/** Ids hidden while a folder delete is pending: the folder, its subfolders and every diagram inside them. */
export function hiddenForFolder(folders: FolderRecord[], library: DocumentSummary[], folderId: string): Set<string> {
  const hidden = new Set<string>([folderId])
  for (const id of folderAndDescendantIds(folders, folderId)) {
    hidden.add(id)
    for (const entry of diagramsInFolder(library, id, folders)) hidden.add(entry.id)
  }
  return hidden
}

/**
 * Holds at most one delete back so it can be undone. Nothing is removed until the timer ends, another delete is scheduled, or flush()
 * is called. There is deliberately no unload handling: if the page closes while a delete is pending it never runs and the item stays.
 */
export function createPendingDeletes(options: PendingDeleteOptions = {}) {
  const delay = options.delayMs ?? UNDO_DELETE_MS
  const setTimer = options.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms))
  const clearTimer = options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  let pending: PendingDelete | null = null
  let handle: unknown = null
  /** The store call in progress, so a second flush waits for it instead of deleting twice, and Undo is refused once it started. */
  let running: Promise<boolean> | null = null

  const notify = () => options.onChange?.(pending)
  const stopTimer = () => { if (handle !== null) { clearTimer(handle); handle = null } }

  /** Runs the pending delete now. Resolves true when nothing was pending or it worked; false when it failed (the item is shown again). */
  const flush = (): Promise<boolean> => {
    if (running) return running
    const item = pending
    if (!item) return Promise.resolve(true)
    stopTimer()
    running = execute(item).finally(() => { running = null })
    return running
  }
  const execute = async (item: PendingDelete): Promise<boolean> => {
    // it stays hidden while the store call runs; it is forgotten (or shown again on failure) afterwards
    let ok = true
    let failure: unknown
    try { ok = (await item.run()) !== false } catch (error) { ok = false; failure = error }
    if (pending === item) pending = null
    notify()
    if (!ok) options.onFailed?.(item, failure)
    return ok
  }

  return {
    /** Hides the item and starts the countdown. A delete that is already pending is flushed (really deleted) first. */
    async schedule(item: PendingDelete): Promise<void> {
      if (pending) await flush()
      pending = item
      stopTimer()
      handle = setTimer(() => { handle = null; void flush() }, delay)
      notify()
    },
    /** Undo: the pending delete is dropped and nothing was removed. Returns the item, or null when there was none. */
    cancel(): PendingDelete | null {
      const item = pending
      if (!item || running) return null // too late: the store call has started
      stopTimer()
      pending = null
      notify()
      return item
    },
    flush,
    isHidden(id: string): boolean { return pending !== null && pending.hiddenIds.has(id) },
    current(): PendingDelete | null { return pending },
  }
}

export type PendingDeletes = ReturnType<typeof createPendingDeletes>
