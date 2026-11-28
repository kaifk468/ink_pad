import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { findEqualGapSnap, snapForDrag } = await loadModule('snapping.ts')
const app = await readAppSource()
const box = (x, y, width = 50, height = 50) => ({ x, y, width, height })

test('findEqualGapSnap: row, column, tolerance and no match', () => {
  const row = [box(0, 0), box(80, 0)]
  const hit = findEqualGapSnap(box(163, 5), row, 6)
  assert.equal(hit.dx, -3)
  assert.equal(hit.dy, 0)
  assert.deepEqual(hit.axes, { x: true, y: false })
  assert.equal(hit.markers.length, 2)
  assert.ok(hit.markers.every((m) => m.size === 30 && m.y1 === m.y2))
  assert.equal(findEqualGapSnap(box(170, 5), row, 6), null)
  assert.equal(findEqualGapSnap(box(163, 200), row, 6), null)
  assert.equal(findEqualGapSnap(box(163, 5), [box(0, 0)], 6), null)
  const col = [box(0, 0), box(0, 70)]
  const down = findEqualGapSnap(box(4, 143), col, 6)
  assert.equal(down.dy, -3)
  assert.equal(down.dx, 0)
  assert.ok(down.markers.every((m) => m.size === 20 && m.x1 === m.x2))
  assert.equal(findEqualGapSnap(box(-83, 0), row, 6).dx, 3)
  const between = findEqualGapSnap(box(103, 0, 40, 50), [box(0, 0), box(200, 0)], 6)
  assert.equal(between.dx, 50 + (200 - 50 - 40) / 2 - 103)
})

test('snapForDrag uses the equal gap, and can skip it', () => {
  const row = [box(0, 0), box(80, 0)]
  assert.equal(snapForDrag(true, false, box(163, 5), row, 'mouse', 1).dx, -3)
  assert.equal(snapForDrag(true, false, box(163, 5), row, 'mouse', 1).gapMarkers.length, 2)
  assert.equal(snapForDrag(true, false, box(163, 5), row, 'mouse', 1, false).gapMarkers, undefined)
})

test('equal-gap markers are drawn and skipped for duplicate drags', () => {
  assert.match(app, /gapMarkersRef\.current = result\?\.gapMarkers \?\? \[\]/)
  assert.match(app, /snapDragDelta\(event, dragBase, dragKeys, deltaX, deltaY, !!drag\.duplicate\)/)
  assert.match(app, /const gapMarkers = gapMarkersRef\.current/)
})
