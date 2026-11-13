import { INK_BOX_MIN_BAND, INK_BOX_MIN_HEIGHT, clampInkBoxDividers, coverInkBounds } from './canvasModel'
import type { InkBoxContent, Point, RectangleBounds, RectangleObject, Stroke } from './canvasModel'

export { INK_BOX_INK_PADDING, INK_BOX_MIN_BAND, INK_BOX_MIN_HEIGHT, INK_BOX_MIN_WIDTH, HLD_SHAPE_MIN_SIZE, inkBoxMinSize, clampInkBoxDividers, constrainInkBoxBounds, coverInkBounds, inkBoxInkBounds, transformInkBox, translateInkBox } from './canvasModel'
export const INK_BOX_DEFAULT_WIDTH = 560
export const INK_BOX_DEFAULT_HEIGHT = 420
/** Name, variables and methods start at 12%, 80% and 8% of the box height. */
export const INK_BOX_TOP_SHARE = 0.12
export const INK_BOX_MID_SHARE = 0.92


export type InkBoxDivider = 'top' | 'mid'

/** Dividers sit at absolute canvas heights (like the ink), so resizing the box never moves them relative to the writing. */
export function newInkBoxContent(y: number, height: number): InkBoxContent {
  return { top: y + height * INK_BOX_TOP_SHARE, mid: y + height * INK_BOX_MID_SHARE, ink: [] }
}

export function createInkClassBox(id: number, x: number, y: number, width: number, height: number, strokeColor: string, strokeWidth: number): RectangleObject {
  return { kind: 'rectangle', id, x, y, width, height, strokeColor, strokeWidth, inkBox: newInkBoxContent(y, height) }
}

export function moveInkBoxDivider(rectangle: RectangleObject, which: InkBoxDivider, y: number): RectangleObject {
  const box = rectangle.inkBox
  if (!box || rectangle.hldShape) return rectangle
  const bottom = rectangle.y + rectangle.height
  if (rectangle.height < INK_BOX_MIN_HEIGHT) return clampInkBoxDividers(rectangle)
  if (which === 'top') {
    const top = Math.min(Math.max(y, rectangle.y + INK_BOX_MIN_BAND), box.mid - INK_BOX_MIN_BAND)
    return top === box.top ? rectangle : { ...rectangle, inkBox: { ...box, top } }
  }
  const mid = Math.min(Math.max(y, box.top + INK_BOX_MIN_BAND), bottom - INK_BOX_MIN_BAND)
  return mid === box.mid ? rectangle : { ...rectangle, inkBox: { ...box, mid } }
}

/** Which divider line is within tolerance of the point (only inside the box's width). */
export function hitInkBoxDivider(rectangle: RectangleObject, point: Point, tolerance: number): InkBoxDivider | null {
  const box = rectangle.inkBox
  if (!box || rectangle.hldShape) return null
  if (point.x < rectangle.x - tolerance || point.x > rectangle.x + rectangle.width + tolerance) return null
  const topDistance = Math.abs(point.y - box.top)
  const midDistance = Math.abs(point.y - box.mid)
  if (Math.min(topDistance, midDistance) > tolerance) return null
  return topDistance <= midDistance ? 'top' : 'mid'
}

/** The move grip sits just above the middle of the top edge; its size is fixed on screen (scale = zoom). */
export function inkBoxMoveGrip(rectangle: RectangleBounds, scale: number): { x: number; y: number; radius: number } {
  return { x: rectangle.x + rectangle.width / 2, y: rectangle.y - 26 / scale, radius: 18 / scale }
}

export function hitInkBoxMoveGrip(rectangle: RectangleBounds, point: Point, scale: number): boolean {
  const grip = inkBoxMoveGrip(rectangle, scale)
  return Math.hypot(point.x - grip.x, point.y - grip.y) <= grip.radius + 6 / scale
}

export function pointInRectangle(rectangle: RectangleBounds, point: Point): boolean {
  return point.x >= rectangle.x && point.x <= rectangle.x + rectangle.width && point.y >= rectangle.y && point.y <= rectangle.y + rectangle.height
}

/** The topmost ink class box that contains the point, if any. */
export function findInkBoxAt(items: readonly { kind: string }[], point: Point): RectangleObject | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index] as RectangleObject
    if (item.kind === 'rectangle' && item.inkBox && pointInRectangle(item, point)) return item
  }
  return null
}

/** A finished stroke belongs to the box: it is stored in the box, and the box grows to cover it. Returns a new rectangle. */
export function addStrokeToInkBox(rectangle: RectangleObject, stroke: Stroke): RectangleObject {
  const box = rectangle.inkBox
  if (!box) return rectangle
  const inkBox = { ...box, ink: [...box.ink, stroke] }
  if (stroke.erase) return { ...rectangle, inkBox }
  const bounds = coverInkBounds(rectangle, { ...box, ink: [stroke] })
  return clampInkBoxDividers({ ...rectangle, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, inkBox })
}

