import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const appSource = await readAppSource()
const pages = await loadModule('pages.ts')
const format = await loadModule('documentFormat.ts')
const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')

const dp = (x, y) => ({ x, y, pressure: 1 })
const box = (id, x, extra = {}) => ({ kind: 'rectangle', id, x, y: 10, width: 100, height: 60, strokeColor: '#000', strokeWidth: 3, ...extra })
const label = (id, x, extra = {}) => ({ kind: 'text', id, x, y: 20, width: 40, height: 20, text: 'L', fontSize: 18, color: '#000', ...extra })
const link = (id, a, b, extra = {}) => ({ kind: 'connector', id, start: dp(100, 40), end: dp(300, 40), strokeColor: '#000', strokeWidth: 3, relationshipType: 'association', reversed: false, startAttachment: { rectangleId: a, offsetX: 100, offsetY: 30 }, ...(b ? { endAttachment: { rectangleId: b, offsetX: 0, offsetY: 30 } } : {}), ...extra })

test('duplicatePageItems: fresh ids, same coordinates, connectors on the copied boxes, original untouched', () => {
  const items = [
    box(1, 0),
    box(2, 300, { inkBox: { top: 20, mid: 40, ink: [{ kind: 'stroke', id: 5, points: [dp(310, 30)], color: '#000', width: 2, erase: false }] } }),
    label(3, 10),
    { kind: 'code', id: 4, x: 0, y: 200, width: 200, height: 80, text: 'x', language: 'python' },
    link(7, 1, 2, { label: 'calls' }),
    { kind: 'stroke', id: 6, points: [dp(1, 1), dp(9, 9)], color: '#111', width: 3, erase: false },
  ]
  const before = JSON.stringify(items)
  const other = [box(9, 0), label(8, 0)]
  const counters = format.getNextIds([...items, ...other])
  const copy = pages.duplicatePageItems(items, counters)
  assert.equal(JSON.stringify(items), before)
  assert.deepEqual(copy.items.map((i) => i.kind), items.map((i) => i.kind))
  const rects = copy.items.filter((i) => i.kind === 'rectangle')
  assert.deepEqual(rects.map((r) => r.id), [counters.rectangle, counters.rectangle + 1])
  const texts = copy.items.filter((i) => i.kind === 'text' || i.kind === 'code').map((i) => i.id)
  assert.deepEqual(texts, [counters.text, counters.text + 1])
  const connector = copy.items.find((i) => i.kind === 'connector')
  assert.equal(connector.id, counters.connector)
  assert.equal(connector.startAttachment.rectangleId, rects[0].id)
  assert.equal(connector.endAttachment.rectangleId, rects[1].id)
  assert.equal(connector.label, 'calls')
  assert.deepEqual(connector.start, items[4].start)
  assert.deepEqual([rects[0].x, rects[0].y, rects[1].x], [0, 10, 300])
  assert.ok(rects[1].inkBox.ink[0].id >= counters.stroke)
  assert.deepEqual(rects[1].inkBox.ink[0].points, items[1].inkBox.ink[0].points)
  assert.equal(copy.counters.rectangle, counters.rectangle + 2)
  assert.equal(copy.counters.connector, counters.connector + 1)
  assert.equal(copy.counters.stroke, counters.stroke + 2)
  const keyOf = (i) => `${i.kind === 'code' ? 'text' : i.kind}:${i.id}`
  const used = new Set([...items, ...other].map(keyOf))
  for (const item of copy.items) assert.equal(used.has(keyOf(item)), false, keyOf(item))
  const round = format.parseDocument(format.stringifyDocument(format.createDocument({ title: 't', template: 'blank', background: 'white', items: copy.items })))
  assert.equal(round.ok, true)
  assert.equal(round.droppedItems, 0)
})

test('duplicatePageItems: groups renumbered, locks kept, far items not moved, empty page gives an empty copy', () => {
  const items = [box(1, 0, { group: 3 }), label(2, 10, { group: 3 }), box(3, 50000, { locked: true }), box(4, -4000)]
  const copy = pages.duplicatePageItems(items, format.getNextIds(items))
  assert.equal(copy.items[0].group, copy.items[1].group)
  assert.equal(typeof copy.items[0].group, 'number')
  assert.equal(copy.items[2].locked, true)
  assert.equal(copy.items[3].locked, undefined)
  assert.deepEqual(copy.items.map((i) => i.x), items.map((i) => i.x))
  assert.deepEqual(pages.duplicatePageItems([], { stroke: 4, rectangle: 5, connector: 6, text: 7 }), { items: [], counters: { stroke: 4, rectangle: 5, connector: 6, text: 7 } })
})

test('duplicatePageItems: an end attached to a box not on the page is detached, never pointed at another page', () => {
  const items = [box(1, 0), link(2, 1, 99)]
  const copy = pages.duplicatePageItems(items, format.getNextIds(items))
  assert.equal(copy.items[1].startAttachment.rectangleId, copy.items[0].id)
  assert.equal(copy.items[1].endAttachment, undefined)
})

test('wiring: duplicate page button, More menu entry, palette entry and the page switch', async () => {
  const controls = await read('app/PageControls.tsx')
  assert.match(controls, /aria-label="Duplicate page" title=\{duplicateHint\} onClick=\{onDuplicate\} disabled=\{!canDuplicate\}/)
  assert.equal(/\{several && <button[^\n]*Duplicate page/.test(controls), false)
  const more = await read('app/MoreTray.tsx')
  assert.match(more, /aria-label="Duplicate page" disabled=\{!canDuplicatePage\}/)
  assert.match(appSource, /canDuplicate=\{canAddPage\(pageCount\)\}/)
  assert.match(appSource, /onDuplicatePage=\{duplicatePage\}/)
  assert.match(appSource, /id: 'page:duplicate', label: 'Duplicate page'/)
  const fn = appSource.slice(appSource.indexOf('const duplicatePage = ()'), appSource.indexOf('// The page deleted last'))
  assert.match(fn, /canAddPage\(pagesRef\.current\.length\)/)
  assert.match(fn, /duplicatePageItems\(strokesRef\.current,/)
  assert.match(fn, /history: null/)
  assert.match(fn, /showPageSlot\(pageIndexRef\.current \+ 1\)/)
  assert.match(fn, /scheduleAutosave\(\)/)
  assert.match(fn, /nextTextIdRef\.current = copy\.counters\.text/)
})
