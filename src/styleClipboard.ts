import { canvasItemKey, getConnectorRenderSpec, hasLineDash, hasOutlineWidth, isItemLocked, recolorItems, restrokeItems, setArrowheads, setLineDash, setSelectedArrowsTwoWay, strokeArrowheads } from './canvasModel'
import type { Arrowheads, CanvasItem, LineDash, TextFontId } from './canvasModel'
import { setFillColor } from './shapeFill'
import { isFillableRectangle } from './sketchy'
import { changeTextFont, LEGACY_TEXT_FONT, updateTextObject } from './textLayout'
import type { TextMeasure } from './textLayout'

/**
 * Copy style / Paste style (Desktop): the look of one item, kept in memory only. Every field is optional; a missing field means
 * the source had no such property, so pasting leaves that property alone. Meaning (connector relationship, text content, size and position) is never part of a style.
 * `fill: null` means "no fill" (a fillable shape without one) and clears the fill on paste.
 */
export type StyleSnapshot = {
  color?: string
  width?: number
  /** 'solid' clears the dash. */
  dash?: LineDash | 'solid'
  fill?: string | null
  arrowheads?: Arrowheads
  /** Connector arrow ends: both ends (true) or one (false). Applies only to directed associations; only captured from one. */
  twoWay?: boolean
  fontSize?: number
  fontFamily?: TextFontId
}

/** The style of one item, or null when it has none to copy (code blocks, eraser strokes, unknown items). */
export function captureStyle(item: CanvasItem): StyleSnapshot | null {
  switch (item.kind) {
    case 'stroke': {
      if (item.erase) return null
      const style: StyleSnapshot = { color: item.color, width: item.width }
      if (hasLineDash(item)) style.dash = item.dash ?? 'solid'
      if (item.shape === 'arrow' || item.shape === 'line') style.arrowheads = strokeArrowheads(item)
      return style
    }
    case 'rectangle': {
      const style: StyleSnapshot = { color: item.strokeColor }
      if (hasOutlineWidth(item)) style.width = item.strokeWidth
      if (hasLineDash(item)) style.dash = item.dash ?? 'solid'
      if (isFillableRectangle(item)) style.fill = item.fillColor ?? null
      return style
    }
    case 'connector':
      return { color: item.strokeColor, width: item.strokeWidth, dash: item.dash ?? (getConnectorRenderSpec(item).lineStyle === 'dashed' ? 'dashed' : 'solid'), ...(item.relationshipType === 'directed-association' ? { twoWay: item.twoWay === true } : {}) }
    case 'text':
      return { color: item.color, fontSize: item.fontSize, fontFamily: item.fontFamily ?? LEGACY_TEXT_FONT }
    default:
      return null
  }
}

export type ApplyStyleOptions = { measureFor?: (fontSize: number, fontId?: TextFontId) => TextMeasure | undefined }

/**
 * Items with `style` applied to the selected ones, only the properties each item can take (the model helpers decide). Locked items, eraser strokes,
 * code blocks and unknown items are untouched. Returns the same array when nothing changes.
 */
export function applyStyle(items: CanvasItem[], keys: ReadonlySet<string>, style: StyleSnapshot, options: ApplyStyleOptions = {}): CanvasItem[] {
  const target = new Set<string>()
  for (const item of items) {
    const key = canvasItemKey(item)
    if (keys.has(key) && !isItemLocked(item) && item.kind !== 'opaque' && !(item.kind === 'stroke' && item.erase)) target.add(key)
  }
  if (target.size === 0) return items
  let next = items
  if (style.color !== undefined) next = recolorItems(next, target, style.color)
  if (style.width !== undefined) next = restrokeItems(next, target, style.width)
  if (style.dash !== undefined) next = setLineDash(next, target, style.dash === 'solid' ? null : style.dash)
  if (style.fill !== undefined) next = setFillColor(next, target, style.fill)
  if (style.arrowheads !== undefined) next = setArrowheads(next, target, style.arrowheads)
  if (style.twoWay !== undefined) next = setSelectedArrowsTwoWay(next, target, style.twoWay)
  if (style.fontSize !== undefined || style.fontFamily !== undefined) next = applyTextStyle(next, target, style, options)
  return next
}

function applyTextStyle(items: CanvasItem[], target: ReadonlySet<string>, style: StyleSnapshot, options: ApplyStyleOptions): CanvasItem[] {
  let changed = false
  const result = items.map((item): CanvasItem => {
    if (item.kind !== 'text' || !target.has(canvasItemKey(item))) return item
    let updated = item
    const measureFor = options.measureFor
    if (style.fontFamily !== undefined && (item.fontFamily ?? LEGACY_TEXT_FONT) !== style.fontFamily) {
      updated = changeTextFont(updated, style.fontFamily, measureFor?.(updated.fontSize, style.fontFamily))
    }
    if (style.fontSize !== undefined && updated.fontSize !== style.fontSize) {
      // A picked size switches auto-fit off for that label, as the size control does.
      updated = { ...updateTextObject(updated, updated.text, style.fontSize, measureFor?.(style.fontSize, updated.fontFamily)), fit: 'off' as const }
    }
    if (updated !== item) changed = true
    return updated
  })
  return changed ? result : items
}
