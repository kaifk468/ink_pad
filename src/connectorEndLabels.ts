import { canvasItemKey, connectorPoints, connectorSecondEndpoint, getConnectorRenderSpec, getConnectorSymbolGeometry, getCanvasSelectionBounds, type CanvasItem, type ConnectorObject } from './canvasModel'
import { pathLength, pointAlongPath } from './pathGeometry'
import { connectorLabelFontSize } from './connectorLabel'
import { DEFAULT_TEXT_FONT, getCachedTextMeasure, measureTextSize, type TextMeasure } from './textLayout'

export const MAX_CONNECTOR_END_LABEL_LENGTH = 24
/** Distance of the text from the end point along the path, and sideways from the line (canvas units). */
export const END_LABEL_ALONG = 14
export const END_LABEL_SIDE = 10
export const END_LABEL_SCALE = 0.85
export const END_LABEL_MIN_FONT_SIZE = 10
/** Gap between the far point of a UML symbol and the near edge of the end label. */
export const END_LABEL_SYMBOL_GAP = 4

/** How far along the path from the end the UML symbol at that end reaches (0 when that end has none). */
function symbolReach(connector: ConnectorObject, end: ConnectorEnd): number {
  if (getConnectorRenderSpec(connector).endpoint !== end && connectorSecondEndpoint(connector) !== end) return 0
  const geometry = getConnectorSymbolGeometry(connector, undefined, end)
  if (!geometry) return 0
  const spec = getConnectorRenderSpec(connector)
  const point = spec.symbol.includes('diamond') ? geometry.far : geometry.base
  return Math.hypot(point.x - geometry.tip.x, point.y - geometry.tip.y)
}

export type ConnectorEnd = 'start' | 'end'

/** An end label as saved: single line, trimmed, capped at 24 characters. Empty or not a string means none (undefined). */
export function cleanConnectorEndLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const clean = value.replace(/\s+/g, ' ').trim().slice(0, MAX_CONNECTOR_END_LABEL_LENGTH).trim()
  return clean.length === 0 ? undefined : clean
}

/** The size end labels are drawn at: a bit smaller than the connector's own label. */
export function connectorEndLabelFontSize(connector: { labelFontSize?: number }): number {
  return Math.max(END_LABEL_MIN_FONT_SIZE, Math.round(connectorLabelFontSize(connector) * END_LABEL_SCALE * 10) / 10)
}

export type ConnectorEndLabelLayout = { end: ConnectorEnd; text: string; fontSize: number; x: number; y: number; width: number; height: number; baseline: number }

/**
 * Where each end label goes (`connector` should be the routed copy). The text box sits `END_LABEL_ALONG` from the end point along the path and
 * beside the line (`END_LABEL_SIDE`), on the upper / right side so both ends of a line read the same way.
 */
/** Signs (+1 / -1) of the quarter-plane a diagonal attached end leaves into, or null when the line leaves nearly straight (no ambiguity about the side). */
function endLabelQuadrant(away: { x: number; y: number }): { x: number; y: number } | null {
  if (Math.abs(away.x) < 0.15 || Math.abs(away.y) < 0.15) return null
  return { x: Math.sign(away.x), y: Math.sign(away.y) }
}

export function connectorEndLabelLayouts(connector: ConnectorObject, measure?: TextMeasure): ConnectorEndLabelLayout[] {
  const out: ConnectorEndLabelLayout[] = []
  if (connector.startLabel === undefined && connector.endLabel === undefined) return out
  const path = connectorPoints(connector)
  const total = pathLength(path)
  const fontSize = connectorEndLabelFontSize(connector)
  for (const end of ['start', 'end'] as const) {
    const text = cleanConnectorEndLabel(end === 'start' ? connector.startLabel : connector.endLabel)
    if (text === undefined) continue
    const size = measureTextSize(text, fontSize, measure)
    const base = Math.min(END_LABEL_ALONG, total / 2)
    const dir0 = pointAlongPath(path, end === 'start' ? base : total - base).direction
    // Wide labels are pushed further along the line so their near edge stays 4 units outside the box (never over its border).
    const extent = Math.abs(dir0.x) * size.width + Math.abs(dir0.y) * size.height
    let along = base + Math.max(0, extent / 2 - END_LABEL_ALONG + 4)
    // A UML symbol at this end (diamond, triangle, open arrowhead) would cover the text, so the label starts beyond it.
    const reach = symbolReach(connector, end)
    if (reach > 0) along = Math.max(along, reach + END_LABEL_SYMBOL_GAP + extent / 2)
    along = Math.min(along, total / 2)
    const { point, direction } = pointAlongPath(path, end === 'start' ? along : total - along)
    // Direction pointing away from the end, into the line.
    const away = end === 'start' ? direction : { x: -direction.x, y: -direction.y }
    let normal = { x: -away.y, y: away.x }
    if (normal.y > 1e-9 || (Math.abs(normal.y) <= 1e-9 && normal.x < 0)) normal = { x: -normal.x, y: -normal.y }
    let cx = point.x + normal.x * (END_LABEL_SIDE + size.width / 2)
    let cy = point.y + normal.y * (END_LABEL_SIDE + size.height / 2)
    const attached = end === 'start' ? connector.startAttachment : connector.endAttachment
    const quadrant = attached ? endLabelQuadrant(away) : null
    if (quadrant) {
      // A diagonal line into a box: the box lies behind the side it leaves, which is either the horizontal or the vertical
      // side through the end point. The quarter-plane beyond both is outside the box either way, so the label goes there.
      const endPoint = end === 'start' ? path[0] : path[path.length - 1]
      if (normal.x * quadrant.x + normal.y * quadrant.y < 0) normal = { x: -normal.x, y: -normal.y }
      const place = (distance: number) => {
        const at = pointAlongPath(path, end === 'start' ? distance : total - distance).point
        return { x: at.x + normal.x * (END_LABEL_SIDE + size.width / 2), y: at.y + normal.y * (END_LABEL_SIDE + size.height / 2) }
      }
      const inside = (c: { x: number; y: number }) => quadrant.x * (c.x - endPoint.x) - size.width / 2 >= 2 && quadrant.y * (c.y - endPoint.y) - size.height / 2 >= 2
      let distance = along
      let centre = place(distance)
      while (!inside(centre) && distance < total / 2) {
        distance = Math.min(total / 2, distance + 2)
        centre = place(distance)
      }
      cx = centre.x
      cy = centre.y
    }
    out.push({ end, text, fontSize, x: cx - size.width / 2, y: cy - size.height / 2, width: size.width, height: size.height, baseline: cy + fontSize * 0.35 })
  }
  return out
}

/** The items with one end label of a connector set (blank removes it). Returns the same array when nothing changes. */
export function setConnectorEndLabel(items: CanvasItem[], connectorId: number, end: ConnectorEnd, text: string): CanvasItem[] {
  const label = cleanConnectorEndLabel(text)
  let changed = false
  const next = items.map((item) => {
    if (item.kind !== 'connector' || item.id !== connectorId || item.locked) return item
    if ((end === 'start' ? item.startLabel : item.endLabel) === label) return item
    changed = true
    if (end === 'start') {
      const { startLabel: _old, ...rest } = item
      return label === undefined ? rest : { ...rest, startLabel: label }
    }
    const { endLabel: _old, ...rest } = item
    return label === undefined ? rest : { ...rest, endLabel: label }
  })
  return changed ? next : items
}

/** The end labels of the one selected connector, or null unless exactly one connector is selected. */
export function selectedConnectorEndLabels(items: readonly CanvasItem[], keys: ReadonlySet<string>): { id: number; startLabel: string; endLabel: string } | null {
  if (keys.size !== 1) return null
  const found = items.find((item): item is ConnectorObject => item.kind === 'connector' && keys.has(canvasItemKey(item)))
  return found ? { id: found.id, startLabel: found.startLabel ?? '', endLabel: found.endLabel ?? '' } : null
}

/**
 * Selection bounds that also cover the end labels of the selected connectors (`items` should be routed). Lives here, not in canvasModel,
 * because the label layout imports canvasModel. Used by zoom-to-selection and fit-after-insert so labels are never cut off.
 */
export function selectionBoundsWithEndLabels(items: CanvasItem[], keys: ReadonlySet<string>): { x: number; y: number; width: number; height: number } | null {
  const base = getCanvasSelectionBounds(items, keys)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const item of items) {
    if (item.kind !== 'connector' || !keys.has(canvasItemKey(item))) continue
    for (const label of connectorEndLabelLayouts(item, getCachedTextMeasure(connectorEndLabelFontSize(item), DEFAULT_TEXT_FONT))) {
      minX = Math.min(minX, label.x); minY = Math.min(minY, label.y); maxX = Math.max(maxX, label.x + label.width); maxY = Math.max(maxY, label.y + label.height)
    }
  }
  if (!Number.isFinite(minX)) return base
  if (!base) return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  const x = Math.min(base.x, minX), y = Math.min(base.y, minY)
  return { x, y, width: Math.max(base.x + base.width, maxX) - x, height: Math.max(base.y + base.height, maxY) - y }
}
