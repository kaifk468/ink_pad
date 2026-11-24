import type { CanvasItem, TextAlign, TextFontId, TextObject } from './canvasModel'

/** Shared text geometry: used by the canvas renderer, SVG export, hit-testing and the editor. */
export const TEXT_FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
/** A label saved before fonts existed has no font and keeps drawing in this one, so old diagrams look and fit exactly as before. */
export const LEGACY_TEXT_FONT: TextFontId = 'sans'
/** New labels start in the hand-drawn Excalifont (bundled with the app, SIL Open Font License). */
export const DEFAULT_TEXT_FONT: TextFontId = 'excalifont'
export const TEXT_FONTS: ReadonlyArray<{ id: TextFontId; label: string; family: string }> = [
  { id: 'excalifont', label: 'Hand-drawn', family: "'Excalifont', 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive" },
  { id: 'sans', label: 'Clean', family: TEXT_FONT_FAMILY },
  { id: 'serif', label: 'Serif', family: "Georgia, 'Times New Roman', serif" },
  { id: 'mono', label: 'Code', family: "ui-monospace, 'Cascadia Code', Consolas, Menlo, monospace" },
]

export function textFontFamily(id?: TextFontId): string {
  return (TEXT_FONTS.find((font) => font.id === (id ?? LEGACY_TEXT_FONT)) ?? TEXT_FONTS[1]).family
}

export const TEXT_FONT_SIZES = [18, 24, 32, 48]
/** Extra small sizes, offered in Desktop mode only (the tablet panel keeps TEXT_FONT_SIZES). 10 is the smallest. */
export const TEXT_FONT_SIZES_SMALL = [10, 12, 14, 16]
export const TEXT_FONT_SIZES_DESKTOP = [...TEXT_FONT_SIZES_SMALL, ...TEXT_FONT_SIZES]

/** One step along the Desktop panel sizes (10 .. 48): the next larger (direction 1) or smaller (-1) size than `size`, or null at the end. A size between two steps moves to the nearest step in that direction. */
export function stepFontSize(size: number, direction: 1 | -1, steps: readonly number[] = TEXT_FONT_SIZES_DESKTOP): number | null {
  const sorted = [...steps].sort((a, b) => a - b)
  const next = direction === 1 ? sorted.find((step) => step > size) : [...sorted].reverse().find((step) => step < size)
  return next ?? null
}
export const DEFAULT_TEXT_FONT_SIZE = 24
export const MAX_TEXT_LENGTH = 2000
export const TEXT_LINE_HEIGHT = 1.3
/** Baseline sits this far (in em) below the top of the em box, inside the line box. */
const BASELINE_IN_EM = 0.8
/** Average glyph width in em, used only when no real measurement is available. */
const ESTIMATED_GLYPH_EM = 0.56

export type TextMeasure = (line: string) => number

export function splitTextLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n')
}

export function textFont(fontSize: number, fontId?: TextFontId): string {
  return `${fontSize}px ${textFontFamily(fontId)}`
}

export function getTextLineHeight(fontSize: number): number {
  return fontSize * TEXT_LINE_HEIGHT
}

/** Y of each line's alphabetic baseline, relative to the text box top. */
export function getTextBaselines(text: string, fontSize: number): number[] {
  const lineHeight = getTextLineHeight(fontSize)
  const halfLeading = (lineHeight - fontSize) / 2
  return splitTextLines(text).map((_, index) => index * lineHeight + halfLeading + fontSize * BASELINE_IN_EM)
}

export function estimateTextSize(text: string, fontSize: number): { width: number; height: number } {
  const lines = splitTextLines(text)
  const longest = Math.max(...lines.map((line) => line.length), 1)
  return { width: Math.max(fontSize * 0.5, longest * fontSize * ESTIMATED_GLYPH_EM), height: lines.length * getTextLineHeight(fontSize) }
}

const measureCache = new Map<string, number>()
const wrapCache = new Map<string, string[]>()
let measureContext: CanvasRenderingContext2D | null | undefined

/** Forget cached widths and wrapped lines (call when a font finishes loading, since fallback widths may have been cached). */
export function clearTextMeasureCache(): void {
  measureCache.clear()
  wrapCache.clear()
}

/** A line measurer with a per font/size/string cache, so repeated measuring while typing or drawing costs a map lookup. Undefined off-DOM. */
export function getCachedTextMeasure(fontSize: number, fontId?: TextFontId): TextMeasure | undefined {
  if (measureContext === undefined) measureContext = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
  const ctx = measureContext
  if (!ctx) return undefined
  const font = textFont(fontSize, fontId)
  return (line) => {
    const key = `${font}|${line}`
    const hit = measureCache.get(key)
    if (hit !== undefined) return hit
    ctx.font = font
    const width = ctx.measureText(line).width
    if (measureCache.size > 5000) measureCache.clear()
    measureCache.set(key, width)
    return width
  }
}

/** Word-wraps text to `maxWidth`: explicit newlines are kept, words that are wider than the width are broken by character. */
export function wrapTextLines(text: string, maxWidth: number, measure: TextMeasure): string[] {
  const out: string[] = []
  for (const paragraph of splitTextLines(text)) {
    if (paragraph === '') { out.push(''); continue }
    let line = ''
    for (const word of paragraph.split(' ')) {
      const candidate = line === '' ? word : `${line} ${word}`
      if (measure(candidate) <= maxWidth) { line = candidate; continue }
      if (line !== '') { out.push(line); line = '' }
      if (measure(word) <= maxWidth) { line = word; continue }
      let piece = ''
      for (const char of word) {
        if (piece !== '' && measure(piece + char) > maxWidth) { out.push(piece); piece = char } else piece += char
      }
      line = piece
    }
    out.push(line)
  }
  return out
}

/** The lines a label shows: wrapped to its width when it is a wrapped (auto-fit at the minimum size) label, otherwise its own lines. */
export function labelLines(item: { text: string; fontSize: number; fontFamily?: TextFontId; width: number; fit?: 'off' | 'wrap' }, measure?: TextMeasure): string[] {
  if (item.fit !== 'wrap') return splitTextLines(item.text)
  const key = `${textFont(item.fontSize, item.fontFamily)}|${item.width}|${item.text}`
  const hit = wrapCache.get(key)
  if (hit) return hit
  const lines = wrapTextLines(item.text, item.width, measure ?? getCachedTextMeasure(item.fontSize, item.fontFamily) ?? ((line) => estimateTextSize(line, item.fontSize).width))
  if (wrapCache.size > 500) wrapCache.clear()
  wrapCache.set(key, lines)
  return lines
}

export function measureTextSize(text: string, fontSize: number, measure?: TextMeasure): { width: number; height: number } {
  if (!measure) return estimateTextSize(text, fontSize)
  const lines = splitTextLines(text)
  return { width: Math.max(fontSize * 0.5, ...lines.map(measure)), height: lines.length * getTextLineHeight(fontSize) }
}

/** Height of a label wrapped to `width`. */
export function wrappedHeight(text: string, fontSize: number, width: number, measure?: TextMeasure): number {
  const lines = wrapTextLines(text, width, measure ?? ((line) => estimateTextSize(line, fontSize).width))
  return lines.length * getTextLineHeight(fontSize)
}

export function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').slice(0, MAX_TEXT_LENGTH)
}

export function isBlankText(text: string): boolean {
  return text.trim().length === 0
}

export function createTextObject(
  id: number,
  x: number,
  y: number,
  text: string,
  color: string,
  fontSize = DEFAULT_TEXT_FONT_SIZE,
  measure?: TextMeasure,
  fontFamily?: TextFontId,
): TextObject {
  const clean = normalizeText(text)
  const size = measureTextSize(clean, fontSize, measure)
  return { kind: 'text', id, x, y, width: size.width, height: size.height, text: clean, fontSize, color, ...(fontFamily ? { fontFamily } : {}) }
}

/** The same label in another font, re-measured. Position, id, text, size and color are kept. */
export function changeTextFont(item: TextObject, fontFamily: TextFontId, measure?: TextMeasure): TextObject {
  if (item.fit === 'wrap') return { ...item, fontFamily, height: wrappedHeight(item.text, item.fontSize, item.width, measure) }
  const size = measureTextSize(item.text, item.fontSize, measure)
  return { ...item, fontFamily, width: size.width, height: size.height }
}

/** Same object with new text/size, re-measured. Position, id and color are kept. */
export function updateTextObject(item: TextObject, text: string, fontSize: number, measure?: TextMeasure): TextObject {
  const clean = normalizeText(text)
  if (item.fit === 'wrap') return { ...item, text: clean, fontSize, height: wrappedHeight(clean, fontSize, item.width, measure) }
  const size = measureTextSize(clean, fontSize, measure)
  return { ...item, text: clean, fontSize, width: size.width, height: size.height }
}

/** Left edge of one line inside a label box: left (undefined) at `x`, centred or right-aligned within `width`. Never left of the box. */
export function alignedLineX(x: number, width: number, lineWidth: number, align?: TextAlign): number {
  if (align === 'center') return x + Math.max(0, (width - lineWidth) / 2)
  if (align === 'right') return x + Math.max(0, width - lineWidth)
  return x
}

/** Left edge of a line `lineWidth` wide: its own x for a left label, else alignedLineX (the canvas and the SVG export share this, so a line wider than the box clamps the same way). */
export function textLineX(text: Pick<TextObject, 'x' | 'width' | 'align'>, lineWidth: number): number {
  return text.align ? alignedLineX(text.x, text.width, lineWidth, text.align) : text.x
}

/** An edited label keeps the anchor its alignment promises: a centred label keeps its horizontal centre, a right-aligned one its right edge, a left one its left edge. */
export function keepAlignAnchor(before: Pick<TextObject, 'x' | 'width' | 'align'>, after: TextObject): TextObject {
  if (before.align === 'center') return { ...after, x: before.x + before.width / 2 - after.width / 2 }
  if (before.align === 'right') return { ...after, x: before.x + before.width - after.width }
  return after
}

/** The text labels whose key is in `keys` (unlocked only) with their alignment set; 'left' removes it. Same array when nothing changes. */
export function setTextAlign(items: CanvasItem[], keys: ReadonlySet<string>, align: TextAlign | 'left'): CanvasItem[] {
  let changed = false
  const next = items.map((item): CanvasItem => {
    if (item.kind !== 'text' || item.locked || !keys.has(`text:${item.id}`) || (item.align ?? 'left') === align) return item
    changed = true
    const { align: _old, ...rest } = item
    return align === 'left' ? rest : { ...rest, align }
  })
  return changed ? next : items
}
