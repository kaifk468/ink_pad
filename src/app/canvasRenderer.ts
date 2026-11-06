import { getConnectorRenderSpec, getConnectorSymbolGeometry } from '../canvasModel'
import type { CanvasItem, ConnectorObject, Point, RectangleObject, Stroke, TextObject } from '../canvasModel'
import { filterDisplayPoints } from '../oneEuroFilter'
import { buildInterpolatingCurve, buildMidpointCurve, type InterpolatingStrokeSegment } from '../strokeCurves'
import type { StrokeDisplayMode } from '../strokeDisplayMode'
import { classBoxFont, getClassBoxGeometry, type ClassBoxCompartment, type FontMeasure } from '../classBoxLayout'
import { getTextBaselines, splitTextLines, textFont, type TextMeasure } from '../textLayout'
import type { MinimapGeometry } from '../viewport'

/** Canvas drawing for every item kind. Pure functions of (context, item, settings): no React state. */

export function getReusableCanvasLayer(
  layerRef: { current: HTMLCanvasElement | null },
  width: number,
  height: number,
): HTMLCanvasElement {
  if (!layerRef.current) layerRef.current = document.createElement('canvas')
  if (layerRef.current.width !== width) layerRef.current.width = width
  if (layerRef.current.height !== height) layerRef.current.height = height
  return layerRef.current
}

/** Line width for a pressure value, as every pen stroke is drawn. */
export function pressureLineWidth(width: number, pressure: number): number {
  return width * (pressure > 0 ? 0.35 + pressure * 0.9 : 1)
}

/** Sets up a context to draw pen-stroke pieces in a colour (the same state drawStroke uses). */
export function preparePenContext(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}

/** The dot a one-point stroke shows. */
export function drawStrokeDot(ctx: CanvasRenderingContext2D, point: Point, width: number): void {
  ctx.beginPath()
  ctx.arc(point.x, point.y, pressureLineWidth(width, point.pressure) / 2, 0, Math.PI * 2)
  ctx.fill()
}

/** One Raw-mode span, stroked on its own with its pressure width (a finished stroke is drawn as these spans in order). */
export function drawInterpolatingSegment(ctx: CanvasRenderingContext2D, segment: InterpolatingStrokeSegment, width: number): void {
  ctx.lineWidth = pressureLineWidth(width, segment.pressure)
  ctx.beginPath()
  ctx.moveTo(segment.from.x, segment.from.y)
  if (segment.curved && segment.control1 && segment.control2) {
    ctx.bezierCurveTo(segment.control1.x, segment.control1.y, segment.control2.x, segment.control2.y, segment.to.x, segment.to.y)
  } else {
    ctx.lineTo(segment.to.x, segment.to.y)
  }
  ctx.stroke()
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, strokeDisplayMode: StrokeDisplayMode): void {
  const points = stroke.erase || stroke.shape || strokeDisplayMode === 'raw' ? stroke.points : filterDisplayPoints(stroke.points)
  if (!points.length) return
  ctx.save()
  ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over'
  ctx.strokeStyle = stroke.color
  ctx.fillStyle = stroke.color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (stroke.shape === 'arrow' && points.length >= 2) {
    const [start, end] = points
    const angle = Math.atan2(end.y - start.y, end.x - start.x)
    const headLength = Math.max(12, stroke.width * 3.5)
    ctx.lineWidth = stroke.width
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.moveTo(end.x, end.y)
    ctx.lineTo(end.x - headLength * Math.cos(angle - Math.PI / 6), end.y - headLength * Math.sin(angle - Math.PI / 6))
    ctx.moveTo(end.x, end.y)
    ctx.lineTo(end.x - headLength * Math.cos(angle + Math.PI / 6), end.y - headLength * Math.sin(angle + Math.PI / 6))
    ctx.stroke()
    ctx.restore()
    return
  }
  if (stroke.shape === 'line' && points.length >= 2) {
    ctx.lineWidth = stroke.width
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    ctx.lineTo(points[1].x, points[1].y)
    ctx.stroke()
    ctx.restore()
    return
  }
  if (points.length === 1) {
    drawStrokeDot(ctx, points[0], stroke.width)
  } else if (stroke.erase) {
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1]
      const current = points[index]
      const pressure = (previous.pressure + current.pressure) / 2
      ctx.lineWidth = stroke.width * (pressure > 0 ? 0.35 + pressure * 0.9 : 1)
      ctx.beginPath()
      ctx.moveTo(previous.x, previous.y)
      ctx.lineTo(current.x, current.y)
      ctx.stroke()
    }
  } else if (strokeDisplayMode === 'raw') {
    for (const segment of buildInterpolatingCurve(points)) drawInterpolatingSegment(ctx, segment, stroke.width)
  } else {
    for (const segment of buildMidpointCurve(points)) {
      const pressureScale = segment.pressure > 0 ? 0.35 + segment.pressure * 0.9 : 1
      ctx.lineWidth = stroke.width * pressureScale
      ctx.beginPath()
      ctx.moveTo(segment.from.x, segment.from.y)
      if (segment.curved && segment.control) ctx.quadraticCurveTo(segment.control.x, segment.control.y, segment.to.x, segment.to.y)
      else ctx.lineTo(segment.to.x, segment.to.y)
      ctx.stroke()
    }
  }
  ctx.restore()
}

let fontMeasureContext: CanvasRenderingContext2D | null = null

/** Measures text with the exact font the class box renderer uses. Undefined when there is no DOM. */
export function createFontMeasure(): FontMeasure | undefined {
  if (!fontMeasureContext && typeof document !== 'undefined') fontMeasureContext = document.createElement('canvas').getContext('2d')
  const ctx = fontMeasureContext
  if (!ctx) return undefined
  return (line, fontSize, bold) => {
    ctx.font = classBoxFont(fontSize, bold)
    return ctx.measureText(line).width
  }
}

function drawClassBox(ctx: CanvasRenderingContext2D, rectangle: RectangleObject): void {
  const content = rectangle.classBox
  if (!content) return
  const geometry = getClassBoxGeometry(rectangle, content)
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height)
  ctx.save()
  ctx.beginPath()
  ctx.rect(rectangle.x, rectangle.y, rectangle.width, rectangle.height)
  ctx.clip()
  ctx.fillStyle = rectangle.strokeColor
  ctx.textBaseline = 'alphabetic'
  const drawCompartment = (compartment: ClassBoxCompartment) => {
    ctx.font = classBoxFont(compartment.fontSize, compartment.bold)
    ctx.textAlign = compartment.align
    compartment.lines.forEach((line, index) => { if (line) ctx.fillText(line, compartment.anchorX, compartment.baselines[index]) })
  }
  drawCompartment(geometry.name)
  drawCompartment(geometry.attributes)
  drawCompartment(geometry.methods)
  ctx.restore()
  ctx.strokeStyle = rectangle.strokeColor
  ctx.lineWidth = Math.max(1, rectangle.strokeWidth / 2)
  ctx.beginPath()
  for (const y of geometry.dividerY) {
    if (y > rectangle.y && y < rectangle.y + rectangle.height) {
      ctx.moveTo(rectangle.x, y)
      ctx.lineTo(rectangle.x + rectangle.width, y)
    }
  }
  ctx.stroke()
  ctx.restore()
}

export function drawRectangle(ctx: CanvasRenderingContext2D, rectangle: RectangleObject): void {
  if (rectangle.classBox) drawClassBox(ctx, rectangle)
  ctx.save()
  ctx.strokeStyle = rectangle.strokeColor
  ctx.lineWidth = rectangle.strokeWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height)
  ctx.restore()
}

export function drawConnector(ctx: CanvasRenderingContext2D, connector: ConnectorObject, color = connector.strokeColor, width = connector.strokeWidth): void {
  const spec = getConnectorRenderSpec(connector)
  const geometry = getConnectorSymbolGeometry(connector, width)
  const tip = geometry?.tip
  const other = geometry?.other

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash(spec.lineStyle === 'dashed' ? [Math.max(6, width * 2.5), Math.max(4, width * 1.8)] : [])

  if (spec.symbol === 'hollow-triangle' && geometry && tip && other) {
    ctx.beginPath()
    ctx.moveTo(other.x, other.y)
    ctx.lineTo(geometry.base.x, geometry.base.y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(tip.x, tip.y)
    ctx.lineTo(geometry.sideA.x, geometry.sideA.y)
    ctx.lineTo(geometry.sideB.x, geometry.sideB.y)
    ctx.closePath()
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.stroke()
  } else if (spec.symbol === 'open-arrow' && geometry && tip) {
    ctx.beginPath()
    ctx.moveTo(connector.start.x, connector.start.y)
    ctx.lineTo(connector.end.x, connector.end.y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(geometry.sideA.x, geometry.sideA.y)
    ctx.lineTo(tip.x, tip.y)
    ctx.lineTo(geometry.sideB.x, geometry.sideB.y)
    ctx.stroke()
  } else if ((spec.symbol === 'hollow-diamond' || spec.symbol === 'filled-diamond') && geometry && tip && other) {
    ctx.beginPath()
    ctx.moveTo(geometry.far.x, geometry.far.y)
    ctx.lineTo(other.x, other.y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(tip.x, tip.y)
    ctx.lineTo(geometry.sideA.x, geometry.sideA.y)
    ctx.lineTo(geometry.far.x, geometry.far.y)
    ctx.lineTo(geometry.sideB.x, geometry.sideB.y)
    ctx.closePath()
    ctx.fillStyle = spec.symbol === 'filled-diamond' ? color : '#ffffff'
    ctx.fill()
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.moveTo(connector.start.x, connector.start.y)
    ctx.lineTo(connector.end.x, connector.end.y)
    ctx.stroke()
  }
  ctx.restore()
}

let measureContext: CanvasRenderingContext2D | null = null

/** Measures a line of label text with the same font the renderer uses. Falls back to an estimate off-DOM. */
export function createTextMeasure(fontSize: number): TextMeasure | undefined {
  if (!measureContext && typeof document !== 'undefined') measureContext = document.createElement('canvas').getContext('2d')
  const ctx = measureContext
  if (!ctx) return undefined
  return (line) => {
    ctx.font = textFont(fontSize)
    return ctx.measureText(line).width
  }
}

export function drawText(ctx: CanvasRenderingContext2D, text: TextObject): void {
  ctx.save()
  ctx.font = textFont(text.fontSize)
  ctx.fillStyle = text.color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const baselines = getTextBaselines(text.text, text.fontSize)
  splitTextLines(text.text).forEach((line, index) => ctx.fillText(line, text.x, text.y + baselines[index]))
  ctx.restore()
}

export function drawItem(ctx: CanvasRenderingContext2D, item: CanvasItem, strokeDisplayMode: StrokeDisplayMode): void {
  if (item.kind === 'rectangle') drawRectangle(ctx, item)
  else if (item.kind === 'text') drawText(ctx, item)
  else if (item.kind === 'connector') drawConnector(ctx, item)
  else drawStroke(ctx, item, strokeDisplayMode)
}

export function drawMinimapItems(ctx: CanvasRenderingContext2D, items: CanvasItem[], geometry: MinimapGeometry): void {
  const toMiniX = (x: number) => x * geometry.scale + geometry.offsetX
  const toMiniY = (y: number) => y * geometry.scale + geometry.offsetY
  ctx.save()
  for (const item of items) {
    if (item.kind === 'text') {
      // Text is unreadable at minimap size: show where it sits as a faint block.
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 0.4
      ctx.fillStyle = item.color
      ctx.fillRect(toMiniX(item.x), toMiniY(item.y), Math.max(1, item.width * geometry.scale), Math.max(1, item.height * geometry.scale))
      ctx.globalAlpha = 1
    } else if (item.kind === 'rectangle') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = item.strokeColor
      ctx.lineWidth = Math.max(1, item.strokeWidth * geometry.scale)
      ctx.strokeRect(toMiniX(item.x), toMiniY(item.y), item.width * geometry.scale, item.height * geometry.scale)
    } else if (item.kind === 'connector') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = item.strokeColor
      ctx.lineWidth = Math.max(1, item.strokeWidth * geometry.scale)
      ctx.beginPath()
      ctx.moveTo(toMiniX(item.start.x), toMiniY(item.start.y))
      ctx.lineTo(toMiniX(item.end.x), toMiniY(item.end.y))
      ctx.stroke()
    } else if (item.points.length > 0) {
      ctx.globalCompositeOperation = item.erase ? 'destination-out' : 'source-over'
      ctx.strokeStyle = item.erase ? '#000000' : item.color
      ctx.fillStyle = item.erase ? '#000000' : item.color
      ctx.lineWidth = Math.max(1, item.width * geometry.scale)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(toMiniX(item.points[0].x), toMiniY(item.points[0].y))
      item.points.slice(1).forEach((point) => ctx.lineTo(toMiniX(point.x), toMiniY(point.y)))
      if (item.points.length === 1) {
        ctx.arc(toMiniX(item.points[0].x), toMiniY(item.points[0].y), Math.max(0.5, item.width * geometry.scale / 2), 0, Math.PI * 2)
        ctx.fill()
      } else ctx.stroke()
    }
  }
  ctx.restore()
}
