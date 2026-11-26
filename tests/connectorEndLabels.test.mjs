import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const el = await loadModule('connectorEndLabels.ts')
const doc = await loadModule('documentFormat.ts')
const exp = await loadModule('sheetExport.ts')
const app = await readAppSource()
const panel = await readFile(new URL('../src/app/ContextPanel.tsx', import.meta.url), 'utf8')
const renderer = await readFile(new URL('../src/app/canvasRenderer.ts', import.meta.url), 'utf8')

const p = (x, y) => ({ x, y, pressure: 0 })
const conn = (extra = {}, id = 1) => ({ kind: 'connector', id, start: p(100, 100), end: p(400, 100), strokeColor: '#c00', strokeWidth: 3, relationshipType: 'association', reversed: false, ...extra })
const file = (items) => JSON.stringify({ format: 'inkpad-document', version: 1, title: 't', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', page: { template: 'blank', background: 'white' }, items })
const loaded = (items) => {
  const result = doc.parseDocument(file(items))
  assert.equal(result.ok, true)
  return result.document.items
}

test('clean: trimmed, capped at 24, empty or non-string dropped', () => {
  assert.equal(el.cleanConnectorEndLabel('  0..*  '), '0..*')
  assert.equal(el.cleanConnectorEndLabel('x'.repeat(40)).length, 24)
  for (const bad of ['', '   ', 5, null, {}, undefined]) assert.equal(el.cleanConnectorEndLabel(bad), undefined)
})

test('geometry: horizontal line, labels beside each end and above the line', () => {
  const layouts = el.connectorEndLabelLayouts(conn({ startLabel: '1', endLabel: '0..*' }), () => 10)
  assert.equal(layouts.length, 2)
  const [start, end] = layouts
  assert.equal(start.end, 'start')
  assert.ok(Math.abs(start.x + start.width / 2 - (100 + 14)) < 1e-6, 'about 14 along from the start')
  assert.ok(start.y + start.height <= 100 - 10 + 1e-6, 'sits above the line, 10 off it')
  assert.ok(Math.abs(end.x + end.width / 2 - (400 - 14)) < 1e-6)
  assert.ok(end.y + end.height <= 100 - 10 + 1e-6)
  assert.ok(start.fontSize < 18)
})

test('geometry: follows a routed elbow path and a vertical line', () => {
  const routed = conn({ startLabel: 'a', endLabel: 'b', routing: 'elbow', routedPath: [p(100, 100), p(100, 200), p(300, 200), p(300, 300)] })
  const [start, end] = el.connectorEndLabelLayouts(routed, () => 10)
  assert.ok(start.x >= 100 + 10 - 1e-6, 'right of the vertical first segment')
  assert.ok(Math.abs(start.y + start.height / 2 - 114) < 1e-6)
  assert.ok(end.x >= 300 + 10 - 1e-6)
  assert.ok(Math.abs(end.y + end.height / 2 - 286) < 1e-6)
})

test('geometry: none without labels, short path stays finite', () => {
  assert.deepEqual(el.connectorEndLabelLayouts(conn()), [])
  const short = el.connectorEndLabelLayouts(conn({ end: p(110, 100), startLabel: '1', endLabel: '2' }), () => 8)
  assert.equal(short.length, 2)
  assert.ok(short.every((l) => Number.isFinite(l.x) && Number.isFinite(l.y)))
})

test('setConnectorEndLabel sets, clears and is a no-op when unchanged', () => {
  const items = [conn()]
  const a = el.setConnectorEndLabel(items, 1, 'start', ' 1 ')
  assert.equal(a[0].startLabel, '1')
  assert.equal(el.setConnectorEndLabel(a, 1, 'start', '1'), a)
  const b = el.setConnectorEndLabel(a, 1, 'start', '')
  assert.equal('startLabel' in b[0], false)
  assert.equal(el.setConnectorEndLabel(items, 1, 'end', ''), items)
})

test('document format: old file unchanged, fields round-trip, junk dropped', () => {
  assert.equal(JSON.stringify(loaded([conn()])), JSON.stringify([conn()]))
  const items = loaded([conn({ startLabel: ' 1 ', endLabel: '0..*' })])
  assert.equal(items[0].startLabel, '1')
  assert.equal(items[0].endLabel, '0..*')
  assert.deepEqual(loaded(items), items)
  const junk = loaded([conn({ startLabel: 7, endLabel: '   ' })])[0]
  assert.equal('startLabel' in junk, false)
  assert.equal('endLabel' in junk, false)
  assert.equal(loaded([conn({ startLabel: 'y'.repeat(50) })])[0].startLabel.length, 24)
})

test('SVG export contains the end label text in the connector colour', () => {
  const svg = exp.buildSheetSvg([conn({ startLabel: '1', endLabel: '0..*' })], { width: 800, height: 600, template: 'blank', backgroundColor: '#ffffff' })
  assert.match(svg, /fill="#c00"[^>]*>0\.\.\*<\/text>/)
  assert.match(svg, /fill="#c00"[^>]*>1<\/text>/)
})

test('wiring: panel inputs, App commit, renderer', () => {
  assert.match(panel, /label="Start end label"/)
  assert.match(panel, /label="End end label"/)
  assert.match(panel, /placeholder="1"/)
  assert.match(panel, /placeholder="\*"/)
  assert.match(panel, /End labels/)
  assert.match(panel, /Multiplicity or cardinality at this end/)
  assert.match(panel, /onBlur=\{\(event\) => commit\(event\.currentTarget\.value\)\}/)
  assert.match(app, /setConnectorEndLabel\(strokesRef\.current, id, end, text\)/)
  assert.match(app, /saveHistory\(\)[\s\S]{0,80}strokesRef\.current = next[\s\S]{0,200}scheduleAutosave/)
  assert.match(renderer, /drawConnectorEndLabels\(ctx, item\)/)
})

// ---- Round 7 review fixes ----

test('geometry: wide labels stay outside the box on horizontal and vertical connectors', () => {
  const widths = { '0..*': 40, '1': 8, 'xxxxxxxxxx': 100 }
  for (const text of Object.keys(widths)) {
    const measure = () => widths[text]
    const [hs, he] = el.connectorEndLabelLayouts(conn({ startLabel: text, endLabel: text }), measure)
    assert.ok(hs.x >= 100 + 4 - 1e-6, `start label "${text}" clear of the box edge at x=100`)
    assert.ok(he.x + he.width <= 400 - 4 + 1e-6, `end label "${text}" clear of the box edge at x=400`)
    const [vs, ve] = el.connectorEndLabelLayouts(conn({ start: p(100, 100), end: p(100, 400), startLabel: text, endLabel: text }), measure)
    assert.ok(vs.y >= 100 + 4 - 1e-6, 'vertical start label below the start point')
    assert.ok(ve.y + ve.height <= 400 - 4 + 1e-6, 'vertical end label above the end point')
  }
  const narrow = el.connectorEndLabelLayouts(conn({ startLabel: '1' }), () => 8)[0]
  assert.ok(Math.abs(narrow.x + narrow.width / 2 - 114) < 1e-6, 'narrow labels keep the 14 unit offset')
})

test('selection bounds cover end labels of selected connectors', () => {
  const items = [conn({ startLabel: 'xxxxxxxxxx', endLabel: '0..*' })]
  const keys = new Set(['connector:1'])
  const plain = el.selectionBoundsWithEndLabels([conn()], keys)
  const withLabels = el.selectionBoundsWithEndLabels(items, keys)
  assert.ok(withLabels.y < plain.y, 'labels above the line extend the top')
  for (const l of el.connectorEndLabelLayouts(items[0], undefined)) {
    assert.ok(withLabels.x <= l.x + 1e-6 && withLabels.y <= l.y + 1e-6)
    assert.ok(withLabels.x + withLabels.width >= l.x + l.width - 1e-6 && withLabels.y + withLabels.height >= l.y + l.height - 1e-6)
  }
  assert.equal(el.selectionBoundsWithEndLabels(items, new Set()), null)
  assert.match(app, /selectionBoundsWithEndLabels\(routeConnectors\(strokesRef\.current\), new Set\(result\.keys\)\)/)
})

test('end label inputs: keyed by connector id and end, commit to the captured id and on unmount', () => {
  assert.match(panel, /key=\{`\$\{relationship\.connectorId\}:start`\}/)
  assert.match(panel, /key=\{`\$\{relationship\.connectorId\}:end`\}/)
  assert.doesNotMatch(panel, /key=\{`start:\$\{relationship\.startLabel\}`\}/)
  assert.match(panel, /const capturedId = useRef\(connectorId\)\.current/)
  assert.match(panel, /commitRef\.current\(capturedId, end, text\)/)
  assert.match(panel, /useEffect\(\(\) => \(\) => \{ if \(draft\.current !== null\) commitRef\.current\(capturedId, end, draft\.current\)/)
  assert.match(app, /onEndLabel: \(id: number, end: 'start' \| 'end', text: string\) => \{\s*const next = setConnectorEndLabel\(strokesRef\.current, id, end, text\)/)
})

test('commit by id only touches that connector', () => {
  const items = [conn({}, 1), conn({}, 2)]
  const next = el.setConnectorEndLabel(items, 1, 'start', '1')
  assert.equal(next[0].startLabel, '1')
  assert.equal('startLabel' in next[1], false)
  assert.equal(el.setConnectorEndLabel(items, 99, 'start', '1'), items)
})

test('end label inputs use 16px text so iPad Safari does not zoom on focus', async () => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.match(css, /\.end-labels input \{[^}]*font-size: 16px/)
})
