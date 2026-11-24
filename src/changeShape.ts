import { canvasItemKey, HLD_SHAPES, isItemLocked } from './canvasModel'
import type { CanvasItem, HldShape, RectangleObject, ShapeKind } from './canvasModel'
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
  if (isHldChoice(target)) return { ...rest, hldShape: target }
  return { ...rest, ...(target === 'diamond' ? { diamond: true as const } : {}), ...(target === 'ellipse' ? { ellipse: true as const } : {}) }
}

/**
 * The items with every selected box changed to `target`. Returns the same array when the change is refused (see changeShapeChoices) or
 * nothing would change. Connectors are untouched: their attachments are side midpoints, which lie on the outline of every shape.
 */
export function changeSelectedShapes(items: CanvasItem[], keys: ReadonlySet<string>, target: ShapeChoice): CanvasItem[] {
  const offered = changeShapeChoices(items, keys)
  if (!offered || !offered.choices.some((choice) => choice.id === target)) return items
  let changed = false
  const next = items.map((item): CanvasItem => {
    if (item.kind !== 'rectangle' || !keys.has(canvasItemKey(item))) return item
    const result = changeBoxShape(item, target)
    if (!result || result === item) return item
    changed = true
    return result
  })
  return changed ? next : items
}
