import type { Point } from './canvasModel'

export type StrokeCurveSegment = {
  from: Point
  control?: Point
  to: Point
  pressure: number
  curved: boolean
}

export type InterpolatingStrokeSegment = {
  from: Point
  control1?: Point
  control2?: Point
  to: Point
  pressure: number
  curved: boolean
}

// Straight fallback is reserved for near-reversals; ordinary letter bends stay curved.
export const RAW_STROKE_CORNER_ANGLE_RADIANS = Math.PI * 0.75

function distance(left: Point, right: Point): number {
  return Math.hypot(right.x - left.x, right.y - left.y)
}

function extrapolate(from: Point, through: Point): Point {
  return { x: through.x * 2 - from.x, y: through.y * 2 - from.y, pressure: through.pressure * 2 - from.pressure }
}

function isSharpCorner(points: Point[], index: number, threshold: number): boolean {
  if (index <= 0 || index >= points.length - 1) return false
  const previous = points[index - 1]
  const current = points[index]
  const next = points[index + 1]
  const incomingX = current.x - previous.x
  const incomingY = current.y - previous.y
  const outgoingX = next.x - current.x
  const outgoingY = next.y - current.y
  const incomingLength = Math.hypot(incomingX, incomingY)
  const outgoingLength = Math.hypot(outgoingX, outgoingY)
  if (incomingLength === 0 || outgoingLength === 0) return false
  const cosine = Math.max(-1, Math.min(1, (incomingX * outgoingX + incomingY * outgoingY) / (incomingLength * outgoingLength)))
  const turn = Math.acos(cosine)
  if (turn < threshold) return false

  return turn >= threshold
}

/**
 * One centripetal Catmull–Rom span, from points[index] to points[index + 1]. It reads only points index - 1 to
 * index + 2, so once two more points exist after a span's start, that span never changes while the stroke grows.
 * Sharp turns are emitted as straight spans to preserve deliberately drawn corners.
 */
export function buildInterpolatingSegment(
  points: Point[],
  index: number,
  cornerAngle = RAW_STROKE_CORNER_ANGLE_RADIANS,
): InterpolatingStrokeSegment {
  const from = points[index]
  const to = points[index + 1]
  const pressure = (from.pressure + to.pressure) / 2
  if (isSharpCorner(points, index, cornerAngle) || isSharpCorner(points, index + 1, cornerAngle)) {
    return { from, to, pressure, curved: false }
  }

  const before = index > 0 ? points[index - 1] : extrapolate(to, from)
  const after = index + 2 < points.length ? points[index + 2] : extrapolate(from, to)
  // Centripetal parameterization (alpha = 0.5) reduces overshoot when the
  // tablet reports uneven sample spacing, common during handwriting.
  const t0 = 0
  const t1 = t0 + Math.sqrt(distance(before, from))
  const t2 = t1 + Math.sqrt(distance(from, to))
  const t3 = t2 + Math.sqrt(distance(to, after))
  if (t1 === t0 || t2 === t1 || t3 === t2 || t2 === t0 || t3 === t1) {
    return { from, to, pressure, curved: false }
  }

  const span = t2 - t1
  const tangentFromX = (from.x - before.x) / (t1 - t0) - (to.x - before.x) / (t2 - t0) + (to.x - from.x) / span
  const tangentFromY = (from.y - before.y) / (t1 - t0) - (to.y - before.y) / (t2 - t0) + (to.y - from.y) / span
  const tangentToX = (to.x - from.x) / span - (after.x - from.x) / (t3 - t1) + (after.x - to.x) / (t3 - t2)
  const tangentToY = (to.y - from.y) / span - (after.y - from.y) / (t3 - t1) + (after.y - to.y) / (t3 - t2)
  return {
    from,
    control1: { x: from.x + tangentFromX * span / 3, y: from.y + tangentFromY * span / 3, pressure: from.pressure },
    control2: { x: to.x - tangentToX * span / 3, y: to.y - tangentToY * span / 3, pressure: to.pressure },
    to,
    pressure,
    curved: true,
  }
}

/**
 * Build centripetal Catmull–Rom spans for Raw display. Every span starts and
 * ends at captured points, so the path interpolates the source samples.
 */
export function buildInterpolatingCurve(
  points: Point[],
  cornerAngle = RAW_STROKE_CORNER_ANGLE_RADIANS,
): InterpolatingStrokeSegment[] {
  if (points.length < 2) return []
  const segments: InterpolatingStrokeSegment[] = []
  for (let index = 0; index < points.length - 1; index += 1) segments.push(buildInterpolatingSegment(points, index, cornerAngle))
  return segments
}

export function buildMidpointCurve(points: Point[]): StrokeCurveSegment[] {
  if (points.length < 2) return []
  if (points.length === 2) {
    return [{ from: points[0], to: points[1], pressure: (points[0].pressure + points[1].pressure) / 2, curved: false }]
  }

  const segments: StrokeCurveSegment[] = []
  let from = points[0]
  for (let index = 1; index < points.length - 1; index += 1) {
    const control = points[index]
    const next = points[index + 1]
    const to = { x: (control.x + next.x) / 2, y: (control.y + next.y) / 2, pressure: (control.pressure + next.pressure) / 2 }
    segments.push({ from, control, to, pressure: (points[index - 1].pressure + control.pressure) / 2, curved: true })
    from = to
  }
  const last = points[points.length - 1]
  segments.push({ from, control: last, to: last, pressure: (points[points.length - 2].pressure + last.pressure) / 2, curved: true })
  return segments
}
