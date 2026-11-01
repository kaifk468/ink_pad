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

const recognition = await importTypeScript('../src/shapeRecognition.ts')
const model = await importTypeScript('../src/canvasModel.ts')
const appSource = await readAppSource()

const rectangleStroke = (overrides = {}) => ({
  kind: 'stroke',
  id: 7,
  points: [[100, 100], [150, 100], [220, 100], [220, 140], [220, 180], [160, 180], [100, 180], [100, 140], [100, 100]]
    .map(([x, y]) => ({ x, y, pressure: 0.6 })),
  color: '#3568d4',
  width: 7,
  erase: false,
  ...overrides,
})

test('default pen recognizes a closed rectangle only after the brief end hold', () => {
  const stroke = rectangleStroke()
  assert.equal(recognition.recognizeRectangleOnHold(stroke, recognition.SHAPE_RECOGNITION_HOLD_MS - 1, 12), null)
  assert.deepEqual(recognition.recognizeRectangleOnHold(stroke, recognition.SHAPE_RECOGNITION_HOLD_MS, 12), {
    kind: 'rectangle',
    id: 12,
    x: 100,
    y: 100,
    width: 120,
    height: 80,
    strokeColor: '#3568d4',
    strokeWidth: 7,
  })
})

test('automatic hold recognition rejects open loops, small shapes, and eraser paths', () => {
  const openStroke = rectangleStroke({ points: rectangleStroke().points.slice(0, -3) })
  const smallStroke = rectangleStroke({ points: rectangleStroke().points.map((point) => ({ ...point, x: (point.x - 100) / 5, y: (point.y - 100) / 5 })) })
  const eraseStroke = rectangleStroke({ erase: true })
  for (const stroke of [openStroke, smallStroke, eraseStroke]) {
    assert.equal(recognition.recognizeRectangleOnHold(stroke, recognition.SHAPE_RECOGNITION_HOLD_MS, 13), null)
  }
})

test('recognized rectangle coordinates and snapshot undo/redo remain stable', () => {
  const rectangle = recognition.recognizeRectangleOnHold(rectangleStroke(), 600, 21)
  const history = new model.CanvasSnapshotHistory()
  history.record([])
  const drawn = [rectangle]
  const undone = history.undo(drawn)
  assert.deepEqual(undone, [])
  assert.deepEqual(history.redo(undone), drawn)
  assert.deepEqual(drawn[0], {
    kind: 'rectangle',
    id: 21,
    x: 100,
    y: 100,
    width: 120,
    height: 80,
    strokeColor: '#3568d4',
    strokeWidth: 7,
  })
})

test('the default pen end-hold and live preview both use rectangle recognition', () => {
  assert.match(appSource, /recognizeRectangleOnHold\(stroke, SHAPE_RECOGNITION_HOLD_MS/)
  assert.match(appSource, /recognizeRectangleOnHold\(heldStroke, heldForMs/)
  assert.match(appSource, /clipSegmentToBounds\(previous, point\)/)
})
