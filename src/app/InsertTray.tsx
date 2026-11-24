import { useEffect, useRef, useState } from 'react'
import { HLD_SHAPE_LABELS } from '../hldShapes'
import type { HldShape } from '../hldShapes'

type InsertTrayProps = {
  textActive: boolean
  classActive: boolean
  shapeActive: boolean
  hldActive: HldShape | null
  onHldShape: (shape: HldShape) => void
  onText: () => void
  onTextOptions: () => void
  onClass: () => void
  onShapes: () => void
  onSticky: () => void
}

export const HLD_ENTRIES: Array<{ shape: HldShape; icon: JSX.Element; hint: string }> = [
  { shape: 'database', hint: 'a cylinder', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6"/></svg> },
  { shape: 'queue', hint: 'a box with arrow ends', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="10" rx="2"/><path d="M8 7v10M16 7v10"/></svg> },
  { shape: 'service', hint: 'a rounded box', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="5"/></svg> },
]

/** Six more HLD shapes: a grid in the tablet Insert tray and the desktop "More shapes" popover (the desktop dock stays short). */
export const MORE_HLD_ENTRIES: Array<{ shape: HldShape; icon: JSX.Element; hint: string }> = [
  { shape: 'user', hint: 'a person or client', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="3.5"/><path d="M4.5 21v-4c0-3 3.4-4.5 7.5-4.5s7.5 1.5 7.5 4.5v4z"/></svg> },
  { shape: 'browser', hint: 'a browser window', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M3 9h18M6.5 6.8h.01M9 6.8h.01M11.5 6.8h.01"/></svg> },
  { shape: 'mobile', hint: 'a phone', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 5h3M12 18.5h.01"/></svg> },
  { shape: 'cache', hint: 'a cache box', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3.5"/><path d="M9 7.5 6.5 11h2.8L8.6 14.5 13 10.2h-3z"/></svg> },
  { shape: 'loadBalancer', hint: 'a load balancer', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3.5"/><path d="M12 7v2.5M12 9.5 8 13.5M12 9.5v4M12 9.5l4 4"/></svg> },
  { shape: 'cdn', hint: 'a cloud', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18.5h10.2a3.8 3.8 0 0 0 .6-7.5 5.5 5.5 0 0 0-10.6-1A4.6 4.6 0 0 0 7 18.5z"/></svg> },
]

/** The Insert button and the tray that opens upward from the bottom dock. Entries reuse the existing tool handlers. */
export function InsertTray({ textActive, classActive, shapeActive, hldActive, onHldShape, onText, onTextOptions, onClass, onShapes, onSticky }: InsertTrayProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const lastTapRef = useRef(0)
  const anyActive = textActive || classActive || shapeActive || hldActive !== null

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
        <button className="insert-entry" type="button" aria-label="Sticky note" title="Add a yellow sticky note in the middle of the view; write in it with the S Pen" onClick={choose(onSticky)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14v10l-5 5H5z"/><path d="M14 19.5v-5h5"/></svg><span>Sticky note</span>
        </button>
        <div className="insert-tray-heading">LLD</div>
        <button className={`insert-entry${classActive ? ' selected' : ''}`} type="button" aria-label="Typed class box" aria-pressed={classActive} title="Tap the sheet with the S Pen to add a typed UML class box; tap a box or rectangle to edit it" onClick={choose(onClass)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9.5h16M4 14.5h16"/></svg><span>Typed class box</span>
        </button>
        <div className="insert-tray-heading">HLD</div>
        {HLD_ENTRIES.map(({ shape, icon, hint }) => (
          <button className={`insert-entry${hldActive === shape ? ' selected' : ''}`} type="button" key={shape} aria-label={HLD_SHAPE_LABELS[shape]} aria-pressed={hldActive === shape} title={`Tap or drag with the S Pen to add ${hint} you write in`} onClick={choose(() => onHldShape(shape))}>
            {icon}<span>{HLD_SHAPE_LABELS[shape]}</span>
          </button>
        ))}
        <div className="insert-shape-grid" role="group" aria-label="More HLD shapes">
          {MORE_HLD_ENTRIES.map(({ shape, icon, hint }) => (
            <button className={`insert-entry${hldActive === shape ? ' selected' : ''}`} type="button" key={shape} aria-label={HLD_SHAPE_LABELS[shape]} aria-pressed={hldActive === shape} title={`Tap or drag with the S Pen to add ${hint} you write in`} onClick={choose(() => onHldShape(shape))}>
              {icon}<span>{HLD_SHAPE_LABELS[shape]}</span>
            </button>
          ))}
        </div>
      </div>}
    </div>
  )
}
