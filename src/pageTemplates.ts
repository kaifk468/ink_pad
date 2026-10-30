import { SHEET_BOUNDS, SHEET_HEIGHT, SHEET_WIDTH } from './viewport'

export type PageTemplate = 'blank' | 'lined' | 'dotted'

export const DEFAULT_PAGE_TEMPLATE: PageTemplate = 'blank'
export const PAGE_TEMPLATE_SPACING = 32
export const PAGE_TEMPLATE_LINE_COLOR = '#aebfd8'
export const PAGE_TEMPLATE_DOT_COLOR = '#566477'
export const PAGE_TEMPLATE_OVERVIEW_SPACING = 8
export const PAGE_TEMPLATE_OVERVIEW_DOT_RADIUS = 1.35

const STORAGE_KEY = 'inkpad.pageTemplate'
type PatternVariant = 'page' | 'overview'
const tileCanvases = new Map<string, HTMLCanvasElement>()
const patterns = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>()

export function parsePageTemplate(value: string | null): PageTemplate {
  return value === 'lined' || value === 'dotted' ? value : DEFAULT_PAGE_TEMPLATE
}

export function loadPageTemplate(storage?: Pick<Storage, 'getItem'>): PageTemplate {
  try {
    return parsePageTemplate((storage ?? window.localStorage).getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_PAGE_TEMPLATE
  }
}

export function savePageTemplate(template: PageTemplate, storage?: Pick<Storage, 'setItem'>): void {
  try {
    ;(storage ?? window.localStorage).setItem(STORAGE_KEY, parsePageTemplate(template))
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts.
  }
}

function getTile(template: Exclude<PageTemplate, 'blank'>, variant: PatternVariant): HTMLCanvasElement {
  const key = `${variant}:${template}`
  let tile = tileCanvases.get(key)
  if (tile) return tile
  tile = document.createElement('canvas')
  const spacing = variant === 'overview' ? PAGE_TEMPLATE_OVERVIEW_SPACING : PAGE_TEMPLATE_SPACING
  tile.width = spacing
  tile.height = spacing
  const tileContext = tile.getContext('2d')
  if (tileContext) {
    tileContext.strokeStyle = template === 'lined' ? PAGE_TEMPLATE_LINE_COLOR : PAGE_TEMPLATE_DOT_COLOR
    tileContext.lineWidth = template === 'lined' ? (variant === 'overview' ? 1 : 1.25) : 1
    if (template === 'lined') {
      tileContext.beginPath()
      tileContext.moveTo(0, spacing - 0.5)
      tileContext.lineTo(spacing, spacing - 0.5)
      tileContext.stroke()
    } else {
      tileContext.beginPath()
      const center = variant === 'overview' ? PAGE_TEMPLATE_OVERVIEW_DOT_RADIUS + 0.5 : 2
      const radius = variant === 'overview' ? PAGE_TEMPLATE_OVERVIEW_DOT_RADIUS : 1.65
      tileContext.arc(center, center, radius, 0, Math.PI * 2)
      tileContext.fillStyle = tileContext.strokeStyle
      tileContext.fill()
    }
  }
  tileCanvases.set(key, tile)
  return tile
}

function getPattern(ctx: CanvasRenderingContext2D, template: Exclude<PageTemplate, 'blank'>, variant: PatternVariant): CanvasPattern | null {
  let contextPatterns = patterns.get(ctx)
  if (!contextPatterns) {
    contextPatterns = new Map()
    patterns.set(ctx, contextPatterns)
  }
  const key = `${variant}:${template}`
  let pattern = contextPatterns.get(key)
  if (!pattern) {
    pattern = ctx.createPattern(getTile(template, variant), 'repeat') ?? undefined
    if (pattern) contextPatterns.set(key, pattern)
  }
  return pattern ?? null
}

/** Draws a cached, canvas-coordinate template clipped strictly to the white sheet. */
export function drawPageTemplate(ctx: CanvasRenderingContext2D, template: PageTemplate): void {
  if (template === 'blank') return
  const pattern = getPattern(ctx, template, 'page')
  if (!pattern) return
  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.beginPath()
  ctx.rect(SHEET_BOUNDS.x, SHEET_BOUNDS.y, SHEET_WIDTH, SHEET_HEIGHT)
  ctx.clip()
  ctx.fillStyle = pattern
  ctx.fillRect(SHEET_BOUNDS.x, SHEET_BOUNDS.y, SHEET_WIDTH, SHEET_HEIGHT)
  ctx.restore()
}

/** Draws an overview-scale template whose marks remain visible at minimap size. */
export function drawPageTemplateOverview(
  ctx: CanvasRenderingContext2D,
  template: PageTemplate,
  pageRect: { x: number; y: number; width: number; height: number },
): void {
  if (template === 'blank') return
  const pattern = getPattern(ctx, template, 'overview')
  if (!pattern) return
  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.beginPath()
  ctx.rect(pageRect.x, pageRect.y, pageRect.width, pageRect.height)
  ctx.clip()
  ctx.fillStyle = pattern
  ctx.fillRect(pageRect.x, pageRect.y, pageRect.width, pageRect.height)
  ctx.restore()
}
