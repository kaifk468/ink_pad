import { connectorPoints, getConnectorRenderSpec, getConnectorSymbolGeometry, itemAngle, itemCenter, rotatedItemBounds } from './canvasModel'
import { routeConnectors } from './connectorRoute'
import { hldOutlinePath } from './hldShapes'
import { isSketchyRectangle, plainFillPath, rectangleFill, sketchyConnectorShape, sketchyRectangleShape, sketchyStrokePath } from './sketchy'
import type { CanvasItem, ConnectorObject, Point, RectangleObject, Stroke, TextObject } from './canvasModel'
import { getClassBoxGeometry, type ClassBoxCompartment } from './classBoxLayout'
import { getTextBaselines, labelLines, TEXT_FONT_FAMILY, textFontFamily } from './textLayout'

export type ExportTemplate = 'blank' | 'lined' | 'dotted'
export type SheetExportOptions = {
  width: number
  height: number
  template: ExportTemplate
  /** Distance between lines or dots: narrow (20% tighter), standard (default) or wide (20% looser). */
  spacing?: 'narrow' | 'standard' | 'wide'
  backgroundColor: string
  /** Transparent background (no sheet fill, no template) for pasting into other documents. */
  transparent?: boolean
  /** Hand-drawn style (the diagram's own setting). */
  sketchy?: boolean
}

/** Set by buildSheetSvg for the duration of one build. */
let sketchyExport = false

const SPACING = 32
const LINE_COLOR = '#aebfd8'
const DOT_COLOR = '#788392'
const SPACING_FACTOR = { narrow: 0.8, standard: 1, wide: 1.2 }

const n = (value: number) => String(Math.round(value * 100) / 100)
const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
const pressureScale = (pressure: number) => (pressure > 0 ? 0.35 + pressure * 0.9 : 1)

function strokeElement(stroke: Stroke): string {
  const color = esc(stroke.color)
  const common = `stroke="${color}" stroke-linecap="round" stroke-linejoin="round" fill="none"`
  const { points } = stroke
  if (!points.length) return ''
  if ((stroke.shape === 'line' || stroke.shape === 'arrow') && points.length >= 2) {
    const [start, end] = points
    const rough = sketchyExport ? sketchyStrokePath(stroke) : null
    if (rough) return `<path d="${rough}" ${common} stroke-width="${n(stroke.width)}"/>`
    let d = `M${n(start.x)} ${n(start.y)}L${n(end.x)} ${n(end.y)}`
    if (stroke.shape === 'arrow') {
      const angle = Math.atan2(end.y - start.y, end.x - start.x)
      const head = Math.max(12, stroke.width * 3.5)
      for (const turn of [-Math.PI / 6, Math.PI / 6]) {
        d += `M${n(end.x)} ${n(end.y)}L${n(end.x - head * Math.cos(angle + turn))} ${n(end.y - head * Math.sin(angle + turn))}`
      }
    }
    return `<path d="${d}" ${common} stroke-width="${n(stroke.width)}"/>`
  }
  if (points.length === 1) {
    return `<circle cx="${n(points[0].x)}" cy="${n(points[0].y)}" r="${n((stroke.width * pressureScale(points[0].pressure)) / 2)}" fill="${color}"/>`
  }
  const segments: string[] = []
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]
    const b = points[i]
    const width = stroke.width * pressureScale((a.pressure + b.pressure) / 2)
    segments.push(`<path d="M${n(a.x)} ${n(a.y)}L${n(b.x)} ${n(b.y)}" stroke-width="${n(width)}"/>`)
  }
  return `<g ${common}>${segments.join('')}</g>`
}

function classBoxElement(rectangle: RectangleObject): string {
  const content = rectangle.classBox
  if (!content) return ''
  const geometry = getClassBoxGeometry(rectangle, content)
  const family = esc(TEXT_FONT_FAMILY)
  const color = esc(rectangle.strokeColor)
  const texts = (compartment: ClassBoxCompartment) => compartment.lines
    .map((line, index) => (line.length === 0
      ? ''
      : `<text x="${n(compartment.anchorX)}" y="${n(compartment.baselines[index])}" font-family="${family}" font-size="${compartment.fontSize}" font-weight="${compartment.bold ? 700 : 400}" text-anchor="${compartment.align === 'center' ? 'middle' : 'start'}" fill="${color}" xml:space="preserve">${esc(line)}</text>`))
    .join('')
  const dividers = geometry.dividerY
    .filter((y) => y > rectangle.y && y < rectangle.y + rectangle.height)
    .map((y) => `M${n(rectangle.x)} ${n(y)}H${n(rectangle.x + rectangle.width)}`)
    .join('')
  const box = `${n(rectangle.x)} ${n(rectangle.y)} ${n(rectangle.width)} ${n(rectangle.height)}`
  return `<rect x="${n(rectangle.x)}" y="${n(rectangle.y)}" width="${n(rectangle.width)}" height="${n(rectangle.height)}" fill="#ffffff"/>`
    + `<svg x="${n(rectangle.x)}" y="${n(rectangle.y)}" width="${n(rectangle.width)}" height="${n(rectangle.height)}" viewBox="${box}" overflow="hidden">${texts(geometry.name)}${texts(geometry.attributes)}${texts(geometry.methods)}</svg>`
    + (dividers ? `<path d="${dividers}" fill="none" stroke="${color}" stroke-width="${n(Math.max(1, rectangle.strokeWidth / 2))}"/>` : '')
}

let inkBoxCount = 0

/** Pen strokes written inside an ink class box, cut by the box's own eraser strokes and clipped to the box. */
function inkBoxInkElement(rectangle: RectangleObject): string {
  const box = rectangle.inkBox
  if (!box || !box.ink.length) return ''
  inkBoxCount += 1
  const id = `ink-box-${inkBoxCount}`
  const area = `x="${n(rectangle.x)}" y="${n(rectangle.y)}" width="${n(rectangle.width)}" height="${n(rectangle.height)}"`
  const erasers = box.ink.filter((stroke) => stroke.erase)
  const strokes = box.ink.filter((stroke) => !stroke.erase).map(strokeElement).join('')
  const mask = erasers.length
    ? `<mask id="${id}-mask" maskUnits="userSpaceOnUse" ${area}><rect ${area} fill="#fff"/>${erasers.map((eraser) => strokeElement({ ...eraser, color: '#000000' })).join('')}</mask>`
    : ''
  return `<clipPath id="${id}"><rect ${area}/></clipPath>${mask}<g clip-path="url(#${id})"${erasers.length ? ` mask="url(#${id}-mask)"` : ''}>${strokes}</g>`
}

function inkBoxLinesElement(rectangle: RectangleObject): string {
  const box = rectangle.inkBox
  if (!box || rectangle.hldShape) return ''
  const d = [box.top, box.mid].map((y) => `M${n(rectangle.x)} ${n(y)}H${n(rectangle.x + rectangle.width)}`).join('')
  return `<path d="${d}" fill="none" stroke="${esc(rectangle.strokeColor)}" stroke-width="${n(Math.max(1, rectangle.strokeWidth / 2))}"/>`
}

function rectangleElement(rectangle: RectangleObject): string {
  const color = rectangleFill(rectangle)
  const sketchy = sketchyExport && isSketchyRectangle(rectangle)
  const fill = color ? `<path d="${sketchy ? sketchyRectangleShape(rectangle).fill : plainFillPath(rectangle)}" fill="${esc(color)}" stroke="none"/>` : ''
  if (sketchy) {
    const outline = `<path d="${sketchyRectangleShape(rectangle).outline}" fill="none" stroke="${esc(rectangle.strokeColor)}" stroke-width="${n(rectangle.strokeWidth)}" stroke-linejoin="round" stroke-linecap="round"/>`
    return fill + (rectangle.inkBox ? inkBoxInkElement(rectangle) : '') + outline
  }
  return fill + plainRectangleElement(rectangle)
}

function plainRectangleElement(rectangle: RectangleObject): string {
  if (rectangle.hldShape) {
    return inkBoxInkElement(rectangle) + `<path d="${hldOutlinePath(rectangle, rectangle.hldShape)}" fill="none" stroke="${esc(rectangle.strokeColor)}" stroke-width="${n(rectangle.strokeWidth)}" stroke-linejoin="round" stroke-linecap="round"/>`
  }
  if (rectangle.diamond) {
    const cx = rectangle.x + rectangle.width / 2
    const cy = rectangle.y + rectangle.height / 2
    return `<polygon points="${n(cx)},${n(rectangle.y)} ${n(rectangle.x + rectangle.width)},${n(cy)} ${n(cx)},${n(rectangle.y + rectangle.height)} ${n(rectangle.x)},${n(cy)}" fill="none" stroke="${esc(rectangle.strokeColor)}" stroke-width="${n(rectangle.strokeWidth)}" stroke-linejoin="round"/>`
  }
  if (rectangle.ellipse) {
    return `<ellipse cx="${n(rectangle.x + rectangle.width / 2)}" cy="${n(rectangle.y + rectangle.height / 2)}" rx="${n(rectangle.width / 2)}" ry="${n(rectangle.height / 2)}" fill="none" stroke="${esc(rectangle.strokeColor)}" stroke-width="${n(rectangle.strokeWidth)}"/>`
  }
  const rounded = rectangle.inkBox ? ' rx="14" ry="14"' : ''
  return classBoxElement(rectangle) + inkBoxInkElement(rectangle) + inkBoxLinesElement(rectangle) + `<rect x="${n(rectangle.x)}" y="${n(rectangle.y)}" width="${n(rectangle.width)}" height="${n(rectangle.height)}"${rounded} fill="none" stroke="${esc(rectangle.strokeColor)}" stroke-width="${n(rectangle.strokeWidth)}" stroke-linejoin="round"/>`
}

const pt = (p: Point) => `${n(p.x)} ${n(p.y)}`

/** SVG path through the connector's points; with `replaceTip` the end that carries the symbol stops at that point instead. */
function connectorPathData(connector: ConnectorObject, atStart: boolean, replaceTip?: Point): string {
  const path = connectorPoints(connector)
  const points = !replaceTip ? path : atStart ? [replaceTip, ...path.slice(1)] : [...path.slice(0, -1), replaceTip]
  return points.map((p, index) => `${index === 0 ? 'M' : 'L'}${pt(p)}`).join('')
}

function sketchyConnectorElement(connector: ConnectorObject): string {
  const spec = getConnectorRenderSpec(connector)
  const shape = sketchyConnectorShape(connector)
  const color = esc(connector.strokeColor)
  const dash = spec.lineStyle === 'dashed' ? ` stroke-dasharray="${n(Math.max(6, connector.strokeWidth * 2.5))} ${n(Math.max(4, connector.strokeWidth * 1.8))}"` : ''
  const base = `stroke="${color}" stroke-width="${n(connector.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"`
  const head = shape.head ? `<path d="${shape.head}" fill="${shape.headClosed && shape.headFill ? (shape.headFill === 'color' ? color : '#ffffff') : 'none'}" ${base}/>` : ''
  return `<path d="${shape.line}" fill="none" ${base}${dash}/>${head}`
}

function connectorElement(connector: ConnectorObject): string {
  if (sketchyExport) return sketchyConnectorElement(connector)
  const spec = getConnectorRenderSpec(connector)
  const geometry = getConnectorSymbolGeometry(connector)
  const color = esc(connector.strokeColor)
  const width = n(connector.strokeWidth)
  const dash = spec.lineStyle === 'dashed' ? ` stroke-dasharray="${n(Math.max(6, connector.strokeWidth * 2.5))} ${n(Math.max(4, connector.strokeWidth * 1.8))}"` : ''
  const base = `stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"`
  const parts: string[] = []
  const tip = geometry?.tip
  const atStart = spec.endpoint === 'start'
  if (spec.symbol === 'hollow-triangle' && geometry && tip) {
    parts.push(`<path d="${connectorPathData(connector, atStart, geometry.base)}" fill="none" ${base}${dash}/>`)
    parts.push(`<path d="M${pt(tip)}L${pt(geometry.sideA)}L${pt(geometry.sideB)}Z" fill="#ffffff" ${base}/>`)
  } else if (spec.symbol === 'open-arrow' && geometry && tip) {
    parts.push(`<path d="${connectorPathData(connector, atStart)}" fill="none" ${base}${dash}/>`)
    parts.push(`<path d="M${pt(geometry.sideA)}L${pt(tip)}L${pt(geometry.sideB)}" fill="none" ${base}/>`)
  } else if ((spec.symbol === 'hollow-diamond' || spec.symbol === 'filled-diamond') && geometry && tip) {
    parts.push(`<path d="${connectorPathData(connector, atStart, geometry.far)}" fill="none" ${base}${dash}/>`)
    parts.push(`<path d="M${pt(tip)}L${pt(geometry.sideA)}L${pt(geometry.far)}L${pt(geometry.sideB)}Z" fill="${spec.symbol === 'filled-diamond' ? color : '#ffffff'}" ${base}/>`)
  } else {
    parts.push(`<path d="${connectorPathData(connector, false)}" fill="none" ${base}${dash}/>`)
  }
  return parts.join('')
}

function textElement(text: TextObject): string {
  const lines = labelLines(text)
  const baselines = getTextBaselines(lines.join('\n'), text.fontSize)
  const family = esc(textFontFamily(text.fontFamily))
  return lines
    .map((line, index) => (line.length === 0
      ? ''
      : `<text x="${n(text.x)}" y="${n(text.y + baselines[index])}" font-family="${family}" font-size="${n(text.fontSize)}" fill="${esc(text.color)}" xml:space="preserve">${esc(line)}</text>`))
    .join('')
}

/** Wraps a rotated text or plain shape in a group turned (clockwise, degrees) about its box centre; unrotated items are untouched. */
function rotated(item: CanvasItem, markup: string): string {
  const angle = itemAngle(item)
  if (angle === 0) return markup
  const c = itemCenter(item)
  return `<g transform="rotate(${n((angle * 180) / Math.PI)} ${n(c.x)} ${n(c.y)})">${markup}</g>`
}

function itemElement(item: CanvasItem): string {
  if (item.kind === 'text') return rotated(item, textElement(item))
  if (item.kind === 'rectangle') return rotated(item, rectangleElement(item))
  if (item.kind === 'connector') return connectorElement(item)
  return strokeElement(item)
}

/**
 * Builds a standalone SVG of the sheet. Eraser strokes cut through everything drawn before them
 * (SVG mask per eraser group), matching the canvas "destination-out" behavior.
 */
export function buildSheetSvg(rawItems: CanvasItem[], options: SheetExportOptions): string {
  sketchyExport = options.sketchy === true
  try {
    return buildSheetSvgInner(rawItems, options)
  } finally {
    sketchyExport = false
  }
}

function buildSheetSvgInner(rawItems: CanvasItem[], options: SheetExportOptions): string {
  const items = routeConnectors(rawItems)
  inkBoxCount = 0
  const { width, height } = options
  const defs: string[] = []
  let body = ''
  let maskCount = 0
  let pending = ''
  // The stroke eraser only cuts ink, never connectors: they are put on top of each eraser mask again.
  const connectorElements: string[] = []

  const flushWithEraser = (erasers: Stroke[]) => {
    maskCount += 1
    const id = `erase-${maskCount}`
    const cuts = erasers.map((eraser) => strokeElement({ ...eraser, color: '#000000' })).join('')
    defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#fff"/>${cuts}</mask>`)
    body = `<g mask="url(#${id})">${body}${pending}</g>${connectorElements.join('')}`
    pending = ''
  }

  let eraserRun: Stroke[] = []
  for (const item of items) {
    if (item.kind === 'stroke' && item.erase) {
      eraserRun.push(item)
      continue
    }
    if (eraserRun.length) {
      flushWithEraser(eraserRun)
      eraserRun = []
    }
    const element = itemElement(item)
    if (item.kind === 'connector') connectorElements.push(element)
    pending += element
  }
  if (eraserRun.length) flushWithEraser(eraserRun)
  body += pending

  const template = options.transparent ? 'blank' : options.template
  if (template !== 'blank') {
    const spacing = Math.round(SPACING * SPACING_FACTOR[options.spacing ?? 'standard'] * 100) / 100
    const mark = template === 'lined'
      ? `<path d="M0 ${spacing - 0.5}H${spacing}" stroke="${LINE_COLOR}" stroke-width="1.25" fill="none"/>`
      : `<circle cx="2" cy="2" r="1.65" fill="${DOT_COLOR}"/>`
    defs.unshift(`<pattern id="template" width="${spacing}" height="${spacing}" patternUnits="userSpaceOnUse">${mark}</pattern>`)
  }
  const sheet = options.transparent ? '' : `<rect width="${width}" height="${height}" fill="${esc(options.backgroundColor)}"/>`
  const templateRect = template !== 'blank' ? `<rect width="${width}" height="${height}" fill="url(#template)"/>` : ''
  const defsBlock = defs.length ? `<defs>${defs.join('')}</defs>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${defsBlock}${sheet}${templateRect}${body}</svg>`
}

/** Bounding box (sheet coordinates) of all content, with padding, clamped to the sheet. Null when empty. */
export function getContentBounds(rawItems: CanvasItem[], sheet: { width: number; height: number }, padding = 40): { x: number; y: number; width: number; height: number } | null {
  const items = routeConnectors(rawItems)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const include = (x: number, y: number, r: number) => {
    minX = Math.min(minX, x - r); minY = Math.min(minY, y - r)
    maxX = Math.max(maxX, x + r); maxY = Math.max(maxY, y + r)
  }
  for (const item of items) {
    if (item.kind === 'stroke') {
      if (item.erase) continue
      for (const p of item.points) include(p.x, p.y, item.width)
    } else if (item.kind === 'text') {
      const box = rotatedItemBounds(item)
      include(box.x, box.y, 0)
      include(box.x + box.width, box.y + box.height, 0)
    } else if (item.kind === 'rectangle') {
      const box = rotatedItemBounds(item)
      include(box.x, box.y, item.strokeWidth)
      include(box.x + box.width, box.y + box.height, item.strokeWidth)
    } else {
      for (const p of connectorPoints(item)) include(p.x, p.y, item.strokeWidth + 16)
    }
  }
  if (!Number.isFinite(minX)) return null
  const x = Math.max(0, Math.floor(minX - padding))
  const y = Math.max(0, Math.floor(minY - padding))
  return { x, y, width: Math.min(sheet.width, Math.ceil(maxX + padding)) - x, height: Math.min(sheet.height, Math.ceil(maxY + padding)) - y }
}

/** Crops an SVG produced by buildSheetSvg to a region (viewBox only; output size is the region size). */
export function cropSvg(svg: string, region: { x: number; y: number; width: number; height: number }): string {
  return svg.replace(/^<svg ([^>]*?)width="[^"]*" height="[^"]*" viewBox="[^"]*">/, `<svg $1width="${region.width}" height="${region.height}" viewBox="${region.x} ${region.y} ${region.width} ${region.height}">`)
}

/** Browser only: rasterizes SVG text to a PNG blob at the given pixel ratio. */
export function svgToPngBlob(svg: string, width: number, height: number, pixelRatio = 1): Promise<Blob> {
  return svgToImageBlob(svg, width, height, pixelRatio, 'image/png')
}

/** Browser only: rasterizes SVG text to a PNG or JPEG blob (JPEG is painted on white first, since it has no transparency). */
export async function svgToImageBlob(svg: string, width: number, height: number, pixelRatio: number, type: 'image/png' | 'image/jpeg', quality?: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Could not render the diagram to an image.'))
      image.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * pixelRatio)
    canvas.height = Math.round(height * pixelRatio)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available.')
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(type === 'image/jpeg' ? 'JPEG encoding failed.' : 'PNG encoding failed.'))), type, quality))
  } finally {
    URL.revokeObjectURL(url)
  }
}
