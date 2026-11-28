/**
 * Swap positions (right-click chip, palette): with exactly two boxes selected, each takes the other's centre. Sizes are kept.
 * Labels inside a box travel with it and attached connectors re-route (the same move helper a drag uses). Pure.
 */
import { canvasItemKey, isItemLocked, translateSelectedItems, type CanvasItem, type RectangleBounds, type RectangleObject } from './canvasModel'
import { isFlowBox, labelsInside } from './diagramFlow'

const grouped = (item: RectangleObject) => item.group !== undefined

/** The two selected boxes to swap: exactly two flow boxes selected (other selected items are ignored), both unlocked and not in a group, neither inside the other. */
export function swapCandidates(items: readonly CanvasItem[], keys: ReadonlySet<string>): [RectangleObject, RectangleObject] | null {
  const boxes = items.filter((item): item is RectangleObject => isFlowBox(item) && keys.has(canvasItemKey(item)))
  if (boxes.length !== 2) return null
  const [a, b] = boxes
  if (boxes.some((box) => isItemLocked(box) || grouped(box))) return null
  const inside = (outer: RectangleObject, inner: RectangleObject) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height
  if (inside(a, b) || inside(b, a)) return null
  return [a, b]
}

export const canSwapPositions = (items: readonly CanvasItem[], keys: ReadonlySet<string>) => swapCandidates(items, keys) !== null

/** The items with the two selected boxes' centres swapped (each kept inside `workspace` when given), or null when the selection does not qualify. */
export function swapPositionsItems(items: CanvasItem[], keys: ReadonlySet<string>, workspace?: RectangleBounds): CanvasItem[] | null {
  const pair = swapCandidates(items, keys)
  if (!pair) return null
  const [a, b] = pair
  const centreA = { x: a.x + a.width / 2, y: a.y + a.height / 2 }
  const centreB = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  const shift = (box: RectangleObject, target: { x: number; y: number }) => {
    let x = target.x - box.width / 2
    let y = target.y - box.height / 2
    if (workspace) {
      x = Math.max(workspace.x, Math.min(x, workspace.x + workspace.width - box.width))
      y = Math.max(workspace.y, Math.min(y, workspace.y + workspace.height - box.height))
    }
    return { dx: x - box.x, dy: y - box.y }
  }
  const moveA = shift(a, centreB)
  const moveB = shift(b, centreA)
  // Owners are decided on the original positions, one box at a time, so a label never changes hands.
  const labelsA = labelsInside(items, new Set([canvasItemKey(a)]))
  const labelsB = labelsInside(items, new Set([canvasItemKey(b)]))
  if (moveA.dx === 0 && moveA.dy === 0 && moveB.dx === 0 && moveB.dy === 0) return null
  // Moving one box at a time lets a connector between the two follow both ends.
  let result = translateSelectedItems(items, new Set([canvasItemKey(a), ...labelsA]), moveA.dx, moveA.dy)
  result = translateSelectedItems(result, new Set([canvasItemKey(b), ...labelsB]), moveB.dx, moveB.dy)
  return result
}
