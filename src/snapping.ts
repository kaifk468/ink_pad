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
export type SnapResult = { dx: number; dy: number; guides: Guide[] }

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

/** Snapping only runs when the setting is on; Alt with a mouse turns it off for that drag. `null` means no snap. */
export function snapForDrag(
  settingOn: boolean,
  altHeldWithMouse: boolean,
  moving: Bounds,
  targets: readonly Bounds[],
  pointerType: string,
  scale: number,
): SnapResult | null {
  if (!settingOn || altHeldWithMouse) return null
  return findSnap(moving, targets, snapTolerancePx(pointerType), scale)
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
