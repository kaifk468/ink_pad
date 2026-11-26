/**
 * Move selection to another page (pure rules). The selected items leave one page and join the end of another at the same canvas
 * coordinates; nothing is ever dropped: every moved item is on exactly one of the two pages afterwards. Locked and opaque items stay.
 * Connectors: one with both ends on moved boxes moves along (selected or not); every other connector keeps its line but loses the
 * attachment to a box that is now on the other page, so its end stays where it was drawn. Ids that the target page already uses (they
 * should not occur, ids are global across pages) are renumbered from the shared counters; group numbers are per page and are
 * renumbered when the target already has that number.
 */
import { canvasItemKey, type CanvasItem, type ConnectorObject } from './canvasModel'
import type { IdCounters } from './clipboard'
import { maxGroupId } from './grouping'

export type MoveResult = {
  /** The source page without the moved items (staying connectors detached from moved boxes). Unchanged items keep their identity. */
  source: CanvasItem[]
  /** The target page with the moved items on top, in their original order. */
  target: CanvasItem[]
  /** Keys of the moved items as they are on the target page (to select them). */
  movedKeys: string[]
  moved: number
  /** Selected locked items that stayed behind. */
  lockedSkipped: number
  /** Connectors (left behind or moved) that lost an attachment to a box on the other page. */
  detached: number
  counters: IdCounters
}

/** The connector without the attachments whose box `gone` reports; the same object when none. Its derived route is dropped so it is recomputed from the free end, which stays at the stored point. */
function detachConnector(connector: ConnectorObject, gone: (rectangleId: number) => boolean): ConnectorObject {
  const dropStart = connector.startAttachment !== undefined && gone(connector.startAttachment.rectangleId)
  const dropEnd = connector.endAttachment !== undefined && gone(connector.endAttachment.rectangleId)
  if (!dropStart && !dropEnd) return connector
  const { startAttachment, endAttachment, routedPath: _routed, ...rest } = connector
  void _routed
  return { ...rest, ...(startAttachment && !dropStart ? { startAttachment } : {}), ...(endAttachment && !dropEnd ? { endAttachment } : {}) }
}

const movable = (item: CanvasItem): boolean => item.kind !== 'opaque' && item.locked !== true

export function moveSelectionToPage(source: readonly CanvasItem[], target: readonly CanvasItem[], keys: ReadonlySet<string>, counters: IdCounters): MoveResult | null {
  const selected = source.filter((item) => keys.has(canvasItemKey(item)))
  const lockedSkipped = selected.filter((item) => !movable(item)).length
  const movedRects = new Set<number>()
  for (const item of selected) if (item.kind === 'rectangle' && movable(item)) movedRects.add(item.id)
  const moving = new Set<CanvasItem>()
  for (const item of selected) if (movable(item)) moving.add(item)
  // A connector between two moved boxes goes with them even when it was not selected.
  for (const item of source) {
    if (item.kind !== 'connector' || moving.has(item) || !movable(item)) continue
    if (item.startAttachment && item.endAttachment && movedRects.has(item.startAttachment.rectangleId) && movedRects.has(item.endAttachment.rectangleId)) moving.add(item)
  }
  if (moving.size === 0) return null

  let detached = 0
  const remaining: CanvasItem[] = []
  const movedSource: CanvasItem[] = []
  for (const item of source) {
    if (moving.has(item)) { movedSource.push(item); continue }
    if (item.kind === 'connector') {
      const kept = detachConnector(item, (id) => movedRects.has(id))
      if (kept !== item) detached += 1
      remaining.push(kept)
    } else remaining.push(item)
  }

  // Fresh ids only where the target page already uses the id (never expected: ids are global across pages).
  const next = { ...counters }
  const used = new Set(target.filter((item) => item.kind !== 'opaque').map(canvasItemKey))
  const rectangleMap = new Map<number, number>()
  const allocate = (kind: Exclude<CanvasItem['kind'], 'opaque'>): number => {
    const field = kind === 'rectangle' ? 'rectangle' : kind === 'connector' ? 'connector' : kind === 'stroke' ? 'stroke' : 'text'
    let id = next[field]++
    while (used.has(`${kind}:${id}`)) id = next[field]++
    return id
  }
  const targetGroups = new Set<number>()
  for (const item of target) if (item.kind !== 'opaque' && item.group !== undefined) targetGroups.add(item.group)
  const groupMap = new Map<number, number>()
  let nextGroup = maxGroupId(target) + 1
  const renumbered = movedSource.map((item): CanvasItem => {
    if (item.kind === 'opaque') return item
    let result: CanvasItem = item
    if (item.group !== undefined && targetGroups.has(item.group)) {
      if (!groupMap.has(item.group)) groupMap.set(item.group, nextGroup++)
      result = { ...item, group: groupMap.get(item.group) } as CanvasItem
    }
    if (used.has(canvasItemKey(item))) {
      const id = allocate(item.kind)
      if (item.kind === 'rectangle') rectangleMap.set(item.id, id)
      result = { ...result, id } as CanvasItem
    }
    if (result.kind !== 'opaque') used.add(canvasItemKey(result))
    return result
  })
  const placed = renumbered.map((item): CanvasItem => {
    if (item.kind !== 'connector') return item
    let connector = detachConnector(item, (id) => !movedRects.has(id))
    if (connector !== item) detached += 1
    if (rectangleMap.size > 0) {
      const remap = (attachment: ConnectorObject['startAttachment']) => (attachment && rectangleMap.has(attachment.rectangleId) ? { ...attachment, rectangleId: rectangleMap.get(attachment.rectangleId) as number } : attachment)
      const startAttachment = remap(connector.startAttachment)
      const endAttachment = remap(connector.endAttachment)
      if (startAttachment !== connector.startAttachment || endAttachment !== connector.endAttachment) {
        const { startAttachment: _s, endAttachment: _e, ...rest } = connector
        void _s; void _e
        connector = { ...rest, ...(startAttachment ? { startAttachment } : {}), ...(endAttachment ? { endAttachment } : {}) }
      }
    }
    return connector
  })
  return {
    source: remaining,
    target: [...target, ...placed],
    movedKeys: placed.map(canvasItemKey),
    moved: placed.length,
    lockedSkipped,
    detached,
    counters: next,
  }
}

/** "Moved 5 items to page 2" (the page name added when it has one). */
export function movedToast(count: number, pageIndex: number, name?: string, lockedSkipped = 0): string {
  const where = name ? `page ${pageIndex + 1} (${name})` : `page ${pageIndex + 1}`
  return `Moved ${count} ${count === 1 ? 'item' : 'items'} to ${where}${lockedSkipped > 0 ? `; ${lockedSkipped} locked stayed` : ''}`
}

export type MoveTarget = number | 'new'

/** Palette rows: one per other page ("Move selection to page: 2 — API"), plus the new page row when another page fits. */
export function movePaletteEntries(names: readonly string[], currentIndex: number, canAddPage: boolean): Array<{ id: string; label: string; target: MoveTarget }> {
  const rows: Array<{ id: string; label: string; target: MoveTarget }> = []
  names.forEach((name, index) => {
    if (index === currentIndex) return
    rows.push({ id: `page:move:${index}`, label: `Move selection to page: ${index + 1}${name ? ` — ${name}` : ''}`, target: index })
  })
  if (canAddPage) rows.push({ id: 'page:move:new', label: 'Move selection to new page', target: 'new' })
  return rows
}

/** Chips of the right-click menu: the other pages (at most `limit`), then a new page. Actions are `movePage:<index>` and `movePage:new`. */
export function moveMenuChips(names: readonly string[], currentIndex: number, canAddPage: boolean, limit = 10): Array<{ action: `movePage:${string}`; chip: string; label: string }> {
  const chips: Array<{ action: `movePage:${string}`; chip: string; label: string }> = []
  for (let index = 0; index < names.length && chips.length < limit; index += 1) {
    if (index === currentIndex) continue
    chips.push({ action: `movePage:${index}`, chip: String(index + 1), label: `Move to page ${index + 1}${names[index] ? ` — ${names[index]}` : ''}` })
  }
  if (canAddPage) chips.push({ action: 'movePage:new', chip: 'New', label: 'Move to a new page' })
  return chips
}

/** Parses a `movePage:` action: a page index, 'new', or null. */
export function parseMoveAction(action: string): MoveTarget | null {
  if (!action.startsWith('movePage:')) return null
  const rest = action.slice('movePage:'.length)
  if (rest === 'new') return 'new'
  const index = Number(rest)
  return Number.isInteger(index) && index >= 0 ? index : null
}

/** What the toast Undo needs to put both pages back exactly (items and undo history of each). */
export type MoveRecord = {
  sourceIndex: number
  targetIndex: number
  newPage: boolean
  /** Number of pages right after the move. */
  pageCount: number
  beforeSource: CanvasItem[]
  beforeTarget: CanvasItem[]
  afterSource: CanvasItem[]
  afterTarget: CanvasItem[]
  /** Lengths right after the move: a label committed later is pushed into the same array, so identity alone cannot tell. */
  afterSourceLength: number
  afterTargetLength: number
  sourceHistory: { undo: CanvasItem[][]; redo: CanvasItem[][] }
  targetHistory: { undo: CanvasItem[][]; redo: CanvasItem[][] }
  selection: string[]
}

/** The toast Undo is only safe while both pages are exactly as the move left them (same arrays, same page count). `pageItems` is the live items of every page. */
export function moveRecordUndoable(record: MoveRecord, pageItems: ReadonlyArray<readonly CanvasItem[]>): boolean {
  return pageItems.length === record.pageCount && pageItems[record.sourceIndex] === record.afterSource && pageItems[record.targetIndex] === record.afterTarget && record.afterSource.length === record.afterSourceLength && record.afterTarget.length === record.afterTargetLength
}
