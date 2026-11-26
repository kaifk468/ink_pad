import { createConnector, snapConnectorEndpoint, type CanvasItem, type ConnectorObject, type LineDash, type Point, type RectangleObject } from './canvasModel'
import { isContainerBox } from './boundary'
import { isFlowBox } from './diagramFlow'

/**
 * Pen and touch: a recognized (straightened) arrow or line stroke becomes an attached connector when it touches boxes.
 * - Arrow (Shapes mode): tail or tip on a box -> directed connector (a free end stays a free point).
 * - Line (hold to straighten): only when both ends are on two different boxes -> plain association connector (no arrowhead).
 * Everything else stays the stroke. Pure, no DOM.
 */
export type PenShapeKind = 'arrow' | 'line'

export function penConnectorFor(
  items: readonly CanvasItem[],
  shape: PenShapeKind,
  tail: Point,
  tip: Point,
  style: { id: number; color: string; width: number; dash?: LineDash },
  tolerance: number,
): ConnectorObject | null {
  if (Math.hypot(tip.x - tail.x, tip.y - tail.y) < 4) return null
  const all: RectangleObject[] = items.filter(isFlowBox)
  const inside = (box: RectangleObject, point: { x: number; y: number }) => !box.angle && point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height
  // A boundary around both ends is not a target: an arrow between two boxes inside it connects those boxes.
  const boxes = all.filter((box) => !(inside(box, tail) && inside(box, tip) && isContainerBox(items, box)))
  const snap = (point: Point) => {
    const found = snapConnectorEndpoint(point, boxes, tolerance, true)
    if (!found) return found
    const owner = boxes.find((box) => box.id === found.attachment.rectangleId)
    // Inside a boundary: a box nested within reach wins over the boundary itself.
    if (owner && inside(owner, point) && isContainerBox(items, owner)) {
      const nested = snapConnectorEndpoint(point, boxes.filter((box) => box !== owner && inside(owner, box) && inside(owner, { x: box.x + box.width, y: box.y + box.height })), tolerance, false)
      if (nested) return nested
    }
    return found
  }
  // A pen end drawn deep inside a box attaches to the middle of the side that faces the other end (not the nearest
  // side, which for a line drawn into the middle of a box is often the top or bottom; found in the round 8 walk).
  const facing = (found: ReturnType<typeof snap>, point: Point, other: Point): ReturnType<typeof snap> => {
    if (!found) return found
    const box = boxes.find((item) => item.id === found.attachment.rectangleId)
    if (!box || !inside(box, point) || inside(box, other)) return found
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const dx = (other.x - cx) / Math.max(1, box.width / 2)
    const dy = (other.y - cy) / Math.max(1, box.height / 2)
    const side = Math.abs(dx) >= Math.abs(dy)
      ? { x: dx < 0 ? box.x : box.x + box.width, y: cy }
      : { x: cx, y: dy < 0 ? box.y : box.y + box.height }
    const sidePoint = { ...found.point, x: side.x, y: side.y }
    return { point: sidePoint, attachment: { ...found.attachment, offsetX: side.x - box.x, offsetY: side.y - box.y } }
  }
  const startSnap = facing(snap(tail), tail, tip)
  const endSnap = facing(snap(tip), tip, tail)
  // Both ends on the same box would be a self-loop: keep the stroke.
  if (startSnap && endSnap && startSnap.attachment.rectangleId === endSnap.attachment.rectangleId) return null
  if (shape === 'line') {
    if (!startSnap || !endSnap) return null
  } else if (!startSnap && !endSnap) return null
  const connector = createConnector(style.id, startSnap?.point ?? tail, endSnap?.point ?? tip, style.color, style.width, startSnap?.attachment, endSnap?.attachment, shape === 'arrow' ? 'directed-association' : 'association')
  return style.dash ? { ...connector, dash: style.dash } : connector
}
