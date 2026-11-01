import type { InkPadDocument } from './documentFormat'
import { createDocumentId, createFolderId, deleteFolderRecord, deleteStoredDocument, listFolders, listStoredDocuments, loadStoredDocument, saveFolder, saveStoredDocument, setDocumentFolder, type DocumentSummary, type FolderRecord } from './documentStore'
import { cleanFolderName, folderAndDescendantIds } from './folderTree'

/**
 * Where diagrams live. Both backends expose the same shapes: a diagram id and a folder id are
 * opaque strings (a random id in the browser, a relative path such as "LLD/Payments/Order.inkpad"
 * on a device folder), and a folder's parentId is the id of the folder that contains it.
 */
export type StorageBackend = {
  kind: 'browser' | 'device'
  list(): Promise<{ documents: DocumentSummary[]; folders: FolderRecord[] }>
  load(id: string): Promise<InkPadDocument | null>
  /** Saves a diagram. id null = new diagram in folderId. Returns the id, which can change when the title or location changes. */
  save(id: string | null, document: InkPadDocument, folderId: string | null): Promise<string>
  remove(id: string): Promise<void>
  /** Moves a diagram to another folder (null = top level). Returns its id afterwards. */
  move(id: string, folderId: string | null): Promise<string>
  /** Creates a folder and returns its id. With reuse, an existing folder of that name is returned instead of an error. */
  createFolder(name: string, parentId: string | null, reuse?: boolean): Promise<string>
  /** Renames a folder. Returns the old and new id when ids change (device folders), otherwise null. */
  renameFolder(id: string, name: string): Promise<{ from: string; to: string } | null>
  /** Deletes a folder, its subfolders and every diagram inside. Returns the ids of the deleted diagrams. */
  deleteFolder(id: string): Promise<string[]>
}

/** Copies every folder and diagram from one backend into another, keeping the folder hierarchy identical. */
export async function copyAllBetweenBackends(from: StorageBackend, to: StorageBackend): Promise<{ folders: number; diagrams: number; failed: number }> {
  const { documents, folders } = await from.list()
  const idMap = new Map<string, string>()
  const depthOf = (folder: FolderRecord) => {
    let depth = 0
    let current: FolderRecord | undefined = folder
    const seen = new Set<string>()
    while (current?.parentId && !seen.has(current.id)) {
      seen.add(current.id)
      current = folders.find((entry) => entry.id === current!.parentId)
      depth += 1
    }
    return depth
  }
  let folderCount = 0
  for (const folder of [...folders].sort((a, b) => depthOf(a) - depthOf(b))) {
    const parent = folder.parentId ? idMap.get(folder.parentId) ?? null : null
    idMap.set(folder.id, await to.createFolder(folder.name, parent, true))
    folderCount += 1
  }
  let diagrams = 0
  let failed = 0
  for (const entry of documents) {
    try {
      const document = await from.load(entry.id)
      if (!document) { failed += 1; continue }
      const parent = entry.folderId ? idMap.get(entry.folderId) ?? null : null
      await to.save(null, document, parent)
      diagrams += 1
    } catch {
      failed += 1
    }
  }
  return { folders: folderCount, diagrams, failed }
}


/** The browser's own storage (IndexedDB), the default. */
export function createBrowserBackend(): StorageBackend {
  return {
    kind: 'browser',
    async list() {
      const documents = await listStoredDocuments()
      let folders: FolderRecord[] = []
      try { folders = await listFolders() } catch { /* no folders yet */ }
      return { documents, folders }
    },
    load: loadStoredDocument,
    async save(id, document, folderId) {
      const target = id ?? createDocumentId()
      await saveStoredDocument(target, document)
      if (!id && folderId) {
        try { await setDocumentFolder(target, folderId) } catch { /* stays at the top level */ }
      }
      return target
    },
    remove: deleteStoredDocument,
    async move(id, folderId) {
      await setDocumentFolder(id, folderId)
      return id
    },
    async createFolder(name, parentId, reuse = false) {
      const clean = cleanFolderName(name)
      if (reuse) {
        const existing = (await listFolders()).find((folder) => (folder.parentId ?? null) === parentId && folder.name.toLowerCase() === clean.toLowerCase())
        if (existing) return existing.id
      }
      const id = createFolderId()
      await saveFolder({ id, name: clean, parentId, createdAt: new Date().toISOString() })
      return id
    },
    async renameFolder(id, name) {
      const existing = (await listFolders()).find((folder) => folder.id === id)
      if (existing) await saveFolder({ ...existing, name: cleanFolderName(name) })
      return null
    },
    async deleteFolder(id) {
      const [documents, folders] = await Promise.all([listStoredDocuments(), listFolders()])
      const ids = new Set(folderAndDescendantIds(folders, id))
      const deleted: string[] = []
      for (const entry of documents) {
        if (entry.folderId && ids.has(entry.folderId)) {
          await deleteStoredDocument(entry.id)
          deleted.push(entry.id)
        }
      }
      for (const folderId of ids) await deleteFolderRecord(folderId)
      return deleted
    },
  }
}
