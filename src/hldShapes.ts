import { createInkClassBox } from './inkClassBox'
import type { HldShape, RectangleBounds, RectangleObject } from './canvasModel'

export { HLD_SHAPES } from './canvasModel'
export type { HldShape } from './canvasModel'

/**
 * HLD (system design) shapes: Database, Queue and Service. Each is one rectangle with an ink area (the same object as an
 * ink class box, without the three sections) and an `hldShape` kind that only changes how the outline is drawn. So
 * writing, moving, resizing, lasso, erasers, connector snapping, export and saving all work as they do for class boxes.
 * The outline is one SVG path string shared by the canvas (Path2D) and the SVG/PNG export.
 */
export const HLD_SHAPE_LABELS: Record<HldShape, string> = { database: 'Database', queue: 'Queue', service: 'Service' }
/** Size of a shape made by a plain tap. */
export const HLD_DEFAULT_SIZE: Record<HldShape, { width: number; height: number }> = {
  database: { width: 300, height: 240 },
  queue: { width: 420, height: 140 },
  service: { width: 360, height: 180 },
}

export function createHldShape(id: number, x: number, y: number, width: number, height: number, strokeColor: string, strokeWidth: number, shape: HldShape): RectangleObject {
  return { ...createInkClassBox(id, x, y, width, height, strokeColor, strokeWidth), hldShape: shape }
}

const n = (value: number) => Math.round(value * 100) / 100

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  return `M${n(x + radius)} ${n(y)}H${n(x + w - radius)}A${n(radius)} ${n(radius)} 0 0 1 ${n(x + w)} ${n(y + radius)}V${n(y + h - radius)}`
    + `A${n(radius)} ${n(radius)} 0 0 1 ${n(x + w - radius)} ${n(y + h)}H${n(x + radius)}A${n(radius)} ${n(radius)} 0 0 1 ${n(x)} ${n(y + h - radius)}`
    + `V${n(y + radius)}A${n(radius)} ${n(radius)} 0 0 1 ${n(x + radius)} ${n(y)}Z`
}

/** The outline of the shape as SVG path data, drawn with the box's stroke colour and width and no fill. */
export function hldOutlinePath(rectangle: RectangleBounds, shape: HldShape): string {
  const { x, y, width: w, height: h } = rectangle
  if (shape === 'database') {
    // A cylinder: a full ellipse on top, straight sides, and the lower half of an ellipse at the bottom.
    const ry = Math.max(6, Math.min(h * 0.16, 34, h / 3))
    const rx = w / 2
    return `M${n(x)} ${n(y + ry)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x + w)} ${n(y + ry)}A${n(rx)} ${n(ry)} 0 0 1 ${n(x)} ${n(y + ry)}Z`
      + `M${n(x)} ${n(y + ry)}V${n(y + h - ry)}A${n(rx)} ${n(ry)} 0 0 0 ${n(x + w)} ${n(y + h - ry)}V${n(y + ry)}`
  }
  if (shape === 'queue') {
    // A rounded box with a cap at each end; the arrow in each cap shows which way the line moves.
    const cap = Math.max(20, Math.min(w * 0.13, 56))
    const s = Math.max(5, Math.min(cap * 0.28, h * 0.18))
    const cy = y + h / 2
    const chevron = (cx: number) => `M${n(cx - s / 2)} ${n(cy - s)}L${n(cx + s / 2)} ${n(cy)}L${n(cx - s / 2)} ${n(cy + s)}`
    return roundedRectPath(x, y, w, h, Math.min(14, h / 3))
      + `M${n(x + cap)} ${n(y)}V${n(y + h)}M${n(x + w - cap)} ${n(y)}V${n(y + h)}`
      + chevron(x + cap / 2) + chevron(x + w - cap / 2)
  }
  return roundedRectPath(x, y, w, h, Math.min(Math.min(w, h) * 0.28, 44))
}
