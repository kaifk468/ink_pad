import { documentItemCount, documentPageCount, DOCUMENT_FILE_EXTENSION, parseDocument, stringifyDocument, type InkPadDocument } from './documentFormat'
import type { DocumentSummary, FolderRecord } from './documentStore'
import { fileBase, sanitizeName } from './deviceStore'
import { cleanFolderName, folderAndDescendantIds } from './folderTree'
import type { StorageBackend } from './storageBackend'
import type { DriveCache } from './driveCache'
import type { DriveProfile } from './driveProfile'

/**
 * Storage in the person's own Google Drive, inside the hidden "app data" area (scope drive.appdata):
 * only InkPad can see these files, and they do not clutter the normal Drive file list.
 * Folders are real Drive folders and each diagram is a "<title>.inkpad" file, so the hierarchy is
 * the same as in the browser and device-folder storage. Ids are Drive file ids, which stay the
 * same when a diagram or folder is renamed or moved.
 */

export const GOOGLE_CLIENT_ID = '422120639138-p86fdlt7qg2fqp5sb1c6c59nevketg6e.apps.googleusercontent.com'
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
/** Lets InkPad create and update only its own files in the normal Drive (the NotebookLM export). Not used for saving diagrams. */
export const DRIVE_EXPORT_SCOPE = 'https://www.googleapis.com/auth/drive.file'

const FILES_URL = 'https://www.googleapis.com/drive/v3/files'
/** A star is the app property `starred` = "1" on the diagram's Drive file. Saves only send `itemCount`, and Drive merges app properties, so a save keeps the star. */
const STARRED_VALUE = '1'
const ABOUT_URL = 'https://www.googleapis.com/drive/v3/about'
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const ROOT_ALIAS = 'appDataFolder'

/** Thrown when Google needs the person to sign in again (token missing, expired or refused). */
export class DriveAuthError extends Error {
  constructor(message = 'Sign in to Google again to keep saving.') {
    super(message)
    this.name = 'DriveAuthError'
  }
}

export class DriveHttpError extends Error {
  status: number
  constructor(status: number) {
    super(status === 403 ? 'Google Drive refused the request (is the Drive API enabled?).' : status === 429 ? 'Google Drive is busy. Try again in a moment.' : `Google Drive error (${status}).`)
    this.name = 'DriveHttpError'
    this.status = status
  }
}

export type DriveEnv = {
  /** Returns a valid access token. force = get a fresh one even if the cached one looks valid. */
  getToken(force?: boolean): Promise<string>
  fetch: (url: string, init?: RequestInit) => Promise<Response>
}

type DriveFile = {
  id: string
  name: string
  mimeType?: string
  parents?: string[]
  modifiedTime?: string
  appProperties?: Record<string, string>
}

async function call(env: DriveEnv, url: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const token = await env.getToken()
  const response = await env.fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` } })
  if (response.status === 401) {
    if (!retry) throw new DriveAuthError()
    await env.getToken(true)
    return call(env, url, init, false)
  }
  if (!response.ok) throw new DriveHttpError(response.status)
  return response
}

/** An authorised Drive call with one retry on 401, for modules outside this file. */
export const driveRequest = call

function multipart(metadata: object, content: string) {
  const boundary = `inkpad${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`
  return { body, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` } }
}

async function listAll(env: DriveEnv): Promise<DriveFile[]> {
  const files: DriveFile[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({
      spaces: ROOT_ALIAS,
      q: 'trashed = false',
      pageSize: '1000',
      fields: 'nextPageToken,files(id,name,mimeType,parents,modifiedTime,appProperties)',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const data = await (await call(env, `${FILES_URL}?${params}`)).json() as { files?: DriveFile[]; nextPageToken?: string }
    files.push(...(data.files ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)
  return files
}

/** Splits a listing into folders and diagrams. A parent that is not one of our folders is the top level. */
function organise(files: DriveFile[]) {
  const folderFiles = files.filter((file) => file.mimeType === FOLDER_MIME)
  const folderIds = new Set(folderFiles.map((file) => file.id))
  const parentOf = (file: DriveFile) => file.parents?.find((parent) => folderIds.has(parent)) ?? null
  const folders: FolderRecord[] = folderFiles.map((file) => ({ id: file.id, name: file.name, parentId: parentOf(file), createdAt: file.modifiedTime ?? '' }))
  const diagramFiles = files.filter((file) => file.mimeType !== FOLDER_MIME && file.name.toLowerCase().endsWith(DOCUMENT_FILE_EXTENSION))
  const documents: DocumentSummary[] = diagramFiles.map((file) => ({
    id: file.id,
    title: fileBase(file.name),
    updatedAt: file.modifiedTime ?? '',
    itemCount: Number(file.appProperties?.itemCount) || 0,
    ...(Number(file.appProperties?.pageCount) > 1 ? { pageCount: Number(file.appProperties?.pageCount) } : {}),
    ...(file.appProperties?.starred === STARRED_VALUE ? { starred: true } : {}),
    folderId: parentOf(file),
  }))
  return { folders, documents, parentOf, diagramFiles }
}

/** The signed-in person's name, email and photo. Drive's "about" call is allowed by the same app-data permission, so no extra sign-in scope is needed. */
export async function fetchDriveProfile(env: DriveEnv): Promise<DriveProfile> {
  const params = new URLSearchParams({ fields: 'user(displayName,emailAddress,photoLink)' })
  const data = await (await call(env, `${ABOUT_URL}?${params}`)).json() as { user?: { displayName?: string; emailAddress?: string; photoLink?: string } }
  return { name: data.user?.displayName ?? '', email: data.user?.emailAddress ?? '', photoUrl: data.user?.photoLink ?? null }
}

export function createDriveBackend(env: DriveEnv, options: { cache?: DriveCache } = {}): StorageBackend {
  const cache = options.cache
  // When this device last loaded or saved each diagram. If Drive holds a newer version when we save,
  // another device changed it, so its version is kept as a copy before we overwrite it.
  const knownModified = new Map<string, string>()

  /** The browser copy is an extra: if the browser refuses to store it, Drive still works. */
  const quietly = async (work: Promise<unknown> | undefined) => { try { await work } catch { /* cache unavailable */ } }

  async function getMeta(id: string): Promise<DriveFile | null> {
    try {
      const params = new URLSearchParams({ fields: 'id,name,parents,modifiedTime' })
      return await (await call(env, `${FILES_URL}/${encodeURIComponent(id)}?${params}`)).json() as DriveFile
    } catch (error) {
      if (error instanceof DriveHttpError && error.status === 404) return null
      throw error
    }
  }

  /** The summary tags every save carries. `pageCount` only exists for diagrams with several pages; null removes it again when pages were deleted. */
  const summaryProperties = (itemCount: number, pageCount: number, updating: boolean) => ({ itemCount: String(itemCount), ...(pageCount > 1 ? { pageCount: String(pageCount) } : updating ? { pageCount: null } : {}) })

  async function create(name: string, folderId: string | null, content: string, itemCount: number, pageCount = 1): Promise<string> {
    const { body, headers } = multipart({ name, mimeType: 'application/json', parents: [folderId ?? ROOT_ALIAS], appProperties: summaryProperties(itemCount, pageCount, false) }, content)
    const result = await (await call(env, `${UPLOAD_URL}?uploadType=multipart&fields=id,modifiedTime`, { method: 'POST', headers, body })).json() as DriveFile
    if (result.modifiedTime) knownModified.set(result.id, result.modifiedTime)
    return result.id
  }

  /** Downloads a diagram from Drive and keeps a browser copy of it. */
  async function download(id: string, remember = true): Promise<{ document: InkPadDocument; text: string; modifiedTime: string } | null> {
    let meta: DriveFile | null
    let text: string
    try {
      // the version time and the content are asked for together, so opening costs one round trip, not two
      const [metaResult, textResult] = await Promise.all([getMeta(id), call(env, `${FILES_URL}/${encodeURIComponent(id)}?alt=media`).then((response) => response.text())])
      meta = metaResult
      text = textResult
    } catch (error) {
      if (error instanceof DriveHttpError && error.status === 404) { await quietly(cache?.remove(id)); return null }
      throw error
    }
    if (!meta) { await quietly(cache?.remove(id)); return null }
    const result = parseDocument(text)
    if (!result.ok) throw new Error(result.error)
    const modifiedTime = meta.modifiedTime ?? ''
    if (remember) {
      if (modifiedTime) knownModified.set(id, modifiedTime)
      await quietly(cache?.putText(id, text, { modifiedTime, pending: false }))
    }
    return { document: result.document, text, modifiedTime }
  }

  /** Uploads of one file run one after another, so an older upload started in the background can never land after a newer one. */
  const uploadQueues = new Map<string, Promise<unknown>>()
  function upload(id: string, document: InkPadDocument, content: string, folderId: string | null = null): Promise<string> {
    const previous = uploadQueues.get(id) ?? Promise.resolve()
    const run = previous.then(() => undefined, () => undefined).then(() => uploadNow(id, document, content, folderId))
    uploadQueues.set(id, run)
    const cleanup = () => { if (uploadQueues.get(id) === run) uploadQueues.delete(id) }
    run.then(cleanup, cleanup)
    return run
  }

  /** Uploads a diagram over an existing Drive file, keeping the other device's version as a copy when Drive changed meanwhile. */
  async function uploadNow(id: string, document: InkPadDocument, content: string, folderId: string | null = null): Promise<string> {
    const name = `${sanitizeName(document.title)}${DOCUMENT_FILE_EXTENSION}`
    const itemCount = documentItemCount(document)
    const pageCount = documentPageCount(document)
    const known = knownModified.get(id)
    const remote = await getMeta(id)
    if (!remote) {
      // deleted elsewhere: keep the work as a new file
      const newId = await create(name, folderId, content, itemCount, pageCount)
      await quietly(cache?.remove(id))
      await quietly(cache?.putText(newId, content, { modifiedTime: knownModified.get(newId) ?? '', pending: false }))
      return newId
    }
    // No known version (a restored or leftover copy): the remote file may hold something newer, so keep it first. Safe direction.
    if (remote.modifiedTime && (!known || remote.modifiedTime !== known)) {
      const stamp = new Date(remote.modifiedTime).toISOString().slice(0, 16).replace('T', ' ')
      await call(env, `${FILES_URL}/${encodeURIComponent(id)}/copy?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${fileBase(remote.name)} (other device ${stamp})${DOCUMENT_FILE_EXTENSION}`, parents: remote.parents }),
      })
    }
    const { body, headers } = multipart({ name, appProperties: summaryProperties(itemCount, pageCount, true) }, content)
    const result = await (await call(env, `${UPLOAD_URL}/${encodeURIComponent(id)}?uploadType=multipart&fields=id,modifiedTime`, { method: 'PATCH', headers, body })).json() as DriveFile
    if (result.modifiedTime) knownModified.set(id, result.modifiedTime)
    // a newer edit may have been put in the browser copy while this one uploaded: it stays marked as waiting
    let stillPending = false
    try { const cached = cache ? await cache.get(id) : null; stillPending = Boolean(cached && cached.text !== content) } catch { /* mark clean as before */ }
    await quietly(cache?.setState(id, { modifiedTime: result.modifiedTime ?? known ?? '', pending: stillPending }))
    return id
  }

  /** After showing the browser copy: finish an upload that was interrupted, or fetch a newer version if Drive has one. */
  async function revalidate(id: string, cached: { text: string; modifiedTime: string; pending: boolean }, onFresher?: (document: InkPadDocument) => boolean | void) {
    try {
      if (cached.pending) {
        const parsed = parseDocument(cached.text)
        if (parsed.ok) await upload(id, parsed.document, cached.text)
        return
      }
      const remote = await getMeta(id)
      if (!remote?.modifiedTime || remote.modifiedTime === cached.modifiedTime) return
      const fresh = await download(id, false)
      if (!fresh) return
      // The newer version only becomes "known" once it is on screen. If it was not used (the diagram was edited here meanwhile),
      // the next save still sees that Drive changed and keeps the other version as a copy.
      if (!onFresher || onFresher(fresh.document) === false) return
      if (fresh.modifiedTime) knownModified.set(id, fresh.modifiedTime)
      await quietly(cache?.putText(id, fresh.text, { modifiedTime: fresh.modifiedTime, pending: false }))
    } catch { /* offline or signed out: the browser copy stays and the next save reports any problem */ }
  }

  return {
    kind: 'drive',
    async list() {
      const { folders, documents } = organise(await listAll(env))
      await quietly(cache?.putListing({ documents, folders }))
      return { documents, folders }
    },
    async listCached() {
      try { return (await cache?.getListing()) ?? null } catch { return null }
    },
    async load(id, onFresher) {
      let cached = null
      try { cached = cache ? await cache.get(id) : null } catch { cached = null }
      if (cached) {
        const parsed = parseDocument(cached.text)
        if (parsed.ok) {
          if (cached.modifiedTime) knownModified.set(id, cached.modifiedTime)
          void revalidate(id, cached, onFresher)
          return parsed.document
        }
      }
      return (await download(id))?.document ?? null
    },
    async loadFresh(id) {
      return (await download(id))?.document ?? null
    },
    async save(id, document: InkPadDocument, folderId) {
      const content = stringifyDocument(document)
      if (!id) {
        const name = `${sanitizeName(document.title)}${DOCUMENT_FILE_EXTENSION}`
        const newId = await create(name, folderId, content, documentItemCount(document), documentPageCount(document))
        await quietly(cache?.putText(newId, content, { modifiedTime: knownModified.get(newId) ?? '', pending: false }))
        return newId
      }
      // the browser copy is written first and marked as waiting, so a slow or failed upload never loses the edit
      await quietly(cache?.putText(id, content, { modifiedTime: knownModified.get(id) ?? '', pending: true }))
      return upload(id, document, content, folderId)
    },
    async remove(id) {
      try {
        await call(env, `${FILES_URL}/${encodeURIComponent(id)}`, { method: 'DELETE' })
      } catch (error) {
        if (!(error instanceof DriveHttpError && error.status === 404)) throw error
      }
      knownModified.delete(id)
      await quietly(cache?.remove(id))
    },
    async move(id, folderId) {
      const { parentOf, diagramFiles } = organise(await listAll(env))
      const file = diagramFiles.find((entry) => entry.id === id)
      if (!file) throw new Error('That diagram no longer exists.')
      if (parentOf(file) === folderId) return id
      const params = new URLSearchParams({ addParents: folderId ?? ROOT_ALIAS, removeParents: (file.parents ?? []).join(','), fields: 'id,modifiedTime' })
      const result = await (await call(env, `${FILES_URL}/${encodeURIComponent(id)}?${params}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json() as DriveFile
      if (result.modifiedTime && knownModified.has(id)) knownModified.set(id, result.modifiedTime)
      return id
    },
    async createFolder(name, parentId, reuse = false) {
      const clean = cleanFolderName(name)
      if (reuse) {
        const existing = organise(await listAll(env)).folders.find((folder) => (folder.parentId ?? null) === parentId && folder.name.toLowerCase() === clean.toLowerCase())
        if (existing) return existing.id
      }
      const result = await (await call(env, `${FILES_URL}?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean, mimeType: FOLDER_MIME, parents: [parentId ?? ROOT_ALIAS] }),
      })).json() as DriveFile
      return result.id
    },
    async setStarred(id, starred) {
      const result = await (await call(env, `${FILES_URL}/${encodeURIComponent(id)}?fields=id,modifiedTime`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // null removes the property; the diagram's contents are never sent
        body: JSON.stringify({ appProperties: { starred: starred ? STARRED_VALUE : null } }),
      })).json() as DriveFile
      // If Drive moved the file's modified time, remember it, so the next save is not mistaken for a clash with another device.
      if (result.modifiedTime && knownModified.has(id)) {
        knownModified.set(id, result.modifiedTime)
        try {
          const cached = cache ? await cache.get(id) : null
          if (cached) await cache?.setState(id, { modifiedTime: result.modifiedTime, pending: cached.pending })
        } catch { /* the browser copy keeps its older time; the next download corrects it */ }
      }
    },
    async renameFolder(id, name) {
      await call(env, `${FILES_URL}/${encodeURIComponent(id)}?fields=id`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanFolderName(name) }),
      })
      return null
    },
    async deleteFolder(id) {
      const { folders, documents } = organise(await listAll(env))
      const ids = folderAndDescendantIds(folders, id)
      const inside = new Set(ids)
      const deleted: string[] = []
      const quietDelete = async (target: string) => {
        try { await call(env, `${FILES_URL}/${encodeURIComponent(target)}`, { method: 'DELETE' }) } catch (error) {
          if (!(error instanceof DriveHttpError && error.status === 404)) throw error
        }
      }
      for (const entry of documents) {
        if (entry.folderId && inside.has(entry.folderId)) {
          await quietDelete(entry.id)
          knownModified.delete(entry.id)
          await quietly(cache?.remove(entry.id))
          deleted.push(entry.id)
        }
      }
      for (const folderId of [...ids].reverse()) await quietDelete(folderId)
      return deleted
    },
  }
}
