import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const fit = await loadModule('textFit.ts')
const flow = await loadModule('diagramFlow.ts')
const layout = await loadModule('textLayout.ts')
const app = await readAppSource()

// 0.5em per character.
const measureFor = (size) => (line) => line.length * size * 0.5
const box = (over = {}) => ({ kind: 'rectangle', id: 1, x: 0, y: 0, width: 300, height: 120, strokeColor: '#111', strokeWidth: 2, ...over })
const label = (text, size, over = {}) => {
  const m = layout.measureTextSize(text, size, measureFor(size))
  return { kind: 'text', id: 2, x: 0, y: 0, width: m.width, height: m.height, text, fontSize: size, color: '#111', ...over }
}
const centred = (b, l) => ({ ...l, x: b.x + b.width / 2 - l.width / 2, y: b.y + b.height / 2 - l.height / 2 })

test('refitLabelToShape: a label that still fits is returned untouched', () => {
  const l = centred(box(), label('Hello', 24))
  assert.equal(fit.refitLabelToShape(l, box(), measureFor), l)
})

test('refitLabelToShape: a label too big for the smaller box shrinks, never below FIT_MIN_SIZE, then wraps', () => {
  const small = box({ width: 140, height: 60 }) // inner 120 x 40
  const shrunk = fit.refitLabelToShape(label('x'.repeat(16), 24), small, measureFor) // 16 * 0.5 * s <= 120 -> s <= 15
  assert.equal(shrunk.fontSize, 14)
  assert.ok(shrunk.width <= 120 && shrunk.height <= 40)
  assert.equal(shrunk.fit, undefined)
  const tiny = box({ width: 100, height: 80 }) // inner 80 x 60
  const wrapped = fit.refitLabelToShape(label('word '.repeat(12).trim(), 24), tiny, measureFor)
  assert.equal(wrapped.fontSize, fit.FIT_MIN_SIZE)
  assert.equal(wrapped.fit, 'wrap')
  assert.equal(wrapped.width, 80)
})

test('refitLabelToShape: fit off is the user choice; a bigger box never enlarges text', () => {
  const small = box({ width: 100, height: 50 })
  const off = label('x'.repeat(20), 24, { fit: 'off' })
  assert.equal(fit.refitLabelToShape(off, small, measureFor), off)
  const l = label('Hi', 12)
  assert.equal(fit.refitLabelToShape(l, box({ width: 900, height: 400 }), measureFor), l)
})

test('followResizeLabels with a measure: refits on shrink, keeps the centre, original items untouched', () => {
  const old = { x: 0, y: 0, width: 300, height: 120 }
  const smaller = { x: 0, y: 0, width: 140, height: 60 }
  const original = [box(), centred(box(), label('x'.repeat(16), 24))]
  const resized = [box(smaller), original[1]]
  const out = flow.followResizeLabels(resized, 1, old, smaller, ['text:2'], measureFor)
  assert.equal(out[1].fontSize, 14)
  assert.ok(Math.abs(out[1].x + out[1].width / 2 - 70) < 1e-9 && Math.abs(out[1].y + out[1].height / 2 - 30) < 1e-9)
  assert.equal(original[1].fontSize, 24)
  // Dragging back to the original size restores the original label (the drag recomputes from the start items).
  const back = flow.followResizeLabels([box(), original[1]], 1, old, old, ['text:2'], measureFor)
  assert.equal(back[1], original[1])
  // Without a measure nothing is refitted (old behaviour).
  assert.equal(flow.followResizeLabels(resized, 1, old, smaller, ['text:2'])[1].fontSize, 24)
})

test('App wiring: the resize passes the measure and adds no history of its own', () => {
  assert.match(app, /followResizeLabels\(resized, activeResize\.rectangleId, original, bounds, activeResize\.labelKeys, createTextMeasure\)/)
})
