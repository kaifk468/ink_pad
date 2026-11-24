import { getConnectorRenderSpec, strokeArrowheads, type CanvasItem, type CodeObject, type ConnectorObject, type RectangleObject, type Stroke, type TextObject } from './canvasModel'
import { isFlowBox, labelInsideBox } from './diagramFlow'
import { HLD_SHAPE_LABELS } from './hldShapes'
import { contains } from './textFit'

/**
 * Text outline of a diagram as Markdown (Export menu: "Copy as text outline" / "Download outline (.md)"). Pure: reads the pages, changes nothing and adds nothing to the saved format.
 * Order is deterministic: top to bottom, then left to right (ties by id). Pages with nothing to list are skipped; a diagram with one page has no page headings.
 */

const UNTITLED = 'Untitled diagram'

const flat = (text: string): string => text.replace(/\s+/g, ' ').trim()
const byPosition = <T extends { x: number; y: number; id: number }>(a: T, b: T): number => a.y - b.y || a.x - b.x || a.id - b.id
const area = (box: RectangleObject): number => box.width * box.height

/** The kind of a box as a lower-case word: "rectangle", "diamond", "ellipse" or the HLD shape ("cache", "load balancer"). */
export function boxKindName(box: RectangleObject): string {
  if (box.hldShape) return HLD_SHAPE_LABELS[box.hldShape].toLowerCase()
  if (box.diamond) return 'diamond'
  if (box.ellipse) return 'ellipse'
  return 'rectangle'
}

const HANDWRITTEN_BOX = 'handwritten box'
/** The tablet class box drawn by hand: an ink box that is neither an HLD shape nor a typed class box. Not a flow box (it does not move labels), but the outline lists it. */
const isInkClassBox = (box: RectangleObject): boolean => !!box.inkBox && !box.hldShape && !box.classBox

/** Name of a flow box: its label, with the kind in brackets for HLD shapes, diamonds and ellipses ("Redis (cache)"); "(unlabeled rectangle)" without a label. */
function flowBoxName(box: RectangleObject, labels: readonly TextObject[]): string {
  const text = flat([...labels].sort(byPosition).map((label) => label.text).join(' '))
  if (isInkClassBox(box)) return text ? `${text} (${HANDWRITTEN_BOX})` : `(${HANDWRITTEN_BOX})`
  const kind = boxKindName(box)
  if (!text) return `(unlabeled ${kind})`
  return kind === 'rectangle' ? text : `${text} (${kind})`
}

/** A label belongs to the innermost flow box that contains it (the same rule as moving a box with its labels); the others are free notes. */
function assignLabels(texts: readonly TextObject[], boxes: readonly RectangleObject[]): { byBox: Map<number, TextObject[]>; free: TextObject[] } {
  const byBox = new Map<number, TextObject[]>()
  const free: TextObject[] = []
  for (const text of texts) {
    let owner: RectangleObject | null = null
    for (const box of boxes) if (labelInsideBox(text, box) && (!owner || area(box) < area(owner))) owner = box
    if (!owner) { free.push(text); continue }
    byBox.set(owner.id, [...(byBox.get(owner.id) ?? []), text])
  }
  return { byBox, free }
}

const RELATION_NOTE: Partial<Record<ConnectorObject['relationshipType'], string>> = {
  inheritance: 'inheritance', realization: 'realization', dependency: 'dependency', aggregation: 'aggregation', composition: 'composition',
}

function connectionLine(from: string, to: string, arrow: 'forward' | 'both' | 'none', note?: string, label?: string): string {
  const joiner = arrow === 'both' ? '↔' : arrow === 'none' ? '—' : '→'
  return `- ${from} ${joiner} ${to}${note ? ` (${note})` : ''}${label ? `: ${label}` : ''}`
}

type Connection = { x: number; y: number; id: number; line: string; strokeId?: number }

/** One connection per connector, and per arrow/line stroke with at least one end on a box; ordered by where it starts. */
function connections(connectors: readonly ConnectorObject[], strokes: readonly Stroke[], names: ReadonlyMap<number, string>, namedBoxes: readonly RectangleObject[]): Connection[] {
  const nameOf = (id: number | undefined): string => (id === undefined ? undefined : names.get(id)) ?? '(free end)'
  const result: Connection[] = []
  for (const connector of connectors) {
    const spec = getConnectorRenderSpec(connector)
    const start = nameOf(connector.startAttachment?.rectangleId)
    const end = nameOf(connector.endAttachment?.rectangleId)
    const label = connector.label ? flat(connector.label) : undefined
    const note = RELATION_NOTE[connector.relationshipType]
    // The marker (arrowhead, triangle, diamond) sits at one end; with none the line only joins the two boxes.
    const line = spec.endpoint === null ? connectionLine(start, end, 'none', note, label)
      : spec.endpoint === 'end' ? connectionLine(start, end, 'forward', note, label)
        : connectionLine(end, start, 'forward', note, label)
    result.push({ x: connector.start.x, y: connector.start.y, id: connector.id, line })
  }
  const boxAt = (point: { x: number; y: number }): string | null => {
    let owner: RectangleObject | null = null
    for (const box of namedBoxes) if (contains(box, point) && (!owner || area(box) < area(owner))) owner = box
    return owner ? names.get(owner.id) ?? null : null
  }
  for (const stroke of strokes) {
    const first = stroke.points[0]
    const last = stroke.points[stroke.points.length - 1]
    if (!first || !last) continue
    const start = boxAt(first)
    const end = boxAt(last)
    if (start === null && end === null) continue // a loose line that touches no box stays handwriting
    const a = start ?? '(free end)'
    const b = end ?? '(free end)'
    const heads = strokeArrowheads(stroke)
    const line = heads === 'both' ? connectionLine(a, b, 'both') : heads === 'start' ? connectionLine(b, a, 'forward') : connectionLine(a, b, heads === 'end' ? 'forward' : 'none')
    result.push({ x: first.x, y: first.y, id: stroke.id, line, strokeId: stroke.id })
  }
  return result.sort(byPosition)
}

function fenceFor(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((match) => match[0].length))
  return '`'.repeat(longest + 1)
}

function classLines(box: RectangleObject): string[] {
  const content = box.classBox
  if (!content) return []
  const members = (text: string): string[] => text.split('\n').map((line) => line.trim()).filter(Boolean)
  const attributes = members(content.attributes)
  const methods = members(content.methods)
  return [
    `- **${flat(content.name) || '(unnamed class)'}**`,
    ...(attributes.length > 0 ? ['  - Attributes', ...attributes.map((line) => `    - ${line}`)] : []),
    ...(methods.length > 0 ? ['  - Methods', ...methods.map((line) => `    - ${line}`)] : []),
  ]
}

/** The sections of one page at heading `level` (no page heading); empty when the page has nothing to list. */
function pageSections(items: readonly CanvasItem[], level: string): string[] {
  const rectangles = items.filter((item): item is RectangleObject => item.kind === 'rectangle')
  const flowBoxes = rectangles.filter((box) => isFlowBox(box) || isInkClassBox(box)).sort(byPosition)
  const classes = rectangles.filter((box) => box.classBox).sort(byPosition)
  const texts = items.filter((item): item is TextObject => item.kind === 'text')
  const { byBox, free } = assignLabels(texts, flowBoxes)
  const names = new Map<number, string>()
  for (const box of flowBoxes) names.set(box.id, flowBoxName(box, byBox.get(box.id) ?? []))
  for (const box of classes) names.set(box.id, flat(box.classBox?.name ?? '') || '(unnamed class)')
  const strokes = items.filter((item): item is Stroke => item.kind === 'stroke' && !item.erase)
  const lines = connections(
    items.filter((item): item is ConnectorObject => item.kind === 'connector'),
    strokes.filter((stroke) => stroke.shape === 'arrow' || stroke.shape === 'line'),
    names,
    [...flowBoxes, ...classes],
  )
  const connectionStrokes = new Set(lines.map((line) => line.strokeId).filter((id): id is number => id !== undefined))
  const inBoxInk = rectangles.reduce((total, box) => total + (isInkClassBox(box) ? (box.inkBox?.ink ?? []).filter((stroke) => !stroke.erase).length : 0), 0)
  const handwriting = strokes.filter((stroke) => !connectionStrokes.has(stroke.id)).length + inBoxInk
  const codes = items.filter((item): item is CodeObject => item.kind === 'code').sort(byPosition)
  const out: string[] = []
  const section = (title: string, body: string[]) => { if (body.length > 0) out.push(`${level} ${title}`, '', ...body, '') }
  section('Components', flowBoxes.map((box) => `- ${names.get(box.id)}`))
  section('Connections', lines.map((line) => line.line))
  section('Notes', free.sort(byPosition).map((text) => flat(text.text)).filter(Boolean).map((text) => `- ${text}`))
  section('Classes', classes.flatMap(classLines))
  const codeBody: string[] = []
  for (const code of codes) {
    const text = code.text.replace(/\s+$/, '')
    const fence = fenceFor(text)
    const language = code.language && code.language !== 'plaintext' ? code.language : ''
    codeBody.push(`${fence}${language}`, text, fence, '')
  }
  codeBody.pop()
  section('Code', codeBody)
  if (handwriting > 0) out.push(`Handwriting: ${handwriting} ${handwriting === 1 ? 'stroke' : 'strokes'}`, '')
  return out
}

/** The Markdown outline of a diagram: `# Title`, then (under `## Page n` when there are several pages) Components, Connections, Notes, Classes, Code and a handwriting count. */
export function buildDiagramOutline(title: string, pages: readonly (readonly CanvasItem[])[]): string {
  const lines: string[] = [`# ${flat(title) || UNTITLED}`, '']
  const several = pages.length > 1
  let any = false
  pages.forEach((items, index) => {
    const body = pageSections(items, several ? '###' : '##')
    if (body.length === 0) return
    any = true
    if (several) lines.push(`## Page ${index + 1}`, '')
    lines.push(...body)
  })
  if (!any) lines.push('_(empty diagram)_', '')
  return `${lines.join('\n').replace(/\n+$/, '')}\n`
}

/** A safe file name for the downloaded outline: the title without characters files cannot have, plus ".md". */
export function outlineFileName(title: string): string {
  const base = flat(title).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/^\.+/, '').slice(0, 80).trim()
  return `${base || 'diagram'}.md`
}
