/**
 * Focus mode (view only): while presenting a design, everything except the selection and what is linked to it is drawn faded.
 * `focusSet` decides which items stay at full strength; the renderer fades the rest. Nothing is saved and nothing is an item. Pure.
 */
import { canvasItemKey, type CanvasItem } from './canvasModel'
import { labelsInside } from './diagramFlow'

/** Alpha of a faded item. */
export const FOCUS_FADE_ALPHA = 0.18

const groupOf = (item: CanvasItem): number | undefined => (item.kind !== 'opaque' && item.group !== undefined ? item.group : undefined)

/** Adds every member of any group a kept item belongs to (locked members too: this is only a look). */
function addGroupMates(items: readonly CanvasItem[], kept: Set<string>): void {
  const groups = new Set<number>()
  for (const item of items) {
    const group = groupOf(item)
    if (group !== undefined && kept.has(canvasItemKey(item))) groups.add(group)
  }
  if (groups.size === 0) return
  for (const item of items) {
    const group = groupOf(item)
    if (group !== undefined && groups.has(group)) kept.add(canvasItemKey(item))
  }
}

/**
 * Keys kept at full strength: the selected items, every connector attached to a selected box, the boxes at the other end of those
 * connectors (and both end boxes of a selected connector), the text labels inside any kept box, and the group mates of all of them.
 * Empty when nothing selected exists on the page. Everything not in the result is faded.
 */
export function focusSet(items: readonly CanvasItem[], selectedKeys: ReadonlySet<string>): Set<string> {
  const kept = new Set<string>()
  for (const item of items) if (selectedKeys.has(canvasItemKey(item))) kept.add(canvasItemKey(item))
  if (kept.size === 0) return kept
  addGroupMates(items, kept)
  const selectedBoxIds = new Set<number>()
  for (const item of items) if (item.kind === 'rectangle' && kept.has(canvasItemKey(item))) selectedBoxIds.add(item.id)
  for (const item of items) {
    if (item.kind !== 'connector') continue
    const ends = [item.startAttachment?.rectangleId, item.endAttachment?.rectangleId].filter((id): id is number => id !== undefined)
    if (kept.has(canvasItemKey(item)) || ends.some((id) => selectedBoxIds.has(id))) {
      kept.add(canvasItemKey(item))
      for (const id of ends) kept.add(`rectangle:${id}`)
    }
  }
  addGroupMates(items, kept)
  for (const key of labelsInside(items, kept)) kept.add(key)
  addGroupMates(items, kept)
  return kept
}

/** Drops from `kept` the keys of items no longer on the page; `null` (focus over) when none of them is left. The same set when unchanged. */
export function pruneFocus(items: readonly CanvasItem[], kept: ReadonlySet<string>): ReadonlySet<string> | null {
  const present = new Set(items.map(canvasItemKey))
  let any = false
  let lost = false
  for (const key of kept) { if (present.has(key)) any = true; else lost = true }
  if (!any) return null
  return lost ? new Set([...kept].filter((key) => present.has(key))) : kept
}

/**
 * The keys to draw faded: every item on the page outside `kept`, except eraser marks (they cut ink, so fading them would not erase).
 * Items added after focus started are in neither set, so ink drawn while focused is at full strength.
 */
export function fadedKeysOf(items: readonly CanvasItem[], kept: ReadonlySet<string>): Set<string> {
  const faded = new Set<string>()
  for (const item of items) {
    if (item.kind === 'stroke' && item.erase) continue
    const key = canvasItemKey(item)
    if (!kept.has(key)) faded.add(key)
  }
  return faded
}
