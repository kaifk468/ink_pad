import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const input = await loadModule('desktopInput.ts')
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const app = await read('src/App.tsx')
const panel = await read('src/app/ContextPanel.tsx')
const pt = (x, y) => ({ x, y, pressure: 1 })
const box = { kind: 'rectangle', id: 1, x: 0, y: 0, width: 200, height: 200, strokeColor: '#111', strokeWidth: 2 }

test('the direct shape tools never grab an existing box: a press starts a new shape', () => {
  for (const point of [pt(100, 100), pt(2, 100), pt(200, 200)]) assert.equal(input.clickSelectTarget([box], point, 1, 'shapeDraw', false), null)
  assert.equal(input.clickSelectTarget([box], pt(2, 100), 1, 'pen', false)?.key, 'rectangle:1', 'other tools are unchanged')
})

test('shape tool keys: R rectangle, D diamond, O ellipse, A arrow, I line; Ctrl+A is still select all', () => {
  for (const [k, tool] of Object.entries({ r: 'rectangle', d: 'diamond', o: 'ellipse', a: 'arrow', i: 'line' })) {
    assert.deepEqual(input.keyCommand({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false }, 'desktop'), { kind: 'tool', tool })
  }
  assert.deepEqual(input.keyCommand({ key: 'a', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: false }, 'desktop'), { kind: 'selectAll' })
  assert.match(app, /case 'rectangle': case 'diamond': case 'ellipse': case 'arrow': case 'line': if \(shapeTool !== command\.tool\) toggleShapeDrawTool\(command\.tool\)/)
})

test('App: a rectangle, diamond or ellipse is created by drag (Shift = square), then Select takes over with it selected', () => {
  const down = app.indexOf('const boxShape = shapeTool ===')
  assert.ok(down > 0 && down < app.indexOf('    if (textMode) {\n      event.currentTarget.setPointerCapture', down))
  assert.match(app, /createShapeBox\(nextRectangleIdRef\.current\+\+, point\.x, point\.y, 4, 4, color, width, boxShape\)/)
  assert.match(app, /activeResize\.created && event\.shiftKey && activeResize\.rectangleId !== null && shapeToolRef\.current !== null/)
  assert.match(app, /createdBox\.ellipse \? \{ width: 160, height: 110 \} : createdBox\.diamond \? \{ width: 140, height: 140 \}/)
  assert.match(app, /setShapeTool\(null\)\n\s*setSelectionMode\(true\)\n\s*setSelectedRectangle\(finished\.rectangleId\)/)
})

test('App: line and arrow are straight from the press point; a click without a drag adds nothing; no recognition or ink-box capture', () => {
  assert.match(app, /if \(shapeToolRef\.current === 'line' \|\| shapeToolRef\.current === 'arrow'\) stroke\.points = \[stroke\.points\[0\], clippedPoint\]/)
  assert.match(app, /\{ \.\.\.stroke, shape: lineTool, points: \[first, last\], \.\.\.\(lineDashDefaultRef/)
  assert.match(app, /< 4 \? \{ \.\.\.stroke, points: \[first\] \}/)
  assert.match(app, /shapeToolRef\.current !== null\) return\n    const anchor = holdAnchorRef\.current/)
  assert.match(app, /activeStrokeBoxRef\.current = shapeMode \|\| shapeTool !== null \? null/)
})

test('App: any other tool switches the shape tool off, and the pen is not active under a shape tool', () => {
  assert.match(app, /if \(connectorMode \|\| eraser \|\| shapeMode \|\| selectionMode \|\| lassoMode \|\| textMode \|\| classMode\) setShapeTool\(null\)/)
  assert.match(app, /const penModeActive = !laserMode && !eraser && !shapeMode && shapeTool === null/)
  assert.match(app, /'connector' : shapeTool !== null \? 'shapeDraw'/)
  assert.ok((app.match(/setShapeMode\(false\); setShapeTool\(null\)/g) ?? []).length >= 8)
})

test('App: recolouring is one undo step per swatch click or picker drag and uses the shared selection keys', () => {
  assert.match(app, /const next = recolorItems\(strokesRef\.current, currentSelectionKeys\(\), hex\)/)
  assert.match(app, /if \(!recolorSessionRef\.current\) \{ saveHistory\(\); recolorSessionRef\.current = true \}/)
  assert.match(app, /if \(commit\) recolorSessionRef\.current = false/)
  assert.match(app, /keys\.add\(`rectangle:\$\{selectedRectangleIdRef\.current\}`\)/)
  assert.match(app, /showSelectionColor=\{inputMode === 'desktop' && \(selectedItemCount > 0 \|\| hasSelectedRectangle\)\}/)
})

test('desktop panel: one-click pen options, text options, eraser panel instead of the popup; tablet rules unchanged', () => {
  assert.match(app, /desktop=\{inputMode === 'desktop'\}/)
  assert.match(app, /showStyle=\{inputMode === 'desktop' \? \(\(penModeActive \|\| shapeTool !== null\) && selectedItemCount === 0 && !hasSelectedRectangle\) : optionsFor === 'pen' && penModeActive\}/)
  assert.match(app, /showEraser=\{inputMode === 'desktop' && eraser\}/)
  assert.match(app, /\{eraserMenuOpen && inputMode !== 'desktop' && eraserPopoverPosition && createPortal\(/)
  assert.match(panel, /props\.desktop \? <ColorChoices value=\{props\.color\} label="Stroke colour"/)
  assert.match(panel, /aria-label="Pen color"/, 'the tablet pen colour group is still there')
  assert.match(panel, /aria-label="More colours"/)
  assert.match(panel, /<ColorPicker value=\{value\} onChange=\{\(hex\) => onChange\(hex, false\)\} onCommit=\{\(hex\) => onChange\(hex, true\)\} \/>/)
  assert.match(panel, /context-panel\$\{props\.desktop \? ' desktop-left' : ''\}/)
})
