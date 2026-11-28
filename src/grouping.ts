/**
 * Desktop grouping (Ctrl+G): a single-level, flat group is the optional saved number `group` on canvas items (shared by its members,
 * unique per page). It has no visual of its own; selecting any member selects every member (`expandToGroups`), so moving, copying,
 * deleting, aligning and the rest act on the whole group. Pure: nothing here touches the DOM or ids other than `group`.
 */
import { canvasItemKey, type CanvasItem } from './canvasModel'

type Groupable = Exclude<CanvasItem, { kind: 'opaque' }>

const groupOf = (item: CanvasItem): number | undefined => (item.kind !== 'opaque' && item.group !== undefined ? item.group : undefined)

/** The largest group number on the page (0 when there is none). */
export function maxGroupId(items: readonly CanvasItem[]): number {
  let max = 0
  for (const item of items) max = Math.max(max, groupOf(item) ?? 0)
  return max
}

/** `keys` plus every member of any group that one of them belongs to (locked members are never selected). Items without a group leave `keys` unchanged. */
export function expandToGroups(items: readonly CanvasItem[], keys: Iterable<string>): Set<string> {
  const result = new Set(keys)
  const touched = new Set<number>()
  for (const item of items) {
    const group = groupOf(item)
    if (group !== undefined && result.has(canvasItemKey(item))) touched.add(group)
  }
  if (touched.size === 0) return result
  for (const item of items) {
    const group = groupOf(item)
    if (group !== undefined && touched.has(group) && item.kind !== 'opaque' && item.locked !== true) result.add(canvasItemKey(item))
  }
  return result
}

/** Shift + click on a group member: removes the whole group when the item is selected, adds the whole group otherwise. */
export function toggleGroupKeys(items: readonly CanvasItem[], current: ReadonlySet<string>, key: string): Set<string> {
  const members = expandToGroups(items, [key])
  const next = new Set(current)
  if (current.has(key)) for (const member of members) next.delete(member)
  else for (const member of members) next.add(member)
  return next
}

const selectable = (item: CanvasItem, keys: ReadonlySet<string>): item is Groupable => item.kind !== 'opaque' && item.locked !== true && !(item.kind === 'stroke' && item.erase) && keys.has(canvasItemKey(item))

/** True when two or more selectable items are selected. */
export function canGroup(items: readonly CanvasItem[], keys: ReadonlySet<string>): boolean {
  return items.filter((item) => selectable(item, keys)).length >= 2
}

/** True when a selected item belongs to a group. */
export function canUngroup(items: readonly CanvasItem[], keys: ReadonlySet<string>): boolean {
  return items.some((item) => selectable(item, keys) && item.group !== undefined)
}

/** The selected items (and the whole of any group they touch) put in one new group; earlier groups among them are merged into it. Same array when fewer than two items qualify. */
export function groupItems(items: readonly CanvasItem[], keys: ReadonlySet<string>): CanvasItem[] {
  const all = expandToGroups(items, keys)
  if (items.filter((item) => selectable(item, all)).length < 2) return items as CanvasItem[]
  const id = maxGroupId(items) + 1
  return items.map((item) => (selectable(item, all) ? ({ ...item, group: id } as CanvasItem) : item))
}

/** The selected items (and the whole of any group they touch) without their group. Same array when none is grouped. */
export function ungroupItems(items: readonly CanvasItem[], keys: ReadonlySet<string>): CanvasItem[] {
  const all = expandToGroups(items, keys)
  if (!items.some((item) => selectable(item, all) && item.group !== undefined)) return items as CanvasItem[]
  return items.map((item) => {
    if (!selectable(item, all) || item.group === undefined) return item
    const { group: _group, ...rest } = item
    void _group
    return rest as CanvasItem
  })
}

/**
 * Fresh group numbers for pasted copies, so a copy is a group of its own and never joins the original: each distinct group in `pasted`
 * gets the next number after those on the page. A group with only one pasted member is dropped (nothing to hold together).
 */
export function remapGroupsForPaste(pasted: readonly CanvasItem[], existing: readonly CanvasItem[]): CanvasItem[] {
  const counts = new Map<number, number>()
  for (const item of pasted) {
    const group = groupOf(item)
    if (group !== undefined) counts.set(group, (counts.get(group) ?? 0) + 1)
  }
  if (counts.size === 0) return pasted as CanvasItem[]
  let next = maxGroupId(existing) + 1
  const fresh = new Map<number, number>()
  for (const [group, count] of counts) if (count > 1) fresh.set(group, next++)
  return pasted.map((item) => {
    const group = groupOf(item)
    if (group === undefined || item.kind === 'opaque') return item
    const mapped = fresh.get(group)
    if (mapped !== undefined) return { ...item, group: mapped } as CanvasItem
    const { group: _group, ...rest } = item
    void _group
    return rest as CanvasItem
  })
}

/**
 * The item whose style Copy style takes when the selection is exactly one group: its topmost shape (last in draw order) that is neither a
 * connector nor a text label, else the first member. Null when the keys are not exactly the members of a single group.
 */
export function groupStyleSource(items: readonly CanvasItem[], keys: ReadonlySet<string>): CanvasItem | null {
  const members = items.filter((item) => keys.has(canvasItemKey(item)))
  if (members.length < 2 || members.length !== keys.size) return null
  const group = groupOf(members[0])
  if (group === undefined || members.some((item) => groupOf(item) !== group)) return null
  if (items.some((item) => groupOf(item) === group && item.kind !== 'opaque' && item.locked !== true && !keys.has(canvasItemKey(item)))) return null
  const shapes = members.filter((item) => item.kind !== 'connector' && item.kind !== 'text')
  return shapes.length > 0 ? shapes[shapes.length - 1] : members[0]
}
