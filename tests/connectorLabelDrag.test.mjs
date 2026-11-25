import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const lab = await loadModule('connectorLabel.ts')
const geo = await loadModule('pathGeometry.ts')
const doc = await loadModule('documentFormat.ts')
const clip = await loadModule('clipboard.ts')
const exporter = await loadModule('sheetExport.ts')
const handles = await loadModule('connectorHandles.ts')
const app = await readAppSource()

const p = (x, y) => ({ x, y, pressure: 1 })
const conn = (extra = {}) => ({ kind: 'connector', id: 1, start: p(0, 100), end: p(200, 100), strokeColor: '#c00000', strokeWidth: 3, relationshipType: 'association', reversed: false, ...extra })
const measure = (line) => line.length * 10
const file = (items) => JSON.stringify({ format: 'inkpad-document', version: 1, title: 't', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', sheet: { width: 1000, height: 800 }, items })
const rt = (extra, label = 'x') => doc.stringifyDocument(doc.parseDocument(file([conn({ ...(label ? { label } : {}), ...extra })])).document)
const loaded = (extra) => doc.parseDocument(rt(extra)).document.items[0]

test('path helpers: fraction of nearest point and point at fraction', () => {
  const path = [p(0, 0), p(100, 0), p(100, 100)]
  assert.equal(geo.pathFractionNearest(path, p(50, 20)), 0.25)
  assert.equal(geo.pathFractionNearest(path, p(120, 50)), 0.75)
  assert.equal(geo.pathFractionNearest(path, p(-30, 0)), 0)
  assert.equal(geo.pathFractionNearest([p(5, 5)], p(1, 1)), 0)
  const at = geo.pointAtPathFraction(path, 0.75)
  assert.deepEqual({ x: at.x, y: at.y }, { x: 100, y: 50 })
  assert.equal(geo.pointAtPathFraction(path, 5).y, 100)
})

test('layout: labelPosition moves the centre, box and hit area; default stays the middle', () => {
  const moved = conn({ label: 'REST', labelPosition: 0.25 })
  const at = lab.connectorLabelLayout(moved, measure)
  assert.deepEqual({ x: at.centre.x, y: at.centre.y }, { x: 50, y: 100 })
  assert.equal(at.box.x + at.box.width / 2, 50)
  assert.equal(lab.pointOnConnectorLabel(moved, p(50, 100), measure), true)
  assert.equal(lab.pointOnConnectorLabel(moved, p(100, 100), measure), false)
  assert.equal(lab.connectorLabelLayout(conn({ label: 'REST' }), measure).centre.x, 100)
})

test('layout: elbow follows its routed path by fraction', () => {
  const routed = conn({ label: 'x', end: p(200, 0), routing: 'elbow', labelPosition: 0.9, routedPath: [p(0, 100), p(100, 100), p(100, 0), p(200, 0)] })
  const centre = lab.connectorLabelLayout(routed, measure).centre
  assert.deepEqual({ x: centre.x, y: centre.y }, { x: 170, y: 0 })
})

test('clean: clamps 0.05..0.95, middle and invalid are undefined', () => {
  assert.equal(lab.cleanConnectorLabelPosition(0.5), undefined)
  assert.equal(lab.cleanConnectorLabelPosition(0), 0.05)
  assert.equal(lab.cleanConnectorLabelPosition(7), 0.95)
  assert.equal(lab.cleanConnectorLabelPosition('0.3'), undefined)
  assert.equal(lab.cleanConnectorLabelPosition(NaN), undefined)
  assert.equal(lab.cleanConnectorLabelPosition(0.3), 0.3)
})

test('drag: keeps the grab offset, clamps, setter omits the middle', () => {
  const c = conn({ label: 'x' })
  assert.equal(lab.labelPositionForDrag(c, p(100, 100), p(100, 100), 0.5), 0.5)
  assert.equal(lab.labelPositionForDrag(c, p(110, 90), p(60, 90), 0.5), 0.25)
  assert.equal(lab.labelPositionForDrag(c, p(100, 100), p(-500, 0), 0.5), 0.05)
  assert.equal(lab.labelPositionForDrag(c, p(100, 100), p(900, 0), 0.5), 0.95)
  const items = [c]
  const moved = lab.setConnectorLabelPosition(items, 1, 0.2)
  assert.equal(moved[0].labelPosition, 0.2)
  assert.equal(lab.setConnectorLabelPosition(items, 1, 0.5), items)
  assert.equal('labelPosition' in lab.setConnectorLabelPosition(moved, 1, 0.5)[0], false)
  assert.equal(lab.setConnectorLabelPosition(items, 99, 0.2), items)
})

test('removing the label drops the position (and size)', () => {
  const out = lab.setConnectorLabel([conn({ label: 'x', labelPosition: 0.2, labelFontSize: 30 })], 1, '')
  assert.equal('labelPosition' in out[0], false)
  assert.equal('labelFontSize' in out[0], false)
  assert.equal(lab.setConnectorLabel([conn({ label: 'x', labelPosition: 0.2 })], 1, 'y')[0].labelPosition, 0.2)
})

test('file: old connector re-saves identically; position loads, saves, clamps, drops invalid', () => {
  assert.equal(rt({}).includes('labelPosition'), false)
  assert.equal(rt({}), doc.stringifyDocument(doc.parseDocument(rt({})).document))
  const saved = rt({ labelPosition: 0.2 })
  assert.equal(loaded({ labelPosition: 0.2 }).labelPosition, 0.2)
  assert.equal(doc.stringifyDocument(doc.parseDocument(saved).document), saved)
  assert.equal(rt({ labelPosition: 0.5 }).includes('labelPosition'), false)
  for (const bad of ['0.2', null, Infinity, {}, [0.2]]) assert.equal(rt({ labelPosition: bad }).includes('labelPosition'), false)
  assert.equal(loaded({ labelPosition: 3 }).labelPosition, 0.95)
  assert.equal(loaded({ labelPosition: -1 }).labelPosition, 0.05)
  assert.equal(rt({ labelPosition: 0.2 }, '').includes('labelPosition'), false)
})

test('paste keeps the position; SVG export puts the label at it', () => {
  const items = [conn({ label: 'x', labelPosition: 0.2 })]
  const copied = clip.copyItems(items, new Set(['connector:1']))
  assert.equal(copied[0].labelPosition, 0.2)
  const pasted = clip.pasteItems(copied, { stroke: 1, rectangle: 1, connector: 5, text: 1 }, 24, { x: 0, y: 0, width: 5000, height: 5000 })
  assert.equal(pasted.items.find((i) => i.kind === 'connector').labelPosition, 0.2)
  const svg = (position) => exporter.buildSheetSvg([conn({ label: 'REST', ...(position ? { labelPosition: position } : {}) })], { width: 400, height: 300, template: 'blank', backgroundColor: '#fff' })
  assert.notEqual(svg(0.25), svg(undefined))
  assert.ok(svg(0.25).includes('REST'))
})

test('handles: label hit is separate from the handles', () => {
  const c = conn({ label: 'REST', labelPosition: 0.25 })
  assert.equal(handles.hitConnectorLabel(c, p(50, 100), measure), true)
  assert.equal(handles.hitConnectorLabel(c, p(150, 100), measure), false)
})

test('wiring: label drag uses the handle gesture, one undo step, Esc cancels', () => {
  assert.match(app, /which: ConnectorHandleKind \| 'label'/)
  assert.match(app, /hitConnectorLabel\(connector, point\)/)
  assert.match(app, /gesture\.which === 'label'/)
  assert.match(app, /labelPositionForDrag\(connector, gesture\.startPoint, getBoundedPoint\(event\), gesture\.startLabelPosition\)/)
  assert.match(app, /setConnectorLabelPosition\(gesture\.originalItems/)
  assert.match(app, /if \(activeEndpointRef\.current\) \{ cancelConnectorHandleGesture\(\); handled = true \}/)
  assert.match(app, /connectorLabelCentre\(connector\)/)
})

test('wiring: a press on the label of an unselected connector selects it and starts the label drag only', () => {
  assert.match(app, /startConnectorHandleGesture = \(event: React\.PointerEvent<HTMLCanvasElement>, point: Point, labelOnly = false\)/)
  assert.match(app, /labelOnly \? null : hitConnectorHandle/)
  assert.match(app, /connector && !textHit && !codeHit && !rectangle && [^\n]*startConnectorHandleGesture\(event, point, true\)\) return/)
  // The selection is made before the gesture starts, so a plain click only selects (no history step is saved until the drag moves).
  assert.match(app, /updateSelectedItems\(textHit \? \[canvasItemKey\(textHit\)\][^\n]*\n\s*renderAll\(\)\n[^\n]*\n\s*if \(connector && !textHit/)
})
