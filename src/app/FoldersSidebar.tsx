import { useState } from 'react'
import type { DocumentSummary, FolderRecord } from '../documentStore'
import { childFolders, diagramsInFolder, flattenFolders, folderAndDescendantIds, folderPath } from '../folderTree'

type FoldersSidebarProps = {
  library: DocumentSummary[]
  folders: FolderRecord[]
  currentId: string | null
  onOpenDiagram: (id: string) => void
  onNewDiagram: (folderId: string | null) => void
  onCreateFolder: (name: string, parentId: string | null) => void
  onRenameFolder: (id: string, name: string) => void
  onDeleteFolder: (id: string) => void
  onMoveDiagram: (docId: string, folderId: string | null) => void
  notice: string | null
}

/** Folder browser: one folder level at a time, with a path to go back up. Diagrams open, move or live inside folders. */
export function FoldersSidebar(props: FoldersSidebarProps) {
  const { library, folders } = props
  const [location, setLocation] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)

  // If the folder being viewed disappears (deleted), fall back to the top level.
  const here = location && folders.some((folder) => folder.id === location) ? location : null
  const path = folderPath(folders, here)
  const subfolders = childFolders(folders, here)
  const diagrams = diagramsInFolder(library, here, folders)
  const countInside = (folderId: string) => {
    const ids = new Set(folderAndDescendantIds(folders, folderId))
    return library.filter((entry) => entry.folderId && ids.has(entry.folderId)).length
  }
  const confirmFolder = confirmDeleteId ? folders.find((folder) => folder.id === confirmDeleteId) : undefined
  const moveTarget = movingId ? library.find((entry) => entry.id === movingId) : undefined

  const submitCreate = () => {
    props.onCreateFolder(draftName, here)
    setCreating(false)
    setDraftName('')
  }
  const submitRename = (id: string) => {
    props.onRenameFolder(id, draftName)
    setRenamingId(null)
    setDraftName('')
  }

  return (
    <aside className="folders-sidebar" aria-label="Folders">
      <div className="folders-heading"><strong>Folders</strong></div>
      <nav className="folders-path" aria-label="Folder path">
        <button type="button" className={here === null ? 'selected' : undefined} onClick={() => setLocation(null)}>All diagrams</button>
        {path.map((folder) => (
          <span key={folder.id} className="folders-path-part">
            <span aria-hidden="true">/</span>
            <button type="button" className={folder.id === here ? 'selected' : undefined} onClick={() => setLocation(folder.id)}>{folder.name}</button>
          </span>
        ))}
      </nav>

      {props.notice && <p className="folders-notice" role="alert">{props.notice}</p>}

      {confirmFolder && <div className="folders-confirm" role="alertdialog" aria-label="Delete folder">
        <p>Delete “{confirmFolder.name}” and everything inside it? This removes {countInside(confirmFolder.id)} diagram{countInside(confirmFolder.id) === 1 ? '' : 's'} and any subfolders. It cannot be undone.</p>
        <div className="folders-confirm-actions">
          <button type="button" className="folders-danger" onClick={() => { props.onDeleteFolder(confirmFolder.id); setConfirmDeleteId(null) }}>Delete folder</button>
          <button type="button" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
        </div>
      </div>}

      {moveTarget && <div className="folders-move" role="dialog" aria-label={`Move ${moveTarget.title}`}>
        <p>Move “{moveTarget.title}” to:</p>
        <ul className="folders-move-list">
          <li><button type="button" className={moveTarget.folderId === null ? 'selected' : undefined} onClick={() => { props.onMoveDiagram(moveTarget.id, null); setMovingId(null) }}>All diagrams (top level)</button></li>
          {flattenFolders(folders).map(({ folder, depth }) => (
            <li key={folder.id}><button type="button" style={{ paddingLeft: 10 + depth * 16 }} className={moveTarget.folderId === folder.id ? 'selected' : undefined} onClick={() => { props.onMoveDiagram(moveTarget.id, folder.id); setMovingId(null) }}>{folder.name}</button></li>
          ))}
        </ul>
        <button type="button" onClick={() => setMovingId(null)}>Cancel</button>
      </div>}

      <ul className="folders-list" aria-label="Contents">
        {subfolders.map((folder) => (
          <li key={folder.id} className="folder-item">
            {renamingId === folder.id
              ? <div className="folders-inline-edit">
                <input type="text" aria-label="Folder name" autoFocus maxLength={60} value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitRename(folder.id); if (event.key === 'Escape') setRenamingId(null) }} />
                <button type="button" onClick={() => submitRename(folder.id)}>Save</button>
              </div>
              : <>
                <button type="button" className="folder-open" onClick={() => setLocation(folder.id)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                  <span className="folder-name">{folder.name}</span><span className="folder-count">{countInside(folder.id)}</span>
                </button>
                <button type="button" className="folder-action" aria-label={`Rename ${folder.name}`} onClick={() => { setRenamingId(folder.id); setDraftName(folder.name) }}>Rename</button>
                <button type="button" className="folder-action" aria-label={`Delete ${folder.name}`} onClick={() => setConfirmDeleteId(folder.id)}>Delete</button>
              </>}
          </li>
        ))}
        {diagrams.map((entry) => (
          <li key={entry.id} className={`diagram-item${entry.id === props.currentId ? ' current' : ''}`}>
            <button type="button" className="folder-open" onClick={() => props.onOpenDiagram(entry.id)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>
              <span className="folder-name">{entry.title || 'Untitled diagram'}</span>
            </button>
            <button type="button" className="folder-action" aria-label={`Move ${entry.title}`} onClick={() => setMovingId(entry.id)}>Move</button>
          </li>
        ))}
        {subfolders.length === 0 && diagrams.length === 0 && <li className="folders-empty">{here ? 'This folder is empty' : 'Nothing saved yet'}</li>}
      </ul>

      {creating
        ? <div className="folders-inline-edit">
          <input type="text" aria-label="New folder name" autoFocus maxLength={60} placeholder="Folder name" value={draftName} onChange={(event) => setDraftName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submitCreate(); if (event.key === 'Escape') setCreating(false) }} />
          <button type="button" onClick={submitCreate}>Create</button>
        </div>
        : <div className="folders-footer">
          <button type="button" className="folder-row new-folder" onClick={() => { setCreating(true); setDraftName('') }}>+ New folder{here ? ' here' : ''}</button>
          <button type="button" className="folder-row new-folder" onClick={() => props.onNewDiagram(here)}>+ New diagram{here ? ' here' : ''}</button>
        </div>}
    </aside>
  )
}
