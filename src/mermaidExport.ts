import { getConnectorRenderSpec, type CanvasItem, type CodeObject, type ConnectorObject, type RectangleObject, type TextObject } from './canvasModel'
import { isFlowBox, labelInsideBox } from './diagramFlow'
import { boxKindName } from './diagramOutline'
import { isContainerBox, OWN_LABEL_CORNER } from './boundary'

/**
 * The current page as a Mermaid flowchart (Export: "Copy as Mermaid"). Pure: reads the items, changes nothing and adds nothing to the saved format.
 * Boxes are the flow boxes (rectangles, diamonds, ellipses, HLD shapes, sticky notes); a connector is exported only when both ends are attached to exported boxes.
 * Everything is quoted, so any label is valid Mermaid text.
 */

export type MermaidResult = {
  text: string
  /** `class` when the page is only typed class boxes (a classDiagram); otherwise a flowchart. */
  kind: 'flowchart' | 'class'
  /** Nodes exported (classes for a class diagram). Boundary containers are subgraphs, not boxes. */
  boxes: number
  links: number
  /** True when the page had content that Mermaid output leaves out: free text, ink strokes, class boxes or code blocks. */
  skipped: boolean
  /** Connectors left out because an end is free or attached to something that is not an exported box. */
  skippedLinks: number
}

const byPosition = <T extends { x: number; y: number; id: number }>(a: T, b: T): number => a.y - b.y || a.x - b.x || a.id - b.id
const area = (box: RectangleObject): number => box.width * box.height

/** Text safe inside a double-quoted Mermaid label or edge text: `#` and the quote, angle brackets and pipe become entity codes; line breaks become <br/> (added after escaping). */
export function mermaidText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((line) => line.replace(/#/g, '#35;').replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;').replace(/\|/g, '#124;'))
    .join('<br/>')
}

function shape(box: RectangleObject, label: string): string {
  if (box.diamond) return `{"${label}"}`
  if (box.ellipse) return `(("${label}"))`
  if (box.hldShape === 'database') return `[("${label}")]`
  if (box.hldShape === 'service') return `[["${label}"]]`
  return `["${label}"]`
}

function linkLine(from: number, to: number, arrow: 'forward' | 'both' | 'none', dashed: boolean, label: string): string {
  const body = arrow === 'both' ? (dashed ? '<-.->' : '<-->') : arrow === 'forward' ? (dashed ? '-.->' : '-->') : dashed ? '-.-' : '---'
  return `  n${from} ${body}${label ? `|"${label}"|` : ''} n${to}`
}

const contains = (outer: RectangleObject, inner: { x: number; y: number; width: number; height: number }): boolean =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height

/** Mermaid identifier for a class name: spaces become `_`, generics `A<T>` become `A~T~`, other symbols become `_`. Duplicates get `_2`, `_3`... */
export function classIdentifier(name: string, taken: Set<string>): string {
  let base = name.trim().replace(/[<>]/g, '~').replace(/[^\p{L}\p{N}_~]+/gu, '_').replace(/^_+|_+$/g, '') || 'Class'
  if (/^\d/.test(base)) base = `C_${base}`
  let id = base
  for (let n = 2; taken.has(id); n += 1) id = `${base}_${n}`
  taken.add(id)
  return id
}

function classDiagram(items: readonly CanvasItem[], classBoxes: RectangleObject[], skippedContent: boolean): MermaidResult {
  const taken = new Set<string>()
  const ids = new Map<number, string>()
  const lines = ['classDiagram']
  for (const box of classBoxes) {
    const content = box.classBox!
    const id = classIdentifier(content.name, taken)
    ids.set(box.id, id)
    lines.push(`  class ${id} {`)
    for (const member of [...content.attributes.split(/\r?\n/), ...content.methods.split(/\r?\n/)]) {
      const line = member.replace(/\s+/g, ' ').trim()
      if (line) lines.push(`    ${line}`)
    }
    lines.push('  }')
  }
  let links = 0
  let skippedLinks = 0
  const connectors = items.filter((item): item is ConnectorObject => item.kind === 'connector').sort((a, b) => a.start.y - b.start.y || a.start.x - b.start.x || a.id - b.id)
  for (const connector of connectors) {
    const from = ids.get(connector.startAttachment?.rectangleId ?? -1)
    const to = ids.get(connector.endAttachment?.rectangleId ?? -1)
    if (from === undefined || to === undefined) { skippedLinks += 1; continue }
    const spec = getConnectorRenderSpec(connector)
    // The symbol (triangle, arrow head, diamond) is drawn at the `endpoint` end: that box is the parent / target / whole. The other end is the child / source / part.
    const marked = spec.endpoint === 'start' ? from : to
    const other = spec.endpoint === 'start' ? to : from
    const label = connector.label ? mermaidText(connector.label).replace(/<br\/>/g, ' ') : ''
    let line: string
    switch (connector.relationshipType) {
      case 'inheritance': line = `${marked} <|-- ${other}`; break
      case 'realization': line = `${marked} <|.. ${other}`; break
      case 'composition': line = `${marked} *-- ${other}`; break
      case 'aggregation': line = `${marked} o-- ${other}`; break
      case 'directed-association': line = `${other} --> ${marked}`; break
      case 'dependency': line = `${other} ..> ${marked}`; break
      default: line = `${from} -- ${to}`
    }
    lines.push(`  ${line}${label ? ` : ${label}` : ''}`)
    links += 1
  }
  return { text: `${lines.join('\n')}\n`, kind: 'class', boxes: classBoxes.length, links, skipped: skippedContent, skippedLinks }
}

export function buildMermaid(items: readonly CanvasItem[]): MermaidResult {
  const rectangles = items.filter((item): item is RectangleObject => item.kind === 'rectangle')
  const flowBoxes = rectangles.filter(isFlowBox)
  // A container is a plain unfilled rectangle (a boundary) that holds other boxes: it becomes a subgraph, not a node.
  const containers = flowBoxes.filter((box) => isContainerBox(items, box) && rectangles.some((other) => other !== box && contains(box, other))).sort(byPosition)
  const containerIds = new Set(containers.map((box) => box.id))
  const boxes = flowBoxes.filter((box) => !containerIds.has(box.id)).sort(byPosition)
  const boxIds = new Set(boxes.map((box) => box.id))
  const texts = items.filter((item): item is TextObject => item.kind === 'text')
  // The boundary's own title: the text at its top-left corner (the rule isContainerBox uses), not inside an inner box. Inner containers pick first, so a nested boundary keeps its own label.
  const claimed = new Set<number>()
  const titles = new Map<number, string>()
  for (const container of [...containers].sort((a, b) => area(a) - area(b) || byPosition(a, b))) {
    const candidates = texts
      .filter((text) => !claimed.has(text.id) && contains(container, text) && text.x - container.x <= OWN_LABEL_CORNER && text.y - container.y <= OWN_LABEL_CORNER && !rectangles.some((box) => !containerIds.has(box.id) && labelInsideBox(text, box)))
      .sort((a, b) => (a.x - container.x) + (a.y - container.y) - ((b.x - container.x) + (b.y - container.y)) || a.id - b.id)
    const title = candidates[0]
    if (!title) continue
    claimed.add(title.id)
    const text = mermaidText(title.text)
    if (text) titles.set(container.id, text)
  }
  // A label belongs to the innermost flow box that contains it (same rule as the text outline).
  const labels = new Map<number, TextObject[]>()
  let freeText = false
  for (const text of texts) {
    if (claimed.has(text.id)) continue
    let owner: RectangleObject | null = null
    for (const box of boxes) if (labelInsideBox(text, box) && (!owner || area(box) < area(owner))) owner = box
    if (!owner) { if (text.text.trim()) freeText = true; continue }
    labels.set(owner.id, [...(labels.get(owner.id) ?? []), text])
  }
  const ink = items.some((item) => item.kind === 'stroke' && !item.erase)
  const code = items.some((item): item is CodeObject => item.kind === 'code')
  const classBoxes = rectangles.filter((box) => box.classBox).sort(byPosition)
  if (boxes.length === 0 && classBoxes.length > 0) {
    const otherBoxes = rectangles.some((box) => !box.classBox && !isFlowBox(box))
    return classDiagram(items, classBoxes, freeText || ink || code || otherBoxes || containers.length > 0)
  }
  const nodeLine = (box: RectangleObject, indent: string): string => {
    const own = [...(labels.get(box.id) ?? [])].sort(byPosition).map((label) => mermaidText(label.text)).filter(Boolean)
    const fallback = box.hldShape || box.diamond || box.ellipse ? boxKindName(box) : 'Box'
    return `${indent}n${box.id}${shape(box, own.length > 0 ? own.join('<br/>') : fallback)}`
  }
  // The smallest container that fully holds the item is its parent.
  const parentOf = (item: RectangleObject): RectangleObject | null => {
    let parent: RectangleObject | null = null
    for (const container of containers) if (container !== item && contains(container, item) && (!parent || area(container) < area(parent))) parent = container
    return parent
  }
  const lines: string[] = ['flowchart LR']
  for (const box of boxes) if (!parentOf(box)) lines.push(nodeLine(box, '  '))
  const writeGroup = (container: RectangleObject, indent: string) => {
    const title = titles.get(container.id)
    lines.push(`${indent}subgraph g${container.id}${title ? ` ["${title}"]` : ''}`)
    for (const box of boxes) if (parentOf(box) === container) lines.push(nodeLine(box, `${indent}  `))
    for (const child of containers) if (parentOf(child) === container) writeGroup(child, `${indent}  `)
    lines.push(`${indent}end`)
  }
  for (const container of containers) if (!parentOf(container)) writeGroup(container, '  ')
  let links = 0
  let skippedLinks = 0
  const connectors = items.filter((item): item is ConnectorObject => item.kind === 'connector').sort((a, b) => a.start.y - b.start.y || a.start.x - b.start.x || a.id - b.id)
  for (const connector of connectors) {
    const from = connector.startAttachment?.rectangleId
    const to = connector.endAttachment?.rectangleId
    if (from === undefined || to === undefined || !boxIds.has(from) || !boxIds.has(to)) { skippedLinks += 1; continue }
    const spec = getConnectorRenderSpec(connector)
    const dashed = connector.dash === 'solid' ? false : connector.dash === 'dashed' || connector.dash === 'dotted' ? true : spec.lineStyle === 'dashed'
    const label = connector.label ? mermaidText(connector.label) : ''
    // The marker sits at one end; with none the line only joins the boxes (same rule as the text outline).
    lines.push(spec.endpoint === null ? linkLine(from, to, 'none', dashed, label) : connector.twoWay === true && connector.relationshipType === 'directed-association' ? linkLine(from, to, 'both', dashed, label) : spec.endpoint === 'end' ? linkLine(from, to, 'forward', dashed, label) : linkLine(to, from, 'forward', dashed, label))
    links += 1
  }
  const classes = rectangles.some((box) => !isFlowBox(box))
  return { text: `${lines.join('\n')}\n`, kind: 'flowchart', boxes: boxes.length, links, skipped: freeText || ink || classes || code, skippedLinks }
}
