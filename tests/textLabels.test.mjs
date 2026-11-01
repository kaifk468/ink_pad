import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const layout = await loadModule('textLayout.ts')
const model = await loadModule('canvasModel.ts')
const lasso = await loadModule('lassoSelection.ts')
const doc = await loadModule('documentFormat.ts')
const svgExport = await loadModule('sheetExport.ts')
const renderer = await loadModule('app/canvasRenderer.ts')
const perf = await loadModule('app/performanceFormat.ts')

const tenPerChar = (line) => line.length * 10
const label = (overrides = {}) => layout.createTextObject(5, 100, 200, 'Order Service', '#202124', 24, tenPerChar)
const rect = { kind: 'rectangle', id: 1, x: 0, y: 0, width: 50, height: 50, strokeColor: '#111', strokeWidth: 2 }

test('layout: lines, baselines and sizes', () => {
  assert.deepEqual(layout.splitTextLines('a\r\nb\rc\nd'), ['a', 'b', 'c', 'd'])
  const baselines = layout.getTextBaselines('a\nb\nc', 20)
  assert.equal(baselines.length, 3)
  assert.ok(baselines[0] > 0 && baselines[1] - baselines[0] === layout.getTextLineHeight(20))
  assert.deepEqual(layout.measureTextSize('ab\nabcd', 20, tenPerChar), { width: 40, height: 2 * 26 })
  assert.ok(layout.estimateTextSize('hello', 20).width > 0)
  assert.equal(layout.estimateTextSize('', 20).height, 26)
})

test('layout: createTextObject measures, cleans text and keeps identity on update', () => {
  const text = label()
  assert.deepEqual(text, { kind: 'text', id: 5, x: 100, y: 200, width: 130, height: 24 * 1.3, text: 'Order Service', fontSize: 24, color: '#202124' })
  const updated = layout.updateTextObject(text, 'Pay\nment', 32, tenPerChar)
  assert.equal(updated.id, 5)
  assert.equal(updated.x, 100)
  assert.equal(updated.color, '#202124')
  assert.equal(updated.fontSize, 32)
  assert.equal(updated.width, 40)
  assert.equal(layout.normalizeText('a\u0000b\r\nc'), 'ab\nc')
  assert.equal(layout.normalizeText('x'.repeat(5000)).length, layout.MAX_TEXT_LENGTH)
  assert.equal(layout.isBlankText(' \n\t '), true)
  assert.equal(layout.isBlankText(' a '), false)
})

test('model: key, bounds, move and clone treat text like a box', () => {
  const text = label()
  assert.equal(model.canvasItemKey(text), 'text:5')
  const bounds = model.getCanvasSelectionBounds([rect, text], new Set(['text:5']))
  assert.deepEqual([bounds.x, bounds.y, bounds.width], [100, 200, 130])
  assert.ok(Math.abs(bounds.height - 24 * 1.3) < 1e-9)
  const moved = model.translateSelectedItems([rect, text], new Set(['text:5']), 10, -20)
  assert.equal(moved[0], rect)
  assert.deepEqual([moved[1].x, moved[1].y, moved[1].text], [110, 180, 'Order Service'])
  assert.equal(text.x, 100, 'original is not mutated')
  const cloned = model.cloneCanvasItems([text])
  assert.deepEqual(cloned[0], text)
  assert.notEqual(cloned[0], text)
})

test('model: resizing a selection scales label position, size and font together', () => {
  const text = label()
  const resized = model.resizeSelectedItems([text], new Set(['text:5']), { x: 100, y: 200, width: 260, height: 24 * 1.3 * 2 })
  const close = (a, b) => Math.abs(a - b) < 1e-9
  assert.ok(close(resized[0].fontSize, 48))
  assert.ok(close(resized[0].width, 260))
  assert.ok(close(resized[0].height, 62.4))
  assert.equal(resized[0].x, 100)
  const unselected = model.resizeSelectedItems([text, rect], new Set(['rectangle:1']), { x: 0, y: 0, width: 100, height: 100 })
  assert.equal(unselected[0], text)
})

test('selection: tapping inside or near a label hits it; lasso selects by its center', () => {
  const text = label()
  assert.equal(lasso.itemHitTest(text, { x: 150, y: 215, pressure: 1 }), true)
  assert.equal(lasso.itemHitTest(text, { x: 95, y: 195, pressure: 1 }, 12), true)
  assert.equal(lasso.itemHitTest(text, { x: 400, y: 215, pressure: 1 }), false)
  const around = [[80, 180], [260, 180], [260, 260], [80, 260]].map(([x, y]) => ({ x, y, pressure: 1 }))
  assert.deepEqual(lasso.selectItemsByLasso([text, rect], around), ['text:5'])
  const missing = [[0, 0], [40, 0], [40, 40], [0, 40]].map(([x, y]) => ({ x, y, pressure: 1 }))
  assert.deepEqual(lasso.selectItemsByLasso([text], missing), [])
})

test('document: text survives save and load, with its own id counter', () => {
  const items = [rect, label(), { ...label(), id: 9, text: 'Second' }]
  const created = doc.createDocument({ template: 'blank', background: 'white', items })
  const parsed = doc.parseDocument(doc.stringifyDocument(created))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.droppedItems, 0)
  assert.deepEqual(parsed.document.items, items)
  assert.deepEqual(doc.getNextIds(items), { stroke: 1, rectangle: 2, connector: 1, text: 10 })
})

test('document: files written before text labels existed still open unchanged', () => {
  const legacy = JSON.stringify({ format: 'inkpad-document', version: 1, items: [rect] })
  const parsed = doc.parseDocument(legacy)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.droppedItems, 0)
  assert.deepEqual(parsed.document.items, [rect])
})

test('document: damaged text items are dropped, oversized text is cut', () => {
  const good = label()
  const bad = [
    { ...good, id: 1, color: '' },
    { ...good, id: 2, fontSize: 0 },
    { ...good, id: 3, fontSize: 9999 },
    { ...good, id: 4, width: -1 },
    { ...good, id: 6, text: 42 },
    { ...good, id: 7, x: 'a' },
    { ...good, id: 8, text: 'y'.repeat(9000) },
  ]
  const parsed = doc.parseDocument(JSON.stringify({ format: 'inkpad-document', version: 1, items: bad }))
  assert.equal(parsed.droppedItems, 6)
  assert.deepEqual(parsed.document.items.map((item) => item.id), [8])
  assert.equal(parsed.document.items[0].text.length, 2000)
})

test('svg export: one <text> per line, same baselines as the canvas, escaped', () => {
  const text = layout.createTextObject(1, 100, 200, 'A & <B>\n\nline "3"', '#3568d4', 20, tenPerChar)
  const svg = svgExport.buildSheetSvg([text], { width: 2500, height: 1500, template: 'blank', backgroundColor: '#fff' })
  const baselines = layout.getTextBaselines(text.text, 20)
  const entries = [...svg.matchAll(/<text x="100" y="([\d.]+)"[^>]*fill="#3568d4"[^>]*>([^<]*)<\/text>/g)]
  assert.equal(entries.length, 2, 'blank line produces no element')
  assert.equal(Number(entries[0][1]), Math.round((200 + baselines[0]) * 100) / 100)
  assert.equal(Number(entries[1][1]), Math.round((200 + baselines[2]) * 100) / 100)
  assert.equal(entries[0][2], 'A &amp; &lt;B&gt;')
  assert.match(entries[1][2], /line &quot;3&quot;/)
  assert.doesNotMatch(svg, /<B>/)
  assert.match(svg, /xml:space="preserve"/)
  const hostile = svgExport.buildSheetSvg([{ ...text, color: '"><script>x</script>' }], { width: 100, height: 100, template: 'blank', backgroundColor: '#fff' })
  assert.doesNotMatch(hostile, /<script/)
})

test('svg export: content bounds include labels', () => {
  const bounds = svgExport.getContentBounds([label()], { width: 2500, height: 1500 }, 10)
  assert.deepEqual(bounds, { x: 90, y: 190, width: 150, height: 52 })
})

function fakeContext() {
  const calls = []
  const ctx = new Proxy({ calls }, {
    get: (target, name) => (name in target ? target[name] : (...args) => calls.push([String(name), ...args])),
    set: (target, name, value) => { calls.push(['set', String(name), value]); return true },
  })
  return { ctx, calls }
}

test('renderer: draws each line at the shared baselines with the label color and font', () => {
  const { ctx, calls } = fakeContext()
  const text = layout.createTextObject(1, 40, 50, 'one\ntwo', '#e45b55', 30, tenPerChar)
  renderer.drawItem(ctx, text, 'smooth')
  const fills = calls.filter((call) => call[0] === 'fillText')
  const baselines = layout.getTextBaselines('one\ntwo', 30)
  assert.deepEqual(fills, [['fillText', 'one', 40, 50 + baselines[0]], ['fillText', 'two', 40, 50 + baselines[1]]])
  assert.ok(calls.some((call) => call[0] === 'set' && call[1] === 'fillStyle' && call[2] === '#e45b55'))
  assert.ok(calls.some((call) => call[0] === 'set' && call[1] === 'font' && call[2].startsWith('30px ')))
  assert.equal(calls.filter((call) => call[0] === 'save').length, calls.filter((call) => call[0] === 'restore').length)
})

test('renderer: minimap shows labels as faint blocks and restores alpha', () => {
  const { ctx, calls } = fakeContext()
  renderer.drawMinimapItems(ctx, [label()], { scale: 0.1, offsetX: 5, offsetY: 7 })
  const block = calls.find((call) => call[0] === 'fillRect')
  assert.deepEqual(block, ['fillRect', 100 * 0.1 + 5, 200 * 0.1 + 7, 130 * 0.1, 24 * 1.3 * 0.1])
  const alphas = calls.filter((call) => call[0] === 'set' && call[1] === 'globalAlpha').map((call) => call[2])
  assert.deepEqual(alphas, [0.4, 1])
})

test('diagnostics: labels are not counted as connectors', () => {
  const complexity = perf.getSceneComplexity([rect, label(), label()], 1, 1, false)
  assert.equal(complexity.items, 3)
  assert.equal(complexity.connectors, 0)
  assert.equal(complexity.rectangles, 1)
})
