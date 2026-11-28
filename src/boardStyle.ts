/**
 * Board styles (round 11): Clean, Sketch and Chalkboard, each with the board theme it draws on.
 *
 * Saved as two existing / new page fields: `sketchy` (hand-drawn rendering, unchanged) and `board`
 * ('dark' | 'chalk'; missing = light). The style the user picks is derived from both:
 *   Clean light = no sketchy, no board; Clean dark = board 'dark';
 *   Sketch light = sketchy; Sketch dark = sketchy + board 'dark';
 *   Chalkboard = board 'chalk' (sketchy is turned on when it is picked, and can still be switched off).
 * Unknown `board` values from a newer InkPad are kept in the file and drawn as the light board.
 *
 * Colour rule (InkPad's own choice, reversible): colours the user picked stay exactly as stored. Only the default ink
 * and the default white fill follow the board, resolved at draw time, so nothing in the file changes with the style.
 */

export type BoardTheme = 'light' | 'dark' | 'chalk'
export type BoardStyleId = 'clean' | 'sketch' | 'chalk'

export const BOARD_STYLES: ReadonlyArray<{ id: BoardStyleId; label: string; description: string }> = [
  { id: 'clean', label: 'Clean', description: 'Crisp lines on paper' },
  { id: 'sketch', label: 'Sketch', description: 'Hand-drawn lines and shapes' },
  { id: 'chalk', label: 'Chalkboard', description: 'Chalk on a dark board' },
]

export type BoardPalette = {
  theme: BoardTheme
  /** Sheet colour (replaces the sheet colour tint on dark boards). */
  sheet: string
  /** What the default ink draws as. */
  ink: string
  /** What the default white fill draws as. */
  fill: string
  /** Dot grid and isometric dots. */
  dot: string
  /** Ruled lines and grid lines. */
  line: string
  /** Stronger grid line (every fifth line on graph paper, the Cornell margin). */
  lineStrong: string
  /** Desk colour around the sheet. */
  desk: string
}

/** The default ink as stored by every tool (COLORS[0] in app/appConfig.ts). */
export const DEFAULT_INK = '#202124'
/** The default fill of sticky / class boxes and white fills. */
export const DEFAULT_FILL = '#ffffff'

export const BOARD_PALETTES: Record<BoardTheme, BoardPalette> = {
  light: { theme: 'light', sheet: '#ffffff', ink: DEFAULT_INK, fill: DEFAULT_FILL, dot: '#788392', line: '#aebfd8', lineStrong: '#8fa6c8', desk: '#dde0e7' },
  dark: { theme: 'dark', sheet: '#1e2126', ink: '#e6e8eb', fill: '#2a2e35', dot: '#5b636e', line: '#3a414b', lineStrong: '#4d5663', desk: '#121418' },
  chalk: { theme: 'chalk', sheet: '#243b33', ink: '#f2f1e8', fill: '#2d473e', dot: '#5f7a6f', line: '#3f5b50', lineStrong: '#5b786c', desk: '#17241f' },
}

/** The theme a stored `board` value draws as (unknown or missing = light). */
export function boardTheme(board: string | undefined): BoardTheme {
  return board === 'dark' || board === 'chalk' ? board : 'light'
}

export function boardPalette(board: string | undefined): BoardPalette {
  return BOARD_PALETTES[boardTheme(board)]
}

/** The style shown as selected for a diagram's saved fields. */
export function boardStyleOf(board: string | undefined, sketchy: boolean): BoardStyleId {
  if (boardTheme(board) === 'chalk') return 'chalk'
  return sketchy ? 'sketch' : 'clean'
}

/** True when the diagram draws on the dark theme of Clean or Sketch. */
export function isDarkBoard(board: string | undefined): boolean {
  return boardTheme(board) === 'dark'
}

/** The saved fields for a picked style. `dark` applies to Clean and Sketch (Chalkboard is dark by nature). */
export function boardFieldsFor(style: BoardStyleId, dark: boolean): { board: string | undefined; sketchy: boolean } {
  if (style === 'chalk') return { board: 'chalk', sketchy: true }
  return { board: dark ? 'dark' : undefined, sketchy: style === 'sketch' }
}
