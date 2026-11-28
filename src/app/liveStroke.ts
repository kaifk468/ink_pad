import type { Point, Stroke } from '../canvasModel'
import { buildInterpolatingSegment, type InterpolatingStrokeSegment } from '../strokeCurves'
import { drawInterpolatingSegment, drawStrokeDot, preparePenContext, pressureLineWidth } from './canvasRenderer'

/**
 * Drawing a Raw pen stroke while it is being written, at a cost that does not grow with the stroke or the page.
 *
 * A Raw span from point i to i + 1 reads only points i - 1 to i + 2, so once a stroke has n points the spans
 * 0 .. n - 3 are final and only the last span (plus the predicted pen position) can still change. Each frame:
 *  1. the spans that became final since the last frame are drawn onto `live`, an off-screen canvas that holds the
 *     final part of this stroke and is never cleared during the stroke;
 *  2. on the page canvas, only the small box covering last frame's tail, the new final spans and this frame's tail is
 *     repainted: the page as it was when the stroke started (`base`), then `live`, then the tail.
 * Nothing the size of the screen is drawn or copied per frame, and the page canvas is the only layer on screen.
 */

export type DeviceRect = { x: number; y: number; width: number; height: number }
export type CanvasTransform = { scale: number; offsetX: number; offsetY: number; dpr: number }
export type ClipBounds = { x: number; y: number; width: number; height: number }

export type LiveStrokeState = {
  strokeId: number
  /** Spans 0 .. drawnFinal - 1 are already on the live canvas. */
  drawnFinal: number
  /** Device-pixel box the tail covered on the page canvas last frame (repainted from base + live this frame). */
  tailRect: DeviceRect | null
}

export function createLiveStrokeState(strokeId: number): LiveStrokeState {
  return { strokeId, drawnFinal: 0, tailRect: null }
}

/** Number of spans of an n-point stroke that can no longer change as more points arrive. */
export function finalSpanCount(pointCount: number): number {
  return Math.max(0, pointCount - 2)
}

/**
 * Points for the part of the stroke that can still change: the last real span, continued through the predicted pen
 * positions. Includes one point before that span so its curve starts exactly as the final version will.
 * `first` is the index (in the returned points) of the first span to draw.
 */
export function tailPoints(points: Point[], predicted: Point[]): { points: Point[]; first: number } {
  const n = points.length
  const start = Math.max(0, n - 3)
  const tail = points.slice(start)
  let last = tail[tail.length - 1]
  for (const point of predicted) {
    if (point.x === last.x && point.y === last.y) continue
    tail.push(point)
    last = point
  }
  return { points: tail, first: n >= 2 ? n - 2 - start : 0 }
}

/** Device-pixel box covering spans (control points bound a Bézier span) with their line width and anti-aliasing. */
export function spansDeviceRect(spans: InterpolatingStrokeSegment[], width: number, transform: CanvasTransform): DeviceRect | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let widest = 0
  for (const span of spans) {
    for (const point of span.curved && span.control1 && span.control2 ? [span.from, span.control1, span.control2, span.to] : [span.from, span.to]) {
      if (point.x < minX) minX = point.x
      if (point.y < minY) minY = point.y
      if (point.x > maxX) maxX = point.x
      if (point.y > maxY) maxY = point.y
    }
    widest = Math.max(widest, pressureLineWidth(width, span.pressure))
  }
  if (minX === Infinity) return null
  return toDeviceRect(minX, minY, maxX, maxY, widest, transform)
}

export function pointDeviceRect(point: Point, width: number, transform: CanvasTransform): DeviceRect {
  return toDeviceRect(point.x, point.y, point.x, point.y, pressureLineWidth(width, point.pressure), transform)
}

function toDeviceRect(minX: number, minY: number, maxX: number, maxY: number, lineWidth: number, t: CanvasTransform): DeviceRect {
  const k = t.scale * t.dpr
  const pad = (lineWidth / 2) * k + 3
  const x0 = Math.floor(minX * k + t.offsetX * t.dpr - pad)
  const y0 = Math.floor(minY * k + t.offsetY * t.dpr - pad)
  const x1 = Math.ceil(maxX * k + t.offsetX * t.dpr + pad)
  const y1 = Math.ceil(maxY * k + t.offsetY * t.dpr + pad)
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

export function unionRects(rects: (DeviceRect | null)[], canvasWidth: number, canvasHeight: number): DeviceRect | null {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const rect of rects) {
    if (!rect) continue
    x0 = Math.min(x0, rect.x)
    y0 = Math.min(y0, rect.y)
    x1 = Math.max(x1, rect.x + rect.width)
    y1 = Math.max(y1, rect.y + rect.height)
  }
  x0 = Math.max(0, x0)
  y0 = Math.max(0, y0)
  x1 = Math.min(canvasWidth, x1)
  y1 = Math.min(canvasHeight, y1)
  if (!(x1 > x0 && y1 > y0)) return null
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

function applyCanvasTransform(ctx: CanvasRenderingContext2D, t: CanvasTransform, clip: ClipBounds): void {
  ctx.setTransform(t.dpr * t.scale, 0, 0, t.dpr * t.scale, t.dpr * t.offsetX, t.dpr * t.offsetY)
  ctx.beginPath()
  ctx.rect(clip.x, clip.y, clip.width, clip.height)
  ctx.clip()
}

export type LiveStrokeFrame = {
  page: CanvasRenderingContext2D
  base: HTMLCanvasElement
  live: HTMLCanvasElement
  stroke: Stroke
  /** The colour to draw with when it differs from `stroke.color` (the default ink on a dark board). */
  color?: string
  predicted: Point[]
  state: LiveStrokeState
  transform: CanvasTransform
  clip: ClipBounds
}

/** Draws one frame of the stroke being written. Returns the page-canvas box that was repainted (null if none). */
export function drawLiveStrokeFrame(frame: LiveStrokeFrame): DeviceRect | null {
  const { page, base, live, stroke, predicted, state, transform, clip } = frame
  const color = frame.color ?? stroke.color
  const points = stroke.points
  if (!points.length) return null
  const liveContext = live.getContext('2d')
  if (!liveContext) return null

  // 1. Spans that became final since the last frame go onto the live canvas, which keeps them for the whole stroke.
  const finalCount = finalSpanCount(points.length)
  let newFinalRect: DeviceRect | null = null
  if (finalCount > state.drawnFinal) {
    const spans: InterpolatingStrokeSegment[] = []
    for (let index = state.drawnFinal; index < finalCount; index += 1) spans.push(buildInterpolatingSegment(points, index))
    liveContext.save()
    applyCanvasTransform(liveContext, transform, clip)
    preparePenContext(liveContext, color)
    for (const span of spans) drawInterpolatingSegment(liveContext, span, stroke.width)
    liveContext.restore()
    newFinalRect = spansDeviceRect(spans, stroke.width, transform)
    state.drawnFinal = finalCount
  }

  // 2. The part that can still change: the last span continued through the predicted pen positions.
  const tail = tailPoints(points, predicted)
  const tailSpans: InterpolatingStrokeSegment[] = []
  for (let index = tail.first; index < tail.points.length - 1; index += 1) tailSpans.push(buildInterpolatingSegment(tail.points, index))
  const dot = tailSpans.length === 0 ? points[0] : null
  const tailRect = dot ? pointDeviceRect(dot, stroke.width, transform) : spansDeviceRect(tailSpans, stroke.width, transform)

  // 3. Repaint only the box that changed: page as it was at stroke start, final spans, then the tail.
  const rect = unionRects([state.tailRect, newFinalRect, tailRect], base.width, base.height)
  state.tailRect = tailRect
  if (!rect) return null
  page.save()
  page.setTransform(1, 0, 0, 1, 0, 0)
  page.beginPath()
  page.rect(rect.x, rect.y, rect.width, rect.height)
  page.clip()
  page.globalCompositeOperation = 'source-over'
  page.globalAlpha = 1
  page.clearRect(rect.x, rect.y, rect.width, rect.height)
  page.drawImage(base, rect.x, rect.y, rect.width, rect.height, rect.x, rect.y, rect.width, rect.height)
  page.drawImage(live, rect.x, rect.y, rect.width, rect.height, rect.x, rect.y, rect.width, rect.height)
  applyCanvasTransform(page, transform, clip)
  preparePenContext(page, color)
  if (dot) drawStrokeDot(page, dot, stroke.width)
  for (const span of tailSpans) drawInterpolatingSegment(page, span, stroke.width)
  page.restore()
  return rect
}
