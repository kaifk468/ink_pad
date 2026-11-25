import { connectorPoints, type CanvasItem, type ConnectorObject } from './canvasModel'
import { pathFractionNearest, pathMidpoint, pointAtPathFraction } from './pathGeometry'
import { TEXT_FONT_SIZES_DESKTOP, getTextBaselines, measureTextSize, normalizeText, splitTextLines, type TextMeasure } from './textLayout'

/** Connector labels default to this size (canvas units); `labelFontSize` overrides it. Always in the app's default label font and the connector's colour. */
export const CONNECTOR_LABEL_FONT_SIZE = 18
export const CONNECTOR_LABEL_PADDING = 4
export const MAX_CONNECTOR_LABEL_LENGTH = 500
/** The label sits at this fraction of the path unless `labelPosition` says otherwise; a dragged label stays within the limits. */
export const CONNECTOR_LABEL_DEFAULT_POSITION = 0.5
export const CONNECTOR_LABEL_MIN_POSITION = 0.05
export const CONNECTOR_LABEL_MAX_POSITION = 0.95

/** The label as saved: line endings normalised, trailing whitespace trimmed, capped. Empty means no label (undefined). */
export function cleanConnectorLabel(text: unknown): string | undefined {
  if (typeof text !== 'string') return undefined
  const clean = normalizeText(text).slice(0, MAX_CONNECTOR_LABEL_LENGTH).replace(/\s+$/, '')
  return clean.trim().length === 0 ? undefined : clean
}

/** A saved label size as kept: finite, clamped to the Desktop text size range, and undefined when invalid or equal to the default. */
export function cleanConnectorLabelFontSize(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const clamped = Math.max(TEXT_FONT_SIZES_DESKTOP[0], Math.min(TEXT_FONT_SIZES_DESKTOP[TEXT_FONT_SIZES_DESKTOP.length - 1], value))
  return clamped === CONNECTOR_LABEL_FONT_SIZE ? undefined : clamped
}

/** A saved label position as kept: finite, clamped to 0.05..0.95, undefined when invalid or the default middle. */
export function cleanConnectorLabelPosition(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const clamped = Math.max(CONNECTOR_LABEL_MIN_POSITION, Math.min(CONNECTOR_LABEL_MAX_POSITION, value))
  return clamped === CONNECTOR_LABEL_DEFAULT_POSITION ? undefined : clamped
}

/** Where along its path (0..1 of the length) a connector's label sits. */
export function connectorLabelPosition(connector: { labelPosition?: number }): number {
  return cleanConnectorLabelPosition(connector.labelPosition) ?? CONNECTOR_LABEL_DEFAULT_POSITION
}

/** The point on the connector's drawn path the label is centred on (`connector` should be the routed copy). */
export function connectorLabelCentre(connector: ConnectorObject): { x: number; y: number } {
  const path = connectorPoints(connector)
  const position = connectorLabelPosition(connector)
  return position === CONNECTOR_LABEL_DEFAULT_POSITION ? pathMidpoint(path) : pointAtPathFraction(path, position)
}

/** The size a connector's label is drawn at. */
export function connectorLabelFontSize(connector: { labelFontSize?: number }): number {
  return cleanConnectorLabelFontSize(connector.labelFontSize) ?? CONNECTOR_LABEL_FONT_SIZE
}

export type ConnectorLabelLayout = {
  lines: string[]
  fontSize: number
  /** The point of the connector's drawn path the label sits on (the middle unless `labelPosition` is set). */
  centre: { x: number; y: number }
  /** The padded rectangle that hides the line behind the text. */
  box: { x: number; y: number; width: number; height: number }
  /** Left edge of each line (lines are centred on the middle) and its baseline y. */
  lineX: number[]
  baselines: number[]
}

/** Where a connector's label goes, or null when it has none. `connector` should be the routed copy so an elbow uses its drawn path. */
export function connectorLabelLayout(connector: ConnectorObject, measure?: TextMeasure): ConnectorLabelLayout | null {
  const text = cleanConnectorLabel(connector.label)
  if (text === undefined) return null
  const fontSize = connectorLabelFontSize(connector)
  const lines = splitTextLines(text)
  const size = measureTextSize(text, fontSize, measure)
  const centre = connectorLabelCentre(connector)
  const top = centre.y - size.height / 2
  const lineWidth = (line: string) => (measure ? measure(line) : measureTextSize(line, fontSize).width)
  return {
    lines,
    fontSize,
    centre: { x: centre.x, y: centre.y },
    box: { x: centre.x - size.width / 2 - CONNECTOR_LABEL_PADDING, y: top - CONNECTOR_LABEL_PADDING, width: size.width + CONNECTOR_LABEL_PADDING * 2, height: size.height + CONNECTOR_LABEL_PADDING * 2 },
    lineX: lines.map((line) => centre.x - lineWidth(line) / 2),
    baselines: getTextBaselines(text, fontSize).map((b) => top + b),
  }
}

/** Whether `point` is on the connector's label pad (the label can be clicked to select its connector). */
export function pointOnConnectorLabel(connector: ConnectorObject, point: { x: number; y: number }, measure?: TextMeasure, slop = 0): boolean {
  const layout = connectorLabelLayout(connector, measure)
  if (!layout) return false
  const { box } = layout
  return point.x >= box.x - slop && point.x <= box.x + box.width + slop && point.y >= box.y - slop && point.y <= box.y + box.height + slop
}

/** The items with one connector's label set (empty or blank removes it). Returns the same array when nothing changes. */
export function setConnectorLabel(items: CanvasItem[], connectorId: number, text: string): CanvasItem[] {
  const label = cleanConnectorLabel(text)
  let changed = false
  const next = items.map((item) => {
    if (item.kind !== 'connector' || item.id !== connectorId || item.label === label) return item
    changed = true
    const { label: _old, ...rest } = item
    // A removed label takes its size and position with it (a new label starts at the default size, in the middle).
    if (label === undefined) { const { labelFontSize: _size, labelPosition: _position, ...bare } = rest; return bare }
    return { ...rest, label }
  })
  return changed ? next : items
}

/** The items with one connector's label size set (the default size removes the field). Returns the same array when nothing changes. */
export function setConnectorLabelFontSize(items: CanvasItem[], connectorId: number, size: number): CanvasItem[] {
  const next = cleanConnectorLabelFontSize(size)
  let changed = false
  const result = items.map((item) => {
    if (item.kind !== 'connector' || item.id !== connectorId || item.labelFontSize === next) return item
    changed = true
    const { labelFontSize: _old, ...rest } = item
    return next === undefined ? rest : { ...rest, labelFontSize: next }
  })
  return changed ? result : items
}

/** The items with one connector's label position set (the middle removes the field; clamped to 0.05..0.95). Returns the same array when nothing changes. */
export function setConnectorLabelPosition(items: CanvasItem[], connectorId: number, position: number): CanvasItem[] {
  const next = cleanConnectorLabelPosition(position)
  let changed = false
  const result = items.map((item) => {
    if (item.kind !== 'connector' || item.id !== connectorId || item.labelPosition === next) return item
    changed = true
    const { labelPosition: _old, routedPath: _path, ...rest } = item
    return next === undefined ? rest : { ...rest, labelPosition: next }
  })
  return changed ? result : items
}

/** The label position that puts the label's centre nearest `point`, shifted by `from`..`to` movement: the drag keeps the grab offset (no jump at the start). */
export function labelPositionForDrag(connector: ConnectorObject, from: { x: number; y: number }, to: { x: number; y: number }, startPosition: number): number {
  const path = connectorPoints(connector)
  const moved = startPosition + pathFractionNearest(path, to) - pathFractionNearest(path, from)
  return Math.max(CONNECTOR_LABEL_MIN_POSITION, Math.min(CONNECTOR_LABEL_MAX_POSITION, moved))
}
