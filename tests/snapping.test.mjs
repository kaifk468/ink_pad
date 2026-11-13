import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const snap = await loadModule('snapping.ts')
const format = await loadModule('documentFormat.ts')
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const bar = await readFile(new URL('../src/app/TopLeftBar.tsx', import.meta.url), 'utf8')

const b = (x, y, width, height) => ({ x, y, width, height })
const memoryStorage = (initial = {}) => {
  const data = { ...initial }
  return { getItem: (key) => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value) }, data }
}
const brokenStorage = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }

test('left edge, right edge and top edge snap to a target within tolerance, with guides', () => {
  const target = b(100, 100, 200, 100)
  // left edge 3 px right of the target's left edge
  let result = snap.findSnap(b(103, 300, 50, 50), [target], 6)
  assert.equal(result.dx, -3)
  assert.equal(result.dy, 0)
  assert.deepEqual(result.guides.filter((g) => g.axis === 'x').map((g) => g.position), [100])
  // right edge to right edge
  result = snap.findSnap(b(252, 300, 50, 50), [target], 6)
  assert.equal(result.dx, -2)
  // top edge to top edge
  result = snap.findSnap(b(500, 104, 50, 50), [target], 6)
  assert.equal(result.dy, -4)
  assert.equal(result.guides[0].axis, 'y')
  assert.equal(result.guides[0].position, 100)
})

test('centre lines snap too, horizontally and vertically', () => {
  const target = b(100, 100, 200, 100) // centres x=200, y=150
  let result = snap.findSnap(b(172, 400, 50, 50), [target], 6) // centre x = 197
  assert.equal(result.dx, 3)
  assert.ok(result.guides.some((g) => g.axis === 'x' && g.position === 200))
  result = snap.findSnap(b(600, 128, 50, 50), [target], 6) // centre y = 153
  assert.equal(result.dy, -3)
  assert.ok(result.guides.some((g) => g.axis === 'y' && g.position === 150))
})

test('a guide spans the moving box and the target it is aligned with', () => {
  const result = snap.findSnap(b(102, 400, 50, 50), [b(100, 100, 200, 100)], 6)
  const guide = result.guides.find((g) => g.axis === 'x' && g.position === 100)
  assert.equal(guide.start, 100)
  assert.equal(guide.end, 450)
})

test('no snap on an axis when nothing is within tolerance, and none with no targets', () => {
  assert.deepEqual(snap.findSnap(b(120, 400, 50, 50), [b(100, 100, 200, 100)], 6), { dx: 0, dy: 0, guides: [] })
  assert.deepEqual(snap.findSnap(b(120, 400, 50, 50), [], 6), { dx: 0, dy: 0, guides: [] })
  const oneAxis = snap.findSnap(b(103, 400, 50, 50), [b(100, 100, 200, 100)], 6)
  assert.equal(oneAxis.dx, -3)
  assert.equal(oneAxis.dy, 0)
})

test('tolerance is in screen pixels: it shrinks when zoomed in and grows when zoomed out', () => {
  const target = [b(100, 100, 200, 100)]
  assert.equal(snap.findSnap(b(104, 400, 50, 50), target, 6, 1).dx, -4)
  assert.equal(snap.findSnap(b(104, 400, 50, 50), target, 6, 2).dx, 0) // 6 px = 3 units at 2x
  assert.equal(snap.findSnap(b(110, 400, 50, 50), target, 6, 0.5).dx, -10) // 6 px = 12 units at 0.5x
  assert.equal(snap.findSnap(b(110, 400, 50, 50), target, 6, 1).dx, 0)
})

test('pen tolerance is 5 px and mouse 6 px, so a finger-sized slip does not jump', () => {
  assert.equal(snap.snapTolerancePx('mouse'), 6)
  assert.equal(snap.snapTolerancePx('pen'), 5)
  const target = [b(100, 100, 200, 100)]
  const moving = b(105.5, 400, 50, 50)
  assert.equal(snap.snapForDrag(true, false, moving, target, 'mouse', 1).dx, -5.5)
  assert.equal(snap.snapForDrag(true, false, moving, target, 'pen', 1).dx, 0)
})

test('the nearest snap wins on each axis', () => {
  const targets = [b(100, 0, 50, 50), b(105, 100, 50, 50)]
  const result = snap.findSnap(b(103, 400, 50, 50), targets, 6)
  assert.equal(result.dx, 2) // 105 is 2 away, 100 is 3 away
})

test('group bounds work like a single box', async () => {
  const model = await loadModule('canvasModel.ts')
  const items = [
    { kind: 'rectangle', id: 1, x: 0, y: 0, width: 40, height: 40, strokeColor: '#000', strokeWidth: 0 },
    { kind: 'rectangle', id: 2, x: 100, y: 0, width: 40, height: 40, strokeColor: '#000', strokeWidth: 0 },
  ]
  const group = model.getCanvasSelectionBounds(items, new Set(['rectangle:1', 'rectangle:2']))
  assert.deepEqual(group, { x: 0, y: 0, width: 140, height: 40 })
  // dragged 292 right: the group's right edge (432) is 2 from the target's left edge (430)
  const result = snap.findSnap({ ...group, x: group.x + 292, y: 500 }, [b(430, 200, 100, 100)], 6)
  assert.equal(result.dx, -2)
})

test('the moving items are never their own targets, and only boxes and labels are targets', () => {
  const items = [
    { kind: 'rectangle', id: 1, x: 0, y: 0, width: 100, height: 50, strokeColor: '#000', strokeWidth: 0 },
    { kind: 'rectangle', id: 2, x: 300, y: 0, width: 100, height: 50, strokeColor: '#000', strokeWidth: 0 },
    { kind: 'text', id: 3, x: 600, y: 0, width: 60, height: 20, text: 't', fontSize: 16, color: '#000' },
    { kind: 'stroke', id: 4, points: [{ x: 0, y: 0, pressure: 1 }, { x: 900, y: 0, pressure: 1 }], color: '#000', width: 4, erase: false },
  ]
  const targets = snap.snapTargetsFor(items, new Set(['rectangle:1']))
  assert.deepEqual(targets.map((t) => t.x), [300, 600])
  assert.equal(snap.selectionCanSnap(items, new Set(['rectangle:1'])), true)
  assert.equal(snap.selectionCanSnap(items, new Set(['text:3'])), true)
  assert.equal(snap.selectionCanSnap(items, new Set(['stroke:4'])), false)
})

test('targets are culled to the visible area plus a margin', () => {
  const view = b(0, 0, 1000, 800)
  const targets = [b(100, 100, 50, 50), b(1100, 100, 50, 50), b(5000, 5000, 50, 50), b(-150, 0, 50, 50), b(-400, 0, 50, 50)]
  assert.deepEqual(snap.cullTargets(targets, view, 200).map((t) => t.x), [100, 1100, -150])
  assert.equal(snap.SNAP_VIEW_MARGIN, 200)
})

test('when the setting is off, or Alt is held with a mouse, there is no snap and no guides', () => {
  const moving = b(103, 400, 50, 50)
  const target = [b(100, 100, 200, 100)]
  assert.equal(snap.snapForDrag(false, false, moving, target, 'mouse', 1), null)
  assert.equal(snap.snapForDrag(true, true, moving, target, 'mouse', 1), null)
  assert.notEqual(snap.snapForDrag(true, false, moving, target, 'mouse', 1), null)
})

test('the setting defaults to on, saves under its own key, survives a round trip, and falls back to on when storage fails', () => {
  assert.equal(snap.loadSnapping(memoryStorage()), true)
  assert.equal(snap.loadSnapping(memoryStorage({ 'inkpad.snapping': 'garbage' })), true)
  assert.equal(snap.loadSnapping(memoryStorage({ 'inkpad.snapping': 'off' })), false)
  assert.equal(snap.loadSnapping(brokenStorage), true)
  assert.doesNotThrow(() => snap.saveSnapping(false, brokenStorage))
  const storage = memoryStorage()
  snap.saveSnapping(false, storage)
  assert.deepEqual(storage.data, { 'inkpad.snapping': 'off' })
  assert.equal(snap.loadSnapping(storage), false)
  snap.saveSnapping(true, storage)
  assert.equal(snap.loadSnapping(storage), true)
})

test('micro benchmark: snapping against 1000 target boxes is fast', () => {
  const targets = Array.from({ length: 1000 }, (_, i) => b((i % 40) * 130 + 3, Math.floor(i / 40) * 90 + 3, 100, 60))
  const moving = b(2000, 1000, 100, 60)
  const runs = 200
  const started = performance.now()
  for (let i = 0; i < runs; i += 1) snap.findSnap({ ...moving, x: moving.x + i * 0.37 }, targets, 6, 1)
  const perCall = (performance.now() - started) / runs
  console.log(`# snapping micro benchmark: ${perCall.toFixed(3)} ms per findSnap against 1000 targets`)
  assert.ok(perCall < 25)
})

test('guides and snap never reach the saved format: snapped positions are plain numbers and the setting is not in the document', () => {
  const doc = format.createDocument({ title: 't', items: [{ kind: 'rectangle', id: 1, x: 100, y: 100, width: 50, height: 50, strokeColor: '#000', strokeWidth: 4 }], template: 'blank', pageBackground: 'white' })
  const text = format.stringifyDocument(doc)
  assert.doesNotMatch(text, /snap|guide/i)
  const parsed = JSON.parse(text)
  const rectangle = (parsed.page?.items ?? parsed.pages?.[0]?.items ?? parsed.items)[0]
  assert.deepEqual(Object.keys(rectangle).sort(), ['height', 'id', 'kind', 'strokeColor', 'strokeWidth', 'width', 'x', 'y'])
})

test('App wiring: the setting gates the snap call, Alt is Desktop mouse only, guides are cleared on every end path and drawn only on the canvas pass', () => {
  assert.match(app, /const \[snapping, setSnapping\] = useState\(\(\) => loadSnapping\(\)\)/)
  assert.match(app, /saveSnapping\(on\)/)
  assert.match(app, /const altWithMouse = event\.altKey && event\.pointerType === 'mouse' && inputModeRef\.current === 'desktop'\n\s*if \(!snappingRef\.current \|\| altWithMouse\) \{\n\s*guidesRef\.current = \[\]\n\s*return \{ dx, dy \}/)
  // both drag paths snap through the same helper, before the workspace clamp
  assert.match(app, /snapDragDelta\(event, lassoDrag\.originalItems, lassoDrag\.keys, deltaX, deltaY\)/)
  assert.match(app, /snapDragDelta\(event, drag\.originalItems, dragKeys, deltaX, deltaY\)/)
  assert.doesNotMatch(app, /snapDragDelta\([^)]*\)[\s\S]{0,40}(activeConnectorRef|activeStrokeRef)/)
  // cleared on pointer up, cancel/lost capture, Escape cancel and page or document reset
  assert.equal((app.match(/if \(snapStateRef\.current\?\.pointerId === event\.pointerId\) clearSnapGuides\(\)/g) ?? []).length, 2)
  assert.match(app, /if \(!handled\) return false\n\s*clearSnapGuides\(false\)/)
  assert.match(app, /const resetInteractionState = \(\) => \{[\s\S]*?guidesRef\.current = \[\]\n\s*snapStateRef\.current = null/)
  // guides are drawn in the render pass overlay only, and nowhere else reads them
  assert.match(app, /const guides = guidesRef\.current\n\s*if \(guides\.length > 0\) \{/)
  const renderStart = app.indexOf('const renderAll = useCallback(')
  const reads = [...app.matchAll(/guidesRef\.current(?!\s*=)/g)].map((m) => m.index).filter((index) => !app.slice(index - 20, index).includes('hadGuides'))
  assert.ok(reads.every((index) => index > renderStart), 'guides are only read while rendering')
  // the toggle: a switch row labelled in the menu, next to Desktop mode
  assert.match(bar, /role="switch" aria-checked=\{props\.snapping\} onClick=\{\(\) => props\.onSnapping\(!props\.snapping\)\}/)
  assert.match(bar, /<span>Snap and guides<\/span><span className="menu-row-sub">Boxes snap to the edges and centres of nearby boxes while you drag<\/span>/)
  assert.ok(bar.indexOf('Desktop mode</span>') < bar.indexOf('Snap and guides'))
})

test('no other module (thumbnail, exports, minimap, document format) knows about snapping', async () => {
  const files = [...await readdir(new URL('../src/', import.meta.url)), ...(await readdir(new URL('../src/app/', import.meta.url))).map((name) => `app/${name}`)]
  for (const name of files.filter((file) => /\.(ts|tsx)$/.test(file))) {
    if (name === 'snapping.ts' || name === 'App.tsx' || name === 'app/TopLeftBar.tsx') continue
    const source = await readFile(new URL(`../src/${name}`, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /from '\.\.?\/snapping'|guidesRef/, name)
  }
})
