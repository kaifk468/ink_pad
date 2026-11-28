import type { CanvasItem, RectangleObject, Stroke } from './canvasModel'
import { DEFAULT_FILL, DEFAULT_INK, boardPalette, boardTheme, type BoardPalette, type BoardTheme } from './boardStyle'

/**
 * Board colours resolved at DRAW TIME (round 11). Nothing here ever reaches a saved file.
 *
 * Only the default ink (#202124) and the default white fill (#ffffff / #fff) follow the board. Every colour the user
 * picked stays exactly as stored. On the light board nothing changes at all: the same object comes back.
 * Resolved copies are cached per item (WeakMap, per theme) so drawing allocates nothing after the first frame.
 */

/** True when `color` is the stored default ink (compared case-insensitively). */
/** The default inks: InkPad's own (#202124), the one templates and Excalidraw / Mermaid imports write (#1e1e1e), and plain black. */
const DEFAULT_INKS = new Set([DEFAULT_INK, '#1e1e1e', '#000000', '#000'])
export function isDefaultInk(color: string): boolean {
  return DEFAULT_INKS.has(color) || DEFAULT_INKS.has(color.toLowerCase())
}

/** True when `color` is the default white fill. */
export function isDefaultFill(color: string): boolean {
  const lower = color.toLowerCase()
  return lower === DEFAULT_FILL || lower === '#fff'
}

/** One ink colour as it draws on the palette's board. */
export function resolveInk(color: string, palette: BoardPalette): string {
  return palette.theme !== 'light' && isDefaultInk(color) ? palette.ink : color
}

/** One fill colour as it draws on the palette's board. */
export function resolveFill(color: string, palette: BoardPalette): string {
  return palette.theme !== 'light' && isDefaultFill(color) ? palette.fill : color
}

function resolveStroke(stroke: Stroke, palette: BoardPalette): Stroke {
  if (stroke.erase) return stroke
  const color = resolveInk(stroke.color, palette)
  return color === stroke.color ? stroke : { ...stroke, color }
}

function resolveRectangle(rectangle: RectangleObject, palette: BoardPalette): RectangleObject {
  const strokeColor = resolveInk(rectangle.strokeColor, palette)
  const fillColor = rectangle.fillColor === undefined ? undefined : resolveFill(rectangle.fillColor, palette)
  let inkBox = rectangle.inkBox
  if (inkBox) {
    let changed = false
    const ink = inkBox.ink.map((stroke) => {
      const resolved = resolveStroke(stroke, palette)
      if (resolved !== stroke) changed = true
      return resolved
    })
    if (changed) inkBox = { ...inkBox, ink }
  }
  if (strokeColor === rectangle.strokeColor && fillColor === rectangle.fillColor && inkBox === rectangle.inkBox) return rectangle
  const copy: RectangleObject = { ...rectangle, strokeColor }
  if (fillColor !== undefined) copy.fillColor = fillColor
  if (inkBox) copy.inkBox = inkBox
  return copy
}

function resolveUncached(item: CanvasItem, palette: BoardPalette): CanvasItem {
  switch (item.kind) {
    case 'stroke': return resolveStroke(item, palette)
    case 'rectangle': return resolveRectangle(item, palette)
    case 'text': { const color = resolveInk(item.color, palette); return color === item.color ? item : { ...item, color } }
    case 'connector': { const strokeColor = resolveInk(item.strokeColor, palette); return strokeColor === item.strokeColor ? item : { ...item, strokeColor } }
    // Code blocks have their own light / dark theme; unknown items are drawn as a grey box.
    default: return item
  }
}

/** Perceived brightness 0..1 of a #rgb / #rrggbb colour (Rec. 601 weights on the stored sRGB values); anything else is 0. */
export function colorLuma(color: string): number {
  let hex = color.trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(hex)) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
  if (!/^#[0-9a-f]{6}$/.test(hex)) return 0
  const channel = (offset: number) => parseInt(hex.slice(offset, offset + 2), 16) / 255
  return 0.299 * channel(1) + 0.587 * channel(3) + 0.114 * channel(5)
}

/** An explicit light fill (sticky note yellow, pastel presets): not the default white, which itself follows the board. */
const LIGHT_FILL_LUMA = 0.6
function isExplicitLightFill(fill: string | undefined): boolean {
  return fill !== undefined && fill !== 'none' && !isDefaultFill(fill) && colorLuma(fill) > LIGHT_FILL_LUMA
}

type LightHosts = { count: number; rects: RectangleObject[] }
const hostCache = new WeakMap<readonly CanvasItem[], LightHosts>()

/** The rectangles with an explicit light fill, found ONCE per items array (rebuilt only when the array or its length changes). */
function lightHosts(items: readonly CanvasItem[]): RectangleObject[] {
  const hit = hostCache.get(items)
  if (hit && hit.count === items.length) return hit.rects
  const rects: RectangleObject[] = []
  for (const item of items) if (item.kind === 'rectangle' && isExplicitLightFill(item.fillColor)) rects.push(item)
  hostCache.set(items, { count: items.length, rects })
  return rects
}

/** True when the centre of a text item or stroke lies inside a rectangle with an explicit light fill (its stored ink must stay readable there). */
function sitsOnLightFill(item: CanvasItem, items: readonly CanvasItem[] | undefined): boolean {
  if (!items || (item.kind !== 'text' && item.kind !== 'stroke')) return false
  const rects = lightHosts(items)
  if (rects.length === 0) return false
  let cx: number
  let cy: number
  if (item.kind === 'text') { cx = item.x + item.width / 2; cy = item.y + item.height / 2 } else {
    const points = item.points
    if (points.length === 0) return false
    let minX = points[0].x, maxX = minX, minY = points[0].y, maxY = minY
    for (let index = 1; index < points.length; index++) {
      const point = points[index]
      if (point.x < minX) minX = point.x
      else if (point.x > maxX) maxX = point.x
      if (point.y < minY) minY = point.y
      else if (point.y > maxY) maxY = point.y
    }
    cx = (minX + maxX) / 2
    cy = (minY + maxY) / 2
  }
  for (const rect of rects) if (cx >= rect.x && cx <= rect.x + rect.width && cy >= rect.y && cy <= rect.y + rect.height) return true
  return false
}

type CacheEntry = { result: CanvasItem; items: readonly CanvasItem[] | undefined; points: unknown; pointCount: number; color: unknown }
const caches: Record<'dark' | 'chalk', WeakMap<object, CacheEntry>> = { dark: new WeakMap(), chalk: new WeakMap() }

/**
 * The item as it draws on the board. Light board (or no change): the SAME object. Otherwise a copy with the default ink / white fill
 * replaced; the copy is cached per item and theme, so a second frame returns the identical copy. The cache remembers the fields it was
 * built from (points array and length, colour, items array), so an item that is mutated in place (the live line / arrow stroke) is resolved again.
 * `items` (the page's items) lets text and strokes sitting on an explicit light fill keep their stored ink.
 */
export function resolveItemForBoard<T extends CanvasItem>(item: T, palette: BoardPalette, items?: readonly CanvasItem[]): T {
  if (palette.theme === 'light') return item
  const cache = caches[palette.theme]
  const points = item.kind === 'stroke' ? item.points : undefined
  const pointCount = points ? points.length : 0
  const color = item.kind === 'stroke' || item.kind === 'text' ? item.color : item.kind === 'rectangle' ? item.strokeColor : undefined
  const hit = cache.get(item)
  if (hit && hit.items === items && hit.points === points && hit.pointCount === pointCount && hit.color === color) return hit.result as T
  const resolved = sitsOnLightFill(item, items) ? item : resolveUncached(item, palette)
  cache.set(item, { result: resolved, items, points, pointCount, color })
  return resolved as T
}

/** The sheet colour to draw: the board's sheet on dark boards (the saved tint is kept in the file, just not used), else the saved tint. */
export function sheetColorForBoard(board: string | undefined, storedColor: string): string {
  return boardTheme(board) === 'light' ? storedColor : boardPalette(board).sheet
}

/** Sheet outline drawn on the canvas. */
export function sheetBorderColor(theme: BoardTheme): string {
  return theme === 'light' ? '#d9dce2' : boardPalette(theme).lineStrong
}

// ---- hollow fill (class box body, hollow arrowheads) ----------------------------------------------------------

let boardFillColor = DEFAULT_FILL
/** The colour of hollow fills (class box body, hollow arrowheads); set by the app from the board. */
export function setBoardFill(color: string): void { boardFillColor = color }
export function getBoardFill(): string { return boardFillColor }

let boardInkColor: string | null = null
/** The board's ink on dark boards (null on the light board); set by the app, used for draw-time logo colours. */
export function setBoardInk(color: string | null): void { boardInkColor = color }
export function getBoardInk(): string | null { return boardInkColor }

// ---- pen colours ----------------------------------------------------------------------------------------------

export type PenColor = { name: string; value: string }
export type BoardPenColor = PenColor & { display: string }

const CHALK_PEN_COLORS: PenColor[] = [
  { name: 'Chalk yellow', value: '#f6d365' },
  { name: 'Chalk pink', value: '#f4a6b8' },
  { name: 'Chalk blue', value: '#8cc8f0' },
  { name: 'Chalk green', value: '#a8e0a0' },
]

/**
 * The pen swatches for a board. The first keeps the stored value (#202124, so it follows the board) but shows as the
 * board's ink and is named for it; the others are readable light colours on dark boards. Light = the given colours unchanged.
 * `display` is the colour to paint the swatch with.
 */
export function penColorsForBoard(theme: BoardTheme, colors: ReadonlyArray<PenColor>): BoardPenColor[] {
  if (theme === 'light') return colors.map((color) => ({ ...color, display: color.value }))
  const result: BoardPenColor[] = [{ name: theme === 'chalk' ? 'Chalk white' : 'White ink', value: colors[0].value, display: boardPalette(theme).ink }]
  CHALK_PEN_COLORS.forEach((color, index) => { if (index + 1 < colors.length) result.push({ ...color, display: color.value }) })
  return result
}

/**
 * The fill swatches for a board. The first is the default white fill: stored as #ffffff (so it follows the board) and shown as the
 * board's fill. The others are readable light colours on dark boards. Light = the given colours unchanged.
 */
export function fillColorsForBoard(theme: BoardTheme, colors: ReadonlyArray<PenColor>): BoardPenColor[] {
  if (theme === 'light') return colors.map((color) => ({ ...color, display: color.value }))
  const result: BoardPenColor[] = [{ name: theme === 'chalk' ? 'Chalk fill' : 'Dark fill', value: DEFAULT_FILL, display: boardPalette(theme).fill }]
  CHALK_PEN_COLORS.forEach((color, index) => { if (index + 1 < colors.length) result.push({ ...color, display: color.value }) })
  return result
}

/** A stored colour as a swatch shows it on the board (default ink follows the board). */
export function displayColorForBoard(color: string, theme: BoardTheme): string {
  return resolveInk(color, boardPalette(theme))
}
