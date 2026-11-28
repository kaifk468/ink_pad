import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const input = await loadModule('desktopInput.ts')
const model = await loadModule('canvasModel.ts')
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

const rect = (id, x, y, w, h, extra = {}) => ({ kind: 'rectangle', id, x, y, width: w, height: h, strokeColor: '#000', strokeWidth: 4, ...extra })
const text = (id, x, y) => ({ kind: 'text', id, x, y, width: 60, height: 20, text: 't', fontSize: 16, color: '#000' })
const connector = (id, x1, y1, x2, y2) => ({ kind: 'connector', id, start: { x: x1, y: y1, pressure: 1 }, end: { x: x2, y: y2, pressure: 1 }, strokeColor: '#000', strokeWidth: 3, color: '#000', width: 3, relationshipType: 'association' })
const pt = (x, y) => ({ x, y, pressure: 1 })
const inkBox = () => ({ top: 100, mid: 200, ink: [] })
const noKeys = new Set()
const ctx = 'p0:pen:1:0:0'

// Runs two clicks through the tracker; `between` may inject a move or another event.
const twoClicks = ({ x = 100, y = 100, x2 = x, y2 = y, gap = 200, moveBetween = null, moveDuring = null, context2 = ctx } = {}) => {
  let { pair } = input.clickPairOnDown(null, { x, y, at: 0, context: ctx })
  if (moveDuring) pair = input.clickPairOnMove(pair, moveDuring.x, moveDuring.y)
  pair = input.clickPairOnUp(pair, 50)
  if (moveBetween) pair = input.clickPairOnMove(pair, moveBetween.x, moveBetween.y)
  const second = input.clickPairOnDown(pair, { x: x2, y: y2, at: 50 + gap, context: context2 })
  return { pair: input.clickPairOnUp(second.pair, 100 + gap), continued: second.continued }
}
const decide = (over = {}) => input.labelDoubleClickDecision({
  pair: twoClicks().pair, routedItems: [], point: pt(100, 100), scale: 1, tool: 'pen', toolOpensEditor: false,
  selectedKeys: noKeys, selectedRectangleId: null, itemsChanged: false, ...over,
})

test('two plain clicks on empty canvas make a label, with every tool', () => {
  for (const tool of ['pen', 'shape', 'shapeDraw', 'connector', 'lasso', 'select', 'eraser', 'classBox']) {
    assert.deepEqual(decide({ tool }), { create: true, revert: false }, tool)
  }
})

test('the click pair must be two plain, still clicks close in time, place, tool and view', () => {
  assert.equal(twoClicks().continued, true)
  assert.equal(decide({ pair: twoClicks({ x2: 103 }).pair }).create, true)
  assert.equal(decide({ pair: twoClicks({ x2: 110 }).pair }).create, false)
  assert.equal(twoClicks({ x2: 110 }).continued, false)
  assert.equal(decide({ pair: twoClicks({ gap: 5000 }).pair }).create, false)
  assert.equal(decide({ pair: twoClicks({ context2: 'p0:eraser:1:0:0' }).pair }).create, false)
  assert.equal(decide({ pair: twoClicks({ context2: 'p0:pen:2:0:0' }).pair }).create, false)
  assert.equal(decide({ pair: twoClicks({ context2: 'p1:pen:1:0:0' }).pair }).create, false)
  // a drag during either click (a stroke, marquee, move, resize) is not a click
  assert.equal(decide({ pair: twoClicks({ moveDuring: { x: 120, y: 100 } }).pair }).create, false)
  assert.equal(decide({ pair: twoClicks({ moveDuring: { x: 102, y: 101 } }).pair }).create, true)
  assert.equal(input.clickPairOnMove(input.clickPairOnDown(null, { x: 0, y: 0, at: 0, context: ctx }).pair, 50, 0).moved, true)
  // moving between the clicks (button up) is only checked by the position of the second press
  assert.equal(decide({ pair: twoClicks({ moveBetween: { x: 500, y: 500 } }).pair }).create, true)
  // a missing or half-finished pair never makes a label
  assert.equal(decide({ pair: null }).create, false)
  const first = input.clickPairOnDown(null, { x: 0, y: 0, at: 0, context: ctx }).pair
  assert.equal(decide({ pair: first }).create, false)
  assert.equal(decide({ pair: input.clickPairOnUp(first, 10) }).create, false)
  assert.equal(decide({ pair: input.clickPairOnDown(input.clickPairOnUp(first, 10), { x: 0, y: 0, at: 20, context: ctx }).pair }).create, false)
})

test('a third press after a finished pair starts a fresh pair, never a second label', () => {
  const done = twoClicks().pair
  const third = input.clickPairOnDown(done, { x: 100, y: 100, at: 300, context: ctx })
  assert.equal(third.continued, false)
  assert.equal(third.pair.phase, 'down1')
})

test('the Text tool and the class box dialog already open an editor on the first click: no extra label', () => {
  assert.equal(decide({ tool: 'text', toolOpensEditor: true }).create, false)
  assert.equal(decide({ tool: 'classBox', toolOpensEditor: true }).create, false)
})

test('items the clicks made (dot stroke, tiny shape) are reverted; an erase that removed something keeps the erase', () => {
  assert.deepEqual(decide({ itemsChanged: true }), { create: true, revert: true })
  assert.deepEqual(decide({ tool: 'shapeDraw', itemsChanged: true }), { create: true, revert: true })
  assert.deepEqual(decide({ tool: 'eraser', itemsChanged: true }), { create: false })
  assert.deepEqual(decide({ tool: 'eraser', itemsChanged: false }), { create: true, revert: false })
})

test('clickItemsUnchanged compares items one by one', () => {
  const a = { kind: 'stroke', id: 1 }
  const b = { kind: 'stroke', id: 2 }
  assert.equal(input.clickItemsUnchanged([a, b], [a, b]), true)
  assert.equal(input.clickItemsUnchanged([a], [a, b]), false)
  assert.equal(input.clickItemsUnchanged([a, b], [b, a]), false)
  assert.equal(input.clickItemsUnchanged([a], [{ ...a }]), false)
})

test('empty means no hit target: text, connectors, typed class boxes and box edges are not empty', () => {
  const items = [rect(1, 0, 0, 400, 300), text(2, 500, 0), connector(3, 0, 500, 200, 500), rect(4, 700, 0, 100, 60, { classBox: { name: 'x', attributes: '', methods: '' } })]
  assert.equal(input.emptyForLabel(items, pt(900, 900), 1, 'pen', noKeys, null), true)
  assert.equal(input.emptyForLabel(items, pt(510, 10), 1, 'pen', noKeys, null), false)
  assert.equal(input.emptyForLabel(items, pt(100, 501), 1, 'pen', noKeys, null), false)
  assert.equal(input.emptyForLabel(items, pt(750, 30), 1, 'pen', noKeys, null), false)
  assert.equal(input.emptyForLabel(items, pt(200, 2), 1, 'pen', noKeys, null), false)
})

test('the inside of a plain box, ink box or HLD shape is empty (left to the tool), except with the select tool', () => {
  const plain = rect(1, 0, 0, 400, 300)
  const ink = rect(2, 600, 0, 400, 300, { inkBox: inkBox() })
  const hld = rect(3, 1200, 0, 400, 300, { hldShape: 'service' })
  const diamond = rect(4, 1800, 0, 400, 300, { diamond: true })
  const items = [plain, ink, hld, diamond]
  for (const x of [200, 800, 1400, 2000]) {
    assert.equal(input.emptyForLabel(items, pt(x, 150), 1, 'pen', noKeys, null), true, `inside ${x}`)
    assert.equal(input.emptyForLabel(items, pt(x, 150), 1, 'shapeDraw', noKeys, null), true)
    assert.equal(input.emptyForLabel(items, pt(x, 150), 1, 'select', noKeys, null), false, `select ${x}`)
  }
  for (const x of [3, 603, 1203]) assert.equal(input.emptyForLabel(items, pt(x, 150), 1, 'pen', noKeys, null), false, `edge ${x}`)
  // zoomed out, the edge band is wider in canvas units
  assert.equal(input.emptyForLabel(items, pt(40, 150), 0.25, 'pen', noKeys, null), false)
  assert.equal(input.emptyForLabel(items, pt(40, 150), 1, 'pen', noKeys, null), true)
})

test('a selected box keeps its handle band and ink dividers; a lasso or select selection keeps its bounds', () => {
  const ink = rect(2, 600, 0, 400, 300, { inkBox: inkBox() })
  assert.equal(input.emptyForLabel([ink], pt(800, 150), 1, 'pen', noKeys, 2), true)
  assert.equal(input.emptyForLabel([ink], pt(620, 150), 1, 'pen', noKeys, 2), false)
  assert.equal(input.emptyForLabel([ink], pt(800, 100), 1, 'pen', noKeys, 2), false)
  const t = text(5, 100, 100)
  assert.equal(input.emptyForLabel([t], pt(110, 108), 1, 'lasso', new Set(['text:5']), null), false)
  assert.equal(input.emptyForLabel([t], pt(900, 900), 1, 'lasso', new Set(['text:5']), null), true)
  assert.equal(input.emptyForLabel([t], pt(900, 900), 1, 'select', new Set(['text:5']), null), true)
})

test('history capture and restore put back both stacks, so the two clicks leave no undo step and no lost redo', () => {
  const history = new model.CanvasSnapshotHistory()
  const a = { kind: 'stroke', id: 1, points: [], color: '#000', width: 1, erase: false }
  history.record([])
  history.record([a])
  history.undo([a, a]) // one undo step and one redo step
  assert.equal(history.canUndo, true)
  assert.equal(history.canRedo, true)
  const saved = history.capture()
  history.record([a]) // the first click's step, which also clears redo
  history.record([a, a])
  assert.equal(history.canRedo, false)
  history.restore(saved)
  assert.equal(history.canRedo, true)
  assert.deepEqual(history.undo([a]), [])
  assert.deepEqual(history.capture().undo.length, 0)
  // restoring does not alias the saved state
  history.restore(saved)
  history.record([a])
  assert.equal(saved.undo.length, 1)
})

test('wiring: the label double-click is Desktop-mouse only, shares the Text tool creation path and resets on other input', () => {
  const handler = app.slice(app.indexOf('const onCanvasDoubleClick'), app.indexOf('const closeContextMenu'))
  assert.match(handler, /inputModeRef\.current !== 'desktop' \|\| lastPointerTypeRef\.current !== 'mouse'/)
  assert.match(handler, /openNewTextEditorAt\(point, \{ pointerType: 'mouse', altKey: event\.altKey \}\)/)
  assert.match(handler, /historyRef\.current\.restore\(before\.history\)/)
  assert.ok(handler.indexOf('openEditTarget(target)') < handler.indexOf('labelDoubleClickDecision'), 'an existing label or class box is edited first')
  assert.match(app, /else openNewTextEditorAt\(tap\.point, event\)/)
  const down = app.slice(app.indexOf('const onPointerDown = (event: React.PointerEvent'), app.indexOf('const onPointerMove = (event: React.PointerEvent'))
  assert.match(down, /clickPairRef\.current = null/)
  assert.match(down, /event\.pointerType === 'mouse' && inputModeRef\.current === 'desktop' && event\.button === 0 && !event\.shiftKey/)
  assert.match(app, /const onPointerEnd[^\n]*\n\s*clickPairRef\.current = clickPairOnEnd\(clickPairRef\.current, event\.type\)/)
  assert.match(app, /const onWheel[\s\S]{0,400}clickPairRef\.current = null/)
  assert.match(app, /const onKeyDown = \(event: KeyboardEvent\) => \{\n\s*clickPairRef\.current = null/)
})

test('leaving Desktop mode resets a small desktop-only text size to the default', () => {
  assert.match(app, /if \(inputMode !== 'desktop'\) setTextSize\(\(size\) => \(TEXT_FONT_SIZES\.includes\(size\) \? size : DEFAULT_TEXT_FONT_SIZE\)\)/)
})

test('lostpointercapture after pointerup keeps the click pair; a cancel or a capture lost mid-press ends it', () => {
  let { pair } = input.clickPairOnDown(null, { x: 100, y: 100, at: 0, context: ctx })
  assert.equal(input.clickPairOnEnd(pair, 'lostpointercapture'), null)
  pair = input.clickPairOnUp(pair, 50)
  assert.equal(input.clickPairOnEnd(pair, 'lostpointercapture'), pair)
  assert.equal(input.clickPairOnEnd(pair, 'pointercancel'), null)
  // The whole browser sequence: down, up, lostpointercapture, down, up, lostpointercapture, dblclick.
  pair = input.clickPairOnEnd(pair, 'lostpointercapture')
  const second = input.clickPairOnDown(pair, { x: 101, y: 100, at: 200, context: ctx })
  assert.equal(second.continued, true)
  const done = input.clickPairOnEnd(input.clickPairOnUp(second.pair, 250), 'lostpointercapture')
  assert.equal(done.phase, 'up2')
  assert.deepEqual(decide({ pair: done }), { create: true, revert: false })
  assert.equal(input.clickPairOnEnd(null, 'lostpointercapture'), null)
})

test('App: pointer end keeps the click pair through lostpointercapture', () => {
  assert.match(app, /clickPairRef\.current = clickPairOnEnd\(clickPairRef\.current, event\.type\)/)
})
