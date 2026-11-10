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
  for (const name of ['goToPage', 'addPage', 'deletePage']) assert.match(appSource, new RegExp(`const ${name} = \\(`))
  assert.match(appSource, /if \(next === pageIndexRef\.current \|\| penBusy\(\)\) return/)
  assert.match(appSource, /if \(pagesRef\.current\.length > 1\) return/, 'growing and several pages stay apart')
  assert.match(appSource, /<PageControls index=\{pageIndex\} count=\{pageCount\}/)
  assert.match(appSource, /onDeletePage=\{deletePage\}/)
})

test('deleting a page asks a second tap and is not offered for the last page', async () => {
  const { readFile } = await import('node:fs/promises')
  const bar = await readFile(new URL('../src/app/TopLeftBar.tsx', import.meta.url), 'utf8')
  assert.match(bar, /props\.pageCount > 1 && \(/)
  assert.match(bar, /if \(confirmDeletePage\) \{ props\.onDeletePage\(\)/)
  assert.match(bar, /Tap again to delete page \$\{props\.pageNumber\}/)
})
