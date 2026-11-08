import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const starred = await loadModule('starred.ts')
const view = await loadModule('libraryView.ts')
const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
const memory = (initial) => { const data = new Map(initial ? [[starred.STARRED_KEY, initial]] : []); return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k), data } }

test('the saved list is read safely', () => {
  assert.deepEqual(starred.parseStarred(null), [])
  assert.deepEqual(starred.parseStarred(''), [])
  assert.deepEqual(starred.parseStarred('not json'), [])
  assert.deepEqual(starred.parseStarred('{"a":1}'), [])
  assert.deepEqual(starred.parseStarred('["a","b","a",3,null,""]'), ['a', 'b'])
  assert.equal(starred.parseStarred(JSON.stringify(Array.from({ length: 800 }, (_, i) => `d${i}`))).length, 500)
})

test('tapping the star adds or removes the id without changing the old list', () => {
  const before = ['a', 'b']
  assert.deepEqual(starred.toggleStarred(before, 'c'), ['a', 'b', 'c'])
  assert.deepEqual(starred.toggleStarred(before, 'a'), ['b'])
  assert.deepEqual(before, ['a', 'b'])
  const full = Array.from({ length: 500 }, (_, i) => `d${i}`)
  const next = starred.toggleStarred(full, 'new')
  assert.equal(next.length, 500)
  assert.equal(next.at(-1), 'new')
})

test('the star follows a diagram whose id changed on save', () => {
  assert.deepEqual(starred.moveStarred(['a', 'b'], 'a', 'z'), ['z', 'b'])
  assert.deepEqual(starred.moveStarred(['a', 'b'], 'x', 'z'), ['a', 'b'])
  assert.deepEqual(starred.moveStarred(['a', 'b'], 'a', 'a'), ['a', 'b'])
  assert.deepEqual(starred.moveStarred(['a', 'z'], 'a', 'z'), ['z'])
})

test('writing and reading go through storage; an empty list removes the key; a broken storage never throws', () => {
  const storage = memory()
  starred.writeStarred(['a', 'b'], storage)
  assert.equal(storage.data.get(starred.STARRED_KEY), '["a","b"]')
  assert.deepEqual(starred.readStarred(storage), ['a', 'b'])
  starred.writeStarred([], storage)
  assert.equal(storage.data.has(starred.STARRED_KEY), false)
  const broken = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') }, removeItem() { throw new Error('blocked') } }
  assert.deepEqual(starred.readStarred(broken), [])
  assert.doesNotThrow(() => starred.writeStarred(['a'], broken))
})

test('the Starred view lists only starred diagrams, still searchable and newest first', () => {
  const doc = (id, title, updatedAt) => ({ id, title, updatedAt, itemCount: 1, folderId: null })
  const library = [doc('a', 'Zepto', '2026-11-08T10:00:00Z'), doc('b', 'Tinder', '2026-11-08T12:00:00Z'), doc('c', 'Tinder notes', '2026-11-01T12:00:00Z')]
  const ids = (query, onlyIds) => view.searchLibrary(library, [], { query, folderId: null, onlyIds }).map((x) => x.id)
  assert.deepEqual(ids('', new Set(['a', 'c'])), ['a', 'c'])
  assert.deepEqual(ids('tinder', new Set(['a', 'c'])), ['c'])
  assert.deepEqual(ids('', new Set()), [])
  assert.deepEqual(ids('', undefined), ['b', 'a', 'c'])
})

test('stars never go into the diagram file; the Library shows the stars from the hook and asks the hook to change them', async () => {
  const home = await read('app/HomeScreen.tsx')
  assert.match(home, /aria-pressed=\{isStarred\}/)
  assert.match(home, /onClick=\{\(\) => props\.onToggleStar\(entry\.id\)\}/)
  assert.match(home, /const starredSet = props\.starredIds/)
  assert.doesNotMatch(home, /writeStarred|readStarred/)
  const format = await read('documentFormat.ts')
  assert.doesNotMatch(format, /starred/i)
  const hook = await read('app/useDocuments.ts')
  assert.match(hook, /changeLocalStars\(\(ids\) => moveStarred\(ids, previousId, newId\)\)/)
  assert.match(hook, /if \(!backend\.setStarred\) \{\s+changeLocalStars\(\(ids\) => toggleStarred\(ids, id\)\)/)
  assert.match(hook, /void uploadLocalStars\(backend, listed\.documents\)/)
  const app = await read('App.tsx')
  assert.match(app, /starsSync=\{storage\.kind === 'drive'\}/)
})

test('local stars move to Drive once: listed and not starred there are uploaded, already starred are dropped, unknown stay', () => {
  const docs = [{ id: 'a' }, { id: 'b', starred: true }, { id: 'c', starred: false }]
  assert.deepEqual(starred.starsToUpload(['a', 'b', 'c', 'elsewhere'], docs), { upload: ['a', 'c'], drop: ['b'] })
  assert.deepEqual(starred.starsToUpload([], docs), { upload: [], drop: [] })
  assert.deepEqual(starred.starsToUpload(['x'], []), { upload: [], drop: [] })
})
