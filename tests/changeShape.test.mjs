import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'
import { readFile } from 'node:fs/promises'

const { changeBoxShape, changeSelectedShapes, changeShapeChoices, boxShape } = await loadModule('changeShape.ts')
const input = await loadModule('desktopInput.ts')
const { canvasItemKey } = await loadModule('canvasModel.ts')
const app = await readAppSource()
const panel = await readFile(new URL('../src/app/ContextPanel.tsx', import.meta.url), 'utf8')

const box = (id, extra = {}) => ({ kind: 'rectangle', id, x: 10, y: 20, width: 100, height: 60, strokeColor: '#c2255c', strokeWidth: 4, ...extra })
const ink = { top: 10, mid: 20, ink: [] }
const hld = (id, shape, extra = {}) => box(id, { inkBox: ink, hldShape: shape, ...extra })
const keys = (...items) => new Set(items.map(canvasItemKey))
const ids = (offer) => offer?.choices.map((c) => c.id)

test('plain boxes offer the other two plain shapes', () => {
  assert.deepEqual(ids(changeShapeChoices([box(1)], keys(box(1)))), ['diamond', 'ellipse'])
  const d = box(2, { diamond: true })
  assert.deepEqual(ids(changeShapeChoices([d], keys(d))), ['rectangle', 'ellipse'])
  const e = box(3, { ellipse: true })
  assert.deepEqual(ids(changeShapeChoices([e], keys(e))), ['rectangle', 'diamond'])
})

test('HLD boxes offer the other HLD shapes only', () => {
  const b = hld(1, 'database')
  const offer = changeShapeChoices([b], keys(b))
  assert.equal(offer.family, 'hld')
  assert.equal(offer.choices.length, 8)
  assert.ok(!ids(offer).includes('database'))
  assert.ok(ids(offer).includes('queue'))
  assert.ok(!ids(offer).includes('diamond'))
})

test('a change keeps position, size, colours, fill, width, dash, angle, group, ink and swaps only the shape flag', () => {
  const b = box(1, { fillColor: '#a5d8ff', dash: 'dashed', angle: 0.4, group: 3, seed: 7 })
  const d = changeBoxShape(b, 'diamond')
  assert.deepEqual(d, { ...b, diamond: true })
  const e = changeBoxShape(d, 'ellipse')
  assert.equal(e.diamond, undefined)
  assert.equal(e.ellipse, true)
  assert.deepEqual(changeBoxShape(e, 'rectangle'), b)
  const h = hld(2, 'database', { fillColor: '#ffec99', group: 1, angle: 0.2 })
  const q = changeBoxShape(h, 'queue')
  assert.deepEqual(q, { ...h, hldShape: 'queue' })
  assert.equal(q.inkBox, h.inkBox)
})

test('refused: class boxes, code, plain ink boxes, locked items, cross-family changes', () => {
  const cls = box(1, { classBox: { name: 'A', attributes: '', methods: '' } })
  const plainInk = box(2, { inkBox: ink })
  const locked = box(3, { locked: true })
  const code = { kind: 'code', id: 4, x: 0, y: 0, width: 50, height: 50, text: '', language: 'typescript' }
  for (const item of [cls, plainInk, locked, code]) {
    assert.equal(changeShapeChoices([item], keys(item)), null, item.kind + item.id)
    const only = [item]
    assert.equal(changeSelectedShapes(only, keys(item), 'diamond'), only)
  }
  const items = [box(5), hld(6, 'cache')]
  assert.equal(changeSelectedShapes(items, keys(...items), 'diamond'), items)
  assert.equal(changeShapeChoices(items, keys(...items)), null)
  const plain = box(7)
  assert.equal(changeBoxShape(plain, 'database'), null)
  assert.equal(changeBoxShape(hld(8, 'user'), 'ellipse'), null)
  assert.equal(boxShape(cls), null)
  assert.equal(boxShape(plainInk), null)
  // A class box or locked box anywhere in the selection refuses the whole change.
  const mixed = [box(9), cls]
  assert.equal(changeSelectedShapes(mixed, keys(...mixed), 'diamond'), mixed)
  const withLocked = [box(10), locked]
  assert.equal(changeSelectedShapes(withLocked, keys(...withLocked), 'diamond'), withLocked)
})

test('several boxes of one family change together; others, labels and connectors stay', () => {
  const a = box(1)
  const b = box(2, { ellipse: true })
  const outside = box(3)
  const label = { kind: 'text', id: 1, x: 0, y: 0, width: 50, height: 20, text: 'hi', fontSize: 24, color: '#111' }
  const link = { kind: 'connector', id: 1, start: { x: 0, y: 0, pressure: 1 }, end: { x: 5, y: 5, pressure: 1 }, strokeColor: '#111', strokeWidth: 2, relationshipType: 'association', reversed: false, startAttachment: { rectangleId: 1, offsetX: 50, offsetY: 0 } }
  const items = [a, b, outside, label, link]
  const selection = keys(a, b, label)
  assert.deepEqual(ids(changeShapeChoices(items, selection)), ['rectangle', 'diamond', 'ellipse'])
  const next = changeSelectedShapes(items, selection, 'diamond')
  assert.equal(next[0].diamond, true)
  assert.equal(next[1].diamond, true)
  assert.equal(next[1].ellipse, undefined)
  assert.equal(next[2], outside)
  assert.equal(next[3], label)
  assert.equal(next[4], link)
  assert.equal(items[0], a, 'input is not mutated')
})

test('choosing the shape the box already has changes nothing', () => {
  const items = [box(1)]
  assert.equal(changeSelectedShapes(items, keys(items[0]), 'rectangle'), items)
})

test('the right-click menu lists the change-shape rows only when offered, as shape:<id> actions', () => {
  const state = { hasSelection: true, clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: false, anyLocked: false }
  assert.equal(input.contextMenuEntries(state).some((e) => e.action.startsWith('shape:')), false)
  const rows = input.contextMenuEntries({ ...state, changeShapes: [{ id: 'diamond', label: 'Diamond' }, { id: 'ellipse', label: 'Ellipse' }] }).filter((e) => e.action.startsWith('shape:'))
  assert.deepEqual(rows.map((r) => [r.action, r.label]), [['shape:diamond', 'Change shape: Diamond'], ['shape:ellipse', 'Change shape: Ellipse']])
})

test('wiring: one undo step, menu, panel', () => {
  assert.match(app, /const next = changeSelectedShapes\(strokesRef\.current, currentSelectionKeys\(\), target as ShapeChoice\)\s*if \(next === strokesRef\.current\) return false\s*saveHistory\(\)\s*strokesRef\.current = next/)
  assert.match(app, /action\.startsWith\('shape:'\)\) changeShapeSelection\(/)
  assert.match(app, /changeShapes: changeShapeChoices\(strokesRef\.current, currentSelectionKeys\(\)\)/)
  assert.match(app, /changeShape=\{inputMode === 'desktop'/)
  assert.match(panel, /aria-label="Change shape"/)
  assert.match(panel, /Change shape to \$\{choice\.label\}/)
})
