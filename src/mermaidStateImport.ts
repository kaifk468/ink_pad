import type { CanvasItem, RectangleObject } from './canvasModel'
import { BOUNDARY_COLOR, BOUNDARY_FONT_SIZE, BOUNDARY_PADDING } from './boundary'
import { Sheet } from './diagramTemplates'
import { cleanMermaidText, facingSides, MAX_MERMAID_NODES, MAX_MERMAID_TEXT, normalizeMermaidSpaces, stripMermaidFrontMatter } from './mermaidCommon'
import type { MermaidDiagramResult } from './mermaidSequenceImport'
import { STICKY_FILL, STICKY_OUTLINE } from './stickyNote'
import { measureTextSize } from './textLayout'
import { layoutBoxes, type TidyEdge, type TidyNode } from './tidyLayout'

/**
 * Mermaid `stateDiagram` / `stateDiagram-v2` import, built from ordinary canvas items: states are rounded rectangles with centred labels,
 * `[*]` is a small filled start circle (as a source) or a larger thick end circle (as a target), `<<choice>>` a small diamond,
 * `<<fork>>` / `<<join>>` a thin filled bar, `state X { ... }` a dashed boundary around its members, notes are sticky notes beside their state.
 * Each `[*]` at the top level is one shared start and one shared end; inside a composite state they are separate nodes.
 * Skipped and counted: `--` concurrency separators, classDef, class, style, click, accTitle, accDescr, title, scale, `direction` inside a composite, self transitions, unreadable lines.
 */
export type StateKind = 'state' | 'choice' | 'fork' | 'start' | 'end'
export type StateNode = { id: string; kind: StateKind; label: string; description: string[]; parent: string | null }
export type StateTransition = { from: string; to: string; label?: string }
export type StateNote = { state: string; side: 'left' | 'right'; text: string }
export type StateDirection = 'TB' | 'BT' | 'LR' | 'RL'
export type StateParse = { ok: true; states: StateNode[]; transitions: StateTransition[]; notes: StateNote[]; direction: StateDirection; ignoredLines: number } | { ok: false; error: string }

const HEADER = /^stateDiagram(?:-v2)?[ \t]*;?[ \t]*$/
const ID = '(?:[\\p{L}\\p{N}_.]|-(?![->]))+'
const POINT = '\\[\\*\\]'
const TRANSITION = new RegExp(`^(${POINT}|${ID})\\s*-->\\s*(${POINT}|${ID})\\s*(?::\\s*(.*))?$`, 'u')
const STATE_ALIAS = new RegExp(`^state\\s+"([^"]*)"\\s+as\\s+(${ID})\\s*(\\{)?$`, 'u')
const STATE_KIND = new RegExp(`^state\\s+(${ID})\\s*(?:<<\\s*(choice|fork|join)\\s*>>|\\[\\[\\s*(choice|fork|join)\\s*\\]\\])$`, 'u')
const STATE_BLOCK = new RegExp(`^state\\s+(${ID})\\s*(\\{)?$`, 'u')
const DESCRIPTION = new RegExp(`^(${ID})\\s*:\\s*(.*)$`, 'u')
const NOTE = new RegExp(`^note\\s+(left|right)\\s+of\\s+(${ID})\\s*(?::\\s*(.*))?$`, 'iu')
const SKIPPED = /^(?:classDef\b|class\b|style\b|click\b|accTitle\b|accDescr\b|title\b|scale\b|hide\b|link\b|callback\b)/
const DIRECTION = /^direction\s+(TB|TD|BT|LR|RL)\s*$/

const START = '[*]start'
const END = '[*]end'

/** True for the `stateDiagram` / `stateDiagram-v2` header line. */
export const isMermaidStateText = (line: string): boolean => HEADER.test(line.trim())

/** Reads Mermaid state diagram text. */
export function parseMermaidState(text: string): StateParse {
  const states = new Map<string, StateNode>()
  const transitions: StateTransition[] = []
  const notes: StateNote[] = []
  const scopes: string[] = []
  let direction: StateDirection = 'TB'
  let ignoredLines = 0
  let headerSeen = false
  let noteBlock: { state: string; side: 'left' | 'right'; lines: string[] } | null = null
  const scope = (): string | null => scopes[scopes.length - 1] ?? null
  const ensure = (id: string): StateNode => {
    let known = states.get(id)
    if (!known) { known = { id, kind: 'state', label: id, description: [], parent: scope() }; states.set(id, known) }
    return known
  }
  /** `[*]` is a start when it is a source and an end when it is a target; one of each per scope. */
  const endpoint = (raw: string, asSource: boolean): StateNode => {
    if (raw !== '[*]') return ensure(raw)
    const owner = scope()
    const id = `${owner ?? ''}${asSource ? START : END}`
    let known = states.get(id)
    if (!known) { known = { id, kind: asSource ? 'start' : 'end', label: '', description: [], parent: owner }; states.set(id, known) }
    return known
  }
  const openScope = (node: StateNode): void => { scopes.push(node.id) }
  const addNote = (state: string, side: 'left' | 'right', rawText: string): void => {
    const noteText = cleanMermaidText(rawText.replace(/\n/g, '<br>'))
    ensure(state)
    if (noteText !== '') notes.push({ state, side, text: noteText })
  }
  for (const rawLine of stripMermaidFrontMatter(normalizeMermaidSpaces(text.slice(0, MAX_MERMAID_TEXT)).replace(/^﻿/, '')).split(/\r?\n/)) {
    const line = rawLine.trim()
    if (noteBlock) {
      if (/^end\s+note\s*;?$/i.test(line)) { addNote(noteBlock.state, noteBlock.side, noteBlock.lines.join('<br>')); noteBlock = null } else if (line !== '') noteBlock.lines.push(line)
      continue
    }
    if (line === '' || line.startsWith('%%')) continue
    if (!headerSeen) {
      headerSeen = true
      if (HEADER.test(line)) continue
    }
    if (line === '}') { if (scopes.length > 0) scopes.pop(); else ignoredLines += 1; continue }
    if (/^--+$/.test(line)) { ignoredLines += 1; continue }
    const dir = DIRECTION.exec(line)
    if (dir) { if (scopes.length === 0) direction = dir[1] === 'TD' ? 'TB' : (dir[1] as StateDirection); else ignoredLines += 1; continue }
    if (SKIPPED.test(line)) { ignoredLines += 1; continue }
    const note = NOTE.exec(line)
    if (note) {
      const side = note[1].toLowerCase() as 'left' | 'right'
      if (note[3] !== undefined) addNote(note[2], side, note[3])
      else noteBlock = { state: note[2], side, lines: [] }
      continue
    }
    const aliased = STATE_ALIAS.exec(line)
    if (aliased) {
      const node = ensure(aliased[2])
      const label = cleanMermaidText(aliased[1])
      if (label) node.label = label
      if (aliased[3]) openScope(node)
      continue
    }
    const special = STATE_KIND.exec(line)
    if (special) {
      const node = ensure(special[1])
      const word = special[2] ?? special[3]
      node.kind = word === 'choice' ? 'choice' : 'fork'
      continue
    }
    const block = STATE_BLOCK.exec(line)
    if (block) {
      const node = ensure(block[1])
      if (block[2]) openScope(node)
      continue
    }
    const transition = TRANSITION.exec(line)
    if (transition) {
      const from = endpoint(transition[1], true)
      const to = endpoint(transition[2], false)
      if (from.id === to.id) { ignoredLines += 1; continue }
      const label = transition[3] ? cleanMermaidText(transition[3]) : ''
      transitions.push({ from: from.id, to: to.id, ...(label ? { label } : {}) })
      continue
    }
    const described = DESCRIPTION.exec(line)
    if (described) {
      const node = ensure(described[1])
      const detail = cleanMermaidText(described[2])
      if (detail) node.description.push(detail)
      continue
    }
    if (new RegExp(`^${ID}$`, 'u').test(line)) { ensure(line); continue }
    ignoredLines += 1
  }
  const real = [...states.values()].filter((node) => node.kind !== 'start' && node.kind !== 'end')
  if (real.length === 0) return { ok: false, error: 'No states found. Start with “stateDiagram-v2”, then lines like [*] --> Idle or Idle --> Busy : start.' }
  if (real.length > MAX_MERMAID_NODES) return { ok: false, error: `Too many states (${real.length}); the limit is ${MAX_MERMAID_NODES}.` }
  return { ok: true, states: [...states.values()], transitions, notes, direction, ignoredLines }
}

const INK = '#1e1e1e'
const FONT = 24
const NOTE_FONT = 20
const MIN_WIDTH = 120
const MIN_HEIGHT = 60
const START_SIZE = 24
const END_SIZE = 26
const END_STROKE = 6
const CHOICE_SIZE = 44
const BAR_LONG = 120
const BAR_THIN = 12
const NOTE_GAP = 40
const NOTE_PAD = 14
const NOTE_MAX_WIDTH = 240
const TITLE_HEIGHT = 36

type Box = { x: number; y: number; width: number; height: number }
type Cell = { id: string; width: number; height: number; offsetX: number; offsetY: number; box: { width: number; height: number }; left: NoteBox[]; right: NoteBox[] }
type NoteBox = { text: string; width: number; height: number }
type Scope = { rects: Map<string, Box>; width: number; height: number }

const stateText = (node: StateNode): string => [node.label, ...node.description].join('\n')

/** Width / height of a note: wrapped at NOTE_MAX_WIDTH, never smaller than a small sticky. */
function noteSize(raw: string): NoteBox {
  const room = NOTE_MAX_WIDTH - 2 * NOTE_PAD
  const lines: string[] = []
  for (const paragraph of raw.split('\n')) {
    let current = ''
    for (const word of paragraph.split(/\s+/).filter((w) => w !== '')) {
      const next = current === '' ? word : `${current} ${word}`
      if (current !== '' && measureTextSize(next, NOTE_FONT).width > room) { lines.push(current); current = word } else current = next
    }
    lines.push(current)
  }
  const text = lines.join('\n')
  const measured = measureTextSize(text, NOTE_FONT)
  return { text, width: Math.min(NOTE_MAX_WIDTH, Math.max(120, Math.ceil(measured.width + 2 * NOTE_PAD))), height: Math.max(60, Math.ceil(measured.height + 2 * NOTE_PAD)) }
}

/** Builds the items for a parsed state diagram. Top-left at (0, 0), local ids from 1 per kind. */
export function buildMermaidStateItems(parsed: { states: StateNode[]; transitions: StateTransition[]; notes: StateNote[]; direction?: StateDirection }): { items: CanvasItem[]; boxes: number; links: number } {
  const direction = parsed.direction ?? 'TB'
  const sideways = direction === 'LR' || direction === 'RL'
  const reversed = direction === 'BT' || direction === 'RL'
  const byId = new Map(parsed.states.map((node) => [node.id, node]))
  const children = new Map<string | null, StateNode[]>()
  for (const node of parsed.states) {
    const owner = node.parent !== null && byId.has(node.parent) ? node.parent : null
    children.set(owner, [...(children.get(owner) ?? []), node])
  }
  const isComposite = (id: string): boolean => (children.get(id)?.length ?? 0) > 0
  const chain = (id: string): Array<string | null> => {
    const out: Array<string | null> = [id]
    let at: string | null = byId.get(id)?.parent ?? null
    while (at !== null && byId.has(at) && out.length < 64) { out.push(at); at = byId.get(at)?.parent ?? null }
    out.push(null)
    return out
  }
  // Each transition is laid out in the scope where its two ends meet, between the children of that scope that hold them.
  const scopeEdges = new Map<string | null, Array<[string, string]>>()
  for (const transition of parsed.transitions) {
    const from = chain(transition.from)
    const to = chain(transition.to)
    for (let i = 1; i < from.length; i += 1) {
      const meet = from[i]
      const j = to.indexOf(meet)
      if (j === -1) continue
      const a = from[i - 1] as string
      const b = to[j - 1] as string
      if (a !== b) scopeEdges.set(meet, [...(scopeEdges.get(meet) ?? []), [a, b]])
      break
    }
  }
  const notesOf = (id: string, side: 'left' | 'right'): NoteBox[] => parsed.notes.filter((note) => note.state === id && note.side === side).map((note) => noteSize(note.text))

  const plainSize = (node: StateNode): { width: number; height: number } => {
    if (node.kind === 'start') return { width: START_SIZE, height: START_SIZE }
    if (node.kind === 'end') return { width: END_SIZE, height: END_SIZE }
    if (node.kind === 'choice') return { width: CHOICE_SIZE, height: CHOICE_SIZE }
    if (node.kind === 'fork') return sideways ? { width: BAR_THIN, height: BAR_LONG } : { width: BAR_LONG, height: BAR_THIN }
    const label = measureTextSize(stateText(node), FONT)
    return { width: Math.max(MIN_WIDTH, Math.ceil((label.width + 48) / 10) * 10), height: Math.max(MIN_HEIGHT, Math.ceil((label.height + 36) / 10) * 10) }
  }

  const layoutScope = (owner: string | null): Scope => {
    const members = children.get(owner) ?? []
    const inner = new Map<string, Scope>()
    const cells: Cell[] = members.map((node) => {
      let box = plainSize(node)
      if (isComposite(node.id)) {
        const sub = layoutScope(node.id)
        inner.set(node.id, sub)
        const title = measureTextSize(node.label, BOUNDARY_FONT_SIZE).width + 24
        box = { width: Math.max(sub.width + 2 * BOUNDARY_PADDING, title), height: sub.height + 2 * BOUNDARY_PADDING + TITLE_HEIGHT }
      }
      const left = notesOf(node.id, 'left')
      const right = notesOf(node.id, 'right')
      const column = (list: NoteBox[]) => ({ width: list.length === 0 ? 0 : Math.max(...list.map((n) => n.width)) + NOTE_GAP, height: list.reduce((sum, n) => sum + n.height, 0) + Math.max(0, list.length - 1) * 12 })
      const leftColumn = column(left)
      const rightColumn = column(right)
      const height = Math.max(box.height, leftColumn.height, rightColumn.height)
      return { id: node.id, width: leftColumn.width + box.width + rightColumn.width, height, offsetX: leftColumn.width, offsetY: Math.round((height - box.height) / 2), box, left, right }
    })
    const slot = new Map(cells.map((cell, position) => [cell.id, position + 1]))
    const tidyNodes: TidyNode[] = cells.map((cell, position) => ({ id: position + 1, x: position * 1000, y: 0, width: sideways ? cell.height : cell.width, height: sideways ? cell.width : cell.height }))
    const tidyEdges: TidyEdge[] = (scopeEdges.get(owner) ?? []).map(([a, b]) => ({ a: slot.get(a) as number, b: slot.get(b) as number, upper: reversed ? (slot.get(b) as number) : (slot.get(a) as number) }))
    const placed = layoutBoxes(tidyNodes, tidyEdges)
    const at = (position: number) => { const spot = placed.get(position + 1) ?? { x: 0, y: 0 }; return sideways ? { x: spot.y, y: spot.x } : spot }
    const originX = Math.min(...cells.map((_, position) => at(position).x))
    const originY = Math.min(...cells.map((_, position) => at(position).y))
    const rects = new Map<string, Box>()
    let width = 0
    let height = 0
    cells.forEach((cell, position) => {
      const x = Math.round(at(position).x - originX)
      const y = Math.round(at(position).y - originY)
      width = Math.max(width, x + cell.width)
      height = Math.max(height, y + cell.height)
      const box: Box = { x: x + cell.offsetX, y: y + cell.offsetY, width: cell.box.width, height: cell.box.height }
      rects.set(cell.id, box)
      const sub = inner.get(cell.id)
      if (sub) {
        for (const [id, rect] of sub.rects) rects.set(id, { ...rect, x: rect.x + box.x + BOUNDARY_PADDING, y: rect.y + box.y + BOUNDARY_PADDING + TITLE_HEIGHT })
      }
      // Notes: stacked beside the state, centred on its middle.
      const stack = (list: NoteBox[], leftSide: boolean) => {
        if (list.length === 0) return
        const total = list.reduce((sum, n) => sum + n.height, 0) + (list.length - 1) * 12
        let top = box.y + box.height / 2 - total / 2
        const column = Math.max(...list.map((n) => n.width))
        list.forEach((n, index) => {
          const noteX = leftSide ? box.x - NOTE_GAP - n.width : box.x + box.width + NOTE_GAP
          rects.set(`note:${cell.id}:${leftSide ? 'left' : 'right'}:${index}`, { x: Math.round(leftSide ? noteX + (column - n.width) : noteX), y: Math.round(top), width: n.width, height: n.height })
          top += n.height + 12
        })
      }
      stack(cell.left, true)
      stack(cell.right, false)
    })
    return { rects, width, height }
  }


  const whole = layoutScope(null)
  const sheet = new Sheet()
  const rectangles = new Map<string, RectangleObject>()
  // Boundaries first (outer before inner) so they sit behind everything else; each has a title at its top-left.
  const composites = parsed.states.filter((node) => isComposite(node.id) && whole.rects.has(node.id)).sort((a, b) => chain(a.id).length - chain(b.id).length)
  for (const node of composites) {
    const box = whole.rects.get(node.id) as Box
    rectangles.set(node.id, sheet.bare(box.x, box.y, box.width, box.height, { strokeColor: BOUNDARY_COLOR, strokeWidth: 2, dash: 'dashed' }))
    sheet.caption(box.x + 12, box.y + 8, node.label, BOUNDARY_COLOR, BOUNDARY_FONT_SIZE)
  }
  for (const node of parsed.states) {
    const box = whole.rects.get(node.id)
    if (!box || isComposite(node.id)) continue
    if (node.kind === 'start') rectangles.set(node.id, sheet.bare(box.x, box.y, box.width, box.height, { ellipse: true, fillColor: INK }))
    else if (node.kind === 'end') rectangles.set(node.id, sheet.bare(box.x, box.y, box.width, box.height, { ellipse: true, fillColor: INK, strokeWidth: END_STROKE }))
    else if (node.kind === 'choice') rectangles.set(node.id, sheet.bare(box.x, box.y, box.width, box.height, { diamond: true }))
    else if (node.kind === 'fork') rectangles.set(node.id, sheet.bare(box.x, box.y, box.width, box.height, { fillColor: INK }))
    else {
      // `rounded` is the optional corner style added by the rounded-rectangle work; typed loosely so this builds before and after it.
      const made = sheet.shaped('rectangle', box.x, box.y, box.width, box.height, stateText(node))
      const rounded = { ...made, rounded: true } as unknown as RectangleObject
      sheet.items[sheet.items.indexOf(made)] = rounded
      rectangles.set(node.id, rounded)
    }
  }
  const seen = new Map<string, number>()
  for (const note of parsed.notes) {
    const key = `${note.state}:${note.side}`
    const index = seen.get(key) ?? 0
    seen.set(key, index + 1)
    const box = whole.rects.get(`note:${key}:${index}`)
    if (!box) continue
    sheet.bare(box.x, box.y, box.width, box.height, { strokeColor: STICKY_OUTLINE, fillColor: STICKY_FILL })
    const made = sheet.caption(0, 0, noteSize(note.text).text, INK, NOTE_FONT)
    sheet.items[sheet.items.indexOf(made)] = { ...made, align: 'center' as const, x: box.x + box.width / 2 - made.width / 2, y: box.y + box.height / 2 - made.height / 2 }
  }
  let links = 0
  for (const transition of parsed.transitions) {
    const from = rectangles.get(transition.from)
    const to = rectangles.get(transition.to)
    if (!from || !to) continue
    const { fromSide, toSide } = facingSides(from, to)
    sheet.connect(from, fromSide, to, toSide, { type: 'directed-association', ...(transition.label ? { label: transition.label } : {}) })
    links += 1
  }
  return { items: sheet.items, boxes: parsed.states.filter((node) => node.kind !== 'start' && node.kind !== 'end').length, links }
}

/** Parses and builds a state diagram in one step (the dispatcher's entry). */
export function buildMermaidState(text: string): MermaidDiagramResult {
  const parsed = parseMermaidState(text)
  if (!parsed.ok) return parsed
  const built = buildMermaidStateItems(parsed)
  return { ok: true, items: built.items, boxes: built.boxes, links: built.links, ignoredLines: parsed.ignoredLines, kind: 'state' }
}
