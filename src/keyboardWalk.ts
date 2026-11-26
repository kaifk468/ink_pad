/**
 * Keyboard walk (desktop, Select tool): Tab / Shift+Tab step through the items in reading order, Alt+Arrow jumps from a box to the box
 * linked to it in that direction. Pure: these functions only pick keys and a viewport; the App applies the selection. Nothing is saved.
 */
import { canvasItemKey, getCanvasSelectionBounds, isItemLocked, type CanvasItem, type RectangleBounds } from './canvasModel'
import type { Viewport } from './viewport'

export type WalkDirection = 'right' | 'left' | 'up' | 'down'

/** Items whose centres differ by less than this (canvas units) vertically count as one row of the reading order. */
export const WALK_ROW_TOLERANCE = 30

type Entry = { key: string; cx: number; cy: number; kind: number; id: number }

const KIND_ORDER: Record<string, number> = { rectangle: 0, code: 1, text: 2, connector: 3 }

/** Shapes, text, code blocks and connectors that are not locked. Ink strokes, eraser marks and unknown (opaque) items are not stops. */
const isStop = (item: CanvasItem): boolean => (item.kind === 'rectangle' || item.kind === 'text' || item.kind === 'code' || item.kind === 'connector') && !isItemLocked(item)

function boundsOf(item: CanvasItem): RectangleBounds | null {
  return getCanvasSelectionBounds([item], new Set([canvasItemKey(item)]))
}

/** Keys of every stop in reading order: rows from top to bottom (centres within WALK_ROW_TOLERANCE of the row's first item), left to right inside a row. */
export function walkOrder(items: readonly CanvasItem[]): string[] {
  const entries: Entry[] = []
  for (const item of items) {
    if (!isStop(item)) continue
    const bounds = boundsOf(item)
    if (!bounds) continue
    entries.push({ key: canvasItemKey(item), cx: bounds.x + bounds.width / 2, cy: bounds.y + bounds.height / 2, kind: KIND_ORDER[item.kind] ?? 9, id: 'id' in item ? item.id : 0 })
  }
  entries.sort((a, b) => a.cy - b.cy || a.cx - b.cx || a.kind - b.kind || a.id - b.id)
  const rows: Entry[][] = []
  for (const entry of entries) {
    const row = rows[rows.length - 1]
    if (row && entry.cy - row[0].cy <= WALK_ROW_TOLERANCE) row.push(entry)
    else rows.push([entry])
  }
  return rows.flatMap((row) => row.sort((a, b) => a.cx - b.cx || a.cy - b.cy || a.kind - b.kind || a.id - b.id)).map((entry) => entry.key)
}

/** What a Tab step does: select `key`, or `leave` (the end of the order was passed: clear the selection and let the browser move focus). Null when the page has no stop. */
export type WalkResult = { key: string } | { leave: true } | null

const groupOfKey = (items: readonly CanvasItem[], key: string): number | undefined => {
  const item = items.find((candidate) => canvasItemKey(candidate) === key)
  return item && item.kind !== 'opaque' ? item.group : undefined
}

/**
 * Tab (step 1) or Shift+Tab (step -1). `current` is the walked key, or null (nothing walked): then Tab picks the first stop and Shift+Tab the last.
 * No wrap: stepping past the last stop (or before the first) leaves the walk. Other members of the current key's group are skipped, because
 * walking to a group member selects the whole group.
 */
export function walkStep(items: readonly CanvasItem[], current: string | null, step: 1 | -1): WalkResult {
  const order = walkOrder(items)
  if (order.length === 0) return null
  const index = current === null ? -1 : order.indexOf(current)
  if (index < 0) return { key: step === 1 ? order[0] : order[order.length - 1] }
  const group = groupOfKey(items, current as string)
  for (let i = index + step; i >= 0 && i < order.length; i += step) {
    if (group !== undefined && groupOfKey(items, order[i]) === group) continue
    return { key: order[i] }
  }
  return { leave: true }
}

/**
 * The key a walk step starts from. `selection` is the current selection keys; `lastWalked` the key the previous step selected. When the selection is
 * exactly that key's group (several items after group expansion) the walk continues from it; otherwise the sole selected key, or null.
 */
export function walkCurrentKey(items: readonly CanvasItem[], selection: ReadonlySet<string>, lastWalked: string | null): string | null {
  if (lastWalked !== null && selection.has(lastWalked)) {
    const group = groupOfKey(items, lastWalked)
    if (group === undefined) return selection.size === 1 ? lastWalked : null
    const members = new Set<string>([lastWalked])
    for (const item of items) if (item.kind !== 'opaque' && item.group === group && item.locked !== true) members.add(canvasItemKey(item))
    if (members.size === selection.size && [...members].every((key) => selection.has(key))) return lastWalked
  }
  return selection.size === 1 ? [...selection][0] : null
}

const DIRECTION_VECTORS: Record<WalkDirection, [number, number]> = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] }

/**
 * From the box `fromKey`, the box linked to it by a connector that lies in `direction`: among the boxes at the other end of connectors
 * attached to it, the one whose centre makes the smallest angle with the direction (nearest wins a tie). Boxes more than 90 degrees off
 * the direction, locked boxes and the box itself are ignored. Null when `fromKey` is not a box or nothing qualifies.
 */
export function linkedNeighbour(items: readonly CanvasItem[], fromKey: string, direction: WalkDirection): string | null {
  const from = items.find((item) => item.kind === 'rectangle' && canvasItemKey(item) === fromKey)
  if (!from || from.kind !== 'rectangle') return null
  const centres = new Map<number, { x: number; y: number; locked: boolean }>()
  for (const item of items) if (item.kind === 'rectangle') centres.set(item.id, { x: item.x + item.width / 2, y: item.y + item.height / 2, locked: isItemLocked(item) })
  const origin = centres.get(from.id)
  if (!origin) return null
  const [dx, dy] = DIRECTION_VECTORS[direction]
  let best: { key: string; angle: number; distance: number } | null = null
  const seen = new Set<number>()
  for (const item of items) {
    if (item.kind !== 'connector') continue
    const a = item.startAttachment?.rectangleId
    const b = item.endAttachment?.rectangleId
    const other = a === from.id ? b : b === from.id ? a : undefined
    if (other === undefined || other === from.id || seen.has(other)) continue
    const target = centres.get(other)
    if (!target || target.locked) continue
    seen.add(other)
    const vx = target.x - origin.x
    const vy = target.y - origin.y
    const distance = Math.hypot(vx, vy)
    if (distance === 0) continue
    const cos = (vx * dx + vy * dy) / distance
    if (cos <= 0) continue
    const angle = Math.acos(Math.min(1, cos))
    if (!best || angle < best.angle - 1e-9 || (Math.abs(angle - best.angle) <= 1e-9 && distance < best.distance)) best = { key: `rectangle:${other}`, angle, distance }
  }
  return best ? best.key : null
}

/**
 * The viewport that shows `bounds` (canvas units): the same one when the item already lies inside the visible area (with `margin` screen pixels
 * to spare), otherwise the same zoom centred on the item. `view` is the size of the canvas in screen pixels.
 */
export function revealViewport(viewport: Viewport, bounds: RectangleBounds, view: { width: number; height: number }, margin = 24): Viewport {
  const left = bounds.x * viewport.scale + viewport.offsetX
  const top = bounds.y * viewport.scale + viewport.offsetY
  const right = left + bounds.width * viewport.scale
  const bottom = top + bounds.height * viewport.scale
  if (left >= margin && top >= margin && right <= view.width - margin && bottom <= view.height - margin) return viewport
  return {
    ...viewport,
    offsetX: view.width / 2 - (bounds.x + bounds.width / 2) * viewport.scale,
    offsetY: view.height / 2 - (bounds.y + bounds.height / 2) * viewport.scale,
  }
}

/** The bounds of one item (for revealing it), or null when it has none. */
export function walkItemBounds(items: readonly CanvasItem[], key: string): RectangleBounds | null {
  const item = items.find((candidate) => canvasItemKey(candidate) === key)
  return item ? boundsOf(item) : null
}
