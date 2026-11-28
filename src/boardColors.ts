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
export function isDefaultInk(color: string): boolean {
  return color === DEFAULT_INK || color.toLowerCase() === DEFAULT_INK
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

const caches: Record<'dark' | 'chalk', WeakMap<object, CanvasItem>> = { dark: new WeakMap(), chalk: new WeakMap() }

/**
 * The item as it draws on the board. Light board (or no change): the SAME object. Otherwise a copy with the default ink / white fill
 * replaced; the copy is cached per item and theme, so a second frame returns the identical copy.
 */
export function resolveItemForBoard<T extends CanvasItem>(item: T, palette: BoardPalette): T {
  if (palette.theme === 'light') return item
  const cache = caches[palette.theme]
  const hit = cache.get(item)
  if (hit) return hit as T
  const resolved = resolveUncached(item, palette)
  cache.set(item, resolved)
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

/** A stored colour as a swatch shows it on the board (default ink follows the board). */
export function displayColorForBoard(color: string, theme: BoardTheme): string {
  return resolveInk(color, boardPalette(theme))
}
