import { canvasItemKey, getConnectorRenderSpec, translateInkBox } from './canvasModel'
import type { CanvasItem, ConnectorObject, RectangleObject } from './canvasModel'
import { reattachConnectorSides } from './connectorRoute'
import { WORKSPACE_BOUNDS } from './viewport'

/**
 * Tidy: arranges class boxes (typed class boxes, ink class boxes and HLD shapes) in layers by what their connectors say.
 *
 * - A box that a hierarchy connector points to (the hollow triangle of Inheritance / Realization, the diamond of
 *   Aggregation / Composition) goes above the box at the other end.
 * - Other connectors do not force a layer: two boxes drawn side by side stay side by side, a box drawn clearly above
 *   another stays above it. So Tidy cleans up the rough sketch instead of inventing a new one.
 * - Connected boxes are one group; groups are laid out separately and packed in rows, nothing overlaps.
 * - The result keeps the top-left corner of the arranged boxes where it was (kept inside the workspace).
 * - Plain rectangles, text labels, ink and free connectors are left alone. Connectors attached to a moved box follow it
 *   and pick the best sides of their boxes.
 *
 * The layout itself (`layoutBoxes`) is a pure function of rectangles and edges; `tidyItems` applies it to canvas items.
 */

export const TIDY_H_GAP = 120
export const TIDY_V_GAP = 150
export const TIDY_BLOCK_GAP = 180
const TIDY_MIN_ROW_WIDTH = 1800
const ORDER_SWEEPS = 4
const PLACE_SWEEPS = 4

export type TidyNode = { id: number; x: number; y: number; width: number; height: number }
/** A link between two boxes. `upper` names the box that belongs above when the relationship says so (a parent / whole). */
export type TidyEdge = { a: number; b: number; upper?: number }
type Position = { x: number; y: number }
type Block = { positions: Map<number, Position>; width: number; height: number; centerX: number; centerY: number }

const centerX = (node: TidyNode) => node.x + node.width / 2
const centerY = (node: TidyNode) => node.y + node.height / 2
const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length

/**
 * Least-squares row placement: boxes keep their order and at least TIDY_H_GAP between them, and each box gets as close as
 * possible to its wanted centre (pool adjacent violators on the gap-adjusted positions). Returns the centres.
 */
function placeRow(widths: number[], wanted: number[]): number[] {
  const offsets: number[] = []
  let total = 0
  for (const width of widths) {
    offsets.push(total)
    total += width + TIDY_H_GAP
  }
  const blocks: Array<{ sum: number; count: number }> = []
  wanted.forEach((center, index) => {
    blocks.push({ sum: center - widths[index] / 2 - offsets[index], count: 1 })
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1]
      const before = blocks[blocks.length - 2]
      if (before.sum / before.count <= last.sum / last.count) break
      blocks.splice(blocks.length - 2, 2, { sum: before.sum + last.sum, count: before.count + last.count })
    }
  })
  const centers: number[] = []
  for (const block of blocks) for (let step = 0; step < block.count; step += 1) centers.push(block.sum / block.count + offsets[centers.length] + widths[centers.length] / 2)
  return centers
}

function layoutBlock(nodes: TidyNode[], edges: TidyEdge[]): Block {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const sorted = nodes.slice().sort((a, b) => centerY(a) - centerY(b) || centerX(a) - centerX(b) || a.id - b.id)

  // Which edges force a layer (directed: from the upper box to the lower one) and which only pull boxes together.
  const directed: Array<[number, number]> = []
  const lateral: Array<[number, number]> = []
  for (const edge of edges) {
    const first = byId.get(edge.a)!
    const second = byId.get(edge.b)!
    let upper: number | null = null
    if (edge.upper !== undefined) upper = edge.upper
    else {
      const overlap = Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y)
      if (overlap < 0.5 * Math.min(first.height, second.height)) upper = centerY(first) <= centerY(second) ? first.id : second.id
    }
    if (upper === null) lateral.push([edge.a, edge.b])
    else directed.push(upper === edge.a ? [edge.a, edge.b] : [edge.b, edge.a])
  }

  // Break cycles: an edge that points back to a box still being visited stops forcing a layer.
  const outgoing = new Map<number, number[]>()
  for (const [from, to] of directed) outgoing.set(from, [...(outgoing.get(from) ?? []), to])
  const state = new Map<number, 1 | 2>()
  const kept: Array<[number, number]> = []
  const visit = (id: number) => {
    state.set(id, 1)
    for (const child of outgoing.get(id) ?? []) {
      if (state.get(child) === 1) { lateral.push([id, child]); continue }
      kept.push([id, child])
      if (!state.has(child)) visit(child)
    }
    state.set(id, 2)
  }
  for (const node of sorted) if (!state.has(node.id)) visit(node.id)

  // Layers: below all parents; a box with children but no parent sits just above its highest child.
  const parents = new Map<number, number[]>()
  const children = new Map<number, number[]>()
  for (const [from, to] of kept) {
    parents.set(to, [...(parents.get(to) ?? []), from])
    children.set(from, [...(children.get(from) ?? []), to])
  }
  const layerOf = new Map<number, number>()
  const depth = (id: number): number => {
    const known = layerOf.get(id)
    if (known !== undefined) return known
    const above = parents.get(id)
    const value = above ? 1 + Math.max(...above.map(depth)) : 0
    layerOf.set(id, value)
    return value
  }
  const linked = new Set<number>()
  for (const [from, to] of kept) { linked.add(from); linked.add(to) }
  for (const id of linked) depth(id)
  for (const id of linked) {
    if (parents.has(id)) continue
    layerOf.set(id, Math.min(...children.get(id)!.map((child) => layerOf.get(child)!)) - 1)
  }
  // Boxes with only side-by-side links join the layer of the box they are linked to.
  const neighbours = new Map<number, number[]>()
  const link = (a: number, b: number) => {
    neighbours.set(a, [...(neighbours.get(a) ?? []), b])
    neighbours.set(b, [...(neighbours.get(b) ?? []), a])
  }
  for (const [a, b] of kept) link(a, b)
  for (const [a, b] of lateral) link(a, b)
  const queue = [...linked]
  for (let index = 0; index < queue.length; index += 1) {
    for (const next of neighbours.get(queue[index]) ?? []) {
      if (layerOf.has(next)) continue
      layerOf.set(next, layerOf.get(queue[index])!)
      queue.push(next)
    }
  }
  for (const node of sorted) if (!layerOf.has(node.id)) layerOf.set(node.id, 0)
  const distinct = [...new Set(layerOf.values())].sort((a, b) => a - b)
  const layerIndex = new Map<number, number>()
  for (const [id, layer] of layerOf) layerIndex.set(id, distinct.indexOf(layer))

  // Order inside each layer: start from the current left-to-right order, then barycentre sweeps to cut crossings.
  const rows: number[][] = distinct.map(() => [])
  for (const node of sorted.slice().sort((a, b) => centerX(a) - centerX(b) || a.id - b.id)) rows[layerIndex.get(node.id)!].push(node.id)
  const rank = new Map<number, number>()
  const updateRanks = (row: number[]) => row.forEach((id, index) => rank.set(id, row.length === 1 ? 0.5 : index / (row.length - 1)))
  rows.forEach(updateRanks)
  const sweepOrder = (row: number[], rowIndex: number, direction: -1 | 1) => {
    const wanted = new Map<number, number>()
    for (const id of row) {
      const near = (neighbours.get(id) ?? []).filter((other) => {
        const otherRow = layerIndex.get(other)!
        return otherRow === rowIndex || (direction === -1 ? otherRow < rowIndex : otherRow > rowIndex)
      })
      wanted.set(id, near.length ? mean(near.map((other) => rank.get(other)!)) : rank.get(id)!)
    }
    row.sort((a, b) => wanted.get(a)! - wanted.get(b)!)
    updateRanks(row)
  }
  for (let sweep = 0; sweep < ORDER_SWEEPS; sweep += 1) {
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) sweepOrder(rows[rowIndex], rowIndex, -1)
    for (let rowIndex = rows.length - 2; rowIndex >= 0; rowIndex -= 1) sweepOrder(rows[rowIndex], rowIndex, 1)
  }

  // Horizontal position: rows start centred, then each box is pulled towards the boxes it is linked to in the layers above
  // (going down) and below (going up), keeping order and gaps.
  const center = new Map<number, number>()
  for (const row of rows) {
    const widths = row.map((id) => byId.get(id)!.width)
    const placed = placeRow(widths, row.map(() => 0))
    row.forEach((id, index) => center.set(id, placed[index]))
  }
  const settle = (rowIndex: number, direction: -1 | 1) => {
    const row = rows[rowIndex]
    const wanted = row.map((id) => {
      const near = (neighbours.get(id) ?? []).filter((other) => (direction === -1 ? layerIndex.get(other)! < rowIndex : layerIndex.get(other)! > rowIndex))
      return near.length ? mean(near.map((other) => center.get(other)!)) : center.get(id)!
    })
    const placed = placeRow(row.map((id) => byId.get(id)!.width), wanted)
    row.forEach((id, index) => center.set(id, placed[index]))
  }
  for (let sweep = 0; sweep < PLACE_SWEEPS; sweep += 1) {
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) settle(rowIndex, -1)
    for (let rowIndex = rows.length - 2; rowIndex >= 0; rowIndex -= 1) settle(rowIndex, 1)
  }

  // Vertical position: one row after another, boxes centred on their row.
  const positions = new Map<number, Position>()
  let minLeft = Infinity
  for (const row of rows) for (const id of row) minLeft = Math.min(minLeft, center.get(id)! - byId.get(id)!.width / 2)
  let top = 0
  let width = 0
  for (const row of rows) {
    const rowHeight = Math.max(...row.map((id) => byId.get(id)!.height))
    for (const id of row) {
      const node = byId.get(id)!
      const left = center.get(id)! - node.width / 2 - minLeft
      positions.set(id, { x: left, y: top + (rowHeight - node.height) / 2 })
      width = Math.max(width, left + node.width)
    }
    top += rowHeight + TIDY_V_GAP
  }
  return { positions, width, height: top - TIDY_V_GAP, centerX: mean(nodes.map(centerX)), centerY: mean(nodes.map(centerY)) }
}

/**
 * New top-left positions for the boxes. Connected boxes form blocks; blocks are packed left to right in rows no wider
 * than the boxes were spread (at least TIDY_MIN_ROW_WIDTH), and the whole result keeps the top-left corner of the boxes.
 */
export function layoutBoxes(nodes: TidyNode[], edges: TidyEdge[]): Map<number, Position> {
  const result = new Map<number, Position>()
  if (nodes.length === 0) return result
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const pairs = new Map<string, TidyEdge>()
  for (const edge of edges) {
    if (edge.a === edge.b || !byId.has(edge.a) || !byId.has(edge.b)) continue
    const key = edge.a < edge.b ? `${edge.a}:${edge.b}` : `${edge.b}:${edge.a}`
    const old = pairs.get(key)
    if (!old || (old.upper === undefined && edge.upper !== undefined)) pairs.set(key, edge)
  }
  const parent = new Map<number, number>(nodes.map((node) => [node.id, node.id]))
  const find = (id: number): number => {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root)!
    parent.set(id, root)
    return root
  }
  for (const edge of pairs.values()) parent.set(find(edge.a), find(edge.b))
  const groups = new Map<number, TidyNode[]>()
  for (const node of nodes) groups.set(find(node.id), [...(groups.get(find(node.id)) ?? []), node])
  const blocks = [...groups.values()]
    .map((members) => {
      const ids = new Set(members.map((member) => member.id))
      return layoutBlock(members, [...pairs.values()].filter((edge) => ids.has(edge.a)))
    })
    .sort((a, b) => a.centerX - b.centerX || a.centerY - b.centerY)

  const left = Math.min(...nodes.map((node) => node.x))
  const top = Math.min(...nodes.map((node) => node.y))
  const spread = Math.max(...nodes.map((node) => node.x + node.width)) - left
  const maxWidth = Math.max(TIDY_MIN_ROW_WIDTH, spread)
  let cursorX = 0
  let shelfY = 0
  let shelfHeight = 0
  for (const block of blocks) {
    if (cursorX > 0 && cursorX + block.width > maxWidth) {
      shelfY += shelfHeight + TIDY_BLOCK_GAP
      cursorX = 0
      shelfHeight = 0
    }
    for (const [id, position] of block.positions) result.set(id, { x: Math.round(left + cursorX + position.x), y: Math.round(top + shelfY + position.y) })
    cursorX += block.width + TIDY_BLOCK_GAP
    shelfHeight = Math.max(shelfHeight, block.height)
  }
  return result
}

/** The boxes Tidy arranges: class boxes (typed and ink) and HLD shapes. Plain rectangles may be frames, so they stay put. */
export function isTidyBox(item: CanvasItem): item is RectangleObject {
  return item.kind === 'rectangle' && (item.classBox !== undefined || item.inkBox !== undefined)
}

/** What the Tidy button would do now: the selected boxes when at least two are selected, otherwise every box. */
export function tidyScope(items: readonly CanvasItem[], selectedKeys: ReadonlySet<string>): { ids: ReadonlySet<number> | null; count: number; selection: boolean } {
  const boxes = items.filter(isTidyBox)
  const selected = new Set(boxes.filter((box) => selectedKeys.has(canvasItemKey(box))).map((box) => box.id))
  if (selected.size >= 2) return { ids: selected, count: selected.size, selection: true }
  return { ids: null, count: boxes.length, selection: false }
}

const HIERARCHY_TYPES = new Set<ConnectorObject['relationshipType']>(['inheritance', 'realization', 'aggregation', 'composition'])

/**
 * Items with the boxes of the scope (null = all boxes) rearranged. Moves the boxes with their writing, carries attached
 * connector ends along and lets every connector of a moved box take its best sides. Returns the same array when there is
 * nothing to do (fewer than two boxes, or they are already tidy).
 */
export function tidyItems(items: CanvasItem[], scopeIds: ReadonlySet<number> | null, bounds = WORKSPACE_BOUNDS): CanvasItem[] {
  const boxes = items.filter(isTidyBox).filter((box) => scopeIds === null || scopeIds.has(box.id))
  if (boxes.length < 2) return items
  const inScope = new Set(boxes.map((box) => box.id))
  const edges: TidyEdge[] = []
  for (const item of items) {
    if (item.kind !== 'connector' || !item.startAttachment || !item.endAttachment) continue
    const startId = item.startAttachment.rectangleId
    const endId = item.endAttachment.rectangleId
    if (!inScope.has(startId) || !inScope.has(endId)) continue
    const endpoint = HIERARCHY_TYPES.has(item.relationshipType) ? getConnectorRenderSpec(item).endpoint : null
    edges.push({ a: startId, b: endId, ...(endpoint ? { upper: endpoint === 'start' ? startId : endId } : {}) })
  }
  const positions = layoutBoxes(boxes.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })), edges)

  // Keep the result inside the workspace when it fits.
  const byId = new Map(boxes.map((box) => [box.id, box]))
  let right = -Infinity
  let bottom = -Infinity
  let left = Infinity
  let top = Infinity
  for (const [id, position] of positions) {
    const box = byId.get(id)!
    left = Math.min(left, position.x)
    top = Math.min(top, position.y)
    right = Math.max(right, position.x + box.width)
    bottom = Math.max(bottom, position.y + box.height)
  }
  let shiftX = Math.min(0, bounds.x + bounds.width - right)
  let shiftY = Math.min(0, bounds.y + bounds.height - bottom)
  shiftX = Math.max(shiftX, bounds.x - left)
  shiftY = Math.max(shiftY, bounds.y - top)

  const deltas = new Map<number, { dx: number; dy: number }>()
  for (const [id, position] of positions) {
    const box = byId.get(id)!
    const dx = position.x + shiftX - box.x
    const dy = position.y + shiftY - box.y
    if (dx !== 0 || dy !== 0) deltas.set(id, { dx, dy })
  }
  const needsElbow = items.some((item) => item.kind === 'connector' && item.routing !== 'elbow' && !!item.startAttachment && !!item.endAttachment && inScope.has(item.startAttachment.rectangleId) && inScope.has(item.endAttachment.rectangleId))
  if (deltas.size === 0 && !needsElbow) return items

  const moved = new Map<number, RectangleObject>()
  const withBoxes = items.map((item): CanvasItem => {
    if (item.kind !== 'rectangle') return item
    const delta = deltas.get(item.id)
    if (!delta) return item
    const next: RectangleObject = { ...item, x: item.x + delta.dx, y: item.y + delta.dy, ...(item.inkBox ? { inkBox: translateInkBox(item.inkBox, delta.dx, delta.dy) } : {}) }
    moved.set(item.id, next)
    return next
  })
  const withConnectors = withBoxes.map((item): CanvasItem => {
    if (item.kind !== 'connector') return item
    // A connector between two arranged boxes becomes an Elbow line (straight lines look diagonal and crowded after a tidy).
    const between = !!item.startAttachment && !!item.endAttachment && inScope.has(item.startAttachment.rectangleId) && inScope.has(item.endAttachment.rectangleId)
    if (between && item.routing !== 'elbow') item = { ...item, routing: 'elbow' }
    const start = item.startAttachment ? moved.get(item.startAttachment.rectangleId) : undefined
    const end = item.endAttachment ? moved.get(item.endAttachment.rectangleId) : undefined
    if (!start && !end) return item
    return {
      ...item,
      ...(start ? { start: { ...item.start, x: start.x + item.startAttachment!.offsetX, y: start.y + item.startAttachment!.offsetY } } : {}),
      ...(end ? { end: { ...item.end, x: end.x + item.endAttachment!.offsetX, y: end.y + item.endAttachment!.offsetY } } : {}),
    }
  })
  return reattachConnectorSides(withConnectors, inScope, { minSaving: 0.5, maxRatio: 1 })
}
