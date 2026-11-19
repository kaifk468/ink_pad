type ZoomControlsProps = { zoomPercent: number; locked: boolean; onToggleLock: () => void; onZoomIn: () => void; onZoomOut: () => void; /** Desktop mode: the readout is a button that resets to 100%, and the tablet-only zoom lock is hidden. */ desktop?: boolean; onResetZoom?: () => void }

/** Bottom-left zoom out, percentage and zoom in, plus the zoom lock (pinch and the buttons stop changing zoom; panning still works). */
export function ZoomControls({ zoomPercent, locked, onToggleLock, onZoomIn, onZoomOut, desktop = false, onResetZoom }: ZoomControlsProps) {
  return (
    <div className="zoom-controls" role="group" aria-label="Zoom">
      <button type="button" aria-label="Zoom out" title={desktop ? 'Zoom out (Ctrl+-)' : 'Zoom out'} onClick={onZoomOut} disabled={locked}>−</button>
      {desktop
        ? <button type="button" className="zoom-indicator zoom-indicator-button" aria-label={`Current zoom ${zoomPercent}%. Reset to 100%`} title="Reset zoom to 100% (Ctrl+0). Fit drawing: Shift+1. Zoom to selection: Shift+2" onClick={onResetZoom} disabled={locked}>{zoomPercent}%</button>
        : <output className="zoom-indicator" aria-label="Current zoom">{zoomPercent}%</output>}
      <button type="button" aria-label="Zoom in" title={desktop ? 'Zoom in (Ctrl++)' : 'Zoom in'} onClick={onZoomIn} disabled={locked}>+</button>
      {!desktop && <button type="button" className={`zoom-lock${locked ? ' selected' : ''}`} aria-label={locked ? 'Unlock zoom' : 'Lock zoom'} aria-pressed={locked} title={locked ? 'Zoom locked (panning still works). Tap to unlock.' : 'Lock zoom'} onClick={onToggleLock}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="9" rx="2" />
          {locked ? <path d="M8 11V8a4 4 0 0 1 8 0v3" /> : <path d="M8 11V8a4 4 0 0 1 7.5-2" />}
        </svg>
      </button>}
    </div>
  )
}
