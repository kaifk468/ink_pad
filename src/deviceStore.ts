import { documentItemCount, documentPageCount, DEFAULT_DOCUMENT_TITLE, DOCUMENT_FILE_EXTENSION, parseDocument, stringifyDocument, type InkPadDocument } from './documentFormat'
import type { DocumentSummary, FolderRecord } from './documentStore'
import type { StorageBackend } from './storageBackend'

/**
 * Storage in a real folder on the device (File System Access API). The folders you make in InkPad are
 * real directories and each diagram is a "<title>.inkpad" file inside them, so the hierarchy on disk
 * is exactly the hierarchy in the app. A diagram id is its path relative to the chosen folder.
 */

export type FileHandleLike = {
  kind: 'file'
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{ write(data: string | Blob): Promise<void>; close(): Promise<void> }>
}
export type DirHandle = {
  kind: 'directory'
  name: string
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandle>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>
  entries(): AsyncIterable<[string, DirHandle | FileHandleLike]>
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>
}

const MAX_NAME_LENGTH = 80
const MAX_SCAN_DEPTH = 8
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** Makes a title or folder name safe to use as a file or folder name. Never returns an empty string. */
export function sanitizeName(name: string, fallback = DEFAULT_DOCUMENT_TITLE): string {
  let cleaned = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .slice(0, MAX_NAME_LENGTH)
    .trim()
  if (!cleaned || RESERVED_NAMES.test(cleaned)) cleaned = fallback
  return cleaned
}

/** "Name (2)" -> "Name". Used so a numbered copy is not renamed back and forth on every save. */
export function stripCopySuffix(name: string): string {
  return name.replace(/ \(\d+\)$/, '')
}

export function splitPath(path: string | null): string[] {
  return path ? path.split('/').filter(Boolean) : []
}
export function joinPath(parent: string | null, name: string): string {
  return parent ? `${parent}/${name}` : name
}
export function parentOfPath(path: string): string | null {
  const index = path.lastIndexOf('/')
  return index < 0 ? null : path.slice(0, index)
}
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}
export function fileBase(fileName: string): string {
  return fileName.toLowerCase().endsWith(DOCUMENT_FILE_EXTENSION) ? fileName.slice(0, -DOCUMENT_FILE_EXTENSION.length) : fileName
}

/** First "Name", "Name (2)", "Name (3)"... that is not in the taken set (case-insensitive). */
export function uniqueName(base: string, taken: Set<string>, extension = ''): string {
  const lowered = new Set([...taken].map((entry) => entry.toLowerCase()))
  let candidate = `${base}${extension}`
  for (let n = 2; lowered.has(candidate.toLowerCase()); n += 1) candidate = `${base} (${n})${extension}`
  return candidate
}

async function writeFile(dir: DirHandle, name: string, data: string | Blob): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(data)
  await writable.close()
}

async function getDir(root: DirHandle, path: string | null, create = false): Promise<DirHandle> {
  let dir = root
  for (const part of splitPath(path)) dir = await dir.getDirectoryHandle(part, { create })
  return dir
}

async function entryNames(dir: DirHandle): Promise<Set<string>> {
  const names = new Set<string>()
  for await (const [name] of dir.entries()) names.add(name)
  return names
}

async function hasEntry(dir: DirHandle, name: string): Promise<boolean> {
  return (await entryNames(dir)).has(name)
}

async function copyDirectory(from: DirHandle, to: DirHandle): Promise<void> {
  for await (const [name, handle] of from.entries()) {
    if (handle.kind === 'directory') {
      await copyDirectory(handle, await to.getDirectoryHandle(name, { create: true }))
    } else {
      await writeFile(to, name, await handle.getFile())
    }
  }
}

export function createDeviceBackend(root: DirHandle): StorageBackend {
  const summaryCache = new Map<string, { title: string; itemCount: number; pageCount: number }>()

  const scan = async () => {
    const documents: DocumentSummary[] = []
    const folders: FolderRecord[] = []
    const visit = async (dir: DirHandle, path: string | null, depth: number) => {
      const entries: Array<[string, DirHandle | FileHandleLike]> = []
      for await (const entry of dir.entries()) entries.push(entry)
      for (const [name, handle] of entries) {
        if (name.startsWith('.')) continue
        const id = joinPath(path, name)
        if (handle.kind === 'directory') {
          folders.push({ id, name, parentId: path, createdAt: '' })
          if (depth < MAX_SCAN_DEPTH) await visit(handle, id, depth + 1)
        } else if (name.toLowerCase().endsWith(DOCUMENT_FILE_EXTENSION)) {
          try {
            const file = await handle.getFile()
            const key = `${id}:${file.lastModified}:${file.size}`
            let info = summaryCache.get(key)
            if (!info) {
              const parsed = parseDocument(await file.text())
              if (!parsed.ok) continue
              info = { title: fileBase(name), itemCount: documentItemCount(parsed.document), pageCount: documentPageCount(parsed.document) }
              summaryCache.set(key, info)
            }
            documents.push({ id, title: info.title, updatedAt: new Date(file.lastModified).toISOString(), itemCount: info.itemCount, folderId: path, ...(info.pageCount > 1 ? { pageCount: info.pageCount } : {}) })
          } catch {
            // An unreadable file is left out of the list rather than breaking it.
          }
        }
      }
    }
    await visit(root, null, 0)
    return { documents: documents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), folders }
  }

  const readDocument = async (id: string): Promise<InkPadDocument | null> => {
    try {
      const dir = await getDir(root, parentOfPath(id))
      const file = await (await dir.getFileHandle(baseName(id))).getFile()
      const parsed = parseDocument(await file.text())
      if (!parsed.ok) return null
      return { ...parsed.document, title: fileBase(baseName(id)) }
    } catch {
      return null
    }
  }

  return {
    kind: 'device',
    list: scan,
    load: readDocument,

    async save(id, document, folderId) {
      const text = stringifyDocument(document)
      const wanted = sanitizeName(document.title)
      if (id) {
        const dir = await getDir(root, parentOfPath(id), true)
        const currentName = baseName(id)
        const currentBase = fileBase(currentName)
        if (currentBase === wanted || stripCopySuffix(currentBase) === wanted) {
          await writeFile(dir, currentName, text)
          return id
        }
        // The title changed: the file is renamed to match (written first, so nothing is lost if this stops half way).
        const name = uniqueName(wanted, await entryNames(dir), DOCUMENT_FILE_EXTENSION)
        await writeFile(dir, name, text)
        await dir.removeEntry(currentName).catch(() => undefined)
        return joinPath(parentOfPath(id), name)
      }
      const dir = await getDir(root, folderId, true)
      const name = uniqueName(wanted, await entryNames(dir), DOCUMENT_FILE_EXTENSION)
      await writeFile(dir, name, text)
      return joinPath(folderId, name)
    },

    async remove(id) {
      const dir = await getDir(root, parentOfPath(id))
      await dir.removeEntry(baseName(id))
    },

    async move(id, folderId) {
      if (parentOfPath(id) === folderId) return id
      const from = await getDir(root, parentOfPath(id))
      const file = await (await from.getFileHandle(baseName(id))).getFile()
      const to = await getDir(root, folderId, true)
      const name = uniqueName(fileBase(baseName(id)), await entryNames(to), DOCUMENT_FILE_EXTENSION)
      await writeFile(to, name, file)
      await from.removeEntry(baseName(id))
      return joinPath(folderId, name)
    },

    async createFolder(name, parentId, reuse = false) {
      const clean = sanitizeName(name, 'New folder')
      const parent = await getDir(root, parentId, true)
      if (await hasEntry(parent, clean)) {
        if (reuse) {
          await parent.getDirectoryHandle(clean)
          return joinPath(parentId, clean)
        }
        throw new Error('A folder or file with that name already exists here.')
      }
      await parent.getDirectoryHandle(clean, { create: true })
      return joinPath(parentId, clean)
    },

    async renameFolder(id, name) {
      const clean = sanitizeName(name, 'New folder')
      const oldName = baseName(id)
      if (clean === oldName) return null
      const parentPath = parentOfPath(id)
      const parent = await getDir(root, parentPath)
      if (await hasEntry(parent, clean)) throw new Error('A folder or file with that name already exists here.')
      const source = await parent.getDirectoryHandle(oldName)
      const target = await parent.getDirectoryHandle(clean, { create: true })
      await copyDirectory(source, target)
      await parent.removeEntry(oldName, { recursive: true })
      return { from: id, to: joinPath(parentPath, clean) }
    },

    async deleteFolder(id) {
      const { documents } = await scan()
      const prefix = `${id}/`
      const deleted = documents.filter((entry) => entry.id.startsWith(prefix)).map((entry) => entry.id)
      const parent = await getDir(root, parentOfPath(id))
      await parent.removeEntry(baseName(id), { recursive: true })
      return deleted
    },
  }
}

// --- Remembering the chosen folder between visits -------------------------------------------------

const HANDLE_DB = 'inkpad-device'
const HANDLE_STORE = 'handles'
const HANDLE_KEY = 'root'
export const STORAGE_MODE_KEY = 'inkpad.storageMode'

export function isDeviceFolderSupported(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext === true && typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
}

export async function pickDeviceFolder(): Promise<DirHandle> {
  const picker = (window as unknown as { showDirectoryPicker: (options: { mode: 'readwrite' }) => Promise<DirHandle> }).showDirectoryPicker
  return picker.call(window, { mode: 'readwrite' })
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB, 1)
    request.onupgradeneeded = () => { request.result.createObjectStore(HANDLE_STORE) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open browser storage.'))
  })
}

export async function saveDeviceHandle(handle: DirHandle | null): Promise<void> {
  const db = await openHandleDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(HANDLE_STORE, 'readwrite')
      if (handle) transaction.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY)
      else transaction.objectStore(HANDLE_STORE).delete(HANDLE_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}

export async function loadDeviceHandle(): Promise<DirHandle | null> {
  const db = await openHandleDb()
  try {
    return await new Promise<DirHandle | null>((resolve, reject) => {
      const request = db.transaction(HANDLE_STORE, 'readonly').objectStore(HANDLE_STORE).get(HANDLE_KEY)
      request.onsuccess = () => resolve((request.result as DirHandle | undefined) ?? null)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

/** 'granted' when the folder can be used right now; otherwise the user must tap a button to allow it again. */
export async function queryDevicePermission(handle: DirHandle): Promise<'granted' | 'denied' | 'prompt'> {
  try {
    return (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted'
  } catch {
    return 'prompt'
  }
}
export async function requestDevicePermission(handle: DirHandle): Promise<boolean> {
  try {
    return ((await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'granted') === 'granted'
  } catch {
    return false
  }
}
