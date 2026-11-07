import { useEffect, useRef, useState } from 'react'
import type { CanvasItem } from '../canvasModel'
import { DEFAULT_DOCUMENT_TITLE, cleanTitle, createDocument, documentFileName, parseDocument, sameSignature, stringifyDocument, type DocumentPageBackground, type DocumentPageSpacing, type DocumentSignature, type DocumentPageTemplate, type InkPadDocument } from '../documentFormat'
import { deleteThumbnail, downloadBlob, loadCurrentDocumentId, loadThumbnails, saveCurrentDocumentId, saveThumbnail, type DocumentSummary, type FolderRecord } from '../documentStore'
import { THUMBNAIL_MAX_SVG_CHARS, thumbnailSize } from '../thumbnail'
import { STORAGE_MODE_KEY, createDeviceBackend, isDeviceFolderSupported, loadDeviceHandle, pickDeviceFolder, queryDevicePermission, requestDevicePermission, saveDeviceHandle, type DirHandle } from '../deviceStore'
import { folderAndDescendantIds } from '../folderTree'
import { DriveAuthError, createDriveBackend, fetchDriveProfile, type DriveEnv } from '../googleDrive'
import { createIndexedDbDriveCache, type DriveCache } from '../driveCache'
import { readStoredProfile, writeStoredProfile, type DriveProfile } from '../driveProfile'
import { REFRESH_WINDOW_MS, driveAuth } from '../googleAuth'
import { copyAllBetweenBackends, createBrowserBackend, type StorageBackend } from '../storageBackend'
import type { SaveStatus } from '../FilePanel'
import { PAGE_BACKGROUND_COLORS } from '../pageBackground'
import { buildSheetSvg, cropSvg, getContentBounds, svgToPngBlob } from '../sheetExport'
import { SHEET_HEIGHT, SHEET_WIDTH } from '../viewport'

/**
 * What the document layer needs from the drawing surface. Keeping this small is the seam between
 * "which diagram is open / saved" (this hook) and "how the canvas is edited" (App).
 */
export type DocumentHost = {
  getItems: () => CanvasItem[]
  getPage: () => { template: DocumentPageTemplate; background: DocumentPageBackground; spacing?: DocumentPageSpacing }
  /** True while a pen/touch stroke or gesture is in progress; autosave waits for it to end. */
  isInputActive: () => boolean
  /** Replace the sheet contents and page settings, reset undo history, id counters and selection, and redraw. */
  loadDocument: (document: InkPadDocument) => void
}

const AUTOSAVE_DELAY_MS = 1200
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
const createAppDriveBackend = () => createDriveBackend(driveEnv, { cache: getDriveCache() })
const withTimeout = <T,>(work: Promise<T>, ms: number): Promise<T> => new Promise<T>((resolve, reject) => {
  const timer = window.setTimeout(() => reject(new DriveAuthError()), ms)
  work.then((value) => { window.clearTimeout(timer); resolve(value) }, (error) => { window.clearTimeout(timer); reject(error) })
})
const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback)

export function useDocuments(host: DocumentHost) {
  const hostRef = useRef(host)
  hostRef.current = host

  const [filePanelOpen, setFilePanelOpen] = useState(false)
  const [storagePanelOpen, setStoragePanelOpen] = useState(false)
  const [docTitle, setDocTitle] = useState(DEFAULT_DOCUMENT_TITLE)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [fileNotice, setFileNotice] = useState<string | null>(null)
  const [library, setLibrary] = useState<DocumentSummary[]>([])
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

  const buildCurrentDocument = (): InkPadDocument => {
    const page = hostRef.current.getPage()
    return createDocument({
      title: docMetaRef.current.title,
      createdAt: docMetaRef.current.createdAt,
      template: page.template,
      background: page.background,
      spacing: page.spacing,
      items: hostRef.current.getItems(),
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
    return { title: docMetaRef.current.title, template: page.template, background: page.background, spacing: page.spacing, items: hostRef.current.getItems().slice() }
  }

  const refreshLibrary = async () => {
    const backend = backendRef.current
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
    } catch {
      setLibrary([])
      setFolders([])
    }
  }

  const doPersist = async () => {
    if (!readyRef.current) return
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
    // Never create an empty entry for a diagram that was never drawn on.
    if (!docIdRef.current && hostRef.current.getItems().length === 0 && !forceSaveRef.current) return
    const forced = forceSaveRef.current
    forceSaveRef.current = false
    // Nothing changed since this diagram was last saved or opened: skip the upload (switching diagrams used to save every time).
    const signature = currentSignature()
    if (docIdRef.current && !forced && sameSignature(signature, savedSignatureRef.current)) {
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
    hostRef.current.loadDocument(loaded)
    docIdRef.current = id
    docMetaRef.current = { title: loaded.title, createdAt: loaded.createdAt }
    savedSignatureRef.current = id ? currentSignature() : null
    setCurrentDocId(id)
    setDocTitle(loaded.title)
    writeCurrentId(id)
    setSaveStatus(id ? 'saved' : 'idle')
  }

  /** Drive has a newer version than the browser copy that was shown. Swap it in only if the diagram is still open and nothing was edited here since. */
  const fresherVersion = (backend: StorageBackend, id: string) => (fresher: InkPadDocument): boolean => {
    if (backendRef.current !== backend || docIdRef.current !== id || hostRef.current.isInputActive()) return false
    if (!sameSignature(currentSignature(), savedSignatureRef.current)) return false
    applyDocument(id, fresher)
    return true
  }

  const blankDocument = () => {
    const page = hostRef.current.getPage()
    return createDocument({ template: page.template, background: page.background, spacing: page.spacing, items: [] })
  }

  const newDiagram = async () => {
    await persistNow()
    setFileNotice(null)
    applyDocument(null, blankDocument())
    writeCurrentId(null)
    void refreshLibrary()
  }

  const openStoredDiagram = async (id: string) => {
    await persistNow()
    try {
      const backend = backendRef.current
      const stored = await backend.load(id, fresherVersion(backend, id))
      if (!stored) {
        setFileNotice('That diagram no longer exists.')
        void refreshLibrary()
        return
      }
      setFileNotice(null)
      applyDocument(id, stored)
      setFilePanelOpen(false)
    } catch {
      setFileNotice('Could not open that diagram.')
    }
  }

  const forgetCurrentDiagram = () => {
    docIdRef.current = null
    setCurrentDocId(null)
    writeCurrentId(null)
    setSaveStatus('idle')
  }

  const deleteStoredDiagram = async (id: string) => {
    try {
      await backendRef.current.remove(id)
      if (docIdRef.current === id) forgetCurrentDiagram()
      void deleteThumbnail(id).catch(() => undefined)
      setThumbnails((current) => { if (!(id in current)) return current; const { [id]: _gone, ...rest } = current; return rest })
    } catch {
      setFileNotice('Could not delete that diagram.')
    }
    void refreshLibrary()
  }

  /** Start a blank diagram that will be saved inside the given folder (null = top level). */
  const newDiagramIn = async (folderId: string | null) => {
    await newDiagram()
    pendingFolderRef.current = folderId
  }

  const createFolder = async (name: string, parentId: string | null) => {
    setFileNotice(null)
    try {
      await backendRef.current.createFolder(name, parentId)
    } catch (error) {
      setFileNotice(errorText(error, 'Could not create that folder.'))
    }
    void refreshLibrary()
  }

  const renameFolder = async (id: string, name: string) => {
    setFileNotice(null)
    try {
      const moved = await backendRef.current.renameFolder(id, name)
      if (moved) {
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
    }
    void refreshLibrary()
  }

  /** Deletes the folder, its subfolders and every diagram inside them. The UI asks for confirmation first. */
  const deleteFolder = async (id: string) => {
    setFileNotice(null)
    try {
      const ids = new Set(folderAndDescendantIds(folders, id))
      const deleted = await backendRef.current.deleteFolder(id)
      if (docIdRef.current && deleted.includes(docIdRef.current)) forgetCurrentDiagram()
      if (pendingFolderRef.current && ids.has(pendingFolderRef.current)) pendingFolderRef.current = null
    } catch (error) {
      setFileNotice(errorText(error, 'Could not delete that folder.'))
    }
    void refreshLibrary()
  }

  const moveDiagram = async (docId: string, folderId: string | null) => {
    setFileNotice(null)
    try {
      await persistNow()
      const newId = await backendRef.current.move(docId, folderId)
      if (docIdRef.current === docId && newId !== docId) {
        docIdRef.current = newId
        setCurrentDocId(newId)
        writeCurrentId(newId)
      }
    } catch (error) {
      setFileNotice(errorText(error, 'Could not move that diagram.'))
    }
    void refreshLibrary()
  }

  const renameDiagram = (title: string) => {
    const cleaned = cleanTitle(title)
    docMetaRef.current = { ...docMetaRef.current, title: cleaned }
    setDocTitle(cleaned)
    if (docIdRef.current || hostRef.current.getItems().length > 0) void persistNow()
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
      applyDocument(null, result.document)
      forceSaveRef.current = true
      await persistNow()
      setFileNotice(result.droppedItems ? `Imported with ${result.droppedItems} damaged item${result.droppedItems === 1 ? '' : 's'} skipped.` : `Imported “${result.document.title}”.`)
      void refreshLibrary()
    } catch {
      setFileNotice('Could not read that file.')
    }
  }

  const getImageExport = () => {
    const items = hostRef.current.getItems()
    const bounds = getContentBounds(items, { width: SHEET_WIDTH, height: SHEET_HEIGHT })
    if (!bounds) return null
    const page = hostRef.current.getPage()
    const svg = cropSvg(buildSheetSvg(items, {
      width: SHEET_WIDTH,
      height: SHEET_HEIGHT,
      template: page.template,
      spacing: page.spacing,
      backgroundColor: PAGE_BACKGROUND_COLORS[page.background],
    }), bounds)
    return { svg, bounds, baseName: documentFileName(docMetaRef.current.title).replace(/\.inkpad$/, '') }
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
    const exported = getImageExport()
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

  const exportSvgFile = () => {
    const exported = getImageExport()
    if (!exported) return
    downloadBlob(new Blob([exported.svg], { type: 'image/svg+xml' }), `${exported.baseName}.svg`)
  }

  const exportPngFile = async (scale: 1 | 2) => {
    const exported = getImageExport()
    if (!exported) return
    try {
      const blob = await svgToPngBlob(exported.svg, exported.bounds.width, exported.bounds.height, scale)
      downloadBlob(blob, `${exported.baseName}${scale === 2 ? '@2x' : ''}.png`)
      setFileNotice(null)
    } catch (error) {
      setFileNotice(error instanceof Error ? error.message : 'PNG export failed.')
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
      if (previous?.email && profile.email && previous.email !== profile.email) await getDriveCache().clear().catch(() => undefined)
      writeStoredProfile(profile)
      setDriveProfile(profile)
    } catch { /* keep the remembered name and photo */ }
  }

  /** Reopen the last diagram of the active storage, then enable autosave (it stays off until this finishes, so a slow read can never be overwritten by an empty sheet). */
  const finishStartup = async (isCancelled: () => boolean = () => false) => {
    const id = readCurrentId()
    if (id) {
      try {
        const backend = backendRef.current
        const stored = await backend.load(id, fresherVersion(backend, id))
        if (!isCancelled() && stored && hostRef.current.getItems().length === 0) applyDocument(id, stored)
      } catch {
        // Storage unavailable: start with an empty sheet; saving will report the problem.
      }
    }
    if (!isCancelled()) readyRef.current = true
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (readStorageMode() === 'drive') {
        backendRef.current = createAppDriveBackend()
        setStorage({ kind: 'drive', folderName: null, locked: false, supported: isDeviceFolderSupported() })
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
      if (readStorageMode() === 'device' && isDeviceFolderSupported()) {
        let handle: DirHandle | null = null
        try { handle = await loadDeviceHandle() } catch { handle = null }
        if (cancelled) return
        if (handle) {
          deviceHandleRef.current = handle
          backendRef.current = createDeviceBackend(handle)
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
      }
      await finishStartup(() => cancelled)
    })()
    return () => { cancelled = true }
  }, [])

  const switchBackend = async (backend: StorageBackend, handle: DirHandle | null) => {
    // A sheet drawn while saving was off (device folder locked) is kept and saved into the new storage, never discarded.
    const keepSheet = !readyRef.current && hostRef.current.getItems().length > 0
    backendRef.current = backend
    deviceHandleRef.current = handle
    readyRef.current = true
    pendingFolderRef.current = null
    setStorage((current) => ({ ...current, kind: backend.kind, folderName: handle?.name ?? null, locked: false }))
    if (keepSheet) {
      forgetCurrentDiagram()
      await persistNow()
    } else {
      // The sheet shows a diagram of the previous storage, so start blank and reopen this storage's last diagram.
      const remembered = readCurrentId()
      applyDocument(null, blankDocument())
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
    if ((!docIdRef.current || unsavedWhileLockedRef.current) && hostRef.current.getItems().length > 0) await persistNow()
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
      writeStoredProfile(null)
      setDriveProfile(null)
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
    const flush = () => { if (document.visibilityState === 'hidden') void persistNow() }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  return {
    filePanelOpen, setFilePanelOpen, refreshLibrary, thumbnails, captureThumbnail, docTitle, saveStatus, fileNotice, setFileNotice, library, folders, currentDocId,
    storage, driveProfile, storagePanelOpen, setStoragePanelOpen, chooseDeviceFolder, reconnectDeviceFolder, connectDrive, useBrowserStorage, copyBrowserToDevice,
    newDiagramIn, createFolder, renameFolder, deleteFolder, moveDiagram,
    scheduleAutosave, newDiagram, openStoredDiagram, deleteStoredDiagram, renameDiagram,
    exportDocumentFile, importDocumentFile, exportSvgFile, exportPngFile,
  }
}
