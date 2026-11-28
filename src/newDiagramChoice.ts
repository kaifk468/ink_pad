/**
 * The "+ New diagram" chooser (round 12): which board style, theme and canvas type a new diagram starts with.
 * The last choice is kept on this device (localStorage, like the page template) and preselected next time.
 * Pure helpers only; the menu is in app/HomeScreen.tsx and the document is made in app/useDocuments.ts.
 */
import { BOARD_STYLES, boardFieldsFor, type BoardStyleId } from './boardStyle'
import { CANVAS_TYPES, canvasFieldsFor, type CanvasType } from './canvasTypes'
import type { PageTemplate } from './pageTemplates'

export type NewDiagramChoice = { style: BoardStyleId; dark: boolean; canvas: CanvasType }

/** The fields a new diagram is created with (the additive options of onNewDiagram / newDiagramIn / newDiagram). */
export type NewDiagramOptions = { template: PageTemplate; canvas?: string; board?: string; sketchy?: boolean }

export const DEFAULT_NEW_DIAGRAM_CHOICE: NewDiagramChoice = { style: 'clean', dark: false, canvas: 'dotted' }

const STORAGE_KEY = 'inkpad.newDiagram'

/** Reads a stored value; anything unknown (or a canvas type this build no longer lists) falls back to the default for that part. */
export function parseNewDiagramChoice(value: string | null | undefined): NewDiagramChoice {
  let raw: unknown
  try {
    raw = value ? JSON.parse(value) : null
  } catch {
    raw = null
  }
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const style = BOARD_STYLES.find((entry) => entry.id === data.style)?.id ?? DEFAULT_NEW_DIAGRAM_CHOICE.style
  const canvas = CANVAS_TYPES.find((entry) => entry.id === data.canvas)?.id ?? DEFAULT_NEW_DIAGRAM_CHOICE.canvas
  return { style, dark: style !== 'chalk' && data.dark === true, canvas }
}

export function loadNewDiagramChoice(storage?: Pick<Storage, 'getItem'>): NewDiagramChoice {
  try {
    return parseNewDiagramChoice((storage ?? window.localStorage).getItem(STORAGE_KEY))
  } catch {
    return { ...DEFAULT_NEW_DIAGRAM_CHOICE }
  }
}

export function saveNewDiagramChoice(choice: NewDiagramChoice, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const clean = parseNewDiagramChoice(JSON.stringify(choice))
    ;(storage ?? window.localStorage).setItem(STORAGE_KEY, JSON.stringify(clean))
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts.
  }
}

/** The saved fields for a choice: template + canvas from the canvas type, board + sketchy from the style. */
export function newDiagramOptionsFor(choice: NewDiagramChoice): NewDiagramOptions {
  const canvas = canvasFieldsFor(choice.canvas)
  const board = boardFieldsFor(choice.style, choice.dark)
  return { template: canvas.template, canvas: canvas.canvas, board: board.board, sketchy: board.sketchy }
}

/** Sketch and Chalkboard write new text in the hand-drawn font, as picking them on an open diagram does. */
export function newDiagramUsesHandFont(options: Pick<NewDiagramOptions, 'board' | 'sketchy'> | undefined): boolean {
  return Boolean(options && (options.sketchy === true || options.board === 'chalk'))
}
