import { createConnector, createShapeBox, toItemFrame } from './canvasModel'
import { nearestShapeOutlinePoint } from './changeShape'
import type { Arrowheads, CanvasItem, ConnectorAttachment, ConnectorObject, LineDash, Point, RectangleObject, Stroke, TextFontId, TextObject } from './canvasModel'
import { BOUNDARY_COLOR, BOUNDARY_FONT_SIZE } from './boundary'
import { fitText, shapeInnerArea } from './textFit'
import { createTextObject } from './textLayout'

/**
 * Excalidraw import (pasting Excalidraw's clipboard JSON, "Import Excalidraw file…"): reads the public Excalidraw JSON format
 * (`{"type":"excalidraw/clipboard","elements":[...]}` or a `.excalidraw` file) and builds ordinary canvas items for the template
 * insert path. Nothing here is a new item kind.
 * Rectangles, diamonds and ellipses become plain shapes (fill, dash, rotation, round corners); text in a shape becomes its centred label;
 * an arrow bound to shapes at both ends becomes an attached connector (label from its bound text); other arrows and lines, and freedraw,
 * become strokes; frames become dashed boundaries; images and embeds are skipped and counted. Local ids start at 1 per kind.
 */
export const MAX_EXCALIDRAW_ELEMENTS = 5000
const DEFAULT_STROKE = '#1e1e1e'
const MAX_LABEL = 500
const MAX_TEXT = 2000
/** Points kept per stroke (longer ones are down-sampled evenly, first and last kept), points over all strokes, and the largest coordinate or size accepted. */
export const MAX_POINTS_PER_STROKE = 10000
export const MAX_TOTAL_POINTS = 200000
export const MAX_COORDINATE = 1e6

export type ExcalidrawResult = { ok: true; items: CanvasItem[]; shapes: number; skipped: number } | { ok: false; error: string }

type Raw = Record<string, unknown>
const isRecord = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value)
const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
const str = (value: unknown): string => (typeof value === 'string' ? value : '')

const HEADER = /^\s*\{[\s\S]{0,400}?"type"\s*:\s*"excalidraw(?:\/clipboard[\w-]*)?"/

/** True when the text looks like Excalidraw clipboard / file JSON (a cheap check; buildExcalidrawItems does the real parse). */
export function isExcalidrawText(text: string): boolean {
  return HEADER.test(text.slice(0, 600))
}

/** The toast after inserting: "Imported 12 shapes from Excalidraw (2 skipped)". */
export function excalidrawInsertMessage(shapes: number, skipped: number): string {
  return `Imported ${shapes} ${shapes === 1 ? 'shape' : 'shapes'} from Excalidraw${skipped > 0 ? ` (${skipped} skipped)` : ''}`
}

/** Excalidraw stroke widths 1 / 2 / 4 become InkPad widths 2 / 3 / 5. */
function strokeWidthOf(el: Raw): number {
  const width = num(el.strokeWidth, 2)
  return width <= 1.5 ? 2 : width <= 3 ? 3 : width <= 5 ? 5 : Math.min(12, Math.round(width))
}

function dashOf(el: Raw): LineDash | undefined {
  return el.strokeStyle === 'dashed' ? 'dashed' : el.strokeStyle === 'dotted' ? 'dotted' : undefined
}

const transparent = (color: unknown): boolean => typeof color !== 'string' || color === '' || color === 'transparent'
const strokeColorOf = (el: Raw): string => (typeof el.strokeColor === 'string' && !transparent(el.strokeColor) && el.strokeColor.length <= 64 ? el.strokeColor : DEFAULT_STROKE)
const fillOf = (el: Raw): string | undefined => (typeof el.backgroundColor === 'string' && !transparent(el.backgroundColor) && el.backgroundColor.length <= 64 ? el.backgroundColor : undefined)

/** Excalidraw's hand fonts (Virgil 1, Excalifont 5) map to InkPad's hand font, mono fonts to mono, sans fonts to sans; anything else keeps the default. */
function fontOf(family: unknown): TextFontId | undefined {
  if (family === 1 || family === 5) return 'excalifont'
  if (family === 3 || family === 8) return 'mono'
  if (family === 2 || family === 6 || family === 7 || family === 9) return 'sans'
  return undefined
}

function angleOf(el: Raw): number | undefined {
  let angle = num(el.angle) % (2 * Math.PI)
  if (angle > Math.PI) angle -= 2 * Math.PI
  if (angle <= -Math.PI) angle += 2 * Math.PI
  return Math.abs(angle) < 1e-6 ? undefined : angle
}

function pointsOf(el: Raw): { x: number; y: number }[] {
  if (!Array.isArray(el.points)) return []
  const out: { x: number; y: number }[] = []
  for (const raw of el.points) if (Array.isArray(raw) && Number.isFinite(raw[0]) && Number.isFinite(raw[1])) out.push({ x: raw[0] as number, y: raw[1] as number })
  return out
}

/** Down-samples `count` source indexes to at most MAX_POINTS_PER_STROKE evenly, always keeping the first and last. */
function sampledIndexes(count: number): number[] {
  if (count <= MAX_POINTS_PER_STROKE) return Array.from({ length: count }, (_, i) => i)
  const out: number[] = []
  for (let i = 0; i < MAX_POINTS_PER_STROKE; i++) out.push(Math.round((i * (count - 1)) / (MAX_POINTS_PER_STROKE - 1)))
  return out
}

/** True when a coordinate or size is a number beyond +-MAX_COORDINATE (the element is skipped: it would overflow after the shift). */
const outOfRange = (value: unknown): boolean => typeof value === 'number' && !(Math.abs(value) <= MAX_COORDINATE)
function hasHugeValue(el: Raw): boolean {
  if (outOfRange(el.x) || outOfRange(el.y) || outOfRange(el.width) || outOfRange(el.height)) return true
  if (Array.isArray(el.points)) for (const raw of el.points) if (Array.isArray(raw) && (outOfRange(raw[0]) || outOfRange(raw[1]))) return true
  return false
}

/** The element's points in canvas-source coordinates (before the shift), down-sampled and rotated by `angle` around the element's centre. */
function absolutePoints(el: Raw): { x: number; y: number }[] {
  const all = pointsOf(el)
  const ox = num(el.x)
  const oy = num(el.y)
  const angle = angleOf(el)
  const cx = ox + num(el.width) / 2
  const cy = oy + num(el.height) / 2
  const cos = angle === undefined ? 1 : Math.cos(angle)
  const sin = angle === undefined ? 0 : Math.sin(angle)
  return sampledIndexes(all.length).map((index) => {
    const x = ox + all[index].x
    const y = oy + all[index].y
    if (angle === undefined) return { x, y }
    return { x: cx + (x - cx) * cos - (y - cy) * sin, y: cy + (x - cx) * sin + (y - cy) * cos }
  })
}

/** The outermost group id of an element (Excalidraw lists group ids innermost first). */
const outerGroup = (el: Raw): string | null => (Array.isArray(el.groupIds) && el.groupIds.length > 0 && typeof el.groupIds[el.groupIds.length - 1] === 'string' ? (el.groupIds[el.groupIds.length - 1] as string) : null)

const SHAPE_TYPES = new Set(['rectangle', 'diamond', 'ellipse'])
const FRAME_TYPES = new Set(['frame', 'magicframe'])
const LINE_TYPES = new Set(['arrow', 'line'])

/** Parses Excalidraw JSON text (or an already parsed value) into items for the insert path. */
export function buildExcalidrawItems(json: unknown): ExcalidrawResult {
  let data: unknown = json
  if (typeof json === 'string') {
    try { data = JSON.parse(json) } catch { return { ok: false, error: 'Not an Excalidraw file' } }
  }
  if (!isRecord(data) || typeof data.type !== 'string' || !data.type.startsWith('excalidraw') || !Array.isArray(data.elements)) return { ok: false, error: 'Not an Excalidraw file' }

  let skipped = Math.max(0, data.elements.length - MAX_EXCALIDRAW_ELEMENTS)
  const live: Raw[] = []
  let totalPoints = 0
  for (const raw of data.elements.slice(0, MAX_EXCALIDRAW_ELEMENTS)) {
    if (!isRecord(raw) || raw.isDeleted === true) continue
    const type = str(raw.type)
    if (SHAPE_TYPES.has(type) || FRAME_TYPES.has(type) || LINE_TYPES.has(type) || type === 'text' || type === 'freedraw') {
      if (hasHugeValue(raw)) { skipped++; continue }
      if (LINE_TYPES.has(type) || type === 'freedraw') {
        const count = Math.min(MAX_POINTS_PER_STROKE, Array.isArray(raw.points) ? raw.points.length : 0)
        if (totalPoints + count > MAX_TOTAL_POINTS) { skipped++; continue }
        totalPoints += count
      }
      live.push(raw)
    } else skipped++ // images, embeds and kinds this version does not know
  }
  if (live.length === 0) return { ok: false, error: skipped > 0 ? 'Nothing to import: only images and embeds' : 'Nothing to import' }

  // Everything is translated so the drawing's top-left corner is at (0, 0).
  const livePoints = new Map<Raw, { x: number; y: number }[]>()
  let left = Infinity
  let top = Infinity
  for (const el of live) {
    if (LINE_TYPES.has(str(el.type)) || el.type === 'freedraw') {
      const pts = absolutePoints(el)
      livePoints.set(el, pts)
      for (const p of pts) { if (p.x < left) left = p.x; if (p.y < top) top = p.y }
      if (pts.length > 0) continue // the rotated points define the extent, not the unrotated origin
    }
    left = Math.min(left, num(el.x))
    top = Math.min(top, num(el.y))
  }
  const ox = Number.isFinite(left) ? left : 0
  const oy = Number.isFinite(top) ? top : 0
  const X = (value: number) => Math.round((value - ox) * 100) / 100
  const Y = (value: number) => Math.round((value - oy) * 100) / 100

  let rectangleId = 1
  let textId = 1
  let connectorId = 1
  let strokeId = 1
  const groupIds = new Map<string, number>()
  const memberCount = new Map<number, number>()
  const groupFor = (el: Raw, fallback?: Raw): number | undefined => {
    const gid = outerGroup(el) ?? (fallback ? outerGroup(fallback) : null)
    if (gid === null) return undefined
    if (!groupIds.has(gid)) groupIds.set(gid, groupIds.size + 1)
    const group = groupIds.get(gid) as number
    memberCount.set(group, (memberCount.get(group) ?? 0) + 1)
    return group
  }

  const frames: CanvasItem[] = []
  const frameLabels: CanvasItem[] = []
  const shapes: CanvasItem[] = []
  const connectors: CanvasItem[] = []
  const texts: CanvasItem[] = []
  const strokes: CanvasItem[] = []
  const boxOf = new Map<string, RectangleObject>()
  const byId = new Map<string, Raw>()
  for (const el of live) byId.set(str(el.id), el)

  // Bound text: container id (shape or arrow) to the text element holding its label.
  const labelOf = new Map<string, Raw>()
  for (const el of live) {
    if (el.type !== 'text' || typeof el.containerId !== 'string') continue
    const container = byId.get(el.containerId)
    if (container && (SHAPE_TYPES.has(str(container.type)) || container.type === 'arrow') && !labelOf.has(el.containerId)) labelOf.set(el.containerId, el)
  }
  const labelText = (el: Raw): string => (str(el.originalText) || str(el.text)).replace(/\r\n?/g, '\n').replace(/\u0000/g, '').slice(0, MAX_TEXT)

  let imported = 0
  const group = (item: CanvasItem, value: number | undefined): CanvasItem => (value === undefined ? item : ({ ...item, group: value } as CanvasItem))

  // Frames first (behind everything).
  for (const el of live) {
    if (!FRAME_TYPES.has(str(el.type))) continue
    imported++
    const width = Math.max(1, num(el.width))
    const height = Math.max(1, num(el.height))
    const name = str(el.name).trim()
    const rect: RectangleObject = { ...createShapeBox(rectangleId++, X(num(el.x)), Y(num(el.y)), width, height, BOUNDARY_COLOR, 2, 'rectangle'), dash: 'dashed' }
    frames.push(group(rect, groupFor(el)))
    if (name) {
      const label = createTextObject(textId++, rect.x + 12, rect.y + 8, name.slice(0, MAX_TEXT), BOUNDARY_COLOR, BOUNDARY_FONT_SIZE)
      frameLabels.push(group(label, groupFor(el)))
    }
  }

  // Shapes.
  for (const el of live) {
    if (!SHAPE_TYPES.has(str(el.type))) continue
    imported++
    const type = str(el.type)
    const width = Math.max(1, Math.abs(num(el.width)))
    const height = Math.max(1, Math.abs(num(el.height)))
    const fill = fillOf(el)
    const stroke = transparent(el.strokeColor) && fill ? fill : strokeColorOf(el)
    const base = createShapeBox(rectangleId++, X(num(el.x)), Y(num(el.y)), width, height, stroke, strokeWidthOf(el), type === 'diamond' ? 'diamond' : type === 'ellipse' ? 'ellipse' : 'rectangle')
    const angle = angleOf(el)
    const dash = dashOf(el)
    const box: RectangleObject = {
      ...base,
      ...(fill ? { fillColor: fill } : {}),
      ...(dash ? { dash } : {}),
      ...(angle !== undefined ? { angle } : {}),
    }
    // Round corners (InkPad's `rounded` flag, rendered by the shape renderer): only plain rectangles.
    if (type === 'rectangle' && isRecord(el.roundness)) box.rounded = true
    shapes.push(group(box, groupFor(el)))
    boxOf.set(str(el.id), box)
  }

  // Text: labels inside shapes (centred and fitted), arrow labels (collected below), and free text.
  const connectorLabels = new Map<string, string>()
  for (const el of live) {
    if (el.type !== 'text') continue
    const text = labelText(el)
    if (text.trim() === '') continue
    imported++
    const container = typeof el.containerId === 'string' ? el.containerId : null
    const font = fontOf(el.fontFamily)
    const color = strokeColorOf(el)
    const fontSize = Math.min(400, Math.max(4, num(el.fontSize, 20)))
    const box = container ? boxOf.get(container) : undefined
    if (box && labelOf.get(container as string) === el) {
      const fit = fitText(text, fontSize, shapeInnerArea(box), font, () => undefined)
      const made = createTextObject(textId++, 0, 0, text, color, fit.fontSize, undefined, font)
      const label: TextObject = {
        ...made,
        align: 'center',
        ...(fit.wrap ? { width: fit.width, height: fit.height, fit: 'wrap' as const } : {}),
        ...(box.angle !== undefined ? { angle: box.angle } : {}),
      }
      label.x = box.x + box.width / 2 - label.width / 2
      label.y = box.y + box.height / 2 - label.height / 2
      texts.push(group(label, groupFor(el, byId.get(container as string))))
      continue
    }
    if (container && labelOf.get(container) === el && byId.get(container)?.type === 'arrow') {
      connectorLabels.set(container, text.replace(/\s*\n\s*/g, ' ').trim().slice(0, MAX_LABEL))
      continue
    }
    // Free text (or a label whose container was not imported): anchored left, centre or right like Excalidraw.
    const made = createTextObject(textId++, 0, 0, text.slice(0, MAX_TEXT), color, fontSize, undefined, font)
    const align = el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'right' : undefined
    const boxLeft = X(num(el.x))
    const boxWidth = Math.max(made.width, num(el.width))
    const x = align === 'center' ? boxLeft + boxWidth / 2 - made.width / 2 : align === 'right' ? boxLeft + boxWidth - made.width : boxLeft
    const angle = angleOf(el)
    const free: TextObject = { ...made, x, y: Y(num(el.y)), ...(align ? { align } : {}), ...(angle !== undefined ? { angle } : {}) }
    texts.push(group(free, groupFor(el)))
  }

  // Arrows and lines.
  const attachmentFor = (box: RectangleObject, point: { x: number; y: number }): { attachment: ConnectorAttachment; point: Point } => {
    const local = toItemFrame(box, { ...point, pressure: 1 })
    // A non-rotated diamond or ellipse snaps the end to its outline (clamping to the bounding box would leave it near a corner).
    if (!box.angle && (box.diamond || box.ellipse)) {
      const onOutline = nearestShapeOutlinePoint(box, { ...point, pressure: 1 })
      return { attachment: { rectangleId: box.id, offsetX: onOutline.x - box.x, offsetY: onOutline.y - box.y }, point: { x: onOutline.x, y: onOutline.y, pressure: 1 } }
    }
    const offsetX = Math.min(box.width, Math.max(0, local.x - box.x))
    const offsetY = Math.min(box.height, Math.max(0, local.y - box.y))
    const snapped = box.angle ? point : { x: box.x + offsetX, y: box.y + offsetY }
    return { attachment: { rectangleId: box.id, offsetX, offsetY }, point: { x: snapped.x, y: snapped.y, pressure: 1 } }
  }
  const boundBox = (binding: unknown): RectangleObject | undefined => (isRecord(binding) && typeof binding.elementId === 'string' ? boxOf.get(binding.elementId) : undefined)
  const hasHead = (value: unknown): boolean => typeof value === 'string' && value !== ''

  for (const el of live) {
    if (!LINE_TYPES.has(str(el.type))) continue
    imported++
    const pts = (livePoints.get(el) ?? []).map((p) => ({ x: X(p.x), y: Y(p.y) }))
    if (pts.length < 2) continue
    const id = str(el.id)
    const first = pts[0]
    const last = pts[pts.length - 1]
    const startHead = hasHead(el.startArrowhead)
    const endHead = hasHead(el.endArrowhead)
    const color = strokeColorOf(el)
    const width = strokeWidthOf(el)
    const dash = dashOf(el)
    const label = connectorLabels.get(id)
    const startBox = el.type === 'arrow' ? boundBox(el.startBinding) : undefined
    const endBox = el.type === 'arrow' ? boundBox(el.endBinding) : undefined
    if (startBox && endBox) {
      const start = attachmentFor(startBox, first)
      const end = attachmentFor(endBox, last)
      const directed = startHead || endHead
      const connector: ConnectorObject = {
        ...createConnector(connectorId++, start.point, end.point, color, width, start.attachment, end.attachment, directed ? 'directed-association' : 'association', startHead && !endHead),
        ...(el.elbowed === true ? { routing: 'elbow' as const } : {}),
        ...(startHead && endHead ? { twoWay: true as const } : {}),
        ...(dash ? { dash } : {}),
        ...(label ? { label } : {}),
      }
      connectors.push(group(connector, groupFor(el)))
      continue
    }
    const g = groupFor(el)
    const arrowheads: Arrowheads = startHead && endHead ? 'both' : endHead ? 'end' : startHead ? 'start' : 'none'
    const straight = pts.length === 2
    const stroke: Stroke = {
      kind: 'stroke',
      id: strokeId++,
      // Arrow and line strokes draw only their first two points; a bent line stays a plain polyline stroke.
      points: (straight ? [first, last] : pts).map((p) => ({ x: p.x, y: p.y, pressure: 1 })),
      color,
      width,
      erase: false,
      ...(straight ? { shape: el.type === 'arrow' ? ('arrow' as const) : ('line' as const), arrowheads } : {}),
      ...(straight && dash ? { dash } : {}),
    }
    strokes.push(group(stroke, g))
    if (label) {
      const made = createTextObject(textId++, 0, 0, label, color, 16)
      const mid = pts[Math.floor(pts.length / 2)]
      const free: TextObject = { ...made, x: mid.x - made.width / 2, y: mid.y - made.height / 2 - 14 }
      texts.push(group(free, g))
    }
  }

  // Freehand drawing.
  for (const el of live) {
    if (el.type !== 'freedraw') continue
    imported++
    const pts = livePoints.get(el) ?? []
    if (pts.length === 0) continue
    const pressures = Array.isArray(el.pressures) ? el.pressures : []
    const source = pointsOf(el).length > MAX_POINTS_PER_STROKE ? sampledIndexes(pointsOf(el).length) : null
    const points: Point[] = pts.map((p, index) => {
      const at = source ? source[index] : index
      const pressure = typeof pressures[at] === 'number' && Number.isFinite(pressures[at]) ? Math.min(1, Math.max(0.05, pressures[at] as number)) : 0.5
      return { x: X(p.x), y: Y(p.y), pressure }
    })
    if (points.length === 1) points.push({ ...points[0] })
    strokes.push(group({ kind: 'stroke', id: strokeId++, points, color: strokeColorOf(el), width: strokeWidthOf(el), erase: false }, groupFor(el)))
  }

  // A group of one item is no group.
  const all = [...frames, ...shapes, ...connectors, ...strokes, ...texts, ...frameLabels].map((item): CanvasItem => {
    if (item.kind === 'opaque' || item.group === undefined || (memberCount.get(item.group) ?? 0) >= 2) return item
    const { group: _group, ...rest } = item
    void _group
    return rest as CanvasItem
  })
  // Order: boundaries (behind), shapes, connectors, freehand and loose lines, text (labels last, on top).
  return { ok: true, items: all, shapes: imported, skipped }
}
