import { rectangleSideMidpoints, connectorDashPattern, connectorPoints, dashPattern, getConnectorRenderSpec, strokeHeadGeometry, getConnectorSymbolGeometry, itemAngle, rotatedItemBounds } from '../canvasModel'
import { hldOutlinePath } from '../hldShapes'
import type { CanvasItem, ConnectorObject, Point, RectangleObject, Stroke, TextFontId, TextObject } from '../canvasModel'
import { filterDisplayPoints } from '../oneEuroFilter'
import { buildInterpolatingCurve, buildMidpointCurve, type InterpolatingStrokeSegment } from '../strokeCurves'
import type { StrokeDisplayMode } from '../strokeDisplayMode'
import { classBoxFont, getClassBoxGeometry, type ClassBoxCompartment, type FontMeasure } from '../classBoxLayout'
import { connectorLabelFontSize, connectorLabelLayout } from '../connectorLabel'
import { DEFAULT_TEXT_FONT, textLineX, getCachedTextMeasure, getTextBaselines, labelLines, textFont, type TextMeasure } from '../textLayout'
import type { MinimapGeometry } from '../viewport'
import { isSketchyRectangle } from '../sketchy'
import { drawSketchyConnector, fillRectangle, strokeSketchyRectangle, strokeSketchyStroke } from './sketchyRender'
import { drawCode, drawOpaque } from './codeRenderer'

/** Canvas drawing for every item kind. Pure functions of (context, item, settings): no React state. */

/** ?layerdom=on puts the off-screen layer canvases on the page (invisible) instead of leaving them detached. */
export const layerCanvasOptions = { attachToPage: false }

export function getReusableCanvasLayer(
  layerRef: { current: HTMLCanvasElement | null },
  width: number,
  height: number,
): HTMLCanvasElement {
  if (!layerRef.current) {
    layerRef.current = document.createElement('canvas')
    if (layerCanvasOptions.attachToPage) {
      layerRef.current.setAttribute('aria-hidden', 'true')
      layerRef.current.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1;'
      document.body.appendChild(layerRef.current)
    }
  }
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

/** Switches for drawing Raw strokes cheaply. ?group=off restores one draw call per segment. */
export const rawDrawingOptions = { groupWidths: true }

/**
 * A finished stroke never changes, so its Raw curve is worked out once and kept with the stroke object (never saved).
 * A stroke still being written grows in place, so the kept curve is only reused while its point list is unchanged.
 */
const rawSegmentCache = new WeakMap<Stroke, { points: Point[]; length: number; segments: InterpolatingStrokeSegment[] }>()

function rawSegments(stroke: Stroke, points: Point[]): InterpolatingStrokeSegment[] {
  const hit = rawSegmentCache.get(stroke)
  if (hit && hit.points === points && hit.length === points.length) return hit.segments
  const segments = buildInterpolatingCurve(points)
  rawSegmentCache.set(stroke, { points, length: points.length, segments })
  return segments
}

/** Width steps for grouping: 4% of the pen width, well below what the eye can tell apart. */
const WIDTH_STEP_RATIO = 0.04

/**
 * Draws Raw segments. Neighbouring segments whose pressure widths are the same (to within 4% of the pen width) go into one
 * path and one stroke call, since a stroke is drawn in a single opaque colour with round joins and caps.
 */
export function drawRawSegments(ctx: CanvasRenderingContext2D, segments: InterpolatingStrokeSegment[], width: number): void {
  if (!rawDrawingOptions.groupWidths) {
    for (const segment of segments) drawInterpolatingSegment(ctx, segment, width)
    return
  }
  const step = Math.max(0.01, width * WIDTH_STEP_RATIO)
  const levelOf = (segment: InterpolatingStrokeSegment) => Math.round(pressureLineWidth(width, segment.pressure) / step)
  let index = 0
  while (index < segments.length) {
    const level = levelOf(segments[index])
    let end = index + 1
    while (end < segments.length && levelOf(segments[end]) === level) end += 1
    ctx.lineWidth = level * step
    ctx.beginPath()
    ctx.moveTo(segments[index].from.x, segments[index].from.y)
    for (let k = index; k < end; k += 1) {
      const segment = segments[k]
      if (segment.curved && segment.control1 && segment.control2) ctx.bezierCurveTo(segment.control1.x, segment.control1.y, segment.control2.x, segment.control2.y, segment.to.x, segment.to.y)
      else ctx.lineTo(segment.to.x, segment.to.y)
    }
    ctx.stroke()
    index = end
  }
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, strokeDisplayMode: StrokeDisplayMode, sketchy = false): void {
  const points = stroke.erase || stroke.shape || strokeDisplayMode === 'raw' ? stroke.points : filterDisplayPoints(stroke.points)
  if (!points.length) return
  ctx.save()
  ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over'
  ctx.strokeStyle = stroke.color
  ctx.fillStyle = stroke.color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash(dashPattern(stroke.dash, stroke.width))
  if (sketchy && (stroke.shape === 'arrow' || stroke.shape === 'line') && points.length >= 2 && strokeSketchyStroke(ctx, stroke)) {
    ctx.restore()
    return
  }
  if ((stroke.shape === 'arrow' || stroke.shape === 'line') && points.length >= 2) {
    ctx.lineWidth = stroke.width
    ctx.setLineDash(dashPattern(stroke.dash, stroke.width))
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    ctx.lineTo(points[1].x, points[1].y)
    ctx.stroke()
    // Arrowheads are always solid, whatever the dash of the shaft.
    const heads = strokeHeadGeometry({ ...stroke, points })
    if (heads.length) {
      ctx.setLineDash([])
      ctx.beginPath()
      for (const head of heads) {
        ctx.moveTo(head.tip.x, head.tip.y)
        ctx.lineTo(head.wingA.x, head.wingA.y)
        ctx.moveTo(head.tip.x, head.tip.y)
        ctx.lineTo(head.wingB.x, head.wingB.y)
      }
      ctx.stroke()
    }
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
    drawRawSegments(ctx, rawSegments(stroke, points), stroke.width)
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

const INK_BOX_CORNER_RADIUS = 14

/** The pen strokes written inside an ink class box (erase strokes only cut this ink), clipped to the box. */
function drawInkBoxInk(ctx: CanvasRenderingContext2D, rectangle: RectangleObject, strokeDisplayMode: StrokeDisplayMode): void {
  const box = rectangle.inkBox
  if (!box || !box.ink.length) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(rectangle.x, rectangle.y, rectangle.width, rectangle.height)
  ctx.clip()
  for (const stroke of box.ink) drawStroke(ctx, stroke, strokeDisplayMode)
  ctx.restore()
}

function drawInkBoxDividers(ctx: CanvasRenderingContext2D, rectangle: RectangleObject): void {
  const box = rectangle.inkBox
  if (!box) return
  ctx.save()
  ctx.strokeStyle = rectangle.strokeColor
  ctx.lineWidth = Math.max(1, rectangle.strokeWidth / 2)
  ctx.beginPath()
  for (const y of [box.top, box.mid]) {
    ctx.moveTo(rectangle.x, y)
    ctx.lineTo(rectangle.x + rectangle.width, y)
  }
  ctx.stroke()
  ctx.restore()
}

export function drawRectangle(ctx: CanvasRenderingContext2D, rectangle: RectangleObject, strokeDisplayMode: StrokeDisplayMode = 'raw', sketchy = false): void {
  if (rectangle.fillColor) {
    // The fill sits under everything else of the shape (its ink, writing and outline).
    ctx.save()
    const fillAngle = itemAngle(rectangle)
    if (fillAngle !== 0) {
      const fx = rectangle.x + rectangle.width / 2
      const fy = rectangle.y + rectangle.height / 2
      ctx.translate(fx, fy)
      ctx.rotate(fillAngle)
      ctx.translate(-fx, -fy)
    }
    fillRectangle(ctx, rectangle, sketchy, isSketchyRectangle(rectangle))
    ctx.restore()
  }
  if (rectangle.classBox) drawClassBox(ctx, rectangle)
  if (rectangle.inkBox) drawInkBoxInk(ctx, rectangle, strokeDisplayMode)
  if (rectangle.inkBox && !rectangle.hldShape) drawInkBoxDividers(ctx, rectangle)
  ctx.save()
  ctx.strokeStyle = rectangle.strokeColor
  ctx.lineWidth = rectangle.strokeWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash(dashPattern(rectangle.dash, rectangle.strokeWidth))
  const angle = itemAngle(rectangle)
  if (angle !== 0) {
    const cx = rectangle.x + rectangle.width / 2
    const cy = rectangle.y + rectangle.height / 2
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    ctx.translate(-cx, -cy)
  }
  if (sketchy && isSketchyRectangle(rectangle)) {
    strokeSketchyRectangle(ctx, rectangle)
  } else if (rectangle.hldShape) {
    ctx.stroke(new Path2D(hldOutlinePath(rectangle, rectangle.hldShape)))
  } else if (rectangle.inkBox) {
    ctx.beginPath()
    ctx.roundRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height, INK_BOX_CORNER_RADIUS)
    ctx.stroke()
  } else if (rectangle.diamond) {
    const cx = rectangle.x + rectangle.width / 2
    const cy = rectangle.y + rectangle.height / 2
    ctx.beginPath()
    ctx.moveTo(cx, rectangle.y)
    ctx.lineTo(rectangle.x + rectangle.width, cy)
    ctx.lineTo(cx, rectangle.y + rectangle.height)
    ctx.lineTo(rectangle.x, cy)
    ctx.closePath()
    ctx.stroke()
  } else if (rectangle.ellipse) {
    ctx.beginPath()
    ctx.ellipse(rectangle.x + rectangle.width / 2, rectangle.y + rectangle.height / 2, rectangle.width / 2, rectangle.height / 2, 0, 0, Math.PI * 2)
    ctx.stroke()
  } else ctx.strokeRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height)
  ctx.restore()
}

/** The line through `path` as one open path; with `replaceTip` the end that carries the symbol stops at that point instead. */
function tracePath(ctx: CanvasRenderingContext2D, path: Point[], atStart: boolean, replaceTip?: Point): void {
  const points = !replaceTip ? path : atStart ? [replaceTip, ...path.slice(1)] : [...path.slice(0, -1), replaceTip]
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index].x, points[index].y)
}

export function drawConnector(ctx: CanvasRenderingContext2D, connector: ConnectorObject, color = connector.strokeColor, width = connector.strokeWidth, sketchy = false): void {
  const spec = getConnectorRenderSpec(connector)
  const geometry = getConnectorSymbolGeometry(connector, width)
  const tip = geometry?.tip
  const path = connectorPoints(connector)
  const atStart = spec.endpoint === 'start'

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash(connectorDashPattern(connector, width))

  if (sketchy) {
    drawSketchyConnector(ctx, connector, color, width)
  } else if (spec.symbol === 'hollow-triangle' && geometry && tip) {
    tracePath(ctx, path, atStart, geometry.base)
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
    tracePath(ctx, path, atStart)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(geometry.sideA.x, geometry.sideA.y)
    ctx.lineTo(tip.x, tip.y)
    ctx.lineTo(geometry.sideB.x, geometry.sideB.y)
    ctx.stroke()
  } else if ((spec.symbol === 'hollow-diamond' || spec.symbol === 'filled-diamond') && geometry && tip) {
    tracePath(ctx, path, atStart, geometry.far)
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
    tracePath(ctx, path, false)
    ctx.stroke()
  }
  ctx.restore()
}

/** Measures a line of label text with the same font the renderer uses (cached). Falls back to an estimate off-DOM. */
export function createTextMeasure(fontSize: number, fontId?: TextFontId): TextMeasure | undefined {
  return getCachedTextMeasure(fontSize, fontId)
}

export function drawText(ctx: CanvasRenderingContext2D, text: TextObject): void {
  ctx.save()
  const angle = itemAngle(text)
  if (angle !== 0) {
    const cx = text.x + text.width / 2
    const cy = text.y + text.height / 2
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    ctx.translate(-cx, -cy)
  }
  ctx.font = textFont(text.fontSize, text.fontFamily)
  ctx.fillStyle = text.color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const lines = labelLines(text)
  const baselines = getTextBaselines(lines.join('\n'), text.fontSize)
  const measureLine = text.align ? getCachedTextMeasure(text.fontSize, text.fontFamily) : undefined
  lines.forEach((line, index) => ctx.fillText(line, text.align ? textLineX(text, (measureLine ?? ((value: string) => ctx.measureText(value).width))(line)) : text.x, text.y + baselines[index]))
  ctx.restore()
}

let connectorLabelBackground = '#ffffff'
/** The sheet colour that the pad behind a connector label is filled with (set by the app when the page background changes). */
export function setConnectorLabelBackground(color: string): void { connectorLabelBackground = color }

/** A connector's label: text centred on the middle of the drawn path over a pad that hides the line. Same for plain and sketchy. */
export function drawConnectorLabel(ctx: CanvasRenderingContext2D, connector: ConnectorObject): void {
  if (!connector.label) return
  const layout = connectorLabelLayout(connector, createTextMeasure(connectorLabelFontSize(connector), DEFAULT_TEXT_FONT))
  if (!layout) return
  ctx.save()
  ctx.fillStyle = connectorLabelBackground
  ctx.fillRect(layout.box.x, layout.box.y, layout.box.width, layout.box.height)
  ctx.font = textFont(layout.fontSize, DEFAULT_TEXT_FONT)
  ctx.fillStyle = connector.strokeColor
  ctx.textBaseline = 'alphabetic'
  layout.lines.forEach((line, index) => ctx.fillText(line, layout.lineX[index], layout.baselines[index]))
  ctx.restore()
}

export function drawItem(ctx: CanvasRenderingContext2D, item: CanvasItem, strokeDisplayMode: StrokeDisplayMode, sketchy = false): void {
  if (item.kind === 'rectangle') drawRectangle(ctx, item, strokeDisplayMode, sketchy)
  else if (item.kind === 'text') drawText(ctx, item)
  else if (item.kind === 'connector') { drawConnector(ctx, item, item.strokeColor, item.strokeWidth, sketchy); drawConnectorLabel(ctx, item) }
  else if (item.kind === 'code') drawCode(ctx, item)
  else if (item.kind === 'opaque') drawOpaque(ctx, item)
  else drawStroke(ctx, item, strokeDisplayMode, sketchy)
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
      const box = rotatedItemBounds(item)
      ctx.fillRect(toMiniX(box.x), toMiniY(box.y), Math.max(1, box.width * geometry.scale), Math.max(1, box.height * geometry.scale))
      ctx.globalAlpha = 1
    } else if (item.kind === 'code' || item.kind === 'opaque') {
      // A simple box: the block's own background (grey for an unknown item).
      const box = item.kind === 'code' ? item : item.box
      if (box) {
        ctx.globalCompositeOperation = 'source-over'
        ctx.fillStyle = item.kind === 'code' ? (item.theme === 'dark' ? '#4b5563' : '#cbd5e1') : '#d1d5db'
        ctx.fillRect(toMiniX(box.x), toMiniY(box.y), Math.max(1, box.width * geometry.scale), Math.max(1, box.height * geometry.scale))
      }
    } else if (item.kind === 'rectangle') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = item.strokeColor
      ctx.lineWidth = Math.max(1, item.strokeWidth * geometry.scale)
      if (itemAngle(item) !== 0) {
        // A rotated shape is shown by the box that encloses it, never by its unrotated box.
        const box = rotatedItemBounds(item)
        ctx.strokeRect(toMiniX(box.x), toMiniY(box.y), box.width * geometry.scale, box.height * geometry.scale)
      } else if (item.diamond) {
        ctx.beginPath()
        ctx.moveTo(toMiniX(item.x + item.width / 2), toMiniY(item.y))
        ctx.lineTo(toMiniX(item.x + item.width), toMiniY(item.y + item.height / 2))
        ctx.lineTo(toMiniX(item.x + item.width / 2), toMiniY(item.y + item.height))
        ctx.lineTo(toMiniX(item.x), toMiniY(item.y + item.height / 2))
        ctx.closePath()
        ctx.stroke()
      } else if (item.ellipse) {
        ctx.beginPath()
        ctx.ellipse(toMiniX(item.x + item.width / 2), toMiniY(item.y + item.height / 2), (item.width / 2) * geometry.scale, (item.height / 2) * geometry.scale, 0, 0, Math.PI * 2)
        ctx.stroke()
      } else ctx.strokeRect(toMiniX(item.x), toMiniY(item.y), item.width * geometry.scale, item.height * geometry.scale)
    } else if (item.kind === 'connector') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = item.strokeColor
      ctx.lineWidth = Math.max(1, item.strokeWidth * geometry.scale)
      ctx.beginPath()
      connectorPoints(item).forEach((p, index) => (index === 0 ? ctx.moveTo(toMiniX(p.x), toMiniY(p.y)) : ctx.lineTo(toMiniX(p.x), toMiniY(p.y))))
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

/** Transient overlay: the four side midpoints of the box a connector end would snap to, as small constant-screen-size dots. Never an item. */
export function drawSideMidpointDots(ctx: CanvasRenderingContext2D, box: Pick<RectangleObject, 'x' | 'y' | 'width' | 'height'>, scale: number): void {
  ctx.save()
  ctx.fillStyle = '#5269df'
  for (const { point } of rectangleSideMidpoints(box)) {
    ctx.beginPath()
    ctx.arc(point.x, point.y, 3.5 / scale, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
