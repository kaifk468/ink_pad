import { useEffect, useRef, useState } from 'react'
import { HLD_SHAPE_LABELS } from '../hldShapes'
import type { HldShape } from '../hldShapes'
import { HLD_ENTRIES, MORE_HLD_ENTRIES } from './InsertTray'
import { searchShapes } from '../shapeSearch'

type MoreShapesTrayProps = {
  hldActive: HldShape | null
  onHldShape: (shape: HldShape) => void
  onSticky: () => void
}

/** Desktop dock: one "More shapes" button that opens a small grid of the extra HLD shapes (same popover style as More). */
export function MoreShapesTray({ hldActive, onHldShape, onSticky }:MoreShapesTrayProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const searching = query.trim() !== ''
  const anyActive = MORE_HLD_ENTRIES.some((entry) => entry.shape === hldActive)

  useEffect(() => {
    if (!open) { setQuery(''); return }
    searchRef.current?.focus()
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

  const allEntries = searching ? [...MORE_HLD_ENTRIES, ...HLD_ENTRIES] : MORE_HLD_ENTRIES // while typing, the dock shapes (Database, Queue, Service...) are found here too
  const matches = searchShapes(query).filter((match) => match.id === 'sticky' || allEntries.some((entry) => entry.shape === match.id))
  const shownEntries = allEntries.map((entry) => ({ entry, index: matches.findIndex((match) => match.id === entry.shape), alias: matches.find((match) => match.id === entry.shape)?.alias ?? null }))
    .filter((tile) => tile.index >= 0).sort((a, b) => a.index - b.index)
  const firstShown = matches.find((match) => match.id !== 'sticky') ?? matches[0]
  const stickyAlias = matches.find((match) => match.id === 'sticky')?.alias ?? null
  const insertMatch = (id: string) => { if (id === 'sticky') onSticky(); else onHldShape(id as HldShape); setOpen(false) }

  return (
    <div ref={rootRef} className="insert-control more-shapes-control">
      <button
        className={`tool-button more-shapes-button${open || anyActive ? ' selected' : ''}`}
        type="button"
        aria-label="More shapes"
        aria-haspopup="true"
        aria-expanded={open}
        title="More HLD shapes: User, Browser, Mobile, Cache, Load balancer, CDN, API gateway, Server, Object storage, Stream, Worker"
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><path d="M17 13.5v7M13.5 17h7"/></svg><span>More shapes</span>
      </button>
      {open && <div className="insert-tray more-shapes-tray" role="group" aria-label="More shapes tray">
        <input
          ref={searchRef}
          className="shape-search-field"
          type="search"
          aria-label="Search shapes"
          placeholder="Search shapes (redis, kafka…)"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && firstShown) { event.preventDefault(); insertMatch(firstShown.id) } }}
        />
        {searching && matches.length === 0 && <div className="shape-search-empty" role="status">No shape matches</div>}
        <div className="insert-shape-grid">
          {shownEntries.map(({ entry, alias }) => {
            const { shape, icon, hint } = entry
            return (
              <button className={`insert-entry${hldActive === shape ? ' selected' : ''}`} type="button" key={shape} aria-label={HLD_SHAPE_LABELS[shape]} aria-pressed={hldActive === shape} title={`Click or drag to add ${hint} you write in`} onClick={() => { onHldShape(shape); setOpen(false) }}>
                {icon}<span>{HLD_SHAPE_LABELS[shape]}{alias && <small className="shape-search-alias">{alias}</small>}</span>
              </button>
            )
          })}
        </div>
        {matches.some((match) => match.id === 'sticky') && <button className="insert-entry" type="button" aria-label="Sticky note" title="Add a yellow sticky note at the pointer and type in it (N)" onClick={() => { onSticky(); setOpen(false) }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14v10l-5 5H5z"/><path d="M14 19.5v-5h5"/></svg><span>Sticky note{stickyAlias && <small className="shape-search-alias">{stickyAlias}</small>}</span>
        </button>}
      </div>}
    </div>
  )
}
