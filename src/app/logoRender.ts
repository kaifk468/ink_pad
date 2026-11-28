import type { RectangleObject } from '../canvasModel'
import { createPathCache, logoFillColor, logoPlaceholderGeometry, logoPlacement } from '../logoLayout'
import { TEXT_FONT_FAMILY } from '../textLayout'
import { findTechLogo } from '../techLogos'

/** One Path2D per slug, built the first time the logo is drawn (never per frame). */
const logoPaths = createPathCache((path) => new Path2D(path))

/**
 * Draws a logo box's logo (the outline is drawn by drawRectangle): the Simple Icons path filled in the box's line colour, or in the brand colour.
 * A slug this build does not know, or whose table has not loaded yet, draws a neutral rounded square with a "?". Crisp in sketchy mode too.
 * The caller has already applied the box's rotation.
 */
export function drawLogo(ctx: CanvasRenderingContext2D, rectangle: RectangleObject): void {
  const slug = rectangle.logo
  if (slug === undefined) return
  const placement = logoPlacement(rectangle)
  if (placement.size <= 0) return
  const logo = findTechLogo(slug)
  ctx.save()
  ctx.setLineDash([])
  if (logo) {
    ctx.fillStyle = logoFillColor(rectangle, logo)
    ctx.translate(placement.x, placement.y)
    ctx.scale(placement.size / 24, placement.size / 24)
    ctx.fill(logoPaths.get(slug, logo.path))
  } else {
    const placeholder = logoPlaceholderGeometry(placement)
    ctx.strokeStyle = rectangle.strokeColor
    ctx.fillStyle = rectangle.strokeColor
    ctx.globalAlpha = 0.55
    ctx.lineWidth = Math.max(1.5, placement.size * 0.04)
    ctx.beginPath()
    ctx.roundRect(placement.x, placement.y, placement.size, placement.size, placeholder.radius)
    ctx.stroke()
    ctx.font = `600 ${placeholder.fontSize}px ${TEXT_FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('?', placement.x + placement.size / 2, placement.y + placement.size / 2 + placeholder.fontSize * 0.04)
  }
  ctx.restore()
}
