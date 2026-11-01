type ZoomControlsProps = { zoomPercent: number; onZoomIn: () => void; onZoomOut: () => void }

/** Bottom-left zoom out, percentage and zoom in. */
export function ZoomControls({ zoomPercent, onZoomIn, onZoomOut }: ZoomControlsProps) {
  return (
    <div className="zoom-controls" role="group" aria-label="Zoom">
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={onZoomOut}>−</button>
      <output className="zoom-indicator" aria-label="Current zoom">{zoomPercent}%</output>
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={onZoomIn}>+</button>
    </div>
  )
}
