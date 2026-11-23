import { canvasItemKey, connectorPoints, snapConnectorEndpoint, updateConnectorRouting, type CanvasItem, type ConnectorObject, type Point, type SnappedConnectorEndpoint } from './canvasModel'

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

/** The point halfway along a path, measured along its length. */
export function pathMidpoint(path: Point[]): Point {
  if (path.length === 0) return { x: 0, y: 0, pressure: 1 }
  let total = 0
  for (let i = 1; i < path.length; i += 1) total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
  if (total === 0) return { ...path[0] }
  let remaining = total / 2
  for (let i = 1; i < path.length; i += 1) {
    const length = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
    if (remaining <= length && length > 0) {
      const t = remaining / length
      return { x: path[i - 1].x + (path[i].x - path[i - 1].x) * t, y: path[i - 1].y + (path[i].y - path[i - 1].y) * t, pressure: 1 }
    }
    remaining -= length
  }
  return { ...path[path.length - 1] }
}

/** Handle positions of a connector. Pass the routed copy (routeConnectors) so an elbow connector uses its routed path. */
export function connectorHandlePositions(connector: ConnectorObject): ConnectorHandles {
  return { start: connector.start, end: connector.end, middle: pathMidpoint(connectorPoints(connector)) }
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
