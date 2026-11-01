import { useEffect, useRef, useState } from 'react'
import type { DocumentSummary, FolderRecord } from '../documentStore'
import { FoldersSidebar } from './FoldersSidebar'
import { PAGE_BACKGROUND_COLORS, type PageBackground } from '../pageBackground'
import type { PageTemplate } from '../pageTemplates'

type TopLeftBarProps = {
  title: string
  library: DocumentSummary[]
  folders: FolderRecord[]
  currentId: string | null
  pageTemplate: PageTemplate
  onPageTemplate: (value: PageTemplate) => void
  pageBackground: PageBackground
  onPageBackground: (value: PageBackground) => void
  hasInk: boolean
  filePanelOpen: boolean
  onToggleFilePanel: () => void
  onClear: () => void
  onOpenDiagram: (id: string) => void
  onFoldersOpen: () => void
  onNewDiagramIn: (folderId: string | null) => void
  onCreateFolder: (name: string, parentId: string | null) => void
  onRenameFolder: (id: string, name: string) => void
  onDeleteFolder: (id: string) => void
  onMoveDiagram: (docId: string, folderId: string | null) => void
  notice: string | null
  diagnostics: { enabled: boolean; open: boolean; onToggle: () => void }
}

const PAGE_TEMPLATE_CHOICES: Array<{ value: PageTemplate; label: string }> = [
  { value: 'blank', label: 'Blank' },
  { value: 'lined', label: 'Lined' },
  { value: 'dotted', label: 'Dotted' },
]
const PAGE_COLOR_CHOICES: Array<{ value: PageBackground; label: string }> = [
  { value: 'white', label: 'White' },
  { value: 'warm', label: 'Warm' },
  { value: 'blue', label: 'Blue' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'green', label: 'Green' },
]

/** Menu, Folders and the diagram title. The menu holds the File panel entry, page template, sheet color and Clear. */
export function TopLeftBar(props: TopLeftBarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [foldersOpen, setFoldersOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!foldersOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (target?.closest?.('.folders-sidebar, .folders-toggle')) return
      setFoldersOpen(false)
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setFoldersOpen(false) }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [foldersOpen])

  return (
    <div className="top-left-bar">
      <div ref={menuRef} className="menu-control">
        <button className={`top-icon-button${menuOpen ? ' selected' : ''}`} type="button" aria-label="Menu" aria-haspopup="true" aria-expanded={menuOpen} title="File, page and canvas options" onClick={() => setMenuOpen((value) => !value)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
        {menuOpen && <div className="menu-panel" role="group" aria-label="Menu">
          <div className="menu-brand">
            <span className="brand-mark" aria-hidden="true"><span /></span>
            <span className="brand-name">Ink Pad</span>
          </div>
          <div className="menu-divider" role="separator" />
          <button className={`menu-row file-button${props.filePanelOpen ? ' selected' : ''}`} type="button" aria-haspopup="dialog" aria-expanded={props.filePanelOpen} onClick={() => { props.onToggleFilePanel(); setMenuOpen(false) }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>
            <span className="menu-row-label">File…</span><span className="menu-row-hint">Save, open, export</span>
          </button>
          <div className="menu-divider" role="separator" />
          <div className="menu-row menu-choice-row" role="group" aria-label="Page template">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16"/></svg>
            <span className="menu-row-label">Page</span>
            <span className="menu-choices">
              {PAGE_TEMPLATE_CHOICES.map(({ value, label }) => (
                <button key={value} className={`menu-choice${props.pageTemplate === value ? ' selected' : ''}`} type="button" aria-pressed={props.pageTemplate === value} onClick={() => props.onPageTemplate(value)}>{label}</button>
              ))}
            </span>
          </div>
          <div className="menu-row menu-choice-row" role="group" aria-label="Sheet background color">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5c4 4.4 6 7.3 6 10a6 6 0 0 1-12 0c0-2.7 2-5.6 6-10z"/></svg>
            <span className="menu-row-label">Color</span>
            <span className="menu-choices">
              {PAGE_COLOR_CHOICES.map(({ value, label }) => (
                <button key={value} className={`menu-color${props.pageBackground === value ? ' selected' : ''}`} type="button" title={label} aria-label={`${label} sheet`} aria-pressed={props.pageBackground === value} style={{ backgroundColor: PAGE_BACKGROUND_COLORS[value] }} onClick={() => props.onPageBackground(value)} />
              ))}
            </span>
          </div>
          <div className="menu-divider" role="separator" />
          <button className="menu-row clear-row" type="button" onClick={() => { props.onClear(); setMenuOpen(false) }} disabled={!props.hasInk}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>
            <span className="menu-row-label">Clear canvas</span>
          </button>
          {props.diagnostics.enabled && <>
            <div className="menu-divider" role="separator" />
            <button className={`menu-row perf-diagnostics-toggle${props.diagnostics.open ? ' selected' : ''}`} type="button" aria-expanded={props.diagnostics.open} aria-controls="inkpad-performance-panel" onClick={() => { props.diagnostics.onToggle(); setMenuOpen(false) }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M21 19H3"/></svg>
              <span className="menu-row-label">Perf</span><span className="menu-row-hint">Developer only</span>
            </button>
          </>}
        </div>}
      </div>
      <button className={`top-icon-button folders-toggle${foldersOpen ? ' selected' : ''}`} type="button" aria-label="Folders" aria-pressed={foldersOpen} title="Folders" onClick={() => { if (!foldersOpen) props.onFoldersOpen(); setFoldersOpen((value) => !value) }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
      </button>
      <button className="diagram-title" type="button" title="Open the File panel to rename this diagram" onClick={props.onToggleFilePanel}>{props.title || 'Untitled diagram'}</button>
      {foldersOpen && <FoldersSidebar
        library={props.library}
        folders={props.folders}
        currentId={props.currentId}
        onOpenDiagram={(id) => { props.onOpenDiagram(id); setFoldersOpen(false) }}
        onNewDiagram={(folderId) => { props.onNewDiagramIn(folderId); setFoldersOpen(false) }}
        onCreateFolder={props.onCreateFolder}
        onRenameFolder={props.onRenameFolder}
        onDeleteFolder={props.onDeleteFolder}
        onMoveDiagram={props.onMoveDiagram}
        notice={props.notice}
      />}
    </div>
  )
}
