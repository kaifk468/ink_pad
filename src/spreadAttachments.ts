import type { CanvasItem, ConnectorAttachment, ConnectorObject, RectangleObject } from './canvasModel'

type End = 'start' | 'end'
type SideName = 'left' | 'right' | 'top' | 'bottom'

const SIDE_EPSILON = 0.5

/** The side of the box an attachment point lies on (left / right win at the corners), or null when it is on none (an interior point). */
function sideOf(box: RectangleObject, a: ConnectorAttachment): SideName | null {
  if (Math.abs(a.offsetX) <= SIDE_EPSILON) return 'left'
  if (Math.abs(a.offsetX - box.width) <= SIDE_EPSILON) return 'right'
  if (Math.abs(a.offsetY) <= SIDE_EPSILON) return 'top'
  if (Math.abs(a.offsetY - box.height) <= SIDE_EPSILON) return 'bottom'
  return null
}

/**
 * Importer post-pass: when two or more connector ends attach to the same side of one box, spread them evenly along that side
 * (the i-th of n at (i + 1) / (n + 1) of the side), ordered by where the other end lies so the lines do not cross. Offsets and the
 * stored start / end points are updated together (point = box corner + offset, as `Sheet.connect` stores them). Sides holding one end
 * keep their midpoint. Ellipses, diamonds and rotated boxes are left alone, as is everything that is not a plain attached connector.
 * Returns the same array when nothing changes.
 */
export function spreadConnectorAttachments(items: CanvasItem[]): CanvasItem[] {
  const boxes = new Map<number, RectangleObject>()
  for (const item of items) if (item.kind === 'rectangle') boxes.set(item.id, item)
  const eligible = (box: RectangleObject | undefined): box is RectangleObject => box !== undefined && !box.ellipse && !box.diamond && !box.angle
  type Entry = { index: number; end: End; side: SideName; box: RectangleObject; sortKey: number }
  const groups = new Map<string, Entry[]>()
  items.forEach((item, index) => {
    if (item.kind !== 'connector') return
    for (const end of ['start', 'end'] as const) {
      const attachment = end === 'start' ? item.startAttachment : item.endAttachment
      const otherAttachment = end === 'start' ? item.endAttachment : item.startAttachment
      const box = attachment ? boxes.get(attachment.rectangleId) : undefined
      if (!attachment || !eligible(box)) continue
      const side = sideOf(box, attachment)
      if (!side) continue
      const otherBox = otherAttachment ? boxes.get(otherAttachment.rectangleId) : undefined
      const other = otherBox ? { x: otherBox.x + otherBox.width / 2, y: otherBox.y + otherBox.height / 2 } : end === 'start' ? item.end : item.start
      const sortKey = side === 'top' || side === 'bottom' ? other.x : other.y
      const key = `${box.id}:${side}`
      const list = groups.get(key)
      if (list) list.push({ index, end, side, box, sortKey })
      else groups.set(key, [{ index, end, side, box, sortKey }])
    }
  })
  const next = items.slice()
  let changed = false
  for (const entries of groups.values()) {
    if (entries.length < 2) continue
    entries.sort((a, b) => a.sortKey - b.sortKey || a.index - b.index)
    entries.forEach((entry, position) => {
      const fraction = (position + 1) / (entries.length + 1)
      const { box, side } = entry
      const attachment: ConnectorAttachment = side === 'top' || side === 'bottom'
        ? { rectangleId: box.id, offsetX: box.width * fraction, offsetY: side === 'top' ? 0 : box.height }
        : { rectangleId: box.id, offsetX: side === 'left' ? 0 : box.width, offsetY: box.height * fraction }
      const connector = next[entry.index] as ConnectorObject
      const point = { x: box.x + attachment.offsetX, y: box.y + attachment.offsetY, pressure: connector[entry.end].pressure }
      next[entry.index] = entry.end === 'start' ? { ...connector, start: point, startAttachment: attachment } : { ...connector, end: point, endAttachment: attachment }
      changed = true
    })
  }
  return changed ? next : items
}
