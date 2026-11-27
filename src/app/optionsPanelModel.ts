/** Desktop options panel: section order, the collapsed-state preference and the header name. Pure logic, no React. */

/** Top-to-bottom order of the desktop panel for every context. Colour is always first, the secondary actions ("more") always last. */
export const DESKTOP_SECTION_ORDER = ['colour', 'text', 'width', 'style', 'layer', 'arrange', 'actions', 'more'] as const
export type DesktopSectionId = (typeof DESKTOP_SECTION_ORDER)[number]

/** Per-viewer UI preference (never saved in the document). */
export const OPTIONS_COLLAPSED_KEY = 'inkpad.desktop.optionsCollapsed'

type PrefStorage = Pick<Storage, 'getItem' | 'setItem'> | null | undefined

export function readOptionsCollapsed(storage: PrefStorage): boolean {
  try {
    return storage?.getItem(OPTIONS_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function writeOptionsCollapsed(storage: PrefStorage, collapsed: boolean): void {
  try {
    storage?.setItem(OPTIONS_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // Private window or blocked storage: the choice just lasts until reload.
  }
}

/** The browser's localStorage, or null when it is missing or its accessor throws. */
export function browserStorage(): PrefStorage {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

const KIND_NAMES: Record<string, string> = { stroke: 'Stroke', rectangle: 'Shape', connector: 'Connector', text: 'Text', code: 'Code block' }
const TOOL_NAMES: Record<string, string> = { rectangle: 'Rectangle', diamond: 'Diamond', ellipse: 'Ellipse', arrow: 'Arrow', line: 'Line' }

/** Short header name: "3 objects", "Rectangle" (shape tool), "Connector" (one selected item), "Pen", "Eraser", "Text". */
export function optionsContextName(input: { count: number; selectedKind?: string | null; tool?: string | null; eraser?: boolean; text?: boolean }): string {
  if (input.count > 1) return `${input.count} objects`
  if (input.count === 1) return (input.selectedKind && KIND_NAMES[input.selectedKind]) || 'Object'
  if (input.eraser) return 'Eraser'
  if (input.text) return 'Text'
  if (input.tool) return TOOL_NAMES[input.tool] ?? 'Shape'
  return 'Pen'
}

/**
 * Which single segment of the desktop "Text size" row is active: 'fit' while auto-fit is on (the size is then
 * computed, so no number is also active), else the preset equal to the label's own size, else null.
 * `size` is the size of the label being edited or selected, falling back to the tool's size when there is none.
 */
export function activeTextSizeSegment(choices: readonly number[], size: number, fitOn: boolean | null | undefined): number | 'fit' | null {
  if (fitOn) return 'fit'
  return choices.find((choice) => choice === Math.round(size)) ?? null
}
