import type { CSSProperties } from 'react'
import type { ConnectorRelationshipType } from '../canvasModel'
import type { StrokeDisplayMode } from '../strokeDisplayMode'
import type { TextFontId } from '../canvasModel'
import { TEXT_FONTS, TEXT_FONT_SIZES } from '../textLayout'
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
}

/** Settings that only appear when the active tool or selection needs them. */
export function ContextPanel(props: ContextPanelProps) {
  const { relationship } = props
  if (!props.showStyle && !props.showTextSizes && !props.showTextFonts && props.selectedItemCount === 0 && !props.canDelete && !props.canCopy && !props.canPaste && !relationship) return null
  return (
    <aside className="context-panel" aria-label="Tool options">
      {props.showStyle && <>
        <div className="tool-group color-group" role="group" aria-label="Pen color">
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
        </div>
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
        <div className="stroke-display-control" role="group" aria-label="Stroke display mode">
          <button className={`stroke-mode-button${props.strokeDisplayMode === 'smooth' ? ' selected' : ''}`} type="button" aria-label="Smooth stroke display" aria-pressed={props.strokeDisplayMode === 'smooth'} title="Display smoothed curved strokes" onClick={() => props.onStrokeDisplayMode('smooth')}>
            <svg viewBox="0 0 24 16" aria-hidden="true"><path d="M1 12c4 0 4-8 8-8s4 8 8 8 4-4 6-4"/></svg><span>Smooth</span>
          </button>
          <button className={`stroke-mode-button${props.strokeDisplayMode === 'raw' ? ' selected' : ''}`} type="button" aria-label="Raw stroke display" aria-pressed={props.strokeDisplayMode === 'raw'} title="Display raw straight stroke segments" onClick={() => props.onStrokeDisplayMode('raw')}>
            <svg viewBox="0 0 24 16" aria-hidden="true"><path d="m1 12 7-8 7 8 8-7"/></svg><span>Raw</span>
          </button>
        </div>
      </>}
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
      {props.showTextSizes && <div className="tool-group text-size-group" role="group" aria-label="Text size">
        {TEXT_FONT_SIZES.map((size) => (
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
