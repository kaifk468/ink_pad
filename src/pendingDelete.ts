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
  /** Extra live rule (a folder hides whatever is inside it now, not only what was there at confirm time). */
  hides?: (id: string) => boolean
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

/** True when `id` is the folder, one of its subfolders, or a diagram now inside them (live lists, so late arrivals are hidden too). */
export function hidesInFolder(folders: FolderRecord[], library: DocumentSummary[], folderId: string, id: string): boolean {
  const subtree = new Set(folderAndDescendantIds(folders, folderId))
  if (subtree.has(id)) return true
  const entry = library.find((item) => item.id === id)
  return Boolean(entry?.folderId && subtree.has(entry.folderId))
}

/**
 * Holds deletes back so the newest can be undone. Nothing is removed until its timer ends, another delete is scheduled, or flush()
 * is called. Items hide synchronously and are deleted one after another in order, so a rapid series never drops one. After a delete
 * succeeds the item stays hidden until sweep() sees the Library lists no longer contain it. There is deliberately no unload
 * handling: if the page closes while a delete is pending it never runs and the item stays.
 */
export function createPendingDeletes(options: PendingDeleteOptions = {}) {
  const delay = options.delayMs ?? UNDO_DELETE_MS
  const setTimer = options.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms))
  const clearTimer = options.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  type Entry = { item: PendingDelete; ready: boolean }
  /** Waiting or running, oldest first. */
  let queue: Entry[] = []
  /** Deleted in the store but possibly still listed by the Library props. */
  let settling: PendingDelete[] = []
  let undoable: Entry | null = null
  let running: PendingDelete | null = null
  let draining: Promise<boolean> | null = null
  let handle: unknown = null
  let disposed = false

  const notify = () => options.onChange?.(undoable?.item ?? running)
  const stopTimer = () => { if (handle !== null) { clearTimer(handle); handle = null } }

  const execute = async (item: PendingDelete): Promise<boolean> => {
    let ok = true
    let failure: unknown
    try { ok = (await item.run()) !== false } catch (error) { ok = false; failure = error }
    return finish(item, ok, failure)
  }
  const finish = (item: PendingDelete, ok: boolean, failure: unknown): boolean => {
    running = null
    queue = queue.filter((entry) => entry.item !== item)
    if (ok) settling.push(item)
    notify()
    if (!ok) options.onFailed?.(item, failure)
    return ok
  }
  /** Deletes every ready item in order, one at a time. Resolves false when any failed. */
  const drain = (): Promise<boolean> => {
    if (draining) return draining
    const loop = async (): Promise<boolean> => {
      let all = true
      while (queue.length > 0 && queue[0].ready) {
        running = queue[0].item
        notify()
        if (!(await execute(running))) all = false
      }
      return all
    }
    draining = loop().finally(() => { draining = null })
    return draining
  }
  /** The undoable item loses its Undo and is deleted next. */
  const commit = () => {
    stopTimer()
    if (undoable) { undoable.ready = true; undoable = null }
  }

  const flush = (): Promise<boolean> => {
    commit()
    if (queue.length === 0) { notify(); return draining ?? Promise.resolve(true) }
    return drain()
  }

  return {
    /** Hides the item at once and starts the countdown. The previous undoable item is committed (really deleted, in order) first. */
    schedule(item: PendingDelete): void {
      const committed = undoable !== null
      commit()
      const entry: Entry = { item, ready: false }
      queue.push(entry)
      if (committed) void drain()
      if (disposed) { entry.ready = true; void drain(); notify(); return }
      undoable = entry
      handle = setTimer(() => { handle = null; void flush() }, delay)
      notify()
    },
    /** Undo: the newest delete is dropped and nothing was removed. Returns the item, or null when there is nothing to undo (or it already started). */
    cancel(): PendingDelete | null {
      const entry = undoable
      if (!entry) return null
      stopTimer()
      undoable = null
      queue = queue.filter((other) => other !== entry)
      notify()
      return entry.item
    },
    /** Runs everything queued now. Resolves true when nothing was pending or all worked. */
    flush,
    /** The Library screen is shown again after having been closed (also covers a remount that reuses this controller). */
    start(): void { disposed = false },
    /** The Library closed: everything queued is deleted now and no timer starts afterwards. */
    dispose(): Promise<boolean> { disposed = true; return flush() },
    /** Forgets deleted items whose ids are gone from the Library lists. */
    sweep(isListed: (id: string) => boolean): void {
      if (settling.length === 0) return
      const before = settling.length
      settling = settling.filter((item) => [...item.hiddenIds].some(isListed))
      if (settling.length !== before) notify()
    },
    isHidden(id: string): boolean {
      for (const item of [...queue.map((entry) => entry.item), ...settling]) if (item.hiddenIds.has(id) || item.hides?.(id)) return true
      return false
    },
    /** The item with the Undo toast, else the one being deleted now. */
    current(): PendingDelete | null { return undoable?.item ?? running },
    /** True while the store call for the toast's item runs (Undo is not possible then). */
    isRunning(): boolean { return undoable === null && running !== null },
    /** Anything hidden at all (queued, running or waiting to leave the lists). */
    hasHidden(): boolean { return queue.length > 0 || settling.length > 0 },
  }
}

export type PendingDeletes = ReturnType<typeof createPendingDeletes>
