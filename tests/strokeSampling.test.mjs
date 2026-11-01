import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import { readAppSource } from './helpers/appSource.mjs'

async function importTypeScript(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
}

const sampling = await importTypeScript('../src/strokeSampling.ts')
const pointerSamples = await importTypeScript('../src/pointerSamples.ts')
const appSource = await readAppSource()
const point = (x, y, pressure = 0.5) => ({ x, y, pressure })
const pointerEvent = (x, y, pressure, timeStamp, coalesced = []) => ({
  clientX: x,
  clientY: y,
  pressure,
  timeStamp,
  getCoalescedEvents: () => coalesced,
})

test('retains every distinct subpixel coordinate movement', () => {
  assert.equal(sampling.shouldAppendStrokeSample(point(0, 0), point(0.1, 0.1)), true)
  assert.equal(sampling.shouldAppendStrokeSample(point(0, 0), point(0.49, 0)), true)
  assert.equal(sampling.shouldAppendStrokeSample(point(0, 0), point(0, 0)), false)
})

test('retains pressure changes at a stationary coordinate', () => {
  assert.equal(sampling.shouldAppendStrokeSample(point(12, 8, 0.2), point(12, 8, 0.7)), true)
  assert.equal(sampling.shouldAppendStrokeSample(point(12, 8, 0.7), point(12, 8, 0.7)), false)
})

test('uses coalesced pointer events in original order and retains native values', () => {
  const first = pointerEvent(10.1, 20.2, 0.2, 100)
  const second = pointerEvent(10.4, 20.8, 0.7, 104)
  const dispatched = pointerEvent(10.8, 21.1, 0.9, 108, [first, second])
  const captured = pointerSamples.getPointerSamples(dispatched)

  assert.deepEqual(captured, [first, second, dispatched])
  assert.deepEqual(captured.map(({ clientX, clientY, pressure, timeStamp }) => ({ clientX, clientY, pressure, timeStamp })), [
    { clientX: 10.1, clientY: 20.2, pressure: 0.2, timeStamp: 100 },
    { clientX: 10.4, clientY: 20.8, pressure: 0.7, timeStamp: 104 },
    { clientX: 10.8, clientY: 21.1, pressure: 0.9, timeStamp: 108 },
  ])
})

test('does not duplicate the dispatched event when it is already the final coalesced sample', () => {
  const first = pointerEvent(1, 2, 0.3, 200)
  const dispatched = pointerEvent(3, 4, 0.8, 204)
  dispatched.getCoalescedEvents = () => [first, dispatched]

  assert.deepEqual(pointerSamples.getPointerSamples(dispatched), [first, dispatched])
})

test('falls back to the dispatched event when coalesced events are unavailable or empty', () => {
  const dispatched = { clientX: 5, clientY: 6, pressure: 0.5, timeStamp: 300 }
  assert.deepEqual(pointerSamples.getPointerSamples(dispatched), [dispatched])
  const emptyCoalesced = { ...dispatched, getCoalescedEvents: () => [] }
  assert.deepEqual(pointerSamples.getPointerSamples(emptyCoalesced), [emptyCoalesced])
})

test('freehand stores the existing Point shape and consumes captured native samples', async () => {
  assert.match(appSource, /const samples = getPointerSamples\(event\.nativeEvent\)/)
  assert.match(appSource, /shouldAppendStrokeSample\(previous, clippedPoint\)/)
  const model = await readFile(new URL('../src/canvasModel.ts', import.meta.url), 'utf8')
  assert.match(model, /export type Point = \{ x: number; y: number; pressure: number \}/)
})
