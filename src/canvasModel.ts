export type Point = { x: number; y: number; pressure: number }
export type Stroke = { kind: 'stroke'; id: number; points: Point[]; color: string; width: number; erase: boolean; shape?: 'arrow' | 'line' }
export type RectangleObject = { kind: 'rectangle'; id: number; x: number; y: number; width: number; height: number; strokeColor: string; strokeWidth: number }
export type ConnectorAttachment = { rectangleId: number; offsetX: number; offsetY: number }
export type ConnectorRelationshipType = 'association' | 'inheritance' | 'dependency' | 'aggregation' | 'composition'
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
}
export type CanvasItem = Stroke | RectangleObject | ConnectorObject
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
    case 'inheritance':
      return { lineStyle: 'solid', symbol: 'hollow-triangle', endpoint: connector.reversed ? 'start' : 'end' }
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

export function getConnectorSymbolGeometry(connector: ConnectorObject, width = connector.strokeWidth): ConnectorSymbolGeometry | null {
  const spec = getConnectorRenderSpec(connector)
  if (!spec.endpoint || spec.symbol === 'none') return null
  const dx = connector.end.x - connector.start.x
  const dy = connector.end.y - connector.start.y
  const length = Math.hypot(dx, dy)
  if (!length) return null
  const unit = { x: dx / length, y: dy / length }
  const normal = { x: -unit.y, y: unit.x }
  const atStart = spec.endpoint === 'start'
  const tip = atStart ? connector.start : connector.end
  const other = atStart ? connector.end : connector.start
  const towardOther = atStart
    ? { ...unit, pressure: tip.pressure }
    : { x: -unit.x, y: -unit.y, pressure: tip.pressure }
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
  for (const item of items) {
    renderItems.push(item)
    if (item.kind !== 'connector') continue
    const attachedRectangleIds = new Set([item.startAttachment?.rectangleId, item.endAttachment?.rectangleId])
    for (const rectangleId of attachedRectangleIds) {
      const rectangle = rectangleId === undefined ? undefined : rectangles.get(rectangleId)
      if (rectangle) renderItems.push(rectangle)
    }
  }
  return renderItems
}

export function updateConnectorRelationship(items: CanvasItem[], connectorId: number, relationshipType: ConnectorRelationshipType): CanvasItem[] {
  return items.map((item) => item.kind === 'connector' && item.id === connectorId && item.relationshipType !== relationshipType
    ? { ...item, relationshipType, reversed: relationshipType === 'association' ? false : item.reversed }
    : item)
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

export function snapConnectorEndpoint(
  point: Point,
  items: CanvasItem[],
  tolerance = CONNECTOR_SNAP_TOLERANCE,
): SnappedConnectorEndpoint | null {
  let closest: SnappedConnectorEndpoint | null = null
  let closestDistance = tolerance
  for (const item of items) {
    if (item.kind !== 'rectangle') continue
    const left = item.x
    const right = item.x + item.width
    const top = item.y
    const bottom = item.y + item.height
    const candidates = [
      closestPointOnSegment(point, { x: left, y: top, pressure: point.pressure }, { x: right, y: top, pressure: point.pressure }),
      closestPointOnSegment(point, { x: left, y: bottom, pressure: point.pressure }, { x: right, y: bottom, pressure: point.pressure }),
      closestPointOnSegment(point, { x: left, y: top, pressure: point.pressure }, { x: left, y: bottom, pressure: point.pressure }),
      closestPointOnSegment(point, { x: right, y: top, pressure: point.pressure }, { x: right, y: bottom, pressure: point.pressure }),
    ]
    for (const candidate of candidates) {
      const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y)
      if (distance <= closestDistance) {
        closestDistance = distance
        closest = {
          point: candidate,
          attachment: { rectangleId: item.id, offsetX: candidate.x - item.x, offsetY: candidate.y - item.y },
        }
      }
    }
  }
  return closest
}

export function canvasItemKey(item: CanvasItem): string {
  return `${item.kind}:${item.id}`
}

export function cloneCanvasItems(items: CanvasItem[]): CanvasItem[] {
  return items.map((item) => {
    if (item.kind === 'rectangle') return { ...item }
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
  return items.map((item) => {
    const itemSelected = selectedKeys.has(canvasItemKey(item))
    if (item.kind === 'rectangle') return itemSelected ? { ...item, x: item.x + dx, y: item.y + dy } : item
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
          // A connector moved independently of its attached rectangle becomes free at
          // that endpoint; it must not retain a link that no longer describes its geometry.
          return { point: { ...point, x: point.x + dx, y: point.y + dy }, attachment: undefined }
        }
        return { point, attachment }
      }
      const start = moveEndpoint(item.start, item.startAttachment)
      const end = moveEndpoint(item.end, item.endAttachment)
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

export class CanvasSnapshotHistory {
  private undoStack: CanvasItem[][] = []
  private redoStack: CanvasItem[][] = []

  constructor(private readonly limit = 100) {}

  get canUndo() { return this.undoStack.length > 0 }
  get canRedo() { return this.redoStack.length > 0 }

  record(items: CanvasItem[]) {
    this.undoStack.push(cloneCanvasItems(items))
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack = []
  }

  undo(current: CanvasItem[]): CanvasItem[] | null {
    const previous = this.undoStack.pop()
    if (!previous) return null
    this.redoStack.push(cloneCanvasItems(current))
    return previous
  }

  redo(current: CanvasItem[]): CanvasItem[] | null {
    const next = this.redoStack.pop()
    if (!next) return null
    this.undoStack.push(cloneCanvasItems(current))
    return next
  }
}
