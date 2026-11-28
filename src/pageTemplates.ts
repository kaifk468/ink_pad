import type { CanvasType } from './canvasTypes'
import { LANE_BORDER_WIDTH, LANE_COLUMNS_HEADER_HEIGHT, LANE_COLUMNS_WIDTH, LANE_ROWS_HEADER_WIDTH, laneDir, laneRects, laneSize, type LaneSettings } from './canvasLanes'
import { parseHex } from './colorUtils'

export type PageTemplate = 'blank' | 'lined' | 'dotted'

export const DEFAULT_PAGE_TEMPLATE: PageTemplate = 'blank'
export const PAGE_TEMPLATE_SPACING = 32
export const PAGE_TEMPLATE_LINE_COLOR = '#aebfd8'
/** Dots are a little fainter than before (#566477 faded about 20% towards white). */
export const PAGE_TEMPLATE_DOT_COLOR = '#788392'
/** Light-sheet mark colours; the board styles pass their own (dot, thin line, stronger line). */
export type PageMarks = { dot: string; line: string; lineStrong: string; /** Notebook margin line (light default when missing). */ margin?: string }
export const PAGE_TEMPLATE_LINE_STRONG_COLOR = '#8197bb'
export const PAGE_MARKS_LIGHT: PageMarks = { dot: PAGE_TEMPLATE_DOT_COLOR, line: PAGE_TEMPLATE_LINE_COLOR, lineStrong: PAGE_TEMPLATE_LINE_STRONG_COLOR }
/** Notebook margin line on a light sheet (the dark and chalk boards bring their own muted red). */
export const PAGE_MARGIN_COLOR = '#e8a0a0'
/** Notebook layout in sheet units: the red margin line at x 160 and the stronger header line at y 96 (ruled lines continue above it). */
export const NOTEBOOK_MARGIN_X = 160
export const NOTEBOOK_HEADER_Y = 96
const NOTEBOOK_LINE_WIDTH = 2
/** Lane header strip tint: the line colour at this opacity. */
const LANE_HEADER_ALPHA = 0.22

/**
 * Mark strength (round 12, saved as the page field `marks`; missing or unknown = normal). Faint blends the mark colours
 * halfway to the sheet, Bold 40% toward the board's ink; Normal leaves them as they are.
 */
export type MarkStrength = 'faint' | 'normal' | 'bold'
export const MARK_STRENGTHS: ReadonlyArray<{ id: MarkStrength; label: string }> = [{ id: 'faint', label: 'Faint' }, { id: 'normal', label: 'Normal' }, { id: 'bold', label: 'Bold' }]
const FAINT_BLEND = 0.5
const BOLD_BLEND = 0.4

export function markStrength(value: string | undefined | null): MarkStrength {
  return value === 'faint' || value === 'bold' ? value : 'normal'
}

function blendHex(from: string, to: string, amount: number): string {
  const a = parseHex(from)
  const b = parseHex(to)
  if (!a || !b) return from
  const channel = (offset: number) => {
    const x = parseInt(a.slice(offset, offset + 2), 16)
    const y = parseInt(b.slice(offset, offset + 2), 16)
    return Math.round(x + (y - x) * amount).toString(16).padStart(2, '0')
  }
  return `#${channel(1)}${channel(3)}${channel(5)}`
}

/** `#rrggbb` as an rgba() string (the colour unchanged when it is not a hex colour). */
export function colorWithAlpha(color: string, alpha: number): string {
  const hex = parseHex(color)
  if (!hex) return color
  return `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${alpha})`
}

/**
 * The mark colours for a strength: dots, lines, stronger lines (and the notebook margin) blended toward the sheet
 * (faint) or the ink (bold). Normal returns the marks as they are. Colours that are not hex stay as they are.
 */
export function adjustMarks(marks: PageMarks, strength: MarkStrength | string | undefined, sheetColor: string, inkColor = '#202124'): PageMarks {
  const s = markStrength(strength)
  if (s === 'normal') return marks
  const toward = s === 'faint' ? sheetColor : inkColor
  const amount = s === 'faint' ? FAINT_BLEND : BOLD_BLEND
  const blend = (color: string) => blendHex(color, toward, amount)
  return { dot: blend(marks.dot), line: blend(marks.line), lineStrong: blend(marks.lineStrong), ...(marks.margin !== undefined ? { margin: blend(marks.margin) } : { margin: blend(PAGE_MARGIN_COLOR) }) }
}

/** The marks a sheet draws with: the board's own (undefined = the light defaults) adjusted for the diagram's strength; Normal changes nothing. */
export function effectiveMarks(base: PageMarks | undefined, strength: string | undefined, sheetColor: string, inkColor: string): PageMarks | undefined {
  return markStrength(strength) === 'normal' ? base : adjustMarks(base ?? PAGE_MARKS_LIGHT, strength, sheetColor, inkColor)
}

/** Grid canvas: every 5th line is the stronger one. */
export const GRID_MAJOR_EVERY = 5
/**
 * Cornell layout in sheet units. The marks are positioned from the top-left of the sheet and never move when the sheet
 * grows: the cue column is at 28% of the 2500-unit width, the header band at y 160 and the summary line at y 1200 (300
 * above the bottom of the first 1500-unit height; on a grown page it stays there and the notes area extends below it).
 */
export const CORNELL_SHEET_WIDTH = 2500
export const CORNELL_CUE_X = 700
export const CORNELL_HEADER_Y = 160
export const CORNELL_SUMMARY_Y = 1200
const CORNELL_LINE_WIDTH = 2
export type PageSpacing = 'narrow' | 'standard' | 'wide'
export const PAGE_SPACINGS: readonly PageSpacing[] = ['narrow', 'standard', 'wide']
export const DEFAULT_PAGE_SPACING: PageSpacing = 'standard'
/** Narrow is 20% tighter than Standard (the original 32 units), Wide is 20% looser. */
export const PAGE_SPACING_FACTOR: Record<PageSpacing, number> = { narrow: 0.8, standard: 1, wide: 1.2 }
export const PAGE_TEMPLATE_OVERVIEW_SPACING = 8
export const PAGE_TEMPLATE_OVERVIEW_DOT_RADIUS = 1.35

const STORAGE_KEY = 'inkpad.pageTemplate'
const SPACING_STORAGE_KEY = 'inkpad.pageSpacing'
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

/** Distance between lines or dots in canvas units: 25.6, 32 or 38.4. */
export function pageSpacingUnits(spacing: PageSpacing): number {
  return Math.round(PAGE_TEMPLATE_SPACING * PAGE_SPACING_FACTOR[spacing] * 100) / 100
}

export function parsePageSpacing(value: string | null | undefined): PageSpacing {
  return value === 'narrow' || value === 'wide' ? value : DEFAULT_PAGE_SPACING
}

export function loadPageSpacing(storage?: Pick<Storage, 'getItem'>): PageSpacing {
  try {
    return parsePageSpacing((storage ?? window.localStorage).getItem(SPACING_STORAGE_KEY))
  } catch {
    return DEFAULT_PAGE_SPACING
  }
}

export function savePageSpacing(spacing: PageSpacing, storage?: Pick<Storage, 'setItem'>): void {
  try {
    ;(storage ?? window.localStorage).setItem(SPACING_STORAGE_KEY, parsePageSpacing(spacing))
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts.
  }
}

/** Row height of the isometric (triangular) lattice for a spacing: spacing * sqrt(3) / 2, rounded to 1/1000 so CSS, SVG and snapping agree. */
export function isometricRowHeight(units: number): number {
  return Math.round(units * Math.sqrt(3) / 2 * 1000) / 1000
}

type OverviewKind = Exclude<CanvasType, 'blank' | 'lanes'>

function overviewKey(kind: OverviewKind, marks: PageMarks): string {
  return `${kind}|${marks.dot}|${marks.line}|${marks.lineStrong}`
}

function getTile(kind: OverviewKind, marks: PageMarks): HTMLCanvasElement {
  const key = overviewKey(kind, marks)
  let tile = tileCanvases.get(key)
  if (tile) return tile
  tile = document.createElement('canvas')
  const spacing = PAGE_TEMPLATE_OVERVIEW_SPACING
  const radius = PAGE_TEMPLATE_OVERVIEW_DOT_RADIUS
  const isGrid = kind === 'grid'
  const isoRow = Math.round(spacing * 0.866)
  tile.width = isGrid ? spacing * GRID_MAJOR_EVERY : spacing
  tile.height = isGrid ? spacing * GRID_MAJOR_EVERY : kind === 'isometric' ? isoRow * 2 : spacing
  const c = tile.getContext('2d')
  if (c) {
    const dot = (x: number, y: number) => {
      c.beginPath()
      c.arc(x, y, radius, 0, Math.PI * 2)
      c.fillStyle = marks.dot
      c.fill()
    }
    c.lineWidth = 1
    if (kind === 'lined' || kind === 'cornell' || kind === 'notebook') {
      c.strokeStyle = marks.line
      c.beginPath()
      c.moveTo(0, spacing - 0.5)
      c.lineTo(spacing, spacing - 0.5)
      c.stroke()
    } else if (kind === 'dotted') {
      dot(radius + 0.5, radius + 0.5)
    } else if (kind === 'isometric') {
      dot(radius + 0.5, radius + 0.5)
      dot(radius + 0.5 + spacing / 2, radius + 0.5 + isoRow)
    } else {
      for (let i = 0; i < GRID_MAJOR_EVERY; i++) {
        c.strokeStyle = i === 0 ? marks.lineStrong : marks.line
        c.beginPath()
        c.moveTo(i * spacing + 0.5, 0)
        c.lineTo(i * spacing + 0.5, tile.height)
        c.moveTo(0, i * spacing + 0.5)
        c.lineTo(tile.width, i * spacing + 0.5)
        c.stroke()
      }
    }
  }
  tileCanvases.set(key, tile)
  return tile
}

function getPattern(ctx: CanvasRenderingContext2D, kind: OverviewKind, marks: PageMarks): CanvasPattern | null {
  let contextPatterns = patterns.get(ctx)
  if (!contextPatterns) {
    contextPatterns = new Map()
    patterns.set(ctx, contextPatterns)
  }
  const key = overviewKey(kind, marks)
  let pattern = contextPatterns.get(key)
  if (!pattern) {
    pattern = ctx.createPattern(getTile(kind, marks), 'repeat') ?? undefined
    if (pattern) contextPatterns.set(key, pattern)
  }
  return pattern ?? null
}

export type SheetLayerViewport = { scale: number; offsetX: number; offsetY: number }
/** `backgroundPosition` is only set by types that need it (isometric); absent means the browser default, as before. */
export type SheetLayerState = { transform: string; backgroundColor: string; backgroundImage: string; backgroundSize: string; backgroundPosition?: string }
export type SheetLayerElement = { style: { transform: string; backgroundColor: string; backgroundImage: string; backgroundSize: string; backgroundPosition?: string } }

/**
 * CSS equivalent of the template marks. The main canvas stays transparent so the browser composites this static layer
 * instead of the canvas repainting a patterned sheet. Layer counts stay small (at most 4) for zoom performance:
 * lined 1, dotted 1, grid 4 (thin and strong, each direction), isometric 2, Cornell 3 (rules, cue column, header and summary),
 * notebook 3 (rules, margin line, header line), lanes 2 (header strip, borders; both tile or stretch, so they need no sheet height).
 * Pixels in the CSS are sheet units because the layer is scaled by its transform.
 */
export function getPageTemplateCss(template: CanvasType, spacing: PageSpacing = DEFAULT_PAGE_SPACING, marks: PageMarks = PAGE_MARKS_LIGHT, lanes?: LaneSettings | null): Pick<SheetLayerState, 'backgroundImage' | 'backgroundSize' | 'backgroundPosition'> {
  const units = pageSpacingUnits(spacing)
  const tile = `${units}px ${units}px`
  if (template === 'lined') {
    const lineTop = units - 1.125
    return { backgroundImage: `linear-gradient(to bottom, transparent ${lineTop}px, ${marks.line} ${lineTop}px)`, backgroundSize: tile }
  }
  if (template === 'dotted') {
    return { backgroundImage: `radial-gradient(circle at 2px 2px, ${marks.dot} 1.5px, transparent 1.9px)`, backgroundSize: tile }
  }
  if (template === 'grid') {
    const big = units * GRID_MAJOR_EVERY
    const strong = (dir: string) => `linear-gradient(${dir}, ${marks.lineStrong} 1.5px, transparent 1.5px)`
    const thin = (dir: string) => `linear-gradient(${dir}, ${marks.line} 1px, transparent 1px)`
    return {
      backgroundImage: [strong('to right'), strong('to bottom'), thin('to right'), thin('to bottom')].join(', '),
      backgroundSize: [`${big}px ${big}px`, `${big}px ${big}px`, tile, tile].join(', '),
    }
  }
  if (template === 'isometric') {
    const rowHeight = isometricRowHeight(units)
    // Dots on a triangular lattice with a point at every (k * units, row * rowHeight), odd rows shifted by half a spacing.
    // The dot is drawn 2px into its tile and the layer is shifted back by 2px so the dot centre is the lattice point.
    const dot = `radial-gradient(circle at 2px 2px, ${marks.dot} 1.5px, transparent 1.9px)`
    const size = `${units}px ${Math.round(rowHeight * 2 * 1000) / 1000}px`
    return {
      backgroundImage: `${dot}, ${dot}`,
      backgroundSize: `${size}, ${size}`,
      backgroundPosition: `-2px -2px, ${Math.round((units / 2 - 2) * 1000) / 1000}px ${Math.round((rowHeight - 2) * 1000) / 1000}px`,
    }
  }
  if (template === 'cornell') {
    const band = (from: number) => `${marks.lineStrong} ${from}px, ${marks.lineStrong} ${from + CORNELL_LINE_WIDTH}px, transparent ${from + CORNELL_LINE_WIDTH}px`
    const lineTop = units - 1.125
    return {
      backgroundImage: [
        `linear-gradient(to right, transparent ${CORNELL_CUE_X}px, ${band(CORNELL_CUE_X)})`,
        `linear-gradient(to bottom, transparent ${CORNELL_HEADER_Y}px, ${band(CORNELL_HEADER_Y)}, transparent ${CORNELL_SUMMARY_Y}px, ${band(CORNELL_SUMMARY_Y)})`,
        `linear-gradient(to bottom, transparent ${lineTop}px, ${marks.line} ${lineTop}px)`,
      ].join(', '),
      backgroundSize: ['100% 100%', '100% 100%', tile].join(', '),
    }
  }
  if (template === 'notebook') {
    const lineTop = units - 1.125
    const margin = marks.margin ?? PAGE_MARGIN_COLOR
    const band = (color: string, from: number) => `${color} ${from}px, ${color} ${from + NOTEBOOK_LINE_WIDTH}px, transparent ${from + NOTEBOOK_LINE_WIDTH}px`
    return {
      backgroundImage: [
        `linear-gradient(to right, transparent ${NOTEBOOK_MARGIN_X}px, ${band(margin, NOTEBOOK_MARGIN_X)})`,
        `linear-gradient(to bottom, transparent ${NOTEBOOK_HEADER_Y}px, ${band(marks.lineStrong, NOTEBOOK_HEADER_Y)})`,
        `linear-gradient(to bottom, transparent ${lineTop}px, ${marks.line} ${lineTop}px)`,
      ].join(', '),
      backgroundSize: ['100% 100%', '100% 100%', tile].join(', '),
    }
  }
  if (template === 'lanes') {
    const size = laneSize(lanes)
    const tint = colorWithAlpha(marks.line, LANE_HEADER_ALPHA)
    const edge = (from: number) => `${marks.lineStrong} ${from}px, ${marks.lineStrong} ${from + LANE_BORDER_WIDTH}px, transparent ${from + LANE_BORDER_WIDTH}px`
    if (laneDir(lanes) === 'columns') {
      return {
        backgroundImage: [
          `linear-gradient(to bottom, ${tint} ${LANE_COLUMNS_HEADER_HEIGHT}px, ${edge(LANE_COLUMNS_HEADER_HEIGHT)})`,
          `linear-gradient(to right, transparent ${size - LANE_BORDER_WIDTH}px, ${marks.lineStrong} ${size - LANE_BORDER_WIDTH}px)`,
        ].join(', '),
        backgroundSize: ['100% 100%', `${size}px 100%`].join(', '),
      }
    }
    return {
      backgroundImage: [
        `linear-gradient(to right, ${tint} ${LANE_ROWS_HEADER_WIDTH}px, ${edge(LANE_ROWS_HEADER_WIDTH)})`,
        `linear-gradient(to bottom, transparent ${size - LANE_BORDER_WIDTH}px, ${marks.lineStrong} ${size - LANE_BORDER_WIDTH}px)`,
      ].join(', '),
      backgroundSize: ['100% 100%', `100% ${size}px`].join(', '),
    }
  }
  return { backgroundImage: 'none', backgroundSize: 'auto' }
}

/** Positions the sheet layer exactly where the canvas viewport transform draws canvas coordinates (0, 0). */
export function getSheetLayerTransform(viewport: SheetLayerViewport): string {
  return `translate3d(${viewport.offsetX}px, ${viewport.offsetY}px, 0) scale(${viewport.scale})`
}

export function getSheetLayerState(template: CanvasType, backgroundColor: string, viewport: SheetLayerViewport, spacing: PageSpacing = DEFAULT_PAGE_SPACING, marks: PageMarks = PAGE_MARKS_LIGHT, lanes?: LaneSettings | null): SheetLayerState {
  const css = getPageTemplateCss(template, spacing, marks, lanes)
  return { transform: getSheetLayerTransform(viewport), backgroundColor, backgroundImage: css.backgroundImage, backgroundSize: css.backgroundSize, ...(css.backgroundPosition !== undefined ? { backgroundPosition: css.backgroundPosition } : {}) }
}

/** Writes only the style properties that changed since the last call, so unchanged frames cause no style invalidation. */
export function applySheetLayer(element: SheetLayerElement, applied: Partial<SheetLayerState>, next: SheetLayerState): void {
  if (applied.transform !== next.transform) element.style.transform = applied.transform = next.transform
  if (applied.backgroundColor !== next.backgroundColor) element.style.backgroundColor = applied.backgroundColor = next.backgroundColor
  if (applied.backgroundImage !== next.backgroundImage) element.style.backgroundImage = applied.backgroundImage = next.backgroundImage
  if (applied.backgroundSize !== next.backgroundSize) element.style.backgroundSize = applied.backgroundSize = next.backgroundSize
  if (applied.backgroundPosition !== next.backgroundPosition) { element.style.backgroundPosition = next.backgroundPosition ?? ''; applied.backgroundPosition = next.backgroundPosition }
}

/** Draws an overview-scale template whose marks remain visible at minimap size. */
export function drawPageTemplateOverview(
  ctx: CanvasRenderingContext2D,
  template: CanvasType,
  pageRect: { x: number; y: number; width: number; height: number },
  marks: PageMarks = PAGE_MARKS_LIGHT,
  lanes?: LaneSettings | null,
): void {
  if (template === 'blank') return
  if (template === 'lanes') {
    // Bands and borders only, in the same sheet units as the CSS layer scaled to the minimap (sheet height = page height / scale).
    const k = pageRect.width / LANE_COLUMNS_WIDTH
    const w = Math.max(1, LANE_BORDER_WIDTH * k)
    ctx.save()
    ctx.beginPath()
    ctx.rect(pageRect.x, pageRect.y, pageRect.width, pageRect.height)
    ctx.clip()
    const vertical = laneDir(lanes) === 'columns'
    const rects = laneRects(lanes, LANE_COLUMNS_WIDTH, pageRect.height / k)
    ctx.fillStyle = colorWithAlpha(marks.line, LANE_HEADER_ALPHA)
    for (const { header } of rects) ctx.fillRect(pageRect.x + header.x * k, pageRect.y + header.y * k, header.width * k, header.height * k)
    ctx.fillStyle = marks.lineStrong
    for (const { lane, header } of rects) {
      if (vertical) {
        ctx.fillRect(pageRect.x + (lane.x + lane.width) * k - w, pageRect.y, w, pageRect.height)
        ctx.fillRect(pageRect.x + lane.x * k, pageRect.y + header.height * k, lane.width * k, w)
      } else {
        ctx.fillRect(pageRect.x, pageRect.y + (lane.y + lane.height) * k - w, pageRect.width, w)
        ctx.fillRect(pageRect.x + header.width * k, pageRect.y + lane.y * k, w, lane.height * k)
      }
    }
    ctx.restore()
    return
  }
  const pattern = getPattern(ctx, template, marks)
  if (!pattern) return
  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.beginPath()
  ctx.rect(pageRect.x, pageRect.y, pageRect.width, pageRect.height)
  ctx.clip()
  ctx.fillStyle = pattern
  ctx.fillRect(pageRect.x, pageRect.y, pageRect.width, pageRect.height)
  if (template === 'cornell') {
    // One-off lines in the same sheet units as the CSS layer, scaled to the minimap.
    const k = pageRect.width / CORNELL_SHEET_WIDTH
    const w = Math.max(1, CORNELL_LINE_WIDTH * k)
    ctx.fillStyle = marks.lineStrong
    ctx.fillRect(pageRect.x + CORNELL_CUE_X * k, pageRect.y, w, pageRect.height)
    ctx.fillRect(pageRect.x, pageRect.y + CORNELL_HEADER_Y * k, pageRect.width, w)
    ctx.fillRect(pageRect.x, pageRect.y + CORNELL_SUMMARY_Y * k, pageRect.width, w)
  }
  if (template === 'notebook') {
    const k = pageRect.width / CORNELL_SHEET_WIDTH
    const w = Math.max(1, NOTEBOOK_LINE_WIDTH * k)
    ctx.fillStyle = marks.margin ?? PAGE_MARGIN_COLOR
    ctx.fillRect(pageRect.x + NOTEBOOK_MARGIN_X * k, pageRect.y, w, pageRect.height)
    ctx.fillStyle = marks.lineStrong
    ctx.fillRect(pageRect.x, pageRect.y + NOTEBOOK_HEADER_Y * k, pageRect.width, w)
  }
  ctx.restore()
}
