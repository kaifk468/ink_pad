import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { buildMermaid, classIdentifier } = await loadModule('mermaidExport.ts')
const { addBoundary } = await loadModule('boundary.ts')
const { parseMermaid } = await loadModule('mermaidImport.ts')

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
  assert.deepEqual(buildMermaid([]), { text: 'flowchart LR\n', kind: 'flowchart', boxes: 0, links: 0, skipped: false, skippedLinks: 0 })
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

const workspace = { x: 0, y: 0, width: 3000, height: 3000 }
const small = (id, x, y, extra = {}) => box(id, x, y, { width: 100, height: 60, ...extra })
const tag = (id, b, text) => label(id, b.x + 10, b.y + 18, text)
const withBoundary = (items, keys, rectId, textId, text) => {
  const r = addBoundary(items, new Set(keys), { rectangle: rectId, text: textId }, workspace)
  return { items: r.items.map((item) => (item.id === textId && item.kind === 'text' ? { ...item, text } : item)), rect: r.rectangle }
}

test('boundary becomes a subgraph with its label as the title; the label is not a node or skipped content', () => {
  const a = small(1, 200, 200), b = small(2, 400, 200), outside = small(3, 1200, 200)
  const base = [a, b, outside, tag(20, a, 'API'), tag(21, b, 'DB'), tag(22, outside, 'CDN'), link(30, 1, 2), link(31, 2, 3)]
  const { items } = withBoundary(base, ['rectangle:1', 'rectangle:2', 'text:20', 'text:21'], 50, 60, 'VPC "main"')
  const r = buildMermaid(items)
  assert.equal(r.kind, 'flowchart')
  assert.equal(r.text, 'flowchart LR\n  n3["CDN"]\n  subgraph g50 ["VPC #quot;main#quot;"]\n    n1["API"]\n    n2["DB"]\n  end\n  n1 --> n2\n  n2 --> n3\n')
  assert.equal(r.boxes, 3)
  assert.equal(r.links, 2)
  assert.equal(r.skipped, false)
  assert.equal(r.skippedLinks, 0)
})

test('nested boundaries nest subgraphs; each keeps its own label', () => {
  const a = small(1, 300, 300), b = small(2, 300, 600)
  const inner = withBoundary([a, b, tag(20, a, 'A'), tag(21, b, 'B')], ['rectangle:1', 'text:20'], 50, 60, 'Inner')
  const outer = withBoundary(inner.items, ['rectangle:1', 'rectangle:2', 'text:20', 'text:21', 'rectangle:50', 'text:60'], 51, 61, 'Outer')
  const r = buildMermaid(outer.items)
  assert.equal(r.text, [
    'flowchart LR', '  subgraph g51 ["Outer"]', '    n2["B"]', '    subgraph g50 ["Inner"]', '      n1["A"]', '    end', '  end', '',
  ].join('\n'))
  assert.equal(r.skipped, false)
  assert.equal(r.boxes, 2)
})

test('a box only partly inside a boundary is not a member; an unlabelled boundary has no title', () => {
  const a = small(1, 200, 200), b = small(2, 400, 200)
  const container = box(9, 100, 100, { width: 400, height: 300, dash: 'dashed' })
  const straddle = small(3, 450, 150, { width: 200 })
  const r = buildMermaid([container, a, b, straddle, tag(20, a, 'A'), tag(21, b, 'B')])
  assert.equal(r.text, 'flowchart LR\n  n3["Box"]\n  subgraph g9\n    n1["A"]\n    n2["B"]\n  end\n')
  assert.equal(r.boxes, 3)
})

test('a box holding only its own text is still a node, not a subgraph', () => {
  const a = box(1, 0, 0)
  const r = buildMermaid([a, inside(2, a, 'one', 20), inside(3, a, 'two', 60)])
  assert.doesNotMatch(r.text, /subgraph/)
  assert.equal(r.boxes, 1)
})

test('flowchart with subgraph text still imports: nodes and edges survive (subgraph lines are skipped by the importer)', () => {
  const a = small(1, 200, 200), b = small(2, 400, 200)
  const { items } = withBoundary([a, b, tag(20, a, 'API'), tag(21, b, 'DB'), link(30, 1, 2, { label: 'sql' })], ['rectangle:1', 'rectangle:2', 'text:20', 'text:21'], 50, 60, 'VPC')
  const parsed = parseMermaid(buildMermaid(items).text)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.nodes.length ?? parsed.nodes.size, 2)
  assert.equal(parsed.edges.length, 1)
})

const cls = (id, x, y, name, attributes = '', methods = '') => box(id, x, y, { classBox: { name, attributes, methods } })

test('class-only page becomes a classDiagram with members', () => {
  const r = buildMermaid([cls(1, 0, 0, 'Order', '  +id: int\n\n -total: Money ', '+pay(): void'), cls(2, 400, 0, 'Order Item'), cls(3, 800, 0, 'Repo<T>'), cls(4, 0, 300, 'Order')])
  assert.equal(r.kind, 'class')
  assert.equal(r.text, [
    'classDiagram', '  class Order {', '    +id: int', '    -total: Money', '    +pay(): void', '  }',
    '  class Order_Item["Order Item"] {', '  }', '  class Repo~T~ {', '  }', '  class Order_2["Order"] {', '  }', '',
  ].join('\n'))
  assert.equal(r.boxes, 4)
  assert.equal(r.skipped, false)
})

test('class identifiers: spaces, generics, empty and duplicate names', () => {
  const taken = new Set()
  assert.deepEqual(['Map<K, V>', 'a b', '', '  ', '1x', 'a b'].map((n) => classIdentifier(n, taken)), ['Map~K_V~', 'a_b', 'Class', 'Class_2', 'C_1x', 'a_b_2'])
})

test('class relationships: every type, both directions, labels', () => {
  const A = cls(1, 0, 0, 'A'), B = cls(2, 400, 0, 'B')
  const rel = (id, relationshipType, reversed = false, extra = {}) => link(id, 1, 2, { relationshipType, reversed, ...extra })
  // The symbol is drawn at the end named by getConnectorRenderSpec: arrow-style types at the end (reversed: at the start), diamonds at the start (reversed: at the end).
  const lines = (...connectors) => buildMermaid([A, B, ...connectors]).text.split('\n').filter((line) => /--|\.\./.test(line))
  assert.deepEqual(lines(rel(10, 'inheritance')), ['  B <|-- A'])
  assert.deepEqual(lines(rel(10, 'inheritance', true)), ['  A <|-- B'])
  assert.deepEqual(lines(rel(10, 'realization')), ['  B <|.. A'])
  assert.deepEqual(lines(rel(10, 'realization', true)), ['  A <|.. B'])
  assert.deepEqual(lines(rel(10, 'composition')), ['  A *-- B'])
  assert.deepEqual(lines(rel(10, 'composition', true)), ['  B *-- A'])
  assert.deepEqual(lines(rel(10, 'aggregation')), ['  A o-- B'])
  assert.deepEqual(lines(rel(10, 'aggregation', true)), ['  B o-- A'])
  assert.deepEqual(lines(rel(10, 'directed-association')), ['  A --> B'])
  assert.deepEqual(lines(rel(10, 'directed-association', true)), ['  B --> A'])
  assert.deepEqual(lines(rel(10, 'dependency')), ['  A ..> B'])
  assert.deepEqual(lines(rel(10, 'dependency', true)), ['  B ..> A'])
  assert.deepEqual(lines(rel(10, 'association'), rel(11, 'association', true)), ['  A -- B', '  A -- B'])
  assert.deepEqual(lines(rel(10, 'directed-association', false, { label: 'uses "x"' })), ['  A --> B : uses #quot;x#quot;'])
  const r = buildMermaid([A, B, rel(10, 'inheritance'), link(11, 1, 0)])
  assert.equal(r.links, 1)
  assert.equal(r.skippedLinks, 1)
})

test('class page: free text is reported as skipped; a mixed page stays a flowchart', () => {
  assert.equal(buildMermaid([cls(1, 0, 0, 'A'), label(2, 900, 900, 'note')]).skipped, true)
  const mixed = buildMermaid([cls(1, 0, 0, 'A'), box(2, 400, 0), link(10, 1, 2)])
  assert.equal(mixed.kind, 'flowchart')
  assert.equal(mixed.skipped, true)
})

test('wiring: the toast says classes for class output', async () => {
  const app = await readAppSource()
  assert.match(app, /result\.kind === 'class' \? \(result\.boxes === 1 \? 'class' : 'classes'\)/)
  assert.match(app, /Copied \$\{result\.boxes\} \$\{noun\} and/)
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

test('a two-way arrow is written as <--> (<-.-> when dashed); one-way and other types are unchanged', () => {
  const boxes = [box(1, 0, 0, { width: 100, height: 60 }), box(2, 300, 0, { width: 100, height: 60 })]
  const text = (extra, type = 'directed-association') => buildMermaid([...boxes, label(5, 20, 20, 'A'), label(6, 320, 20, 'B'), link(3, 1, 2, { relationshipType: type, ...extra })]).text
  assert.match(text({ twoWay: true }), /n1 <--> n2/)
  assert.match(text({ twoWay: true, reversed: true }), /n1 <--> n2/)
  assert.match(text({ twoWay: true, dash: 'dashed' }), /n1 <-\.-> n2/)
  assert.match(text({ twoWay: true, label: 'sync' }), /n1 <-->\|"sync"\| n2/)
  assert.match(text({}), /n1 --> n2/)
  assert.doesNotMatch(text({ twoWay: true }, 'dependency'), /<-->/)
})

test('two-way arrows round trip through Mermaid text', () => {
  const boxes = [box(1, 0, 0, { width: 100, height: 60 }), box(2, 300, 0, { width: 100, height: 60 })]
  const { text } = buildMermaid([...boxes, label(5, 20, 20, 'A'), label(6, 320, 20, 'B'), link(3, 1, 2, { twoWay: true })])
  const g = parseMermaid(text)
  assert.equal(g.edges.length, 1)
  assert.equal(g.edges[0].twoWay, true)
  assert.equal(g.edges[0].arrow, true)
})
