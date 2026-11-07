import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import { readAppSource } from './helpers/appSource.mjs'

const source = await readFile(new URL('../src/eraserInput.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
const eraserInput = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
const modelSource = await readFile(new URL('../src/canvasModel.ts', import.meta.url), 'utf8')
const modelOutput = ts.transpileModule(modelSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
const model = await import(`data:text/javascript;base64,${Buffer.from(modelOutput).toString('base64')}`)
const appSource = await readAppSource()

test('pen hover erasing is enabled only for the contact-free standard eraser', () => {
  assert.equal(eraserInput.isPenHoverEraseInput('pen', 0, true, false), true)
  assert.equal(eraserInput.isPenHoverEraseInput('pen', 1, true, false), false)
  assert.equal(eraserInput.isPenHoverEraseInput('touch', 0, true, false), false)
  assert.equal(eraserInput.isPenHoverEraseInput('pen', 0, false, false), false)
  assert.equal(eraserInput.isPenHoverEraseInput('pen', 0, true, true), false)
})

test('hover and contact erasing create the same pressure-preserving erase stroke model', () => {
  const point = { x: 180, y: 240, pressure: 0 }
  assert.deepEqual(eraserInput.createEraserStroke(8, point, '#202124', 48), {
    kind: 'stroke',
    id: 8,
    points: [point],
    color: '#202124',
    width: 48,
    erase: true,
  })
  assert.match(appSource, /activeStrokeRef\.current = eraser\s*\? createEraserStroke/)
  assert.match(appSource, /activeStrokeRef\.current = createEraserStroke\(nextStrokeIdRef\.current\+\+, point, color, eraserSize\)/)
})

test('normal erasing still records localized erase strokes with the selected width', () => {
  const point = { x: 25, y: 32, pressure: 0 }
  const eraserStroke = eraserInput.createEraserStroke(9, point, '#202124', 72)
  assert.equal(eraserStroke.erase, true)
  assert.equal(eraserStroke.width, 72)
  assert.deepEqual(eraserStroke.points, [point])
  assert.match(appSource, /activeStrokeRef\.current = eraser\s*\? createEraserStroke/)
  assert.match(appSource, /ctx\.globalCompositeOperation = stroke\.erase \? 'destination-out' : 'source-over'/)
})

test('whole-object rub interpolates movement and reuses the complete-object hit-test deletion path', () => {
  const start = { x: 10, y: 20, pressure: 0.2 }
  const end = { x: 34, y: 20, pressure: 0.8 }
  const sweep = eraserInput.getEraserSweepPoints(start, end, 6)
  assert.equal(sweep.length, 4)
  assert.deepEqual(sweep.map(({ x }) => x), [16, 22, 28, 34])
  assert.ok(sweep.every((point, index) => index === 0 || Math.hypot(point.x - sweep[index - 1].x, point.y - sweep[index - 1].y) <= 6))
  assert.equal(sweep.at(-1).pressure, end.pressure)
  assert.match(appSource, /const deleteWholeObjectAtPoint = \(point: Point\): boolean =>/)
  assert.match(appSource, /const objectIndex = hitTestObject\(point\)/)
  assert.match(appSource, /strokesRef\.current\.splice\(objectIndex, 1\)/)
  assert.match(appSource, /detachConnectorsFromRectangles\(strokesRef\.current, new Set\(\[removedItem\.id\]\)\)/)
  assert.match(appSource, /activeObjectEraserRef\.current = \{ pointerId: event\.pointerId, lastPoint: point, changed: false \}/)
  assert.match(appSource, /getEraserSweepPoints\(objectEraseGesture\.lastPoint, point, maxSpacing\)/)
})

test('whole-object rub records one undo snapshot and redo removes the complete objects again', () => {
  const stroke = { kind: 'stroke', id: 3, points: [{ x: 10, y: 10, pressure: 0.5 }, { x: 40, y: 10, pressure: 0.5 }], color: '#202124', width: 4, erase: false }
  const connector = { kind: 'connector', id: 4, start: { x: 40, y: 10 }, end: { x: 70, y: 10 }, strokeColor: '#202124', strokeWidth: 3, relationshipType: 'association', reversed: false }
  const beforeRub = [stroke, connector]
  const afterRub = []
  const history = new model.CanvasSnapshotHistory()
  history.record(beforeRub)

  assert.deepEqual(history.undo(afterRub), beforeRub)
  assert.deepEqual(history.redo(beforeRub), afterRub)
  assert.match(appSource, /if \(!gesture\?\.changed\) saveHistory\(\)/)
})

test('erase stroke history still undoes and redoes an erase operation', () => {
  const ink = { kind: 'stroke', id: 3, points: [{ x: 20, y: 30, pressure: 0.8 }], color: '#202124', width: 4, erase: false }
  const beforeErase = [ink]
  const afterErase = [...beforeErase, eraserInput.createEraserStroke(4, { x: 20, y: 30, pressure: 0 }, '#202124', 28)]
  const history = new model.CanvasSnapshotHistory()
  history.record(beforeErase)
  const undone = history.undo(afterErase)
  assert.deepEqual(undone, beforeErase)
  assert.deepEqual(history.redo(undone), afterErase)
})

test('hover erasing is finalized on pen contact, pointer end, or leaving the canvas', () => {
  assert.match(appSource, /isPenHoverEraseInput\(event\.pointerType, event\.buttons, eraser, objectEraser\)/)
  assert.match(appSource, /activePointerRef\.current === null\s*&& touchNav\.touchCount\(\) === 0/)
  assert.match(appSource, /isPointWithinBounds\(point\) && hitTestObject\(point\) !== -1/)
  assert.match(appSource, /hoverErasePointerRef\.current === event\.pointerId\) finishStroke\(event\.pointerId\)/)
  assert.match(appSource, /onPointerLeave=\{onPointerLeave\}/)
})

test('whole-object eraser gesture is finalized on pointer up or cancellation', () => {
  assert.match(appSource, /if \(activeObjectEraserRef\.current\?\.pointerId === event\.pointerId\) \{\s*activeObjectEraserRef\.current = null\s*return\s*\}/)
})
