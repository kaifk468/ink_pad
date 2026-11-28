import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const model = await loadModule('canvasModel.ts')
const arrange = await loadModule('arrange.ts')
const input = await loadModule('desktopInput.ts')
const shortcuts = await loadModule('desktopShortcuts.ts')
const exp = await loadModule('sheetExport.ts')
const sketchy = await loadModule('sketchy.ts')
const app = await readAppSource()

const p = (x, y) => ({ x, y, pressure: 0.5 })
const pen = (id, extra = {}) => ({ kind: 'stroke', id, points: [p(0, 0), p(10, 10), p(20, 5)], color: '#111111', width: 3, erase: false, ...extra })
const arrow = (id, extra = {}) => ({ kind: 'stroke', id, points: [p(0, 0), p(100, 0)], color: '#111111', width: 3, erase: false, shape: 'arrow', ...extra })
const line = (id, extra = {}) => ({ kind: 'stroke', id, points: [p(0, 20), p(100, 20)], color: '#111111', width: 3, erase: false, shape: 'line', ...extra })
const eraser = (id) => ({ ...pen(id), erase: true, width: 20 })
const box = (id, x, y, w = 40, h = 30, extra = {}) => ({ kind: 'rectangle', id, x, y, width: w, height: h, strokeColor: '#111111', strokeWidth: 2, ...extra })
const hld = (id) => box(id, 0, 0, 80, 60, { hldShape: 'database', inkBox: { top: 10, mid: 30, ink: [] } })
const klass = (id) => box(id, 0, 0, 80, 60, { classBox: { name: 'A', attributes: '', methods: '' } })
const inkClass = (id) => box(id, 0, 0, 80, 60, { inkBox: { top: 10, mid: 30, ink: [] } })
const conn = (id, extra = {}) => ({ kind: 'connector', id, start: p(0, 0), end: p(50, 0), strokeColor: '#111111', strokeWidth: 2, relationshipType: 'association', reversed: false, ...extra })
const text = (id) => ({ kind: 'text', id, x: 0, y: 0, width: 40, height: 20, text: 'a', fontSize: 16, color: '#111111' })
const code = (id) => ({ kind: 'code', id, x: 0, y: 0, width: 100, height: 50, text: 'x', language: 'ts' })
const keys = (...items) => new Set(items.map(model.canvasItemKey))

// ---- 6: stroke width ----
const menuOf = (hasSelection, clipboardHasItems, pageHasItems, extra = {}) => input.contextMenuEntries({ hasSelection, clipboardHasItems, pageHasItems, canEditText: false, lockedTarget: false, anyLocked: false, ...extra })

test('restrokeItems changes strokes, plain and HLD shapes and connectors, and skips eraser, class boxes, text and code', () => {
  const items = [pen(1), eraser(2), box(1, 0, 0), hld(2), klass(3), inkClass(4), conn(1), text(1), code(1)]
  const out = model.restrokeItems(items, keys(...items), 9)
  assert.equal(out[0].width, 9)
  assert.equal(out[1], items[1])
  assert.equal(out[2].strokeWidth, 9)
  assert.equal(out[3].strokeWidth, 9)
  assert.equal(out[3].inkBox, items[3].inkBox)
  assert.equal(out[4], items[4])
  assert.equal(out[5], items[5])
  assert.equal(out[6].strokeWidth, 9)
  assert.equal(out[7], items[7])
  assert.equal(out[8], items[8])
})

test('restrokeItems keeps unselected items, clamps to 1..24 and returns the same array when nothing changes', () => {
  const items = [pen(1), pen(2, { width: 5 })]
  const out = model.restrokeItems(items, keys(items[0]), 100)
  assert.equal(out[0].width, 24)
  assert.equal(out[1], items[1])
  assert.equal(model.restrokeItems(items, keys(items[0]), 3), items)
  assert.equal(model.restrokeItems(items, new Set(), 8), items)
  assert.equal(model.restrokeItems(items, keys(items[0]), Number.NaN), items)
  assert.equal(model.restrokeItems(items, keys(items[0]), 0.2)[0].width, 1)
})

test('selectionStrokeWidth is the shared width, null when mixed or nothing applies', () => {
  const items = [pen(1), box(1, 0, 0), klass(3), text(1)]
  assert.equal(model.selectionStrokeWidth(items, keys(items[0])), 3)
  assert.equal(model.selectionStrokeWidth(items, keys(items[0], items[1])), null)
  assert.equal(model.selectionStrokeWidth(items, keys(items[2], items[3])), null)
  assert.equal(model.selectionHasOutlineWidth(items, keys(items[2], items[3])), false)
  assert.equal(model.selectionHasOutlineWidth(items, keys(items[1])), true)
})

// ---- 7: dash ----
test('dashPattern scales with width and dotted is zero-length dashes', () => {
  assert.deepEqual(model.dashPattern(undefined, 3), [])
  assert.deepEqual(model.dashPattern('dashed', 2), [6, 4])
  assert.deepEqual(model.dashPattern('dashed', 10), [25, 18])
  const dotted = model.dashPattern('dotted', 10)
  assert.ok(dotted[0] < 1 && dotted[1] === 20)
  assert.ok(model.dashPattern('dotted', 2)[1] >= 4)
})

test('a connector own dash wins over the relationship dash, and the relationship dash stays without one', () => {
  assert.deepEqual(model.connectorDashPattern(conn(1, { relationshipType: 'dependency' })), model.dashPattern('dashed', 2))
  assert.deepEqual(model.connectorDashPattern(conn(1)), [])
  assert.deepEqual(model.connectorDashPattern(conn(1, { dash: 'dashed' })), model.dashPattern('dashed', 2))
  assert.deepEqual(model.connectorDashPattern(conn(1, { relationshipType: 'dependency', dash: 'dotted' })), model.dashPattern('dotted', 2))
})

test('setLineDash applies to arrow/line strokes, plain and HLD shapes and connectors only, and clears with null', () => {
  const items = [pen(1), arrow(2), line(3), box(1, 0, 0), hld(2), klass(3), inkClass(4), conn(1), text(1)]
  const out = model.setLineDash(items, keys(...items), 'dashed')
  assert.deepEqual(out.map((item) => item.dash), [undefined, 'dashed', 'dashed', 'dashed', 'dashed', undefined, undefined, 'dashed', undefined])
  const cleared = model.setLineDash(out, keys(...out), null)
  assert.equal(cleared.every((item) => !('dash' in item)), true)
  assert.equal(model.setLineDash(items, keys(items[0]), 'dotted'), items)
  assert.equal(model.setLineDash(out, keys(out[1]), 'dashed'), out)
  assert.equal(out[0], items[0])
})

test('selectionDash reports the shared style, treating a dashed relationship as dashed', () => {
  const items = [arrow(1, { dash: 'dotted' }), line(2, { dash: 'dotted' }), box(1, 0, 0), conn(1, { relationshipType: 'realization' }), conn(2), pen(5)]
  assert.equal(model.selectionDash(items, keys(items[0], items[1])), 'dotted')
  assert.equal(model.selectionDash(items, keys(items[0], items[2])), null)
  assert.equal(model.selectionDash(items, keys(items[2])), 'solid')
  assert.equal(model.selectionDash(items, keys(items[3])), 'dashed')
  assert.equal(model.selectionDash(items, keys(items[3], items[4])), null)
  assert.equal(model.selectionDash(items, keys(items[5])), null)
})

test('SVG export writes stroke-dasharray for dashed and dotted lines, shapes and connectors, and none for solid', () => {
  const opts = { width: 500, height: 300, template: 'blank', backgroundColor: '#ffffff' }
  const solid = exp.buildSheetSvg([arrow(1), box(1, 10, 10), hld(2), conn(1)], opts)
  assert.doesNotMatch(solid, /stroke-dasharray/)
  const dashed = exp.buildSheetSvg([line(1, { dash: 'dashed' })], opts)
  assert.match(dashed, /<path d="M0 20L100 20" [^>]*stroke-dasharray="7\.5 5\.4"/)
  const shapes = exp.buildSheetSvg([box(1, 10, 10, 40, 30, { dash: 'dotted' }), box(2, 10, 10, 40, 30, { dash: 'dashed', ellipse: true }), box(3, 10, 10, 40, 30, { dash: 'dashed', diamond: true }), { ...hld(4), dash: 'dashed' }, conn(1, { dash: 'dotted' })], opts)
  assert.equal((shapes.match(/stroke-dasharray/g) || []).length, 5)
  const sketchyOut = exp.buildSheetSvg([line(1, { dash: 'dashed' }), { ...box(1, 10, 10, 40, 30, { dash: 'dashed', seed: 5 }) }], { ...opts, sketchy: true })
  assert.equal((sketchyOut.match(/stroke-dasharray/g) || []).length, 2)
})

test('arrowheads stay solid when the shaft is dashed in the SVG export', () => {
  const opts = { width: 500, height: 300, template: 'blank', backgroundColor: '#ffffff' }
  const svg = exp.buildSheetSvg([arrow(1, { dash: 'dashed' })], opts)
  const paths = svg.match(/<path [^>]*\/>/g)
  assert.equal(paths.length, 2)
  assert.match(paths[0], /stroke-dasharray/)
  assert.doesNotMatch(paths[1], /stroke-dasharray/)
})

// ---- 8: arrowheads ----
test('strokeArrowheads derives the default from the shape', () => {
  assert.equal(model.strokeArrowheads(arrow(1)), 'end')
  assert.equal(model.strokeArrowheads(line(1)), 'none')
  assert.equal(model.strokeArrowheads(line(1, { arrowheads: 'both' })), 'both')
  assert.equal(model.strokeArrowheads(arrow(1, { arrowheads: 'none' })), 'none')
})

test('strokeHeadGeometry gives the old arrow head, and heads at the start and both ends', () => {
  const [head] = model.strokeHeadGeometry(arrow(1))
  assert.deepEqual([head.tip.x, head.tip.y], [100, 0])
  assert.ok(Math.abs(head.wingA.x - (100 - 12 * Math.cos(-Math.PI / 6))) < 1e-9 || head.wingA.x < 100)
  assert.ok(head.wingA.x < 100 && head.wingB.x < 100 && head.wingA.y * head.wingB.y < 0)
  assert.deepEqual(model.strokeHeadGeometry(line(1)), [])
  const start = model.strokeHeadGeometry(line(1, { arrowheads: 'start' }))
  assert.equal(start.length, 1)
  assert.deepEqual([start[0].tip.x, start[0].tip.y], [0, 20])
  assert.ok(start[0].wingA.x > 0)
  assert.equal(model.strokeHeadGeometry(line(1, { arrowheads: 'both' })).length, 2)
  assert.deepEqual(model.strokeHeadGeometry(pen(1, { arrowheads: 'both' })), [])
})

test('setArrowheads stores only what differs from the default and ignores other items', () => {
  const items = [arrow(1), line(2), pen(3), box(1, 0, 0)]
  const out = model.setArrowheads(items, keys(...items), 'both')
  assert.equal(out[0].arrowheads, 'both')
  assert.equal(out[1].arrowheads, 'both')
  assert.equal(out[2], items[2])
  assert.equal(out[3], items[3])
  const back = model.setArrowheads(out, keys(out[0], out[1]), 'end')
  assert.equal('arrowheads' in back[0], false)
  assert.equal(back[1].arrowheads, 'end')
  const none = model.setArrowheads(items, keys(items[0]), 'none')
  assert.equal(none[0].arrowheads, 'none')
  assert.equal(model.setArrowheads(items, keys(items[0]), 'end'), items)
  assert.equal('arrowheads' in model.setArrowheads(none, keys(none[0]), 'end')[0], false)
})

test('selectionArrowheads and selectionHasArrowheads', () => {
  const items = [arrow(1), line(2), pen(3)]
  assert.equal(model.selectionArrowheads(items, keys(items[0])), 'end')
  assert.equal(model.selectionArrowheads(items, keys(items[0], items[1])), null)
  assert.equal(model.selectionHasArrowheads(items, keys(items[2])), false)
  assert.equal(model.selectionHasArrowheads(items, keys(items[1])), true)
})

test('arrowheads in the SVG export: arrow default unchanged, none removes the head, both draws two', () => {
  const opts = { width: 500, height: 300, template: 'blank', backgroundColor: '#ffffff' }
  const count = (svg) => (svg.match(/M-?[\d.]+ -?[\d.]+L-?[\d.]+ -?[\d.]+/g) || []).length
  assert.equal(count(exp.buildSheetSvg([arrow(1)], opts)), 3)
  assert.equal(count(exp.buildSheetSvg([arrow(1, { arrowheads: 'none' })], opts)), 1)
  assert.equal(count(exp.buildSheetSvg([line(1, { arrowheads: 'both' })], opts)), 5)
})

test('hand-drawn arrow parts: the default arrow path is the shaft followed by its heads, none has no heads', () => {
  const a = arrow(7)
  const parts = sketchy.sketchyStrokeParts(a)
  assert.equal(sketchy.sketchyStrokePath(a), parts.line + parts.heads)
  assert.ok(parts.heads.length > 0)
  assert.equal(sketchy.sketchyStrokeParts(arrow(7, { arrowheads: 'none' })).heads, '')
  assert.equal(sketchy.sketchyStrokeParts(arrow(7, { arrowheads: 'none' })).line, parts.line)
  assert.ok(sketchy.sketchyStrokeParts(line(7, { arrowheads: 'both' })).heads.length > parts.heads.length)
})

test('the selection bounds grow to hold a start arrowhead', () => {
  const plain = model.getCanvasSelectionBounds([line(1, { width: 10 })], keys(line(1)))
  const headed = model.getCanvasSelectionBounds([line(1, { width: 10, arrowheads: 'start' })], keys(line(1)))
  assert.ok(headed.height > plain.height)
})

// ---- 9: layer order ----
const ids = (items) => items.map((item) => `${item.kind[0]}${item.id}`).join(' ')
const stack = () => [pen(1), box(1, 0, 0), conn(1), text(1), arrow(2)]

test('reorderItems forward and backward move a step and keep the selected items in order', () => {
  const items = stack()
  assert.equal(ids(model.reorderItems(items, keys(items[1]), 'forward')), 's1 c1 r1 t1 s2')
  assert.equal(ids(model.reorderItems(items, keys(items[1]), 'backward')), 'r1 s1 c1 t1 s2')
  assert.equal(ids(model.reorderItems(items, keys(items[0], items[1]), 'forward')), 'c1 s1 r1 t1 s2')
  assert.equal(ids(model.reorderItems(items, keys(items[1], items[3]), 'forward')), 's1 c1 r1 s2 t1')
  assert.equal(ids(model.reorderItems(items, keys(items[3], items[4]), 'backward')), 's1 r1 t1 s2 c1')
})

test('reorderItems front and back keep relative order, and edges return the same array', () => {
  const items = stack()
  assert.equal(ids(model.reorderItems(items, keys(items[1], items[3]), 'front')), 's1 c1 s2 r1 t1')
  assert.equal(ids(model.reorderItems(items, keys(items[1], items[3]), 'back')), 'r1 t1 s1 c1 s2')
  assert.equal(model.reorderItems(items, keys(items[4]), 'forward'), items)
  assert.equal(model.reorderItems(items, keys(items[4]), 'front'), items)
  assert.equal(model.reorderItems(items, keys(items[0]), 'backward'), items)
  assert.equal(model.reorderItems(items, keys(items[0]), 'back'), items)
  assert.equal(model.reorderItems(items, keys(...items), 'front'), items)
  assert.equal(model.reorderItems(items, new Set(), 'front'), items)
  assert.equal(model.reorderItems(items, new Set(['rectangle:99']), 'front'), items)
})

test('reorderItems does not mutate the input and never moves opaque items', () => {
  const opaque = { kind: 'opaque', id: 9, box: null, raw: { kind: 'x' } }
  const items = [pen(1), opaque, box(1, 0, 0)]
  const copy = items.slice()
  const out = model.reorderItems(items, keys(items[2], opaque), 'back')
  assert.deepEqual(items, copy)
  assert.equal(ids(out), 'r1 s1 o9')
  assert.equal(model.reorderItems(items, keys(items[0]), 'forward'), items)
})

test('Ctrl+] and Ctrl+[ (with Shift for the extremes) map to layer commands by physical key', () => {
  const ev = (code, key, extra = {}) => ({ key, code, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra })
  assert.deepEqual(input.keyCommand(ev('BracketRight', ']'), 'desktop'), { kind: 'layer', move: 'forward' })
  assert.deepEqual(input.keyCommand(ev('BracketLeft', '['), 'desktop'), { kind: 'layer', move: 'backward' })
  assert.deepEqual(input.keyCommand(ev('BracketRight', '}', { shiftKey: true }), 'desktop'), { kind: 'layer', move: 'front' })
  assert.deepEqual(input.keyCommand(ev('BracketLeft', '{', { shiftKey: true }), 'desktop'), { kind: 'layer', move: 'back' })
  assert.deepEqual(input.keyCommand(ev('BracketRight', 'Dead', { metaKey: true, ctrlKey: false }), 'desktop'), { kind: 'layer', move: 'forward' })
  assert.equal(input.keyCommand(ev('BracketRight', ']'), 'tablet'), null)
  assert.equal(input.keyCommand(ev('BracketRight', ']', { repeat: true }), 'desktop'), null)
  assert.equal(input.keyCommand(ev('BracketRight', ']', { altKey: true }), 'desktop'), null)
  assert.equal(input.keyCommand(ev('BracketRight', ']', { ctrlKey: false }), 'desktop'), null)
})

test('the shortcut table lists the four layer keys and the context menu offers Bring to front and Send to back', () => {
  for (const label of ['Bring forward', 'Send backward', 'Bring to front', 'Send to back']) {
    const entry = shortcuts.DESKTOP_SHORTCUTS.find((row) => row.label === label)
    assert.ok(entry, label)
    assert.equal(input.keyCommand(shortcuts.shortcutKeyInput(entry), 'desktop').kind, 'layer')
  }
  const entries = menuOf(true, false, true)
  assert.deepEqual(entries.filter((e) => /front|back/.test(e.label)).map((e) => e.action), ['bringToFront', 'sendToBack'])
  assert.equal(menuOf(false, false, true).find((e) => e.action === 'sendToBack').disabled, true)
})

// ---- 10: align and distribute ----
const bounds = (items, item) => model.getCanvasSelectionBounds(items, keys(item))

test('alignMoves line the items up with the outer edge or centre of the selection', () => {
  const items = [box(1, 10, 10, 40, 30), box(2, 100, 50, 60, 20), box(3, 40, 90, 20, 20)]
  const sel = keys(...items)
  const moved = (op) => model.getCanvasSelectionBounds(arrange.applyMoves(items, arrange.alignMoves(items, sel, op)), sel)
  const after = (op) => { const out = arrange.applyMoves(items, arrange.alignMoves(items, sel, op)); return out.map((item) => bounds(out, item)) }
  const rx = (b) => Math.round(b.x * 100) / 100
  assert.deepEqual(new Set(after('left').map(rx)).size, 1)
  assert.deepEqual(new Set(after('right').map((b) => Math.round((b.x + b.width) * 100) / 100)).size, 1)
  assert.deepEqual(new Set(after('center').map((b) => Math.round((b.x + b.width / 2) * 100) / 100)).size, 1)
  assert.deepEqual(new Set(after('top').map((b) => Math.round(b.y * 100) / 100)).size, 1)
  assert.deepEqual(new Set(after('bottom').map((b) => Math.round((b.y + b.height) * 100) / 100)).size, 1)
  assert.deepEqual(new Set(after('middle').map((b) => Math.round((b.y + b.height / 2) * 100) / 100)).size, 1)
  // the selection as a whole does not grow or move to the other side
  const before = model.getCanvasSelectionBounds(items, sel)
  const left = moved('left')
  assert.equal(left.x, before.x)
})

test('alignMoves needs two items, skips items already in place and leaves unselected items alone', () => {
  const items = [box(1, 10, 10), box(2, 10, 80), box(3, 300, 300)]
  assert.deepEqual(arrange.alignMoves(items, keys(items[0]), 'left'), [])
  assert.deepEqual(arrange.alignMoves(items, keys(items[0], items[1]), 'left'), [])
  const moves = arrange.alignMoves(items, keys(items[0], items[2]), 'left')
  assert.deepEqual(moves.map((m) => m.key), ['rectangle:3'])
  assert.equal(moves[0].dx, 10 - 300)
  assert.equal(moves[0].dy, 0)
  const out = arrange.applyMoves(items, moves)
  assert.equal(out[0], items[0])
  assert.equal(out[1], items[1])
  assert.equal(out[2].x, 10)
  assert.equal(arrange.applyMoves(items, []), items)
})

test('distributeMoves gives equal gaps, keeps the outer two, works vertically and needs three items', () => {
  const items = [box(1, 0, 0, 20, 20), box(2, 30, 0, 40, 20), box(3, 200, 0, 20, 20), box(4, 90, 0, 10, 20)]
  const sel = keys(...items)
  const moves = arrange.distributeMoves(items, sel, 'horizontal')
  const out = arrange.applyMoves(items, moves)
  const sorted = out.map((item) => bounds(out, item)).sort((a, b) => a.x - b.x)
  const gaps = [1, 2, 3].map((i) => sorted[i].x - (sorted[i - 1].x + sorted[i - 1].width))
  assert.ok(gaps.every((gap) => Math.abs(gap - gaps[0]) < 1e-6), String(gaps))
  assert.equal(out[0].x, 0)
  assert.equal(out[2].x, 200)
  assert.ok(moves.every((m) => m.dy === 0))
  const vertical = [box(1, 0, 0, 20, 20), box(2, 5, 10, 20, 20), box(3, 9, 100, 20, 20)]
  const vOut = arrange.applyMoves(vertical, arrange.distributeMoves(vertical, keys(...vertical), 'vertical'))
  assert.equal(vOut[1].y, 50)
  assert.equal(vOut[1].x, 5)
  assert.deepEqual(arrange.distributeMoves(vertical, keys(vertical[0], vertical[1]), 'vertical'), [])
  assert.equal(arrange.canDistribute(vertical, keys(vertical[0], vertical[1])), false)
  assert.equal(arrange.canDistribute(vertical, keys(...vertical)), true)
  assert.equal(arrange.canAlign(vertical, keys(vertical[0])), false)
  assert.equal(arrange.canAlign(vertical, keys(vertical[0], vertical[1])), true)
})

test('moving boxes with align drags the connectors attached to them, and attached connectors are not moved on their own', () => {
  const a = box(1, 0, 0, 40, 40)
  const b = box(2, 200, 100, 40, 40)
  const c = conn(1, { start: p(40, 20), end: p(200, 120), startAttachment: { rectangleId: 1, offsetX: 40, offsetY: 20 }, endAttachment: { rectangleId: 2, offsetX: 0, offsetY: 20 } })
  const items = [a, b, c]
  const sel = keys(a, b, c)
  assert.deepEqual(arrange.arrangeableItems(items, sel).map((e) => e.key), ['rectangle:1', 'rectangle:2'])
  const out = arrange.applyMoves(items, arrange.alignMoves(items, sel, 'top'))
  assert.equal(out[1].y, 0)
  assert.deepEqual([out[2].start.y, out[2].end.y], [20, 20])
  const free = conn(2)
  assert.equal(arrange.arrangeableItems([a, free], keys(a, free)).length, 2)
})

test('rotated shapes align by their drawn bounds', () => {
  const a = box(1, 0, 0, 100, 20, { angle: Math.PI / 2 })
  const b = box(2, 300, 0, 40, 40)
  const items = [a, b]
  const out = arrange.applyMoves(items, arrange.alignMoves(items, keys(a, b), 'left'))
  assert.ok(Math.abs(bounds(out, out[0]).x - bounds(out, out[1]).x) < 1e-6)
})

// ---- wiring ----
test('wiring: width, dash, arrowheads, layer and arrange are desktop only and each makes one undo step', () => {
  assert.match(app, /const changeSelectionWidth = \(value: number, commit: boolean\)[\s\S]{0,260}widthSessionRef\.current = true[\s\S]{0,120}restrokeItems|restrokeItems\(strokesRef\.current, currentSelectionKeys\(\), value\)/)
  assert.match(app, /if \(!widthSessionRef\.current\) \{ saveHistory\(\); widthSessionRef\.current = true \}/)
  assert.match(app, /selectionWidth=\{inputMode === 'desktop' && selectionHasOutlineWidth/)
  assert.match(app, /lineStyle=\{inputMode === 'desktop'/)
  assert.match(app, /arrowheads=\{inputMode === 'desktop' && selectionHasArrowheads/)
  assert.match(app, /layer=\{inputMode === 'desktop' && \(selectedItemCount > 0 \|\| hasSelectedRectangle\)/)
  assert.match(app, /arrange=\{inputMode === 'desktop' && canAlign\(/)
  assert.match(app, /const moveSelectionLayer = [\s\S]{0,400}saveHistory\(\)\n    strokesRef\.current = next\n    historyCacheRef\.current = null\n    renderAll\(\)/)
  assert.match(app, /const arrangeSelection = [\s\S]{0,300}saveHistory\(\)\n    strokesRef\.current = applyMoves[\s\S]{0,80}historyCacheRef\.current = null/)
  assert.match(app, /case 'layer': return moveSelectionLayer\(command\.move\)/)
  assert.match(app, /case 'bringToFront': moveSelectionLayer\('front'\)/)
  assert.match(app, /case 'sendToBack': moveSelectionLayer\('back'\)/)
  assert.match(app, /clampMenuPosition\(contextMenu\.x, contextMenu\.y, CONTEXT_MENU_WIDTH, contextMenuHeight\(entries\),/)
})

test('wiring: new shapes, lines and arrows from the desktop shape tools take the default line style', () => {
  assert.match(app, /shape: lineTool, points: \[first, last\], \.\.\.\(lineDashDefaultRef\.current !== 'solid'/)
  assert.match(app, /const dashedBox = lineDashDefaultRef\.current !== 'solid'/)
  assert.match(app, /useState<'solid' \| LineDash>\(\(\) => loadLineDashDefault\(\)\)/)
})

test('the line style default is stored and read safely', () => {
  const store = new Map()
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
  assert.equal(input.loadLineDashDefault(storage), 'solid')
  input.saveLineDashDefault('dotted', storage)
  assert.equal(input.loadLineDashDefault(storage), 'dotted')
  store.set('inkpad.lineDash', 'wavy')
  assert.equal(input.loadLineDashDefault(storage), 'solid')
  assert.equal(input.loadLineDashDefault({ getItem() { throw new Error('blocked') } }), 'solid')
})

test('the panel shows the new sections from props and the renderers read dash and arrowheads', async () => {
  const { readFile } = await import('node:fs/promises')
  const panel = await readFile(new URL('../src/app/ContextPanel.tsx', import.meta.url), 'utf8')
  for (const needle of ['props.selectionWidth &&', 'props.lineStyle &&', 'props.arrowheads &&', 'props.layer &&', 'props.arrange &&']) assert.ok(panel.includes(needle), needle)
  const renderer = await readFile(new URL('../src/app/canvasRenderer.ts', import.meta.url), 'utf8')
  assert.match(renderer, /dashPattern\(stroke\.dash/)
  assert.match(renderer, /dashPattern\(rectangle\.dash/)
  assert.match(renderer, /connectorDashPattern\(connector/)
  assert.match(renderer, /strokeHeadGeometry/)
})
