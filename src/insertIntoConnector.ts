/**
 * Insert box into connector (right-click chip, panel button, palette): a plain rectangle is put on the middle of the selected connector.
 * The connector now ends on the box and a new connector runs from the box to the old end. Pure; nothing is saved that did not exist before.
 *
 * Distribution: the first part keeps the start end (head, start label, attachment) and the middle label; the second part gets the old end
 * (head, end label, attachment). Heads at the inner ends are dropped (a one-way arrow keeps its head on the second part, a two-way arrow
 * gets one head at each outer end). Both parts keep colour, width, dash, routing and relationship kind where a head remains.
 */
import { canvasItemKey, connectorPoints, connectorSecondEndpoint, createShapeBox, getConnectorRenderSpec, isItemLocked, type CanvasItem, type ConnectorAttachment, type ConnectorObject, type Point, type RectangleBounds, type RectangleObject } from './canvasModel'
import { routeConnectors } from './connectorRoute'
import { applyNewShapeStyle, type NewShapeStyle } from './newShapeStyle'
import { isFlowBox } from './diagramFlow'
import { pathFractionNearest, pathMidpoint, pointAtPathFraction } from './pathGeometry'

/** Size of the inserted box: the same as a plain rectangle made by a click with the Rectangle tool. */
export const INSERT_BOX_WIDTH = 160
export const INSERT_BOX_HEIGHT = 100

export type InsertIntoConnectorResult = { items: CanvasItem[]; box: RectangleObject; first: ConnectorObject; second: ConnectorObject }

/** True when the connector exists and is not locked. */
export const canInsertBoxIntoConnector = (items: readonly CanvasItem[], connectorId: number): boolean =>
  items.some((item) => item.kind === 'connector' && item.id === connectorId && !isItemLocked(item))

type Side = 'left' | 'right' | 'top' | 'bottom'

/** The side of `box` that faces `other` (the larger of the horizontal and vertical offsets, each relative to the half size). */
function facingSide(box: RectangleBounds, other: Point): Side {
  const dx = (other.x - (box.x + box.width / 2)) / (box.width / 2)
  const dy = (other.y - (box.y + box.height / 2)) / (box.height / 2)
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top')
}

function sideAttachment(box: RectangleObject, side: Side): ConnectorAttachment {
  return {
    rectangleId: box.id,
    offsetX: side === 'right' ? box.width : side === 'left' ? 0 : box.width / 2,
    offsetY: side === 'bottom' ? box.height : side === 'top' ? 0 : box.height / 2,
  }
}

/** The part with its arrowhead only at `head` (null = none). Dashed kinds that lose their symbol keep their dashes. */
function withHeadAt(part: ConnectorObject, original: ConnectorObject, head: 'start' | 'end' | null): ConnectorObject {
  const { twoWay: _twoWay, ...rest } = part
  void _twoWay
  if (head === null) {
    if (original.relationshipType === 'association') return rest
    const dash = original.dash ?? (getConnectorRenderSpec(original).lineStyle === 'dashed' ? 'dashed' : undefined)
    return { ...rest, relationshipType: 'association', reversed: false, ...(dash ? { dash } : {}) }
  }
  const forward: ConnectorObject = { ...rest, reversed: false }
  return getConnectorRenderSpec(forward).endpoint === head ? forward : { ...rest, reversed: true }
}

/** Splits the connector at `index` around `box`: the connector ends on the box and a new one (`newConnectorId`) runs from the box to the old end. */
function splitAroundBox(items: CanvasItem[], index: number, box: RectangleObject, newConnectorId: number, replaceBox: boolean): { items: CanvasItem[]; first: ConnectorObject; second: ConnectorObject } {
  const connector = items[index] as ConnectorObject
  const toBox = (side: Side): { point: Point; attachment: ConnectorAttachment } => {
    const attachment = sideAttachment(box, side)
    return { point: { x: box.x + attachment.offsetX, y: box.y + attachment.offsetY, pressure: 1 }, attachment }
  }
  const boxIn = toBox(facingSide(box, connector.start))
  const boxOut = toBox(facingSide(box, connector.end))

  const spec = getConnectorRenderSpec(connector)
  const secondHead = connectorSecondEndpoint(connector)
  const heads = new Set<'start' | 'end'>()
  if (spec.endpoint) heads.add(spec.endpoint)
  if (secondHead) heads.add(secondHead)

  // Everything but the ends, labels and bend is shared (the bend belonged to the single route; routedPath is derived).
  const { label, labelFontSize, labelPosition, startLabel, endLabel, bend, startAttachment, endAttachment, routedPath, ...common } = connector
  void labelPosition; void bend; void routedPath
  const firstBase: ConnectorObject = {
    ...common,
    ...(label !== undefined ? { label, ...(labelFontSize !== undefined ? { labelFontSize } : {}) } : {}),
    ...(startLabel !== undefined ? { startLabel } : {}),
    ...(startAttachment ? { startAttachment: { ...startAttachment } } : {}),
    end: boxIn.point,
    endAttachment: boxIn.attachment,
  }
  const secondBase: ConnectorObject = {
    ...common,
    id: newConnectorId,
    start: boxOut.point,
    startAttachment: boxOut.attachment,
    ...(endLabel !== undefined ? { endLabel } : {}),
    ...(endAttachment ? { endAttachment: { ...endAttachment } } : {}),
  }
  const first = withHeadAt(firstBase, connector, heads.has('start') ? 'start' : null)
  const second = withHeadAt(secondBase, connector, heads.has('end') ? 'end' : null)

  const result = items.slice()
  if (replaceBox) {
    const boxIndex = result.findIndex((item) => item.kind === 'rectangle' && item.id === box.id)
    result.splice(index, 1, first, second)
    result[boxIndex > index ? boxIndex + 1 : boxIndex] = box
  } else {
    result.splice(index, 1, box, first, second)
  }
  return { items: result, first, second }
}

/**
 * The items with a rectangle inserted on the middle of connector `connectorId`, or null when the connector is missing or locked.
 * `ids` are the new box and the new (second) connector. `options.style` is the default new-shape style; `options.workspace` keeps the box inside the sheet.
 */
export function insertBoxIntoConnector(
  items: CanvasItem[],
  connectorId: number,
  ids: { rectangle: number; connector: number },
  options: { style?: NewShapeStyle | null; workspace?: RectangleBounds } = {},
): InsertIntoConnectorResult | null {
  const index = items.findIndex((item) => item.kind === 'connector' && item.id === connectorId)
  if (index < 0) return null
  const connector = items[index] as ConnectorObject
  if (isItemLocked(connector)) return null
  if (items.some((item) => item.kind === 'rectangle' && item.id === ids.rectangle)) return null
  if (items.some((item) => item.kind === 'connector' && item.id === ids.connector)) return null

  const routed = routeConnectors(items)[index] as ConnectorObject
  const middle = pathMidpoint(connectorPoints(routed))
  let x = middle.x - INSERT_BOX_WIDTH / 2
  let y = middle.y - INSERT_BOX_HEIGHT / 2
  if (options.workspace) {
    const { workspace } = options
    x = Math.max(workspace.x, Math.min(x, workspace.x + workspace.width - INSERT_BOX_WIDTH))
    y = Math.max(workspace.y, Math.min(y, workspace.y + workspace.height - INSERT_BOX_HEIGHT))
  }
  const plain = createShapeBox(ids.rectangle, x, y, INSERT_BOX_WIDTH, INSERT_BOX_HEIGHT, connector.strokeColor, connector.strokeWidth, 'rectangle')
  const styled = applyNewShapeStyle(plain, options.style ?? null)
  const box: RectangleObject = connector.group !== undefined ? { ...styled, group: connector.group } : styled

  const split = splitAroundBox(items, index, box, ids.connector, false)
  return { items: split.items, box, first: split.first, second: split.second }
}

export const insertedBoxKey = (result: InsertIntoConnectorResult): string => canvasItemKey(result.box)

/** Screen-pixel reach of the drop hit test (the drop point's distance to the connector line). */
export const DROP_ON_CONNECTOR_TOLERANCE_PX = 14

/** A box that can be dropped onto a connector: a free (no connector attached), unlocked, unrotated plain, HLD or sticky box. */
export function isDroppableBox(items: readonly CanvasItem[], box: CanvasItem | undefined): box is RectangleObject {
  if (!box || box.kind !== 'rectangle' || !isFlowBox(box) || isItemLocked(box) || box.angle) return false
  return !items.some((item) => item.kind === 'connector' && (item.startAttachment?.rectangleId === box.id || item.endAttachment?.rectangleId === box.id))
}

/**
 * The drawn path of every connector with the box `boxId` taken out of the scene, by connector id. Elbow routing treats other boxes as obstacles,
 * so the path with the dragged box present detours around it; computed once at drag start, this is the line the box is dropped on.
 */
export function connectorDropPaths(items: readonly CanvasItem[], boxId: number): Map<number, Point[]> {
  const without = items.filter((item) => !(item.kind === 'rectangle' && item.id === boxId))
  const paths = new Map<number, Point[]>()
  routeConnectors(without).forEach((item) => {
    if (item.kind === 'connector') paths.set(item.id, connectorPoints(item))
  })
  return paths
}

/**
 * The connector the dragged free box `boxId` (centre `centre`, canvas coordinates) is over: the nearest unlocked connector whose drawn path
 * passes within `toleranceScreenPx / scale` of the centre, or null. Null when the box is not droppable (see isDroppableBox).
 */
export function connectorUnderBox(items: CanvasItem[], boxId: number, centre: Point, scale: number, toleranceScreenPx = DROP_ON_CONNECTOR_TOLERANCE_PX, paths?: ReadonlyMap<number, Point[]>): number | null {
  const box = items.find((item) => item.kind === 'rectangle' && item.id === boxId)
  if (!isDroppableBox(items, box) || !(scale > 0)) return null
  const tolerance = toleranceScreenPx / scale
  // Paths computed without the dragged box (see connectorDropPaths); otherwise routed here with the box in place.
  const routed = paths ? items : routeConnectors(items)
  let best: number | null = null
  let bestDistance = tolerance
  routed.forEach((item, index) => {
    const original = items[index]
    if (item.kind !== 'connector' || original.kind !== 'connector' || isItemLocked(original)) return
    if (original.startAttachment?.rectangleId === boxId || original.endAttachment?.rectangleId === boxId) return
    const path = paths ? paths.get(original.id) : connectorPoints(item)
    if (!path || path.length < 2) return
    const near = pointAtPathFraction(path, pathFractionNearest(path, centre))
    const distance = Math.hypot(near.x - centre.x, near.y - centre.y)
    if (distance <= bestDistance) { best = original.id; bestDistance = distance }
  })
  return best
}

/**
 * Round 10: inserts the existing free box `boxId` into connector `connectorId`. The box keeps its size; its centre goes to the nearest point on the
 * connector path to `drop` (kept inside `options.workspace`). The connector is split around it exactly like insertBoxIntoConnector.
 * Null when the connector or box is missing, the connector is locked or the box is not droppable.
 */
export function insertExistingBoxIntoConnector(
  items: CanvasItem[],
  connectorId: number,
  boxId: number,
  drop: Point,
  ids: { connector: number },
  options: { workspace?: RectangleBounds; path?: readonly Point[] } = {},
): InsertIntoConnectorResult | null {
  const index = items.findIndex((item) => item.kind === 'connector' && item.id === connectorId)
  if (index < 0) return null
  const connector = items[index] as ConnectorObject
  if (isItemLocked(connector)) return null
  if (items.some((item) => item.kind === 'connector' && item.id === ids.connector)) return null
  const original = items.find((item) => item.kind === 'rectangle' && item.id === boxId)
  if (!isDroppableBox(items, original)) return null

  const path = options.path ? [...options.path] : (connectorDropPaths(items, boxId).get(connectorId) ?? [])
  if (path.length < 2) return null
  const onPath = pointAtPathFraction(path, pathFractionNearest(path, drop))
  let x = onPath.x - original.width / 2
  let y = onPath.y - original.height / 2
  if (options.workspace) {
    const { workspace } = options
    x = Math.max(workspace.x, Math.min(x, workspace.x + workspace.width - original.width))
    y = Math.max(workspace.y, Math.min(y, workspace.y + workspace.height - original.height))
  }
  const box: RectangleObject = { ...original, x, y }
  const split = splitAroundBox(items, index, box, ids.connector, true)
  return { items: split.items, box, first: split.first, second: split.second }
}
