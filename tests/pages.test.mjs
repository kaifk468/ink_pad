import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const appSource = await readAppSource()
const pages = await loadModule('pages.ts')
const format = await loadModule('documentFormat.ts')

const stroke = (id, y = 10) => ({ kind: 'stroke', id, points: [{ x: 1, y, pressure: 0.5 }, { x: 5, y: y + 5, pressure: 0.5 }], color: '#111', width: 3, erase: false })
const base = { template: 'dotted', background: 'white' }

test('a diagram can hold up to 50 pages and never fewer than one', () => {
  assert.equal(pages.MAX_PAGES, 50)
  assert.equal(pages.canAddPage(49), true)
  assert.equal(pages.canAddPage(50), false)
  assert.deepEqual(pages.removePageAt(['a'], 0), { pages: ['a'], index: 0 })
})

test('a new page goes right after the current one; at the limit nothing is added', () => {
  assert.deepEqual(pages.insertPageAfter(['a', 'b', 'c'], 0, 'x'), ['a', 'x', 'b', 'c'])
  assert.deepEqual(pages.insertPageAfter(['a', 'b'], 1, 'x'), ['a', 'b', 'x'])
  const full = Array.from({ length: 50 }, (_, i) => i)
  assert.equal(pages.insertPageAfter(full, 3, 'x').length, 50)
})

test('deleting a page shows the page that took its place, or the new last page', () => {
  assert.deepEqual(pages.removePageAt(['a', 'b', 'c'], 1), { pages: ['a', 'c'], index: 1 })
  assert.deepEqual(pages.removePageAt(['a', 'b', 'c'], 2), { pages: ['a', 'b'], index: 1 })
  assert.deepEqual(pages.removePageAt(['a', 'b', 'c'], 0), { pages: ['b', 'c'], index: 0 })
})

test('page numbers are clamped and labelled from 1', () => {
  assert.equal(pages.clampPageIndex(-3, 4), 0)
  assert.equal(pages.clampPageIndex(9, 4), 3)
  assert.equal(pages.clampPageIndex(NaN, 4), 0)
  assert.equal(pages.pageLabel(1, 5), '2 / 5')
})

test('a one-page diagram is saved exactly as before: format v1, no pages field', () => {
  const doc = format.createDocument({ ...base, items: [stroke(1)] })
  assert.equal(doc.version, 1)
  assert.equal('pages' in doc, false)
  assert.equal(format.createDocument({ ...base, items: [], extraPages: [] }).version, 1)
})

test('a diagram with more pages is written as v2 with page 1 in items, so an older InkPad refuses it instead of dropping pages', () => {
  assert.ok(format.MULTI_PAGE_VERSION > format.DOCUMENT_VERSION)
  const doc = format.createDocument({ ...base, items: [stroke(1)], extraPages: [[stroke(1, 50)], []] })
  assert.equal(doc.version, 2)
  assert.equal(doc.items.length, 1)
  assert.equal(doc.pages.length, 2)
  assert.equal(doc.pages[0].items[0].points[0].y, 50)
  assert.deepEqual(doc.pages[1].items, [])
})

test('every page survives text, parse and a second text with the same bytes', () => {
  const doc = format.createDocument({ ...base, items: [stroke(1)], extraPages: [[stroke(1, 50), stroke(2, 80)], [], [stroke(1, 99)]] })
  const text = format.stringifyDocument(doc)
  assert.equal(text, JSON.stringify(doc), 'the fast writer matches plain JSON')
  const parsed = format.parseDocument(text)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.droppedItems, 0)
  assert.equal(parsed.document.pages.length, 3)
  assert.equal(parsed.document.pages[0].items.length, 2)
  assert.deepEqual(parsed.document.pages[1].items, [])
  assert.equal(format.stringifyDocument(parsed.document), text)
})

test('old one-page files open with no pages, and a v3 file is refused', () => {
  const old = JSON.stringify({ format: 'inkpad-document', version: 1, title: 'old', page: { template: 'blank', background: 'white' }, items: [stroke(1)] })
  const parsed = format.parseDocument(old)
  assert.equal(parsed.ok, true)
  assert.equal('pages' in parsed.document, false)
  const future = JSON.stringify({ format: 'inkpad-document', version: 3, title: 'x', page: {}, items: [] })
  assert.equal(format.parseDocument(future).ok, false)
})

test('an unreadable page becomes an empty page so later pages keep their place; ids only need to be unique inside a page', () => {
  const text = JSON.stringify({ format: 'inkpad-document', version: 2, title: 't', page: { template: 'blank', background: 'white' }, items: [stroke(1)], pages: [{ items: 'nope' }, 7, { items: [stroke(1), stroke(1)] }] })
  const parsed = format.parseDocument(text)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.document.pages.length, 3)
  assert.deepEqual(parsed.document.pages[0].items, [])
  assert.deepEqual(parsed.document.pages[1].items, [])
  assert.equal(parsed.document.pages[2].items.length, 1)
  assert.equal(parsed.droppedItems, 1, 'the duplicate id inside page 4')
  assert.equal(parsed.document.items.length, 1, 'page 1 has the same id as pages 2 to 4 and keeps it')
})

test('pages beyond the limit are dropped and counted', () => {
  const many = Array.from({ length: 60 }, () => ({ items: [] }))
  const parsed = format.parseDocument(JSON.stringify({ format: 'inkpad-document', version: 2, title: 't', page: {}, items: [], pages: many }))
  assert.equal(parsed.document.pages.length, 49)
  assert.equal(parsed.droppedItems, 11)
  assert.equal(format.createDocument({ ...base, items: [], extraPages: many.map((p) => p.items) }).pages.length, 49)
})

test('the limit written in the format matches the rules module', () => {
  const many = Array.from({ length: pages.MAX_PAGES + 5 }, () => [])
  assert.equal(format.createDocument({ ...base, items: [], extraPages: many }).pages.length + 1, pages.MAX_PAGES)
})

test('the item count and the unchanged-check cover every page', () => {
  const doc = format.createDocument({ ...base, items: [stroke(1)], extraPages: [[stroke(1), stroke(2)]] })
  assert.equal(format.documentItemCount(doc), 3)
  const sig = { title: 't', template: 'blank', background: 'white', items: [], extraPages: [[]] }
  assert.equal(format.sameSignature(sig, { ...sig, extraPages: [[]] }), true)
  assert.equal(format.sameSignature(sig, { ...sig, extraPages: [] }), false, 'adding a page is a change')
  const a = stroke(1)
  assert.equal(format.sameSignature({ ...sig, extraPages: [[a]] }, { ...sig, extraPages: [[a]] }), true)
  assert.equal(format.sameSignature({ ...sig, extraPages: [[a]] }, { ...sig, extraPages: [[stroke(1)]] }), false, 'a changed item on page 2 is a change')
})

test('the app keeps one live page and per-page undo, and stays off the pen', () => {
  assert.match(appSource, /getPageItems: \(\) => pagesRef\.current\.map\(\(slot, index\) => \(index === pageIndexRef\.current \? strokesRef\.current : slot\.items\)\)/)
  assert.match(appSource, /pagesRef\.current\[pageIndexRef\.current\] = \{ items: strokesRef\.current, history: historyRef\.current \}/)
  assert.match(appSource, /historyRef\.current = slot\.history \?\? new CanvasSnapshotHistory\(\)/)
  assert.match(appSource, /const penBusy = \(\) => activePointerRef\.current !== null \|\| activeStrokeRef\.current !== null/)
  for (const name of ['goToPage', 'addPage', 'deletePage', 'undoDeletePage']) assert.match(appSource, new RegExp(`const ${name} = \\(`))
  assert.match(appSource, /if \(next === pageIndexRef\.current \|\| penBusy\(\)\) return/)
  assert.match(appSource, /if \(pagesRef\.current\.length > 1\) return/, 'growing and several pages stay apart')
  assert.match(appSource, /<PageControls index=\{pageIndex\} count=\{pageCount\}/)
})

test('a new page needs something on the current one first, in the button and in the action', () => {
  assert.match(appSource, /canAdd=\{canAddPage\(pageCount\) && hasInk\}/)
  assert.match(appSource, /if \(strokesRef\.current\.length === 0\) return/)
  assert.match(appSource, /Write something on this page first/)
})

test('a deleted page comes back with its drawing and undo history, in the same place, for 8 seconds', () => {
  assert.match(appSource, /const DELETED_PAGE_UNDO_MS = 8000/)
  assert.match(appSource, /const removedSlot = \{ items: strokesRef\.current, history: historyRef\.current \}/)
  assert.match(appSource, /deletedPageRef\.current = \{ index: removedIndex, slot: removedSlot \}/)
  assert.match(appSource, /const at = Math\.min\(deleted\.index, pagesRef\.current\.length\)/)
  assert.match(appSource, /insertPageAt\(pagesRef\.current, at, \{ items: deleted\.slot\.items, history: deleted\.slot\.history \}\)/)
  assert.match(appSource, /if \(deletedPageRef\.current\) dismissDeletedPage\(\)/, 'drawing again settles the delete')
  assert.match(appSource, /<PageUndoBar pageNumber=\{deletedPageNumber\} onUndo=\{undoDeletePage\} \/>/)
})

test('delete lives next to the page controls, only with several pages, and is gone from the menu', async () => {
  const { readFile } = await import('node:fs/promises')
  const controls = await readFile(new URL('../src/app/PageControls.tsx', import.meta.url), 'utf8')
  const bar = await readFile(new URL('../src/app/TopLeftBar.tsx', import.meta.url), 'utf8')
  assert.match(controls, /several && <button type="button" className="page-delete"/)
  assert.match(controls, /several && <button type="button" aria-label="Previous page"/)
  assert.doesNotMatch(bar, /Delete this page|onDeletePage/)
})

test('pages can be put back at a position', () => {
  assert.deepEqual(pages.insertPageAt(['a', 'b'], 0, 'x'), ['x', 'a', 'b'])
  assert.deepEqual(pages.insertPageAt(['a', 'b'], 2, 'x'), ['a', 'b', 'x'])
  assert.deepEqual(pages.insertPageAt(['a', 'b'], 9, 'x'), ['a', 'b', 'x'])
  assert.equal(pages.insertPageAt(Array.from({ length: 50 }, () => 'p'), 3, 'x').length, 50)
})

test('the page you left is remembered per diagram, page 1 is the default, and bad data is ignored', () => {
  assert.deepEqual(pages.parseLastPages(null), {})
  assert.deepEqual(pages.parseLastPages('nonsense'), {})
  assert.deepEqual(pages.parseLastPages('[1,2]'), {})
  assert.deepEqual(pages.parseLastPages('{"a":2,"b":-1,"c":"x","d":1.5,"e":0}'), { a: 2 })
  assert.deepEqual(pages.withLastPage({}, 'a', 3), { a: 3 })
  assert.deepEqual(pages.withLastPage({ a: 3, b: 1 }, 'a', 0), { b: 1 }, 'back on page 1 forgets it')
  let map = {}
  for (let i = 0; i < 250; i += 1) map = pages.withLastPage(map, `d${i}`, 1 + (i % 5))
  assert.equal(Object.keys(map).length, 200)
  assert.equal('d0' in map, false)
  assert.equal('d249' in map, true)
})

test('opening a diagram goes to the remembered page, and the page is written when it changes', async () => {
  const { readFile } = await import('node:fs/promises')
  const hook = await readFile(new URL('../src/app/useDocuments.ts', import.meta.url), 'utf8')
  assert.match(hook, /hostRef\.current\.loadDocument\(loaded, id \? readLastPage\(id\) : 0\)/)
  assert.match(appSource, /const openIndex = clampPageIndex\(startPage, pagesRef\.current\.length\)/)
  assert.match(appSource, /if \(currentDocId\) writeLastPage\(currentDocId, pageIndex\)/)
})

test('pen colours sit beside the profile button and show only while the pen is the tool', async () => {
  const { readFile } = await import('node:fs/promises')
  const account = await readFile(new URL('../src/app/AccountButton.tsx', import.meta.url), 'utf8')
  assert.match(account, /\{props\.leading\}/)
  assert.match(appSource, /leading=\{penModeActive \? <PenColors color=\{color\} onColor=\{selectColor\} \/> : undefined\}/)
})

test('page counts reach the Library for multi-page diagrams only', async () => {
  const store = await loadModule('documentStore.ts').catch(() => null)
  assert.equal(format.documentPageCount(format.createDocument({ ...base, items: [] })), 1)
  assert.equal(format.documentPageCount(format.createDocument({ ...base, items: [], extraPages: [[], []] })), 3)
  const { readFile } = await import('node:fs/promises')
  const home = await readFile(new URL('../src/app/HomeScreen.tsx', import.meta.url), 'utf8')
  assert.match(home, /\$\{entry\.pageCount\} pages/)
  void store
})
