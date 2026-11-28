/**
 * Pure helpers for the Board style and canvas type pickers (menus, command palette, previews).
 * Rendering lives in app/BoardPreviews.tsx; nothing here touches the document or the canvas.
 */
import { boardStyleOf, boardTheme, isDarkBoard, type BoardStyleId } from './boardStyle'
import { CANVAS_TYPES, effectiveCanvasType, type CanvasType } from './canvasTypes'
import type { PageTemplate } from './pageTemplates'

export type BoardPickerState = {
  /** Selected style tile: Sketch only when sketchy is on and the board is not chalk. */
  style: BoardStyleId
  /** True on the dark theme of Clean / Sketch. */
  dark: boolean
  /** Chalkboard is always dark, so the Light / Dark choice is replaced by a note. */
  chalk: boolean
  /** Selected canvas tile. */
  canvas: CanvasType
  /** Line and dot spacing only applies to a ruled canvas. */
  showSpacing: boolean
  /** Sheet colour is set by the board while it is dark or chalk. */
  sheetFromBoard: boolean
}

export function boardPickerState(board: string | undefined, sketchy: boolean, template: PageTemplate, canvas: string | undefined): BoardPickerState {
  const effective = effectiveCanvasType(template, canvas)
  return {
    style: boardStyleOf(board, sketchy),
    dark: isDarkBoard(board),
    chalk: boardTheme(board) === 'chalk',
    canvas: effective,
    showSpacing: effective !== 'blank',
    sheetFromBoard: boardTheme(board) !== 'light',
  }
}

/** Words that find the Board rows in the menu search (and the palette entries). */
export const BOARD_STYLE_KEYWORDS = 'board style theme clean sketch sketchy hand-drawn chalkboard chalk dark light paper'
export const BOARD_THEME_KEYWORDS = 'board theme dark light night mode chalk'
export const BOARD_CANVAS_KEYWORDS = 'board canvas type paper page template blank dots dotted lined ruled grid graph isometric cornell notes'

/** SVG path data for a canvas type drawn in a w x h preview. Dots are zero-length segments (draw with a round cap). */
export function canvasPreviewMarks(type: CanvasType, w = 72, h = 48): { dots: string; lines: string; strong: string } {
  const out = { dots: '', lines: '', strong: '' }
  if (type === 'dotted') {
    for (let y = 6; y <= h - 4; y += 8) for (let x = 6; x <= w - 4; x += 8) out.dots += `M${x} ${y}h0`
  } else if (type === 'isometric') {
    for (let row = 0, y = 6; y <= h - 4; row += 1, y += 7) for (let x = 6 + (row % 2 ? 4 : 0); x <= w - 4; x += 8) out.dots += `M${x} ${y}h0`
  } else if (type === 'lined') {
    for (let y = 10; y <= h - 4; y += 8) out.lines += `M0 ${y}H${w}`
  } else if (type === 'grid') {
    for (let y = 8; y < h; y += 8) out.lines += `M0 ${y}H${w}`
    for (let x = 8; x < w; x += 8) out.lines += `M${x} 0V${h}`
  } else if (type === 'cornell') {
    for (let y = 10; y <= h - 16; y += 8) out.lines += `M0 ${y}H${w}`
    out.strong = `M20 0V${h - 12}M0 ${h - 12}H${w}`
  }
  return out
}

export type BoardCommand =
  | { id: string; label: string; keywords: string; kind: 'style'; style: BoardStyleId; dark: boolean }
  | { id: string; label: string; keywords: string; kind: 'canvas'; canvas: CanvasType }

/** Command palette entries for the board and canvas pickers, given the diagram's current style and theme. */
export function boardCommands(style: BoardStyleId, dark: boolean): BoardCommand[] {
  const commands: BoardCommand[] = [
    { id: 'board:clean', label: 'Board: Clean', keywords: 'board style clean crisp paper', kind: 'style', style: 'clean', dark },
    { id: 'board:sketch', label: 'Board: Sketch', keywords: 'board style sketch sketchy hand-drawn rough', kind: 'style', style: 'sketch', dark },
    { id: 'board:chalk', label: 'Board: Chalkboard', keywords: 'board style chalkboard chalk blackboard dark green', kind: 'style', style: 'chalk', dark: false },
  ]
  // Light / Dark applies to Clean and Sketch; the chalkboard is always dark.
  if (style !== 'chalk') {
    commands.push(dark
      ? { id: 'board:light', label: 'Board: Light theme', keywords: 'board theme light day white', kind: 'style', style, dark: false }
      : { id: 'board:dark', label: 'Board: Dark theme', keywords: 'board theme dark night mode', kind: 'style', style, dark: true })
  }
  for (const type of CANVAS_TYPES) {
    commands.push({ id: `canvas:${type.id}`, label: `Canvas: ${type.label}`, keywords: `canvas page paper ${type.id} ${type.label.toLowerCase()} ${type.description.toLowerCase()}${type.id === 'grid' ? ' graph squares' : ''}`, kind: 'canvas', canvas: type.id })
  }
  return commands
}
