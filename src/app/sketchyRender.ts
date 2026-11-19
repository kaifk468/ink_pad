import { connectorPoints, strokeArrowheads } from '../canvasModel'
import type { ConnectorObject, RectangleObject, Stroke } from '../canvasModel'
import { plainFillPath, rectangleFill, sketchyConnectorShape, sketchyRectangleShape, sketchyStrokeParts, type SketchyConnector, type SketchyShape } from '../sketchy'

/**
 * Canvas side of the hand-drawn style. Outlines are generated once per item and kept (items are immutable, so a WeakMap
 * keyed by the item is enough); a redraw, pan or zoom only strokes the kept Path2D. Items that are rebuilt every frame
 * (routed elbow connectors, the shape preview) are found again by kind+id and a numeric key of their geometry.
 */

export const sketchyStats = { builds: 0 }

type Entry<T> = { key: number[]; value: T }
const sameKey = (a: number[], b: number[]) => a.length === b.length && a.every((value, index) => value === b[index])
const MAX_BY_ID = 4000

function makeCache<T>() {
  const byItem = new WeakMap<object, Entry<T>>()
  const byId = new Map<string, Entry<T>>()
  return (item: object, id: string, key: number[], build: () => T): T => {
    const hit = byItem.get(item)
    if (hit && sameKey(hit.key, key)) return hit.value
    const second = byId.get(id)
    if (second && sameKey(second.key, key)) {
      byItem.set(item, second)
      return second.value
    }
    sketchyStats.builds += 1
    const entry = { key, value: build() }
    byItem.set(item, entry)
    if (byId.size >= MAX_BY_ID) byId.clear()
    byId.set(id, entry)
    return entry.value
  }
}

type PathPair = { outline: Path2D; fill: Path2D }
const shapeCache = makeCache<PathPair & { text: SketchyShape }>()
const plainFillCache = makeCache<Path2D>()
const strokeCache = makeCache<{ line: Path2D; heads: Path2D | null } | null>()
const connectorCache = makeCache<{ line: Path2D; head: Path2D | null; spec: SketchyConnector }>()

const flag = (rectangle: RectangleObject) => (rectangle.hldShape === 'database' ? 1 : rectangle.hldShape === 'queue' ? 2 : 0) + (rectangle.ellipse ? 4 : 0) + (rectangle.diamond ? 8 : 0)

function rectangleKey(rectangle: RectangleObject): number[] {
  return [rectangle.x, rectangle.y, rectangle.width, rectangle.height, rectangle.seed ?? -1, flag(rectangle)]
}

function sketchyShapePaths(rectangle: RectangleObject) {
  return shapeCache(rectangle, `r${rectangle.id}`, rectangleKey(rectangle), () => {
    const text = sketchyRectangleShape(rectangle)
    return { text, outline: new Path2D(text.outline), fill: new Path2D(text.fill) }
  })
}

/** Strokes the hand-drawn outline of a plain box, diamond, ellipse, database or queue (the caller has set up colour, width and rotation). */
export function strokeSketchyRectangle(ctx: CanvasRenderingContext2D, rectangle: RectangleObject): void {
  ctx.stroke(sketchyShapePaths(rectangle).outline)
}

/** Paints a shape's fill colour (nothing when it has none, or cannot carry one). In the hand-drawn style it follows the wobbly outline. */
export function fillRectangle(ctx: CanvasRenderingContext2D, rectangle: RectangleObject, sketchy: boolean, sketchable: boolean): void {
  const color = rectangleFill(rectangle)
  if (!color) return
  ctx.save()
  ctx.fillStyle = color
  if (sketchy && sketchable) ctx.fill(sketchyShapePaths(rectangle).fill, 'nonzero')
  else ctx.fill(plainFillCache(rectangle, `p${rectangle.id}`, rectangleKey(rectangle), () => new Path2D(plainFillPath(rectangle))), 'nonzero')
  ctx.restore()
}

/** Strokes a straight line or arrow stroke in the hand-drawn style; false when the stroke is not one. The caller's dash applies to the shaft only, never the heads. */
export function strokeSketchyStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): boolean {
  const headCode = strokeArrowheads(stroke) === 'none' ? 0 : strokeArrowheads(stroke) === 'end' ? 1 : strokeArrowheads(stroke) === 'start' ? 2 : 3
  const key = [stroke.width, stroke.points[0]?.x ?? 0, stroke.points[0]?.y ?? 0, stroke.points[1]?.x ?? 0, stroke.points[1]?.y ?? 0, headCode]
  const paths = strokeCache(stroke, `s${stroke.id}`, key, () => {
    const parts = sketchyStrokeParts(stroke)
    return parts ? { line: new Path2D(parts.line), heads: parts.heads ? new Path2D(parts.heads) : null } : null
  })
  if (!paths) return false
  ctx.lineWidth = stroke.width
  ctx.stroke(paths.line)
  if (paths.heads) {
    ctx.setLineDash([])
    ctx.stroke(paths.heads)
  }
  return true
}

/** Draws a connector in the hand-drawn style (the caller has saved the context and set colour, width and dash). */
export function drawSketchyConnector(ctx: CanvasRenderingContext2D, connector: ConnectorObject, color: string, width: number): void {
  const key = [width, [...connector.relationshipType].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7), connector.reversed ? 1 : 0, ...connectorPoints(connector).flatMap((p) => [p.x, p.y])]
  const paths = connectorCache(connector, `c${connector.id}`, key, () => {
    const spec = sketchyConnectorShape(connector, width)
    return { spec, line: new Path2D(spec.line), head: spec.head ? new Path2D(spec.head) : null }
  })
  ctx.stroke(paths.line)
  if (!paths.head) return
  ctx.setLineDash([])
  if (paths.spec.headClosed && paths.spec.headFill) {
    ctx.fillStyle = paths.spec.headFill === 'color' ? color : '#ffffff'
    ctx.fill(paths.head)
  }
  ctx.stroke(paths.head)
}
