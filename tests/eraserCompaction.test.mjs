import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
const js = (src) => ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
const visible = js(await read('app/visibleInk.ts'))
const compaction = js(await read('app/eraserCompaction.ts')).replace("from './visibleInk'", `from 'data:text/javascript;base64,${Buffer.from(visible).toString('base64')}'`)
const { compactAfterErase } = await import(`data:text/javascript;base64,${Buffer.from(compaction).toString('base64')}`)
const app = await read('App.tsx')

let id = 100
const nextId = () => id++
const line = (x0, y0, x1, y1, n, extra = {}) => ({ kind: 'stroke', id: extra.id ?? 1, color: '#000', width: 3, erase: false, points: Array.from({ length: n }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / (n - 1), y: y0 + ((y1 - y0) * i) / (n - 1), pressure: 0.5 })), ...extra })
const eraser = (x0, y0, x1, y1, width = 28) => line(x0, y0, x1, y1, Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4)), { id: 999, erase: true, width })

test('ink completely under the eraser is deleted, and the eraser with it', () => {
  const items = [line(100, 100, 200, 100, 30, { id: 1 }), eraser(80, 100, 220, 100)]
  assert.deepEqual(compactAfterErase(items, nextId), [])
})

test('ink the eraser does not reach is untouched and the same array is returned', () => {
  const items = [line(100, 100, 200, 100, 30), eraser(100, 300, 200, 300)]
  const result = compactAfterErase(items, nextId)
  assert.equal(result[0], items[0])
  assert.equal(result.length, 1, 'an eraser that touches nothing is dropped')
})

test('the hidden middle of a partly erased stroke is cut out and the eraser stays to make the clean edge', () => {
  const items = [line(0, 100, 300, 100, 61, { id: 5 }), eraser(100, 100, 200, 100)]
  const result = compactAfterErase(items, nextId)
  const strokes = result.filter((item) => !item.erase)
  assert.equal(strokes.length, 2)
  assert.equal(strokes[0].id, 5)
  assert.notEqual(strokes[1].id, 5)
  assert.ok(strokes[0].points.length < 61 && strokes[1].points.length < 61)
  assert.ok(strokes[0].points.length + strokes[1].points.length < 61 - 10, 'the hidden points are gone')
  // the pieces still reach into the erased area so the cut edge is made by the eraser
  assert.ok(Math.max(...strokes[0].points.map((p) => p.x)) >= 93 && Math.min(...strokes[1].points.map((p) => p.x)) <= 207)
  assert.equal(result[result.length - 1].erase, true)
})

test('a stroke that only brushes the eraser edge is kept whole', () => {
  const items = [line(0, 120, 300, 120, 61), eraser(100, 100, 200, 100, 28)]
  const result = compactAfterErase(items, nextId)
  assert.equal(result[0].points.length, 61)
})

test('a thick pen line is not removed when only its centre is under a thin eraser', () => {
  const items = [line(100, 100, 200, 100, 30, { width: 40 }), eraser(80, 100, 220, 100, 28)]
  const result = compactAfterErase(items, nextId)
  assert.equal(result.length, 2)
})

test('older erasers whose ink has just been removed are dropped as well', () => {
  const items = [line(100, 100, 200, 100, 30, { id: 1 }), eraser(140, 100, 160, 100, 12), eraser(80, 100, 220, 100)]
  // the first eraser notches the line, so keep the intermediate result realistic by compacting step by step
  const first = compactAfterErase(items.slice(0, 2), nextId)
  const second = compactAfterErase([...first, items[2]], nextId)
  assert.deepEqual(second, [])
})

test('shapes, text and rectangles keep an eraser that touches them', () => {
  const rectangle = { kind: 'rectangle', id: 1, x: 100, y: 100, width: 100, height: 60, strokeColor: '#000', strokeWidth: 3 }
  const items = [rectangle, eraser(90, 130, 130, 130)]
  const result = compactAfterErase(items, nextId)
  assert.equal(result.length, 2)
})

test('a non-eraser last item changes nothing', () => {
  const items = [line(0, 0, 10, 10, 5)]
  assert.equal(compactAfterErase(items, nextId), items)
})

test('finishing an eraser stroke runs the cleanup inside the same undo step', () => {
  assert.match(app, /strokesRef\.current\.push\(stroke\)\n\s+if \(stroke\.kind === 'stroke' && stroke\.erase\) strokesRef\.current = compactAfterErase\(strokesRef\.current, \(\) => nextStrokeIdRef\.current\+\+\)/)
  // history is recorded before the eraser stroke is added, so one undo brings back everything that was erased
  assert.match(app, /saveHistory\(\)\n\s+let stroke = shapePreviewRef\.current/)
})
