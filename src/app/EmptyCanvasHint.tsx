type EmptyCanvasHintProps = { desktop: boolean }

const DESKTOP_LINES = ['Pick a tool below or press 1–9 · R rectangle, A arrow, T text', 'Double-click anywhere to type', 'Press ? for all shortcuts']
const TABLET_LINES = ['Write or draw with the pen', 'Two fingers to zoom · three fingers to pan', 'Insert has shapes, text and HLD parts']

/** Faint centred hint on an empty page. App renders it only while the page has no items and nothing modal or editing is open; it never takes pointer events. */
export function EmptyCanvasHint({ desktop }: EmptyCanvasHintProps) {
  return (
    <div className="empty-canvas-hint" aria-hidden="true">
      <p className="empty-canvas-title">{desktop ? 'Start your diagram' : 'Start drawing'}</p>
      {(desktop ? DESKTOP_LINES : TABLET_LINES).map((line) => <p key={line} className="empty-canvas-line">{line}</p>)}
    </div>
  )
}
