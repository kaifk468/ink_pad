import { pageLabel } from '../pages'

type PageControlsProps = { index: number; count: number; canAdd: boolean; onPrevious: () => void; onNext: () => void; onAdd: () => void }

/** Bottom-left, above the zoom controls: previous page, "2 / 5", next page and add a page after this one. */
export function PageControls({ index, count, canAdd, onPrevious, onNext, onAdd }: PageControlsProps) {
  return (
    <div className="page-controls" role="group" aria-label="Pages">
      <button type="button" aria-label="Previous page" title="Previous page" onClick={onPrevious} disabled={index <= 0}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <output className="page-indicator" aria-label="Current page">{pageLabel(index, count)}</output>
      <button type="button" aria-label="Next page" title="Next page" onClick={onNext} disabled={index >= count - 1}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </button>
      <button type="button" className="page-add" aria-label="Add page after this one" title={canAdd ? 'Add page after this one' : 'Page limit reached'} onClick={onAdd} disabled={!canAdd}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  )
}
