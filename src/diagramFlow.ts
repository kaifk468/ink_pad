import { canvasItemKey, createConnector, getCanvasSelectionBounds, snapConnectorEndpoint, type CanvasItem, type ConnectorAttachment, type ConnectorObject, type LineDash, type Point, type RectangleBounds, type RectangleObject, type TextObject } from './canvasModel'
import { contains } from './textFit'

/**
 * Desktop diagram flow (batch C): arrows that stick to shapes, quick-create connected shapes, labels inside shapes.
 * Pure functions, no DOM. "Box" here means a plain shape (rectangle, diamond, ellipse) or an HLD shape; class boxes and
 * ink class boxes are not connectable by these helpers.
 */

/** A plain shape or an HLD shape (database, queue, service); not a typed class box, not an ink class box. */
export function isFlowBox(item: CanvasItem): item is RectangleObject {
  return item.kind === 'rectangle' && !item.classBox && (!item.inkBox || !!item.hldShape)
}

export const arrowToolCreates = (pressHit: boolean, releaseHit: boolean): 'connector' | 'stroke' => (pressHit || releaseHit ? 'connector' : 'stroke')

/**
 * The attached arrow connector the desktop Arrow tool makes for a press-to-release drag, or null when neither end is on a box
 * (the caller then keeps the plain arrow stroke). Both ends snap to the outline of the box they are on or inside; a free end stays a free point.
 */
export function arrowToolConnector(
  items: readonly CanvasItem[],
  press: Point,
  release: Point,
  style: { id: number; color: string; width: number; dash?: LineDash },
  tolerance: number,
): ConnectorObject | null {
  const boxes = items.filter(isFlowBox)
  const startSnap = snapConnectorEndpoint(press, boxes, tolerance, true)
  const endSnap = snapConnectorEndpoint(release, boxes, tolerance, true)
  if (arrowToolCreates(startSnap !== null, endSnap !== null) === 'stroke') return null
  const connector = createConnector(style.id, startSnap?.point ?? press, endSnap?.point ?? release, style.color, style.width, startSnap?.attachment, endSnap?.attachment, 'directed-association')
  return style.dash ? { ...connector, dash: style.dash } : connector
}

export type FlowDirection = 'right' | 'left' | 'up' | 'down'
export const QUICK_CREATE_GAP = 80
const SIDEWAYS_MARGIN = 40
const MAX_SIDEWAYS_TRIES = 10

const overlaps = (a: RectangleBounds, b: RectangleBounds) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/** Bounds of every item a new box must not cover (everything except connectors). */
export function obstacleBounds(items: readonly CanvasItem[]): RectangleBounds[] {
  const result: RectangleBounds[] = []
  for (const item of items) {
    if (item.kind === 'connector' || item.kind === 'opaque') continue
    const bounds = getCanvasSelectionBounds([item], new Set([canvasItemKey(item)]))
    if (bounds) result.push(bounds)
  }
  return result
}

/**
 * Where a new box of the source's size goes: `QUICK_CREATE_GAP` away in `direction`, centred on the source's centre line. If that
 * spot overlaps an obstacle, it steps sideways (perpendicular, by size + 40: one side, the other, then further out) up to 10 times.
 * Always inside the workspace. Null when no free spot was found.
 */
export function quickCreatePlacement(source: RectangleBounds, direction: FlowDirection, obstacles: readonly RectangleBounds[], workspace: RectangleBounds): { x: number; y: number } | null {
  const horizontal = direction === 'right' || direction === 'left'
  const step = (horizontal ? source.height : source.width) + SIDEWAYS_MARGIN
  const baseX = direction === 'right' ? source.x + source.width + QUICK_CREATE_GAP : direction === 'left' ? source.x - QUICK_CREATE_GAP - source.width : source.x
  const baseY = direction === 'down' ? source.y + source.height + QUICK_CREATE_GAP : direction === 'up' ? source.y - QUICK_CREATE_GAP - source.height : source.y
  for (let attempt = 0; attempt <= MAX_SIDEWAYS_TRIES; attempt += 1) {
    const shift = attempt === 0 ? 0 : (attempt % 2 === 1 ? 1 : -1) * Math.ceil(attempt / 2) * step
    const x = Math.min(Math.max(horizontal ? baseX : baseX + shift, workspace.x), workspace.x + workspace.width - source.width)
    const y = Math.min(Math.max(horizontal ? baseY + shift : baseY, workspace.y), workspace.y + workspace.height - source.height)
    const candidate = { x, y, width: source.width, height: source.height }
    if (overlaps(candidate, source)) continue
    if (!obstacles.some((bounds) => overlaps(candidate, bounds))) return { x, y }
  }
  return null
}

export type QuickCreateResult = { box: RectangleObject; connector: ConnectorObject }

/**
 * The new empty box and the arrow joining the facing sides, or null when the source is not a flow box or no free spot exists.
 * `makeInkContent` builds the empty ink sections of an HLD shape from its new top and height; `seed` is the new sketchy seed (omit for none).
 */
export function quickCreateConnected(
  items: readonly CanvasItem[],
  source: RectangleObject,
  direction: FlowDirection,
  workspace: RectangleBounds,
  ids: { rectangle: number; connector: number },
  makeInkContent: (y: number, height: number) => NonNullable<RectangleObject['inkBox']>,
  seed?: number,
): QuickCreateResult | null {
  if (!isFlowBox(source)) return null
  const spot = quickCreatePlacement(source, direction, obstacleBounds(items.filter((item) => item !== source)), workspace)
  if (!spot) return null
  const { inkBox, angle, seed: _seed, ...rest } = source
  void inkBox; void angle; void _seed
  const box: RectangleObject = { ...rest, id: ids.rectangle, x: spot.x, y: spot.y, ...(source.hldShape ? { inkBox: makeInkContent(spot.y, source.height) } : {}), ...(seed !== undefined ? { seed } : {}) }
  const side = (rect: RectangleBounds, facing: FlowDirection): ConnectorAttachment => ({
    rectangleId: 0,
    offsetX: facing === 'right' ? rect.width : facing === 'left' ? 0 : rect.width / 2,
    offsetY: facing === 'down' ? rect.height : facing === 'up' ? 0 : rect.height / 2,
  })
  const opposite: Record<FlowDirection, FlowDirection> = { right: 'left', left: 'right', up: 'down', down: 'up' }
  const startAttachment = { ...side(source, direction), rectangleId: source.id }
  const endAttachment = { ...side(box, opposite[direction]), rectangleId: box.id }
  const point = (rect: RectangleBounds, a: ConnectorAttachment): Point => ({ x: rect.x + a.offsetX, y: rect.y + a.offsetY, pressure: 1 })
  const connector = createConnector(ids.connector, point(source, startAttachment), point(box, endAttachment), source.strokeColor, source.strokeWidth, startAttachment, endAttachment, 'directed-association')
  return { box, connector }
}

/** Keys of the text labels that lie fully inside one of the flow boxes in `boxKeys` and are not themselves in `boxKeys`. */
export function labelsInside(items: readonly CanvasItem[], boxKeys: ReadonlySet<string>): string[] {
  const boxes = items.filter((item): item is RectangleObject => isFlowBox(item) && boxKeys.has(canvasItemKey(item)))
  if (boxes.length === 0) return []
  const result: string[] = []
  for (const item of items) {
    if (item.kind !== 'text' || boxKeys.has(canvasItemKey(item))) continue
    if (boxes.some((box) => labelInsideBox(item, box))) result.push(canvasItemKey(item))
  }
  return result
}

/** True when all four corners of the label lie inside the box's outline (diamond and ellipse use their real outline). */
export function labelInsideBox(label: TextObject, box: RectangleObject): boolean {
  if (label.width <= 0 || label.height <= 0) return false
  return [[0, 0], [1, 0], [0, 1], [1, 1]].every(([cx, cy]) => contains(box, { x: label.x + label.width * cx, y: label.y + label.height * cy }))
}

/** The topmost label fully inside the box, or null. */
export function labelInShape(items: readonly CanvasItem[], box: RectangleObject): TextObject | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item.kind === 'text' && labelInsideBox(item, box)) return item
  }
  return null
}

/** What a Select-tool double-click on a flow box does: edit the label already inside it, or start a new label at its centre. */
export type ShapeDoubleClick = { kind: 'editLabel'; id: number } | { kind: 'newLabel'; centre: Point; boxId: number }

export function shapeDoubleClick(items: readonly CanvasItem[], boxId: number): ShapeDoubleClick | null {
  const box = items.find((item): item is RectangleObject => item.kind === 'rectangle' && item.id === boxId)
  if (!box || !isFlowBox(box)) return null
  const label = labelInShape(items, box)
  if (label) return { kind: 'editLabel', id: label.id }
  return { kind: 'newLabel', boxId, centre: { x: box.x + box.width / 2, y: box.y + box.height / 2, pressure: 1 } }
}

/** `label` moved so its centre is at `centre`. */
export function centreLabelOn(label: TextObject, centre: { x: number; y: number }): TextObject {
  return { ...label, x: centre.x - label.width / 2, y: centre.y - label.height / 2 }
}
