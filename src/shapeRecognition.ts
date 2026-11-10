import type { Point, RectangleObject, Stroke } from './canvasModel'

export const SHAPE_RECOGNITION_HOLD_MS = 450

/** A recognized ellipse whose width and height differ by at most this share of the longer side becomes a perfect circle. */
export const CIRCLE_SNAP_TOLERANCE = 0.12

/** Largest average distance from the fitted ellipse, measured in half-axes (0.08 = 8% of the radius). */
const ELLIPSE_MAX_ERROR = 0.08
/** The stroke must be at least this much closer to the ellipse than to the outline of its box (0.65 = a third closer). */
const ELLIPSE_RECTANGLE_MARGIN = 0.65
/** The stroke must go once round: 0.85 to 1.5 turns, so open arcs, figure eights and scribbles stay ink. */
const ELLIPSE_MIN_TURNS = 0.85
const ELLIPSE_MAX_TURNS = 1.5
const ELLIPSE_SAMPLES = 64
/** Smallest box (in canvas units) a stroke may have to become a rectangle, and to become an oval or circle. */
const MIN_RECTANGLE_WIDTH = 38
const MIN_RECTANGLE_HEIGHT = 30
const MIN_RECTANGLE_DIAGONAL = 36
export const MIN_OVAL_WIDTH = 24
export const MIN_OVAL_HEIGHT = 20

type ClosedLoop = { left: number; top: number; width: number; height: number; diagonal: number; points: Point[]; stroke: Stroke }

/** What a rectangle and an ellipse both need: enough points, not an eraser stroke and a roughly closed path. Each shape checks its own minimum size. */
function closedLoop(stroke: Stroke): ClosedLoop | null {
  const points = stroke.points
  if (points.length < 6 || stroke.erase) return null
  let left = Infinity
  let right = -Infinity
  let top = Infinity
  let bottom = -Infinity
  for (const point of points) {
    if (point.x < left) left = point.x
    if (point.x > right) right = point.x
    if (point.y < top) top = point.y
    if (point.y > bottom) bottom = point.y
  }
  const width = right - left
  const height = bottom - top
  const diagonal = Math.hypot(width, height)
  const first = points[0]
  const last = points[points.length - 1]
  if (diagonal <= 0 || Math.hypot(first.x - last.x, first.y - last.y) >= diagonal * 0.32) return null
  return { left, top, width, height, diagonal, points, stroke }
}

function pathLengthOf(points: Point[]): number {
  let length = 0
  for (let index = 1; index < points.length; index += 1) length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y)
  return length
}

function rectangleFromLoop(loop: ClosedLoop, id: number): RectangleObject | null {
  // A roughly closed path with a rectangle-like perimeter becomes a UML class box.
  const { width, height, stroke } = loop
  const perimeter = 2 * (width + height)
  const pathLength = pathLengthOf(loop.points)
  if (loop.diagonal <= MIN_RECTANGLE_DIAGONAL || width <= MIN_RECTANGLE_WIDTH || height <= MIN_RECTANGLE_HEIGHT || pathLength / perimeter <= 0.68 || pathLength / perimeter >= 1.65) return null
  return {
    kind: 'rectangle',
    id,
    x: loop.left,
    y: loop.top,
    width,
    height,
    strokeColor: stroke.color,
    strokeWidth: stroke.width,
  }
}

/** The path as `count` points equally spaced along its length, so a slow or crowded part of the stroke does not count extra. */
function resamplePath(points: Point[], count: number): Point[] | null {
  const total = pathLengthOf(points)
  if (total < 1) return null
  const samples: Point[] = []
  let segment = 1
  let before = 0
  let segmentLength = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
  for (let index = 0; index < count; index += 1) {
    const target = (total * index) / (count - 1)
    while (segment < points.length - 1 && before + segmentLength < target) {
      before += segmentLength
      segment += 1
      segmentLength = Math.hypot(points[segment].x - points[segment - 1].x, points[segment].y - points[segment - 1].y)
    }
    const from = points[segment - 1]
    const to = points[segment]
    const t = segmentLength > 0 ? Math.min(1, Math.max(0, (target - before) / segmentLength)) : 0
    samples.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, pressure: 1 })
  }
  return samples
}

/** `halfA` runs along `angle` (radians from the page's x axis), `halfB` across it; the centre is in page coordinates. */
type EllipseFrameFit = { error: number; turns: number; halfA: number; halfB: number; angle: number; centreX: number; centreY: number }

/** How well the points follow an ellipse that fills the box `[minP, maxP] x [minQ, maxQ]` in the frame rotated by `angle`. */
function fitEllipseInFrame(samples: Point[], angle: number): EllipseFrameFit | null {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const along: number[] = []
  const across: number[] = []
  let minP = Infinity
  let maxP = -Infinity
  let minQ = Infinity
  let maxQ = -Infinity
  for (const sample of samples) {
    const p = sample.x * cos + sample.y * sin
    const q = -sample.x * sin + sample.y * cos
    along.push(p)
    across.push(q)
    if (p < minP) minP = p
    if (p > maxP) maxP = p
    if (q < minQ) minQ = q
    if (q > maxQ) maxQ = q
  }
  const halfA = (maxP - minP) / 2
  const halfB = (maxQ - minQ) / 2
  if (halfA <= 0 || halfB <= 0) return null
  const centreP = (maxP + minP) / 2
  const centreQ = (maxQ + minQ) / 2
  let errorSum = 0
  let turned = 0
  let previousAngle = 0
  for (let index = 0; index < samples.length; index += 1) {
    const u = (along[index] - centreP) / halfA
    const v = (across[index] - centreQ) / halfB
    errorSum += Math.abs(Math.hypot(u, v) - 1)
    const pointAngle = Math.atan2(v, u)
    if (index > 0) {
      let step = pointAngle - previousAngle
      if (step > Math.PI) step -= 2 * Math.PI
      else if (step < -Math.PI) step += 2 * Math.PI
      turned += step
    }
    previousAngle = pointAngle
  }
  return {
    error: errorSum / samples.length,
    turns: Math.abs(turned) / (2 * Math.PI),
    halfA,
    halfB,
    angle,
    centreX: centreP * cos - centreQ * sin,
    centreY: centreP * sin + centreQ * cos,
  }
}

/** Average distance from the box outline, in half-axes: what a hand-drawn rectangle is close to. */
function rectangleError(samples: Point[], loop: ClosedLoop): number {
  const halfWidth = loop.width / 2
  const halfHeight = loop.height / 2
  const centreX = loop.left + halfWidth
  const centreY = loop.top + halfHeight
  let errorSum = 0
  for (const sample of samples) errorSum += Math.abs(Math.max(Math.abs(sample.x - centreX) / halfWidth, Math.abs(sample.y - centreY) / halfHeight) - 1)
  return errorSum / samples.length
}

function ellipseFromLoop(loop: ClosedLoop, id: number): RectangleObject | null {
  const { width, height, stroke } = loop
  if (width <= MIN_OVAL_WIDTH || height <= MIN_OVAL_HEIGHT) return null
  const samples = resamplePath(loop.points, ELLIPSE_SAMPLES)
  if (!samples) return null

  // Fit in the page's own axes and in the stroke's own principal axes, so a tilted oval is still seen as one.
  let meanX = 0
  let meanY = 0
  for (const sample of samples) { meanX += sample.x; meanY += sample.y }
  meanX /= samples.length
  meanY /= samples.length
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const sample of samples) {
    sxx += (sample.x - meanX) ** 2
    syy += (sample.y - meanY) ** 2
    sxy += (sample.x - meanX) * (sample.y - meanY)
  }
  const aligned = fitEllipseInFrame(samples, 0)
  const principal = fitEllipseInFrame(samples, 0.5 * Math.atan2(2 * sxy, sxx - syy))
  const candidates = [aligned, principal].filter((fit): fit is EllipseFrameFit => fit !== null)
  if (candidates.length === 0) return null
  const fit = candidates.reduce((best, next) => (next.error < best.error ? next : best))

  // Rounder than a rectangle's outline, close enough to an ellipse, and drawn once round.
  if (fit.turns < ELLIPSE_MIN_TURNS || fit.turns > ELLIPSE_MAX_TURNS) return null
  if (fit.error > ELLIPSE_MAX_ERROR || fit.error >= rectangleError(samples, loop) * ELLIPSE_RECTANGLE_MARGIN) return null

  // The oval keeps the size of the fitted axes and stands upright (the long side nearest the page's horizontal wins).
  // Nearly round becomes a perfect circle of the mean size.
  const alongX = Math.abs(Math.cos(fit.angle)) >= Math.abs(Math.sin(fit.angle))
  const halfWidth = alongX ? fit.halfA : fit.halfB
  const halfHeight = alongX ? fit.halfB : fit.halfA
  const round = Math.abs(halfWidth - halfHeight) <= Math.max(halfWidth, halfHeight) * CIRCLE_SNAP_TOLERANCE
  const ovalWidth = round ? halfWidth + halfHeight : halfWidth * 2
  const ovalHeight = round ? halfWidth + halfHeight : halfHeight * 2
  return {
    kind: 'rectangle',
    id,
    x: fit.centreX - ovalWidth / 2,
    y: fit.centreY - ovalHeight / 2,
    width: ovalWidth,
    height: ovalHeight,
    strokeColor: stroke.color,
    strokeWidth: stroke.width,
    ellipse: true,
  }
}

export function recognizeRectangleStroke(stroke: Stroke, id: number): RectangleObject | null {
  const loop = closedLoop(stroke)
  return loop ? rectangleFromLoop(loop, id) : null
}

/** A closed stroke that follows an oval or circle more closely than a box outline. */
export function recognizeEllipseStroke(stroke: Stroke, id: number): RectangleObject | null {
  const loop = closedLoop(stroke)
  return loop ? ellipseFromLoop(loop, id) : null
}

/** One closed stroke becomes an oval or circle when it is round, otherwise a rectangle when it is box-like, otherwise null. */
export function recognizeClosedShapeStroke(stroke: Stroke, id: number): RectangleObject | null {
  const loop = closedLoop(stroke)
  if (!loop) return null
  return ellipseFromLoop(loop, id) ?? rectangleFromLoop(loop, id)
}

export function recognizeRectangleOnHold(stroke: Stroke, heldForMs: number, id: number): RectangleObject | null {
  if (heldForMs < SHAPE_RECOGNITION_HOLD_MS) return null
  return recognizeRectangleStroke(stroke, id)
}

export function recognizeClosedShapeOnHold(stroke: Stroke, heldForMs: number, id: number): RectangleObject | null {
  if (heldForMs < SHAPE_RECOGNITION_HOLD_MS) return null
  return recognizeClosedShapeStroke(stroke, id)
}
