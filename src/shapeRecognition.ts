import type { RectangleObject, Stroke } from './canvasModel'

export const SHAPE_RECOGNITION_HOLD_MS = 450

export function recognizeRectangleStroke(stroke: Stroke, id: number): RectangleObject | null {
  const points = stroke.points
  if (points.length < 6 || stroke.erase) return null
  const first = points[0]
  const last = points[points.length - 1]
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const left = Math.min(...xs)
  const right = Math.max(...xs)
  const top = Math.min(...ys)
  const bottom = Math.max(...ys)
  const boxWidth = right - left
  const boxHeight = bottom - top
  const diagonal = Math.hypot(boxWidth, boxHeight)

  // A roughly closed path with a rectangle-like perimeter becomes a UML class box.
  if (diagonal <= 36 || Math.hypot(first.x - last.x, first.y - last.y) >= diagonal * 0.32) return null
  let pathLength = 0
  for (let index = 1; index < points.length; index += 1) {
    pathLength += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y)
  }
  const perimeter = 2 * (boxWidth + boxHeight)
  if (boxWidth <= 38 || boxHeight <= 30 || pathLength / perimeter <= 0.68 || pathLength / perimeter >= 1.65) return null

  return {
    kind: 'rectangle',
    id,
    x: left,
    y: top,
    width: boxWidth,
    height: boxHeight,
    strokeColor: stroke.color,
    strokeWidth: stroke.width,
  }
}

export function recognizeRectangleOnHold(stroke: Stroke, heldForMs: number, id: number): RectangleObject | null {
  if (heldForMs < SHAPE_RECOGNITION_HOLD_MS) return null
  return recognizeRectangleStroke(stroke, id)
}
