import type { RectangleBounds, RectangleResizeHandle } from './canvasModel'

const CORNERS: ReadonlySet<RectangleResizeHandle> = new Set(['nw', 'ne', 'se', 'sw'])

/**
 * Shift while resizing (Desktop mouse): a corner handle keeps the original width : height ratio, anchored at the opposite corner.
 * The larger of the two scale factors wins, so the box follows whichever axis the pointer moved further. Edge handles are returned
 * unchanged. The result never falls below `minimumSize` on either side (the ratio is kept). Grid snap is skipped while this applies
 * (the caller applies it only when Shift is up), because snapping afterwards would break the ratio.
 */
export function isCornerHandle(handle: RectangleResizeHandle): boolean {
  return CORNERS.has(handle)
}

/**
 * `limit` (optional) is the bound the box must stay inside (the sheet/workspace): the scale is capped so both axes stay within it
 * from the fixed corner, but never below the minimum size.
 */
export function keepAspect(original: RectangleBounds, proposed: RectangleBounds, handle: RectangleResizeHandle, minimumSize = 32, limit?: RectangleBounds): RectangleBounds {
  if (!CORNERS.has(handle) || !(original.width > 0) || !(original.height > 0)) return proposed
  let scale = Math.max(proposed.width / original.width, proposed.height / original.height)
  if (limit) {
    const anchorX = handle.includes('w') ? original.x + original.width : original.x
    const anchorY = handle.includes('n') ? original.y + original.height : original.y
    const room = {
      x: handle.includes('w') ? anchorX - limit.x : limit.x + limit.width - anchorX,
      y: handle.includes('n') ? anchorY - limit.y : limit.y + limit.height - anchorY,
    }
    scale = Math.min(scale, room.x / original.width, room.y / original.height)
  }
  scale = Math.max(scale, minimumSize / original.width, minimumSize / original.height)
  const width = original.width * scale
  const height = original.height * scale
  const x = handle.includes('w') ? original.x + original.width - width : original.x
  const y = handle.includes('n') ? original.y + original.height - height : original.y
  return { x, y, width, height }
}

/** Shift while moving (Desktop mouse): keep only the larger component of the drag, so the move runs along one axis. */
export function axisLock(dx: number, dy: number): { dx: number; dy: number } {
  return Math.abs(dx) >= Math.abs(dy) ? { dx, dy: 0 } : { dx: 0, dy }
}

/** The axis (`'dx'` or `'dy'`) that `axisLock` zeroes for this raw delta, or null when there is no drag yet. */
export function lockedAxis(dx: number, dy: number): 'dx' | 'dy' | null {
  if (dx === 0 && dy === 0) return null
  return Math.abs(dx) >= Math.abs(dy) ? 'dy' : 'dx'
}

/** After snapping, the axis that Shift locked stays at zero (so the move stays straight); the other axis keeps its snap. No lock: unchanged. */
export function keepLockedAxis(locked: 'dx' | 'dy' | null, snapped: { dx: number; dy: number }): { dx: number; dy: number } {
  if (locked === null) return snapped
  return locked === 'dx' ? { dx: 0, dy: snapped.dy } : { dx: snapped.dx, dy: 0 }
}

/** The "W × H" text of the size pill, in canvas units rounded to whole numbers. */
export function sizeReadoutText(width: number, height: number): string {
  return `${Math.round(width)} × ${Math.round(height)}`
}
