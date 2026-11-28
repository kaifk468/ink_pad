import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const m = await loadModule('canvasModel.ts')
const hld = await loadModule('hldShapes.ts')
const p = (x, y) => ({ x, y, pressure: 0 })
const plain = { kind: 'rectangle', id: 1, x: 0, y: 0, width: 200, height: 100, strokeColor: '#111', strokeWidth: 2 }

test('snapInside sends a point inside a box to its nearest outline point, however deep', () => {
  const big = { ...plain, height: 300 }
  const s = m.snapConnectorEndpoint(p(100, 50), [big], 36, true)
  assert.equal(m.snapConnectorEndpoint(p(100, 120), [big], 36), null) // default: only near the edge
  assert.deepEqual(m.snapConnectorEndpoint(p(100, 120), [big], 36, true).point, p(0, 120)) // nearest edge is the left one
  assert.deepEqual([s.point.x, s.point.y, s.attachment.rectangleId], [100, 0, 1])
  assert.deepEqual([s.attachment.offsetX, s.attachment.offsetY], [100, 0])
  assert.equal(m.snapConnectorEndpoint(p(500, 500), [plain], 36, true), null)
  assert.equal(m.snapConnectorEndpoint(p(205, 50), [plain], 36, true).point.x, 200) // near the edge still snaps
})

test('snapInside picks the topmost of overlapping boxes', () => {
  const top = { ...plain, id: 2, x: 50, y: 20, width: 40, height: 40 }
  assert.equal(m.snapConnectorEndpoint(p(60, 40), [plain, top], 36, true).attachment.rectangleId, 2)
})

test('HLD shapes (service, database) shrink to 32x32; class boxes keep 64x72', () => {
  const service = hld.createHldShape(7, 0, 0, 200, 150, '#111', 2, 'service')
  const small = m.resizeRectangleItems([service], 7, { x: 0, y: 0, width: 10, height: 10 })[0]
  assert.deepEqual([small.width, small.height], [32, 32])
  const box = { ...service, hldShape: undefined, id: 8 }
  delete box.hldShape
  const kept = m.resizeRectangleItems([box], 8, { x: 0, y: 0, width: 10, height: 10 })[0]
  assert.deepEqual([kept.width, kept.height], [64, 72])
  assert.equal(m.HLD_SHAPE_MIN_SIZE, 32)
  assert.deepEqual(m.constrainInkBoxBounds(service, { x: 0, y: 0, width: 5, height: 5 }), { x: 0, y: 0, width: 32, height: 32 })
})

import { readFile } from 'node:fs/promises'
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('desktop dock: bottom bar with direct shape tools, Text, Connector, HLD shapes and Class box, no Insert tray', async () => {
  const dock = await read('src/app/ToolDock.tsx')
  assert.match(dock, /className=\{`tool-dock\$\{props\.desktop \? ' desktop-dock' : ''\}`\}/)
  for (const key of ['P', 'E', 'V', 'L', 'C', 'B']) assert.match(dock, new RegExp(`', '${key}'(, '\\d')?\\)\\}`), key)
  for (const kind of ['rectangle', 'diamond', 'ellipse', 'arrow', 'line']) assert.match(dock, new RegExp(`kind: '${kind}'`), kind)
  const desktop = dock.slice(dock.indexOf('if (props.desktop) {'), dock.lastIndexOf('  return ('))
  const tablet = dock.slice(dock.lastIndexOf('  return ('))
  for (const name of ['text-tool-button', 'DESKTOP_SHAPES.map', 'hld-tool-button', '{connector}', '{inkClass}', '{penEraser}', '<MoreTray']) assert.ok(desktop.includes(name), name)
  assert.equal(desktop.includes('<InsertTray'), false)
  assert.equal(desktop.includes('shapes-tool-button'), false, 'the shape-recognition toggle is gone from the desktop dock')
  assert.ok(desktop.indexOf('{selectLasso}') < desktop.indexOf('{penEraser}') && desktop.indexOf('{penEraser}') < desktop.indexOf('DESKTOP_SHAPES.map') && desktop.indexOf('DESKTOP_SHAPES.map') < desktop.indexOf('text-tool-button') && desktop.indexOf('text-tool-button') < desktop.indexOf('{connector}'))
  assert.match(desktop, /onClick=\{props\.textActive \? props\.onText : props\.onTextOptions\}/)
  assert.match(desktop, /HLD_ENTRIES\.map/)
  assert.match(desktop, /<MoreTray[^>]*onTypedClass=\{props\.onClass\}/)
  // tablet: unchanged order with the Insert tray
  assert.ok(tablet.includes('<InsertTray') && !tablet.includes('text-tool-button') && !tablet.includes('DESKTOP_SHAPES'))
  assert.ok(tablet.indexOf('{penEraser}') < tablet.indexOf('{selectLasso}') && tablet.indexOf('{selectLasso}') < tablet.indexOf('{connector}'))
  const app = await read('src/App.tsx')
  assert.match(app, /<ToolDock\s+desktop=\{inputMode === 'desktop'\}/)
  assert.match(app, /<EmptyCanvasHint desktop=\{inputMode === 'desktop'\} onTemplates=\{[^}]*\} onBoard=\{[^\n]*?\} \/>/)
  const css = await read('src/styles.css')
  assert.equal(css.includes('desktop-rail'), false)
  assert.match(css, /\.tool-dock \{\s*position: absolute;[^}]*bottom: max\(16px/)
})

test('the connector tool starts a connector on a box and snaps inside presses only in desktop mode', async () => {
  const app = await read('src/App.tsx')
  assert.match(app, /CONNECTOR_SNAP_TOLERANCE \/ viewportRef\.current\.scale, inputModeRef\.current === 'desktop'\)/)
})
