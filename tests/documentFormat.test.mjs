import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/documentFormat.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
const doc = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)

const p = (x, y, pressure = 0.5) => ({ x, y, pressure })
const sampleItems = () => [
  { kind: 'stroke', id: 4, points: [p(1, 2), p(3, 4)], color: '#111', width: 3, erase: false },
  { kind: 'stroke', id: 5, points: [p(0, 0), p(9, 9)], color: '#111', width: 3, erase: false, shape: 'arrow' },
  { kind: 'stroke', id: 6, points: [p(5, 5)], color: '#000', width: 20, erase: true },
  { kind: 'rectangle', id: 2, x: 10, y: 20, width: 100, height: 60, strokeColor: '#111', strokeWidth: 2 },
  { kind: 'connector', id: 7, start: p(110, 50, 0), end: p(300, 50, 0), strokeColor: '#111', strokeWidth: 2, relationshipType: 'inheritance', reversed: true,
    startAttachment: { rectangleId: 2, offsetX: 1, offsetY: 0.5 } },
]
const input = (items = sampleItems()) => ({ title: 'Order service', template: 'dotted', background: 'warm', items })

test('document round-trips through JSON without loss', () => {
  const created = doc.createDocument(input(), '2026-10-31T00:00:00.000Z')
  assert.equal(created.format, 'inkpad-document')
  assert.equal(created.version, 1)
  const parsed = doc.parseDocument(doc.stringifyDocument(created))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.droppedItems, 0)
  assert.equal(parsed.migratedFrom, null)
  assert.deepEqual(parsed.document, created)
})

test('createDocument copies items so later edits do not leak into the saved document', () => {
  const items = sampleItems()
  const created = doc.createDocument(input(items))
  items[0].points[0].x = 999
  items[4].startAttachment.offsetX = 999
  assert.equal(created.items[0].points[0].x, 1)
  assert.equal(created.items[4].startAttachment.offsetX, 1)
})

test('getNextIds restores each id counter independently', () => {
  assert.deepEqual(doc.getNextIds([]), { stroke: 1, rectangle: 1, connector: 1, text: 1 })
  assert.deepEqual(doc.getNextIds(sampleItems()), { stroke: 7, rectangle: 3, connector: 8, text: 1 })
})

test('invalid or foreign files are rejected with a readable error', () => {
  assert.equal(doc.parseDocument('not json').ok, false)
  assert.match(doc.parseDocument('not json').error, /JSON/)
  assert.match(doc.parseDocument('{"hello":1}').error, /not an InkPad/)
  assert.match(doc.parseDocument('[]').error, /not an InkPad/)
  assert.match(doc.parseDocument('{"format":"inkpad-document","version":"1","items":[]}').error, /version/)
  assert.match(doc.parseDocument('{"format":"inkpad-document","version":1}').error, /items/)
})

test('a document from a newer InkPad is refused instead of being misread', () => {
  const result = doc.parseDocument(JSON.stringify({ format: 'inkpad-document', version: 99, items: [] }))
  assert.equal(result.ok, false)
  assert.match(result.error, /newer InkPad/)
})

test('malformed items are dropped and counted, valid ones survive', () => {
  const bad = [
    { kind: 'stroke', id: 1, points: [], color: '#111', width: 3 },
    { kind: 'stroke', id: 2, points: [{ x: 'a', y: 1 }], color: '#111', width: 3 },
    { kind: 'rectangle', id: 3, x: NaN, y: 0, width: 1, height: 1, strokeColor: '#111', strokeWidth: 1 },
    { kind: 'circle', id: 4 },
    null,
    { kind: 'rectangle', id: 5, x: 0, y: 0, width: 10, height: 10, strokeColor: '#111', strokeWidth: 2 },
  ]
  const result = doc.parseDocument(JSON.stringify({ format: 'inkpad-document', version: 1, items: bad }))
  assert.equal(result.ok, true)
  assert.equal(result.droppedItems, 5)
  assert.deepEqual(result.document.items.map((item) => item.id), [5])
})

test('pressure is clamped, unknown relationship falls back, duplicates are dropped', () => {
  const items = [
    { kind: 'stroke', id: 1, points: [{ x: 0, y: 0, pressure: 7 }, { x: 1, y: 1 }], color: '#111', width: 2 },
    { kind: 'stroke', id: 1, points: [p(0, 0)], color: '#222', width: 2 },
    { kind: 'connector', id: 1, start: p(0, 0), end: p(5, 5), strokeColor: '#111', strokeWidth: 2, relationshipType: 'weird' },
  ]
  const result = doc.parseDocument(JSON.stringify({ format: 'inkpad-document', version: 1, items }))
  assert.equal(result.droppedItems, 1)
  assert.deepEqual(result.document.items[0].points.map((point) => point.pressure), [1, 0])
  assert.equal(result.document.items[1].relationshipType, 'association')
  assert.equal(result.document.items[1].reversed, false)
})

test('connector attachments to missing rectangles are removed but valid ones kept', () => {
  const items = [
    { kind: 'rectangle', id: 1, x: 0, y: 0, width: 10, height: 10, strokeColor: '#111', strokeWidth: 2 },
    { kind: 'connector', id: 1, start: p(0, 0), end: p(5, 5), strokeColor: '#111', strokeWidth: 2, relationshipType: 'association', reversed: false,
      startAttachment: { rectangleId: 1, offsetX: 0, offsetY: 0 }, endAttachment: { rectangleId: 42, offsetX: 0, offsetY: 0 } },
  ]
  const connector = doc.parseDocument(JSON.stringify({ format: 'inkpad-document', version: 1, items })).document.items[1]
  assert.equal(connector.startAttachment.rectangleId, 1)
  assert.equal('endAttachment' in connector, false)
})

test('page settings fall back to blank and white when unknown', () => {
  const result = doc.parseDocument(JSON.stringify({ format: 'inkpad-document', version: 1, page: { template: 'grid', background: 'red' }, items: [] }))
  assert.deepEqual(result.document.page, { template: 'blank', background: 'white' })
})

test('titles are trimmed, bounded and turned into safe file names', () => {
  assert.equal(doc.cleanTitle('   '), 'Untitled diagram')
  assert.equal(doc.cleanTitle(undefined), 'Untitled diagram')
  assert.equal(doc.cleanTitle('x'.repeat(500)).length, 120)
  assert.equal(doc.documentFileName('Order / Payment: v2?'), 'Order-Payment-v2.inkpad')
  assert.equal(doc.documentFileName('???'), 'diagram.inkpad')
})
