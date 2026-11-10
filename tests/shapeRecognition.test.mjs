import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import { readAppSource } from './helpers/appSource.mjs'
import { loadModule } from './helpers/loadModule.mjs'

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

test('the default pen end-hold, live preview and Shapes tool all use closed-shape (oval, circle, rectangle) recognition', () => {
  assert.match(appSource, /recognizeClosedShapeOnHold\(stroke, SHAPE_RECOGNITION_HOLD_MS/)
  assert.match(appSource, /recognizeClosedShapeOnHold\(heldStroke, heldForMs/)
  assert.match(appSource, /recognizeClosedShapeStroke\(stroke, nextRectangleIdRef\.current\)/)
  assert.match(appSource, /clipSegmentToBounds\(previous, point, workspaceBoundsRef\.current\)/)
})

// ---- Ovals and circles ----

const exp = await loadModule('sheetExport.ts')
const format = await loadModule('documentFormat.ts')
const modelModule = await loadModule('canvasModel.ts')
const rendererSource = await readFile(new URL('../src/app/canvasRenderer.ts', import.meta.url), 'utf8')

const pen = (x, y) => ({ x, y, pressure: 0.6 })
/** A hand-drawn-looking closed curve: slow wobble in the radius, a little pen jitter, start anywhere, overshoot or gap by `turns`. */
function loop({ cx = 400, cy = 400, a, b = a, tilt = 0, turns = 1.03, wobble = 0.04, jitter = 1, start = 0.7, direction = 1, color = '#3568d4', width = 5 }) {
  const count = Math.max(40, Math.round((2 * Math.PI * Math.max(a, b) * turns) / 4))
  const points = []
  for (let index = 0; index <= count; index += 1) {
    const angle = start + (direction * 2 * Math.PI * turns * index) / count
    const k = 1 + wobble * (0.6 * Math.sin(2 * angle + 1.1) + 0.4 * Math.sin(3 * angle + 2.3))
    const x = a * k * Math.cos(angle)
    const y = b * k * Math.sin(angle)
    points.push(pen(
      cx + x * Math.cos(tilt) - y * Math.sin(tilt) + jitter * Math.sin(index * 2.7),
      cy + x * Math.sin(tilt) + y * Math.cos(tilt) + jitter * Math.cos(index * 3.1),
    ))
  }
  return { kind: 'stroke', id: 3, points, color, width, erase: false }
}

test('a round closed stroke becomes a circle, a plain tagged rectangle at the mean size, only after the hold', () => {
  const stroke = loop({ a: 100 })
  assert.equal(recognition.recognizeClosedShapeOnHold(stroke, recognition.SHAPE_RECOGNITION_HOLD_MS - 1, 31), null)
  const circle = recognition.recognizeClosedShapeOnHold(stroke, recognition.SHAPE_RECOGNITION_HOLD_MS, 31)
  assert.equal(circle.kind, 'rectangle')
  assert.equal(circle.ellipse, true)
  assert.equal(circle.id, 31)
  assert.equal(circle.strokeColor, '#3568d4')
  assert.equal(circle.strokeWidth, 5)
  assert.equal(circle.width, circle.height)
  assert.ok(Math.abs(circle.width - 200) < 12, `diameter ${circle.width}`)
  assert.ok(Math.abs(circle.x + circle.width / 2 - 400) < 6 && Math.abs(circle.y + circle.height / 2 - 400) < 6, 'centred on the drawing')
  assert.equal(circle.classBox, undefined)
  assert.equal(circle.inkBox, undefined)
})

test('ovals keep the size drawn and stand upright, whatever the tilt', () => {
  const wide = recognition.recognizeClosedShapeStroke(loop({ a: 120, b: 60 }), 1)
  assert.equal(wide.ellipse, true)
  assert.ok(Math.abs(wide.width - 240) < 14 && Math.abs(wide.height - 120) < 10, `${wide.width} x ${wide.height}`)
  for (const tilt of [Math.PI / 12, Math.PI / 6, Math.PI / 4.5]) {
    const tilted = recognition.recognizeClosedShapeStroke(loop({ a: 120, b: 60, tilt }), 1)
    assert.equal(tilted.ellipse, true, `tilt ${tilt}`)
    assert.ok(tilted.width > tilted.height * 1.6, `tilt ${tilt}: ${tilted.width} x ${tilted.height}`)
    assert.ok(Math.abs(tilted.width - 240) < 16 && Math.abs(tilted.height - 120) < 12, `tilt ${tilt}: ${tilted.width} x ${tilted.height}`)
  }
  const tall = recognition.recognizeClosedShapeStroke(loop({ a: 120, b: 60, tilt: Math.PI / 2 }), 1)
  assert.equal(tall.ellipse, true)
  assert.ok(tall.height > tall.width * 1.6)
  // 45 degrees keeps its long and short sides: it must not turn into a circle just because the box of the stroke is square
  const diagonal = recognition.recognizeClosedShapeStroke(loop({ a: 120, b: 60, tilt: Math.PI / 4 }), 1)
  assert.equal(diagonal.ellipse, true)
  assert.ok(Math.max(diagonal.width, diagonal.height) > 1.6 * Math.min(diagonal.width, diagonal.height))
})

test('nearly round snaps to a perfect circle, clearly oval stays an oval', () => {
  const near = recognition.recognizeClosedShapeStroke(loop({ a: 100, b: 92, wobble: 0, jitter: 0 }), 1)
  assert.equal(near.width, near.height)
  assert.ok(Math.abs(near.width - 192) < 2, `mean of 200 and 184, got ${near.width}`)
  const edge = recognition.recognizeClosedShapeStroke(loop({ a: 100, b: 78, wobble: 0, jitter: 0 }), 1)
  assert.notEqual(edge.width, edge.height)
  assert.ok(Math.abs(edge.width - 200) < 2 && Math.abs(edge.height - 156) < 2)
  assert.equal(recognition.CIRCLE_SNAP_TOLERANCE, 0.12)
})

test('hand-drawn circles and ovals are caught: wobble, overshoot, a small gap, either direction, any start', () => {
  let caught = 0
  let total = 0
  for (const wobble of [0.02, 0.05, 0.08]) {
    for (const turns of [0.93, 1.0, 1.1]) {
      for (const direction of [1, -1]) {
        for (const start of [0, 1.9, 4.2]) {
          for (const [a, b] of [[90, 90], [140, 140], [150, 75], [60, 40]]) {
            total += 1
            const shape = recognition.recognizeClosedShapeStroke(loop({ a, b, wobble, turns, direction, start }), 1)
            if (shape?.ellipse === true) caught += 1
          }
        }
      }
    }
  }
  assert.equal(caught, total, `${caught} of ${total}`)
})

test('rectangles and squares stay rectangles, also hand-drawn with round corners', () => {
  const plain = recognition.recognizeClosedShapeStroke(rectangleStroke(), 40)
  assert.deepEqual(plain, { kind: 'rectangle', id: 40, x: 100, y: 100, width: 120, height: 80, strokeColor: '#3568d4', strokeWidth: 7 })
  assert.equal('ellipse' in plain, false)
  const square = rectangleStroke({ points: [[100, 100], [140, 101], [180, 99], [220, 100], [221, 140], [219, 180], [220, 220], [180, 221], [140, 219], [100, 220], [99, 180], [101, 140], [100, 102]].map(([x, y]) => pen(x, y)) })
  assert.equal(recognition.recognizeClosedShapeStroke(square, 41).ellipse, undefined)
  const rounded = (corner) => {
    const points = []
    const add = (x, y) => points.push(pen(x, y))
    for (let x = 100 + corner; x <= 260 - corner; x += 6) add(x, 100)
    for (let step = 0; step <= 4; step += 1) add(260 - corner + corner * Math.sin((step / 4) * Math.PI / 2), 100 + corner - corner * Math.cos((step / 4) * Math.PI / 2))
    for (let y = 100 + corner; y <= 200 - corner; y += 6) add(260, y)
    for (let step = 0; step <= 4; step += 1) add(260 - corner + corner * Math.cos((step / 4) * Math.PI / 2), 200 - corner + corner * Math.sin((step / 4) * Math.PI / 2))
    for (let x = 260 - corner; x >= 100 + corner; x -= 6) add(x, 200)
    for (let step = 0; step <= 4; step += 1) add(100 + corner - corner * Math.sin((step / 4) * Math.PI / 2), 200 - corner + corner * Math.cos((step / 4) * Math.PI / 2))
    for (let y = 200 - corner; y >= 100 + corner; y -= 6) add(100, y)
    for (let step = 0; step <= 4; step += 1) add(100 + corner - corner * Math.cos((step / 4) * Math.PI / 2), 100 + corner - corner * Math.sin((step / 4) * Math.PI / 2))
    return { kind: 'stroke', id: 9, points, color: '#000', width: 4, erase: false }
  }
  for (const corner of [6, 14, 24]) {
    const shape = recognition.recognizeClosedShapeStroke(rounded(corner), 42)
    assert.equal(shape?.kind, 'rectangle', `corner ${corner}`)
    assert.equal(shape.ellipse, undefined, `corner ${corner} must stay a rectangle`)
  }
})

test('open arcs, circles traced twice, spirals, tiny circles and eraser paths are not ovals', () => {
  for (const turns of [0.55, 0.75]) assert.equal(recognition.recognizeEllipseStroke(loop({ a: 90, turns }), 1), null, `arc ${turns}`)
  for (const turns of [1.8, 2.05]) assert.equal(recognition.recognizeEllipseStroke(loop({ a: 90, turns }), 1), null, `turns ${turns}`)
  assert.equal(recognition.recognizeClosedShapeStroke(loop({ a: 8, jitter: 0.4 }), 1), null, 'a 16 x 16 circle stays ink')
  assert.equal(recognition.recognizeClosedShapeStroke(loop({ a: 17, b: 8, jitter: 0.4 }), 1), null, 'a 34 x 16 oval is too flat and stays ink')
  assert.equal(recognition.recognizeClosedShapeStroke({ ...loop({ a: 100 }), erase: true }, 1), null)
  const eight = { kind: 'stroke', id: 1, color: '#000', width: 4, erase: false, points: Array.from({ length: 121 }, (_, i) => { const t = (i / 120) * 2 * Math.PI; return pen(400 + 160 * Math.sin(t), 400 + 80 * Math.sin(2 * t)) }) }
  assert.equal(recognition.recognizeEllipseStroke(eight, 1), null, 'a figure eight is not an oval')
})

test('a very long stroke (20,000 points) is handled without error and never becomes an oval by accident', () => {
  const long = loop({ a: 300, b: 200, jitter: 0.3 })
  long.points = Array.from({ length: 20000 }, (_, index) => long.points[index % long.points.length])
  long.points.push(long.points[0])
  const result = recognition.recognizeClosedShapeStroke(long, 1)
  assert.ok(result === null || result.kind === 'rectangle')
  assert.ok(!result?.ellipse || result.width > 0)
})

test('ovals move, resize and copy as rectangles and keep their tag', () => {
  const oval = { kind: 'rectangle', id: 1, x: 100, y: 100, width: 200, height: 100, strokeColor: '#111', strokeWidth: 3, ellipse: true }
  const moved = modelModule.translateSelectedItems([oval], new Set(['rectangle:1']), 20, 30)[0]
  assert.equal(moved.ellipse, true)
  assert.equal(moved.x, 120)
  const resized = modelModule.resizeRectangleItems([oval], 1, { x: 100, y: 100, width: 500, height: 300 })[0]
  assert.equal(resized.ellipse, true)
  assert.equal(resized.width, 500)
  assert.equal(modelModule.cloneCanvasItems([oval])[0].ellipse, true)
})

test('saved files: the oval tag is optional, only on plain rectangles, and older files open unchanged', () => {
  const plain = { kind: 'rectangle', id: 1, x: 10, y: 10, width: 200, height: 100, strokeColor: '#111', strokeWidth: 3 }
  const oval = { ...plain, id: 2, ellipse: true }
  const text = format.stringifyDocument(format.createDocument({ title: 't', template: 'blank', background: 'white', items: [plain, oval] }))
  const back = format.parseDocument(text)
  assert.equal(back.document.items[0].ellipse, undefined)
  assert.equal(back.document.items[1].ellipse, true)
  assert.equal(JSON.parse(text).version, JSON.parse(format.stringifyDocument(format.createDocument({ title: 't', template: 'blank', background: 'white', items: [plain] }))).version, 'format version is unchanged')
  const raw = JSON.parse(text)
  raw.items[1].ellipse = 'yes'
  assert.equal(format.parseDocument(JSON.stringify(raw)).document.items[1].ellipse, undefined, 'only true counts')
  raw.items[1].ellipse = true
  raw.items[1].inkBox = { top: 40, mid: 70, ink: [] }
  assert.equal(format.parseDocument(JSON.stringify(raw)).document.items[1].ellipse, undefined, 'an ink box is never an oval')
  raw.items[1].inkBox = undefined
  raw.items[1].classBox = { name: 'A', attributes: '', methods: '' }
  assert.equal(format.parseDocument(JSON.stringify(raw)).document.items[1].ellipse, undefined, 'a class box is never an oval')
  const old = JSON.parse(text)
  delete old.items[1].ellipse
  assert.equal(format.parseDocument(JSON.stringify(old)).document.items[1].kind, 'rectangle')
})

test('SVG export draws an oval as an ellipse element and a rectangle as before', () => {
  const sheet = { width: 1000, height: 800, template: 'blank', backgroundColor: '#fff' }
  const oval = { kind: 'rectangle', id: 1, x: 100, y: 100, width: 200, height: 100, strokeColor: '#3568d4', strokeWidth: 5, ellipse: true }
  const svg = exp.buildSheetSvg([oval], sheet)
  assert.match(svg, /<ellipse cx="200" cy="150" rx="100" ry="50" fill="none" stroke="#3568d4" stroke-width="5"\/>/)
  assert.equal((svg.match(/<rect /g) || []).length, 1, 'only the sheet background is a rect')
  const rect = exp.buildSheetSvg([{ ...oval, ellipse: undefined }], sheet)
  assert.equal((rect.match(/<rect /g) || []).length, 2)
  assert.doesNotMatch(rect, /<ellipse/)
})

test('the canvas, the minimap and Class mode treat an oval as an oval', () => {
  assert.match(rendererSource, /else if \(rectangle\.ellipse\) \{\s*ctx\.beginPath\(\)\s*ctx\.ellipse\(rectangle\.x \+ rectangle\.width \/ 2, rectangle\.y \+ rectangle\.height \/ 2, rectangle\.width \/ 2, rectangle\.height \/ 2, 0, 0, Math\.PI \* 2\)/)
  assert.match(rendererSource, /if \(item\.ellipse\) \{\s*ctx\.beginPath\(\)\s*ctx\.ellipse\(toMiniX/)
  assert.match(appSource, /hitRectangle\?\.inkBox \|\| hitRectangle\?\.ellipse \? null : hitRectangle/)
})

test('ovals and circles may be small (24 x 20 and up) while rectangles keep their 38 x 30 minimum', () => {
  assert.equal(recognition.MIN_OVAL_WIDTH, 24)
  assert.equal(recognition.MIN_OVAL_HEIGHT, 20)
  const smallCircle = recognition.recognizeClosedShapeStroke(loop({ a: 14, jitter: 0.4 }), 1)
  assert.equal(smallCircle.ellipse, true)
  assert.equal(smallCircle.width, smallCircle.height)
  assert.ok(Math.abs(smallCircle.width - 28) < 3, `diameter ${smallCircle.width}`)
  const smallOval = recognition.recognizeClosedShapeStroke(loop({ a: 17, b: 12, jitter: 0.4 }), 1)
  assert.equal(smallOval.ellipse, true)
  assert.ok(smallOval.width > smallOval.height && smallOval.width < 40 && smallOval.height < 28, `${smallOval.width} x ${smallOval.height}`)
  // The same size as a hand-drawn rectangle is still left as ink: boxes below 38 x 30 are not rectangles.
  const smallBox = (w, h) => rectangleStroke({ points: [[0, 0], [w / 2, 0.5], [w, 0], [w + 0.5, h / 2], [w, h], [w / 2, h - 0.5], [0, h], [-0.5, h / 2], [0, 0]].map(([x, y]) => pen(200 + x, 200 + y)) })
  assert.equal(recognition.recognizeClosedShapeStroke(smallBox(30, 24), 1), null)
  assert.equal(recognition.recognizeClosedShapeStroke(smallBox(36, 28), 1), null)
  const justBigEnough = recognition.recognizeClosedShapeStroke(smallBox(44, 34), 1)
  assert.equal(justBigEnough?.kind, 'rectangle')
  assert.equal(justBigEnough.ellipse, undefined)
  // A rectangle rule that already rejected small boxes must not change for big strokes either.
  assert.equal(recognition.recognizeRectangleStroke(loop({ a: 14, jitter: 0.4 }), 1), null)
})
