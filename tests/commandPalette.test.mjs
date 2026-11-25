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
  assert.match(app, /overlayOpen = \(\): boolean => paletteOpenRef\.current \|\| shortcutHelpOpen/)
  assert.match(app, /case 'palette': openPalette\(\); return true/)
  assert.match(app, /closePalette = \(\) => \{ paletteOpenRef\.current = false/)
  assert.match(app, /shortcutKeyInput\(row\)/)
  assert.match(app, /paletteOpen && inputMode === 'desktop' && <CommandPalette/)
  assert.match(app, /const paletteExtras = /)
})

test('Select similar is in the palette only with exactly one item selected and runs the right-click code', () => {
  assert.match(app, /\.\.\.\(soleSelectedKey\(\) !== null \? \[\{ id: 'select:similar', label: 'Select similar'[^\n]*selectSimilarItems\(\)/)
  assert.match(app, /case 'selectSimilar': selectSimilarItems\(\); break/)
  assert.match(app, /const soleSelectedKey = \(\): string \| null => \{\s+const keys = currentSelectionKeys\(\)\s+return keys\.size === 1/)
})

test('diagram rows: most recent first, current excluded, folder path as hint and search word', () => {
  const library = [
    { id: 'a', title: 'Old', updatedAt: '2026-01-01T00:00:00Z', folderId: null },
    { id: 'b', title: 'Newest', updatedAt: '2026-03-01T00:00:00Z', folderId: 'f2' },
    { id: 'c', title: 'Open one', updatedAt: '2026-04-01T00:00:00Z', folderId: null },
    { id: 'd', title: 'Middle', updatedAt: '2026-02-01T00:00:00Z', folderId: 'f1' },
  ]
  const folders = [{ id: 'f1', name: 'Interviews', parentId: null }, { id: 'f2', name: 'Cache', parentId: 'f1' }]
  const rows = palette.diagramPaletteEntries(library, folders, 'c')
  assert.deepEqual(rows.map((r) => r.label), ['Open: Newest', 'Open: Middle', 'Open: Old'])
  assert.ok(rows.every((r) => r.group === 'Diagrams'))
  assert.equal(rows[0].hint, 'Interviews / Cache')
  assert.match(rows[0].keywords, /Interviews \/ Cache/)
  assert.equal(rows[2].hint, undefined)
  assert.equal(palette.diagramIdFromEntry(rows[0].id), 'b')
  assert.equal(palette.diagramIdFromEntry('export:png'), null)
  assert.deepEqual(palette.diagramPaletteEntries([], [], null), [])
  assert.equal(palette.diagramPaletteEntries(library, [{ id: 'f1', name: 'A', parentId: 'f1' }], null).length, 4) // a folder loop does not hang
})

test('diagram rows are findable by folder name and rank after commands of equal score', () => {
  const folders = [{ id: 'f1', name: 'Interviews', parentId: null }]
  const diagrams = palette.diagramPaletteEntries([{ id: 'x', title: 'Cache design', updatedAt: '2026-01-01', folderId: 'f1' }], folders, null)
  const all = [{ id: 'c1', label: 'Open library', group: 'File' }, { id: 'c2', label: 'Cache', group: 'Shapes' }, ...diagrams]
  assert.deepEqual(palette.filterCommands(all, 'interviews').map((e) => e.id), ['diagram:x'])
  assert.deepEqual(palette.filterCommands(all, 'open').map((e) => e.id), ['c1', 'diagram:x'])
  assert.deepEqual(palette.filterCommands(all, 'cache').map((e) => e.id), ['c2', 'diagram:x'])
})

test('wiring: diagram rows are built last, open through openStoredDiagram, and the list is refreshed when the palette opens', () => {
  assert.match(app, /\.\.\.diagramPaletteEntries\(library, folders, currentDocId\)\.map/)
  assert.match(app, /void openStoredDiagram\(id\)/)
  assert.match(app, /if \(paletteOpen\) void refreshLibrary\(\)/)
  assert.match(app, /onOpenDiagram=\{\(id\) => \{ setLibraryOpen\(false\); void openStoredDiagram\(id\) \}\}/)
})
