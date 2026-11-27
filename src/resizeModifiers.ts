import type { RectangleBounds, RectangleResizeHandle } from './canvasModel'

const CORNERS: ReadonlySet<RectangleResizeHandle> = new Set(['nw', 'ne', 'se', 'sw'])

/**
 * Shift while resizing (Desktop mouse): a corner handle keeps the original width : height ratio, anchored at the opposite corner.
 * The larger of the two scale factors wins, so the box follows whichever axis the pointer moved further. Edge handles are returned
 * unchanged. The result never falls below `minimumSize` on either side (the ratio is kept). Grid snap is skipped while this applies
 * (the caller applies it only when Shift is up), because snapping afterwards would break the ratio.
 */
export function keepAspect(original: RectangleBounds, proposed: RectangleBounds, handle: RectangleResizeHandle, minimumSize = 32): RectangleBounds {
  if (!CORNERS.has(handle) || !(original.width > 0) || !(original.height > 0)) return proposed
  let scale = Math.max(proposed.width / original.width, proposed.height / original.height)
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

/** The "W × H" text of the size pill, in canvas units rounded to whole numbers. */
export function sizeReadoutText(width: number, height: number): string {
  return `${Math.round(width)} × ${Math.round(height)}`
}
