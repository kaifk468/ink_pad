import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const palette = await loadModule('commandPalette.ts')
const shortcuts = await loadModule('desktopShortcuts.ts')
const input = await loadModule('desktopInput.ts')
const app = await readAppSource()
const key = (k, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra })

const entries = [
  { id: 'a', label: 'Zoom in', group: 'View', keys: 'Ctrl++' },
  { id: 'b', label: 'Group the selected items', group: 'Arrange' },
  { id: 'c', label: 'Cache', group: 'Shapes', keywords: 'redis memcached' },
  { id: 'd', label: 'Export PNG', group: 'Export' },
  { id: 'e', label: 'Zoom out', group: 'View' },
  { id: 'f', label: 'Fit and zoom', group: 'View' },
]

test('empty query returns every entry in table order', () => {
  assert.deepEqual(palette.filterCommands(entries, '').map((e) => e.id), ['a', 'b', 'c', 'd', 'e', 'f'])
  assert.deepEqual(palette.filterCommands(entries, '   ').map((e) => e.id), ['a', 'b', 'c', 'd', 'e', 'f'])
})

test('matching is case-insensitive over label, keywords and group; every word must match', () => {
  assert.deepEqual(palette.filterCommands(entries, 'REDIS').map((e) => e.id), ['c'])
  assert.deepEqual(palette.filterCommands(entries, 'export').map((e) => e.id), ['d'])
  assert.deepEqual(palette.filterCommands(entries, 'zoom view').map((e) => e.id), ['a', 'e', 'f'])
  assert.deepEqual(palette.filterCommands(entries, 'zoom png'), [])
  assert.deepEqual(palette.filterCommands(entries, 'nothing like it'), [])
})

test('prefix and word-start matches rank before other matches, ties keep table order', () => {
  assert.deepEqual(palette.filterCommands(entries, 'zoom').map((e) => e.id), ['a', 'e', 'f'])
  const mixed = [
    { id: 'x', label: 'Unzoomed view', group: 'View' },
    { id: 'y', label: 'Fit and zoom', group: 'View' },
    { id: 'z', label: 'Zoom in', group: 'View' },
  ]
  assert.deepEqual(palette.filterCommands(mixed, 'zoom').map((e) => e.id), ['z', 'y', 'x'])
})

test('every DESKTOP_SHORTCUTS row with an input appears in the palette list, with its keys', () => {
  const list = palette.shortcutPaletteEntries()
  const rows = shortcuts.DESKTOP_SHORTCUTS.filter((row) => row.input)
  assert.equal(list.length, rows.length)
  for (const row of rows) {
    const entry = list.find((e) => e.id === palette.shortcutEntryId(row))
    assert.ok(entry, row.label)
    assert.equal(entry.label, row.label)
    assert.equal(entry.keys, row.keys)
  }
  assert.equal(new Set(list.map((e) => e.id)).size, list.length, 'ids are unique')
  assert.ok(palette.filterCommands(list, 'command palette').some((e) => e.keys === 'Ctrl+K'))
})

test('Ctrl/Cmd+K is the palette command: no Shift, no Alt, no repeat, desktop only, never left to the browser', () => {
  assert.deepEqual(input.keyCommand(key('k', { ctrlKey: true }), 'desktop'), { kind: 'palette' })
  assert.deepEqual(input.keyCommand(key('K', { metaKey: true }), 'desktop'), { kind: 'palette' })
  assert.equal(input.keyCommand(key('k', { ctrlKey: true, shiftKey: true }), 'desktop'), null)
  assert.equal(input.keyCommand(key('k', { ctrlKey: true, altKey: true }), 'desktop'), null)
  assert.equal(input.keyCommand(key('k', { ctrlKey: true, repeat: true }), 'desktop'), null)
  assert.equal(input.keyCommand(key('k', { ctrlKey: true }), 'tablet'), null)
  assert.deepEqual(input.keyCommand(key('k'), 'desktop'), { kind: 'tool', tool: 'code' })
  assert.ok(input.alwaysPreventsDefault({ kind: 'palette' }, 'desktop'))
  assert.ok(!input.alwaysPreventsDefault({ kind: 'palette' }, 'tablet'))
})

test('App wiring: palette is gated like other commands, closed before the command runs, desktop only', () => {
  assert.match(app, /if \(paletteOpenRef\.current \|\| shortcutHelpOpen/)
  assert.match(app, /case 'palette': openPalette\(\); return true/)
  assert.match(app, /closePalette = \(\) => \{ paletteOpenRef\.current = false/)
  assert.match(app, /shortcutKeyInput\(row\)/)
  assert.match(app, /paletteOpen && inputMode === 'desktop' && <CommandPalette/)
  assert.match(app, /const paletteExtras = /)
})
