/**
 * Snap to grid (Desktop mode, mouse only). A per-device on/off setting (off by default, never in a diagram) and the pure
 * maths that rounds a moved box's top-left, a resized edge or a new shape's corner to the grid. Tablet pen and touch paths
 * never call into this. The faint dot grid drawn during a gesture is transient render output, not an item.
 */

import { getCanvasSelectionBounds, type CanvasItem, type RectangleBounds, type RectangleResizeHandle } from './canvasModel'
import type { CanvasType } from './canvasTypes'
import { isometricRowHeight, pageSpacingUnits, type PageSpacing } from './pageTemplates'

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

/**
 * The grid size for a page: the dotted, grid and isometric pages' own spacing (for isometric this is the lattice's
 * horizontal spacing, see snapPointToLattice), otherwise 20 units (blank, lined, Cornell: as before).
 */
export function gridSpacingFor(canvas: CanvasType, spacing: PageSpacing): number {
  return canvas === 'dotted' || canvas === 'grid' || canvas === 'isometric' ? pageSpacingUnits(spacing) : DEFAULT_GRID_SIZE
}

/** True when snapping goes to the triangular lattice of the isometric canvas instead of a square grid. */
export function isLatticeCanvas(canvas: CanvasType): boolean {
  return canvas === 'isometric'
}

/**
 * The lattice point nearest to (x, y) on the isometric canvas: rows are `isometricRowHeight(spacing)` apart (spacing * sqrt(3) / 2)
 * and points in a row are `spacing` apart, every odd row shifted right by half a spacing. Matches the dots the sheet draws.
 */
export function snapPointToLattice(x: number, y: number, spacing: number): { x: number; y: number } {
  if (!(spacing > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return { x, y }
  const rowHeight = isometricRowHeight(spacing)
  const rowAt = y / rowHeight
  let best = { x, y, distance: Infinity }
  for (const row of [Math.floor(rowAt), Math.ceil(rowAt)]) {
    const shift = Math.abs(row % 2) === 1 ? spacing / 2 : 0
    const px = Math.round((x - shift) / spacing) * spacing + shift + 0
    const py = row * rowHeight + 0
    const distance = Math.hypot(px - x, py - y)
    if (distance < best.distance) best = { x: px, y: py, distance }
  }
  return { x: best.x, y: best.y }
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
export function snapMoveDelta(bounds: Pick<RectangleBounds, 'x' | 'y'>, dx: number, dy: number, grid: number, lattice = false): { dx: number; dy: number } {
  if (lattice) {
    const target = snapPointToLattice(bounds.x + dx, bounds.y + dy, grid)
    return { dx: target.x - bounds.x, dy: target.y - bounds.y }
  }
  return { dx: snapToGrid(bounds.x + dx, grid) - bounds.x, dy: snapToGrid(bounds.y + dy, grid) - bounds.y }
}

/** One point (a new shape's corner) snapped to the square grid or, with `lattice`, to the isometric lattice. */
export function snapPoint(point: { x: number; y: number }, grid: number, lattice = false): { x: number; y: number } {
  return lattice ? snapPointToLattice(point.x, point.y, grid) : { x: snapToGrid(point.x, grid), y: snapToGrid(point.y, grid) }
}

/**
 * A resize result with the moved edge(s) of `handle` on the grid; the opposite edges stay put. An axis whose snap would shrink below the minimum is left as is.
 * With `lattice` (isometric) a vertical edge snaps to half-spacing columns (every lattice column of either row parity) and a horizontal edge to the row height.
 */
export function snapResizeBounds(bounds: RectangleBounds, handle: RectangleResizeHandle, grid: number, lattice = false): RectangleBounds {
  const gridX = lattice ? grid / 2 : grid
  const gridY = lattice ? isometricRowHeight(grid) : grid
  let left = bounds.x
  let right = bounds.x + bounds.width
  let top = bounds.y
  let bottom = bounds.y + bounds.height
  if (handle.includes('w')) { const next = snapToGrid(left, gridX); if (right - next >= MIN_SNAPPED_SIZE) left = next }
  if (handle.includes('e')) { const next = snapToGrid(right, gridX); if (next - left >= MIN_SNAPPED_SIZE) right = next }
  if (handle.includes('n')) { const next = snapToGrid(top, gridY); if (bottom - next >= MIN_SNAPPED_SIZE) top = next }
  if (handle.includes('s')) { const next = snapToGrid(bottom, gridY); if (next - top >= MIN_SNAPPED_SIZE) bottom = next }
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
export function gridNudgeDelta(bounds: Pick<RectangleBounds, 'x' | 'y'>, dx: number, dy: number, grid: number, lattice = false): { dx: number; dy: number } {
  if (!(grid > 0)) return { dx, dy }
  if (lattice) {
    // Isometric: the top-left goes to the nearest lattice point, then one lattice step per press (five with a large nudge):
    // sideways by a spacing, down by rows (x moves right half a spacing) or up (x moves left half a spacing), so the point stays on the lattice (steps are 1 or 5, both odd).
    const steps = Math.max(Math.abs(dx), Math.abs(dy)) > 1 ? 5 : 1
    const rowHeight = isometricRowHeight(grid)
    let point = snapPointToLattice(bounds.x, bounds.y, grid)
    if (dx !== 0) point = { x: point.x + Math.sign(dx) * steps * grid, y: point.y }
    if (dy !== 0) point = snapPointToLattice(point.x + Math.sign(dy) * (grid / 2), point.y + Math.sign(dy) * steps * rowHeight, grid)
    return { dx: point.x - bounds.x, dy: point.y - bounds.y }
  }
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
