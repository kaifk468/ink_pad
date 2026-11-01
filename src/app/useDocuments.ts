import { useEffect, useRef, useState } from 'react'
import type { CanvasItem } from '../canvasModel'
import { DEFAULT_DOCUMENT_TITLE, cleanTitle, createDocument, documentFileName, parseDocument, stringifyDocument, type DocumentPageBackground, type DocumentPageTemplate, type InkPadDocument } from '../documentFormat'
import { downloadBlob, loadCurrentDocumentId, saveCurrentDocumentId, type DocumentSummary, type FolderRecord } from '../documentStore'
import { STORAGE_MODE_KEY, createDeviceBackend, isDeviceFolderSupported, loadDeviceHandle, pickDeviceFolder, queryDevicePermission, requestDevicePermission, saveDeviceHandle, type DirHandle } from '../deviceStore'
import { folderAndDescendantIds } from '../folderTree'
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
  getPage: () => { template: DocumentPageTemplate; background: DocumentPageBackground }
  /** True while a pen/touch stroke or gesture is in progress; autosave waits for it to end. */
  isInputActive: () => boolean
  /** Replace the sheet contents and page settings, reset undo history, id counters and selection, and redraw. */
  loadDocument: (document: InkPadDocument) => void
}

const AUTOSAVE_DELAY_MS = 1200
const DEVICE_CURRENT_KEY = 'inkpad.currentDocument.device'

export type StorageInfo = {
  kind: 'browser' | 'device'
  /** Name of the chosen device folder, when kind is 'device'. */
  folderName: string | null
  /** The device folder is remembered but the browser needs a tap to allow access again. */
  locked: boolean
  /** This browser can pick a device folder (needs a secure address and Chrome or Edge). */
  supported: boolean
}

function readDeviceCurrentId(): string | null {
  try { return window.localStorage.getItem(DEVICE_CURRENT_KEY) } catch { return null }
}
function writeDeviceCurrentId(id: string | null) {
  try {
    if (id) window.localStorage.setItem(DEVICE_CURRENT_KEY, id)
    else window.localStorage.removeItem(DEVICE_CURRENT_KEY)
  } catch { /* the diagram just will not reopen automatically */ }
}
function writeStorageMode(mode: 'browser' | 'device') {
  try { window.localStorage.setItem(STORAGE_MODE_KEY, mode) } catch { /* ignore */ }
}
function readStorageMode(): 'browser' | 'device' {
  try { return window.localStorage.getItem(STORAGE_MODE_KEY) === 'device' ? 'device' : 'browser' } catch { return 'browser' }
}
const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback)

export function useDocuments(host: DocumentHost) {
  const hostRef = useRef(host)
  hostRef.current = host

  const [filePanelOpen, setFilePanelOpen] = useState(false)
  const [docTitle, setDocTitle] = useState(DEFAULT_DOCUMENT_TITLE)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [fileNotice, setFileNotice] = useState<string | null>(null)
  const [library, setLibrary] = useState<DocumentSummary[]>([])
  const [currentDocId, setCurrentDocId] = useState<string | null>(null)
  const [folders, setFolders] = useState<FolderRecord[]>([])
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

  const readCurrentId = () => (backendRef.current.kind === 'device' ? readDeviceCurrentId() : loadCurrentDocumentId())
  const writeCurrentId = (id: string | null) => { if (backendRef.current.kind === 'device') writeDeviceCurrentId(id); else saveCurrentDocumentId(id) }

  const buildCurrentDocument = (): InkPadDocument => {
    const page = hostRef.current.getPage()
    return createDocument({
      title: docMetaRef.current.title,
      createdAt: docMetaRef.current.createdAt,
      template: page.template,
      background: page.background,
      items: hostRef.current.getItems(),
    })
  }

  const refreshLibrary = async () => {
    try {
      const listed = await backendRef.current.list()
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
    forceSaveRef.current = false
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
      writeCurrentId(newId)
      setCurrentDocId(newId)
      setSaveStatus('saved')
      if (filePanelOpenRef.current || previousId === null || previousId !== newId) void refreshLibrary()
    } catch {
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
    setCurrentDocId(id)
    setDocTitle(loaded.title)
    writeCurrentId(id)
    setSaveStatus(id ? 'saved' : 'idle')
  }

  const blankDocument = () => {
    const page = hostRef.current.getPage()
    return createDocument({ template: page.template, background: page.background, items: [] })
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
      const stored = await backendRef.current.load(id)
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
      backgroundColor: PAGE_BACKGROUND_COLORS[page.background],
    }), bounds)
    return { svg, bounds, baseName: documentFileName(docMetaRef.current.title).replace(/\.inkpad$/, '') }
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

  /** Reopen the last diagram of the active storage, then enable autosave (it stays off until this finishes, so a slow read can never be overwritten by an empty sheet). */
  const finishStartup = async (isCancelled: () => boolean = () => false) => {
    const id = readCurrentId()
    if (id) {
      try {
        const stored = await backendRef.current.load(id)
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
            setFilePanelOpen(true)
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
    const handle = deviceHandleRef.current
    if (!handle) return
    if (!(await requestDevicePermission(handle))) {
      setFileNotice('Permission was not given. Tap Reconnect and choose Allow.')
      return
    }
    setFileNotice(null)
    setStorage((current) => ({ ...current, locked: false }))
    setSaveStatus('idle')
    await finishStartup()
    // A sheet drawn while the folder was locked is saved as a new diagram now.
    if (!docIdRef.current && hostRef.current.getItems().length > 0) await persistNow()
    await refreshLibrary()
  }

  const useBrowserStorage = async () => {
    setFileNotice(null)
    await persistNow()
    try { await saveDeviceHandle(null) } catch { /* nothing to forget */ }
    writeStorageMode('browser')
    setSaveStatus('idle')
    await switchBackend(createBrowserBackend(), null)
  }

  /** Copies every browser diagram and folder into the device folder. The browser copies are kept. */
  const copyBrowserToDevice = async () => {
    if (backendRef.current.kind !== 'device') return
    setFileNotice(null)
    try {
      const result = await copyAllBetweenBackends(createBrowserBackend(), backendRef.current)
      setFileNotice(result.diagrams === 0 && result.failed === 0
        ? 'There were no diagrams in this browser to copy.'
        : `Copied ${result.diagrams} diagram${result.diagrams === 1 ? '' : 's'} and ${result.folders} folder${result.folders === 1 ? '' : 's'} into the device folder.${result.failed ? ` ${result.failed} could not be copied.` : ''}`)
    } catch (error) {
      setFileNotice(errorText(error, 'Could not copy into the device folder.'))
    }
    void refreshLibrary()
  }

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
    filePanelOpen, setFilePanelOpen, refreshLibrary, docTitle, saveStatus, fileNotice, library, folders, currentDocId,
    storage, chooseDeviceFolder, reconnectDeviceFolder, useBrowserStorage, copyBrowserToDevice,
    newDiagramIn, createFolder, renameFolder, deleteFolder, moveDiagram,
    scheduleAutosave, newDiagram, openStoredDiagram, deleteStoredDiagram, renameDiagram,
    exportDocumentFile, importDocumentFile, exportSvgFile, exportPngFile,
  }
}
