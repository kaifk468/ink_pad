import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { DESKTOP_SECTION_ORDER, activeTextSizeSegment, browserStorage, fillMoreColoursIdle, readOptionsCollapsed, writeOptionsCollapsed, type DesktopSectionId } from './optionsPanelModel'
import { ColorPicker } from './ColorPicker'
import { ERASER_SIZES } from './appConfig'
import type { Arrowheads, ConnectorRelationshipType, ConnectorRouting, LayerMove } from '../canvasModel'
import type { AlignOp, DistributeOp } from '../arrange'
import type { StrokeDisplayMode } from '../strokeDisplayMode'
import type { TextAlign, TextFontId } from '../canvasModel'
import { TEXT_FONTS, TEXT_FONT_SIZES, TEXT_FONT_SIZES_DESKTOP } from '../textLayout'
import { FILL_PRESETS } from '../shapeFill'
import { CODE_LANGUAGES } from '../codeBlock'
import { COLORS, MAX_STROKE_WIDTH, MIN_STROKE_WIDTH, WIDTHS } from './appConfig'

type RelationshipProps = {
  type: ConnectorRelationshipType
  reversed: boolean
  routing: ConnectorRouting
  twoWay: boolean
  onTwoWay: (twoWay: boolean) => void
  hasLabel: boolean
  onEditLabel: () => void
  /** Insert box into connector: offered when the selected connector is unlocked. */
  canInsertBox: boolean
  onInsertBox: () => void
  onChange: (type: ConnectorRelationshipType) => void
  onReverse: () => void
  onRouting: (routing: ConnectorRouting) => void
  /** Multiplicity text at each end of the connector; `onEndLabel` commits one (blur / Enter). */
  startLabel: string
  endLabel: string
  /** Id of the connector these labels belong to; the inputs capture it when they mount and commit to that id. */
  connectorId: number
  onEndLabel: (connectorId: number, end: 'start' | 'end', text: string) => void
}

/**
 * One end-label input. It is keyed by connector id + end, captures the id when it mounts and commits to that id (on blur, Enter or unmount),
 * so a blur caused by selecting another connector never writes the text to the new one and text typed before the section unmounts is kept.
 */
function EndLabelInput({ connectorId, end, value, placeholder, label, onCommit }: { connectorId: number; end: 'start' | 'end'; value: string; placeholder: string; label: string; onCommit: (connectorId: number, end: 'start' | 'end', text: string) => void }) {
  const capturedId = useRef(connectorId).current
  const draft = useRef<string | null>(null)
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit
  const commit = (text: string) => {
    draft.current = null
    commitRef.current(capturedId, end, text)
  }
  useEffect(() => () => { if (draft.current !== null) commitRef.current(capturedId, end, draft.current) }, [capturedId, end])
  return (
    <input type="text" maxLength={24} placeholder={placeholder} aria-label={label} title="Multiplicity or cardinality at this end" defaultValue={value}
      onChange={(event) => { draft.current = event.currentTarget.value }}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
  )
}

type ContextPanelProps = {
  showStyle: boolean
  color: string
  onColor: (value: string) => void
  width: number
  onWidth: (value: number) => void
  strokeDisplayMode: StrokeDisplayMode
  onStrokeDisplayMode: (mode: StrokeDisplayMode) => void
  showTextSizes: boolean
  /** The font list: for new labels with the text tool, or for the one selected label. */
  showTextFonts: boolean
  textFontId: TextFontId
  onTextFont: (id: TextFontId) => void
  textSize: number
  onTextSize: (size: number) => void
  /** Desktop only: sizes to offer (default TEXT_FONT_SIZES) and the auto-fit toggle for the label being edited or selected. */
  textSizeChoices?: readonly number[]
  /** A lone selected labelled connector: its label size buttons. */
  /** Selected text labels: Left / Centre / Right buttons (`value` null when the labels differ). */
  textAlign?: { value: TextAlign | 'left' | null; onPick: (align: TextAlign | 'left') => void }
  connectorLabelSize?: { size: number; onPick: (size: number) => void }
  textFit?: { on: boolean; onToggle: () => void }
  selectedItemCount: number
  onClearSelection: () => void
  /** True when something is selected that Delete can remove (including a single selected box). */
  canDelete: boolean
  onDeleteSelection: () => void
  /** Copy and Duplicate need a selection; Paste needs something on the in-app clipboard. */
  canCopy: boolean
  canPaste: boolean
  onCopy: () => void
  onPaste: () => void
  onDuplicate: () => void
  relationship: RelationshipProps | null
  /** Desktop only: the panel sits on the left, opens with one click, and offers the full colour spectrum, recolouring and the eraser options. */
  desktop?: boolean
  /** Desktop: short name shown in the panel header ("Pen", "Rectangle", "3 objects"). */
  contextName?: string
  /** Hide the Smooth/Raw switch (shape tools). */
  showDisplayMode?: boolean
  /** Recolour the selection: the one colour it shares (null when mixed) and the change handler (commit = false while dragging in the picker). */
  selectionColor?: string | null
  showSelectionColor?: boolean
  onSelectionColor?: (hex: string, commit: boolean) => void
  showEraser?: boolean
  /** Desktop only: fill colour of the selected shapes ('none' = no fill, null = mixed) and its handlers. */
  fill?: { color: string | 'none' | null; onFill: (hex: string | null, commit: boolean) => void; onMatchOutline: (hex: string) => void; outlineFor: (fill: string | null) => string | null } | null
  /** The selected label or plain shape that can be rotated: its angle in degrees, and the buttons that set it. */
  rotation?: { degrees: number; onAlign: () => void; onReset: () => void } | null
  /** Desktop: the one selected code block's language, light/dark choice and text size. */
  code?: { language: string; dark: boolean; fontSize: number; canSmaller: boolean; canLarger: boolean; onLanguage: (id: string) => void; onTheme: (dark: boolean) => void; onFontSize: (direction: 1 | -1) => void; onEdit: () => void } | null
  /** Desktop: outline width of the selection (null = mixed). `onChange(width, commit)`: commit is false while the slider is dragged; `onEnd` closes the one undo step. */
  selectionWidth?: { value: number | null; onChange: (width: number, commit: boolean) => void; onEnd: () => void } | null
  /** Desktop: line style of the selection, or the default for new shapes/lines/arrows (null value = mixed). */
  lineStyle?: { value: 'solid' | 'dashed' | 'dotted' | null; label: string; onChange: (dash: 'solid' | 'dashed' | 'dotted') => void } | null
  /** Desktop: arrowheads of the selected line/arrow strokes (null value = mixed). */
  arrowheads?: { value: Arrowheads | null; onChange: (heads: Arrowheads) => void } | null
  /** Desktop: layer order buttons for the selection. */
  layer?: { onMove: (move: LayerMove) => void } | null
  /** Desktop: align (2+ items) and distribute (3+ items). */
  /** Selected plain rectangles: Sharp / Round corners (`rounded` true when all selected are round). */
  corners?: { rounded: boolean; onChange: (rounded: boolean) => void } | null
  /** "Use as default for new shapes" (one shape selected, `canSet`) and "Reset default shape style" (when a default exists). */
  newShapeDefault?: { canSet: boolean; isSet: boolean; onSet: () => void; onReset: () => void } | null
  /** Desktop: the shapes the selected boxes can change to (Change shape). */
  changeShape?: { choices: Array<{ id: string; label: string }>; onChange: (id: string) => void } | null
  /** Tablet: the commands the desktop right-click menu has (Select similar, Copy / Paste style, Number steps). Each button shows only when its handler is given. */
  selectionTools?: { onSelectSimilar?: (() => void) | null; onCopyStyle?: (() => void) | null; onPasteStyle?: (() => void) | null; canPasteStyle?: boolean; onNumberSteps?: (() => void) | null } | null
  /** Tablet: Move to page chips (the other pages, then a new page); `onMove` gets the chip's `movePage:` action. */
  movePages?: { chips: Array<{ action: string; chip: string; label: string }>; onMove: (action: string) => void } | null
  group?: { canGroup: boolean; canUngroup: boolean; onGroup: () => void; onUngroup: () => void } | null
  /** Flip selection (2+ unlocked items, or one stroke / connector; desktop and tablet). */
  flip?: { onFlip: (axis: 'horizontal' | 'vertical') => void } | null
  /** Same size (2+ boxes selected, desktop and tablet): the largest width / height wins. */
  sameSize?: { onSameSize: (mode: 'width' | 'height' | 'both') => void } | null
  /** Add boundary (any selection) and Select connected (one box with connectors), desktop and tablet. */
  boundaryTools?: { onFocus: () => void; onAddBoundary: () => void; onSelectConnected: (() => void) | null } | null
  arrange?: { canAlign: boolean; canDistribute: boolean; onAlign: (op: AlignOp) => void; onDistribute: (op: DistributeOp) => void } | null
  objectEraser?: boolean
  eraserSize?: number
  onEraserMode?: (whole: boolean) => void
  onEraserSize?: (size: number) => void
}

/** The five quick colours, a rainbow button that opens the full picker, and the picker itself. */
function ColorChoices({ value, label, onChange, square, idle, heading }: { value: string; label: string; onChange: (hex: string, commit: boolean) => void; square?: boolean; idle?: boolean; heading?: string }) {
  const [open, setOpen] = useState(false)
  const quick = idle || COLORS.some((item) => item.value.toLowerCase() === value.toLowerCase())
  return (
    <div className={`color-choices${square ? ' is-fill' : ''}${heading ? ' has-heading' : ''}`} role="group" aria-label={label}>
      {heading && <span className="panel-label">{heading}</span>}
      <div className="tool-group color-group">
        {COLORS.map((item) => (
          <button
            className={`color-swatch${value.toLowerCase() === item.value.toLowerCase() ? ' selected' : ''}`}
            key={item.value}
            type="button"
            title={item.name}
            aria-label={item.name}
            aria-pressed={value.toLowerCase() === item.value.toLowerCase()}
            style={{ '--swatch': item.value } as CSSProperties}
            onClick={() => onChange(item.value, true)}
          />
        ))}
        <button
          className={`color-swatch spectrum-swatch${open || !quick ? ' selected' : ''}`}
          type="button"
          title="More colours"
          aria-label="More colours"
          aria-expanded={open}
          style={!quick ? { '--custom': value } as CSSProperties : undefined}
          onClick={() => setOpen((v) => !v)}
        />
      </div>
      {open && <div className="color-picker-popover"><ColorPicker value={value} onChange={(hex) => onChange(hex, false)} onCommit={(hex) => onChange(hex, true)} /></div>}
    </div>
  )
}

/** Settings that only appear when the active tool or selection needs them. */
const TEXT_ALIGN_OPTIONS: ReadonlyArray<{ id: TextAlign | 'left'; label: string; icon: string }> = [
  { id: 'left', label: 'left', icon: 'M1 2h14M1 5.5h9M1 9h14M1 12.5h9' },
  { id: 'center', label: 'centre', icon: 'M1 2h14M3.5 5.5h9M1 9h14M3.5 12.5h9' },
  { id: 'right', label: 'right', icon: 'M1 2h14M6 5.5h9M1 9h14M6 12.5h9' },
]

export function ContextPanel(props: ContextPanelProps) {
  const { relationship } = props
  const [collapsed, setCollapsed] = useState(() => (props.desktop ? readOptionsCollapsed(browserStorage()) : false))
  const [moreOpen, setMoreOpen] = useState(false)
  const toggleCollapsed = () => { const next = !collapsed; setCollapsed(next); writeOptionsCollapsed(browserStorage(), next) }
  const headerColor = props.showStyle ? props.color : (props.selectionColor ?? 'var(--ip-muted)')
  if (!props.showStyle && !props.fill && !props.rotation && !props.showEraser && !props.showSelectionColor && !props.code && !props.showTextSizes && !props.textAlign && !props.connectorLabelSize && !props.textFit && !props.showTextFonts && props.selectedItemCount === 0 && !props.canDelete && !props.canCopy && !props.canPaste && !relationship && !props.selectionWidth && !props.lineStyle && !props.arrowheads && !props.layer && !props.arrange && !props.changeShape && !props.corners && !(props.newShapeDefault && (props.newShapeDefault.canSet || props.newShapeDefault.isSet)) && !props.flip && !props.sameSize && !props.boundaryTools) return null
  const selectionWidthEl = (
    <>
      {props.selectionWidth && <div className="selection-width" role="group" aria-label="Outline width of the selection">
        <span className="panel-label">{props.desktop ? 'Width' : 'Width of this object'}</span>
        <div className="tool-group thickness-group">
          {WIDTHS.map((size) => (
            <button
              className={`thickness-button${props.selectionWidth?.value === size ? ' selected' : ''}`}
              key={size}
              type="button"
              title={`${size}px`}
              aria-label={`Set width to ${size} pixels`}
              aria-pressed={props.selectionWidth?.value === size}
              onClick={() => { props.selectionWidth?.onChange(size, true); props.selectionWidth?.onEnd() }}
            ><span style={{ width: Math.min(size * 2.2, 20), height: Math.min(size * 2.2, 20) }} /></button>
          ))}
        </div>
        <div className="stroke-width-slider">
          {!props.desktop && <label className="popover-label" htmlFor="selection-width-range">Width</label>}
          <input
            id="selection-width-range"
            className="stroke-width-range"
            aria-label="Width of the selection"
            type="range"
            min={MIN_STROKE_WIDTH}
            max={MAX_STROKE_WIDTH}
            step="1"
            value={props.selectionWidth.value ?? MIN_STROKE_WIDTH}
            onChange={(event) => props.selectionWidth?.onChange(Number(event.target.value), false)}
            onPointerUp={() => props.selectionWidth?.onEnd()}
            onKeyUp={() => props.selectionWidth?.onEnd()}
            onBlur={() => props.selectionWidth?.onEnd()}
          />
          <output htmlFor="selection-width-range">{props.selectionWidth.value === null ? 'mixed' : `${props.selectionWidth.value} px`}</output>
        </div>
      </div>}
    </>
  )
  const lineStyleEl = (
    <>
      {props.lineStyle && <div className="line-style-controls" role="group" aria-label={props.lineStyle.label}>
        <span className="panel-label">{props.lineStyle.label}</span>
        <div className="routing-toggle" role="group" aria-label="Line style">
          {(['solid', 'dashed', 'dotted'] as const).map((dash) => (
            <button key={dash} type="button" className={props.lineStyle?.value === dash ? 'active' : ''} aria-pressed={props.lineStyle?.value === dash} aria-label={`${dash} line`} title={`${dash[0].toUpperCase()}${dash.slice(1)} line`} onClick={() => props.lineStyle?.onChange(dash)}>
              <svg viewBox="0 0 28 8" width="28" height="8" aria-hidden="true"><path d="M2 4h24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeDasharray={dash === 'dashed' ? '6 4' : dash === 'dotted' ? '0.1 5' : undefined} /></svg>
            </button>
          ))}
        </div>
      </div>}
    </>
  )
  const arrowheadsEl = (
    <>
      {props.arrowheads && <div className="arrowhead-controls" role="group" aria-label="Arrowheads">
        <span className="panel-label">Arrowheads</span>
        <div className="routing-toggle" role="group" aria-label="Arrowhead ends">
          {([['none', 'None', 'M3 6h22'], ['end', 'End', 'M3 6h22m-5-4 5 4-5 4'], ['start', 'Start', 'M3 6h22M8 2 3 6l5 4'], ['both', 'Both', 'M3 6h22m-5-4 5 4-5 4M8 2 3 6l5 4']] as const).map(([id, label, d]) => (
            <button key={id} type="button" className={props.arrowheads?.value === id ? 'active' : ''} aria-pressed={props.arrowheads?.value === id} aria-label={`Arrowheads: ${label}`} title={`Arrowheads: ${label.toLowerCase()}`} onClick={() => props.arrowheads?.onChange(id)}>
              <svg viewBox="0 0 28 12" width="28" height="12" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          ))}
        </div>
      </div>}
    </>
  )
  const layerEl = (
    <>
      {props.layer && <div className="layer-controls" role="group" aria-label="Layer order">
        <span className="panel-label">Layer</span>
        <div className="selection-actions">
          <button className="clear-selection-button" type="button" aria-label="Bring to front" title="Bring to front (Ctrl+Shift+])" onClick={() => props.layer?.onMove('front')}>{props.desktop ? <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4l7 4-7 4-7-4zM5 12l7 4 7-4M5 16l7 4 7-4" /></svg> : 'To front'}</button>
          <button className="clear-selection-button" type="button" aria-label="Bring forward" title="Bring forward (Ctrl+])" onClick={() => props.layer?.onMove('forward')}>{props.desktop ? <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5l7 4-7 4-7-4zM5 15l7 4 7-4" /></svg> : 'Forward'}</button>
          <button className="clear-selection-button" type="button" aria-label="Send backward" title="Send backward (Ctrl+[)" onClick={() => props.layer?.onMove('backward')}>{props.desktop ? <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 11l7 4-7 4-7-4zM5 9l7-4 7 4" /></svg> : 'Backward'}</button>
          <button className="clear-selection-button" type="button" aria-label="Send to back" title="Send to back (Ctrl+Shift+[)" onClick={() => props.layer?.onMove('back')}>{props.desktop ? <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12l7 4-7 4-7-4zM5 8l7 4 7-4-7-4z" /></svg> : 'To back'}</button>
        </div>
      </div>}
    </>
  )
  const groupEl = (
    <>
      {props.group && (props.group.canGroup || props.group.canUngroup) && <div className="selection-actions" role="group" aria-label="Group">
        {props.group.canGroup && <button className="clear-selection-button" type="button" aria-label="Group selection" title={props.desktop ? "Group the selected items so they select and move together (Ctrl+G)" : "Group the selected items so they select and move together"} onClick={props.group.onGroup}>Group</button>}
        {props.group.canUngroup && <button className="clear-selection-button" type="button" aria-label="Ungroup selection" title={props.desktop ? "Take the selected items out of their group (Ctrl+Shift+G)" : "Take the selected items out of their group"} onClick={props.group.onUngroup}>Ungroup</button>}
      </div>}
    </>
  )
  const changeShapeEl = (
    <>
      {props.changeShape && props.changeShape.choices.length > 0 && <div className="change-shape-controls" role="group" aria-label="Change shape">
        <span className="panel-label">Change shape</span>
        <div className="selection-actions">
          {props.changeShape.choices.map((choice) => <button key={choice.id} className="clear-selection-button" type="button" aria-label={`Change shape to ${choice.label}`} title={`Change shape to ${choice.label}`} onClick={() => props.changeShape?.onChange(choice.id)}>{choice.label}</button>)}
        </div>
      </div>}
    </>
  )
  const selectionToolsEl = (
    <>
      {props.selectionTools && (props.selectionTools.onSelectSimilar || props.selectionTools.onCopyStyle || props.selectionTools.onPasteStyle || props.selectionTools.onNumberSteps) && <div className="selection-actions selection-tools" role="group" aria-label="Selection commands">
        {props.selectionTools.onSelectSimilar && <button className="clear-selection-button" type="button" aria-label="Select similar" title="Select every item like this one" onClick={props.selectionTools.onSelectSimilar}>Select similar</button>}
        {props.selectionTools.onCopyStyle && <button className="clear-selection-button" type="button" aria-label="Copy style" title="Copy this item's colours and line style" onClick={props.selectionTools.onCopyStyle}>Copy style</button>}
        {props.selectionTools.onPasteStyle && <button className="clear-selection-button" type="button" aria-label="Paste style" title="Apply the copied style to the selection" disabled={!props.selectionTools.canPasteStyle} onClick={props.selectionTools.onPasteStyle}>Paste style</button>}
        {props.selectionTools.onNumberSteps && <button className="clear-selection-button" type="button" aria-label="Number steps" title="Number the selected arrows 1, 2, 3 in flow order" onClick={props.selectionTools.onNumberSteps}>Number steps</button>}
      </div>}
    </>
  )
  const movePagesEl = (
    <>
      {props.movePages && props.movePages.chips.length > 0 && <div className="move-page-controls" role="group" aria-label="Move to page">
        <span className="panel-label">Move to page</span>
        <div className="selection-actions">
          {props.movePages.chips.map((chip) => <button key={chip.action} className="clear-selection-button" type="button" aria-label={chip.label} title={chip.label} onClick={() => props.movePages?.onMove(chip.action)}>{chip.action === 'movePage:new' ? '+ New page' : chip.chip}</button>)}
        </div>
      </div>}
    </>
  )
  const arrangeEl = (
    <>
      {props.arrange && <div className="arrange-controls" role="group" aria-label="Align and distribute">
        <span className="panel-label">Align</span>
        <div className="selection-actions">
          {([['left', 'Left'], ['center', 'Centre'], ['right', 'Right'], ['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']] as const).map(([op, label]) => (
            <button key={op} className="clear-selection-button" type="button" disabled={!props.arrange?.canAlign} aria-label={`Align ${label.toLowerCase()}`} title={`Align ${label.toLowerCase()}`} onClick={() => props.arrange?.onAlign(op)}>{label}</button>
          ))}
        </div>
        <span className="panel-label">Distribute</span>
        <div className="selection-actions">
          <button className="clear-selection-button" type="button" disabled={!props.arrange.canDistribute} aria-label="Distribute horizontally" title="Equal gaps left to right (3 or more items)" onClick={() => props.arrange?.onDistribute('horizontal')}>Horizontally</button>
          <button className="clear-selection-button" type="button" disabled={!props.arrange.canDistribute} aria-label="Distribute vertically" title="Equal gaps top to bottom (3 or more items)" onClick={() => props.arrange?.onDistribute('vertical')}>Vertically</button>
        </div>
      </div>}
    </>
  )
  const flipEl = (
    <>
      {props.flip && <div className="flip-controls" role="group" aria-label="Flip">
        <span className="panel-label">Flip</span>
        <div className="selection-actions">
          <button className="clear-selection-button" type="button" aria-label="Flip horizontal" title="Mirror the selection left to right (Shift+H)" onClick={() => props.flip?.onFlip('horizontal')}>Flip ↔</button>
          <button className="clear-selection-button" type="button" aria-label="Flip vertical" title="Mirror the selection top to bottom (Shift+V)" onClick={() => props.flip?.onFlip('vertical')}>Flip ↕</button>
        </div>
      </div>}
    </>
  )
  const sameSizeEl = (
    <>
      {props.sameSize && <div className="same-size-controls" role="group" aria-label="Same size">
        <span className="panel-label">Same size</span>
        <div className="selection-actions">
          <button className="clear-selection-button" type="button" aria-label="Same width" title="Give the selected boxes the largest width" onClick={() => props.sameSize?.onSameSize('width')}>Width</button>
          <button className="clear-selection-button" type="button" aria-label="Same height" title="Give the selected boxes the largest height" onClick={() => props.sameSize?.onSameSize('height')}>Height</button>
          <button className="clear-selection-button" type="button" aria-label="Same width and height" title="Give the selected boxes the largest width and height" onClick={() => props.sameSize?.onSameSize('both')}>Both</button>
        </div>
      </div>}
    </>
  )
  const boundaryToolsEl = (
    <>
      {props.boundaryTools && <div className="selection-actions boundary-tools" role="group" aria-label="Boundary and connections">
        <button className="clear-selection-button" type="button" aria-label="Focus on selection" title="Fade everything not linked to the selection (view only; Esc exits)" onClick={props.boundaryTools.onFocus}>Focus</button>
        <button className="clear-selection-button" type="button" aria-label="Add boundary" title="Draw a dashed boundary box around the selection" onClick={props.boundaryTools.onAddBoundary}>Add boundary</button>
        {props.boundaryTools.onSelectConnected && <button className="clear-selection-button" type="button" aria-label="Select connected" title="Select this box, its arrows and the boxes at their other ends" onClick={props.boundaryTools.onSelectConnected}>Select connected</button>}
      </div>}
    </>
  )
  const selColorEl = (
    <>
      {props.showSelectionColor && !props.code && props.onSelectionColor && <div className="selection-color">
        <span className="panel-label">{props.desktop ? 'Stroke' : 'Colour of this object'}</span>
        <ColorChoices value={props.selectionColor ?? '#202124'} label="Object colour" onChange={props.onSelectionColor} />
      </div>}
    </>
  )
  const fillEl = (
    <>
      {props.fill && <div className="selection-color fill-color" role="group" aria-label="Fill colour">
        <span className="panel-label">Fill</span>
        <div className={`tool-group color-group${props.desktop ? ' fill-presets' : ''}`}>
          <button className={`color-swatch fill-none${props.fill.color === 'none' ? ' selected' : ''}`} type="button" title="No fill" aria-label="No fill" aria-pressed={props.fill.color === 'none'} onClick={() => props.fill?.onFill(null, true)} />
          {FILL_PRESETS.map((preset) => (
            <button key={preset.fill} className={`color-swatch${props.fill?.color?.toLowerCase() === preset.fill ? ' selected' : ''}`} type="button" title={`${preset.name} fill`} aria-label={`${preset.name} fill`} aria-pressed={props.fill?.color?.toLowerCase() === preset.fill} style={{ '--swatch': preset.fill } as CSSProperties} onClick={() => props.fill?.onFill(preset.fill, true)} />
          ))}
        </div>
        <ColorChoices square={props.desktop} idle={props.desktop && fillMoreColoursIdle(props.fill.color)} value={props.fill.color && props.fill.color !== 'none' ? props.fill.color : '#ffffff'} label="Fill colour picker" onChange={(hex, commit) => props.fill?.onFill(hex, commit)} />
        {props.fill.outlineFor(props.fill.color && props.fill.color !== 'none' ? props.fill.color : null) && <button className="clear-selection-button" type="button" title="Use the darker outline that goes with this fill" onClick={() => { const hex = props.fill?.outlineFor(props.fill.color && props.fill.color !== 'none' ? props.fill.color : null); if (hex) props.fill?.onMatchOutline(hex) }}>Matching outline</button>}
      </div>}
    </>
  )
  const newShapeDefaultEl = (
    <>
      {props.newShapeDefault && (props.newShapeDefault.canSet || props.newShapeDefault.isSet) && <div className="selection-actions selection-tools" role="group" aria-label="Default shape style">
        {props.newShapeDefault.canSet && <button className="clear-selection-button" type="button" aria-label="Use as default for new shapes" title="New shapes start with this shape's fill, line style, width and corners" onClick={props.newShapeDefault.onSet}>Use as default</button>}
        {props.newShapeDefault.isSet && <button className="clear-selection-button" type="button" aria-label="Reset default shape style" title="New shapes go back to the normal style" onClick={props.newShapeDefault.onReset}>Reset default</button>}
      </div>}
    </>
  )
  const cornersEl = (
    <>
      {props.corners && <div className="corners-controls" role="group" aria-label="Corners">
        <span className="panel-label">Corners</span>
        <div className="routing-toggle" role="group" aria-label="Rectangle corners" title="Sharp or rounded corners for plain rectangles">
          <button type="button" className={props.corners.rounded ? '' : 'active'} aria-pressed={!props.corners.rounded} onClick={() => props.corners?.onChange(false)}>Sharp</button>
          <button type="button" className={props.corners.rounded ? 'active' : ''} aria-pressed={props.corners.rounded} onClick={() => props.corners?.onChange(true)}>Round</button>
        </div>
      </div>}
    </>
  )
  const rotationEl = (
    <>
      {props.rotation && <div className="rotation-controls" role="group" aria-label="Rotation">
        <span className="panel-label">Rotation: {props.rotation.degrees}°</span>
        <div className="selection-actions">
          <button className="clear-selection-button" type="button" aria-label="Align to line" title="Turn it to the slope of the nearest connector" onClick={props.rotation.onAlign}>Align to line</button>
          <button className="clear-selection-button" type="button" aria-label="Reset rotation" title="Back to upright" disabled={props.rotation.degrees === 0} onClick={props.rotation.onReset}>Reset</button>
        </div>
        <span className="panel-hint">Drag the round handle above it to rotate; hold Shift to snap to 15°.</span>
      </div>}
    </>
  )
  const codeEl = (
    <>
      {props.code && <div className="code-controls" role="group" aria-label="Code block">
        <span className="panel-label">Code block</span>
        <select className="relationship-select" aria-label="Code language" value={props.code.language} onChange={(event) => props.code?.onLanguage(event.target.value)}>
          {CODE_LANGUAGES.map((language) => <option key={language.id} value={language.id}>{language.label}</option>)}
        </select>
        <div className="routing-toggle" role="group" aria-label="Code theme">
          <button type="button" className={props.code.dark ? '' : 'active'} aria-pressed={!props.code.dark} onClick={() => props.code?.onTheme(false)}>Light</button>
          <button type="button" className={props.code.dark ? 'active' : ''} aria-pressed={props.code.dark} onClick={() => props.code?.onTheme(true)}>Dark</button>
        </div>
        <div className="code-row" role="group" aria-label="Code text size">
          <button className="clear-selection-button" type="button" aria-label="Smaller code text" disabled={!props.code.canSmaller} onClick={() => props.code?.onFontSize(-1)}>A-</button>
          <span className="panel-label">{props.code.fontSize} px</span>
          <button className="clear-selection-button" type="button" aria-label="Larger code text" disabled={!props.code.canLarger} onClick={() => props.code?.onFontSize(1)}>A+</button>
        </div>
        <button className="clear-selection-button" type="button" aria-label="Edit code" title="Edit the code (Enter or double-click)" onClick={props.code.onEdit}>Edit code</button>
      </div>}
    </>
  )
  const eraserEl = (
    <>
      {props.showEraser && <div className="eraser-panel" role="group" aria-label="Eraser options">
        <span className="panel-label">Mode</span>
        <div className="eraser-mode-options">
          <button className={`eraser-mode-card${!props.objectEraser ? ' selected' : ''}`} type="button" aria-pressed={!props.objectEraser} onClick={() => props.onEraserMode?.(false)}><span>Stroke eraser</span></button>
          <button className={`eraser-mode-card${props.objectEraser ? ' selected' : ''}`} type="button" aria-pressed={props.objectEraser} onClick={() => props.onEraserMode?.(true)}><span>Whole eraser</span></button>
        </div>
        <span className="panel-label">Size: {props.eraserSize} px</span>
        <input className="eraser-size-range" aria-label="Eraser size" type="range" min="8" max="96" step="1" value={props.eraserSize} onChange={(event) => props.onEraserSize?.(Number(event.target.value))} />
        <div className="eraser-sizes" aria-label="Eraser size presets">{ERASER_SIZES.map((size) => <button className={`eraser-size${props.eraserSize === size && !props.objectEraser ? ' selected' : ''}`} type="button" key={size} aria-label={`${size} pixel eraser preset`} onClick={() => props.onEraserSize?.(size)}><span style={{ width: Math.max(7, Math.min(20, size / 3)), height: Math.max(7, Math.min(20, size / 3)) }} /></button>)}</div>
      </div>}
    </>
  )
  const fontsEl = (
    <>
      {props.showTextFonts && <div className="tool-group text-font-group" role="group" aria-label="Text font">
        {TEXT_FONTS.map((font) => (
          <button
            className={`text-font-button${props.textFontId === font.id ? ' selected' : ''}`}
            key={font.id}
            type="button"
            aria-label={`${font.label} font`}
            aria-pressed={props.textFontId === font.id}
            title={`${font.label} font`}
            style={{ fontFamily: font.family }}
            onClick={() => props.onTextFont(font.id)}
          >Aa<span>{font.label}</span></button>
        ))}
      </div>}
    </>
  )
  const alignEl = (
    <>
      {props.textAlign && <span className="panel-label">Text align</span>}
      {props.textAlign && <div className="tool-group text-align-group" role="group" aria-label="Text alignment" onMouseDown={(event) => event.preventDefault()}>
        {TEXT_ALIGN_OPTIONS.map((option) => (
          <button
            className={`text-size-button text-align-button${props.textAlign?.value === option.id ? ' selected' : ''}`}
            key={option.id}
            type="button"
            aria-label={`Align text ${option.label}`}
            aria-pressed={props.textAlign?.value === option.id}
            title={`Align text ${option.label}`}
            onClick={() => props.textAlign?.onPick(option.id)}
          >
            <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true"><path d={option.icon} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        ))}
      </div>}
    </>
  )
  const connSizeEl = (
    <>
      {props.connectorLabelSize && <span className="panel-label">Text size</span>}
      {props.connectorLabelSize && <div className="tool-group text-size-group" role="group" aria-label="Arrow label size">
        {TEXT_FONT_SIZES_DESKTOP.map((size) => (
          <button
            className={`text-size-button${props.connectorLabelSize?.size === size ? ' selected' : ''}`}
            key={size}
            type="button"
            aria-label={`Arrow label size ${size}`}
            aria-pressed={props.connectorLabelSize?.size === size}
            title={`${size}px arrow label`}
            onClick={() => props.connectorLabelSize?.onPick(size)}
          >{size}</button>
        ))}
      </div>}
    </>
  )
  const textSizeEl = (
    <>
      {(props.showTextSizes || props.textFit) && <span className="panel-label">Text size</span>}
      {(props.showTextSizes || props.textFit) && <div className="tool-group text-size-group" role="group" aria-label="Text size" onMouseDown={props.textFit ? (event) => event.preventDefault() : undefined}>
        {(props.textSizeChoices ?? TEXT_FONT_SIZES).map((size) => {
          const active = props.desktop ? activeTextSizeSegment(props.textSizeChoices ?? TEXT_FONT_SIZES, props.textSize, props.textFit?.on) === size : props.textSize === size
          return (
            <button
              className={`text-size-button${active ? ' selected' : ''}`}
              key={size}
              type="button"
              aria-label={`Text size ${size}`}
              aria-pressed={active}
              title={`${size}px text`}
              onClick={() => props.onTextSize(size)}
            >{size}</button>
          )
        })}
        {props.textFit && <button
          className={`text-size-button text-fit-toggle${props.textFit.on ? ' selected' : ''}`}
          type="button"
          aria-label="Auto-fit text in shape"
          aria-pressed={props.textFit.on}
          title="Shrink text to fit inside the shape it is in; turns off when you pick a size"
          onClick={props.textFit.onToggle}
        >Fit</button>}
      </div>}
    </>
  )
  const clearEl = (
    <>
      {props.selectedItemCount > 0 && <button className="clear-selection-button" type="button" onClick={props.onClearSelection}>Clear selection</button>}
    </>
  )
  const copyEl = (
    <>
      {(props.canCopy || props.canPaste) && <div className="selection-actions" role="group" aria-label="Copy and paste">
        {props.canCopy && <button className="clear-selection-button" type="button" aria-label="Copy selection" title="Copy the selected items" onClick={props.onCopy}>Copy</button>}
        {props.canPaste && <button className="clear-selection-button" type="button" aria-label="Paste" title="Paste the copied items" onClick={props.onPaste}>Paste</button>}
        {props.canCopy && <button className="clear-selection-button" type="button" aria-label="Duplicate selection" title="Duplicate the selected items" onClick={props.onDuplicate}>Duplicate</button>}
      </div>}
    </>
  )
  const deleteEl = (
    <>
      {props.canDelete && <button className="clear-selection-button delete-selection-button" type="button" aria-label="Delete selection" title="Delete the selected items" onClick={props.onDeleteSelection}>Delete</button>}
    </>
  )
  const relationshipEl = (
    <>
      {relationship && <div className="relationship-controls" role="group" aria-label="Selected connector relationship">
        <label className="relationship-label" htmlFor="connector-relationship-type">Relationship</label>
        <select
          id="connector-relationship-type"
          className="relationship-select"
          aria-label="Connector relationship type"
          value={relationship.type}
          onChange={(event) => relationship.onChange(event.target.value as ConnectorRelationshipType)}
        >
          <option value="association">Association</option>
          <option value="directed-association">Directed association</option>
          <option value="inheritance">Inheritance</option>
          <option value="realization">Realization</option>
          <option value="dependency">Dependency</option>
          <option value="aggregation">Aggregation</option>
          <option value="composition">Composition</option>
        </select>
        <button
          className="relationship-reverse"
          type="button"
          disabled={relationship.type === 'association'}
          title={relationship.type === 'association' ? 'Association has no direction' : `Reverse ${relationship.reversed ? 'to start' : 'to end'}`}
          aria-label="Reverse connector direction"
          onClick={relationship.onReverse}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h15l-4-4m4 4-4 4M20 16H5l4 4m-4-4 4-4"/></svg>
          <span>Reverse</span>
        </button>
        <div className="routing-toggle" role="group" aria-label="Connector line shape">
          <button type="button" className={relationship.routing === 'straight' ? 'active' : ''} aria-pressed={relationship.routing === 'straight'} onClick={() => relationship.onRouting('straight')}>Straight</button>
          <button type="button" className={relationship.routing === 'elbow' ? 'active' : ''} aria-pressed={relationship.routing === 'elbow'} onClick={() => relationship.onRouting('elbow')}>Elbow</button>
          <button type="button" className={relationship.routing === 'curved' ? 'active' : ''} aria-pressed={relationship.routing === 'curved'} title="Smooth curve; drag its middle dot to bend it" onClick={() => relationship.onRouting('curved')}>Curved</button>
        </div>
        {relationship.type === 'directed-association' && (
          <div className="routing-toggle" role="group" aria-label="Arrow ends" title="Draw the arrowhead at one end or at both ends">
            <button type="button" className={relationship.twoWay ? '' : 'active'} aria-pressed={!relationship.twoWay} onClick={() => relationship.onTwoWay(false)}>One way</button>
            <button type="button" className={relationship.twoWay ? 'active' : ''} aria-pressed={relationship.twoWay} onClick={() => relationship.onTwoWay(true)}>Both ends</button>
          </div>
        )}
        <div className="end-labels" role="group" aria-label="End labels" title="Multiplicity or cardinality at this end">
          <span className="end-labels-heading">End labels</span>
          <EndLabelInput key={`${relationship.connectorId}:start`} connectorId={relationship.connectorId} end="start" value={relationship.startLabel} placeholder="1" label="Start end label" onCommit={relationship.onEndLabel} />
          <EndLabelInput key={`${relationship.connectorId}:end`} connectorId={relationship.connectorId} end="end" value={relationship.endLabel} placeholder="*" label="End end label" onCommit={relationship.onEndLabel} />
        </div>
        <button type="button" className="relationship-reverse" aria-label={relationship.hasLabel ? 'Edit connector label' : 'Add connector label'} title="Text drawn on the middle of the connector (double-click it, or press Enter)" onClick={relationship.onEditLabel}>
          <span>{relationship.hasLabel ? 'Edit label' : 'Add label'}</span>
        </button>
        <button type="button" className="relationship-reverse" aria-label="Insert box" title="Put a box on the middle of this connector" disabled={!relationship.canInsertBox} onClick={relationship.onInsertBox}>
          <span>Insert box</span>
        </button>
      </div>}
    </>
  )
  const colourEl = (
    <>
        {props.desktop ? <ColorChoices value={props.color} label="Stroke colour" onChange={(hex) => props.onColor(hex)} heading="Stroke" /> : <div className="tool-group color-group" role="group" aria-label="Pen color">
          {COLORS.map((item) => (
            <button
              className={`color-swatch${props.color === item.value ? ' selected' : ''}`}
              key={item.value}
              type="button"
              title={item.name}
              aria-label={item.name}
              aria-pressed={props.color === item.value}
              style={{ '--swatch': item.value } as CSSProperties}
              onClick={() => props.onColor(item.value)}
            />
          ))}
        </div>}
    </>
  )
  const widthControls = (
    <>
        <div className="tool-group thickness-group" role="group" aria-label="Stroke thickness">
          {WIDTHS.map((size) => (
            <button
              className={`thickness-button${props.width === size ? ' selected' : ''}`}
              key={size}
              type="button"
              title={`${size}px stroke`}
              aria-label={`${size} pixel stroke thickness`}
              aria-pressed={props.width === size}
              onClick={() => props.onWidth(size)}
            ><span style={{ width: Math.min(size * 2.2, 20), height: Math.min(size * 2.2, 20) }} /></button>
          ))}
        </div>
        <div className="stroke-width-slider">
          {!props.desktop && <label className="popover-label" htmlFor="stroke-width-range">Width</label>}
          <input id="stroke-width-range" className="stroke-width-range" aria-label="Stroke width" type="range" min={MIN_STROKE_WIDTH} max={MAX_STROKE_WIDTH} step="1" value={props.width} onChange={(event) => props.onWidth(Number(event.target.value))} />
          <output htmlFor="stroke-width-range">{props.width} px</output>
        </div>
    </>
  )
  const widthEl = (
    <>
        {props.desktop ? <div className="selection-width"><span className="panel-label">Width</span>{widthControls}</div> : widthControls}
        {props.showDisplayMode !== false && <div className="stroke-display-control" role="group" aria-label="Stroke display mode">
          <button className={`stroke-mode-button${props.strokeDisplayMode === 'smooth' ? ' selected' : ''}`} type="button" aria-label="Smooth stroke display" aria-pressed={props.strokeDisplayMode === 'smooth'} title="Display smoothed curved strokes" onClick={() => props.onStrokeDisplayMode('smooth')}>
            <svg viewBox="0 0 24 16" aria-hidden="true"><path d="M1 12c4 0 4-8 8-8s4 8 8 8 4-4 6-4"/></svg><span>Smooth</span>
          </button>
          <button className={`stroke-mode-button${props.strokeDisplayMode === 'raw' ? ' selected' : ''}`} type="button" aria-label="Raw stroke display" aria-pressed={props.strokeDisplayMode === 'raw'} title="Display raw straight stroke segments" onClick={() => props.onStrokeDisplayMode('raw')}>
            <svg viewBox="0 0 24 16" aria-hidden="true"><path d="m1 12 7-8 7 8 8-7"/></svg><span>Raw</span>
          </button>
        </div>}
    </>
  )
  const tabletBody = (
    <>
      {props.showStyle && <>{colourEl}{widthEl}</>}
      {selectionWidthEl}{lineStyleEl}{arrowheadsEl}{layerEl}{groupEl}{changeShapeEl}{selectionToolsEl}{movePagesEl}{arrangeEl}{flipEl}{sameSizeEl}{boundaryToolsEl}
      {selColorEl}{fillEl}{newShapeDefaultEl}{cornersEl}{rotationEl}{codeEl}{eraserEl}{fontsEl}{alignEl}{connSizeEl}{textSizeEl}{clearEl}{copyEl}{deleteEl}{relationshipEl}
    </>
  )
  if (!props.desktop) return <aside className="context-panel" aria-label="Tool options">{tabletBody}</aside>
  const sectionNodes: Record<DesktopSectionId, ReactNode> = {
    colour: <>{props.showStyle && colourEl}{selColorEl}</>,
    text: <>{fontsEl}{alignEl}{connSizeEl}{textSizeEl}{eraserEl}</>,
    width: <>{props.showStyle && widthEl}{selectionWidthEl}</>,
    style: <>{lineStyleEl}{arrowheadsEl}{fillEl}{cornersEl}{codeEl}{relationshipEl}</>,
    layer: <>{layerEl}{groupEl}</>,
    arrange: <>{arrangeEl}{flipEl}{sameSizeEl}</>,
    actions: <>{clearEl}{copyEl}{deleteEl}</>,
    more: null,
  }
  // Rotation and "Use as default" live in More on desktop, so the default panel stays short enough to show Copy / Duplicate / Delete without scrolling.
  const hasDefaultAction = Boolean(props.newShapeDefault && (props.newShapeDefault.canSet || props.newShapeDefault.isSet))
  const hasMore = Boolean((props.changeShape && props.changeShape.choices.length > 0) || props.boundaryTools || props.rotation || hasDefaultAction)
  return (
    <aside className={`context-panel${props.desktop ? ' desktop-left' : ''}${collapsed ? ' is-collapsed' : ''}`} aria-label="Tool options">
      <div className="options-header">
        <div className="options-header-title" aria-hidden="true" onClick={toggleCollapsed}>
          <span className="options-swatch" aria-hidden="true" style={{ '--swatch': headerColor } as CSSProperties} />
          <span className="options-name">{props.contextName ?? 'Options'}</span>
        </div>
        <button className="options-chevron" type="button" aria-label={collapsed ? 'Expand options' : 'Collapse options'} aria-expanded={!collapsed} aria-controls="options-panel-body" onClick={toggleCollapsed}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      {!collapsed && <div className="options-body" id="options-panel-body">
        {DESKTOP_SECTION_ORDER.filter((id) => id !== 'more').map((id) => <Fragment key={id}>{sectionNodes[id]}</Fragment>)}
        {hasMore && <div className="options-more">
          <button className="options-more-toggle" type="button" aria-expanded={moreOpen} aria-controls="options-more-actions" onClick={() => setMoreOpen((open) => !open)}>
            <span>More actions</span>
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {moreOpen && <div className="options-more-body" id="options-more-actions"><span className="panel-label">More</span>{rotationEl}{newShapeDefaultEl}{changeShapeEl}{boundaryToolsEl}</div>}
        </div>}
      </div>}
    </aside>
  )
}
