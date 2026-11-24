import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const model = await loadModule('canvasModel.ts')
const handles = await loadModule('connectorHandles.ts')
const flow = await loadModule('diagramFlow.ts')
const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
const app = await read('App.tsx')
const p = (x, y) => ({ x, y, pressure: 1 })
const rect = (id, x, y, w = 200, h = 120) => ({ kind: 'rectangle', id, x, y, width: w, height: h, strokeColor: '#111', strokeWidth: 3 })
const elbow = (extra = {}) => ({
  ...model.createConnector(7, p(200, 60), p(500, 360), '#111', 3, { rectangleId: 1, offsetX: 200, offsetY: 60 }, { rectangleId: 2, offsetX: 0, offsetY: 60 }, 'association'),
  routing: 'elbow', ...extra,
})
const items = [rect(1, 0, 0), rect(2, 500, 300), elbow()]

test('bend drag is relative: pressing off the segment does not jump it', () => {
  // the default middle segment is at x = 472; press 12 px off it, move 30 px left
  assert.equal(handles.bendForDrag(items, 7, p(484, 200), p(454, 200), 0), -30)
  // no movement, no change (the absolute version would have given 12)
  assert.equal(handles.bendForDrag(items, 7, p(484, 200), p(484, 200), 0), 0)
  // adds to the bend the drag started with, and is clamped
  assert.equal(handles.bendForDrag(items, 7, p(472, 200), p(452, 200), -40), -60)
  assert.equal(handles.bendForDrag(items, 7, p(0, 0), p(99999, 0), 0), 5000)
  const { routing: _r, ...plain } = elbow()
  assert.equal(handles.bendForDrag([items[0], items[1], plain], 7, p(0, 0), p(10, 0), 0), null)
  assert.match(app, /bendForDrag\(gesture\.originalItems, gesture\.id, gesture\.startPoint, getBoundedPoint\(event\), gesture\.startBend\)/)
  assert.match(app, /startPoint: point, startBend: connector\.bend \?\? 0/)
})

test('the connector label editor opens on the path midpoint, not the moved middle dot', () => {
  const body = app.slice(app.indexOf('const editConnectorLabel'), app.indexOf('const openClassBoxEditor'))
  assert.match(body, /const centre = pathMidpoint\(connectorPoints\(connector\)\)/)
  assert.equal(body.includes('connectorHandlePositions'), false)
})

test('the template button is desktop only so it never sits under the first pen stroke', async () => {
  const hint = await read('app/EmptyCanvasHint.tsx')
  assert.match(hint, /\{desktop && <button type="button" className="empty-canvas-template"/)
})

test('followResizeLabels: enlarging does not shrink a label that sat in the padding margin', () => {
  const box = rect(1, 0, 0, 300, 120) // inner width 280
  const margin = { kind: 'text', id: 2, x: 5, y: 50, width: 290, height: 20, text: 'x'.repeat(20), fontSize: 20, color: '#000' }
  const measureFor = (size) => (line) => line.length * size * 0.5
  const oldB = { x: 0, y: 0, width: 300, height: 120 }
  const newB = { x: 0, y: 0, width: 310, height: 120 }
  const out = flow.followResizeLabels([{ ...box, ...newB }, margin], 1, oldB, newB, ['text:2'], measureFor)
  assert.equal(out[1].fontSize, 20)
  assert.equal(out[1].width, 290)
  // a label that fitted the old area and no longer fits the smaller box is still refitted
  const fitted = { ...margin, width: 270 }
  const smallB = { x: 0, y: 0, width: 200, height: 120 }
  const shrunk = flow.followResizeLabels([{ ...box, ...smallB }, fitted], 1, oldB, smallB, ['text:2'], measureFor)
  assert.ok(shrunk[1].fontSize < 20 || shrunk[1].fit === 'wrap')
})

test('a label typed into a just-inserted sticky note adds no second undo step', async () => {
  const sticky = app.slice(app.indexOf('const insertStickyNote'), app.indexOf('const changeCode'))
  assert.match(sticky, /centerOn: middle, mergeHistory: true/)
  const commit = app.slice(app.indexOf('const commitTextEditor'), app.indexOf('const cancelTextEditor'))
  assert.match(commit, /if \(!editor\.mergeHistory\) saveHistory\(\)/)
  assert.match(await read('TextEditorOverlay.tsx'), /mergeHistory\?: boolean/)
})

test('the find bar count is memoised, not searched on every render', () => {
  assert.match(app, /count=\{findCount\(findQuery\)\}/)
  assert.equal(/count=\{[^}]*findMatches/.test(app), false)
  const body = app.slice(app.indexOf('const findCount'), app.indexOf('/** Shows the match'))
  assert.match(body, /findCountCacheRef\.current = /)
  assert.match(body, /sameSearchFingerprint\(cache\.fingerprint, fingerprint\)/) // keyed on content, so an in-place label edit refreshes the count
})
