import { useEffect, useRef, useState } from 'react'

type MoreTrayProps = {
  /** "Tidy selected" when two or more class boxes are selected, otherwise "Tidy all". */
  tidyLabel: string
  onTidy: () => void
  /** Desktop: the typed UML class box lives here instead of on the dock. */
  onTypedClass?: () => void
  typedClassActive?: boolean
  /** Desktop: adds a code block. */
  onCode?: () => void
  /** Opens the find bar (both modes). */
  onFind?: () => void
  findTitle?: string
  /** Opens the template chooser. */
  onTemplates: () => void
  /** Opens the "Insert from Mermaid…" dialog. */
  onMermaid?: () => void
  /** Laser pointer (both modes): a transient red trail for presenting; nothing is saved. */
  onLaser?: () => void
  laserActive?: boolean
  /** The key to show in the hint (desktop only). */
  laserKey?: string
  /** Hide or show the toolbars (present mode), both modes. */
  onPresent?: () => void
  presentActive?: boolean
  presentKey?: string
  /** Duplicates the page on screen right after it. */
  onDuplicatePage?: () => void
  onPageOverview?: () => void
  canDuplicatePage?: boolean
}

/** The More button and the tray that opens upward from the bottom dock (same look as Insert). Home for extra actions such as Tidy. */
export function MoreTray({ tidyLabel, onTidy, onTypedClass, typedClassActive, onCode, onFind, findTitle, onTemplates, onMermaid, onLaser, laserActive, laserKey, onPresent, presentActive, presentKey, onDuplicatePage, onPageOverview, canDuplicatePage = true }: MoreTrayProps) {
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
        className={`tool-button more-button${open || laserActive ? ' selected' : ''}`}
        type="button"
        aria-label="More"
        aria-haspopup="true"
        aria-expanded={open}
        title={laserActive ? `More tools — Laser pointer on${laserKey ? ` (${laserKey})` : ''}` : 'More actions'}
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
        {onCode && <>
          <div className="insert-tray-heading">Code</div>
          <button className="insert-entry" type="button" aria-label="Code block" title="Add a code block in the middle of the view (K)" onClick={() => { onCode(); setOpen(false) }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 8-4 4 4 4M15 8l4 4-4 4"/></svg><span>Code block</span>
          </button>
        </>}
        <div className="insert-tray-heading">Templates</div>
        <button className="insert-entry" type="button" aria-label="Insert template" title="Insert a starter layout in the middle of the view" onClick={() => { onTemplates(); setOpen(false) }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M3.5 9h17M9 9v11.5"/></svg><span>Insert template…</span>
        </button>
        {onMermaid && <button className="insert-entry" type="button" aria-label="Insert from Mermaid" title="Turn Mermaid flowchart text into boxes and arrows" onClick={() => { onMermaid(); setOpen(false) }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="6" height="5" rx="1.2"/><rect x="14.5" y="15" width="6" height="5" rx="1.2"/><path d="M6.5 9v6h8M12.5 13l2 2-2 2"/></svg><span>Insert from Mermaid…</span>
        </button>}
        {onFind && <>
          <div className="insert-tray-heading">Search</div>
          <button className="insert-entry" type="button" aria-label="Find" title={findTitle ?? 'Find text on the canvas'} onClick={() => { onFind(); setOpen(false) }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/></svg><span>Find</span>
          </button>
        </>}
        {onLaser && <>
          <div className="insert-tray-heading">Present</div>
          <button className={`insert-entry${laserActive ? ' selected' : ''}`} type="button" aria-label="Laser pointer" aria-pressed={Boolean(laserActive)} title={`Laser pointer: draw a red trail that fades; nothing is saved${laserKey ? ` (${laserKey}; Esc leaves it)` : ''}`} onClick={() => { onLaser(); setOpen(false) }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg><span>Laser pointer</span>
          </button>
          {onPresent && <button className={`insert-entry${presentActive ? ' selected' : ''}`} type="button" aria-label="Hide toolbars" aria-pressed={Boolean(presentActive)} title={`Hide the toolbars for presenting; a Show toolbars button brings them back${presentKey ? ` (${presentKey})` : ''}`} onClick={() => { onPresent(); setOpen(false) }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 9h17"/></svg><span>Hide toolbars</span>
          </button>}
        </>}
        {onDuplicatePage && <>
          <div className="insert-tray-heading">Pages</div>
          {onPageOverview && <button className="insert-entry" type="button" aria-label="Page overview" title="See every page as a thumbnail; jump to one or move it earlier or later" onClick={() => { onPageOverview(); setOpen(false) }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg><span>Page overview</span>
          </button>}
          <button className="insert-entry" type="button" aria-label="Duplicate page" disabled={!canDuplicatePage} title={canDuplicatePage ? 'Copy this page right after it' : 'Page limit reached'} onClick={() => { onDuplicatePage(); setOpen(false) }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 5H7a2 2 0 0 0-2 2v9"/></svg><span>Duplicate page</span>
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
