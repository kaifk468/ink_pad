/**
 * "Keep boxes inside lanes" (round 12, #297). Pure: given the bounds of a box (or a group of boxes) that was just dropped or
 * created on a Lanes canvas, returns the shift that puts it fully inside the body of the lane holding its centre. Applied once
 * when a move or a new box ends, never during a drag and never to pen strokes.
 *
 * The body is the lane without its header (rows: the header column at the left; columns: the header band at the top), so a box
 * overlapping a header also slides out of it. Each axis is fitted on its own and only when the box is no larger than the body on
 * that axis; a box that does not fit is left where it was dropped. A centre outside every lane means no shift.
 */
import { laneFit, laneRects, LANE_COLUMNS_WIDTH, type LaneSettings, type Rect } from './canvasLanes'

const EPSILON = 1e-6

function fitAxis(start: number, size: number, low: number, high: number): number {
  if (size > high - low + EPSILON) return 0
  if (start < low) return low - start
  if (start + size > high) return high - size - start
  return 0
}

/** The (dx, dy) that moves `bounds` fully into its lane body; zero when keeping is off, nothing fits, or it is already inside. */
export function laneFitDelta(bounds: Rect, lanes: LaneSettings | undefined | null, sheetHeight: number, sheetWidth: number = LANE_COLUMNS_WIDTH): { dx: number; dy: number } {
  const none = { dx: 0, dy: 0 }
  if (!laneFit(lanes)) return none
  const cx = bounds.x + bounds.width / 2
  const cy = bounds.y + bounds.height / 2
  const hit = laneRects(lanes, sheetWidth, sheetHeight).find(({ lane }) => cx >= lane.x && cx < lane.x + lane.width && cy >= lane.y && cy < lane.y + lane.height)
  if (!hit) return none
  const { body } = hit
  return {
    dx: fitAxis(bounds.x, bounds.width, body.x, body.x + body.width),
    dy: fitAxis(bounds.y, bounds.height, body.y, body.y + body.height),
  }
}
