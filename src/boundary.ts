/**
 * Add boundary (right-click chip, panel, palette): a dashed grey rectangle around the selection with a "Boundary" label at its
 * top-left, sent behind everything. Both are ordinary items (a plain rectangle and a text label); nothing new is saved. Pure.
 */
import { canvasItemKey, createShapeBox, getCanvasSelectionBounds, reorderItems, type CanvasItem, type RectangleBounds, type RectangleObject, type TextFontId, type TextObject } from './canvasModel'
import { createTextObject } from './textLayout'

export const BOUNDARY_PADDING = 32
export const BOUNDARY_COLOR = '#64748b'
export const BOUNDARY_LABEL = 'Boundary'
export const BOUNDARY_FONT_SIZE = 16
const LABEL_INSET_X = 12
const LABEL_INSET_Y = 8

/** The rectangle around the selection, padded and kept inside the workspace; null when the selection has no bounds. */
export function boundaryBounds(items: CanvasItem[], keys: ReadonlySet<string>, workspace: RectangleBounds): RectangleBounds | null {
  const selection = getCanvasSelectionBounds(items, keys)
  if (!selection) return null
  const left = Math.max(workspace.x, selection.x - BOUNDARY_PADDING)
  const top = Math.max(workspace.y, selection.y - BOUNDARY_PADDING)
  const right = Math.min(workspace.x + workspace.width, selection.x + selection.width + BOUNDARY_PADDING)
  const bottom = Math.min(workspace.y + workspace.height, selection.y + selection.height + BOUNDARY_PADDING)
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }
}

export type BoundaryResult = { items: CanvasItem[]; rectangle: RectangleObject; label: TextObject }

/**
 * The items plus the boundary rectangle (behind all other items, but never past an eraser stroke) and its label (on top). Null when nothing is selected.
 * The rectangle grows (inside the workspace) when the label would not fit in its width.
 */
export function addBoundary(
  items: CanvasItem[],
  keys: ReadonlySet<string>,
  ids: { rectangle: number; text: number },
  workspace: RectangleBounds,
  style: { strokeWidth?: number; fontFamily?: TextFontId; measure?: Parameters<typeof createTextObject>[6] } = {},
): BoundaryResult | null {
  const bounds = boundaryBounds(items, keys, workspace)
  if (!bounds) return null
  const label = createTextObject(ids.text, bounds.x + LABEL_INSET_X, bounds.y + LABEL_INSET_Y, BOUNDARY_LABEL, BOUNDARY_COLOR, BOUNDARY_FONT_SIZE, style.measure, style.fontFamily)
  const width = Math.min(Math.max(bounds.width, label.width + 2 * LABEL_INSET_X), workspace.x + workspace.width - bounds.x)
  const rectangle: RectangleObject = { ...createShapeBox(ids.rectangle, bounds.x, bounds.y, width, bounds.height, BOUNDARY_COLOR, style.strokeWidth ?? 2, 'rectangle'), dash: 'dashed' }
  const behind = reorderItems([...items, rectangle], new Set([canvasItemKey(rectangle)]), 'back')
  return { items: [...behind, label], rectangle, label }
}

/** The label of a plain box sits in its middle; a boundary's own label sits at its top-left corner. */
const OWN_LABEL_CORNER = 48

function insideBox(box: RectangleBounds, item: RectangleBounds): boolean {
  return item.x >= box.x && item.y >= box.y && item.x + item.width <= box.x + box.width && item.y + item.height <= box.y + box.height
}

function isOwnLabel(box: RectangleBounds, text: TextObject): boolean {
  if (text.x - box.x <= OWN_LABEL_CORNER && text.y - box.y <= OWN_LABEL_CORNER) return true // the "Boundary" label
  const dx = text.x + text.width / 2 - (box.x + box.width / 2)
  const dy = text.y + text.height / 2 - (box.y + box.height / 2)
  return Math.abs(dx) <= box.width * 0.2 && Math.abs(dy) <= box.height * 0.2 // a label centred in the box
}

/**
 * True for a "container": an unfilled, unrotated plain rectangle (not a class box, ink box, HLD shape, oval or diamond) that fully
 * holds at least one other unlocked box, code block or text label that is not its own label. Its interior is not a hit target
 * (only its edge band and its label are), so a boundary around a group never blocks the marquee, deselect or the items beneath.
 */
export function isContainerBox(items: readonly CanvasItem[], box: RectangleObject): boolean {
  if (box.classBox || box.inkBox || box.hldShape || box.ellipse || box.diamond || box.angle) return false
  if (box.fillColor && !/^(none|transparent)$/i.test(box.fillColor) && !/^#[0-9a-f]{6}00$/i.test(box.fillColor)) return false
  for (const item of items) {
    if (item === box || item.kind === 'opaque' || item.kind === 'stroke' || item.kind === 'connector' || item.locked) continue
    if (item.kind === 'text') {
      if (insideBox(box, item) && !isOwnLabel(box, item)) return true
    } else if ((item.kind === 'rectangle' || item.kind === 'code') && insideBox(box, item)) return true
  }
  return false
}
