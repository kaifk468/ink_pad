import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import { loadModule } from './helpers/loadModule.mjs'

const outline = await loadModule('diagramOutline.ts')
const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')

const box = (id, x, y, extra = {}) => ({ kind: 'rectangle', id, x, y, width: 200, height: 100, strokeColor: '#000', strokeWidth: 3, ...extra })
const hld = (id, x, y, shape) => box(id, x, y, { inkBox: { top: y + 20, mid: y + 60, ink: [] }, hldShape: shape })
const label = (id, x, y, text) => ({ kind: 'text', id, x, y, width: 80, height: 24, text, fontSize: 18, color: '#000' })
const inside = (id, b, text) => label(id, b.x + 60, b.y + 38, text)
const connector = (id, from, to, extra = {}) => ({
  kind: 'connector', id, start: { x: from.x + 200, y: from.y + 50, pressure: 1 }, end: { x: to.x, y: to.y + 50, pressure: 1 },
  strokeColor: '#000', strokeWidth: 3, relationshipType: 'directed-association', reversed: false,
  ...(from.id ? { startAttachment: { rectangleId: from.id, offsetX: 200, offsetY: 50 } } : {}),
  ...(to.id ? { endAttachment: { rectangleId: to.id, offsetX: 0, offsetY: 50 } } : {}),
  ...extra,
})
const stroke = (id, a, b, extra = {}) => ({ kind: 'stroke', id, points: [{ ...a, pressure: 1 }, { ...b, pressure: 1 }], color: '#000', width: 3, erase: false, ...extra })
const pt = (x, y) => ({ x, y })

test('title heading, components with labels and kinds, in top-to-bottom, left-to-right order', () => {
  const lower = box(3, 0, 300)
  const right = hld(2, 400, 0, 'cache')
  const left = box(1, 0, 0)
  const md = outline.buildDiagramOutline('My system', [[lower, right, left, inside(10, left, 'API'), inside(11, right, 'Redis'), inside(12, lower, 'DB')]])
  assert.equal(md, '# My system\n\n## Components\n\n- API\n- Redis (cache)\n- DB\n')
})

test('unlabeled boxes name their kind; diamond, ellipse and HLD kinds are shown', () => {
  const md = outline.buildDiagramOutline('t', [[box(1, 0, 0), box(2, 300, 0, { diamond: true }), box(3, 600, 0, { ellipse: true }), hld(4, 900, 0, 'loadBalancer'), inside(10, box(2, 300, 0), 'Decide')]])
  assert.match(md, /- \(unlabeled rectangle\)\n- Decide \(diamond\)\n- \(unlabeled ellipse\)\n- \(unlabeled load balancer\)/)
})

test('a label belongs to the innermost box containing it', () => {
  const outer = box(1, 0, 0, { width: 600, height: 400 })
  const inner = box(2, 100, 100)
  const md = outline.buildDiagramOutline('t', [[outer, inner, inside(10, inner, 'Inner')]])
  assert.match(md, /- \(unlabeled rectangle\)\n- Inner\n/)
  assert.doesNotMatch(md, /Notes/)
})

test('several labels in one box are joined; whitespace is collapsed', () => {
  const b = box(1, 0, 0)
  const md = outline.buildDiagramOutline('  Big   title ', [[b, label(10, 20, 10, 'Order\n service'), label(11, 20, 50, 'v2')]])
  assert.match(md, /^# Big title\n/)
  assert.match(md, /- Order service v2\n/)
})

test('connections use box names, labels, direction and free ends', () => {
  const a = box(1, 0, 0)
  const b = hld(2, 400, 0, 'database')
  const items = [a, b, inside(10, a, 'Web'), inside(11, b, 'Orders'), connector(20, a, b, { label: ' reads  data ' }), connector(21, a, { x: 500, y: 500 }), connector(22, a, b, { relationshipType: 'association' }), connector(23, a, b, { reversed: true })]
  const md = outline.buildDiagramOutline('t', [items])
  assert.match(md, /- Web → Orders \(database\): reads data\n/)
  assert.match(md, /- Web → \(free end\)\n/)
  assert.match(md, /- Web — Orders \(database\)\n/)
  assert.match(md, /- Orders \(database\) → Web\n/)
})

test('inheritance and aggregation connectors note the relationship', () => {
  const a = box(1, 0, 0)
  const b = box(2, 400, 0)
  const md = outline.buildDiagramOutline('t', [[a, b, inside(10, a, 'Dog'), inside(11, b, 'Animal'), connector(20, a, b, { relationshipType: 'inheritance' }), connector(21, a, b, { relationshipType: 'composition' })]])
  assert.match(md, /- Dog → Animal \(inheritance\)/)
  assert.match(md, /- Dog → Animal \(composition\)|- Animal → Dog \(composition\)/)
})

test('arrow strokes: both heads give a double arrow, none a dash, loose lines are handwriting', () => {
  const a = box(1, 0, 0)
  const b = box(2, 400, 0)
  const items = [a, b, inside(10, a, 'A'), inside(11, b, 'B'),
    stroke(30, pt(100, 50), pt(500, 50), { shape: 'arrow', arrowheads: 'both' }),
    stroke(31, pt(100, 60), pt(500, 60), { shape: 'line' }),
    stroke(32, pt(100, 70), pt(500, 70), { shape: 'arrow' }),
    stroke(33, pt(100, 80), pt(500, 80), { shape: 'arrow', arrowheads: 'start' }),
    stroke(34, pt(1000, 1000), pt(1100, 1000), { shape: 'arrow' })]
  const md = outline.buildDiagramOutline('t', [items])
  assert.match(md, /- A ↔ B\n/)
  assert.match(md, /- A — B\n/)
  assert.match(md, /- A → B\n/)
  assert.match(md, /- B → A\n/)
  assert.match(md, /Handwriting: 1 stroke\n/)
})

test('free text outside boxes becomes notes, in order', () => {
  const md = outline.buildDiagramOutline('t', [[label(2, 0, 200, 'second'), label(1, 0, 0, 'first')]])
  assert.match(md, /## Notes\n\n- first\n- second\n/)
  assert.doesNotMatch(md, /Components/)
})

test('class boxes list name, attributes and methods as nested bullets and are connection names', () => {
  const cls = box(1, 0, 0, { classBox: { name: 'Order', attributes: 'id: int\n total: number ', methods: 'pay()' } })
  const empty = box(2, 400, 0, { classBox: { name: '', attributes: '', methods: '' } })
  const md = outline.buildDiagramOutline('t', [[cls, empty, connector(5, cls, empty)]])
  assert.match(md, /## Classes\n\n- \*\*Order\*\*\n  - Attributes\n    - id: int\n    - total: number\n  - Methods\n    - pay\(\)\n- \*\*\(unnamed class\)\*\*\n/)
  assert.match(md, /- Order → \(unnamed class\)\n/)
  assert.doesNotMatch(md, /## Components/)
})

test('code blocks are fenced with their language; plain text has none; backticks lengthen the fence', () => {
  const md = outline.buildDiagramOutline('t', [[
    { kind: 'code', id: 1, x: 0, y: 0, width: 300, height: 100, text: 'print(1)\n', language: 'python' },
    { kind: 'code', id: 2, x: 0, y: 200, width: 300, height: 100, text: 'a ``` b', language: 'plaintext' },
  ]])
  assert.match(md, /## Code\n\n```python\nprint\(1\)\n```\n\n````\na ``` b\n````\n/)
})

test('handwriting is a count; erase strokes are ignored; ink inside class boxes is not counted', () => {
  const items = [stroke(1, pt(0, 0), pt(5, 5)), stroke(2, pt(0, 0), pt(5, 5)), stroke(3, pt(0, 0), pt(5, 5), { erase: true }), hld(4, 100, 100, 'queue')]
  items[3].inkBox.ink = [stroke(9, pt(110, 130), pt(120, 130))]
  const md = outline.buildDiagramOutline('t', [items])
  assert.match(md, /Handwriting: 2 strokes\n$/)
})

test('pages: headings only with several pages, empty pages skipped, numbers kept', () => {
  const page1 = [label(1, 0, 0, 'one')]
  const page3 = [label(2, 0, 0, 'three')]
  const many = outline.buildDiagramOutline('t', [page1, [], page3])
  assert.equal(many, '# t\n\n## Page 1\n\n### Notes\n\n- one\n\n## Page 3\n\n### Notes\n\n- three\n')
  const one = outline.buildDiagramOutline('t', [page1])
  assert.equal(one, '# t\n\n## Notes\n\n- one\n')
  assert.doesNotMatch(one, /Page/)
})

test('empty diagram and missing title are handled; output is deterministic and does not change the input', () => {
  assert.equal(outline.buildDiagramOutline('', [[], []]), '# Untitled diagram\n\n_(empty diagram)_\n')
  const items = [box(2, 400, 0), box(1, 0, 0), inside(10, box(1, 0, 0), 'x')]
  const before = JSON.stringify(items)
  const first = outline.buildDiagramOutline('t', [items])
  assert.equal(outline.buildDiagramOutline('t', [[...items].reverse()]), first)
  assert.equal(JSON.stringify(items), before)
  assert.ok(first.endsWith('\n') && !first.endsWith('\n\n'))
})

test('file name comes from the title', () => {
  assert.equal(outline.outlineFileName('My / system: v2?'), 'My  system v2.md')
  assert.equal(outline.outlineFileName('   '), 'diagram.md')
  assert.equal(outline.outlineFileName('..hidden'), 'hidden.md')
})

test('wiring: file panel buttons and palette entries', async () => {
  const panel = await read('FilePanel.tsx')
  assert.match(panel, /Copy as text outline/)
  assert.match(panel, /Download outline \(\.md\)/)
  assert.match(panel, /onCopyOutline/)
  assert.match(panel, /onDownloadOutline/)
  const app = await read('App.tsx')
  assert.match(app, /buildDiagramOutline\(/)
  assert.match(app, /outlineFileName\(/)
  assert.match(app, /navigator\.clipboard\.writeText\(/)
  assert.match(app, /id: 'export:outline-copy'/)
  assert.match(app, /id: 'export:outline-download'/)
  assert.match(app, /onCopyOutline=\{/)
  assert.match(app, /onDownloadOutline=\{/)
})
