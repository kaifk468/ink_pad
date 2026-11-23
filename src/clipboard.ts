/**
 * Step 10: the in-app clipboard rules (copy, cut, paste, duplicate). Pure: the App keeps the copied items in memory only.
 * A copy is a deep clone of the selected items in page order. A paste adds fresh clones with new ids from the
 * per-kind counters (the same counters new drawings use, which are shared by every page, so ids never collide), shifted by an
 * offset that is clamped to the workspace. Nothing here adds a field, an item kind or a version to the saved document.
 */

import { canvasItemKey, cloneCanvasItems, getCanvasSelectionBounds, type CanvasItem, type ConnectorObject, type RectangleObject, type Stroke, type TextObject } from './canvasModel'
import { remapGroupsForPaste } from './grouping'
import { clampTranslationToBounds, type ViewBounds } from './viewport'

/** How far each consecutive paste moves from the original, in canvas units. */
export const PASTE_OFFSET = 24

export type IdCounters = { stroke: number; rectangle: number; connector: number; text: number }

/** A deep clone of the selected items (page order), with the derived elbow path left out so only saved fields are copied. */
export function copyItems(items: readonly CanvasItem[], keys: ReadonlySet<string>): CanvasItem[] {
  const chosen = items.filter((item) => item.kind !== 'opaque' && keys.has(canvasItemKey(item)))
  return cloneCanvasItems(chosen).map((item) => {
    if (item.kind !== 'connector' || item.routedPath === undefined) return item
    const { routedPath: _routedPath, ...saved } = item
    void _routedPath
    return saved
  })
}

/**
 * Translation for a paste. With a cursor point the centre of the group's bounding box lands on it (then the group is clamped
 * inside the workspace, keeping its layout); without one the group moves by `offset` in x and y (also clamped).
 */
export function pasteTranslation(bounds: ViewBounds, offset: number, workspace: ViewBounds, at?: { x: number; y: number } | null): { dx: number; dy: number } {
  if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) {
    return clampTranslationToBounds(bounds, at.x - (bounds.x + bounds.width / 2), at.y - (bounds.y + bounds.height / 2), workspace)
  }
  return clampTranslationToBounds(bounds, offset, offset, workspace)
}

export type PasteResult = { items: CanvasItem[]; keys: string[]; counters: IdCounters; dx: number; dy: number }

/**
 * Fresh clones of the copied items, moved by `offset` in x and y, or centred on `at` when a cursor point is given (less when that would leave the workspace; the group moves
 * as one so its layout is kept). Connectors: an end attached to a copied box is re-pointed at the new box; an end attached to a
 * box that was not copied is detached (it stays where it was drawn, offset with the rest). Returns null for an empty clipboard.
 */
export function pasteItems(clip: readonly CanvasItem[], counters: IdCounters, offset: number, workspace: ViewBounds, at?: { x: number; y: number } | null, existing: readonly CanvasItem[] = []): PasteResult | null {
  if (clip.length === 0) return null
  // A pasted copy is never locked.
  const source = cloneCanvasItems([...clip]).map((item) => {
    if (item.kind === 'opaque' || item.locked === undefined) return item
    const { locked: _locked, ...unlocked } = item
    void _locked
    return unlocked as CanvasItem
  })
  const bounds = getCanvasSelectionBounds(source, new Set(source.map(canvasItemKey)))
  const { dx, dy } = bounds ? pasteTranslation(bounds, offset, workspace, at) : { dx: offset, dy: offset }
  const next = { ...counters }
  const newRectangleIds = new Map<number, number>()
  for (const item of source) if (item.kind === 'rectangle') newRectangleIds.set(item.id, next.rectangle++)
  const moveStroke = (stroke: Stroke): Stroke => ({ ...stroke, id: next.stroke++, points: stroke.points.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })) })
  const moved: CanvasItem[] = source.map((item): CanvasItem => {
    if (item.kind === 'rectangle') {
      const copy: RectangleObject = { ...item, id: newRectangleIds.get(item.id) as number, x: item.x + dx, y: item.y + dy }
      if (item.inkBox) copy.inkBox = { top: item.inkBox.top + dy, mid: item.inkBox.mid + dy, ink: item.inkBox.ink.map(moveStroke) }
      return copy
    }
    if (item.kind === 'text') {
      const copy: TextObject = { ...item, id: next.text++, x: item.x + dx, y: item.y + dy }
      return copy
    }
    if (item.kind === 'code') return { ...item, id: next.text++, x: item.x + dx, y: item.y + dy } // code blocks share the label counter
    if (item.kind === 'opaque') return item
    if (item.kind === 'connector') {
      const { startAttachment, endAttachment, ...rest } = item
      const copy: ConnectorObject = {
        ...rest,
        id: next.connector++,
        start: { ...item.start, x: item.start.x + dx, y: item.start.y + dy },
        end: { ...item.end, x: item.end.x + dx, y: item.end.y + dy },
      }
      const startId = startAttachment ? newRectangleIds.get(startAttachment.rectangleId) : undefined
      const endId = endAttachment ? newRectangleIds.get(endAttachment.rectangleId) : undefined
      if (startAttachment && startId !== undefined) copy.startAttachment = { ...startAttachment, rectangleId: startId }
      if (endAttachment && endId !== undefined) copy.endAttachment = { ...endAttachment, rectangleId: endId }
      return copy
    }
    return moveStroke(item)
  })
  // A pasted group is a new group of its own (copies never join the original).
  const items = remapGroupsForPaste(moved, existing)
  return { items, keys: items.map(canvasItemKey), counters: next, dx, dy }
}
