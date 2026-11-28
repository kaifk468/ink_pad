import { useCallback, useEffect, useRef, useState } from 'react'
import type { StorageInfo } from './useDocuments'
import { PAGE_BACKGROUND_COLORS, type PageBackground } from '../pageBackground'
import { titleToCommit } from '../documentFormat'
import type { PageSpacing, PageTemplate } from '../pageTemplates'
import { BOARD_STYLES, type BoardStyleId } from '../boardStyle'
import { CANVAS_TYPES, type CanvasType } from '../canvasTypes'
import { boardPickerState } from '../boardPicker'
import { BoardStylePreview, CanvasPreview, PickerTile } from './BoardPreviews'
import type { InputMode } from '../desktopInput'
import { DesktopMenuSheet } from './DesktopMenuSheet'

export type TopLeftBarProps = {
  /** Desktop only: undo and redo render inside the bar as icon buttons (the top-centre HistoryBar is not used). */
  history?: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void }
  /** Desktop only: opens the keyboard shortcut list. */
  onShortcutHelp?: () => void
  /** Desktop only: opens the command palette (Help section of the menu sheet). */
  onCommandPalette?: () => void
  title: string
  /** Called with the cleaned new title when the name is edited in place in the bar. */
  onRenameTitle: (title: string) => void
  pageTemplate: PageTemplate
  onPageTemplate: (value: PageTemplate) => void
  /** Canvas type beyond the template (src/canvasTypes.ts); undefined = the template. */
  pageCanvas?: string
  onCanvasType?: (type: CanvasType) => void
  /** Board style theme (src/boardStyle.ts); undefined = light. With `sketchy` it gives the picked board style. */
  board?: string
  onBoardStyle?: (style: BoardStyleId, dark: boolean) => void
  /** Counter: each increase opens the menu (sheet on Desktop, panel on Tablet) scrolled to its Board section. App bumps it from the empty-page "Choose board" button. */
  menuRequest?: number
  pageSpacing: PageSpacing
  onPageSpacing: (value: PageSpacing) => void
  /** Hand-drawn style of this diagram (the menu row shows in Desktop mode only). */
  sketchy: boolean
  onSketchy: () => void
  pageBackground: PageBackground
  onPageBackground: (value: PageBackground) => void
  inputMode: InputMode
  onInputMode: (mode: InputMode) => void
  /** Boxes snap to nearby boxes while dragged, with guide lines (a per-device setting, in both input modes). */
  snapping: boolean
  onSnapping: (on: boolean) => void
  gridSnap: boolean
  onGridSnap: (on: boolean) => void
  oneFingerPan: boolean
  onOneFingerPan: (value: boolean) => void
  tapUndo: boolean
  onTapUndo: (value: boolean) => void
  hasInk: boolean
  filePanelOpen: boolean
  onToggleFilePanel: () => void
  onClear: () => void
  onSlimInk: () => void
  libraryOpen: boolean
  /** Save state shown in the menu header, e.g. "Saved to Google Drive". */
  statusText: string
  statusOk: boolean
  onOpenLibrary: () => void
  storage: StorageInfo
  onOpenStorage: () => void
  diagnostics: { enabled: boolean; open: boolean; onToggle: () => void; onFillTestInk: (targetPoints: number) => void; onRemoveTestInk: () => void }
}

const PAGE_SPACING_CHOICES: Array<{ value: PageSpacing; label: string }> = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'standard', label: 'Standard' },
  { value: 'wide', label: 'Wide' },
]
const PAGE_COLOR_CHOICES: Array<{ value: PageBackground; label: string }> = [
  { value: 'white', label: 'White' },
  { value: 'warm', label: 'Warm' },
  { value: 'blue', label: 'Blue' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'green', label: 'Green' },
]

/** Menu, Library button and the diagram title. The menu has three labelled groups (File, Page, Canvas) and Clear canvas apart at the bottom. */
export function TopLeftBar(props: TopLeftBarProps) {
  // Desktop shows the navigation sheet, Tablet keeps the dropdown panel; one open flag drives whichever applies.
  const [menuRequested, setMenuOpen] = useState(false)
  const desktop = props.inputMode === 'desktop'
  const menuOpen = menuRequested && !desktop
  const menuRef = useRef<HTMLDivElement>(null)
  const picker = boardPickerState(props.board, props.sketchy, props.pageTemplate, props.pageCanvas)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  // Switching mode never carries an open menu over to the other layout.
  useEffect(() => { setMenuOpen(false) }, [props.inputMode])
  const closeSheet = useCallback((restoreFocus: boolean) => {
    setMenuOpen(false)
    if (restoreFocus) menuButtonRef.current?.focus()
  }, [])
  // Desktop: a click outside closes the sheet (Escape is handled inside the sheet).
  useEffect(() => {
    if (!menuRequested || !desktop) return
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [menuRequested, desktop])
  // menuRequest (a counter from App) opens the menu at the Board section; the scroll happens once the menu is on screen.
  const [scrollToBoard, setScrollToBoard] = useState(false)
  const lastRequestRef = useRef(props.menuRequest ?? 0)
  useEffect(() => {
    const request = props.menuRequest ?? 0
    if (request === lastRequestRef.current) return
    lastRequestRef.current = request
    setMenuOpen(true)
    setScrollToBoard(true)
  }, [props.menuRequest])
  useEffect(() => {
    if (!menuRequested) { setScrollToBoard(false); return }
    if (!scrollToBoard) return
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector('[data-section="board"]')?.scrollIntoView({ block: 'start' }))
    return () => cancelAnimationFrame(frame)
  }, [menuRequested, scrollToBoard])
  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const editingTitleRef = useRef(false)

  const beginTitleEdit = () => {
    editingTitleRef.current = true
    setDraftTitle(props.title)
    setEditingTitle(true)
  }
  // Enter and tapping away keep the new name; Escape drops it. The ref stops a second finish (blur after Enter) from saving twice.
  const finishTitleEdit = (save: boolean) => {
    if (!editingTitleRef.current) return
    editingTitleRef.current = false
    setEditingTitle(false)
    if (!save) return
    const next = titleToCommit(props.title, draftTitle)
    if (next !== null) props.onRenameTitle(next)
  }

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

  return (
    <div className="top-left-bar">
      <div ref={menuRef} className="menu-control">
        <button ref={menuButtonRef} className={`top-icon-button${menuRequested ? ' selected' : ''}`} type="button" aria-label="Menu" aria-haspopup="true" aria-expanded={menuRequested} title="File, page and canvas options" onClick={() => setMenuOpen((value) => !value)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
        {menuRequested && desktop && <DesktopMenuSheet {...props} onClose={closeSheet} />}
        {menuOpen && <div className="menu-panel" role="group" aria-label="Menu">
          <div className="menu-brand">
            <span className="brand-mark" aria-hidden="true"><span /></span>
            <span className="brand-name">Ink Pad</span>
            <span className={`menu-save-status${props.statusOk ? ' ok' : ''}`} role="status"><span aria-hidden="true" />{props.statusText}</span>
          </div>

          <div className="menu-section-title">File</div>
          <button className="menu-row library-row" type="button" onClick={() => { props.onOpenLibrary(); setMenuOpen(false) }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
            <span className="menu-row-label">Library</span><span className="menu-row-hint">All diagrams</span>
          </button>
          <button className={`menu-row file-button${props.filePanelOpen ? ' selected' : ''}`} type="button" aria-haspopup="dialog" aria-expanded={props.filePanelOpen} onClick={() => { props.onToggleFilePanel(); setMenuOpen(false) }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>
            <span className="menu-row-label">Export and import</span><span className="menu-row-hint">PNG, SVG, .inkpad</span>
          </button>
          <button className="menu-row storage-row" type="button" aria-haspopup="dialog" onClick={() => { props.onOpenStorage(); setMenuOpen(false) }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8.5a4.75 4.75 0 0 1 .5 9.5z"/></svg>
            <span className="menu-row-label">Storage</span><span className="menu-row-hint">{props.storage.locked ? 'Sign in needed' : props.storage.kind === 'drive' ? 'Google Drive' : props.storage.kind === 'device' ? 'Device folder' : 'This browser'}</span>
          </button>

          <div className="menu-divider" role="separator" />
          <div className="menu-section-title" data-section="board">Board</div>
          <div className="menu-setting">
            <span className="menu-setting-label">Style</span>
            <div className="bp-tiles" role="group" aria-label="Board style">
              {BOARD_STYLES.map(({ id, label, description }) => (
                <PickerTile key={id} label={label} title={`${label}: ${description}`} selected={picker.style === id} onClick={() => props.onBoardStyle?.(id, picker.dark)}>
                  <BoardStylePreview style={id} dark={picker.dark} />
                </PickerTile>
              ))}
            </div>
          </div>
          <div className="menu-setting">
            <span className="menu-setting-label">Theme</span>
            {picker.chalk
              ? <p className="menu-note">Chalkboard is always dark</p>
              : <div className="menu-segments two" role="group" aria-label="Board theme">
                {[{ dark: false, label: 'Light' }, { dark: true, label: 'Dark' }].map(({ dark, label }) => (
                  <button key={label} className={`menu-segment${picker.dark === dark ? ' selected' : ''}`} type="button" aria-pressed={picker.dark === dark} onClick={() => props.onBoardStyle?.(picker.style, dark)}>{label}</button>
                ))}
              </div>}
          </div>
          <div className="menu-setting">
            <span className="menu-setting-label">Canvas type</span>
            <div className="bp-tiles" role="group" aria-label="Page template">
              {CANVAS_TYPES.map(({ id, label, description }) => (
                <PickerTile key={id} label={label} title={`${label}: ${description}`} selected={picker.canvas === id} onClick={() => props.onCanvasType?.(id)}>
                  <CanvasPreview type={id} board={props.board} />
                </PickerTile>
              ))}
            </div>
          </div>
          {picker.showSpacing && <div className="menu-setting" role="group" aria-label="Line and dot spacing">
            <span className="menu-setting-label">Line and dot spacing</span>
            <div className="menu-segments">
              {PAGE_SPACING_CHOICES.map(({ value, label }) => (
                <button key={value} className={`menu-segment${props.pageSpacing === value ? ' selected' : ''}`} type="button" aria-pressed={props.pageSpacing === value} onClick={() => props.onPageSpacing(value)}>{label}</button>
              ))}
            </div>
          </div>}
          <div className="menu-setting">
            <span className="menu-setting-label">Sheet colour</span>
            {picker.sheetFromBoard
              ? <p className="menu-note">Set by the board style</p>
              : <div className="menu-swatches" role="group" aria-label="Sheet background color">
                {PAGE_COLOR_CHOICES.map(({ value, label }) => (
                  <button key={value} className={`menu-color${props.pageBackground === value ? ' selected' : ''}`} type="button" title={label} aria-label={`${label} sheet`} aria-pressed={props.pageBackground === value} style={{ backgroundColor: PAGE_BACKGROUND_COLORS[value] }} onClick={() => props.onPageBackground(value)} />
                ))}
              </div>}
          </div>

          <div className="menu-divider" role="separator" />
          <div className="menu-section-title">Canvas</div>
          <button className="menu-row menu-switch-row" type="button" role="switch" aria-checked={props.inputMode === 'desktop'} onClick={() => props.onInputMode(props.inputMode === 'desktop' ? 'tablet' : 'desktop')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/></svg>
            <span className="menu-row-label menu-row-stack"><span>Desktop mode</span><span className="menu-row-sub">A mouse draws and edits. The pen and touch stay as they are</span></span>
            <span className={`menu-switch${props.inputMode === 'desktop' ? ' on' : ''}`} aria-hidden="true"><span /></span>
          </button>
          {props.inputMode === 'desktop' && <button className="menu-row menu-switch-row" type="button" role="switch" aria-checked={props.sketchy} onClick={props.onSketchy}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18c3-1 4-9 8-12 3 3 5 8 8 11M5 20c5 1 9 1 14 0"/></svg>
            <span className="menu-row-label menu-row-stack"><span>Hand-drawn style</span><span className="menu-row-sub">Shapes, lines and arrows look sketched. Saved with this diagram</span></span>
            <span className={`menu-switch${props.sketchy ? ' on' : ''}`} aria-hidden="true"><span /></span>
          </button>}
          <button className="menu-row menu-switch-row" type="button" role="switch" aria-checked={props.snapping} onClick={() => props.onSnapping(!props.snapping)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M12 3v18M3 12h18" strokeDasharray="2 2"/></svg>
            <span className="menu-row-label menu-row-stack"><span>Snap and guides</span><span className="menu-row-sub">Boxes snap to the edges and centres of nearby boxes while you drag</span></span>
            <span className={`menu-switch${props.snapping ? ' on' : ''}`} aria-hidden="true"><span /></span>
          </button>
          {props.inputMode === 'desktop' && <button className="menu-row menu-switch-row" type="button" role="switch" aria-checked={props.gridSnap} onClick={() => props.onGridSnap(!props.gridSnap)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h.01M12 5h.01M19 5h.01M5 12h.01M12 12h.01M19 12h.01M5 19h.01M12 19h.01M19 19h.01" strokeWidth="3" strokeLinecap="round"/></svg>
            <span className="menu-row-label menu-row-stack"><span>Snap to grid</span><span className="menu-row-sub">Mouse drags, resizes and new shapes land on a grid (Ctrl+')</span></span>
            <span className={`menu-switch${props.gridSnap ? ' on' : ''}`} aria-hidden="true"><span /></span>
          </button>}
          {props.inputMode !== 'desktop' && <button className="menu-row menu-switch-row" type="button" role="switch" aria-checked={props.oneFingerPan} onClick={() => props.onOneFingerPan(!props.oneFingerPan)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11V5a1.5 1.5 0 0 1 3 0v6M12 10.5a1.5 1.5 0 0 1 3 0V12M15 11.5a1.5 1.5 0 0 1 3 0V16a5 5 0 0 1-5 5h-1.5a5 5 0 0 1-4-2L5 15.5a1.5 1.5 0 0 1 2.4-1.8L9 15"/></svg>
            <span className="menu-row-label menu-row-stack"><span>One-finger pan</span><span className="menu-row-sub">Ignored while the pen is near</span></span>
            <span className={`menu-switch${props.oneFingerPan ? ' on' : ''}`} aria-hidden="true"><span /></span>
          </button>}
          <button className="menu-row menu-switch-row" type="button" role="switch" aria-checked={props.tapUndo} title="Tap with two fingers to undo, three to redo" onClick={() => props.onTapUndo(!props.tapUndo)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/></svg>
            <span className="menu-row-label menu-row-stack"><span>Two-finger tap to undo</span><span className="menu-row-sub">Tap with two fingers to undo, three to redo</span></span>
            <span className={`menu-switch${props.tapUndo ? ' on' : ''}`} aria-hidden="true"><span /></span>
          </button>
          {props.inputMode === 'desktop' && props.onShortcutHelp && <button className="menu-row shortcut-help-row" type="button" aria-haspopup="dialog" onClick={() => { props.onShortcutHelp?.(); setMenuOpen(false) }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8"/></svg>
            <span className="menu-row-label">Keyboard shortcuts</span><span className="menu-row-hint">?</span>
          </button>}

          <div className="menu-divider" role="separator" />
          <button className="menu-row clear-row" type="button" onClick={() => { props.onClear(); setMenuOpen(false) }} disabled={!props.hasInk}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>
            <span className="menu-row-label">Clear canvas</span><span className="menu-row-hint">Undo brings it back</span>
          </button>
          {props.diagnostics.enabled && <>
            <div className="menu-divider" role="separator" />
            <button className={`menu-row perf-diagnostics-toggle${props.diagnostics.open ? ' selected' : ''}`} type="button" aria-expanded={props.diagnostics.open} aria-controls="inkpad-performance-panel" onClick={() => { props.diagnostics.onToggle(); setMenuOpen(false) }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M21 19H3"/></svg>
              <span className="menu-row-label">Perf</span><span className="menu-row-hint">Developer only</span>
            </button>
            <button className="menu-row slim-row" type="button" title="Drop pen points that do not change the shape. One-time, undoable. New strokes are already thinned on pen-up." onClick={() => { props.onSlimInk(); setMenuOpen(false) }} disabled={!props.hasInk}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16c3-8 5 6 8-2s5 2 8-4"/></svg>
              <span className="menu-row-label">Slim ink points</span><span className="menu-row-hint">Developer only</span>
            </button>
            <button className="menu-row" type="button" onClick={() => { props.diagnostics.onFillTestInk(6000); setMenuOpen(false) }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8c3-4 5 4 8 0s5 4 8 0M4 16c3-4 5 4 8 0s5 4 8 0"/></svg>
              <span className="menu-row-label">Test ink: light</span><span className="menu-row-hint">Developer only</span>
            </button>
            <button className="menu-row" type="button" onClick={() => { props.diagnostics.onFillTestInk(30000); setMenuOpen(false) }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6c3-4 5 4 8 0s5 4 8 0M4 12c3-4 5 4 8 0s5 4 8 0M4 18c3-4 5 4 8 0s5 4 8 0"/></svg>
              <span className="menu-row-label">Test ink: dense</span><span className="menu-row-hint">Developer only</span>
            </button>
            <button className="menu-row" type="button" onClick={() => { props.diagnostics.onRemoveTestInk(); setMenuOpen(false) }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>
              <span className="menu-row-label">Remove test ink</span><span className="menu-row-hint">Developer only</span>
            </button>
          </>}
        </div>}
      </div>
      <button className={`top-icon-button library-toggle${props.libraryOpen ? ' selected' : ''}`} type="button" aria-label="Library" aria-pressed={props.libraryOpen} title="Library: all diagrams and folders (Ctrl+O on a computer)" onClick={props.onOpenLibrary}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
      </button>
      {desktop && <span className="top-bar-divider" aria-hidden="true" />}
      {editingTitle
        ? <input
          className="diagram-title-input"
          type="text"
          autoFocus
          maxLength={120}
          aria-label="Diagram title"
          value={draftTitle}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={() => finishTitleEdit(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') finishTitleEdit(true)
            if (event.key === 'Escape') { event.stopPropagation(); finishTitleEdit(false) }
          }}
        />
        : <button className="diagram-title" type="button" title={desktop ? 'Click to rename this diagram' : 'Tap to rename this diagram'} aria-label={`Diagram title: ${props.title || 'Untitled diagram'}. ${desktop ? 'Click' : 'Tap'} to rename`} onClick={beginTitleEdit}>
          <span className="diagram-title-text">{props.title || 'Untitled diagram'}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>
        </button>}
      {desktop && props.history && <>
        <span className="top-bar-divider" aria-hidden="true" />
        <div className="top-history" role="group" aria-label="History">
          <button className="top-history-button" type="button" onClick={props.history.onUndo} disabled={!props.history.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h9a6 6 0 0 1 0 12h-2"/></svg>
          </button>
          <button className="top-history-button" type="button" onClick={props.history.onRedo} disabled={!props.history.canRedo} aria-label="Redo" title="Redo (Ctrl+Y)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9h-9a6 6 0 0 0 0 12h-2"/></svg>
          </button>
        </div>
      </>}
    </div>
  )
}
