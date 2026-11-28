import { CanvasSnapshotHistory, canvasItemKey, isItemLocked, resizeRectangleItems, type CanvasItem, type RectangleObject, type TextObject } from './canvasModel'
import { fitClassBoxBounds, normalizeClassBoxContent, type FontMeasure } from './classBoxLayout'
import { cleanConnectorLabel, setConnectorLabel } from './connectorLabel'
import { contains, isFitShape, refitLabelToShape, type MeasureFor } from './textFit'
import { isBlankText, keepAlignAnchor, updateTextObject } from './textLayout'

export type ReplaceOptions = {
  /** Line measurer per size and font (the canvas's cached one); without it text is estimated, as in tests. */
  measureFor?: MeasureFor
  /** Class box font measurer. */
  fontMeasure?: FontMeasure
  /** Replace only in the item with this key. */
  only?: string
}

export type ReplaceResult = { items: CanvasItem[]; changedItems: number; replacements: number }

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Every case-insensitive, literal (never a pattern) occurrence of `query` replaced by `replacement` (literal too: `$&` stays `$&`). An empty query changes nothing. */
export function replaceInText(text: string, query: string, replacement: string): { text: string; count: number } {
  if (query.length === 0) return { text, count: 0 }
  let count = 0
  const next = text.replace(new RegExp(escapeRegExp(query), 'gi'), () => { count += 1; return replacement })
  return { text: next, count }
}

/** The topmost shape under the label centre that is a fit shape (a plain box or an HLD shape; class boxes and plain ink boxes do not auto-fit labels). */
function shapeUnder(items: readonly CanvasItem[], label: TextObject): RectangleObject | null {
  const anchor = { x: label.x + label.width / 2, y: label.y + label.height / 2 }
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item.kind === 'rectangle' && contains(item, anchor)) return isFitShape(item) ? item : null
  }
  return null
}

/**
 * Replaces the (trimmed, like Find) query in text labels, connector labels and class box name/attributes/methods. Code blocks,
 * locked items and opaque items are skipped. Labels are re-measured as the editor does (a centred label keeps its centre, a
 * label inside a shape is refitted, a label that becomes empty is removed); a connector label is cleaned (length cap, blank removes it);
 * a class box grows (never shrinks) to fit. Returns the same `items` array when nothing changed.
 */
export function replaceInItems(items: CanvasItem[], query: string, replacement: string, options: ReplaceOptions = {}): ReplaceResult {
  const needle = query.trim()
  if (!needle) return { items, changedItems: 0, replacements: 0 }
  const measureFor: MeasureFor = options.measureFor ?? (() => undefined)
  let changedItems = 0
  let replacements = 0
  const removed = new Set<number>()
  const grown: Array<{ id: number; bounds: { x: number; y: number; width: number; height: number } }> = []
  const mapped = items.map((item, index): CanvasItem => {
    if (isItemLocked(item) || (options.only !== undefined && canvasItemKey(item) !== options.only)) return item
    if (item.kind === 'text') {
      const result = replaceInText(item.text, needle, replacement)
      if (result.count === 0 || result.text === item.text) return item
      changedItems += 1
      replacements += result.count
      if (isBlankText(result.text)) { removed.add(index); return item }
      const updated = keepAlignAnchor(item, updateTextObject(item, result.text, item.fontSize, measureFor(item.fontSize, item.fontFamily)))
      const shape = shapeUnder(items, item)
      return shape ? refitLabelToShape(updated, shape, measureFor) : updated
    }
    if (item.kind === 'connector') {
      if (!item.label) return item
      const result = replaceInText(item.label, needle, replacement)
      if (result.count === 0 || cleanConnectorLabel(result.text) === item.label) return item
      changedItems += 1
      replacements += result.count
      return setConnectorLabel([item], item.id, result.text)[0]
    }
    if (item.kind === 'rectangle' && item.classBox) {
      const name = replaceInText(item.classBox.name, needle, replacement)
      const attributes = replaceInText(item.classBox.attributes, needle, replacement)
      const methods = replaceInText(item.classBox.methods, needle, replacement)
      const count = name.count + attributes.count + methods.count
      if (count === 0) return item
      const content = normalizeClassBoxContent({ name: name.text, attributes: attributes.text, methods: methods.text })
      if (content.name === item.classBox.name && content.attributes === item.classBox.attributes && content.methods === item.classBox.methods) return item
      changedItems += 1
      replacements += count
      const bounds = fitClassBoxBounds(item, content, options.fontMeasure)
      if (bounds.width !== item.width || bounds.height !== item.height) grown.push({ id: item.id, bounds })
      return { ...item, classBox: content }
    }
    return item
  })
  if (changedItems === 0) return { items, changedItems: 0, replacements: 0 }
  let next = removed.size > 0 ? mapped.filter((_, index) => !removed.has(index)) : mapped
  // Growing a box moves the endpoints of attached connectors with it, as resizing it does.
  for (const { id, bounds } of grown) next = resizeRectangleItems(next, id, bounds)
  return { items: next, changedItems, replacements }
}

/** Replaces in one item only (`key` as canvasItemKey gives it). */
export function replaceOne(items: CanvasItem[], key: string, query: string, replacement: string, options: Omit<ReplaceOptions, 'only'> = {}): ReplaceResult {
  return replaceInItems(items, query, replacement, { ...options, only: key })
}

export type PageSlot = { items: CanvasItem[]; history: CanvasSnapshotHistory | null }
export type PagesReplaceResult = { currentItems: CanvasItem[]; changedItems: number; replacements: number; pagesChanged: number }

/**
 * Replaces on every page (or only `only.key` on `only.pageIndex`). Each changed page gets exactly one undo step on its own history.
 * Other pages are changed in place in `pages` (their slot gets the new items and a history with the old items recorded); the
 * current page is not touched: its new items come back in `currentItems` (the same array when unchanged) for the caller's own
 * history path, since the live history belongs to the caller.
 */
export function replaceAcrossPages(
  pages: PageSlot[],
  currentIndex: number,
  currentItems: CanvasItem[],
  query: string,
  replacement: string,
  options: Omit<ReplaceOptions, 'only'> & { only?: { pageIndex: number; key: string } } = {},
): PagesReplaceResult {
  const { only, ...rest } = options
  let changedItems = 0
  let replacements = 0
  let pagesChanged = 0
  let nextCurrent = currentItems
  pages.forEach((slot, pageIndex) => {
    if (only && only.pageIndex !== pageIndex) return
    const source = pageIndex === currentIndex ? currentItems : slot.items
    const result = replaceInItems(source, query, replacement, only ? { ...rest, only: only.key } : rest)
    if (result.items === source) return
    changedItems += result.changedItems
    replacements += result.replacements
    pagesChanged += 1
    if (pageIndex === currentIndex) { nextCurrent = result.items; return }
    const history = slot.history ?? new CanvasSnapshotHistory()
    history.record(slot.items)
    slot.history = history
    slot.items = result.items
  })
  return { currentItems: nextCurrent, changedItems, replacements, pagesChanged }
}

/** The toast after a replace. */
export function replaceToast(replacements: number, changedItems: number): string {
  if (replacements === 0) return 'Nothing to replace'
  return `Replaced ${replacements} in ${changedItems} ${changedItems === 1 ? 'item' : 'items'}`
}
