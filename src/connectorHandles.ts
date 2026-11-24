import { bendableMiddle, routeConnectors } from './connectorRoute'
import { connectorLabelLayout } from './connectorLabel'
import { pathLength, pathMidpoint, pointAlongPath } from './pathGeometry'
import type { TextMeasure } from './textLayout'
import { MAX_CONNECTOR_BEND, canvasItemKey, connectorPoints, snapConnectorEndpoint, updateConnectorRouting, type CanvasItem, type ConnectorObject, type Point, type SnappedConnectorEndpoint } from './canvasModel'

/** Excalidraw-style handles of one selected connector: a dot on each end and a smaller one in the middle of the drawn path. */
export type ConnectorHandleKind = 'start' | 'end' | 'middle'
export type ConnectorHandles = { start: Point; end: Point; middle: Point }

/** Hit radius in screen pixels: a mouse is precise, pen and touch get a larger target. */
export const CONNECTOR_HANDLE_RADIUS_MOUSE_PX = 9
export const CONNECTOR_HANDLE_RADIUS_TOUCH_PX = 16
/** A press on the middle dot that moves less than this many screen pixels is a click. */
export const CONNECTOR_CLICK_SLOP_PX = 5

export function connectorHandleRadiusPx(pointerType: string): number {
  return pointerType === 'mouse' ? CONNECTOR_HANDLE_RADIUS_MOUSE_PX : CONNECTOR_HANDLE_RADIUS_TOUCH_PX
}

export { pathMidpoint }

/** Space (canvas units) kept between the middle dot and the label pad. */
export const MIDDLE_DOT_LABEL_GAP = 12

/**
 * Where the middle dot sits: the middle of the drawn path, or for an elbow with a movable middle segment the middle of that segment.
 * With a label the dot moves along the path to just past the label pad (the label stays on the path middle), so both can be clicked.
 */
export function connectorMiddleDot(connector: ConnectorObject, measure?: TextMeasure): Point {
  const path = connectorPoints(connector)
  const movable = connector.routing === 'elbow' ? bendableMiddle(path) : null
  let at = path.length ? pathMidpoint(path) : { x: 0, y: 0, pressure: 1 }
  let arc = pathLength(path) / 2
  if (movable) {
    arc = pathLength(path.slice(0, movable.index + 1)) + Math.hypot(path[movable.index + 1].x - path[movable.index].x, path[movable.index + 1].y - path[movable.index].y) / 2
    at = pointAlongPath(path, arc).point
  }
  const layout = connectorLabelLayout(connector, measure)
  if (!layout) return at
  const { box } = layout
  const inside = (p: Point) => p.x > box.x - MIDDLE_DOT_LABEL_GAP && p.x < box.x + box.width + MIDDLE_DOT_LABEL_GAP && p.y > box.y - MIDDLE_DOT_LABEL_GAP && p.y < box.y + box.height + MIDDLE_DOT_LABEL_GAP
  if (!inside(at)) return at
  // Walk along the path (past the middle, or before it when the end is too close) until the dot is clear of the pad.
  const total = pathLength(path)
  for (const sign of [1, -1]) {
    for (let step = 2; step <= total; step += 2) {
      const candidate = pointAlongPath(path, arc + sign * step).point
      if (arc + sign * step < 0 || arc + sign * step > total) break
      if (!inside(candidate)) return candidate
    }
  }
  return at
}

/** Handle positions of a connector. Pass the routed copy (routeConnectors) so an elbow connector uses its routed path. */
export function connectorHandlePositions(connector: ConnectorObject, measure?: TextMeasure): ConnectorHandles {
  return { start: connector.start, end: connector.end, middle: connectorMiddleDot(connector, measure) }
}

/** A locked connector shows no handles (there is no saved lock flag today; one is honoured if it is added). */
export function connectorHandlesAvailable(item: CanvasItem | undefined): item is ConnectorObject {
  return !!item && item.kind === 'connector' && !(item as { locked?: boolean }).locked
}

/** The connector that has handles: the only selected item, when it is an unlocked connector (`items` should be routed). */
export function soleSelectedConnector(items: readonly CanvasItem[], keys: ReadonlySet<string>): ConnectorObject | null {
  if (keys.size !== 1) return null
  const key = [...keys][0]
  if (!key.startsWith('connector:')) return null
  const item = items.find((candidate) => canvasItemKey(candidate) === key)
  return connectorHandlesAvailable(item) ? item : null
}

/** Which handle is under `point`, or null. The ends win over the middle where they overlap. */
export function hitConnectorHandle(connector: ConnectorObject, point: Point, scale: number, pointerType = 'mouse'): ConnectorHandleKind | null {
  const radius = connectorHandleRadiusPx(pointerType) / scale
  const handles = connectorHandlePositions(connector)
  const distance = (p: Point) => Math.hypot(point.x - p.x, point.y - p.y)
  const dEnd = distance(handles.end)
  const dStart = distance(handles.start)
  if (dEnd <= radius || dStart <= radius) return dEnd <= dStart ? 'end' : 'start'
  return distance(handles.middle) <= radius ? 'middle' : null
}

/** Where an end dragged to `point` lands: on the outline of the box under it (or within `tolerance` of it), else null (free). */
export function snapEndpointTarget(point: Point, items: CanvasItem[], tolerance = 0, withinBounds: (p: Point) => boolean = () => true): SnappedConnectorEndpoint | null {
  const snapped = snapConnectorEndpoint(point, items, tolerance, true)
  return snapped && withinBounds(snapped.point) ? snapped : null
}

/**
 * The items with one end of a connector moved. With `snapped` the end sits on the box outline and is attached to it;
 * without, it is free at `point` and that end's attachment is removed. The other end and other items are untouched.
 */
export function moveConnectorEndpoint(items: CanvasItem[], connectorId: number, which: 'start' | 'end', point: Point, snapped: SnappedConnectorEndpoint | null): CanvasItem[] {
  return items.map((item) => {
    if (item.kind !== 'connector' || item.id !== connectorId) return item
    const { routedPath: _path, startAttachment, endAttachment, ...rest } = item
    const position = snapped ? { ...snapped.point } : { x: point.x, y: point.y, pressure: point.pressure }
    const result: ConnectorObject = { ...rest, [which]: position }
    const keptStart = which === 'start' ? (snapped ? { ...snapped.attachment } : undefined) : startAttachment
    const keptEnd = which === 'end' ? (snapped ? { ...snapped.attachment } : undefined) : endAttachment
    if (keptStart) result.startAttachment = keptStart
    if (keptEnd) result.endAttachment = keptEnd
    return result
  })
}

/** A click on the middle dot: straight becomes elbow and elbow becomes straight. */
export function toggleConnectorRouting(items: CanvasItem[], connectorId: number): CanvasItem[] {
  const connector = items.find((item): item is ConnectorObject => item.kind === 'connector' && item.id === connectorId)
  if (!connector) return items
  return updateConnectorRouting(items, connectorId, connector.routing === 'elbow' ? 'straight' : 'elbow')
}

/** The items with one connector's elbow bend set (clamped; 0 or not finite removes it). Same array when nothing changes. */
export function setConnectorBend(items: CanvasItem[], connectorId: number, bend: number): CanvasItem[] {
  const clean = Number.isFinite(bend) && bend !== 0 ? Math.max(-MAX_CONNECTOR_BEND, Math.min(MAX_CONNECTOR_BEND, bend)) : 0
  let changed = false
  const next = items.map((item) => {
    if (item.kind !== 'connector' || item.id !== connectorId || (item.bend ?? 0) === clean) return item
    changed = true
    const { bend: _old, routedPath: _path, ...rest } = item
    return clean === 0 ? rest : { ...rest, bend: clean }
  })
  return changed ? next : items
}

/**
 * The bend that puts the middle segment of an elbow connector under `point`: the pointer's offset, across the segment, from where
 * the route would put it with no bend. Null when the connector is not an elbow with a movable middle segment (straight, L, C).
 */
export function bendForPointer(items: CanvasItem[], connectorId: number, point: Point): number | null {
  const offset = bendOffset(items, connectorId, point)
  return offset === null ? null : Math.max(-MAX_CONNECTOR_BEND, Math.min(MAX_CONNECTOR_BEND, offset))
}

/**
 * Bend while dragging: the starting bend plus the pointer's movement from `from` along the middle segment's perpendicular axis, so the
 * segment never jumps at drag start (the dot is not always on the segment). Null when the connector has no movable middle segment.
 */
export function bendForDrag(items: CanvasItem[], connectorId: number, from: Point, to: Point, startBend: number): number | null {
  const a = bendOffset(items, connectorId, from)
  const b = bendOffset(items, connectorId, to)
  if (a === null || b === null) return null
  return Math.max(-MAX_CONNECTOR_BEND, Math.min(MAX_CONNECTOR_BEND, startBend + b - a))
}

function bendOffset(items: CanvasItem[], connectorId: number, point: Point): number | null {
  const routed = routeConnectors(setConnectorBend(items, connectorId, 0)).find((item): item is ConnectorObject => item.kind === 'connector' && item.id === connectorId)
  if (!routed || routed.routing !== 'elbow') return null
  const path = connectorPoints(routed)
  const middle = bendableMiddle(path)
  if (!middle) return null
  return middle.axis === 'x' ? point.x - path[middle.index].x : point.y - path[middle.index].y
}
