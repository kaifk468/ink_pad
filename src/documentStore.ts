import type { InkPadDocument } from './documentFormat'

/** Browser-local library of diagrams (IndexedDB). One record per diagram, keyed by id. */
const DB_NAME = 'inkpad'
const DB_VERSION = 2
const STORE = 'documents'
const FOLDER_STORE = 'folders'
const PLACEMENT_STORE = 'placements'
const CURRENT_KEY = 'inkpad.currentDocument'

export type DocumentSummary = { id: string; title: string; updatedAt: string; itemCount: number; folderId: string | null }
export type FolderRecord = { id: string; name: string; parentId: string | null; createdAt: string }
type PlacementRecord = { docId: string; folderId: string }
type StoredDocument = { id: string; document: InkPadDocument }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Browser storage is not available.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' })
      if (!request.result.objectStoreNames.contains(FOLDER_STORE)) request.result.createObjectStore(FOLDER_STORE, { keyPath: 'id' })
      if (!request.result.objectStoreNames.contains(PLACEMENT_STORE)) request.result.createObjectStore(PLACEMENT_STORE, { keyPath: 'docId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open browser storage.'))
  })
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>, storeName: string = STORE): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode)
      const request = work(transaction.objectStore(storeName))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error ?? new Error('Browser storage failed.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Browser storage was blocked (possibly out of space).'))
    })
  } finally {
    db.close()
  }
}

export function createDocumentId(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `doc-${random}`
}

export async function saveStoredDocument(id: string, document: InkPadDocument): Promise<void> {
  await run('readwrite', (store) => store.put({ id, document } satisfies StoredDocument))
}

export async function loadStoredDocument(id: string): Promise<InkPadDocument | null> {
  const record = await run<StoredDocument | undefined>('readonly', (store) => store.get(id))
  return record?.document ?? null
}

export async function deleteStoredDocument(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id))
  await run('readwrite', (store) => store.delete(id), PLACEMENT_STORE)
}

export async function listStoredDocuments(): Promise<DocumentSummary[]> {
  const records = await run<StoredDocument[]>('readonly', (store) => store.getAll())
  let placements: PlacementRecord[] = []
  try {
    placements = await run<PlacementRecord[]>('readonly', (store) => store.getAll(), PLACEMENT_STORE)
  } catch {
    // Folder data missing: every diagram simply shows at the top level.
  }
  const folderOf = new Map(placements.map((entry) => [entry.docId, entry.folderId]))
  return records
    .map(({ id, document }) => ({ id, title: document.title, updatedAt: document.updatedAt, itemCount: document.items.length, folderId: folderOf.get(id) ?? null }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function listFolders(): Promise<FolderRecord[]> {
  return run<FolderRecord[]>('readonly', (store) => store.getAll(), FOLDER_STORE)
}

export async function saveFolder(folder: FolderRecord): Promise<void> {
  await run('readwrite', (store) => store.put(folder), FOLDER_STORE)
}

export async function deleteFolderRecord(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id), FOLDER_STORE)
}

/** Put a diagram in a folder, or back at the top level when folderId is null. */
export async function setDocumentFolder(docId: string, folderId: string | null): Promise<void> {
  if (folderId === null) await run('readwrite', (store) => store.delete(docId), PLACEMENT_STORE)
  else await run('readwrite', (store) => store.put({ docId, folderId } satisfies PlacementRecord), PLACEMENT_STORE)
}

export function createFolderId(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `folder-${random}`
}

export function loadCurrentDocumentId(storage?: Pick<Storage, 'getItem'>): string | null {
  try {
    return (storage ?? window.localStorage).getItem(CURRENT_KEY)
  } catch {
    return null
  }
}

export function saveCurrentDocumentId(id: string | null, storage?: Pick<Storage, 'setItem' | 'removeItem'>): void {
  try {
    const target = storage ?? window.localStorage
    if (id) target.setItem(CURRENT_KEY, id)
    else target.removeItem(CURRENT_KEY)
  } catch {
    // Storage can be unavailable in private browsing; the diagram simply will not be reopened automatically.
  }
}

/** Triggers a browser download of text or blob content. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
