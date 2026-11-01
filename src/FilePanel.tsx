import { useEffect, useRef, useState } from 'react'
import type { DocumentSummary } from './documentStore'
import type { StorageInfo } from './app/useDocuments'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'locked'

type FilePanelProps = {
  title: string
  saveStatus: SaveStatus
  notice: string | null
  library: DocumentSummary[]
  currentId: string | null
  onClose: () => void
  onTitleChange: (title: string) => void
  onNew: () => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onExportDocument: () => void
  onImportFile: (file: File) => void
  onExportSvg: () => void
  onExportPng: (scale: 1 | 2) => void
  canExport: boolean
  storage: StorageInfo
  onChooseDeviceFolder: () => void
  onReconnectDeviceFolder: () => void
  onUseBrowserStorage: () => void
  onCopyBrowserToDevice: () => void
}

export const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: 'Not saved yet',
  saving: 'Saving…',
  saved: 'Saved in this browser',
  error: 'Could not save — export a copy',
  locked: 'Device folder locked — not saving',
}

export function statusLabel(status: SaveStatus, storageKind: 'browser' | 'device'): string {
  return status === 'saved' && storageKind === 'device' ? 'Saved in your device folder' : STATUS_LABEL[status]
}

export function FilePanel(props: FilePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [draftTitle, setDraftTitle] = useState(props.title)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [titleSaved, setTitleSaved] = useState(false)
  useEffect(() => setDraftTitle(props.title), [props.title])
  const draftRef = useRef(draftTitle)
  draftRef.current = draftTitle
  const latest = useRef(props)
  latest.current = props

  const commitTitle = () => {
    if (draftRef.current !== latest.current.title) latest.current.onTitleChange(draftRef.current)
  }
  // Closing the panel by any route (Close, tapping outside, Escape) keeps the typed name.
  const closePanel = () => { commitTitle(); latest.current.onClose() }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') closePanel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const saveTitle = () => { commitTitle(); setTitleSaved(true); window.setTimeout(() => setTitleSaved(false), 1500) }

  return (
    <div className="file-panel-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) closePanel() }}>
      <section className="file-panel" role="dialog" aria-modal="true" aria-label="Diagrams and export">
        <header className="file-panel-header">
          <strong>Diagram</strong>
          <button type="button" className="file-panel-close" aria-label="Close" onClick={closePanel}>×</button>
        </header>
        <div className="file-panel-field">
          <label htmlFor="diagram-title-input">Title</label>
          <div className="file-panel-title-row">
          <input
            id="diagram-title-input"
            type="text"
            value={draftTitle}
            maxLength={120}
            aria-label="Diagram title"
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => { if (event.key === 'Enter') { saveTitle(); event.currentTarget.blur() } }}
          />
          <button type="button" className="file-panel-save-title" aria-label="Save title" onClick={saveTitle}>{titleSaved ? 'Saved ✓' : 'Save'}</button>
          </div>
        </div>
        <p className={`file-panel-status status-${props.saveStatus}`} role="status">{statusLabel(props.saveStatus, props.storage.kind)}</p>
        {props.notice && <p className="file-panel-notice" role="alert">{props.notice}</p>}

        <div className="file-panel-actions">
          <button type="button" onClick={props.onNew}>New diagram</button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>Import .inkpad</button>
          <button type="button" onClick={props.onExportDocument}>Export .inkpad</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".inkpad,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) props.onImportFile(file)
            }}
          />
        </div>

        <h3>Export image</h3>
        <div className="file-panel-actions">
          <button type="button" disabled={!props.canExport} onClick={props.onExportSvg}>SVG</button>
          <button type="button" disabled={!props.canExport} onClick={() => props.onExportPng(1)}>PNG</button>
          <button type="button" disabled={!props.canExport} onClick={() => props.onExportPng(2)}>PNG @2x</button>
        </div>
        <p className="file-panel-hint">Images are cropped to your drawing and include the sheet color and page style.</p>

        <h3>Storage</h3>
        <div className="file-panel-storage">
          {props.storage.kind === 'browser' && <p className="file-panel-hint">Diagrams are saved in this browser. The browser can clear them, so keep a device folder or export copies for anything important.</p>}
          {props.storage.kind === 'device' && !props.storage.locked && <p className="file-panel-hint">Saving into your device folder “{props.storage.folderName}”. Folders you make in InkPad are real folders there, and each diagram is a .inkpad file.</p>}
          {props.storage.kind === 'device' && props.storage.locked && <p className="file-panel-notice" role="alert">Your device folder “{props.storage.folderName}” needs permission again after a restart. Nothing is being saved until you reconnect.</p>}
          <div className="file-panel-actions">
            {props.storage.kind === 'device' && props.storage.locked && <button type="button" className="file-panel-primary" onClick={props.onReconnectDeviceFolder}>Reconnect folder</button>}
            {props.storage.supported && <button type="button" onClick={props.onChooseDeviceFolder}>{props.storage.kind === 'device' ? 'Choose another folder…' : 'Save to a device folder…'}</button>}
            {props.storage.kind === 'device' && !props.storage.locked && <button type="button" onClick={props.onCopyBrowserToDevice}>Copy browser diagrams here</button>}
            {props.storage.kind === 'device' && <button type="button" onClick={props.onUseBrowserStorage}>Use browser storage</button>}
          </div>
          {!props.storage.supported && <p className="file-panel-hint">Saving to a device folder needs Chrome or Edge on a secure (https) address.</p>}
        </div>

        <h3>{props.storage.kind === 'device' ? 'Saved in your device folder' : 'Saved in this browser'}</h3>
        <ul className="file-panel-list">
          {props.library.length === 0 && <li className="file-panel-empty">Nothing saved yet. Drawing is saved automatically.</li>}
          {props.library.map((entry) => (
            <li key={entry.id} className={entry.id === props.currentId ? 'current' : undefined}>
              <button type="button" className="file-panel-open" onClick={() => props.onOpen(entry.id)} disabled={entry.id === props.currentId}>
                <span className="file-panel-entry-title">{entry.title}</span>
                <span className="file-panel-entry-meta">{entry.itemCount} items · {new Date(entry.updatedAt).toLocaleString()}</span>
              </button>
              {confirmDeleteId === entry.id
                ? <button type="button" className="file-panel-danger" onClick={() => { setConfirmDeleteId(null); props.onDelete(entry.id) }}>Delete?</button>
                : <button type="button" aria-label={`Delete ${entry.title}`} onClick={() => setConfirmDeleteId(entry.id)}>Delete</button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
