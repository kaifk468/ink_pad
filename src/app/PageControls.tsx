import { pageLabel } from '../pages'

type PageControlsProps = {
  index: number
  count: number
  /** False at the page limit or while the page on screen is blank (a new page needs something on this one first). */
  canAdd: boolean
  addHint: string
  onPrevious: () => void
  onNext: () => void
  onAdd: () => void
  onDelete: () => void
}

const icon = { viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** Slim vertical strip above the minimap (previous, number over total, next, add, delete). One page: "1 / 1" and add. Several pages: also previous, next and delete (delete can be undone for a few seconds). */
export function PageControls({ index, count, canAdd, addHint, onPrevious, onNext, onAdd, onDelete }: PageControlsProps) {
  const several = count > 1
  return (
    <div className="page-controls" role="group" aria-label="Pages">
      {several && <button type="button" aria-label="Previous page" title="Previous page" onClick={onPrevious} disabled={index <= 0}><svg {...icon}><path d="M6 15l6-6 6 6" /></svg></button>}
      <output className="page-indicator" aria-label={`Page ${pageLabel(index, count)}`}><span>{index + 1}</span><small>{count}</small></output>
      {several && <button type="button" aria-label="Next page" title="Next page" onClick={onNext} disabled={index >= count - 1}><svg {...icon}><path d="M6 9l6 6 6-6" /></svg></button>}
      <button type="button" className="page-add" aria-label="Add page after this one" title={addHint} onClick={onAdd} disabled={!canAdd}><svg {...icon}><path d="M12 5v14M5 12h14" /></svg></button>
      {several && <button type="button" className="page-delete" aria-label="Delete this page" title="Delete this page" onClick={onDelete}><svg {...icon} strokeWidth={1.8}><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" /></svg></button>}
    </div>
  )
}

/** Shown for a few seconds after a page was deleted: puts it back where it was, with its drawing and its undo history. */
export function PageUndoBar({ pageNumber, onUndo }: { pageNumber: number; onUndo: () => void }) {
  return (
    <div className="page-undo-bar" role="status">
      <span>Page {pageNumber} deleted</span>
      <button type="button" onClick={onUndo}>Undo</button>
    </div>
  )
}
