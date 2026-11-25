import type { CanvasItem, HldShape, RectangleObject } from './canvasModel'
import { HLD_DEFAULT_SIZE } from './hldShapes'
import { HLD_TEMPLATE_SCALE, Sheet } from './diagramTemplates'
import { layoutBoxes, type TidyEdge, type TidyNode } from './tidyLayout'
import { measureTextSize } from './textLayout'

/**
 * Mermaid import ("Insert from Mermaid…" and pasting Mermaid text): reads a flowchart / graph and builds ordinary canvas items
 * (boxes with centred labels and attached connectors) for the same insert path the templates use. Nothing here is a new item kind.
 * Supported: node shapes `A[t]`, `A(t)`, `A([t])`, `A((t))`, `A{t}`, `A[(t)]` (Database), `A[[t]]` (Service), bare `A`;
 * links `-->`, `---`, `-.->`, `-.-`, `==>`, `--o`, `--x`, chains, `A & B --> C`, and labels (`|t|` or `-- t -->`).
 * Everything else (subgraph, end, classDef, class, style, linkStyle, click, direction) is skipped and counted.
 */
export type MermaidDirection = 'TD' | 'BT' | 'LR' | 'RL'
export type MermaidShape = 'rectangle' | 'ellipse' | 'diamond' | 'database' | 'service'
export type MermaidNode = { id: string; text: string; shape: MermaidShape }
export type MermaidEdge = { from: string; to: string; label?: string; arrow: boolean; dashed: boolean }
export type MermaidGraph = { nodes: MermaidNode[]; edges: MermaidEdge[]; direction: MermaidDirection; ignoredLines: number }
export type MermaidParse = ({ ok: true } & MermaidGraph) | { ok: false; error: string }

export const MAX_MERMAID_NODES = 150
const MAX_NODE_TEXT = 200
const SKIPPED = /^(subgraph|end|classDef|class|style|linkStyle|click|direction|accTitle|accDescr)\b/i
const HEADER = /^(?:graph|flowchart)[ \t]*(?:TD|TB|BT|LR|RL)?[ \t]*(?:;.*)?$/i

/** True when the first line that is not blank or a %% comment starts with `graph` or `flowchart`. */
export function isMermaidText(text: string): boolean {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('%%')) continue
    return HEADER.test(line)
  }
  return false
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

function cleanText(raw: string): string {
  return raw.replace(/<br\s*\/?>/gi, '\n').replace(/\\n/g, '\n').split('\n').map((line) => line.trim()).join('\n').trim().slice(0, MAX_NODE_TEXT)
}
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
type Link = { arrow: boolean; dashed: boolean; label?: string }

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
  if ((match = /^--[ \t]+(.+?)[ \t]+-{2,}([>ox])?(?![\w-])/.exec(rest))) return finish(match, { arrow: Boolean(match[2]), dashed: false }, 1)
  if ((match = /^-\.[ \t]+(.+?)[ \t]+\.+-(>)?(?![\w-])/.exec(rest))) return finish(match, { arrow: Boolean(match[2]), dashed: true }, 1)
  if ((match = /^==[ \t]+(.+?)[ \t]+={2,}(>)?(?![\w=])/.exec(rest))) return finish(match, { arrow: Boolean(match[2]), dashed: false }, 1)
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
  const declare = (declared: Declared) => {
    const known = nodes.get(declared.id)
    if (!known) nodes.set(declared.id, { id: declared.id, text: declared.text || declared.id, shape: declared.shape ?? 'rectangle' })
    else if (declared.shape !== undefined) nodes.set(declared.id, { id: declared.id, text: declared.text || declared.id, shape: declared.shape })
  }
  for (const rawLine of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('%%')) continue
    if (!headerSeen) {
      headerSeen = true
      const header = /^(?:graph|flowchart)\b[ \t]*(TD|TB|BT|LR|RL)?\b[ \t]*;?/i.exec(line)
      if (header) {
        const word = (header[1] ?? 'TD').toUpperCase()
        direction = word === 'LR' || word === 'RL' || word === 'BT' ? word : 'TD'
        const remainder = line.slice(header[0].length).trim()
        if (remainder === '') continue
        // `graph TD; A-->B` on one line: the rest is a statement
        for (const statement of splitStatements(remainder)) if (!parseStatement(statement)) ignoredLines += 1
        continue
      }
    }
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
        edges.push({ from: source.id, to: target.id, ...(link.label ? { label: link.label } : {}), arrow: link.arrow, dashed: link.dashed })
      }
    }
    return !skippedSelf
  }
  if (nodes.size === 0) return { ok: false, error: 'No flowchart nodes found. Start with “flowchart LR” or “graph TD”, then lines like A[Client] --> B[Server].' }
  if (nodes.size > MAX_MERMAID_NODES) return { ok: false, error: `Too many nodes (${nodes.size}); the limit is ${MAX_MERMAID_NODES}.` }
  return { ok: true, nodes: [...nodes.values()], edges, direction, ignoredLines }
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

/** Items for the graph: boxes laid out by the Tidy layout (links flow in the graph's direction), centred labels, attached connectors. Local ids from 1, top-left at (0, 0). */
export function buildMermaidItems(graph: MermaidGraph): { items: CanvasItem[]; boxes: number; links: number } {
  const index = new Map(graph.nodes.map((node, position) => [node.id, position + 1]))
  const sizes = graph.nodes.map(boxSize)
  const sideways = graph.direction === 'LR' || graph.direction === 'RL'
  const reversed = graph.direction === 'BT' || graph.direction === 'RL'
  // LR and RL lay out the transposed boxes top-down and swap the axes back, so layers run left to right.
  const tidyNodes: TidyNode[] = graph.nodes.map((_, position) => ({ id: position + 1, x: position * 1000, y: 0, width: sideways ? sizes[position].height : sizes[position].width, height: sideways ? sizes[position].width : sizes[position].height }))
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
  const left = Math.min(...graph.nodes.map((_, position) => at(position).x))
  const top = Math.min(...graph.nodes.map((_, position) => at(position).y))
  const sheet = new Sheet()
  const boxes = new Map<string, RectangleObject>()
  graph.nodes.forEach((node, position) => {
    const spot = at(position)
    const x = Math.round(spot.x - left)
    const y = Math.round(spot.y - top)
    const { width, height } = sizes[position]
    const hld = HLD_SHAPE_OF[node.shape]
    boxes.set(node.id, hld ? sheet.hld(hld, x, y, node.text, { width, height }, hld === 'database' ? Math.round(20 * HLD_TEMPLATE_SCALE) : 0) : sheet.shaped(node.shape === 'ellipse' ? 'ellipse' : node.shape === 'diamond' ? 'diamond' : 'rectangle', x, y, width, height, node.text))
  })
  for (const edge of graph.edges) {
    const from = boxes.get(edge.from) as RectangleObject
    const to = boxes.get(edge.to) as RectangleObject
    const dx = to.x + to.width / 2 - (from.x + from.width / 2)
    const dy = to.y + to.height / 2 - (from.y + from.height / 2)
    const horizontal = Math.abs(dx) * 0.6 > Math.abs(dy)
    const fromSide = horizontal ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top')
    const toSide = horizontal ? (dx >= 0 ? 'left' : 'right') : (dy >= 0 ? 'top' : 'bottom')
    sheet.connect(from, fromSide, to, toSide, { type: edge.arrow ? 'directed-association' : 'association', ...(edge.dashed ? { dash: 'dashed' as const } : {}), ...(edge.label ? { label: edge.label } : {}) })
  }
  return { items: sheet.items, boxes: graph.nodes.length, links: graph.edges.length }
}

/** The toast after inserting: "Inserted 3 boxes and 2 links", plus "(1 line ignored)". */
export function mermaidInsertMessage(boxes: number, links: number, ignored: number): string {
  const boxText = `${boxes} ${boxes === 1 ? 'box' : 'boxes'}`
  const linkText = `${links} ${links === 1 ? 'link' : 'links'}`
  return `Inserted ${boxText} and ${linkText}${ignored > 0 ? ` (${ignored} ${ignored === 1 ? 'line' : 'lines'} ignored)` : ''}`
}
