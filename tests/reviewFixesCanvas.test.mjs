import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const outline = await loadModule('diagramOutline.ts')
const pages = await loadModule('pages.ts')
const app = await readAppSource()

const box = (id, x, y, extra = {}) => ({ kind: 'rectangle', id, x, y, width: 200, height: 100, strokeColor: '#000', strokeWidth: 3, ...extra })
const inkClass = (id, x, y, ink = []) => box(id, x, y, { inkBox: { top: y + 20, mid: y + 60, ink } })
const label = (id, x, y, text) => ({ kind: 'text', id, x, y, width: 80, height: 24, text, fontSize: 18, color: '#000' })
const stroke = (id) => ({ kind: 'stroke', id, points: [{ x: 1, y: 1, pressure: 1 }, { x: 5, y: 5, pressure: 1 }], color: '#000', width: 3, erase: false })
const link = (id, a, b) => ({ kind: 'connector', id, start: { x: 200, y: 50, pressure: 1 }, end: { x: 400, y: 50, pressure: 1 }, strokeColor: '#000', strokeWidth: 3, relationshipType: 'directed-association', reversed: false, startAttachment: { rectangleId: a, offsetX: 200, offsetY: 50 }, endAttachment: { rectangleId: b, offsetX: 0, offsetY: 50 } })

test('outline: ink class boxes are components, connection ends, and their ink is counted as handwriting', () => {
  const a = inkClass(1, 0, 0, [stroke(10), stroke(11), { ...stroke(12), erase: true }])
  const b = inkClass(2, 400, 0)
  const items = [a, b, label(5, 60, 38, 'Order'), link(3, 1, 2), stroke(20)]
  const md = outline.buildDiagramOutline('t', [items])
  assert.match(md, /## Components\n\n- Order \(handwritten box\)\n- \(handwritten box\)\n/)
  assert.match(md, /- Order \(handwritten box\) → \(handwritten box\)\n/)
  assert.match(md, /Handwriting: 3 strokes\n$/)
})

test('duplicate page: items of an unknown kind are left out and counted, never copied with their old ids', () => {
  const opaque = { kind: 'opaque', id: 7, box: null, raw: { kind: 'future', id: 7 } }
  const items = [box(1, 0, 0), opaque, label(2, 10, 10, 'x')]
  const copy = pages.duplicatePageItems(items, { stroke: 1, rectangle: 5, connector: 1, text: 8 })
  assert.equal(copy.skipped, 1)
  assert.equal(copy.items.length, 2)
  assert.ok(copy.items.every((item) => item.kind !== 'opaque'))
  assert.deepEqual(copy.items.map((item) => item.id), [5, 8])
  assert.equal(pages.duplicatePageItems([box(1, 0, 0)], { stroke: 1, rectangle: 5, connector: 1, text: 8 }).skipped, 0)
  assert.match(app, /can't copy/)
})

test('font size keys also step the labels inside a selected box, in one history step; help says text or shape labels', () => {
  const start = app.indexOf('const stepBoxLabelFontSizes')
  const body = app.slice(start, app.indexOf('const stepSelectedFontSize'))
  assert.ok(start > 0)
  assert.match(body, /labelsInside\(strokesRef\.current, currentSelectionKeys\(\)\)/)
  assert.equal((body.match(/saveHistory\(\)/g) ?? []).length, 1)
  assert.match(app, /if \(!item && inputModeRef\.current === 'desktop'\) return stepBoxLabelFontSizes\(direction\)/)
})

test('change shape refreshes the panel and tells what changed', () => {
  const body = app.slice(app.indexOf('const changeShapeSelection'), app.indexOf('const ungroupSelection'))
  assert.match(body, /bumpSelectionColor/)
  assert.match(body, /showToast\(`Changed to /)
})
