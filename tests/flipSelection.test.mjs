import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { flipSelectionItems, canFlipSelection } = await loadModule('flipSelection.ts')
const { contextMenuEntries, keyCommand } = await loadModule('desktopInput.ts')
const { DESKTOP_SHORTCUTS, shortcutKeyInput } = await loadModule('desktopShortcuts.ts')
const app = await readAppSource()
const panel = readFileSync(new URL('../src/app/ContextPanel.tsx', import.meta.url), 'utf8')

const pt = (x, y) => ({ x, y, pressure: 0.5 })
const box = (id, x, y, w = 100, h = 60, extra = {}) => ({ kind: 'rectangle', id, x, y, width: w, height: h, strokeColor: '#111', strokeWidth: 2, ...extra })
const text = (id, x, y, extra = {}) => ({ kind: 'text', id, x, y, width: 40, height: 20, text: 'hi', fontSize: 16, color: '#111', ...extra })
const code = (id, x, y) => ({ kind: 'code', id, x, y, width: 80, height: 50, text: 'x', language: 'ts' })
const stroke = (id, points, extra = {}) => ({ kind: 'stroke', id, points, color: '#111', width: 2, erase: false, ...extra })
const conn = (id, extra = {}) => ({ kind: 'connector', id, start: pt(0, 0), end: pt(10, 10), strokeColor: '#111', strokeWidth: 2, relationshipType: 'association', reversed: false, ...extra })
const keys = (...k) => new Set(k)
const find = (items, kind, id) => items.find((i) => i.kind === kind && i.id === id)
const all = (items) => new Set(items.filter((i) => i.kind !== 'opaque').map((i) => `${i.kind}:${i.id}`))

test('horizontal flip mirrors boxes about the bounding-box centre, keeping size and content', () => {
  const items = [box(1, 0, 0, 100, 60), box(2, 300, 100, 50, 40, { ellipse: true }), text(1, 200, 10), code(1, 20, 200)]
  const out = flipSelectionItems(items, all(items), 'horizontal')
  // Extent x 0..350, so x' = 350 - x - width.
  assert.deepEqual([find(out, 'rectangle', 1).x, find(out, 'rectangle', 1).y, find(out, 'rectangle', 1).width], [250, 0, 100])
  assert.equal(find(out, 'rectangle', 2).x, 0)
  assert.equal(find(out, 'rectangle', 2).ellipse, true)
  assert.equal(find(out, 'text', 1).x, 110)
  assert.equal(find(out, 'text', 1).text, 'hi')
  assert.equal(find(out, 'code', 1).x, 250)
  assert.equal(items[0].x, 0, 'input untouched')
})

test('vertical flip mirrors y only', () => {
  const items = [box(1, 0, 0, 100, 60), box(2, 300, 100, 50, 40)]
  const out = flipSelectionItems(items, all(items), 'vertical')
  assert.deepEqual([find(out, 'rectangle', 1).x, find(out, 'rectangle', 1).y], [0, 80])
  assert.deepEqual([find(out, 'rectangle', 2).x, find(out, 'rectangle', 2).y], [300, 0])
})

test('every box flavour is moved, not mirrored; ink inside follows; class box content kept', () => {
  const classBox = { name: 'A', stereotype: 'class', attributes: ['a'], methods: ['m'] }
  const inkBox = { top: 20, mid: 40, ink: [stroke(9, [pt(10, 10), pt(20, 30)])] }
  const items = [box(1, 0, 0, 100, 60, { hldShape: 'database', inkBox }), box(2, 200, 0, 100, 60, { classBox }), box(3, 0, 200, 100, 60, { diamond: true })]
  const out = flipSelectionItems(items, all(items), 'horizontal')
  const first = find(out, 'rectangle', 1)
  assert.equal(first.x, 200)
  assert.equal(first.hldShape, 'database')
  assert.deepEqual(first.inkBox.ink[0].points.map((p) => p.x), [210, 220], 'ink translated with its box, not mirrored')
  assert.equal(first.inkBox.top, 20)
  assert.deepEqual(find(out, 'rectangle', 2).classBox, classBox)
  assert.equal(find(out, 'rectangle', 3).x, 200)
})

test('stroke points mirror; a single stroke qualifies; erase marks are ignored', () => {
  const items = [stroke(1, [pt(0, 0), pt(10, 20), pt(40, 5)], { shape: 'arrow' })]
  assert.equal(canFlipSelection(items, all(items)), true)
  const out = flipSelectionItems(items, all(items), 'horizontal')
  assert.deepEqual(out[0].points.map((p) => [p.x, p.y]), [[40, 0], [30, 20], [0, 5]])
  assert.equal(out[0].shape, 'arrow')
  const v = flipSelectionItems(items, all(items), 'vertical')
  assert.deepEqual(v[0].points.map((p) => p.y), [20, 0, 15])
  assert.equal(flipSelectionItems([stroke(2, [pt(0, 0), pt(5, 5)], { erase: true })], keys('stroke:2'), 'horizontal'), null)
})

test('a single box does not qualify; a single connector does', () => {
  const items = [box(1, 0, 0), text(1, 0, 0), conn(1, { start: pt(0, 0), end: pt(30, 10) })]
  assert.equal(canFlipSelection(items, keys('rectangle:1')), false)
  assert.equal(flipSelectionItems(items, keys('rectangle:1'), 'horizontal'), null)
  assert.equal(canFlipSelection(items, keys('connector:1')), true)
  const out = flipSelectionItems(items, keys('connector:1'), 'horizontal')
  assert.deepEqual([find(out, 'connector', 1).start.x, find(out, 'connector', 1).end.x], [30, 0])
})

test('attached connector ends mirror inside their box and follow it, selected or not', () => {
  const items = [box(1, 0, 0, 100, 60), box(2, 300, 100, 100, 60),
    conn(1, { start: pt(100, 30), end: pt(300, 130), startAttachment: { rectangleId: 1, offsetX: 100, offsetY: 30 }, endAttachment: { rectangleId: 2, offsetX: 0, offsetY: 30 } })]
  for (const selected of [all(items), keys('rectangle:1', 'rectangle:2')]) {
    const h = flipSelectionItems(items, selected, 'horizontal')
    const c = find(h, 'connector', 1)
    // Right side of box 1 becomes its left side; left side of box 2 becomes its right side.
    assert.deepEqual([c.startAttachment.offsetX, c.startAttachment.offsetY, c.endAttachment.offsetX, c.endAttachment.offsetY], [0, 30, 100, 30])
    assert.deepEqual([c.start.x, c.start.y, c.end.x, c.end.y], [300, 30, 100, 130])
    assert.equal(c.start.x, find(h, 'rectangle', 1).x + c.startAttachment.offsetX)
    const v = flipSelectionItems(items, selected, 'vertical')
    const cv = find(v, 'connector', 1)
    assert.deepEqual([cv.startAttachment.offsetX, cv.startAttachment.offsetY, cv.endAttachment.offsetY], [100, 30, 30])
    assert.equal(cv.end.y, find(v, 'rectangle', 2).y + 30)
  }
  const top = [box(1, 0, 0), box(2, 0, 200), conn(1, { start: pt(50, 60), end: pt(50, 200), startAttachment: { rectangleId: 1, offsetX: 50, offsetY: 60 }, endAttachment: { rectangleId: 2, offsetX: 50, offsetY: 0 } })]
  const v = find(flipSelectionItems(top, all(top), 'vertical'), 'connector', 1)
  assert.deepEqual([v.startAttachment.offsetY, v.endAttachment.offsetY], [0, 60], 'bottom <-> top')
})

test('a connector ending on an unselected box keeps that anchor; free ends mirror', () => {
  const items = [box(1, 500, 0), conn(1, { start: pt(0, 0), end: pt(600, 30), endAttachment: { rectangleId: 1, offsetX: 100, offsetY: 30 } })]
  assert.equal(flipSelectionItems(items, keys('connector:1'), 'horizontal'), null, 'only the free point defines the extent, so it maps onto itself: nothing changes')
  const out = flipSelectionItems([...items, conn(2, { start: pt(0, 50), end: pt(100, 50) })], keys('connector:1', 'connector:2'), 'horizontal')
  const c = find(out, 'connector', 1)
  assert.equal(c.end.x, 600)
  assert.equal(c.start.x, 100, 'free end mirrored in the extent of the selected free points')
  assert.deepEqual(c.endAttachment, items[1].endAttachment)
})

test('elbow bend is negated along the flipped axis only', () => {
  const items = [box(1, 0, 0, 100, 60), box(2, 400, 300, 100, 60),
    conn(1, { routing: 'elbow', bend: 40, start: pt(100, 30), end: pt(400, 330), startAttachment: { rectangleId: 1, offsetX: 100, offsetY: 30 }, endAttachment: { rectangleId: 2, offsetX: 0, offsetY: 30 } })]
  assert.equal(find(flipSelectionItems(items, all(items), 'horizontal'), 'connector', 1).bend, -40)
  assert.equal(find(flipSelectionItems(items, all(items), 'vertical'), 'connector', 1).bend, 40)
})

test('angle is negated, absent stays absent', () => {
  const items = [box(1, 0, 0, 100, 60, { angle: 0.5 }), text(1, 200, 0, { angle: -0.25 }), box(2, 0, 200)]
  const out = flipSelectionItems(items, all(items), 'vertical')
  assert.equal(find(out, 'rectangle', 1).angle, -0.5)
  assert.equal(find(out, 'text', 1).angle, 0.25)
  assert.ok(!('angle' in find(out, 'rectangle', 2)))
})

test('locked items are skipped and stay put; unknown items untouched', () => {
  const opaque = { kind: 'opaque', id: 1, box: null, raw: {} }
  const items = [box(1, 0, 0), box(2, 300, 0, 100, 60, { locked: true }), box(3, 600, 0), opaque]
  const out = flipSelectionItems(items, all(items), 'horizontal')
  assert.equal(find(out, 'rectangle', 2), items[1])
  assert.deepEqual([find(out, 'rectangle', 1).x, find(out, 'rectangle', 3).x], [600, 0], 'extent ignores the locked box')
  assert.equal(find(out, 'opaque', 1), opaque)
  assert.equal(flipSelectionItems(items, keys('rectangle:2', 'rectangle:1'), 'horizontal'), null, 'one unlocked box left: not enough')
})

test('group members flip together (selection carries them)', () => {
  const items = [box(1, 0, 0, 100, 60, { group: 1 }), box(2, 200, 0, 100, 60, { group: 1 })]
  const out = flipSelectionItems(items, all(items), 'horizontal')
  assert.deepEqual([find(out, 'rectangle', 1).x, find(out, 'rectangle', 2).x], [200, 0])
  assert.equal(find(out, 'rectangle', 1).group, 1)
})

test('flipping twice restores every coordinate', () => {
  const items = [box(1, 13, 7, 100, 60, { angle: 0.3 }), box(2, 300, 100, 50, 40), text(1, 200, 10), stroke(1, [pt(5, 5), pt(90, 44)]),
    conn(1, { routing: 'elbow', bend: 25, start: pt(113, 37), end: pt(300, 120), startAttachment: { rectangleId: 1, offsetX: 100, offsetY: 30 }, endAttachment: { rectangleId: 2, offsetX: 0, offsetY: 20 } })]
  for (const axis of ['horizontal', 'vertical']) {
    const once = flipSelectionItems(items, all(items), axis)
    const twice = flipSelectionItems(once, all(items), axis)
    assert.deepEqual(twice, items)
  }
})

test('Shift+H / Shift+V map to flip; Ctrl+H, Ctrl+V and plain keys keep their meaning', () => {
  const base = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false }
  assert.deepEqual(keyCommand({ ...base, key: 'H', code: 'KeyH', shiftKey: true }, 'desktop'), { kind: 'flip', axis: 'horizontal' })
  assert.deepEqual(keyCommand({ ...base, key: 'V', code: 'KeyV', shiftKey: true }, 'desktop'), { kind: 'flip', axis: 'vertical' })
  assert.equal(keyCommand({ ...base, key: 'H', code: 'KeyH', shiftKey: true, repeat: true }, 'desktop'), null)
  assert.deepEqual(keyCommand({ ...base, key: 'h', code: 'KeyH', ctrlKey: true }, 'desktop'), { kind: 'findReplace' })
  assert.deepEqual(keyCommand({ ...base, key: 'v', code: 'KeyV', ctrlKey: true }, 'desktop'), { kind: 'paste' })
  assert.notEqual(keyCommand({ ...base, key: 'v', code: 'KeyV' }, 'desktop')?.kind, 'flip')
  assert.notEqual(keyCommand({ ...base, key: 'H', code: 'KeyH', shiftKey: true, altKey: true }, 'desktop')?.kind, 'flip')
})

test('help list, menu chips, palette, panel and wiring', () => {
  for (const [label, axis] of [['Shift+H', 'horizontal'], ['Shift+V', 'vertical']]) {
    const entry = DESKTOP_SHORTCUTS.find((e) => e.keys === label)
    assert.ok(entry, `${label} listed in the ? help`)
    assert.deepEqual(keyCommand(shortcutKeyInput(entry), 'desktop'), { kind: 'flip', axis })
  }
  const base = { hasSelection: true, clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: null, anyLocked: false }
  const on = contextMenuEntries({ ...base, canFlip: true }).filter((e) => e.action.startsWith('flip'))
  assert.deepEqual(on.map((e) => e.action), ['flipHorizontal', 'flipVertical'])
  assert.ok(on.every((e) => e.chip?.startsWith('Flip ')))
  assert.ok(!contextMenuEntries(base).some((e) => e.action.startsWith('flip')))
  assert.match(app, /const flipSelection = \(axis: FlipAxis\): boolean => \{[\s\S]*?saveHistory\(\)[\s\S]*?strokesRef\.current = result/)
  assert.match(app, /case 'flipHorizontal': flipSelection\('horizontal'\)/)
  assert.match(app, /case 'flipVertical': flipSelection\('vertical'\)/)
  assert.match(app, /case 'flip': return [^\n]*flipSelection\(command\.axis\)/)
  assert.match(app, /label: 'Flip horizontal'/)
  assert.match(app, /label: 'Flip vertical'/)
  assert.match(app, /canFlip: canFlipSelection\(/)
  assert.match(app, /flip=\{canFlipSelection\(/)
  assert.match(panel, /aria-label="Flip horizontal"[\s\S]*?onFlip\('horizontal'\)/)
  assert.match(panel, /aria-label="Flip vertical"[\s\S]*?onFlip\('vertical'\)/)
})

test('flip: box labels move with their box and stay centred in it', () => {
  const items = [box(1, 0, 0, 100, 60), box(2, 300, 0, 100, 60), text(1, 30, 20), text(2, 330, 20)]
  const out = flipSelectionItems(items, all(items), 'horizontal')
  for (const id of [1, 2]) {
    const r = find(out, 'rectangle', id); const l = find(out, 'text', id)
    assert.equal(l.x - r.x, find(items, 'text', id).x - find(items, 'rectangle', id).x, 'label keeps its offset in its box')
  }
  assert.equal(find(out, 'rectangle', 1).x, 300)
  assert.equal(find(out, 'text', 1).x, 330)
})

test('flip: nothing moved returns null', () => {
  const items = [box(1, 0, 0, 100, 60), box(2, 0, 100, 100, 60)]
  assert.equal(flipSelectionItems(items, all(items), 'horizontal'), null)
  assert.notEqual(flipSelectionItems(items, all(items), 'vertical'), null)
})

test('flip wiring: App adds labels inside selected boxes before flipping', () => {
  assert.match(app, /flipKeysWithLabels/)
  assert.ok(!/canFlipSelection\(strokesRef\.current, currentSelectionKeys\(\)\)/.test(app))
})
