import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { laneFitDelta } = await loadModule('laneFit.ts')
const doc = await loadModule('documentFormat.ts')
const app = await readAppSource()

const box = (x, y, width = 100, height = 60) => ({ x, y, width, height })
const zero = { dx: 0, dy: 0 }

test('rows: a box crossing a lane border slides into the lane holding its centre', () => {
  // 4 lanes of 375; the border is y=375.
  assert.deepEqual(laneFitDelta(box(400, 350), undefined, 1500), { dx: 0, dy: 25 }) // centre 380 -> lane 1
  assert.deepEqual(laneFitDelta(box(400, 340), undefined, 1500), { dx: 0, dy: -25 }) // centre 370 -> lane 0
})

test('rows: a box fully inside a lane body does not move', () => {
  assert.deepEqual(laneFitDelta(box(400, 400), undefined, 1500), zero)
})

test('rows: a box over the header column moves right, out of it (also with its centre in the header)', () => {
  assert.deepEqual(laneFitDelta(box(100, 400), undefined, 1500), { dx: 80, dy: 0 })
  assert.deepEqual(laneFitDelta(box(100, 400, 60), undefined, 1500), { dx: 80, dy: 0 })
  assert.deepEqual(laneFitDelta(box(20, 400, 60), undefined, 1500), { dx: 160, dy: 0 })
})

test('rows: a box too tall for the lane stays; too wide stays horizontally but still fits vertically', () => {
  assert.deepEqual(laneFitDelta(box(400, 300, 100, 400), undefined, 1500), zero)
  assert.deepEqual(laneFitDelta(box(100, 350, 2400, 60), undefined, 1500), { dx: 0, dy: 25 })
})

test('rows: the right sheet edge keeps the box inside; lane count is respected', () => {
  assert.deepEqual(laneFitDelta(box(2430, 400), undefined, 1500), { dx: -30, dy: 0 })
  assert.deepEqual(laneFitDelta(box(400, 730), { count: 2 }, 1500), { dx: 0, dy: 20 })
})

test('columns: horizontal shift into the lane under the centre and below the header band', () => {
  const lanes = { dir: 'columns', count: 4 } // 625 wide, header 120
  assert.deepEqual(laneFitDelta(box(600, 400), lanes, 1500), { dx: 25, dy: 0 })
  assert.deepEqual(laneFitDelta(box(560, 400), lanes, 1500), { dx: -35, dy: 0 })
  assert.deepEqual(laneFitDelta(box(100, 80), lanes, 1500), { dx: 0, dy: 40 })
  assert.deepEqual(laneFitDelta(box(100, 20, 100, 80), lanes, 1500), { dx: 0, dy: 100 }) // centre in the header band
  assert.deepEqual(laneFitDelta(box(500, 400, 700, 60), { dir: 'columns' }, 1500), zero) // wider than a lane
})

test('grown sheet: lanes continue below 1500 and the last lane may be cut by the sheet edge', () => {
  assert.deepEqual(laneFitDelta(box(400, 1480), undefined, 2000), { dx: 0, dy: 20 }) // lane 4 starts at 1500
  assert.deepEqual(laneFitDelta(box(400, 1960), undefined, 2000), { dx: 0, dy: -20 }) // cut last lane 1875..2000
  assert.deepEqual(laneFitDelta(box(400, 1900, 100, 200), undefined, 2000), zero) // does not fit the cut lane
})

test('fit: false switches it off; a centre outside the sheet does nothing', () => {
  assert.deepEqual(laneFitDelta(box(400, 350), { fit: false }, 1500), zero)
  assert.deepEqual(laneFitDelta(box(400, 1600), undefined, 1500), zero)
})

test('fit: false is kept by the saved format and the default is not written', () => {
  assert.deepEqual(doc.cleanLanes({ count: 3, fit: false }), { count: 3, fit: false })
  assert.deepEqual(doc.cleanLanes({ count: 3, fit: true }), { count: 3 })
})

test('wiring: moves and new boxes fit into lanes, Alt skips it, the switch is in both menus', () => {
  assert.match(app, /laneFitDelta\(/)
  assert.match(app, /const fitIntoLanes = /)
  const calls = app.match(/fitIntoLanes\(event, /g) ?? []
  assert.ok(calls.length >= 4, `expected the move and create paths to call fitIntoLanes, found ${calls.length}`)
  assert.match(app, /laneFit\(pageLanesRef\.current\)/)
  assert.match(app, /Keep boxes inside lanes/)
  assert.match(app, /fit: on \? undefined : false/)
})
