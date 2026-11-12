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
          assert.equal(input.canStartCanvasGesture(type, button, 'tablet', penBusy, anyBusy), before(type, penBusy), `${type} button ${button} penBusy ${penBusy} anyBusy ${anyBusy}`)
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
  assert.match(app, /import \{ canStartCanvasGesture, loadInputMode, type InputMode \} from '\.\/desktopInput'/)
  // the mode is only ever read once from storage and starts as tablet
  assert.match(app, /if \(inputModeRef\.current === null\) inputModeRef\.current = loadInputMode\(\)/)
  // the pen's own gesture check is the original seven gesture refs, in the original order
  assert.match(app, /const penGestureActive = activePointerRef\.current !== null \|\| activeConnectorRef\.current !== null \|\| activeDragRef\.current !== null \|\| activeResizeRef\.current !== null \|\| activeDividerRef\.current !== null \|\| activeLassoRef\.current !== null \|\| lassoDragRef\.current !== null\n/)
  // the wider check adds the taps, the object eraser, and the minimap and UML toolbox drags
  assert.match(app, /const anyGestureActive = penGestureActive \|\| textTapRef\.current !== null \|\| classTapRef\.current !== null \|\| activeObjectEraserRef\.current !== null \|\| minimapDragPointerRef\.current !== null \|\| umlToolboxDragRef\.current !== null\n/)
  assert.match(app, /if \(!canStartCanvasGesture\(event\.pointerType, event\.button, inputModeRef\.current \?\? 'tablet', penGestureActive, anyGestureActive\)\) return/)
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
