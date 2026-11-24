type EmptyCanvasHintProps = { desktop: boolean; onTemplates: () => void }

const DESKTOP_LINES = ['Pick a tool below or press 1–9 · R rectangle, A arrow, T text', 'Double-click anywhere to type', 'Press ? for all shortcuts']
const TABLET_LINES = ['Write or draw with the pen', 'Two fingers to zoom · three fingers to pan', 'Insert has shapes, text and HLD parts']

/**
 * Faint centred hint on an empty page. App renders it only while the page has no items and nothing modal or editing is open.
 * The text never takes pointer events; the one "Start from a template" button does (and goes away with the hint).
 */
export function EmptyCanvasHint({ desktop, onTemplates }: EmptyCanvasHintProps) {
  return (
    <div className="empty-canvas-hint">
      <div aria-hidden="true">
        <p className="empty-canvas-title">{desktop ? 'Start your diagram' : 'Start drawing'}</p>
        {(desktop ? DESKTOP_LINES : TABLET_LINES).map((line) => <p key={line} className="empty-canvas-line">{line}</p>)}
      </div>
      <button type="button" className="empty-canvas-template" onClick={onTemplates}>Start from a template</button>
    </div>
  )
}
