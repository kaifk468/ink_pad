import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const search = await loadModule('app/menuSearch.ts')

const entries = [
  { id: 'library', label: 'Library', keywords: 'folder diagrams', actionable: true },
  { id: 'style', label: 'Style', keywords: 'template lined dotted', actionable: false },
  { id: 'snap', label: 'Snap and guides', keywords: 'align magnet', actionable: true },
  { id: 'clear', label: 'Clear canvas', keywords: 'delete erase', actionable: true, disabled: true },
  { id: 'export', label: 'Export and import', keywords: 'download PNG SVG', actionable: true },
]

test('an empty or blank query shows every row', () => {
  assert.equal(search.filterMenuEntries(entries, '').length, entries.length)
  assert.equal(search.filterMenuEntries(entries, '   ').length, entries.length)
})

test('matching is a case-insensitive substring of the label or the keywords', () => {
  assert.deepEqual(search.filterMenuEntries(entries, 'SNAP').map((e) => e.id), ['snap'])
  assert.deepEqual(search.filterMenuEntries(entries, 'png').map((e) => e.id), ['export'])
  assert.deepEqual(search.filterMenuEntries(entries, 'olde').map((e) => e.id), ['library'])
  assert.deepEqual(search.filterMenuEntries(entries, 'zzz'), [])
})

test('every word of the query must match, in any order', () => {
  assert.deepEqual(search.filterMenuEntries(entries, 'import export').map((e) => e.id), ['export'])
  assert.deepEqual(search.filterMenuEntries(entries, 'snap png'), [])
})

test('Enter runs the first visible row that is actionable and enabled', () => {
  assert.equal(search.firstActionableEntry(entries, '').id, 'library')
  assert.equal(search.firstActionableEntry(entries, 'template'), null, 'a settings row is not actionable')
  assert.equal(search.firstActionableEntry(entries, 'clear'), null, 'a disabled row is skipped')
  assert.equal(search.firstActionableEntry(entries, 'and').id, 'snap')
  assert.equal(search.firstActionableEntry(entries, 'zzz'), null)
})

test('Enter never activates a danger row, even when it is the only match', () => {
  const { firstActionableEntry } = search
  const rows = [
    { id: 'palette', label: 'Command palette', keywords: 'commands', actionable: true },
    { id: 'clear', label: 'Clear canvas', keywords: 'delete erase reset', actionable: true, danger: true },
  ]
  assert.equal(firstActionableEntry(rows, 'clear'), null)
  assert.equal(firstActionableEntry(rows, 'erase'), null)
  assert.equal(firstActionableEntry([rows[1], rows[0]], '')?.id, 'palette')
})
