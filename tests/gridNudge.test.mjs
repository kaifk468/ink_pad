import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const grid = await loadModule('gridSnap.ts')
const app = await readAppSource()

test('gridNudgeDelta steps one grid square (five when large) and lands the top-left on the grid', () => {
  assert.deepEqual(grid.gridNudgeDelta({ x: 40, y: 40 }, 1, 0, 20), { dx: 20, dy: 0 })
  assert.deepEqual(grid.gridNudgeDelta({ x: 40, y: 40 }, -1, 0, 20), { dx: -20, dy: 0 })
  assert.deepEqual(grid.gridNudgeDelta({ x: 40, y: 40 }, 0, 10, 20), { dx: 0, dy: 100 })
  assert.deepEqual(grid.gridNudgeDelta({ x: 40, y: 40 }, 0, -10, 20), { dx: 0, dy: -100 })
  assert.deepEqual(grid.gridNudgeDelta({ x: 45, y: 33 }, 1, 1, 20), { dx: 15, dy: 7 })
  assert.deepEqual(grid.gridNudgeDelta({ x: 45, y: 33 }, -1, -1, 20), { dx: -5, dy: -13 })
  assert.deepEqual(grid.gridNudgeDelta({ x: 45, y: 33 }, 10, 0, 20), { dx: 95, dy: 0 })
  assert.deepEqual(grid.gridNudgeDelta({ x: 45, y: 33 }, 1, 0, 0), { dx: 1, dy: 0 })
})

test('snapAngle keeps the length and rounds the angle to the step', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`)
  const r = grid.snapAngle({ x: 0, y: 0 }, { x: 100, y: 10 }, 15)
  near(Math.hypot(r.x, r.y), Math.hypot(100, 10))
  near(Math.atan2(r.y, r.x), 0)
  const d = grid.snapAngle({ x: 10, y: 10 }, { x: 110, y: 90 }, 15)
  near(Math.atan2(d.y - 10, d.x - 10), (45 * Math.PI) / 180)
  near(Math.hypot(d.x - 10, d.y - 10), Math.hypot(100, 80))
  assert.deepEqual(grid.snapAngle({ x: 5, y: 5 }, { x: 5, y: 5 }), { x: 5, y: 5 })
})

test('nudge and free connector end wiring', () => {
  assert.match(app, /case 'nudge': return nudgeSelection\(/)
  assert.match(app, /gridNudgeDelta\(bounds, dx, dy,/)
  assert.match(app, /snapPointAngle\(gesture\.which === 'start' \? connector\.end : connector\.start, point, 15\)/)
  assert.match(app, /snapped\?\.point \?\? freePoint, snapped\)/)
})
