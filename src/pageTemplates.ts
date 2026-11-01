export type PageTemplate = 'blank' | 'lined' | 'dotted'

export const DEFAULT_PAGE_TEMPLATE: PageTemplate = 'blank'
export const PAGE_TEMPLATE_SPACING = 32
export const PAGE_TEMPLATE_LINE_COLOR = '#aebfd8'
export const PAGE_TEMPLATE_DOT_COLOR = '#566477'
export const PAGE_TEMPLATE_OVERVIEW_SPACING = 8
export const PAGE_TEMPLATE_OVERVIEW_DOT_RADIUS = 1.35

const STORAGE_KEY = 'inkpad.pageTemplate'
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

function getTile(template: Exclude<PageTemplate, 'blank'>): HTMLCanvasElement {
  let tile = tileCanvases.get(template)
  if (tile) return tile
  tile = document.createElement('canvas')
  const spacing = PAGE_TEMPLATE_OVERVIEW_SPACING
  tile.width = spacing
  tile.height = spacing
  const tileContext = tile.getContext('2d')
  if (tileContext) {
    tileContext.strokeStyle = template === 'lined' ? PAGE_TEMPLATE_LINE_COLOR : PAGE_TEMPLATE_DOT_COLOR
    tileContext.lineWidth = 1
    if (template === 'lined') {
      tileContext.beginPath()
      tileContext.moveTo(0, spacing - 0.5)
      tileContext.lineTo(spacing, spacing - 0.5)
      tileContext.stroke()
    } else {
      tileContext.beginPath()
      const center = PAGE_TEMPLATE_OVERVIEW_DOT_RADIUS + 0.5
      const radius = PAGE_TEMPLATE_OVERVIEW_DOT_RADIUS
      tileContext.arc(center, center, radius, 0, Math.PI * 2)
      tileContext.fillStyle = tileContext.strokeStyle
      tileContext.fill()
    }
  }
  tileCanvases.set(template, tile)
  return tile
}

function getPattern(ctx: CanvasRenderingContext2D, template: Exclude<PageTemplate, 'blank'>): CanvasPattern | null {
  let contextPatterns = patterns.get(ctx)
  if (!contextPatterns) {
    contextPatterns = new Map()
    patterns.set(ctx, contextPatterns)
  }
  let pattern = contextPatterns.get(template)
  if (!pattern) {
    pattern = ctx.createPattern(getTile(template), 'repeat') ?? undefined
    if (pattern) contextPatterns.set(template, pattern)
  }
  return pattern ?? null
}

export type SheetLayerViewport = { scale: number; offsetX: number; offsetY: number }
export type SheetLayerState = { transform: string; backgroundColor: string; backgroundImage: string; backgroundSize: string }
export type SheetLayerElement = { style: { transform: string; backgroundColor: string; backgroundImage: string; backgroundSize: string } }

/**
 * CSS equivalent of the lined and dotted marks. The main canvas stays transparent so the browser composites this
 * static layer instead of the canvas repainting a patterned sheet every frame.
 */
export function getPageTemplateCss(template: PageTemplate): Pick<SheetLayerState, 'backgroundImage' | 'backgroundSize'> {
  const tile = `${PAGE_TEMPLATE_SPACING}px ${PAGE_TEMPLATE_SPACING}px`
  if (template === 'lined') {
    const lineTop = PAGE_TEMPLATE_SPACING - 1.125
    return { backgroundImage: `linear-gradient(to bottom, transparent ${lineTop}px, ${PAGE_TEMPLATE_LINE_COLOR} ${lineTop}px)`, backgroundSize: tile }
  }
  if (template === 'dotted') {
    return { backgroundImage: `radial-gradient(circle at 2px 2px, ${PAGE_TEMPLATE_DOT_COLOR} 1.5px, transparent 1.9px)`, backgroundSize: tile }
  }
  return { backgroundImage: 'none', backgroundSize: 'auto' }
}

/** Positions the sheet layer exactly where the canvas viewport transform draws canvas coordinates (0, 0). */
export function getSheetLayerTransform(viewport: SheetLayerViewport): string {
  return `translate3d(${viewport.offsetX}px, ${viewport.offsetY}px, 0) scale(${viewport.scale})`
}

export function getSheetLayerState(template: PageTemplate, backgroundColor: string, viewport: SheetLayerViewport): SheetLayerState {
  return { transform: getSheetLayerTransform(viewport), backgroundColor, ...getPageTemplateCss(template) }
}

/** Writes only the style properties that changed since the last call, so unchanged frames cause no style invalidation. */
export function applySheetLayer(element: SheetLayerElement, applied: Partial<SheetLayerState>, next: SheetLayerState): void {
  if (applied.transform !== next.transform) element.style.transform = applied.transform = next.transform
  if (applied.backgroundColor !== next.backgroundColor) element.style.backgroundColor = applied.backgroundColor = next.backgroundColor
  if (applied.backgroundImage !== next.backgroundImage) element.style.backgroundImage = applied.backgroundImage = next.backgroundImage
  if (applied.backgroundSize !== next.backgroundSize) element.style.backgroundSize = applied.backgroundSize = next.backgroundSize
}

/** Draws an overview-scale template whose marks remain visible at minimap size. */
export function drawPageTemplateOverview(
  ctx: CanvasRenderingContext2D,
  template: PageTemplate,
  pageRect: { x: number; y: number; width: number; height: number },
): void {
  if (template === 'blank') return
  const pattern = getPattern(ctx, template)
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
