export type Point = { x: number; y: number; pressure: number }
export type Stroke = { kind: 'stroke'; id: number; points: Point[]; color: string; width: number; erase: boolean; shape?: 'arrow' | 'line' }
/** Ink class box: three bands (name, variables, methods) divided at the canvas heights `top` and `mid`, holding its own pen strokes (canvas coordinates). */
export type InkBoxContent = { top: number; mid: number; ink: Stroke[] }
export type ClassBoxContent = { name: string; attributes: string; methods: string }
/** HLD shape kinds: Database (cylinder), Queue, Service. A rectangle with one of these is an ink box drawn as that shape. */
export const HLD_SHAPES = ['database', 'queue', 'service'] as const
export type HldShape = (typeof HLD_SHAPES)[number]
export type RectangleObject = { kind: 'rectangle'; id: number; x: number; y: number; width: number; height: number; strokeColor: string; strokeWidth: number; classBox?: ClassBoxContent; inkBox?: InkBoxContent; hldShape?: HldShape; ellipse?: true }
export type TextObject = { kind: 'text'; id: number; x: number; y: number; width: number; height: number; text: string; fontSize: number; color: string }
export type RectangleResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type RectangleBounds = Pick<RectangleObject, 'x' | 'y' | 'width' | 'height'>
export type ConnectorRouting = 'straight' | 'elbow'
export type ConnectorAttachment = { rectangleId: number; offsetX: number; offsetY: number }
export type ConnectorRelationshipType = 'association' | 'directed-association' | 'inheritance' | 'realization' | 'dependency' | 'aggregation' | 'composition'
export type ConnectorObject = {
  kind: 'connector'
  id: number
  start: Point
  end: Point
  strokeColor: string
  strokeWidth: number
  relationshipType: ConnectorRelationshipType
  reversed: boolean
  startAttachment?: ConnectorAttachment
  endAttachment?: ConnectorAttachment
  /** Line shape: straight (default when missing) or elbow (right angles). Saved. */
  routing?: ConnectorRouting
  /** The right-angle path worked out for an elbow connector. Derived while drawing, never saved: only on copies made by routeConnectors. */
  routedPath?: Point[]
}
export type CanvasItem = Stroke | RectangleObject | ConnectorObject | TextObject
export const CONNECTOR_SNAP_TOLERANCE = 36

export function createConnector(
  id: number,
  start: Point,
  end: Point,
  strokeColor: string,
  strokeWidth: number,
  startAttachment?: ConnectorAttachment,
  endAttachment?: ConnectorAttachment,
  relationshipType: ConnectorRelationshipType = 'association',
  reversed = false,
): ConnectorObject {
  return {
    kind: 'connector',
    id,
    start: { ...start },
    end: { ...end },
    strokeColor,
    strokeWidth,
    relationshipType,
    reversed,
    ...(startAttachment ? { startAttachment: { ...startAttachment } } : {}),
    ...(endAttachment ? { endAttachment: { ...endAttachment } } : {}),
  }
}

export type ConnectorRenderSpec = {
  lineStyle: 'solid' | 'dashed'
  symbol: 'none' | 'hollow-triangle' | 'open-arrow' | 'hollow-diamond' | 'filled-diamond'
  endpoint: 'start' | 'end' | null
}

export function getConnectorRenderSpec(connector: ConnectorObject): ConnectorRenderSpec {
  switch (connector.relationshipType) {
    case 'directed-association':
      return { lineStyle: 'solid', symbol: 'open-arrow', endpoint: connector.reversed ? 'start' : 'end' }
    case 'inheritance':
      return { lineStyle: 'solid', symbol: 'hollow-triangle', endpoint: connector.reversed ? 'start' : 'end' }
    case 'realization':
      return { lineStyle: 'dashed', symbol: 'hollow-triangle', endpoint: connector.reversed ? 'start' : 'end' }
    case 'dependency':
      return { lineStyle: 'dashed', symbol: 'open-arrow', endpoint: connector.reversed ? 'start' : 'end' }
    case 'aggregation':
      return { lineStyle: 'solid', symbol: 'hollow-diamond', endpoint: connector.reversed ? 'end' : 'start' }
    case 'composition':
      return { lineStyle: 'solid', symbol: 'filled-diamond', endpoint: connector.reversed ? 'end' : 'start' }
    default:
      return { lineStyle: 'solid', symbol: 'none', endpoint: null }
  }
}

export type ConnectorSymbolGeometry = {
  tip: Point
  other: Point
  towardOther: Point
  base: Point
  sideA: Point
  sideB: Point
  far: Point
}

/** The points a connector is drawn through: its routed path when it has one, otherwise the straight line from start to end. */
export function connectorPoints(connector: ConnectorObject): Point[] {
  return connector.routedPath && connector.routedPath.length >= 2 ? connector.routedPath : [connector.start, connector.end]
}

export function getConnectorSymbolGeometry(connector: ConnectorObject, width = connector.strokeWidth): ConnectorSymbolGeometry | null {
  const spec = getConnectorRenderSpec(connector)
  if (!spec.endpoint || spec.symbol === 'none') return null
  const path = connectorPoints(connector)
  const atStart = spec.endpoint === 'start'
  const tip = atStart ? path[0] : path[path.length - 1]
  const neighbour = atStart ? path[1] : path[path.length - 2]
  const other = atStart ? path[path.length - 1] : path[0]
  // The symbol sits on the last straight piece of the line at that end, so on a bent line it follows the bend.
  const dx = neighbour.x - tip.x
  const dy = neighbour.y - tip.y
  const length = Math.hypot(dx, dy)
  if (!length) return null
  const towardOther = { x: dx / length, y: dy / length, pressure: tip.pressure }
  const normal = { x: -towardOther.y, y: towardOther.x }
  const symbolLength = Math.min(Math.max(12, width * 4), length * (spec.symbol.includes('diamond') ? 0.23 : 0.42))
  const halfWidth = symbolLength * 0.52
  const base = { x: tip.x + towardOther.x * symbolLength, y: tip.y + towardOther.y * symbolLength, pressure: tip.pressure }
  return {
    tip,
    other,
    towardOther,
    base,
    sideA: { x: base.x + normal.x * halfWidth, y: base.y + normal.y * halfWidth, pressure: tip.pressure },
    sideB: { x: base.x - normal.x * halfWidth, y: base.y - normal.y * halfWidth, pressure: tip.pressure },
    far: { x: tip.x + towardOther.x * symbolLength * 2, y: tip.y + towardOther.y * symbolLength * 2, pressure: tip.pressure },
  }
}

export function canvasItemsForRendering(items: CanvasItem[]): CanvasItem[] {
  const rectangles = new Map(items
    .filter((item): item is RectangleObject => item.kind === 'rectangle')
    .map((rectangle) => [rectangle.id, rectangle]))
  const renderItems: CanvasItem[] = []
  // The stroke eraser only cuts ink: connectors are drawn again after each run of eraser strokes, so it never leaves a gap in one.
  const connectorsSoFar: ConnectorObject[] = []
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    renderItems.push(item)
    if (item.kind === 'stroke' && item.erase) {
      const next = items[index + 1]
      if (!(next && next.kind === 'stroke' && next.erase)) renderItems.push(...connectorsSoFar)
      continue
    }
    if (item.kind !== 'connector') continue
    connectorsSoFar.push(item)
    const attachedRectangleIds = new Set([item.startAttachment?.rectangleId, item.endAttachment?.rectangleId])
    for (const rectangleId of attachedRectangleIds) {
      const rectangle = rectangleId === undefined ? undefined : rectangles.get(rectangleId)
      if (rectangle) renderItems.push(rectangle)
    }
  }
  return renderItems
}

/**
 * The tail of canvasItemsForRendering(items) that belongs to the last item: the item itself and, for a connector, the
 * rectangles it is attached to (drawn again so the boxes sit above the connector ends). Lets a saved picture of the
 * earlier items be brought up to date by drawing only these.
 */
export function appendedItemsForRendering(items: CanvasItem[]): CanvasItem[] {
  const last = items[items.length - 1]
  if (!last) return []
  if (last.kind === 'stroke' && last.erase) return [last, ...items.filter((item): item is ConnectorObject => item.kind === 'connector')]
  if (last.kind !== 'connector') return [last]
  const result: CanvasItem[] = [last]
  for (const rectangleId of new Set([last.startAttachment?.rectangleId, last.endAttachment?.rectangleId])) {
    if (rectangleId === undefined) continue
    let rectangle: RectangleObject | undefined
    for (const item of items) if (item.kind === 'rectangle' && item.id === rectangleId) rectangle = item
    if (rectangle) result.push(rectangle)
  }
  return result
}

export function updateConnectorRelationship(items: CanvasItem[], connectorId: number, relationshipType: ConnectorRelationshipType): CanvasItem[] {
  return items.map((item) => item.kind === 'connector' && item.id === connectorId && item.relationshipType !== relationshipType
    ? { ...item, relationshipType, reversed: relationshipType === 'association' ? false : item.reversed }
    : item)
}

export function updateConnectorRouting(items: CanvasItem[], connectorId: number, routing: ConnectorRouting): CanvasItem[] {
  return items.map((item) => {
    if (item.kind !== 'connector' || item.id !== connectorId || (item.routing ?? 'straight') === routing) return item
    const { routing: _old, routedPath: _path, ...rest } = item
    return routing === 'elbow' ? { ...rest, routing } : rest
  })
}

export function reverseConnectorDirection(items: CanvasItem[], connectorId: number): CanvasItem[] {
  return items.map((item) => item.kind === 'connector' && item.id === connectorId && item.relationshipType !== 'association'
    ? { ...item, reversed: !item.reversed }
    : item)
}

export type SnappedConnectorEndpoint = { point: Point; attachment: ConnectorAttachment }

function closestPointOnSegment(point: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
  return { x: a.x + t * dx, y: a.y + t * dy, pressure: point.pressure }
}

function nearestRectangleBoundaryPoint(rectangle: RectangleObject, point: Point): Point {
  const left = rectangle.x
  const right = rectangle.x + rectangle.width
  const top = rectangle.y
  const bottom = rectangle.y + rectangle.height
  const candidates = [
    closestPointOnSegment(point, { x: left, y: top, pressure: point.pressure }, { x: right, y: top, pressure: point.pressure }),
    closestPointOnSegment(point, { x: left, y: bottom, pressure: point.pressure }, { x: right, y: bottom, pressure: point.pressure }),
    closestPointOnSegment(point, { x: left, y: top, pressure: point.pressure }, { x: left, y: bottom, pressure: point.pressure }),
    closestPointOnSegment(point, { x: right, y: top, pressure: point.pressure }, { x: right, y: bottom, pressure: point.pressure }),
  ]
  return candidates.reduce((closest, candidate) => (
    Math.hypot(point.x - candidate.x, point.y - candidate.y) < Math.hypot(point.x - closest.x, point.y - closest.y)
      ? candidate
      : closest
  ))
}

export function snapConnectorEndpoint(
  point: Point,
  items: CanvasItem[],
  tolerance = CONNECTOR_SNAP_TOLERANCE,
): SnappedConnectorEndpoint | null {
  let closest: SnappedConnectorEndpoint | null = null
  let closestDistance = tolerance
  for (const item of items) {
    if (item.kind !== 'rectangle') continue
    const candidate = nearestRectangleBoundaryPoint(item, point)
    const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y)
    if (distance <= closestDistance) {
      closestDistance = distance
      closest = {
        point: candidate,
        attachment: { rectangleId: item.id, offsetX: candidate.x - item.x, offsetY: candidate.y - item.y },
      }
    }
  }
  return closest
}

export function canvasItemKey(item: CanvasItem): string {
  return `${item.kind}:${item.id}`
}

/** The keys of every item on the page (select all). */
export function allCanvasItemKeys(items: readonly CanvasItem[]): string[] {
  return items.map(canvasItemKey)
}

/**
 * The items left after deleting the ones whose keys are given. A connector attached to a deleted
 * rectangle stays, loose at that end (the same as erasing the rectangle with the object eraser).
 * Returns the same array when nothing matched.
 */
export function deleteCanvasItemsByKey(items: CanvasItem[], keys: ReadonlySet<string>): CanvasItem[] {
  if (keys.size === 0) return items
  const removedRectangles = new Set<number>()
  const kept: CanvasItem[] = []
  for (const item of items) {
    if (keys.has(canvasItemKey(item))) {
      if (item.kind === 'rectangle') removedRectangles.add(item.id)
    } else {
      kept.push(item)
    }
  }
  if (kept.length === items.length) return items
  return removedRectangles.size > 0 ? detachConnectorsFromRectangles(kept, removedRectangles) : kept
}

export function getRectangleResizeHandles(rectangle: RectangleBounds): Array<{ handle: RectangleResizeHandle; point: Point }> {
  const middleX = rectangle.x + rectangle.width / 2
  const middleY = rectangle.y + rectangle.height / 2
  const right = rectangle.x + rectangle.width
  const bottom = rectangle.y + rectangle.height
  return [
    { handle: 'nw', point: { x: rectangle.x, y: rectangle.y, pressure: 1 } },
    { handle: 'n', point: { x: middleX, y: rectangle.y, pressure: 1 } },
    { handle: 'ne', point: { x: right, y: rectangle.y, pressure: 1 } },
    { handle: 'e', point: { x: right, y: middleY, pressure: 1 } },
    { handle: 'se', point: { x: right, y: bottom, pressure: 1 } },
    { handle: 's', point: { x: middleX, y: bottom, pressure: 1 } },
    { handle: 'sw', point: { x: rectangle.x, y: bottom, pressure: 1 } },
    { handle: 'w', point: { x: rectangle.x, y: middleY, pressure: 1 } },
  ]
}

export function hitTestRectangleResizeHandle(rectangle: RectangleBounds, point: Point, tolerance = 14): RectangleResizeHandle | null {
  let closest: RectangleResizeHandle | null = null
  let closestDistance = tolerance
  for (const { handle, point: center } of getRectangleResizeHandles(rectangle)) {
    const distance = Math.hypot(point.x - center.x, point.y - center.y)
    if (distance <= closestDistance) {
      closest = handle
      closestDistance = distance
    }
  }
  return closest
}

export function getResizedRectangleBounds(
  rectangle: RectangleBounds,
  handle: RectangleResizeHandle,
  dx: number,
  dy: number,
  minimumSize = 32,
): RectangleBounds {
  let left = rectangle.x
  let right = rectangle.x + rectangle.width
  let top = rectangle.y
  let bottom = rectangle.y + rectangle.height
  if (handle.includes('w')) left = Math.min(right - minimumSize, rectangle.x + dx)
  if (handle.includes('e')) right = Math.max(left + minimumSize, rectangle.x + rectangle.width + dx)
  if (handle.includes('n')) top = Math.min(bottom - minimumSize, rectangle.y + dy)
  if (handle.includes('s')) bottom = Math.max(top + minimumSize, rectangle.y + rectangle.height + dy)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function resizeRectangleItems(items: CanvasItem[], rectangleId: number, bounds: RectangleBounds): CanvasItem[] {
  const original = items.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === rectangleId)
  if (!original || original.width <= 0 || original.height <= 0) return items
  let resized: RectangleObject
  if (original.inkBox) {
    // An ink class box scales as one picture: writing, dividers and pen width follow the box in proportion.
    const next = { x: bounds.x, y: bounds.y, width: Math.max(bounds.width, INK_BOX_MIN_WIDTH), height: Math.max(bounds.height, INK_BOX_MIN_HEIGHT) }
    const sx = next.width / original.width
    const sy = next.height / original.height
    resized = clampInkBoxDividers({
      ...original,
      ...next,
      inkBox: transformInkBox(original.inkBox, (x) => next.x + (x - original.x) * sx, (y) => next.y + (y - original.y) * sy, (sx + sy) / 2),
    })
  } else {
    resized = { ...original, ...bounds }
  }
  const scaleX = resized.width / original.width
  const scaleY = resized.height / original.height
  return items.map((item) => {
    if (item.kind === 'rectangle' && item.id === rectangleId) return resized
    if (item.kind !== 'connector') return item
    const resizeEndpoint = (point: Point, attachment?: ConnectorAttachment) => {
      if (!attachment || attachment.rectangleId !== rectangleId) return { point, attachment }
      const offsetX = attachment.offsetX * scaleX
      const offsetY = attachment.offsetY * scaleY
      return {
        point: { ...point, x: resized.x + offsetX, y: resized.y + offsetY },
        attachment: { ...attachment, offsetX, offsetY },
      }
    }
    const start = resizeEndpoint(item.start, item.startAttachment)
    const end = resizeEndpoint(item.end, item.endAttachment)
    if (start.point === item.start && end.point === item.end) return item
    return {
      ...item,
      start: start.point,
      end: end.point,
      ...(start.attachment ? { startAttachment: start.attachment } : {}),
      ...(end.attachment ? { endAttachment: end.attachment } : {}),
    }
  })
}

export function getCanvasSelectionBounds(items: CanvasItem[], selectedKeys: ReadonlySet<string>): RectangleBounds | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const include = (x: number, y: number, padding = 0) => {
    minX = Math.min(minX, x - padding)
    minY = Math.min(minY, y - padding)
    maxX = Math.max(maxX, x + padding)
    maxY = Math.max(maxY, y + padding)
  }
  for (const item of items) {
    if (!selectedKeys.has(canvasItemKey(item))) continue
    if (item.kind === 'rectangle') {
      include(item.x, item.y, item.strokeWidth / 2)
      include(item.x + item.width, item.y + item.height, item.strokeWidth / 2)
    } else if (item.kind === 'connector') {
      for (const p of connectorPoints(item)) include(p.x, p.y, item.strokeWidth / 2)
      const geometry = getConnectorSymbolGeometry(item)
      if (geometry) {
        include(geometry.sideA.x, geometry.sideA.y, item.strokeWidth / 2)
        include(geometry.sideB.x, geometry.sideB.y, item.strokeWidth / 2)
        include(geometry.far.x, geometry.far.y, item.strokeWidth / 2)
      }
    } else if (item.kind === 'text') {
      include(item.x, item.y)
      include(item.x + item.width, item.y + item.height)
    } else if (!item.erase) {
      for (const point of item.points) include(point.x, point.y, item.width / 2)
      if (item.shape === 'arrow' && item.points.length >= 2) {
        const [start, end] = item.points
        const angle = Math.atan2(end.y - start.y, end.x - start.x)
        const headLength = Math.max(12, item.width * 3.5)
        include(end.x - headLength * Math.cos(angle - Math.PI / 6), end.y - headLength * Math.sin(angle - Math.PI / 6), item.width / 2)
        include(end.x - headLength * Math.cos(angle + Math.PI / 6), end.y - headLength * Math.sin(angle + Math.PI / 6), item.width / 2)
      }
    }
  }
  if (!Number.isFinite(minX)) return null
  const minimumSize = 16
  if (maxX - minX < minimumSize) {
    const centerX = (minX + maxX) / 2
    minX = centerX - minimumSize / 2
    maxX = centerX + minimumSize / 2
  }
  if (maxY - minY < minimumSize) {
    const centerY = (minY + maxY) / 2
    minY = centerY - minimumSize / 2
    maxY = centerY + minimumSize / 2
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function resizeSelectedItems(items: CanvasItem[], selectedKeys: ReadonlySet<string>, bounds: RectangleBounds): CanvasItem[] {
  const originalBounds = getCanvasSelectionBounds(items, selectedKeys)
  if (!originalBounds) return items
  const scaleX = bounds.width / originalBounds.width
  const scaleY = bounds.height / originalBounds.height
  const strokeScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2
  const transformPoint = (point: Point): Point => ({
    ...point,
    x: bounds.x + (point.x - originalBounds.x) * scaleX,
    y: bounds.y + (point.y - originalBounds.y) * scaleY,
  })
  const selectedRectangles = new Map(items
    .filter((item): item is RectangleObject => item.kind === 'rectangle' && selectedKeys.has(canvasItemKey(item)))
    .map((rectangle) => [rectangle.id, {
      ...rectangle,
      x: bounds.x + (rectangle.x - originalBounds.x) * scaleX,
      y: bounds.y + (rectangle.y - originalBounds.y) * scaleY,
      width: rectangle.width * scaleX,
      height: rectangle.height * scaleY,
      strokeWidth: rectangle.strokeWidth * strokeScale,
      ...(rectangle.inkBox ? { inkBox: transformInkBox(rectangle.inkBox, (x) => bounds.x + (x - originalBounds.x) * scaleX, (y) => bounds.y + (y - originalBounds.y) * scaleY, strokeScale) } : {}),
    }]))
  const stationaryRectangles = new Map(items
    .filter((item): item is RectangleObject => item.kind === 'rectangle' && !selectedKeys.has(canvasItemKey(item)))
    .map((rectangle) => [rectangle.id, rectangle]))

  return items.map((item) => {
    const selected = selectedKeys.has(canvasItemKey(item))
    if (item.kind === 'rectangle') return selected ? selectedRectangles.get(item.id)! : item
    if (item.kind === 'text') {
      return selected
        ? {
          ...item,
          x: bounds.x + (item.x - originalBounds.x) * scaleX,
          y: bounds.y + (item.y - originalBounds.y) * scaleY,
          fontSize: item.fontSize * strokeScale,
          width: item.width * strokeScale,
          height: item.height * strokeScale,
        }
        : item
    }
    if (item.kind === 'stroke') {
      return selected
        ? { ...item, points: item.points.map(transformPoint), width: item.width * strokeScale }
        : item
    }

    const transformEndpoint = (point: Point, attachment?: ConnectorAttachment) => {
      const resizedRectangle = attachment ? selectedRectangles.get(attachment.rectangleId) : undefined
      if (resizedRectangle && attachment) {
        const originalRectangle = items.find((candidate): candidate is RectangleObject => candidate.kind === 'rectangle' && candidate.id === attachment.rectangleId)
        if (originalRectangle) {
          const offsetX = attachment.offsetX * (resizedRectangle.width / originalRectangle.width)
          const offsetY = attachment.offsetY * (resizedRectangle.height / originalRectangle.height)
          return {
            point: { ...point, x: resizedRectangle.x + offsetX, y: resizedRectangle.y + offsetY },
            attachment: { ...attachment, offsetX, offsetY },
          }
        }
      }
      if (selected) {
        const scaledPoint = transformPoint(point)
        const stationaryRectangle = attachment ? stationaryRectangles.get(attachment.rectangleId) : undefined
        if (attachment && stationaryRectangle) {
          const boundaryPoint = nearestRectangleBoundaryPoint(stationaryRectangle, scaledPoint)
          return {
            point: boundaryPoint,
            attachment: {
              rectangleId: stationaryRectangle.id,
              offsetX: boundaryPoint.x - stationaryRectangle.x,
              offsetY: boundaryPoint.y - stationaryRectangle.y,
            },
          }
        }
        return { point: scaledPoint, attachment: undefined }
      }
      return { point, attachment }
    }
    const startRectangleSelected = !!item.startAttachment && selectedRectangles.has(item.startAttachment.rectangleId)
    const endRectangleSelected = !!item.endAttachment && selectedRectangles.has(item.endAttachment.rectangleId)
    if (!selected && !startRectangleSelected && !endRectangleSelected) return item
    const start = transformEndpoint(item.start, item.startAttachment)
    const end = transformEndpoint(item.end, item.endAttachment)
    return {
      ...item,
      start: start.point,
      end: end.point,
      strokeWidth: selected ? item.strokeWidth * strokeScale : item.strokeWidth,
      ...(start.attachment ? { startAttachment: start.attachment } : { startAttachment: undefined }),
      ...(end.attachment ? { endAttachment: end.attachment } : { endAttachment: undefined }),
    }
  })
}

export function cloneCanvasItems(items: CanvasItem[]): CanvasItem[] {
  return items.map((item) => {
    if (item.kind === 'rectangle') {
      return {
        ...item,
        ...(item.classBox ? { classBox: { ...item.classBox } } : {}),
        ...(item.inkBox ? { inkBox: { ...item.inkBox, ink: item.inkBox.ink.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ ...point })) })) } } : {}),
      }
    }
    if (item.kind === 'text') return { ...item }
    if (item.kind === 'connector') return {
      ...item,
      start: { ...item.start },
      end: { ...item.end },
      ...(item.startAttachment ? { startAttachment: { ...item.startAttachment } } : {}),
      ...(item.endAttachment ? { endAttachment: { ...item.endAttachment } } : {}),
    }
    return { ...item, points: item.points.map((point) => ({ ...point })) }
  })
}

export function translateSelectedItems(items: CanvasItem[], selectedKeys: ReadonlySet<string>, dx: number, dy: number): CanvasItem[] {
  const selectedRectangleIds = new Set(items
    .filter((item): item is RectangleObject => item.kind === 'rectangle' && selectedKeys.has(canvasItemKey(item)))
    .map((rectangle) => rectangle.id))
  const selectedRectangles = new Map(items
    .filter((item): item is RectangleObject => item.kind === 'rectangle' && selectedRectangleIds.has(item.id))
    .map((rectangle) => [rectangle.id, rectangle]))
  const rectanglesById = new Map(items
    .filter((item): item is RectangleObject => item.kind === 'rectangle')
    .map((rectangle) => [rectangle.id, rectangle]))
  return items.map((item) => {
    const itemSelected = selectedKeys.has(canvasItemKey(item))
    if (item.kind === 'rectangle') return itemSelected ? { ...item, x: item.x + dx, y: item.y + dy, ...(item.inkBox ? { inkBox: translateInkBox(item.inkBox, dx, dy) } : {}) } : item
    if (item.kind === 'text') return itemSelected ? { ...item, x: item.x + dx, y: item.y + dy } : item
    if (item.kind === 'connector') {
      const connectorSelected = itemSelected
      const startRectangleMoves = !!item.startAttachment && selectedRectangleIds.has(item.startAttachment.rectangleId)
      const endRectangleMoves = !!item.endAttachment && selectedRectangleIds.has(item.endAttachment.rectangleId)
      if (!connectorSelected && !startRectangleMoves && !endRectangleMoves) return item
      const moveEndpoint = (point: Point, attachment?: ConnectorAttachment) => {
        const rectangle = attachment ? selectedRectangles.get(attachment.rectangleId) : undefined
        if (rectangle && attachment) {
          return {
            point: { ...point, x: rectangle.x + dx + attachment.offsetX, y: rectangle.y + dy + attachment.offsetY },
            attachment,
          }
        }
        if (connectorSelected) {
          const attachedRectangle = attachment ? rectanglesById.get(attachment.rectangleId) : undefined
          if (attachment && attachedRectangle) {
            // Rectangle-local offsets are locked boundary anchors. Dragging the
            // connector cannot slide an attached endpoint along its rectangle.
            return { point, attachment }
          }
          const translatedPoint = { ...point, x: point.x + dx, y: point.y + dy }
          // Preserve a valid attachment during connector translation. If its rectangle
          // no longer exists, drop the stale reference and keep the endpoint free.
          return { point: translatedPoint, attachment: undefined }
        }
        return { point, attachment }
      }
      const start = moveEndpoint(item.start, item.startAttachment)
      const end = moveEndpoint(item.end, item.endAttachment)
      const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y && a.pressure === b.pressure
      const sameAttachment = (a?: ConnectorAttachment, b?: ConnectorAttachment) => a?.rectangleId === b?.rectangleId
        && a?.offsetX === b?.offsetX && a?.offsetY === b?.offsetY
      if (samePoint(start.point, item.start) && samePoint(end.point, item.end)
        && sameAttachment(start.attachment, item.startAttachment) && sameAttachment(end.attachment, item.endAttachment)) return item
      return {
        ...item,
        start: start.point,
        end: end.point,
        ...(start.attachment ? { startAttachment: start.attachment } : { startAttachment: undefined }),
        ...(end.attachment ? { endAttachment: end.attachment } : { endAttachment: undefined }),
      }
    }
    if (!itemSelected) return item
    return { ...item, points: item.points.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })) }
  })
}

export function detachConnectorsFromRectangles(items: CanvasItem[], rectangleIds: ReadonlySet<number>): CanvasItem[] {
  return items.map((item) => {
    if (item.kind !== 'connector') return item
    const startAttachment = item.startAttachment && rectangleIds.has(item.startAttachment.rectangleId) ? undefined : item.startAttachment
    const endAttachment = item.endAttachment && rectangleIds.has(item.endAttachment.rectangleId) ? undefined : item.endAttachment
    if (startAttachment === item.startAttachment && endAttachment === item.endAttachment) return item
    return {
      ...item,
      ...(startAttachment ? { startAttachment } : { startAttachment: undefined }),
      ...(endAttachment ? { endAttachment } : { endAttachment: undefined }),
    }
  })
}

/**
 * Undo/redo snapshots. Canvas items are never edited in place (every move, resize, erase or text edit replaces the
 * item with a new object), so a snapshot is a copy of the item list that shares the items themselves. Copying every
 * point of every stroke at each step made each pen-up cost grow with the page and held up to 100 full copies of it.
 */
export class CanvasSnapshotHistory {
  private undoStack: CanvasItem[][] = []
  private redoStack: CanvasItem[][] = []

  constructor(private readonly limit = 100) {}

  get canUndo() { return this.undoStack.length > 0 }
  get canRedo() { return this.redoStack.length > 0 }

  record(items: CanvasItem[]) {
    this.undoStack.push(items.slice())
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack = []
  }

  undo(current: CanvasItem[]): CanvasItem[] | null {
    const previous = this.undoStack.pop()
    if (!previous) return null
    this.redoStack.push(current.slice())
    return previous
  }

  redo(current: CanvasItem[]): CanvasItem[] | null {
    const next = this.redoStack.pop()
    if (!next) return null
    this.undoStack.push(current.slice())
    return next
  }
}

// --- Ink class box helpers used by the item functions above (more in inkClassBox.ts) ---
/** Smallest height of each of the three bands (name, variables, methods), in canvas units. */
export const INK_BOX_MIN_BAND = 24
export const INK_BOX_MIN_HEIGHT = INK_BOX_MIN_BAND * 3
export const INK_BOX_MIN_WIDTH = 64
/** Space kept between written ink and the box edge when the box grows to cover the ink. */
export const INK_BOX_INK_PADDING = 8

/** Keeps both dividers inside the box with at least INK_BOX_MIN_BAND per band (thirds if the box is too small for that). Returns the same object when nothing changes. */
export function clampInkBoxDividers(rectangle: RectangleObject): RectangleObject {
  const box = rectangle.inkBox
  if (!box) return rectangle
  const bottom = rectangle.y + rectangle.height
  let top: number
  let mid: number
  if (rectangle.height < INK_BOX_MIN_HEIGHT) {
    top = rectangle.y + rectangle.height / 3
    mid = rectangle.y + (rectangle.height * 2) / 3
  } else {
    top = Math.min(Math.max(box.top, rectangle.y + INK_BOX_MIN_BAND), bottom - INK_BOX_MIN_BAND * 2)
    mid = Math.min(Math.max(box.mid, top + INK_BOX_MIN_BAND), bottom - INK_BOX_MIN_BAND)
  }
  if (top === box.top && mid === box.mid) return rectangle
  return { ...rectangle, inkBox: { ...box, top, mid } }
}

function mapStroke(stroke: Stroke, mapPoint: (point: Point) => Point, widthScale = 1): Stroke {
  return { ...stroke, points: stroke.points.map(mapPoint), width: stroke.width * widthScale }
}

export function translateInkBox(box: InkBoxContent, dx: number, dy: number): InkBoxContent {
  return {
    top: box.top + dy,
    mid: box.mid + dy,
    ink: box.ink.map((stroke) => mapStroke(stroke, (point) => ({ ...point, x: point.x + dx, y: point.y + dy }))),
  }
}

/** For a group resize: dividers and ink follow the same mapping as the box. */
export function transformInkBox(box: InkBoxContent, mapX: (x: number) => number, mapY: (y: number) => number, widthScale: number): InkBoxContent {
  return {
    top: mapY(box.top),
    mid: mapY(box.mid),
    ink: box.ink.map((stroke) => mapStroke(stroke, (point) => ({ ...point, x: mapX(point.x), y: mapY(point.y) }), widthScale)),
  }
}

/** Bounds of the written (not erased) ink including line width, or null when there is none. */
export function inkBoxInkBounds(box: InkBoxContent): RectangleBounds | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const stroke of box.ink) {
    if (stroke.erase) continue
    const half = stroke.width / 2
    for (const point of stroke.points) {
      minX = Math.min(minX, point.x - half)
      minY = Math.min(minY, point.y - half)
      maxX = Math.max(maxX, point.x + half)
      maxY = Math.max(maxY, point.y + half)
    }
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null
}

/** Grows bounds so they cover all the ink (plus padding). Unchanged bounds are returned as they are. */
export function coverInkBounds(bounds: RectangleBounds, box: InkBoxContent): RectangleBounds {
  const ink = inkBoxInkBounds(box)
  if (!ink) return bounds
  const left = Math.min(bounds.x, ink.x - INK_BOX_INK_PADDING)
  const top = Math.min(bounds.y, ink.y - INK_BOX_INK_PADDING)
  const right = Math.max(bounds.x + bounds.width, ink.x + ink.width + INK_BOX_INK_PADDING)
  const bottom = Math.max(bounds.y + bounds.height, ink.y + ink.height + INK_BOX_INK_PADDING)
  if (left === bounds.x && top === bounds.y && right === bounds.x + bounds.width && bottom === bounds.y + bounds.height) return bounds
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** The bounds a resize may produce: at least the minimum size, and never smaller than the ink. */
export function constrainInkBoxBounds(rectangle: RectangleObject, bounds: RectangleBounds): RectangleBounds {
  const box = rectangle.inkBox
  if (!box) return bounds
  let { x, y, width, height } = bounds
  if (width < INK_BOX_MIN_WIDTH) width = INK_BOX_MIN_WIDTH
  if (height < INK_BOX_MIN_HEIGHT) height = INK_BOX_MIN_HEIGHT
  return coverInkBounds({ x, y, width, height }, box)
}
