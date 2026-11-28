/**
 * Swimlane geometry (round 12). Pure: no DOM, no canvas. The sheet layer (CSS), the lane names, the minimap and the SVG
 * export all read lane positions from here, and the later "keep boxes inside lanes" snapping uses `laneRects`.
 *
 * Saved per diagram as the additive page field `lanes` (with `canvas: 'lanes'`). Unknown or invalid values draw as the
 * defaults (rows, 4 lanes, no names) and are never rewritten by this module.
 *
 * Rows: each lane is LANE_ROWS_BASE_HEIGHT / count tall, with a LANE_ROWS_HEADER_WIDTH header column at the left. The
 * sheet grows from 1500 to 3000 in steps of 500; lanes beyond the first 1500 units continue the same sequence
 * (sheetHeight / laneHeight lanes in all), and their header names REPEAT cyclically (lane k shows name k mod count), so a
 * grown page keeps labelled lanes. Columns: LANE_COLUMNS_WIDTH / count wide, full sheet height, with a
 * LANE_COLUMNS_HEADER_HEIGHT header band at the top.
 */

export type LaneSettings = { dir?: string; count?: number; names?: string[]; fit?: false }
export type LaneDir = 'rows' | 'columns'
export type Rect = { x: number; y: number; width: number; height: number }

export const LANE_DEFAULT_COUNT = 4
export const LANE_MIN_COUNT = 2
export const LANE_MAX_COUNT = 8
export const LANE_NAME_MAX_LENGTH = 40
/** The first sheet height; rows lanes split this into `count` bands and repeat below it. */
export const LANE_ROWS_BASE_HEIGHT = 1500
/** The sheet width (SHEET_WIDTH in viewport.ts); columns lanes split it. */
export const LANE_COLUMNS_WIDTH = 2500
export const LANE_ROWS_HEADER_WIDTH = 180
export const LANE_COLUMNS_HEADER_HEIGHT = 120
/** Thickness of lane borders and of the line under / beside a header, in sheet units. */
export const LANE_BORDER_WIDTH = 1.5

export type LaneRect = {
  /** Position in the sheet, 0-based, in drawing order (rows: top to bottom; columns: left to right). */
  slot: number
  /** Which lane name applies: slot mod count. */
  index: number
  /** The whole lane band (header included). */
  lane: Rect
  /** The header (rows: the left column of the lane; columns: the top band). */
  header: Rect
  /** The writable area: the lane without its header. */
  body: Rect
  /** The lane's name ('' when none was typed). */
  name: string
}

/** Rows unless the saved direction is 'columns' (an unknown word from a newer InkPad draws as rows). */
export function laneDir(settings: LaneSettings | undefined | null): LaneDir {
  return settings?.dir === 'columns' ? 'columns' : 'rows'
}

/** The lane count: an integer 2..8, default 4 for a missing or invalid value. */
export function laneCount(settings: LaneSettings | undefined | null): number {
  const value = settings?.count
  if (typeof value !== 'number' || !Number.isFinite(value)) return LANE_DEFAULT_COUNT
  return Math.min(LANE_MAX_COUNT, Math.max(LANE_MIN_COUNT, Math.round(value)))
}

/** One name per lane (`laneCount` entries, '' where none was typed); non-text entries count as no name. */
export function laneNames(settings: LaneSettings | undefined | null): string[] {
  const raw: unknown = settings?.names
  const list: unknown[] = Array.isArray(raw) ? raw : []
  return Array.from({ length: laneCount(settings) }, (_, index) => {
    const name = list[index]
    return typeof name === 'string' ? name.trim().slice(0, LANE_NAME_MAX_LENGTH) : ''
  })
}

/** "Keep boxes inside lanes" is on unless the file says `fit: false`. */
export function laneFit(settings: LaneSettings | undefined | null): boolean {
  return settings?.fit !== false
}

/** Height of one lane in rows mode, and width of one lane in columns mode. */
export function laneSize(settings: LaneSettings | undefined | null): number {
  return (laneDir(settings) === 'columns' ? LANE_COLUMNS_WIDTH : LANE_ROWS_BASE_HEIGHT) / laneCount(settings)
}

/** Every lane of a sheet with its header and body rectangles, in sheet units. */
export function laneRects(settings: LaneSettings | undefined | null, sheetWidth: number, sheetHeight: number): LaneRect[] {
  const count = laneCount(settings)
  const names = laneNames(settings)
  const out: LaneRect[] = []
  if (laneDir(settings) === 'columns') {
    const width = sheetWidth / count
    for (let slot = 0; slot < count; slot += 1) {
      const x = slot * width
      const lane = { x, y: 0, width, height: sheetHeight }
      const header = { x, y: 0, width, height: Math.min(LANE_COLUMNS_HEADER_HEIGHT, sheetHeight) }
      const body = { x, y: header.height, width, height: Math.max(0, sheetHeight - header.height) }
      out.push({ slot, index: slot, lane, header, body, name: names[slot] })
    }
    return out
  }
  const height = LANE_ROWS_BASE_HEIGHT / count
  // 1500 / count tall lanes continue down the sheet; when the sheet height is not a whole number of lanes (2000, 2500) the last lane is cut at the sheet's bottom edge.
  const total = Math.max(1, Math.ceil(sheetHeight / height - 1e-9))
  const headerWidth = Math.min(LANE_ROWS_HEADER_WIDTH, sheetWidth)
  for (let slot = 0; slot < total; slot += 1) {
    const y = slot * height
    const laneHeight = Math.min(height, sheetHeight - y)
    const index = slot % count
    out.push({
      slot,
      index,
      lane: { x: 0, y, width: sheetWidth, height: laneHeight },
      header: { x: 0, y, width: headerWidth, height: laneHeight },
      body: { x: headerWidth, y, width: Math.max(0, sheetWidth - headerWidth), height: laneHeight },
      name: names[index],
    })
  }
  return out
}

/** The lane whose band holds the point (x, y), or null outside the sheet. */
export function laneAt(settings: LaneSettings | undefined | null, sheetWidth: number, sheetHeight: number, x: number, y: number): LaneRect | null {
  for (const rect of laneRects(settings, sheetWidth, sheetHeight)) {
    const { lane } = rect
    if (x >= lane.x && x < lane.x + lane.width && y >= lane.y && y < lane.y + lane.height) return rect
  }
  return null
}

/** True when two lane settings draw the same lanes (used to skip re-rendering the names). */
export function sameLanes(a: LaneSettings | undefined | null, b: LaneSettings | undefined | null): boolean {
  if (laneDir(a) !== laneDir(b) || laneCount(a) !== laneCount(b) || laneFit(a) !== laneFit(b)) return false
  const an = laneNames(a)
  const bn = laneNames(b)
  return an.every((name, index) => name === bn[index])
}

/** Lane name placement in a header: centred, rotated -90 degrees in a rows header, upright in a columns header. */
export type LaneLabel = { text: string; fontSize: number; x: number; y: number; rotate: 0 | -90 }
const LABEL_FONT = 34
const LABEL_MIN_FONT = 20
const LABEL_PADDING = 24
const LABEL_CHAR_WIDTH = 0.55

/**
 * Where and how big a lane's name is drawn (sheet units), shared by the on-screen header text and the SVG export so they
 * agree. The text shrinks from 34 to 20 to fit the lane's length (its height in rows mode, its width in columns mode),
 * then is cut with an ellipsis. Null for a lane without a name.
 */
export function laneLabel(rect: LaneRect, dir: LaneDir): LaneLabel | null {
  if (!rect.name) return null
  const rows = dir === 'rows'
  const available = Math.max(LABEL_MIN_FONT, (rows ? rect.header.height : rect.header.width) - LABEL_PADDING)
  let fontSize = LABEL_FONT
  while (fontSize > LABEL_MIN_FONT && rect.name.length * fontSize * LABEL_CHAR_WIDTH > available) fontSize -= 2
  const fit = Math.max(1, Math.floor(available / (fontSize * LABEL_CHAR_WIDTH)))
  const text = rect.name.length > fit ? `${rect.name.slice(0, Math.max(1, fit - 1)).trimEnd()}…` : rect.name
  return { text, fontSize, x: rect.header.x + rect.header.width / 2, y: rect.header.y + rect.header.height / 2, rotate: rows ? -90 : 0 }
}
