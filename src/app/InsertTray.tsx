import { useEffect, useRef, useState } from 'react'

type InsertTrayProps = {
  textActive: boolean
  classActive: boolean
  shapeActive: boolean
  onText: () => void
  onTextOptions: () => void
  onClass: () => void
  onShapes: () => void
}

const SOON_ENTRIES = [
  { label: 'Database', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6"/></svg> },
  { label: 'Queue', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="10" rx="2"/><path d="M8 7v10M12 7v10M16 7v10"/></svg> },
  { label: 'Service', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="5"/></svg> },
]

/** The Insert button and the tray that opens upward from the bottom dock. Entries reuse the existing tool handlers. */
export function InsertTray({ textActive, classActive, shapeActive, onText, onTextOptions, onClass, onShapes }: InsertTrayProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const lastTapRef = useRef(0)
  const anyActive = textActive || classActive || shapeActive

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (action: () => void) => () => { action(); setOpen(false) }

  return (
    <div ref={rootRef} className="insert-control">
      <button
        className={`tool-button insert-button${open || anyActive ? ' selected' : ''}`}
        type="button"
        aria-label="Insert"
        aria-haspopup="true"
        aria-expanded={open}
        title="Insert text, class boxes and shapes"
        onClick={() => {
          const now = Date.now()
          const double = textActive && now - lastTapRef.current <= 400
          lastTapRef.current = now
          if (double) { setOpen(false); onTextOptions() } else setOpen((value) => !value)
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8.5v7M8.5 12h7"/></svg><span>Insert</span>
      </button>
      {open && <div className="insert-tray" role="group" aria-label="Insert tray">
        <div className="insert-tray-heading">Basic</div>
        <button className={`insert-entry${textActive ? ' selected' : ''}`} type="button" aria-label="Text" aria-pressed={textActive} title="Tap the sheet with the S Pen to type a label; tap a label to edit it" onClick={choose(onText)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7V4.5h14V7M12 4.5V19.5M8.5 19.5h7"/></svg><span>Text label</span>
        </button>
        <button className={`insert-entry${shapeActive ? ' selected' : ''}`} type="button" aria-label="Shapes" aria-pressed={shapeActive} title="Straight lines and rectangles recognize on hold automatically. Toggle for arrows." onClick={choose(onShapes)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="10" height="10" rx="1"/><path d="M10 19h9m0 0-4-4m4 4-4 4"/></svg><span>Shapes and arrows</span>
        </button>
        <div className="insert-tray-heading">LLD</div>
        <button className={`insert-entry${classActive ? ' selected' : ''}`} type="button" aria-label="Class box" aria-pressed={classActive} title="Tap the sheet with the S Pen to add a UML class box; tap a box or rectangle to edit it" onClick={choose(onClass)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9.5h16M4 14.5h16"/></svg><span>Class box</span>
        </button>
        <div className="insert-tray-heading">HLD</div>
        {SOON_ENTRIES.map(({ label, icon }) => (
          <button className="insert-entry insert-entry-soon" type="button" key={label} disabled aria-disabled="true" title={`${label} is coming soon`}>
            {icon}<span>{label}</span><span className="soon-badge">soon</span>
          </button>
        ))}
      </div>}
    </div>
  )
}
