import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const { changeBoxShape, changeSelectedShapes } = await loadModule('changeShape.ts')
const { canvasItemKey } = await loadModule('canvasModel.ts')
const docFormat = await loadModule('documentFormat.ts')

const box = (id, extra = {}) => ({ kind: 'rectangle', id, x: 10, y: 20, width: 100, height: 60, strokeColor: '#c2255c', strokeWidth: 4, ...extra })
const hld = (id, shape, extra = {}) => box(id, { inkBox: { top: 40, mid: 60, ink: [] }, hldShape: shape, ...extra })
const keys = (...items) => new Set(items.map(canvasItemKey))

const roundTrip = (item) => {
  const created = docFormat.createDocument({ title: 't', template: 'blank', background: 'white', items: [item] })
  const parsed = docFormat.parseDocument(docFormat.stringifyDocument(created))
  assert.equal(parsed.ok, true)
  return parsed.document.items[0]
}
const HLD = ['database', 'queue', 'service', 'user', 'browser', 'mobile', 'cache', 'loadBalancer', 'cdn']
const PLAIN = ['rectangle', 'diamond', 'ellipse']

test('every shape change survives a save/load round trip unchanged (fill and seed go with non-fillable targets)', () => {
  for (const from of HLD) {
    for (const to of HLD) {
      if (from === to) continue
      const changed = changeBoxShape(hld(1, from, { fillColor: '#ffec99', seed: 12 }), to)
      assert.deepEqual(roundTrip(changed), changed, `${from} -> ${to}`)
      if (to === 'database' || to === 'queue') assert.equal(changed.fillColor, '#ffec99')
      else { assert.equal(changed.fillColor, undefined); assert.equal(changed.seed, undefined) }
    }
  }
  for (const from of PLAIN) {
    for (const to of PLAIN) {
      if (from === to) continue
      const b = box(1, { fillColor: '#a5d8ff', seed: 5, ...(from === 'diamond' ? { diamond: true } : {}), ...(from === 'ellipse' ? { ellipse: true } : {}) })
      const changed = changeBoxShape(b, to)
      assert.deepEqual(roundTrip(changed), changed, `${from} -> ${to}`)
      assert.equal(changed.fillColor, '#a5d8ff')
    }
  }
})

const p = (x, y) => ({ x, y, pressure: 0.5 })
const conn = (id, start, end, extra = {}) => ({ kind: 'connector', id, start: p(...start), end: p(...end), strokeColor: '#111', strokeWidth: 2, ...extra })

test('connector ends near a corner move onto the new outline in the same change', () => {
  const b = box(1) // x 10..110, y 20..80
  const c = conn(2, [200, 50], [12, 22], { endAttachment: { rectangleId: 1, offsetX: 2, offsetY: 2 }, bend: 10 })
  const moved = changeSelectedShapes([b, c], keys(b), 'diamond')[1]
  assert.notEqual(moved, c)
  assert.ok(Math.abs(Math.abs(moved.end.x - 60) / 50 + Math.abs(moved.end.y - 50) / 30 - 1) < 1e-6)
  assert.equal(moved.end.pressure, 0.5)
  assert.deepEqual(moved.start, c.start)
  assert.equal(moved.endAttachment.rectangleId, 1)
  assert.ok(Math.abs(moved.endAttachment.offsetX - (moved.end.x - 10)) < 1e-9)
  assert.ok(Math.abs(moved.endAttachment.offsetY - (moved.end.y - 20)) < 1e-9)
  assert.equal(moved.bend, undefined)
  const e = changeSelectedShapes([b, c], keys(b), 'ellipse')[1].end
  assert.ok(Math.abs(((e.x - 60) / 50) ** 2 + ((e.y - 50) / 30) ** 2 - 1) < 1e-6)
})

test('connector ends on a side midpoint, unattached ends and locked connectors stay put', () => {
  const b = box(1)
  const mid = conn(2, [200, 50], [110, 50], { endAttachment: { rectangleId: 1, offsetX: 100, offsetY: 30 } })
  const free = conn(3, [200, 50], [12, 22])
  const locked = conn(4, [200, 50], [12, 22], { endAttachment: { rectangleId: 1, offsetX: 2, offsetY: 2 }, locked: true })
  const next = changeSelectedShapes([b, mid, free, locked], keys(b), 'diamond')
  assert.equal(next[1], mid)
  assert.equal(next[2], free)
  assert.equal(next[3], locked)
})
