import { getConnectorRenderSpec } from './canvasModel'
import type { CanvasItem, Point, Stroke } from './canvasModel'

const SAMPLE_SPACING = 4

function canvasItemKey(item: CanvasItem): string {
  return `${item.kind}:${item.id}`
}

function pointOnSegment(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (!lengthSquared) return Math.hypot(point.x - a.x, point.y - a.y) < 0.75
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)) < 0.75
}

export function pointInLasso(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[j]
    const b = polygon[i]
    if (pointOnSegment(point, a, b)) return true
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (crosses) inside = !inside
  }
  return inside
}

function arrowSegments(stroke: Stroke): Array<[Point, Point]> {
  if (stroke.points.length < 2) return []
  const [start, end] = stroke.points
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const headLength = Math.max(12, stroke.width * 3.5)
  const left = { x: end.x - headLength * Math.cos(angle - Math.PI / 6), y: end.y - headLength * Math.sin(angle - Math.PI / 6), pressure: 1 }
  const right = { x: end.x - headLength * Math.cos(angle + Math.PI / 6), y: end.y - headLength * Math.sin(angle + Math.PI / 6), pressure: 1 }
  return [[start, end], [end, left], [end, right]]
}

function strokeSegments(stroke: Stroke): Array<[Point, Point]> {
  if (stroke.shape === 'arrow') return arrowSegments(stroke)
  if (stroke.shape === 'line') return stroke.points.length >= 2 ? [[stroke.points[0], stroke.points[1]]] : []
  return stroke.points.slice(1).map((point, index) => [stroke.points[index], point])
}

function itemSegments(item: CanvasItem): Array<[Point, Point]> {
  if (item.kind === 'connector') return [[item.start, item.end]]
  return item.kind === 'stroke' ? strokeSegments(item) : []
}

function distanceToSegment(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[j]
    const b = polygon[i]
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function connectorSymbolHitTest(item: Extract<CanvasItem, { kind: 'connector' }>, point: Point, tolerance: number) {
  const spec = getConnectorRenderSpec(item)
  if (!spec.endpoint || spec.symbol === 'none') return false
  const dx = item.end.x - item.start.x
  const dy = item.end.y - item.start.y
  const length = Math.hypot(dx, dy)
  if (!length) return false
  const unit = { x: dx / length, y: dy / length }
  const normal = { x: -unit.y, y: unit.x }
  const atStart = spec.endpoint === 'start'
  const tip = atStart ? item.start : item.end
  const towardOther = atStart ? unit : { x: -unit.x, y: -unit.y }
  const symbolLength = Math.min(Math.max(12, item.strokeWidth * 4), length * (spec.symbol.includes('diamond') ? 0.23 : 0.42))
  const halfWidth = symbolLength * 0.52
  const base = { x: tip.x + towardOther.x * symbolLength, y: tip.y + towardOther.y * symbolLength }
  const sideA = { x: base.x + normal.x * halfWidth, y: base.y + normal.y * halfWidth, pressure: 1 }
  const sideB = { x: base.x - normal.x * halfWidth, y: base.y - normal.y * halfWidth, pressure: 1 }
  const tipPoint = { ...tip, pressure: 1 }

  if (spec.symbol === 'hollow-triangle') {
    const triangle = [tipPoint, sideA, sideB]
    return pointInPolygon(point, triangle) || triangle.some((vertex, index) => distanceToSegment(point, vertex, triangle[(index + 1) % triangle.length]) <= tolerance + item.strokeWidth / 2)
  }
  if (spec.symbol === 'open-arrow') {
    return distanceToSegment(point, tipPoint, sideA) <= tolerance + item.strokeWidth / 2
      || distanceToSegment(point, tipPoint, sideB) <= tolerance + item.strokeWidth / 2
  }

  const far = { x: tip.x + towardOther.x * symbolLength * 2, y: tip.y + towardOther.y * symbolLength * 2, pressure: 1 }
  const diamond = [tipPoint, sideA, far, sideB]
  return pointInPolygon(point, diamond) || diamond.some((vertex, index) => distanceToSegment(point, vertex, diamond[(index + 1) % diamond.length]) <= tolerance + item.strokeWidth / 2)
}

export function itemHitTest(item: CanvasItem, point: Point, tolerance = 12): boolean {
  if (item.kind === 'connector') {
    const [a, b] = [item.start, item.end]
    return distanceToSegment(point, a, b) <= tolerance + item.strokeWidth / 2
      || connectorSymbolHitTest(item, point, tolerance)
  }
  if (item.kind === 'rectangle') {
    return point.x >= item.x - tolerance && point.x <= item.x + item.width + tolerance
      && point.y >= item.y - tolerance && point.y <= item.y + item.height + tolerance
  }
  if (item.erase || item.points.length === 0) return false
  const segments = strokeSegments(item)
  if (segments.length === 0) return item.points.length === 1 && Math.hypot(point.x - item.points[0].x, point.y - item.points[0].y) <= tolerance
  return segments.some(([a, b]) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSquared = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
    return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)) <= tolerance + item.width / 2
  })
}

function segmentSamples(a: Point, b: Point) {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const steps = Math.max(1, Math.ceil(length / SAMPLE_SPACING))
  return Array.from({ length: steps }, (_, i) => ({
    point: { x: a.x + (b.x - a.x) * ((i + 0.5) / steps), y: a.y + (b.y - a.y) * ((i + 0.5) / steps), pressure: 1 },
    length: length / steps,
  }))
}

function pathInsideRatio(segments: Array<[Point, Point]>, polygon: Point[]) {
  let total = 0
  let inside = 0
  for (const [a, b] of segments) {
    for (const sample of segmentSamples(a, b)) {
      total += sample.length
      if (pointInLasso(sample.point, polygon)) inside += sample.length
    }
  }
  return total === 0 ? 0 : inside / total
}

export function selectItemsByLasso(items: CanvasItem[], polygon: Point[]): string[] {
  if (polygon.length < 3) return []
  const selected: string[] = []
  for (const item of items) {
    if (item.kind === 'connector') {
      // Connectors are atomic and must be almost entirely enclosed. This avoids selecting
      // a relationship just because a lasso loop crosses its path.
      if (pointInLasso(item.start, polygon) && pointInLasso(item.end, polygon)
        && pathInsideRatio(itemSegments(item), polygon) >= 0.98) selected.push(canvasItemKey(item))
      continue
    }
    if (item.kind === 'rectangle') {
      const center = { x: item.x + item.width / 2, y: item.y + item.height / 2, pressure: 1 }
      if (pointInLasso(center, polygon)) selected.push(canvasItemKey(item))
      continue
    }
    if (item.erase || item.points.length === 0) continue
    if (item.shape === 'line' || item.shape === 'arrow') {
      // Require the visible connector, including arrowheads, to be enclosed.
      if (pathInsideRatio(strokeSegments(item), polygon) >= 0.98) selected.push(canvasItemKey(item))
      continue
    }
    if (item.points.length === 1) {
      if (pointInLasso(item.points[0], polygon)) selected.push(canvasItemKey(item))
      continue
    }
    if (pathInsideRatio(strokeSegments(item), polygon) > 0.5) selected.push(canvasItemKey(item))
  }
  return selected
}
