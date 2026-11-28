import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const pen = await loadModule('penConnector.ts')
const app = await readAppSource()

const p = (x, y) => ({ x, y, pressure: 0.5 })
const box = (id, x, y, w = 100, h = 60, extra = {}) => ({ kind: 'rectangle', id, x, y, width: w, height: h, strokeColor: '#c00000', strokeWidth: 3, ...extra })
const style = { id: 9, color: '#123456', width: 5 }

test('arrow or line drawn inside one box stays a stroke (no self-loop)', () => {
  const items = [box(1, 0, 0), box(2, 400, 0)]
  assert.equal(pen.penConnectorFor(items, 'arrow', p(20, 20), p(80, 40), style, 36), null)
  assert.equal(pen.penConnectorFor(items, 'line', p(20, 20), p(80, 40), style, 36), null)
})

test('inside a boundary: inner box to inner box connects them, not the boundary', () => {
  const bounds = [box(1, 0, 0, 1000, 400), box(2, 50, 100, 100, 60), box(3, 600, 100, 100, 60)]
  const c = pen.penConnectorFor(bounds, 'arrow', p(100, 130), p(650, 130), style, 36)
  assert.equal(c.startAttachment.rectangleId, 2)
  assert.equal(c.endAttachment.rectangleId, 3)
  const out = pen.penConnectorFor(bounds, 'arrow', p(400, 300), p(650, 130), style, 36)
  assert.equal(out.endAttachment.rectangleId, 3)
  assert.equal(pen.penConnectorFor(bounds, 'arrow', p(300, 300), p(400, 320), style, 36), null)
})

test('a point in a boundary prefers a nested box within tolerance', () => {
  const bounds = [box(1, 0, 0, 1000, 400), box(2, 50, 100, 100, 60), box(3, 600, 100, 100, 60)]
  const c = pen.penConnectorFor(bounds, 'arrow', p(160, 130), p(650, 130), style, 36)
  assert.equal(c.startAttachment.rectangleId, 2)
})

test('App wiring: a pen connector does not switch tool or Shapes mode; hold preview carries the default style', () => {
  assert.match(app, /let selectDesktopArrow = false/)
  assert.match(app, /selectDesktopArrow = true/)
  assert.match(app, /if \(selectDesktopArrow && !toolLockRef\.current\) selectNewConnectorRef\.current\(/)
  assert.match(app, /shapePreviewRef\.current = styleNewShape\(recognized\)/)
})
