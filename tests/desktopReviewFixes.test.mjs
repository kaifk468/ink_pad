import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const input = await loadModule('desktopInput.ts')
const model = await loadModule('canvasModel.ts')
const flow = await loadModule('diagramFlow.ts')
const arrange = await loadModule('arrange.ts')
const tidy = await loadModule('tidyLayout.ts')
const sheet = await loadModule('sheetExport.ts')
const doc = await loadModule('documentFormat.ts')
const p = (x, y) => ({ x, y, pressure: 1 })
const box = (id, x, y, extra = {}) => ({ kind: 'rectangle', id, x, y, width: 100, height: 60, strokeColor: '#111', strokeWidth: 2, ...extra })
const label = (id, x, y, extra = {}) => ({ kind: 'text', id, x, y, width: 40, height: 20, text: 'hi', fontSize: 24, color: '#111', ...extra })
const line = (id, x0, y0, x1, y1, extra = {}) => ({ kind: 'stroke', id, points: [p(x0, y0), p(x1, y1)], color: '#000', width: 3, erase: false, ...extra })
const eraser = (id, x0, y0, x1, y1) => line(id, x0, y0, x1, y1, { erase: true, width: 20 })
const link = (id, a, b, extra = {}) => ({ kind: 'connector', id, start: p(0, 0), end: p(1, 1), strokeColor: '#111', strokeWidth: 2, relationshipType: 'association', reversed: false, startAttachment: { rectangleId: a, offsetX: 0, offsetY: 0 }, endAttachment: { rectangleId: b, offsetX: 0, offsetY: 0 }, ...extra })
const keys = (...items) => new Set(items.map(model.canvasItemKey))
const ids = (items) => items.map((i) => `${i.kind[0]}${i.id}`)

test('1: eraser strokes that overlap a moving item are layer barriers', () => {
  const arrow = line(1, 0, 0, 100, 0)
  const cut = eraser(2, 50, -10, 50, 10)
  const far = eraser(3, 500, 500, 600, 500)
  const b = box(1, 0, -30)
  // Send to back: the box stays above the eraser that cuts it
  assert.deepEqual(ids(model.reorderItems([arrow, cut, b], keys(b), 'back')), ['s1', 's2', 'r1'])
  assert.deepEqual(ids(model.reorderItems([arrow, cut, b], keys(b), 'backward')), ['s1', 's2', 'r1'])
  // Bring to front: the partly erased arrow stays under its eraser
  assert.deepEqual(ids(model.reorderItems([arrow, cut, b], keys(arrow), 'front')), ['s1', 's2', 'r1'])
  assert.equal(model.reorderItems([arrow, cut], keys(arrow), 'forward').length, 2)
  assert.deepEqual(ids(model.reorderItems([arrow, cut], keys(arrow), 'forward')), ['s1', 's2'])
  // an eraser far away is not a barrier
  assert.deepEqual(ids(model.reorderItems([arrow, far, b], keys(arrow), 'front')), ['s3', 'r1', 's1'])
  assert.deepEqual(ids(model.reorderItems([b, far, arrow], keys(arrow), 'back')), ['s1', 'r1', 's3'])
})

test('2: a box moves with its attached connectors, so Send to back shows in the rendered order', () => {
  const a = box(1, 0, 0)
  const b = box(2, 50, 0)
  const c = link(1, 1, 2)
  const sent = model.reorderItems([a, b, c], keys(b), 'back')
  assert.deepEqual(ids(sent), ['r2', 'c1', 'r1'])
  const rendered = ids(model.canvasItemsForRendering(sent))
  assert.ok(rendered.lastIndexOf('r2') < rendered.lastIndexOf('r1'), rendered.join())
  const front = model.reorderItems([a, c, b], keys(a), 'front')
  assert.deepEqual(ids(front), ['r2', 'r1', 'c1'])
  // a connector that is attached to a box that is not moving just moves like any other item
  const x = box(3, 400, 0)
  assert.deepEqual(ids(model.reorderItems([x, a, b, c], keys(c), 'back')), ['c1', 'r3', 'r1', 'r2'])
})

test('3: after an eraser run only overlapping locked items are redrawn, followed by what was in front of them', () => {
  const lockedBox = box(1, 0, 0, { locked: true })
  const lab = label(1, 10, 10)
  const other = box(2, 1000, 1000, { locked: true })
  const e = eraser(9, 20, 20, 30, 30)
  const rendered = ids(model.canvasItemsForRendering([lockedBox, lab, other, e]))
  assert.deepEqual(rendered, ['r1', 't1', 'r2', 's9', 'r1', 't1'])
  assert.deepEqual(ids(model.appendedItemsForRendering([lockedBox, lab, other, e])), ['s9', 'r1', 't1'])
  assert.deepEqual(ids(model.canvasItemsForRendering([box(1, 0, 0), lab, e])), ['r1', 't1', 's9'])
})

test('4: SVG export draws locked items over the eraser mask like the canvas', () => {
  const options = { width: 400, height: 400, template: 'blank', backgroundColor: '#fff' }
  const lockedBox = box(1, 0, 0, { locked: true })
  const plain = { ...lockedBox }; delete plain.locked
  const e = eraser(9, 20, 20, 30, 30)
  const svg = sheet.buildSheetSvg([lockedBox, e], options)
  assert.ok(svg.indexOf('</g>') < svg.lastIndexOf('<rect x="0" y="0" width="100"'), 'locked box after the masked group')
  assert.equal(sheet.buildSheetSvg([plain, e], options).split('<rect x="0" y="0" width="100"').length, 2)
  assert.equal(svg.split('<rect x="0" y="0" width="100"').length, 3)
})

test('5: Ctrl+plus is zoom on a German layout, brackets still work by code', () => {
  const ev = (key, code, extra = {}) => ({ key, code, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra })
  assert.deepEqual(input.keyCommand(ev('+', 'BracketRight'), 'desktop'), { kind: 'zoomIn' })
  assert.deepEqual(input.keyCommand(ev('+', 'Equal', { shiftKey: true }), 'desktop'), { kind: 'zoomIn' })
  assert.deepEqual(input.keyCommand(ev('-', 'Slash'), 'desktop'), { kind: 'zoomOut' })
  assert.deepEqual(input.keyCommand(ev(']', 'BracketRight'), 'desktop'), { kind: 'layer', move: 'forward' })
  assert.deepEqual(input.keyCommand(ev('{', 'BracketLeft', { shiftKey: true }), 'desktop'), { kind: 'layer', move: 'back' })
  assert.deepEqual(input.keyCommand(ev('Unidentified', 'BracketLeft'), 'desktop'), { kind: 'layer', move: 'backward' })
})

test('6: dragging a container does not carry the labels of boxes nested in it', () => {
  const outer = box(1, 0, 0, { width: 400, height: 300 })
  const inner = box(2, 100, 100, { width: 100, height: 60 })
  const inLabel = label(1, 120, 110)
  const outLabel = label(2, 300, 200)
  const lockedLabel = label(3, 300, 250, { locked: true })
  const items = [outer, inner, inLabel, outLabel, lockedLabel]
  assert.deepEqual(flow.labelsInside(items, keys(outer)), ['text:2'].map((k) => model.canvasItemKey(outLabel)))
  assert.deepEqual(flow.labelsInside(items, keys(inner)), [model.canvasItemKey(inLabel)])
  assert.deepEqual(flow.labelsInside(items, keys(outer, inner)).sort(), [model.canvasItemKey(inLabel), model.canvasItemKey(outLabel)].sort())
})

test('7: align and distribute treat a box with its labels as one and move the labels along', () => {
  const a = box(1, 0, 0)
  const b = box(2, 300, 100)
  const c = box(3, 100, 400)
  const la = label(1, 10, 10)
  const lb = label(2, 310, 110)
  const items = [a, la, b, lb, c]
  const sel = keys(a, la, b, lb, c)
  assert.equal(arrange.arrangeableItems(items, sel).length, 3)
  const moves = arrange.alignMoves(items, sel, 'left')
  const moved = arrange.applyMoves(items, moves)
  assert.equal(moved.find((i) => i.kind === 'text' && i.id === 2).x, 10)
  assert.equal(moved.find((i) => i.kind === 'rectangle' && i.id === 2).x, 0)
  // labels follow even when they were not selected
  const only = arrange.applyMoves(items, arrange.alignMoves(items, keys(a, b, c), 'left'))
  assert.equal(only.find((i) => i.kind === 'text' && i.id === 2).x, 10)
  const spread = arrange.distributeMoves(items, keys(a, b, c), 'vertical')
  assert.ok(spread.some((m) => m.key === model.canvasItemKey(lb)))
})

test('8: right-clicking a locked item offers Unlock even with another selection', () => {
  const entries = input.contextMenuEntries({ hasSelection: true, clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: true, anyLocked: true })
  const actions = entries.map((e) => e.action)
  assert.ok(actions.includes('unlock') && !actions.includes('lock'))
})

test('9: tidy skips locked boxes; double-click on a shape ignores locked labels', () => {
  const a = box(1, 0, 0, { classBox: { name: 'A', attributes: '', methods: '' } })
  const b = box(2, 500, 0, { classBox: { name: 'B', attributes: '', methods: '' }, locked: true })
  assert.equal(tidy.isTidyBox(a), true)
  assert.equal(tidy.isTidyBox(b), false)
  assert.equal(tidy.tidyScope([a, b], new Set()).count, 1)
  const shape = box(5, 0, 0)
  const lockedLabel = label(1, 20, 20, { locked: true })
  assert.equal(flow.shapeDoubleClick([shape, lockedLabel], 5).kind, 'newLabel')
  assert.equal(flow.shapeDoubleClick([shape, label(2, 20, 20)], 5).kind, 'editLabel')
})

test('10: a dashed relationship can be made solid; solid on a solid one removes the field; round-trips', () => {
  const dep = link(1, 1, 2, { relationshipType: 'dependency' })
  const assoc = link(2, 1, 2)
  const k = keys(dep, assoc)
  const out = model.setLineDash([dep, assoc], k, null)
  assert.equal(out[0].dash, 'solid')
  assert.equal('dash' in out[1], false)
  assert.deepEqual(model.connectorDashPattern(out[0]), [])
  assert.ok(model.connectorDashPattern(dep).length > 0)
  assert.equal(model.selectionDash(out, k), 'solid')
  assert.equal(model.setLineDash(out, k, null), out)
  assert.equal('dash' in model.setLineDash([out[0]], keys(dep), 'dashed')[0] && model.setLineDash([out[0]], keys(dep), 'dashed')[0].dash, 'dashed')
  const text = doc.stringifyDocument(doc.createDocument({ title: 't', template: 'blank', background: 'white', items: [out[0], box(1, 0, 0), box(2, 5, 5)] }))
  const parsed = doc.parseDocument(text).document
  assert.equal(parsed.items[0].dash, 'solid')
  const stroke = line(1, 0, 0, 5, 5, { shape: 'line', dash: 'solid' })
  const t2 = doc.parseDocument(doc.stringifyDocument(doc.createDocument({ title: 't', template: 'blank', background: 'white', items: [stroke] }))).document
  assert.equal('dash' in t2.items[0], false)
})
