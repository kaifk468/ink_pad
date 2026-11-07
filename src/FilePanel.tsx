import { useEffect, useRef, useState } from 'react'
import type { StorageInfo } from './app/useDocuments'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'locked'

type FilePanelProps = {
  title: string
  saveStatus: SaveStatus
  notice: string | null
  onClose: () => void
  onTitleChange: (title: string) => void
  onNew: () => void
  onExportDocument: () => void
  onImportFile: (file: File) => void
  onExportSvg: () => void
  onExportPng: (scale: 1 | 2) => void
  canExport: boolean
  storage: StorageInfo
}

export const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: 'Not saved yet',
  saving: 'Saving…',
  saved: 'Saved in this browser',
  error: 'Could not save — export a copy',
  locked: 'Storage locked — not saving',
}

export function statusLabel(status: SaveStatus, storageKind: 'browser' | 'device' | 'drive'): string {
  if (status === 'saved' && storageKind === 'device') return 'Saved in your device folder'
  if (status === 'saved' && storageKind === 'drive') return 'Saved to Google Drive'
  return STATUS_LABEL[status]
}

export function FilePanel(props: FilePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [draftTitle, setDraftTitle] = useState(props.title)
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

      </section>
    </div>
  )
}
