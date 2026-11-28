import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const input = await loadModule('desktopInput.ts')
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const app = await read('src/App.tsx')
const panel = await read('src/app/ContextPanel.tsx')
const pt = (x, y) => ({ x, y, pressure: 1 })

test('a rotated shape is hit where it is drawn, not in its unrotated box (desktop hit rule)', () => {
  // 200 x 40 box at the origin, turned 90 degrees about (100, 20): it now stands 40 wide and 200 tall.
  const tall = { kind: 'rectangle', id: 1, x: 0, y: 0, width: 200, height: 40, strokeColor: '#111', strokeWidth: 2, angle: Math.PI / 2 }
  assert.equal(input.hitTarget([tall], pt(100, 110), 1)?.key, 'rectangle:1')
  assert.equal(input.hitTarget([tall], pt(5, 20), 1), null, 'the old left end is empty now')
  const flat = { ...tall }
  delete flat.angle
  assert.equal(input.hitTarget([flat], pt(5, 20), 1)?.key, 'rectangle:1')
})

test('App: the rotate handle starts a rotation in the select and lasso tools, Shift snaps to 15 degrees, one undo step, Escape restores', () => {
  assert.match(app, /if \(selectionMode \|\| lassoMode\) \{\n\s*const rotating = soleRotatable\(\)\n\s*if \(rotating && hitRotateHandle\(rotating, point, viewportRef\.current\.scale\)\)/)
  assert.match(app, /if \(event\.shiftKey\) angle = snapAngle\(angle, 15\)/)
  assert.match(app, /if \(!activeRotate\.moved\) \{ saveHistory\(\); activeRotate\.moved = true \}/)
  assert.match(app, /strokesRef\.current = setItemAngle\(activeRotate\.originalItems, activeRotate\.key, angle\)/)
  assert.match(app, /if \(rotate\.moved\) \{ restored = rotate\.originalItems; discardStep = true \}/)
  assert.ok((app.match(/activeRotateRef\.current = null/g) ?? []).length >= 4, 'cleared on up, cancel, reset and Escape')
  assert.ok((app.match(/activeRotateRef\.current !== null/g) ?? []).length >= 5, 'counts as a gesture everywhere the other drags do')
})

test('App: rotated items are outlined rotated with a handle and have no resize handles; Align to line and Reset use one undo step', () => {
  assert.match(app, /const resizeBounds = rotatedSelected \? undefined :/)
  assert.match(app, /const handle = rotateHandle\(rotatableSelected, viewportRef\.current\.scale\)/)
  assert.match(app, /const angle = nearestConnectorAngle\(routeConnectors\(strokesRef\.current\), \{ x: center\.x, y: center\.y, pressure: 0 \}\)/)
  assert.match(app, /if \(next === strokesRef\.current\) return\n\s*saveHistory\(\)/)
  assert.match(app, /rotation=\{rotationPanel\}/)
  assert.match(panel, /aria-label="Align to line"/)
  assert.match(panel, /aria-label="Reset rotation"/)
})

test('Align to line also follows a straight line or arrow stroke, not only connectors', async () => {
  const model = await loadModule('canvasModel.ts')
  const line = { kind: 'stroke', id: 1, points: [pt(0, 0), pt(100, 100)], color: '#111', width: 3, erase: false, shape: 'line' }
  assert.ok(Math.abs(model.nearestConnectorAngle([line], pt(50, 70)) - Math.PI / 4) < 1e-9)
  const free = { ...line, shape: undefined }
  assert.equal(model.nearestConnectorAngle([free], pt(50, 70)), null, 'a freehand stroke is not a line')
  assert.match(app, /renderNavigator, theme, palette, selectionMode, lassoMode, strokeDisplayMode, width\]\)/)
})
