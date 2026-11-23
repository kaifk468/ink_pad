/** Smallest code block a resize may give (same numbers as MIN_CODE_WIDTH / MIN_CODE_HEIGHT in codeBlock.ts; a test checks they agree, and this module takes no value imports). */
const MIN_CODE_WIDTH = 96
const MIN_CODE_HEIGHT = 48
export type Point = { x: number; y: number; pressure: number }
/** Line style other than solid (missing = solid). Only on arrow/line strokes, plain and HLD shapes and connectors. */
export type LineDash = 'dashed' | 'dotted'
/** Which ends of an arrow/line stroke carry an arrowhead. Missing = the default for the shape (arrow: end, line: none). */
export type Arrowheads = 'none' | 'end' | 'start' | 'both'
export type Stroke = { kind: 'stroke'; id: number; points: Point[]; color: string; width: number; erase: boolean; shape?: 'arrow' | 'line'; dash?: LineDash; arrowheads?: Arrowheads; /** Desktop lock: drawn normally, but never selected, edited or erased. Only ever `true`. */ locked?: true; /** Desktop group: items sharing the number (per page) are selected together. Positive integer, never drawn. */ group?: number }
/** Ink class box: three bands (name, variables, methods) divided at the canvas heights `top` and `mid`, holding its own pen strokes (canvas coordinates). */
export type InkBoxContent = { top: number; mid: number; ink: Stroke[] }
export type ClassBoxContent = { name: string; attributes: string; methods: string }
/** HLD shape kinds: Database (cylinder), Queue, Service. A rectangle with one of these is an ink box drawn as that shape. */
export const HLD_SHAPES = ['database', 'queue', 'service', 'user', 'browser', 'mobile', 'cache', 'loadBalancer', 'cdn'] as const
export type HldShape = (typeof HLD_SHAPES)[number]
export type RectangleObject = { kind: 'rectangle'; id: number; x: number; y: number; width: number; height: number; strokeColor: string; strokeWidth: number; classBox?: ClassBoxContent; inkBox?: InkBoxContent; hldShape?: HldShape; ellipse?: true; diamond?: true; angle?: number; /** Hand-drawn style random seed (integer), written only by diagrams that use the sketchy style. */ seed?: number; /** Optional fill colour under the outline (not on service, typed or ink class boxes). */ fillColor?: string; dash?: LineDash; locked?: true; /** Desktop group: items sharing the number (per page) are selected together. Positive integer, never drawn. */ group?: number }
/** The fixed list of label fonts. A saved label without `fontFamily` is the original clean sans. */
export const TEXT_FONT_IDS = ['excalifont', 'sans', 'serif', 'mono'] as const
export type TextFontId = (typeof TEXT_FONT_IDS)[number]
/** `fit` (Desktop auto-fit): 'off' = the size was picked by hand, no auto-fit; 'wrap' = at the minimum size and word-wrapped to `width`. Missing = plain label. */
export type TextObject = { kind: 'text'; id: number; x: number; y: number; width: number; height: number; text: string; fontSize: number; color: string; fontFamily?: TextFontId; angle?: number; fit?: 'off' | 'wrap'; locked?: true; /** Desktop group: items sharing the number (per page) are selected together. Positive integer, never drawn. */ group?: number }
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
  /** Own line style: wins over the dash of the relationship type ('solid' = draw solid although the relationship type is dashed). Missing = the relationship type decides. */
  dash?: LineDash | 'solid'
  /** Text drawn centred on the middle of the path, over a background-coloured pad. Non-empty, at most 500 characters. Saved. */
  label?: string
  /** Desktop lock: drawn normally, never selected, edited or erased. Only ever `true`. */
  locked?: true
  /** Desktop group: items sharing the number (per page) are selected together. Positive integer, never drawn. */
  group?: number
  /** The right-angle path worked out for an elbow connector. Derived while drawing, never saved: only on copies made by routeConnectors. */
  routedPath?: Point[]
}
/** A code block: monospaced, syntax coloured, with line numbers. `theme` and `fontSize` are written only when not the default (light, 13). */
export type CodeObject = { kind: 'code'; id: number; x: number; y: number; width: number; height: number; text: string; language: string; theme?: 'dark'; fontSize?: number; locked?: true; /** Desktop group: items sharing the number (per page) are selected together. Positive integer, never drawn. */ group?: number }
/**
 * An item of a kind this InkPad does not know (saved by a newer copy). It is kept as read and written back unchanged (`raw`), and shown as a grey box.
 * `box` is its saved position and size when it had a usable one. It is never edited, selected or moved.
 */
export type OpaqueObject = { kind: 'opaque'; id: number; box: RectangleBounds | null; raw: Record<string, unknown> }
export type CanvasItem = Stroke | RectangleObject | ConnectorObject | TextObject | CodeObject | OpaqueObject
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

/** The canvas/SVG dash pattern for a line style at a stroke width ([] = solid). Dots are zero-length dashes, drawn round by the round line cap. */
export function dashPattern(dash: LineDash | undefined, width: number): number[] {
  if (dash === 'dashed') return [Math.max(6, width * 2.5), Math.max(4, width * 1.8)]
  if (dash === 'dotted') return [0.01, Math.max(4, width * 2)]
  return []
}

/** A connector's dash pattern: its own style when it has one, otherwise the dashes of its relationship type. */
export function connectorDashPattern(connector: ConnectorObject, width = connector.strokeWidth): number[] {
  if (connector.dash === 'solid') return []
  if (connector.dash) return dashPattern(connector.dash, width)
  return getConnectorRenderSpec(connector).lineStyle === 'dashed' ? dashPattern('dashed', width) : []
}

/** The arrowheads a line or arrow stroke shows: its own choice, or the default of its shape (arrow: end, line: none). */
export function strokeArrowheads(stroke: Stroke): Arrowheads {
  return stroke.arrowheads ?? (stroke.shape === 'arrow' ? 'end' : 'none')
}

export type ArrowheadGeometry = { tip: Point; wingA: Point; wingB: Point }

/** The head(s) of an arrow/line stroke: tip and the two wing ends (wingA is turned -30 degrees, wingB +30), start head first. */
export function strokeHeadGeometry(stroke: Stroke): ArrowheadGeometry[] {
  if ((stroke.shape !== 'arrow' && stroke.shape !== 'line') || stroke.points.length < 2) return []
  const heads = strokeArrowheads(stroke)
  if (heads === 'none') return []
  const [start, end] = stroke.points
  const length = Math.max(12, stroke.width * 3.5)
  const make = (tip: Point, from: Point): ArrowheadGeometry => {
    const angle = Math.atan2(tip.y - from.y, tip.x - from.x)
    const wing = (turn: number): Point => ({ x: tip.x - length * Math.cos(angle + turn), y: tip.y - length * Math.sin(angle + turn), pressure: tip.pressure })
    return { tip, wingA: wing(-Math.PI / 6), wingB: wing(Math.PI / 6) }
  }
  const result: ArrowheadGeometry[] = []
  if (heads === 'start' || heads === 'both') result.push(make(start, end))
  if (heads === 'end' || heads === 'both') result.push(make(end, start))
  return result
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

/** True for an item the Desktop lock has frozen (never selected, edited or erased). */
export function isItemLocked(item: CanvasItem): boolean {
  return item.kind !== 'opaque' && item.locked === true
}

/**
 * Items with the Desktop lock set or cleared. `keys` null = every item (used to unlock all). Eraser marks and unknown items are never locked.
 * Returns the same array when nothing changes; items that do not change are reused.
 */
export function setItemsLocked(items: CanvasItem[], keys: ReadonlySet<string> | null, locked: boolean): CanvasItem[] {
  let changed = false
  const next = items.map((item): CanvasItem => {
    if (item.kind === 'opaque' || (item.kind === 'stroke' && item.erase)) return item
    if (keys && !keys.has(canvasItemKey(item))) return item
    if ((item.locked === true) === locked) return item
    changed = true
    if (locked) return { ...item, locked: true }
    const { locked: _locked, ...rest } = item
    void _locked
    return rest as CanvasItem
  })
  return changed ? next : items
}

/** The drawn bounds of one item (eraser strokes included: their points widened by half the brush). Null when it has none. */
function paintBounds(item: CanvasItem): RectangleBounds | null {
  if (item.kind === 'stroke' && item.erase) {
    if (item.points.length === 0) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const point of item.points) {
      minX = Math.min(minX, point.x); minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y)
    }
    const half = item.width / 2
    return { x: minX - half, y: minY - half, width: maxX - minX + item.width, height: maxY - minY + item.width }
  }
  return getCanvasSelectionBounds([item], new Set([canvasItemKey(item)]))
}

const boundsOverlap = (a: RectangleBounds, b: RectangleBounds) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/**
 * What is drawn again after the eraser run items[runStart..runEnd]: the locked items (other than connectors, which are redrawn
 * anyway) painted before the run whose bounds overlap it, each followed again by the later non-eraser items that overlap it, in
 * array order, so locked items are never erased but stay under what was in front of them. Empty when nothing is locked.
 * Shared by the canvas renderer and the SVG/PNG export.
 */
export function lockedRedrawsAfterEraserRun(items: readonly CanvasItem[], runStart: number, runEnd: number): CanvasItem[] {
  let any = false
  for (let index = 0; index < runStart; index += 1) {
    const item = items[index]
    if (item.kind !== 'opaque' && item.locked === true && item.kind !== 'connector' && !(item.kind === 'stroke' && item.erase)) { any = true; break }
  }
  if (!any) return []
  let run: RectangleBounds | null = null
  for (let index = runStart; index <= runEnd; index += 1) {
    const box = paintBounds(items[index])
    if (!box) continue
    run = run ? { x: Math.min(run.x, box.x), y: Math.min(run.y, box.y), width: Math.max(run.x + run.width, box.x + box.width) - Math.min(run.x, box.x), height: Math.max(run.y + run.height, box.y + box.height) - Math.min(run.y, box.y) } : box
  }
  if (!run) return []
  const result: CanvasItem[] = []
  const seen = new Set<CanvasItem>()
  const add = (item: CanvasItem) => { if (!seen.has(item)) { seen.add(item); result.push(item) } }
  for (let index = 0; index < runStart; index += 1) {
    const item = items[index]
    if (item.kind === 'opaque' || item.locked !== true || item.kind === 'connector' || (item.kind === 'stroke' && item.erase)) continue
    const box = paintBounds(item)
    if (!box || !boundsOverlap(box, run)) continue
    add(item)
    for (let later = index + 1; later < runStart; later += 1) {
      const other = items[later]
      if (other.kind === 'opaque' || (other.kind === 'stroke' && other.erase)) continue
      const otherBox = paintBounds(other)
      if (otherBox && boundsOverlap(box, otherBox)) add(other)
    }
  }
  return result
}

/** The rectangles a connector is attached to, in array order (so the one that is higher in the layer order is drawn last). */
function attachedRectanglesInOrder(connector: ConnectorObject, rectangles: ReadonlyMap<number, { rectangle: RectangleObject; index: number }>): RectangleObject[] {
  const found: Array<{ rectangle: RectangleObject; index: number }> = []
  for (const rectangleId of new Set([connector.startAttachment?.rectangleId, connector.endAttachment?.rectangleId])) {
    const entry = rectangleId === undefined ? undefined : rectangles.get(rectangleId)
    if (entry) found.push(entry)
  }
  return found.sort((a, b) => a.index - b.index).map((entry) => entry.rectangle)
}

export function canvasItemsForRendering(items: CanvasItem[]): CanvasItem[] {
  const rectangles = new Map<number, { rectangle: RectangleObject; index: number }>()
  items.forEach((item, index) => { if (item.kind === 'rectangle') rectangles.set(item.id, { rectangle: item, index }) })
  const renderItems: CanvasItem[] = []
  // The stroke eraser only cuts ink: connectors are drawn again after each run of eraser strokes, so it never leaves a gap in one.
  const connectorsSoFar: ConnectorObject[] = []
  let runStart = -1
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    renderItems.push(item)
    if (item.kind === 'stroke' && item.erase) {
      if (runStart < 0) runStart = index
      const next = items[index + 1]
      if (!(next && next.kind === 'stroke' && next.erase)) {
        // Locked items are never erased: they are drawn again over the eraser run (only when something is locked).
        renderItems.push(...connectorsSoFar, ...lockedRedrawsAfterEraserRun(items, runStart, index))
        runStart = -1
      }
      continue
    }
    if (item.kind !== 'connector') continue
    connectorsSoFar.push(item)
    renderItems.push(...attachedRectanglesInOrder(item, rectangles))
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
  if (last.kind === 'stroke' && last.erase) {
    let runStart = items.length - 1
    while (runStart > 0) {
      const before = items[runStart - 1]
      if (before.kind === 'stroke' && before.erase) runStart -= 1
      else break
    }
    return [last, ...items.filter((item): item is ConnectorObject => item.kind === 'connector'), ...lockedRedrawsAfterEraserRun(items, runStart, items.length - 1)]
  }
  if (last.kind !== 'connector') return [last]
  const rectangles = new Map<number, { rectangle: RectangleObject; index: number }>()
  items.forEach((item, index) => { if (item.kind === 'rectangle') rectangles.set(item.id, { rectangle: item, index }) })
  return [last, ...attachedRectanglesInOrder(last, rectangles)]
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
  snapInside = false,
): SnappedConnectorEndpoint | null {
  if (snapInside) {
    // A point inside a box means "connect to this box": it goes to the nearest point of the outline, however deep inside it is.
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index]
      if (item.kind !== 'rectangle' || itemAngle(item) !== 0 || point.x < item.x || point.x > item.x + item.width || point.y < item.y || point.y > item.y + item.height) continue
      const candidate = nearestRectangleBoundaryPoint(item, point)
      return { point: candidate, attachment: { rectangleId: item.id, offsetX: candidate.x - item.x, offsetY: candidate.y - item.y } }
    }
  }
  let closest: SnappedConnectorEndpoint | null = null
  let closestDistance = tolerance
  for (const item of items) {
    if (item.kind !== 'rectangle' || itemAngle(item) !== 0) continue
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

export type ShapeKind = 'rectangle' | 'diamond' | 'ellipse'

/** A plain box of the given shape: no class box or ink, with the optional `diamond`/`ellipse` flag. */
export function createShapeBox(id: number, x: number, y: number, width: number, height: number, strokeColor: string, strokeWidth: number, shape: ShapeKind): RectangleObject {
  return { kind: 'rectangle', id, x, y, width, height, strokeColor, strokeWidth, ...(shape === 'diamond' ? { diamond: true as const } : {}), ...(shape === 'ellipse' ? { ellipse: true as const } : {}) }
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

const sameColor = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** The colour of one item: stroke colour, shape/connector stroke colour, or text colour. */
export function itemColor(item: CanvasItem): string {
  return item.kind === 'stroke' ? item.color : item.kind === 'text' ? item.color : item.kind === 'code' ? (item.theme === 'dark' ? '#e6edf3' : '#24292f') : item.kind === 'opaque' ? '#9ca3af' : item.strokeColor
}

/** The one colour shared by every selected item, or null when they differ or nothing is selected. */
export function selectionColor(items: readonly CanvasItem[], keys: ReadonlySet<string>): string | null {
  let found: string | null = null
  for (const item of items) {
    if (!keys.has(canvasItemKey(item))) continue
    const color = itemColor(item)
    if (found === null) found = color
    else if (found !== color) return null
  }
  return found
}

/**
 * Items with the selected ones recoloured. An ink box also recolours its writing; eraser strokes are left alone.
 * Unselected items keep their reference; returns the same array when nothing changes or the colour is not #rrggbb.
 */
export function recolorItems(items: CanvasItem[], keys: ReadonlySet<string>, color: string): CanvasItem[] {
  if (keys.size === 0 || !HEX_COLOR.test(color)) return items
  let changed = false
  const next = items.map((item): CanvasItem => {
    if (!keys.has(canvasItemKey(item))) return item
    let result: CanvasItem = item
    if (item.kind === 'stroke') {
      if (!item.erase && !sameColor(item.color, color)) result = { ...item, color }
    } else if (item.kind === 'text') {
      if (!sameColor(item.color, color)) result = { ...item, color }
    } else if (item.kind === 'connector') {
      if (!sameColor(item.strokeColor, color)) result = { ...item, strokeColor: color }
    } else if (item.kind === 'code' || item.kind === 'opaque') {
      // Code blocks have their own light/dark choice; unknown items are never changed.
    } else {
      const inkChanged = !!item.inkBox && item.inkBox.ink.some((s) => !s.erase && !sameColor(s.color, color))
      if (!sameColor(item.strokeColor, color) || inkChanged) {
        result = {
          ...item,
          strokeColor: color,
          ...(item.inkBox ? { inkBox: { ...item.inkBox, ink: item.inkBox.ink.map((s) => (s.erase || sameColor(s.color, color) ? s : { ...s, color })) } } : {}),
        }
      }
    }
    if (result !== item) changed = true
    return result
  })
  return changed ? next : items
}

export function canvasItemKey(item: CanvasItem): string {
  return `${item.kind}:${item.id}`
}

/** The keys of every item on the page (select all). */
export function allCanvasItemKeys(items: readonly CanvasItem[]): string[] {
  return items.filter((item) => item.kind !== 'opaque' && item.locked !== true).map(canvasItemKey)
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
    const min = inkBoxMinSize(original)
    const next = { x: bounds.x, y: bounds.y, width: Math.max(bounds.width, min.width), height: Math.max(bounds.height, min.height) }
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
      const box = rotatedItemBounds(item)
      include(box.x, box.y, item.strokeWidth / 2)
      include(box.x + box.width, box.y + box.height, item.strokeWidth / 2)
    } else if (item.kind === 'connector') {
      for (const p of connectorPoints(item)) include(p.x, p.y, item.strokeWidth / 2)
      const geometry = getConnectorSymbolGeometry(item)
      if (geometry) {
        include(geometry.sideA.x, geometry.sideA.y, item.strokeWidth / 2)
        include(geometry.sideB.x, geometry.sideB.y, item.strokeWidth / 2)
        include(geometry.far.x, geometry.far.y, item.strokeWidth / 2)
      }
    } else if (item.kind === 'text') {
      const box = rotatedItemBounds(item)
      include(box.x, box.y)
      include(box.x + box.width, box.y + box.height)
    } else if (item.kind === 'code') {
      include(item.x, item.y)
      include(item.x + item.width, item.y + item.height)
    } else if (item.kind === 'opaque') {
      if (item.box) {
        include(item.box.x, item.box.y)
        include(item.box.x + item.box.width, item.box.y + item.box.height)
      }
    } else if (!item.erase) {
      for (const point of item.points) include(point.x, point.y, item.width / 2)
      for (const head of strokeHeadGeometry(item)) {
        include(head.wingA.x, head.wingA.y, item.width / 2)
        include(head.wingB.x, head.wingB.y, item.width / 2)
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

export const MIN_TEXT_FONT_SIZE = 8
export const MAX_TEXT_FONT_SIZE = 300

/**
 * Resizes one text label by dragging a handle: the label scales evenly (font size, width and height together, so the box still fits
 * its text) from the opposite side or corner, which stays put. Corner handles follow the average of the two drags, side handles
 * their own axis. Only existing fields change: no new data is saved. The font size stays between 8 and 300.
 */
export function resizeTextItem(items: CanvasItem[], textId: number, originalBounds: RectangleBounds, bounds: RectangleBounds, handle: RectangleResizeHandle): CanvasItem[] {
  const scaleX = bounds.width / originalBounds.width
  const scaleY = bounds.height / originalBounds.height
  const wanted = handle.length === 2 ? (scaleX + scaleY) / 2 : handle === 'e' || handle === 'w' ? scaleX : scaleY
  return items.map((item) => {
    if (item.kind !== 'text' || item.id !== textId) return item
    const fontSize = Math.round(Math.max(MIN_TEXT_FONT_SIZE, Math.min(MAX_TEXT_FONT_SIZE, item.fontSize * wanted)) * 10) / 10
    const scale = fontSize / item.fontSize
    const width = item.width * scale
    const height = item.height * scale
    return {
      ...item,
      fontSize,
      width,
      height,
      x: handle.includes('w') ? item.x + item.width - width : item.x,
      y: handle.includes('n') ? item.y + item.height - height : item.y,
    }
  })
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
    if (item.kind === 'code') {
      // A code block resizes as a box; its text size is changed with its own plus and minus buttons.
      return selected
        ? { ...item, x: bounds.x + (item.x - originalBounds.x) * scaleX, y: bounds.y + (item.y - originalBounds.y) * scaleY, width: Math.max(MIN_CODE_WIDTH, item.width * Math.abs(scaleX)), height: Math.max(MIN_CODE_HEIGHT, item.height * Math.abs(scaleY)) }
        : item
    }
    if (item.kind === 'opaque') return item
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
    if (item.kind === 'text' || item.kind === 'code') return { ...item }
    if (item.kind === 'opaque') return item
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
    if (item.kind === 'text' || item.kind === 'code') return itemSelected ? { ...item, x: item.x + dx, y: item.y + dy } : item
    if (item.kind === 'opaque') return item
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

// ---- Rotation of text labels and plain shapes. The box (x, y, width, height) stays unrotated; `angle` turns it about its centre. ----

const ANGLE_EPSILON = 1e-6

/** Radians, normalised to (-PI, PI]. */
export function normalizeAngle(a: number): number {
  if (!Number.isFinite(a)) return 0
  let r = a % (Math.PI * 2)
  if (r > Math.PI) r -= Math.PI * 2
  else if (r <= -Math.PI) r += Math.PI * 2
  return r
}

/** Rotates `p` clockwise (canvas orientation) by `angle` about (cx, cy). */
export function rotatePoint(p: Point, cx: number, cy: number, angle: number): Point {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = p.x - cx
  const dy = p.y - cy
  return { ...p, x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
}

/** Text labels and plain boxes (rectangle, ellipse, diamond) rotate; class boxes, ink boxes, HLD shapes, ink and connectors do not. */
export function isRotatable(item: CanvasItem): boolean {
  if (item.kind === 'text') return true
  return item.kind === 'rectangle' && !item.inkBox && !item.classBox && !item.hldShape
}

export function itemAngle(item: CanvasItem): number {
  if (!isRotatable(item)) return 0
  const angle = (item as TextObject | RectangleObject).angle
  return typeof angle === 'number' && Number.isFinite(angle) && Math.abs(angle) >= ANGLE_EPSILON ? angle : 0
}

export function itemCenter(item: CanvasItem): Point {
  const box = item as RectangleBounds
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, pressure: 1 }
}

/** A world point expressed in the item's unrotated frame (identity when the item is not rotated). */
export function toItemFrame(item: CanvasItem, point: Point): Point {
  const angle = itemAngle(item)
  if (angle === 0) return point
  const c = itemCenter(item)
  return rotatePoint(point, c.x, c.y, -angle)
}

/** The axis-aligned box that contains the rotated box (the plain box when there is no rotation). */
export function rotatedItemBounds(item: CanvasItem): RectangleBounds {
  const box = item as RectangleBounds
  const angle = itemAngle(item)
  if (angle === 0) return { x: box.x, y: box.y, width: box.width, height: box.height }
  const c = itemCenter(item)
  const corners = [
    { x: box.x, y: box.y }, { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height }, { x: box.x, y: box.y + box.height },
  ].map((corner) => rotatePoint({ ...corner, pressure: 1 }, c.x, c.y, angle))
  const xs = corners.map((corner) => corner.x)
  const ys = corners.map((corner) => corner.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/** Sets the item's rotation (removing the field at ~0). Rotating a plain shape away from 0 detaches connectors attached to it. */
export function setItemAngle(items: CanvasItem[], key: string, angle: number): CanvasItem[] {
  const index = items.findIndex((item) => canvasItemKey(item) === key)
  if (index < 0) return items
  const item = items[index]
  if (!isRotatable(item) || (item.kind !== 'text' && item.kind !== 'rectangle')) return items
  const normalized = normalizeAngle(angle)
  const next = Math.abs(normalized) < ANGLE_EPSILON ? 0 : normalized
  if (next === itemAngle(item)) return items
  const { angle: _old, ...rest } = item
  void _old
  const updated = (next === 0 ? rest : { ...rest, angle: next }) as CanvasItem
  let result = items.map((candidate, i) => (i === index ? updated : candidate))
  if (item.kind === 'rectangle' && next !== 0) result = detachConnectorsFromRectangles(result, new Set([item.id]))
  return result
}

/** Rounds to the nearest `stepDegrees`, normalised. */
export function snapAngle(angle: number, stepDegrees = 15): number {
  const step = (stepDegrees * Math.PI) / 180
  return normalizeAngle(Math.round(angle / step) * step)
}

const ROTATE_HANDLE_OFFSET_PX = 24

/** The rotate handle (24 screen px above the top-middle of the box, turned with the item) and the stem start on the box edge. */
export function rotateHandle(item: CanvasItem, scale: number): { point: Point; anchor: Point } | null {
  if (!isRotatable(item)) return null
  const box = item as RectangleBounds
  const c = itemCenter(item)
  const angle = itemAngle(item)
  const top = { x: c.x, y: box.y, pressure: 1 }
  const handle = { x: c.x, y: box.y - ROTATE_HANDLE_OFFSET_PX / scale, pressure: 1 }
  return { point: rotatePoint(handle, c.x, c.y, angle), anchor: rotatePoint(top, c.x, c.y, angle) }
}

export function hitRotateHandle(item: CanvasItem, point: Point, scale: number, radiusPx = 12): boolean {
  const handle = rotateHandle(item, scale)
  if (!handle) return false
  return Math.hypot(point.x - handle.point.x, point.y - handle.point.y) <= radiusPx / scale
}

/** Angle of `point` around the item's centre, clockwise from straight up (straight up is 0, right of centre is positive). */
export function angleFromCenter(item: CanvasItem, point: Point): number {
  const c = itemCenter(item)
  return normalizeAngle(Math.atan2(point.x - c.x, -(point.y - c.y)))
}

/** The slope of the connector segment nearest `point`, folded into (-PI/2, PI/2] so text along it never reads upside down. */
export function nearestConnectorAngle(routedItems: CanvasItem[], point: Point, maxDistance = 250): number | null {
  let bestDistance = Infinity
  let bestAngle: number | null = null
  for (const item of routedItems) {
    // Connectors and straight line / arrow strokes both count.
    const straightStroke = item.kind === 'stroke' && !item.erase && (item.shape === 'line' || item.shape === 'arrow') && item.points.length >= 2
    if (item.kind !== 'connector' && !straightStroke) continue
    const path = item.kind === 'connector'
      ? (item.routedPath && item.routedPath.length >= 2 ? item.routedPath : [item.start, item.end])
      : item.kind === 'stroke' ? [item.points[0], item.points[item.points.length - 1]] : []
    for (let i = 1; i < path.length; i += 1) {
      const a = path[i - 1]
      const b = path[i]
      const dx = b.x - a.x
      const dy = b.y - a.y
      if (dx * dx + dy * dy < 1e-9) continue
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)))
      const distance = Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
      if (distance < bestDistance) {
        bestDistance = distance
        bestAngle = Math.atan2(dy, dx)
      }
    }
  }
  if (bestAngle === null || bestDistance > maxDistance) return null
  if (bestAngle > Math.PI / 2 + 1e-9) bestAngle -= Math.PI
  else if (bestAngle <= -Math.PI / 2 + 1e-9) bestAngle += Math.PI
  return bestAngle
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

  /** The whole history as it is now (the stacks are copied; the snapshots in them are never edited), to put back with `restore`. */
  capture(): { undo: CanvasItem[][]; redo: CanvasItem[][] } {
    return { undo: this.undoStack.slice(), redo: this.redoStack.slice() }
  }

  restore(state: { undo: CanvasItem[][]; redo: CanvasItem[][] }) {
    this.undoStack = state.undo.slice()
    this.redoStack = state.redo.slice()
  }

  /** Forgets the newest undo step without applying it (a cancelled drag: its step was recorded when the drag began). */
  discardLast() {
    this.undoStack.pop()
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
/** HLD shapes (service, database, ...) have no bands, so they may shrink further than a three-band class box. */
export const HLD_SHAPE_MIN_SIZE = 32
/** The smallest width and height a resize may give this ink box. */
export function inkBoxMinSize(rectangle: RectangleObject): { width: number; height: number } {
  return rectangle.hldShape ? { width: HLD_SHAPE_MIN_SIZE, height: HLD_SHAPE_MIN_SIZE } : { width: INK_BOX_MIN_WIDTH, height: INK_BOX_MIN_HEIGHT }
}
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
  const min = inkBoxMinSize(rectangle)
  if (width < min.width) width = min.width
  if (height < min.height) height = min.height
  return coverInkBounds({ x, y, width, height }, box)
}

// ---- Desktop: line style of a selection (width, dash, arrowheads) and layer order ----

/** Widest outline the panel offers (same number as MAX_STROKE_WIDTH in app/appConfig.ts). */
const MAX_OUTLINE_WIDTH = 24

/** A plain or HLD shape: not a class box and not an ink class box (a rectangle with ink but no HLD shape). */
function isStyleableBox(item: RectangleObject): boolean {
  return !item.classBox && (!item.inkBox || item.hldShape !== undefined)
}

/** True when the item has an outline width the panel may change: pen/shape strokes (not eraser), plain and HLD shapes, connectors. */
export function hasOutlineWidth(item: CanvasItem): boolean {
  if (item.kind === 'stroke') return !item.erase
  if (item.kind === 'rectangle') return isStyleableBox(item)
  return item.kind === 'connector'
}

/** True when the item can carry a dash: arrow/line strokes, plain and HLD shapes, connectors. */
export function hasLineDash(item: CanvasItem): boolean {
  if (item.kind === 'stroke') return !item.erase && (item.shape === 'arrow' || item.shape === 'line')
  if (item.kind === 'rectangle') return isStyleableBox(item)
  return item.kind === 'connector'
}

const outlineWidthOf = (item: CanvasItem): number => (item.kind === 'stroke' ? item.width : item.kind === 'rectangle' || item.kind === 'connector' ? item.strokeWidth : 0)

/** The width shared by every selected item that has one, or null when they differ or none has one. */
export function selectionStrokeWidth(items: readonly CanvasItem[], keys: ReadonlySet<string>): number | null {
  let found: number | null = null
  for (const item of items) {
    if (!keys.has(canvasItemKey(item)) || !hasOutlineWidth(item)) continue
    const width = outlineWidthOf(item)
    if (found === null) found = width
    else if (found !== width) return null
  }
  return found
}

/** True when the selection holds at least one item whose width can change. */
export function selectionHasOutlineWidth(items: readonly CanvasItem[], keys: ReadonlySet<string>): boolean {
  return items.some((item) => keys.has(canvasItemKey(item)) && hasOutlineWidth(item))
}

/**
 * Items with the outline width of the selected strokes, plain/HLD shapes and connectors set to `width` (1 to 24).
 * Text, code, class boxes and unknown items are left alone. Returns the same array when nothing changes.
 */
export function restrokeItems(items: CanvasItem[], keys: ReadonlySet<string>, width: number): CanvasItem[] {
  if (keys.size === 0 || !Number.isFinite(width)) return items
  const next = Math.min(MAX_OUTLINE_WIDTH, Math.max(1, Math.round(width)))
  let changed = false
  const result = items.map((item): CanvasItem => {
    if (!keys.has(canvasItemKey(item)) || !hasOutlineWidth(item) || outlineWidthOf(item) === next) return item
    changed = true
    return item.kind === 'stroke' ? { ...item, width: next } : { ...(item as RectangleObject | ConnectorObject), strokeWidth: next }
  })
  return changed ? result : items
}

/** The line style the selection shares ('solid' when none is set), or null when it is mixed or nothing in it can be dashed. A connector with the dash of its relationship type counts as dashed. */
export function selectionDash(items: readonly CanvasItem[], keys: ReadonlySet<string>): LineDash | 'solid' | null {
  let found: LineDash | 'solid' | null | undefined
  for (const item of items) {
    if (!keys.has(canvasItemKey(item)) || !hasLineDash(item)) continue
    const dash: LineDash | 'solid' = item.kind === 'connector'
      ? (item.dash ?? (getConnectorRenderSpec(item).lineStyle === 'dashed' ? 'dashed' : 'solid'))
      : (item as Stroke | RectangleObject).dash ?? 'solid'
    if (found === undefined) found = dash
    else if (found !== dash) return null
  }
  return found ?? null
}

/** Sets the line style (null = solid) of the selected arrow/line strokes, plain/HLD shapes and connectors. Same array when nothing changes. */
export function setLineDash(items: CanvasItem[], keys: ReadonlySet<string>, dash: LineDash | null): CanvasItem[] {
  if (keys.size === 0) return items
  let changed = false
  const result = items.map((item): CanvasItem => {
    if (!keys.has(canvasItemKey(item)) || !hasLineDash(item)) return item
    if (item.kind === 'connector') {
      // A connector whose relationship type is dashed keeps drawing dashed when its own dash is removed, so Solid is stored as an override there.
      const wanted: LineDash | 'solid' | undefined = dash ?? (getConnectorRenderSpec(item).lineStyle === 'dashed' ? 'solid' : undefined)
      if (item.dash === wanted) return item
      changed = true
      const { dash: _old, ...rest } = item as ConnectorObject
      return wanted ? { ...rest, dash: wanted } : rest
    }
    const current = (item as Stroke | RectangleObject).dash
    if (current === (dash ?? undefined)) return item
    changed = true
    const { dash: _old, ...rest } = item as Stroke | RectangleObject
    return (dash ? { ...rest, dash } : rest) as CanvasItem
  })
  return changed ? result : items
}

/** True for a selected arrow/line stroke (the only items that have arrowheads to choose). */
export function selectionHasArrowheads(items: readonly CanvasItem[], keys: ReadonlySet<string>): boolean {
  return items.some((item) => item.kind === 'stroke' && !item.erase && keys.has(canvasItemKey(item)) && (item.shape === 'arrow' || item.shape === 'line'))
}

/** The arrowheads the selected arrow/line strokes share, or null when they differ or there are none. */
export function selectionArrowheads(items: readonly CanvasItem[], keys: ReadonlySet<string>): Arrowheads | null {
  let found: Arrowheads | null = null
  for (const item of items) {
    if (item.kind !== 'stroke' || item.erase || !keys.has(canvasItemKey(item)) || (item.shape !== 'arrow' && item.shape !== 'line')) continue
    const heads = strokeArrowheads(item)
    if (found === null) found = heads
    else if (found !== heads) return null
  }
  return found
}

/** Sets the arrowheads of the selected arrow/line strokes. A choice equal to the shape's default is stored as "missing", so old files and defaults stay identical. */
export function setArrowheads(items: CanvasItem[], keys: ReadonlySet<string>, heads: Arrowheads): CanvasItem[] {
  if (keys.size === 0) return items
  let changed = false
  const result = items.map((item): CanvasItem => {
    if (item.kind !== 'stroke' || item.erase || !keys.has(canvasItemKey(item)) || (item.shape !== 'arrow' && item.shape !== 'line')) return item
    if (strokeArrowheads(item) === heads) return item
    changed = true
    const { arrowheads: _old, ...rest } = item
    const isDefault = heads === (item.shape === 'arrow' ? 'end' : 'none')
    return isDefault ? rest : { ...rest, arrowheads: heads }
  })
  return changed ? result : items
}

export type LayerMove = 'forward' | 'backward' | 'front' | 'back'

/**
 * Paint order is array order, so layer order is the order of the array. Moves the items whose keys are given
 * one step toward the front (forward: each passes the next item that is not selected), one step toward the back,
 * or all the way to the front/back. The selected items keep their order among themselves. Opaque items never move.
 * An eraser stroke whose bounds overlap a moving item is a barrier: the item never passes it (it would change what the eraser cut).
 * A box moves together with the connectors attached to it, which stay right after it. Returns the same array when nothing changes.
 */
export function reorderItems(items: CanvasItem[], keys: ReadonlySet<string>, move: LayerMove): CanvasItem[] {
  if (keys.size === 0) return items
  const selectedBoxIds = new Set<number>()
  for (const item of items) if (item.kind === 'rectangle' && keys.has(canvasItemKey(item))) selectedBoxIds.add(item.id)
  const attachedTo = (item: CanvasItem): number[] => item.kind === 'connector'
    ? [item.startAttachment?.rectangleId, item.endAttachment?.rectangleId].filter((id): id is number => id !== undefined && selectedBoxIds.has(id))
    : []
  const moving = (item: CanvasItem) => item.kind !== 'opaque' && (keys.has(canvasItemKey(item)) || attachedTo(item).length > 0)
  const boundsCache = new Map<CanvasItem, RectangleBounds | null>()
  const boundsOf = (item: CanvasItem) => {
    if (!boundsCache.has(item)) boundsCache.set(item, paintBounds(item))
    return boundsCache.get(item) ?? null
  }
  const blocks = (mover: CanvasItem, other: CanvasItem): boolean => {
    if (other.kind !== 'stroke' || !other.erase || mover.kind === 'connector') return false
    const a = boundsOf(mover)
    const b = boundsOf(other)
    return a !== null && b !== null && boundsOverlap(a, b)
  }
  const result = items.slice()
  const whole = move === 'front' || move === 'back'
  // Slides one item toward the front (+1) or back (-1): one step, or as far as it can go.
  const slide = (from: number, direction: 1 | -1) => {
    let index = from
    for (;;) {
      const next = index + direction
      if (next < 0 || next >= result.length) return
      const other = result[next]
      if (moving(other) || (!whole && other.kind === 'opaque') || blocks(result[index], other)) return
      ;[result[index], result[next]] = [result[next], result[index]]
      index = next
      if (!whole) return
    }
  }
  if (move === 'forward' || move === 'front') {
    for (let index = result.length - 1; index >= 0; index -= 1) if (moving(result[index])) slide(index, 1)
  } else {
    for (let index = 0; index < result.length; index += 1) if (moving(result[index])) slide(index, -1)
  }
  if (selectedBoxIds.size > 0) {
    // Keep each attached connector right after the box it belongs to (after the later box when it joins two moving boxes).
    const connectors = result.filter((item) => attachedTo(item).length > 0)
    const pulled = new Set<CanvasItem>(connectors)
    const rest = result.filter((item) => !pulled.has(item))
    const anchorIndex = (connector: CanvasItem) => Math.max(...attachedTo(connector).map((id) => rest.findIndex((item) => item.kind === 'rectangle' && item.id === id)))
    const after = new Map<number, CanvasItem[]>()
    for (const connector of connectors) {
      const at = anchorIndex(connector)
      after.set(at, [...(after.get(at) ?? []), connector])
    }
    result.length = 0
    rest.forEach((item, index) => { result.push(item, ...(after.get(index) ?? [])) })
  }
  return result.every((item, index) => item === items[index]) ? items : result
}
