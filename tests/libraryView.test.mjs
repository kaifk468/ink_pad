import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const view = await loadModule('libraryView.ts')
const f = (id, parentId = null, name = id) => ({ id, name, parentId, createdAt: '2026-01-01T00:00:00Z' })
const folders = [f('sys', null, 'System Design'), f('lld', 'sys', 'LLD'), f('hld', 'sys', 'HLD'), f('algo', null, 'Algorithms')]
const doc = (id, title, folderId, updatedAt) => ({ id, title, updatedAt, itemCount: 1, folderId })
const library = [
  doc('a', 'Zepto order split', 'lld', '2026-11-08T10:00:00Z'),
  doc('b', 'Tinder matching', 'lld', '2026-11-08T12:00:00Z'),
  doc('c', 'eSignet flow', 'hld', '2026-11-07T10:00:00Z'),
  doc('d', 'DP notes', 'algo', '2026-11-03T10:00:00Z'),
  doc('e', '', null, 'not a date'),
  doc('g', 'Lost one', 'deleted-folder', '2026-11-01T10:00:00Z'),
]

test('every diagram is listed, newest edit first, unknown dates last', () => {
  const ids = view.searchLibrary(library, folders, { query: '', folderId: null }).map((x) => x.id)
  assert.deepEqual(ids, ['b', 'a', 'c', 'd', 'g', 'e'])
  assert.equal(library[0].id, 'a')
})

test('choosing a folder includes its subfolders', () => {
  const ids = (folderId) => view.searchLibrary(library, folders, { query: '', folderId }).map((x) => x.id)
  assert.deepEqual(ids('sys'), ['b', 'a', 'c'])
  assert.deepEqual(ids('lld'), ['b', 'a'])
  assert.deepEqual(ids('algo'), ['d'])
})

test('search matches title words and folder names, any case, all words needed', () => {
  const ids = (query, folderId = null) => view.searchLibrary(library, folders, { query, folderId }).map((x) => x.id)
  assert.deepEqual(ids('ZEPTO'), ['a'])
  assert.deepEqual(ids('lld'), ['b', 'a'])
  assert.deepEqual(ids('system hld'), ['c'])
  assert.deepEqual(ids('  '), ['b', 'a', 'c', 'd', 'g', 'e'])
  assert.deepEqual(ids('untitled'), ['e'])
  assert.deepEqual(ids('tinder', 'hld'), [])
  assert.deepEqual(ids('nothing here'), [])
})

test('folder counts include subfolders; labels show the path', () => {
  assert.equal(view.countInFolder(library, folders, 'sys'), 3)
  assert.equal(view.countInFolder(library, folders, 'hld'), 1)
  assert.equal(view.countInFolder(library, folders, 'nope'), 0)
  assert.equal(view.folderLabel(folders, 'lld'), 'System Design / LLD')
  assert.equal(view.folderLabel(folders, null), '')
})

test('edited time reads in plain words', () => {
  const now = Date.parse('2026-11-08T12:00:00Z')
  const say = (iso) => view.describeEdited(iso, now)
  assert.equal(say('2026-11-08T11:59:30Z'), 'Just now')
  assert.equal(say('2026-11-08T11:59:00Z'), '1 min ago')
  assert.equal(say('2026-11-08T11:48:00Z'), '12 mins ago')
  assert.equal(say('2026-11-08T10:00:00Z'), '2 hours ago')
  assert.equal(say('2026-11-07T10:00:00Z'), 'Yesterday')
  assert.equal(say('2026-11-05T10:00:00Z'), '3 days ago')
  assert.equal(say('2026-10-01T10:00:00Z'), new Date('2026-10-01T10:00:00Z').toLocaleDateString())
  assert.equal(say(''), '')
  assert.equal(say('garbage'), '')
})
