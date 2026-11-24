import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const format = await loadModule('documentFormat.ts')
const store = await loadModule('documentStore.ts')
const stroke = (id, n = 5) => ({ kind: 'stroke', id, color: '#202124', width: 3, erase: false, points: Array.from({ length: n }, (_, k) => ({ x: k + id, y: k * 2, pressure: 0.5 })) })
const rect = { kind: 'rectangle', id: 1, x: 1, y: 2, width: 30, height: 40, strokeColor: '#000', strokeWidth: 2 }
const make = (items, extra = {}) => format.createDocument({ title: 'T', template: 'lined', background: 'warm', items, ...extra }, '2026-01-01T00:00:00.000Z')

test('stringifyDocument gives exactly the same text as JSON.stringify and parses back', () => {
  const doc = make([stroke(1), rect, stroke(2, 40)])
  assert.equal(format.stringifyDocument(doc), JSON.stringify(doc))
  assert.equal(format.stringifyDocument(make([])), JSON.stringify(make([])))
  const parsed = format.parseDocument(format.stringifyDocument(doc))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.document.items.length, 3)
})

test('finished strokes are serialized once and reused by later saves', () => {
  const a = stroke(1)
  const first = format.stringifyDocument(make([a], { shareStrokes: true }))
  let reads = 0
  const counted = { ...a, get points() { reads += 1; return a.points } }
  // a stroke object seen before is not serialized again
  const again = format.stringifyDocument(make([a, stroke(2)], { shareStrokes: true }))
  assert.ok(again.includes(JSON.stringify(a)))
  assert.ok(again.startsWith(first.slice(0, first.indexOf('"items"'))))
  assert.equal(reads, 0)
  assert.ok(counted)
})

test('autosave shares finished strokes but still copies other items; normal documents are fully copied', () => {
  const a = stroke(1)
  const shared = make([a, rect], { shareStrokes: true })
  assert.equal(shared.items[0], a)
  assert.notEqual(shared.items[1], rect)
  const copied = make([a, rect])
  assert.notEqual(copied.items[0], a)
  assert.notEqual(copied.items[0].points, a.points)
})

test('browser records hold JSON text with a summary, and older object records still load and list', () => {
  const doc = make([stroke(1), stroke(2)])
  const record = store.toStoredRecord('doc-1', doc)
  assert.equal(typeof record.json, 'string')
  assert.equal(record.document, undefined)
  assert.deepEqual(store.summaryFromRecord(record, 'f1'), { id: 'doc-1', title: 'T', updatedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z', itemCount: 2, folderId: 'f1' })
  assert.equal(store.documentFromRecord(record).items.length, 2)
  const legacy = { id: 'old', document: doc }
  assert.equal(store.documentFromRecord(legacy).title, 'T')
  assert.deepEqual(store.summaryFromRecord(legacy, null), { id: 'old', title: 'T', updatedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z', itemCount: 2, folderId: null })
  assert.equal(store.documentFromRecord(undefined), null)
  assert.throws(() => store.documentFromRecord({ id: 'bad', json: '{"nope":1}' }))
})
