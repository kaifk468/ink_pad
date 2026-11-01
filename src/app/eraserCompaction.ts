import type { CanvasItem, Point, Stroke } from '../canvasModel'
import { strokeBounds } from './visibleInk'

/**
 * The pixel eraser does not delete anything: it adds a stroke that cuts holes in the ink drawn before it. Left alone, every
 * erased word keeps costing as much to draw as before, and a page that was erased empty is as slow as a full one.
 *
 * When an eraser stroke is finished this removes what the eraser has made invisible, without changing how the page looks:
 *  - pen strokes lying completely under erasing are deleted;
 *  - the hidden middle of a partly erased stroke is cut out (the stroke is split, its two ends stay under the eraser);
 *  - eraser strokes that no longer touch any ink, text or shape are deleted.
 * It is deliberately conservative: a point only counts as hidden when the whole pen line around it lies inside the eraser.
 */

type Bounds = { minX: number; minY: number; maxX: number; maxY: number }
type EraserSegment = { ax: number; ay: number; bx: number; by: number; radius: number; minX: number; minY: number; maxX: number; maxY: number }

/** Pen lines are drawn up to 1.25 times their width (pressure), plus a little for anti-aliasing. */
const INK_WIDTH_MAX_SCALE = 1.25
const SAFETY_MARGIN = 2
/** Segments between two hidden points are checked at about this spacing. */
const SEGMENT_CHECK_SPACING = 6
const MAX_SEGMENT_CHECKS = 24

function pressureScale(pressure: number): number {
  return pressure > 0 ? 0.35 + pressure * 0.9 : 1
}

function eraserSegments(eraser: Stroke): { segments: EraserSegment[]; bounds: Bounds } {
  const points = eraser.points
  const segments: EraserSegment[] = []
  const add = (a: Point, b: Point, width: number) => {
    const radius = width / 2
    segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, radius, minX: Math.min(a.x, b.x) - radius, minY: Math.min(a.y, b.y) - radius, maxX: Math.max(a.x, b.x) + radius, maxY: Math.max(a.y, b.y) + radius })
  }
  if (points.length === 1) add(points[0], points[0], eraser.width * pressureScale(points[0].pressure))
  for (let index = 1; index < points.length; index += 1) {
    add(points[index - 1], points[index], eraser.width * pressureScale((points[index - 1].pressure + points[index].pressure) / 2))
  }
  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const segment of segments) {
    if (segment.minX < bounds.minX) bounds.minX = segment.minX
    if (segment.minY < bounds.minY) bounds.minY = segment.minY
    if (segment.maxX > bounds.maxX) bounds.maxX = segment.maxX
    if (segment.maxY > bounds.maxY) bounds.maxY = segment.maxY
  }
  return { segments, bounds }
}

function distanceToSegmentSquared(px: number, py: number, segment: EraserSegment): number {
  const dx = segment.bx - segment.ax
  const dy = segment.by - segment.ay
  const lengthSquared = dx * dx + dy * dy
  let t = lengthSquared > 0 ? ((px - segment.ax) * dx + (py - segment.ay) * dy) / lengthSquared : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const cx = segment.ax + dx * t - px
  const cy = segment.ay + dy * t - py
  return cx * cx + cy * cy
}

/** True when a pen line of the given half width centred on (x, y) lies completely inside the erased area. */
function isHidden(x: number, y: number, inkRadius: number, segments: EraserSegment[]): boolean {
  for (const segment of segments) {
    const reach = segment.radius - inkRadius - SAFETY_MARGIN
    if (reach <= 0) continue
    if (x < segment.minX || x > segment.maxX || y < segment.minY || y > segment.maxY) continue
    if (distanceToSegmentSquared(x, y, segment) <= reach * reach) return true
  }
  return false
}

function boundsOverlap(a: Bounds, b: Bounds): boolean {
  return a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY
}

/** Where an item can put ink on the page. Strokes use their cached bounds; shapes and text are padded generously. */
export function itemInkBounds(item: CanvasItem): Bounds {
  if (item.kind === 'stroke') return strokeBounds(item)
  if (item.kind === 'rectangle') {
    const pad = item.strokeWidth + 4
    return { minX: item.x - pad, minY: item.y - pad, maxX: item.x + item.width + pad, maxY: item.y + item.height + pad }
  }
  if (item.kind === 'text') return { minX: item.x - 4, minY: item.y - 4, maxX: item.x + item.width + 4, maxY: item.y + item.height + 4 }
  const pad = Math.max(item.strokeWidth * 4, 60)
  return {
    minX: Math.min(item.start.x, item.end.x) - pad,
    minY: Math.min(item.start.y, item.end.y) - pad,
    maxX: Math.max(item.start.x, item.end.x) + pad,
    maxY: Math.max(item.start.y, item.end.y) + pad,
  }
}

/** Cuts the parts of one pen stroke that lie completely under the eraser. Returns the pieces left (none if it is fully hidden). */
function trimStroke(stroke: Stroke, segments: EraserSegment[], nextId: () => number): Stroke[] | null {
  const points = stroke.points
  const count = points.length
  if (count === 0) return null
  const inkRadius = (stroke.width * INK_WIDTH_MAX_SCALE) / 2
  const hidden = new Array<boolean>(count)
  let hiddenCount = 0
  for (let index = 0; index < count; index += 1) {
    hidden[index] = isHidden(points[index].x, points[index].y, inkRadius, segments)
    if (hidden[index]) hiddenCount += 1
  }
  if (hiddenCount === 0) return null

  // link[i]: the segment between point i and i+1 lies completely under the eraser
  const link = new Array<boolean>(Math.max(0, count - 1)).fill(false)
  for (let index = 0; index < count - 1; index += 1) {
    if (!hidden[index] || !hidden[index + 1]) continue
    const a = points[index]
    const b = points[index + 1]
    const checks = Math.min(MAX_SEGMENT_CHECKS, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / SEGMENT_CHECK_SPACING))
    let covered = true
    for (let step = 1; step < checks && covered; step += 1) {
      const t = step / checks
      covered = isHidden(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, inkRadius, segments)
    }
    link[index] = covered
  }

  // a point is dropped when it and both of its segments are hidden; the points next to it stay as the cut ends
  const keep = new Array<boolean>(count)
  let keptCount = 0
  for (let index = 0; index < count; index += 1) {
    const hiddenBefore = index === 0 || link[index - 1]
    const hiddenAfter = index === count - 1 || link[index]
    keep[index] = !(hidden[index] && hiddenBefore && hiddenAfter)
    if (keep[index]) keptCount += 1
  }
  if (keptCount === count) return null

  const pieces: Point[][] = []
  let current: Point[] = []
  for (let index = 0; index < count; index += 1) {
    if (keep[index]) {
      current.push(points[index])
      // the segment after this point is hidden: the stroke is cut here
      if (index < count - 1 && link[index]) {
        pieces.push(current)
        current = []
      }
    } else if (current.length) {
      pieces.push(current)
      current = []
    }
  }
  if (current.length) pieces.push(current)

  // a piece made only of hidden points (a lone cut end) shows nothing
  const result: Stroke[] = []
  const indexOf = new Map<Point, number>()
  for (let index = 0; index < count; index += 1) indexOf.set(points[index], index)
  for (const piece of pieces) {
    if (piece.length === 1 && hidden[indexOf.get(piece[0])!]) continue
    result.push({ ...stroke, points: piece })
  }
  if (result.length === 0) return []
  // the first piece keeps the stroke's identity; later pieces are new strokes
  for (let index = 1; index < result.length; index += 1) result[index] = { ...result[index], id: nextId() }
  return result
}

/**
 * Applies the cleanup for the eraser stroke that was just added at the end of `items`. Returns the same array when nothing
 * could be removed, otherwise a new array (stroke objects that were not touched are reused).
 */
export function compactAfterErase(items: CanvasItem[], nextId: () => number): CanvasItem[] {
  const last = items[items.length - 1]
  if (!last || last.kind !== 'stroke' || !last.erase || last.points.length === 0) return items
  const { segments, bounds } = eraserSegments(last)
  if (!segments.length) return items

  let changed = false
  const next: CanvasItem[] = []
  for (let index = 0; index < items.length - 1; index += 1) {
    const item = items[index]
    if (item.kind !== 'stroke' || item.erase || item.shape || !boundsOverlap(strokeBounds(item), bounds)) {
      next.push(item)
      continue
    }
    const pieces = trimStroke(item, segments, nextId)
    if (pieces === null) next.push(item)
    else {
      changed = true
      next.push(...pieces)
    }
  }
  next.push(last)

  // eraser strokes that now touch nothing drawn before them (the new one, and older ones whose ink has just gone)
  const result: CanvasItem[] = []
  // a connector draws the boxes it is attached to again right after itself, so a box can sit under an eraser that comes before it in the list
  const inkBounds: Bounds[] = []
  const boxBounds: Bounds[] = []
  for (const item of next) if (item.kind === 'rectangle') boxBounds.push(itemInkBounds(item))
  for (let index = 0; index < next.length; index += 1) {
    const item = next[index]
    if (item.kind === 'stroke' && item.erase) {
      if (boundsOverlap(strokeBounds(item), bounds) || item === last) {
        const itemBounds = strokeBounds(item)
        let touches = false
        for (const ink of inkBounds) {
          if (boundsOverlap(ink, itemBounds)) { touches = true; break }
        }
        if (!touches) for (const box of boxBounds) {
          if (boundsOverlap(box, itemBounds)) { touches = true; break }
        }
        if (!touches) { changed = true; continue }
      }
      result.push(item)
      continue
    }
    inkBounds.push(itemInkBounds(item))
    result.push(item)
  }
  return changed ? result : items
}
