import { getConnectorRenderSpec, type CanvasItem, type CodeObject, type ConnectorObject, type RectangleObject, type TextObject } from './canvasModel'
import { isFlowBox, labelInsideBox } from './diagramFlow'
import { boxKindName } from './diagramOutline'

/**
 * The current page as a Mermaid flowchart (Export: "Copy as Mermaid"). Pure: reads the items, changes nothing and adds nothing to the saved format.
 * Boxes are the flow boxes (rectangles, diamonds, ellipses, HLD shapes, sticky notes); a connector is exported only when both ends are attached to exported boxes.
 * Everything is quoted, so any label is valid Mermaid text.
 */

export type MermaidResult = {
  text: string
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

function linkLine(from: number, to: number, arrow: 'forward' | 'none', dashed: boolean, label: string): string {
  const body = arrow === 'forward' ? (dashed ? '-.->' : '-->') : dashed ? '-.-' : '---'
  return `  n${from} ${body}${label ? `|"${label}"|` : ''} n${to}`
}

export function buildMermaid(items: readonly CanvasItem[]): MermaidResult {
  const rectangles = items.filter((item): item is RectangleObject => item.kind === 'rectangle')
  const boxes = rectangles.filter(isFlowBox).sort(byPosition)
  const boxIds = new Set(boxes.map((box) => box.id))
  // A label belongs to the innermost flow box that contains it (same rule as the text outline).
  const labels = new Map<number, TextObject[]>()
  let freeText = false
  for (const text of items.filter((item): item is TextObject => item.kind === 'text')) {
    let owner: RectangleObject | null = null
    for (const box of boxes) if (labelInsideBox(text, box) && (!owner || area(box) < area(owner))) owner = box
    if (!owner) { if (text.text.trim()) freeText = true; continue }
    labels.set(owner.id, [...(labels.get(owner.id) ?? []), text])
  }
  const lines: string[] = ['flowchart LR']
  for (const box of boxes) {
    const own = [...(labels.get(box.id) ?? [])].sort(byPosition).map((label) => mermaidText(label.text)).filter(Boolean)
    const fallback = box.hldShape || box.diamond || box.ellipse ? boxKindName(box) : 'Box'
    lines.push(`  n${box.id}${shape(box, own.length > 0 ? own.join('<br/>') : fallback)}`)
  }
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
    lines.push(spec.endpoint === null ? linkLine(from, to, 'none', dashed, label) : spec.endpoint === 'end' ? linkLine(from, to, 'forward', dashed, label) : linkLine(to, from, 'forward', dashed, label))
    links += 1
  }
  const ink = items.some((item) => item.kind === 'stroke' && !item.erase)
  const classes = rectangles.some((box) => !boxIds.has(box.id))
  const code = items.some((item): item is CodeObject => item.kind === 'code')
  return { text: `${lines.join('\n')}\n`, boxes: boxes.length, links, skipped: freeText || ink || classes || code, skippedLinks }
}
