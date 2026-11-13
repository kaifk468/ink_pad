import type { TextFontId, TextObject } from './canvasModel'

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

export function measureTextSize(text: string, fontSize: number, measure?: TextMeasure): { width: number; height: number } {
  if (!measure) return estimateTextSize(text, fontSize)
  const lines = splitTextLines(text)
  return { width: Math.max(fontSize * 0.5, ...lines.map(measure)), height: lines.length * getTextLineHeight(fontSize) }
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
  const size = measureTextSize(item.text, item.fontSize, measure)
  return { ...item, fontFamily, width: size.width, height: size.height }
}

/** Same object with new text/size, re-measured. Position, id and color are kept. */
export function updateTextObject(item: TextObject, text: string, fontSize: number, measure?: TextMeasure): TextObject {
  const clean = normalizeText(text)
  const size = measureTextSize(clean, fontSize, measure)
  return { ...item, text: clean, fontSize, width: size.width, height: size.height }
}
