import type { KeyInput } from './desktopInput'

/**
 * The one table behind the Desktop shortcut help dialog. Add a row here and it shows up in the dialog.
 * `input` is the key press that does it through `keyCommand` (a test checks that it maps to a command); leave it out for
 * shortcuts that are not keyboard commands (mouse gestures, Shift while dragging, and so on).
 */
export type ShortcutGroup = 'Tools' | 'Edit' | 'View' | 'Arrange' | 'Pages'
export type ShortcutEntry = { group: ShortcutGroup; label: string; keys: string; input?: Partial<KeyInput> }

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = ['Tools', 'Edit', 'View', 'Arrange', 'Pages']

const ctrl = { ctrlKey: true }
const shift = { shiftKey: true }

export const DESKTOP_SHORTCUTS: readonly ShortcutEntry[] = [
  { group: 'Tools', label: 'Select', keys: 'V or 1', input: { key: 'v' } },
  { group: 'Tools', label: 'Pen', keys: 'P or 7', input: { key: 'p' } },
  { group: 'Tools', label: 'Eraser', keys: 'E or 0', input: { key: 'e' } },
  { group: 'Tools', label: 'Lasso', keys: 'L', input: { key: 'l' } },
  { group: 'Tools', label: 'Text', keys: 'T or 8', input: { key: 't' } },
  { group: 'Tools', label: 'Code block', keys: 'K', input: { key: 'k' } },
  { group: 'Tools', label: 'Connector', keys: 'C or 9', input: { key: 'c' } },
  { group: 'Tools', label: 'Class box', keys: 'B', input: { key: 'b' } },
  { group: 'Tools', label: 'Rectangle', keys: 'R or 2', input: { key: 'r' } },
  { group: 'Tools', label: 'Diamond', keys: 'D or 3', input: { key: 'd' } },
  { group: 'Tools', label: 'Ellipse', keys: 'O or 4', input: { key: 'o' } },
  { group: 'Tools', label: 'Arrow', keys: 'A or 5', input: { key: 'a' } },
  { group: 'Tools', label: 'Line', keys: 'I or 6', input: { key: 'i' } },
  { group: 'Edit', label: 'Undo', keys: 'Ctrl+Z', input: { key: 'z', ...ctrl } },
  { group: 'Edit', label: 'Redo', keys: 'Ctrl+Y or Ctrl+Shift+Z', input: { key: 'y', ...ctrl } },
  { group: 'Edit', label: 'Copy', keys: 'Ctrl+C', input: { key: 'c', ...ctrl } },
  { group: 'Edit', label: 'Cut', keys: 'Ctrl+X', input: { key: 'x', ...ctrl } },
  { group: 'Edit', label: 'Paste', keys: 'Ctrl+V', input: { key: 'v', ...ctrl } },
  { group: 'Edit', label: 'Duplicate', keys: 'Ctrl+D', input: { key: 'd', ...ctrl } },
  { group: 'Edit', label: 'Duplicate while dragging', keys: 'Ctrl + drag' },
  { group: 'Edit', label: 'Copy as PNG (selection, or the whole page)', keys: 'Shift+Alt+C', input: { key: 'C', code: 'KeyC', altKey: true, ...shift } },
  { group: 'Edit', label: 'Copy style of the selected item', keys: 'Ctrl+Alt+C', input: { key: 'c', code: 'KeyC', altKey: true, ...ctrl } },
  { group: 'Edit', label: 'Paste style onto the selection', keys: 'Ctrl+Alt+V', input: { key: 'v', code: 'KeyV', altKey: true, ...ctrl } },
  { group: 'Edit', label: 'Lock the selection (right-click a locked item to unlock)', keys: 'Ctrl+Shift+L', input: { key: 'L', code: 'KeyL', ...ctrl, ...shift } },
  { group: 'Edit', label: 'Select all', keys: 'Ctrl+A', input: { key: 'a', ...ctrl } },
  { group: 'Edit', label: 'Edit the selected text, label or connector label', keys: 'Enter', input: { key: 'Enter' } },
  { group: 'Edit', label: 'Delete the selection', keys: 'Delete or Backspace', input: { key: 'Delete' } },
  { group: 'Edit', label: 'Deselect, or cancel a drag', keys: 'Esc', input: { key: 'Escape' } },
  { group: 'View', label: 'Zoom in', keys: 'Ctrl++', input: { key: '=', ...ctrl } },
  { group: 'View', label: 'Zoom out', keys: 'Ctrl+-', input: { key: '-', ...ctrl } },
  { group: 'View', label: 'Zoom to 100%', keys: 'Ctrl+0', input: { key: '0', ...ctrl } },
  { group: 'View', label: 'Zoom to fit the drawing', keys: 'Shift+1', input: { key: '!', code: 'Digit1', ...shift } },
  { group: 'View', label: 'Zoom to the selection', keys: 'Shift+2', input: { key: '@', code: 'Digit2', ...shift } },
  { group: 'View', label: 'Pan', keys: 'Space + drag, or middle mouse drag' },
  { group: 'View', label: 'Zoom around the pointer', keys: 'Ctrl + wheel' },
  { group: 'View', label: 'Open the library', keys: 'Ctrl+O', input: { key: 'o', ...ctrl } },
  { group: 'View', label: 'Show this list', keys: '?', input: { key: '?', ...shift } },
  { group: 'Arrange', label: 'Nudge the selection', keys: 'Arrow keys', input: { key: 'ArrowRight' } },
  { group: 'Arrange', label: 'Nudge by 10', keys: 'Shift+Arrow keys', input: { key: 'ArrowRight', ...shift } },
  { group: 'Arrange', label: 'New connected shape next to the selected shape', keys: 'Ctrl+Arrow keys', input: { key: 'ArrowRight', ...ctrl } },
  { group: 'Arrange', label: 'Bring forward', keys: 'Ctrl+]', input: { key: ']', code: 'BracketRight', ...ctrl } },
  { group: 'Arrange', label: 'Send backward', keys: 'Ctrl+[', input: { key: '[', code: 'BracketLeft', ...ctrl } },
  { group: 'Arrange', label: 'Bring to front', keys: 'Ctrl+Shift+]', input: { key: '}', code: 'BracketRight', ...ctrl, ...shift } },
  { group: 'Arrange', label: 'Send to back', keys: 'Ctrl+Shift+[', input: { key: '{', code: 'BracketLeft', ...ctrl, ...shift } },
  { group: 'Arrange', label: 'Type inside a shape', keys: 'Double-click the shape (Select tool)' },
  { group: 'Arrange', label: 'Arrow that sticks to shapes', keys: 'Arrow tool (A): start or end on a shape' },
  { group: 'Arrange', label: 'Square or circle while drawing a shape', keys: 'Hold Shift' },
  { group: 'Pages', label: 'Previous page', keys: 'Page Up', input: { key: 'PageUp' } },
  { group: 'Pages', label: 'Next page', keys: 'Page Down', input: { key: 'PageDown' } },
]

export function shortcutsInGroup(group: ShortcutGroup): ShortcutEntry[] {
  return DESKTOP_SHORTCUTS.filter((entry) => entry.group === group)
}

/** A full key event for a table entry, with every flag filled in, ready for `keyCommand`. */
export function shortcutKeyInput(entry: ShortcutEntry): KeyInput | null {
  if (!entry.input || entry.input.key === undefined) return null
  return { key: entry.input.key, code: entry.input.code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...entry.input }
}
