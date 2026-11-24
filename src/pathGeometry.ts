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
