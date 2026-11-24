import { canvasItemKey, HLD_SHAPES, isItemLocked, nearestRectangleBoundaryPoint } from './canvasModel'
import type { CanvasItem, ConnectorObject, HldShape, Point, RectangleObject, ShapeKind } from './canvasModel'
import { isFillableRectangle } from './sketchy'
import { HLD_SHAPE_LABELS } from './hldShapes'

/** Change shape (right-click menu, desktop panel): a plain box becomes another plain shape, an HLD box another HLD shape. */
export type ShapeChoice = ShapeKind | HldShape
export type ShapeFamily = 'plain' | 'hld'
export type ShapeChoiceOption = { id: ShapeChoice; label: string }

export const PLAIN_SHAPES: readonly ShapeKind[] = ['rectangle', 'diamond', 'ellipse']
export const PLAIN_SHAPE_LABELS: Record<ShapeKind, string> = { rectangle: 'Rectangle', diamond: 'Diamond', ellipse: 'Ellipse' }

export function shapeChoiceLabel(choice: ShapeChoice): string {
  return (PLAIN_SHAPES as readonly string[]).includes(choice) ? PLAIN_SHAPE_LABELS[choice as ShapeKind] : HLD_SHAPE_LABELS[choice as HldShape]
}

export function isHldChoice(choice: string): choice is HldShape {
  return (HLD_SHAPES as readonly string[]).includes(choice)
}

/** The shape of a changeable box, or null for anything that cannot change (class boxes, ink boxes that are not HLD shapes, other items). */
export function boxShape(item: CanvasItem): { family: ShapeFamily; shape: ShapeChoice } | null {
  if (item.kind !== 'rectangle' || item.classBox) return null
  if (item.hldShape) return item.inkBox ? { family: 'hld', shape: item.hldShape } : null
  if (item.inkBox) return null
  return { family: 'plain', shape: item.diamond ? 'diamond' : item.ellipse ? 'ellipse' : 'rectangle' }
}

/** The selected boxes (rectangles only; labels, connectors and code blocks in the selection are ignored). */
function selectedBoxes(items: readonly CanvasItem[], keys: ReadonlySet<string>): RectangleObject[] {
  return items.filter((item): item is RectangleObject => item.kind === 'rectangle' && keys.has(canvasItemKey(item)))
}

/**
 * The shapes the selection can change to: null when nothing applies (no box selected, a class box, code block-like or
 * non-HLD ink box, a locked box, or boxes of both families). Several boxes of one family share one list; the shape every
 * box already has is left out, and boxes with different shapes are offered every shape of the family.
 */
export function changeShapeChoices(items: readonly CanvasItem[], keys: ReadonlySet<string>): { family: ShapeFamily; choices: ShapeChoiceOption[] } | null {
  const boxes = selectedBoxes(items, keys)
  if (boxes.length === 0) return null
  let family: ShapeFamily | null = null
  const current = new Set<ShapeChoice>()
  for (const box of boxes) {
    const shape = boxShape(box)
    if (!shape || isItemLocked(box)) return null
    if (family !== null && family !== shape.family) return null
    family = shape.family
    current.add(shape.shape)
  }
  if (family === null) return null
  const all: readonly ShapeChoice[] = family === 'plain' ? PLAIN_SHAPES : HLD_SHAPES
  const exclude = current.size === 1 ? [...current][0] : null
  return { family, choices: all.filter((shape) => shape !== exclude).map((id) => ({ id, label: shapeChoiceLabel(id) })) }
}

/** One box with the new shape; it keeps everything else (position, size, colours, fill, width, dash, rotation, group, ink). Null when it cannot change. */
export function changeBoxShape(box: RectangleObject, target: ShapeChoice): RectangleObject | null {
  const current = boxShape(box)
  if (!current || isItemLocked(box)) return null
  const targetFamily: ShapeFamily = isHldChoice(target) ? 'hld' : 'plain'
  if (targetFamily !== current.family) return null
  if (current.shape === target) return box
  const { diamond: _diamond, ellipse: _ellipse, hldShape: _hldShape, ...rest } = box
  const shaped: RectangleObject = isHldChoice(target)
    ? { ...rest, hldShape: target }
    : { ...rest, ...(target === 'diamond' ? { diamond: true as const } : {}), ...(target === 'ellipse' ? { ellipse: true as const } : {}) }
  // Fill colour and hand-drawn seed only live on fillable shapes (the saved format drops them elsewhere), so they go when the target cannot carry them.
  if (isFillableRectangle(shaped)) return shaped
  const { fillColor: _fill, seed: _seed, ...plain } = shaped
  return plain
}

/** The nearest point of a diamond's outline to `point`. */
function nearestDiamondPoint(box: RectangleObject, point: Point): Point {
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const corners: Point[] = [{ x: cx, y: box.y, pressure: point.pressure }, { x: box.x + box.width, y: cy, pressure: point.pressure }, { x: cx, y: box.y + box.height, pressure: point.pressure }, { x: box.x, y: cy, pressure: point.pressure }]
  let best = corners[0]
  let bestDistance = Infinity
  for (let index = 0; index < 4; index += 1) {
    const a = corners[index]
    const b = corners[(index + 1) % 4]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)))
    const candidate = { x: a.x + dx * t, y: a.y + dy * t, pressure: point.pressure }
    const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y)
    if (distance < bestDistance) { best = candidate; bestDistance = distance }
  }
  return best
}

/** The nearest point of an ellipse's outline to `point` (sampled, then refined around the best sample). */
function nearestEllipsePoint(box: RectangleObject, point: Point): Point {
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const rx = box.width / 2
  const ry = box.height / 2
  const at = (t: number): Point => ({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t), pressure: point.pressure })
  const dist = (t: number) => { const p = at(t); return Math.hypot(point.x - p.x, point.y - p.y) }
  let bestT = 0
  let bestD = Infinity
  const steps = 360
  for (let index = 0; index < steps; index += 1) {
    const t = (index / steps) * Math.PI * 2
    const d = dist(t)
    if (d < bestD) { bestD = d; bestT = t }
  }
  let lo = bestT - (Math.PI / steps) * 2
  let hi = bestT + (Math.PI / steps) * 2
  for (let index = 0; index < 40; index += 1) {
    const m1 = lo + (hi - lo) / 3
    const m2 = hi - (hi - lo) / 3
    if (dist(m1) < dist(m2)) hi = m2
    else lo = m1
  }
  return at((lo + hi) / 2)
}

/** The nearest point on the outline of `box` (already in its new shape) to `point`. */
export function nearestShapeOutlinePoint(box: RectangleObject, point: Point): Point {
  if (box.diamond) return nearestDiamondPoint(box, point)
  if (box.ellipse) return nearestEllipsePoint(box, point)
  return nearestRectangleBoundaryPoint(box, point)
}

/** Connectors with each end attached to a changed box moved to the nearest point of its new outline (attachment offsets follow). Locked connectors and rotated boxes are left alone. */
function reattachToChangedBoxes(items: CanvasItem[], changedBoxes: ReadonlyMap<number, RectangleObject>): CanvasItem[] {
  return items.map((item): CanvasItem => {
    if (item.kind !== 'connector' || isItemLocked(item)) return item
    let result: ConnectorObject = item
    for (const end of ['start', 'end'] as const) {
      const attachment = end === 'start' ? item.startAttachment : item.endAttachment
      const box = attachment ? changedBoxes.get(attachment.rectangleId) : undefined
      if (!attachment || !box || (box.angle ?? 0) !== 0) continue
      const old = result[end]
      const moved = nearestShapeOutlinePoint(box, old)
      if (Math.hypot(moved.x - old.x, moved.y - old.y) < 0.01) continue
      const { bend: _bend, ...withoutBend } = result
      const nextAttachment = { rectangleId: attachment.rectangleId, offsetX: moved.x - box.x, offsetY: moved.y - box.y }
      result = { ...withoutBend, [end]: { ...old, x: moved.x, y: moved.y }, ...(end === 'start' ? { startAttachment: nextAttachment } : { endAttachment: nextAttachment }) }
    }
    return result
  })
}

/**
 * The items with every selected box changed to `target`. Returns the same array when the change is refused (see changeShapeChoices) or
 * nothing would change. Connector ends attached to a changed box are moved to the nearest point of the new outline (they may sit
 * anywhere on the old one, e.g. near a rectangle corner), so they never float off a diamond or ellipse.
 */
export function changeSelectedShapes(items: CanvasItem[], keys: ReadonlySet<string>, target: ShapeChoice): CanvasItem[] {
  const offered = changeShapeChoices(items, keys)
  if (!offered || !offered.choices.some((choice) => choice.id === target)) return items
  let changed = false
  const changedBoxes = new Map<number, RectangleObject>()
  const next = items.map((item): CanvasItem => {
    if (item.kind !== 'rectangle' || !keys.has(canvasItemKey(item))) return item
    const result = changeBoxShape(item, target)
    if (!result || result === item) return item
    changed = true
    changedBoxes.set(result.id, result)
    return result
  })
  return changed ? reattachToChangedBoxes(next, changedBoxes) : items
}
