import { useEffect, useRef, useState } from 'react'

type MoreTrayProps = {
  /** "Tidy selected" when two or more class boxes are selected, otherwise "Tidy all". */
  tidyLabel: string
  onTidy: () => void
  /** Desktop: the typed UML class box lives here instead of on the dock. */
  onTypedClass?: () => void
  typedClassActive?: boolean
}

/** The More button and the tray that opens upward from the bottom dock (same look as Insert). Home for extra actions such as Tidy. */
export function MoreTray({ tidyLabel, onTidy, onTypedClass, typedClassActive }: MoreTrayProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

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
    <div ref={rootRef} className="insert-control more-control">
      <button
        className={`tool-button more-button${open ? ' selected' : ''}`}
        type="button"
        aria-label="More"
        aria-haspopup="true"
        aria-expanded={open}
        title="More actions"
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg><span>More</span>
      </button>
      {open && <div className="insert-tray more-tray" role="group" aria-label="More tray">
        {onTypedClass && <>
          <div className="insert-tray-heading">LLD</div>
          <button className={`insert-entry${typedClassActive ? ' selected' : ''}`} type="button" aria-label="Typed class box" aria-pressed={typedClassActive} title="Click the sheet to add a typed UML class box; click a box to edit it" onClick={() => { onTypedClass(); setOpen(false) }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9.5h16M4 14.5h16"/></svg><span>Typed class box</span>
          </button>
        </>}
        <div className="insert-tray-heading">Layout</div>
        <button className="insert-entry" type="button" aria-label={tidyLabel} title={`${tidyLabel}: arrange the class boxes neatly and make the connectors between them Elbow`} onClick={() => { onTidy(); setOpen(false) }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="8.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M7 10.5v1.5h10v-1.5M12 12v1.5"/></svg><span>{tidyLabel}</span>
        </button>
      </div>}
    </div>
  )
}
