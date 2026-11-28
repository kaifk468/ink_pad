import { useEffect, useRef, useState } from 'react'
import { MAX_PAGE_NAME_LENGTH } from '../documentFormat'
import { movePage } from '../pages'
import { PAGE_PREVIEW_TOO_LARGE } from '../thumbnail'

type PageOverviewProps = {
  count: number
  /** The page on screen (highlighted). */
  current: number
  /** A small picture of one page, or null for a blank page. Called lazily, one page at a time, only while this overlay is open. */
  loadThumbnail: (index: number) => Promise<string | null>
  /** Go to a page (the caller also closes the overview). */
  onGo: (index: number) => void
  /** Move the page at `from` to `to` (one step earlier or later). */
  onMove: (from: number, to: number) => void
  /** The page names in page order ('' = unnamed). */
  names: string[]
  /** Save a new name for the page (empty clears it). */
  onRename: (index: number, name: string) => void
  onClose: () => void
}

const arrow = { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** Modal grid with a thumbnail and number for every page. Tap a tile to go there; the small arrows move that page earlier or later. Esc, the close button or a click outside closes it. */
export function PageOverview({ count, current, loadThumbnail, onGo, onMove, names, onRename, onClose }: PageOverviewProps) {
  // undefined = not drawn yet, null = blank page. Moving a page moves its picture too, so nothing is redrawn.
  const [pictures, setPictures] = useState<Array<string | null | undefined>>(() => Array.from({ length: count }, () => undefined))
  const loadRef = useRef(loadThumbnail)
  loadRef.current = loadThumbnail
  // Pages are drawn one at a time. A move made while drawing is rare; the picture is then looked up by the page's original index, which
  // the order list below tracks, so the right picture always ends up on the right page.
  const orderRef = useRef<number[]>(Array.from({ length: count }, (_, index) => index))
  useEffect(() => {
    let closed = false
    ;(async () => {
      for (let original = 0; original < count && !closed; original += 1) {
        const at = orderRef.current.indexOf(original)
        let picture: string | null = null
        try { picture = await loadRef.current(at) } catch { picture = null }
        if (closed) return
        setPictures((now) => { const next = now.slice(); next[orderRef.current.indexOf(original)] = picture; return next })
        await new Promise((resolve) => window.setTimeout(resolve, 0)) // let the page breathe between drawings
      }
    })()
    return () => { closed = true }
    // Only the pages that exist when it opens are drawn; moving pages reorders pictures below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (event.target instanceof HTMLInputElement) return // Esc in a name box only reverts that name
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const move = (from: number, to: number) => {
    orderRef.current = movePage(orderRef.current, from, to)
    setPictures((now) => movePage(now, from, to))
    onMove(from, to)
  }
  return (
    <div className="file-panel-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="file-panel page-overview" role="dialog" aria-modal="true" aria-label="Page overview">
        <header className="file-panel-header">
          <strong>Pages ({count})</strong>
          <button type="button" className="file-panel-close" aria-label="Close" title="Close (Esc)" onClick={onClose}>×</button>
        </header>
        <ul className="page-overview-grid">
          {Array.from({ length: count }, (_, index) => (
            <li key={index} className={`page-tile${index === current ? ' current' : ''}`}>
              <button type="button" className="page-tile-open" aria-label={`Go to page ${index + 1}`} aria-current={index === current ? 'page' : undefined} title={`Go to page ${index + 1}`} onClick={() => onGo(index)}>
                <span className="page-tile-picture">
                  {pictures[index] === PAGE_PREVIEW_TOO_LARGE ? <em>Preview too large</em> : pictures[index] ? <img src={pictures[index] ?? undefined} alt="" draggable={false} /> : <em>{pictures[index] === null ? 'Blank' : '…'}</em>}
                </span>
              </button>
              <div className="page-tile-bar">
                <button type="button" aria-label={`Move page ${index + 1} earlier`} title="Move earlier" disabled={index === 0} onClick={() => move(index, index - 1)}><svg {...arrow}><path d="M15 6l-6 6 6 6" /></svg></button>
                <span className="page-tile-number">{index + 1}</span>
                <button type="button" aria-label={`Move page ${index + 1} later`} title="Move later" disabled={index === count - 1} onClick={() => move(index, index + 1)}><svg {...arrow}><path d="M9 6l6 6-6 6" /></svg></button>
              </div>
              <PageNameInput index={index} name={names[index] ?? ''} onRename={onRename} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** The name box under a thumbnail: Enter or leaving it saves, Esc puts the saved name back. Keys stay in the box (no canvas shortcuts). */
function PageNameInput({ index, name, onRename }: { index: number; name: string; onRename: (index: number, name: string) => void }) {
  const [draft, setDraft] = useState(name)
  const draftRef = useRef(name)
  const skipRef = useRef(false)
  const renameRef = useRef(onRename)
  renameRef.current = onRename
  const change = (value: string) => { draftRef.current = value; setDraft(value) }
  useEffect(() => { change(name) }, [name])
  // Closing the overview with the box still focused (click outside) unmounts it without a blur: save then.
  useEffect(() => () => { if (!skipRef.current) renameRef.current(index, draftRef.current) }, [index])
  return (
    <input
      type="text"
      className="page-tile-name"
      value={draft}
      maxLength={MAX_PAGE_NAME_LENGTH}
      placeholder={`Page ${index + 1}`}
      aria-label={`Name of page ${index + 1}`}
      spellCheck={false}
      onChange={(event) => change(event.target.value)}
      onBlur={() => { if (skipRef.current) { skipRef.current = false; return } renameRef.current(index, draftRef.current) }}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
        else if (event.key === 'Escape') { event.preventDefault(); skipRef.current = true; change(name); event.currentTarget.blur() }
      }}
    />
  )
}
