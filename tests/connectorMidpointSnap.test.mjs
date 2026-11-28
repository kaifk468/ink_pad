import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const m = await loadModule('canvasModel.ts')
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const pt = (x, y) => ({ x, y, pressure: 1 })
const box = (id, x, y, width, height) => ({ kind: 'rectangle', id, x, y, width, height, strokeColor: '#111', strokeWidth: 2 })

test('near a side middle the end snaps to the exact middle, with matching attachment offsets', () => {
  const big = box(1, 0, 0, 200, 100)
  const s = m.snapConnectorEndpoint(pt(108, -3), [big], 36)
  assert.deepEqual([s.point.x, s.point.y], [100, 0])
  assert.deepEqual(s.attachment, { rectangleId: 1, offsetX: 100, offsetY: 0 })
  const left = m.snapConnectorEndpoint(pt(-4, 58), [big], 36)
  assert.deepEqual([left.point.x, left.point.y], [0, 50])
  assert.deepEqual(left.attachment, { rectangleId: 1, offsetX: 0, offsetY: 50 })
})

test('inside a box the nearest outline point also magnets to the middle', () => {
  const big = box(1, 0, 0, 200, 100)
  const s = m.snapConnectorEndpoint(pt(110, 6), [big], 0, true)
  assert.deepEqual([s.point.x, s.point.y], [100, 0])
})

test('far from the middle the nearest outline point is unchanged', () => {
  const big = box(1, 0, 0, 200, 100)
  const s = m.snapConnectorEndpoint(pt(150, -3), [big], 36)
  assert.deepEqual([s.point.x, s.point.y], [150, 0])
  assert.deepEqual(s.attachment, { rectangleId: 1, offsetX: 150, offsetY: 0 })
  const inside = m.snapConnectorEndpoint(pt(130, 6), [big], 0, true)
  assert.deepEqual([inside.point.x, inside.point.y], [130, 0])
})

test('the magnet is at most 14 units and 20 percent of a small side', () => {
  const big = box(1, 0, 0, 200, 100)
  assert.equal(m.snapConnectorEndpoint(pt(114, -2), [big], 36).point.x, 100) // 14 away: magnets
  assert.ok(Math.abs(m.snapConnectorEndpoint(pt(116, -2), [big], 36).point.x - 116) < 1e-6) // 16 away: does not
  const small = box(2, 0, 0, 40, 40) // 20% of 40 = 8
  assert.equal(m.snapConnectorEndpoint(pt(28, -1), [small], 36).point.x, 20)
  assert.ok(Math.abs(m.snapConnectorEndpoint(pt(29, -1), [small], 36).point.x - 29) < 1e-6)
})

test('a corner of a small box is not pulled onto a middle', () => {
  const small = box(2, 0, 0, 40, 40)
  const s = m.snapConnectorEndpoint(pt(-2, -2), [small], 36)
  assert.deepEqual([s.point.x, s.point.y], [0, 0])
})

test('side midpoints helper returns left, right, top, bottom', () => {
  const mids = m.rectangleSideMidpoints({ x: 10, y: 20, width: 100, height: 60 }).map((e) => [e.point.x, e.point.y, e.sideLength])
  assert.deepEqual(mids, [[10, 50, 60], [110, 50, 60], [60, 20, 100], [60, 80, 100]])
})

test('midpoint dots are drawn only in the transient overlay, from the snapped target box', () => {
  assert.match(app, /drawSideMidpointDots\(ctx, targetBox, viewport\.scale\)/)
  assert.match(app, /drawSideMidpointDots\(ctx, box, scale\)/)
})
