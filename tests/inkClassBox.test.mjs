import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { loadModule } from './helpers/loadModule.mjs'

const box = await loadModule('inkClassBox.ts')
const model = await loadModule('canvasModel.ts')
const format = await loadModule('documentFormat.ts')
const exp = await loadModule('sheetExport.ts')

const p = (x, y) => ({ x, y, pressure: 0.5 })
const line = (id, points, erase = false) => ({ kind: 'stroke', id, points, color: '#202124', width: 4, erase })
const make = () => box.createInkClassBox(1, 100, 100, 320, 240, '#111', 3)

test('a new ink class box has three sections with the dividers inside it and no ink', () => {
  const rect = make()
  assert.equal(rect.inkBox.ink.length, 0)
  assert.ok(rect.inkBox.top > rect.y && rect.inkBox.top < rect.inkBox.mid && rect.inkBox.mid < rect.y + rect.height)
})

test('dividers move within the box and keep a minimum section height', () => {
  const rect = make()
  assert.equal(box.moveInkBoxDivider(rect, 'top', 0).inkBox.top, rect.y + box.INK_BOX_MIN_BAND)
  assert.equal(box.moveInkBoxDivider(rect, 'top', 9999).inkBox.top, rect.inkBox.mid - box.INK_BOX_MIN_BAND)
  assert.equal(box.moveInkBoxDivider(rect, 'mid', 9999).inkBox.mid, rect.y + rect.height - box.INK_BOX_MIN_BAND)
  assert.equal(box.moveInkBoxDivider(rect, 'mid', 0).inkBox.mid, rect.inkBox.top + box.INK_BOX_MIN_BAND)
})

test('divider hit test needs the point near a divider and inside the box width', () => {
  const rect = make()
  assert.equal(box.hitInkBoxDivider(rect, p(200, rect.inkBox.top + 3), 10), 'top')
  assert.equal(box.hitInkBoxDivider(rect, p(200, rect.inkBox.mid - 3), 10), 'mid')
  assert.equal(box.hitInkBoxDivider(rect, p(200, (rect.inkBox.top + rect.inkBox.mid) / 2), 10), null)
  assert.equal(box.hitInkBoxDivider(rect, p(900, rect.inkBox.top), 10), null)
})

test('findInkBoxAt returns the topmost ink box under the point and ignores plain rectangles', () => {
  const plain = { kind: 'rectangle', id: 5, x: 0, y: 0, width: 1000, height: 1000, strokeColor: '#000', strokeWidth: 2 }
  const rect = make()
  assert.equal(box.findInkBoxAt([rect, plain], p(150, 150)), rect)
  assert.equal(box.findInkBoxAt([rect], p(10, 10)), null)
  assert.equal(box.findInkBoxAt([plain], p(10, 10)), null)
})

test('a stroke inside stays inside; a stroke crossing the border grows the box to cover it', () => {
  const rect = make()
  const inside = box.addStrokeToInkBox(rect, line(2, [p(150, 150), p(200, 160)]))
  assert.equal(inside.inkBox.ink.length, 1)
  assert.equal(inside.width, rect.width)
  assert.equal(inside.height, rect.height)
  const crossing = box.addStrokeToInkBox(inside, line(3, [p(150, 300), p(150, 500)]))
  assert.equal(crossing.inkBox.ink.length, 2)
  assert.ok(crossing.y + crossing.height >= 500)
  assert.equal(crossing.inkBox.top, inside.inkBox.top, 'dividers stay where they were set')
  assert.equal(crossing.inkBox.mid, inside.inkBox.mid)
  assert.equal(rect.inkBox.ink.length, 0, 'original item is not edited')
})

test('an erase stroke is stored in the box and does not grow it', () => {
  const rect = make()
  const erased = box.addStrokeToInkBox(rect, line(4, [p(100, 100), p(900, 900)], true))
  assert.equal(erased.inkBox.ink.length, 1)
  assert.equal(erased.width, rect.width)
  assert.equal(erased.height, rect.height)
})

test('resizing scales the writing, dividers and pen width in proportion with the box', () => {
  const written = box.addStrokeToInkBox(make(), line(2, [p(150, 150), p(380, 300)]))
  const items = model.resizeRectangleItems([written], 1, { x: 100, y: 100, width: 480, height: 360 })
  const resized = items[0]
  assert.equal(resized.width, 480)
  assert.equal(resized.height, 360)
  const stroke = resized.inkBox.ink[0]
  assert.equal(stroke.points[0].x, 100 + (150 - 100) * 1.5)
  assert.equal(stroke.points[1].y, 100 + (300 - 100) * 1.5)
  assert.equal(stroke.width, 6)
  assert.equal(resized.inkBox.top, 100 + (written.inkBox.top - 100) * 1.5)
  assert.equal(written.inkBox.ink[0].points[0].x, 150, 'original untouched')
})

test('resizing never goes below the minimum size', () => {
  const resized = model.resizeRectangleItems([make()], 1, { x: 100, y: 100, width: 10, height: 10 })[0]
  assert.ok(resized.width >= box.INK_BOX_MIN_WIDTH && resized.height >= box.INK_BOX_MIN_HEIGHT)
  assert.ok(resized.inkBox.top < resized.inkBox.mid && resized.inkBox.mid < resized.y + resized.height)
})

test('default box is 560 x 420 and its sections start at 12 / 80 / 8 percent', () => {
  assert.equal(box.INK_BOX_DEFAULT_WIDTH, 560)
  assert.equal(box.INK_BOX_DEFAULT_HEIGHT, 420)
  const content = box.newInkBoxContent(0, 420)
  assert.ok(Math.abs(content.top - 50.4) < 1e-9)
  assert.ok(Math.abs(content.mid - 386.4) < 1e-9)
})

test('moving the box moves its ink and dividers together', () => {
  const written = box.addStrokeToInkBox(make(), line(2, [p(150, 150), p(200, 160)]))
  const moved = model.translateSelectedItems([written], new Set([model.canvasItemKey(written)]), 50, 70)[0]
  assert.equal(moved.x, written.x + 50)
  assert.equal(moved.inkBox.top, written.inkBox.top + 70)
  assert.equal(moved.inkBox.ink[0].points[0].x, 200)
  assert.equal(moved.inkBox.ink[0].points[0].y, 220)
  assert.equal(written.inkBox.ink[0].points[0].x, 150, 'original untouched')
})

test('saved documents keep the box, its dividers and ink; older files without it still open', () => {
  const written = box.addStrokeToInkBox(make(), line(2, [p(150, 150), p(200, 160)]))
  const text = format.stringifyDocument(format.createDocument({ template: 'blank', background: 'white', items: [written] }))
  const parsed = format.parseDocument(text)
  assert.equal(parsed.ok, true)
  const back = parsed.document.items[0]
  assert.equal(back.inkBox.top, written.inkBox.top)
  assert.equal(back.inkBox.ink.length, 1)
  assert.equal(back.inkBox.ink[0].points.length, 2)
  const plain = { kind: 'rectangle', id: 9, x: 0, y: 0, width: 50, height: 50, strokeColor: '#000', strokeWidth: 2 }
  const old = format.parseDocument(format.stringifyDocument(format.createDocument({ template: 'blank', background: 'white', items: [plain] })))
  assert.equal(old.document.items[0].inkBox, undefined)
})

test('a damaged ink box in a file is repaired instead of failing the whole file', () => {
  const written = box.addStrokeToInkBox(make(), line(2, [p(150, 150), p(200, 160)]))
  const doc = JSON.parse(format.stringifyDocument(format.createDocument({ template: 'blank', background: 'white', items: [written] })))
  doc.items[0].inkBox.top = -50
  doc.items[0].inkBox.mid = 99999
  const parsed = format.parseDocument(JSON.stringify(doc))
  assert.equal(parsed.ok, true)
  const fixed = parsed.document.items[0]
  assert.ok(fixed.inkBox.top > fixed.y && fixed.inkBox.mid < fixed.y + fixed.height)
})

test('the move grip sits above the top edge and is hit only near it', () => {
  const rect = make()
  const grip = box.inkBoxMoveGrip(rect, 1)
  assert.ok(grip.y < rect.y)
  assert.equal(box.hitInkBoxMoveGrip(rect, p(grip.x, grip.y), 1), true)
  assert.equal(box.hitInkBoxMoveGrip(rect, p(grip.x + 200, grip.y), 1), false)
  assert.equal(box.hitInkBoxMoveGrip(rect, p(rect.x + 50, rect.y + 50), 1), false)
})

test('SVG export draws the ink inside a rounded box with its dividers', () => {
  const written = box.addStrokeToInkBox(make(), line(2, [p(150, 150), p(200, 160)]))
  const svg = exp.buildSheetSvg([written], { width: 2500, height: 1500, template: 'blank', backgroundColor: '#ffffff' })
  assert.match(svg, /rx="14"/)
  assert.match(svg, /clipPath/)
  assert.ok(svg.endsWith('</svg>'))
})

test('App wires the tool, drag-to-size creation, ink capture and divider dragging', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /classMode && inkClassTool/)
  assert.match(app, /createInkClassBox\(/)
  assert.match(app, /created: true/)
  assert.match(app, /activeStrokeBoxRef\.current = shapeMode \? null : findInkBoxAt\(/)
  assert.match(app, /addStrokeToInkBox\(targetBox, stroke\)/)
  assert.match(app, /hitInkBoxDivider\(/)
  assert.match(app, /moveInkBoxDivider\(/)
  assert.match(app, /hitInkBoxMoveGrip\(selectedBox/)
  assert.match(app, /hitInkBoxMoveGrip\(selectedInkBox/)
  assert.match(app, /hitInkBoxMoveGrip\(lassoInkBox/)
  assert.match(app, /comes to the front/)
  assert.match(app, /ERASER_CURSOR_QUIET_MS/)
  assert.match(app, /handles, dividers and border come first/)
  assert.match(app, /onInkClass=\{toggleInkClassTool\}/)
  const dock = await readFile(new URL('../src/app/ToolDock.tsx', import.meta.url), 'utf8')
  assert.match(dock, /aria-label="Class box"[^>]*onClick=\{props\.onInkClass\}/)
  const tray = await readFile(new URL('../src/app/InsertTray.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(tray, /onInkClass/)
  assert.match(tray, /Typed class box/)
  assert.match(app, /!navigationSettings\.zoomLocked && \(\s*<TopLeftBar/)
  assert.match(app, /!navigationSettings\.zoomLocked && <AccountButton/)
  assert.match(app, /<HistoryBar canUndo/)
})
