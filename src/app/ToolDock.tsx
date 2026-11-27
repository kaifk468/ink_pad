import type { RefObject } from 'react'
import type { HldShape } from '../hldShapes'
import { HLD_SHAPE_LABELS } from '../hldShapes'
import { HLD_ENTRIES, InsertTray } from './InsertTray'
import { MoreShapesTray } from './MoreShapesTray'
import { MoreTray } from './MoreTray'
import { DockTip } from './DockTip'

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
  /** Desktop direct shape tool in use (rectangle, diamond, ellipse, arrow, line) or null. */
  shapeTool?: 'rectangle' | 'diamond' | 'ellipse' | 'arrow' | 'line' | null
  onShapeTool?: (kind: 'rectangle' | 'diamond' | 'ellipse' | 'arrow' | 'line') => void
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
  /** Adds a sticky note (desktop: More shapes; tablet: Insert tray). */
  onSticky: () => void
  /** Opens the template chooser (More menu, both modes). */
  onTemplates: () => void
  /** Opens the Mermaid import dialog (More menu, both modes). */
  onMermaid?: () => void
  /** Opens the file picker of "Import Excalidraw file…". */
  onExcalidraw?: () => void
  /** Desktop only: adds a code block at the middle of the view. */
  onCode?: () => void
  /** Opens the find bar (More menu, both modes). */
  onFind?: () => void
  /** Laser pointer (More menu, both modes). */
  onLaser?: () => void
  laserActive?: boolean
  /** Hide the toolbars (present mode; More menu, both modes). */
  onPresent?: () => void
  presentActive?: boolean
  /** Tool lock: keep the shape/arrow/line tool after drawing. */
  toolLock?: boolean
  onToolLock?: () => void
  /** Duplicates the page on screen (More menu, both modes); disabled at the page limit. */
  onDuplicatePage?: () => void
  onPageOverview?: () => void
  canDuplicatePage?: boolean
}

const DESKTOP_SHAPES: Array<{ kind: 'rectangle' | 'diamond' | 'ellipse' | 'arrow' | 'line'; label: string; key: string; num: string; icon: JSX.Element; hint?: string }> = [
  { kind: 'rectangle', hint: 'Shift: square', label: 'Rectangle', key: 'R', num: '2', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="1.5"/></svg> },
  { kind: 'diamond', hint: 'Shift: square', label: 'Diamond', key: 'D', num: '3', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 20.5 12 12 20.5 3.5 12Z"/></svg> },
  { kind: 'ellipse', hint: 'Shift: circle', label: 'Ellipse', key: 'O', num: '4', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="8.5" ry="7"/></svg> },
  { kind: 'arrow', label: 'Arrow', key: 'A', num: '5', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m0 0-5-5m5 5-5 5"/></svg> },
  { kind: 'line', label: 'Line', key: 'I', num: '6', icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5"/></svg> },
]

/** Bottom-center tool dock: Pen, Eraser | Select, Lasso | Connectors, Insert. */
export function ToolDock(props: ToolDockProps) {
  // Desktop: the custom tooltip (name + key chips) replaces the native title; tablet keeps its titles.
  const tip = (text: string, _key?: string, _num?: string) => (props.desktop ? undefined : text)
  // Tablet shows the text label under the icon; desktop is icon-only and shows a hover/focus tooltip with the name and shortcut keys.
  const label = (name: string, key?: string, num?: string) => (props.desktop
    ? <DockTip name={name} keys={[key, num]} />
    : <span>{name}</span>)
  const divider = <span className="dock-divider" aria-hidden="true" />
  const penEraser = <>
      <button className={`tool-button pen-button${props.penActive ? ' selected' : ''}`} type="button" aria-label="Pen" aria-pressed={props.penActive} title={tip('Freehand pen', 'P', '7')} onClick={props.onPen}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16 11.8-11.8a2.1 2.1 0 0 1 3 3L7 20l-4 1z"/><path d="m13.5 6.5 4 4"/></svg>{label('Pen', 'P', '7')}
      </button>
      <div ref={props.eraserControlRef} className="eraser-control">
        <button className={`tool-button eraser-button${props.eraserActive ? ' selected' : ''}`} type="button" aria-label="Eraser" title={tip('Eraser', 'E', '0')} aria-pressed={props.eraserActive} aria-expanded={props.eraserMenuOpen} onClick={props.onEraser}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.2 4.8 9.9 0a1.5 1.5 0 0 1 1.1 2.6l-9.8 9.8a1.5 1.5 0 0 1-2.1 0l-4.1-4.1a1.5 1.5 0 0 1 0-2.1l7.2-7.2a1.5 1.5 0 0 1 1.1-.4Z"/><path d="m8.1 17.2 3.6 3.6h8"/></svg>
          {label('Eraser', 'E', '0')}
        </button>
      </div>
  </>
  const selectLasso = <>
      <button className={`tool-button selection-button${props.selectionActive ? ' selected' : ''}`} type="button" aria-label="Select" aria-pressed={props.selectionActive} title={tip('Select, move, and resize rectangles', 'V', '1')} onClick={props.onSelect}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3v16l4.3-4.1 3.2 6.1 2.5-1.3-3.1-6.1H18L5 3Z"/><rect x="15.5" y="3.5" width="5" height="5" rx="1"/></svg>{label('Select', 'V', '1')}
      </button>
      <button className={`tool-button lasso-button${props.lassoActive ? ' selected' : ''}`} type="button" aria-label="Lasso" aria-pressed={props.lassoActive} title={tip('Draw a loop to select and move multiple items', 'L')} onClick={props.onLasso}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12c0-4.1 3.1-7 7.3-7 3.8 0 6.7 2.2 6.7 5.7 0 3.8-3.2 7.3-7.1 7.3-3.8 0-6.9-2.1-6.9-6Z"/><path d="M17.5 17.5 20 20"/></svg>{label('Lasso', 'L')}
      </button>
  </>
  const connector = <>
      <button className={`tool-button connector-button${props.connectorActive ? ' selected' : ''}`} type="button" aria-label="Connector" aria-pressed={props.connectorActive} title={tip('Draw a straight UML relationship connector with the S Pen', 'C', '9')} onClick={props.onConnector}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="6" height="6" rx="1"/><rect x="14.5" y="14" width="6" height="6" rx="1"/><path d="m9.5 8.5 5 6"/></svg>{label('Connector', 'C', '9')}
      </button>
  </>
  const inkClass = <>
      <button className={`tool-button ink-class-button${props.inkClassActive ? ' selected' : ''}`} type="button" aria-label="Class box" aria-pressed={props.inkClassActive} title={tip('Tap or drag with the S Pen to add a class box you write in by hand: name, variables and methods, with movable dividers', 'B')} onClick={props.onInkClass}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M4 9.5h16M4 14.5h16"/><path d="m8 7.2 2.2-.6M8 12.4c1.2-1 2-1 3 0M8 18c1.5-1 2.5-1 4 0"/></svg>{label('Class box', 'B')}
      </button>
  </>
  const lock = props.onToolLock ? (
    <button className={`tool-button tool-lock-button${props.toolLock ? ' selected' : ''}`} type="button" aria-label="Tool lock" aria-pressed={Boolean(props.toolLock)} title={tip("Keep the tool after drawing, to draw several shapes in a row", "Q")} onClick={props.onToolLock}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6M10 4v6l-3 4h10l-3-4V4M12 14v6" fill={props.toolLock ? 'currentColor' : 'none'} fillOpacity={props.toolLock ? 0.25 : 0} /></svg>{label('Keep tool', 'Q')}
    </button>
  ) : null
  if (props.desktop) {
    // Desktop: typing and placing shapes come first, so every insert entry is a button of its own (no Insert tray).
    return (
      <nav ref={props.dockRef} className={`tool-dock${props.desktop ? ' desktop-dock' : ''}`} aria-label="Drawing tools">
        {selectLasso}
        {divider}
        {penEraser}
        {divider}
        {DESKTOP_SHAPES.map(({ kind, label: shapeName, key, num, icon, hint }) => (
          <button className={`tool-button shape-draw-button shape-${kind}${props.shapeTool === kind ? ' selected' : ''}`} type="button" key={kind} aria-label={shapeName} aria-pressed={props.shapeTool === kind} onClick={() => props.onShapeTool?.(kind)}>
            {icon}<DockTip name={shapeName} keys={[key, num]} hint={hint} />
          </button>
        ))}
        {divider}
        <button className={`tool-button text-tool-button${props.textActive ? ' selected' : ''}`} type="button" aria-label="Text" aria-pressed={props.textActive} onClick={props.textActive ? props.onText : props.onTextOptions}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7V4.5h14V7M12 4.5V19.5M8.5 19.5h7"/></svg><DockTip name="Text" keys={['T', '8']} />
        </button>
        {connector}
        {/* System shapes: display: contents normally; hidden in narrow windows (< 740px), where the More tray lists the same shapes. */}
        <div className="dock-system-group">
          {divider}
          {HLD_ENTRIES.map(({ shape, icon }) => (
            <button className={`tool-button hld-tool-button${props.hldShapeActive === shape ? ' selected' : ''}`} type="button" key={shape} aria-label={HLD_SHAPE_LABELS[shape]} aria-pressed={props.hldShapeActive === shape} onClick={() => props.onHldShape(shape)}>
              {icon}<DockTip name={HLD_SHAPE_LABELS[shape]} />
            </button>
          ))}
          <MoreShapesTray desktopTip hldActive={props.hldShapeActive} onHldShape={props.onHldShape} onSticky={props.onSticky} />
        </div>
        {divider}
        {inkClass}
        {divider}
        <MoreTray desktopTip hldActive={props.hldShapeActive} onHldShape={props.onHldShape} onSticky={props.onSticky} tidyLabel={props.tidyLabel} onTidy={props.onTidy} onTypedClass={props.onClass} typedClassActive={props.classActive} onCode={props.onCode} onFind={props.onFind} findTitle="Find text on the canvas (Ctrl+F)" onTemplates={props.onTemplates} onMermaid={props.onMermaid} onExcalidraw={props.onExcalidraw} onLaser={props.onLaser} laserActive={props.laserActive} laserKey="X" onPresent={props.onPresent} presentActive={props.presentActive} presentKey="Alt+Z" onDuplicatePage={props.onDuplicatePage} onPageOverview={props.onPageOverview} canDuplicatePage={props.canDuplicatePage} />
        {lock}
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
        onSticky={props.onSticky}
      />
      <MoreTray tidyLabel={props.tidyLabel} onTidy={props.onTidy} onFind={props.onFind} findTitle="Find text on the canvas" onTemplates={props.onTemplates} onMermaid={props.onMermaid} onExcalidraw={props.onExcalidraw} onLaser={props.onLaser} laserActive={props.laserActive} onPresent={props.onPresent} presentActive={props.presentActive} onDuplicatePage={props.onDuplicatePage} onPageOverview={props.onPageOverview} canDuplicatePage={props.canDuplicatePage} />
      {lock}
    </nav>
  )
}
