import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const input = await loadModule('desktopInput.ts')

const memoryStorage = (initial = {}) => {
  const data = { ...initial }
  return { getItem: (key) => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value) }, data }
}
const brokenStorage = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }

test('the input mode defaults to tablet and only an explicit "desktop" value turns it on', () => {
  assert.equal(input.DEFAULT_INPUT_MODE, 'tablet')
  assert.equal(input.loadInputMode(memoryStorage()), 'tablet')
  assert.equal(input.loadInputMode(memoryStorage({ 'inkpad.inputMode': 'desktop' })), 'desktop')
  assert.equal(input.loadInputMode(memoryStorage({ 'inkpad.inputMode': 'tablet' })), 'tablet')
  assert.equal(input.loadInputMode(memoryStorage({ 'inkpad.inputMode': 'Desktop ' })), 'tablet')
  assert.equal(input.loadInputMode(memoryStorage({ 'inkpad.inputMode': '' })), 'tablet')
})

test('an unreadable or unwritable storage falls back to tablet and never throws', () => {
  assert.equal(input.loadInputMode(brokenStorage), 'tablet')
  assert.doesNotThrow(() => input.saveInputMode('desktop', brokenStorage))
})

test('the input mode is saved per device under its own key and round-trips', () => {
  const storage = memoryStorage()
  input.saveInputMode('desktop', storage)
  assert.deepEqual(storage.data, { 'inkpad.inputMode': 'desktop' })
  assert.equal(input.loadInputMode(storage), 'desktop')
  input.saveInputMode('tablet', storage)
  assert.equal(input.loadInputMode(storage), 'tablet')
})

test('the pen is accepted in both modes with every button, including the barrel and eraser buttons', () => {
  for (const mode of ['tablet', 'desktop']) {
    for (const button of [-1, 0, 1, 2, 5]) assert.equal(input.acceptsPointer('pen', button, mode), true, `pen button ${button} in ${mode}`)
  }
})

test('touch and unknown pointer types never draw or edit', () => {
  for (const mode of ['tablet', 'desktop']) {
    for (const type of ['touch', '', 'unknown']) {
      for (const button of [-1, 0, 2]) assert.equal(input.acceptsPointer(type, button, mode), false, `${type || 'empty'} in ${mode}`)
    }
  }
})

test('a mouse is ignored in tablet mode and only the left button counts in desktop mode', () => {
  for (const button of [-1, 0, 1, 2, 3, 4]) assert.equal(input.acceptsPointer('mouse', button, 'tablet'), false, `tablet button ${button}`)
  assert.equal(input.acceptsPointer('mouse', 0, 'desktop'), true)
  for (const button of [-1, 1, 2, 3, 4]) assert.equal(input.acceptsPointer('mouse', button, 'desktop'), false, `desktop button ${button}`)
})

test('in tablet mode the gate gives exactly the answer it gave before: only an idle pen may start', () => {
  const before = (type, penBusy) => type === 'pen' && !penBusy
  for (const type of ['pen', 'touch', 'mouse', '']) {
    for (const button of [-1, 0, 1, 2, 5]) {
      for (const penBusy of [false, true]) {
        for (const anyBusy of [false, true]) {
          for (const touchActive of [false, true]) {
            assert.equal(input.canStartCanvasGesture(type, button, 'tablet', penBusy, anyBusy, touchActive), before(type, penBusy), `${type} button ${button} penBusy ${penBusy} anyBusy ${anyBusy} touch ${touchActive}`)
          }
        }
      }
    }
  }
})

test('the pen is blocked only by the original pen gestures, never by the wider set (a finger on the minimap must not stop writing)', () => {
  for (const mode of ['tablet', 'desktop']) {
    assert.equal(input.canStartCanvasGesture('pen', 0, mode, false, true), true)
    assert.equal(input.canStartCanvasGesture('pen', 0, mode, true, true), false)
    assert.equal(input.canStartCanvasGesture('pen', 0, mode, true, false), false)
  }
})

test('a mouse in desktop mode is blocked by any gesture in progress, so it cannot overwrite a pen gesture', () => {
  assert.equal(input.canStartCanvasGesture('mouse', 0, 'desktop', false, false), true)
  assert.equal(input.canStartCanvasGesture('mouse', 0, 'desktop', false, true), false)
  assert.equal(input.canStartCanvasGesture('mouse', 0, 'desktop', true, true), false)
  assert.equal(input.canStartCanvasGesture('mouse', 2, 'desktop', false, false), false)
})

test('App wires the gate through canStartCanvasGesture and keeps the touch block and the pen checks as they were', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /import \{ canStartCanvasGesture, loadInputMode, pointerPressure, saveInputMode, type InputMode \} from '\.\/desktopInput'/)
  // the mode is read once from storage (default tablet) and saved whenever the switch changes it
  assert.match(app, /const \[inputMode, setInputMode\] = useState<InputMode>\(\(\) => loadInputMode\(\)\)/)
  assert.match(app, /const updateInputMode = \(mode: InputMode\) => \{\s*inputModeRef\.current = mode\s*setInputMode\(mode\)\s*saveInputMode\(mode\)\s*\}/)
  // the pen's own gesture check is the original seven gesture refs, in the original order
  assert.match(app, /const penGestureActive = activePointerRef\.current !== null \|\| activeConnectorRef\.current !== null \|\| activeDragRef\.current !== null \|\| activeResizeRef\.current !== null \|\| activeDividerRef\.current !== null \|\| activeLassoRef\.current !== null \|\| lassoDragRef\.current !== null\n/)
  // the wider check adds the taps, the object eraser, and the minimap and UML toolbox drags
  assert.match(app, /const anyGestureActive = penGestureActive \|\| textTapRef\.current !== null \|\| classTapRef\.current !== null \|\| activeObjectEraserRef\.current !== null \|\| minimapDragPointerRef\.current !== null \|\| umlToolboxDragRef\.current !== null\n/)
  assert.match(app, /if \(!canStartCanvasGesture\(event\.pointerType, event\.button, inputModeRef\.current, penGestureActive, anyGestureActive, touchNav\.touchCount\(\) > 0\)\) return/)
  // touch is still handled (and returns) before the gate, and the pen still resets the navigator first
  const touchBlock = app.indexOf("if (event.pointerType === 'touch') {\n      event.preventDefault()")
  const gate = app.indexOf('if (!canStartCanvasGesture(')
  assert.ok(touchBlock > 0 && gate > touchBlock, 'the touch block comes before the gate')
  assert.match(app, /if \(event\.pointerType === 'pen'\) touchNav\.penDown\(\)\n    if \(event\.pointerType === 'touch'\)/)
})

test('nothing in the saved diagram format mentions the input mode or the pointer type', async () => {
  const format = await readFile(new URL('../src/documentFormat.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(format, /inputMode|pointerType|desktopInput/)
})

test('a mouse press is refused while a finger is down; the pen is not (it cancels the touches itself)', () => {
  assert.equal(input.canStartCanvasGesture('mouse', 0, 'desktop', false, false, false), true)
  assert.equal(input.canStartCanvasGesture('mouse', 0, 'desktop', false, false, true), false)
  assert.equal(input.canStartCanvasGesture('pen', 0, 'desktop', false, false, true), true)
  assert.equal(input.canStartCanvasGesture('pen', 0, 'tablet', false, false, true), true)
})

test('mouse points all carry one fixed pressure; pen and touch keep what the device reports', () => {
  assert.equal(input.MOUSE_PRESSURE, 0.5)
  for (const reported of [0, 0.5, 1]) assert.equal(input.pointerPressure('mouse', reported), 0.5)
  for (const reported of [0, 0.07, 0.31, 0.62, 1]) {
    assert.equal(input.pointerPressure('pen', reported), reported)
    assert.equal(input.pointerPressure('touch', reported), reported)
  }
})

test('the fixed mouse pressure draws at 0.8 of the base width, inside the range real pen ink uses (not the 1.0 of "no pressure")', () => {
  const widthFactor = (pressure) => (pressure > 0 ? 0.35 + pressure * 0.9 : 1)
  assert.ok(Math.abs(widthFactor(input.MOUSE_PRESSURE) - 0.8) < 1e-9)
  assert.ok(widthFactor(input.MOUSE_PRESSURE) < widthFactor(0))
  assert.ok(widthFactor(0.3) < widthFactor(input.MOUSE_PRESSURE) && widthFactor(input.MOUSE_PRESSURE) < widthFactor(0.7))
})

test('App stores mouse pressure through pointerPressure at the stroke start and every stroke sample, and leaves the eraser and lasso paths alone', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /pressure: pointerPressure\(event\.pointerType, event\.pressure\),\n    \}\n  \}\n\n  const getPoint/)
  assert.match(app, /pressure: pointerPressure\(sample\.pointerType, sample\.pressure\),\n      \}, viewportRef\.current\)\n      if \(!appendStrokeSample\(event\.pointerId, point\)\) return/)
  assert.equal((app.match(/pointerPressure\(/g) ?? []).length, 2)
})

test('hold-to-snap is off for a mouse unless the Shapes tool is on, and the pen timer is untouched', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /const scheduleShapePreview = \(point\?: Point\) => \{\n    if \(eraser \|\| penButtonEraseRef\.current\) return\n    if \(mouseGestureRef\.current && !shapeMode\) return\n/)
  assert.match(app, /if \(!stroke && mouseGestureRef\.current && !shapeMode\) \{[^}]*stroke = activeStrokeRef\.current\n      \} else if \(!stroke\) \{/)
  // the pen and touch gestures reset the flag at every gesture start
  assert.match(app, /mouseGestureRef\.current = event\.pointerType === 'mouse'\n    if \(mouseGestureRef\.current\) touchNav\.mouseDown\(\)/)
})

test('a mouse gesture ends the touch lockout on release and on cancel, and the menu has the Desktop switch', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.equal((app.match(/else if \(event\.pointerType === 'mouse'\) touchNav\.mouseUp\(\)/g) ?? []).length, 2)
  assert.match(app, /inputMode=\{inputMode\}\n\s*onInputMode=\{updateInputMode\}/)
  const menu = await readFile(new URL('../src/app/TopLeftBar.tsx', import.meta.url), 'utf8')
  assert.match(menu, /role="switch" aria-checked=\{props\.inputMode === 'desktop'\} onClick=\{\(\) => props\.onInputMode\(props\.inputMode === 'desktop' \? 'tablet' : 'desktop'\)\}/)
})

test('a diagram mixing pen strokes (real pressure) and mouse strokes (fixed pressure) round-trips unchanged, with no new keys', async () => {
  const format = await loadModule('documentFormat.ts')
  const penStroke = { kind: 'stroke', id: 1, points: [{ x: 1, y: 2, pressure: 0.31 }, { x: 3, y: 4, pressure: 0.62 }], color: '#111', width: 3, erase: false }
  const mouseStroke = { kind: 'stroke', id: 2, points: [{ x: 5, y: 6, pressure: input.MOUSE_PRESSURE }, { x: 7, y: 8, pressure: input.MOUSE_PRESSURE }], color: '#111', width: 3, erase: false }
  const rectangle = { kind: 'rectangle', id: 1, x: 10, y: 20, width: 100, height: 60, strokeColor: '#111', strokeWidth: 2 }
  const created = format.createDocument({ title: 'Mixed', template: 'blank', background: 'white', items: [penStroke, mouseStroke, rectangle] }, '2026-11-13T00:00:00.000Z')
  const text = format.stringifyDocument(created)
  const parsed = format.parseDocument(text)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.droppedItems, 0)
  assert.deepEqual(parsed.document.items, [penStroke, mouseStroke, rectangle])
  assert.equal(format.stringifyDocument(parsed.document), text)
  // a mouse stroke is saved exactly like a pen stroke: same keys, nothing says which device made it
  assert.deepEqual(Object.keys(JSON.parse(text).items[1]).sort(), Object.keys(JSON.parse(text).items[0]).sort())
  assert.doesNotMatch(text, /mouse|pointer|inputMode|desktop/i)
})
