import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const m = await loadModule('canvasModel.ts')
const doc = await loadModule('documentFormat.ts')
const lasso = await loadModule('lassoSelection.ts')
const clip = await loadModule('clipboard.ts')
const exp = await loadModule('sheetExport.ts')
const rendererSrc = await readFile(new URL('../src/app/canvasRenderer.ts', import.meta.url), 'utf8')
const exportSrc = await readFile(new URL('../src/sheetExport.ts', import.meta.url), 'utf8')

const p = (x, y) => ({ x, y, pressure: 0.5 })
const text = (id, x, y, w = 100, h = 20, extra = {}) => ({ kind: 'text', id, x, y, width: w, height: h, text: 'hi', fontSize: 16, color: '#000', ...extra })
const rect = (id, extra = {}) => ({ kind: 'rectangle', id, x: 100, y: 100, width: 100, height: 60, strokeColor: '#111', strokeWidth: 2, ...extra })
const conn = (id, extra = {}) => ({ kind: 'connector', id, start: p(0, 0), end: p(100, 0), strokeColor: '#111', strokeWidth: 2, relationshipType: 'association', reversed: false, ...extra })
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`)
const roundTrip = (items) => {
  const created = doc.createDocument({ title: 't', template: 'blank', background: 'white', items }, '2026-01-01T00:00:00.000Z')
  const parsed = doc.parseDocument(doc.stringifyDocument(created))
  assert.equal(parsed.ok, true)
  return parsed
}
const pages = (parsed) => parsed.document.items ?? parsed.document.pages.flatMap((page) => page.items)

test('angle survives a document round trip for text and plain rectangles', () => {
  const items = pages(roundTrip([text(1, 0, 0, 100, 20, { angle: 0.5 }), rect(2, { angle: -1.2, ellipse: true })]))
  assert.equal(items[0].angle, 0.5)
  assert.equal(items[1].angle, -1.2)
})

test('invalid or foreign angles are dropped and the rest is normalised', () => {
  const raw = (item) => pages(roundTrip([item]))[0]
  assert.equal('angle' in raw(text(1, 0, 0, 100, 20, { angle: 'x' })), false)
  assert.equal('angle' in raw(text(1, 0, 0, 100, 20, { angle: null })), false)
  assert.equal('angle' in raw(text(1, 0, 0, 100, 20, { angle: 1e-9 })), false)
  assert.equal('angle' in raw(rect(1, { angle: 0 })), false)
  near(raw(text(1, 0, 0, 100, 20, { angle: Math.PI * 2 + 0.25 })).angle, 0.25)
  const classBox = rect(3, { angle: 1, classBox: { name: 'A', attributes: '', methods: '' } })
  assert.equal('angle' in raw(classBox), false)
  const inkBox = rect(4, { angle: 1, inkBox: { top: 120, mid: 140, ink: [] }, hldShape: 'database' })
  assert.equal('angle' in raw(inkBox), false)
  // a non-finite value hand written into a file
  const created = doc.createDocument({ title: 't', template: 'blank', background: 'white', items: [text(1, 0, 0)] })
  const json = JSON.parse(doc.stringifyDocument(created))
  const list = json.items ?? json.pages[0].items
  list[0].angle = 'NaN'
  assert.equal('angle' in pages(doc.parseDocument(JSON.stringify(json)))[0], false)
})

test('old files gain no angle key', () => {
  const items = pages(roundTrip([text(1, 0, 0), rect(2)]))
  for (const item of items) assert.equal('angle' in item, false)
  assert.equal(roundTrip([text(1, 0, 0)]).document.version, 1)
})

test('isRotatable matrix', () => {
  assert.equal(m.isRotatable(text(1, 0, 0)), true)
  assert.equal(m.isRotatable(rect(1)), true)
  assert.equal(m.isRotatable(rect(1, { ellipse: true })), true)
  assert.equal(m.isRotatable(rect(1, { diamond: true })), true)
  assert.equal(m.isRotatable(rect(1, { classBox: { name: '', attributes: '', methods: '' } })), false)
  assert.equal(m.isRotatable(rect(1, { inkBox: { top: 1, mid: 2, ink: [] } })), false)
  assert.equal(m.isRotatable(rect(1, { hldShape: 'queue' })), false)
  assert.equal(m.isRotatable(conn(1)), false)
  assert.equal(m.isRotatable({ kind: 'stroke', id: 1, points: [p(0, 0)], color: '#000', width: 2, erase: false }), false)
  assert.equal(m.itemAngle(rect(1, { classBox: { name: '', attributes: '', methods: '' }, angle: 1 })), 0)
})

test('rotatePoint is clockwise and toItemFrame inverts it', () => {
  const r = m.rotatePoint(p(10, 0), 0, 0, Math.PI / 2)
  near(r.x, 0)
  near(r.y, 10)
  const item = text(1, 0, 0, 100, 20, { angle: 0.7 })
  const world = m.rotatePoint(p(80, 5), 50, 10, 0.7)
  const local = m.toItemFrame(item, world)
  near(local.x, 80)
  near(local.y, 5)
  const flat = text(1, 0, 0)
  const pt = p(3, 4)
  assert.equal(m.toItemFrame(flat, pt), pt)
  near(m.normalizeAngle(3 * Math.PI), Math.PI)
  near(m.normalizeAngle(-Math.PI), Math.PI)
})

test('rotatedItemBounds', () => {
  const t = text(1, 0, 0, 100, 20, { angle: Math.PI / 2 })
  const b = m.rotatedItemBounds(t)
  near(b.width, 20)
  near(b.height, 100)
  near(b.x + b.width / 2, 50)
  near(b.y + b.height / 2, 10)
  assert.deepEqual(m.rotatedItemBounds(text(1, 5, 6, 7, 8)), { x: 5, y: 6, width: 7, height: 8 })
  const sel = m.getCanvasSelectionBounds([t], new Set(['text:1']))
  near(sel.width, 20)
  near(sel.height, 100)
})

test('translate keeps the angle', () => {
  const [t] = m.translateSelectedItems([text(1, 0, 0, 100, 20, { angle: 0.4 })], new Set(['text:1']), 10, 10)
  assert.equal(t.angle, 0.4)
  assert.equal(t.x, 10)
})

test('hit test of a rotated text uses its rotated shape', () => {
  const t = text(1, 0, 0, 100, 20, { angle: Math.PI / 2 }) // now stands upright about (50, 10)
  assert.equal(lasso.itemHitTest(t, p(50, 55), 0), true)
  assert.equal(lasso.itemHitTest(t, p(5, 10), 0), false)
  assert.equal(lasso.itemHitTest(text(1, 0, 0), p(5, 10), 0), true)
})

test('setItemAngle sets, normalises, removes at zero and detaches connectors', () => {
  const items = [rect(2), text(3, 0, 0), conn(1, { startAttachment: { rectangleId: 2, offsetX: 0, offsetY: 30 }, endAttachment: { rectangleId: 9, offsetX: 0, offsetY: 0 } })]
  const rotated = m.setItemAngle(items, 'rectangle:2', Math.PI / 4)
  assert.equal(rotated[0].angle, Math.PI / 4)
  assert.equal(rotated[2].startAttachment, undefined)
  assert.ok(rotated[2].endAttachment)
  assert.deepEqual(rotated[2].start, items[2].start)
  const back = m.setItemAngle(rotated, 'rectangle:2', 1e-9)
  assert.equal('angle' in back[0], false)
  assert.equal(back[2].startAttachment, undefined)
  assert.equal(m.setItemAngle(items, 'rectangle:2', 0), items)
  assert.equal(m.setItemAngle(items, 'connector:1', 1), items)
  assert.equal(m.setItemAngle(items, 'text:99', 1), items)
  near(m.setItemAngle(items, 'text:3', 7)[1].angle, 7 - 2 * Math.PI)
  const attached = [rect(2, { angle: 1 }), text(3, 0, 0)]
  assert.equal(m.setItemAngle(attached, 'rectangle:2', 1), attached)
})

test('snapAngle', () => {
  near(m.snapAngle((14 * Math.PI) / 180), Math.PI / 12)
  near(m.snapAngle((6 * Math.PI) / 180), 0)
  near(m.snapAngle((43 * Math.PI) / 180, 45), Math.PI / 4)
  near(m.snapAngle(Math.PI * 2 + 0.01), 0)
})

test('rotate handle, hit and angleFromCenter', () => {
  const t = text(1, 0, 0, 100, 20)
  const h = m.rotateHandle(t, 2)
  near(h.point.x, 50)
  near(h.point.y, -12)
  near(h.anchor.y, 0)
  const turned = m.rotateHandle({ ...t, angle: Math.PI / 2 }, 1)
  near(turned.point.x, 50 + 10 + 24)
  near(turned.point.y, 10)
  assert.equal(m.rotateHandle(conn(1), 1), null)
  assert.equal(m.hitRotateHandle(t, p(50, -12), 2), true)
  assert.equal(m.hitRotateHandle(t, p(50, -12 - 7), 2), false)
  assert.equal(m.hitRotateHandle(conn(1), p(0, 0), 1), false)
  near(m.angleFromCenter(t, p(50, -100)), 0)
  assert.ok(m.angleFromCenter(t, p(200, 10)) > 0)
  near(m.angleFromCenter(t, p(200, 10)), Math.PI / 2)
  near(m.angleFromCenter(t, p(-100, 10)), -Math.PI / 2)
})

test('nearestConnectorAngle', () => {
  assert.equal(m.nearestConnectorAngle([], p(0, 0)), null)
  near(m.nearestConnectorAngle([conn(1)], p(50, 20)), 0)
  const down = conn(2, { start: p(0, 0), end: p(100, 100) })
  near(m.nearestConnectorAngle([down], p(50, 40)), Math.PI / 4)
  // drawn right-to-left must not read upside down
  const reversed = conn(3, { start: p(100, 0), end: p(0, 0) })
  near(m.nearestConnectorAngle([reversed], p(50, 10)), 0)
  const leftUp = conn(4, { start: p(100, 100), end: p(0, 0) })
  near(m.nearestConnectorAngle([leftUp], p(50, 60)), Math.PI / 4)
  const vertical = conn(5, { start: p(0, 0), end: p(0, 100) })
  near(m.nearestConnectorAngle([vertical], p(5, 50)), Math.PI / 2)
  const upward = conn(6, { start: p(0, 100), end: p(0, 0) })
  near(m.nearestConnectorAngle([upward], p(5, 50)), Math.PI / 2)
  const elbow = conn(7, { routing: 'elbow', routedPath: [p(0, 0), p(100, 0), p(100, 100)] })
  near(m.nearestConnectorAngle([elbow], p(110, 50)), Math.PI / 2)
  near(m.nearestConnectorAngle([elbow], p(50, -10)), 0)
  assert.equal(m.nearestConnectorAngle([conn(1)], p(50, 400)), null)
  assert.notEqual(m.nearestConnectorAngle([conn(1)], p(50, 400), 500), null)
  assert.equal(m.nearestConnectorAngle([conn(8, { start: p(5, 5), end: p(5, 5) })], p(5, 5)), null)
})

test('snapConnectorEndpoint skips rotated rectangles', () => {
  const flat = [rect(1)]
  assert.ok(m.snapConnectorEndpoint(p(100, 130), flat))
  assert.equal(m.snapConnectorEndpoint(p(100, 130), [rect(1, { angle: 0.5 })]), null)
  assert.equal(m.snapConnectorEndpoint(p(150, 130), [rect(1, { angle: 0.5 })], 36, true), null)
})

test('clipboard copy and paste keep the angle', () => {
  const items = [text(1, 0, 0, 100, 20, { angle: 0.3 }), rect(2, { angle: -0.6 })]
  const copied = clip.copyItems(items, new Set(['text:1', 'rectangle:2']))
  assert.equal(copied[0].angle, 0.3)
  const pasted = clip.pasteItems(copied, { stroke: 1, rectangle: 5, connector: 1, text: 5 }, 24, { x: -2000, y: -2000, width: 8000, height: 8000 })
  assert.equal(pasted.items[0].angle, 0.3)
  assert.equal(pasted.items[1].angle, -0.6)
})

test('renderer and export draw rotation only when an angle is set', () => {
  assert.match(rendererSrc, /itemAngle\(rectangle\)/)
  assert.match(rendererSrc, /itemAngle\(text\)/)
  assert.match(rendererSrc, /ctx\.rotate\(angle\)/)
  assert.match(rendererSrc, /rotatedItemBounds\(item\)/)
  assert.match(exportSrc, /transform="rotate\(/)
})

test('svg export rotates text and shapes about the centre and leaves unrotated items alone', () => {
  const opts = { width: 500, height: 500, template: 'blank', backgroundColor: '#ffffff' }
  const svg = exp.buildSheetSvg([text(1, 0, 0, 100, 20, { angle: Math.PI / 2 }), rect(2, { angle: Math.PI / 4, ellipse: true })], opts)
  assert.match(svg, /transform="rotate\(90 50 10\)"/)
  assert.match(svg, /transform="rotate\(45 150 130\)"/)
  assert.doesNotMatch(exp.buildSheetSvg([text(1, 0, 0), rect(2)], opts), /rotate\(/)
})
