import { useEffect, useRef, useState } from 'react'
import { HLD_SHAPE_LABELS } from '../hldShapes'
import type { HldShape } from '../hldShapes'
import { searchShapes } from '../shapeSearch'
import { LogoPicker } from './LogoPicker'
import type { TechLogo } from '../techLogoSearch'

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
  /** Inserts a tech logo box in the middle of the view (with its name label when the second argument is true). */
  onLogo: (logo: TechLogo, showName: boolean) => void
}

export const HLD_ENTRIES: Array<{ shape: HldShape; icon: JSX.Element; hint: string }> = [
  { shape: 'database', hint: 'a cylinder', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6"/></svg> },
  { shape: 'queue', hint: 'a box with arrow ends', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="10" rx="2"/><path d="M8 7v10M16 7v10"/></svg> },
  { shape: 'service', hint: 'a rounded box', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="5"/></svg> },
]

/** Seventeen more HLD shapes (user, browser, mobile, cache, load balancer, CDN, API gateway, server, object storage, stream, worker, DNS, search, function, scheduler, external service, monitoring): a grid in the tablet Insert tray and the desktop "More shapes" popover (the desktop dock stays short). */
export const MORE_HLD_ENTRIES: Array<{ shape: HldShape; icon: JSX.Element; hint: string }> = [
  { shape: 'user', hint: 'a person or client', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="3.5"/><path d="M4.5 21v-4c0-3 3.4-4.5 7.5-4.5s7.5 1.5 7.5 4.5v4z"/></svg> },
  { shape: 'browser', hint: 'a browser window', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M3 9h18M6.5 6.8h.01M9 6.8h.01M11.5 6.8h.01"/></svg> },
  { shape: 'mobile', hint: 'a phone', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 5h3M12 18.5h.01"/></svg> },
  { shape: 'cache', hint: 'a cache box', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3.5"/><path d="M9 7.5 6.5 11h2.8L8.6 14.5 13 10.2h-3z"/></svg> },
  { shape: 'loadBalancer', hint: 'a load balancer', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3.5"/><path d="M12 7v2.5M12 9.5 8 13.5M12 9.5v4M12 9.5l4 4"/></svg> },
  { shape: 'cdn', hint: 'a cloud', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18.5h10.2a3.8 3.8 0 0 0 .6-7.5 5.5 5.5 0 0 0-10.6-1A4.6 4.6 0 0 0 7 18.5z"/></svg> },
  { shape: 'apiGateway', hint: 'a gateway box (arrows into a gate bar)', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M9 5v14M4.8 9.5h2.6M4.8 14.5h2.6"/></svg> },
  { shape: 'server', hint: 'a server rack', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M4 9.2h16M4 14.8h16M7.5 6.4h.01M7.5 12h.01M7.5 17.6h.01"/></svg> },
  { shape: 'objectStorage', hint: 'a bucket', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="6" rx="8" ry="2.4"/><path d="M4 6l2 12c.4 1.2 3 2.2 6 2.2s5.6-1 6-2.2l2-12"/></svg> },
  { shape: 'stream', hint: 'an event log with an arrow', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6.5" width="19" height="11" rx="2.5"/><path d="M7 6.5v3M11 6.5v3M7 17.5v-3M11 17.5v-3M14.5 12h4m-1.6-1.6 1.6 1.6-1.6 1.6"/></svg> },
  { shape: 'worker', hint: 'a box with a gear', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="4.5"/><circle cx="8.6" cy="9.6" r="1.4"/><path d="M8.6 6.6v1M8.6 11.6v1M5.6 9.6h1M10.6 9.6h1"/></svg> },
  { shape: 'dns', hint: 'a box with a globe (domain names)', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3.5" width="18" height="17" rx="4"/><circle cx="12" cy="9" r="3.4"/><ellipse cx="12" cy="9" rx="1.5" ry="3.4"/><path d="M8.6 9h6.8M8 16.5h8"/></svg> },
  { shape: 'search', hint: 'a magnifier over an index (Elasticsearch)', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3.5" width="18" height="17" rx="4"/><circle cx="14" cy="9" r="2.6"/><path d="M15.9 11l2.1 2.4M6.5 7.5h3M6.5 10h3M6.5 12.5h3M8 17h8"/></svg> },
  { shape: 'function', hint: 'a box with a lambda (serverless function)', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3.5" width="18" height="17" rx="4"/><path d="M9.5 6.5h1.8l3.4 7M12.7 10.6 9.5 14M8 17h8"/></svg> },
  { shape: 'scheduler', hint: 'a box with a clock (cron job)', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3.5" width="18" height="17" rx="4"/><circle cx="12" cy="9" r="3.4"/><path d="M12 6.8V9l1.6.9M8 17h8"/></svg> },
  { shape: 'external', hint: 'a cloud with an arrow out (third-party service)', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18.5h10.2a3.8 3.8 0 0 0 .6-7.5 5.5 5.5 0 0 0-10.6-1A4.6 4.6 0 0 0 7 18.5z"/><path d="M10.5 15.5l3-3M11.5 12.5h2v2"/></svg> },
  { shape: 'monitoring', hint: 'a box with a pulse line (metrics)', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3.5" width="18" height="17" rx="4"/><path d="M5.5 10h2.8l1.4-3.5 2.3 6.5 1.5-3h5M8 17h8"/></svg> },
]

/** The Insert button and the tray that opens upward from the bottom dock. Entries reuse the existing tool handlers. */
export function InsertTray({ textActive, classActive, shapeActive, hldActive, onHldShape, onText, onTextOptions, onClass, onShapes, onSticky, onLogo }: InsertTrayProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const lastTapRef = useRef(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const anyActive = textActive || classActive || shapeActive || hldActive !== null

  useEffect(() => {
    if (!open) { setQuery(''); return }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Capture phase + stopPropagation: App's own Escape handler (focus mode, deselect) must not also run while a tray is open.
      event.stopPropagation()
      if (searchRef.current && searchRef.current.value) setQuery(''); else setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const choose = (action: () => void) => () => { action(); setOpen(false) }
  const searching = query.trim() !== ''
  const matches = searching ? searchShapes(query) : []
  const insertById = (id: string) => {
    if (id === 'text') onText()
    else if (id === 'shapes') onShapes()
    else if (id === 'sticky') onSticky()
    else if (id === 'classBox') onClass()
    else onHldShape(id as HldShape)
    setOpen(false)
  }
  const basicEntries: Record<string, { label: string; title: string; selected: boolean; icon: JSX.Element }> = {
    text: { label: 'Text label', title: 'Tap the sheet with the S Pen to type a label; tap a label to edit it', selected: textActive, icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7V4.5h14V7M12 4.5V19.5M8.5 19.5h7"/></svg> },
    shapes: { label: 'Shapes and arrows', title: 'Straight lines and rectangles recognize on hold automatically. Toggle for arrows.', selected: shapeActive, icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="10" height="10" rx="1"/><path d="M10 19h9m0 0-4-4m4 4-4 4"/></svg> },
    sticky: { label: 'Sticky note', title: 'Add a yellow sticky note in the middle of the view; write in it with the S Pen', selected: false, icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14v10l-5 5H5z"/><path d="M14 19.5v-5h5"/></svg> },
    classBox: { label: 'Typed class box', title: 'Tap the sheet with the S Pen to add a typed UML class box; tap a box or rectangle to edit it', selected: classActive, icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9.5h16M4 14.5h16"/></svg> },
  }
  const hldById = (id: string) => [...HLD_ENTRIES, ...MORE_HLD_ENTRIES].find((entry) => entry.shape === id)

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
        {/* Not focused on open on the tablet: that would pop the on-screen keyboard every time the tray opens. */}
        <input
          ref={searchRef}
          className="shape-search-field"
          type="search"
          aria-label="Search shapes"
          placeholder="Search shapes (redis, kafka…)"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && matches[0]) { event.preventDefault(); insertById(matches[0].id) } }}
        />
        {searching && matches.length === 0 && <div className="shape-search-empty" role="status">No shape matches</div>}
        {searching && matches.length > 0 && <div className="insert-shape-results" role="group" aria-label="Matching shapes">
          {matches.map(({ id, alias }) => {
            const basic = basicEntries[id]
            const hld = hldById(id)
            const label = basic?.label ?? (hld ? HLD_SHAPE_LABELS[hld.shape] : id)
            const icon = basic?.icon ?? hld?.icon
            const selected = basic ? basic.selected : hldActive === id
            return (
              <button className={`insert-entry${selected ? ' selected' : ''}`} type="button" key={id} aria-label={label} title={basic?.title ?? `Tap or drag with the S Pen to add ${hld?.hint ?? 'a shape'} you write in`} onClick={() => insertById(id)}>
                {icon}<span>{label}{alias && <small className="shape-search-alias">{alias}</small>}</span>
              </button>
            )
          })}
        </div>}
        {searching && <LogoPicker touch externalQuery={query} onInsert={(logo, showName) => { onLogo(logo, showName); setOpen(false) }} />}
        {!searching && <>
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
        <div className="insert-tray-heading">Tech logos</div>
        <LogoPicker touch onInsert={(logo, showName) => { onLogo(logo, showName); setOpen(false) }} />
        </>}
      </div>}
    </div>
  )
}
