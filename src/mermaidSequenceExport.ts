import { strokeArrowheads, type CanvasItem, type RectangleObject, type Stroke, type TextObject } from './canvasModel'
import { labelInsideBox } from './diagramFlow'
import { STICKY_FILL } from './stickyNote'

/**
 * Copy as Mermaid for sequence pages: a page built like the `sequenceDiagram` importer's output (mermaidSequenceImport.ts) is written back as
 * `sequenceDiagram` text instead of a box flowchart. Pure: reads the items, changes nothing and adds nothing to the saved format.
 * Recognised by shape, not by any saved marker: participant boxes each with a dashed vertical lifeline hanging from the bottom edge (two or more);
 * messages are horizontal arrow / line strokes between two lifelines (a self message is the three-stroke loop); notes are sticky-note rectangles;
 * frames are dashed unfilled rectangles labelled "kind: text" with dashed full-width dividers for else / and / option.
 * Anything else on the page (free text, other shapes, ink) is left out and reported through `skipped`.
 */

export type SequenceExport = { text: string; boxes: number; links: number; skipped: boolean; skippedLinks: number; frames: number }

const SNAP = 12 // how far an arrow end may be from a lifeline
const EDGE = 8 // how far a lifeline start may be from its box bottom
const FRAME_WORDS = ['loop', 'alt', 'opt', 'par', 'critical', 'break'] as const
const DIVIDER_WORD: Record<string, string> = { alt: 'else', par: 'and', critical: 'option' }

type Participant = { id: string; x: number; line: Stroke; box: RectangleObject; label: string; actor: boolean }
type Frame = { rect: RectangleObject; kind: string; text: string; depth: number }
type Event = { y: number; priority: number; tie: number; lines: (indent: string) => string[]; depth?: number }

const horizontal = (stroke: Stroke): boolean => stroke.points.length >= 2 && Math.abs(stroke.points[0].y - stroke.points[stroke.points.length - 1].y) <= 2
const vertical = (stroke: Stroke): boolean => stroke.points.length >= 2 && Math.abs(stroke.points[0].x - stroke.points[stroke.points.length - 1].x) <= 2
const first = (stroke: Stroke) => stroke.points[0]
const last = (stroke: Stroke) => stroke.points[stroke.points.length - 1]
const isDashed = (stroke: Stroke): boolean => stroke.dash === 'dashed' || stroke.dash === 'dotted'
const isLineStroke = (stroke: Stroke): boolean => !stroke.erase && (stroke.shape === 'arrow' || stroke.shape === 'line') && stroke.points.length >= 2

const ENTITY: Record<string, string> = { '#': '#35;', '"': '#quot;', '<': '#lt;', '>': '#gt;', '|': '#124;', ';': '#59;' }
/** Text safe on one Mermaid line: entity codes for # " < > | ;, line breaks as <br/>. */
function seqText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((line) => line.replace(/[#"<>|;]/g, (ch) => ENTITY[ch]))
    .join('<br/>')
}

function participantId(label: string, taken: Set<string>, index: number): string {
  let base = (label.split(/\r?\n/)[0] ?? '').trim().replace(/[^\p{L}\p{N}_.]+/gu, '_').replace(/^_+|_+$/g, '') || `P${index + 1}`
  if (/^(participant|actor|note|loop|alt|opt|par|critical|break|end|else|and|option|title|autonumber|activate|deactivate|rect|box|create|destroy|over|left|right|of|as)$/i.test(base)) base = `${base}_`
  let id = base
  for (let n = 2; taken.has(id); n += 1) id = `${base}_${n}`
  taken.add(id)
  return id
}

/** The page as `sequenceDiagram` text, or null when the page is not a sequence page (fewer than two lifelines under boxes). */
export function buildMermaidSequenceText(items: readonly CanvasItem[]): SequenceExport | null {
  const strokes = items.filter((item): item is Stroke => item.kind === 'stroke' && !item.erase)
  const rectangles = items.filter((item): item is RectangleObject => item.kind === 'rectangle')
  const texts = items.filter((item): item is TextObject => item.kind === 'text')
  const claimedText = new Set<number>()
  const usedStroke = new Set<number>()
  const usedRect = new Set<number>()

  // Lifelines: dashed vertical lines hanging from the bottom edge of a box.
  const found: Array<{ line: Stroke; box: RectangleObject }> = []
  for (const line of strokes) {
    if (!isLineStroke(line) || !isDashed(line) || !vertical(line)) continue
    const top = first(line).y < last(line).y ? first(line) : last(line)
    const bottom = first(line).y < last(line).y ? last(line) : first(line)
    if (bottom.y - top.y < 60) continue
    const box = rectangles.find((rect) => !rect.fillColor && Math.abs(rect.y + rect.height - top.y) <= EDGE && top.x >= rect.x - 2 && top.x <= rect.x + rect.width + 2)
    if (box && !found.some((entry) => entry.box === box)) found.push({ line, box })
  }
  if (found.length < 2) return null
  found.sort((a, b) => first(a.line).x - first(b.line).x)

  const taken = new Set<string>()
  const participants: Participant[] = found.map(({ line, box }, index) => {
    const own = texts.filter((text) => !claimedText.has(text.id) && labelInsideBox(text, box)).sort((a, b) => a.y - b.y || a.x - b.x)
    own.forEach((text) => claimedText.add(text.id))
    const label = own.map((text) => text.text.trim()).filter(Boolean).join('\n')
    usedStroke.add(line.id)
    usedRect.add(box.id)
    return { id: participantId(label, taken, index), x: first(line).x, line, box, label, actor: box.hldShape === 'user' }
  })
  const lifelineTop = Math.min(...participants.map((p) => Math.min(first(p.line).y, last(p.line).y)))
  const nearest = (x: number): Participant | null => {
    let best: Participant | null = null
    for (const p of participants) if (Math.abs(p.x - x) <= SNAP && (!best || Math.abs(p.x - x) < Math.abs(best.x - x))) best = p
    return best
  }

  // Frames: dashed unfilled rectangles around part of the lifelines, labelled "kind: text" (rect frames carry no label).
  const frames: Frame[] = []
  let skippedOther = false
  for (const rect of rectangles) {
    if (usedRect.has(rect.id) || rect.dash !== 'dashed' || rect.fillColor || rect.hldShape || rect.classBox || rect.diamond || rect.ellipse) continue
    if (rect.y < lifelineTop - 2 || !participants.some((p) => p.x >= rect.x && p.x <= rect.x + rect.width)) continue
    const title = texts.filter((text) => !claimedText.has(text.id) && text.x >= rect.x && text.y >= rect.y && text.x - rect.x <= 40 && text.y - rect.y <= 40 && labelInsideBox(text, rect)).sort((a, b) => a.y - b.y || a.x - b.x)[0]
    const label = title ? title.text.replace(/\s+/g, ' ').trim() : ''
    const match = /^(\w+)(?::\s*(.*))?$/.exec(label)
    if (label !== '' && !(match && (FRAME_WORDS as readonly string[]).includes(match[1]))) continue // some other boundary: left out
    if (title) claimedText.add(title.id)
    usedRect.add(rect.id)
    frames.push({ rect, kind: match ? match[1] : 'rect', text: match?.[2] ?? '', depth: 0 })
  }
  const area = (rect: RectangleObject): number => rect.width * rect.height
  const inside = (inner: RectangleObject, outer: RectangleObject): boolean => inner !== outer && inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.width <= outer.x + outer.width + 1 && inner.y + inner.height <= outer.y + outer.height + 1
  for (const frame of frames) frame.depth = frames.filter((other) => inside(frame.rect, other.rect)).length
  const frameAt = (y: number): Frame | null => frames.filter((frame) => y > frame.rect.y && y < frame.rect.y + frame.rect.height).sort((a, b) => area(a.rect) - area(b.rect))[0] ?? null
  const depthAt = (y: number): number => frames.filter((frame) => y > frame.rect.y && y < frame.rect.y + frame.rect.height).length

  const events: Event[] = []

  // Dividers: dashed horizontal lines across a frame, full width.
  for (const stroke of strokes) {
    if (usedStroke.has(stroke.id) || !isLineStroke(stroke) || !isDashed(stroke) || !horizontal(stroke)) continue
    const y = first(stroke).y
    const frame = frameAt(y)
    if (!frame) continue
    const xs = [first(stroke).x, last(stroke).x].sort((a, b) => a - b)
    if (Math.abs(xs[0] - frame.rect.x) > 3 || Math.abs(xs[1] - (frame.rect.x + frame.rect.width)) > 3) continue
    usedStroke.add(stroke.id)
    const title = texts.filter((text) => !claimedText.has(text.id) && text.x >= frame.rect.x && text.x - frame.rect.x <= 40 && text.y >= y - 2 && text.y - y <= 30).sort((a, b) => a.y - b.y)[0]
    if (title) claimedText.add(title.id)
    const word = DIVIDER_WORD[frame.kind] ?? 'else'
    const text = title ? seqText(title.text) : ''
    const depth = frame.depth
    events.push({ y, priority: 1, tie: 0, depth, lines: (indent) => [`${indent}${word}${text ? ` ${text}` : ''}`] })
  }

  // Messages. A self message is three strokes (out, down, back) starting and ending on one lifeline.
  type Message = { y: number; from: Participant; to: Participant; dashed: boolean; head: boolean; label: string; labelBox: TextObject | null }
  const messages: Message[] = []
  const flat = strokes.filter((stroke) => !usedStroke.has(stroke.id) && isLineStroke(stroke))
  const claimLabel = (test: (text: TextObject) => number | null): TextObject | null => {
    let best: TextObject | null = null
    let bestScore = Infinity
    for (const text of texts) {
      if (claimedText.has(text.id) || text.text.trim() === '') continue
      const score = test(text)
      if (score !== null && score < bestScore) { best = text; bestScore = score }
    }
    if (best) claimedText.add(best.id)
    return best
  }
  for (const out of flat) {
    if (usedStroke.has(out.id) || !horizontal(out) || first(out).x === last(out).x) continue
    const owner = nearest(first(out).x)
    if (!owner || Math.abs(last(out).x - first(out).x) > 120 || last(out).x < first(out).x) continue
    const down = flat.find((s) => !usedStroke.has(s.id) && s !== out && vertical(s) && Math.abs(first(s).x - last(out).x) <= 2 && Math.abs(first(s).y - last(out).y) <= 2)
    const back = down && flat.find((s) => !usedStroke.has(s.id) && s !== out && s !== down && horizontal(s) && Math.abs(first(s).x - last(down).x) <= 2 && Math.abs(first(s).y - last(down).y) <= 2 && Math.abs(last(s).x - first(out).x) <= SNAP)
    if (!down || !back) continue
    for (const s of [out, down, back]) usedStroke.add(s.id)
    const top = first(out).y
    const bottom = last(down).y
    const label = claimLabel((text) => (text.x >= last(out).x && text.x - last(out).x <= 80 && text.y + text.height / 2 >= top - 8 && text.y + text.height / 2 <= bottom + 8 ? text.x - last(out).x : null))
    messages.push({ y: top, from: owner, to: owner, dashed: isDashed(out), head: strokeArrowheads(back) === 'end' || strokeArrowheads(back) === 'both', label: label ? label.text : '', labelBox: label })
  }
  let skippedLinks = 0
  for (const stroke of flat) {
    if (usedStroke.has(stroke.id)) continue
    if (!horizontal(stroke)) { skippedLinks += 1; continue }
    const startAt = nearest(first(stroke).x)
    const endAt = nearest(last(stroke).x)
    if (!startAt || !endAt || startAt === endAt || first(stroke).y < lifelineTop) { skippedLinks += 1; continue }
    usedStroke.add(stroke.id)
    const y = first(stroke).y
    const mid = (first(stroke).x + last(stroke).x) / 2
    const label = claimLabel((text) => {
      const gap = y - (text.y + text.height)
      return gap >= -6 && gap <= 44 && Math.abs(text.x + text.width / 2 - mid) <= 16 ? gap : null
    })
    const heads = strokeArrowheads(stroke)
    messages.push({ y, from: startAt, to: endAt, dashed: isDashed(stroke), head: heads === 'end' || heads === 'both', label: label ? label.text : '', labelBox: label })
  }
  // Messages numbered 1., 2., ... on every message mean `autonumber`.
  messages.sort((a, b) => a.y - b.y)
  const numbered = messages.length > 0 && messages.every((message, index) => message.label.startsWith(`${index + 1}.`))
  for (const message of messages) {
    const body = numbered ? message.label.replace(/^\d+\.\s?/, '') : message.label
    const arrow = message.head ? (message.dashed ? '-->>' : '->>') : message.dashed ? '-->' : '->'
    const text = seqText(body)
    events.push({ y: message.y, priority: 1, tie: 0, lines: (indent) => [`${indent}${message.from.id}${arrow}${message.to.id}${text ? `: ${text}` : ''}`] })
  }

  // Notes: sticky rectangles. Left / right of a lifeline sit 20 away from it; otherwise the note is over the lifelines it spans.
  for (const rect of rectangles) {
    if (usedRect.has(rect.id) || rect.fillColor !== STICKY_FILL || rect.hldShape || rect.diamond || rect.ellipse || rect.classBox || rect.y < lifelineTop) continue
    usedRect.add(rect.id)
    const own = texts.filter((text) => !claimedText.has(text.id) && labelInsideBox(text, rect)).sort((a, b) => a.y - b.y || a.x - b.x)
    own.forEach((text) => claimedText.add(text.id))
    const text = seqText(own.map((part) => part.text).join('\n'))
    const right = rect.x + rect.width
    const leftOf = participants.find((p) => Math.abs(right - (p.x - 20)) <= 4)
    const rightOf = participants.find((p) => Math.abs(rect.x - (p.x + 20)) <= 4)
    let where: string
    if (leftOf) where = `left of ${leftOf.id}`
    else if (rightOf) where = `right of ${rightOf.id}`
    else {
      const spanned = participants.filter((p) => p.x >= rect.x && p.x <= right)
      if (spanned.length >= 2) where = `over ${spanned[0].id},${spanned[spanned.length - 1].id}`
      else {
        const centre = rect.x + rect.width / 2
        const near = spanned[0] ?? [...participants].sort((a, b) => Math.abs(a.x - centre) - Math.abs(b.x - centre))[0]
        where = `over ${near.id}`
      }
    }
    events.push({ y: rect.y, priority: 1, tie: 0, lines: (indent) => [`${indent}Note ${where}: ${text}`] })
  }

  // Frames open at their top edge and close at their bottom edge.
  for (const frame of frames) {
    const word = frame.kind === 'rect' ? 'rect' : frame.kind
    const text = seqText(frame.text)
    events.push({ y: frame.rect.y, priority: 2, tie: -area(frame.rect), depth: frame.depth, lines: (indent) => [`${indent}${word}${text ? ` ${text}` : frame.kind === 'rect' ? ' rgb(200, 200, 200)' : ''}`] })
    events.push({ y: frame.rect.y + frame.rect.height, priority: 0, tie: area(frame.rect), depth: frame.depth, lines: (indent) => [`${indent}end`] })
  }

  // Title: the large text above the participant boxes.
  const boxTop = Math.min(...participants.map((p) => p.box.y))
  const titleText = texts.filter((text) => !claimedText.has(text.id) && text.fontSize >= 28 && text.y + text.height <= boxTop + 2).sort((a, b) => a.y - b.y)[0]
  if (titleText) claimedText.add(titleText.id)

  const lines = ['sequenceDiagram']
  if (titleText && seqText(titleText.text)) lines.push(`  title ${seqText(titleText.text)}`)
  if (numbered) lines.push('  autonumber')
  for (const p of participants) {
    const label = seqText(p.label)
    // Mermaid 11 typed participant: `participant Id@{ "type": "database" } as Label` (the config goes before `as`).
    const typed = p.box.hldShape === 'database' || p.box.hldShape === 'queue' ? `@{ "type": "${p.box.hldShape}" }` : ''
    lines.push(`  ${p.actor ? 'actor' : 'participant'} ${p.id}${typed}${label && label !== p.id ? ` as ${label}` : ''}`)
  }
  events.sort((a, b) => a.y - b.y || a.priority - b.priority || a.tie - b.tie)
  for (const event of events) {
    // Items sit inside their frames; the frame lines themselves carry their own depth. An `end` closes at the frame's depth.
    const depth = event.depth !== undefined ? event.depth : depthAt(event.y)
    lines.push(...event.lines(`  ${'  '.repeat(depth)}`))
  }

  const leftOverText = texts.some((text) => !claimedText.has(text.id) && text.text.trim() !== '')
  const leftOverRect = rectangles.some((rect) => !usedRect.has(rect.id))
  const leftOverStroke = strokes.some((stroke) => !usedStroke.has(stroke.id))
  const connectors = items.some((item) => item.kind === 'connector' || item.kind === 'code')
  skippedOther = leftOverText || leftOverRect || leftOverStroke || connectors
  return { text: `${lines.join('\n')}\n`, boxes: participants.length, links: messages.length, skipped: skippedOther || skippedLinks > 0, skippedLinks, frames: frames.length }
}
