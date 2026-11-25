import type { CanvasItem, HldShape, RectangleObject, TextObject } from './canvasModel'
import { HLD_DEFAULT_SIZE } from './hldShapes'
import { HLD_TEMPLATE_SCALE, Sheet } from './diagramTemplates'
import { layoutBoxes, type TidyEdge, type TidyNode } from './tidyLayout'
import { measureTextSize, createTextObject } from './textLayout'
import { createShapeBox } from './canvasModel'
import { BOUNDARY_COLOR, BOUNDARY_FONT_SIZE, BOUNDARY_PADDING } from './boundary'
import { cleanMermaidText, facingSides, firstMermaidLine, MAX_MERMAID_NODES, MAX_MERMAID_TEXT, normalizeMermaidSpaces, stripMermaidFrontMatter } from './mermaidCommon'
import { buildMermaidClassItems, isMermaidClassText, parseMermaidClass } from './mermaidClassImport'
import { buildMermaidSequence, isMermaidSequenceText, type MermaidDiagramResult } from './mermaidSequenceImport'

export { MAX_MERMAID_NODES, MAX_MERMAID_TEXT, normalizeMermaidSpaces, stripMermaidFrontMatter }
export type { MermaidDiagramResult }

/**
 * Mermaid import ("Insert from Mermaid…" and pasting Mermaid text): reads a flowchart / graph and builds ordinary canvas items
 * (boxes with centred labels and attached connectors) for the same insert path the templates use. Nothing here is a new item kind.
 * Supported: node shapes `A[t]`, `A(t)`, `A([t])`, `A((t))`, `A{t}`, `A[(t)]` (Database), `A[[t]]` (Service), bare `A`;
 * links `-->`, `---`, `-.->`, `-.-`, `==>`, `--o`, `--x`, chains, `A & B --> C`, and labels (`|t|` or `-- t -->`).
 * `subgraph` ... `end` (nestable) becomes dashed boundaries around the member boxes; links to a subgraph id are skipped.
 * Everything else (classDef, class, style, linkStyle, click, direction) is skipped and counted.
 */
export type MermaidDirection = 'TD' | 'BT' | 'LR' | 'RL'
export type MermaidShape = 'rectangle' | 'ellipse' | 'diamond' | 'database' | 'service'
export type MermaidNode = { id: string; text: string; shape: MermaidShape }
export type MermaidEdge = { from: string; to: string; label?: string; arrow: boolean; dashed: boolean; /** `<-->`: a head at both ends. Only ever true. */ twoWay?: boolean }
/** A `subgraph` ... `end` group: `parent` is the index of the enclosing subgraph (or null), `nodes` the ids first defined directly inside it. */
export type MermaidSubgraph = { id: string; title: string; parent: number | null; nodes: string[] }
export type MermaidGraph = { nodes: MermaidNode[]; edges: MermaidEdge[]; direction: MermaidDirection; ignoredLines: number; subgraphs?: MermaidSubgraph[] }
export type MermaidParse = ({ ok: true } & MermaidGraph) | { ok: false; error: string }

/** Statements that are skipped and counted. Keywords are case-sensitive; `end` only as a whole statement, `subgraph` needs a space or the end of the line. */
const SKIPPED = /^(?:subgraph(?=\s|$)|end\s*;?\s*$|(?:classDef|class|style|linkStyle|click|direction)\s|accTitle\b|accDescr\b)/
const HEADER = /^(?:graph|flowchart)(?:[ \t]+(?:TD|TB|BT|LR|RL))?[ \t]*(?:;.*)?$/
/** True when the first line that is not blank, front matter or a %% comment is a `graph` / `flowchart`, `classDiagram` or `sequenceDiagram` header (lowercase, as Mermaid requires). */
export function isMermaidText(text: string): boolean {
  const line = firstMermaidLine(text)
  return HEADER.test(line) || isMermaidClassText(line) || isMermaidSequenceText(line)
}

const SHAPES: ReadonlyArray<{ open: string; close: string; shape: MermaidShape }> = [
  { open: '((', close: '))', shape: 'ellipse' },
  { open: '([', close: '])', shape: 'rectangle' },
  { open: '[(', close: ')]', shape: 'database' },
  { open: '[[', close: ']]', shape: 'service' },
  { open: '{{', close: '}}', shape: 'rectangle' },
  { open: '(', close: ')', shape: 'rectangle' },
  { open: '[', close: ']', shape: 'rectangle' },
  { open: '{', close: '}', shape: 'diamond' },
]

const cleanText = cleanMermaidText
export { cleanMermaidText as cleanText }
const unquote = (raw: string): string => { const t = raw.trim(); return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t }

/** Splits a line at `;` outside quotes. */
function splitStatements(line: string): string[] {
  const parts: string[] = []
  let current = ''
  let quoted = false
  for (const char of line) {
    if (char === '"') quoted = !quoted
    if (char === ';' && !quoted) { parts.push(current); current = '' } else current += char
  }
  parts.push(current)
  return parts.map((part) => part.trim()).filter((part) => part !== '')
}

type Declared = { id: string; text?: string; shape?: MermaidShape }
type Link = { arrow: boolean; dashed: boolean; twoWay?: boolean; label?: string }

function parseNode(source: string, start: number): { node: Declared; end: number } | null {
  const idMatch = /^[\w.\u0080-￿]+/.exec(source.slice(start))
  if (!idMatch) return null
  let position = start + idMatch[0].length
  const node: Declared = { id: idMatch[0] }
  const rest = source.slice(position)
  const form = SHAPES.find((candidate) => rest.startsWith(candidate.open))
  if (form) {
    let from = position + form.open.length
    let text: string
    let closeAt: number
    if (source[from] === '"') {
      const quoteEnd = source.indexOf('"', from + 1)
      if (quoteEnd === -1) return null
      text = source.slice(from + 1, quoteEnd)
      closeAt = source.indexOf(form.close, quoteEnd + 1)
      from = quoteEnd + 1
      if (closeAt === -1 || source.slice(from, closeAt).trim() !== '') return null
    } else {
      closeAt = source.indexOf(form.close, from)
      if (closeAt === -1) return null
      text = source.slice(from, closeAt)
      if (form.open === '[') text = text.replace(/^[/\\]+|[/\\]+$/g, '') // [/parallelogram/] and [\trapezoid/] read as plain boxes
    }
    node.text = cleanText(text)
    node.shape = form.shape
    position = closeAt + form.close.length
  }
  const klass = /^:::[\w-]+/.exec(source.slice(position))
  if (klass) position += klass[0].length
  return { node, end: position }
}

function parseGroup(source: string, start: number): { nodes: Declared[]; end: number } | null {
  const nodes: Declared[] = []
  let position = start
  for (;;) {
    while (source[position] === ' ' || source[position] === '\t') position += 1
    const parsed = parseNode(source, position)
    if (!parsed) return null
    nodes.push(parsed.node)
    position = parsed.end
    const after = /^[ \t]*&/.exec(source.slice(position))
    if (!after) return { nodes, end: position }
    position += after[0].length
  }
}

function parseLink(source: string, start: number): { link: Link; end: number } | null {
  const rest = source.slice(start)
  const finish = (match: RegExpExecArray, link: Omit<Link, 'label'>, labelGroup?: number): { link: Link; end: number } => {
    let end = start + match[0].length
    let label = labelGroup !== undefined ? match[labelGroup] : undefined
    const piped = /^[ \t]*\|([^|]*)\|/.exec(source.slice(end))
    if (piped) { label = piped[1]; end += piped[0].length }
    const text = label === undefined ? '' : cleanText(unquote(label))
    return { link: { ...link, ...(text ? { label: text } : {}) }, end }
  }
  let match: RegExpExecArray | null
  // Labels written inside the line: `A -- text --> B`, `A -. text .-> B`, `A == text ==> B`
  // The "not followed by a word character" check applies only to the o / x markers (`A --o B` vs `A --oB` = node oB), never to `>`.
  if ((match = /^--[ \t]+(.+?)[ \t]+-{2,}(?:(>)|([ox])(?![\w-]))?/.exec(rest))) return finish(match, { arrow: Boolean(match[2] || match[3]), dashed: false }, 1)
  if ((match = /^-\.[ \t]+(.+?)[ \t]+\.+-(>)?/.exec(rest))) return finish(match, { arrow: Boolean(match[2]), dashed: true }, 1)
  if ((match = /^==[ \t]+(.+?)[ \t]+={2,}(>)?/.exec(rest))) return finish(match, { arrow: Boolean(match[2]), dashed: false }, 1)
  // Both-ended links. `<-->`, `<-.->` and `<==>` become a two-way arrow (a directed association with a head at both ends); `x--x` and `o--o` have no connector type and become plain lines.
  if ((match = /^<(-{2,}|-\.+-|={2,})>/.exec(rest))) return finish(match, { arrow: true, twoWay: true, dashed: match[1].includes('.') })
  if ((match = /^([ox])(-{2,}|-\.+-|={2,})\1(?![\w-])/.exec(rest))) return finish(match, { arrow: false, dashed: match[2].includes('.') })
  if ((match = /^-\.+-(>)?/.exec(rest))) return finish(match, { arrow: Boolean(match[1]), dashed: true })
  if ((match = /^={2,}(>)?/.exec(rest))) return finish(match, { arrow: Boolean(match[1]), dashed: false })
  if ((match = /^-{2,}(?:(>)|([ox])(?![\w]))?/.exec(rest))) return finish(match, { arrow: Boolean(match[1] || match[2]), dashed: false })
  return null
}

/** Reads Mermaid flowchart text. Returns the nodes, links, direction and the number of lines that were skipped, or an error. */
export function parseMermaid(text: string): MermaidParse {
  const nodes = new Map<string, MermaidNode>()
  const edges: MermaidEdge[] = []
  let direction: MermaidDirection = 'TD'
  let ignoredLines = 0
  let headerSeen = false
  const subgraphs: MermaidSubgraph[] = []
  const open: number[] = []
  const declare = (declared: Declared) => {
    const known = nodes.get(declared.id)
    if (!known) {
      nodes.set(declared.id, { id: declared.id, text: declared.text || declared.id, shape: declared.shape ?? 'rectangle' })
      if (open.length > 0) subgraphs[open[open.length - 1]].nodes.push(declared.id)
    }
    else if (declared.shape !== undefined) nodes.set(declared.id, { id: declared.id, text: declared.text || declared.id, shape: declared.shape })
  }
  for (const rawLine of stripMermaidFrontMatter(normalizeMermaidSpaces(text.slice(0, MAX_MERMAID_TEXT)).replace(/^﻿/, '')).split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('%%')) continue
    if (!headerSeen) {
      headerSeen = true
      const header = /^(?:graph|flowchart)\b[ \t]*(TD|TB|BT|LR|RL)?\b[ \t]*;?/.exec(line)
      if (header) {
        const word = header[1] ?? 'TD'
        direction = word === 'LR' || word === 'RL' || word === 'BT' ? word : 'TD'
        const remainder = line.slice(header[0].length).trim()
        if (remainder === '') continue
        // `graph TD; A-->B` on one line: the rest is a statement
        for (const statement of splitStatements(remainder)) if (!parseStatement(statement)) ignoredLines += 1
        continue
      }
    }
    const group = /^subgraph(?:[ \t]+(.*))?$/.exec(line)
    if (group) {
      const rest = (group[1] ?? '').trim().replace(/;$/, '').trim()
      let id = `subgraph${subgraphs.length + 1}`
      let title = ''
      const named = /^([\w.\u0080-\uFFFF-]+)[ \t]*\[(.*)\]$/.exec(rest)
      if (named) { id = named[1]; title = cleanText(unquote(named[2])) }
      else if (rest !== '') { title = cleanText(unquote(rest)); if (/^[\w.\u0080-\uFFFF-]+$/.test(rest)) id = rest }
      subgraphs.push({ id, title: title || id, parent: open.length > 0 ? open[open.length - 1] : null, nodes: [] })
      open.push(subgraphs.length - 1)
      continue
    }
    if (open.length > 0 && /^end[ \t]*;?[ \t]*$/.test(line)) { open.pop(); continue }
    if (SKIPPED.test(line)) { ignoredLines += 1; continue }
    for (const statement of splitStatements(line)) if (!parseStatement(statement)) ignoredLines += 1
  }
  function parseStatement(statement: string): boolean {
    if (statement.startsWith('%%')) return true
    if (SKIPPED.test(statement)) return false
    const added: Array<[Declared[], Declared[], Link]> = []
    const first = parseGroup(statement, 0)
    if (!first) return false
    const declaredAll: Declared[] = [...first.nodes]
    let from = first.nodes
    let position = first.end
    for (;;) {
      while (statement[position] === ' ' || statement[position] === '\t') position += 1
      if (position >= statement.length) break
      const link = parseLink(statement, position)
      if (!link) return false
      const next = parseGroup(statement, link.end)
      if (!next) return false
      added.push([from, next.nodes, link.link])
      declaredAll.push(...next.nodes)
      from = next.nodes
      position = next.end
    }
    for (const declared of declaredAll) declare(declared)
    let skippedSelf = false
    for (const [sources, targets, link] of added) {
      for (const source of sources) for (const target of targets) {
        if (source.id === target.id) { skippedSelf = true; continue }
        edges.push({ from: source.id, to: target.id, ...(link.label ? { label: link.label } : {}), arrow: link.arrow, dashed: link.dashed, ...(link.twoWay ? { twoWay: true } : {}) })
      }
    }
    return !skippedSelf
  }
  // Links to or from a subgraph id are not drawn (a link needs a box at both ends).
  const groupIds = new Set(subgraphs.map((group) => group.id))
  if (groupIds.size > 0) {
    const kept = edges.filter((edge) => !groupIds.has(edge.from) && !groupIds.has(edge.to))
    ignoredLines += edges.length - kept.length
    edges.length = 0
    edges.push(...kept)
    for (const id of groupIds) nodes.delete(id)
    for (const group of subgraphs) group.nodes = group.nodes.filter((id) => nodes.has(id))
  }
  if (nodes.size === 0) return { ok: false, error: 'No flowchart nodes found. Start with “flowchart LR” or “graph TD”, then lines like A[Client] --> B[Server].' }
  if (nodes.size > MAX_MERMAID_NODES) return { ok: false, error: `Too many nodes (${nodes.size}); the limit is ${MAX_MERMAID_NODES}.` }
  return { ok: true, nodes: [...nodes.values()], edges, direction, ignoredLines, subgraphs }
}

const FONT_SIZE = 24
const MIN_WIDTH = 140
const MIN_HEIGHT = 70
const HLD_SHAPE_OF: Partial<Record<MermaidShape, HldShape>> = { database: 'database', service: 'service' }

function boxSize(node: MermaidNode): { width: number; height: number } {
  const label = measureTextSize(node.text, FONT_SIZE)
  const fit = (factorX: number, factorY: number) => ({ width: Math.max(MIN_WIDTH, Math.ceil((label.width + 48) * factorX / 10) * 10), height: Math.max(MIN_HEIGHT, Math.ceil((label.height + 36) * factorY / 10) * 10) })
  const hld = HLD_SHAPE_OF[node.shape]
  if (hld) {
    const base = HLD_DEFAULT_SIZE[hld]
    const plain = fit(1, 1)
    return { width: Math.max(Math.round(base.width * HLD_TEMPLATE_SCALE), plain.width), height: Math.max(Math.round(base.height * HLD_TEMPLATE_SCALE), plain.height) }
  }
  if (node.shape === 'ellipse') return fit(1.35, 1.35)
  if (node.shape === 'diamond') return fit(1.8, 1.8)
  return fit(1, 1)
}

/** Node ids ordered so the members of a subgraph are neighbours (loose nodes first, then each subgraph with its children), which helps the layout keep them together. */
function orderedNodes(graph: MermaidGraph): MermaidNode[] {
  const groups = graph.subgraphs ?? []
  if (groups.length === 0) return graph.nodes
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const placed = new Set<string>()
  const result: MermaidNode[] = []
  const take = (id: string) => { const node = byId.get(id); if (node && !placed.has(id)) { placed.add(id); result.push(node) } }
  const walk = (index: number) => {
    for (const id of groups[index].nodes) take(id)
    groups.forEach((group, child) => { if (group.parent === index) walk(child) })
  }
  const grouped = new Set(groups.flatMap((group) => group.nodes))
  for (const node of graph.nodes) if (!grouped.has(node.id)) take(node.id)
  groups.forEach((group, index) => { if (group.parent === null) walk(index) })
  for (const node of graph.nodes) take(node.id)
  return result
}

/** Items for the graph: boxes laid out by the Tidy layout (links flow in the graph's direction), centred labels, attached connectors. Local ids from 1, top-left at (0, 0). */
export function buildMermaidItems(graph: MermaidGraph): { items: CanvasItem[]; boxes: number; links: number } {
  const groups = graph.subgraphs ?? []
  const nodeList = orderedNodes(graph)
  const index = new Map(nodeList.map((node, position) => [node.id, position + 1]))
  const sizes = nodeList.map(boxSize)
  const sideways = graph.direction === 'LR' || graph.direction === 'RL'
  const reversed = graph.direction === 'BT' || graph.direction === 'RL'
  // LR and RL lay out the transposed boxes top-down and swap the axes back, so layers run left to right.
  const tidyNodes: TidyNode[] = nodeList.map((_, position) => ({ id: position + 1, x: position * 1000, y: 0, width: sideways ? sizes[position].height : sizes[position].width, height: sideways ? sizes[position].width : sizes[position].height }))
  const tidyEdges: TidyEdge[] = graph.edges.map((edge) => {
    const from = index.get(edge.from) as number
    const to = index.get(edge.to) as number
    return { a: from, b: to, upper: reversed ? to : from }
  })
  const placed = layoutBoxes(tidyNodes, tidyEdges)
  const at = (position: number) => {
    const spot = placed.get(position + 1) ?? { x: 0, y: 0 }
    return sideways ? { x: spot.y, y: spot.x } : spot
  }
  const left = Math.min(...nodeList.map((_, position) => at(position).x))
  const top = Math.min(...nodeList.map((_, position) => at(position).y))
  // Room on the left and top for the boundaries around the outermost boxes, so the whole drawing still starts at (0, 0).
  const depthOf = (group: number): number => (groups[group].parent === null ? 1 : 1 + depthOf(groups[group].parent as number))
  const owner = new Map<string, number>()
  groups.forEach((group, position) => group.nodes.forEach((id) => { if (!owner.has(id)) owner.set(id, position) }))
  const margin = Math.max(0, ...nodeList.map((node) => (owner.has(node.id) ? depthOf(owner.get(node.id) as number) : 0))) * BOUNDARY_PADDING
  const sheet = new Sheet()
  const boxes = new Map<string, RectangleObject>()
  nodeList.forEach((node, position) => {
    const spot = at(position)
    const x = Math.round(spot.x - left + margin)
    const y = Math.round(spot.y - top + margin)
    const { width, height } = sizes[position]
    const hld = HLD_SHAPE_OF[node.shape]
    boxes.set(node.id, hld ? sheet.hld(hld, x, y, node.text, { width, height }, hld === 'database' ? Math.round(20 * HLD_TEMPLATE_SCALE) : 0) : sheet.shaped(node.shape === 'ellipse' ? 'ellipse' : node.shape === 'diamond' ? 'diamond' : 'rectangle', x, y, width, height, node.text))
  })
  for (const edge of graph.edges) {
    const from = boxes.get(edge.from) as RectangleObject
    const to = boxes.get(edge.to) as RectangleObject
    const { fromSide, toSide } = facingSides(from, to)
    sheet.connect(from, fromSide, to, toSide, { type: edge.arrow ? 'directed-association' : 'association', ...(edge.arrow && edge.twoWay ? { twoWay: true as const } : {}), ...(edge.dashed ? { dash: 'dashed' as const } : {}), ...(edge.label ? { label: edge.label } : {}) })
  }
  const frames = buildSubgraphFrames(groups, boxes, sheet.items)
  return { items: [...frames.rectangles, ...sheet.items, ...frames.labels], boxes: nodeList.length, links: graph.edges.length }
}

/** One dashed unfilled rectangle (and a label at its top-left) per non-empty subgraph, inner ones inside outer ones. Rectangles run outer first, so they sit behind the boxes. */
function buildSubgraphFrames(groups: MermaidSubgraph[], boxes: Map<string, RectangleObject>, existing: CanvasItem[]): { rectangles: RectangleObject[]; labels: TextObject[] } {
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

/** The toast after inserting: "Inserted 3 boxes and 2 links", plus "(1 line ignored)". Class diagrams say "classes". */
export function mermaidInsertMessage(boxes: number, links: number, ignored: number, kind: 'flowchart' | 'class' | 'sequence' = 'flowchart'): string {
  const boxText = kind === 'class' ? `${boxes} ${boxes === 1 ? 'class' : 'classes'}`
    : kind === 'sequence' ? `${boxes} ${boxes === 1 ? 'participant' : 'participants'}`
    : `${boxes} ${boxes === 1 ? 'box' : 'boxes'}`
  const linkText = kind === 'sequence' ? `${links} ${links === 1 ? 'message' : 'messages'}` : `${links} ${links === 1 ? 'link' : 'links'}`
  return `Inserted ${boxText} and ${linkText}${ignored > 0 ? ` (${ignored} ${ignored === 1 ? 'line' : 'lines'} ignored)` : ''}`
}

/** Reads Mermaid text of any supported kind (flowchart / graph, classDiagram, sequenceDiagram) by its header and builds the items. */
export function buildMermaidDiagram(text: string): MermaidDiagramResult {
  const capped = text.slice(0, MAX_MERMAID_TEXT)
  const header = firstMermaidLine(capped)
  if (isMermaidClassText(header)) {
    const parsed = parseMermaidClass(capped)
    if (!parsed.ok) return parsed
    const built = buildMermaidClassItems(parsed)
    return { ok: true, items: built.items, boxes: built.boxes, links: built.links, ignoredLines: parsed.ignoredLines, kind: 'class' }
  }
  if (isMermaidSequenceText(header)) return buildMermaidSequence(capped)
  const parsed = parseMermaid(capped)
  if (!parsed.ok) return parsed
  const built = buildMermaidItems(parsed)
  return { ok: true, items: built.items, boxes: built.boxes, links: built.links, ignoredLines: parsed.ignoredLines, kind: 'flowchart' }
}
