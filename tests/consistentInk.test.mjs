import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const model = await loadModule('canvasModel.ts')
const format = await loadModule('documentFormat.ts')

const stroke = (id, n = 3) => ({ kind: 'stroke', id, color: '#202124', width: 2, erase: false, points: Array.from({ length: n }, (_, i) => ({ x: i, y: i, pressure: 0.5 })) })
const rectangle = (id, x = 10) => ({ kind: 'rectangle', id, x, y: 10, width: 50, height: 40, strokeColor: '#202124', strokeWidth: 2 })

test('undo history shares items instead of copying every point', () => {
  const history = new model.CanvasSnapshotHistory()
  const items = [stroke(1), stroke(2)]
  history.record(items)
  items.push(stroke(3)) // the live list keeps changing after the snapshot
  const undone = history.undo(items)
  assert.equal(undone.length, 2, 'snapshot is a copy of the list, not the live list')
  assert.equal(undone[0], items[0], 'same stroke object, points not copied')
  assert.equal(undone[0].points, items[0].points)
  const redone = history.redo(undone)
  assert.equal(redone.length, 3)
  assert.equal(redone[2], items[2])
})

test('undo history snapshots stay independent of later edits to the live list', () => {
  const history = new model.CanvasSnapshotHistory()
  const live = [stroke(1), rectangle(2)]
  history.record(live)
  live.splice(0, 1)
  live[0] = rectangle(2, 99) // an edit replaces the item with a new object
  const undone = history.undo(live)
  assert.deepEqual(undone.map((item) => item.id), [1, 2])
  assert.equal(undone[1].x, 10)
})

test('history keeps at most its limit of snapshots', () => {
  const history = new model.CanvasSnapshotHistory(3)
  for (let n = 0; n < 5; n += 1) history.record([stroke(n)])
  let undos = 0
  let current = [stroke(99)]
  for (let next = history.undo(current); next; next = history.undo(current)) { current = next; undos += 1 }
  assert.equal(undos, 3)
})

test('appended items match the tail of a full render order', () => {
  const box = rectangle(1)
  const other = rectangle(2, 200)
  const connector = model.createConnector(3, { x: 60, y: 30, pressure: 1 }, { x: 200, y: 30, pressure: 1 }, '#202124', 2,
    { rectangleId: 1, offsetX: 50, offsetY: 20 }, { rectangleId: 2, offsetX: 0, offsetY: 20 })
  for (const items of [[box], [box, stroke(4)], [box, other, connector], [stroke(4), box, other]]) {
    const before = model.canvasItemsForRendering(items.slice(0, -1))
    const full = model.canvasItemsForRendering(items)
    assert.deepEqual(model.appendedItemsForRendering(items), full.slice(before.length))
  }
  assert.deepEqual(model.appendedItemsForRendering([]), [])
})

test('a connector attached at both ends to the same box redraws that box once', () => {
  const box = rectangle(1)
  const loop = model.createConnector(2, { x: 60, y: 30, pressure: 1 }, { x: 10, y: 30, pressure: 1 }, '#202124', 2,
    { rectangleId: 1, offsetX: 50, offsetY: 20 }, { rectangleId: 1, offsetX: 0, offsetY: 20 })
  assert.deepEqual(model.appendedItemsForRendering([box, loop]), [loop, box])
})

test('document signature compares by item identity, title and page settings', () => {
  const items = [stroke(1), rectangle(2)]
  const base = { title: 'Zepto', template: 'dotted', background: 'warm', items: items.slice() }
  assert.equal(format.sameSignature(base, { ...base, items: items.slice() }), true)
  assert.equal(format.sameSignature(base, { ...base, title: 'Other' }), false)
  assert.equal(format.sameSignature(base, { ...base, template: 'lined' }), false)
  assert.equal(format.sameSignature(base, { ...base, background: 'white' }), false)
  assert.equal(format.sameSignature(base, { ...base, items: [items[0]] }), false)
  assert.equal(format.sameSignature(base, { ...base, items: [items[0], rectangle(2)] }), false, 'a replaced item counts as a change')
  assert.equal(format.sameSignature(base, null), false)
  assert.equal(format.sameSignature(null, null), false)
})

test('the app no longer deep-copies the page for history or select drags', async () => {
  const { readFile } = await import('node:fs/promises')
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(app, /originalItems: cloneCanvasItems\(/)
  const modelSource = await readFile(new URL('../src/canvasModel.ts', import.meta.url), 'utf8')
  const history = modelSource.slice(modelSource.indexOf('export class CanvasSnapshotHistory'))
  assert.doesNotMatch(history, /cloneCanvasItems/)
})
