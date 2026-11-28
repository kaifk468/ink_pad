import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { PAGE_BACKGROUND_COLORS, type PageBackground } from '../pageBackground'
import type { PageSpacing } from '../pageTemplates'
import { BOARD_STYLES } from '../boardStyle'
import { CANVAS_TYPES } from '../canvasTypes'
import { BOARD_CANVAS_KEYWORDS, BOARD_LANES_KEYWORDS, BOARD_MARKS_KEYWORDS, BOARD_STYLE_KEYWORDS, BOARD_THEME_KEYWORDS, boardPickerState } from '../boardPicker'
import { BoardStylePreview, CanvasPreview, PickerTile } from './BoardPreviews'
import { LaneControls, MarksControl } from './LaneControls'
import { filterMenuEntries, firstActionableEntry, type MenuSearchEntry } from './menuSearch'
import type { TopLeftBarProps } from './TopLeftBar'

const SPACINGS: Array<{ value: PageSpacing; label: string }> = [{ value: 'narrow', label: 'Narrow' }, { value: 'standard', label: 'Standard' }, { value: 'wide', label: 'Wide' }]
const COLOURS: Array<{ value: PageBackground; label: string }> = [{ value: 'white', label: 'White' }, { value: 'warm', label: 'Warm' }, { value: 'blue', label: 'Blue' }, { value: 'yellow', label: 'Yellow' }, { value: 'green', label: 'Green' }]

type SectionName = 'Diagram' | 'Board' | 'Preferences' | 'Help' | 'Developer' | 'Footer'
type Row = MenuSearchEntry & {
  section: SectionName
  desc?: string
  icon: ReactNode
  kbd?: string
  /** Set for a switch: its state. */
  checked?: boolean
  dialog?: boolean
  danger?: boolean
  run?: () => void
}
const SECTIONS: SectionName[] = ['Diagram', 'Board', 'Preferences', 'Help', 'Developer']

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const PALETTE_KEY = isMac ? '⌘ K' : 'Ctrl K'

/** The Desktop navigation sheet: a left panel with a pinned header and search, scrolling sections, and Clear canvas alone at the bottom. */
export function DesktopMenuSheet(props: TopLeftBarProps & { onClose: (restoreFocus: boolean) => void }) {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const queryRef = useRef(query)
  queryRef.current = query
  const { onClose } = props

  useEffect(() => { searchRef.current?.focus() }, [])
  // Escape clears the search first; a second Escape closes the sheet and returns focus to the menu button.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      // A dialog (shortcut help, command palette) owns Escape while it is open.
      if (document.querySelector('[role="dialog"]')) return
      if (queryRef.current) setQuery('')
      else onClose(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /** Runs an action that opens something else (a dialog, the Library) and closes the sheet. */
  const done = (action: () => void) => () => { action(); onClose(false) }
  const storageHint = props.storage.locked ? 'Sign in needed' : props.storage.kind === 'drive' ? 'Google Drive' : props.storage.kind === 'device' ? 'Device folder' : 'This browser'

  const picker = boardPickerState(props.board, props.sketchy, props.pageTemplate, props.pageCanvas)
  const rows: Row[] = [
    { id: 'library', section: 'Diagram', label: 'Library', desc: 'All diagrams', keywords: 'folder open diagrams files', actionable: true, icon: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />, run: done(props.onOpenLibrary) },
    { id: 'export', section: 'Diagram', label: 'Export and import', desc: 'PNG, SVG, .inkpad', keywords: 'download save png svg pdf share file', actionable: true, dialog: true, icon: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />, run: done(props.onToggleFilePanel) },
    { id: 'storage', section: 'Diagram', label: 'Storage', desc: storageHint, keywords: 'drive device folder cloud sync browser', actionable: true, dialog: true, icon: <path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8.5a4.75 4.75 0 0 1 .5 9.5z" />, run: done(props.onOpenStorage) },
    { id: 'board-style', section: 'Board', label: 'Style', keywords: BOARD_STYLE_KEYWORDS, actionable: false, icon: null },
    { id: 'board-theme', section: 'Board', label: 'Theme', keywords: BOARD_THEME_KEYWORDS, actionable: false, icon: null },
    { id: 'board-canvas', section: 'Board', label: 'Canvas', keywords: BOARD_CANVAS_KEYWORDS, actionable: false, icon: null },
    ...(picker.showLanes ? [{ id: 'board-lanes', section: 'Board' as const, label: 'Lanes', keywords: BOARD_LANES_KEYWORDS, actionable: false, icon: null }] : []),
    ...(picker.canvas !== 'blank' ? [{ id: 'board-marks', section: 'Board' as const, label: 'Marks', keywords: BOARD_MARKS_KEYWORDS, actionable: false, icon: null }] : []),
    ...(picker.showSpacing ? [{ id: 'page-spacing', section: 'Board' as const, label: 'Line and dot spacing', keywords: 'narrow standard wide gap board grid lines dots', actionable: false, icon: null }] : []),
    { id: 'page-colour', section: 'Board', label: 'Sheet colour', keywords: 'background color paper white warm blue yellow green board', actionable: false, icon: null },
    { id: 'desktop', section: 'Preferences', label: 'Desktop mode', desc: 'A mouse draws and edits. The pen and touch stay as they are', keywords: 'mouse tablet input pen touch', actionable: true, checked: true, icon: <><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M8 20h8M12 16v4" /></>, run: () => { props.onInputMode('tablet'); onClose(false) } },
    { id: 'sketchy', section: 'Preferences', label: 'Hand-drawn style', desc: 'Shapes, lines and arrows look sketched. Saved with this diagram', keywords: 'sketch rough excalidraw', actionable: true, checked: props.sketchy, icon: <path d="M4 18c3-1 4-9 8-12 3 3 5 8 8 11M5 20c5 1 9 1 14 0" />, run: props.onSketchy },
    { id: 'snap', section: 'Preferences', label: 'Snap and guides', desc: 'Boxes snap to the edges and centres of nearby boxes while you drag', keywords: 'align magnet guide', actionable: true, checked: props.snapping, icon: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><path d="M12 3v18M3 12h18" strokeDasharray="2 2" /></>, run: () => props.onSnapping(!props.snapping) },
    ...(props.onShortcutHelp ? [{ id: 'shortcuts', section: 'Help' as const, label: 'Keyboard shortcuts', desc: 'Every shortcut, grouped', keywords: 'keys hotkeys help', actionable: true, dialog: true, kbd: '?', icon: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" /></>, run: done(props.onShortcutHelp) }] : []),
    ...(props.onCommandPalette ? [{ id: 'palette', section: 'Help' as const, label: 'Command palette', desc: 'Search every command and diagram', keywords: 'commands search run', actionable: true, dialog: true, kbd: PALETTE_KEY, icon: <path d="m5 8 4 4-4 4M12 17h7" />, run: done(props.onCommandPalette) }] : []),
    ...(props.diagnostics.enabled ? [
      { id: 'dev-perf', section: 'Developer' as const, label: 'Perf', desc: 'Developer only', keywords: 'performance diagnostics', actionable: true, icon: <path d="M4 19V9M10 19V5M16 19v-7M21 19H3" />, run: done(props.diagnostics.onToggle) },
      { id: 'dev-slim', section: 'Developer' as const, label: 'Slim ink points', desc: 'Developer only', keywords: 'thin simplify', actionable: true, disabled: !props.hasInk, icon: <path d="M4 16c3-8 5 6 8-2s5 2 8-4" />, run: done(props.onSlimInk) },
      { id: 'dev-light', section: 'Developer' as const, label: 'Test ink: light', desc: 'Developer only', keywords: 'fill', actionable: true, icon: <path d="M4 8c3-4 5 4 8 0s5 4 8 0M4 16c3-4 5 4 8 0s5 4 8 0" />, run: done(() => props.diagnostics.onFillTestInk(6000)) },
      { id: 'dev-dense', section: 'Developer' as const, label: 'Test ink: dense', desc: 'Developer only', keywords: 'fill', actionable: true, icon: <path d="M4 6c3-4 5 4 8 0s5 4 8 0M4 12c3-4 5 4 8 0s5 4 8 0M4 18c3-4 5 4 8 0s5 4 8 0" />, run: done(() => props.diagnostics.onFillTestInk(30000)) },
      { id: 'dev-remove', section: 'Developer' as const, label: 'Remove test ink', desc: 'Developer only', keywords: 'delete', actionable: true, icon: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />, run: done(props.diagnostics.onRemoveTestInk) },
    ] : []),
    { id: 'clear', section: 'Footer', label: 'Clear canvas', desc: 'Undo brings it back', keywords: 'delete erase reset empty', actionable: true, disabled: !props.hasInk, danger: true, icon: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />, run: done(props.onClear) },
  ]

  const visible = filterMenuEntries(rows, query)
  const onSearchKey = (event: ReactKeyboardEvent) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    firstActionableEntry(rows, query)?.run?.()
  }

  const renderRow = (row: Row) => {
    const isSwitch = row.checked !== undefined
    return (
      <button key={row.id} className={`ms-row${row.danger ? ' danger' : ''}`} type="button" disabled={row.disabled}
        role={isSwitch ? 'switch' : undefined} aria-checked={isSwitch ? row.checked : undefined} aria-haspopup={row.dialog ? 'dialog' : undefined}
        title={row.desc ? `${row.label}: ${row.desc}` : row.label} onClick={row.run}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{row.icon}</svg>
        <span className="ms-text"><span className="ms-label">{row.label}</span>{row.desc && <span className="ms-desc">{row.desc}</span>}</span>
        {isSwitch && <span className={`ms-switch${row.checked ? ' on' : ''}`} aria-hidden="true"><span /></span>}
        {row.kbd && <kbd className="ms-kbd">{row.kbd}</kbd>}
      </button>
    )
  }

  const clear = rows.find((row) => row.id === 'clear')!
  const showClear = visible.includes(clear)

  return (
    <div className="ms-sheet" role="group" aria-label="Menu">
      <div className="ms-head">
        <div className="ms-brand">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-name">Ink Pad</span>
        </div>
        <label className="ms-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="m20 20-4.2-4.2" /></svg>
          <input ref={searchRef} type="search" placeholder="Search menu" aria-label="Search menu" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onSearchKey} autoComplete="off" spellCheck={false} />
        </label>
      </div>
      <div className="ms-body">
        {SECTIONS.map((name) => {
          const list = visible.filter((row) => row.section === name)
          if (list.length === 0) return null
          return (
            <section key={name} className="ms-section" aria-label={name} data-section={name.toLowerCase()}>
              <h2 className="ms-title">{name}</h2>
              {list.map((row) => {
                if (row.id === 'board-style') return (
                  <div key={row.id} className="ms-setting"><span className="ms-setting-label">Style</span>
                    <div className="bp-tiles" role="group" aria-label="Board style">
                      {BOARD_STYLES.map(({ id, label, description }) => (
                        <PickerTile key={id} label={label} title={`${label}: ${description}`} selected={picker.style === id} onClick={() => props.onBoardStyle?.(id, picker.dark)}>
                          <BoardStylePreview style={id} dark={picker.dark} />
                        </PickerTile>
                      ))}
                    </div></div>
                )
                if (row.id === 'board-theme') return (
                  <div key={row.id} className="ms-setting"><span className="ms-setting-label">Theme</span>
                    {picker.chalk
                      ? <p className="ms-note">Chalkboard is always dark</p>
                      : <div className="ms-segments two" role="group" aria-label="Board theme">
                        {[{ dark: false, label: 'Light' }, { dark: true, label: 'Dark' }].map(({ dark, label }) => (
                          <button key={label} className={`ms-segment${picker.dark === dark ? ' selected' : ''}`} type="button" aria-pressed={picker.dark === dark} onClick={() => props.onBoardStyle?.(picker.style, dark)}>{label}</button>
                        ))}
                      </div>}</div>
                )
                if (row.id === 'board-canvas') return (
                  <div key={row.id} className="ms-setting"><span className="ms-setting-label">Canvas</span>
                    <div className="bp-tiles" role="group" aria-label="Page template">
                      {CANVAS_TYPES.map(({ id, label, description }) => (
                        <PickerTile key={id} label={label} title={`${label}: ${description}`} selected={picker.canvas === id} onClick={() => props.onCanvasType?.(id)}>
                          <CanvasPreview type={id} board={props.board} />
                        </PickerTile>
                      ))}
                    </div></div>
                )
                if (row.id === 'board-lanes') return <LaneControls key={row.id} variant="ms" lanes={props.lanes} onLanes={props.onLanes} />
                if (row.id === 'board-marks') return <MarksControl key={row.id} variant="ms" marks={props.marks} onMarks={props.onMarks} />
                if (row.id === 'page-spacing') return (
                  <div key={row.id} className="ms-setting" role="group" aria-label="Line and dot spacing"><span className="ms-setting-label">Line and dot spacing</span>
                    <div className="ms-segments">
                      {SPACINGS.map(({ value, label }) => <button key={value} className={`ms-segment${props.pageSpacing === value ? ' selected' : ''}`} type="button" aria-pressed={props.pageSpacing === value} onClick={() => props.onPageSpacing(value)}>{label}</button>)}
                    </div></div>
                )
                if (row.id === 'page-colour') return (
                  <div key={row.id} className="ms-setting"><span className="ms-setting-label">Sheet colour</span>
                    {picker.sheetFromBoard ? <p className="ms-note">Set by the board style</p> : <div className="ms-swatches" role="group" aria-label="Sheet background color">
                      {COLOURS.map(({ value, label }) => <button key={value} className={`ms-color${props.pageBackground === value ? ' selected' : ''}`} type="button" title={label} aria-label={`${label} sheet`} aria-pressed={props.pageBackground === value} style={{ backgroundColor: PAGE_BACKGROUND_COLORS[value] }} onClick={() => props.onPageBackground(value)} />)}
                    </div>}</div>
                )
                return renderRow(row)
              })}
            </section>
          )
        })}
        {visible.length === 0 && <p className="ms-empty" role="status">No menu items match “{query.trim()}”.</p>}
      </div>
      {showClear && <div className="ms-foot">{renderRow(clear)}</div>}
    </div>
  )
}
