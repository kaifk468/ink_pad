/**
 * Imports land in free space: Mermaid, PlantUML and Excalidraw inserts that would overlap existing items are moved beside them.
 * Pure: bounds in, offset out. The offset is added to the placement the insert already had (nothing saved changes).
 */

import type { ViewBounds } from './viewport'

/** Space kept clear around existing items, in canvas units. */
export const INSERT_MARGIN = 40

const intersects = (a: ViewBounds, b: ViewBounds, margin: number): boolean =>
  a.x < b.x + b.width + margin && a.x + a.width > b.x - margin && a.y < b.y + b.height + margin && a.y + a.height > b.y - margin

/**
 * The extra offset that moves `placed` (where the insert would land) off the `existing` item bounds. {0,0} when it already
 * keeps `margin` clear. Otherwise: first to the right of all existing content (top-aligned with `placed`), when it fits inside
 * `workspace`; else below it (left-aligned with `placed`, clamped sideways into the workspace); else {0,0} (nowhere free: keep the placement).
 */
export function freeInsertOffset(placed: ViewBounds, existing: readonly ViewBounds[], workspace: ViewBounds, margin = INSERT_MARGIN): { dx: number; dy: number } {
  const none = { dx: 0, dy: 0 }
  if (existing.length === 0 || !existing.some((box) => intersects(placed, box, margin))) return none
  let right = -Infinity
  let bottom = -Infinity
  for (const box of existing) {
    right = Math.max(right, box.x + box.width)
    bottom = Math.max(bottom, box.y + box.height)
  }
  const wsRight = workspace.x + workspace.width
  const wsBottom = workspace.y + workspace.height
  const rightX = right + margin
  if (rightX + placed.width <= wsRight) return { dx: rightX - placed.x, dy: 0 }
  const belowY = bottom + margin
  if (belowY + placed.height <= wsBottom) {
    const x = Math.min(Math.max(placed.x, workspace.x), Math.max(workspace.x, wsRight - placed.width))
    return { dx: x - placed.x, dy: belowY - placed.y }
  }
  return none
}

/** True when the placed bounds are at least partly outside the visible canvas rectangle (so the view should scroll to them). */
export function isOutsideView(placed: ViewBounds, view: ViewBounds): boolean {
  return placed.x < view.x || placed.y < view.y || placed.x + placed.width > view.x + view.width || placed.y + placed.height > view.y + view.height
}
