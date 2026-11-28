/**
 * Select connected (right-click chip, palette): the selected boxes, the connectors attached to them and the boxes at the other ends.
 * Select all linked does the same transitively. Locked items are skipped; labels are not added (clicking a box does not select them either). Pure.
 */
import { canvasItemKey, isItemLocked, type CanvasItem, type ConnectorObject } from './canvasModel'

const attachedIds = (connector: ConnectorObject): number[] =>
  [connector.startAttachment?.rectangleId, connector.endAttachment?.rectangleId].filter((id): id is number => id !== undefined)

/** Ids of the unlocked boxes among the selected keys. */
function selectedBoxIds(items: readonly CanvasItem[], keys: ReadonlySet<string>): number[] {
  const ids: number[] = []
  for (const item of items) if (item.kind === 'rectangle' && !isItemLocked(item) && keys.has(canvasItemKey(item))) ids.push(item.id)
  return ids
}

/** True when a selected, unlocked box has at least one unlocked connector attached. */
export function canSelectConnected(items: readonly CanvasItem[], keys: ReadonlySet<string>): boolean {
  const ids = new Set(selectedBoxIds(items, keys))
  return ids.size > 0 && items.some((item) => item.kind === 'connector' && !isItemLocked(item) && attachedIds(item).some((id) => ids.has(id)))
}

function reach(items: readonly CanvasItem[], keys: ReadonlySet<string>, transitive: boolean): string[] {
  const boxes = new Map<number, CanvasItem>()
  for (const item of items) if (item.kind === 'rectangle') boxes.set(item.id, item)
  const connectors = items.filter((item): item is ConnectorObject => item.kind === 'connector' && !isItemLocked(item))
  const start = selectedBoxIds(items, keys)
  if (start.length === 0) return []
  const seen = new Set(start)
  const used = new Set<ConnectorObject>()
  let frontier = start
  while (frontier.length > 0) {
    const next: number[] = []
    for (const connector of connectors) {
      const ids = attachedIds(connector)
      if (!ids.some((id) => frontier.includes(id))) continue
      used.add(connector)
      for (const id of ids) {
        const box = boxes.get(id)
        if (!box || isItemLocked(box) || seen.has(id)) continue
        seen.add(id)
        next.push(id)
      }
    }
    frontier = transitive ? next : []
  }
  const result: string[] = []
  for (const item of items) {
    if (item.kind === 'rectangle' ? seen.has(item.id) : item.kind === 'connector' && used.has(item)) result.push(canvasItemKey(item))
  }
  return result
}

/** Keys of the selected boxes, the connectors attached to them and the boxes at their other ends. Empty when no unlocked box is selected. */
export const connectedKeys = (items: readonly CanvasItem[], keys: ReadonlySet<string>): string[] => reach(items, keys, false)

/** Keys of everything reachable from the selected boxes through connectors, transitively. */
export const linkedKeys = (items: readonly CanvasItem[], keys: ReadonlySet<string>): string[] => reach(items, keys, true)
