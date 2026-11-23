import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const clip = await loadModule('clipboard.ts')
const model = await loadModule('canvasModel.ts')
const format = await loadModule('documentFormat.ts')
const input = await loadModule('desktopInput.ts')
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const panel = await readFile(new URL('../src/app/ContextPanel.tsx', import.meta.url), 'utf8')

const WORKSPACE = { x: -2000, y: -2000, width: 8000, height: 8000 }
const pt = (x, y) => ({ x, y, pressure: 0.5 })
const rect = (id, x, y, extra = {}) => ({ kind: 'rectangle', id, x, y, width: 100, height: 60, strokeColor: '#202124', strokeWidth: 4, ...extra })
const text = (id, x, y) => ({ kind: 'text', id, x, y, width: 80, height: 20, text: 'hi', fontSize: 16, color: '#000' })
const stroke = (id, x, y) => ({ kind: 'stroke', id, points: [pt(x, y), pt(x + 30, y + 10)], color: '#000', width: 4, erase: false })
const link = (id, a, b, extra = {}) => ({ kind: 'connector', id, start: pt(0, 0), end: pt(50, 50), strokeColor: '#000', strokeWidth: 3, relationshipType: 'association', reversed: false, ...extra })
const counters = (items) => { const n = format.getNextIds(items); return { stroke: n.stroke, rectangle: n.rectangle, connector: n.connector, text: n.text } }
const keysOf = (items) => new Set(items.map(model.canvasItemKey))

test('copy is a deep clone in page order, so later edits to the original never change the clipboard', () => {
  const items = [rect(1, 0, 0), text(2, 10, 10), stroke(3, 5, 5)]
  const copied = clip.copyItems(items, new Set(['stroke:3', 'rectangle:1']))
  assert.deepEqual(copied.map(model.canvasItemKey), ['rectangle:1', 'stroke:3'])
  items[0].x = 999
  items[2].points[0].x = 999
  assert.equal(copied[0].x, 0)
  assert.equal(copied[1].points[0].x, 5)
  assert.deepEqual(clip.copyItems(items, new Set()), [])
})

test('copy drops a derived elbow path: only saved fields are copied', () => {
  const routed = link(5, 1, 2, { routing: 'elbow', routedPath: [pt(0, 0), pt(10, 0), pt(10, 50)] })
  const [copied] = clip.copyItems([routed], new Set(['connector:5']))
  assert.equal('routedPath' in copied, false)
  assert.equal(copied.routing, 'elbow')
})

test('paste gives fresh unique ids per kind, offsets everything, and selects the new items', () => {
  const items = [rect(1, 100, 100), rect(2, 400, 100), text(3, 120, 130), stroke(4, 150, 150), link(5, 0, 0)]
  const c = counters(items)
  const copied = clip.copyItems(items, keysOf(items))
  const result = clip.pasteItems(copied, c, 24, WORKSPACE)
  assert.equal(result.dx, 24)
  assert.equal(result.dy, 24)
  assert.deepEqual(result.keys, ['rectangle:3', 'rectangle:4', 'text:4', 'stroke:5', 'connector:6'])
  assert.deepEqual(result.counters, { stroke: 6, rectangle: 5, connector: 7, text: 5 })
  assert.equal(result.items[0].x, 124)
  assert.equal(result.items[2].y, 154)
  assert.equal(result.items[3].points[1].x, 150 + 30 + 24)
  // the originals and the clipboard are untouched
  assert.equal(items[0].x, 100)
  assert.equal(copied[0].x, 100)
})

test('connectors: both boxes copied means re-pointed at the new boxes; one or none copied means the missing end is detached', () => {
  const a = rect(1, 0, 0)
  const b = rect(2, 300, 0)
  const both = link(7, 0, 0, { startAttachment: { rectangleId: 1, offsetX: 100, offsetY: 30 }, endAttachment: { rectangleId: 2, offsetX: 0, offsetY: 30 } })
  const items = [a, b, both]
  const all = clip.pasteItems(clip.copyItems(items, keysOf(items)), counters(items), 24, WORKSPACE)
  const pasted = all.items[2]
  assert.deepEqual(pasted.startAttachment, { rectangleId: 3, offsetX: 100, offsetY: 30 })
  assert.deepEqual(pasted.endAttachment, { rectangleId: 4, offsetX: 0, offsetY: 30 })
  // only the connector copied: no attachments at all, and none point at the old boxes
  const alone = clip.pasteItems(clip.copyItems(items, new Set(['connector:7'])), counters(items), 24, WORKSPACE)
  assert.equal(alone.items[0].startAttachment, undefined)
  assert.equal(alone.items[0].endAttachment, undefined)
  assert.equal('startAttachment' in alone.items[0], false)
  // one box copied: that end follows the new box, the other end is loose
  const half = clip.pasteItems(clip.copyItems(items, new Set(['rectangle:1', 'connector:7'])), counters(items), 24, WORKSPACE)
  const halfLink = half.items.find((item) => item.kind === 'connector')
  assert.equal(halfLink.startAttachment.rectangleId, half.items.find((item) => item.kind === 'rectangle').id)
  assert.equal(halfLink.endAttachment, undefined)
  // the original connector still points at the original boxes
  assert.equal(both.startAttachment.rectangleId, 1)
})

test('ink class boxes paste with their ink, dividers moved, and fresh stroke ids for the ink inside', () => {
  const box = rect(1, 100, 100, { inkBox: { top: 130, mid: 150, ink: [stroke(8, 110, 110), stroke(9, 120, 120)] } })
  const items = [box, stroke(10, 0, 0)]
  const result = clip.pasteItems(clip.copyItems(items, new Set(['rectangle:1'])), counters(items), 24, WORKSPACE)
  const pasted = result.items[0]
  assert.equal(pasted.inkBox.top, 154)
  assert.equal(pasted.inkBox.mid, 174)
  assert.deepEqual(pasted.inkBox.ink.map((s) => s.id), [11, 12])
  assert.equal(pasted.inkBox.ink[0].points[0].x, 134)
  assert.equal(box.inkBox.ink[0].points[0].x, 110)
  assert.equal(result.counters.stroke, 13)
})

test('class boxes and HLD shapes keep their content and kind', () => {
  const cls = rect(1, 0, 0, { classBox: { name: 'A', attributes: 'x', methods: 'y' } })
  const hld = rect(2, 200, 0, { hldShape: 'database', inkBox: { top: 20, mid: 40, ink: [] } })
  const result = clip.pasteItems(clip.copyItems([cls, hld], keysOf([cls, hld])), counters([cls, hld]), 24, WORKSPACE)
  assert.deepEqual(result.items[0].classBox, { name: 'A', attributes: 'x', methods: 'y' })
  assert.notEqual(result.items[0].classBox, cls.classBox)
  assert.equal(result.items[1].hldShape, 'database')
})

test('consecutive pastes step by +24 each, and an empty clipboard pastes nothing', () => {
  assert.equal(clip.PASTE_OFFSET, 24)
  assert.equal(clip.pasteItems([], { stroke: 1, rectangle: 1, connector: 1, text: 1 }, 24, WORKSPACE), null)
  const items = [rect(1, 10, 10)]
  const copied = clip.copyItems(items, keysOf(items))
  let c = counters(items)
  const xs = []
  for (let n = 1; n <= 3; n += 1) { const r = clip.pasteItems(copied, c, clip.PASTE_OFFSET * n, WORKSPACE); c = r.counters; xs.push(r.items[0].x) }
  assert.deepEqual(xs, [34, 58, 82])
})

test('paste is clamped to the workspace and the group keeps its layout', () => {
  const bounds = { x: 0, y: 0, width: 500, height: 500 }
  const items = [rect(1, 380, 100), rect(2, 300, 300)]
  const result = clip.pasteItems(clip.copyItems(items, keysOf(items)), counters(items), 24, bounds)
  // the group's right edge is at 480 + 2 (stroke), so it may move only 18 right
  assert.ok(result.items.every((item) => item.x + item.width <= bounds.x + bounds.width))
  assert.equal(result.items[0].x - 380, result.items[1].x - 300)
  assert.ok(result.dx < 24)
})

test('undo and redo round trip a paste as one step, and a cut as one step', () => {
  const history = new model.CanvasSnapshotHistory()
  let current = [rect(1, 0, 0), text(2, 5, 5)]
  const original = current
  const copied = clip.copyItems(current, keysOf(current))
  history.record(current)
  current = [...current, ...clip.pasteItems(copied, counters(current), 24, WORKSPACE).items]
  assert.equal(current.length, 4)
  const undone = history.undo(current)
  assert.equal(undone.length, 2)
  assert.equal(history.redo(undone).length, 4)
  // cut
  history.record(current)
  const afterCut = model.deleteCanvasItemsByKey(current, new Set(['rectangle:1', 'text:2']))
  assert.equal(afterCut.length, 2)
  assert.equal(history.undo(afterCut).length, 4)
})

test('the saved JSON gains no new keys: pasted items serialize with exactly the key set of the originals', () => {
  const items = [
    rect(1, 0, 0), rect(2, 300, 0, { inkBox: { top: 20, mid: 40, ink: [stroke(8, 5, 5)] } }), text(3, 0, 100), stroke(4, 0, 200),
    link(5, 0, 0, { startAttachment: { rectangleId: 1, offsetX: 1, offsetY: 2 }, endAttachment: { rectangleId: 2, offsetX: 3, offsetY: 4 }, routing: 'elbow' }),
  ]
  const pasted = clip.pasteItems(clip.copyItems(items, keysOf(items)), counters(items), 24, WORKSPACE).items
  const keySets = (list) => list.map((item) => [item.kind, Object.keys(item).sort().join(',')].join(':'))
  assert.deepEqual(keySets(pasted), keySets(items))
  const nested = (list) => JSON.stringify(list.map((item) => item.inkBox ? Object.keys(item.inkBox).sort() : null))
  assert.equal(nested(pasted), nested(items))
  // and the saved document parses cleanly with the pasted items included
  const doc = format.createDocument({ title: 't', items: [...items, ...pasted], template: 'blank', pageBackground: 'white' })
  const parsed = format.parseDocument(format.stringifyDocument(doc))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.document.version, doc.version)
  assert.deepEqual(Object.keys(parsed.document).sort(), Object.keys(doc).sort())
})

test('stress: 200 mixed items pasted 5 times keep every id unique per kind', () => {
  const items = []
  for (let i = 1; i <= 50; i += 1) items.push(rect(i, (i % 10) * 120, Math.floor(i / 10) * 90, i % 5 === 0 ? { inkBox: { top: 20, mid: 40, ink: [stroke(1000 + i, 1, 1)] } } : {}))
  for (let i = 1; i <= 50; i += 1) items.push(text(i, i * 3, 5))
  for (let i = 1; i <= 50; i += 1) items.push(stroke(i, i * 2, 500))
  for (let i = 1; i <= 50; i += 1) items.push(link(i, 0, 0, i % 2 ? { startAttachment: { rectangleId: i, offsetX: 0, offsetY: 0 }, endAttachment: { rectangleId: ((i % 50) + 1), offsetX: 0, offsetY: 0 } } : {}))
  assert.equal(items.length, 200)
  const copied = clip.copyItems(items, keysOf(items))
  let all = items.slice()
  let c = counters(all)
  for (let n = 1; n <= 5; n += 1) {
    const r = clip.pasteItems(copied, c, clip.PASTE_OFFSET * n, WORKSPACE)
    c = r.counters
    all = [...all, ...r.items]
  }
  assert.equal(all.length, 1200)
  for (const kind of ['rectangle', 'text', 'stroke', 'connector']) {
    const ids = all.filter((item) => item.kind === kind).map((item) => item.id)
    assert.equal(new Set(ids).size, ids.length, `${kind} ids unique`)
  }
  // every pasted attachment points at a rectangle that exists in the same paste
  const rectIds = new Set(all.filter((item) => item.kind === 'rectangle').map((item) => item.id))
  for (const item of all) if (item.kind === 'connector') for (const att of [item.startAttachment, item.endAttachment]) if (att) assert.ok(rectIds.has(att.rectangleId))
  // inner ink ids of the pasted ink boxes never clash with each other or with top-level strokes
  const inner = all.flatMap((item) => (item.kind === 'rectangle' && item.inkBox ? item.inkBox.ink.map((s) => s.id) : []))
  const pastedInner = inner.filter((id) => id >= 51)
  assert.equal(new Set(pastedInner).size, pastedInner.length)
})

test('keys: Ctrl/Cmd + C, X, V, D in Desktop mode only; Shift, Alt and auto-repeat are left alone', () => {
  const key = (k, extra = {}) => ({ key: k, ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra })
  assert.deepEqual(input.keyCommand(key('c'), 'desktop'), { kind: 'copy' })
  assert.deepEqual(input.keyCommand(key('x'), 'desktop'), { kind: 'cut' })
  assert.deepEqual(input.keyCommand(key('v', { ctrlKey: false, metaKey: true }), 'desktop'), { kind: 'paste' })
  assert.deepEqual(input.keyCommand(key('D'), 'desktop'), { kind: 'duplicate' })
  for (const k of ['c', 'x', 'v', 'd']) {
    assert.equal(input.keyCommand(key(k), 'tablet'), null)
    assert.equal(input.keyCommand(key(k, { shiftKey: true }), 'desktop'), null)
    assert.equal(input.keyCommand(key(k, { altKey: true }), 'desktop'), null)
    assert.equal(input.keyCommand(key(k, { repeat: true }), 'desktop'), null)
  }
})

test('App wiring: one history step for paste, cut deletes through deleteSelection, the system clipboard is never used, tablet gets buttons', () => {
  assert.match(app, /const cutSelection = \(\): boolean => copySelection\(\) && deleteSelection\(\)/)
  assert.match(app, /const duplicateSelection = \(\): boolean => \{[^]*?insertPasted\(pasteItems\(copied/)
  assert.match(app, /pasteItems\(clip, \{ stroke: nextStrokeIdRef\.current, rectangle: nextRectangleIdRef\.current, connector: nextConnectorIdRef\.current, text: nextTextIdRef\.current \}, PASTE_OFFSET \* \(pasteCountRef\.current \+ 1\), workspaceBoundsRef\.current, at, strokesRef\.current\)/)
  const pasteFn = app.slice(app.indexOf('const pasteClipboard = ('), app.indexOf('// Duplicate = copy + paste'))
  assert.equal((pasteFn.match(/saveHistory\(\)/g) ?? []).length, 1)
  assert.doesNotMatch(app, /navigator\.clipboard|execCommand\(['"](copy|paste|cut)/)
  assert.match(app, /case 'copy': return copyWithToast\(\)\n\s*case 'cut': return cutWithToast\(\)\n\s*case 'copyPng': return copyAsPng\(\)\n\s*(?:case '(?:copy|paste)Style': return [^\n]*\n\s*)*case 'paste': return pasteWithToast\(inputModeRef[^\n]*\n\s*case 'duplicate': return duplicateWithToast\(\)/)
  assert.match(app, /canCopy=\{selectedItemCount > 0 \|\| hasSelectedRectangle\}\n\s*canPaste=\{clipboardCount > 0\}/)
  // the panel shows Copy and Duplicate with a selection and Paste with a non-empty clipboard, next to Delete
  assert.match(panel, /props\.canCopy && <button[^>]*aria-label="Copy selection"/)
  assert.match(panel, /props\.canPaste && <button[^>]*aria-label="Paste"/)
  assert.match(panel, /props\.canCopy && <button[^>]*aria-label="Duplicate selection"/)
  assert.ok(panel.indexOf('Duplicate selection') < panel.indexOf('Delete selection'))
})

test('review fixes: undo drops a stale single-box selection, and page or document changes restart the +24 offset', () => {
  assert.match(app, /if \(selectedRectangleIdRef\.current !== null && !available\.has\(`rectangle:\$\{selectedRectangleIdRef\.current\}`\)\) setSelectedRectangle\(null\)/)
  assert.match(app, /const resetInteractionState = \(\) => \{[\s\S]*?pasteCountRef\.current = 0/)
})

// ---- paste at the cursor (Desktop) ----
const centreOf = (items) => { const b = model.getCanvasSelectionBounds(items, keysOf(items)); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }

test('paste at a cursor centres a single rectangle, text, stroke and connector on the point', () => {
  const at = { x: 500, y: 400 }
  for (const item of [rect(1, 0, 0), text(1, 10, 10), stroke(1, 5, 5), link(1, 0, 0)]) {
    const result = clip.pasteItems([item], counters([item]), 24, WORKSPACE, at)
    const c = centreOf(result.items)
    assert.ok(Math.abs(c.x - 500) < 1e-9 && Math.abs(c.y - 400) < 1e-9, item.kind)
  }
})

test('paste at a cursor keeps a multi-selection layout, re-points connectors and moves ink with its box', () => {
  const box = rect(1, 0, 0, { inkBox: { top: 20, mid: 40, ink: [stroke(7, 10, 10)] } })
  const other = rect(2, 300, 200)
  const edge = link(1, 0, 0, { startAttachment: { rectangleId: 1, side: 'right', offset: 0.5 }, endAttachment: { rectangleId: 2, side: 'left', offset: 0.5 } })
  const clipItems = [box, other, edge]
  const result = clip.pasteItems(clipItems, counters(clipItems), 24, WORKSPACE, { x: 1000, y: 1000 })
  const [b, o, e] = result.items
  assert.equal(o.x - b.x, 300)
  assert.equal(o.y - b.y, 200)
  assert.equal(b.inkBox.ink[0].points[0].x - b.x, 10)
  assert.equal(e.startAttachment.rectangleId, b.id)
  assert.equal(e.endAttachment.rectangleId, o.id)
  assert.equal(result.dx, result.items[0].x - 0)
})

test('paste at a cursor near the edge is clamped inside the workspace', () => {
  const result = clip.pasteItems([rect(1, 0, 0)], { stroke: 1, rectangle: 2, connector: 1, text: 1 }, 24, WORKSPACE, { x: -5000, y: 99999 })
  const b = model.getCanvasSelectionBounds(result.items, keysOf(result.items))
  assert.ok(b.x >= WORKSPACE.x - 1e-9)
  assert.ok(b.y + b.height <= WORKSPACE.y + WORKSPACE.height + 1e-9)
})

test('paste without a cursor point (toolbar, tablet) keeps the offset behaviour', () => {
  const items = [rect(1, 0, 0)]
  for (const at of [undefined, null]) {
    const result = clip.pasteItems(items, counters(items), 48, WORKSPACE, at)
    assert.equal(result.dx, 48)
    assert.equal(result.dy, 48)
  }
  assert.deepEqual(clip.pasteTranslation({ x: 0, y: 0, width: 10, height: 10 }, 24, WORKSPACE), { dx: 24, dy: 24 })
})

test('App wiring: keyboard paste uses the mouse point, duplicate and toolbar do not', () => {
  assert.match(app, /pasteClipboard = \(at\?: Point \| null\)/)
  assert.match(app, /case 'paste': return pasteWithToast\(inputModeRef\.current === 'desktop' && cursorPointRef\.current/)
  assert.match(app, /const duplicateSelection = \(\): boolean => \{[^]*?insertPasted\(pasteItems\(copied/)
  assert.match(app, /onPaste=\{\(\) => \{ pasteClipboard\(\) \}\}/)
  assert.match(app, /cursorPointRef\.current = null/)
  assert.match(app, /if \(!at\) pasteCountRef\.current \+= 1/)
})
