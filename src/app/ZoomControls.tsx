type ZoomControlsProps = { zoomPercent: number; locked: boolean; onToggleLock: () => void; onZoomIn: () => void; onZoomOut: () => void }

/** Bottom-left zoom out, percentage and zoom in, plus the zoom lock (pinch and the buttons stop changing zoom; panning still works). */
export function ZoomControls({ zoomPercent, locked, onToggleLock, onZoomIn, onZoomOut }: ZoomControlsProps) {
  return (
    <div className="zoom-controls" role="group" aria-label="Zoom">
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={onZoomOut} disabled={locked}>−</button>
      <output className="zoom-indicator" aria-label="Current zoom">{zoomPercent}%</output>
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={onZoomIn} disabled={locked}>+</button>
      <button type="button" className={`zoom-lock${locked ? ' selected' : ''}`} aria-label={locked ? 'Unlock zoom' : 'Lock zoom'} aria-pressed={locked} title={locked ? 'Zoom locked (panning still works). Tap to unlock.' : 'Lock zoom'} onClick={onToggleLock}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          {locked ? <path d="M8 11V8a4 4 0 0 1 8 0v3" /> : <path d="M8 11V8a4 4 0 0 1 7.5-2" />}
        </svg>
      </button>
    </div>
  )
}
