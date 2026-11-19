import { useState, type CSSProperties } from 'react'
import { ColorPicker } from './ColorPicker'
import { ERASER_SIZES } from './appConfig'
import type { Arrowheads, ConnectorRelationshipType, LayerMove } from '../canvasModel'
import type { AlignOp, DistributeOp } from '../arrange'
import type { StrokeDisplayMode } from '../strokeDisplayMode'
import type { TextFontId } from '../canvasModel'
import { TEXT_FONTS, TEXT_FONT_SIZES } from '../textLayout'
import { FILL_PRESETS } from '../shapeFill'
import { CODE_LANGUAGES } from '../codeBlock'
import { COLORS, MAX_STROKE_WIDTH, MIN_STROKE_WIDTH, WIDTHS } from './appConfig'

type RelationshipProps = {
  type: ConnectorRelationshipType
  reversed: boolean
  elbow: boolean
  onChange: (type: ConnectorRelationshipType) => void
  onReverse: () => void
  onElbow: (elbow: boolean) => void
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
  arrange?: { canAlign: boolean; canDistribute: boolean; onAlign: (op: AlignOp) => void; onDistribute: (op: DistributeOp) => void } | null
  objectEraser?: boolean
  eraserSize?: number
  onEraserMode?: (whole: boolean) => void
  onEraserSize?: (size: number) => void
}

/** The five quick colours, a rainbow button that opens the full picker, and the picker itself. */
function ColorChoices({ value, label, onChange }: { value: string; label: string; onChange: (hex: string, commit: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const quick = COLORS.some((item) => item.value.toLowerCase() === value.toLowerCase())
  return (
    <div className="color-choices" role="group" aria-label={label}>
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
export function ContextPanel(props: ContextPanelProps) {
  const { relationship } = props
  if (!props.showStyle && !props.fill && !props.rotation && !props.showEraser && !props.showSelectionColor && !props.code && !props.showTextSizes && !props.textFit && !props.showTextFonts && props.selectedItemCount === 0 && !props.canDelete && !props.canCopy && !props.canPaste && !relationship && !props.selectionWidth && !props.lineStyle && !props.arrowheads && !props.layer && !props.arrange) return null
  return (
    <aside className={`context-panel${props.desktop ? ' desktop-left' : ''}`} aria-label="Tool options">
      {props.showStyle && <>
        {props.desktop ? <ColorChoices value={props.color} label="Stroke colour" onChange={(hex) => props.onColor(hex)} /> : <div className="tool-group color-group" role="group" aria-label="Pen color">
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
          <label className="popover-label" htmlFor="stroke-width-range">Width</label>
          <input id="stroke-width-range" className="stroke-width-range" aria-label="Stroke width" type="range" min={MIN_STROKE_WIDTH} max={MAX_STROKE_WIDTH} step="1" value={props.width} onChange={(event) => props.onWidth(Number(event.target.value))} />
          <output htmlFor="stroke-width-range">{props.width} px</output>
        </div>
        {props.showDisplayMode !== false && <div className="stroke-display-control" role="group" aria-label="Stroke display mode">
          <button className={`stroke-mode-button${props.strokeDisplayMode === 'smooth' ? ' selected' : ''}`} type="button" aria-label="Smooth stroke display" aria-pressed={props.strokeDisplayMode === 'smooth'} title="Display smoothed curved strokes" onClick={() => props.onStrokeDisplayMode('smooth')}>
            <svg viewBox="0 0 24 16" aria-hidden="true"><path d="M1 12c4 0 4-8 8-8s4 8 8 8 4-4 6-4"/></svg><span>Smooth</span>
          </button>
          <button className={`stroke-mode-button${props.strokeDisplayMode === 'raw' ? ' selected' : ''}`} type="button" aria-label="Raw stroke display" aria-pressed={props.strokeDisplayMode === 'raw'} title="Display raw straight stroke segments" onClick={() => props.onStrokeDisplayMode('raw')}>
            <svg viewBox="0 0 24 16" aria-hidden="true"><path d="m1 12 7-8 7 8 8-7"/></svg><span>Raw</span>
          </button>
        </div>}
      </>}
      {props.selectionWidth && <div className="selection-width" role="group" aria-label="Outline width of the selection">
        <span className="panel-label">Width of this object</span>
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
          <label className="popover-label" htmlFor="selection-width-range">Width</label>
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
      {props.layer && <div className="layer-controls" role="group" aria-label="Layer order">
        <span className="panel-label">Layer</span>
        <div className="selection-actions">
          <button className="clear-selection-button" type="button" aria-label="Bring to front" title="Bring to front (Ctrl+Shift+])" onClick={() => props.layer?.onMove('front')}>To front</button>
          <button className="clear-selection-button" type="button" aria-label="Bring forward" title="Bring forward (Ctrl+])" onClick={() => props.layer?.onMove('forward')}>Forward</button>
          <button className="clear-selection-button" type="button" aria-label="Send backward" title="Send backward (Ctrl+[)" onClick={() => props.layer?.onMove('backward')}>Backward</button>
          <button className="clear-selection-button" type="button" aria-label="Send to back" title="Send to back (Ctrl+Shift+[)" onClick={() => props.layer?.onMove('back')}>To back</button>
        </div>
      </div>}
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
      {props.showSelectionColor && !props.code && props.onSelectionColor && <div className="selection-color">
        <span className="panel-label">Colour of this object</span>
        <ColorChoices value={props.selectionColor ?? '#202124'} label="Object colour" onChange={props.onSelectionColor} />
      </div>}
      {props.fill && <div className="selection-color fill-color" role="group" aria-label="Fill colour">
        <span className="panel-label">Fill</span>
        <div className="tool-group color-group">
          <button className={`color-swatch fill-none${props.fill.color === 'none' ? ' selected' : ''}`} type="button" title="No fill" aria-label="No fill" aria-pressed={props.fill.color === 'none'} onClick={() => props.fill?.onFill(null, true)} />
          {FILL_PRESETS.map((preset) => (
            <button key={preset.fill} className={`color-swatch${props.fill?.color?.toLowerCase() === preset.fill ? ' selected' : ''}`} type="button" title={`${preset.name} fill`} aria-label={`${preset.name} fill`} aria-pressed={props.fill?.color?.toLowerCase() === preset.fill} style={{ '--swatch': preset.fill } as CSSProperties} onClick={() => props.fill?.onFill(preset.fill, true)} />
          ))}
        </div>
        <ColorChoices value={props.fill.color && props.fill.color !== 'none' ? props.fill.color : '#ffffff'} label="Fill colour picker" onChange={(hex, commit) => props.fill?.onFill(hex, commit)} />
        {props.fill.outlineFor(props.fill.color && props.fill.color !== 'none' ? props.fill.color : null) && <button className="clear-selection-button" type="button" title="Use the darker outline that goes with this fill" onClick={() => { const hex = props.fill?.outlineFor(props.fill.color && props.fill.color !== 'none' ? props.fill.color : null); if (hex) props.fill?.onMatchOutline(hex) }}>Matching outline</button>}
      </div>}
      {props.rotation && <div className="rotation-controls" role="group" aria-label="Rotation">
        <span className="panel-label">Rotation: {props.rotation.degrees}°</span>
        <div className="selection-actions">
          <button className="clear-selection-button" type="button" aria-label="Align to line" title="Turn it to the slope of the nearest connector" onClick={props.rotation.onAlign}>Align to line</button>
          <button className="clear-selection-button" type="button" aria-label="Reset rotation" title="Back to upright" disabled={props.rotation.degrees === 0} onClick={props.rotation.onReset}>Reset</button>
        </div>
        <span className="panel-hint">Drag the round handle above it to rotate; hold Shift to snap to 15°.</span>
      </div>}
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
      {(props.showTextSizes || props.textFit) && <div className="tool-group text-size-group" role="group" aria-label="Text size" onMouseDown={props.textFit ? (event) => event.preventDefault() : undefined}>
        {(props.textSizeChoices ?? TEXT_FONT_SIZES).map((size) => (
          <button
            className={`text-size-button${props.textSize === size ? ' selected' : ''}`}
            key={size}
            type="button"
            aria-label={`Text size ${size}`}
            aria-pressed={props.textSize === size}
            title={`${size}px text`}
            onClick={() => props.onTextSize(size)}
          >{size}</button>
        ))}
        {props.textFit && <button
          className={`text-size-button text-fit-toggle${props.textFit.on ? ' selected' : ''}`}
          type="button"
          aria-label="Auto-fit text in shape"
          aria-pressed={props.textFit.on}
          title="Shrink text to fit inside the shape it is in; turns off when you pick a size"
          onClick={props.textFit.onToggle}
        >Fit</button>}
      </div>}
      {props.selectedItemCount > 0 && <button className="clear-selection-button" type="button" onClick={props.onClearSelection}>Clear selection</button>}
      {(props.canCopy || props.canPaste) && <div className="selection-actions" role="group" aria-label="Copy and paste">
        {props.canCopy && <button className="clear-selection-button" type="button" aria-label="Copy selection" title="Copy the selected items" onClick={props.onCopy}>Copy</button>}
        {props.canPaste && <button className="clear-selection-button" type="button" aria-label="Paste" title="Paste the copied items" onClick={props.onPaste}>Paste</button>}
        {props.canCopy && <button className="clear-selection-button" type="button" aria-label="Duplicate selection" title="Duplicate the selected items" onClick={props.onDuplicate}>Duplicate</button>}
      </div>}
      {props.canDelete && <button className="clear-selection-button delete-selection-button" type="button" aria-label="Delete selection" title="Delete the selected items" onClick={props.onDeleteSelection}>Delete</button>}
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
          <button type="button" className={relationship.elbow ? '' : 'active'} aria-pressed={!relationship.elbow} onClick={() => relationship.onElbow(false)}>Straight</button>
          <button type="button" className={relationship.elbow ? 'active' : ''} aria-pressed={relationship.elbow} onClick={() => relationship.onElbow(true)}>Elbow</button>
        </div>
      </div>}
    </aside>
  )
}
