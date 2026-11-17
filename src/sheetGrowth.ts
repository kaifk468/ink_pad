import type { CanvasItem } from './canvasModel'
import { SHEET_GROW_ZONE, SHEET_MIN_HEIGHT, nextSheetHeight } from './viewport'

/** Lowest sheet coordinate an item reaches (its ink or box edge). Erasers reach nothing. */
export function itemBottom(item: CanvasItem): number {
  if (item.kind === 'stroke') {
    if (item.erase) return 0
    let bottom = 0
    for (const point of item.points) if (point.y > bottom) bottom = point.y
    return bottom + item.width / 2
  }
  if (item.kind === 'connector') return Math.max(item.start.y, item.end.y) + item.strokeWidth
  if (item.kind === 'opaque') return item.box ? item.box.y + item.box.height : 0
  return item.y + item.height
}

/** The page height a loaded diagram needs: its saved height, grown if its content reaches the bottom. Never shrinks. */
export function sheetHeightForItems(items: readonly CanvasItem[], savedHeight: number = SHEET_MIN_HEIGHT): number {
  let bottom = 0
  for (const item of items) bottom = Math.max(bottom, itemBottom(item))
  return nextSheetHeight(savedHeight, bottom - SHEET_GROW_ZONE)
}
