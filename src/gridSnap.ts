/**
 * Snap to grid (Desktop mode, mouse only). A per-device on/off setting (off by default, never in a diagram) and the pure
 * maths that rounds a moved box's top-left, a resized edge or a new shape's corner to the grid. Tablet pen and touch paths
 * never call into this. The faint dot grid drawn during a gesture is transient render output, not an item.
 */

import { getCanvasSelectionBounds, type CanvasItem, type RectangleBounds, type RectangleResizeHandle } from './canvasModel'
import { pageSpacingUnits, type PageSpacing, type PageTemplate } from './pageTemplates'

export const GRID_SNAP_KEY = 'inkpad.snapToGrid'
/** Grid size in world units when the page has no dot grid of its own. */
export const DEFAULT_GRID_SIZE = 20
/** Smallest box a grid-snapped resize may produce (matches the resize minimum). */
const MIN_SNAPPED_SIZE = 32

export function loadGridSnap(storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    return (storage ?? window.localStorage).getItem(GRID_SNAP_KEY) === '1'
  } catch {
    return false
  }
}

export function saveGridSnap(on: boolean, storage?: Pick<Storage, 'setItem'>): void {
  try {
    (storage ?? window.localStorage).setItem(GRID_SNAP_KEY, on ? '1' : '0')
  } catch {
    /* storage unavailable: the choice lasts for this session only */
  }
}

/** The grid size for a page: the dotted page's own spacing, otherwise 20 units. */
export function gridSpacingFor(template: PageTemplate, spacing: PageSpacing): number {
  return template === 'dotted' ? pageSpacingUnits(spacing) : DEFAULT_GRID_SIZE
}

/** True while a gesture should snap: setting on, Desktop mode, a mouse (never pen or touch). */
export function gridSnapApplies(on: boolean, mode: string, pointerType: string): boolean {
  return on && mode === 'desktop' && pointerType === 'mouse'
}

/** The grid line nearest to `value` (never -0). */
export function snapToGrid(value: number, grid: number): number {
  if (!(grid > 0) || !Number.isFinite(value)) return value
  return Math.round(value / grid) * grid + 0
}

/** The move delta that puts the top-left of `bounds` on a grid point after moving by (dx, dy); every item moves by the same delta. */
export function snapMoveDelta(bounds: Pick<RectangleBounds, 'x' | 'y'>, dx: number, dy: number, grid: number): { dx: number; dy: number } {
  return { dx: snapToGrid(bounds.x + dx, grid) - bounds.x, dy: snapToGrid(bounds.y + dy, grid) - bounds.y }
}

/** A resize result with the moved edge(s) of `handle` on the grid; the opposite edges stay put. An axis whose snap would shrink below the minimum is left as is. */
export function snapResizeBounds(bounds: RectangleBounds, handle: RectangleResizeHandle, grid: number): RectangleBounds {
  let left = bounds.x
  let right = bounds.x + bounds.width
  let top = bounds.y
  let bottom = bounds.y + bounds.height
  if (handle.includes('w')) { const next = snapToGrid(left, grid); if (right - next >= MIN_SNAPPED_SIZE) left = next }
  if (handle.includes('e')) { const next = snapToGrid(right, grid); if (next - left >= MIN_SNAPPED_SIZE) right = next }
  if (handle.includes('n')) { const next = snapToGrid(top, grid); if (bottom - next >= MIN_SNAPPED_SIZE) top = next }
  if (handle.includes('s')) { const next = snapToGrid(bottom, grid); if (next - top >= MIN_SNAPPED_SIZE) bottom = next }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Dot positions of the grid inside `view` (canvas units), for the transient overlay. Capped so a tiny grid at low zoom stays cheap. */
export function gridDots(view: RectangleBounds, grid: number, maxDots = 4000): { x: number; y: number }[] {
  if (!(grid > 0)) return []
  const x0 = Math.ceil(view.x / grid)
  const x1 = Math.floor((view.x + view.width) / grid)
  const y0 = Math.ceil(view.y / grid)
  const y1 = Math.floor((view.y + view.height) / grid)
  const cols = x1 - x0 + 1
  const rows = y1 - y0 + 1
  if (cols <= 0 || rows <= 0) return []
  // Over the cap: double the step (dots stay on multiples of the grid) until the count fits.
  let step = 1
  while (Math.ceil(cols / step) * Math.ceil(rows / step) > maxDots && step < 1 << 20) step *= 2
  const dots: { x: number; y: number }[] = []
  for (let row = Math.ceil(y0 / step) * step; row <= y1; row += step) for (let col = Math.ceil(x0 / step) * step; col <= x1; col += step) dots.push({ x: col * grid + 0, y: row * grid + 0 })
  return dots
}

/** Selection bounds without the stroke-width padding of getCanvasSelectionBounds: the raw top-left a grid snap should use. */
export function unpaddedSelectionBounds(items: CanvasItem[], keys: ReadonlySet<string>): RectangleBounds | null {
  const bare = items.map((item): CanvasItem => {
    if (item.kind === 'rectangle' || item.kind === 'connector') return { ...item, strokeWidth: 0 }
    if (item.kind === 'stroke') return { ...item, width: 0 }
    return item
  })
  return getCanvasSelectionBounds(bare, keys)
}

/**
 * The arrow-key nudge with Snap to grid on: the direction is the sign of (dx, dy), the distance one grid step (five for a
 * large nudge, |step| above 1), and the top-left of `bounds` ends on a grid line. An off-grid edge first goes to the next line.
 */
export function gridNudgeDelta(bounds: Pick<RectangleBounds, 'x' | 'y'>, dx: number, dy: number, grid: number): { dx: number; dy: number } {
  if (!(grid > 0)) return { dx, dy }
  const steps = Math.max(Math.abs(dx), Math.abs(dy)) > 1 ? 5 : 1
  const EPS = 1e-6
  const axis = (from: number, delta: number): number => {
    if (delta === 0) return 0
    const lines = from / grid
    const target = delta > 0 ? (Math.floor(lines + EPS) + steps) * grid : (Math.ceil(lines - EPS) - steps) * grid
    return target - from
  }
  return { dx: axis(bounds.x, dx), dy: axis(bounds.y, dy) }
}

/** `to` rotated about `from` to the nearest multiple of `stepDeg`, keeping the distance between them. */
export function snapAngle(from: { x: number; y: number }, to: { x: number; y: number }, stepDeg = 15): { x: number; y: number } {
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  if (length === 0 || !(stepDeg > 0)) return { x: to.x, y: to.y }
  const step = (stepDeg * Math.PI) / 180
  const angle = Math.round(Math.atan2(to.y - from.y, to.x - from.x) / step) * step
  return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length }
}
