import type { CanvasItem, RectangleObject } from './canvasModel'
import { getClassBoxGeometry } from './classBoxLayout'
import { Sheet } from './diagramTemplates'
import { decodeMermaidEntities, facingSides, MAX_MERMAID_NODES, MAX_MERMAID_TEXT, normalizeMermaidSpaces, stripMermaidFrontMatter } from './mermaidCommon'
import type { MermaidDiagramResult } from './mermaidSequenceImport'
import { layoutBoxes, type TidyEdge, type TidyNode } from './tidyLayout'

/**
 * Mermaid `erDiagram` import: one typed class box per entity (name; one attribute line each, e.g. "PK id: int") and one association
 * connector per relationship, labelled with the verb, with the crow's-foot ends as cardinality text on the connector
 * (`||` 1, `|o`/`o|` 0..1, `}|`/`|{` 1..*, `}o`/`o{` 0..*). `..` (non-identifying) is dashed. Built from ordinary canvas items.
 * Skipped and counted: title, direction, style, classDef, class, accTitle, accDescr, self relationships and unreadable lines. `%%` comments are free.
 */
export type ErEntity = { id: string; name: string; attributes: string[] }
export type ErRelation = { from: string; to: string; dashed: boolean; label?: string; startLabel: string; endLabel: string }
export type ErParse = { ok: true; entities: ErEntity[]; relations: ErRelation[]; ignoredLines: number } | { ok: false; error: string }

const HEADER = /^erDiagram[ \t]*;?[ \t]*$/
const NAME = '[\\p{L}\\p{N}_.\\-]+|"[^"]+"'
const ENTITY = `(?:${NAME})(?:\\[(?:"[^"]*"|[^\\]]*)\\])?`
const MARKER = '(?:\\|\\||\\|o|o\\||\\}\\||\\}o|\\|\\{|o\\{)'
const RELATION = new RegExp(`^(${ENTITY})\\s*(${MARKER})(--|\\.\\.)(${MARKER})\\s*(${ENTITY})\\s*(?::\\s*(.*))?$`, 'u')
const ENTITY_ONLY = new RegExp(`^(${ENTITY})\\s*(\\{)?\\s*(.*)$`, 'u')
const SKIPPED = /^(?:title\b|direction\b|style\b|classDef\b|class\b|accTitle\b|accDescr\b|click\b|link\b)/
const ATTRIBUTE = /^(\S+)\s+(\S+)(?:\s+((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*))?(?:\s+"([^"]*)")?\s*$/
const MAX_LINE = 120

/** Cardinality text of one crow's-foot marker (either orientation). */
export function erCardinality(marker: string): string {
  if (marker === '||') return '1'
  if (marker === '|o' || marker === 'o|') return '0..1'
  if (marker === '}|' || marker === '|{') return '1..*'
  return '0..*'
}

/** True for the `erDiagram` header line. */
export const isMermaidErText = (line: string): boolean => HEADER.test(line.trim())

/** `NAME`, `NAME["Alias"]` -> id and shown name. */
function entityRef(raw: string): { id: string; name: string } {
  const text = raw.trim()
  const aliased = /^(.*?)\[(.*)\]$/.exec(text)
  const unquote = (value: string) => value.trim().replace(/^"(.*)"$/, '$1')
  if (!aliased) { const id = unquote(text); return { id, name: id } }
  const id = unquote(aliased[1])
  const name = decodeMermaidEntities(unquote(aliased[2])).trim()
  return { id, name: name === '' ? id : name }
}

/** "PK id: int", "PK, FK a_id: int", "name: string". */
function attributeLine(raw: string): string | null {
  const match = ATTRIBUTE.exec(raw.trim())
  if (!match) return null
  const keys = match[3] ? match[3].split(',').map((key) => key.trim()).join(', ') : ''
  return `${keys ? `${keys} ` : ''}${decodeMermaidEntities(match[2])}: ${decodeMermaidEntities(match[1])}`.slice(0, MAX_LINE)
}

/** Reads Mermaid erDiagram text. */
export function parseMermaidEr(text: string): ErParse {
  const entities = new Map<string, ErEntity>()
  const relations: ErRelation[] = []
  let ignoredLines = 0
  let headerSeen = false
  let body: ErEntity | null = null
  const ensure = (raw: string): ErEntity => {
    const { id, name } = entityRef(raw)
    let known = entities.get(id)
    if (!known) { known = { id, name, attributes: [] }; entities.set(id, known) } else if (name !== id && known.name === known.id) known.name = name
    return known
  }
  const addAttribute = (target: ErEntity, raw: string): void => {
    if (raw.trim() === '') return
    const line = attributeLine(raw)
    if (line) target.attributes.push(line)
    else ignoredLines += 1
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
      if (close === -1) addAttribute(body, line)
      else { if (close > 0) addAttribute(body, line.slice(0, close)); body = null }
      continue
    }
    if (SKIPPED.test(line)) { ignoredLines += 1; continue }
    const relation = RELATION.exec(line)
    if (relation) {
      const left = ensure(relation[1])
      const right = ensure(relation[5])
      if (left === right) { ignoredLines += 1; continue }
      const label = relation[6] ? decodeMermaidEntities(relation[6].trim().replace(/^"(.*)"$/, '$1')).trim().slice(0, 200) : ''
      relations.push({ from: left.id, to: right.id, dashed: relation[3] === '..', ...(label ? { label } : {}), startLabel: erCardinality(relation[2]), endLabel: erCardinality(relation[4]) })
      continue
    }
    const declared = ENTITY_ONLY.exec(line)
    if (declared) {
      const rest = declared[3].trim()
      if (!declared[2] && rest !== '') { ignoredLines += 1; continue }
      const target = ensure(declared[1])
      if (declared[2]) {
        const close = rest.indexOf('}')
        if (close === -1) { if (rest !== '') addAttribute(target, rest); body = target } else for (const part of rest.slice(0, close).split(';')) addAttribute(target, part)
      } else if (rest !== '') ignoredLines += 1
      continue
    }
    ignoredLines += 1
  }
  if (entities.size === 0) return { ok: false, error: 'No entities found. Start with “erDiagram”, then lines like CUSTOMER ||--o{ ORDER : places.' }
  if (entities.size > MAX_MERMAID_NODES) return { ok: false, error: `Too many entities (${entities.size}); the limit is ${MAX_MERMAID_NODES}.` }
  return { ok: true, entities: [...entities.values()], relations, ignoredLines }
}

/** Entity boxes sized to their content, laid out left to right by Tidy, with attached association connectors. Top-left at (0, 0). */
export function buildMermaidErItems(parsed: { entities: ErEntity[]; relations: ErRelation[] }): { items: CanvasItem[]; boxes: number; links: number } {
  const index = new Map(parsed.entities.map((entity, position) => [entity.id, position + 1]))
  const sizes = parsed.entities.map((entity) => { const geometry = getClassBoxGeometry({ x: 0, y: 0, width: 0, height: 0 }, { name: entity.name, attributes: entity.attributes.join('\n'), methods: '' }); return { width: geometry.minWidth, height: geometry.minHeight } })
  // Laid out transposed (top-down), then the axes are swapped back so relationships flow left to right.
  const tidyNodes: TidyNode[] = sizes.map((size, position) => ({ id: position + 1, x: position * 1000, y: 0, width: size.height, height: size.width }))
  const tidyEdges: TidyEdge[] = parsed.relations.map((relation) => ({ a: index.get(relation.from) as number, b: index.get(relation.to) as number, upper: index.get(relation.from) as number }))
  const placed = layoutBoxes(tidyNodes, tidyEdges)
  const at = (position: number) => { const spot = placed.get(position + 1) ?? { x: 0, y: 0 }; return { x: spot.y, y: spot.x } }
  const left = Math.min(...parsed.entities.map((_, position) => at(position).x))
  const top = Math.min(...parsed.entities.map((_, position) => at(position).y))
  const sheet = new Sheet()
  const boxes = new Map<string, RectangleObject>()
  parsed.entities.forEach((entity, position) => {
    boxes.set(entity.id, sheet.classBox(Math.round(at(position).x - left), Math.round(at(position).y - top), entity.name, entity.attributes.join('\n'), ''))
  })
  for (const relation of parsed.relations) {
    const from = boxes.get(relation.from) as RectangleObject
    const to = boxes.get(relation.to) as RectangleObject
    const { fromSide, toSide } = facingSides(from, to)
    sheet.connect(from, fromSide, to, toSide, { type: 'association', ...(relation.dashed ? { dash: 'dashed' as const } : {}), ...(relation.label ? { label: relation.label } : {}), ...(relation.startLabel ? { startLabel: relation.startLabel } : {}), ...(relation.endLabel ? { endLabel: relation.endLabel } : {}) })
  }
  return { items: sheet.items, boxes: parsed.entities.length, links: parsed.relations.length }
}

/** Parses and builds an erDiagram in one step (the dispatcher's entry). */
export function buildMermaidEr(text: string): MermaidDiagramResult {
  const parsed = parseMermaidEr(text)
  if (!parsed.ok) return parsed
  const built = buildMermaidErItems(parsed)
  return { ok: true, items: built.items, boxes: built.boxes, links: built.links, ignoredLines: parsed.ignoredLines, kind: 'er' }
}
