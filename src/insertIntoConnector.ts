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
import { pathMidpoint } from './pathGeometry'

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
    id: ids.connector,
    start: boxOut.point,
    startAttachment: boxOut.attachment,
    ...(endLabel !== undefined ? { endLabel } : {}),
    ...(endAttachment ? { endAttachment: { ...endAttachment } } : {}),
  }
  const first = withHeadAt(firstBase, connector, heads.has('start') ? 'start' : null)
  const second = withHeadAt(secondBase, connector, heads.has('end') ? 'end' : null)

  const result = items.slice()
  result.splice(index, 1, box, first, second)
  return { items: result, box, first, second }
}

export const insertedBoxKey = (result: InsertIntoConnectorResult): string => canvasItemKey(result.box)
