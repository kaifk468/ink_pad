import { createConnector, snapConnectorEndpoint, type CanvasItem, type ConnectorObject, type LineDash, type Point, type RectangleObject } from './canvasModel'
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
  const boxes: RectangleObject[] = items.filter(isFlowBox)
  const startSnap = snapConnectorEndpoint(tail, boxes, tolerance, true)
  const endSnap = snapConnectorEndpoint(tip, boxes, tolerance, true)
  if (shape === 'line') {
    if (!startSnap || !endSnap || startSnap.attachment.rectangleId === endSnap.attachment.rectangleId) return null
  } else if (!startSnap && !endSnap) return null
  const connector = createConnector(style.id, startSnap?.point ?? tail, endSnap?.point ?? tip, style.color, style.width, startSnap?.attachment, endSnap?.attachment, shape === 'arrow' ? 'directed-association' : 'association')
  return style.dash ? { ...connector, dash: style.dash } : connector
}
