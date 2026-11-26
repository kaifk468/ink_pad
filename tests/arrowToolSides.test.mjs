import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const pen = await loadModule('penConnector.ts')
const app = await readAppSource()
const p = (x, y) => ({ x, y, pressure: 0.5 })
const box = (id, x, y, w = 160, h = 100, extra = {}) => ({ kind: 'rectangle', id, x, y, width: w, height: h, strokeColor: '#c00000', strokeWidth: 3, ...extra })

test('the desktop Arrow / Line tool uses the pen facing-side rule for ends inside a box', () => {
  assert.equal(typeof pen.facingSideSnap, 'function')
  const wide = [box(1, 300, 200), box(2, 700, 200)]
  const found = { point: p(780, 200), attachment: { rectangleId: 2, offsetX: 80, offsetY: 0 } } // nearest side = top
  const faced = pen.facingSideSnap(wide, found, p(750, 250), p(420, 250))
  assert.deepEqual([faced.attachment.offsetX, faced.attachment.offsetY], [0, 50])
  assert.deepEqual([faced.point.x, faced.point.y], [700, 250])
  // an end outside the box (snapped by tolerance) keeps its snap
  assert.equal(pen.facingSideSnap(wide, found, p(780, 190), p(420, 250)), found)
  // both ends in the same box, no snap, rotated box: unchanged
  assert.equal(pen.facingSideSnap(wide, found, p(750, 250), p(740, 240)), found)
  assert.equal(pen.facingSideSnap(wide, null, p(750, 250), p(420, 250)), null)
  assert.equal(pen.facingSideSnap([{ ...wide[1], angle: 0.3 }], found, p(750, 250), p(420, 250)), found)
  // vertical: a box below faces its top
  const stacked = [box(1, 0, 0), box(2, 0, 300)]
  const down = pen.facingSideSnap(stacked, { point: p(30, 300), attachment: { rectangleId: 2, offsetX: 30, offsetY: 0 } }, p(30, 330), p(80, 50))
  assert.deepEqual([down.attachment.offsetX, down.attachment.offsetY], [80, 0])
})

test('wiring: the tool applies it to both ends at move and release, desktop only, one history step', () => {
  assert.match(app, /const placeConnectorEnds = \(gesture/)
  assert.match(app, /if \(inputModeRef\.current === 'desktop' && gesture\.rawStart\) \{[\s\S]*?facingSideSnap\(boxes, startSnap, gesture\.rawStart, rawEnd\)[\s\S]*?facingSideSnap\(boxes, endSnap, rawEnd, gesture\.rawStart\)/)
  assert.equal(app.split('placeConnectorEnds(activeConnector, point)').length - 1, 2)
  assert.equal(app.split('saveHistory()\n        strokesRef.current.push(createConnector(').length - 1, 1)
  assert.match(app, /rawStart: point,\s*\n\s*snappedStart,/)
})
