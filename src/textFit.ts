import { toItemFrame } from './canvasModel'
import type { CanvasItem, RectangleObject, TextFontId, TextObject } from './canvasModel'
import { getTextLineHeight, measureTextSize, updateTextObject, wrapTextLines, type TextMeasure } from './textLayout'

/**
 * Desktop auto-fit: a label typed inside a box, diamond, ellipse, database, queue or service shrinks step by step to
 * fit the shape's usable inner area, down to FIT_MIN_SIZE; below that it wraps to the inner width. Pure functions, no
 * DOM: the caller supplies a (cached) measure and only calls this while a label is being typed.
 */
export const FIT_MIN_SIZE = 10
/** Each shrink step; sizes go picked, picked-2, ... and finally the minimum. */
export const FIT_STEP = 2
/** Space kept between the text and the outline of a plain box. */
const PAD = 10

export type FitArea = { width: number; height: number }
export type FitResult = { fontSize: number; width: number; height: number; wrap: boolean }
export type MeasureFor = (fontSize: number, fontId?: TextFontId) => TextMeasure | undefined

/** The part of a shape text may use, as a width and height. Diamond and ellipse use the inscribed rectangle. */
export function shapeInnerArea(shape: RectangleObject): FitArea {
  const { width: w, height: h } = shape
  let area: FitArea
  if (shape.diamond) area = { width: w / 2, height: h / 2 }
  else if (shape.ellipse) area = { width: w / Math.SQRT2, height: h / Math.SQRT2 }
  else if (shape.hldShape === 'database') {
    const ry = Math.max(6, Math.min(h * 0.16, 34, h / 3))
    area = { width: w, height: h - 3 * ry }
  } else if (shape.hldShape === 'queue') {
    const cap = Math.max(20, Math.min(w * 0.13, 56))
    area = { width: w - 2 * cap, height: h }
  } else if (shape.hldShape === 'service') {
    const inset = Math.min(Math.min(w, h) * 0.28, 44) * 0.3
    area = { width: w - 2 * inset, height: h - 2 * inset }
  } else area = { width: w, height: h }
  return { width: Math.max(0, area.width - PAD * 2), height: Math.max(0, area.height - PAD * 2) }
}

function isFitShape(item: CanvasItem): item is RectangleObject {
  if (item.kind !== 'rectangle' || item.classBox) return false
  if (item.hldShape) return !!item.inkBox
  return !item.inkBox
}

function contains(shape: RectangleObject, point: { x: number; y: number }): boolean {
  const local = toItemFrame(shape, { ...point, pressure: 1 })
  const w = shape.width
  const h = shape.height
  if (w <= 0 || h <= 0) return false
  if (local.x < shape.x || local.x > shape.x + w || local.y < shape.y || local.y > shape.y + h) return false
  const dx = (local.x - (shape.x + w / 2)) / (w / 2)
  const dy = (local.y - (shape.y + h / 2)) / (h / 2)
  if (shape.diamond) return Math.abs(dx) + Math.abs(dy) <= 1
  if (shape.ellipse) return dx * dx + dy * dy <= 1
  return true
}

/** Inner area of the topmost fit-capable shape containing the label anchor, or null (plain canvas, class boxes, ink class boxes). */
export function findFitArea(items: readonly CanvasItem[], anchor: { x: number; y: number }): FitArea | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item.kind === 'rectangle' && contains(item, anchor)) {
      // The topmost shape wins, even a class box: a label on a class box is not auto-fitted into the shape under it.
      return isFitShape(item) ? shapeInnerArea(item) : null
    }
  }
  return null
}

/**
 * The largest size from `pickedSize` down (never above it) at which the text fits `area`; at the minimum size that still
 * overflows the width, the text is word-wrapped to the area width.
 */
export function fitText(text: string, pickedSize: number, area: FitArea, fontId: TextFontId | undefined, measureFor: MeasureFor): FitResult {
  const start = Math.max(FIT_MIN_SIZE, pickedSize)
  let size = start
  for (;;) {
    const box = measureTextSize(text, size, measureFor(size, fontId))
    if (box.width <= area.width && box.height <= area.height) return { fontSize: size, width: box.width, height: box.height, wrap: false }
    if (size <= FIT_MIN_SIZE) {
      if (box.width <= area.width) return { fontSize: size, width: box.width, height: box.height, wrap: false }
      const lines = wrapTextLines(text, area.width, measureFor(size, fontId) ?? ((line) => measureTextSize(line, size).width))
      return { fontSize: size, width: area.width, height: lines.length * getTextLineHeight(size), wrap: true }
    }
    size = Math.max(FIT_MIN_SIZE, size - FIT_STEP)
  }
}

/** The editing state auto-fit needs (kept inside the text editor state). */
export type FitEditorState = {
  itemId: number | null
  x: number
  y: number
  fontSize: number
  fontFamily?: TextFontId
  initialText: string
  /** Inner area of the shape the label sits in; missing = plain canvas, no auto-fit. */
  fitArea?: FitArea
  /** The size auto-fit starts from and never grows above. */
  pickedSize?: number
  /** A size was picked by hand for this label: no auto-fit until turned back on. */
  fitOff?: boolean
}

/** Fills in the auto-fit fields when a (Desktop) editor opens: where the label sits and whether it has auto-fit turned off. */
export function prepareEditorFit<T extends FitEditorState>(editor: T, items: readonly CanvasItem[], desktop: boolean): T {
  const existing = editor.itemId === null ? null : items.find((item): item is TextObject => item.kind === 'text' && item.id === editor.itemId) ?? null
  const anchor = existing
    ? { x: existing.x + existing.width / 2, y: existing.y + existing.height / 2 }
    : { x: editor.x, y: editor.y + editor.fontSize * 0.65 }
  const area = desktop ? findFitArea(items, anchor) : null
  return { ...editor, pickedSize: editor.fontSize, ...(area ? { fitArea: area } : {}), ...(existing?.fit === 'off' ? { fitOff: true } : {}) }
}

/** The fit for the text typed so far, or null when auto-fit does not apply (tablet, plain canvas, turned off, nothing typed yet in an old label). */
export function editorFit(editor: FitEditorState, value: string, measureFor: MeasureFor): FitResult | null {
  if (!editor.fitArea || editor.fitOff) return null
  if (editor.itemId !== null && value === editor.initialText) return null
  if (value.trim().length === 0) return null
  return fitText(value, editor.pickedSize ?? editor.fontSize, editor.fitArea, editor.fontFamily, measureFor)
}

/**
 * The label to save after editing: `base` with the typed text, at the auto-fitted size (and wrapped to the shape width when
 * it is at the minimum size and still too wide), or at the editor's size with `fit: 'off'` when a size was picked by hand.
 * Without auto-fit it is just the label re-measured, so plain-canvas and tablet labels are unchanged.
 */
export function buildEditedLabel(base: TextObject, value: string, editor: FitEditorState, measureFor: MeasureFor): TextObject {
  const { fit: _old, ...plain } = base
  void _old
  const fit = editorFit(editor, value, measureFor)
  // Opened and closed without a change: a wrapped label stays exactly as it was (re-measuring would un-wrap it).
  if (!fit && base.fit === 'wrap' && !editor.fitOff && value === base.text && editor.fontSize === base.fontSize) return base
  const size = fit ? fit.fontSize : editor.fontSize
  const updated = updateTextObject(plain, value, size, measureFor(size, editor.fontFamily))
  if (fit) return { ...updated, width: fit.width, height: fit.height, ...(fit.wrap ? { fit: 'wrap' as const } : {}) }
  return editor.fitOff ? { ...updated, fit: 'off' as const } : updated
}
