import type { CanvasItem, ConnectorObject, Point, RectangleObject } from './canvasModel'

/**
 * Elbow routing for connectors: a connector can be a straight line (default) or a line with right angles.
 *
 * The bent path is never stored. It is worked out from the connector's two ends and the boxes it is attached to,
 * every time it is needed, and handed to the code that draws, measures, hit-tests and exports it as `routedPath` on a
 * copy of the connector (`routeConnectors`). So moving or resizing a box re-routes the line by itself, and a saved
 * file only gains the optional `routing` field.
 *
 * This file only imports types, so canvasModel.ts can use it without an import cycle.
 */

/** How far a line leaves a box straight out before it may turn (canvas units). Also keeps room for arrowheads and diamonds. */
export const ELBOW_STUB = 28
/** Extra length a bend costs when choosing between routes, so fewer bends win over a slightly shorter path. */
const BEND_PENALTY = 40
/** How far outside the two ends a detour (C or U shape) runs. */
const DETOUR_PAD = 36
const EPSILON = 0.5

type Dir = { x: number; y: number }
type Box = Pick<RectangleObject, 'x' | 'y' | 'width' | 'height'>

function point(x: number, y: number, pressure: number): Point {
  return { x, y, pressure }
}

/** The direction pointing straight out of the box side that `p` lies on (the nearest side). */
function outwardDirection(box: Box, p: Point): Dir {
  const sides: Array<{ distance: number; dir: Dir }> = [
    { distance: Math.abs(p.x - box.x), dir: { x: -1, y: 0 } },
    { distance: Math.abs(p.x - (box.x + box.width)), dir: { x: 1, y: 0 } },
    { distance: Math.abs(p.y - box.y), dir: { x: 0, y: -1 } },
    { distance: Math.abs(p.y - (box.y + box.height)), dir: { x: 0, y: 1 } },
  ]
  return sides.reduce((best, side) => (side.distance < best.distance ? side : best)).dir
}

/** For an end that is not on a box: leave along the longer way towards the other end. */
function dominantDirection(from: Point, to: Point): Dir {
  const dx = to.x - from.x
  const dy = to.y - from.y
  return Math.abs(dx) >= Math.abs(dy) ? { x: dx >= 0 ? 1 : -1, y: 0 } : { x: 0, y: dy >= 0 ? 1 : -1 }
}

function sameDirection(a: Dir, b: Dir): boolean {
  return a.x * b.x + a.y * b.y > 0.99
}

/** Removes repeated points and the middle point of three points on one line. */
function simplify(points: Point[]): Point[] {
  const distinct: Point[] = []
  for (const p of points) {
    const last = distinct[distinct.length - 1]
    if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.y - p.y) > 0.01) distinct.push(p)
  }
  const result: Point[] = []
  for (let index = 0; index < distinct.length; index += 1) {
    const prev = result[result.length - 1]
    const current = distinct[index]
    const next = distinct[index + 1]
    if (prev && next) {
      const ax = current.x - prev.x
      const ay = current.y - prev.y
      const bx = next.x - current.x
      const by = next.y - current.y
      if (Math.abs(ax * by - ay * bx) < 0.01 && ax * bx + ay * by > 0) continue
    }
    result.push(current)
  }
  return result
}

function segmentDirection(a: Point, b: Point): Dir {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
}

/** True when an up/down/left/right segment passes through the inside of the box (touching the border does not count). */
function segmentCrossesBox(a: Point, b: Point, box: Box): boolean {
  const left = box.x + EPSILON
  const right = box.x + box.width - EPSILON
  const top = box.y + EPSILON
  const bottom = box.y + box.height - EPSILON
  if (right <= left || bottom <= top) return false
  if (Math.abs(a.y - b.y) < 0.01) return a.y > top && a.y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right
  if (Math.abs(a.x - b.x) < 0.01) return a.x > left && a.x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom
  return false
}

type Rules = { startDir: Dir; endDir: Dir; obstacles: Box[] }

/** Length plus a cost per bend, or null when the path turns back on itself, leaves an end the wrong way, or goes through a box. */
function scorePath(path: Point[], rules: Rules): number | null {
  if (path.length < 2) return null
  let length = 0
  let previous: Dir | null = null
  let bends = 0
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1]
    const b = path[index]
    length += Math.hypot(b.x - a.x, b.y - a.y)
    if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) return null
    const dir = segmentDirection(a, b)
    if (previous) {
      if (previous.x * dir.x + previous.y * dir.y < -0.99) return null
      if (!sameDirection(previous, dir)) bends += 1
    }
    previous = dir
    if (rules.obstacles.some((box) => segmentCrossesBox(a, b, box))) return null
  }
  if (!sameDirection(segmentDirection(path[0], path[1]), rules.startDir)) return null
  const last = path.length - 1
  if (!sameDirection(segmentDirection(path[last - 1], path[last]), { x: -rules.endDir.x, y: -rules.endDir.y })) return null
  return length + bends * BEND_PENALTY
}

/**
 * A path with right angles from `start` to `end`. An end on a box leaves that box straight out of the side it sits on,
 * after a short stub; a free end leaves along the longer way towards the other end. `obstacles` are boxes the line must
 * not go through (for now the two boxes it is attached to). Returns the points from start to end.
 */
export function elbowPath(start: Point, end: Point, startBox?: Box, endBox?: Box, obstacles: Box[] = []): Point[] {
  if (Math.abs(start.x - end.x) < 0.01 && Math.abs(start.y - end.y) < 0.01) return [start, end]
  const startDir = startBox ? outwardDirection(startBox, start) : dominantDirection(start, end)
  const endDir = endBox ? outwardDirection(endBox, end) : dominantDirection(end, start)
  const a = startBox ? point(start.x + startDir.x * ELBOW_STUB, start.y + startDir.y * ELBOW_STUB, start.pressure) : start
  const b = endBox ? point(end.x + endDir.x * ELBOW_STUB, end.y + endDir.y * ELBOW_STUB, end.pressure) : end
  const pressure = start.pressure
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  const farX = [Math.max(a.x, b.x) + DETOUR_PAD, Math.min(a.x, b.x) - DETOUR_PAD]
  const farY = [Math.max(a.y, b.y) + DETOUR_PAD, Math.min(a.y, b.y) - DETOUR_PAD]
  const middles: Point[][] = [
    [],
    [point(b.x, a.y, pressure)],
    [point(a.x, b.y, pressure)],
    [point(midX, a.y, pressure), point(midX, b.y, pressure)],
    [point(a.x, midY, pressure), point(b.x, midY, pressure)],
    ...farX.map((x) => [point(x, a.y, pressure), point(x, b.y, pressure)]),
    ...farY.map((y) => [point(a.x, y, pressure), point(b.x, y, pressure)]),
  ]
  const candidates = middles.map((middle) => simplify([start, ...(startBox ? [a] : []), ...middle, ...(endBox ? [b] : []), end]))
  const rules: Rules = { startDir, endDir, obstacles }
  for (const ruleSet of [rules, { ...rules, obstacles: [] }]) {
    let best: Point[] | null = null
    let bestScore = Infinity
    for (const candidate of candidates) {
      const score = scorePath(candidate, ruleSet)
      if (score !== null && score < bestScore) { best = candidate; bestScore = score }
    }
    if (best) return best
  }
  // Nothing satisfied the exit rules (for example two boxes sitting on top of each other): a plain right-angle Z.
  return Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)
    ? simplify([start, point(midX, start.y, pressure), point(midX, end.y, pressure), end])
    : simplify([start, point(start.x, midY, pressure), point(end.x, midY, pressure), end])
}

const routeCache = new WeakMap<ConnectorObject, { signature: string; routed: ConnectorObject }>()

function boxSignature(box: Box | undefined): string {
  return box ? `${box.x},${box.y},${box.width},${box.height}` : '-'
}

/** The connector with its right-angle path filled in (a copy, cached while the ends and the attached boxes stay put). Straight connectors come back unchanged. */
export function routeConnector(connector: ConnectorObject, rectangles: ReadonlyMap<number, RectangleObject>): ConnectorObject {
  if (connector.routing !== 'elbow') return connector
  const startBox = connector.startAttachment ? rectangles.get(connector.startAttachment.rectangleId) : undefined
  const endBox = connector.endAttachment ? rectangles.get(connector.endAttachment.rectangleId) : undefined
  const signature = `${connector.start.x},${connector.start.y},${connector.end.x},${connector.end.y}|${boxSignature(startBox)}|${boxSignature(endBox)}`
  const cached = routeCache.get(connector)
  if (cached && cached.signature === signature) return cached.routed
  const obstacles = [startBox, endBox].filter((box): box is RectangleObject => Boolean(box))
  const routed: ConnectorObject = { ...connector, routedPath: elbowPath(connector.start, connector.end, startBox, endBox, obstacles) }
  routeCache.set(connector, { signature, routed })
  return routed
}

/**
 * The same list (same length, same order, so an index into it is an index into the original) with every elbow connector
 * replaced by its routed copy. Use it for drawing, measuring, hit-testing and exporting; never store its result.
 * Returns the very same array when no connector needs routing.
 */
export function routeConnectors(items: CanvasItem[]): CanvasItem[] {
  let rectangles: Map<number, RectangleObject> | null = null
  let result: CanvasItem[] | null = null
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (item.kind !== 'connector' || item.routing !== 'elbow') continue
    if (!rectangles) {
      rectangles = new Map()
      for (const other of items) if (other.kind === 'rectangle') rectangles.set(other.id, other)
    }
    const routed = routeConnector(item, rectangles)
    if (routed === item) continue
    if (!result) result = items.slice()
    result[index] = routed
  }
  return result ?? items
}
