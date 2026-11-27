import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const q = await loadModule('quickConnect.ts')
const m = await loadModule('canvasModel.ts')
const shortcuts = await loadModule('desktopShortcuts.ts')
const app = await readAppSource()
const pt = (x, y) => ({ x, y, pressure: 1 })
const box = { x: 100, y: 100, width: 160, height: 80 }

test('buttons sit a fixed screen distance outside each side, whatever the zoom', () => {
  for (const scale of [0.5, 1, 2.5]) {
    const byDir = Object.fromEntries(q.quickConnectButtons(box, scale).map((b) => [b.direction, b]))
    assert.equal(byDir.right.center.x, 260 + q.QUICK_CONNECT_OFFSET_PX / scale)
    assert.equal(byDir.right.center.y, 140)
    assert.equal(byDir.left.center.x, 100 - q.QUICK_CONNECT_OFFSET_PX / scale)
    assert.equal(byDir.down.center.y, 180 + q.QUICK_CONNECT_OFFSET_PX / scale)
    assert.equal(byDir.down.center.x, 180)
    assert.equal(byDir.up.center.y, 100 - q.QUICK_CONNECT_OFFSET_PX / scale)
    assert.equal(byDir.right.radius, q.QUICK_CONNECT_RADIUS_PX / scale)
  }
})

test('hit test returns the direction, null elsewhere', () => {
  const scale = 1
  for (const b of q.quickConnectButtons(box, scale)) {
    assert.equal(q.hitQuickConnect(box, b.center, scale), b.direction)
    assert.equal(q.hitQuickConnect(box, pt(b.center.x, b.center.y + b.radius + 2), scale), null)
  }
  assert.equal(q.hitQuickConnect(box, pt(180, 140), scale), null)
  assert.equal(q.hitQuickConnect(box, pt(0, 0), scale), null)
})

test('hidden when the box is under 24 px on screen', () => {
  assert.equal(q.quickConnectFits({ x: 0, y: 0, width: 100, height: 20 }, 1), false)
  assert.equal(q.quickConnectFits({ x: 0, y: 0, width: 100, height: 60 }, 0.3), false)
  assert.equal(q.quickConnectFits({ x: 0, y: 0, width: 100, height: 60 }, 1), true)
  const small = { x: 0, y: 0, width: 100, height: 20 }
  const right = q.quickConnectButtons(small, 1).find((b) => b.direction === 'right')
  assert.equal(q.hitQuickConnect(small, right.center, 1), null)
})

test('buttons never overlap resize handles or the rotate handle', () => {
  for (const scale of [0.4, 1, 3]) {
    for (const size of [{ width: 24 / scale, height: 24 / scale }, { width: 160, height: 80 }, { width: 600, height: 300 }]) {
      const b = { x: 50, y: 70, ...size }
      if (!q.quickConnectFits(b, scale)) continue
      const rotate = m.rotateHandle({ kind: 'rectangle', id: 1, ...b, strokeColor: '#111', strokeWidth: 2 }, scale)
      for (const button of q.quickConnectButtons(b, scale)) {
        // A press on a button must not also be a resize-handle hit (14 screen px) or a rotate-handle hit (12 screen px).
        for (const { point } of m.getRectangleResizeHandles(b)) {
          assert.ok(Math.hypot(point.x - button.center.x, point.y - button.center.y) * scale >= q.QUICK_CONNECT_RADIUS_PX + 14, `${button.direction} vs resize at ${scale}`)
        }
        if (rotate) assert.ok(Math.hypot(rotate.point.x - button.center.x, rotate.point.y - button.center.y) * scale >= q.QUICK_CONNECT_RADIUS_PX + 12, `${button.direction} vs rotate at ${scale}`)
      }
    }
  }
})

test('hint names the arrow', () => {
  assert.equal(q.quickConnectHint('right'), 'New connected shape (Ctrl+→)')
  assert.equal(q.quickConnectHint('up'), 'New connected shape (Ctrl+↑)')
})

test('help row mentions the arrow buttons', () => {
  const row = shortcuts.DESKTOP_SHORTCUTS.find((r) => r.keys === 'Ctrl+Arrow keys')
  assert.match(row.label, /arrow button/)
})

test('wiring: desktop select gating, quickCreateShape call, overlay draw, pointer paths', () => {
  assert.match(app, /const quickConnectSource = \(\): RectangleObject \| null => \{\s*if \(!selectionMode\) return null\s*\n\s*const tablet = inputModeRef\.current === 'tablet'/)
  assert.match(app, /isFlowBox\(item\) \|\| isItemLocked\(item\)/)
  assert.match(app, /if \(press && !press\.dragged\) quickCreateShape\(press\.direction\)/)
  assert.match(app, /event\.pointerType === 'mouse' && event\.button === 0 && !event\.shiftKey/)
  assert.match(app, /if \(selectionMode && startQuickConnectPress\(event, point\)\) return\s*\n\s*if \(\(selectionMode \|\| lassoMode\)[^\n]*startConnectorHandleGesture/)
  assert.match(app, /quickConnectButtons\(quickSource, scale, quickInsideSheet, tabletButtons\)/)
  assert.match(app, /activeQuickRef\.current\?\.pointerId === event\.pointerId\) \{\s*\n\s*const press = activeQuickRef\.current\s*\n\s*moveQuickConnectPress/)
  assert.match(app, /activeQuickRef\.current\?\.pointerId === event\.pointerId\) \{ finishQuickConnectPress/)
  assert.match(app, /activeQuickRef\.current\?\.pointerId === event\.pointerId\) \{ cancelQuickConnectPress/)
  assert.match(app, /quickHoverRef\.current !== null && inputModeRef\.current === 'desktop'[^\n]*cursor = 'pointer'/)
})

test('buttons whose centre is off the page are hidden and not hit', () => {
  const inside = (p) => p.x >= 0 && p.x <= 400 && p.y >= 0 && p.y <= 400
  const nearEdge = { x: 5, y: 150, width: 160, height: 80 }
  const dirs = q.quickConnectButtons(nearEdge, 1, inside).map((b) => b.direction)
  assert.ok(!dirs.includes('left'))
  assert.equal(dirs.length, 3)
  const left = q.quickConnectButtons(nearEdge, 1).find((b) => b.direction === 'left')
  assert.equal(q.hitQuickConnect(nearEdge, left.center, 1, inside), null)
  assert.equal(q.hitQuickConnect(nearEdge, left.center, 1), 'left')
})

test('quick-connect review fixes are wired in App', () => {
  assert.equal(q.QUICK_CONNECT_DOUBLE_CLICK_MS, 500)
  // 1: the press never joins a double-click pair, and a double-click right after one is ignored.
  assert.match(app, /activeQuickRef\.current = \{[^\n]*\n[^\n]*\n\s*clickPairRef\.current = null\n\s*clickBeforeRef\.current = null/)
  assert.match(app, /quickClickAtRef\.current = performance\.now\(\)/)
  assert.match(app, /performance\.now\(\) - quickClickAtRef\.current < QUICK_CONNECT_DOUBLE_CLICK_MS\) return/)
  // 2: hidden outside the sheet, in draw and hit.
  assert.match(app, /quickConnectButtons\(quickSource, scale, quickInsideSheet, tabletButtons\)/)
  assert.match(app, /hitQuickConnect\(source, point, viewportRef\.current\.scale, quickInsideSheet, tablet\)/)
  assert.match(app, /hitQuickConnect\(quickBox, point, viewportRef\.current\.scale, quickInsideSheet\)/)
  // 3: the press counts as an active gesture everywhere.
  const gestureLines = app.split('\n').filter((l) => /const (penGestureActive|canvasGestureActive|cancelableGesture|anyGesture) =/.test(l))
  assert.equal(gestureLines.length, 4)
  for (const l of gestureLines) assert.match(l, /activeQuickRef\.current !== null/)
  // 4: buttons stay drawn while pressed, the pressed one highlighted.
  assert.doesNotMatch(app, /mousePanRef\.current \|\| activeQuickRef\.current\) return null/)
  assert.match(app, /const hovered = activeQuickRef\.current\?\.direction \?\? quickHoverRef\.current/)
})
