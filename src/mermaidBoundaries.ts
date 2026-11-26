import { createShapeBox, type CanvasItem, type RectangleObject, type TextObject } from './canvasModel'
import { BOUNDARY_COLOR, BOUNDARY_FONT_SIZE, BOUNDARY_PADDING } from './boundary'
import { createTextObject, measureTextSize } from './textLayout'

/** Dashed boundaries around Mermaid groups (flowchart `subgraph`, class `namespace`): the frames, and the separation that keeps non-members outside them. */
/** A `subgraph` ... `end` group: `parent` is the index of the enclosing subgraph (or null), `nodes` the ids first defined directly inside it. */
export type MermaidSubgraph = { id: string; title: string; parent: number | null; nodes: string[] }

const BOUNDARY_GAP = 20

/**
 * Moves boxes (in place) so no box overlaps a boundary it is not a member of, and no two boxes overlap. Offenders move along the cross axis
 * (down for LR/RL, right for TD/BT); a box that belongs to a sibling subgraph moves with that whole subgraph. Bounded and deterministic;
 * graphs without subgraphs are left untouched.
 */
export function separateFromBoundaries(groups: MermaidSubgraph[], nodes: { id: string }[], spots: { x: number; y: number }[], sizes: { width: number; height: number }[], sideways: boolean): void {
  if (groups.length === 0) return
  type Rect = { l: number; t: number; r: number; b: number }
  const slot = new Map(nodes.map((node, position) => [node.id, position]))
  const owner = new Map<number, number>()
  groups.forEach((group, position) => group.nodes.forEach((id) => { const box = slot.get(id); if (box !== undefined && !owner.has(box)) owner.set(box, position) }))
  const withinGroup = (group: number | null, ancestor: number): boolean => { for (let at = group; at !== null; at = groups[at].parent) if (at === ancestor) return true; return false }
  const members = groups.map((_, group) => { const found: number[] = []; owner.forEach((own, box) => { if (withinGroup(own, group)) found.push(box) }); return found })
  const direct = groups.map((_, group) => [...owner.entries()].filter(([, own]) => own === group).map(([box]) => box))
  const depthOf = (group: number): number => (groups[group].parent === null ? 0 : 1 + depthOf(groups[group].parent as number))
  const boxRect = (box: number): Rect => ({ l: spots[box].x, t: spots[box].y, r: spots[box].x + sizes[box].width, b: spots[box].y + sizes[box].height })
  const frameRect = (group: number): Rect | null => {
    if (members[group].length === 0) return null
    const rects = [...direct[group].map(boxRect)]
    groups.forEach((child, position) => { if (child.parent === group) { const inner = frameRect(position); if (inner) rects.push(inner) } })
    const labelWidth = measureTextSize(groups[group].title, BOUNDARY_FONT_SIZE).width + 24
    const l = Math.min(...rects.map((rect) => rect.l)) - BOUNDARY_PADDING
    return { l, t: Math.min(...rects.map((rect) => rect.t)) - BOUNDARY_PADDING, r: Math.max(Math.max(...rects.map((rect) => rect.r)) + BOUNDARY_PADDING, l + labelWidth), b: Math.max(...rects.map((rect) => rect.b)) + BOUNDARY_PADDING }
  }
  const hits = (a: Rect, b: Rect, gap: number) => a.l < b.r + gap && b.l < a.r + gap && a.t < b.b + gap && b.t < a.b + gap
  const shift = (boxes: number[], dx: number, dy: number) => { for (const box of boxes) { spots[box].x += dx; spots[box].y += dy } }
  // Moves `boxes` (with `rect` their current extent) past `edge` on the cross axis.
  const push = (boxes: number[], rect: Rect, other: Rect) => (sideways ? shift(boxes, 0, other.b + BOUNDARY_GAP - rect.t) : shift(boxes, other.r + BOUNDARY_GAP - rect.l, 0))
  const innerFirst = groups.map((_, group) => group).sort((a, b) => depthOf(b) - depthOf(a) || a - b)
  for (let pass = 0; pass < 200; pass++) {
    let moved = false
    for (const group of innerFirst) {
      const frame = frameRect(group)
      if (!frame) continue
      for (let box = 0; box < nodes.length && !moved; box++) {
        if (members[group].includes(box)) continue
        // The unit that moves: the box alone, or the highest sibling subgraph holding it that does not contain this group.
        let unit = [box]
        let unitRect: Rect | null = boxRect(box)
        const own = owner.get(box)
        if (own !== undefined && !withinGroup(group, own)) {
          let top = own
          while (groups[top].parent !== null && !withinGroup(group, groups[top].parent as number)) top = groups[top].parent as number
          unit = members[top]
          unitRect = frameRect(top)
        }
        if (unitRect && hits(unitRect, frame, BOUNDARY_GAP)) { push(unit, unitRect, frame); moved = true }
      }
      if (moved) break
    }
    if (!moved) {
      for (let a = 0; a < nodes.length && !moved; a++) {
        for (let b = a + 1; b < nodes.length && !moved; b++) {
          if (hits(boxRect(a), boxRect(b), BOUNDARY_GAP / 2)) { push([b], boxRect(b), boxRect(a)); moved = true }
        }
      }
    }
    if (!moved) return
  }
}

/** One dashed unfilled rectangle (and a label at its top-left) per non-empty subgraph, inner ones inside outer ones. Rectangles run outer first, so they sit behind the boxes. */
export function buildSubgraphFrames(groups: MermaidSubgraph[], boxes: Map<string, RectangleObject>, existing: CanvasItem[]): { rectangles: RectangleObject[]; labels: TextObject[] } {
  const frames = new Map<number, RectangleObject>()
  const labels = new Map<number, TextObject>()
  let rectangleId = 1 + Math.max(0, ...existing.map((item) => (item.kind === 'rectangle' ? item.id : 0)))
  let textId = 1 + Math.max(0, ...existing.map((item) => (item.kind === 'text' ? item.id : 0)))
  const build = (position: number): RectangleObject | null => {
    const cached = frames.get(position)
    if (cached) return cached
    const parts: RectangleObject[] = []
    for (const id of groups[position].nodes) { const box = boxes.get(id); if (box) parts.push(box) }
    groups.forEach((group, child) => { if (group.parent === position) { const inner = build(child); if (inner) parts.push(inner) } })
    if (parts.length === 0) return null
    const x = Math.min(...parts.map((part) => part.x)) - BOUNDARY_PADDING
    const y = Math.min(...parts.map((part) => part.y)) - BOUNDARY_PADDING
    const right = Math.max(...parts.map((part) => part.x + part.width)) + BOUNDARY_PADDING
    const bottom = Math.max(...parts.map((part) => part.y + part.height)) + BOUNDARY_PADDING
    const label = createTextObject(textId++, x + 12, y + 8, groups[position].title, BOUNDARY_COLOR, BOUNDARY_FONT_SIZE)
    const frame: RectangleObject = { ...createShapeBox(rectangleId++, x, y, Math.max(right - x, label.width + 24), bottom - y, BOUNDARY_COLOR, 2, 'rectangle'), dash: 'dashed' }
    frames.set(position, frame)
    labels.set(position, label)
    return frame
  }
  groups.forEach((_, position) => { build(position) })
  const order = [...frames.keys()].sort((a, b) => a - b)
  return { rectangles: order.map((position) => frames.get(position) as RectangleObject), labels: order.map((position) => labels.get(position) as TextObject) }
}

