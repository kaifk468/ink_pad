import { useEffect, useMemo, useRef, useState } from 'react'
import type { DocumentSummary, FolderRecord } from '../documentStore'
import { cleanFolderName, flattenFolders, folderMoveTargets, folderPath } from '../folderTree'
import { RECENT_COUNT, RECENT_MIN_LIBRARY, countInFolder, describeEdited, folderLabel, LIBRARY_SORTS, parseLibrarySort, recentDiagrams, searchLibrary, showLibraryWelcome, sortLibrary, type LibraryLayout, type LibrarySort } from '../libraryView'
import { copyTitle } from '../libraryCopy'
import { canDragCards, decideDrop, decideFolderDrop, FOLDER_DRAG_TYPE, hasFinePointer } from '../libraryDrop'
import { batchDelete, createPendingDeletes, hiddenForDiagram, hiddenForFolder, hidesInFolder, pendingLabel, type PendingDeletes } from '../pendingDelete'
import { allSelected, deleteConfirmText, effectiveSelection, idsToMove, movedMessage, runMoves, selectAllIds, selectionLabel, toggleSelected } from '../librarySelect'
import type { PageTemplate } from '../pageTemplates'
import { BOARD_STYLES, boardFieldsFor } from '../boardStyle'
import { CANVAS_TYPES } from '../canvasTypes'
import { loadNewDiagramChoice, newDiagramOptionsFor, saveNewDiagramChoice, type NewDiagramChoice, type NewDiagramOptions } from '../newDiagramChoice'
import { BoardStylePreview, CanvasPreview, PickerTile } from './BoardPreviews'
import { createSearchTextIndex, matchContent } from '../librarySearchText'

type HomeScreenProps = {
  /** Reads a diagram's saved contents from a local copy only (for searching inside diagrams); null when there is none. Never the network. */
  loadForSearch?: (id: string) => Promise<unknown | null>
  library: DocumentSummary[]
  folders: FolderRecord[]
  currentId: string | null
  /** Small page pictures by diagram id; a card without one shows an icon. */
  thumbnails: Record<string, string>
  /** Starred diagram ids (from Drive tags and/or this browser). */
  starredIds: ReadonlySet<string>
  onToggleStar: (id: string) => void
  /** Stars follow the person to other devices (Google Drive storage). */
  starsSync: boolean
  notice: string | null
  storageText: string
  storageLocked: boolean
  showConnectHint: boolean
  onClose: () => void
  onOpenDiagram: (id: string) => void
  onNewDiagram: (folderId: string | null, template: PageTemplate, options?: NewDiagramOptions) => void
  onImportFile: (file: File) => void
  onCreateFolder: (name: string, parentId: string | null) => Promise<boolean> | void
  onRenameFolder: (id: string, name: string) => Promise<boolean> | void
  onRenameDiagram: (id: string, title: string) => Promise<boolean | 'unchanged'> | void
  /** Saves "<title> (copy)" next to the original; resolves the real new title (a device folder may number it), or false (with a notice) when it could not be done. */
  onMakeCopy: (id: string) => Promise<string | false> | void
  /** `confirmedDiagramIds` are the diagrams the person saw in the confirmation; the delete must refuse when the folder holds others by then. */
  onDeleteFolder: (id: string, confirmedDiagramIds: string[]) => Promise<boolean> | void
  /** Called when a folder delete is scheduled, so new saves stop landing in that folder. */
  onFolderDeleteScheduled?: (id: string) => void
  onMoveDiagram: (docId: string, folderId: string | null) => Promise<boolean> | void
  /** False on device-folder storage: moving a directory is not reliable there, so "Move to…" is replaced by a hint. */
  canMoveFolders?: boolean
  /** Moves a folder with everything in it under another folder (null = top level); resolves false (with a notice) when refused. */
  onMoveFolder?: (id: string, parentId: string | null) => Promise<boolean | 'noop'> | void
  onDeleteDiagram: (id: string) => Promise<boolean> | void
  onChangeStorage: () => void
  /** Desktop input mode: cards can be dragged onto folders with the mouse. */
  desktop?: boolean
}

const STATUS_MS = 3000
const MOVE_UNDO_MS = 8000
const CONTENT_SEARCH_DELAY_MS = 200
const LAYOUT_KEY = 'inkpad.libraryLayout'
const SORT_KEY = 'inkpad.librarySort'

function readSort(): LibrarySort {
  try { return parseLibrarySort(window.localStorage.getItem(SORT_KEY)) } catch { return 'edited' }
}

function readLayout(): LibraryLayout {
  try { return window.localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'grid' } catch { return 'grid' }
}

/** Full-screen library: folder tree on the left, search, and the diagrams as cards or a list. Opens from the folder button. */
export function HomeScreen(props: HomeScreenProps) {
  const pendingRef = useRef<PendingDeletes | null>(null)
  const [pendingTick, setPendingTick] = useState(0)
  // Failure of a delayed delete: the item is visible again (the hook has set the alert notice for a plain failure; a throw gets this text).
  const failedRef = useRef<(text: string) => void>(() => undefined)
  if (pendingRef.current === null) pendingRef.current = createPendingDeletes({ onChange: () => setPendingTick((n) => n + 1), onFailed: (item, error) => { if (error !== undefined) failedRef.current(`Could not delete “${item.label}”. It is still in your Library.`) } })
  const pending = pendingRef.current
  const pendingItem = pending.current()
  const pendingRunning = pending.isRunning()
  // An item waiting for its delete (diagram, or folder with everything inside) is hidden from every list, count, search and the Recent row.
  const library = useMemo(() => (pending.hasHidden() ? props.library.filter((entry) => !pending.isHidden(entry.id)) : props.library), [props.library, pendingTick, pending])
  const folders = useMemo(() => (pending.hasHidden() ? props.folders.filter((folder) => !pending.isHidden(folder.id)) : props.folders), [props.folders, pendingTick, pending])
  // A deleted item stays hidden until the refreshed Library lists no longer contain it (no flash of the card coming back).
  useEffect(() => { pending.sweep((id) => props.library.some((entry) => entry.id === id) || props.folders.some((folder) => folder.id === id)) }, [props.library, props.folders, pendingTick, pending])
  const latestLists = useRef({ library: props.library, folders: props.folders })
  latestLists.current = { library: props.library, folders: props.folders }
  const importRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<string | null>(null)
  /** Select mode: cards toggle a checkbox instead of opening; a bar offers Move / Delete for all of them. Diagrams only, not folders. */
  const [selectMode, setSelectMode] = useState(false)
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set())
  const [movingMany, setMovingMany] = useState(false)
  const [confirmMany, setConfirmMany] = useState(false)
  const [busyMany, setBusyMany] = useState(false)
  /** 'starred' shows only starred diagrams from every folder. */
  const [view, setView] = useState<'all' | 'starred'>('all')
  const [query, setQuery] = useState('')
  const [layout, setLayout] = useState<LibraryLayout>(readLayout)
  const [sort, setSort] = useState<LibrarySort>(readSort)
  /** The diagram being copied; blocks further copies until it is saved. */
  const [copyingId, setCopyingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [confirmFolderId, setConfirmFolderId] = useState<string | null>(null)
  const [confirmDiagramId, setConfirmDiagramId] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [newMenuOpen, setNewMenuOpen] = useState(false)
  const newMenuRef = useRef<HTMLDivElement>(null)
  const newButtonRef = useRef<HTMLButtonElement>(null)
  const [newChoice, setNewChoice] = useState<NewDiagramChoice>(() => loadNewDiagramChoice())
  const searchRef = useRef<HTMLInputElement>(null)
  const [renamingDiagramId, setRenamingDiagramId] = useState<string | null>(null)
  const [diagramDraft, setDiagramDraft] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const statusTimer = useRef<number | null>(null)
  const showStatus = (text: string) => {
    setStatus(text)
    if (statusTimer.current !== null) window.clearTimeout(statusTimer.current)
    statusTimer.current = window.setTimeout(() => { statusTimer.current = null; setStatus(null) }, STATUS_MS)
  }
  const clearStatus = () => {
    if (statusTimer.current !== null) { window.clearTimeout(statusTimer.current); statusTimer.current = null }
    setStatus(null)
  }
  useEffect(() => () => { if (statusTimer.current !== null) window.clearTimeout(statusTimer.current) }, [])
  failedRef.current = showStatus
  // Closing the Library (or opening a diagram) makes a pending delete real now. A page unload does not: the item simply stays.
  useEffect(() => { pending.start(); return () => { void pending.dispose() } }, [pending])
  const dragEnabled = canDragCards(Boolean(props.desktop), hasFinePointer()) && !selectMode
  /** The diagram being dragged, and the drop target under the mouse ('root' = All diagrams). Mouse drag and drop only; touch uses the Move dialog. */
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropOver, setDropOver] = useState<string | null>(null)
  /** The folder row being dragged (a different drag data type than diagram cards), only where folders can be moved. */
  const [dragFolderId, setDragFolderId] = useState<string | null>(null)
  const foldersMovable = props.canMoveFolders !== false && Boolean(props.onMoveFolder)
  /** A moved folder: the message and what Undo does (moves it back). */
  const [moveUndo, setMoveUndo] = useState<{ text: string; undo: () => void } | null>(null)
  const moveUndoTimer = useRef<number | null>(null)
  const clearMoveUndo = () => {
    if (moveUndoTimer.current !== null) { window.clearTimeout(moveUndoTimer.current); moveUndoTimer.current = null }
    setMoveUndo(null)
  }
  useEffect(() => () => { if (moveUndoTimer.current !== null) window.clearTimeout(moveUndoTimer.current) }, [])
  const [movingFolderId, setMovingFolderId] = useState<string | null>(null)
  const moveFolderTo = async (folder: FolderRecord, parentId: string | null) => {
    setMovingFolderId(null)
    if (!props.onMoveFolder) return
    const before = folder.parentId && folders.some((entry) => entry.id === folder.parentId) ? folder.parentId : null
    const result = await props.onMoveFolder(folder.id, parentId)
    if (result === false || result === 'noop') return
    const target = parentId ? folders.find((entry) => entry.id === parentId)?.name ?? 'folder' : null
    const name = folder.name
    clearStatus()
    clearMoveUndo()
    setMoveUndo({
      text: target ? `Moved “${name}” into “${target}”` : `Moved “${name}” to the top level`,
      undo: () => { clearMoveUndo(); void (async () => { const undone = await props.onMoveFolder?.(folder.id, before); if (undone !== false && undone !== 'noop') showStatus(`Moved “${name}” back`) })() },
    })
    moveUndoTimer.current = window.setTimeout(() => { moveUndoTimer.current = null; setMoveUndo(null) }, MOVE_UNDO_MS)
  }
  const dropTarget = (folderId: string | null) => {
    const key = folderId ?? 'root'
    const folderDrag = dragEnabled && foldersMovable && dragFolderId !== null
    const valid = folderDrag
      ? decideFolderDrop(folders, dragFolderId, folderId).ok
      : dragEnabled && dragId !== null && decideDrop(library, folders, dragId, folderId).ok
    return {
      onDragOver: (event: React.DragEvent) => {
        if (!valid) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        if (dropOver !== key) setDropOver(key)
      },
      onDragLeave: (event: React.DragEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropOver((over) => (over === key ? null : over))
      },
      onDrop: (event: React.DragEvent) => {
        event.preventDefault()
        setDropOver(null)
        setDragId(null)
        if (folderDrag) {
          const dropped = folders.find((entry) => entry.id === dragFolderId)
          setDragFolderId(null)
          if (valid && dropped) void moveFolderTo(dropped, folderId)
          return
        }
        const decision = decideDrop(library, folders, dragId, folderId)
        const entry = library.find((item) => item.id === dragId)
        if (decision.ok && entry) moveTo(entry, decision.folderId)
      },
    }
  }
  // Queued deletes finish (in the save chain) before another diagram opens.
  const openDiagram = (id: string) => { void pending.flush().then(() => props.onOpenDiagram(id)) }
  const exitSelect = () => { setSelectMode(false); setSelection(new Set()); setMovingMany(false); setConfirmMany(false) }
  const deleteWithUndo = (item: { kind: 'diagram' | 'folder'; id: string; label: string; hidden: Set<string>; hides?: (id: string) => boolean; run: () => Promise<boolean> | void }) => {
    clearStatus()
    pending.schedule({ kind: item.kind, id: item.id, label: item.label, hiddenIds: item.hidden, hides: item.hides, run: async () => (await item.run()) !== false })
  }
  /** Runs a library action and shows the message only when it worked (failures show the alert notice instead). */
  const act = async (run: () => Promise<boolean | 'unchanged'> | void, message: string) => {
    const result = await run()
    if (result !== false && result !== 'unchanged') showStatus(message)
  }
  const titleOf = (id: string) => library.find((entry) => entry.id === id)?.title || 'Untitled diagram'

  // If the chosen folder disappears (deleted), fall back to all diagrams.
  const here = view === 'all' && selected && folders.some((folder) => folder.id === selected) ? selected : null
  const hereFolder = here ? folders.find((folder) => folder.id === here) : undefined
  const starredSet = props.starredIds
  const starredCount = useMemo(() => library.filter((entry) => starredSet.has(entry.id)).length, [library, starredSet])
  const titleShown = useMemo(() => sortLibrary(searchLibrary(library, folders, { query, folderId: here, onlyIds: view === 'starred' ? starredSet : undefined }), sort), [library, folders, query, here, view, starredSet, sort])
  // Search inside diagrams: after a short pause in typing, the diagrams that did not match by title are checked against their
  // text (built lazily from local copies, kept in memory by id + edit time). Matches come after the title matches.
  const loadForSearchRef = useRef(props.loadForSearch)
  loadForSearchRef.current = props.loadForSearch
  const searchIndex = useRef<ReturnType<typeof createSearchTextIndex> | null>(null)
  if (!searchIndex.current) searchIndex.current = createSearchTextIndex(async (id) => (loadForSearchRef.current ? loadForSearchRef.current(id) : null))
  const [contentHits, setContentHits] = useState<{ query: string; snippets: Map<string, string> }>({ query: '', snippets: new Map() })
  const contentCandidates = useMemo(() => {
    if (!props.loadForSearch || !query.trim()) return []
    const titled = new Set(titleShown.map((entry) => entry.id))
    return searchLibrary(library, folders, { query: '', folderId: here, onlyIds: view === 'starred' ? starredSet : undefined }).filter((entry) => !titled.has(entry.id))
  }, [props.loadForSearch, query, titleShown, library, folders, here, view, starredSet])
  useEffect(() => {
    const wanted = query.trim()
    if (!wanted || contentCandidates.length === 0) { setContentHits((current) => (current.snippets.size === 0 ? current : { query: '', snippets: new Map() })); return }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const snippets = new Map<string, string>()
      for (const entry of contentCandidates) {
        if (cancelled) return
        const text = await searchIndex.current!.textFor(entry)
        const snippet = text ? matchContent(text, wanted) : null
        if (snippet) snippets.set(entry.id, snippet)
      }
      if (!cancelled) setContentHits({ query: wanted, snippets })
    }, CONTENT_SEARCH_DELAY_MS)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [query, contentCandidates])
  const contentSnippets = useMemo(() => (contentHits.query === query.trim() ? contentHits.snippets : new Map<string, string>()), [contentHits, query])
  const contentShown = useMemo(() => sortLibrary(contentCandidates.filter((entry) => contentSnippets.has(entry.id)), sort), [contentCandidates, contentSnippets, sort])
  const shown = useMemo(() => (contentShown.length > 0 ? [...titleShown, ...contentShown] : titleShown), [titleShown, contentShown])
  const tree = useMemo(() => flattenFolders(folders), [folders])
  const shownIds = useMemo(() => shown.map((entry) => entry.id), [shown])
  /** What an action may touch: selected AND visible now (a search or folder change never makes it act on hidden diagrams). */
  const chosenIds = useMemo(() => effectiveSelection(selection, shownIds), [selection, shownIds])
  const selectApi = useRef<{ active: boolean; selectAll: () => void; exit: () => void }>({ active: false, selectAll: () => undefined, exit: () => undefined })
  selectApi.current = { active: selectMode, selectAll: () => setSelection(selectAllIds(shownIds)), exit: exitSelect }
  // Opening another folder or view starts a fresh selection (select mode itself stays on).
  useEffect(() => { setSelection(new Set()); setMovingMany(false); setConfirmMany(false) }, [view, here])
  const moveMany = async (folderId: string | null) => {
    if (busyMany) return
    const ids = chosenIds
    const todo = idsToMove(library, folders, ids, folderId)
    const destination = folderId ? folders.find((folder) => folder.id === folderId)?.name ?? 'folder' : 'All diagrams'
    setMovingMany(false)
    setBusyMany(true)
    try {
      const result = await runMoves(todo, (id) => props.onMoveDiagram(id, folderId))
      const moved = result.moved + (ids.length - todo.length)
      if (moved > 0 || ids.length === 0) showStatus(movedMessage(moved, ids.length, destination))
      if (result.failed === 0) exitSelect()
      else setSelection(new Set(ids))
    } finally { setBusyMany(false) }
  }
  const deleteMany = () => {
    const ids = chosenIds
    setConfirmMany(false)
    if (ids.length === 0) return
    exitSelect()
    clearStatus()
    pending.schedule(batchDelete(ids.map((id) => ({ id, label: titleOf(id), run: async () => (await props.onDeleteDiagram(id)) !== false }))))
  }
  const confirmFolder = confirmFolderId ? folders.find((folder) => folder.id === confirmFolderId) : undefined
  const movingFolder = movingFolderId ? folders.find((folder) => folder.id === movingFolderId) : undefined
  // The picker belongs to the folder it was opened on: going to another folder closes it (found in the round 10 walk).
  useEffect(() => { setMovingFolderId(null) }, [here])
  const moveTarget = movingId ? library.find((entry) => entry.id === movingId) : undefined

  const closeRef = useRef(props.onClose)
  closeRef.current = props.onClose
  const newMenuOpenRef = useRef(false)
  newMenuOpenRef.current = newMenuOpen
  useEffect(() => {
    // Escape closes the New menu first, then the Library.
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = Boolean(target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)))
      if (selectApi.current.active && !typing && (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        selectApi.current.selectAll()
        return
      }
      if (event.key === '/' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (event.key !== 'Escape') return
      if (newMenuOpenRef.current) { setNewMenuOpen(false); newButtonRef.current?.focus() }
      else if (selectApi.current.active) selectApi.current.exit()
      else if (target === searchRef.current && searchRef.current?.value) { setQuery(''); event.preventDefault() }
      else closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (!newMenuOpen) return
    newMenuRef.current?.querySelector<HTMLElement>('.home-new-canvases .bp-tile.selected')?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(event.target as Node)) setNewMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [newMenuOpen])

  const chooseLayout = (value: LibraryLayout) => {
    setLayout(value)
    try { window.localStorage.setItem(LAYOUT_KEY, value) } catch { /* per-viewer convenience only */ }
  }
  const chooseSort = (value: LibrarySort) => {
    setSort(value)
    try { window.localStorage.setItem(SORT_KEY, value) } catch { /* per-viewer convenience only */ }
  }
  const submitCreate = () => {
    const name = cleanFolderName(draftName)
    void act(() => props.onCreateFolder(draftName, here), `Folder “${name}” created`)
    setCreating(false); setDraftName('')
  }
  const submitDiagramRename = (id: string) => {
    const title = diagramDraft.replace(/\s+/g, ' ').trim()
    setRenamingDiagramId(null)
    if (!title || title === titleOf(id)) return
    void act(() => props.onRenameDiagram(id, title), `Renamed to “${title.slice(0, 80)}”`)
  }
  const makeCopy = async (id: string) => {
    if (copyingId !== null) return
    setCopyingId(id)
    try {
      const made = await props.onMakeCopy(id)
      if (made !== false) showStatus(`Copied to “${typeof made === 'string' && made ? made : copyTitle(titleOf(id))}”`)
    } finally { setCopyingId(null) }
  }
  const moveTo = (entry: DocumentSummary, folderId: string | null) => {
    setMovingId(null)
    void act(() => props.onMoveDiagram(entry.id, folderId), `Moved “${entry.title || 'Untitled diagram'}” to ${folderId ? folders.find((folder) => folder.id === folderId)?.name ?? 'folder' : 'All diagrams'}`)
  }
  const showRecent = !selectMode && view === 'all' && here === null && !query.trim() && library.length > RECENT_MIN_LIBRARY
  const recent = useMemo(() => (showRecent ? recentDiagrams(library, RECENT_COUNT) : []), [library, showRecent])
  const trail = folderPath(folders, here)
  const submitRename = () => {
    if (here) { const name = cleanFolderName(draftName); void act(() => props.onRenameFolder(here, draftName), `Renamed to “${name}”`) }
    setRenaming(false); setDraftName('')
  }
  const heading = view === 'starred' ? 'Starred' : hereFolder ? hereFolder.name : 'All diagrams'

  return (
    <div className={`home-screen${props.desktop ? ' home-desktop' : ''}`} role="dialog" aria-modal="true" aria-label="Library">
      <aside className="home-side" aria-label="Folders">
        <div className="home-brand"><span className="brand-mark" aria-hidden="true"><span /></span><strong>Ink Pad</strong></div>
        <button type="button" className={`home-nav${view === 'all' && here === null ? ' selected' : ''}${dropOver === 'root' ? ' drop-over' : ''}`} {...dropTarget(null)} onClick={() => { setView('all'); setSelected(null); setRenaming(false); clearStatus() }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>
          <span className="home-nav-name">All diagrams</span><span className="home-count">{library.length}</span>
        </button>
        <button type="button" className={`home-nav${view === 'starred' ? ' selected' : ''}`} onClick={() => { setView('starred'); setRenaming(false); clearStatus() }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.7-4.8 2.7 1-5.4-4-3.8 5.4-.7z"/></svg>
          <span className="home-nav-name">Starred</span><span className="home-count">{starredCount}</span>
        </button>
        <div className="home-side-title">Folders</div>
        <nav className="home-tree" aria-label="Folder tree">
          {tree.map(({ folder, depth }) => (
            <button key={folder.id} type="button" className={`home-nav${here === folder.id ? ' selected' : ''}${dropOver === folder.id ? ' drop-over' : ''}${dragFolderId === folder.id ? ' dragging' : ''}`} draggable={dragEnabled && foldersMovable} onDragStart={dragEnabled && foldersMovable ? (event) => { setDragFolderId(folder.id); setDragId(null); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData(FOLDER_DRAG_TYPE, folder.id); event.dataTransfer.setData('text/plain', folder.name) } : undefined} onDragEnd={dragEnabled && foldersMovable ? () => { setDragFolderId(null); setDropOver(null) } : undefined} style={{ paddingLeft: 12 + depth * 18 }} {...dropTarget(folder.id)} onClick={() => { setView('all'); setSelected(folder.id); setRenaming(false); clearStatus() }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
              <span className="home-nav-name">{folder.name}</span><span className="home-count">{countInFolder(library, folders, folder.id)}</span>
            </button>
          ))}
          {tree.length === 0 && <p className="home-side-empty">No folders yet</p>}
        </nav>

        {creating
          ? <div className="home-inline-edit">
            <input type="text" aria-label="New folder name" autoFocus maxLength={60} placeholder={hereFolder ? `Inside ${hereFolder.name}` : 'Folder name'} value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitCreate(); if (event.key === 'Escape') { event.stopPropagation(); setCreating(false) } }} />
            <button type="button" onClick={submitCreate}>Create</button>
          </div>
          : <button type="button" className="home-side-button" onClick={() => { setCreating(true); setDraftName('') }}>+ New folder{hereFolder ? ' inside' : ''}</button>}

        <div className="home-storage">
          <span>Saved in: <strong>{props.storageText}</strong>{props.storageLocked ? ' (not saving)' : ''}</span>
          <button type="button" onClick={props.onChangeStorage}>{props.storageLocked ? 'Fix' : 'Change'}</button>
        </div>
        {props.showConnectHint && <p className="home-hint">Connect Google Drive to use these folders on your other devices.</p>}
      </aside>

      <main className="home-main">
        <header className="home-top">
          <button type="button" className="home-back" onClick={props.onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
            <span>Back to canvas</span>
          </button>
          <label className="home-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/></svg>
            <input ref={searchRef} type="search" aria-label="Search diagrams" placeholder={props.desktop ? 'Search diagrams' : 'Search diagrams or folders (press /)'} value={query} onChange={(event) => setQuery(event.target.value)} />
            {props.desktop && !query && <kbd className="home-search-kbd" aria-hidden="true">/</kbd>}
          </label>
          <button type="button" className="home-secondary" onClick={() => importRef.current?.click()}>Import .inkpad</button>
          <div ref={newMenuRef} className="home-new">
            <button ref={newButtonRef} type="button" className="home-primary" aria-haspopup="dialog" aria-expanded={newMenuOpen} onClick={() => setNewMenuOpen((open) => !open)}>+ New diagram</button>
            {newMenuOpen && <div className="home-new-menu home-new-chooser" role="dialog" aria-label="New diagram">
              <p className="home-new-heading">Board</p>
              <div className="bp-tiles home-new-boards">
                {BOARD_STYLES.map((style) => (
                  <PickerTile key={style.id} label={style.label} title={style.description} selected={newChoice.style === style.id} onClick={() => setNewChoice({ ...newChoice, style: style.id })}>
                    <BoardStylePreview style={style.id} dark={newChoice.dark} />
                  </PickerTile>
                ))}
              </div>
              {newChoice.style === 'chalk'
                ? <p className="home-new-note">Chalkboard is always dark.</p>
                : <div className="home-new-theme" role="group" aria-label="Board theme">
                  {[false, true].map((dark) => (
                    <button key={String(dark)} type="button" aria-pressed={newChoice.dark === dark} className={newChoice.dark === dark ? 'selected' : ''} onClick={() => setNewChoice({ ...newChoice, dark })}>{dark ? 'Dark' : 'Light'}</button>
                  ))}
                </div>}
              <p className="home-new-heading">Canvas (tap one to create)</p>
              <div className="bp-tiles home-new-canvases">
                {CANVAS_TYPES.map((type) => (
                  <PickerTile key={type.id} label={type.label} title={`${type.label}: ${type.description}`} selected={newChoice.canvas === type.id} onClick={() => {
                    const choice = { ...newChoice, canvas: type.id }
                    saveNewDiagramChoice(choice)
                    setNewChoice(choice)
                    setNewMenuOpen(false)
                    const options = newDiagramOptionsFor(choice)
                    props.onNewDiagram(here, options.template, options)
                  }}>
                    <CanvasPreview type={type.id} board={boardFieldsFor(newChoice.style, newChoice.dark).board} />
                  </PickerTile>
                ))}
              </div>
            </div>}
          </div>
          <input ref={importRef} type="file" accept=".inkpad,application/json" hidden onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) props.onImportFile(file)
          }} />
        </header>

        {props.notice && <p className="home-notice" role="alert">{props.notice}</p>}
        {pendingItem && <div className="home-undo" role="status">
          {pendingRunning ? (pendingItem.count && pendingItem.count > 1 ? <span>Deleting {pendingLabel(pendingItem)}…</span> : <span>Deleting “{pendingItem.label}”…</span>) : (pendingItem.count && pendingItem.count > 1 ? <span>Deleted {pendingLabel(pendingItem)}</span> : <span>Deleted “{pendingItem.label}”</span>)}
          {!pendingRunning && <button type="button" onClick={() => { pending.cancel() }}>Undo</button>}
        </div>}
        {moveUndo && !pendingItem && <div className="home-undo home-move-undo" role="status">
          <span>{moveUndo.text}</span>
          <button type="button" onClick={moveUndo.undo}>Undo</button>
        </div>}
        {status && <p className="home-status" role="status">{status}</p>}

        {movingFolder && <div className="home-confirm" role="dialog" aria-label={`Move folder ${movingFolder.name}`}>
          <p>Move “{movingFolder.name}” (with everything inside it) to:</p>
          <ul className="home-move-list">
            {folderMoveTargets(folders, movingFolder.id).map(({ folder, depth }) => (
              <li key={folder?.id ?? 'root'}><button type="button" style={{ paddingLeft: 12 + depth * 18 }} onClick={() => void moveFolderTo(movingFolder, folder?.id ?? null)}>{folder ? folder.name : 'All diagrams (top level)'}</button></li>
            ))}
          </ul>
          <div className="home-confirm-actions"><button type="button" onClick={() => setMovingFolderId(null)}>Cancel</button></div>
        </div>}

        {confirmFolder && <div className="home-confirm" role="alertdialog" aria-label="Delete folder">
          <p>Delete “{confirmFolder.name}” and everything inside it? This removes {countInFolder(library, folders, confirmFolder.id)} diagram{countInFolder(library, folders, confirmFolder.id) === 1 ? '' : 's'} and any subfolders. You can Undo for a few seconds after deleting.</p>
          <div className="home-confirm-actions">
            <button type="button" className="home-danger" onClick={() => { const gone = confirmFolder; setConfirmFolderId(null); const confirmed = [...hiddenForFolder(folders, library, gone.id)].filter((id) => library.some((entry) => entry.id === id)); props.onFolderDeleteScheduled?.(gone.id); deleteWithUndo({ kind: 'folder', id: gone.id, label: gone.name, hidden: hiddenForFolder(folders, library, gone.id), hides: (id) => hidesInFolder(latestLists.current.folders, latestLists.current.library, gone.id, id), run: () => props.onDeleteFolder(gone.id, confirmed) }) }}>Delete folder</button>
            <button type="button" onClick={() => setConfirmFolderId(null)}>Cancel</button>
          </div>
        </div>}

        {moveTarget && <div className="home-confirm" role="dialog" aria-label={`Move ${moveTarget.title}`}>
          <p>Move “{moveTarget.title || 'Untitled diagram'}” to:</p>
          <ul className="home-move-list">
            <li><button type="button" className={moveTarget.folderId === null ? 'selected' : undefined} onClick={() => moveTo(moveTarget, null)}>All diagrams (top level)</button></li>
            {tree.map(({ folder, depth }) => (
              <li key={folder.id}><button type="button" style={{ paddingLeft: 12 + depth * 18 }} className={moveTarget.folderId === folder.id ? 'selected' : undefined} onClick={() => moveTo(moveTarget, folder.id)}>{folder.name}</button></li>
            ))}
          </ul>
          <div className="home-confirm-actions"><button type="button" onClick={() => setMovingId(null)}>Cancel</button></div>
        </div>}

        {selectMode && <div className="home-selectbar" role="toolbar" aria-label="Selected diagrams">
          <strong>{selectionLabel(chosenIds.length)}</strong>
          <button type="button" disabled={shownIds.length === 0 || allSelected(selection, shownIds)} onClick={() => setSelection(selectAllIds(shownIds))}>Select all</button>
          <button type="button" disabled={chosenIds.length === 0 || busyMany} onClick={() => { setConfirmMany(false); setMovingMany(true) }}>Move…</button>
          <button type="button" className="home-danger" disabled={chosenIds.length === 0 || busyMany} onClick={() => { setMovingMany(false); setConfirmMany(true) }}>Delete</button>
          <button type="button" onClick={exitSelect}>Cancel</button>
        </div>}
        {selectMode && confirmMany && chosenIds.length > 0 && <div className="home-confirm" role="alertdialog" aria-label="Delete selected diagrams">
          <p>{deleteConfirmText(chosenIds.length)} You can Undo for a few seconds.</p>
          <div className="home-confirm-actions">
            <button type="button" className="home-danger" onClick={deleteMany}>Delete</button>
            <button type="button" onClick={() => setConfirmMany(false)}>Cancel</button>
          </div>
        </div>}
        {selectMode && movingMany && chosenIds.length > 0 && <div className="home-confirm" role="dialog" aria-label={`Move ${chosenIds.length} selected diagrams`}>
          <p>Move {chosenIds.length} selected diagram{chosenIds.length === 1 ? '' : 's'} to:</p>
          <ul className="home-move-list">
            <li><button type="button" onClick={() => void moveMany(null)}>All diagrams (top level)</button></li>
            {tree.map(({ folder, depth }) => (
              <li key={folder.id}><button type="button" style={{ paddingLeft: 12 + depth * 18 }} onClick={() => void moveMany(folder.id)}>{folder.name}</button></li>
            ))}
          </ul>
          <div className="home-confirm-actions"><button type="button" onClick={() => setMovingMany(false)}>Cancel</button></div>
        </div>}

        <div className="home-heading-row">
          {renaming && hereFolder
            ? <div className="home-inline-edit">
              <input type="text" aria-label="Folder name" autoFocus maxLength={60} value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitRename(); if (event.key === 'Escape') { event.stopPropagation(); setRenaming(false) } }} />
              <button type="button" onClick={submitRename}>Save</button>
            </div>
            : <h2>{trail.length > 1 && view === 'all'
              ? <>{trail.map((folder, index) => index < trail.length - 1
                ? <span key={folder.id}><button type="button" className="home-crumb" onClick={() => { setSelected(folder.id); setRenaming(false); clearStatus() }}>{folder.name}</button><span className="home-crumb-sep" aria-hidden="true"> › </span></span>
                : <span key={folder.id}>{folder.name}</span>)}</>
              : heading} <span className="home-heading-count">({shown.length})</span></h2>}
          {hereFolder && !renaming && <span className="home-folder-actions">
            <button type="button" onClick={() => { setRenaming(true); setDraftName(hereFolder.name) }}>Rename folder</button>
            {foldersMovable
              ? <button type="button" onClick={() => setMovingFolderId(hereFolder.id)}>Move to…</button>
              : props.canMoveFolders === false && <span className="home-folder-hint" title="Moving a folder is not offered for a device folder">To move a folder, use your file manager.</span>}
            <button type="button" onClick={() => setConfirmFolderId(hereFolder.id)}>Delete folder</button>
          </span>}
          <button type="button" className={`home-select-toggle${selectMode ? ' selected' : ''}`} title="Select several diagrams" aria-pressed={selectMode} onClick={() => { if (selectMode) exitSelect(); else setSelectMode(true) }}>{selectMode ? 'Done' : 'Select'}</button>
          <label className="home-sort">
            <span>Sort</span>
            <select aria-label="Sort" value={sort} onChange={(event) => chooseSort(parseLibrarySort(event.target.value))}>
              {LIBRARY_SORTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <span className="home-layout" role="group" aria-label="Layout">
            <button type="button" aria-label="Grid" aria-pressed={layout === 'grid'} className={layout === 'grid' ? 'selected' : undefined} onClick={() => chooseLayout('grid')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/></svg>
            </button>
            <button type="button" aria-label="List" aria-pressed={layout === 'list'} className={layout === 'list' ? 'selected' : undefined} onClick={() => chooseLayout('list')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>
            </button>
          </span>
        </div>

        {showRecent && <section className="home-recent" aria-label="Recent">
          <h3>Recent</h3>
          <ul>
            {recent.map((entry) => (
              <li key={entry.id}>
                <button type="button" aria-label={`Open recent ${entry.title || 'Untitled diagram'}`} onClick={() => openDiagram(entry.id)}>
                  <span className="home-recent-preview" aria-hidden="true">{props.thumbnails[entry.id] ? <img src={props.thumbnails[entry.id]} alt="" draggable={false} /> : <svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>}</span>
                  <span className="home-card-title">{entry.title || 'Untitled diagram'}</span>
                  <span className="home-card-meta">{describeEdited(entry.updatedAt) || 'earlier'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>}

        <ul className={`home-cards home-${layout}`} aria-label="Diagrams">
          {shown.map((entry) => {
            const isStarred = starredSet.has(entry.id)
            const where = folderLabel(folders, entry.folderId && folders.some((folder) => folder.id === entry.folderId) ? entry.folderId : null)
            return (
              <li key={entry.id} className={`home-card${entry.id === props.currentId ? ' current' : ''}${selectMode && selection.has(entry.id) ? ' picked' : ''}${dragId === entry.id ? ' dragging' : ''}`} draggable={dragEnabled && renamingDiagramId !== entry.id} onDragStart={dragEnabled ? (event) => { setDragId(entry.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', entry.title || 'Untitled diagram') } : undefined} onDragEnd={dragEnabled ? () => { setDragId(null); setDropOver(null) } : undefined}>
                {selectMode && <label className="home-card-check" title={`Select ${entry.title || 'Untitled diagram'}`}>
                  <input type="checkbox" aria-label={`Select ${entry.title || 'Untitled diagram'}`} checked={selection.has(entry.id)} onChange={() => setSelection((current) => toggleSelected(current, entry.id))} />
                </label>}
                <button type="button" className="home-card-open" aria-label={selectMode ? `Select ${entry.title || 'Untitled diagram'}` : `Open ${entry.title || 'Untitled diagram'}`} aria-pressed={selectMode ? selection.has(entry.id) : undefined} onClick={() => (selectMode ? setSelection((current) => toggleSelected(current, entry.id)) : openDiagram(entry.id))}>
                  <span className="home-card-preview" aria-hidden="true">
                    {props.thumbnails[entry.id]
                      ? <img src={props.thumbnails[entry.id]} alt="" draggable={false} />
                      : <svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>}
                  </span>
                  <span className="home-card-title" title={props.desktop ? (entry.title || 'Untitled diagram') : undefined}>{entry.title || 'Untitled diagram'}</span>
                  <span className="home-card-folder">{where || 'No folder'}</span>
                  {contentSnippets.has(entry.id) && <span className="home-card-snippet">Contains: {contentSnippets.get(entry.id)}</span>}
                  <span className="home-card-meta">{entry.id === props.currentId ? 'Open now · ' : ''}Edited {describeEdited(entry.updatedAt) || 'earlier'} · {entry.itemCount} item{entry.itemCount === 1 ? '' : 's'}{entry.pageCount && entry.pageCount > 1 ? ` · ${entry.pageCount} pages` : ''}</span>
                </button>
                <button type="button" className={`home-star${isStarred ? ' on' : ''}`} aria-pressed={isStarred} aria-label={`${isStarred ? 'Unstar' : 'Star'} ${entry.title || 'Untitled diagram'}`} onClick={() => props.onToggleStar(entry.id)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.7-4.8 2.7 1-5.4-4-3.8 5.4-.7z"/></svg>
                </button>
                {renamingDiagramId === entry.id && <div className="home-inline-edit home-card-rename">
                  <input type="text" aria-label="Diagram name" autoFocus maxLength={80} value={diagramDraft} onChange={(event) => setDiagramDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitDiagramRename(entry.id); if (event.key === 'Escape') { event.stopPropagation(); setRenamingDiagramId(null) } }} />
                  <button type="button" onClick={() => submitDiagramRename(entry.id)}>Save</button>
                </div>}
                {renamingDiagramId !== entry.id && !selectMode && <span className="home-card-actions">
                  <button type="button" aria-label={`Rename ${entry.title || 'Untitled diagram'}`} onClick={() => { setRenamingDiagramId(entry.id); setDiagramDraft(entry.title || '') }}>Rename</button>
                  <button type="button" aria-label={`Make a copy of ${entry.title || 'Untitled diagram'}`} title="Make a copy" disabled={copyingId !== null} aria-busy={copyingId === entry.id} onClick={() => void makeCopy(entry.id)}>{copyingId === entry.id ? 'Copying…' : 'Make a copy'}</button>
                  <button type="button" aria-label={`Move${entry.title || 'Untitled diagram'}`} onClick={() => setMovingId(entry.id)}>Move</button>
                  {confirmDiagramId === entry.id
                    ? <button type="button" className="home-danger" onClick={() => { setConfirmDiagramId(null); deleteWithUndo({ kind: 'diagram', id: entry.id, label: entry.title || 'Untitled diagram', hidden: hiddenForDiagram(entry.id), run: () => props.onDeleteDiagram(entry.id) }) }}>Delete?</button>
                    : <button type="button" aria-label={`Delete ${entry.title || 'Untitled diagram'}`} onClick={() => setConfirmDiagramId(entry.id)}>Delete</button>}
                </span>}
              </li>
            )
          })}
        </ul>
        {shown.length === 0 && here && !query.trim() && view === 'all' && <div className="home-empty">
          <p>This folder is empty.</p>
          <button type="button" className="home-primary" onClick={() => { const options = newDiagramOptionsFor(newChoice); props.onNewDiagram(here, options.template, options) }}>New diagram here</button>
        </div>}
        {props.desktop && showLibraryWelcome({ shown: shown.length, inFolder: Boolean(here), searching: Boolean(query.trim()), starredView: view !== 'all' }) && <div className="home-welcome">
          <h2>Your library is empty</h2>
          <p>Diagrams save by themselves as you draw.</p>
          <button type="button" className="home-primary" onClick={() => { const options = newDiagramOptionsFor({ ...newChoice, canvas: 'blank' }); props.onNewDiagram(null, options.template, options) }}>New blank diagram</button>
        </div>}
        {shown.length === 0 && !(here && !query.trim() && view === 'all') && !(props.desktop && showLibraryWelcome({ shown: shown.length, inFolder: Boolean(here), searching: Boolean(query.trim()), starredView: view !== 'all' })) && <p className="home-empty">{query.trim() ? 'No diagram matches your search.' : view === 'starred' ? `No starred diagrams yet. Tap the star on a diagram to keep it here${props.starsSync ? ' (stars sync through Google Drive)' : ' (stars stay on this device)'}.` : here ? 'This folder is empty.' : 'Nothing saved yet. Tap “New diagram”, pick a sheet and start writing; it saves by itself.'}</p>}
      </main>
    </div>
  )
}
