import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
const out = ts.transpileModule(await read('app/visibleInk.ts'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
const ink = await import(`data:text/javascript;base64,${Buffer.from(out).toString('base64')}`)
const app = await read('App.tsx')

const stroke = (x0, y0, x1, y1, n = 10, width = 4) => ({ kind: 'stroke', id: 1, color: '#000', width, erase: false, points: Array.from({ length: n }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / (n - 1), y: y0 + ((y1 - y0) * i) / (n - 1), pressure: 0.5 })) })
const view = ink.viewRectOf({ scale: 2, offsetX: -200, offsetY: -100 }, 800, 400)

test('the view rectangle is the part of the canvas on screen', () => {
  assert.deepEqual(view, { x: 100, y: 50, width: 400, height: 200 })
})

test('strokes outside the view are skipped, strokes touching it (including their line width) are kept', () => {
  assert.equal(ink.isItemVisible(stroke(200, 100, 300, 150), view), true)
  assert.equal(ink.isItemVisible(stroke(2000, 100, 2100, 150), view), false)
  assert.equal(ink.isItemVisible(stroke(100, 1000, 300, 1100), view), false)
  // ends just outside the edge, but the thick line reaches in
  assert.equal(ink.isItemVisible(stroke(90, 100, 96, 100, 5, 6), view), true)
  // crosses the view without a point inside it
  assert.equal(ink.isItemVisible(stroke(0, 100, 900, 100, 2), view), true)
  assert.equal(ink.isItemVisible({ ...stroke(0, 0, 1, 1), points: [] }, view), false)
})

test('rectangles, text and connectors are always drawn; only pen strokes are skipped', () => {
  for (const kind of ['rectangle', 'text', 'connector']) assert.equal(ink.isItemVisible({ kind, x: 5000, y: 5000 }, view), true)
})

test('only visible points are counted', () => {
  const items = [stroke(200, 100, 300, 150, 40), stroke(2000, 100, 2100, 150, 500), { kind: 'rectangle', x: 0, y: 0 }]
  assert.equal(ink.countVisiblePoints(items, view), 40)
})

test('the drawing path changes only past the limit, with room before it changes back', () => {
  assert.equal(ink.chooseDrawMode('direct', 11999, 12000), 'direct')
  assert.equal(ink.chooseDrawMode('direct', 12001, 12000), 'cached')
  assert.equal(ink.chooseDrawMode('cached', 11000, 12000), 'cached')
  assert.equal(ink.chooseDrawMode('cached', 7000, 12000), 'direct')
  assert.equal(ink.chooseDrawMode('direct', 0, 0), 'cached')
  assert.equal(ink.chooseDrawMode('cached', 0, 1e9), 'direct')
})

test('renderAll picks the path from the visible ink, only between strokes, and skips off-screen strokes when redrawing', () => {
  assert.match(app, /if \(!benchmarkBackground && liveStroke === null\) \{\s*const visiblePoints = countVisiblePoints\(items, view\)[\s\S]*?const nextMode = chooseDrawMode\(drawModeRef\.current, visiblePoints, DIRECT_MAX_VISIBLE_POINTS\)/)
  assert.match(app, /const cacheAllowed = !benchmarkBackground && editingTextId === null && PAGE_CACHE_ENABLED && drawMode === 'cached'/)
  // one path everywhere by default: the switch to direct drawing only exists when ?direct=N is given
  assert.match(app, /DRAW_SWITCHES\.get\('direct'\) !== null \? Number\(DRAW_SWITCHES\.get\('direct'\)\) : 0/)
  assert.match(app, /if \(!isItemVisible\(item, view\)\) return/)
  assert.match(app, /DRAW_SWITCHES\.get\('direct'\)/)
})
