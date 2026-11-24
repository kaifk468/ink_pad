/**
 * The laser pointer's trail maths. The laser is a transient tool for presenting: it draws a short red trail that fades
 * on its own and saves nothing. Points are screen coordinates (CSS pixels) with the time they were made, so the trail
 * never touches canvas items, history or the saved diagram.
 */
export type LaserPoint = { x: number; y: number; at: number }
export type LaserSegment = { x1: number; y1: number; x2: number; y2: number; alpha: number }

/** How long a point stays visible, in ms: the trail fades out within about a second. */
export const LASER_LIFETIME_MS = 900
/** A hard cap on the points kept, so a long drag cannot grow the list without bound. */
export const LASER_MAX_POINTS = 240
/** A move shorter than this (screen px) from the last point adds nothing. */
export const LASER_MIN_STEP = 0.75

/** The points still visible at `now` (younger than the lifetime), oldest first. */
export function pruneLaser(points: readonly LaserPoint[], now: number): LaserPoint[] {
  const kept = points.filter((point) => now - point.at < LASER_LIFETIME_MS)
  return kept.length > LASER_MAX_POINTS ? kept.slice(kept.length - LASER_MAX_POINTS) : kept
}

/** The list after adding a point at `now`; old points are pruned and a near-duplicate of the last point is ignored. */
export function addLaserPoint(points: readonly LaserPoint[], x: number, y: number, now: number): LaserPoint[] {
  const kept = pruneLaser(points, now)
  const last = kept[kept.length - 1]
  if (last && Math.hypot(x - last.x, y - last.y) < LASER_MIN_STEP) return kept
  return pruneLaser([...kept, { x, y, at: now }], now)
}

/** Opacity of a point: 1 when new, falling to 0 at the lifetime (squared, so the tail thins out quickly). */
export function laserAlpha(point: LaserPoint, now: number): number {
  const life = 1 - (now - point.at) / LASER_LIFETIME_MS
  if (life <= 0) return 0
  return Math.min(1, life) ** 1.5
}

/** The line segments to paint at `now`, each with the opacity of its newer end. A single point gives none. */
export function laserSegments(points: readonly LaserPoint[], now: number): LaserSegment[] {
  const segments: LaserSegment[] = []
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    const alpha = laserAlpha(to, now)
    if (alpha > 0) segments.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, alpha })
  }
  return segments
}

/** True while something is still visible, i.e. the animation loop must keep running. */
export function laserVisible(points: readonly LaserPoint[], now: number): boolean {
  return points.some((point) => laserAlpha(point, now) > 0)
}

/**
 * What a touch-down does to the laser while it is on. `activeType` is the pointerType of the pointer drawing the trail (null when none).
 * A pen or mouse trail is never ended by a touch (a resting palm); a touch trail starts with the first finger when no pen is near and
 * ends with the second finger (both go to navigation).
 */
export function laserOnTouchDown(activeType: string | null, touchCount: number, penNear: boolean): 'start' | 'keep' | 'clear' {
  if (activeType === 'pen' || activeType === 'mouse') return 'keep'
  if (touchCount === 1 && !penNear) return 'start'
  return 'clear'
}
