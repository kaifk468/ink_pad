import { canvasItemKey, type CanvasItem } from './canvasModel'
import { copyItems, pasteItems, type IdCounters } from './clipboard'
import type { ViewBounds } from './viewport'

/**
 * Desktop Ctrl+drag (Cmd on Mac): the originals stay put and a copy of the dragged selection moves instead.
 * Pure helpers, no DOM; the id remapping is the clipboard's (`copyItems` / `pasteItems`) with a zero offset.
 */

/** True for a left mouse press with Ctrl or Cmd held in Desktop mode (Alt and Shift keep their own meanings). */
export function isDuplicateDragPress(inputMode: string, pointerType: string, button: number, ctrlKey: boolean, metaKey: boolean): boolean {
  return inputMode === 'desktop' && pointerType === 'mouse' && button === 0 && (ctrlKey || metaKey)
}

export type DragDuplicate = {
  /** The original items followed by the copies. */
  items: CanvasItem[]
  /** Keys of every copy (including carried labels and connectors between copied boxes): what moves with the pointer. */
  copyKeys: Set<string>
  /** Keys of the copies of the dragged selection (carried labels and extra connectors left out): the selection after the drop. */
  selectedKeys: string[]
  counters: IdCounters
}

/**
 * Copies `dragged` plus `carried` labels, and any connector joining two copied boxes, at zero offset.
 * Returns null when there is nothing to copy.
 */
export function duplicateForDrag(items: readonly CanvasItem[], dragged: ReadonlySet<string>, carried: readonly string[], counters: IdCounters, workspace: ViewBounds): DragDuplicate | null {
  const boxIds = new Set<number>()
  for (const item of items) if (item.kind === 'rectangle' && dragged.has(canvasItemKey(item))) boxIds.add(item.id)
  const all = new Set<string>([...dragged, ...carried])
  for (const item of items) {
    if (item.kind === 'connector' && item.startAttachment && item.endAttachment && boxIds.has(item.startAttachment.rectangleId) && boxIds.has(item.endAttachment.rectangleId)) all.add(canvasItemKey(item))
  }
  const sourceKeys = items.filter((item) => item.kind !== 'opaque' && all.has(canvasItemKey(item))).map(canvasItemKey)
  const pasted = pasteItems(copyItems(items, all), counters, 0, workspace, null, items)
  if (!pasted || pasted.keys.length !== sourceKeys.length) return null
  const selectedKeys = pasted.keys.filter((_, index) => dragged.has(sourceKeys[index]))
  return { items: [...items, ...pasted.items], copyKeys: new Set(pasted.keys), selectedKeys, counters: pasted.counters }
}
