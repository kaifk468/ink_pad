import { useCallback, useEffect, useRef, useState } from 'react'
import type { CanvasItem } from '../canvasModel'
import { DEFAULT_DOCUMENT_TITLE, cleanTitle, createDocument, documentFileName, isLossyParse, parseDocument, sameSignature, stringifyDocument, type DocumentPageBackground, type DocumentPageSpacing, type DocumentSignature, type DocumentPageTemplate, type InkPadDocument } from '../documentFormat'
import { deleteThumbnail, downloadBlob, loadCurrentDocumentId, loadStoredDocument, loadThumbnails, saveCurrentDocumentId, saveThumbnail, type DocumentSummary, type FolderRecord } from '../documentStore'
import { shouldRefreshLibrary } from '../libraryRefresh'
import { copyStoredDiagram as copyDiagramOnBackend } from '../libraryCopy'
import { PAGE_PREVIEW_TOO_LARGE, THUMBNAIL_MAX_SVG_CHARS, thumbnailSize } from '../thumbnail'
import { moveStarred, readStarred, starsToUpload, toggleStarred, writeStarred } from '../starred'
import { STORAGE_MODE_KEY, createDeviceBackend, isDeviceFolderSupported, loadDeviceHandle, pickDeviceFolder, queryDevicePermission, requestDevicePermission, saveDeviceHandle, type DirHandle } from '../deviceStore'
import { diagramsInFolder, folderAndDescendantIds } from '../folderTree'
import { DriveAuthError, DriveHttpError, createDriveBackend, fetchDriveProfile, type DriveEnv } from '../googleDrive'
import { createIndexedDbDriveCache, type DriveCache } from '../driveCache'
import { loadLocalCopyForSearch } from '../librarySearchLoad'
import { readStoredProfile, writeStoredProfile, type DriveProfile } from '../driveProfile'
import { REFRESH_WINDOW_MS, driveAuth, driveExportAuth } from '../googleAuth'
import { uploadDiagramPdf } from '../driveExport'
import { renderDiagramPdf } from '../notebookExport'
import { copyAllBetweenBackends, createBrowserBackend, type StorageBackend } from '../storageBackend'
import type { SaveStatus } from '../FilePanel'
import { PAGE_BACKGROUND_COLORS } from '../pageBackground'
import { buildSheetSvg, cropSvg, getContentBounds, svgToPngBlob } from '../sheetExport'
import { SHEET_HEIGHT, SHEET_WIDTH } from '../viewport'
import { COPY_IMAGE_FAILED, exportBaseName, isSelectionExport, itemsForExport, readTransparentExport, usesExcalifont, writeTransparentExport } from '../exportOptions'
import { loadExcalifontCss } from '../fontEmbed'
import { readLastPage } from '../pages'
import { acquireTabLock, createIndexedDbSafetyStore, createLocalStorageEmergency, createLocalStoragePointer, createSafetyKeeper, type RestoredCopy, type SafetyKeeper } from '../safetyCopy'

/**
 * What the document layer needs from the drawing surface. Keeping this small is the seam between
 * "which diagram is open / saved" (this hook) and "how the canvas is edited" (App).
 */
export type DocumentHost = {
  /** The items of the page on screen. */
  getItems: () => CanvasItem[]
  /** The items of every page in order (page 1 first), including the live items of the page on screen. */
  getPageItems: () => CanvasItem[][]
  /** The name of every page in order ('' = unnamed), same length as getPageItems. */
  getPageNames: () => string[]
  getPage: () => { template: DocumentPageTemplate; background: DocumentPageBackground; spacing?: DocumentPageSpacing; sheetHeight?: number; sketchy?: boolean }
  /** True while a pen/touch stroke or gesture is in progress; autosave waits for it to end. */
  isInputActive: () => boolean
  /** Replace the sheet contents and page settings, reset undo history, id counters and selection, and redraw. */
  loadDocument: (document: InkPadDocument, startPage: number) => void
}

const AUTOSAVE_DELAY_MS = 1200
const SAFETY_FLUSH_WAIT_MS = 3000
const DEVICE_CURRENT_KEY = 'inkpad.currentDocument.device'
const DRIVE_CURRENT_KEY = 'inkpad.currentDocument.drive'
const STARTUP_SIGN_IN_WAIT_MS = 9000
const SILENT_RENEW_CHECK_MS = 30000

export type StorageInfo = {
  kind: 'browser' | 'device' | 'drive'
  /** Name of the chosen device folder, when kind is 'device'. */
  folderName: string | null
  /** The device folder or Google sign-in is remembered but needs a tap to be allowed again. */
  locked: boolean
  /** This browser can pick a device folder (needs a secure address and Chrome or Edge). */
  supported: boolean
}

function readKeyedCurrentId(key: string): string | null {
  try { return window.localStorage.getItem(key) } catch { return null }
}
function writeKeyedCurrentId(key: string, id: string | null) {
  try {
    if (id) window.localStorage.setItem(key, id)
    else window.localStorage.removeItem(key)
  } catch { /* the diagram just will not reopen automatically */ }
}
type StorageMode = 'browser' | 'device' | 'drive'
function writeStorageMode(mode: StorageMode) {
  try { window.localStorage.setItem(STORAGE_MODE_KEY, mode) } catch { /* ignore */ }
}
function readStorageMode(): StorageMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_MODE_KEY)
    return stored === 'device' || stored === 'drive' ? stored : 'browser'
  } catch { return 'browser' }
}
// Background requests (saves, listings) only ever try the quiet token request; the interactive one is for taps.
const driveEnv: DriveEnv = { getToken: (force) => driveAuth.getToken(force), fetch: (url, init) => window.fetch(url, init) }
let driveCache: DriveCache | null = null
const getDriveCache = () => (driveCache ??= createIndexedDbDriveCache())
const driveExportEnv: DriveEnv = { getToken: (force) => driveExportAuth.getToken(force), fetch: (url, init) => window.fetch(url, init) }
const createAppDriveBackend = () => createDriveBackend(driveEnv, { cache: getDriveCache() })
const withTimeout = <T,>(work: Promise<T>, ms: number): Promise<T> => new Promise<T>((resolve, reject) => {
  const timer = window.setTimeout(() => reject(new DriveAuthError()), ms)
  work.then((value) => { window.clearTimeout(timer); resolve(value) }, (error) => { window.clearTimeout(timer); reject(error) })
})
const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback)

export function useDocuments(host: DocumentHost) {
  /** Writes the safety copy before leaving a diagram, but never waits more than a few seconds for a browser store that does not answer. */
  const flushCopy = (): Promise<void> => Promise.race([keeper.flush().catch(() => undefined), new Promise<void>((resolve) => window.setTimeout(resolve, SAFETY_FLUSH_WAIT_MS))])
  const hostRef = useRef(host)
  hostRef.current = host

  const [filePanelOpen, setFilePanelOpen] = useState(false)
  const [storagePanelOpen, setStoragePanelOpen] = useState(false)
  const [docTitle, setDocTitle] = useState(DEFAULT_DOCUMENT_TITLE)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [fileNotice, setFileNotice] = useState<string | null>(null)
  const [exportBusy, setExportBusy] = useState(false)
  const [library, setLibrary] = useState<DocumentSummary[]>([])
  /** Stars kept in this browser (all stars on browser and device storage; on Drive only ones not yet uploaded). */
  const [localStars, setLocalStars] = useState<string[]>(readStarred)
  const localStarsRef = useRef(localStars)
  localStarsRef.current = localStars
  const changeLocalStars = (update: (ids: string[]) => string[]) => {
    const next = update(localStarsRef.current)
    localStarsRef.current = next
    writeStarred(next)
    setLocalStars(next)
  }
  const starUploadRunningRef = useRef(false)
  /** Small page pictures for the Library cards, by diagram id. They live in this browser only. */
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  /** What the open diagram looked like when its picture was last made, so an unchanged diagram is not pictured again. */
  const thumbnailOfRef = useRef<{ id: string; signature: DocumentSignature } | null>(null)
  const [currentDocId, setCurrentDocId] = useState<string | null>(null)
  const [folders, setFolders] = useState<FolderRecord[]>([])
  const [driveProfile, setDriveProfile] = useState<DriveProfile | null>(() => (readStorageMode() === 'drive' ? readStoredProfile() : null))
  const [storage, setStorage] = useState<StorageInfo>({ kind: 'browser', folderName: null, locked: false, supported: isDeviceFolderSupported() })
  const pendingFolderRef = useRef<string | null>(null)

  const backendRef = useRef<StorageBackend>(createBrowserBackend())
  const deviceHandleRef = useRef<DirHandle | null>(null)
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())
  const forceSaveRef = useRef(false)
  const docIdRef = useRef<string | null>(null)
  const docMetaRef = useRef<{ title: string; createdAt?: string }>({ title: DEFAULT_DOCUMENT_TITLE })
  const readyRef = useRef(false)
  const filePanelOpenRef = useRef(false)
  const autosaveTimerRef = useRef<number | null>(null)
  filePanelOpenRef.current = filePanelOpen

  const readCurrentId = () => {
    const kind = backendRef.current.kind
    return kind === 'device' ? readKeyedCurrentId(DEVICE_CURRENT_KEY) : kind === 'drive' ? readKeyedCurrentId(DRIVE_CURRENT_KEY) : loadCurrentDocumentId()
  }
  const writeCurrentId = (id: string | null) => {
    const kind = backendRef.current.kind
    if (kind === 'device') writeKeyedCurrentId(DEVICE_CURRENT_KEY, id)
    else if (kind === 'drive') writeKeyedCurrentId(DRIVE_CURRENT_KEY, id)
    else saveCurrentDocumentId(id)
  }
  const unsavedWhileLockedRef = useRef(false)
  /** What the open diagram looked like when it was last saved or loaded; an unchanged diagram is not saved again. */
  const savedSignatureRef = useRef<DocumentSignature | null>(null)

  /** True when any page holds something; a diagram with only empty pages counts as blank. */
  const hasAnyItems = () => hostRef.current.getPageItems().some((items) => items.length > 0)

  const buildCurrentDocument = (): InkPadDocument => {
    const page = hostRef.current.getPage()
    return createDocument({
      title: docMetaRef.current.title,
      createdAt: docMetaRef.current.createdAt,
      template: page.template,
      background: page.background,
      spacing: page.spacing,
      sheetHeight: page.sheetHeight,
      sketchy: page.sketchy,
      items: hostRef.current.getPageItems()[0] ?? [],
      extraPages: hostRef.current.getPageItems().slice(1),
      pageNames: hostRef.current.getPageNames(),
      shareStrokes: true,
    })
  }

  /**
   * What the diagram holds, without its save time: title, page settings and the list of items. Items are never edited in
   * place (every change replaces the item with a new object), so the same objects in the same order mean the same content.
   * Comparing references costs one pass over the item list; building and comparing the whole document text cost tens of
   * milliseconds per autosave on a large page and grew with every stroke.
   */
  const currentSignature = (): DocumentSignature => {
    const page = hostRef.current.getPage()
    return { title: docMetaRef.current.title, template: page.template, background: page.background, spacing: page.spacing, sheetHeight: page.sheetHeight, sketchy: page.sketchy, items: (hostRef.current.getPageItems()[0] ?? []).slice(), extraPages: hostRef.current.getPageItems().slice(1).map((items) => items.slice()), pageNames: hostRef.current.getPageNames() }
  }

  /**
   * The safety copy (see safetyCopy.ts): a local copy of the open diagram that is written even while the real storage is
   * locked or its autosave has not run yet. Writes are held until the startup restore check has finished.
   */
  const keeperRef = useRef<SafetyKeeper<DocumentSignature> | null>(null)
  const safetyTextRef = useRef<{ signature: DocumentSignature; text: string } | null>(null)
  /** False in a second tab: only the tab holding the lock restores copies and uploads leftovers, so they are never duplicated. */
  const leaderRef = useRef(true)
  if (!keeperRef.current) {
    const keeperStorage = (() => { try { return window.localStorage } catch { return null } })()
    keeperRef.current = createSafetyKeeper<DocumentSignature>({
      store: createIndexedDbSafetyStore(),
      setTimeout: (callback, ms) => window.setTimeout(callback, ms),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
      now: () => Date.now(),
      pointer: createLocalStoragePointer(keeperStorage ?? { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }),
      emergency: keeperStorage ? createLocalStorageEmergency(keeperStorage) : undefined,
      idle: typeof window.requestIdleCallback === 'function' ? (callback) => { window.requestIdleCallback(callback, { timeout: 1000 }) } : undefined,
      getKind: () => backendRef.current.kind,
      getDocId: () => docIdRef.current,
      getFolderId: () => pendingFolderRef.current,
      hasContent: () => hasAnyItems(),
      isInputActive: () => hostRef.current.isInputActive(),
      signature: () => currentSignature(),
      backendSignature: () => savedSignatureRef.current,
      sameSignature,
      // shares the stroke JSON cached by the normal autosave, so this is cheap; one text per signature (the pagehide emergency copy and the flush share it)
      buildText: () => {
        const signature = currentSignature()
        const cached = safetyTextRef.current
        if (cached && sameSignature(cached.signature, signature)) return cached.text
        const text = stringifyDocument(buildCurrentDocument())
        safetyTextRef.current = { signature, text }
        return text
      },
    })
    keeperRef.current.hold()
  }
  const keeper = keeperRef.current
  /** A diagram came back from the safety copy at startup; the storage's own copy must not replace it. */
  const restoredRef = useRef(false)

  /** When the library list last came from the storage; every in-app change (save, create, rename, move, delete) calls refreshLibrary, which renews it. */
  const libraryListedAtRef = useRef<number | null>(null)
  /** For the command palette: reuses a list fetched in the last 30 s. */
  const refreshLibraryIfStale = async () => {
    if (shouldRefreshLibrary(libraryListedAtRef.current, Date.now())) await refreshLibrary()
  }

  const refreshLibrary = async () => {
    const backend = backendRef.current
    libraryListedAtRef.current = null
    if (backend.listCached) {
      // show the last known list at once; the fresh one replaces it when it arrives
      try {
        const cached = await backend.listCached()
        if (cached && backendRef.current === backend) { setLibrary(cached.documents); setFolders(cached.folders) }
      } catch { /* nothing cached */ }
    }
    try {
      const listed = await backend.list()
      if (backendRef.current !== backend) return
      setLibrary(listed.documents)
      setFolders(listed.folders)
      libraryListedAtRef.current = Date.now()
      void uploadLocalStars(backend, listed.documents)
    } catch {
      // Keep the list already shown (Drive offline, a failed refresh); the Library's own notice and status say why it could not refresh.
    }
  }

  /** Stars made in this browser before Drive kept them (or while Drive could not be reached) are put on Drive once. */
  const uploadLocalStars = async (backend: StorageBackend, documents: DocumentSummary[]) => {
    if (!backend.setStarred || starUploadRunningRef.current) return
    const { upload, drop } = starsToUpload(localStarsRef.current, documents)
    if (upload.length === 0 && drop.length === 0) return
    starUploadRunningRef.current = true
    const done = [...drop]
    try {
      for (const id of upload) {
        try {
          await backend.setStarred(id, true)
          done.push(id)
        } catch {
          break // offline or signed out: try again next time the list loads
        }
      }
    } finally {
      starUploadRunningRef.current = false
    }
    if (backendRef.current !== backend || done.length === 0) return
    const moved = new Set(done)
    changeLocalStars((ids) => ids.filter((id) => !moved.has(id)))
    setLibrary((current) => current.map((entry) => (moved.has(entry.id) ? { ...entry, starred: true } : entry)))
  }

  /** Stars or unstars a diagram: on Drive as a tag on the file (shown at once, put back if Drive refuses), elsewhere in this browser. */
  const toggleStar = async (id: string) => {
    const backend = backendRef.current
    const entry = library.find((item) => item.id === id)
    const wasStarred = Boolean(entry?.starred) || localStarsRef.current.includes(id)
    const next = !wasStarred
    if (!backend.setStarred) {
      changeLocalStars((ids) => toggleStarred(ids, id))
      return
    }
    const setOnList = (value: boolean | undefined) => setLibrary((current) => current.map((item) => (item.id === id ? { ...item, starred: value } : item)))
    setOnList(next)
    if (!next) changeLocalStars((ids) => ids.filter((item) => item !== id))
    try {
      await backend.setStarred(id, next)
    } catch {
      if (backendRef.current !== backend) return
      setOnList(entry?.starred)
      if (next) {
        changeLocalStars((ids) => (ids.includes(id) ? ids : [...ids, id]))
        setFileNotice('Could not save the star to Google Drive. It is kept on this device and will be uploaded later.')
      } else {
        setFileNotice('Could not remove the star in Google Drive. Try again when you are online.')
      }
    }
  }

  const starredIds = new Set([...library.filter((entry) => entry.starred).map((entry) => entry.id), ...localStars])

  const doPersist = async () => {
    if (!readyRef.current) return
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    // Never create an empty entry for a diagram that was never drawn on.
    if (!docIdRef.current && !hasAnyItems() && !forceSaveRef.current) return
    const forced = forceSaveRef.current
    forceSaveRef.current = false
    // Nothing changed since this diagram was last saved or opened: skip the upload (switching diagrams used to save every time).
    const signature = currentSignature()
    if (docIdRef.current && !forced && sameSignature(signature, savedSignatureRef.current)) {
      void keeper.markSynced(signature, docIdRef.current, docIdRef.current) // the storage holds this content, so any local copy of it is clean
      setSaveStatus('saved')
      return
    }
    const backend = backendRef.current
    const saved = buildCurrentDocument()
    setSaveStatus('saving')
    try {
      const previousId = docIdRef.current
      const newId = await backend.save(previousId, saved, pendingFolderRef.current)
      if (backendRef.current !== backend) return // storage was switched while saving
      pendingFolderRef.current = null
      docIdRef.current = newId
      docMetaRef.current = { title: saved.title, createdAt: saved.createdAt }
      savedSignatureRef.current = signature
      void keeper.markSynced(signature, previousId, newId)
      if (previousId && previousId !== newId) {
        // A device-folder file was renamed, so its id changed: the star follows it and the old picture is dropped (a new one is made when the Library opens).
        changeLocalStars((ids) => moveStarred(ids, previousId, newId))
        void deleteThumbnail(previousId).catch(() => undefined)
        setThumbnails((current) => { if (!(previousId in current)) return current; const { [previousId]: _gone, ...rest } = current; return rest })
      }
      writeCurrentId(newId)
      setCurrentDocId(newId)
      setSaveStatus('saved')
      if (filePanelOpenRef.current || previousId === null || previousId !== newId) void refreshLibrary()
    } catch (error) {
      if (error instanceof DriveAuthError && backendRef.current === backend) {
        // Google sign-in lapsed: stop autosaving, remember the sheet is unsaved, and ask for a tap.
        readyRef.current = false
        unsavedWhileLockedRef.current = true
        setStorage((current) => ({ ...current, locked: true }))
        setSaveStatus('locked')
        return
      }
      setSaveStatus('error')
    }
  }

  // Saves run one after another so a rename (write new file, remove old) can never overlap another save.
  const persistNow = (): Promise<void> => {
    const run = saveChainRef.current.then(doPersist, doPersist)
    saveChainRef.current = run
    return run
  }

  const scheduleAutosave = () => {
    keeper.noteChange() // the safety copy is kept even when the storage is locked
    if (!readyRef.current) return
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null
      // Wait until the pen is up so a half-drawn stroke is never the saved state.
      if (hostRef.current.isInputActive()) {
        scheduleAutosave()
        return
      }
      void persistNow()
    }, AUTOSAVE_DELAY_MS)
  }

  const applyDocument = (id: string | null, loaded: InkPadDocument) => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    pendingFolderRef.current = null
    forceSaveRef.current = false
    hostRef.current.loadDocument(loaded, id ? readLastPage(id) : 0)
    docIdRef.current = id
    docMetaRef.current = { title: loaded.title, createdAt: loaded.createdAt }
    savedSignatureRef.current = id ? currentSignature() : null
    setCurrentDocId(id)
    setDocTitle(loaded.title)
    writeCurrentId(id)
    setSaveStatus(id ? 'saved' : 'idle')
  }

  /** Shows a diagram from the safety copy. It counts as unsaved, so it is written to the storage as soon as that is ready. */
  const applyLocalCopy = ({ record, document: loaded }: RestoredCopy) => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    hostRef.current.loadDocument(loaded, record.docId ? readLastPage(record.docId) : 0)
    docIdRef.current = record.docId
    docMetaRef.current = { title: loaded.title, createdAt: loaded.createdAt }
    pendingFolderRef.current = record.folderId
    savedSignatureRef.current = null
    unsavedWhileLockedRef.current = true
    forceSaveRef.current = !record.docId
    setDocTitle(loaded.title)
    setCurrentDocId(record.docId)
    if (record.docId) writeCurrentId(record.docId)
    keeper.adopt(record)
  }

  /** Drive has a newer version than the browser copy that was shown. Swap it in only if the diagram is still open and nothing was edited here since. */
  const fresherVersion = (backend: StorageBackend, id: string) => (fresher: InkPadDocument): boolean => {
    if (backendRef.current !== backend || docIdRef.current !== id || hostRef.current.isInputActive()) return false
    if (!sameSignature(currentSignature(), savedSignatureRef.current)) return false
    applyDocument(id, fresher)
    return true
  }

  const blankDocument = (template?: DocumentPageTemplate) => {
    const page = hostRef.current.getPage()
    return createDocument({ template: template ?? page.template, background: page.background, spacing: page.spacing, items: [] })
  }

  const newDiagram = async (template?: DocumentPageTemplate) => {
    await persistNow()
    await flushCopy()
    setFileNotice(null)
    applyDocument(null, blankDocument(template))
    void keeper.switchTo(null)
    writeCurrentId(null)
    void refreshLibrary()
  }

  const openStoredDiagram = async (id: string) => {
    await persistNow()
    await flushCopy()
    try {
      const backend = backendRef.current
      // a copy with edits the storage never got (it was locked) is shown instead, and saved when the storage is ready
      const local = await keeper.recordFor(backend.kind, id)
      let stored: InkPadDocument | null = null
      try {
        stored = await backend.load(id, local ? () => false : fresherVersion(backend, id))
      } catch (error) {
        if (!local) throw error
      }
      if (local) {
        setFileNotice(null)
        applyLocalCopy(local)
        setFilePanelOpen(false)
        void persistNow()
        return
      }
      if (!stored) {
        setFileNotice('That diagram no longer exists.')
        void refreshLibrary()
        return
      }
      setFileNotice(null)
      applyDocument(id, stored)
      void keeper.switchTo(id)
      setFilePanelOpen(false)
    } catch {
      setFileNotice('Could not open that diagram.')
    }
  }

  const forgetCurrentDiagram = (deleted = false) => {
    docIdRef.current = null
    setCurrentDocId(null)
    writeCurrentId(null)
    setSaveStatus('idle')
    if (deleted) {
      // The sheet stays on screen but is not a diagram any more: its safety copy is stored only if it is edited afterwards.
      void keeper.switchTo(null)
      keeper.markStored()
    }
  }

  /** Runs a store delete in the save chain, so it never overlaps a save, rename or move. */
  const inSaveChain = async <T,>(body: () => Promise<T>): Promise<T> => {
    const run = saveChainRef.current.then(body, body)
    saveChainRef.current = run.then(() => undefined, () => undefined)
    return run
  }

  const deleteStoredDiagram = async (id: string): Promise<boolean> => {
    const ok = await inSaveChain(async () => {
      try {
        await backendRef.current.remove(id)
        void keeper.forget(backendRef.current.kind, id)
        if (docIdRef.current === id) forgetCurrentDiagram(true)
        void deleteThumbnail(id).catch(() => undefined)
        if (localStarsRef.current.includes(id)) changeLocalStars((ids) => ids.filter((item) => item !== id))
        setThumbnails((current) => { if (!(id in current)) return current; const { [id]: _gone, ...rest } = current; return rest })
        return true
      } catch {
        setFileNotice('Could not delete that diagram.')
        return false
      }
    })
    await refreshLibrary()
    return ok
  }

  /** Start a blank diagram that will be saved inside the given folder (null = top level). */
  const newDiagramIn = async (folderId: string | null, template?: DocumentPageTemplate) => {
    await newDiagram(template)
    pendingFolderRef.current = folderId
  }

  const createFolder = async (name: string, parentId: string | null): Promise<boolean> => {
    setFileNotice(null)
    let ok = true
    try {
      await backendRef.current.createFolder(name, parentId)
    } catch (error) {
      setFileNotice(errorText(error, 'Could not create that folder.'))
      ok = false
    }
    void refreshLibrary()
    return ok
  }

  const renameFolder = async (id: string, name: string): Promise<boolean> => {
    setFileNotice(null)
    let ok = true
    try {
      const moved = await backendRef.current.renameFolder(id, name)
      if (moved) {
        void keeper.rekey(backendRef.current.kind, moved.from, moved.to)
        const rebase = (path: string | null) => (path === moved.from ? moved.to : path && path.startsWith(`${moved.from}/`) ? moved.to + path.slice(moved.from.length) : path)
        const nextDoc = rebase(docIdRef.current)
        if (nextDoc !== docIdRef.current) {
          docIdRef.current = nextDoc
          setCurrentDocId(nextDoc)
          writeCurrentId(nextDoc)
        }
        pendingFolderRef.current = rebase(pendingFolderRef.current)
      }
    } catch (error) {
      setFileNotice(errorText(error, 'Could not rename that folder.'))
      ok = false
    }
    void refreshLibrary()
    return ok
  }

  /** A folder is about to be deleted: new saves must not land in it any more. */
  const releaseFolderTarget = (id: string) => {
    const target = pendingFolderRef.current
    if (target && new Set(folderAndDescendantIds(folders, id)).has(target)) pendingFolderRef.current = null
  }

  /**
   * Deletes the folder, its subfolders and every diagram inside them. The UI asks for confirmation first and passes the diagram ids
   * the person saw; if the folder holds any other diagram by now (a save or copy landed in it), nothing is deleted.
   */
  const deleteFolder = async (id: string, confirmedDiagramIds?: readonly string[]): Promise<boolean> => {
    setFileNotice(null)
    const ok = await inSaveChain(async () => {
      try {
        const listed = await backendRef.current.list()
        const ids = new Set(folderAndDescendantIds(listed.folders, id))
        if (confirmedDiagramIds) {
          const confirmed = new Set(confirmedDiagramIds)
          const inside = [...ids].flatMap((folderId) => diagramsInFolder(listed.documents, folderId, listed.folders))
          if (inside.some((entry) => !confirmed.has(entry.id))) {
            const name = listed.folders.find((folder) => folder.id === id)?.name ?? 'The folder'
            setFileNotice(`“${name}” was not deleted: it has new diagrams.`)
            return false
          }
        }
        const deleted = await backendRef.current.deleteFolder(id)
        for (const gone of deleted) void keeper.forget(backendRef.current.kind, gone)
        if (docIdRef.current && deleted.includes(docIdRef.current)) forgetCurrentDiagram(true)
        if (pendingFolderRef.current && ids.has(pendingFolderRef.current)) pendingFolderRef.current = null
        return true
      } catch (error) {
        setFileNotice(errorText(error, 'Could not delete that folder.'))
        return false
      }
    })
    await refreshLibrary()
    return ok
  }

  const moveDiagram = async (docId: string, folderId: string | null): Promise<boolean> => {
    setFileNotice(null)
    let ok = true
    try {
      await persistNow()
      const newId = await backendRef.current.move(docId, folderId)
      if (newId !== docId) void keeper.rekey(backendRef.current.kind, docId, newId)
      if (docIdRef.current === docId && newId !== docId) {
        docIdRef.current = newId
        setCurrentDocId(newId)
        writeCurrentId(newId)
      }
    } catch (error) {
      setFileNotice(errorText(error, 'Could not move that diagram.'))
      ok = false
    }
    void refreshLibrary()
    return ok
  }

  /**
   * Renames a diagram from the Library. The open diagram uses the same path as the in-canvas title edit. Any other diagram is loaded
   * (fresh from the storage where it keeps a browser copy), given the new title and saved through the storage's own save (the same call
   * autosave makes). The whole thing runs inside the save chain so it can never overlap an autosave or another rename, and it checks again
   * inside the chain whether the diagram has meanwhile become the open one. A diagram whose file has damaged items or fields this version
   * does not know is not rewritten (open it first). Returns false (with a notice) when it could not be done, 'unchanged' when the storage
   * kept the old name.
   */
  const renameStoredDiagram = async (id: string, title: string): Promise<boolean | 'unchanged'> => {
    setFileNotice(null)
    const cleaned = cleanTitle(title)
    const renameOpen = async (): Promise<boolean> => {
      await renameDiagram(title)
      await refreshLibrary()
      return true
    }
    if (docIdRef.current === id) return renameOpen()
    let outcome = true as boolean | 'unchanged' | 'open'
    const body = async () => {
      try {
        if (docIdRef.current === id) { outcome = 'open'; return }
        const backend = backendRef.current
        if (await keeper.recordFor(backend.kind, id)) throw new Error('That diagram has changes that are not saved yet. Open it first, then rename it.')
        const stored = await (backend.loadFresh ? backend.loadFresh(id) : backend.load(id))
        if (!stored) throw new Error('That diagram no longer exists.')
        if (isLossyParse(stored)) throw new Error('Open this diagram first, then rename it.')
        if (docIdRef.current === id) { outcome = 'open'; return }
        const newId = await backend.save(id, { ...stored, title: cleaned }, null)
        if (backendRef.current === backend && newId !== id) {
          void keeper.rekey(backend.kind, id, newId)
          changeLocalStars((ids) => moveStarred(ids, id, newId))
          void deleteThumbnail(id).catch(() => undefined)
          setThumbnails((current) => { if (!(id in current)) return current; const { [id]: _gone, ...rest } = current; return rest })
        } else if (backend.kind === 'device' && newId === id && stored.title !== cleaned) {
          // the file name already stands for this title (copy suffix rule, "X (2)" and "X"): nothing changed
          outcome = 'unchanged'
          setFileNotice(`The name stays “${stored.title}” because this folder already has another “${cleaned}”.`)
        }
      } catch (error) {
        setFileNotice(errorText(error, 'Could not rename that diagram.'))
        outcome = false
      }
    }
    const run = saveChainRef.current.then(body, body)
    saveChainRef.current = run
    await run
    if (outcome === 'open') return renameOpen()
    await refreshLibrary()
    return outcome
  }

  /**
   * Makes a copy of a diagram from the Library: "<title> (copy)" in the same folder, all pages and items, never starred, and the
   * original is only read. For the open diagram the pending edits are saved first. It runs inside the save chain, so it can never
   * overlap an autosave, a rename or another copy, and it reads the stored version fresh (not a browser copy). A diagram with changes
   * the storage has not accepted yet, or a file this version only partly understands, is refused with a message instead of a lossy copy.
   * The copy is not opened. Returns false (with a notice) on failure.
   */
  const copyStoredDiagram = async (id: string): Promise<string | false> => {
    setFileNotice(null)
    const wasOpen = docIdRef.current === id
    if (wasOpen) await persistNow()
    let ok = true
    let madeTitle = ''
    const body = async () => {
      try {
        const backend = backendRef.current
        // The open diagram is judged by what this editor knows (its saved signature); a device rename on save changes its id, so the copy reads the current id.
        let sourceId = id
        if (wasOpen && docIdRef.current) {
          if (!sameSignature(currentSignature(), savedSignatureRef.current)) throw new Error('That diagram has changes that are not saved yet. Wait until it is saved, then copy it.')
          sourceId = docIdRef.current
        } else if (await keeper.recordFor(backend.kind, id)) throw new Error('That diagram has changes that are not saved yet. Wait until it is saved, then copy it.')
        const folderId = library.find((entry) => entry.id === sourceId || entry.id === id)?.folderId ?? null
        const made = await copyDiagramOnBackend(backend, sourceId, folderId)
        madeTitle = made.title
        // the copy starts with the original's picture (stored apart from the diagram, by id)
        const picture = thumbnails[id]
        if (picture && backendRef.current === backend) {
          try {
            await saveThumbnail(made.id, picture)
            setThumbnails((current) => ({ ...current, [made.id]: picture }))
          } catch { /* the card shows an icon until it is opened */ }
        }
      } catch (error) {
        setFileNotice(errorText(error, 'Could not copy that diagram.'))
        ok = false
      }
    }
    const run = saveChainRef.current.then(body, body)
    saveChainRef.current = run
    await run
    await refreshLibrary()
    return ok ? madeTitle : false
  }

  const renameDiagram = (title: string): Promise<void> => {
    const cleaned = cleanTitle(title)
    docMetaRef.current = { ...docMetaRef.current, title: cleaned }
    setDocTitle(cleaned)
    return docIdRef.current || hasAnyItems() ? persistNow() : Promise.resolve()
  }

  const exportDocumentFile = () => {
    const exported = buildCurrentDocument()
    downloadBlob(new Blob([stringifyDocument(exported)], { type: 'application/json' }), documentFileName(exported.title))
  }

  const importDocumentFile = async (file: File) => {
    try {
      const result = parseDocument(await file.text())
      if (!result.ok) {
        setFileNotice(result.error)
        return
      }
      await persistNow()
      await flushCopy()
      applyDocument(null, result.document)
      void keeper.switchTo(null)
      keeper.noteChange()
      forceSaveRef.current = true
      await persistNow()
      setFileNotice(result.droppedItems ? `Imported with ${result.droppedItems} damaged item${result.droppedItems === 1 ? '' : 's'} skipped.` : `Imported “${result.document.title}”.`)
      void refreshLibrary()
    } catch {
      setFileNotice('Could not read that file.')
    }
  }

  /** "Transparent background" in the export panel (remembered in this browser; off by default). */
  const [transparentExport, setTransparentExportState] = useState(() => readTransparentExport(typeof localStorage === 'undefined' ? null : localStorage))
  const transparentExportRef = useRef(transparentExport)
  transparentExportRef.current = transparentExport
  const setTransparentExport = (value: boolean) => {
    setTransparentExportState(value)
    writeTransparentExport(typeof localStorage === 'undefined' ? null : localStorage, value)
  }

  type ImageExportOptions = { keys?: ReadonlySet<string> | null; transparent?: boolean; fontCss?: string }
  /** The picture of one page: the one on screen for exports, the first page for the Library picture. */
  const getImageExport = (which: 'current' | 'first' | number = 'current', options: ImageExportOptions = {}) => {
    const all = which === 'current' ? hostRef.current.getItems() : (hostRef.current.getPageItems()[which === 'first' ? 0 : which] ?? [])
    const items = itemsForExport(all, options.keys)
    const page = hostRef.current.getPage()
    const sheetHeight = page.sheetHeight ?? SHEET_HEIGHT
    const bounds = getContentBounds(items, { width: SHEET_WIDTH, height: sheetHeight })
    if (!bounds) return null
    const svg = cropSvg(buildSheetSvg(items, {
      width: SHEET_WIDTH,
      height: sheetHeight,
      template: page.template,
      spacing: page.spacing,
      backgroundColor: PAGE_BACKGROUND_COLORS[page.background],
      ...(page.sketchy ? { sketchy: true } : {}),
      ...(options.transparent ? { transparent: true } : {}),
      ...(options.fontCss ? { embeddedFontCss: options.fontCss } : {}),
    }), bounds)
    const baseName = exportBaseName(documentFileName(docMetaRef.current.title).replace(/\.inkpad$/, ''), isSelectionExport(options.keys))
    return { svg, bounds, baseName, usesFont: usesExcalifont(items) }
  }
  /** Export for people: honours the transparent choice, and embeds Excalifont when an exported label uses it (never fails because of the font). */
  const getUserImageExport = async (keys?: ReadonlySet<string> | null) => {
    const options: ImageExportOptions = { keys, transparent: transparentExportRef.current }
    const probe = getImageExport('current', options)
    if (!probe || !probe.usesFont) return probe
    try { return getImageExport('current', { ...options, fontCss: await loadExcalifontCss() }) } catch { return probe }
  }

  /**
   * A small picture (PNG data URL) of page `index` for the page overview, null for a blank page, or PAGE_PREVIEW_TOO_LARGE for one too large to draw cheaply.
   * Called one page at a time, only while the overview is open (never while writing).
   */
  const renderPageThumbnail = async (index: number): Promise<string | null> => {
    const exported = getImageExport(index)
    if (!exported) return null
    if (exported.svg.length > THUMBNAIL_MAX_SVG_CHARS) return PAGE_PREVIEW_TOO_LARGE
    const size = thumbnailSize(exported.bounds.width, exported.bounds.height)
    const blob = await svgToPngBlob(exported.svg, size.width, size.height, 1)
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error ?? new Error('Could not read the picture.'))
      reader.readAsDataURL(blob)
    })
  }

  /**
   * Makes the Library picture of the open diagram. It runs only when the Library opens (never while writing, because it
   * draws the whole page once) and only if the diagram changed since its last picture. A page too large to draw cheaply
   * keeps its old picture or icon.
   */
  const captureThumbnail = async () => {
    const id = docIdRef.current
    if (!id || !readyRef.current || hostRef.current.isInputActive()) return
    const signature = currentSignature()
    const last = thumbnailOfRef.current
    if (last && last.id === id && sameSignature(signature, last.signature)) return
    const exported = getImageExport('first')
    try {
      if (!exported) {
        thumbnailOfRef.current = { id, signature }
        await deleteThumbnail(id)
        setThumbnails((current) => { if (!(id in current)) return current; const { [id]: _gone, ...rest } = current; return rest })
        return
      }
      if (exported.svg.length > THUMBNAIL_MAX_SVG_CHARS) return
      const size = thumbnailSize(exported.bounds.width, exported.bounds.height)
      const blob = await svgToPngBlob(exported.svg, size.width, size.height, 1)
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error ?? new Error('Could not read the picture.'))
        reader.readAsDataURL(blob)
      })
      if (docIdRef.current !== id) return
      await saveThumbnail(id, dataUrl)
      thumbnailOfRef.current = { id, signature }
      setThumbnails((current) => ({ ...current, [id]: dataUrl }))
    } catch { /* the card keeps its icon or older picture */ }
  }

  /** Returns an error message, or null when it worked. `keys`: export only that selection. */
  const exportSvgFile = async (keys?: ReadonlySet<string> | null): Promise<string | null> => {
    const exported = await getUserImageExport(keys)
    if (!exported) return 'Nothing to export'
    downloadBlob(new Blob([exported.svg], { type: 'image/svg+xml' }), `${exported.baseName}.svg`)
    return null
  }

  const exportPngFile = async (scale: 1 | 2, keys?: ReadonlySet<string> | null): Promise<string | null> => {
    const exported = await getUserImageExport(keys)
    if (!exported) return 'Nothing to export'
    try {
      const blob = await svgToPngBlob(exported.svg, exported.bounds.width, exported.bounds.height, scale)
      downloadBlob(blob, `${exported.baseName}${scale === 2 ? '@2x' : ''}.png`)
      setFileNotice(null)
      return null
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PNG export failed.'
      setFileNotice(message)
      return message
    }
  }

  /**
   * Copies the selection (or the whole page) to the system clipboard as a 2x PNG. The clipboard item gets a promise so the
   * browser keeps the click or key press as the permission gesture while the picture is made. Returns an error message or null.
   */
  const copyPngToClipboard = async (keys?: ReadonlySet<string> | null): Promise<string | null> => {
    const options: ImageExportOptions = { keys, transparent: transparentExportRef.current }
    if (!getImageExport('current', options)) return 'Nothing to copy'
    const Item = typeof window === 'undefined' ? undefined : (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem
    if (!Item || !navigator.clipboard?.write) return COPY_IMAGE_FAILED
    try {
      const blobPromise = (async () => {
        const exported = await getUserImageExport(keys)
        if (!exported) throw new Error('Nothing to copy')
        return svgToPngBlob(exported.svg, exported.bounds.width, exported.bounds.height, 2)
      })()
      await navigator.clipboard.write([new Item({ 'image/png': blobPromise })])
      return null
    } catch {
      return COPY_IMAGE_FAILED
    }
  }

  /**
   * Exports the open diagram as one PDF (all pages, pen strokes on white) into the "InkPad exports" folder of the person's Google
   * Drive, replacing the file from the last export, so NotebookLM can import it and keep one source per diagram.
   */
  const exportToNotebookLm = async () => {
    if (exportBusy) return
    setExportBusy(true)
    setFileNotice('Exporting to Google Drive…')
    try {
      // Sign in first: Google's window only opens while the tap still counts, and drawing the pages can take a few seconds.
      await driveExportAuth.getToken(false, true)
      await persistNow()
      const docId = docIdRef.current
      if (!docId) {
        setFileNotice('Save the diagram first, then export it.')
        return
      }
      const rendered = await renderDiagramPdf(hostRef.current.getPageItems(), hostRef.current.getPage().sheetHeight ?? SHEET_HEIGHT, hostRef.current.getPage().sketchy === true)
      if (!rendered) {
        setFileNotice('Nothing to export yet.')
        return
      }
      const baseName = documentFileName(docMetaRef.current.title).replace(/\.inkpad$/, '')
      const result = await uploadDiagramPdf(driveExportEnv, { docId, name: `${baseName}.pdf`, pdf: rendered.pdf })
      const pages = `${rendered.pageCount} page${rendered.pageCount === 1 ? '' : 's'}`
      setFileNotice(result.updated
        ? `Updated “${baseName}” (${pages}) in Google Drive › InkPad exports. NotebookLM refreshes it from Drive; if not, tap “Click to sync with Google Drive” on the source.`
        : `Exported “${baseName}” (${pages}) to Google Drive › InkPad exports. In NotebookLM choose Add source › Google Drive and pick it.`)
    } catch (error) {
      setFileNotice(error instanceof DriveAuthError
        ? 'Google sign-in was not completed, so nothing was exported. Tap the button to try again.'
        : error instanceof DriveHttpError && error.status === 403
          ? 'Google Drive refused the export. InkPad needs permission to create files in your Drive.'
          : errorText(error, 'Could not export to Google Drive.'))
    } finally {
      setExportBusy(false)
    }
  }

  useEffect(() => {
    if (filePanelOpen) void refreshLibrary()
  }, [filePanelOpen])

  useEffect(() => {
    void loadThumbnails().then(setThumbnails).catch(() => undefined)
  }, [])

  /** Fetches who is signed in and remembers it. Another Google account than before means the browser copies belong to someone else, so they are dropped. */
  const loadDriveProfile = async () => {
    try {
      const profile = await fetchDriveProfile(driveEnv)
      const previous = readStoredProfile()
      if (previous?.email && profile.email && previous.email !== profile.email) {
        await keeper.dropKind('drive') // copies kept for the other account must never be uploaded into this one
        await getDriveCache().clear().catch(() => undefined)
      }
      writeStoredProfile(profile)
      setDriveProfile(profile)
    } catch { /* keep the remembered name and photo */ }
  }

  /** Reopen the last diagram of the active storage, then enable autosave (it stays off until this finishes, so a slow read can never be overwritten by an empty sheet). */
  const finishStartup = async (isCancelled: () => boolean = () => false) => {
    const restored = restoredRef.current
    const id = restored ? docIdRef.current : readCurrentId()
    if (id) {
      try {
        const backend = backendRef.current
        // For a restored diagram the load only lets the storage learn the file's modified time (Drive conflict copies); the copy stays.
        const stored = restored ? await backend.load(id) : await backend.load(id, fresherVersion(backend, id))
        if (!restored && !isCancelled() && stored && !hasAnyItems()) applyDocument(id, stored)
      } catch {
        // Storage unavailable: start with an empty sheet; saving will report the problem.
      }
    }
    if (isCancelled()) return
    readyRef.current = true
    if (restored) {
      restoredRef.current = false
      await persistNow()
      unsavedWhileLockedRef.current = false
    }
    await uploadLeftovers()
  }

  /** Diagrams kept only in the safety copy (drawn while storage was locked, then another diagram was opened) go to the storage now. A copy is dropped only after its save worked. */
  const uploadLeftovers = async () => {
    if (!leaderRef.current) return
    const backend = backendRef.current
    const kind = backend.kind
    let leftovers: RestoredCopy[] = []
    try { leftovers = await keeper.leftovers(kind) } catch { return }
    for (const { record, document: copy } of leftovers) {
      if (backendRef.current !== backend || !readyRef.current) return
      // the open diagram is not a leftover (the check is repeated right before saving)
      const isOpen = () => record.key === keeper.currentKey() || (record.docId !== null && record.docId === docIdRef.current)
      if (isOpen()) continue
      const run = saveChainRef.current.then(async () => {
        try {
          if (isOpen() || backendRef.current !== backend || !readyRef.current) return
          if (record.docId) await backend.load(record.docId)
          if (isOpen() || backendRef.current !== backend || !readyRef.current) return
          await backend.save(record.docId, copy, record.docId ? null : record.folderId)
          await keeper.discardUploaded(record.key, record.rev)
        } catch { /* the record stays and is tried again next time */ }
      })
      saveChainRef.current = run
      await run
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const mode = readStorageMode()
      let handle: DirHandle | null = null
      if (readStorageMode() === 'drive') {
        backendRef.current = createAppDriveBackend()
        setStorage({ kind: 'drive', folderName: null, locked: false, supported: isDeviceFolderSupported() })
      } else if (readStorageMode() === 'device' && isDeviceFolderSupported()) {
        try { handle = await loadDeviceHandle() } catch { handle = null }
        if (handle) {
          deviceHandleRef.current = handle
          backendRef.current = createDeviceBackend(handle)
        }
      }
      // Bring back changes kept on this device BEFORE waiting for Google or the folder permission, so a locked storage can never lose them.
      leaderRef.current = await acquireTabLock(typeof navigator !== 'undefined' ? (navigator.locks as unknown as Parameters<typeof acquireTabLock>[0]) : undefined)
      let restored: RestoredCopy | null = null
      // restore gives up after a few seconds (a hung browser database must not leave autosave off); a second tab restores nothing
      try { restored = leaderRef.current ? await keeper.restore(backendRef.current.kind) : null } catch { restored = null } finally { keeper.release() }
      if (cancelled) return
      if (restored) {
        restoredRef.current = true
        applyLocalCopy(restored)
        setFileNotice('Restored changes kept on this device.')
      }
      if (mode === 'drive') {
        try {
          // A token kept from this tab's earlier load is used at once; otherwise Google is asked quietly, without a window.
          await withTimeout(driveAuth.getToken(), STARTUP_SIGN_IN_WAIT_MS)
        } catch {
          if (cancelled) return
          // The quiet request did not work: "Reconnect Drive" (next to the avatar) asks with a tap.
          setStorage({ kind: 'drive', folderName: null, locked: true, supported: isDeviceFolderSupported() })
          setSaveStatus('locked')
          return
        }
        if (cancelled) return
        void loadDriveProfile()
        await finishStartup(() => cancelled)
        return
      }
      if (handle) {
        const permission = await queryDevicePermission(handle)
        if (cancelled) return
        if (permission !== 'granted') {
          // Autosave stays off until the person taps Reconnect, because the browser needs a tap to allow the folder again.
          setStorage({ kind: 'device', folderName: handle.name, locked: true, supported: true })
          setSaveStatus('locked')
          setStoragePanelOpen(true)
          return
        }
        setStorage({ kind: 'device', folderName: handle.name, locked: false, supported: true })
      }
      await finishStartup(() => cancelled)
    })()
    return () => { cancelled = true }
  }, [])

  const switchBackend = async (backend: StorageBackend, handle: DirHandle | null) => {
    // A sheet drawn while saving was off (device folder locked) is kept and saved into the new storage, never discarded.
    const keepSheet = !readyRef.current && hasAnyItems()
    await flushCopy() // before the storage changes, so the copy is filed under the storage it was drawn for
    const leftKey = keeper.currentKey()
    const leftKind = backendRef.current.kind
    restoredRef.current = false
    backendRef.current = backend
    deviceHandleRef.current = handle
    readyRef.current = true
    pendingFolderRef.current = null
    setStorage((current) => ({ ...current, kind: backend.kind, folderName: handle?.name ?? null, locked: false }))
    if (keepSheet) {
      forgetCurrentDiagram()
      await persistNow()
      // it reached the new storage, so the copy filed under the old one is no longer needed
      if (docIdRef.current && leftKey && leftKind !== backend.kind) void keeper.discard(leftKind, null, leftKey)
    } else {
      // The sheet shows a diagram of the previous storage, so start blank and reopen this storage's last diagram.
      const remembered = readCurrentId()
      applyDocument(null, blankDocument())
      void keeper.switchTo(null)
      writeCurrentId(remembered)
      await finishStartup()
    }
    await refreshLibrary()
  }

  /** Lets the person pick a folder on the device; diagrams and folders are then stored there as real files and folders. */
  const chooseDeviceFolder = async () => {
    setFileNotice(null)
    let handle: DirHandle
    try {
      handle = await pickDeviceFolder()
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setFileNotice('Could not open that folder.')
      return
    }
    if (!(await requestDevicePermission(handle))) {
      setFileNotice('InkPad needs permission to save into that folder.')
      return
    }
    await persistNow() // finish saving to the storage being left
    try { await saveDeviceHandle(handle) } catch { setFileNotice('Saved there, but the browser could not remember the folder for next time.') }
    writeStorageMode('device')
    setSaveStatus('idle')
    await switchBackend(createDeviceBackend(handle), handle)
  }

  /** After a restart the browser asks for a tap before the remembered folder can be used again. */
  const reconnectDeviceFolder = async () => {
    if (backendRef.current.kind === 'drive') {
      try {
        await driveAuth.getToken(false, true)
      } catch {
        setFileNotice('Google sign-in did not finish. Tap Reconnect Drive and choose your account.')
        return
      }
      await loadDriveProfile()
    } else {
      const handle = deviceHandleRef.current
      if (!handle) return
      if (!(await requestDevicePermission(handle))) {
        setFileNotice('Permission was not given. Tap Reconnect and choose Allow.')
        return
      }
    }
    setFileNotice(null)
    setStorage((current) => ({ ...current, locked: false }))
    setSaveStatus('idle')
    await finishStartup()
    // A sheet drawn while storage was locked is saved now (as a new diagram if it never had a home).
    if ((!docIdRef.current || unsavedWhileLockedRef.current) && hasAnyItems()) await persistNow()
    unsavedWhileLockedRef.current = false
    await refreshLibrary()
  }

  /** Signs in to Google and keeps diagrams in the person's own Drive (hidden app-data area). */
  const connectDrive = async () => {
    setFileNotice(null)
    try {
      await driveAuth.getToken(true, true)
    } catch {
      setFileNotice('Google sign-in did not finish. Nothing was changed.')
      return
    }
    await loadDriveProfile()
    await persistNow() // finish saving to the storage being left
    writeStorageMode('drive')
    setSaveStatus('idle')
    await switchBackend(createAppDriveBackend(), null)
  }

  const useBrowserStorage = async () => {
    setFileNotice(null)
    await persistNow()
    if (backendRef.current.kind === 'drive') {
      driveAuth.signOut()
      driveExportAuth.signOut()
      writeStoredProfile(null)
      setDriveProfile(null)
      await keeper.dropKind('drive')
      await getDriveCache().clear().catch(() => undefined)
    } else { try { await saveDeviceHandle(null) } catch { /* nothing to forget */ } }
    writeStorageMode('browser')
    setSaveStatus('idle')
    await switchBackend(createBrowserBackend(), null)
  }

  /** Copies every browser diagram and folder into the device folder. The browser copies are kept. */
  const copyBrowserToDevice = async () => {
    if (backendRef.current.kind === 'browser') return
    setFileNotice(null)
    try {
      const result = await copyAllBetweenBackends(createBrowserBackend(), backendRef.current)
      setFileNotice(result.diagrams === 0 && result.failed === 0
        ? 'There were no diagrams in this browser to copy.'
        : `Copied ${result.diagrams} diagram${result.diagrams === 1 ? '' : 's'} and ${result.folders} folder${result.folders === 1 ? '' : 's'} into ${backendRef.current.kind === 'drive' ? 'Google Drive' : 'the device folder'}.${result.failed ? ` ${result.failed} could not be copied.` : ''}`)
    } catch (error) {
      setFileNotice(errorText(error, 'Could not copy the browser diagrams.'))
    }
    void refreshLibrary()
  }

  // Google tokens last about an hour and the sign-in window only opens after a tap, so renew on a tap shortly before expiry.
  useEffect(() => {
    let renewing = false
    const renew = () => {
      if (backendRef.current.kind !== 'drive' || renewing || !driveAuth.hasToken() || driveAuth.msLeft() > REFRESH_WINDOW_MS) return
      renewing = true
      // a tap is allowed to open Google's window; it closes by itself when nothing has to be confirmed
      void driveAuth.getToken(true, true).catch(() => { /* the next save asks for a sign-in if this failed */ }).finally(() => { renewing = false })
    }
    window.addEventListener('pointerup', renew)
    // Shortly before the token runs out, ask Google quietly for a new one so the sign-in window is rarely needed.
    const quietRenew = window.setInterval(() => {
      if (backendRef.current.kind !== 'drive' || renewing || !driveAuth.hasToken() || driveAuth.msLeft() > REFRESH_WINDOW_MS) return
      renewing = true
      void driveAuth.getToken(true).catch(() => { /* the tap-based renewal or Reconnect Drive takes over */ }).finally(() => { renewing = false })
    }, SILENT_RENEW_CHECK_MS)
    return () => { window.removeEventListener('pointerup', renew); window.clearInterval(quietRenew) }
  }, [])

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState !== 'hidden') return
      void keeper.flush()
      void persistNow()
    }
    const leaving = () => {
      keeper.emergencySave() // synchronous, in case the page goes away before IndexedDB finishes
      void keeper.flush()
      void persistNow()
    }
    // Closing or refreshing with changes that nothing holds yet asks first, and starts the safety write meanwhile.
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!keeper.hasUnstoredChanges(savedSignatureRef.current)) return
      void keeper.flush()
      event.preventDefault()
      event.returnValue = ''
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', leaving)
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', leaving)
      window.removeEventListener('beforeunload', warnBeforeLeaving)
    }
  }, [])

  /** Library search inside diagrams: reads only a local copy (this browser's store, or Drive's browser cache). No network, no device-folder access. */
  // Stable identity: HomeScreen's search scan depends on it and must not restart on every render.
  const loadForSearch = useCallback((id: string) => loadLocalCopyForSearch(backendRef.current.kind, id, { browserDocument: loadStoredDocument, driveCached: (docId) => getDriveCache().get(docId) }), [])

  return {
    loadForSearch, filePanelOpen, setFilePanelOpen, refreshLibrary, refreshLibraryIfStale, thumbnails, captureThumbnail, renderPageThumbnail, starredIds, toggleStar, docTitle, saveStatus, fileNotice, setFileNotice, library, folders, currentDocId,
    storage, driveProfile, storagePanelOpen, setStoragePanelOpen, chooseDeviceFolder, reconnectDeviceFolder, connectDrive, useBrowserStorage, copyBrowserToDevice,
    newDiagramIn, createFolder, renameFolder, deleteFolder, releaseFolderTarget, moveDiagram,
    scheduleAutosave, newDiagram, openStoredDiagram, deleteStoredDiagram, renameDiagram, renameStoredDiagram, copyStoredDiagram,
    exportDocumentFile, importDocumentFile, exportSvgFile, exportPngFile, copyPngToClipboard, transparentExport, setTransparentExport, exportToNotebookLm, exportBusy,
  }
}
