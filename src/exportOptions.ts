import { canvasItemKey, type CanvasItem } from './canvasModel'
import { cleanConnectorLabel } from './connectorLabel'

/**
 * Pure helpers for image export: which items go into the picture, whether the hand-drawn font must be embedded,
 * file names and the remembered "Transparent background" choice. Browser-only work (fonts, canvas, clipboard) lives elsewhere.
 */

/**
 * The items an export draws. With a key set: exactly the selected items (a connector only when it is itself selected), plus
 * eraser strokes, which draw nothing by themselves and only cut the selected ink they overlap. No keys (null or empty): everything.
 */
export function itemsForExport(items: readonly CanvasItem[], keys: ReadonlySet<string> | null | undefined): CanvasItem[] {
  if (!keys || keys.size === 0) return items.slice()
  return items.filter((item) => keys.has(canvasItemKey(item)) || (item.kind === 'stroke' && item.erase === true))
}

/** True when a selection (not the whole page) is being exported. */
export function isSelectionExport(keys: ReadonlySet<string> | null | undefined): boolean {
  return Boolean(keys && keys.size > 0)
}

/** True when some exported label is set in Excalifont (the only bundled web font, so the only one worth embedding). */
export function usesExcalifont(items: readonly CanvasItem[]): boolean {
  return items.some((item) => (item.kind === 'text' && item.fontFamily === 'excalifont' && item.text.trim().length > 0)
    || (item.kind === 'connector' && cleanConnectorLabel(item.label) !== undefined))
}

/** The @font-face rule that carries the bundled Excalifont inside an SVG. */
export function excalifontFontFaceCss(base64Woff2: string): string {
  return `@font-face{font-family:'Excalifont';src:url(data:font/woff2;base64,${base64Woff2}) format('woff2');font-weight:400;font-style:normal}`
}

/** The file name (without extension) of an export: the diagram's name, plus "-selection" for a selection. */
export function exportBaseName(baseName: string, selection: boolean): string {
  return selection ? `${baseName}-selection` : baseName
}

export const TRANSPARENT_EXPORT_KEY = 'inkpad.exportTransparent'
type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** The remembered "Transparent background" choice; off when nothing is stored or storage is unavailable. */
export function readTransparentExport(storage: StorageLike | null | undefined): boolean {
  try { return storage?.getItem(TRANSPARENT_EXPORT_KEY) === '1' } catch { return false }
}

export function writeTransparentExport(storage: StorageLike | null | undefined, value: boolean): void {
  try { storage?.setItem(TRANSPARENT_EXPORT_KEY, value ? '1' : '0') } catch { /* the choice just is not remembered */ }
}

export const COPY_IMAGE_FAILED = 'Couldn’t copy image — use File > Export instead'
