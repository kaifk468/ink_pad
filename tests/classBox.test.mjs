import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const box = await loadModule('classBoxLayout.ts')
const model = await loadModule('canvasModel.ts')
const doc = await loadModule('documentFormat.ts')
const svgExport = await loadModule('sheetExport.ts')
const renderer = await loadModule('app/canvasRenderer.ts')
const lasso = await loadModule('lassoSelection.ts')

const tenWide = (line) => line.length * 10
const measure = (line) => tenWide(line)
const order = { name: 'Order', attributes: '- id: int\n- total: float', methods: '+ addItem()\n+ pay()' }
const p = (x, y) => ({ x, y, pressure: 1 })

test('geometry: compartments stack name, attributes, methods and fit their text', () => {
  const g = box.getClassBoxGeometry({ x: 100, y: 50, width: 240, height: 200 }, order)
  const nameLh = 22 * 1.3, bodyLh = 18 * 1.3, pad = 9
  assert.ok(Math.abs(g.nameHeight - (nameLh + 2 * pad)) < 1e-9)
  assert.ok(Math.abs(g.attributesHeight - (2 * bodyLh + 2 * pad)) < 1e-9)
  assert.ok(Math.abs(g.methodsMinHeight - (2 * bodyLh + 2 * pad)) < 1e-9)
  assert.ok(Math.abs(g.dividerY[0] - (50 + g.nameHeight)) < 1e-9)
  assert.ok(Math.abs(g.dividerY[1] - (g.dividerY[0] + g.attributesHeight)) < 1e-9)
  assert.equal(g.minHeight, Math.ceil(g.nameHeight + g.attributesHeight + g.methodsMinHeight))
  assert.equal(g.name.align, 'center')
  assert.equal(g.name.anchorX, 220)
  assert.equal(g.attributes.anchorX, 114)
  // every baseline sits inside its own compartment
  assert.ok(g.name.baselines[0] > 50 && g.name.baselines[0] < g.dividerY[0])
  assert.ok(g.attributes.baselines.every((y) => y > g.dividerY[0] && y < g.dividerY[1]))
  assert.ok(g.methods.baselines.every((y) => y > g.dividerY[1]))
})

test('geometry: empty compartments keep one line of height; width follows the widest line', () => {
  const empty = box.getClassBoxGeometry({ x: 0, y: 0, width: 0, height: 0 }, box.EMPTY_CLASS_BOX)
  assert.ok(empty.attributesHeight > 0 && empty.methodsMinHeight > 0)
  assert.equal(empty.minWidth, box.CLASS_BOX_MIN_WIDTH)
  const wide = box.getClassBoxGeometry({ x: 0, y: 0, width: 0, height: 0 }, { name: 'N', attributes: 'x'.repeat(40), methods: '' }, measure)
  assert.equal(wide.minWidth, 40 * 10 + 28)
  const stereotype = box.getClassBoxGeometry({ x: 0, y: 0, width: 0, height: 0 }, { name: '<<interface>>\nPayment', attributes: '', methods: '' })
  assert.equal(stereotype.name.lines.length, 2)
})

test('createClassBox: centered on the tap, sized to content, content cleaned', () => {
  const created = box.createClassBox(7, 500, 300, { ...order, name: 'Order\u0000' }, '#202124', 3, measure)
  assert.equal(created.kind, 'rectangle')
  assert.equal(created.id, 7)
  assert.equal(created.classBox.name, 'Order')
  assert.ok(Math.abs(created.x + created.width / 2 - 500) < 1e-9)
  assert.ok(Math.abs(created.y + created.height / 2 - 300) < 1e-9)
  const g = box.getClassBoxGeometry(created, created.classBox, measure)
  assert.equal(created.width, g.minWidth)
  assert.equal(created.height, g.minHeight)
})

test('fit: growing keeps position, never shrinks, and attached connectors follow', () => {
  const created = box.createClassBox(1, 300, 200, { name: 'A', attributes: '', methods: '' }, '#111', 3, measure)
  const bigger = { name: 'A', attributes: 'a very long attribute name here', methods: 'one\ntwo\nthree' }
  const bounds = box.fitClassBoxBounds(created, bigger, measure)
  assert.equal(bounds.x, created.x)
  assert.equal(bounds.y, created.y)
  assert.ok(bounds.width > created.width && bounds.height > created.height)
  const user = { ...created, width: 600, height: 500 }
  const kept = box.fitClassBoxBounds(user, { name: 'A', attributes: '', methods: '' }, measure)
  assert.equal(kept.width, 600)
  assert.equal(kept.height, 500)
  const connector = model.createConnector(1, p(created.x + created.width, created.y + 20), p(900, 220), '#111', 3, { rectangleId: 1, offsetX: created.width, offsetY: 20 })
  const resized = model.resizeRectangleItems([created, connector], 1, bounds)
  assert.ok(Math.abs(resized[1].start.x - (bounds.x + resized[1].startAttachment.offsetX)) < 1e-9)
  assert.ok(Math.abs(resized[1].start.x - (bounds.x + bounds.width)) < 1e-9, 'right-edge anchor stays on the right edge')
})

test('model: class boxes move, resize, clone and hit-test like rectangles', () => {
  const created = box.createClassBox(1, 300, 200, order, '#111', 3, measure)
  const moved = model.translateSelectedItems([created], new Set(['rectangle:1']), 15, 25)
  assert.equal(moved[0].x, created.x + 15)
  assert.deepEqual(moved[0].classBox, order)
  const resized = model.resizeSelectedItems([created], new Set(['rectangle:1']), { x: 0, y: 0, width: created.width * 2, height: created.height })
  assert.deepEqual(resized[0].classBox, order)
  const cloned = model.cloneCanvasItems([created])
  cloned[0].classBox.name = 'Changed'
  assert.equal(created.classBox.name, 'Order', 'clone does not share content')
  assert.equal(lasso.itemHitTest(created, p(created.x + 10, created.y + 10)), true)
  const snap = model.snapConnectorEndpoint(p(created.x - 5, created.y + created.height / 2), [created])
  assert.equal(snap.attachment.rectangleId, 1)
})

test('content helpers', () => {
  assert.equal(box.isEmptyClassBox({ name: ' ', attributes: '\n', methods: '' }), true)
  assert.equal(box.isEmptyClassBox({ name: '', attributes: 'x', methods: '' }), false)
  assert.equal(box.sameClassBoxContent(order, { ...order }), true)
  assert.equal(box.sameClassBoxContent(order, undefined), false)
  assert.equal(box.sameClassBoxContent(undefined, undefined), true)
})

test('document: class box content round-trips; plain rectangles and old files are unchanged', () => {
  const created = box.createClassBox(3, 300, 200, order, '#111', 3, measure)
  const plain = { kind: 'rectangle', id: 4, x: 0, y: 0, width: 50, height: 50, strokeColor: '#111', strokeWidth: 2 }
  const saved = doc.createDocument({ template: 'blank', background: 'white', items: [created, plain] })
  const parsed = doc.parseDocument(doc.stringifyDocument(saved))
  assert.deepEqual(parsed.document.items, [created, plain])
  assert.equal('classBox' in parsed.document.items[1], false)
  const copy = doc.createDocument({ template: 'blank', background: 'white', items: [created] })
  created.classBox.name = 'Mutated'
  assert.equal(copy.items[0].classBox.name, 'Order', 'saved document does not alias live content')
})

test('document: malformed class box content keeps the rectangle and drops only the content', () => {
  const rect = { kind: 'rectangle', id: 1, x: 0, y: 0, width: 50, height: 50, strokeColor: '#111', strokeWidth: 2 }
  const items = [{ ...rect, classBox: { name: 1, attributes: '', methods: '' } }, { ...rect, id: 2, classBox: 'oops' }, { ...rect, id: 3, classBox: { name: 'x'.repeat(9000), attributes: 'a', methods: 'b' } }]
  const parsed = doc.parseDocument(JSON.stringify({ format: 'inkpad-document', version: 1, items }))
  assert.equal(parsed.droppedItems, 0)
  assert.equal('classBox' in parsed.document.items[0], false)
  assert.equal('classBox' in parsed.document.items[1], false)
  assert.equal(parsed.document.items[2].classBox.name.length, 2000)
})

test('svg export: class box has fill, clipped text, centered bold name and divider lines', () => {
  const created = { ...box.createClassBox(1, 300, 200, { name: 'A & B', attributes: '- <x>: int', methods: '' }, '#202124', 3, measure) }
  const svg = svgExport.buildSheetSvg([created], { width: 2500, height: 1500, template: 'blank', backgroundColor: '#fff' })
  assert.match(svg, /<rect [^>]*fill="#ffffff"\/><svg [^>]*overflow="hidden">/)
  assert.match(svg, /font-weight="700" text-anchor="middle"[^>]*>A &amp; B<\/text>/)
  assert.match(svg, /text-anchor="start"[^>]*>- &lt;x&gt;: int<\/text>/)
  assert.equal((svg.match(/H[\d.]+/g) || []).length, 2, 'two dividers')
  assert.match(svg, /<rect [^>]*fill="none" stroke="#202124"/, 'outline still drawn')
  assert.doesNotMatch(svg, /<x>/)
  const plain = svgExport.buildSheetSvg([{ kind: 'rectangle', id: 1, x: 0, y: 0, width: 50, height: 50, strokeColor: '#111', strokeWidth: 2 }], { width: 100, height: 100, template: 'blank', backgroundColor: '#fff' })
  assert.doesNotMatch(plain, /<text|<svg x=/)
})

function fakeContext() {
  const calls = []
  const ctx = new Proxy({ calls }, {
    get: (target, name) => (name in target ? target[name] : (...args) => calls.push([String(name), ...args])),
    set: (target, name, value) => { calls.push(['set', String(name), value]); return true },
  })
  return { ctx, calls }
}

test('renderer: class box draws fill, clipped centered name, left-aligned body, dividers and outline', () => {
  const created = box.createClassBox(1, 300, 200, order, '#202124', 3, measure)
  const { ctx, calls } = fakeContext()
  renderer.drawRectangle(ctx, created)
  const g = box.getClassBoxGeometry(created, created.classBox)
  const fills = calls.filter((c) => c[0] === 'fillText')
  assert.deepEqual(fills.map((c) => c[1]), ['Order', '- id: int', '- total: float', '+ addItem()', '+ pay()'])
  assert.equal(fills[0][2], g.name.anchorX)
  assert.equal(fills[1][2], g.attributes.anchorX)
  assert.ok(calls.some((c) => c[0] === 'clip'))
  const aligns = calls.filter((c) => c[0] === 'set' && c[1] === 'textAlign').map((c) => c[2])
  assert.deepEqual(aligns, ['center', 'left', 'left'])
  assert.ok(calls.some((c) => c[0] === 'set' && c[1] === 'font' && c[2].startsWith('700 22px')))
  assert.equal(calls.filter((c) => c[0] === 'strokeRect').length, 1)
  assert.equal(calls.filter((c) => c[0] === 'lineTo').length, 2)
  assert.equal(calls.filter((c) => c[0] === 'save').length, calls.filter((c) => c[0] === 'restore').length)
})

test('renderer: plain rectangles are unchanged (no text, no fill)', () => {
  const { ctx, calls } = fakeContext()
  renderer.drawRectangle(ctx, { kind: 'rectangle', id: 1, x: 0, y: 0, width: 50, height: 50, strokeColor: '#111', strokeWidth: 2 })
  assert.deepEqual(calls.filter((c) => c[0] === 'fillText' || c[0] === 'fillRect'), [])
  assert.equal(calls.filter((c) => c[0] === 'strokeRect').length, 1)
})
