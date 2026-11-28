import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import { loadModule } from './helpers/loadModule.mjs'

const tpl = await loadModule('diagramTemplates.ts')
const doc = await loadModule('documentFormat.ts')
const model = await loadModule('canvasModel.ts')
const clip = await loadModule('clipboard.ts')
const flow = await loadModule('diagramFlow.ts')
const viewport = await loadModule('viewport.ts')
const hldModule = await loadModule('hldShapes.ts')

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
const roundTrip = (items) => doc.parseDocument(doc.stringifyDocument(doc.createDocument({ title: 't', template: 'blank', background: 'white', items })))

test('there are four templates with id, name and description', () => {
  assert.deepEqual(tpl.DIAGRAM_TEMPLATES.map((t) => t.name), ['Client–server–database', 'Cache + queue service', 'Class diagram', 'Interview board'])
  assert.equal(new Set(tpl.DIAGRAM_TEMPLATES.map((t) => t.id)).size, 4)
  for (const t of tpl.DIAGRAM_TEMPLATES) assert.ok(t.id && t.name && t.description, t.id)
  assert.equal(tpl.buildTemplate('nope'), null)
})

for (const t of tpl.DIAGRAM_TEMPLATES) {
  test(`${t.name}: items pass the document sanitizer unchanged`, () => {
    const items = t.build()
    const parsed = roundTrip(items)
    assert.equal(parsed.ok, true)
    assert.equal(parsed.droppedItems, 0)
    assert.deepEqual(parsed.document.items, items)
  })

  test(`${t.name}: ids are unique per kind and start at 1; connectors attach to boxes inside the template`, () => {
    const items = t.build()
    for (const kind of ['rectangle', 'text', 'connector']) {
      const ids = items.filter((i) => i.kind === kind).map((i) => i.id)
      assert.equal(new Set(ids).size, ids.length, kind)
      if (ids.length) assert.equal(Math.min(...ids), 1, kind)
    }
    const boxes = new Map(items.filter((i) => i.kind === 'rectangle').map((b) => [b.id, b]))
    const connectors = items.filter((i) => i.kind === 'connector')
    assert.ok(connectors.length > 0 || t.id === 'interview-board')
    for (const c of connectors) {
      for (const [attachment, end] of [[c.startAttachment, c.start], [c.endAttachment, c.end]]) {
        assert.ok(attachment, 'attached')
        const box = boxes.get(attachment.rectangleId)
        assert.ok(box, 'box exists')
        // the end point sits on the side midpoint the attachment names
        assert.equal(box.x + attachment.offsetX, end.x)
        assert.equal(box.y + attachment.offsetY, end.y)
        const mid = (attachment.offsetX === 0 || attachment.offsetX === box.width) !== (attachment.offsetY === 0 || attachment.offsetY === box.height)
        assert.ok(mid, 'on one side')
      }
    }
  })

  test(`${t.name}: every label lies inside a box and the layout fits the sheet width when centred`, () => {
    const items = t.build()
    const boxes = items.filter((i) => i.kind === 'rectangle')
    for (const label of items.filter((i) => i.kind === 'text')) {
      assert.ok(boxes.some((box) => flow.labelInsideBox(label, box)), `label "${label.text}" is inside a box`)
    }
    const centre = { x: viewport.SHEET_WIDTH / 2, y: viewport.SHEET_HEIGHT / 2 }
    const result = clip.pasteItems(items, { stroke: 1, rectangle: 1, connector: 1, text: 1 }, clip.PASTE_OFFSET, viewport.SHEET_BOUNDS, centre, [])
    assert.ok(result)
    const bounds = model.getCanvasSelectionBounds(result.items, new Set(result.keys))
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.SHEET_WIDTH, 'inside the sheet width')
    assert.ok(Math.abs(bounds.x + bounds.width / 2 - centre.x) < 1, 'centred horizontally')
    assert.equal(result.keys.length, items.length)
    // connectors still point at boxes that were pasted
    const pastedBoxIds = new Set(result.items.filter((i) => i.kind === 'rectangle').map((b) => b.id))
    for (const c of result.items.filter((i) => i.kind === 'connector')) {
      assert.ok(pastedBoxIds.has(c.startAttachment.rectangleId) && pastedBoxIds.has(c.endAttachment.rectangleId))
    }
  })
}

test('HLD templates are drawn smaller than the default shape sizes so they fit one screen at a readable zoom', () => {
  assert.equal(tpl.HLD_TEMPLATE_SCALE, 0.7)
  for (const id of ['client-server-database', 'cache-queue-service']) {
    const items = tpl.buildTemplate(id)
    const boxes = items.filter((i) => i.kind === 'rectangle')
    const bounds = model.getCanvasSelectionBounds(items, new Set(items.map(model.canvasItemKey)))
    assert.ok(bounds.width <= 1100 && bounds.height <= 460, `${id} is ${bounds.width} x ${bounds.height}`)
    for (const box of boxes) {
      const size = hldModule.HLD_DEFAULT_SIZE[box.hldShape]
      assert.ok(box.width <= size.width && box.height <= size.height, `${id}: ${box.hldShape} is not larger than its default`)
      assert.ok(box.width >= 64 && box.height >= 64)
      assert.ok(box.inkBox.top >= box.y + 24 && box.inkBox.mid >= box.inkBox.top + 24 && box.inkBox.mid <= box.y + box.height - 24, 'ink dividers stay valid')
    }
    for (const label of items.filter((i) => i.kind === 'text')) assert.ok(boxes.some((box) => flow.labelInsideBox(label, box)), label.text)
    for (const a of boxes) for (const b of boxes) {
      if (a.id >= b.id) continue
      const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
      assert.ok(apart, `${id}: boxes ${a.id} and ${b.id} overlap`)
    }
  }
})

test('templates use the HLD shapes, typed class boxes and an inheritance connector as specified', () => {
  const hld = (id) => tpl.buildTemplate(id).filter((i) => i.kind === 'rectangle' && i.hldShape).map((i) => i.hldShape)
  assert.deepEqual(hld('client-server-database').sort(), ['database', 'loadBalancer', 'service', 'service', 'user'])
  assert.ok(hld('client-server-database').length === 5)
  const classes = tpl.buildTemplate('class-diagram')
  assert.equal(classes.filter((i) => i.kind === 'rectangle' && i.classBox).length, 3)
  assert.deepEqual(classes.filter((i) => i.kind === 'connector').map((c) => c.relationshipType).sort(), ['association', 'inheritance'])
  for (const box of tpl.buildTemplate('cache-queue-service').filter((i) => i.hldShape)) assert.ok(box.inkBox, 'HLD box has ink content')
  const board = tpl.buildTemplate('interview-board')
  assert.deepEqual(board.filter((i) => i.kind === 'text').map((t) => t.text), ['Requirements', 'API', 'High-level design', 'Deep dive'])
})

test('wiring: chooser, More menu entry, hint button, paste path in one step', async () => {
  const app = await read('App.tsx')
  assert.match(app, /<TemplateChooser onChoose=\{insertTemplate\} onClose=/)
  assert.match(app, /onTemplates=\{\(\) => setTemplateChooserOpen\(true\)\}/)
  assert.match(app, /<EmptyCanvasHint [^>]*onTemplates=\{\(\) => setTemplateChooserOpen\(true\)\}/)
  const body = app.slice(app.indexOf('const insertTemplate'), app.indexOf('const quickCreateShape'))
  assert.match(body, /buildTemplate\(id\)/)
  assert.match(body, /pasteItems\(items,/)
  assert.match(body, /insertPasted\(/)
  assert.equal((body.match(/saveHistory\(\)/g) ?? []).length, 0, 'the one undo step is the one insertPasted records')
  const dock = await read('app/ToolDock.tsx')
  assert.equal((dock.match(/onTemplates=\{props\.onTemplates\}/g) ?? []).length, 2, 'both modes')
  assert.match(await read('app/MoreTray.tsx'), /aria-label="Insert template"[\s\S]*onTemplates\(\)/)
  const hint = await read('app/EmptyCanvasHint.tsx')
  assert.match(hint, /<button type="button" className="empty-canvas-template" onClick=\{onTemplates\}>Start from a template<\/button>/)
  assert.match(hint, /<div aria-hidden="true">/)
  const css = await read('styles.css')
  assert.match(css, /\.empty-canvas-hint \.empty-canvas-template \{[^}]*pointer-events: auto/)
  assert.match(css, /\.empty-canvas-hint \{[^}]*pointer-events: none/)
  const chooser = await read('app/TemplateChooser.tsx')
  assert.match(chooser, /DIAGRAM_TEMPLATES\.map/)
  assert.match(chooser, /event\.key !== 'Escape'/)
  assert.match(chooser, /aria-label="Close"/)
})

test('wiring: an inserted template larger than the view is zoomed out to fit, never zoomed in', async () => {
  const { readFile } = await import('node:fs/promises')
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /const insertTemplate = [\s\S]*?fitViewportToBoundsInset\(bounds, rect\.width, rect\.height, insets, viewportRef\.current\.scale\)/)
})
