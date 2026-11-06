import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const live = await loadModule('app/liveStroke.ts')
const curves = await loadModule('strokeCurves.ts')
const samples = await loadModule('pointerSamples.ts')

/** A 2D context stand-in that records drawing calls. */
function recordingCanvas(width, height) {
  const calls = []
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key]
      return (...args) => { calls.push([key, ...args]) }
    },
    set(target, key, value) { target[key] = value; return true },
  })
  return { width, height, calls, getContext: () => ctx, ctx }
}

const W = 2400
const H = 1300
const transform = { scale: 1.1, offsetX: 40, offsetY: 30, dpr: 2 }
const clip = { x: -125, y: -75, width: 2750, height: 1650 }

/** Handwriting-like stroke: loops moving right, many points. */
function handwriting(count) {
  return Array.from({ length: count }, (_, i) => ({ x: 100 + i * 0.9 + Math.sin(i / 4) * 9, y: 300 + Math.cos(i / 3) * 14, pressure: 0.4 + 0.2 * Math.sin(i / 7) }))
}

function writeStroke(points, predictedFor = () => [], step = 3) {
  const page = recordingCanvas(W, H)
  const base = recordingCanvas(W, H)
  const layer = recordingCanvas(W, H)
  const stroke = { kind: 'stroke', id: 7, color: '#202124', width: 2, erase: false, points: [] }
  const state = live.createLiveStrokeState(7)
  const rects = []
  for (let i = 0; i < points.length; i += step) {
    stroke.points.push(...points.slice(i, i + step))
    const pageCallsBefore = page.calls.length
    const rect = live.drawLiveStrokeFrame({ page: page.ctx, base, live: layer, stroke, predicted: predictedFor(stroke.points), state, transform, clip })
    rects.push({ rect, pageStrokes: page.calls.slice(pageCallsBefore).filter(([name]) => name === 'stroke').length, prevTail: null })
  }
  return { page, layer, stroke, state, rects }
}

test('every final span is drawn once onto the live layer, matching the full Raw drawing', () => {
  const points = handwriting(240)
  const { layer, state } = writeStroke(points)
  assert.equal(state.drawnFinal, points.length - 2)
  const strokes = layer.calls.filter(([name]) => name === 'stroke').length
  assert.equal(strokes, points.length - 2)
  const expected = curves.buildInterpolatingCurve(points).slice(0, points.length - 2)
  const drawn = layer.calls.filter(([name]) => name === 'bezierCurveTo' || name === 'lineTo').map((call) => call.slice(-2))
  assert.deepEqual(drawn, expected.map((segment) => [segment.to.x, segment.to.y]))
})

test('each frame repaints only a small box, however long the stroke gets', () => {
  const short = writeStroke(handwriting(30))
  const long = writeStroke(handwriting(1500))
  const area = (r) => (r ? r.width * r.height : 0)
  const maxShort = Math.max(...short.rects.map((f) => area(f.rect)))
  const lateLong = long.rects.slice(-100).map((f) => area(f.rect))
  assert.ok(Math.max(...lateLong) <= maxShort * 2, `late frames of a long stroke repaint ${Math.max(...lateLong)} px², a short stroke ${maxShort}`)
  assert.ok(Math.max(...lateLong) < W * H / 50)
  // the page gets only the changing tail each frame: one span without prediction
  assert.ok(long.rects.every((f) => f.pageStrokes <= 1))
})

test('the repaint covers the previous tail so no stale preview is left behind', () => {
  const points = handwriting(60)
  const page = recordingCanvas(W, H)
  const stroke = { kind: 'stroke', id: 1, color: '#000', width: 3, erase: false, points: [] }
  const state = live.createLiveStrokeState(1)
  const args = { page: page.ctx, base: recordingCanvas(W, H), live: recordingCanvas(W, H), stroke, state, transform, clip }
  for (let i = 0; i < points.length; i += 2) {
    stroke.points.push(points[i], points[i + 1])
    const previousTail = state.tailRect
    const predicted = [{ x: points[i + 1].x + 6, y: points[i + 1].y - 4, pressure: 0.5 }]
    const rect = live.drawLiveStrokeFrame({ ...args, predicted })
    if (previousTail) {
      assert.ok(rect.x <= previousTail.x && rect.y <= previousTail.y, 'covers the old tail')
      assert.ok(rect.x + rect.width >= Math.min(W, previousTail.x + previousTail.width) && rect.y + rect.height >= Math.min(H, previousTail.y + previousTail.height))
    }
  }
})

test('a one-point stroke shows a dot, and predicted points extend the tail without becoming final', () => {
  const page = recordingCanvas(W, H)
  const stroke = { kind: 'stroke', id: 1, color: '#000', width: 2, erase: false, points: [{ x: 50, y: 50, pressure: 0.5 }] }
  const state = live.createLiveStrokeState(1)
  const args = { page: page.ctx, base: recordingCanvas(W, H), live: recordingCanvas(W, H), stroke, state, transform, clip }
  live.drawLiveStrokeFrame({ ...args, predicted: [] })
  assert.ok(page.calls.some(([name]) => name === 'arc'))
  stroke.points.push({ x: 54, y: 52, pressure: 0.5 })
  const before = page.calls.length
  live.drawLiveStrokeFrame({ ...args, predicted: [{ x: 58, y: 54, pressure: 0.5 }, { x: 62, y: 56, pressure: 0.5 }] })
  assert.equal(page.calls.slice(before).filter(([name]) => name === 'stroke').length, 3, 'last real span plus two predicted spans')
  assert.equal(state.drawnFinal, 0, 'nothing is final with two points')
})

test('tail points start one point before the last span so its curve matches the final one', () => {
  const points = handwriting(10)
  const tail = live.tailPoints(points, [])
  assert.deepEqual(tail.points, points.slice(7))
  assert.equal(tail.first, 1)
  const fromTail = curves.buildInterpolatingSegment(tail.points, tail.first)
  const fromFull = curves.buildInterpolatingCurve(points)[8]
  assert.deepEqual(fromTail, fromFull)
  assert.deepEqual(live.tailPoints(points.slice(0, 2), []).first, 0)
  const withDuplicate = live.tailPoints(points, [points[9], { x: 1, y: 2, pressure: 0 }])
  assert.equal(withDuplicate.points.length, 4, 'a predicted point equal to the last real one is skipped')
})

test('predicted pen points: limited count and distance, inside the workspace, last real pressure', () => {
  const event = (positions) => ({ getPredictedEvents: () => positions.map(([clientX, clientY]) => ({ clientX, clientY, pressure: 0 })) })
  const toCanvas = (x, y) => (x > 500 ? null : { x, y, pressure: 0 })
  const last = { x: 100, y: 100, pressure: 0.6 }
  assert.deepEqual(samples.getPredictedPoints(event([[104, 100], [108, 100]]), toCanvas, last, 40), [{ x: 104, y: 100, pressure: 0.6 }, { x: 108, y: 100, pressure: 0.6 }])
  assert.equal(samples.getPredictedPoints(event([[101, 100], [102, 100], [103, 100], [104, 100], [105, 100]]), toCanvas, last, 40).length, samples.MAX_PREDICTED_POINTS)
  assert.deepEqual(samples.getPredictedPoints(event([[110, 100], [200, 100], [112, 100]]), toCanvas, last, 40).map((p) => p.x), [110])
  assert.deepEqual(samples.getPredictedPoints(event([[490, 100], [510, 100]]), toCanvas, { ...last, x: 480 }, 40).map((p) => p.x), [490])
  assert.deepEqual(samples.getPredictedPoints({}, toCanvas, last, 40), [])
})
