import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const laser = await loadModule('laserPointer.ts')
const input = await loadModule('desktopInput.ts')
const shortcuts = await loadModule('desktopShortcuts.ts')
const palette = await loadModule('commandPalette.ts')
const app = await readAppSource()
const key = (k, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra })

test('points are added with their time; a near-duplicate of the last point is ignored', () => {
  let points = laser.addLaserPoint([], 10, 10, 0)
  points = laser.addLaserPoint(points, 10.2, 10.2, 5)
  assert.equal(points.length, 1)
  points = laser.addLaserPoint(points, 30, 40, 10)
  assert.deepEqual(points, [{ x: 10, y: 10, at: 0 }, { x: 30, y: 40, at: 10 }])
})

test('points older than the lifetime are pruned; the trail is gone within about a second', () => {
  assert.ok(laser.LASER_LIFETIME_MS <= 1000 && laser.LASER_LIFETIME_MS >= 500)
  const points = [{ x: 0, y: 0, at: 0 }, { x: 5, y: 5, at: 500 }, { x: 9, y: 9, at: 900 }]
  assert.deepEqual(laser.pruneLaser(points, 950).map((p) => p.at), [500, 900])
  assert.deepEqual(laser.pruneLaser(points, laser.LASER_LIFETIME_MS + 900), [])
  assert.equal(laser.laserVisible(points, 950), true)
  assert.equal(laser.laserVisible(points, 900 + laser.LASER_LIFETIME_MS), false)
  assert.equal(laser.laserVisible([], 0), false)
})

test('adding prunes old points and caps the list length', () => {
  let points = laser.addLaserPoint([], 0, 0, 0)
  points = laser.addLaserPoint(points, 50, 50, laser.LASER_LIFETIME_MS + 1)
  assert.deepEqual(points.map((p) => p.x), [50])
  let many = []
  for (let i = 0; i < laser.LASER_MAX_POINTS + 50; i += 1) many = laser.addLaserPoint(many, i * 3, 0, 1)
  assert.equal(many.length, laser.LASER_MAX_POINTS)
  assert.equal(many[many.length - 1].x, (laser.LASER_MAX_POINTS + 49) * 3)
})

test('alpha is 1 when new, falls with age, and is 0 at the lifetime', () => {
  const p = { x: 0, y: 0, at: 100 }
  assert.equal(laser.laserAlpha(p, 100), 1)
  const mid = laser.laserAlpha(p, 100 + laser.LASER_LIFETIME_MS / 2)
  assert.ok(mid > 0 && mid < 1)
  assert.ok(laser.laserAlpha(p, 100 + laser.LASER_LIFETIME_MS * 0.8) < mid)
  assert.equal(laser.laserAlpha(p, 100 + laser.LASER_LIFETIME_MS), 0)
  assert.equal(laser.laserAlpha(p, 100 + laser.LASER_LIFETIME_MS * 3), 0)
})

test('segments join consecutive points with the newer end alpha; a single point has none; faded ones are dropped', () => {
  assert.deepEqual(laser.laserSegments([{ x: 1, y: 1, at: 0 }], 0), [])
  const points = [{ x: 0, y: 0, at: 0 }, { x: 10, y: 0, at: 400 }, { x: 20, y: 0, at: 800 }]
  const segments = laser.laserSegments(points, 800)
  assert.equal(segments.length, 2)
  assert.equal(segments[1].alpha, 1)
  assert.ok(segments[0].alpha < 1)
  assert.deepEqual([segments[0].x1, segments[0].x2], [0, 10])
  assert.equal(laser.laserSegments(points, 400 + laser.LASER_LIFETIME_MS).length, 1)
})

test('X is the laser key, desktop only, with a shortcut row that maps to it and so a palette entry', () => {
  assert.deepEqual(input.keyCommand(key('x'), 'desktop'), { kind: 'tool', tool: 'laser' })
  assert.equal(input.keyCommand(key('x'), 'tablet'), null)
  assert.equal(input.keyCommand(key('x', { repeat: true }), 'desktop'), null)
  assert.deepEqual(input.keyCommand(key('x', { ctrlKey: true }), 'desktop'), { kind: 'cut' }, 'Ctrl+X still cuts')
  const row = shortcuts.DESKTOP_SHORTCUTS.find((entry) => entry.keys === 'X')
  assert.ok(row && /Laser/.test(row.label))
  assert.ok(palette.shortcutPaletteEntries().some((entry) => entry.keys === 'X' && /Laser/.test(entry.label)))
})

test('the laser cursor is a crosshair in desktop mode', () => {
  assert.equal(input.canvasCursor({ mode: 'desktop', tool: 'laser', hover: 'item', panning: false, spaceHeld: false }), 'crosshair')
  assert.equal(input.canvasCursor({ mode: 'tablet', tool: 'laser', hover: 'none', panning: false, spaceHeld: false }), '')
})

test('wiring: the laser branch precedes the gesture gate, touch keeps navigation, nothing is saved', () => {
  const down = app.slice(app.indexOf('const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>)'), app.indexOf('const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>)'))
  const laserAt = down.indexOf('if (laserModeRef.current && (event.pointerType')
  assert.ok(laserAt > 0)
  assert.ok(laserAt < down.indexOf('if (!canStartCanvasGesture('), 'laser comes before the gesture gate')
  assert.ok(laserAt < down.indexOf('saveHistory('), 'laser comes before any drawing or history')
  assert.ok(laserAt < down.indexOf('clickSelectTarget('), 'laser comes before selection')
  assert.match(down, /touchNav\.down\(event\.pointerId[\s\S]*if \(laserModeRef\.current\) \{[\s\S]*laserOnTouchDown\(/)
  assert.match(app, /oneFingerPan: false/)
  const laserBody = app.slice(app.indexOf('const drawLaser'), app.indexOf('const undo = () =>'))
  assert.doesNotMatch(laserBody, /saveHistory|strokesRef\.current\s*=|scheduleAutosave/)
  assert.match(laserBody, /requestAnimationFrame\(drawLaser\)/)
  assert.match(laserBody, /devicePixelRatio/)
  assert.match(app, /case 'laser': toggleLaserTool\(\); break/)
  assert.doesNotMatch(app, /case 'laser': if \(!laserModeRef/)
  assert.match(app, /if \(laserModeRef\.current && !cancelableGesture\) \{ leaveLaser\(\); return true \}/)
  assert.match(app, /const selectPenMode = \(\) => \{\n\s+setLaserMode\(false\)/)
  assert.match(app, /useEffect\(\(\) => \{ if \(anotherToolActive\) setLaserMode\(false\) \}/)
  assert.match(app, /\{laserMode && <canvas ref=\{laserCanvasRef\} className="laser-overlay"/)
  assert.match(app, /onLaser=\{toggleLaserTool\}/)
})

test('wiring: More tray entry in both modes, aria-pressed, overlay never takes pointer events', async () => {
  const more = await readFile(new URL('../src/app/MoreTray.tsx', import.meta.url), 'utf8')
  assert.match(more, /aria-label="Laser pointer" aria-pressed=\{Boolean\(laserActive\)\}/)
  const dock = await readFile(new URL('../src/app/ToolDock.tsx', import.meta.url), 'utf8')
  assert.equal((dock.match(/<MoreTray [^>]*onLaser=\{props\.onLaser\}/g) ?? []).length, 2)
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.match(css, /\.laser-overlay \{[^}]*pointer-events: none/)
})
