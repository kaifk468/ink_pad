import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const nav = await loadModule('touchNavigator.ts')
const settingsModule = await loadModule('navigationSettings.ts')

const P = (x, y) => ({ x, y, pressure: 1 })
const VIEW = { scale: 1, offsetX: 0, offsetY: 0 }
const make = (settings = {}) => nav.createTouchNavigator(() => ({ oneFingerPan: false, zoomLocked: false, ...settings }))

function threeFingers(n, t = 0) {
  n.down(1, P(100, 100), t)
  n.down(2, P(200, 100), t + 15)
  n.down(3, P(300, 100), t + 30)
}

test('three fingers landing a few ms apart pan and never zoom, even if the spread changes', () => {
  const n = make()
  threeFingers(n)
  // while the third finger had not landed the app used to see a pinch; now nothing is decided before the move
  assert.equal(n.mode(), 'undecided')
  assert.equal(n.move(1, P(100, 100), 40, VIEW), null) // decides: pan
  assert.equal(n.mode(), 'pan')
  n.move(2, P(260, 100), 50, VIEW) // spreads the fingers out a lot
  const moved = n.move(3, P(340, 130), 60, VIEW)
  assert.equal(moved.scale, 1)
  assert.ok(moved.offsetX > 0 && moved.offsetY > 0)
})

test('the pan stays a pan when a finger lifts, and re-bases without a jump', () => {
  const n = make()
  threeFingers(n)
  n.move(1, P(100, 100), 40, VIEW)
  n.move(1, P(120, 100), 50, VIEW)
  n.up(3)
  assert.equal(n.mode(), 'pan')
  assert.equal(n.move(1, P(120, 100), 60, VIEW), null) // finger count changed: new base, no viewport change
  const moved = n.move(1, P(130, 100), 70, VIEW)
  assert.equal(moved.scale, 1)
  assert.ok(Math.abs(moved.offsetX - 5) < 1e-9)
})

test('two fingers pinch only after the spread changes by 6%, then zoom starts from there without a jump', () => {
  const n = make()
  n.down(1, P(100, 100), 0)
  n.down(2, P(300, 100), 10)
  assert.equal(n.move(2, P(300, 100), 80, VIEW), null)
  assert.equal(n.mode(), 'pinch-zoom')
  assert.equal(n.move(2, P(305, 100), 90, VIEW), null) // 2.5% change: ignored
  assert.equal(n.move(2, P(315, 100), 100, VIEW), null) // 7.5%: the pinch starts here
  const zoomed = n.move(2, P(415, 100), 110, VIEW) // distance 200 -> 315 from the start point, 315/215
  assert.ok(Math.abs(zoomed.scale - 315 / 215) < 1e-9)
})

test('a pinch is not decided before 60 ms, so a third finger landing in time makes it a pan', () => {
  const n = make()
  n.down(1, P(100, 100), 0)
  n.down(2, P(300, 100), 20)
  assert.equal(n.move(2, P(330, 100), 40, VIEW), null)
  assert.equal(n.mode(), 'undecided')
  n.down(3, P(500, 100), 50)
  n.move(3, P(500, 100), 55, VIEW)
  assert.equal(n.mode(), 'pan')
})

test('two touches close together (a resting palm) never become a pinch', () => {
  const n = make()
  n.down(1, P(100, 100), 0)
  n.down(2, P(120, 110), 5)
  n.move(2, P(122, 110), 100, VIEW)
  assert.equal(n.mode(), 'undecided')
  n.move(2, P(140, 110), 120, VIEW)
  assert.equal(n.mode(), 'undecided')
})

test('a locked pinch ignores a later third finger and lifting back to one finger', () => {
  const n = make()
  n.down(1, P(100, 100), 0)
  n.down(2, P(300, 100), 5)
  n.move(2, P(300, 100), 70, VIEW)
  assert.equal(n.mode(), 'pinch-zoom')
  n.down(3, P(500, 100), 90)
  assert.equal(n.move(3, P(520, 100), 95, VIEW), null)
  assert.equal(n.mode(), 'pinch-zoom')
  n.up(3)
  n.up(2)
  assert.equal(n.move(1, P(150, 100), 120, VIEW), null)
  assert.equal(n.mode(), 'pinch-zoom')
  n.up(1)
  assert.equal(n.mode(), 'none')
})

test('one finger does nothing by default', () => {
  const n = make()
  n.down(1, P(100, 100), 0)
  assert.equal(n.move(1, P(300, 300), 200, VIEW), null)
  assert.equal(n.mode(), 'undecided')
})

test('one-finger pan: starts after 8 px and 60 ms, ignores small moves, follows the finger', () => {
  const n = make({ oneFingerPan: true })
  n.down(1, P(100, 100), 0)
  assert.equal(n.move(1, P(150, 100), 30, VIEW), null) // too early
  assert.equal(n.move(1, P(104, 100), 70, VIEW), null) // moved only 4 px from the start
  assert.equal(n.mode(), 'undecided')
  assert.equal(n.move(1, P(120, 100), 80, VIEW), null) // pan begins, base set here
  assert.equal(n.mode(), 'pan')
  const moved = n.move(1, P(140, 110), 90, VIEW)
  assert.ok(Math.abs(moved.offsetX - 20) < 1e-9 && Math.abs(moved.offsetY - 10) < 1e-9)
})

test('one-finger pan is refused while the pen is near and again for 1 s after the pen was last seen', () => {
  const n = make({ oneFingerPan: true })
  n.penSeen(1000)
  n.down(1, P(100, 100), 1100)
  n.move(1, P(200, 100), 1200, VIEW)
  assert.equal(n.mode(), 'undecided')
  n.up(1)
  n.down(2, P(100, 100), 2500) // 1500 ms after the last pen event
  n.move(2, P(200, 100), 2600, VIEW)
  assert.equal(n.mode(), 'pan')
  n.up(2)
  n.penSeen(3000)
  n.penGone()
  n.down(3, P(100, 100), 3010)
  n.move(3, P(200, 100), 3100, VIEW)
  assert.equal(n.mode(), 'pan') // pen left the screen area
})

test('touches are dropped when the pen lands and ignored while it touches, then work again', () => {
  const n = make({ oneFingerPan: true })
  threeFingers(n)
  n.move(1, P(100, 100), 40, VIEW)
  assert.equal(n.mode(), 'pan')
  n.penDown()
  assert.equal(n.touchCount(), 0)
  assert.equal(n.tracks(1), false)
  assert.equal(n.move(1, P(180, 100), 60, VIEW), null)
  n.down(4, P(500, 500), 70)
  assert.equal(n.touchCount(), 0)
  n.penUp(100)
  n.down(5, P(10, 10), 120)
  assert.equal(n.touchCount(), 1)
})

test('zoom lock: a pinch does nothing, a pan still works, and a blocked pinch turns into a pan with a third finger', () => {
  const n = make({ zoomLocked: true })
  n.down(1, P(100, 100), 0)
  n.down(2, P(300, 100), 5)
  assert.equal(n.move(2, P(300, 100), 70, VIEW), null)
  assert.equal(n.mode(), 'blocked')
  assert.equal(n.move(2, P(500, 100), 80, VIEW), null)
  n.down(3, P(700, 100), 90)
  n.move(3, P(700, 100), 95, VIEW)
  assert.equal(n.mode(), 'pan')
  assert.ok(n.move(3, P(740, 130), 100, VIEW).offsetX > 0)
  n.up(1); n.up(2); n.up(3)
  const m = make({ zoomLocked: true })
  threeFingers(m)
  m.move(1, P(100, 100), 40, VIEW)
  assert.equal(m.mode(), 'pan')
})

test('zoom lock switched on in the middle of a pinch stops the zoom', () => {
  const settings = { oneFingerPan: false, zoomLocked: false }
  const n = nav.createTouchNavigator(() => settings)
  n.down(1, P(100, 100), 0)
  n.down(2, P(300, 100), 5)
  n.move(2, P(300, 100), 70, VIEW)
  n.move(2, P(330, 100), 80, VIEW)
  assert.ok(n.move(2, P(400, 100), 90, VIEW))
  settings.zoomLocked = true
  assert.equal(n.move(2, P(450, 100), 100, VIEW), null)
})

test('navigation settings are stored as on/off and default to off', () => {
  const store = new Map()
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
  assert.deepEqual({ ...settingsModule.loadNavigationSettings(storage) }, { oneFingerPan: false, zoomLocked: false })
  settingsModule.saveNavigationSettings({ oneFingerPan: true, zoomLocked: true }, storage)
  assert.deepEqual({ ...settingsModule.loadNavigationSettings(storage) }, { oneFingerPan: true, zoomLocked: true })
  assert.deepEqual({ ...settingsModule.loadNavigationSettings({ getItem: () => { throw new Error('blocked') } }) }, { oneFingerPan: false, zoomLocked: false })
})

test('App routes touch and pen events through the navigator and honours the zoom lock', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /touchNav\.down\(event\.pointerId, getScreenPoint\(event\), performance\.now\(\)\)/)
  assert.match(app, /touchNav\.move\(event\.pointerId, getScreenPoint\(event\), performance\.now\(\), viewportRef\.current\)/)
  assert.match(app, /if \(event\.pointerType === 'pen'\) touchNav\.penDown\(\)/)
  assert.match(app, /if \(event\.pointerType === 'pen'\) touchNav\.penSeen\(performance\.now\(\)\)/)
  assert.match(app, /if \(event\.pointerType === 'pen'\) touchNav\.penGone\(\)/)
  assert.match(app, /const zoomBy = \(factor: number\) => \{\s*if \(navigationSettingsRef\.current\.zoomLocked\) return/)
  assert.match(app, /const fitDrawingView = \(\) => \{\s*if \(navigationSettingsRef\.current\.zoomLocked\) return/)
  const bar = await readFile(new URL('../src/app/TopLeftBar.tsx', import.meta.url), 'utf8')
  assert.match(bar, /One-finger pan/)
  const zoom = await readFile(new URL('../src/app/ZoomControls.tsx', import.meta.url), 'utf8')
  assert.match(zoom, /aria-pressed=\{locked\}/)
})
