import type { CanvasItem } from './canvasModel'
import { buildPdf, type PdfPageImage } from './pdfExport'
import { buildSheetSvg, cropSvg, getContentBounds, svgToImageBlob } from './sheetExport'
import { SHEET_WIDTH } from './viewport'

/** A page picture is kept under this many pixels (and this long a side) so a tall page does not exhaust a tablet's canvas memory. */
export const EXPORT_MAX_PIXELS = 12_000_000
export const EXPORT_MAX_SIDE = 6000
export const EXPORT_JPEG_QUALITY = 0.92

/** Pixels per sheet unit for an exported page: 2 when it fits the limits, less for a very large page. */
export function exportPixelRatio(width: number, height: number): number {
  const area = Math.max(1, width * height)
  return Math.min(2, Math.sqrt(EXPORT_MAX_PIXELS / area), EXPORT_MAX_SIDE / Math.max(1, width, height))
}

/**
 * One PDF for a whole diagram: each page that has anything on it becomes a PDF page, cropped to its drawing, in dark ink on
 * plain white (no page colour or lines), so a reader such as NotebookLM sees the strokes clearly. Null when every page is empty.
 * Browser only (it draws on a canvas).
 */
export async function renderDiagramPdf(pageItems: CanvasItem[][], sheetHeight: number, sketchy = false): Promise<{ pdf: Uint8Array; pageCount: number } | null> {
  const pages: PdfPageImage[] = []
  for (const items of pageItems) {
    const bounds = getContentBounds(items, { width: SHEET_WIDTH, height: sheetHeight })
    if (!bounds) continue
    // No `board` on purpose: this PDF is made for NotebookLM / Drive readers, which want dark ink on plain white whatever board the diagram uses.
    const svg = cropSvg(buildSheetSvg(items, { width: SHEET_WIDTH, height: sheetHeight, template: 'blank', backgroundColor: '#ffffff', ...(sketchy ? { sketchy: true } : {}) }), bounds)
    const ratio = exportPixelRatio(bounds.width, bounds.height)
    const blob = await svgToImageBlob(svg, bounds.width, bounds.height, ratio, 'image/jpeg', EXPORT_JPEG_QUALITY)
    pages.push({
      width: bounds.width,
      height: bounds.height,
      jpeg: new Uint8Array(await blob.arrayBuffer()),
      pixelWidth: Math.round(bounds.width * ratio),
      pixelHeight: Math.round(bounds.height * ratio),
    })
  }
  return pages.length ? { pdf: buildPdf(pages), pageCount: pages.length } : null
}
