import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { buildMermaid } = await loadModule('mermaidExport.ts')

const box = (id, x, y, extra = {}) => ({ kind: 'rectangle', id, x, y, width: 200, height: 100, strokeColor: '#000', strokeWidth: 3, ...extra })
const hld = (id, x, y, shape) => box(id, x, y, { inkBox: { top: y + 20, mid: y + 60, ink: [] }, hldShape: shape })
const label = (id, x, y, text) => ({ kind: 'text', id, x, y, width: 80, height: 24, text, fontSize: 18, color: '#000' })
const inside = (id, b, text, dy = 38) => label(id, b.x + 60, b.y + dy, text)
const link = (id, from, to, extra = {}) => ({
  kind: 'connector', id, start: { x: 0, y: 0, pressure: 1 }, end: { x: 1, y: 1, pressure: 1 }, strokeColor: '#000', strokeWidth: 3,
  relationshipType: 'directed-association', reversed: false,
  ...(from ? { startAttachment: { rectangleId: from, offsetX: 0, offsetY: 0 } } : {}),
  ...(to ? { endAttachment: { rectangleId: to, offsetX: 0, offsetY: 0 } } : {}),
  ...extra,
})

test('empty page is just the header', () => {
  assert.deepEqual(buildMermaid([]), { text: 'flowchart LR\n', boxes: 0, links: 0, skipped: false, skippedLinks: 0 })
})

test('shapes, labels, fallback names and top-to-bottom order', () => {
  const a = box(1, 0, 0), d = box(2, 300, 0, { diamond: true }), e = box(3, 0, 200, { ellipse: true })
  const db = hld(4, 300, 200, 'database'), svc = hld(5, 0, 400, 'service'), cache = hld(6, 300, 400, 'cache'), plain = box(7, 0, 600)
  const r = buildMermaid([plain, cache, svc, db, e, d, a, inside(10, a, 'API'), inside(11, d, 'ok?'), inside(12, e, 'Start'), inside(13, db, 'Users'), inside(14, svc, 'Auth')])
  assert.equal(r.text, [
    'flowchart LR', '  n1["API"]', '  n2{"ok?"}', '  n3(("Start"))', '  n4[("Users")]', '  n5[["Auth"]]', '  n6["cache"]', '  n7["Box"]', '',
  ].join('\n'))
  assert.equal(r.boxes, 7)
  assert.equal(r.skipped, false)
})

test('empty diamond and database use their kind name', () => {
  const r = buildMermaid([box(1, 0, 0, { diamond: true }), hld(2, 300, 0, 'database')])
  assert.match(r.text, /n1\{"diamond"\}/)
  assert.match(r.text, /n2\[\("database"\)\]/)
})

test('special characters are escaped; several labels join with <br/>', () => {
  const a = box(1, 0, 0)
  const r = buildMermaid([a, inside(2, a, 'say "hi" [x] {y} (z) a|b <c> #1', 20), inside(3, a, 'second', 60)])
  assert.equal(r.text, 'flowchart LR\n  n1["say #quot;hi#quot; [x] {y} (z) a#124;b #lt;c#gt; #35;1<br/>second"]\n')
})

test('connector directions: forward, reversed, plain, dashed, labelled', () => {
  const a = box(1, 0, 0), b = box(2, 400, 0)
  const r = buildMermaid([a, b,
    link(10, 1, 2),
    link(11, 1, 2, { reversed: true }),
    link(12, 1, 2, { relationshipType: 'association' }),
    link(13, 1, 2, { dash: 'dashed' }),
    link(14, 1, 2, { relationshipType: 'dependency' }),
    link(15, 1, 2, { relationshipType: 'association', dash: 'dotted' }),
    link(16, 1, 2, { relationshipType: 'dependency', dash: 'solid' }),
    link(17, 1, 2, { label: 'calls "x" | y' }),
    link(18, 1, 2, { relationshipType: 'inheritance', reversed: true }),
    link(19, 1, 2, { relationshipType: 'composition' }),
  ])
  assert.deepEqual(r.text.split('\n').slice(3, 13), [
    '  n1 --> n2', '  n2 --> n1', '  n1 --- n2', '  n1 -.-> n2', '  n1 -.-> n2', '  n1 -.- n2', '  n1 --> n2',
    '  n1 -->|"calls #quot;x#quot; #124; y"| n2', '  n2 --> n1', '  n2 --> n1',
  ])
  assert.equal(r.links, 10)
})

test('connectors with a free end or an unexported end are skipped and counted', () => {
  const a = box(1, 0, 0), b = box(2, 400, 0), cls = box(3, 0, 300, { classBox: { name: 'C', attributes: '', methods: '' } })
  const r = buildMermaid([a, b, cls, link(10, 1, 2), link(11, 1, 0), link(12, 0, 2), link(13, 1, 3)])
  assert.equal(r.links, 1)
  assert.equal(r.skippedLinks, 3)
  assert.equal(r.boxes, 2)
  assert.equal(r.skipped, true) // the class box
})

test('skipped flag: free text, ink and code; text inside a box does not count', () => {
  const a = box(1, 0, 0)
  assert.equal(buildMermaid([a, inside(2, a, 'x')]).skipped, false)
  assert.equal(buildMermaid([a, label(2, 900, 900, 'note')]).skipped, true)
  assert.equal(buildMermaid([a, { kind: 'stroke', id: 3, points: [{ x: 0, y: 0, pressure: 1 }], color: '#000', width: 3, erase: false }]).skipped, true)
  assert.equal(buildMermaid([a, { kind: 'stroke', id: 3, points: [], color: '#000', width: 3, erase: true }]).skipped, false)
  assert.equal(buildMermaid([a, { kind: 'code', id: 4, x: 0, y: 500, width: 100, height: 100, text: 'x', language: 'js' }]).skipped, true)
})

test('wiring: file panel button and command palette entry', async () => {
  const app = await readAppSource()
  assert.match(app, /buildMermaid\(/)
  assert.match(app, /id: 'export:mermaid-copy', label: 'Copy as Mermaid'/)
  assert.match(app, /onCopyMermaid=\{copyMermaid\}/)
  assert.match(app, /as Mermaid\$\{result\.skipped \? '; text and ink skipped'/)
  const panel = await readFile(new URL('../src/FilePanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /onClick=\{props\.onCopyMermaid\}>Copy as Mermaid</)
})
