import type { Point, Stroke } from './canvasModel'

export function isPenHoverEraseInput(
  pointerType: string,
  buttons: number,
  eraserEnabled: boolean,
  wholeObjectEraserEnabled: boolean,
): boolean {
  return pointerType === 'pen' && buttons === 0 && eraserEnabled && !wholeObjectEraserEnabled
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
