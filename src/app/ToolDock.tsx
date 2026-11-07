import type { RefObject } from 'react'
import { InsertTray } from './InsertTray'

type ToolDockProps = {
  dockRef: RefObject<HTMLElement>
  eraserControlRef: RefObject<HTMLDivElement>
  penActive: boolean
  eraserActive: boolean
  eraserMenuOpen: boolean
  selectionActive: boolean
  lassoActive: boolean
  connectorActive: boolean
  textActive: boolean
  classActive: boolean
  inkClassActive: boolean
  shapeActive: boolean
  onPen: () => void
  onEraser: () => void
  onSelect: () => void
  onLasso: () => void
  onConnector: () => void
  onText: () => void
  onTextOptions: () => void
  onClass: () => void
  onInkClass: () => void
  onShapes: () => void
}

/** Bottom-center tool dock: Pen, Eraser | Select, Lasso | Connectors, Insert. */
export function ToolDock(props: ToolDockProps) {
  return (
    <nav ref={props.dockRef} className="tool-dock" aria-label="Drawing tools">
      <button className={`tool-button pen-button${props.penActive ? ' selected' : ''}`} type="button" aria-label="Pen" aria-pressed={props.penActive} title="Freehand pen" onClick={props.onPen}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16 11.8-11.8a2.1 2.1 0 0 1 3 3L7 20l-4 1z"/><path d="m13.5 6.5 4 4"/></svg><span>Pen</span>
      </button>
      <div ref={props.eraserControlRef} className="eraser-control">
        <button className={`tool-button eraser-button${props.eraserActive ? ' selected' : ''}`} type="button" aria-label="Eraser" title="Eraser" aria-pressed={props.eraserActive} aria-expanded={props.eraserMenuOpen} onClick={props.onEraser}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.2 4.8 9.9 0a1.5 1.5 0 0 1 1.1 2.6l-9.8 9.8a1.5 1.5 0 0 1-2.1 0l-4.1-4.1a1.5 1.5 0 0 1 0-2.1l7.2-7.2a1.5 1.5 0 0 1 1.1-.4Z"/><path d="m8.1 17.2 3.6 3.6h8"/></svg>
          <span>Eraser</span>
        </button>
      </div>
      <span className="dock-divider" aria-hidden="true" />
      <button className={`tool-button selection-button${props.selectionActive ? ' selected' : ''}`} type="button" aria-label="Select" aria-pressed={props.selectionActive} title="Select, move, and resize rectangles" onClick={props.onSelect}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3v16l4.3-4.1 3.2 6.1 2.5-1.3-3.1-6.1H18L5 3Z"/><rect x="15.5" y="3.5" width="5" height="5" rx="1"/></svg><span>Select</span>
      </button>
      <button className={`tool-button lasso-button${props.lassoActive ? ' selected' : ''}`} type="button" aria-label="Lasso" aria-pressed={props.lassoActive} title="Draw a loop to select and move multiple items" onClick={props.onLasso}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12c0-4.1 3.1-7 7.3-7 3.8 0 6.7 2.2 6.7 5.7 0 3.8-3.2 7.3-7.1 7.3-3.8 0-6.9-2.1-6.9-6Z"/><path d="M17.5 17.5 20 20"/></svg><span>Lasso</span>
      </button>
      <span className="dock-divider" aria-hidden="true" />
      <button className={`tool-button connector-button${props.connectorActive ? ' selected' : ''}`} type="button" aria-label="Connector" aria-pressed={props.connectorActive} title="Draw a straight UML relationship connector with the S Pen" onClick={props.onConnector}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="6" height="6" rx="1"/><rect x="14.5" y="14" width="6" height="6" rx="1"/><path d="m9.5 8.5 5 6"/></svg><span>Connector</span>
      </button>
      <InsertTray
        textActive={props.textActive}
        classActive={props.classActive}
        inkClassActive={props.inkClassActive}
        shapeActive={props.shapeActive}
        onText={props.onText}
        onTextOptions={props.onTextOptions}
        onClass={props.onClass}
        onInkClass={props.onInkClass}
        onShapes={props.onShapes}
      />
    </nav>
  )
}
