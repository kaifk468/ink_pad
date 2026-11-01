import type { CanvasItem, Stroke } from '../canvasModel'
import type { Viewport } from '../viewport'

/** The part of the canvas (in canvas coordinates) that is currently on screen. */
export type ViewRect = { x: number; y: number; width: number; height: number }
type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

export type DrawMode = 'direct' | 'cached'

/**
 * Drawing paths:
 *  - 'direct': the page is redrawn from its strokes every frame. Cheapest to start, and what the original build did, so it
 *    feels best while little ink is on screen.
 *  - 'cached': the ink already on the page is kept as a picture and only the stroke being written is drawn. Needed once
 *    enough ink is on screen that redrawing it every frame would stall.
 * The choice depends on how many points of ink are visible in the current view, not on the whole canvas.
 */
export const DEFAULT_DIRECT_MAX_VISIBLE_POINTS = 12000
/** Once cached, go back to direct only when the visible ink has dropped well below the limit, so scrolling near it does not flip-flop. */
export const DIRECT_RETURN_RATIO = 0.65

const boundsCache = new WeakMap<object, Bounds>()

/** Bounds of a finished stroke including its line width, curve overshoot and arrow heads. Strokes are never edited in place, so this is cached. */
export function strokeBounds(stroke: Stroke): Bounds {
  const cached = boundsCache.get(stroke)
  if (cached) return cached
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let longestSegment = 0
  const points = stroke.points
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (point.x < minX) minX = point.x
    if (point.y < minY) minY = point.y
    if (point.x > maxX) maxX = point.x
    if (point.y > maxY) maxY = point.y
    if (index > 0) longestSegment = Math.max(longestSegment, Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y))
  }
  const pad = Math.max(stroke.width * 3.5, 12) + longestSegment * 0.5 + 2
  const bounds: Bounds = points.length ? { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad } : { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  boundsCache.set(stroke, bounds)
  return bounds
}

export function viewRectOf(viewport: Viewport, cssWidth: number, cssHeight: number): ViewRect {
  return { x: -viewport.offsetX / viewport.scale, y: -viewport.offsetY / viewport.scale, width: cssWidth / viewport.scale, height: cssHeight / viewport.scale }
}

/** Only pen strokes are skipped when off screen; rectangles, text and connectors are few and are always drawn. */
export function isItemVisible(item: CanvasItem, view: ViewRect): boolean {
  if (item.kind !== 'stroke') return true
  if (!item.points.length) return false
  const bounds = strokeBounds(item)
  return bounds.maxX >= view.x && bounds.minX <= view.x + view.width && bounds.maxY >= view.y && bounds.minY <= view.y + view.height
}

export function countVisiblePoints(items: CanvasItem[], view: ViewRect): number {
  let count = 0
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (item.kind === 'stroke' && isItemVisible(item, view)) count += item.points.length
  }
  return count
}

export function chooseDrawMode(previous: DrawMode, visiblePoints: number, maxDirectPoints: number): DrawMode {
  if (maxDirectPoints <= 0) return 'cached'
  if (previous === 'direct') return visiblePoints > maxDirectPoints ? 'cached' : 'direct'
  return visiblePoints < maxDirectPoints * DIRECT_RETURN_RATIO ? 'direct' : 'cached'
}
