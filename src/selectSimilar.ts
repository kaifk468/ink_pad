/**
 * Select similar (desktop right-click): the keys of every unlocked item on the page that is the same kind of thing as the given one.
 * Only the similar members are returned (groups are not expanded). Pure: nothing here touches the DOM.
 */
import { canvasItemKey, type CanvasItem } from './canvasModel'

/** What "the same" means for an item: rectangles by shape variant, strokes by shape, other kinds by kind. Null for items that cannot be selected this way. */
export function similarityClass(item: CanvasItem): string | null {
  if (item.kind === 'opaque' || item.locked === true) return null
  switch (item.kind) {
    case 'rectangle':
      return item.inkBox ? 'rectangle:ink' : item.classBox ? 'rectangle:class' : item.hldShape ? `rectangle:hld:${item.hldShape}` : item.diamond ? 'rectangle:diamond' : item.ellipse ? 'rectangle:ellipse' : 'rectangle:plain'
    case 'stroke':
      return item.erase ? null : `stroke:${item.shape ?? 'freehand'}`
    default:
      return item.kind
  }
}

/** Keys of the unlocked items of the same class as the item with `key` (including that item); empty when it is missing, locked or not selectable by class. */
export function similarItemKeys(items: readonly CanvasItem[], key: string): string[] {
  const source = items.find((item) => canvasItemKey(item) === key)
  const cls = source ? similarityClass(source) : null
  if (cls === null) return []
  return items.filter((item) => similarityClass(item) === cls).map(canvasItemKey)
}
