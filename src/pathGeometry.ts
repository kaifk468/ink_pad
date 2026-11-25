import type { Point } from './canvasModel'

/** Length of a polyline. */
export function pathLength(path: readonly Point[]): number {
  let total = 0
  for (let i = 1; i < path.length; i += 1) total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
  return total
}

/** The point `distance` along a polyline from its start (clamped to the ends), and the direction of the segment it is on. */
export function pointAlongPath(path: readonly Point[], distance: number): { point: Point; direction: { x: number; y: number } } {
  if (path.length === 0) return { point: { x: 0, y: 0, pressure: 1 }, direction: { x: 1, y: 0 } }
  let remaining = Math.max(0, distance)
  let direction = { x: 1, y: 0 }
  for (let i = 1; i < path.length; i += 1) {
    const length = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
    if (length <= 0) continue
    direction = { x: (path[i].x - path[i - 1].x) / length, y: (path[i].y - path[i - 1].y) / length }
    if (remaining <= length) {
      const t = remaining / length
      return { point: { x: path[i - 1].x + (path[i].x - path[i - 1].x) * t, y: path[i - 1].y + (path[i].y - path[i - 1].y) * t, pressure: 1 }, direction }
    }
    remaining -= length
  }
  return { point: { ...path[path.length - 1] }, direction }
}

/** The point halfway along a path, measured along its length. */
export function pathMidpoint(path: Point[]): Point {
  if (path.length === 0) return { x: 0, y: 0, pressure: 1 }
  const total = pathLength(path)
  if (total === 0) return { ...path[0] }
  return pointAlongPath(path, total / 2).point
}

/** The point at `fraction` (0..1) of a path's length. */
export function pointAtPathFraction(path: readonly Point[], fraction: number): Point {
  const total = pathLength(path)
  if (path.length === 0) return { x: 0, y: 0, pressure: 1 }
  if (total === 0) return { ...path[0] }
  return pointAlongPath(path, total * Math.max(0, Math.min(1, fraction))).point
}

/** Where along a path (0..1 of its length) the point on the path nearest to `point` lies. 0 for an empty or zero-length path. */
export function pathFractionNearest(path: readonly Point[], point: { x: number; y: number }): number {
  const total = pathLength(path)
  if (total === 0) return 0
  let best = Infinity
  let bestArc = 0
  let arc = 0
  for (let i = 1; i < path.length; i += 1) {
    const ax = path[i - 1].x
    const ay = path[i - 1].y
    const dx = path[i].x - ax
    const dy = path[i].y - ay
    const length = Math.hypot(dx, dy)
    if (length <= 0) continue
    const t = Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.y - ay) * dy) / (length * length)))
    const distance = Math.hypot(point.x - (ax + dx * t), point.y - (ay + dy * t))
    if (distance < best) { best = distance; bestArc = arc + length * t }
    arc += length
  }
  return bestArc / total
}
