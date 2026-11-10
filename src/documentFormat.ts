import type { HldShape, CanvasItem, ClassBoxContent, ConnectorAttachment, InkBoxContent, ConnectorObject, ConnectorRelationshipType, Point, RectangleObject, Stroke, TextObject } from './canvasModel'

/**
 * Versioned InkPad document (.inkpad file / stored diagram).
 * Coordinates are sheet canvas coordinates, exactly as held in memory.
 * Undo history and viewport are intentionally not part of a document.
 */
export const DOCUMENT_FORMAT = 'inkpad-document'
export const DOCUMENT_VERSION = 1
/** Written only by diagrams with more than one page. An InkPad that only knows v1 refuses these ("update InkPad") instead of opening page 1 and silently dropping the rest on its next save. */
export const MULTI_PAGE_VERSION = 2
/** Mirrors MAX_PAGES in pages.ts (a test checks they agree). */
const MAX_DOCUMENT_PAGES = 50
export const DOCUMENT_FILE_EXTENSION = '.inkpad'
export const DOCUMENT_MIME_TYPE = 'application/json'

export type DocumentPageTemplate = 'blank' | 'lined' | 'dotted'
export type DocumentPageSpacing = 'narrow' | 'standard' | 'wide'
export type DocumentPageBackground = 'white' | 'warm' | 'blue' | 'yellow' | 'green'

export type InkPadDocument = {
  format: typeof DOCUMENT_FORMAT
  version: number
  title: string
  createdAt: string
  updatedAt: string
  /** `spacing` is written only when it is not the standard one; `sheetHeight` only when the page has grown past its first height. */
  page: { template: DocumentPageTemplate; background: DocumentPageBackground; spacing?: DocumentPageSpacing; sheetHeight?: number }
  /** `items` is page 1. Pages 2 and on, only when the diagram has more than one page. */
  items: CanvasItem[]
  pages?: Array<{ items: CanvasItem[] }>
}

export type DocumentInput = {
  title?: string
  createdAt?: string
  updatedAt?: string
  template: DocumentPageTemplate
  background: DocumentPageBackground
  spacing?: DocumentPageSpacing
  /** Page height after it grew (2000, 2500 or 3000); left out for the first height. */
  sheetHeight?: number
  /** Page 1. */
  items: CanvasItem[]
  /** Pages 2 and on. */
  extraPages?: CanvasItem[][]
  /** Reuse finished strokes as they are instead of copying them (committed strokes are never changed afterwards). Used for autosave. */
  shareStrokes?: boolean
}

export type ParseResult =
  | { ok: true; document: InkPadDocument; droppedItems: number; migratedFrom: number | null }
  | { ok: false; error: string }

export type NextIds = { stroke: number; rectangle: number; connector: number; text: number }

/** The grown page heights a document may hold; the first height (1500) is never written. Mirrors SHEET_MIN_HEIGHT, SHEET_GROW_STEP and SHEET_MAX_HEIGHT in viewport.ts (a test checks they agree). */
const GROWN_SHEET_HEIGHTS = [2000, 2500, 3000]
const grownSheetHeight = (value: unknown): { sheetHeight: number } | Record<string, never> =>
  typeof value === 'number' && GROWN_SHEET_HEIGHTS.includes(value) ? { sheetHeight: value } : {}
const TEMPLATES: DocumentPageTemplate[] = ['blank', 'lined', 'dotted']
const BACKGROUNDS: DocumentPageBackground[] = ['white', 'warm', 'blue', 'yellow', 'green']
/** Same kinds as HLD_SHAPES in canvasModel.ts (not imported: this file only takes types from there). */
const HLD_SHAPE_KINDS: string[] = ['database', 'queue', 'service']
const RELATIONSHIPS: ConnectorRelationshipType[] = ['association', 'directed-association', 'inheritance', 'realization', 'dependency', 'aggregation', 'composition']
const MAX_TITLE_LENGTH = 120
const MAX_TEXT_LENGTH = 2000
const MIN_FONT_SIZE = 4
const MAX_FONT_SIZE = 400
export const DEFAULT_DOCUMENT_TITLE = 'Untitled diagram'

export function createDocument(input: DocumentInput, now = new Date().toISOString()): InkPadDocument {
  const extraPages = (input.extraPages ?? []).slice(0, MAX_DOCUMENT_PAGES - 1)
  const copy = (item: CanvasItem) => (input.shareStrokes && item.kind === 'stroke' ? item : cloneItem(item))
  return {
    format: DOCUMENT_FORMAT,
    version: extraPages.length > 0 ? MULTI_PAGE_VERSION : DOCUMENT_VERSION,
    title: cleanTitle(input.title),
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    page: { template: input.template, background: input.background, ...(input.spacing === 'narrow' || input.spacing === 'wide' ? { spacing: input.spacing } : {}), ...grownSheetHeight(input.sheetHeight) },
    items: input.items.map(copy),
    ...(extraPages.length > 0 ? { pages: extraPages.map((items) => ({ items: items.map(copy) })) } : {}),
  }
}

// A finished stroke never changes, so its JSON text is made once and reused by every later save.
const strokeJson = new WeakMap<object, string>()

/** The document as JSON text, identical to JSON.stringify(document) but only serializing strokes it has not seen before. */
export function stringifyDocument(document: InkPadDocument): string {
  const { pages, ...rest } = document
  const head = JSON.stringify({ ...rest, items: [] })
  if (!head.endsWith('"items":[]}')) return JSON.stringify(document)
  const itemsText = (items: CanvasItem[]) => items.map((item) => {
    if (item.kind !== 'stroke') return JSON.stringify(item)
    let text = strokeJson.get(item)
    if (text === undefined) {
      text = JSON.stringify(item)
      strokeJson.set(item, text)
    }
    return text
  }).join(',')
  const pagesText = pages && pages.length > 0 ? `,"pages":[${pages.map((page) => `{"items":[${itemsText(page.items)}]}`).join(',')}]` : ''
  return `${head.slice(0, -2)}${itemsText(document.items)}]${pagesText}}`
}

/** Number of items in the whole diagram, every page counted. */
export function documentItemCount(document: InkPadDocument): number {
  let count = document.items.length
  for (const page of document.pages ?? []) count += page.items.length
  return count
}

/** Number of pages in the diagram (at least 1). */
export function documentPageCount(document: InkPadDocument): number {
  return 1 + (document.pages?.length ?? 0)
}

/** An open diagram's content for "did anything change since the last save" checks. */
export type DocumentSignature = { title: string; template: DocumentPageTemplate; background: DocumentPageBackground; spacing?: DocumentPageSpacing; sheetHeight?: number; items: CanvasItem[]; extraPages?: CanvasItem[][] }

export function sameSignature(a: DocumentSignature | null, b: DocumentSignature | null): boolean {
  if (!a || !b) return false
  if (a.title !== b.title || a.template !== b.template || a.background !== b.background || (a.spacing ?? 'standard') !== (b.spacing ?? 'standard') || (a.sheetHeight ?? 1500) !== (b.sheetHeight ?? 1500) || a.items.length !== b.items.length) return false
  for (let index = 0; index < a.items.length; index += 1) if (a.items[index] !== b.items[index]) return false
  const aPages = a.extraPages ?? []
  const bPages = b.extraPages ?? []
  if (aPages.length !== bPages.length) return false
  for (let page = 0; page < aPages.length; page += 1) {
    if (aPages[page].length !== bPages[page].length) return false
    for (let index = 0; index < aPages[page].length; index += 1) if (aPages[page][index] !== bPages[page][index]) return false
  }
  return true
}

/** Largest used id per kind + 1, so new items never collide with loaded ones. */
export function getNextIds(items: CanvasItem[]): NextIds {
  const next: NextIds = { stroke: 1, rectangle: 1, connector: 1, text: 1 }
  for (const item of items) next[item.kind] = Math.max(next[item.kind], item.id + 1)
  return next
}

export function cleanTitle(title: unknown): string {
  const text = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH) : ''
  return text || DEFAULT_DOCUMENT_TITLE
}

/** What to save after the title was edited in place, or null when nothing changed (so no needless save). Empty text means the default title. */
export function titleToCommit(current: string, draft: string): string | null {
  const next = cleanTitle(draft)
  return next === cleanTitle(current) ? null : next
}

export function documentFileName(title: string): string {
  const base = cleanTitle(title).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().replace(/\s+/g, '-') || 'diagram'
  return `${base}${DOCUMENT_FILE_EXTENSION}`
}

/** Version migrations: migrations[n] upgrades a version-n payload to n + 1. */
const migrations: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {}

export function parseDocument(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' }
  }
  if (!isRecord(raw) || raw.format !== DOCUMENT_FORMAT) return { ok: false, error: 'This is not an InkPad document.' }
  const version = raw.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, error: 'The document has no valid version.' }
  if (version > MULTI_PAGE_VERSION) return { ok: false, error: `This document was saved by a newer InkPad (format v${version}). Update InkPad to open it.` }

  let current: Record<string, unknown> = raw
  for (let v = version; v < DOCUMENT_VERSION; v += 1) {
    const migrate = migrations[v]
    if (!migrate) return { ok: false, error: `No migration from format v${v}.` }
    current = migrate(current)
  }
  if (!Array.isArray(current.items)) return { ok: false, error: 'The document has no items list.' }

  const page = isRecord(current.page) ? current.page : {}
  const first = cleanItems(current.items)
  const finalItems = first.items
  let droppedItems = first.dropped
  const extraPages: Array<{ items: CanvasItem[] }> = []
  if (Array.isArray(current.pages)) {
    for (const rawPage of current.pages.slice(0, MAX_DOCUMENT_PAGES - 1)) {
      // A page that cannot be read stays as an empty page, so the pages after it keep their place.
      const cleaned = isRecord(rawPage) && Array.isArray(rawPage.items) ? cleanItems(rawPage.items) : { items: [], dropped: 0 }
      droppedItems += cleaned.dropped
      extraPages.push({ items: cleaned.items })
    }
    droppedItems += Math.max(0, current.pages.length - (MAX_DOCUMENT_PAGES - 1))
  }

  const now = new Date().toISOString()
  return {
    ok: true,
    droppedItems,
    migratedFrom: version < DOCUMENT_VERSION ? version : null,
    document: {
      format: DOCUMENT_FORMAT,
      version: extraPages.length > 0 ? MULTI_PAGE_VERSION : DOCUMENT_VERSION,
      title: cleanTitle(current.title),
      createdAt: typeof current.createdAt === 'string' ? current.createdAt : now,
      updatedAt: typeof current.updatedAt === 'string' ? current.updatedAt : now,
      page: {
        template: TEMPLATES.includes(page.template as DocumentPageTemplate) ? (page.template as DocumentPageTemplate) : 'blank',
        background: BACKGROUNDS.includes(page.background as DocumentPageBackground) ? (page.background as DocumentPageBackground) : 'white',
        ...(page.spacing === 'narrow' || page.spacing === 'wide' ? { spacing: page.spacing } : {}),
        ...grownSheetHeight(page.sheetHeight),
      },
      items: finalItems,
      ...(extraPages.length > 0 ? { pages: extraPages } : {}),
    },
  }
}

function cleanItems(candidates: unknown[]): { items: CanvasItem[]; dropped: number } {
  const items: CanvasItem[] = []
  let dropped = 0
  for (const candidate of candidates) {
    const item = sanitizeItem(candidate)
    if (item) items.push(item)
    else dropped += 1
  }
  const uniqueItems = dropDuplicateIds(items)
  dropped += items.length - uniqueItems.length
  return { items: repairAttachments(uniqueItems), dropped }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isId = (value: unknown): value is number => isNum(value) && Number.isInteger(value) && value >= 0
const isColor = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 64

function sanitizePoint(value: unknown): Point | null {
  if (!isRecord(value) || !isNum(value.x) || !isNum(value.y)) return null
  const pressure = isNum(value.pressure) ? Math.min(1, Math.max(0, value.pressure)) : 0
  return { x: value.x, y: value.y, pressure }
}

/** Class box content is optional on a rectangle; if it is malformed the plain rectangle is kept without it. */
function sanitizeClassBox(value: unknown): ClassBoxContent | undefined {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.attributes !== 'string' || typeof value.methods !== 'string') return undefined
  const clean = (text: string) => text.replace(/\u0000/g, '').slice(0, MAX_TEXT_LENGTH)
  return { name: clean(value.name), attributes: clean(value.attributes), methods: clean(value.methods) }
}

const MAX_INK_BOX_STROKES = 20000

/** Ink class box content is optional on a rectangle; if it is malformed the plain rectangle is kept without it. */
function sanitizeInkBox(value: unknown, y: number, height: number): InkBoxContent | undefined {
  if (!isRecord(value) || !isNum(value.top) || !isNum(value.mid) || !Array.isArray(value.ink)) return undefined
  const ink: Stroke[] = []
  for (const raw of value.ink.slice(0, MAX_INK_BOX_STROKES)) {
    const item = sanitizeItem(raw)
    if (item && item.kind === 'stroke') ink.push(item)
  }
  // Keep both dividers inside the box with room for each section, even if the file was edited by hand (same limits as canvasModel's clampInkBoxDividers).
  const band = 24
  const bottom = y + height
  if (height < 72) return { top: y + height / 3, mid: y + (height * 2) / 3, ink }
  const top = Math.min(Math.max(value.top, y + band), bottom - band * 2)
  const mid = Math.min(Math.max(value.mid, top + band), bottom - band)
  return { top, mid, ink }
}

function sanitizeAttachment(value: unknown): ConnectorAttachment | undefined {
  if (!isRecord(value) || !isId(value.rectangleId) || !isNum(value.offsetX) || !isNum(value.offsetY)) return undefined
  return { rectangleId: value.rectangleId, offsetX: value.offsetX, offsetY: value.offsetY }
}

function sanitizeItem(value: unknown): CanvasItem | null {
  if (!isRecord(value) || !isId(value.id)) return null
  if (value.kind === 'stroke') {
    if (!Array.isArray(value.points) || !isColor(value.color) || !isNum(value.width) || value.width <= 0) return null
    const points: Point[] = []
    for (const raw of value.points) {
      const point = sanitizePoint(raw)
      if (!point) return null
      points.push(point)
    }
    if (!points.length) return null
    const stroke: Stroke = { kind: 'stroke', id: value.id, points, color: value.color, width: value.width, erase: value.erase === true }
    if (value.shape === 'arrow' || value.shape === 'line') stroke.shape = value.shape
    return stroke
  }
  if (value.kind === 'rectangle') {
    if (!isNum(value.x) || !isNum(value.y) || !isNum(value.width) || !isNum(value.height) || !isColor(value.strokeColor) || !isNum(value.strokeWidth) || value.strokeWidth <= 0) return null
    const classBox = sanitizeClassBox(value.classBox)
    const inkBox = sanitizeInkBox(value.inkBox, value.y, value.height)
    const rectangle: RectangleObject = { kind: 'rectangle', id: value.id, x: value.x, y: value.y, width: value.width, height: value.height, strokeColor: value.strokeColor, strokeWidth: value.strokeWidth, ...(classBox ? { classBox } : {}), ...(inkBox ? { inkBox } : {}), ...(inkBox && HLD_SHAPE_KINDS.includes(value.hldShape as string) ? { hldShape: value.hldShape as HldShape } : {}), ...(value.ellipse === true && !classBox && !inkBox && value.width > 0 && value.height > 0 ? { ellipse: true as const } : {}) }
    return rectangle
  }
  if (value.kind === 'text') {
    if (!isNum(value.x) || !isNum(value.y) || !isNum(value.width) || !isNum(value.height) || value.width < 0 || value.height < 0) return null
    if (typeof value.text !== 'string' || !isColor(value.color) || !isNum(value.fontSize) || value.fontSize < MIN_FONT_SIZE || value.fontSize > MAX_FONT_SIZE) return null
    const text: TextObject = { kind: 'text', id: value.id, x: value.x, y: value.y, width: value.width, height: value.height, text: value.text.replace(/\u0000/g, '').slice(0, MAX_TEXT_LENGTH), fontSize: value.fontSize, color: value.color }
    return text
  }
  if (value.kind === 'connector') {
    const start = sanitizePoint(value.start)
    const end = sanitizePoint(value.end)
    if (!start || !end || !isColor(value.strokeColor) || !isNum(value.strokeWidth) || value.strokeWidth <= 0) return null
    const relationshipType = RELATIONSHIPS.includes(value.relationshipType as ConnectorRelationshipType) ? (value.relationshipType as ConnectorRelationshipType) : 'association'
    const startAttachment = sanitizeAttachment(value.startAttachment)
    const endAttachment = sanitizeAttachment(value.endAttachment)
    const connector: ConnectorObject = {
      kind: 'connector', id: value.id, start, end, strokeColor: value.strokeColor, strokeWidth: value.strokeWidth,
      relationshipType, reversed: value.reversed === true,
      ...(value.routing === 'elbow' ? { routing: 'elbow' as const } : {}),
      ...(startAttachment ? { startAttachment } : {}),
      ...(endAttachment ? { endAttachment } : {}),
    }
    return connector
  }
  return null
}

function dropDuplicateIds(items: CanvasItem[]): CanvasItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.kind}:${item.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** A connector whose rectangle no longer exists keeps its geometry but loses the dangling attachment. */
function repairAttachments(items: CanvasItem[]): CanvasItem[] {
  const rectangleIds = new Set(items.filter((item) => item.kind === 'rectangle').map((item) => item.id))
  return items.map((item) => {
    if (item.kind !== 'connector') return item
    const startOk = !item.startAttachment || rectangleIds.has(item.startAttachment.rectangleId)
    const endOk = !item.endAttachment || rectangleIds.has(item.endAttachment.rectangleId)
    if (startOk && endOk) return item
    const { startAttachment, endAttachment, ...rest } = item
    return { ...rest, ...(startOk && startAttachment ? { startAttachment } : {}), ...(endOk && endAttachment ? { endAttachment } : {}) }
  })
}

function cloneItem(item: CanvasItem): CanvasItem {
  if (item.kind === 'stroke') return { ...item, points: item.points.map((point) => ({ ...point })) }
  if (item.kind === 'rectangle' && (item.classBox || item.inkBox)) {
    return {
      ...item,
      ...(item.classBox ? { classBox: { ...item.classBox } } : {}),
      ...(item.inkBox ? { inkBox: { ...item.inkBox, ink: item.inkBox.ink.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ ...point })) })) } } : {}),
    }
  }
  if (item.kind === 'connector') {
    return {
      ...item,
      start: { ...item.start },
      end: { ...item.end },
      ...(item.startAttachment ? { startAttachment: { ...item.startAttachment } } : {}),
      ...(item.endAttachment ? { endAttachment: { ...item.endAttachment } } : {}),
    }
  }
  return { ...item }
}
