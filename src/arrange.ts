import { labelsInside, isFlowBox } from './diagramFlow'
import { canvasItemKey, getCanvasSelectionBounds, translateSelectedItems, type CanvasItem, type RectangleBounds } from './canvasModel'

export type AlignOp = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type DistributeOp = 'horizontal' | 'vertical'
export type ItemMove = { key: string; dx: number; dy: number }

/**
 * The selected items that align and distribute can move: everything except unknown items and connectors that are attached to a
 * box (those follow their boxes). Each comes with its drawn bounds (rotation and line width included).
 */
export function arrangeableItems(items: readonly CanvasItem[], keys: ReadonlySet<string>): Array<{ key: string; bounds: RectangleBounds }> {
  const result: Array<{ key: string; bounds: RectangleBounds }> = []
  const owned = new Set(labelsInside(items, selectedFlowBoxKeys(items, keys)))
  for (const item of items) {
    const key = canvasItemKey(item)
    if (!keys.has(key) || item.kind === 'opaque' || owned.has(key)) continue
    if (item.kind === 'connector' && (item.startAttachment || item.endAttachment)) continue
    if (item.kind === 'stroke' && item.erase) continue
    const bounds = getCanvasSelectionBounds(items as CanvasItem[], new Set([key]))
    if (bounds) result.push({ key, bounds })
  }
  return result
}

const selectedFlowBoxKeys = (items: readonly CanvasItem[], keys: ReadonlySet<string>): Set<string> =>
  new Set(items.filter((item) => isFlowBox(item) && keys.has(canvasItemKey(item))).map(canvasItemKey))

/** Adds a move for every label a moved box carries (so labels follow their box even when they were not selected). */
function withCarried(items: readonly CanvasItem[], moves: ItemMove[]): ItemMove[] {
  const result = moves.slice()
  const done = new Set(moves.map((m) => m.key))
  for (const move of moves) {
    const box = items.find((item) => canvasItemKey(item) === move.key)
    if (!box || !isFlowBox(box)) continue
    for (const labelKey of labelsInside(items, new Set([move.key]))) {
      if (done.has(labelKey)) continue
      done.add(labelKey)
      result.push({ key: labelKey, dx: move.dx, dy: move.dy })
    }
  }
  return result
}

export const canAlign = (items: readonly CanvasItem[], keys: ReadonlySet<string>) => arrangeableItems(items, keys).length >= 2
export const canDistribute = (items: readonly CanvasItem[], keys: ReadonlySet<string>) => arrangeableItems(items, keys).length >= 3

/** How far each selected item moves to line up with the selection's outer edge or centre line. Items already in place are left out. */
export function alignMoves(items: readonly CanvasItem[], keys: ReadonlySet<string>, op: AlignOp): ItemMove[] {
  const list = arrangeableItems(items, keys)
  if (list.length < 2) return []
  const left = Math.min(...list.map((e) => e.bounds.x))
  const right = Math.max(...list.map((e) => e.bounds.x + e.bounds.width))
  const top = Math.min(...list.map((e) => e.bounds.y))
  const bottom = Math.max(...list.map((e) => e.bounds.y + e.bounds.height))
  const moves: ItemMove[] = []
  for (const { key, bounds } of list) {
    let dx = 0
    let dy = 0
    if (op === 'left') dx = left - bounds.x
    else if (op === 'right') dx = right - (bounds.x + bounds.width)
    else if (op === 'center') dx = (left + right) / 2 - (bounds.x + bounds.width / 2)
    else if (op === 'top') dy = top - bounds.y
    else if (op === 'bottom') dy = bottom - (bounds.y + bounds.height)
    else dy = (top + bottom) / 2 - (bounds.y + bounds.height / 2)
    if (dx !== 0 || dy !== 0) moves.push({ key, dx, dy })
  }
  return withCarried(items, moves)
}

/** Spreads 3 or more items so the gaps between neighbours are equal; the two outermost stay where they are. */
export function distributeMoves(items: readonly CanvasItem[], keys: ReadonlySet<string>, op: DistributeOp): ItemMove[] {
  const list = arrangeableItems(items, keys)
  if (list.length < 3) return []
  const horizontal = op === 'horizontal'
  const start = (b: RectangleBounds) => (horizontal ? b.x : b.y)
  const size = (b: RectangleBounds) => (horizontal ? b.width : b.height)
  const sorted = list.slice().sort((a, b) => (start(a.bounds) + size(a.bounds) / 2) - (start(b.bounds) + size(b.bounds) / 2))
  const first = sorted[0].bounds
  const last = sorted[sorted.length - 1].bounds
  const span = start(last) + size(last) - start(first)
  const total = sorted.reduce((sum, e) => sum + size(e.bounds), 0)
  const gap = (span - total) / (sorted.length - 1)
  const moves: ItemMove[] = []
  let cursor = start(first) + size(first) + gap
  for (let index = 1; index < sorted.length - 1; index += 1) {
    const { key, bounds } = sorted[index]
    const delta = cursor - start(bounds)
    if (delta !== 0) moves.push(horizontal ? { key, dx: delta, dy: 0 } : { key, dx: 0, dy: delta })
    cursor += size(bounds) + gap
  }
  return withCarried(items, moves)
}

/** Applies the moves one item at a time with the normal translate, so connectors attached to a moved box follow it. Same array when there are no moves. */
export function applyMoves(items: CanvasItem[], moves: readonly ItemMove[]): CanvasItem[] {
  let result = items
  for (const move of moves) result = translateSelectedItems(result, new Set([move.key]), move.dx, move.dy)
  return result
}
