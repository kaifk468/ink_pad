/**
 * Flip selection (Shift+H / Shift+V, right-click chips, palette, context panel): mirrors the selection about the centre of its bounding box.
 * Boxes (shapes, class boxes, notes, text, code) are moved, never mirrored: size and content stay, only `angle` is negated. Stroke points and
 * connector free points are mirrored. An attached connector end is mirrored inside its box (offset -> size - offset), so it stays on the
 * same physical side of the flipped layout, and a connector follows a flipped box even when it is not selected. An elbow connector's
 * sideways `bend` is negated when it runs along the flipped axis. Locked items and unknown items stay put. Pure; no new saved fields.
 */
import { canvasItemKey, isItemLocked, translateInkBox, type CanvasItem, type ConnectorAttachment, type ConnectorObject, type Point, type RectangleObject } from './canvasModel'
import { bendableMiddle, routeConnector } from './connectorRoute'
import { isFlowBox, labelInsideBox } from './diagramFlow'

export type FlipAxis = 'horizontal' | 'vertical'

const flippable = (item: CanvasItem, keys: ReadonlySet<string>) => item.kind !== 'opaque' && keys.has(canvasItemKey(item)) && !isItemLocked(item)
const isStroke = (item: CanvasItem) => item.kind === 'stroke'

/** The selected, unlocked items a flip would move. */
function targets(items: readonly CanvasItem[], keys: ReadonlySet<string>): CanvasItem[] {
  return items.filter((item) => flippable(item, keys) && !(isStroke(item) && (item as { erase?: boolean }).erase))
}

/** True when the selection qualifies: two or more unlocked items, or one stroke / one connector. */
export function canFlipSelection(items: readonly CanvasItem[], keys: ReadonlySet<string>): boolean {
  const picked = targets(items, keys)
  if (picked.length >= 2) return true
  return picked.length === 1 && (picked[0].kind === 'stroke' || picked[0].kind === 'connector')
}

type Extent = { min: number; max: number }
const grow = (extent: Extent, value: number) => { extent.min = Math.min(extent.min, value); extent.max = Math.max(extent.max, value) }

/** The items with the selection mirrored on `axis`, or null when it does not qualify or nothing would change. */
export function flipSelectionItems(items: CanvasItem[], keys: ReadonlySet<string>, axis: FlipAxis): CanvasItem[] | null {
  if (!canFlipSelection(items, keys)) return null
  const horizontal = axis === 'horizontal'
  const picked = targets(items, keys)
  const flippedBoxes = new Map<number, RectangleObject>()
  for (const item of picked) if (item.kind === 'rectangle') flippedBoxes.set(item.id, item)
  // A selected label sitting inside a selected box travels with that box (translated by the box's delta, never mirrored on its own).
  const labelOwner = new Map<number, RectangleObject>()
  for (const item of picked) {
    if (item.kind !== 'text') continue
    let owner: RectangleObject | null = null
    for (const box of flippedBoxes.values()) {
      if (!isFlowBox(box) || !labelInsideBox(item, box)) continue
      if (!owner || box.width * box.height < owner.width * owner.height) owner = box
    }
    if (owner) labelOwner.set(item.id, owner)
  }
  const extent: Extent = { min: Infinity, max: -Infinity }
  const lo = (b: { x: number; y: number }) => (horizontal ? b.x : b.y)
  const size = (b: { width: number; height: number }) => (horizontal ? b.width : b.height)
  for (const item of picked) {
    if (item.kind === 'text' && labelOwner.has(item.id)) continue
    if (item.kind === 'rectangle' || item.kind === 'text' || item.kind === 'code') { grow(extent, lo(item)); grow(extent, lo(item) + size(item)) }
    else if (item.kind === 'stroke') for (const p of item.points) grow(extent, horizontal ? p.x : p.y)
    else if (item.kind === 'connector') {
      if (!item.startAttachment) grow(extent, horizontal ? item.start.x : item.start.y)
      if (!item.endAttachment) grow(extent, horizontal ? item.end.x : item.end.y)
    }
  }
  if (!Number.isFinite(extent.min)) return null
  const sum = extent.min + extent.max
  const mirror = (value: number) => sum - value
  const mirrorPoint = (p: Point): Point => (horizontal ? { ...p, x: mirror(p.x) } : { ...p, y: mirror(p.y) })
  const negate = (angle: number | undefined) => (angle ? -angle : angle)
  const rectangles = new Map(items.filter((i): i is RectangleObject => i.kind === 'rectangle').map((r) => [r.id, r]))
  const movedBox = (box: RectangleObject): RectangleObject => {
    const original = rectangles.get(box.id) as RectangleObject
    const next = horizontal ? mirror(original.x) - original.width : mirror(original.y) - original.height
    if (next === (horizontal ? original.x : original.y)) return original
    return horizontal ? { ...original, x: next } : { ...original, y: next }
  }
  const endpoint = (point: Point, attachment: ConnectorAttachment | undefined, selected: boolean) => {
    const box = attachment ? flippedBoxes.get(attachment.rectangleId) : undefined
    if (attachment && box) {
      const moved = movedBox(box)
      const offsetX = horizontal ? box.width - attachment.offsetX : attachment.offsetX
      const offsetY = horizontal ? attachment.offsetY : box.height - attachment.offsetY
      return { point: { ...point, x: moved.x + offsetX, y: moved.y + offsetY }, attachment: { ...attachment, offsetX, offsetY } }
    }
    if (selected && !attachment) return { point: mirrorPoint(point), attachment }
    return { point, attachment }
  }
  const selectedKey = (item: CanvasItem) => picked.includes(item)
  const result = items.map((item): CanvasItem => {
    if (item.kind === 'opaque') return item
    const selected = selectedKey(item)
    if (item.kind === 'rectangle') {
      if (!selected) return item
      const moved = movedBox(item)
      const dx = horizontal ? moved.x - item.x : 0
      const dy = horizontal ? 0 : moved.y - item.y
      if (moved === item && !item.angle) return item
      return { ...moved, ...(item.inkBox ? { inkBox: translateInkBox(item.inkBox, dx, dy) } : {}), ...(item.angle ? { angle: negate(item.angle) } : {}) }
    }
    if (item.kind === 'text') {
      if (!selected) return item
      const owner = labelOwner.get(item.id)
      if (owner) {
        const moved = movedBox(owner)
        const shift = horizontal ? moved.x - owner.x : moved.y - owner.y
        return shift === 0 ? item : { ...item, ...(horizontal ? { x: item.x + shift } : { y: item.y + shift }) }
      }
      const nextPos = horizontal ? mirror(item.x) - item.width : mirror(item.y) - item.height
      if (nextPos === (horizontal ? item.x : item.y) && !item.angle) return item
      return { ...item, ...(horizontal ? { x: nextPos } : { y: nextPos }), ...(item.angle ? { angle: negate(item.angle) } : {}) }
    }
    if (item.kind === 'code') {
      if (!selected) return item
      const next = horizontal ? mirror(item.x) - item.width : mirror(item.y) - item.height
      return next === (horizontal ? item.x : item.y) ? item : { ...item, ...(horizontal ? { x: next } : { y: next }) }
    }
    if (item.kind === 'stroke') {
      if (!selected) return item
      const points = item.points.map(mirrorPoint)
      return points.every((p, i) => p.x === item.points[i].x && p.y === item.points[i].y) ? item : { ...item, points }
    }
    const startMoves = !!item.startAttachment && flippedBoxes.has(item.startAttachment.rectangleId)
    const endMoves = !!item.endAttachment && flippedBoxes.has(item.endAttachment.rectangleId)
    if (!selected && !startMoves && !endMoves) return item
    const start = endpoint(item.start, item.startAttachment, selected)
    const end = endpoint(item.end, item.endAttachment, selected)
    const next: ConnectorObject = { ...item, start: start.point, end: end.point }
    if (start.attachment) next.startAttachment = start.attachment
    if (end.attachment) next.endAttachment = end.attachment
    if (item.routing === 'elbow' && item.bend && (selected || (startMoves && endMoves))) {
      const { bend: _bend, ...unbent } = item
      const middle = bendableMiddle(routeConnector(unbent, rectangles).routedPath ?? [])
      if (middle && (middle.axis === 'x') === horizontal) next.bend = -item.bend
    }
    const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y
    const sameAttachment = (a?: ConnectorAttachment, b?: ConnectorAttachment) => a?.offsetX === b?.offsetX && a?.offsetY === b?.offsetY
    if (same(next.start, item.start) && same(next.end, item.end) && sameAttachment(next.startAttachment, item.startAttachment) && sameAttachment(next.endAttachment, item.endAttachment) && next.bend === item.bend) return item
    return next
  })
  const changed = result.some((item, index) => item !== items[index])
  return changed ? result : null
}
