/**
 * Same size (right-click chips, panel, palette): every selected box takes the largest selected width and / or height, keeping its centre.
 * Connectors attached to a box follow it and labels inside it keep their relative position (the same helpers a resize uses). Pure.
 */
import { canvasItemKey, isItemLocked, resizeRectangleItems, type CanvasItem, type RectangleBounds, type RectangleObject } from './canvasModel'
import { isFlowBox, followResizeLabels, labelsInside } from './diagramFlow'
import type { MeasureFor } from './textFit'

export type SameSizeMode = 'width' | 'height' | 'both'

/** The selected boxes Same size can change: unlocked plain shapes (rectangle, diamond, ellipse), HLD shapes and sticky notes. Class boxes and ink boxes that are not HLD shapes are left out. */
export function sameSizeBoxes(items: readonly CanvasItem[], keys: ReadonlySet<string>): RectangleObject[] {
  return items.filter((item): item is RectangleObject => isFlowBox(item) && keys.has(canvasItemKey(item)) && !isItemLocked(item))
}

export const canSameSize = (items: readonly CanvasItem[], keys: ReadonlySet<string>) => sameSizeBoxes(items, keys).length >= 2

/**
 * The items with every eligible selected box set to the largest selected width and / or height around its own centre (kept inside `workspace` when given).
 * Null when fewer than two boxes qualify or they already match. `count` is the number of boxes taken into account.
 */
export function sameSizeItems(items: CanvasItem[], keys: ReadonlySet<string>, mode: SameSizeMode, workspace?: RectangleBounds, measureFor?: MeasureFor): { items: CanvasItem[]; count: number } | null {
  const boxes = sameSizeBoxes(items, keys)
  if (boxes.length < 2) return null
  const width = Math.max(...boxes.map((box) => box.width))
  const height = Math.max(...boxes.map((box) => box.height))
  let result = items
  for (const original of boxes) {
    const newWidth = mode === 'height' ? original.width : width
    const newHeight = mode === 'width' ? original.height : height
    if (newWidth === original.width && newHeight === original.height) continue
    let x = original.x + original.width / 2 - newWidth / 2
    let y = original.y + original.height / 2 - newHeight / 2
    if (workspace) {
      x = Math.max(workspace.x, Math.min(x, workspace.x + workspace.width - newWidth))
      y = Math.max(workspace.y, Math.min(y, workspace.y + workspace.height - newHeight))
    }
    const oldBounds: RectangleBounds = { x: original.x, y: original.y, width: original.width, height: original.height }
    const bounds: RectangleBounds = { x, y, width: newWidth, height: newHeight }
    const labelKeys = labelsInside(result, new Set([canvasItemKey(original)]))
    result = followResizeLabels(resizeRectangleItems(result, original.id, bounds), original.id, oldBounds, bounds, labelKeys, measureFor)
  }
  return result === items ? null : { items: result, count: boxes.length }
}
