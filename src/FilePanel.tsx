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
  /** Text outline of the whole diagram (Markdown): copy it, or download a .md file. */
  onCopyOutline: () => void
  /** The current page as a Mermaid flowchart on the clipboard. */
  onCopyMermaid: () => void
  onDownloadOutline: () => void
  /** The selection (or the current page) as an Excalidraw file; the clipboard version (desktop only) pastes into excalidraw.com. */
  onDownloadExcalidraw: () => void
  onCopyExcalidraw?: () => void
  onExportPng: (scale: 1 | 2) => void
  /** Export and Copy as PNG leave out the sheet colour and page style. */
  transparent: boolean
  onTransparentChange: (value: boolean) => void
  /** Puts the diagram into Google Drive as one PDF that NotebookLM can import. */
  onExportNotebookLm: () => void
  exportBusy: boolean
  canExport: boolean
  /** Any page of the diagram has something to list (the outline covers every page, so it does not depend on the current page being empty). */
  canOutline: boolean
  storage: StorageInfo
  /** Desktop mode: the redesigned Export dialog (image tiles first, no title field). Tablet keeps the original layout. */
  desktop?: boolean
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
  const [pngScale, setPngScale] = useState<1 | 2>(2)
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

  if (props.desktop) {
    return (
      <div className="file-panel-backdrop export-dialog-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) closePanel() }}>
        <section className="file-panel export-dialog" role="dialog" aria-modal="true" aria-label="Diagrams and export">
          <header className="file-panel-header">
            <h2 className="export-dialog-title">Export</h2>
            <button type="button" className="file-panel-close" aria-label="Close" onClick={closePanel}>×</button>
          </header>
          <p className={`file-panel-status status-${props.saveStatus}`} role="status">{statusLabel(props.saveStatus, props.storage.kind)}</p>
          {props.notice && <p className="file-panel-notice" role="alert">{props.notice}</p>}

          <section className="export-section" aria-labelledby="export-image-heading">
            <h3 id="export-image-heading">Image</h3>
            <div className="export-tiles">
              <button type="button" className="export-tile" disabled={!props.canExport} onClick={() => props.onExportPng(pngScale)}>
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4" /></svg>
                <span className="export-tile-label">PNG</span>
                <span className="export-tile-caption">Best for docs and chat</span>
              </button>
              <button type="button" className="export-tile" disabled={!props.canExport} onClick={props.onExportSvg}>
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 18c3-1 4-5 7-6s4-5 7-6" /><circle cx="5" cy="18" r="1.8" /><circle cx="19" cy="6" r="1.8" /></svg>
                <span className="export-tile-label">SVG</span>
                <span className="export-tile-caption">Sharp at any size</span>
              </button>
            </div>
            <div className="export-scale-row">
              <span id="export-scale-label">Scale</span>
              <div className="export-segmented" role="group" aria-labelledby="export-scale-label">
                <button type="button" aria-pressed={pngScale === 1} className={pngScale === 1 ? 'selected' : ''} onClick={() => setPngScale(1)}>1x</button>
                <button type="button" aria-pressed={pngScale === 2} className={pngScale === 2 ? 'selected' : ''} onClick={() => setPngScale(2)}>2x</button>
              </div>
            </div>
            <label className="export-switch-row">
              <span>Transparent background</span>
              <input type="checkbox" role="switch" className="export-switch" checked={props.transparent} onChange={(event) => props.onTransparentChange(event.target.checked)} />
            </label>
            <p className="file-panel-hint">Images are cropped to your drawing. Transparent background also applies to Copy as PNG.</p>
          </section>

          <section className="export-section" aria-labelledby="export-file-heading">
            <h3 id="export-file-heading">Diagram file</h3>
            <div className="export-file-row">
              <button type="button" onClick={props.onExportDocument}>Export .inkpad</button>
              <button type="button" onClick={() => fileInputRef.current?.click()}>Import .inkpad</button>
              <button type="button" onClick={props.onNew}>New diagram</button>
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
          </section>

          <details className="export-more">
            <summary>Text and other apps</summary>
            <h3>Text outline</h3>
            <div className="file-panel-actions">
              <button type="button" disabled={!props.canOutline} title="Copy a Markdown outline of every page: components, connections, notes, classes and code" onClick={props.onCopyOutline}>Copy as text outline</button>
              <button type="button" disabled={!props.canExport} title="Copy the current page as a Mermaid flowchart: boxes and the links between them" onClick={props.onCopyMermaid}>Copy as Mermaid</button>
              <button type="button" disabled={!props.canOutline} title="Save the outline as a Markdown file named after the diagram" onClick={props.onDownloadOutline}>Download outline (.md)</button>
            </div>

            <h3>Excalidraw</h3>
            <div className="file-panel-actions">
              <button type="button" disabled={!props.canExport} title="Save the selection (or the current page) as an Excalidraw file" onClick={props.onDownloadExcalidraw}>Download .excalidraw</button>
              {props.onCopyExcalidraw && <button type="button" disabled={!props.canExport} title="Copy the selection (or the current page) so it pastes into excalidraw.com" onClick={props.onCopyExcalidraw}>Copy for Excalidraw</button>}
            </div>

            <h3>NotebookLM</h3>
            <div className="file-panel-actions">
              <button type="button" disabled={!props.canExport || props.exportBusy} onClick={props.onExportNotebookLm}>{props.exportBusy ? 'Exporting…' : 'Export to Google Drive'}</button>
            </div>
            <p className="file-panel-hint">Saves this diagram as one PDF (every page, pen strokes on plain white) in the “InkPad exports” folder of your Google Drive. Exporting again replaces that file, so NotebookLM keeps a single source. The first time, Google asks to let InkPad create files in your Drive.</p>
          </details>
        </section>
      </div>
    )
  }

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
        <label className="file-panel-check"><input type="checkbox" checked={props.transparent} onChange={(event) => props.onTransparentChange(event.target.checked)} /> Transparent background</label>
        <p className="file-panel-hint">Images are cropped to your drawing and include the sheet color and page style, unless Transparent background is on (it also applies to Copy as PNG).</p>

        <h3>Text outline</h3>
        <div className="file-panel-actions">
          <button type="button" disabled={!props.canOutline} title="Copy a Markdown outline of every page: components, connections, notes, classes and code" onClick={props.onCopyOutline}>Copy as text outline</button>
          <button type="button" disabled={!props.canExport} title="Copy the current page as a Mermaid flowchart: boxes and the links between them" onClick={props.onCopyMermaid}>Copy as Mermaid</button>
          <button type="button" disabled={!props.canOutline} title="Save the outline as a Markdown file named after the diagram" onClick={props.onDownloadOutline}>Download outline (.md)</button>
        </div>

        <h3>Excalidraw</h3>
        <div className="file-panel-actions">
          <button type="button" disabled={!props.canExport} title="Save the selection (or the current page) as an Excalidraw file" onClick={props.onDownloadExcalidraw}>Download .excalidraw</button>
          {props.onCopyExcalidraw && <button type="button" disabled={!props.canExport} title="Copy the selection (or the current page) so it pastes into excalidraw.com" onClick={props.onCopyExcalidraw}>Copy for Excalidraw</button>}
        </div>

        <h3>NotebookLM</h3>
        <div className="file-panel-actions">
          <button type="button" disabled={!props.canExport || props.exportBusy} onClick={props.onExportNotebookLm}>{props.exportBusy ? 'Exporting…' : 'Export to Google Drive'}</button>
        </div>
        <p className="file-panel-hint">Saves this diagram as one PDF (every page, pen strokes on plain white) in the “InkPad exports” folder of your Google Drive. Exporting again replaces that file, so NotebookLM keeps a single source. The first time, Google asks to let InkPad create files in your Drive.</p>

      </section>
    </div>
  )
}
