import type { Point, Stroke } from './canvasModel'

/** The whole-object eraser removes what is within about this many screen px of the pen tip (see hitTestObject). */
export const WHOLE_ERASER_HIT_RADIUS_PX = 8

/** Diameter (screen px) of the circle shown at the pen tip: the real eraser width for the stroke eraser, the hit area for the whole eraser. */
export function eraserCursorDiameter(eraserSize: number, viewportScale: number, wholeObject: boolean): number {
  return wholeObject ? WHOLE_ERASER_HIT_RADIUS_PX * 2 : Math.max(6, eraserSize * viewportScale)
}

export function createEraserStroke(id: number, point: Point, color: string, width: number): Stroke {
  return { kind: 'stroke', id, points: [point], color, width, erase: true }
}

export function getEraserSweepPoints(start: Point, end: Point, maxSpacing: number): Point[] {
  const spacing = Math.max(0.5, maxSpacing)
  const distance = Math.hypot(end.x - start.x, end.y - start.y)
  const steps = Math.max(1, Math.ceil(distance / spacing))
  return Array.from({ length: steps }, (_, index) => {
    const progress = (index + 1) / steps
    return {
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress,
      pressure: start.pressure + (end.pressure - start.pressure) * progress,
    }
  })
}
