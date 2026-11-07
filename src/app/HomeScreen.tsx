import { useEffect, useMemo, useRef, useState } from 'react'
import type { DocumentSummary, FolderRecord } from '../documentStore'
import { flattenFolders } from '../folderTree'
import { countInFolder, describeEdited, folderLabel, searchLibrary, type LibraryLayout } from '../libraryView'

type HomeScreenProps = {
  library: DocumentSummary[]
  folders: FolderRecord[]
  currentId: string | null
  /** Small page pictures by diagram id; a card without one shows an icon. */
  thumbnails: Record<string, string>
  notice: string | null
  storageText: string
  storageLocked: boolean
  showConnectHint: boolean
  onClose: () => void
  onOpenDiagram: (id: string) => void
  onNewDiagram: (folderId: string | null) => void
  onImportFile: (file: File) => void
  onCreateFolder: (name: string, parentId: string | null) => void
  onRenameFolder: (id: string, name: string) => void
  onDeleteFolder: (id: string) => void
  onMoveDiagram: (docId: string, folderId: string | null) => void
  onDeleteDiagram: (id: string) => void
  onChangeStorage: () => void
}

const LAYOUT_KEY = 'inkpad.libraryLayout'

function readLayout(): LibraryLayout {
  try { return window.localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'grid' } catch { return 'grid' }
}

/** Full-screen library: folder tree on the left, search, and the diagrams as cards or a list. Opens from the folder button. */
export function HomeScreen(props: HomeScreenProps) {
  const { library, folders } = props
  const importRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [layout, setLayout] = useState<LibraryLayout>(readLayout)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [confirmFolderId, setConfirmFolderId] = useState<string | null>(null)
  const [confirmDiagramId, setConfirmDiagramId] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)

  // If the chosen folder disappears (deleted), fall back to all diagrams.
  const here = selected && folders.some((folder) => folder.id === selected) ? selected : null
  const hereFolder = here ? folders.find((folder) => folder.id === here) : undefined
  const shown = useMemo(() => searchLibrary(library, folders, { query, folderId: here }), [library, folders, query, here])
  const tree = useMemo(() => flattenFolders(folders), [folders])
  const confirmFolder = confirmFolderId ? folders.find((folder) => folder.id === confirmFolderId) : undefined
  const moveTarget = movingId ? library.find((entry) => entry.id === movingId) : undefined

  const closeRef = useRef(props.onClose)
  closeRef.current = props.onClose
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closeRef.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const chooseLayout = (value: LibraryLayout) => {
    setLayout(value)
    try { window.localStorage.setItem(LAYOUT_KEY, value) } catch { /* per-viewer convenience only */ }
  }
  const submitCreate = () => { props.onCreateFolder(draftName, here); setCreating(false); setDraftName('') }
  const submitRename = () => { if (here) props.onRenameFolder(here, draftName); setRenaming(false); setDraftName('') }
  const heading = hereFolder ? hereFolder.name : 'All diagrams'

  return (
    <div className="home-screen" role="dialog" aria-modal="true" aria-label="Library">
      <aside className="home-side" aria-label="Folders">
        <div className="home-brand"><span className="brand-mark" aria-hidden="true"><span /></span><strong>Ink Pad</strong></div>
        <button type="button" className={`home-nav${here === null ? ' selected' : ''}`} onClick={() => { setSelected(null); setRenaming(false) }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>
          <span className="home-nav-name">All diagrams</span><span className="home-count">{library.length}</span>
        </button>
        <div className="home-side-title">Folders</div>
        <nav className="home-tree" aria-label="Folder tree">
          {tree.map(({ folder, depth }) => (
            <button key={folder.id} type="button" className={`home-nav${here === folder.id ? ' selected' : ''}`} style={{ paddingLeft: 12 + depth * 18 }} onClick={() => { setSelected(folder.id); setRenaming(false) }}>
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
            <input type="search" aria-label="Search diagrams" placeholder="Search diagrams or folders" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <button type="button" className="home-secondary" onClick={() => importRef.current?.click()}>Import .inkpad</button>
          <button type="button" className="home-primary" onClick={() => props.onNewDiagram(here)}>+ New diagram</button>
          <input ref={importRef} type="file" accept=".inkpad,application/json" hidden onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) props.onImportFile(file)
          }} />
        </header>

        {props.notice && <p className="home-notice" role="alert">{props.notice}</p>}

        {confirmFolder && <div className="home-confirm" role="alertdialog" aria-label="Delete folder">
          <p>Delete “{confirmFolder.name}” and everything inside it? This removes {countInFolder(library, folders, confirmFolder.id)} diagram{countInFolder(library, folders, confirmFolder.id) === 1 ? '' : 's'} and any subfolders. It cannot be undone.</p>
          <div className="home-confirm-actions">
            <button type="button" className="home-danger" onClick={() => { props.onDeleteFolder(confirmFolder.id); setConfirmFolderId(null) }}>Delete folder</button>
            <button type="button" onClick={() => setConfirmFolderId(null)}>Cancel</button>
          </div>
        </div>}

        {moveTarget && <div className="home-confirm" role="dialog" aria-label={`Move ${moveTarget.title}`}>
          <p>Move “{moveTarget.title || 'Untitled diagram'}” to:</p>
          <ul className="home-move-list">
            <li><button type="button" className={moveTarget.folderId === null ? 'selected' : undefined} onClick={() => { props.onMoveDiagram(moveTarget.id, null); setMovingId(null) }}>All diagrams (top level)</button></li>
            {tree.map(({ folder, depth }) => (
              <li key={folder.id}><button type="button" style={{ paddingLeft: 12 + depth * 18 }} className={moveTarget.folderId === folder.id ? 'selected' : undefined} onClick={() => { props.onMoveDiagram(moveTarget.id, folder.id); setMovingId(null) }}>{folder.name}</button></li>
            ))}
          </ul>
          <div className="home-confirm-actions"><button type="button" onClick={() => setMovingId(null)}>Cancel</button></div>
        </div>}

        <div className="home-heading-row">
          {renaming && hereFolder
            ? <div className="home-inline-edit">
              <input type="text" aria-label="Folder name" autoFocus maxLength={60} value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitRename(); if (event.key === 'Escape') { event.stopPropagation(); setRenaming(false) } }} />
              <button type="button" onClick={submitRename}>Save</button>
            </div>
            : <h2>{heading} <span className="home-heading-count">({shown.length})</span></h2>}
          {hereFolder && !renaming && <span className="home-folder-actions">
            <button type="button" onClick={() => { setRenaming(true); setDraftName(hereFolder.name) }}>Rename folder</button>
            <button type="button" onClick={() => setConfirmFolderId(hereFolder.id)}>Delete folder</button>
          </span>}
          <span className="home-layout" role="group" aria-label="Layout">
            <button type="button" aria-label="Grid" aria-pressed={layout === 'grid'} className={layout === 'grid' ? 'selected' : undefined} onClick={() => chooseLayout('grid')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/></svg>
            </button>
            <button type="button" aria-label="List" aria-pressed={layout === 'list'} className={layout === 'list' ? 'selected' : undefined} onClick={() => chooseLayout('list')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>
            </button>
          </span>
        </div>

        <ul className={`home-cards home-${layout}`} aria-label="Diagrams">
          {shown.map((entry) => {
            const where = folderLabel(folders, entry.folderId && folders.some((folder) => folder.id === entry.folderId) ? entry.folderId : null)
            return (
              <li key={entry.id} className={`home-card${entry.id === props.currentId ? ' current' : ''}`}>
                <button type="button" className="home-card-open" aria-label={`Open ${entry.title || 'Untitled diagram'}`} onClick={() => props.onOpenDiagram(entry.id)}>
                  <span className="home-card-preview" aria-hidden="true">
                    {props.thumbnails[entry.id]
                      ? <img src={props.thumbnails[entry.id]} alt="" draggable={false} />
                      : <svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>}
                  </span>
                  <span className="home-card-title">{entry.title || 'Untitled diagram'}</span>
                  <span className="home-card-folder">{where || 'No folder'}</span>
                  <span className="home-card-meta">{entry.id === props.currentId ? 'Open now · ' : ''}Edited {describeEdited(entry.updatedAt) || 'earlier'} · {entry.itemCount} item{entry.itemCount === 1 ? '' : 's'}</span>
                </button>
                <span className="home-card-actions">
                  <button type="button" aria-label={`Move ${entry.title || 'Untitled diagram'}`} onClick={() => setMovingId(entry.id)}>Move</button>
                  {confirmDiagramId === entry.id
                    ? <button type="button" className="home-danger" onClick={() => { setConfirmDiagramId(null); props.onDeleteDiagram(entry.id) }}>Delete?</button>
                    : <button type="button" aria-label={`Delete ${entry.title || 'Untitled diagram'}`} onClick={() => setConfirmDiagramId(entry.id)}>Delete</button>}
                </span>
              </li>
            )
          })}
        </ul>
        {shown.length === 0 && <p className="home-empty">{query.trim() ? 'No diagram matches your search.' : here ? 'This folder is empty.' : 'Nothing saved yet. Tap “New diagram” and start writing; it saves by itself.'}</p>}
      </main>
    </div>
  )
}
