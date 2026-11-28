import { canvasItemKey, getConnectorRenderSpec, strokeArrowheads, type CanvasItem, type CodeObject, type ConnectorObject, type LineDash, type Point, type RectangleObject, type Stroke, type TextFontId, type TextObject } from './canvasModel'
import { routeConnectors } from './connectorRoute'
import { labelInsideBox } from './diagramFlow'
import { HLD_SHAPE_LABELS } from './hldShapes'
import { estimateTextSize } from './textLayout'

/**
 * Excalidraw export (Export panel: "Download .excalidraw" and, on the desktop, "Copy for Excalidraw"). Pure: reads the items, changes nothing and
 * adds nothing to the saved format. Writes the public Excalidraw JSON that the round 7 importer (excalidrawImport.ts) reads back:
 * rectangles (rounded kept), diamonds and ellipses with fill, dash and width; text centred in a box becomes its bound label (container id and
 * bound elements), other text is free text; a connector becomes an arrow bound to its boxes (start/end arrowheads, elbow, dash, bound label);
 * a straight arrow or line stroke becomes an arrow or line, other strokes freedraw; boundaries (dashed rectangles) stay rectangles; HLD shapes are
 * labelled rectangles; class boxes are rectangles with their text; code blocks are a rectangle with monospace text. Ink-box ink and unknown
 * (opaque) items are skipped and counted.
 */

type El = Record<string, unknown>

export type ExcalidrawExport = { elements: El[]; /** Canvas items written. */ count: number; /** Items left out (opaque items). */ skipped: number }

const SOURCE = 'InkPad'
const LINE_HEIGHT = 1.25
const TRANSPARENT = 'transparent'

/** Text counts as a box's label when its centre is this close to the box centre (fraction of the box size, at least MIN px). */
const CENTRE_TOLERANCE = 0.2
const CENTRE_MIN = 12

function fontFamilyOf(font: TextFontId | undefined): number {
  if (font === 'mono') return 3
  if (font === 'sans' || font === 'serif') return 2
  return 5
}

/** InkPad widths 2 / 3 / 5 become Excalidraw 1 / 2 / 4 (the importer maps them back). */
const widthOf = (width: number): number => (width <= 2 ? 1 : width <= 3.5 ? 2 : 4)
const styleOf = (dash: LineDash | undefined): string => (dash === 'dashed' ? 'dashed' : dash === 'dotted' ? 'dotted' : 'solid')
const round2 = (value: number): number => Math.round(value * 100) / 100

/** Small deterministic seed from the element id, so exporting the same page twice gives the same text. */
function seedOf(id: string): number {
  let hash = 7
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 2147483647
  return hash || 1
}

function base(id: string, type: string, x: number, y: number, width: number, height: number, extra: El, group?: number): El {
  return {
    id,
    type,
    x: round2(x),
    y: round2(y),
    width: round2(width),
    height: round2(height),
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: TRANSPARENT,
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: group === undefined ? [] : [`g${group}`],
    frameId: null,
    roundness: null,
    seed: seedOf(id),
    version: 1,
    versionNonce: seedOf(`${id}:n`),
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    ...extra,
  }
}

const cleanText = (text: string): string => text.replace(/\r\n?/g, '\n')

function textElement(id: string, text: string, x: number, y: number, size: { width: number; height: number }, fontSize: number, color: string, font: TextFontId | undefined, extra: El, group?: number): El {
  return base(id, 'text', x, y, size.width, size.height, {
    strokeColor: color,
    text,
    originalText: text,
    fontSize,
    fontFamily: fontFamilyOf(font),
    textAlign: 'left',
    verticalAlign: 'top',
    containerId: null,
    lineHeight: LINE_HEIGHT,
    autoResize: true,
    ...extra,
  }, group)
}

/** The text of a typed class box: name, attributes, methods (blank parts left out). */
function classText(box: RectangleObject): string {
  const content = box.classBox
  if (!content) return ''
  const parts = [content.name, content.attributes, content.methods].map((part) => cleanText(part).trim()).filter(Boolean)
  return parts.join('\n──────\n')
}

/** The keys to export: the selection plus the text labels sitting inside selected boxes. */
function selectedItems(items: readonly CanvasItem[], keys: ReadonlySet<string>): CanvasItem[] {
  const boxes = items.filter((item): item is RectangleObject => item.kind === 'rectangle' && keys.has(canvasItemKey(item)))
  return items.filter((item) => keys.has(canvasItemKey(item)) || (item.kind === 'text' && boxes.some((box) => labelInsideBox(item, box))))
}

const area = (box: RectangleObject): number => box.width * box.height

function centredIn(text: TextObject, box: RectangleObject): boolean {
  if (!labelInsideBox(text, box)) return false
  const dx = Math.abs(text.x + text.width / 2 - (box.x + box.width / 2))
  const dy = Math.abs(text.y + text.height / 2 - (box.y + box.height / 2))
  return dx <= Math.max(CENTRE_MIN, box.width * CENTRE_TOLERANCE) && dy <= Math.max(CENTRE_MIN, box.height * CENTRE_TOLERANCE)
}

/** The Excalidraw elements for the items (or, when `keys` is a non-empty set, only the selected items and their labels). */
export function buildExcalidrawElements(allItems: readonly CanvasItem[], keys?: ReadonlySet<string> | null): ExcalidrawExport {
  const chosen = keys && keys.size > 0 ? selectedItems(allItems, keys) : allItems.slice()
  const items = routeConnectors(chosen.filter((item) => !(item.kind === 'stroke' && item.erase)))
  const rectangles = items.filter((item): item is RectangleObject => item.kind === 'rectangle')
  const rectangleIds = new Set(rectangles.map((box) => box.id))

  // Text centred in a box is that box's bound label (smallest box wins; one label per box; class boxes carry their own text).
  const labelOf = new Map<number, TextObject>()
  const labelBox = new Map<number, RectangleObject>()
  for (const item of items) {
    if (item.kind !== 'text' || item.text.trim() === '') continue
    let owner: RectangleObject | null = null
    for (const box of rectangles) if (!box.classBox && centredIn(item, box) && (!owner || area(box) < area(owner))) owner = box
    if (!owner || labelOf.has(owner.id)) continue
    labelOf.set(owner.id, item)
    labelBox.set(item.id, owner)
  }

  const boundByBox = new Map<number, Array<{ id: string; type: string }>>()
  const bind = (boxId: number, id: string, type: string): void => { boundByBox.set(boxId, [...(boundByBox.get(boxId) ?? []), { id, type }]) }
  const out: El[] = []
  let count = 0
  let skipped = 0
  const rectEl = new Map<number, El>()

  for (const item of items) {
    if (item.kind === 'opaque') { skipped += 1; continue }
    count += 1
    if (item.kind === 'rectangle') {
      const box = item
      const type = box.diamond ? 'diamond' : box.ellipse ? 'ellipse' : 'rectangle'
      const el = base(`r${box.id}`, type, box.x, box.y, box.width, box.height, {
        strokeColor: box.strokeColor,
        backgroundColor: box.fillColor ?? TRANSPARENT,
        strokeWidth: widthOf(box.strokeWidth),
        strokeStyle: styleOf(box.dash),
        ...(box.angle ? { angle: round2(box.angle) } : {}),
        ...(type === 'rectangle' && box.rounded === true ? { roundness: { type: 3 } } : {}),
      }, box.group)
      rectEl.set(box.id, el)
      out.push(el)
      const label = labelOf.get(box.id)
      const own = classText(box) || (!label && box.hldShape ? HLD_SHAPE_LABELS[box.hldShape] : '')
      if (label) {
        const id = `t${label.id}`
        bind(box.id, id, 'text')
        out.push(textElement(id, cleanText(label.text), label.x, label.y, label, label.fontSize, label.color, label.fontFamily, {
          textAlign: 'center',
          verticalAlign: 'middle',
          containerId: el.id,
          ...(box.angle ? { angle: round2(box.angle) } : {}),
        }, label.group ?? box.group))
      } else if (own) {
        const id = `b${box.id}`
        const size = estimateTextSize(own, 18)
        bind(box.id, id, 'text')
        out.push(textElement(id, own, box.x + (box.width - size.width) / 2, box.y + (box.height - size.height) / 2, size, 18, box.strokeColor, box.classBox ? 'mono' : undefined, {
          textAlign: box.classBox ? 'left' : 'center',
          verticalAlign: box.classBox ? 'top' : 'middle',
          containerId: el.id,
        }, box.group))
      }
      continue
    }
    if (item.kind === 'text') {
      if (labelBox.has(item.id)) continue // written with its box
      out.push(textElement(`t${item.id}`, cleanText(item.text), item.x, item.y, item, item.fontSize, item.color, item.fontFamily, {
        textAlign: item.align === 'center' ? 'center' : item.align === 'right' ? 'right' : 'left',
        ...(item.angle ? { angle: round2(item.angle) } : {}),
      }, item.group))
      continue
    }
    if (item.kind === 'code') {
      out.push(...codeElements(item))
      continue
    }
    if (item.kind === 'stroke') { out.push(strokeElement(item)); continue }
    out.push(...connectorElements(item, rectangleIds, bind))
  }

  // Back-fill each box's bound elements (its label and the arrows that end on it).
  for (const [boxId, bound] of boundByBox) {
    const el = rectEl.get(boxId)
    if (el) el.boundElements = bound
  }
  return { elements: out, count, skipped }
}

function codeElements(code: CodeObject): El[] {
  const rect = base(`k${code.id}`, 'rectangle', code.x, code.y, code.width, code.height, { strokeColor: '#868e96', backgroundColor: '#f8f9fa', roundness: { type: 3 } }, code.group)
  const fontSize = code.fontSize ?? 13
  const text = cleanText(code.text)
  const size = estimateTextSize(text, fontSize)
  return [rect, textElement(`kt${code.id}`, text, code.x + 12, code.y + 10, size, fontSize, '#1e1e1e', 'mono', {}, code.group)]
}

function pointsRelative(points: Point[]): { x: number; y: number; rel: Array<[number, number]>; width: number; height: number } {
  const first = points[0]
  const rel = points.map((p): [number, number] => [round2(p.x - first.x), round2(p.y - first.y)])
  const xs = rel.map((p) => p[0])
  const ys = rel.map((p) => p[1])
  return { x: first.x, y: first.y, rel, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
}

function strokeElement(stroke: Stroke): El {
  const points = stroke.points.length > 0 ? stroke.points : [{ x: 0, y: 0, pressure: 1 }]
  const geometry = pointsRelative(points)
  if (stroke.shape === 'arrow' || stroke.shape === 'line') {
    const heads = strokeArrowheads(stroke)
    // A bent arrow (3+ points, round 8) keeps every point; a straight arrow or line is its two ends.
    const ends = stroke.shape === 'arrow' && points.length >= 3 ? points : [points[0], points[points.length - 1]]
    const two = pointsRelative(ends)
    return base(`s${stroke.id}`, stroke.shape, two.x, two.y, two.width, two.height, {
      strokeColor: stroke.color,
      strokeWidth: widthOf(stroke.width),
      strokeStyle: styleOf(stroke.dash),
      points: two.rel,
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: stroke.shape === 'arrow' && (heads === 'start' || heads === 'both') ? 'arrow' : null,
      endArrowhead: stroke.shape === 'arrow' && (heads === 'end' || heads === 'both') ? 'arrow' : null,
      ...(stroke.shape === 'arrow' ? { elbowed: false } : {}),
    }, stroke.group)
  }
  return base(`s${stroke.id}`, 'freedraw', geometry.x, geometry.y, geometry.width, geometry.height, {
    strokeColor: stroke.color,
    strokeWidth: widthOf(stroke.width),
    points: geometry.rel,
    pressures: points.map((p) => round2(p.pressure)),
    simulatePressure: false,
    lastCommittedPoint: null,
  }, stroke.group)
}

function connectorElements(connector: ConnectorObject, rectangleIds: ReadonlySet<number>, bind: (boxId: number, id: string, type: string) => void): El[] {
  const spec = getConnectorRenderSpec(connector)
  const id = `c${connector.id}`
  const routed = (connector.routing === 'elbow' || connector.routing === 'curved') && connector.routedPath && connector.routedPath.length >= 2 ? connector.routedPath : null
  const curved = connector.routing === 'curved' && routed !== null
  // A curve is written with every 4th sampled point (Excalidraw rounds the arrow through them: roundness type 2); the end point is always kept.
  const path = routed === null ? [connector.start, connector.end] : curved ? routed.filter((_, index) => index % 4 === 0 || index === routed.length - 1) : routed
  const geometry = pointsRelative(path)
  const dashed = connector.dash === 'solid' ? 'solid' : connector.dash ? styleOf(connector.dash) : spec.lineStyle === 'dashed' ? 'dashed' : 'solid'
  const head = spec.symbol === 'hollow-triangle' ? 'triangle_outline' : spec.symbol === 'hollow-diamond' ? 'diamond_outline' : spec.symbol === 'filled-diamond' ? 'diamond' : 'arrow'
  const both = connector.twoWay === true && connector.relationshipType === 'directed-association'
  const startHead = both || spec.endpoint === 'start' ? head : null
  const endHead = both || spec.endpoint === 'end' ? head : null
  const binding = (attachment: ConnectorObject['startAttachment']): El | null => {
    if (!attachment || !rectangleIds.has(attachment.rectangleId)) return null
    bind(attachment.rectangleId, id, 'arrow')
    return { elementId: `r${attachment.rectangleId}`, focus: 0, gap: 1 }
  }
  const startBinding = binding(connector.startAttachment)
  const endBinding = binding(connector.endAttachment)
  const bound: Array<{ id: string; type: string }> = []
  const out: El[] = []
  const label = connector.label?.trim()
  if (label) {
    const labelFont = connector.labelFontSize ?? 18
    const size = estimateTextSize(label, labelFont)
    const position = connector.labelPosition ?? 0.5
    const at = path[Math.min(path.length - 1, Math.floor((path.length - 1) * position))]
    const nextAt = path[Math.min(path.length - 1, Math.floor((path.length - 1) * position) + 1)]
    const mid = path.length === 2 ? { x: path[0].x + (path[1].x - path[0].x) * position, y: path[0].y + (path[1].y - path[0].y) * position } : { x: (at.x + nextAt.x) / 2, y: (at.y + nextAt.y) / 2 }
    bound.push({ id: `${id}l`, type: 'text' })
    out.push(textElement(`${id}l`, cleanText(label), mid.x - size.width / 2, mid.y - size.height / 2, size, labelFont, connector.strokeColor, undefined, { textAlign: 'center', verticalAlign: 'middle', containerId: id }, connector.group))
  }
  const arrow = base(id, 'arrow', geometry.x, geometry.y, geometry.width, geometry.height, {
    strokeColor: connector.strokeColor,
    strokeWidth: widthOf(connector.strokeWidth),
    strokeStyle: dashed,
    points: geometry.rel,
    lastCommittedPoint: null,
    startBinding,
    endBinding,
    startArrowhead: startHead,
    endArrowhead: endHead,
    // Never elbowed: Excalidraw's restore drops the bindings of an elbow arrow that has no fixedPoint, so an elbow connector is written as an ordinary
    // bound arrow whose points follow the routed path (re-importing it gives a plain polyline connector, not an elbow one).
    elbowed: false,
    ...(curved ? { roundness: { type: 2 } } : {}),
    boundElements: bound.length > 0 ? bound : null,
  }, connector.group)
  // Multiplicity texts beside the ends.
  const ends: El[] = []
  for (const [text, at, suffix] of [[connector.startLabel, connector.start, 's'], [connector.endLabel, connector.end, 'e']] as const) {
    if (!text) continue
    const size = estimateTextSize(text, 16)
    ends.push(textElement(`${id}${suffix}`, text, at.x + 8, at.y - size.height - 4, size, 16, connector.strokeColor, undefined, {}, connector.group))
  }
  return [arrow, ...out, ...ends]
}

export type ExcalidrawText = ExcalidrawExport & { text: string }

const stringify = (value: unknown): string => JSON.stringify(value, null, 2)

/** The `.excalidraw` file text: `{type:'excalidraw', version:2, source, elements, appState, files}`. */
export function buildExcalidrawFile(items: readonly CanvasItem[], keys?: ReadonlySet<string> | null, background = '#ffffff'): ExcalidrawText {
  const built = buildExcalidrawElements(items, keys)
  return { ...built, text: stringify({ type: 'excalidraw', version: 2, source: SOURCE, elements: built.elements, appState: { viewBackgroundColor: background, gridSize: null }, files: {} }) }
}

/** The text for the clipboard, which pastes straight into excalidraw.com: `{type:'excalidraw/clipboard', elements, files}`. */
export function buildExcalidrawClipboard(items: readonly CanvasItem[], keys?: ReadonlySet<string> | null): ExcalidrawText {
  const built = buildExcalidrawElements(items, keys)
  return { ...built, text: stringify({ type: 'excalidraw/clipboard', elements: built.elements, files: {} }) }
}

export function excalidrawFileName(title: string): string {
  const base = title.replace(/\s+/g, ' ').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/^\.+/, '').slice(0, 80).trim()
  return `${base || 'diagram'}.excalidraw`
}

/** The toast after exporting: "Excalidraw: 12 items from the selection". */
export function excalidrawExportMessage(result: ExcalidrawExport, verb: 'Copied' | 'Saved', fromSelection: boolean): string {
  if (result.count === 0) return 'Nothing to export'
  return `${verb} ${result.count} ${result.count === 1 ? 'item' : 'items'} for Excalidraw${fromSelection ? ' (selection)' : ''}${result.skipped > 0 ? `; ${result.skipped} skipped` : ''}`
}
