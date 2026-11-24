import { useEffect, useRef, useState } from 'react'
import { HLD_SHAPE_LABELS } from '../hldShapes'
import type { HldShape } from '../hldShapes'
import { MORE_HLD_ENTRIES } from './InsertTray'

type MoreShapesTrayProps = {
  hldActive: HldShape | null
  onHldShape: (shape: HldShape) => void
  onSticky: () => void
}

/** Desktop dock: one "More shapes" button that opens a small grid of the extra HLD shapes (same popover style as More). */
export function MoreShapesTray({ hldActive, onHldShape, onSticky }:MoreShapesTrayProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const anyActive = MORE_HLD_ENTRIES.some((entry) => entry.shape === hldActive)

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

  return (
    <div ref={rootRef} className="insert-control more-shapes-control">
      <button
        className={`tool-button more-shapes-button${open || anyActive ? ' selected' : ''}`}
        type="button"
        aria-label="More shapes"
        aria-haspopup="true"
        aria-expanded={open}
        title="More HLD shapes: User, Browser, Mobile, Cache, Load balancer, CDN"
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><path d="M17 13.5v7M13.5 17h7"/></svg><span>More shapes</span>
      </button>
      {open && <div className="insert-tray more-shapes-tray" role="group" aria-label="More shapes tray">
        <div className="insert-shape-grid">
          {MORE_HLD_ENTRIES.map(({ shape, icon, hint }) => (
            <button className={`insert-entry${hldActive === shape ? ' selected' : ''}`} type="button" key={shape} aria-label={HLD_SHAPE_LABELS[shape]} aria-pressed={hldActive === shape} title={`Click or drag to add ${hint} you write in`} onClick={() => { onHldShape(shape); setOpen(false) }}>
              {icon}<span>{HLD_SHAPE_LABELS[shape]}</span>
            </button>
          ))}
        </div>
        <button className="insert-entry" type="button" aria-label="Sticky note" title="Add a yellow sticky note at the pointer and type in it (N)" onClick={() => { onSticky(); setOpen(false) }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14v10l-5 5H5z"/><path d="M14 19.5v-5h5"/></svg><span>Sticky note</span>
        </button>
      </div>}
    </div>
  )
}
