import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const q = await loadModule('quickConnect.ts')
const m = await loadModule('canvasModel.ts')
const app = await readAppSource()
const pt = (x, y) => ({ x, y, pressure: 1 })
const box = { x: 100, y: 100, width: 160, height: 80 }

test('tablet buttons: bigger, 18 px hit, clear of the resize and rotate handles', () => {
  assert.equal(q.TABLET_QUICK_CONNECT_RADIUS_PX, 14)
  assert.equal(q.TABLET_QUICK_CONNECT_HIT_RADIUS_PX, 18)
  for (const scale of [0.5, 1, 2.5]) {
    for (const b of q.quickConnectButtons(box, scale, undefined, true)) {
      assert.equal(b.radius, 14 / scale)
      assert.equal(b.hitRadius, 18 / scale)
      assert.equal(q.hitQuickConnect(box, pt(b.center.x + 17 / scale, b.center.y), scale, undefined, true), b.direction)
      assert.equal(q.hitQuickConnect(box, pt(b.center.x, b.center.y + 19 / scale), scale, undefined, true), null)
    }
    assert.equal(q.quickConnectButtons(box, scale)[0].hitRadius, q.QUICK_CONNECT_RADIUS_PX / scale)
  }
})

test('tablet buttons never overlap tablet resize (14 px) or rotate (12 px) hit circles', () => {
  for (const scale of [0.4, 1, 3]) {
    for (const size of [{ width: 41 / scale, height: 41 / scale }, { width: 160, height: 80 }, { width: 600, height: 300 }]) {
      const b = { x: 50, y: 70, ...size }
      if (!q.quickConnectFits(b, scale, true)) continue
      const rotate = m.rotateHandle({ kind: 'rectangle', id: 1, ...b, strokeColor: '#111', strokeWidth: 2 }, scale)
      for (const button of q.quickConnectButtons(b, scale, undefined, true)) {
        for (const { point } of m.getRectangleResizeHandles(b)) {
          assert.ok(Math.hypot(point.x - button.center.x, point.y - button.center.y) * scale >= 18 + 14, `${button.direction} vs resize at ${scale}`)
        }
        assert.ok(Math.hypot(rotate.point.x - button.center.x, rotate.point.y - button.center.y) * scale >= 18 + 12, `${button.direction} vs rotate at ${scale}`)
      }
    }
  }
})

test('tablet hides the buttons under 40 px on screen; desktop threshold stays 24', () => {
  const small = { x: 0, y: 0, width: 100, height: 30 }
  assert.equal(q.quickConnectFits(small, 1), true)
  assert.equal(q.quickConnectFits(small, 1, true), false)
  assert.equal(q.hitQuickConnect(small, q.quickConnectButtons(small, 1, undefined, true)[0].center, 1, undefined, true), null)
})

test('wiring: tablet pen and touch tap, drag cancels, a second finger or the pen cancels', () => {
  assert.match(app, /event\.pointerType === 'pen' && !isPenButtonHeld\(event\.nativeEvent\)\) \|\| \(event\.pointerType === 'touch' && touchNav\.touchCount\(\) === 0 && !touchNav\.penNear\(performance\.now\(\)\)/)
  assert.match(app, /else if \(selectionMode && !laserModeRef\.current && touchNav\.touchCount\(\) === 0 && startQuickConnectPress\(event, getPoint\(event\)\)\) \{[^\n]*\n[^\n]*\n\s*return/)
  assert.match(app, /if \(tablet && touchNav\.touchCount\(\) > 0\) return null/)
  assert.match(app, /button\.direction === hovered && !tabletButtons/)
  assert.equal(q.TABLET_QUICK_CONNECT_TAP_SLOP_PX, 10)
  assert.match(app, /press\.pointerType === 'mouse' \? CONNECTOR_CLICK_SLOP_PX : TABLET_QUICK_CONNECT_TAP_SLOP_PX/)
  assert.match(app, /const touchQuick = activeQuickRef\.current\?\.pointerType === 'touch' \? activeQuickRef\.current : null\s*\n\s*if \(touchQuick\) \{[\s\S]*?cancelQuickConnectPress\(\)\s*\n\s*touchNav\.down\(firstId, firstStart, performance\.now\(\)\)/)
  assert.match(app, /event\.pointerType === 'pen' && activeQuickRef\.current\?\.pointerType === 'touch'\) cancelQuickConnectPress\(\)/)
  // the finger on a button returns before touchNav.down(event.pointerId), so a drag never pans
  const branch = app.slice(app.indexOf('const touchQuick ='), app.indexOf('const touchHandle ='))
  assert.doesNotMatch(branch.slice(branch.indexOf('startQuickConnectPress')), /touchNav\.down\(event\.pointerId/)
  // a tap runs the desktop action (one history step inside quickCreateShape) and opens no editor
  const finish = app.slice(app.indexOf('const finishQuickConnectPress'), app.indexOf('const cancelQuickConnectPress'))
  assert.match(finish, /quickCreateShape\(press\.direction\)/)
  assert.doesNotMatch(finish, /TextEditor|focus\(/)
  // buttons only start from the Select tool
  assert.match(app, /if \(selectionMode && startQuickConnectPress\(event, point\)\) return/)
})

test('tablet up button is clear of the ink box move grip and its hit circle', async () => {
  const ink = await loadModule('inkClassBox.ts')
  for (const scale of [0.5, 1, 2.5]) {
    const grip = ink.inkBoxMoveGrip(box, scale)
    const up = q.quickConnectButtons(box, scale, undefined, true).find((b) => b.direction === 'up')
    assert.ok(Math.hypot(grip.x - up.center.x, grip.y - up.center.y) >= grip.radius + 6 / scale + up.hitRadius, `grip clear at ${scale}`)
    assert.equal(q.hitQuickConnect(box, pt(grip.x, grip.y), scale, undefined, true), null)
  }
})

test('wiring: a touch quick press dragged past the slop hands the finger to navigation only with one-finger pan', () => {
  assert.match(app, /press\.pointerType === 'touch' && press\.dragged && navigationSettingsRef\.current\.oneFingerPan\) \{[\s\S]*?cancelQuickConnectPress\(\)\s*\n\s*touchNav\.down\(pointerId, startScreen/)
})
