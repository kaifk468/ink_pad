import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { loadModule } from './helpers/loadModule.mjs'

const shapes = await loadModule('hldShapes.ts')
const box = await loadModule('inkClassBox.ts')
const model = await loadModule('canvasModel.ts')
const format = await loadModule('documentFormat.ts')
const exp = await loadModule('sheetExport.ts')

const p = (x, y) => ({ x, y, pressure: 0.5 })
const line = (id, points, erase = false) => ({ kind: 'stroke', id, points, color: '#202124', width: 4, erase })
const make = (shape, id = 1) => shapes.createHldShape(id, 100, 100, 300, 200, '#111', 3, shape)
const sheet = { width: 1000, height: 800, template: 'blank', backgroundColor: '#fff' }

test('an HLD shape is an ink box with a shape kind and sensible default sizes', () => {
  for (const shape of ['database', 'queue', 'service']) {
    const rect = make(shape)
    assert.equal(rect.hldShape, shape)
    assert.deepEqual(rect.inkBox.ink, [])
    const size = shapes.HLD_DEFAULT_SIZE[shape]
    assert.ok(size.width > 100 && size.height > 80)
    assert.ok(shapes.HLD_SHAPE_LABELS[shape])
  }
  assert.deepEqual([...model.HLD_SHAPES], ['database', 'queue', 'service'])
})

test('outlines: a cylinder has a full top ellipse and curved base, a queue has two caps with arrows, a service is a rounded box', () => {
  const r = { x: 0, y: 0, width: 300, height: 200 }
  const db = shapes.hldOutlinePath(r, 'database')
  assert.equal((db.match(/A/g) ?? []).length, 3)
  assert.ok(db.includes('Z'))
  const queue = shapes.hldOutlinePath(r, 'queue')
  assert.equal((queue.match(/V200/g) ?? []).length >= 2, true, 'two cap lines')
  assert.equal((queue.match(/L/g) ?? []).length, 4, 'two chevrons')
  const service = shapes.hldOutlinePath(r, 'service')
  assert.equal((service.match(/A/g) ?? []).length, 4)
  assert.ok(!/NaN|undefined/.test(db + queue + service))
})

test('HLD shapes have no dividers to grab or move', () => {
  const rect = make('service')
  assert.equal(box.hitInkBoxDivider(rect, p(200, rect.inkBox.top), 10), null)
  assert.equal(box.moveInkBoxDivider(rect, 'top', 150), rect)
  const classBox = box.createInkClassBox(2, 100, 100, 300, 200, '#111', 3)
  assert.equal(box.hitInkBoxDivider(classBox, p(200, classBox.inkBox.top), 10), 'top', 'class boxes still do')
})

test('writing inside a shape is stored in it, grows it, and keeps its kind through move and resize', () => {
  let rect = make('database')
  rect = box.addStrokeToInkBox(rect, line(5, [p(150, 150), p(250, 160)]))
  assert.equal(rect.hldShape, 'database')
  assert.equal(rect.inkBox.ink.length, 1)
  const items = [rect]
  const moved = model.translateSelectedItems(items, new Set(['rectangle:1']), 20, 30)
  assert.equal(moved[0].hldShape, 'database')
  assert.equal(moved[0].inkBox.ink[0].points[0].x, 170)
  const resized = model.resizeRectangleItems(items, 1, { x: 100, y: 100, width: 600, height: 400 })[0]
  assert.equal(resized.hldShape, 'database')
  assert.equal(resized.width, 600)
  assert.ok(resized.inkBox.ink[0].points[1].x > 250, 'the writing scales with the shape')
})

test('connectors attach to a shape as a whole and follow it', () => {
  const db = make('database')
  const snapped = model.snapConnectorEndpoint(p(100, 200), [db])
  assert.equal(snapped.attachment.rectangleId, 1)
  const svc = shapes.createHldShape(2, 600, 100, 300, 200, '#111', 3, 'service')
  const conn = model.createConnector(7, snapped.point, p(600, 200), '#111', 3, snapped.attachment, { rectangleId: 2, offsetX: 0, offsetY: 100 })
  const moved = model.translateSelectedItems([db, svc, conn], new Set(['rectangle:2']), 0, 50)
  assert.equal(moved[2].end.y, 250)
})

test('saved files: the shape kind is optional, needs an ink area, and unknown kinds are dropped', () => {
  const items = [box.addStrokeToInkBox(make('queue'), line(5, [p(150, 150), p(250, 160)])), make('service', 2)]
  const text = format.stringifyDocument(format.createDocument({ title: 't', template: 'blank', background: 'white', items }))
  const back = format.parseDocument(text).document.items
  assert.equal(back[0].hldShape, 'queue')
  assert.equal(back[0].inkBox.ink.length, 1)
  assert.equal(back[1].hldShape, 'service')
  const raw = JSON.parse(text)
  raw.items[0].hldShape = 'cloud'
  assert.equal(format.parseDocument(JSON.stringify(raw)).document.items[0].hldShape, undefined)
  delete raw.items[1].inkBox
  const plain = format.parseDocument(JSON.stringify(raw)).document.items[1]
  assert.equal(plain.hldShape, undefined)
  assert.equal(plain.kind, 'rectangle')
  // older files (no field) open as before
  const old = JSON.parse(text)
  for (const item of old.items) delete item.hldShape
  assert.equal(format.parseDocument(JSON.stringify(old)).document.items[0].hldShape, undefined)
})

test('SVG export draws the outline, keeps the writing clipped, and has no divider lines', () => {
  const written = box.addStrokeToInkBox(make('database'), line(5, [p(150, 150), p(250, 160)]))
  const svg = exp.buildSheetSvg([written], sheet)
  assert.ok(svg.includes(shapes.hldOutlinePath(written, 'database')))
  assert.ok(svg.includes('clip-path'))
  const lines = (svg.match(/<path d="M[\d. ]+H[\d. ]+M/g) ?? [])
  assert.equal(lines.length, 0)
  const classSvg = exp.buildSheetSvg([box.createInkClassBox(3, 100, 100, 300, 200, '#111', 3)], sheet)
  assert.match(classSvg, /<path d="M[\d. ]+H[\d. ]+M/, 'class boxes keep their divider lines')
})

test('the Insert tray and the app create shapes with the ink class flow', async () => {
  const tray = await readFile(new URL('../src/app/InsertTray.tsx', import.meta.url), 'utf8')
  for (const shape of ['database', 'queue', 'service']) assert.match(tray, new RegExp(`shape: '${shape}'`))
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /createHldShape\(nextRectangleIdRef\.current\+\+/)
  assert.match(app, /HLD_DEFAULT_SIZE\[createdShape\]/)
  assert.match(app, /const toggleHldShapeTool = \(shape: HldShape\)/)
  assert.match(app, /soleSelectedRectangle\.hldShape \? \[\]/)
  const renderer = await readFile(new URL('../src/app/canvasRenderer.ts', import.meta.url), 'utf8')
  assert.match(renderer, /new Path2D\(hldOutlinePath\(rectangle, rectangle\.hldShape\)\)/)
})
