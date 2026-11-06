import type { Point, Stroke } from './canvasModel'

/**
 * Drops pen samples that do not change what a stroke looks like, so its point count (and the cost of drawing,
 * saving and undoing it) depends on its shape, not on the pen's sample rate.
 *
 * Ramer-Douglas-Peucker: a point is kept when it lies more than `tolerance` canvas units from the line between the
 * kept points around it, or when its pressure differs from the pressure interpolated along that line by more than
 * `pressureTolerance` (pressure sets the line width). The first and last points are always kept.
 */
export const THIN_DISTANCE_TOLERANCE = 0.12
export const THIN_PRESSURE_TOLERANCE = 0.04

export function thinPoints(points: Point[], tolerance = THIN_DISTANCE_TOLERANCE, pressureTolerance = THIN_PRESSURE_TOLERANCE): Point[] {
  const n = points.length
  if (n <= 2) return points
  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1
  const stack: number[] = [0, n - 1]
  while (stack.length) {
    const end = stack.pop() as number
    const start = stack.pop() as number
    if (end - start < 2) continue
    const a = points[start]
    const b = points[end]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSquared = dx * dx + dy * dy
    let worst = -1
    let worstScore = 1
    for (let i = start + 1; i < end; i += 1) {
      const p = points[i]
      let t = lengthSquared > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared : 0
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const ex = p.x - (a.x + t * dx)
      const ey = p.y - (a.y + t * dy)
      const distance = Math.sqrt(ex * ex + ey * ey)
      const pressureError = Math.abs(p.pressure - (a.pressure + (b.pressure - a.pressure) * ((i - start) / (end - start))))
      const score = Math.max(distance / tolerance, pressureError / pressureTolerance)
      if (score > worstScore) {
        worstScore = score
        worst = i
      }
    }
    if (worst < 0) continue
    keep[worst] = 1
    stack.push(start, worst, worst, end)
  }
  const result: Point[] = []
  for (let i = 0; i < n; i += 1) if (keep[i]) result.push(points[i])
  return result
}

/** Pen strokes only; erasers, shapes and anything with few points are returned unchanged (same object). */
export function thinStroke(stroke: Stroke): Stroke {
  if (stroke.kind !== 'stroke' || stroke.erase || stroke.shape || stroke.points.length < 4) return stroke
  const points = thinPoints(stroke.points)
  return points.length === stroke.points.length ? stroke : { ...stroke, points }
}
