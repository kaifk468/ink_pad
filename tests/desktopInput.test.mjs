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
  const desktopImport = app.match(/import \{([^}]*)\} from '\.\/desktopInput'/)?.[1] ?? ''
  for (const name of ['canStartCanvasGesture', 'isTypingTarget', 'keyCommand', 'loadInputMode', 'pointerPressure', 'saveInputMode', 'spaceIsPanKey', 'startsMousePan', 'wheelViewport', 'type InputMode', 'type KeyCommand']) assert.ok(desktopImport.includes(name), name)
  // the mode is read once from storage (default tablet) and saved whenever the switch changes it
  assert.match(app, /const \[inputMode, setInputMode\] = useState<InputMode>\(\(\) => loadInputMode\(\)\)/)
  assert.match(app, /const updateInputMode = \(mode: InputMode\) => \{\s*inputModeRef\.current = mode\s*setInputMode\(mode\)\s*saveInputMode\(mode\)\s*\}/)
  // the pen's own gesture check is the original seven gesture refs, in the original order
  assert.match(app, /const penGestureActive = activePointerRef\.current !== null \|\| activeConnectorRef\.current !== null \|\| activeDragRef\.current !== null \|\| activeResizeRef\.current !== null \|\| activeDividerRef\.current !== null \|\| activeLassoRef\.current !== null \|\| lassoDragRef\.current !== null\n/)
  // the wider check adds the taps, the object eraser, and the minimap and UML toolbox drags
  assert.match(app, /const anyGestureActive = penGestureActive \|\| textTapRef\.current !== null \|\| classTapRef\.current !== null \|\| activeObjectEraserRef\.current !== null \|\| minimapDragPointerRef\.current !== null \|\| umlToolboxDragRef\.current !== null \|\| mousePanRef\.current !== null \|\| activeMarqueeRef\.current !== null\n/)
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

const V = { scale: 1, offsetX: 100, offsetY: 50 }
const wheel = (over = {}) => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, shiftKey: false, ...over })

test('a plain wheel or two-finger scroll pans the view by the scroll distance', () => {
  const next = input.wheelViewport(V, wheel({ deltaX: 10, deltaY: 40 }), { x: 300, y: 200 }, 800)
  assert.deepEqual(next, { scale: 1, offsetX: 90, offsetY: 10 })
  assert.equal(input.wheelViewport(V, wheel(), { x: 0, y: 0 }, 800).offsetX, 100)
})

test('wheel distances are converted from lines and pages to pixels', () => {
  assert.equal(input.wheelDeltaPixels(3, 0, 800), 3)
  assert.equal(input.wheelDeltaPixels(3, 1, 800), 48)
  assert.equal(input.wheelDeltaPixels(2, 2, 800), 1600)
  assert.equal(input.wheelViewport(V, wheel({ deltaY: 2, deltaMode: 1 }), { x: 0, y: 0 }, 800).offsetY, 18)
})

test('Shift turns a vertical wheel into a sideways pan, but leaves a real sideways scroll alone', () => {
  assert.deepEqual(input.wheelViewport(V, wheel({ deltaY: 40, shiftKey: true }), { x: 0, y: 0 }, 800), { scale: 1, offsetX: 60, offsetY: 50 })
  assert.deepEqual(input.wheelViewport(V, wheel({ deltaX: 15, deltaY: 40, shiftKey: true }), { x: 0, y: 0 }, 800), { scale: 1, offsetX: 85, offsetY: 10 })
})

test('Ctrl + wheel zooms toward the pointer: the canvas point under the pointer does not move', () => {
  const point = { x: 400, y: 300 }
  const canvasUnder = (v) => ({ x: (point.x - v.offsetX) / v.scale, y: (point.y - v.offsetY) / v.scale })
  const before = canvasUnder(V)
  const zoomedIn = input.wheelViewport(V, wheel({ deltaY: -20, ctrlKey: true }), point, 800)
  const zoomedOut = input.wheelViewport(V, wheel({ deltaY: 20, ctrlKey: true }), point, 800)
  assert.ok(zoomedIn.scale > 1 && zoomedOut.scale < 1)
  for (const next of [zoomedIn, zoomedOut]) {
    assert.ok(Math.abs(canvasUnder(next).x - before.x) < 1e-9)
    assert.ok(Math.abs(canvasUnder(next).y - before.y) < 1e-9)
  }
})

test('wheel zoom stays inside the zoom limits and one notch is capped', () => {
  const tiny = input.wheelViewport({ scale: 0.1, offsetX: 0, offsetY: 0 }, wheel({ deltaY: 500, ctrlKey: true }), { x: 5, y: 5 }, 800)
  const huge = input.wheelViewport({ scale: 3, offsetX: 0, offsetY: 0 }, wheel({ deltaY: -500, ctrlKey: true }), { x: 5, y: 5 }, 800)
  assert.equal(tiny.scale, 0.1)
  assert.equal(huge.scale, 3)
  const notch = input.wheelViewport(V, wheel({ deltaY: -100, ctrlKey: true }), { x: 0, y: 0 }, 800)
  assert.ok(notch.scale < 1.4, `one notch zoomed to ${notch.scale}`)
})

test('Ctrl + wheel does nothing when zoom is locked, and a plain wheel still pans', () => {
  assert.equal(input.wheelViewport(V, wheel({ deltaY: -20, ctrlKey: true }), { x: 1, y: 1 }, 800, false), V)
})

test('a middle button, or Space + left button, starts a pan; only for a mouse in Desktop mode', () => {
  assert.equal(input.startsMousePan('mouse', 1, 'desktop', false), true)
  assert.equal(input.startsMousePan('mouse', 0, 'desktop', true), true)
  assert.equal(input.startsMousePan('mouse', 0, 'desktop', false), false)
  assert.equal(input.startsMousePan('mouse', 2, 'desktop', true), false)
  assert.equal(input.startsMousePan('mouse', 1, 'tablet', false), false)
  assert.equal(input.startsMousePan('mouse', 0, 'tablet', true), false)
  for (const type of ['pen', 'touch']) for (const held of [false, true]) for (const button of [0, 1]) assert.equal(input.startsMousePan(type, button, 'desktop', held), false)
})

test('Space is a pan key only in Desktop mode and never while typing or on a button', () => {
  assert.equal(input.spaceIsPanKey(' ', 'BODY', false, 'desktop'), true)
  assert.equal(input.spaceIsPanKey(' ', 'CANVAS', false, 'desktop'), true)
  assert.equal(input.spaceIsPanKey(' ', 'BODY', false, 'tablet'), false)
  assert.equal(input.spaceIsPanKey('a', 'BODY', false, 'desktop'), false)
  for (const tag of ['input', 'TEXTAREA', 'select', 'BUTTON', 'a']) assert.equal(input.spaceIsPanKey(' ', tag, false, 'desktop'), false, tag)
  assert.equal(input.spaceIsPanKey(' ', 'DIV', true, 'desktop'), false)
})

test('App wires the wheel listener (not passive, Desktop mode only), the pan drag and its release', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /canvas\.addEventListener\('wheel', onWheel, \{ passive: false \}\)/)
  assert.match(app, /const onWheel = \(event: WheelEvent\) => \{\n      if \(inputModeRef\.current !== 'desktop'\) return\n      event\.preventDefault\(\)\n      if \(anyGestureBusy\(\) \|\| touchNav\.touchCount\(\) > 0\) return/)
  assert.match(app, /if \(event\.ctrlKey && !zoomAllowed\) return/)
  // the pan branch sits before the tool gate, refuses while another gesture or a finger is active, and locks touch out like a mouse stroke
  assert.match(app, /if \(startsMousePan\(event\.pointerType, event\.button, inputModeRef\.current, spaceHeldRef\.current\)\) \{\n[^\n]*\n      if \(anyGestureActive \|\| mousePanRef\.current !== null \|\| touchNav\.touchCount\(\) > 0\) return/)
  assert.ok(app.indexOf('startsMousePan(event.pointerType') < app.indexOf('if (!canStartCanvasGesture(event.pointerType'))
  assert.match(app, /mousePanRef\.current = \{ pointerId: event\.pointerId, start: getScreenPoint\(event\), startViewport: viewportRef\.current \}\n      touchNav\.mouseDown\(\)/)
  assert.match(app, /\|\| umlToolboxDragRef\.current !== null \|\| mousePanRef\.current !== null/)
  assert.equal((app.match(/if \(mousePanRef\.current\?\.pointerId === event\.pointerId\) \{\n      mousePanRef\.current = null/g) ?? []).length, 2)
  assert.match(app, /applyViewport\(panViewport\(mousePan\.startViewport, now\.x - mousePan\.start\.x, now\.y - mousePan\.start\.y\), true\)/)
  // the pen never starts a pan: the pen path (touchNav.penDown, then the gate) is untouched
  assert.match(app, /if \(event\.pointerType === 'pen'\) touchNav\.penDown\(\)/)
})

const key = (k, over = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...over })

test('Ctrl/Cmd + Z undoes, Ctrl/Cmd + Shift + Z and Ctrl/Cmd + Y redo (either letter case)', () => {
  for (const mod of [{ ctrlKey: true }, { metaKey: true }]) {
    assert.deepEqual(input.keyCommand(key('z', mod), 'desktop'), { kind: 'undo' })
    assert.deepEqual(input.keyCommand(key('Z', { ...mod, shiftKey: true }), 'desktop'), { kind: 'redo' })
    assert.deepEqual(input.keyCommand(key('y', mod), 'desktop'), { kind: 'redo' })
  }
  assert.deepEqual(input.keyCommand(key('z', { ctrlKey: true, repeat: true }), 'desktop'), { kind: 'undo' }, 'holding Ctrl+Z keeps undoing')
  assert.equal(input.keyCommand(key('z', { ctrlKey: true, altKey: true }), 'desktop'), null)
})

test('Ctrl/Cmd + plus, minus and 0 zoom in, out and reset; other Ctrl combinations are left to the browser', () => {
  assert.deepEqual(input.keyCommand(key('=', { ctrlKey: true }), 'desktop'), { kind: 'zoomIn' })
  assert.deepEqual(input.keyCommand(key('+', { ctrlKey: true, shiftKey: true }), 'desktop'), { kind: 'zoomIn' })
  assert.deepEqual(input.keyCommand(key('-', { ctrlKey: true }), 'desktop'), { kind: 'zoomOut' })
  assert.deepEqual(input.keyCommand(key('0', { metaKey: true }), 'desktop'), { kind: 'zoomReset' })
  for (const k of ['s', 'c', 'v', 'p', 'r', 'w', 't', 'l']) assert.equal(input.keyCommand(key(k, { ctrlKey: true }), 'desktop'), null, `Ctrl+${k}`)
})

test('plain letters pick tools (any case), and only with no modifier and no auto-repeat', () => {
  const tools = { p: 'pen', v: 'select', e: 'eraser', t: 'text', l: 'lasso', c: 'connector', b: 'classBox' }
  for (const [k, tool] of Object.entries(tools)) {
    assert.deepEqual(input.keyCommand(key(k), 'desktop'), { kind: 'tool', tool })
    assert.deepEqual(input.keyCommand(key(k.toUpperCase()), 'desktop'), { kind: 'tool', tool })
    assert.equal(input.keyCommand(key(k, { repeat: true }), 'desktop'), null)
    assert.equal(input.keyCommand(key(k, { altKey: true }), 'desktop'), null)
    assert.equal(input.keyCommand(key(k, { shiftKey: true }), 'desktop') !== null, false, 'Shift+letter is not a tool key')
  }
  for (const k of ['a', 'x', '1', ' ', 'Enter']) assert.equal(input.keyCommand(key(k), 'desktop'), null, k)
})

test('Escape only deselects; with a modifier or held down it does nothing', () => {
  assert.deepEqual(input.keyCommand(key('Escape'), 'desktop'), { kind: 'deselect' })
  assert.equal(input.keyCommand(key('Escape', { repeat: true }), 'desktop'), null)
  assert.equal(input.keyCommand(key('Escape', { shiftKey: true }), 'desktop'), null)
})

test('in Tablet mode no key does anything', () => {
  for (const k of [key('z', { ctrlKey: true }), key('y', { ctrlKey: true }), key('=', { ctrlKey: true }), key('0', { ctrlKey: true }), key('Escape'), key('Delete'), key('Backspace'), key('a', { ctrlKey: true }), ...'pvetlcb'.split('').map((c) => key(c))]) {
    assert.equal(input.keyCommand(k, 'tablet'), null)
  }
})

test('shortcuts are not taken from text fields, dropdowns or editable text; buttons and the page body are fine', () => {
  for (const tag of ['input', 'TEXTAREA', 'Select']) assert.equal(input.isTypingTarget(tag, false), true, tag)
  assert.equal(input.isTypingTarget('DIV', true), true)
  for (const tag of ['BODY', 'CANVAS', 'BUTTON', 'MAIN']) assert.equal(input.isTypingTarget(tag, false), false, tag)
})

test('App runs a key only outside panels, dialogs, text editing and gestures, and only after the typing check', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /if \(filePanelOpen \|\| storagePanelOpen \|\| libraryOpen \|\| performanceDiagnosticsOpen \|\| textEditor \|\| textEditorRef\.current \|\| classBoxEditor\) return false/)
  const gesture = app.match(/const gestureActive = ([^\n]+)\n/)[1]
  for (const ref of ['activePointerRef', 'activeConnectorRef', 'activeDragRef', 'activeResizeRef', 'activeDividerRef', 'activeLassoRef', 'lassoDragRef', 'textTapRef', 'classTapRef', 'activeObjectEraserRef', 'minimapDragPointerRef', 'umlToolboxDragRef', 'mousePanRef']) assert.ok(gesture.includes(ref + '.current !== null'), ref)
  assert.match(app, /if \(gestureActive \|\| activeMarqueeRef\.current !== null \|\| touchNav\.touchCount\(\) > 0\) return false/)
  assert.match(app, /const command = keyCommand\(event, inputModeRef\.current\)\n      if \(!command\) return\n      const target = event\.target as HTMLElement \| null\n      if \(isTypingTarget\([^\n]*\)\) return\n      if \(keyActionsRef\.current\(command\)\) event\.preventDefault\(\)/)
  // zoom keys respect the zoom lock; Escape only clears a selection and says "not handled" when there is none
  assert.equal((app.match(/case 'zoom(In|Out|Reset)': if \(!navigationSettingsRef\.current\.zoomLocked\)/g) ?? []).length, 3)
  assert.match(app, /case 'deselect':\n\s*if \(selectedKeysRef\.current\.size === 0 && selectedRectangleIdRef\.current === null\) return false\n\s*clearLassoSelection\(\)/)
})

test('tool keys set a tool rather than toggle it', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /case 'select': if \(!selectionMode\) toggleSelectTool\(\); break/)
  assert.match(app, /case 'text': if \(!textMode\) toggleTextTool\(\); break/)
  assert.match(app, /case 'lasso': if \(!lassoMode\) toggleLassoTool\(\); break/)
  assert.match(app, /case 'connector': if \(!connectorMode\) toggleConnectorTool\(\); break/)
  assert.match(app, /case 'classBox': if \(!\(classMode && inkClassTool && hldShapeTool === null\)\) toggleInkClassTool\(\); break/)
  assert.match(app, /case 'pen': selectPenMode\(\); break/)
  // the eraser key sets the eraser on (the toolbar's double-tap options and toggle are not used)
  assert.match(app, /clearLassoSelection\(\)\n\s*setEraser\(true\)\n\s*break/)
})

test('Delete and Backspace delete the selection; Ctrl/Cmd + A selects all; modifiers and auto-repeat do nothing', () => {
  for (const k of ['Delete', 'Backspace']) {
    assert.deepEqual(input.keyCommand(key(k), 'desktop'), { kind: 'deleteSelection' })
    assert.equal(input.keyCommand(key(k, { repeat: true }), 'desktop'), null, 'holding Delete does not delete more')
    assert.equal(input.keyCommand(key(k, { shiftKey: true }), 'desktop'), null)
    assert.equal(input.keyCommand(key(k, { ctrlKey: true }), 'desktop'), null)
  }
  for (const mod of [{ ctrlKey: true }, { metaKey: true }]) {
    assert.deepEqual(input.keyCommand(key('a', mod), 'desktop'), { kind: 'selectAll' })
    assert.deepEqual(input.keyCommand(key('A', mod), 'desktop'), { kind: 'selectAll' })
    assert.equal(input.keyCommand(key('a', { ...mod, shiftKey: true }), 'desktop'), null)
    assert.equal(input.keyCommand(key('a', { ...mod, altKey: true }), 'desktop'), null)
  }
  assert.equal(input.keyCommand(key('a'), 'desktop'), null, 'a bare A is not a command')
})

test('App deletes the selection as one undo step (keys and the single selected box), clears the selection, and select-all moves to the select tool first', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /const deleteSelection = \(\): boolean => \{\n    const keys = new Set\(selectedKeysRef\.current\)\n    if \(selectedRectangleIdRef\.current !== null\) keys\.add\(`rectangle:\$\{selectedRectangleIdRef\.current\}`\)\n    if \(keys\.size === 0\) return false\n    const remaining = deleteCanvasItemsByKey\(strokesRef\.current, keys\)\n    if \(remaining === strokesRef\.current\) return false\n    saveHistory\(\)\n    strokesRef\.current = remaining\n    setHasInk\(strokesRef\.current\.length > 0\)\n    updateSelectedItems\(\[\]\)\n    setSelectedRectangle\(null\)\n    renderAll\(\)\n    return true/)
  assert.match(app, /if \(!selectionMode && !lassoMode\) toggleSelectTool\(\)\n    setSelectedRectangle\(null\)\n    updateSelectedItems\(keys\)/)
  assert.match(app, /case 'deleteSelection': return deleteSelection\(\)\n\s*case 'selectAll': return selectAllItems\(\)/)
  // the toolbar button calls the same function, and shows for a selection or a single selected box
  assert.match(app, /canDelete=\{selectedItemCount > 0 \|\| hasSelectedRectangle\}\n\s*onDeleteSelection=\{\(\) => \{ deleteSelection\(\) \}\}/)
  const panel = await readFile(new URL('../src/app/ContextPanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /props\.canDelete && <button className="clear-selection-button delete-selection-button" type="button" aria-label="Delete selection"[^>]*onClick=\{props\.onDeleteSelection\}>Delete<\/button>/)
  // saved format untouched: deleting only removes items, so no new field or version
  const format = await readFile(new URL('../src/documentFormat.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(format, /deleteSelection|selectAll|canDelete/)
})
