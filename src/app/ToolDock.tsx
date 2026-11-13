import type { RefObject } from 'react'
import type { HldShape } from '../hldShapes'
import { HLD_SHAPE_LABELS } from '../hldShapes'
import { HLD_ENTRIES, InsertTray } from './InsertTray'
import { MoreTray } from './MoreTray'

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
  hldShapeActive: HldShape | null
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
  onHldShape: (shape: HldShape) => void
  onShapes: () => void
  /** Desktop mode: Select first, and Text, Shapes, Typed class and the HLD shapes are one click away instead of inside Insert. */
  desktop?: boolean
  tidyLabel: string
  onTidy: () => void
}

/** Bottom-center tool dock: Pen, Eraser | Select, Lasso | Connectors, Insert. */
export function ToolDock(props: ToolDockProps) {
  const tip = (text: string, key: string) => (props.desktop ? `${text.replace(/ with the S Pen/g, '')} (${key})` : text)
  const divider = <span className="dock-divider" aria-hidden="true" />
  const penEraser = <>
      <button className={`tool-button pen-button${props.penActive ? ' selected' : ''}`} type="button" aria-label="Pen" aria-pressed={props.penActive} title={tip('Freehand pen', 'P')} onClick={props.onPen}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16 11.8-11.8a2.1 2.1 0 0 1 3 3L7 20l-4 1z"/><path d="m13.5 6.5 4 4"/></svg><span>Pen</span>
      </button>
      <div ref={props.eraserControlRef} className="eraser-control">
        <button className={`tool-button eraser-button${props.eraserActive ? ' selected' : ''}`} type="button" aria-label="Eraser" title={tip('Eraser', 'E')} aria-pressed={props.eraserActive} aria-expanded={props.eraserMenuOpen} onClick={props.onEraser}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.2 4.8 9.9 0a1.5 1.5 0 0 1 1.1 2.6l-9.8 9.8a1.5 1.5 0 0 1-2.1 0l-4.1-4.1a1.5 1.5 0 0 1 0-2.1l7.2-7.2a1.5 1.5 0 0 1 1.1-.4Z"/><path d="m8.1 17.2 3.6 3.6h8"/></svg>
          <span>Eraser</span>
        </button>
      </div>
  </>
  const selectLasso = <>
      <button className={`tool-button selection-button${props.selectionActive ? ' selected' : ''}`} type="button" aria-label="Select" aria-pressed={props.selectionActive} title={tip('Select, move, and resize rectangles', 'V')} onClick={props.onSelect}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3v16l4.3-4.1 3.2 6.1 2.5-1.3-3.1-6.1H18L5 3Z"/><rect x="15.5" y="3.5" width="5" height="5" rx="1"/></svg><span>Select</span>
      </button>
      <button className={`tool-button lasso-button${props.lassoActive ? ' selected' : ''}`} type="button" aria-label="Lasso" aria-pressed={props.lassoActive} title={tip('Draw a loop to select and move multiple items', 'L')} onClick={props.onLasso}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12c0-4.1 3.1-7 7.3-7 3.8 0 6.7 2.2 6.7 5.7 0 3.8-3.2 7.3-7.1 7.3-3.8 0-6.9-2.1-6.9-6Z"/><path d="M17.5 17.5 20 20"/></svg><span>Lasso</span>
      </button>
  </>
  const connector = <>
      <button className={`tool-button connector-button${props.connectorActive ? ' selected' : ''}`} type="button" aria-label="Connector" aria-pressed={props.connectorActive} title={tip('Draw a straight UML relationship connector with the S Pen', 'C')} onClick={props.onConnector}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="6" height="6" rx="1"/><rect x="14.5" y="14" width="6" height="6" rx="1"/><path d="m9.5 8.5 5 6"/></svg><span>Connector</span>
      </button>
  </>
  const inkClass = <>
      <button className={`tool-button ink-class-button${props.inkClassActive ? ' selected' : ''}`} type="button" aria-label="Class box" aria-pressed={props.inkClassActive} title={tip('Tap or drag with the S Pen to add a class box you write in by hand: name, variables and methods, with movable dividers', 'B')} onClick={props.onInkClass}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M4 9.5h16M4 14.5h16"/><path d="m8 7.2 2.2-.6M8 12.4c1.2-1 2-1 3 0M8 18c1.5-1 2.5-1 4 0"/></svg><span>Class box</span>
      </button>
  </>
  if (props.desktop) {
    // Desktop: typing and placing shapes come first, so every insert entry is a button of its own (no Insert tray).
    return (
      <nav ref={props.dockRef} className={`tool-dock${props.desktop ? ' desktop-dock' : ''}`} aria-label="Drawing tools">
        {selectLasso}
        {divider}
        {penEraser}
        {divider}
        <button className={`tool-button text-tool-button${props.textActive ? ' selected' : ''}`} type="button" aria-label="Text" aria-pressed={props.textActive} title="Click the sheet to type a label; click a label to edit it (T)" onClick={props.textActive ? props.onText : props.onTextOptions}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7V4.5h14V7M12 4.5V19.5M8.5 19.5h7"/></svg><span>Text</span>
        </button>
        <button className={`tool-button shapes-tool-button${props.shapeActive ? ' selected' : ''}`} type="button" aria-label="Shapes" aria-pressed={props.shapeActive} title="Draw rectangles, lines and arrows" onClick={props.onShapes}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="10" height="10" rx="1"/><path d="M10 19h9m0 0-4-4m4 4-4 4"/></svg><span>Shapes</span>
        </button>
        {connector}
        {divider}
        {HLD_ENTRIES.map(({ shape, icon, hint }) => (
          <button className={`tool-button hld-tool-button${props.hldShapeActive === shape ? ' selected' : ''}`} type="button" key={shape} aria-label={HLD_SHAPE_LABELS[shape]} aria-pressed={props.hldShapeActive === shape} title={`Click or drag to add ${hint} you write in`} onClick={() => props.onHldShape(shape)}>
            {icon}<span>{HLD_SHAPE_LABELS[shape]}</span>
          </button>
        ))}
        {divider}
        {inkClass}
        <button className={`tool-button typed-class-button${props.classActive ? ' selected' : ''}`} type="button" aria-label="Typed class box" aria-pressed={props.classActive} title="Click the sheet to add a typed UML class box; click a box to edit it" onClick={props.onClass}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9.5h16M4 14.5h16"/></svg><span>Typed class</span>
        </button>
        {divider}
        <MoreTray tidyLabel={props.tidyLabel} onTidy={props.onTidy} />
      </nav>
    )
  }
  return (
    <nav ref={props.dockRef} className={`tool-dock${props.desktop ? ' desktop-dock' : ''}`} aria-label="Drawing tools">
      {penEraser}
      {divider}
      {selectLasso}
      {divider}
      {connector}
      {inkClass}
      <InsertTray
        textActive={props.textActive}
        classActive={props.classActive}
        shapeActive={props.shapeActive}
        hldActive={props.hldShapeActive}
        onHldShape={props.onHldShape}
        onText={props.onText}
        onTextOptions={props.onTextOptions}
        onClass={props.onClass}
        onShapes={props.onShapes}
      />
      <MoreTray tidyLabel={props.tidyLabel} onTidy={props.onTidy} />
    </nav>
  )
}
