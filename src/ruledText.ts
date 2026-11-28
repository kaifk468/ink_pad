/**
 * Ruled-line text helper (round 12, #299). On the Lined, Notebook and Cornell canvases a NEW text label made with the Text tool is
 * placed so the baseline of its first line sits on the nearest ruled line. Pure: the caller passes the label's top y and gets the
 * snapped top y back (x never changes). Existing labels and editing never go through here.
 *
 * Ruled lines are drawn by getPageTemplateCss at y = k * units - RULE_TOP_OFFSET (the top edge of the 1-unit line near the bottom of
 * each tile). Notebook adds a header line at NOTEBOOK_HEADER_Y; Cornell adds header and summary lines. A label's first baseline lies
 * getTextBaselines(...)[0] below its top (the same metrics the renderer and the editor use).
 */
import { CORNELL_HEADER_Y, CORNELL_SUMMARY_Y, NOTEBOOK_HEADER_Y } from './pageTemplates'
import { getTextBaselines } from './textLayout'

/** Distance of a ruled line's top edge above the end of its tile (see getPageTemplateCss). */
export const RULE_TOP_OFFSET = 1.125

export function isRuledCanvas(canvasType: string): boolean {
  return canvasType === 'lined' || canvasType === 'notebook' || canvasType === 'cornell'
}

/** The top y for a new label so its first baseline lands on the ruled line nearest to where it would have been; unchanged on other canvases. */
export function ruledBaselineY(y: number, fontSize: number, spacingUnits: number, canvasType: string): number {
  if (!isRuledCanvas(canvasType) || !(spacingUnits > 0) || !Number.isFinite(y) || !(fontSize > 0)) return y
  const offset = getTextBaselines('x', fontSize)[0]
  const baseline = y + offset
  const lines: number[] = []
  const nearest = Math.max(1, Math.round((baseline + RULE_TOP_OFFSET) / spacingUnits))
  for (const k of [nearest - 1, nearest, nearest + 1]) if (k >= 1) lines.push(k * spacingUnits - RULE_TOP_OFFSET)
  if (canvasType === 'notebook') lines.push(NOTEBOOK_HEADER_Y)
  if (canvasType === 'cornell') lines.push(CORNELL_HEADER_Y, CORNELL_SUMMARY_Y)
  let best = Infinity
  for (const line of lines) {
    if (line - offset < 0) continue // the label would start above the sheet
    if (Math.abs(line - baseline) < Math.abs(best - baseline)) best = line
  }
  return best === Infinity ? y : Math.round((best - offset) * 1000) / 1000
}
