import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const nav = await loadModule('touchNavigator.ts')
const settingsModule = await loadModule('navigationSettings.ts')

const P = (x, y) => ({ x, y, pressure: 1 })
const VIEW = { scale: 1, offsetX: 0, offsetY: 0 }
const make = (settings = {}) => nav.createTouchNavigator(() => ({ oneFingerPan: false, zoomLocked: false, ...settings }))

test('two fingers down and up quickly is a 2-finger tap', () => {
  const n = make()
  n.down(1, P(100, 100), 0)
  n.down(2, P(300, 100), 20)
  assert.equal(n.up(1, 100), null)
  assert.deepEqual(n.up(2, 120), { fingers: 2 })
})

test('three fingers is a 3-finger tap; four fingers is nothing', () => {
  const n = make()
  n.down(1, P(100, 100), 0); n.down(2, P(300, 100), 10); n.down(3, P(500, 100), 20)
  n.up(1, 100); n.up(2, 100)
  assert.deepEqual(n.up(3, 110), { fingers: 3 })
  n.down(1, P(100, 100), 1000); n.down(2, P(300, 100), 1010); n.down(3, P(500, 100), 1020); n.down(4, P(700, 100), 1030)
  for (const id of [1, 2, 3]) n.up(id, 1100)
  assert.equal(n.up(4, 1100), null)
})

test('one finger is never a tap', () => {
  const n = make()
  n.down(1, P(100, 100), 0)
  assert.equal(n.up(1, 50), null)
})

test('too slow: lifted after 300 ms is not a tap', () => {
  const n = make()
  n.down(1, P(100, 100), 0); n.down(2, P(300, 100), 10)
  n.up(1, 100)
  assert.equal(n.up(2, 301), null)
  n.down(1, P(100, 100), 1000); n.down(2, P(300, 100), 1010)
  n.up(1, 1100)
  assert.deepEqual(n.up(2, 1300), { fingers: 2 })
})

test('a finger that moved 12 px or more is not a tap', () => {
  const n = make()
  n.down(1, P(100, 100), 0); n.down(2, P(300, 100), 10)
  n.move(1, P(111, 100), 30, VIEW)
  n.up(1, 100)
  assert.deepEqual(n.up(2, 110), { fingers: 2 })
  n.down(1, P(100, 100), 1000); n.down(2, P(300, 100), 1010)
  n.move(2, P(300, 113), 1030, VIEW)
  n.up(1, 1100)
  assert.equal(n.up(2, 1110), null)
})

test('staggered landing: second finger more than 150 ms after the first is not a tap', () => {
  const n = make()
  n.down(1, P(100, 100), 0); n.down(2, P(300, 100), 151)
  n.up(1, 200)
  assert.equal(n.up(2, 210), null)
  n.down(1, P(100, 100), 1000); n.down(2, P(300, 100), 1150)
  n.up(1, 1200)
  assert.deepEqual(n.up(2, 1210), { fingers: 2 })
})

test('a finger that lifts before the next lands is not a tap', () => {
  const n = make()
  n.down(1, P(100, 100), 0)
  n.up(1, 40)
  n.down(2, P(300, 100), 60)
  assert.equal(n.up(2, 100), null)
})

test('palm: two touches closer than the pinch minimum are not a tap', () => {
  const n = make()
  n.down(1, P(100, 100), 0); n.down(2, P(100 + nav.MIN_PINCH_DISTANCE - 1, 100), 10)
  n.up(1, 80)
  assert.equal(n.up(2, 90), null)
})

test('a pinch that zoomed the viewport is not a tap', () => {
  const n = make()
  n.down(1, P(100, 100), 0); n.down(2, P(300, 100), 10)
  n.move(1, P(100, 100), 70, VIEW) // decides pinch-zoom
  assert.equal(n.mode(), 'pinch-zoom')
  n.move(2, P(310, 100), 80, VIEW) // crosses the start ratio
  n.move(2, P(400, 100), 90, VIEW) // crosses the start ratio
  const zoomed = n.move(2, P(420, 100), 95, VIEW)
  assert.ok(zoomed)
  n.up(1, 120)
  assert.equal(n.up(2, 130), null)
})

test('a three-finger pan that moved the viewport is not a tap', () => {
  const n = make()
  n.down(1, P(100, 100), 0); n.down(2, P(300, 100), 10); n.down(3, P(500, 100), 20)
  n.move(1, P(100, 100), 30, VIEW) // decides pan
  const panned = n.move(1, P(100, 160), 40, VIEW)
  assert.ok(panned)
  n.up(1, 100); n.up(2, 100)
  assert.equal(n.up(3, 110), null)
})

test('pen touching during the gesture cancels the tap', () => {
  const n = make()
  n.down(1, P(100, 100), 0); n.down(2, P(300, 100), 10)
  n.penDown()
  n.penUp(50)
  n.up(1, 100)
  assert.equal(n.up(2, 110), null)
})

test('pen near when the first finger lands is not a tap; after the near window it is', () => {
  const n = make()
  n.penSeen(0)
  n.down(1, P(100, 100), 500); n.down(2, P(300, 100), 510)
  n.up(1, 560)
  assert.equal(n.up(2, 570), null)
  n.down(1, P(100, 100), 2000); n.down(2, P(300, 100), 2010)
  n.up(1, 2060)
  assert.deepEqual(n.up(2, 2070), { fingers: 2 })
})

test('pen touching while fingers land: touches are dropped, no tap', () => {
  const n = make()
  n.penDown()
  n.down(1, P(100, 100), 0); n.down(2, P(300, 100), 10)
  assert.equal(n.up(1, 50), null)
  assert.equal(n.up(2, 60), null)
})

test('a mouse gesture cancels the tap', () => {
  const n = make()
  n.down(1, P(100, 100), 0); n.down(2, P(300, 100), 10)
  n.mouseDown(); n.mouseUp()
  n.up(1, 50)
  assert.equal(n.up(2, 60), null)
})

test('cancelTap (pointercancel) and up without a time never produce a tap', () => {
  const n = make()
  n.down(1, P(100, 100), 0); n.down(2, P(300, 100), 10)
  n.cancelTap()
  n.up(1, 50)
  assert.equal(n.up(2, 60), null)
  n.down(1, P(100, 100), 1000); n.down(2, P(300, 100), 1010)
  n.up(1)
  assert.equal(n.up(2), null)
  // detector state is clean again afterwards
  n.down(1, P(100, 100), 2000); n.down(2, P(300, 100), 2010)
  n.up(1, 2050)
  assert.deepEqual(n.up(2, 2060), { fingers: 2 })
})

test('zoom lock does not stop a tap (no viewport change)', () => {
  const n = make({ zoomLocked: true })
  n.down(1, P(100, 100), 0); n.down(2, P(300, 100), 10)
  n.move(1, P(101, 100), 80, VIEW)
  n.up(1, 120)
  assert.deepEqual(n.up(2, 130), { fingers: 2 })
})

test('tap detection leaves the navigator mode decisions unchanged', () => {
  const n = make()
  n.down(1, P(100, 100), 0); n.down(2, P(300, 100), 10)
  assert.equal(n.mode(), 'undecided')
  n.move(1, P(100, 100), 70, VIEW)
  assert.equal(n.mode(), 'pinch-zoom')
})

test('tap-undo setting: on by default, remembered, off when stored off', () => {
  const store = new Map()
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
  assert.equal(settingsModule.loadTapUndo(storage), true)
  settingsModule.saveTapUndo(false, storage)
  assert.equal(store.get('inkpad.tapUndo'), 'off')
  assert.equal(settingsModule.loadTapUndo(storage), false)
  settingsModule.saveTapUndo(true, storage)
  assert.equal(settingsModule.loadTapUndo(storage), true)
  assert.equal(settingsModule.loadTapUndo({ getItem: () => { throw new Error('x') } }), true)
})

test('App wiring: touch pointer up feeds the tap into undo/redo with a toast, gated by the setting', async () => {
  const src = await readAppSource()
  assert.match(src, /touchNav\.up\(event\.pointerId, performance\.now\(\)\)/)
  assert.match(src, /event\.type !== 'pointerup' \|\| event\.pointerType !== 'touch'/)
  assert.match(src, /tapUndoRef\.current/)
  assert.match(src, /tap\.fingers === 2\) \{ if \(historyRef\.current\.canUndo\) \{ undo\(\); showTapToast\('Undo'\)/)
  assert.match(src, /redo\(\); showTapToast\('Redo'\)/)
  assert.match(src, /loadTapUndo\(\)/)
  assert.match(src, /saveTapUndo\(value\)/)
  assert.match(src, /touchNav\.cancelTap\(\)/)
  assert.match(src, /Two-finger tap to undo/)
  assert.match(src, /Tap with two fingers to undo, three to redo/)
})
