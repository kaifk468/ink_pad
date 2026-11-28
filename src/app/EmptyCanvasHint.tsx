type EmptyCanvasHintProps = { desktop: boolean; onTemplates: () => void; /** Opens the menu at its Board section (style and canvas type). */ onBoard?: () => void }

const DESKTOP_CHIPS = [{ key: 'R', label: 'Rectangle' }, { key: 'A', label: 'Arrow' }, { key: 'T', label: 'Text' }]
const TABLET_LINES = ['Write or draw with the pen', 'Two fingers to zoom · three fingers to pan', 'Insert has shapes, text and HLD parts']

/**
 * Faint centred hint on an empty page. App renders it only while the page has no items and nothing modal or editing is open.
 * The text and the button row never take pointer events (the pen draws through the hint); only the two buttons do (and go away with the hint).
 */
export function EmptyCanvasHint({ desktop, onTemplates, onBoard }: EmptyCanvasHintProps) {
  return (
    <div className="empty-canvas-hint">
      {desktop ? (
        <>
          <div aria-hidden="true" className="empty-hero">
            <p className="empty-canvas-title">Start your diagram</p>
            <svg className="empty-underline" viewBox="0 0 220 12" preserveAspectRatio="none" focusable="false"><path d="M4 7 C 50 3, 110 9, 216 4" /></svg>
          </div>
          <ul className="empty-chips" aria-label="Shortcuts">
            {DESKTOP_CHIPS.map((chip) => <li key={chip.key}><kbd>{chip.key}</kbd> {chip.label}</li>)}
            <li className="empty-chip-muted">Double-click to label</li>
            <li className="empty-chip-muted">? All shortcuts</li>
          </ul>
        </>
      ) : (
        <div aria-hidden="true">
          <p className="empty-canvas-title">Start drawing</p>
          {TABLET_LINES.map((line) => <p key={line} className="empty-canvas-line">{line}</p>)}
        </div>
      )}
      {(desktop || onBoard) && <div className="empty-canvas-actions">
        {desktop && <button type="button" className="empty-canvas-template" onClick={onTemplates}>Start from a template</button>}
        {onBoard && <button type="button" className="empty-canvas-board" onClick={onBoard}>Choose board</button>}
      </div>}
    </div>
  )
}
