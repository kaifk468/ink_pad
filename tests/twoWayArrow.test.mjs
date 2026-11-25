import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const model = await loadModule('canvasModel.ts')
const doc = await loadModule('documentFormat.ts')
const exp = await loadModule('sheetExport.ts')
const input = await loadModule('desktopInput.ts')
const sketchy = await loadModule('sketchy.ts')
const styles = await loadModule('styleClipboard.ts')
const app = await readAppSource()
const panel = await readFile(new URL('../src/app/ContextPanel.tsx', import.meta.url), 'utf8')
const renderer = await readFile(new URL('../src/app/canvasRenderer.ts', import.meta.url), 'utf8')
const sketchyRender = await readFile(new URL('../src/app/sketchyRender.ts', import.meta.url), 'utf8')

const p = (x, y) => ({ x, y, pressure: 0 })
const conn = (type, extra = {}, id = 1) => ({ kind: 'connector', id, start: p(0, 0), end: p(300, 0), strokeColor: '#111', strokeWidth: 3, relationshipType: type, reversed: false, ...extra })
const file = (items) => JSON.stringify({ format: 'inkpad-document', version: 1, title: 't', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', page: { template: 'blank', background: 'white' }, items })
const loaded = (items) => {
  const result = doc.parseDocument(file(items))
  assert.equal(result.ok, true)
  return result.document.items
}

test('sanitize keeps twoWay only as true on a directed association', () => {
  assert.equal(loaded([conn('directed-association', { twoWay: true })])[0].twoWay, true)
  for (const bad of [false, 1, 'true', null]) assert.equal('twoWay' in loaded([conn('directed-association', { twoWay: bad })])[0], false)
  for (const type of ['association', 'inheritance', 'dependency', 'composition']) assert.equal('twoWay' in loaded([conn(type, { twoWay: true })])[0], false)
})

test('a file without the field re-saves unchanged and a two-way file round trips', () => {
  const old = file([conn('directed-association'), conn('inheritance', {}, 2)])
  const out = doc.stringifyDocument(doc.parseDocument(old).document)
  assert.deepEqual(JSON.parse(out), JSON.parse(old))
  assert.equal(out.includes('twoWay'), false)
  const two = file([conn('directed-association', { twoWay: true })])
  assert.deepEqual(JSON.parse(doc.stringifyDocument(doc.parseDocument(two).document)), JSON.parse(two))
})

test('a two-way arrow has a second head at the other end, mirrored when reversed', () => {
  const one = conn('directed-association')
  assert.equal(model.getConnectorSecondSymbolGeometry(one), null)
  const two = { ...one, twoWay: true }
  assert.equal(model.getConnectorSymbolGeometry(two).tip.x, 300)
  assert.equal(model.getConnectorSecondSymbolGeometry(two).tip.x, 0)
  const rev = { ...two, reversed: true }
  assert.equal(model.getConnectorSymbolGeometry(rev).tip.x, 0)
  assert.equal(model.getConnectorSecondSymbolGeometry(rev).tip.x, 300)
  assert.equal(model.getConnectorSecondSymbolGeometry({ ...conn('inheritance'), twoWay: true }), null)
  assert.equal(model.getConnectorRenderSpec(two).endpoint, 'end')
})

test('selection bounds include the second head', () => {
  const c = { ...conn('directed-association', { start: p(100, 100), end: p(100, 400), twoWay: true }) }
  const bounds = model.getCanvasSelectionBounds([c], new Set(['connector:1']))
  const second = model.getConnectorSecondSymbolGeometry(c)
  for (const w of [second.sideA, second.sideB]) assert.ok(w.x >= bounds.x && w.x <= bounds.x + bounds.width && w.y >= bounds.y && w.y <= bounds.y + bounds.height)
})

test('svg export draws two arrowheads for a two-way arrow, plain and sketchy', () => {
  const opts = { width: 800, height: 400, template: 'blank', backgroundColor: '#ffffff' }
  const heads = (c) => (exp.buildSheetSvg([c], opts).match(/fill="none"/g) || []).length
  assert.equal(heads({ ...conn('directed-association'), twoWay: true }), heads(conn('directed-association')) + 1)
  const one = sketchy.sketchyConnectorShape(conn('directed-association')).head
  const two = sketchy.sketchyConnectorShape({ ...conn('directed-association'), twoWay: true }).head
  assert.ok(two.length > one.length)
  assert.match(renderer, /getConnectorSecondSymbolGeometry\(connector, width\)/)
  assert.match(sketchyRender, /connector\.twoWay \? 1 : 0/)
})

test('changing the relationship drops twoWay; setting it works only on unlocked arrows; reverse keeps it', () => {
  const two = { ...conn('directed-association'), twoWay: true }
  assert.equal('twoWay' in model.updateConnectorRelationship([two], 1, 'inheritance')[0], false)
  assert.equal(model.updateConnectorRelationship([two], 1, 'directed-association')[0], two)
  assert.equal(model.updateConnectorTwoWay([conn('inheritance')], 1, true)[0].twoWay, undefined)
  assert.equal('twoWay' in model.updateConnectorTwoWay([two], 1, false)[0], false)
  assert.equal(model.reverseConnectorDirection([two], 1)[0].twoWay, true)
  const locked = conn('directed-association', { locked: true })
  assert.equal(model.updateConnectorTwoWay([locked], 1, true)[0], locked)
})

test('selected arrows change together, skipping locked ones, and the menu offers the right chip', () => {
  const items = [conn('directed-association', {}, 1), conn('directed-association', { twoWay: true }, 2), conn('inheritance', {}, 3), conn('directed-association', { locked: true }, 4)]
  const keys = new Set(['connector:1', 'connector:2', 'connector:3', 'connector:4'])
  assert.equal(model.arrowEndsChoice(items, keys), 'both')
  const next = model.setSelectedArrowsTwoWay(items, keys, true)
  assert.deepEqual(next.map((i) => i.twoWay === true), [true, true, false, false])
  assert.equal(model.arrowEndsChoice(next, keys), 'one')
  assert.equal(model.setSelectedArrowsTwoWay(next, keys, true), next)
  assert.equal(model.arrowEndsChoice(items, new Set(['connector:3', 'connector:4'])), null)
  const base = { hasSelection: true, clipboardHasItems: false, pageHasItems: true, canEditText: false, lockedTarget: false, anyLocked: false, canCopyStyle: true }
  const entries = (arrowEnds) => input.contextMenuEntries({ ...base, arrowEnds })
  assert.equal(entries(null).some((e) => e.action.startsWith('arrow')), false)
  const both = entries('both').find((e) => e.action === 'arrowBothEnds')
  assert.equal(both.label, 'Arrow: both ends')
  assert.equal(both.chipGroup, 'Style')
  assert.equal(entries('one').find((e) => e.action === 'arrowOneEnd').label, 'Arrow: one end')
  // It joins the Style chip block: no extra row.
  assert.equal(input.contextMenuRows(entries('both')).length, input.contextMenuRows(entries(null)).length)
  const styleBlock = (arrowEnds) => input.contextMenuRows(entries(arrowEnds)).find((row) => row.chips?.[0].chipGroup === 'Style')
  assert.equal(input.chipBlockLayout(styleBlock('both').chips).inline, true, 'the chip fits the Style line')
  assert.equal(input.chipBlockLayout(styleBlock('one').chips).inline, true)
  assert.equal(input.contextMenuHeight(entries('both')), input.contextMenuHeight(entries(null)), 'the menu does not grow')
})

test('copy style carries both-ends between arrows', () => {
  const two = { ...conn('directed-association'), twoWay: true }
  assert.equal(styles.captureStyle(two).twoWay, true)
  assert.equal('twoWay' in styles.captureStyle(conn('inheritance')), false)
  const out = styles.applyStyle([conn('directed-association', {}, 2)], new Set(['connector:2']), styles.captureStyle(two))
  assert.equal(out[0].twoWay, true)
})

test('panel, menu, palette and history are wired', () => {
  assert.match(panel, /relationship\.type === 'directed-association'[\s\S]*aria-label="Arrow ends"[\s\S]*Both ends/)
  assert.match(panel, /One way/)
  assert.match(app, /case 'arrowBothEnds': setSelectedArrowEnds\(true\)/)
  assert.match(app, /case 'arrowOneEnd': setSelectedArrowEnds\(false\)/)
  assert.match(app, /if \(next === strokesRef\.current\) return\s+saveHistory\(\)\s+strokesRef\.current = next\s+setSelectedConnectorTwoWay/)
  assert.match(app, /onTwoWay: setSelectedArrowEnds/)
  assert.match(app, /arrowEnds: arrowEndsChoice\(strokesRef\.current, selectedKeysRef\.current\)/)
  assert.match(app, /id: 'arrow:both-ends', label: 'Arrow: both ends'/)
  assert.match(app, /id: 'arrow:one-end', label: 'Arrow: one end'/)
})
