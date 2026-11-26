import { canvasItemKey, isItemLocked } from './canvasModel'
import type { CanvasItem, RectangleObject } from './canvasModel'

/** Largest corner radius of a rounded plain rectangle (canvas units). */
export const ROUNDED_CORNER_RADIUS = 16

/** A plain rectangle: not a class box, ink box (so not an HLD shape), ellipse or diamond. Only these can have rounded corners. */
export function isPlainRectangle(item: CanvasItem): item is RectangleObject {
  return item.kind === 'rectangle' && !item.classBox && !item.inkBox && !item.hldShape && !item.ellipse && !item.diamond
}

/** The corner radius of a box of this size: 16, or a quarter of the shorter side for small boxes. */
export function roundedCornerRadius(width: number, height: number): number {
  return Math.max(0, Math.min(ROUNDED_CORNER_RADIUS, Math.abs(width) / 4, Math.abs(height) / 4))
}

const n = (value: number) => Math.round(value * 100) / 100

/** The outline of a rounded rectangle as SVG path data (closed, quarter-circle corners). */
export function roundedRectanglePath(rectangle: { x: number; y: number; width: number; height: number }): string {
  const { x, y, width: w, height: h } = rectangle
  const r = roundedCornerRadius(w, h)
  return `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`
}

/** What the menu / palette should offer for the selected unlocked plain rectangles: 'round' when any is sharp, 'sharp' when all are rounded, null when none is selected. */
export function cornersChoice(items: readonly CanvasItem[], keys: ReadonlySet<string>): 'round' | 'sharp' | null {
  const boxes = items.filter((item): item is RectangleObject => isPlainRectangle(item) && !isItemLocked(item) && keys.has(canvasItemKey(item)))
  if (boxes.length === 0) return null
  return boxes.every((box) => box.rounded === true) ? 'sharp' : 'round'
}

/** Rounds or squares the corners of every selected unlocked plain rectangle. Returns the same array when nothing changes. */
export function setRoundedCorners(items: CanvasItem[], keys: ReadonlySet<string>, rounded: boolean): CanvasItem[] {
  let changed = false
  const next = items.map((item) => {
    if (!isPlainRectangle(item) || isItemLocked(item) || !keys.has(canvasItemKey(item)) || (item.rounded === true) === rounded) return item
    changed = true
    if (rounded) return { ...item, rounded: true as const }
    const { rounded: _old, ...rest } = item
    return rest
  })
  return changed ? next : items
}
