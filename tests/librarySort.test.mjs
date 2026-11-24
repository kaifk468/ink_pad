import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const view = await loadModule('libraryView.ts')
const store = await loadModule('documentStore.ts')
const src = (name) => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('sortLibrary: edited, name (locale, case-insensitive, untitled last) and created with fallback', () => {
  const e = (id, title, updatedAt, createdAt) => ({ id, title, updatedAt, ...(createdAt ? { createdAt } : {}), itemCount: 1, folderId: null })
  const list = [
    e('a', 'banana', '2026-11-03T00:00:00Z', '2026-01-01T00:00:00Z'),
    e('b', 'Apple', '2026-11-01T00:00:00Z', '2026-03-01T00:00:00Z'),
    e('c', '', '2026-11-05T00:00:00Z', '2026-02-01T00:00:00Z'),
    e('d', 'Untitled diagram', '2026-11-04T00:00:00Z'),
    e('f', 'cherry 10', '2026-11-02T00:00:00Z', '2026-04-01T00:00:00Z'),
    e('g', 'cherry 9', '2026-11-06T00:00:00Z'),
  ]
  const ids = (sort) => view.sortLibrary(list, sort).map((x) => x.id)
  assert.deepEqual(ids('edited'), ['g', 'c', 'd', 'a', 'f', 'b'])
  assert.deepEqual(ids('name'), ['b', 'a', 'g', 'f', 'c', 'd'])
  // created falls back to the edit time when unknown: d (11-04) and g (11-06) are newer than the known 2026-01..04 dates
  assert.deepEqual(ids('created'), ['g', 'd', 'f', 'b', 'c', 'a'])
  assert.equal(list[0].id, 'a', 'input is not reordered')
  assert.deepEqual(view.sortLibrary([e('x', 'B', ''), e('y', 'A', '')], 'created').map((x) => x.id), ['x', 'y'])
})

test('browser records carry the created time into the summary', () => {
  const format = { format: 'inkpad', version: 1, title: 'T', createdAt: '2026-02-02T00:00:00.000Z', updatedAt: '2026-03-03T00:00:00.000Z', page: { template: 'blank', background: 'white' }, items: [] }
  const record = store.toStoredRecord('id1', format)
  assert.equal(store.summaryFromRecord(record, null).createdAt, '2026-02-02T00:00:00.000Z')
  assert.equal(store.summaryFromRecord({ id: 'old', json: '{}', title: 'x', updatedAt: '2026-01-01' }, null).createdAt, undefined)
})

test('the remembered sort choice only accepts known values and is wired in the Library', async () => {
  assert.equal(view.parseLibrarySort('name'), 'name')
  assert.equal(view.parseLibrarySort('created'), 'created')
  assert.equal(view.parseLibrarySort('bogus'), 'edited')
  assert.equal(view.parseLibrarySort(null), 'edited')
  const s = await src('app/HomeScreen.tsx')
  assert.match(s, /SORT_KEY = 'inkpad\.librarySort'/)
  assert.match(s, /try \{ window\.localStorage\.setItem\(SORT_KEY, value\) \} catch/)
  assert.match(s, /try \{ return parseLibrarySort\(window\.localStorage\.getItem\(SORT_KEY\)\) \} catch/)
  assert.match(s, /sortLibrary\(searchLibrary\(/)
  assert.match(s, /aria-label="Sort"/)
})
