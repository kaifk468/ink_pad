import type { CanvasItem, ConnectorRelationshipType, RectangleBounds, RectangleObject } from './canvasModel'
import { BOUNDARY_PADDING } from './boundary'
import { getClassBoxGeometry } from './classBoxLayout'
import { buildSubgraphFrames, separateFromBoundaries, type MermaidSubgraph } from './mermaidBoundaries'
import { measureTextSize } from './textLayout'
import { Sheet } from './diagramTemplates'
import { decodeMermaidEntities, facingSides, MAX_MERMAID_NODES, MAX_MERMAID_TEXT, normalizeMermaidSpaces, stripMermaidFrontMatter } from './mermaidCommon'
import { layoutBoxes, type TidyEdge, type TidyNode } from './tidyLayout'

/**
 * Mermaid `classDiagram` import: typed class boxes (name, attributes, methods) and UML connectors, built from ordinary canvas items.
 * Supported: `class A`, `class A { ... }` bodies, `A : +member` lines, generics `A~T~` (shown A<T>), annotations `<<interface>>`
 * (shown as a «interface» first line of the name), relationships `<|--`, `--|>`, `<|..`, `..|>`, `*--`, `--*`, `o--`, `--o`, `-->`, `<--`,
 * `..>`, `<..`, `--`, `..` with optional cardinality strings (`A "1" --> "*" B`: kept as the connector's start / end labels, each next to its
 * own class) and a `: label`. `namespace N { class A }` becomes a dashed boundary titled N around its classes; `note for A "text"` a sticky note
 * beside A and `note "text"` one at the top-left.
 * Skipped and counted: direction, click, style, classDef, cssClass, link, callback, accTitle, accDescr and unreadable lines. `%%` comments are free.
 */
export type MermaidClass = { id: string; name: string; annotation?: string; attributes: string[]; methods: string[]; /** The `namespace` block that declares the class. */ namespace?: string }
/** `note for A "text"` (target = A) or `note "text"` (no target). */
export type MermaidClassNote = { target?: string; text: string }
/** `from` -> `to` is the connector direction as built: the symbol (triangle, arrow head) is at `to`, a diamond at `from` for aggregation / composition. */
export type MermaidRelation = { from: string; to: string; type: ConnectorRelationshipType; dashed: boolean; label?: string; twoWay?: true; /** Cardinality text next to the `from` / `to` class. */ startLabel?: string; endLabel?: string }
export type MermaidClassParse = { ok: true; classes: MermaidClass[]; relations: MermaidRelation[]; notes: MermaidClassNote[]; ignoredLines: number } | { ok: false; error: string }

const MAX_MEMBER_LENGTH = 120
const HEADER = /^classDiagram(?:-v2)?[ \t]*;?[ \t]*$/
const SKIPPED = /^(?:direction\b|click\b|style\b|classDef\b|cssClass\b|link\b|callback\b|accTitle\b|accDescr\b)/
const ID = '(?:`[^`]+`|[\\w.\\u0080-\\uFFFF]+)(?:~[^~\\s][^\\s]*~)?'
const RELATION = new RegExp(`^(${ID})[ \\t]*(?:"([^"]*)"[ \\t]*)?(<\\||\\*|o|<)?(--|\\.\\.)(\\|>|\\*|o|>)?[ \\t]*(?:"([^"]*)"[ \\t]*)?(${ID})[ \\t]*(?::[ \\t]*(.*))?$`)
const MEMBER_LINE = new RegExp(`^(${ID})[ \\t]*:[ \\t]*(.+)$`)
const CLASS_LINE = new RegExp(`^class[ \\t]+(${ID})(?:[ \\t]*\\[("[^"]*"|[^\\]]*)\\])?(?::::[\\w-]+)?[ \\t]*(\\{)?[ \\t]*(.*)$`)
const NAMESPACE = /^namespace[ \t]+([^\s{]+)[ \t]*(\{)?[ \t]*(.*)$/
const NOTE_FOR = new RegExp(`^note[ \\t]+for[ \\t]+(${ID})[ \\t]+"([^"]*)"$`)
const NOTE_FLOATING = /^note[ \t]+"([^"]*)"$/
const MAX_CARDINALITY = 24
const MAX_NOTE = 300
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
  let namespace = ''
  let pendingNamespace = ''
  const notes: MermaidClassNote[] = []
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
    if (line === '}' && inNamespace) { inNamespace = false; namespace = ''; continue }
    if (line === '{' && pendingNamespace) { inNamespace = true; namespace = pendingNamespace; pendingNamespace = ''; continue }
    const spaced = NAMESPACE.exec(line)
    if (spaced) {
      const name = decodeMermaidEntities(spaced[1].replace(/^["`]|["`]$/g, '')).trim()
      if (spaced[2]) { inNamespace = true; namespace = name; pendingNamespace = '' } else pendingNamespace = name
      if (spaced[3].trim() !== '') ignoredLines += 1
      continue
    }
    const noteFor = NOTE_FOR.exec(line)
    const noteFloating = noteFor ? null : NOTE_FLOATING.exec(line)
    if (noteFor || noteFloating) {
      const text = noteText((noteFor ? noteFor[2] : noteFloating?.[1]) ?? '')
      if (text === '') { ignoredLines += 1; continue }
      notes.push(noteFor ? { target: classNames(noteFor[1]).key, text } : { text })
      continue
    }
    if (SKIPPED.test(line)) { ignoredLines += 1; continue }
    const declared = CLASS_LINE.exec(line)
    if (declared) {
      const target = ensure(declared[1])
      if (namespace) target.namespace = namespace
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
      const [, leftRaw, leftCard, leftHead, stroke, rightHead, rightCard, rightRaw, label] = relation
      const left = ensure(leftRaw)
      const right = ensure(rightRaw)
      if (left === right) { ignoredLines += 1; continue }
      const dashed = stroke === '..'
      const text = label ? cleanMember(label) : ''
      const labelPart = text ? { label: text.slice(0, 200) } : {}
      // Connector start -> end; the renderer puts triangles and arrow heads at the end, diamonds at the start.
      // Each cardinality stays next to its own class, whichever way the arrow ends up pointing.
      const cardOf = (side: MermaidClass): string => cleanMember(side === left ? leftCard ?? '' : rightCard ?? '').slice(0, MAX_CARDINALITY)
      const make = (from: MermaidClass, to: MermaidClass, type: ConnectorRelationshipType, dash = false, twoWay = false): void => {
        const startLabel = cardOf(from)
        const endLabel = cardOf(to)
        relations.push({ from: from.id, to: to.id, type, dashed: dash, ...(twoWay ? { twoWay: true as const } : {}), ...labelPart, ...(startLabel ? { startLabel } : {}), ...(endLabel ? { endLabel } : {}) })
      }
      if (leftHead === '<' && rightHead === '>' && !dashed) make(left, right, 'directed-association', false, true)
      else if (leftHead && rightHead) make(left, right, 'association', dashed)
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
  const known = new Set(classes.keys())
  return { ok: true, classes: [...classes.values()], relations, notes: notes.map((note) => (note.target !== undefined && !known.has(note.target) ? { text: note.text } : note)), ignoredLines }
}

/** Note text: `\n` and `<br>` are line breaks, entities decoded, capped. */
function noteText(raw: string): string {
  return decodeMermaidEntities(raw.replace(/<br\s*\/?>|\\n/gi, '\n')).split('\n').map((line) => line.trim()).join('\n').trim().slice(0, MAX_NOTE)
}

/** The name compartment: «annotation» on its own first line, then the name. */
function nameText(entry: MermaidClass): string {
  return entry.annotation ? `«${entry.annotation}»\n${entry.name}` : entry.name
}

const NOTE_FONT = 20
const NOTE_GAP = 30
const NOTE_MAX_LINE = 30
/** Extra space between the floating notes and the diagram, so Copy as Mermaid can tell them from a note beside a class. */
const FLOATING_CLEARANCE = 60

/** Long note lines wrap at word boundaries so a note stays a reasonable width. */
function wrapNote(text: string): string {
  return text.split('\n').map((line) => {
    const out: string[] = []
    let current = ''
    for (const word of line.split(' ')) {
      if (current !== '' && current.length + 1 + word.length > NOTE_MAX_LINE) { out.push(current); current = word } else current = current === '' ? word : `${current} ${word}`
    }
    out.push(current)
    return out.join('\n')
  }).join('\n')
}

function noteSize(text: string): { width: number; height: number } {
  const label = measureTextSize(text, NOTE_FONT)
  return { width: Math.max(140, Math.ceil((label.width + 40) / 10) * 10), height: Math.max(60, Math.ceil((label.height + 30) / 10) * 10) }
}

const overlaps = (a: RectangleBounds, b: RectangleBounds, gap = 0): boolean => a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap
const contains = (outer: RectangleBounds, inner: RectangleBounds): boolean => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height

/** Class boxes sized to their content, laid out by Tidy (a parent or whole above its children), with attached UML connectors. Top-left at (0, 0). Namespaces are dashed boundaries; notes are sticky notes. */
export function buildMermaidClassItems(parsed: { classes: MermaidClass[]; relations: MermaidRelation[]; notes?: MermaidClassNote[] }): { items: CanvasItem[]; boxes: number; links: number } {
  // Classes of a namespace sit next to each other (loose classes first), which helps the layout keep them together.
  const spaces: string[] = []
  for (const entry of parsed.classes) if (entry.namespace && !spaces.includes(entry.namespace)) spaces.push(entry.namespace)
  const classes = [...parsed.classes.filter((entry) => !entry.namespace), ...spaces.flatMap((space) => parsed.classes.filter((entry) => entry.namespace === space))]
  const groups: MermaidSubgraph[] = spaces.map((space) => ({ id: space, title: space, parent: null, nodes: classes.filter((entry) => entry.namespace === space).map((entry) => entry.id) }))
  const contents = classes.map((entry) => ({ name: nameText(entry), attributes: entry.attributes.join('\n'), methods: entry.methods.join('\n') }))
  const index = new Map(classes.map((entry, position) => [entry.id, position + 1]))
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
  // Notes without a class sit above the diagram, on the left: the layout starts below them. Boundaries need room on the left and top.
  const floating = (parsed.notes ?? []).filter((note) => note.target === undefined || !index.has(note.target)).map((note) => ({ text: wrapNote(note.text) }))
  const floatingSizes = floating.map((note) => noteSize(note.text))
  const floatingHeight = floatingSizes.length === 0 ? 0 : floatingSizes.reduce((sum, size) => sum + size.height + NOTE_GAP, 0) + FLOATING_CLEARANCE
  const margin = groups.length > 0 ? BOUNDARY_PADDING : 0
  const spots = classes.map((_, position) => { const spot = placed.get(position + 1) ?? { x: 0, y: 0 }; return { x: Math.round(spot.x - left + margin), y: Math.round(spot.y - top + margin + floatingHeight) } })
  separateFromBoundaries(groups, classes, spots, sizes, false)
  const sheet = new Sheet()
  const boxes = new Map<string, RectangleObject>()
  classes.forEach((entry, position) => {
    boxes.set(entry.id, sheet.classBox(spots[position].x, spots[position].y, contents[position].name, contents[position].attributes, contents[position].methods))
  })
  for (const relation of parsed.relations) {
    const from = boxes.get(relation.from) as RectangleObject
    const to = boxes.get(relation.to) as RectangleObject
    const { fromSide, toSide } = facingSides(from, to)
    sheet.connect(from, fromSide, to, toSide, { type: relation.type, ...(relation.twoWay ? { twoWay: true as const } : {}), ...(relation.dashed ? { dash: 'dashed' as const } : {}), ...(relation.label ? { label: relation.label } : {}), ...(relation.startLabel ? { startLabel: relation.startLabel } : {}), ...(relation.endLabel ? { endLabel: relation.endLabel } : {}) })
  }
  // Notes: floating ones stacked at the top-left; a note for a class goes beside it, on the first free spot that crosses no box, note or boundary edge.
  const noteRects: RectangleBounds[] = []
  let noteTop = 0
  floating.forEach((note, position) => {
    const { width, height } = floatingSizes[position]
    sheet.sticky(0, noteTop, width, height, note.text)
    noteRects.push({ x: 0, y: noteTop, width, height })
    noteTop += height + NOTE_GAP
  })
  const frameRects = buildSubgraphFrames(groups, boxes, sheet.items).rectangles
  const obstacles = [...boxes.values()]
  for (const note of (parsed.notes ?? []).filter((entry) => entry.target !== undefined && index.has(entry.target))) {
    const target = boxes.get(note.target as string) as RectangleObject
    const text = wrapNote(note.text)
    const { width, height } = noteSize(text)
    const free = (rect: RectangleBounds): boolean =>
      !obstacles.some((box) => overlaps(rect, box, box === target ? 10 : NOTE_GAP + 10)) && !noteRects.some((other) => overlaps(rect, other, 10)) && !frameRects.some((frame) => overlaps(rect, frame) && !contains(frame, rect))
    let spot: RectangleBounds | null = null
    for (let column = 0; column < 4 && !spot; column += 1) {
      const sides = [target.x + target.width + NOTE_GAP + column * (width + NOTE_GAP), target.x - NOTE_GAP - width - column * (width + NOTE_GAP)]
      for (const row of [0, 1, -1, 2, -2]) {
        for (const x of sides) {
          const candidate = { x, y: target.y + row * (height + 20), width, height }
          if (!spot && free(candidate)) spot = candidate
        }
        if (spot) break
      }
    }
    const at = spot ?? { x: target.x + target.width + NOTE_GAP, y: target.y, width, height }
    sheet.sticky(at.x, at.y, width, height, text)
    noteRects.push(at)
  }
  const frames = buildSubgraphFrames(groups, boxes, sheet.items)
  return { items: [...frames.rectangles, ...sheet.items, ...frames.labels], boxes: classes.length, links: parsed.relations.length }
}
