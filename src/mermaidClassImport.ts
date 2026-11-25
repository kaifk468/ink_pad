import type { CanvasItem, ConnectorRelationshipType, RectangleObject } from './canvasModel'
import { getClassBoxGeometry } from './classBoxLayout'
import { Sheet } from './diagramTemplates'
import { decodeMermaidEntities, facingSides, MAX_MERMAID_NODES, MAX_MERMAID_TEXT, normalizeMermaidSpaces, stripMermaidFrontMatter } from './mermaidCommon'
import { layoutBoxes, type TidyEdge, type TidyNode } from './tidyLayout'

/**
 * Mermaid `classDiagram` import: typed class boxes (name, attributes, methods) and UML connectors, built from ordinary canvas items.
 * Supported: `class A`, `class A { ... }` bodies, `A : +member` lines, generics `A~T~` (shown A<T>), annotations `<<interface>>`
 * (shown as a «interface» first line of the name), relationships `<|--`, `--|>`, `<|..`, `..|>`, `*--`, `--*`, `o--`, `--o`, `-->`, `<--`,
 * `..>`, `<..`, `--`, `..` with optional cardinality strings (ignored) and a `: label`.
 * Skipped and counted: note, namespace, direction, click, style, classDef, cssClass, link, callback, accTitle, accDescr and unreadable lines. `%%` comments are free.
 */
export type MermaidClass = { id: string; name: string; annotation?: string; attributes: string[]; methods: string[] }
/** `from` -> `to` is the connector direction as built: the symbol (triangle, arrow head) is at `to`, a diamond at `from` for aggregation / composition. */
export type MermaidRelation = { from: string; to: string; type: ConnectorRelationshipType; dashed: boolean; label?: string }
export type MermaidClassParse = { ok: true; classes: MermaidClass[]; relations: MermaidRelation[]; ignoredLines: number } | { ok: false; error: string }

const MAX_MEMBER_LENGTH = 120
const HEADER = /^classDiagram(?:-v2)?[ \t]*;?[ \t]*$/
const SKIPPED = /^(?:note\b|direction\b|click\b|style\b|classDef\b|cssClass\b|link\b|callback\b|accTitle\b|accDescr\b)/
const ID = '(?:`[^`]+`|[\\w.\\u0080-\\uFFFF]+)(?:~[^~\\s][^\\s]*~)?'
const RELATION = new RegExp(`^(${ID})[ \\t]*(?:"([^"]*)"[ \\t]*)?(<\\||\\*|o|<)?(--|\\.\\.)(\\|>|\\*|o|>)?[ \\t]*(?:"([^"]*)"[ \\t]*)?(${ID})[ \\t]*(?::[ \\t]*(.*))?$`)
const MEMBER_LINE = new RegExp(`^(${ID})[ \\t]*:[ \\t]*(.+)$`)
const CLASS_LINE = new RegExp(`^class[ \\t]+(${ID})(?:[ \\t]*\\[("[^"]*"|[^\\]]*)\\])?(?::::[\\w-]+)?[ \\t]*(\\{)?[ \\t]*(.*)$`)
const ANNOTATION = /^<<\s*([^>]+?)\s*>>$/

/** True for the `classDiagram` / `classDiagram-v2` header line. */
export const isMermaidClassText = (line: string): boolean => HEADER.test(line.trim())

/** `List~List~int~~` -> `List<List<int>>`: a tilde opens when a word character follows and closes otherwise. */
function genericsToAngles(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char !== '~') { out += char; continue }
    const prev = text[i - 1] ?? ''
    const next = text[i + 1] ?? ''
    out += prev === '~' || next === '' || next === '~' || !/[\w\u0080-￿]/.test(next) || !/[\w\u0080-￿>]/.test(prev) ? '>' : '<'
  }
  return out
}
const cleanMember = (raw: string): string => genericsToAngles(decodeMermaidEntities(raw.replace(/<br\s*\/?>/gi, ' ').trim())).trim().slice(0, MAX_MEMBER_LENGTH)
/** Class key (no generics, no backticks) and the displayed name (with <T>). */
function classNames(raw: string): { key: string; name: string } {
  const unticked = raw.replace(/`/g, '')
  const generic = /^([^~]*)(~.*)$/.exec(unticked)
  return generic ? { key: generic[1], name: genericsToAngles(unticked) } : { key: unticked, name: unticked }
}

/** Reads Mermaid class diagram text. Returns the classes, relations and the number of lines skipped, or an error. */
export function parseMermaidClass(text: string): MermaidClassParse {
  const classes = new Map<string, MermaidClass>()
  const relations: MermaidRelation[] = []
  let ignoredLines = 0
  let headerSeen = false
  let body: MermaidClass | null = null
  let inNamespace = false
  const ensure = (raw: string): MermaidClass => {
    const { key, name } = classNames(raw)
    let known = classes.get(key)
    if (!known) { known = { id: key, name, attributes: [], methods: [] }; classes.set(key, known) } else if (name !== key && known.name === key) known.name = name
    return known
  }
  const addMember = (target: MermaidClass, raw: string): void => {
    const member = raw.trim()
    if (member === '') return
    const note = ANNOTATION.exec(member)
    if (note) { target.annotation = note[1]; return }
    const clean = cleanMember(member)
    if (clean === '') return
    ;(clean.includes('(') ? target.methods : target.attributes).push(clean)
  }
  for (const rawLine of stripMermaidFrontMatter(normalizeMermaidSpaces(text.slice(0, MAX_MERMAID_TEXT)).replace(/^﻿/, '')).split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('%%')) continue
    if (!headerSeen) {
      headerSeen = true
      if (HEADER.test(line)) continue
    }
    if (body) {
      const close = line.indexOf('}')
      if (close === -1) addMember(body, line)
      else { if (close > 0) addMember(body, line.slice(0, close)); body = null }
      continue
    }
    if (line === '}' && inNamespace) { inNamespace = false; continue }
    if (/^namespace\b/.test(line)) { ignoredLines += 1; if (line.includes('{')) inNamespace = true; continue }
    if (SKIPPED.test(line)) { ignoredLines += 1; continue }
    const declared = CLASS_LINE.exec(line)
    if (declared) {
      const target = ensure(declared[1])
      const label = declared[2] ? decodeMermaidEntities(declared[2].replace(/^"|"$/g, '')).trim() : ''
      if (label) target.name = label
      const rest = (declared[4] ?? '').trim()
      if (declared[3]) {
        const close = rest.indexOf('}')
        if (close === -1) { if (rest !== '') addMember(target, rest); body = target } else for (const part of rest.slice(0, close).split(';')) addMember(target, part)
      } else if (rest !== '') ignoredLines += 1
      continue
    }
    const tagged = /^(<<\s*[^>]+?\s*>>)[ \t]+(.+)$/.exec(line)
    if (tagged) { addMember(ensure(tagged[2].trim()), tagged[1]); continue }
    const relation = RELATION.exec(line)
    if (relation) {
      const [, leftRaw, , leftHead, stroke, rightHead, , rightRaw, label] = relation
      const left = ensure(leftRaw)
      const right = ensure(rightRaw)
      if (left === right) { ignoredLines += 1; continue }
      const dashed = stroke === '..'
      const text = label ? cleanMember(label) : ''
      const labelPart = text ? { label: text.slice(0, 200) } : {}
      // Connector start -> end; the renderer puts triangles and arrow heads at the end, diamonds at the start.
      const make = (from: MermaidClass, to: MermaidClass, type: ConnectorRelationshipType, dash = false): void => {
        relations.push({ from: from.id, to: to.id, type, dashed: dash, ...labelPart })
      }
      if (leftHead && rightHead) make(left, right, 'association', dashed)
      else if (leftHead === '<|') make(right, left, dashed ? 'realization' : 'inheritance')
      else if (rightHead === '|>') make(left, right, dashed ? 'realization' : 'inheritance')
      else if (leftHead === '*') make(left, right, 'composition')
      else if (rightHead === '*') make(right, left, 'composition')
      else if (leftHead === 'o') make(left, right, 'aggregation')
      else if (rightHead === 'o') make(right, left, 'aggregation')
      else if (leftHead === '<') make(right, left, dashed ? 'dependency' : 'directed-association')
      else if (rightHead === '>') make(left, right, dashed ? 'dependency' : 'directed-association')
      else make(left, right, 'association', dashed)
      continue
    }
    const member = MEMBER_LINE.exec(line)
    if (member) { addMember(ensure(member[1]), member[2]); continue }
    ignoredLines += 1
  }
  if (classes.size === 0) return { ok: false, error: 'No classes found. Start with “classDiagram”, then lines like class Animal or Animal <|-- Dog.' }
  if (classes.size > MAX_MERMAID_NODES) return { ok: false, error: `Too many classes (${classes.size}); the limit is ${MAX_MERMAID_NODES}.` }
  return { ok: true, classes: [...classes.values()], relations, ignoredLines }
}

/** The name compartment: «annotation» on its own first line, then the name. */
function nameText(entry: MermaidClass): string {
  return entry.annotation ? `«${entry.annotation}»\n${entry.name}` : entry.name
}

/** Class boxes sized to their content, laid out by Tidy (a parent or whole above its children), with attached UML connectors. Top-left at (0, 0). */
export function buildMermaidClassItems(parsed: { classes: MermaidClass[]; relations: MermaidRelation[] }): { items: CanvasItem[]; boxes: number; links: number } {
  const contents = parsed.classes.map((entry) => ({ name: nameText(entry), attributes: entry.attributes.join('\n'), methods: entry.methods.join('\n') }))
  const index = new Map(parsed.classes.map((entry, position) => [entry.id, position + 1]))
  const sizes = contents.map((content) => { const geometry = getClassBoxGeometry({ x: 0, y: 0, width: 0, height: 0 }, content); return { width: geometry.minWidth, height: geometry.minHeight } })
  const tidyNodes: TidyNode[] = sizes.map((size, position) => ({ id: position + 1, x: position * 1000, y: 0, ...size }))
  const tidyEdges: TidyEdge[] = parsed.relations.map((relation) => {
    const from = index.get(relation.from) as number
    const to = index.get(relation.to) as number
    // The triangle / arrow end is the parent (above); a diamond sits on the whole (above).
    const diamond = relation.type === 'aggregation' || relation.type === 'composition'
    return { a: from, b: to, upper: diamond ? from : to }
  })
  const placed = layoutBoxes(tidyNodes, tidyEdges)
  const left = Math.min(...tidyNodes.map((node) => placed.get(node.id)?.x ?? 0))
  const top = Math.min(...tidyNodes.map((node) => placed.get(node.id)?.y ?? 0))
  const sheet = new Sheet()
  const boxes = new Map<string, RectangleObject>()
  parsed.classes.forEach((entry, position) => {
    const spot = placed.get(position + 1) ?? { x: 0, y: 0 }
    const box = sheet.classBox(Math.round(spot.x - left), Math.round(spot.y - top), contents[position].name, contents[position].attributes, contents[position].methods)
    boxes.set(entry.id, box)
  })
  for (const relation of parsed.relations) {
    const from = boxes.get(relation.from) as RectangleObject
    const to = boxes.get(relation.to) as RectangleObject
    const { fromSide, toSide } = facingSides(from, to)
    sheet.connect(from, fromSide, to, toSide, { type: relation.type, ...(relation.dashed ? { dash: 'dashed' as const } : {}), ...(relation.label ? { label: relation.label } : {}) })
  }
  return { items: sheet.items, boxes: parsed.classes.length, links: parsed.relations.length }
}
