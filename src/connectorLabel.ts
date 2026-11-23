import { connectorPoints, type CanvasItem, type ConnectorObject } from './canvasModel'
import { pathMidpoint } from './connectorHandles'
import { getTextBaselines, measureTextSize, normalizeText, splitTextLines, type TextMeasure } from './textLayout'

/** Connector labels are one fixed size (canvas units), in the app's default label font, in the connector's colour. */
export const CONNECTOR_LABEL_FONT_SIZE = 18
export const CONNECTOR_LABEL_PADDING = 4
export const MAX_CONNECTOR_LABEL_LENGTH = 500

/** The label as saved: line endings normalised, trailing whitespace trimmed, capped. Empty means no label (undefined). */
export function cleanConnectorLabel(text: unknown): string | undefined {
  if (typeof text !== 'string') return undefined
  const clean = normalizeText(text).slice(0, MAX_CONNECTOR_LABEL_LENGTH).replace(/\s+$/, '')
  return clean.trim().length === 0 ? undefined : clean
}

export type ConnectorLabelLayout = {
  lines: string[]
  fontSize: number
  /** Middle of the connector's drawn path. */
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
  const fontSize = CONNECTOR_LABEL_FONT_SIZE
  const lines = splitTextLines(text)
  const size = measureTextSize(text, fontSize, measure)
  const centre = pathMidpoint(connectorPoints(connector))
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
    return label === undefined ? rest : { ...rest, label }
  })
  return changed ? next : items
}
