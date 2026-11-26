import { useEffect, useRef, useState } from 'react'
import { zoomMenuItems, type ZoomMenuChoice } from '../zoomMenu'

type ZoomControlsProps = { zoomPercent: number; locked: boolean; onToggleLock: () => void; onZoomIn: () => void; onZoomOut: () => void; /** Desktop mode: shortcut hints show in the zoom menu and the tablet-only zoom lock is hidden. */ desktop?: boolean; /** Fit selection is offered only with a selection. */ hasSelection?: boolean; /** Applies a zoom menu choice (a zoom level around the view centre, Fit drawing or Fit selection). */ onZoomChoice: (choice: ZoomMenuChoice) => void }

/** Bottom-left zoom out, percentage and zoom in, plus the zoom lock (pinch and the buttons stop changing zoom; panning still works). */
export function ZoomControls({ zoomPercent, locked, onToggleLock, onZoomIn, onZoomOut, desktop = false, hasSelection = false, onZoomChoice }: ZoomControlsProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => { if (!(event.target instanceof Node && rootRef.current?.contains(event.target))) setOpen(false) }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false) } }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => { document.removeEventListener('pointerdown', onPointerDown, true); document.removeEventListener('keydown', onKeyDown, true) }
  }, [open])
  const items = zoomMenuItems({ locked, hasSelection, desktop })
  return (
    <div className="zoom-controls" role="group" aria-label="Zoom" ref={rootRef}>
      {open && <div className="zoom-menu" role="menu" aria-label="Zoom options">
        {items.map((item) => <button key={item.id} type="button" role="menuitem" className="menu-row zoom-menu-item" disabled={item.disabled} onClick={() => { setOpen(false); onZoomChoice(item.choice) }}><span className="menu-row-label">{item.label}</span>{item.hint && <span className="menu-row-hint">{item.hint}</span>}</button>)}
      </div>}
      <button type="button" aria-label="Zoom out" title={desktop ? 'Zoom out (Ctrl+-)' : 'Zoom out'} onClick={onZoomOut} disabled={locked}>−</button>
      <button type="button" className="zoom-indicator zoom-indicator-button" aria-label={`Current zoom ${zoomPercent}%. Zoom options`} aria-haspopup="menu" aria-expanded={open} title="Zoom options" onClick={() => setOpen((value) => !value)}>{zoomPercent}%</button>
      <button type="button" aria-label="Zoom in" title={desktop ? 'Zoom in (Ctrl++)' : 'Zoom in'} onClick={onZoomIn} disabled={locked}>+</button>
      {!desktop && <button type="button" className={`zoom-lock${locked ? ' selected' : ''}`} aria-label={locked ? 'Unlock zoom' : 'Lock zoom'} aria-pressed={locked} title={locked ? 'Zoom locked (panning still works). Tap to unlock.' : 'Lock zoom'} onClick={onToggleLock}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          {locked ? <path d="M8 11V8a4 4 0 0 1 8 0v3" /> : <path d="M8 11V8a4 4 0 0 1 7.5-2" />}
        </svg>
      </button>}
    </div>
  )
}
