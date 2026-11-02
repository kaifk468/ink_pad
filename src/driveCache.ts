import type { DocumentSummary, FolderRecord } from './documentStore'

/**
 * A copy of the Google Drive diagrams that were opened on this browser, so reopening one does not wait for the network.
 * Only diagrams that were actually opened or saved are kept (the 30 used most recently), plus the last folder listing.
 * The text of a diagram and its small state (Drive's modified time, and whether the newest edit still has to be uploaded)
 * are stored separately, so marking an upload as done never rewrites the whole diagram.
 */
export const MAX_CACHED_DIAGRAMS = 30

export type CachedDiagram = {
  id: string
  /** The diagram file as JSON text. */
  text: string
  /** Drive's modified time of the version this copy is based on ('' when unknown). */
  modifiedTime: string
  /** The copy holds an edit that has not reached Drive yet. */
  pending: boolean
}
export type CachedListing = { documents: DocumentSummary[]; folders: FolderRecord[] }

export type DriveCache = {
  get(id: string): Promise<CachedDiagram | null>
  /** Stores the text of a diagram (and marks it as most recently used). */
  putText(id: string, text: string, state: { modifiedTime: string; pending: boolean }): Promise<void>
  /** Updates only the small state of an already cached diagram. */
  setState(id: string, state: { modifiedTime: string; pending: boolean }): Promise<void>
  remove(id: string): Promise<void>
  getListing(): Promise<CachedListing | null>
  putListing(listing: CachedListing): Promise<void>
  /** Forgets everything (another Google account signed in, or Drive was disconnected). */
  clear(): Promise<void>
}

/** Which cached diagrams to drop so at most `max` remain. The least recently used go first; diagrams with an edit still waiting for upload are never dropped. */
export function evictionIds(entries: Array<{ id: string; usedAt: number; pending: boolean }>, max = MAX_CACHED_DIAGRAMS): string[] {
  const excess = entries.length - max
  if (excess <= 0) return []
  return [...entries]
    .filter((entry) => !entry.pending)
    .sort((a, b) => a.usedAt - b.usedAt)
    .slice(0, excess)
    .map((entry) => entry.id)
}

/** In-memory cache: used in tests and when the browser's database is unavailable. */
export function createMemoryDriveCache(max = MAX_CACHED_DIAGRAMS, now: () => number = () => Date.now()): DriveCache {
  const diagrams = new Map<string, CachedDiagram & { usedAt: number }>()
  let listing: CachedListing | null = null
  let last = 0
  const stamp = () => { last = Math.max(now(), last + 1); return last }
  const evict = () => { for (const id of evictionIds([...diagrams.values()], max)) diagrams.delete(id) }
  return {
    async get(id) {
      const entry = diagrams.get(id)
      if (!entry) return null
      entry.usedAt = stamp()
      const { usedAt: _usedAt, ...rest } = entry
      return { ...rest }
    },
    async putText(id, text, state) {
      diagrams.set(id, { id, text, ...state, usedAt: stamp() })
      evict()
    },
    async setState(id, state) {
      const entry = diagrams.get(id)
      if (entry) Object.assign(entry, state)
    },
    async remove(id) { diagrams.delete(id) },
    async getListing() { return listing },
    async putListing(next) { listing = next },
    async clear() { diagrams.clear(); listing = null },
  }
}

const DB_NAME = 'inkpad-drive-cache'
const DIAGRAMS = 'diagrams'
const META = 'meta'
const LISTING_KEY = 'listing'

type StoredEntry = { id: string; text: string; modifiedTime: string; pending: boolean; usedAt: number }

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

/** The cache in the browser's IndexedDB. Falls back to memory when IndexedDB is not available. */
export function createIndexedDbDriveCache(max = MAX_CACHED_DIAGRAMS): DriveCache {
  if (typeof indexedDB === 'undefined') return createMemoryDriveCache(max)
  let dbPromise: Promise<IDBDatabase> | null = null
  const open = () => {
    if (!dbPromise) {
      dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1)
        request.onupgradeneeded = () => {
          request.result.createObjectStore(DIAGRAMS, { keyPath: 'id' })
          request.result.createObjectStore(META, { keyPath: 'key' })
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => { dbPromise = null; reject(request.error) }
      })
    }
    return dbPromise
  }
  let last = 0
  const stamp = () => { last = Math.max(Date.now(), last + 1); return last }
  return {
    async get(id) {
      const db = await open()
      const transaction = db.transaction(DIAGRAMS, 'readwrite')
      const store = transaction.objectStore(DIAGRAMS)
      const entry = await requestResult(store.get(id)) as StoredEntry | undefined
      if (!entry) return null
      store.put({ ...entry, usedAt: stamp() })
      return { id: entry.id, text: entry.text, modifiedTime: entry.modifiedTime, pending: entry.pending }
    },
    async putText(id, text, state) {
      const db = await open()
      const transaction = db.transaction(DIAGRAMS, 'readwrite')
      const store = transaction.objectStore(DIAGRAMS)
      store.put({ id, text, ...state, usedAt: stamp() } satisfies StoredEntry)
      // only small fields are read to decide what to drop, but IndexedDB returns whole records: this runs on a short list (about 30)
      const all = await requestResult(store.getAll()) as StoredEntry[]
      for (const dropId of evictionIds(all, max)) store.delete(dropId)
      await transactionDone(transaction)
    },
    async setState(id, state) {
      const db = await open()
      const transaction = db.transaction(DIAGRAMS, 'readwrite')
      const store = transaction.objectStore(DIAGRAMS)
      const entry = await requestResult(store.get(id)) as StoredEntry | undefined
      if (entry) store.put({ ...entry, ...state })
      await transactionDone(transaction)
    },
    async remove(id) {
      const db = await open()
      const transaction = db.transaction(DIAGRAMS, 'readwrite')
      transaction.objectStore(DIAGRAMS).delete(id)
      await transactionDone(transaction)
    },
    async getListing() {
      const db = await open()
      const row = await requestResult(db.transaction(META, 'readonly').objectStore(META).get(LISTING_KEY)) as { key: string; value: CachedListing } | undefined
      return row?.value ?? null
    },
    async putListing(listing) {
      const db = await open()
      const transaction = db.transaction(META, 'readwrite')
      transaction.objectStore(META).put({ key: LISTING_KEY, value: listing })
      await transactionDone(transaction)
    },
    async clear() {
      const db = await open()
      const transaction = db.transaction([DIAGRAMS, META], 'readwrite')
      transaction.objectStore(DIAGRAMS).clear()
      transaction.objectStore(META).clear()
      await transactionDone(transaction)
    },
  }
}
