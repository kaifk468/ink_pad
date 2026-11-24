import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const ut = await loadModule('userTemplates.ts')
const tpl = await loadModule('diagramTemplates.ts')
const model = await loadModule('canvasModel.ts')
const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')

const sample = () => tpl.buildTemplate('client-server-database')
const origin = (items) => { const b = model.getCanvasSelectionBounds(items, new Set(items.map(model.canvasItemKey))); return [Math.round(b.x * 1000) / 1000, Math.round(b.y * 1000) / 1000] }
const NOW = '2026-11-24T00:00:00.000Z'

test('normalization moves the bounding box to 0,0 and keeps relative positions', () => {
  const box = (id, x, y) => ({ kind: 'rectangle', id, x, y, width: 100, height: 50, strokeColor: '#000', strokeWidth: 2 })
  const { items, omitted } = ut.normalizeTemplateItems([box(1, 300, 200), box(2, 500, 260)])
  assert.equal(omitted, 0)
  assert.deepEqual(origin(items), [0, 0])
  assert.deepEqual([items[1].x - items[0].x, items[1].y - items[0].y], [200, 60])
})

test('connectors keep attachments inside the template and drop others, keeping the end point', () => {
  const a = { kind: 'rectangle', id: 1, x: 100, y: 100, width: 100, height: 50, strokeColor: '#000', strokeWidth: 2 }
  const pt = (x, y) => ({ x, y, pressure: 1 })
  const conn = model.createConnector(1, pt(200, 125), pt(600, 125), '#000', 2, { rectangleId: 1, offsetX: 100, offsetY: 25 }, { rectangleId: 9, offsetX: 0, offsetY: 25 })
  const { items } = ut.normalizeTemplateItems([a, conn])
  const c = items.find((i) => i.kind === 'connector')
  assert.equal(c.startAttachment.rectangleId, 1)
  assert.equal(c.endAttachment, undefined)
  assert.equal(c.end.x - c.start.x, 400)
  assert.equal(c.end.y, c.start.y)
})

test('opaque items are left out and counted; lock dropped, group kept', () => {
  const box = { kind: 'rectangle', id: 1, x: 10, y: 10, width: 10, height: 10, strokeColor: '#000', strokeWidth: 2, locked: true, group: 4 }
  const opaque = { kind: 'opaque', id: 5, box: null, raw: { kind: 'future', id: 5 } }
  const { items, omitted } = ut.normalizeTemplateItems([box, opaque])
  assert.equal(omitted, 1)
  assert.equal(items.length, 1)
  assert.equal(items[0].locked, undefined)
  assert.equal(items[0].group, 4)
})

test('add, serialize and parse round-trip', () => {
  const added = ut.addUserTemplate([], '  Web stack ', sample(), 'a1', NOW)
  assert.equal(added.ok, true)
  assert.equal(added.template.name, 'Web stack')
  const parsed = ut.parseUserTemplates(ut.serializeUserTemplates(added.templates))
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].id, 'a1')
  assert.deepEqual(parsed[0].items, added.template.items)
  assert.equal(ut.serializeUserTemplates(parsed), ut.serializeUserTemplates(added.templates))
})

test('limits: name, count, per-template and total size give clear refusals', () => {
  assert.equal(ut.addUserTemplate([], '   ', sample(), 'x', NOW).ok, false)
  assert.equal(ut.addUserTemplate([], 'n'.repeat(61), sample(), 'x', NOW).ok, false)
  assert.equal(ut.addUserTemplate([], 'n'.repeat(60), sample(), 'x', NOW).ok, true)
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, name: `T${i}`, createdAt: NOW, items: sample() }))
  const full = ut.addUserTemplate(many, 'one more', sample(), 'z', NOW)
  assert.equal(full.ok, false)
  assert.match(full.message, /at most 30/)
  const stroke = (n) => ({ kind: 'stroke', id: 1, color: '#000', width: 2, points: Array.from({ length: n }, (_, i) => ({ x: i, y: i, pressure: 0.5 })) })
  const big = ut.addUserTemplate([], 'big', [stroke(12000)], 'b', NOW)
  assert.equal(big.ok, false)
  assert.match(big.message, /too large/)
  let list = []
  let refused = null
  for (let i = 0; i < 12 && !refused; i++) {
    const r = ut.addUserTemplate(list, `m${i}`, [stroke(5000)], `m${i}`, NOW)
    if (r.ok) list = r.templates
    else refused = r
  }
  assert.ok(refused, 'total limit reached')
  assert.match(refused.message, /too much space/)
})

test('parse drops damaged templates and items instead of crashing', () => {
  const good = ut.addUserTemplate([], 'Good', sample(), 'g', NOW).template
  const text = JSON.stringify({ version: 1, templates: [
    good,
    null, 5, { id: 'n', name: '', items: [good.items[0]] },
    { id: 'noitems', name: 'X', items: 'nope' },
    { id: 'allbad', name: 'Y', items: [{ kind: 'rectangle' }, 3, null] },
    { id: 'half', name: 'Half', createdAt: NOW, items: [good.items[0], { kind: 'rectangle', x: 'bad' }] },
    { ...good },
  ] })
  const parsed = ut.parseUserTemplates(text)
  assert.deepEqual(parsed.map((t) => t.id), ['g', 'half'])
  assert.equal(parsed[1].items.length, 1)
  for (const bad of [null, undefined, '', 'not json', '[]', '{"version":2,"templates":[]}', '{"version":1}']) assert.deepEqual(ut.parseUserTemplates(bad), [])
})

test('storage adapters never throw', () => {
  const broken = { getItem() { throw new Error('denied') }, setItem() { throw new Error('quota') } }
  assert.deepEqual(ut.loadUserTemplates(broken), [])
  assert.equal(ut.saveUserTemplates([], broken), false)
  assert.equal(ut.saveUserTemplates([], null), false)
  const mem = new Map()
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }
  const added = ut.addUserTemplate([], 'A', sample(), 'a', NOW)
  assert.equal(ut.saveUserTemplates(added.templates, store), true)
  assert.ok(mem.has('inkpad.userTemplates'))
  assert.equal(ut.loadUserTemplates(store).length, 1)
  assert.deepEqual(ut.removeUserTemplate(added.templates, 'a'), [])
})

test('wiring: context menu, palette, chooser, shared insert path', async () => {
  const app = await readAppSource()
  const input = await read('desktopInput.ts')
  const chooser = await read('app/TemplateChooser.tsx')
  assert.match(input, /entry\('saveTemplate', 'Save selection as template…'/)
  assert.match(app, /case 'saveTemplate'/)
  assert.match(app, /id: 'template:save'/)
  assert.match(app, /insertTemplateItems\(/)
  assert.match(app, /<TemplateChooser .*userTemplates=/)
  assert.match(chooser, /My templates/)
  assert.match(chooser, /confirm\(`Delete template “/)
  assert.match(chooser, /on this device only/i)
  assert.doesNotMatch(chooser, /window\.prompt/)
})
