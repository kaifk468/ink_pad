import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const pen = await loadModule('penConnector.ts')
const recognition = await loadModule('shapeRecognition.ts')
const app = await readAppSource()

const p = (x, y) => ({ x, y, pressure: 0.5 })
const box = (id, x, y, w = 100, h = 60, extra = {}) => ({ kind: 'rectangle', id, x, y, width: w, height: h, strokeColor: '#c00000', strokeWidth: 3, ...extra })
const style = { id: 9, color: '#123456', width: 5 }
const items = [box(1, 0, 0), box(2, 400, 0)]

test('arrow with the tail or tip on a box becomes a directed connector', () => {
  const both = pen.penConnectorFor(items, 'arrow', p(50, 30), p(450, 30), style, 36)
  assert.equal(both.kind, 'connector')
  assert.equal(both.relationshipType, 'directed-association')
  assert.equal(both.startAttachment.rectangleId, 1)
  assert.equal(both.endAttachment.rectangleId, 2)
  const tipOnly = pen.penConnectorFor(items, 'arrow', p(250, 300), p(450, 30), { ...style, dash: 'dashed' }, 36)
  assert.equal(tipOnly.startAttachment, undefined)
  assert.equal(tipOnly.endAttachment.rectangleId, 2)
  assert.equal(tipOnly.dash, 'dashed')
})

test('arrow in empty space stays a stroke', () => {
  assert.equal(pen.penConnectorFor(items, 'arrow', p(250, 300), p(260, 500), style, 36), null)
  assert.equal(pen.penConnectorFor([], 'arrow', p(50, 30), p(450, 30), style, 36), null)
})

test('line: one end on a box stays a stroke, two different boxes make a plain connector, same box stays a stroke', () => {
  assert.equal(pen.penConnectorFor(items, 'line', p(50, 30), p(250, 300), style, 36), null)
  const both = pen.penConnectorFor(items, 'line', p(50, 30), p(450, 30), style, 36)
  assert.equal(both.relationshipType, 'association')
  assert.equal(both.startAttachment.rectangleId, 1)
  assert.equal(both.endAttachment.rectangleId, 2)
  assert.equal(pen.penConnectorFor(items, 'line', p(20, 30), p(80, 30), style, 36), null)
})

test('class boxes and ink boxes are not targets; HLD shapes are', () => {
  const klass = box(1, 0, 0, 100, 60, { classBox: { name: 'A', attributes: '', methods: '' } })
  assert.equal(pen.penConnectorFor([klass], 'arrow', p(50, 30), p(500, 500), style, 36), null)
  const hld = box(1, 0, 0, 120, 80, { hldShape: 'database', inkBox: { top: 12, mid: 40, ink: [] } })
  assert.equal(pen.penConnectorFor([hld], 'arrow', p(50, 30), p(500, 500), style, 36).startAttachment.rectangleId, 1)
})

test('wiring: only recognized pen arrows/lines, not the line tools, ink boxes or erasers', () => {
  assert.match(app, /penConnectorFor\(strokesRef\.current, stroke\.shape/)
  assert.match(app, /!arrowConnector && !lineTool && inkBoxId === null && stroke\.kind === 'stroke' && !stroke\.erase/)
})

const stroke = (pts) => ({ kind: 'stroke', id: 1, points: pts.map(([x, y]) => p(x, y)), color: '#000', width: 4, erase: false })
const trace = (corners, perSide = 8) => {
  const out = []
  for (let i = 0; i < corners.length; i += 1) {
    const [ax, ay] = corners[i]
    const [bx, by] = corners[(i + 1) % corners.length]
    for (let k = 0; k < perSide; k += 1) out.push([ax + ((bx - ax) * k) / perSide, ay + ((by - ay) * k) / perSide])
  }
  out.push(corners[0])
  return out
}
const jitter = (pts, amount) => pts.map(([x, y], i) => [x + Math.sin(i * 12.9) * amount, y + Math.cos(i * 7.3) * amount])

test('diamond: drawn diamonds (wide, tall, small, rough) become diamond boxes', () => {
  for (const [name, corners] of [
    ['wide', [[200, 100], [300, 150], [200, 200], [100, 150]]],
    ['tall', [[150, 50], [210, 150], [150, 250], [90, 150]]],
    ['small', [[100, 100], [140, 130], [100, 160], [60, 130]]],
  ]) {
    const exact = recognition.recognizeClosedShapeStroke(stroke(trace(corners)), 5)
    assert.equal(exact?.diamond, true, name)
    assert.equal(exact.ellipse, undefined, name)
    const rough = recognition.recognizeClosedShapeStroke(stroke(jitter(trace(corners), name === 'small' ? 1.5 : 3)), 5)
    assert.equal(rough?.diamond, true, `${name} rough`)
  }
})

test('diamond: hold preview recognises it too, after the hold time only', () => {
  const s = stroke(trace([[200, 100], [300, 150], [200, 200], [100, 150]]))
  assert.equal(recognition.recognizeClosedShapeOnHold(s, recognition.SHAPE_RECOGNITION_HOLD_MS - 1, 3), null)
  assert.equal(recognition.recognizeClosedShapeOnHold(s, recognition.SHAPE_RECOGNITION_HOLD_MS, 3).diamond, true)
})

test('diamond: rectangles, rough squares and circles are not diamonds', () => {
  const rect = recognition.recognizeClosedShapeStroke(stroke(trace([[100, 100], [220, 100], [220, 180], [100, 180]])), 5)
  assert.ok(rect && !rect.diamond && !rect.ellipse)
  const square = recognition.recognizeClosedShapeStroke(stroke(jitter(trace([[100, 100], [200, 100], [200, 200], [100, 200]]), 4)), 5)
  assert.ok(square && !square.diamond)
  const circle = []
  for (let i = 0; i <= 48; i += 1) circle.push([200 + 60 * Math.cos((i / 48) * 2 * Math.PI), 200 + 60 * Math.sin((i / 48) * 2 * Math.PI)])
  const round = recognition.recognizeClosedShapeStroke(stroke(circle), 5)
  assert.ok(round?.ellipse && !round.diamond)
})
