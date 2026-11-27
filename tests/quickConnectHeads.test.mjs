import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

// Round 10 #250: quick-connect buttons stay clear of arrowheads on their side.
const q = await loadModule('quickConnect.ts')
const app = await readAppSource()
const pt = (x, y) => ({ x, y, pressure: 1 })
const box = { x: 100, y: 100, width: 160, height: 80 }
const arrowInto = (id, boxId, end, extra = {}) => ({ kind: 'connector', id, start: pt(0, 0), end: pt(...end), strokeColor: '#111', strokeWidth: 2, relationshipType: 'directed-association', reversed: false, endAttachment: { rectangleId: boxId, offsetX: 0, offsetY: 40 }, ...extra })

test('quickConnectHeadEnds lists only arrowhead tips attached to the box', () => {
  const ends = q.quickConnectHeadEnds([arrowInto(1, 9, [100, 140]), arrowInto(2, 9, [100, 150], { relationshipType: 'association' }), arrowInto(3, 8, [100, 160])], 9)
  assert.deepEqual(ends.map((e) => [e.x, e.y]), [[100, 140]])
})

test('left button slides off an arrowhead that ends on the left side, at every zoom, both modes', () => {
  for (const scale of [0.5, 1, 2]) for (const tablet of [false, true]) {
    const tip = pt(100, 140)
    const free = q.quickConnectButtons(box, scale, undefined, tablet).find((b) => b.direction === 'left')
    const moved = q.quickConnectButtons(box, scale, undefined, tablet, [tip]).find((b) => b.direction === 'left')
    assert.equal(moved.center.x, free.center.x)
    assert.ok(Math.abs(moved.center.y - tip.y) >= moved.radius + q.QUICK_CONNECT_HEAD_CLEAR_PX / scale - 1e-9)
    assert.equal(q.hitQuickConnect(box, moved.center, scale, undefined, tablet, [tip]), 'left')
    assert.equal(q.hitQuickConnect(box, free.center, scale, undefined, tablet, [tip]), null)
  }
})

test('buttons are unchanged without heads, for heads on other sides, and for tips far along the side', () => {
  const base = q.quickConnectButtons(box, 1)
  assert.deepEqual(q.quickConnectButtons(box, 1, undefined, false, []), base)
  const rightTip = q.quickConnectButtons(box, 1, undefined, false, [pt(260, 140)])
  assert.deepEqual(rightTip.filter((b) => b.direction !== 'right'), base.filter((b) => b.direction !== 'right'))
  assert.notEqual(rightTip.find((b) => b.direction === 'right').center.y, 140)
  assert.equal(q.quickConnectButtons(box, 1, undefined, false, [pt(100, 105)]).find((b) => b.direction === 'left').center.y, 140)
})

test('two heads on the left side: the button clears both', () => {
  const tips = [pt(100, 140), pt(100, 164)]
  const b = q.quickConnectButtons(box, 1, undefined, false, tips).find((x) => x.direction === 'left')
  for (const t of tips) assert.ok(Math.abs(b.center.y - t.y) >= b.radius + q.QUICK_CONNECT_HEAD_CLEAR_PX - 1e-9)
})

test('wiring: head ends are passed to the draw and both hit paths', () => {
  assert.match(app, /quickConnectHeadEnds\(strokesRef\.current, quickSource\.id\)/)
  assert.match(app, /quickConnectHeadEnds\(strokesRef\.current, source\.id\)/)
  assert.match(app, /quickConnectHeadEnds\(strokesRef\.current, quickBox\.id\)/)
})
