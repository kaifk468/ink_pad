import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const lab = await loadModule('connectorLabel.ts')
const doc = await loadModule('documentFormat.ts')
const exporter = await loadModule('sheetExport.ts')
const input = await loadModule('desktopInput.ts')
const app = await readAppSource()

const p = (x, y) => ({ x, y, pressure: 1 })
const conn = (extra = {}) => ({ kind: 'connector', id: 1, start: p(0, 100), end: p(200, 100), strokeColor: '#c00000', strokeWidth: 3, relationshipType: 'association', reversed: false, ...extra })
const measure = (line) => line.length * 10

test('layout: centred on the path midpoint, box wraps the text with padding', () => {
  const layout = lab.connectorLabelLayout(conn({ label: 'REST' }), measure)
  assert.deepEqual(layout.centre, { x: 100, y: 100 })
  assert.equal(layout.box.width, 40 + 2 * lab.CONNECTOR_LABEL_PADDING)
  assert.equal(layout.box.x + layout.box.width / 2, 100)
  assert.equal(layout.box.y + layout.box.height / 2, 100)
  assert.equal(layout.lineX[0], 80)
})

test('layout: multi-line labels centre each line; no label gives null', () => {
  const layout = lab.connectorLabelLayout(conn({ label: 'ab\nabcd' }), measure)
  assert.equal(layout.lines.length, 2)
  assert.equal(layout.lineX[0], 90)
  assert.equal(layout.lineX[1], 80)
  assert.ok(layout.baselines[1] > layout.baselines[0])
  assert.equal(lab.connectorLabelLayout(conn(), measure), null)
})

test('layout: elbow uses the routed path midpoint', () => {
  const routed = conn({ label: 'x', end: p(200, 0), routing: 'elbow', routedPath: [p(0, 100), p(100, 100), p(100, 0), p(200, 0)] })
  assert.equal(lab.connectorLabelLayout(routed, measure).centre.x, 100)
  assert.equal(lab.connectorLabelLayout(routed, measure).centre.y, 50)
})

test('cleanConnectorLabel trims trailing space only, caps, drops blanks', () => {
  assert.equal(lab.cleanConnectorLabel('  hi \n '), '  hi')
  assert.equal(lab.cleanConnectorLabel('   '), undefined)
  assert.equal(lab.cleanConnectorLabel(5), undefined)
  assert.equal(lab.cleanConnectorLabel('x'.repeat(900)).length, 500)
})

test('setConnectorLabel sets, removes on empty, and is a no-op when unchanged', () => {
  const items = [conn()]
  const set = lab.setConnectorLabel(items, 1, 'publishes')
  assert.equal(set[0].label, 'publishes')
  assert.equal(lab.setConnectorLabel(set, 1, 'publishes'), set)
  assert.equal('label' in lab.setConnectorLabel(set, 1, '  ')[0], false)
  assert.equal(lab.setConnectorLabel(items, 1, ''), items)
})

const file = (items) => JSON.stringify({ format: 'inkpad-document', version: 1, title: 't', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', sheet: { width: 1000, height: 800 }, items })

test('format: old connector re-saves identically; label round-trips; junk label dropped', () => {
  const first = doc.stringifyDocument(doc.parseDocument(file([conn()])).document)
  assert.equal(doc.stringifyDocument(doc.parseDocument(first).document), first)
  assert.equal(first.includes('label'), false)
  const withLabel = doc.stringifyDocument(doc.parseDocument(file([conn({ label: '1..*' })])).document)
  assert.equal(doc.parseDocument(withLabel).document.items.find((i) => i.kind === 'connector').label, '1..*')
  assert.equal(doc.stringifyDocument(doc.parseDocument(withLabel).document), withLabel)
  const junk = doc.stringifyDocument(doc.parseDocument(file([conn({ label: 7 })])).document)
  assert.equal(junk.includes('"label"'), false)
})

test('SVG export draws the label over a background pad', () => {
  const svg = exporter.buildSheetSvg([conn({ label: 'REST & co' })], { width: 400, height: 300, template: 'blank', backgroundColor: '#fff8e1' })
  assert.match(svg, /<rect [^>]*fill="#fff8e1"\/><text [^>]*fill="#c00000"[^>]*>REST &amp; co<\/text>/)
})

test('clicking the label selects the connector; Enter and double-click edit it', () => {
  const items = [conn({ label: 'REST' })]
  assert.equal(input.hitTarget(items, p(100, 112), 1)?.kind, 'connector')
  assert.equal(input.editTargetForSelection(items, new Set(['connector:1']), null)?.kind, 'connector')
  assert.equal(input.doubleClickTarget(items, p(100, 100), 1)?.kind, 'connector')
})

test('wiring: editor, panel button, renderer', () => {
  assert.match(app, /editConnectorLabel/)
  assert.match(app, /setConnectorLabel\(strokesRef\.current, editor\.connectorId, value\)/)
  assert.match(app, /onEditLabel/)
  assert.match(app, /drawConnectorLabel\(ctx, item\)/)
  assert.match(app, /Add label/)
})

test('label size: round-trips, default omitted, invalid dropped, clamped', () => {
  const rt = (extra) => doc.stringifyDocument(doc.parseDocument(file([conn({ label: 'x', ...extra })])).document)
  const big = rt({ labelFontSize: 32 })
  assert.equal(doc.parseDocument(big).document.items[0].labelFontSize, 32)
  assert.equal(doc.stringifyDocument(doc.parseDocument(big).document), big)
  assert.equal(rt({ labelFontSize: 18 }).includes('labelFontSize'), false)
  for (const bad of ['20', null, NaN, Infinity, {}]) assert.equal(rt({ labelFontSize: bad }).includes('labelFontSize'), false)
  assert.equal(doc.parseDocument(rt({ labelFontSize: 500 })).document.items[0].labelFontSize, 48)
  assert.equal(doc.parseDocument(rt({ labelFontSize: 2 })).document.items[0].labelFontSize, 10)
})

test('label size: layout scales, setter omits default, SVG uses it', () => {
  const small = lab.connectorLabelLayout(conn({ label: 'REST' }))
  const large = lab.connectorLabelLayout(conn({ label: 'REST', labelFontSize: 36 }))
  assert.equal(large.fontSize, 36)
  assert.ok(large.box.width > small.box.width && large.box.height > small.box.height)
  const items = [conn({ label: 'x' })]
  const set = lab.setConnectorLabelFontSize(items, 1, 24)
  assert.equal(set[0].labelFontSize, 24)
  assert.equal(lab.setConnectorLabelFontSize(set, 1, 24), set)
  assert.equal('labelFontSize' in lab.setConnectorLabelFontSize(set, 1, 18)[0], false)
  const svg = exporter.buildSheetSvg([conn({ label: 'REST', labelFontSize: 36 })], { width: 400, height: 300, template: 'blank', backgroundColor: '#fff' })
  assert.match(svg, /font-size="36"/)
})

test('label size: wired into the editor, font keys and panel', () => {
  assert.match(app, /fontSize: connectorLabelFontSize\(connector\)/)
  assert.match(app, /pickConnectorLabelSize\(size\)/)
  assert.match(app, /connectorLabelSize=\{/)
  assert.doesNotMatch(app, /CONNECTOR_LABEL_FONT_SIZE/)
})

test('removing a connector label drops its label size too; setting one keeps it', () => {
  const sized = [conn({ label: 'HTTP', labelFontSize: 30 })]
  assert.equal('labelFontSize' in lab.setConnectorLabel(sized, 1, '')[0], false)
  assert.equal('label' in lab.setConnectorLabel(sized, 1, '  ')[0], false)
  assert.equal(lab.setConnectorLabel(sized, 1, 'gRPC')[0].labelFontSize, 30)
})

test('connector handles use the real text measure by default, so the middle dot clears a large label', async () => {
  const handles = await loadModule('connectorHandles.ts')
  const src = (await import('node:fs')).readFileSync(new URL('../src/connectorHandles.ts', import.meta.url), 'utf8')
  assert.match(src, /connectorLabelLayout\(connector, measure \?\? getCachedTextMeasure\(connectorLabelFontSize\(connector\), DEFAULT_TEXT_FONT\)\)/)
  const wide = (line) => line.length * 20
  const c = conn({ end: p(1000, 100), label: 'a long label here', labelFontSize: 30 })
  const dot = handles.connectorHandlePositions(c, wide).middle
  const box = lab.connectorLabelLayout(c, wide).box
  assert.ok(dot.x >= box.x + box.width || dot.x <= box.x, 'dot is outside the label box')
  assert.deepEqual(handles.hitConnectorHandle(c, dot, 1, 'mouse', wide), 'middle')
})

test('desktop: double-click on an arrow (not a box) opens the connector label editor, and an open editor blocks single-key shortcuts', async () => {
  const { readFile } = await import('node:fs/promises')
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  // The double-click handler reuses editConnectorLabel (the panel's Add label handler) and undoes any routing toggle first.
  assert.match(app, /if \(target\.kind === 'connector'\) return editConnectorLabel\(target\.id\)/)
  assert.match(app, /onEditLabel: \(\) => \{ if \(selectedConnectorId !== null\) editConnectorLabel\(selectedConnectorId\) \}/)
  assert.match(app, /if \(target\.kind === 'connector' && before && before\.owner === historyRef\.current && !clickItemsUnchanged/)
  // An open text/label editor counts as an overlay, which blocks every canvas command (tool keys included).
  assert.match(app, /const overlayOpen = \(\): boolean => [^\n]*Boolean\(textEditor\) \|\| textEditorRef\.current !== null/)
})
