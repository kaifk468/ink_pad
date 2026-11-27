import type { CanvasItem, ConnectorObject, RectangleObject } from './canvasModel'

/**
 * Copy as Mermaid for ER pages: the inverse of mermaidErImport.ts. A page whose boxes are all entity class boxes (typed class boxes with no
 * methods whose attribute lines read "[PK, FK ]name: type", the shape the ER importer builds) and whose connectors are plain associations is
 * written as `erDiagram`. Pure: reads the items, changes nothing and adds nothing to the saved format. Returns null for any other page.
 * Cardinality comes from the connector end labels the importer sets (start label = the start entity's side, end label = the end entity's side).
 */
export type ErExport = { text: string; boxes: number; links: number; skipped: boolean; skippedLinks: number }

const ATTRIBUTE = /^((?:(?:PK|FK|UK)\s*,\s*)*(?:PK|FK|UK))\s+([^\s:]+):\s*(\S+)$|^([^\s:]+):\s*(\S+)$/
const PLAIN_ID = /^[\p{L}\p{N}_.\-]+$/u
const LEFT: Record<string, string> = { '1': '||', '0..1': '|o', '1..*': '}|', '0..*': '}o' }
const RIGHT: Record<string, string> = { '1': '||', '0..1': 'o|', '1..*': '|{', '0..*': 'o{' }

/** Cardinality text -> canonical form (1, 0..1, 1..*, 0..*); empty text reads as 1. */
function canonical(text: string | undefined): string {
  const t = (text ?? '').replace(/\s+/g, '').toLowerCase()
  if (t === '' || t === '1' || t === '1..1') return '1'
  if (t === '0..1') return '0..1'
  if (t === '1..*' || t === '1..n') return '1..*'
  return '0..*'
}

const quote = (text: string): string => `"${text.replace(/#/g, '#35;').replace(/"/g, '#quot;')}"`

/** "PK id: int" -> "int id PK"; null when the line is not an attribute line. */
function attributeText(line: string): string | null {
  const match = ATTRIBUTE.exec(line.replace(/\s+/g, ' ').trim())
  if (!match) return null
  const keys = match[1] ?? ''
  const name = match[2] ?? match[4]
  const type = match[3] ?? match[5]
  if (/^[+\-#~]/.test(name) || /[{}"]/.test(name + type)) return null
  return `${type} ${name}${keys ? ` ${keys.replace(/\s*,\s*/g, ', ')}` : ''}`
}

function entityId(name: string, taken: Set<string>, index: number): string {
  let base = name.replace(/[^\p{L}\p{N}_.\-]+/gu, '_').replace(/^_+|_+$/g, '') || `E${index + 1}`
  if (/^(erDiagram|title|direction|style|classDef|class|accTitle|accDescr|click|link)$/.test(base)) base = `${base}_`
  let id = base
  for (let n = 2; taken.has(id); n += 1) id = `${base}_${n}`
  taken.add(id)
  return id
}

export function buildMermaidErText(items: readonly CanvasItem[]): ErExport | null {
  const rectangles = items.filter((item): item is RectangleObject => item.kind === 'rectangle')
  if (rectangles.length === 0 || !rectangles.every((box) => box.classBox)) return null
  const entities: Array<{ box: RectangleObject; name: string; attributes: string[] }> = []
  for (const box of rectangles) {
    const content = box.classBox!
    if (content.methods.trim() !== '') return null
    const name = content.name.replace(/\s+/g, ' ').trim()
    if (name === '' || /^«/.test(name)) return null
    const attributes: string[] = []
    for (const line of content.attributes.split(/\r?\n/)) {
      if (line.trim() === '') continue
      const text = attributeText(line)
      if (text === null) return null
      attributes.push(text)
    }
    entities.push({ box, name, attributes })
  }
  const connectors = items.filter((item): item is ConnectorObject => item.kind === 'connector')
  if (connectors.some((connector) => connector.relationshipType !== 'association' || connector.twoWay === true)) return null
  // Bare class boxes joined by plain lines are a class diagram: an ER page has an attribute list or cardinality labels somewhere.
  if (!entities.some((entity) => entity.attributes.length > 0) && !connectors.some((connector) => connector.startLabel || connector.endLabel)) return null
  entities.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x || a.box.id - b.box.id)

  const taken = new Set<string>()
  const ids = new Map<number, string>()
  const lines = ['erDiagram']
  entities.forEach((entity, index) => {
    const id = PLAIN_ID.test(entity.name) && !taken.has(entity.name) ? (taken.add(entity.name), entity.name) : entityId(entity.name, taken, index)
    ids.set(entity.box.id, id)
    const head = id === entity.name ? id : `${id}[${quote(entity.name)}]`
    if (entity.attributes.length === 0) { lines.push(`  ${head}`); return }
    lines.push(`  ${head} {`)
    for (const attribute of entity.attributes) lines.push(`    ${attribute}`)
    lines.push('  }')
  })
  let links = 0
  let skippedLinks = 0
  const ordered = [...connectors].sort((a, b) => a.start.y - b.start.y || a.start.x - b.start.x || a.id - b.id)
  for (const connector of ordered) {
    const from = ids.get(connector.startAttachment?.rectangleId ?? -1)
    const to = ids.get(connector.endAttachment?.rectangleId ?? -1)
    if (from === undefined || to === undefined || from === to) { skippedLinks += 1; continue }
    const dashed = connector.dash === 'dashed' || connector.dash === 'dotted'
    const label = (connector.label ?? '').replace(/\s+/g, ' ').trim()
    lines.push(`  ${from} ${LEFT[canonical(connector.startLabel)]}${dashed ? '..' : '--'}${RIGHT[canonical(connector.endLabel)]} ${to} : ${quote(label)}`)
    links += 1
  }
  const skipped = items.some((item) => (item.kind === 'text' && item.text.trim() !== '') || (item.kind === 'stroke' && !item.erase) || item.kind === 'code')
  return { text: `${lines.join('\n')}\n`, boxes: entities.length, links, skipped: skipped || skippedLinks > 0, skippedLinks }
}
