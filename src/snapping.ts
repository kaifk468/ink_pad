/**
 * Step 12: snapping and alignment guides while dragging boxes and text labels.
 * While items are moved, the left edge, horizontal centre and right edge (and top, vertical centre, bottom) of the moving
 * bounds snap to the same lines of nearby boxes and labels within a tolerance, and thin guide lines show what they snapped to.
 * Everything here is pure and transient: guides are drawn on the canvas render pass only and are never items, history, saved
 * data, thumbnail, export or minimap content. A per-device on/off setting lives in localStorage like the input mode.
 */

import { canvasItemKey, getCanvasSelectionBounds, type CanvasItem, type RectangleBounds } from './canvasModel'

export type Bounds = RectangleBounds
/** A guide line in canvas units: `axis: 'x'` is a vertical line at x = position from `start` to `end` in y; `'y'` is horizontal. */
export type Guide = { axis: 'x' | 'y'; position: number; start: number; end: number }
/** A measure marker for an equal gap: a short line from (x1, y1) to (x2, y2) with end ticks and the gap `size` as a label. */
export type GapMarker = { x1: number; y1: number; x2: number; y2: number; size: number }
export type SnapResult = { dx: number; dy: number; guides: Guide[]; gapMarkers?: GapMarker[] }

/** Screen pixels: a finger-sized slip must not make a box jump, so the pen gets less than the mouse. */
export const SNAP_TOLERANCE_MOUSE_PX = 6
export const SNAP_TOLERANCE_PEN_PX = 5
/** Extra canvas units around the visible area within which targets still count. */
export const SNAP_VIEW_MARGIN = 200
const MAX_GUIDES_PER_AXIS = 6
const SAME_LINE = 0.01

export function snapTolerancePx(pointerType: string): number {
  return pointerType === 'mouse' ? SNAP_TOLERANCE_MOUSE_PX : SNAP_TOLERANCE_PEN_PX
}

const NO_SNAP: SnapResult = { dx: 0, dy: 0, guides: [] }

function nearest(moving: readonly number[], target: readonly number[], limit: number): number | null {
  let best: number | null = null
  for (const m of moving) {
    for (const t of target) {
      const delta = t - m
      if (Math.abs(delta) <= limit && (best === null || Math.abs(delta) < Math.abs(best))) best = delta
    }
  }
  return best
}

/**
 * The nudge that aligns `moving` with the nearest line of any target on each axis, and the guides to draw.
 * `tolerance` is in screen pixels and is divided by the zoom `scale`. An axis with nothing within tolerance gets no snap.
 * The returned guides are for the position after the snap, spanning the moving bounds and every target aligned on that line.
 */
export function findSnap(moving: Bounds, targets: readonly Bounds[], tolerance: number, scale = 1): SnapResult {
  if (targets.length === 0) return NO_SNAP
  const limit = tolerance / scale
  const mx = [moving.x, moving.x + moving.width / 2, moving.x + moving.width]
  const my = [moving.y, moving.y + moving.height / 2, moving.y + moving.height]
  let dx: number | null = null
  let dy: number | null = null
  for (const target of targets) {
    const bx = nearest(mx, [target.x, target.x + target.width / 2, target.x + target.width], limit)
    if (bx !== null && (dx === null || Math.abs(bx) < Math.abs(dx))) dx = bx
    const by = nearest(my, [target.y, target.y + target.height / 2, target.y + target.height], limit)
    if (by !== null && (dy === null || Math.abs(by) < Math.abs(dy))) dy = by
  }
  if (dx === null && dy === null) return NO_SNAP
  const sx = dx ?? 0
  const sy = dy ?? 0
  const guides: Guide[] = []
  const snapped = { x: moving.x + sx, y: moving.y + sy, width: moving.width, height: moving.height }
  if (dx !== null) addGuides(guides, 'x', snapped, targets, [snapped.x, snapped.x + snapped.width / 2, snapped.x + snapped.width])
  if (dy !== null) addGuides(guides, 'y', snapped, targets, [snapped.y, snapped.y + snapped.height / 2, snapped.y + snapped.height])
  return { dx: sx, dy: sy, guides }
}

function addGuides(guides: Guide[], axis: 'x' | 'y', moving: Bounds, targets: readonly Bounds[], movingLines: readonly number[]) {
  const lineSpan = axis === 'x' ? [moving.y, moving.y + moving.height] : [moving.x, moving.x + moving.width]
  let added = 0
  for (const target of targets) {
    const targetLines = axis === 'x' ? [target.x, target.x + target.width / 2, target.x + target.width] : [target.y, target.y + target.height / 2, target.y + target.height]
    const targetSpan = axis === 'x' ? [target.y, target.y + target.height] : [target.x, target.x + target.width]
    for (const line of targetLines) {
      if (!movingLines.some((m) => Math.abs(m - line) < SAME_LINE)) continue
      const existing = guides.find((guide) => guide.axis === axis && Math.abs(guide.position - line) < SAME_LINE)
      const start = Math.min(lineSpan[0], targetSpan[0], existing?.start ?? Infinity)
      const end = Math.max(lineSpan[1], targetSpan[1], existing?.end ?? -Infinity)
      if (existing) { existing.start = start; existing.end = end } else if (added < MAX_GUIDES_PER_AXIS) { guides.push({ axis, position: line, start, end }); added += 1 }
    }
  }
}

function intersects(a: Bounds, b: Bounds): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
}

/** The targets that touch the visible area (grown by a margin), so a big page only compares what is near the screen. */
export function cullTargets(targets: readonly Bounds[], visible: Bounds, margin = SNAP_VIEW_MARGIN): Bounds[] {
  const area = { x: visible.x - margin, y: visible.y - margin, width: visible.width + margin * 2, height: visible.height + margin * 2 }
  return targets.filter((target) => intersects(target, area))
}

/** Whether moving this selection may snap: it has a box or a text label (ink and connectors alone never snap). */
export function selectionCanSnap(items: readonly CanvasItem[], keys: ReadonlySet<string>): boolean {
  return items.some((item) => (item.kind === 'rectangle' || item.kind === 'text' || item.kind === 'code') && keys.has(canvasItemKey(item)))
}

/** The boxes and labels that are not being moved, as bounds, ready to cull. Read once when a drag starts. */
export function snapTargetsFor(items: readonly CanvasItem[], movingKeys: ReadonlySet<string>): Bounds[] {
  const targets: Bounds[] = []
  for (const item of items) {
    if (item.kind !== 'rectangle' && item.kind !== 'text' && item.kind !== 'code') continue
    const key = canvasItemKey(item)
    if (movingKeys.has(key)) continue
    const bounds = getCanvasSelectionBounds([item], new Set([key]))
    if (bounds) targets.push(bounds)
  }
  return targets
}

type GapSide = { delta: number; markers: GapMarker[] } | null

/** Best equal-gap snap along one axis. `horizontal`: gaps run along x and boxes must share a row (vertical overlap). */
function equalGapAxis(moving: Bounds, targets: readonly Bounds[], limit: number, horizontal: boolean): GapSide {
  const lo = (b: Bounds) => (horizontal ? b.x : b.y)
  const size = (b: Bounds) => (horizontal ? b.width : b.height)
  const hi = (b: Bounds) => lo(b) + size(b)
  const crossLo = (b: Bounds) => (horizontal ? b.y : b.x)
  const crossHi = (b: Bounds) => crossLo(b) + (horizontal ? b.height : b.width)
  const row = targets.filter((t) => crossLo(t) < crossHi(moving) && crossHi(t) > crossLo(moving)).sort((a, b) => lo(a) - lo(b))
  if (row.length < 2) return null
  // Existing gaps between neighbouring boxes of the row (consecutive in order, a real gap only).
  const gaps: { size: number; a: Bounds; b: Bounds }[] = []
  for (let i = 0; i + 1 < row.length; i++) {
    const gap = lo(row[i + 1]) - hi(row[i])
    if (gap > SAME_LINE) gaps.push({ size: gap, a: row[i], b: row[i + 1] })
  }
  // The neighbours of the moving box: the nearest box ending before it and the nearest starting after it.
  let before: Bounds | null = null
  let after: Bounds | null = null
  for (const t of row) {
    if (hi(t) <= lo(moving) + limit && (!before || hi(t) > hi(before))) before = t
    if (lo(t) >= hi(moving) - limit && (!after || lo(t) < lo(after))) after = t
  }
  const mid = (a: number, b: number) => (a + b) / 2
  const place = (from: number, to: number, cross: number): GapMarker =>
    horizontal ? { x1: from, y1: cross, x2: to, y2: cross, size: to - from } : { x1: cross, y1: from, x2: cross, y2: to, size: to - from }
  const refMarker = (g: { a: Bounds; b: Bounds }): GapMarker => {
    const start = Math.max(crossLo(g.a), crossLo(g.b))
    const end = Math.min(crossHi(g.a), crossHi(g.b))
    const cross = end > start ? mid(start, end) : mid(crossLo(g.a), crossHi(g.a))
    return place(hi(g.a), lo(g.b), cross)
  }
  let best: GapSide = null
  const consider = (delta: number, markers: GapMarker[]) => {
    if (Math.abs(delta) <= limit && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, markers }
  }
  const crossMid = mid(crossLo(moving), crossHi(moving))
  for (const g of gaps) {
    if (before) {
      const start = hi(before)
      const delta = start + g.size - lo(moving)
      // the gap to the box before must not make the moving box overlap the one after
      if (!after || lo(moving) + delta + size(moving) <= lo(after)) consider(delta, [place(start, start + g.size, crossMid), refMarker(g)])
    }
    if (after) {
      const end = lo(after)
      const delta = end - g.size - size(moving) - lo(moving)
      if (!before || lo(moving) + delta >= hi(before)) consider(delta, [place(end - g.size, end, crossMid), refMarker(g)])
    }
  }
  // Centred between the two neighbours: both gaps equal.
  if (before && after) {
    const free = lo(after) - hi(before) - size(moving)
    if (free > SAME_LINE) {
      const start = hi(before) + free / 2
      consider(start - lo(moving), [place(hi(before), start, crossMid), place(start + size(moving), lo(after), crossMid)])
    }
  }
  return best
}

/**
 * Equal-gap snap: when the gap between the moving box and its nearest neighbour on one side can be made equal to a gap
 * between two other boxes in the same row (or column), the box snaps there. Returns the delta per axis (0 when that axis
 * has no match) and the measure markers to draw, or null when nothing matches. `tolerance` is screen px, divided by `scale`.
 */
export function findEqualGapSnap(moving: Bounds, targets: readonly Bounds[], tolerance: number, scale = 1): { dx: number; dy: number; markers: GapMarker[]; axes: { x: boolean; y: boolean } } | null {
  if (targets.length < 2) return null
  const limit = tolerance / scale
  const x = equalGapAxis(moving, targets, limit, true)
  const y = equalGapAxis(moving, targets, limit, false)
  if (!x && !y) return null
  return { dx: x?.delta ?? 0, dy: y?.delta ?? 0, markers: [...(x?.markers ?? []), ...(y?.markers ?? [])], axes: { x: x !== null, y: y !== null } }
}

/** Snapping only runs when the setting is on; Alt with a mouse turns it off for that drag. `null` means no snap. */
export function snapForDrag(
  settingOn: boolean,
  altHeldWithMouse: boolean,
  moving: Bounds,
  targets: readonly Bounds[],
  pointerType: string,
  scale: number,
  equalGaps = true,
): SnapResult | null {
  if (!settingOn || altHeldWithMouse) return null
  const tolerance = snapTolerancePx(pointerType)
  const align = findSnap(moving, targets, tolerance, scale)
  if (!equalGaps) return align
  const gap = findEqualGapSnap(moving, targets, tolerance, scale)
  if (!gap) return align
  // Per axis the nearer snap wins; alignment keeps its guide when it is as near or nearer.
  const alignsX = align.guides.some((guide) => guide.axis === 'x')
  const alignsY = align.guides.some((guide) => guide.axis === 'y')
  const useX = gap.axes.x && (!alignsX || Math.abs(gap.dx) < Math.abs(align.dx))
  const useY = gap.axes.y && (!alignsY || Math.abs(gap.dy) < Math.abs(align.dy))
  if (!useX && !useY) return align
  return {
    dx: useX ? gap.dx : align.dx,
    dy: useY ? gap.dy : align.dy,
    guides: align.guides.filter((guide) => !(guide.axis === 'x' && useX) && !(guide.axis === 'y' && useY)),
    gapMarkers: gapMarkersFor(gap, useX, useY),
  }
}

function gapMarkersFor(gap: { markers: GapMarker[] }, useX: boolean, useY: boolean): GapMarker[] {
  // Horizontal markers (y1 === y2) belong to the x axis, vertical ones to the y axis.
  return gap.markers.filter((marker) => (marker.y1 === marker.y2 ? useX : useY))
}

const SNAPPING_KEY = 'inkpad.snapping'

/** The setting is on unless it was explicitly turned off; an unreadable store means on. */
export function loadSnapping(storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    const source = storage ?? window.localStorage
    return source.getItem(SNAPPING_KEY) !== 'off'
  } catch {
    return true
  }
}

export function saveSnapping(on: boolean, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const target = storage ?? window.localStorage
    target.setItem(SNAPPING_KEY, on ? 'on' : 'off')
  } catch {
    /* storage unavailable: the choice lasts for this session only */
  }
}
