import { createShapeBox, type CanvasItem, type Point, type RectangleObject, type Stroke, type TextObject } from './canvasModel'
import { BOUNDARY_COLOR, BOUNDARY_FONT_SIZE } from './boundary'
import { CLASS_BOX_DEFAULT_STROKE_WIDTH } from './classBoxLayout'
import { HLD_TEMPLATE_SCALE, Sheet } from './diagramTemplates'
import { HLD_DEFAULT_SIZE } from './hldShapes'
import { cleanMermaidText as cleanText, MAX_MERMAID_TEXT, normalizeMermaidSpaces, stripMermaidFrontMatter } from './mermaidCommon'
import { STICKY_FILL, STICKY_OUTLINE } from './stickyNote'
import { createTextObject, measureTextSize } from './textLayout'

/**
 * Mermaid `sequenceDiagram` import: participants become boxes in a row (actors use the HLD User shape), each with a dashed vertical
 * lifeline; messages become horizontal arrow strokes, notes become sticky-note rectangles. Only ordinary items (rectangles, strokes, text
 * labels) with local ids from 1 per kind, top-left at (0, 0): the same convention the templates use, remapped by the paste/insert path.
 * Each participant box, its label and its lifeline share a `group` number, so dragging a participant moves its lifeline (the insert path
 * gives the pasted groups fresh numbers). `loop`/`alt`/`opt`/`par`/`critical`/`break`/`rect` ... `end` (nestable) become dashed unfilled boundary
 * rectangles behind everything, labelled "kind: text" at the top-left; `else` / `and` / `option` become a dashed divider with its text. Empty frames are skipped.
 * Skipped and counted: activate/deactivate, box, create, destroy, a stray `end` / `else`, anything unknown.
 */
export const MAX_SEQUENCE_PARTICIPANTS = 30
export const MAX_SEQUENCE_MESSAGES = 200

const INK = '#1e1e1e'
const LIFELINE_COLOR = '#6b7280'
const LABEL_SIZE = 20
const BOX_FONT = 24
const MIN_BOX_WIDTH = 140
const BOX_HEIGHT = 70
const MIN_CENTRE_GAP = 220
const LOOP_WIDTH = 50
const LOOP_HEIGHT = 36

const ID = '[\\p{L}\\p{N}_.]+'
const HEADER = /^sequenceDiagram[ \t]*(?:;.*)?$/
const PARTICIPANT = new RegExp(`^(participant|actor)\\s+(${ID})(?:\\s+as\\s+(.+))?$`, 'u')
const MESSAGE = new RegExp(`^(${ID})\\s*(-->>|->>|-->|->|--x|-x|--\\)|-\\))\\s*([+-]?)\\s*(${ID})\\s*(?::\\s*(.*))?$`, 'u')
const NOTE = new RegExp(`^note\\s+(over|left\\s+of|right\\s+of)\\s+(${ID})(?:\\s*,\\s*(${ID}))?\\s*:\\s*(.*)$`, 'iu')
const TITLE = /^title(?:\s*:\s*|\s+)(.+)$/
const FRAME = /^(loop|alt|opt|par|critical|break|rect)(?:\s+(.*))?$/
const FRAME_DIVIDER = /^(else|and|option)(?:\s+(.*))?$/
const FRAME_END = /^end$/
const AUTONUMBER = /^autonumber(?:\s|$)/

export type SequenceParticipant = { id: string; text: string; actor: boolean }
export type SequenceMessage = { kind: 'message'; from: string; to: string; text: string; dashed: boolean; head: boolean }
export type SequenceNote = { kind: 'note'; side: 'over' | 'left' | 'right'; a: string; b?: string; text: string }
export type SequenceMarker = { kind: 'open'; frame: number } | { kind: 'divider'; frame: number; text: string } | { kind: 'close'; frame: number }
export type SequenceStep = SequenceMessage | SequenceNote | SequenceMarker
type Frame = { kind: string; text: string; dividers: Array<{ y: number; text: string }>; minX: number; maxX: number; top: number; bottom: number; startY: number; depth: number; height: number; used: boolean }

export type MermaidSequenceBuild = { ok: true; items: CanvasItem[]; boxes: number; links: number; ignoredLines: number; kind: 'sequence'; /** Frames drawn (loop / alt / ... boundaries). */ frames: number } | { ok: false; error: string }

function sourceLines(text: string): string[] {
  return stripMermaidFrontMatter(normalizeMermaidSpaces(text).replace(/^﻿/, '')).split(/\r?\n/)
}

/** True when the first line that is not blank, front matter or a %% comment is `sequenceDiagram`. */
export function isMermaidSequenceText(text: string): boolean {
  for (const raw of sourceLines(text)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('%%')) continue
    return HEADER.test(line)
  }
  return false
}

export function buildMermaidSequence(text: string): MermaidSequenceBuild {
  if (!isMermaidSequenceText(text)) return { ok: false, error: 'Not a Mermaid sequence diagram (the first line must be "sequenceDiagram").' }
  const lines = sourceLines(text.slice(0, MAX_MERMAID_TEXT))
  const participants: SequenceParticipant[] = []
  const steps: SequenceStep[] = []
  let ignored = 0
  let title = ''
  let numbered = false
  let messageCount = 0
  let headerSeen = false
  const frameDefs: Array<{ kind: string; text: string }> = []
  const openFrames: number[] = []

  const known = (id: string): SequenceParticipant | undefined => participants.find((participant) => participant.id === id)
  /** The participant, added in order of first appearance; null when the cap is reached. */
  const ensure = (id: string): SequenceParticipant | null => {
    const found = known(id)
    if (found) return found
    if (participants.length >= MAX_SEQUENCE_PARTICIPANTS) return null
    const added: SequenceParticipant = { id, text: id, actor: false }
    participants.push(added)
    return added
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (line === '' || line.startsWith('%%')) continue
    if (!headerSeen) { headerSeen = true; continue }
    const declared = PARTICIPANT.exec(line)
    if (declared) {
      const participant = ensure(declared[2])
      if (!participant) { ignored += 1; continue }
      participant.actor = declared[1] === 'actor'
      if (declared[3] !== undefined) participant.text = cleanText(declared[3].replace(/^"(.*)"$/, '$1')) || declared[2]
      continue
    }
    if (AUTONUMBER.test(line)) { numbered = true; continue }
    const titled = TITLE.exec(line)
    if (titled) { title = cleanText(titled[1]); continue }
    const message = MESSAGE.exec(line)
    if (message) {
      if (messageCount >= MAX_SEQUENCE_MESSAGES) { ignored += 1; continue }
      const from = ensure(message[1])
      const to = from ? ensure(message[4]) : null
      if (!from || !to) { ignored += 1; continue }
      messageCount += 1
      steps.push({ kind: 'message', from: from.id, to: to.id, text: cleanText(message[5] ?? ''), dashed: message[2].startsWith('--'), head: message[2].endsWith('>>') || message[2].endsWith('x') || message[2].endsWith(')') })
      continue
    }
    const opened = FRAME.exec(line)
    if (opened) {
      frameDefs.push({ kind: opened[1], text: cleanText(opened[2] ?? '') })
      openFrames.push(frameDefs.length - 1)
      steps.push({ kind: 'open', frame: frameDefs.length - 1 })
      continue
    }
    const divided = FRAME_DIVIDER.exec(line)
    if (divided && openFrames.length > 0) { steps.push({ kind: 'divider', frame: openFrames[openFrames.length - 1], text: cleanText(divided[2] ?? '') }); continue }
    if (FRAME_END.test(line) && openFrames.length > 0) { steps.push({ kind: 'close', frame: openFrames.pop() as number }); continue }
    const noted = NOTE.exec(line)
    if (noted) {
      const side = noted[1].toLowerCase().startsWith('left') ? 'left' : noted[1].toLowerCase().startsWith('right') ? 'right' : 'over'
      const a = ensure(noted[2])
      const b = noted[3] && side === 'over' ? ensure(noted[3]) : null
      if (!a || (noted[3] && side === 'over' && !b)) { ignored += 1; continue }
      steps.push({ kind: 'note', side, a: a.id, ...(b ? { b: b.id } : {}), text: cleanText(noted[4]) })
      continue
    }
    ignored += 1
  }
  if (participants.length === 0) return { ok: false, error: 'No participants found' }
  while (openFrames.length > 0) steps.push({ kind: 'close', frame: openFrames.pop() as number }) // a frame left open at the end closes there
  return buildSequenceItems({ participants, steps, frameDefs, title, numbered, messageCount, ignored })
}

/** Parsed sequence diagram, independent of the text format (Mermaid or PlantUML). */
export type SequenceModel = { participants: SequenceParticipant[]; steps: SequenceStep[]; frameDefs: Array<{ kind: string; text: string }>; title: string; numbered: boolean; messageCount: number; ignored: number }

/** Lays out a parsed sequence model as canvas items (shared by the Mermaid and PlantUML importers). */
export function buildSequenceItems(model: SequenceModel): MermaidSequenceBuild {
  const { participants, steps, frameDefs, title, numbered, messageCount, ignored } = model
  // ---- Boxes: sizes, then centre x of each lifeline (relative, first box centred on 0).
  const userSize = { width: Math.round(HLD_DEFAULT_SIZE.user.width * HLD_TEMPLATE_SCALE), height: Math.round(HLD_DEFAULT_SIZE.user.height * HLD_TEMPLATE_SCALE) }
  const sizes = participants.map((participant) => {
    const label = measureTextSize(participant.text, BOX_FONT)
    const width = Math.max(MIN_BOX_WIDTH, Math.ceil((label.width + 48) / 10) * 10)
    const height = Math.max(BOX_HEIGHT, Math.ceil((label.height + 36) / 10) * 10)
    return participant.actor ? { width: Math.max(userSize.width, width), height: Math.max(userSize.height, height + 40) } : { width, height }
  })
  const column = new Map(participants.map((participant, index) => [participant.id, index]))
  const gaps = participants.slice(1).map((_, index) => Math.max(MIN_CENTRE_GAP, (sizes[index].width + sizes[index + 1].width) / 2 + 60))
  const labelWidth = (step: SequenceStep): number => (step.kind === 'message' ? measureTextSize(step.text || ' ', LABEL_SIZE).width + 60 : 0)
  // Each message label must fit between the two lifelines it joins: stretch the gaps in the span evenly when it does not.
  for (const step of steps) {
    if (step.kind !== 'message') continue
    const a = Math.min(column.get(step.from) as number, column.get(step.to) as number)
    const b = Math.max(column.get(step.from) as number, column.get(step.to) as number)
    if (a === b) {
      // A self message draws its label to the right of the loop: it must end before the next lifeline.
      if (a < gaps.length) gaps[a] = Math.max(gaps[a], LOOP_WIDTH + 16 + labelWidth(step))
      continue
    }
    const span = gaps.slice(a, b).reduce((sum, gap) => sum + gap, 0)
    const need = labelWidth(step)
    if (span < need) for (let index = a; index < b; index += 1) gaps[index] += (need - span) / (b - a)
  }
  const relative: number[] = [0]
  gaps.forEach((gap, index) => relative.push(relative[index] + gap))

  // ---- Notes and rows (positions relative to the first lifeline).
  const noteSize = (note: SequenceNote): { width: number; height: number } => {
    const label = measureTextSize(note.text || ' ', LABEL_SIZE)
    return { width: Math.max(note.side === 'over' ? 160 : 140, Math.ceil((label.width + 40) / 10) * 10), height: Math.max(60, Math.ceil((label.height + 30) / 10) * 10) }
  }
  const noteX = (note: SequenceNote, centres: number[]): { x: number; width: number } => {
    const size = noteSize(note)
    const ca = centres[column.get(note.a) as number]
    if (note.side === 'left') return { x: ca - 20 - size.width, width: size.width }
    if (note.side === 'right') return { x: ca + 20, width: size.width }
    const cb = centres[column.get(note.b ?? note.a) as number]
    const span = Math.abs(cb - ca) + 40
    const width = Math.max(size.width, span)
    return { x: (ca + cb) / 2 - width / 2, width }
  }
  let minX = Math.min(...relative.map((centre, index) => centre - sizes[index].width / 2))
  for (const step of steps) if (step.kind === 'note') minX = Math.min(minX, noteX(step, relative).x)
  const shift = -minX
  const centres = relative.map((centre) => Math.round(centre + shift))

  const sheet = new Sheet()
  const titleSize = title ? measureTextSize(title, 32) : { width: 0, height: 0 }
  const boxTop = title ? Math.ceil(titleSize.height) + 40 : 0
  const boxes: RectangleObject[] = participants.map((participant, index) => {
    const x = Math.round(centres[index] - sizes[index].width / 2)
    return participant.actor
      ? sheet.hld('user', x, boxTop, participant.text, sizes[index], Math.round(50 * HLD_TEMPLATE_SCALE))
      : sheet.shaped('rectangle', x, boxTop, sizes[index].width, sizes[index].height, participant.text)
  })
  const boxBottom = Math.max(...boxes.map((box) => box.y + box.height))
  // One group per participant: its box, the label inside it and (below) its lifeline.
  boxes.forEach((box, index) => {
    box.group = index + 1
    const label = sheet.items[sheet.items.indexOf(box) + 1]
    if (label && label.kind === 'text') label.group = index + 1
  })

  let strokeId = 1
  let rectangleId = boxes.length + 1
  let textId = boxes.length + 1
  const lifelines: Stroke[] = []
  const strokes: Stroke[] = []
  const rectangles: RectangleObject[] = []
  const texts: TextObject[] = []
  const pt = (x: number, y: number): Point => ({ x: Math.round(x), y: Math.round(y), pressure: 1 })
  const addText = (value: string, centreX: number, top: number, fontSize: number): TextObject => {
    const made = createTextObject(textId++, 0, 0, value, INK, fontSize)
    const label: TextObject = { ...made, align: 'center', x: Math.round(centreX - made.width / 2), y: Math.round(top) }
    texts.push(label)
    return label
  }
  const addStroke = (from: Point, to: Point, dashed: boolean, heads: 'none' | 'end', color = INK, width = CLASS_BOX_DEFAULT_STROKE_WIDTH): void => {
    strokes.push({ kind: 'stroke', id: strokeId++, points: [from, to], color, width, erase: false, shape: heads === 'end' ? 'arrow' : 'line', ...(dashed ? { dash: 'dashed' as const } : {}), arrowheads: heads })
  }

  if (title) addText(title, (centres[0] + centres[centres.length - 1]) / 2, 0, 32)

  const frames: Frame[] = frameDefs.map((def) => ({ ...def, dividers: [], minX: Infinity, maxX: -Infinity, top: 0, bottom: 0, startY: 0, depth: 0, height: 0, used: false }))
  const stack: Frame[] = []
  const touch = (left: number, right: number): void => {
    for (const frame of stack) { frame.used = true; frame.minX = Math.min(frame.minX, left); frame.maxX = Math.max(frame.maxX, right) }
  }
  const drawn: Frame[] = []

  let y = boxBottom + 30
  let counter = 0
  for (const step of steps) {
    if (step.kind === 'open') {
      const frame = frames[step.frame]
      frame.startY = y
      frame.top = y
      frame.depth = stack.length
      y += 40 // room for the frame label above the first message label
      stack.push(frame)
      continue
    }
    if (step.kind === 'divider') {
      const frame = frames[step.frame]
      frame.dividers.push({ y: y + 4, text: step.text })
      y += step.text ? 40 : 24
      continue
    }
    if (step.kind === 'close') {
      const frame = frames[step.frame]
      stack.pop()
      if (!frame.used) { y = frame.startY; continue } // empty: nothing drawn, space given back
      frame.bottom = y
      y += 16
      const parent = stack[stack.length - 1]
      if (parent) parent.height = Math.max(parent.height, frame.height + 1)
      drawn.push(frame)
      continue
    }
    if (step.kind === 'note') {
      const size = noteSize(step)
      const place = noteX(step, centres)
      const note: RectangleObject = { kind: 'rectangle', id: rectangleId++, x: Math.round(place.x), y: Math.round(y + 10), width: Math.round(place.width), height: size.height, strokeColor: STICKY_OUTLINE, strokeWidth: CLASS_BOX_DEFAULT_STROKE_WIDTH, fillColor: STICKY_FILL }
      rectangles.push(note)
      if (step.text) {
        const made = createTextObject(textId, 0, 0, step.text, INK, LABEL_SIZE)
        addText(step.text, note.x + note.width / 2, note.y + note.height / 2 - made.height / 2, LABEL_SIZE)
      }
      touch(note.x, note.x + note.width)
      y += size.height + 30
      continue
    }
    counter += 1
    const label = numbered ? `${counter}.${step.text ? ' ' : ''}${step.text}` : step.text
    const labelHeight = label ? measureTextSize(label, LABEL_SIZE).height : 0
    const x1 = centres[column.get(step.from) as number]
    const x2 = centres[column.get(step.to) as number]
    const heads = step.head ? 'end' : 'none'
    touch(Math.min(x1, x2), Math.max(x1, x2) + (x1 === x2 ? LOOP_WIDTH + (label ? 16 + measureTextSize(label, LABEL_SIZE).width : 0) : 0))
    if (x1 === x2) {
      const top = y + 20 + labelHeight
      // Self message: out to the right, down, and back, as three straight strokes (arrow strokes are straight lines).
      addStroke(pt(x1, top), pt(x1 + LOOP_WIDTH, top), step.dashed, 'none')
      addStroke(pt(x1 + LOOP_WIDTH, top), pt(x1 + LOOP_WIDTH, top + LOOP_HEIGHT), step.dashed, 'none')
      addStroke(pt(x1 + LOOP_WIDTH, top + LOOP_HEIGHT), pt(x1, top + LOOP_HEIGHT), step.dashed, heads)
      if (label) {
        const made = createTextObject(textId, 0, 0, label, INK, LABEL_SIZE)
        // Left-aligned look to the right of the loop: centre it on its own width.
        addText(label, x1 + LOOP_WIDTH + 16 + made.width / 2, top + LOOP_HEIGHT / 2 - made.height / 2, LABEL_SIZE)
      }
      y = top + LOOP_HEIGHT + 30
    } else {
      const arrowY = y + 20 + labelHeight + 10
      addStroke(pt(x1, arrowY), pt(x2, arrowY), step.dashed, heads)
      if (label) addText(label, (x1 + x2) / 2, arrowY - 6 - labelHeight, LABEL_SIZE)
      y = arrowY + 30
    }
  }

  const lifelineEnd = Math.max(y + 20, boxBottom + 120)
  boxes.forEach((box, index) => {
    lifelines.push({ kind: 'stroke', id: strokeId++, points: [pt(centres[index], box.y + box.height), pt(centres[index], lifelineEnd)], color: LIFELINE_COLOR, width: 2, erase: false, shape: 'line', dash: 'dashed', arrowheads: 'none' })
  })

  lifelines.forEach((line, index) => { line.group = index + 1 })

  // Frames: dashed boundaries (outer first, so inner ones draw over them), a label at the top-left and dividers across.
  drawn.sort((a, b) => frames.indexOf(a) - frames.indexOf(b))
  const frameRectangles: RectangleObject[] = []
  for (const frame of drawn) {
    const label = frame.kind === 'rect' ? '' : frame.text ? `${frame.kind}: ${frame.text}` : frame.kind
    const labelObject = label ? createTextObject(textId++, 0, 0, label, BOUNDARY_COLOR, BOUNDARY_FONT_SIZE) : null
    const pad = 36 + 14 * frame.height
    const left = Math.round(frame.minX - pad)
    const right = Math.round(Math.max(frame.maxX + pad, left + (labelObject ? labelObject.width + 24 : 0)))
    const rectangle: RectangleObject = { ...createShapeBox(rectangleId++, left, Math.round(frame.top), right - left, Math.round(frame.bottom - frame.top), BOUNDARY_COLOR, 2, 'rectangle'), dash: 'dashed' }
    frameRectangles.push(rectangle)
    if (labelObject) texts.push({ ...labelObject, x: left + 12, y: Math.round(frame.top) + 8 })
    for (const divider of frame.dividers) {
      addStroke(pt(left, divider.y), pt(right, divider.y), true, 'none', BOUNDARY_COLOR, 2)
      if (divider.text) {
        const made = createTextObject(textId++, 0, 0, divider.text, BOUNDARY_COLOR, BOUNDARY_FONT_SIZE)
        texts.push({ ...made, x: left + 12, y: Math.round(divider.y) + 6 })
      }
    }
  }

  // Frames first (behind everything), then lifelines, so boxes, arrows and labels draw over them.
  const items: CanvasItem[] = [...frameRectangles, ...lifelines, ...sheet.items, ...rectangles, ...strokes, ...texts]
  return { ok: true, items, boxes: participants.length, links: messageCount, ignoredLines: ignored, kind: 'sequence', frames: drawn.length }
}

/** Result of any Mermaid importer (flowchart, class, sequence); the dispatcher in mermaidImport.ts returns it. */
export type MermaidDiagramResult =
  | { ok: true; items: CanvasItem[]; boxes: number; links: number; ignoredLines: number; kind: 'flowchart' | 'class' | 'sequence' | 'er' | 'state'; /** Sequence frames drawn. */ frames?: number }
  | { ok: false; error: string }
