import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const { freeInsertOffset, isOutsideView, INSERT_MARGIN } = await loadModule('insertPlacement.ts')
const ws = { x: -100, y: -100, width: 2000, height: 2000 }
const box = (x, y, width, height) => ({ x, y, width, height })

test('no existing items or no overlap keeps the placement', () => {
  assert.deepEqual(freeInsertOffset(box(0, 0, 100, 100), [], ws), { dx: 0, dy: 0 })
  assert.deepEqual(freeInsertOffset(box(500, 0, 100, 100), [box(0, 0, 100, 100)], ws), { dx: 0, dy: 0 })
})

test('within the margin counts as overlapping', () => {
  const offset = freeInsertOffset(box(120, 0, 100, 100), [box(0, 0, 100, 100)], ws)
  assert.equal(120 + offset.dx, 100 + INSERT_MARGIN)
  assert.equal(offset.dy, 0)
})

test('overlap moves right of all content, top aligned', () => {
  const offset = freeInsertOffset(box(50, 30, 200, 100), [box(0, 0, 100, 100), box(300, 200, 100, 100)], ws)
  assert.deepEqual({ x: 50 + offset.dx, y: 30 + offset.dy }, { x: 440, y: 30 })
})

test('no room on the right goes below, clamped sideways', () => {
  const placed = box(1000, 0, 800, 100)
  const offset = freeInsertOffset(placed, [box(900, 0, 500, 300)], ws)
  assert.equal(placed.y + offset.dy, 340)
  assert.ok(placed.x + offset.dx + 800 <= 1900)
})

test('nowhere free keeps the placement', () => {
  assert.deepEqual(freeInsertOffset(box(0, 0, 1900, 1900), [box(0, 0, 10, 10)], ws), { dx: 0, dy: 0 })
})

test('isOutsideView', () => {
  assert.equal(isOutsideView(box(10, 10, 50, 50), box(0, 0, 100, 100)), false)
  assert.equal(isOutsideView(box(90, 10, 50, 50), box(0, 0, 100, 100)), true)
})
