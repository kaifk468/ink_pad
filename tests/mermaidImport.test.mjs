import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { parseMermaid, buildMermaidItems, isMermaidText, mermaidInsertMessage } = await loadModule('mermaidImport.ts')
const doc = await loadModule('documentFormat.ts')
const app = await readAppSource()

const ok = (text) => {
  const result = parseMermaid(text)
  assert.equal(result.ok, true, JSON.stringify(result))
  return result
}
const node = (graph, id) => graph.nodes.find((n) => n.id === id)

test('node shapes', () => {
  const g = ok('flowchart TD\nA[Rect]\nB(Round)\nC([Stadium])\nD((Circle))\nE{Choice}\nF[(Store)]\nG[[Svc]]\nH')
  assert.deepEqual(g.nodes.map((n) => [n.id, n.text, n.shape]), [
    ['A', 'Rect', 'rectangle'], ['B', 'Round', 'rounded'], ['C', 'Stadium', 'rectangle'], ['D', 'Circle', 'ellipse'],
    ['E', 'Choice', 'diamond'], ['F', 'Store', 'database'], ['G', 'Svc', 'service'], ['H', 'H', 'rectangle'],
  ])
})

test('quoted text and <br> become text and newlines', () => {
  const g = ok('graph TD\nA["x y (z)"] --> B[one<br>two<br/>three]')
  assert.equal(node(g, 'A').text, 'x y (z)')
  assert.equal(node(g, 'B').text, 'one\ntwo\nthree')
})

test('directions and default', () => {
  assert.equal(ok('flowchart LR\nA-->B').direction, 'LR')
  assert.equal(ok('flowchart RL\nA-->B').direction, 'RL')
  assert.equal(ok('graph TB\nA-->B').direction, 'TD')
  assert.equal(ok('graph BT\nA-->B').direction, 'BT')
  assert.equal(ok('graph\nA-->B').direction, 'TD')
  assert.equal(ok('flowchart TD; A-->B').edges.length, 1)
})

test('edge kinds', () => {
  const g = ok('graph TD\nA-->B\nB---C\nC-.->D\nD-.-E\nE==>F\nF --o G\nG --x H')
  assert.deepEqual(g.edges.map((e) => [e.from, e.to, e.arrow, e.dashed]), [
    ['A', 'B', true, false], ['B', 'C', false, false], ['C', 'D', true, true], ['D', 'E', false, true],
    ['E', 'F', true, false], ['F', 'G', true, false], ['G', 'H', true, false],
  ])
})

test('chains, ampersand groups and semicolons', () => {
  const g = ok('graph LR\nA --> B --> C\nD & E --> F; F --> A')
  assert.deepEqual(g.edges.map((e) => `${e.from}${e.to}`), ['AB', 'BC', 'DF', 'EF', 'FA'])
})

test('edge labels in both spellings', () => {
  const g = ok('graph TD\nA -->|yes| B\nB -- go on --> C\nC -. maybe .-> D\nD == big ==> E\nE -->|"quoted l"| F')
  assert.deepEqual(g.edges.map((e) => e.label), ['yes', 'go on', 'maybe', 'big', 'quoted l'])
  assert.equal(g.edges[3].arrow, true)
  assert.equal(g.edges[2].dashed, true)
})

test('comments, style lines are skipped and the unparsed ones counted', () => {
  const g = ok('%% a comment\nflowchart TD\nsubgraph S\nA-->B\nend\nclassDef x fill:#f00\nclass A x\nstyle B fill:#fff\nlinkStyle 0 stroke:red\nclick A callback\n%% another\nthis is not mermaid ((')
  assert.equal(g.nodes.length, 2)
  assert.equal(g.edges.length, 1)
  assert.equal(g.ignoredLines, 6) // subgraph / end are now read, not ignored
  assert.equal(ok('graph TD\nA-->B').ignoredLines, 0)
})

test('later definition gives a bare node its text; self links are dropped and counted', () => {
  const g = ok('graph TD\nA --> B\nA[Start]\nB --> B')
  assert.equal(node(g, 'A').text, 'Start')
  assert.equal(g.edges.length, 1)
  assert.equal(g.ignoredLines, 1)
})

test('errors: no nodes, empty, too many', () => {
  for (const text of ['', 'flowchart TD', '%% only comment', 'hello world is not a graph ((']) {
    const r = parseMermaid(text)
    assert.equal(r.ok, false, text)
    assert.ok(r.error.length > 10)
  }
  const many = 'graph TD\n' + Array.from({ length: 200 }, (_, i) => `N${i}`).join('\n')
  assert.equal(parseMermaid(many).ok, false)
})

test('isMermaidText looks at the first real line only', () => {
  assert.equal(isMermaidText('%% hi\n\nflowchart LR\nA-->B'), true)
  assert.equal(isMermaidText('graph TD'), true)
  assert.equal(isMermaidText('Graph theory notes\ngraph TD'), false)
  assert.equal(isMermaidText('hello'), false)
})

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

test('built items: boxes, centred labels, attached connectors, no overlaps', () => {
  const g = ok('flowchart LR\nA[Client] --> B{Check}\nB -->|ok| C[(Orders DB)]\nB -.-> D((Log))\nC --- E[[Billing service]]\nF[Lonely box with a long label here]')
  const built = buildMermaidItems(g)
  assert.equal(built.boxes, 6)
  assert.equal(built.links, 4)
  const boxes = built.items.filter((i) => i.kind === 'rectangle')
  const texts = built.items.filter((i) => i.kind === 'text')
  const connectors = built.items.filter((i) => i.kind === 'connector')
  assert.equal(boxes.length, 6)
  assert.equal(texts.length, 6)
  for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) assert.equal(overlaps(boxes[i], boxes[j]), false, `${i} overlaps ${j}`)
  for (const box of boxes) { assert.ok((box.width >= 140 && box.height >= 70) || box.hldShape); assert.ok(box.x >= 0 && box.y >= 0) }
  for (const t of texts) { assert.equal(t.align, 'center'); assert.ok(boxes.some((b) => t.x >= b.x && t.y >= b.y && t.x + t.width <= b.x + b.width && t.y + t.height <= b.y + b.height), t.text) }
  const [a, b, c, d, e] = ['A', 'B', 'C', 'D', 'E'].map((id) => boxes[g.nodes.findIndex((n) => n.id === id)])
  assert.equal(b.diamond, true)
  assert.equal(c.hldShape, 'database')
  assert.equal(d.ellipse, true)
  assert.equal(e.hldShape, 'service')
  const ends = connectors.map((k) => [k.startAttachment.rectangleId, k.endAttachment.rectangleId])
  assert.deepEqual(ends, [[a.id, b.id], [b.id, c.id], [b.id, d.id], [c.id, e.id]])
  assert.equal(connectors[0].relationshipType, 'directed-association')
  assert.equal(connectors[1].label, 'ok')
  assert.equal(connectors[2].dash, 'dashed')
  assert.equal(connectors[3].relationshipType, 'association')
  // left to right: each target is right of its source
  assert.ok(b.x > a.x + a.width && c.x > b.x + b.width)
})

test('direction decides which way the links flow', () => {
  const rects = (dir) => buildMermaidItems(ok(`flowchart ${dir}\nA --> B --> C`)).items.filter((i) => i.kind === 'rectangle')
  const [a, , c] = rects('TD'); assert.ok(c.y > a.y)
  const [a2, , c2] = rects('BT'); assert.ok(c2.y < a2.y)
  const [a3, , c3] = rects('LR'); assert.ok(c3.x > a3.x)
  const [a4, , c4] = rects('RL'); assert.ok(c4.x < a4.x)
})

test('built items survive saving and loading unchanged', () => {
  const built = buildMermaidItems(ok('flowchart TD\nA[Start] --> B{Ok?}\nB -->|no| C[(DB)]\nB --> D[[API]]\nD -.-> E((End))'))
  const saved = doc.createDocument({ template: 'blank', background: 'white', items: built.items })
  const parsed = doc.parseDocument(doc.stringifyDocument(saved))
  const items = (parsed.document ?? parsed).items
  assert.equal(items.length, built.items.length)
  assert.deepEqual(items.map((i) => i.kind), built.items.map((i) => i.kind))
  assert.equal(items.filter((i) => i.kind === 'connector' && i.startAttachment && i.endAttachment).length, 4)
  assert.equal(items.filter((i) => i.kind === 'connector' && i.label === 'no').length, 1)
})

test('toast message', () => {
  assert.equal(mermaidInsertMessage(3, 2, 0), 'Inserted 3 boxes and 2 links')
  assert.equal(mermaidInsertMessage(1, 1, 2), 'Inserted 1 box and 1 link (2 lines ignored)')
  assert.equal(mermaidInsertMessage(2, 1, 1), 'Inserted 2 boxes and 1 link (1 line ignored)')
})

test('wiring: dialog, More menu, palette, template chooser', () => {
  assert.match(app, /<MermaidDialog onInsert=\{importMermaid\}/)
  assert.match(app, /id: 'mermaid:insert', label: 'Insert from Mermaid…'/)
  assert.match(app, /onMermaid=\{\(\) => setMermaidOpen\(true\)\}/)
  assert.match(app, /Insert from Mermaid…<\/button>/)
  assert.match(app, /<span>Insert from Mermaid…<\/span>/)
  assert.match(app, /navigator\.clipboard\?\.readText/)
  assert.match(app, /aria-label="Mermaid text"/)
  assert.match(app, /key !== 'Escape'/)
  assert.match(app, /buildMermaidDiagram\(text\)/)
  assert.match(app, /showToast\(mermaidInsertMessage\(/)
})

test('wiring: Desktop paste of system text', () => {
  assert.match(app, /window\.addEventListener\('paste', onPaste\)/)
  assert.match(app, /clipboardData\?\.getData\('text\/plain'\)/)
  // Desktop Ctrl+V is left unhandled on keydown so the paste event fires and decides between system text and the in-app items
  assert.match(app, /case 'paste':[\s\S]{0,360}inputModeRef\.current === 'desktop'\) return false/)
  assert.match(app, /isTypingTarget\(target\?\.tagName \?\? 'BODY', Boolean\(target\?\.isContentEditable\)\)\) return/)
  assert.match(app, /isMermaidText\(mermaidText\)/)
  assert.match(app, /\.slice\(0, 2000\)/)
  // the in-app clipboard path is unchanged
  assert.match(app, /const pasteWithToast = \(at\?: Point \| null\): boolean => \{/)
})

const { buildMermaid } = await loadModule('mermaidExport.ts')
const exportSource = await readFile(new URL('../src/mermaidExport.ts', import.meta.url), 'utf8')

test('inline-label links with no space before the target keep their arrow', () => {
  for (const [text, arrow, dashed] of [['A-- text -->B', true, false], ['A-- text ---B', false, false], ['A== text ==>B', true, false], ['A-. text .->B', true, true], ['A-- text --> B', true, false], ['A -. text .-> B', true, true], ['A == text ==> B', true, false], ['A -- text --o B', true, false]]) {
    const g = ok(`graph TD\n${text}`)
    assert.equal(g.edges.length, 1, text)
    assert.deepEqual([g.edges[0].from, g.edges[0].to, g.edges[0].label, g.edges[0].arrow, g.edges[0].dashed], ['A', 'B', 'text', arrow, dashed], text)
  }
})

test('keywords are case-sensitive: End / Style1 nodes are not skipped, real keywords still are', () => {
  const g = ok('graph TD\nEnd[Done] --> X\nEnd --> Y\nStyle1 --> Z\nsubgraph S\nA --> B\nend\nclass A red\nstyle A fill:#f00\nsubgraphX --> Q')
  assert.deepEqual(g.nodes.map((n) => n.id), ['End', 'X', 'Y', 'Style1', 'Z', 'A', 'B', 'subgraphX', 'Q'])
  assert.equal(g.ignoredLines, 2) // subgraph / end are now read
  assert.equal(node(g, 'End').text, 'Done')
})

test('Unicode spaces act as plain spaces (no duplicate nodes)', () => {
  const g = ok('graph TD\nA --> B\nA　--> C​')
  assert.deepEqual(g.nodes.map((n) => n.id), ['A', 'B', 'C'])
  assert.equal(g.edges.length, 2)
})

test('Mermaid entity codes in labels are decoded', () => {
  const g = ok('graph TD\nA["say #quot;hi#quot; #35;1 #lt;b#gt; x#amp;y #9731;"] -->|"a#124;b"| B')
  assert.equal(node(g, 'A').text, 'say "hi" #1 <b> x&y ☃')
  assert.equal(g.edges[0].label, 'a|b')
  assert.equal(ok('graph TD\nA["#lt;br/#gt;"]').nodes[0].text, '<br/>')
})

test('Copy as Mermaid output round-trips through the importer', () => {
  const box = (id, x, y, extra = {}) => ({ kind: 'rectangle', id, x, y, width: 200, height: 100, strokeColor: '#000', strokeWidth: 3, ...extra })
  const hldBox = (id, x, y, shape) => box(id, x, y, { inkBox: { top: y + 20, mid: y + 60, ink: [] }, hldShape: shape })
  const label = (id, b, text) => ({ kind: 'text', id, x: b.x + 60, y: b.y + 38, width: 80, height: 24, text, fontSize: 18, color: '#000' })
  const link = (id, from, to, extra = {}) => ({ kind: 'connector', id, start: { x: 0, y: 0, pressure: 1 }, end: { x: 1, y: 1, pressure: 1 }, strokeColor: '#000', strokeWidth: 3, relationshipType: 'directed-association', reversed: false, startAttachment: { rectangleId: from, offsetX: 0, offsetY: 0 }, endAttachment: { rectangleId: to, offsetX: 0, offsetY: 0 }, ...extra })
  const a = box(1, 0, 0), d = box(2, 300, 0, { diamond: true }), e = box(3, 0, 200, { ellipse: true }), db = hldBox(4, 300, 200, 'database'), svc = hldBox(5, 600, 0, 'service')
  const items = [a, d, e, db, svc, label(10, a, 'say "hi" [x] {y} #1 <c>'), label(11, d, 'ok?'), label(12, e, 'Start'), label(13, db, 'Users'), label(14, svc, 'Auth'),
    link(20, 1, 2, { label: 'a|b "q"' }), link(21, 2, 4, { dash: 'dashed' }), link(22, 3, 1, { relationshipType: 'association' }), link(23, 4, 5)]
  const exported = buildMermaid(items)
  const g = ok(exported.text)
  assert.deepEqual(g.nodes.map((n) => [n.text, n.shape]).sort(), [['say "hi" [x] {y} #1 <c>', 'rectangle'], ['ok?', 'diamond'], ['Start', 'ellipse'], ['Users', 'database'], ['Auth', 'service']].sort())
  assert.equal(g.edges.length, exported.links)
  assert.equal(g.edges.find((edge) => edge.label)?.label, 'a|b "q"')
  assert.equal(g.ignoredLines, 0)
})

test('both-ended links: <-->, <-.-> and <==> are two-way arrows, x--x and o--o plain lines', () => {
  for (const [text, dashed] of [['A <--> B', false], ['A <-.-> B', true], ['A <==> B', false], ['A<-->B', false]]) {
    const g = ok(`graph TD\n${text}`)
    assert.equal(g.edges.length, 1, text)
    assert.deepEqual([g.edges[0].from, g.edges[0].to, g.edges[0].arrow, g.edges[0].dashed, g.edges[0].twoWay], ['A', 'B', true, dashed, true], text)
    const connector = buildMermaidItems(g).items.find((i) => i.kind === 'connector')
    assert.equal(connector.relationshipType, 'directed-association', text)
    assert.equal(connector.twoWay, true, text)
    assert.equal(connector.dash === 'dashed', dashed, text)
  }
  for (const text of ['A x--x B', 'A o--o B', 'A --> B']) assert.equal('twoWay' in ok(`graph TD\n${text}`).edges[0], false, text)
  assert.equal(ok('graph TD\nA x--x B').edges[0].arrow, false)
  assert.equal(ok('graph TD\nA <-->|two way| B').edges[0].label, 'two way')
  assert.equal(ok('graph TD\nA <-->|two way| B').edges[0].twoWay, true)
  assert.equal('twoWay' in buildMermaidItems(ok('graph TD\nA --> B')).items.find((i) => i.kind === 'connector'), false)
})

test('isMermaidText: lowercase keywords, front matter and comments allowed before the header', () => {
  assert.equal(isMermaidText('Graph TD\nA-->B'), false)
  assert.equal(isMermaidText('FLOWCHART LR\nA-->B'), false)
  assert.equal(isMermaidText('---\ntitle: T\n---\nflowchart LR\nA-->B'), true)
  assert.equal(isMermaidText('---\ntitle: T\n---\n%% c\nflowchart LR'), true)
  assert.equal(isMermaidText('---\nnot closed\nflowchart LR'), false)
  const g = ok('---\ntitle: T\n---\nflowchart LR\nA --> B')
  assert.equal(g.direction, 'LR')
  assert.equal(g.edges.length, 1)
})

test('wiring: paste guards, full-text Mermaid detection, handled errors, dialog close, tap undo, label drag', () => {
  assert.match(app, /const canvasCommandBlocked = \(\): boolean => editingBlocksCanvas\(\) \|\| Boolean\(contextMenuRef\.current\) \|\| canvasGestureActive\(\) \|\| activeMarqueeRef\.current !== null \|\| touchNav\.touchCount\(\) > 0/)
  assert.match(app, /pasteEventRef\.current = \(event\) => \{[\s\S]{0,700}if \(canvasCommandBlocked\(\)\) return\n    event\.preventDefault\(\)/)
  assert.match(app, /const mermaidText = full\.slice\(0, MAX_MERMAID_TEXT\)/)
  assert.match(app, /const text = full\.slice\(0, 2000\)/)
  assert.match(app, /parsed\.ok && \(parsed\.links > 0 \|\| [^\n]*\)\) \{\n\s+const error = importMermaid\(mermaidText, at\)\n\s+if \(error\) showToast\(error\)\n\s+return true/)
  assert.doesNotMatch(app, /setTemplateChooserOpen\(false\)\n    setMermaidOpen\(false\)\n    if \(!canvas/)
  assert.match(app, /Could not insert the diagram\.'\n\s+setMermaidOpen\(false\)/)
  assert.match(app, /if \(!tap \|\| !tapUndoRef\.current\) return\n[^\n]*\n\s+if \(editingBlocksCanvas\(\)\) return/)
  assert.match(app, /routedConnector: which === 'label' \? \(routeConnectors\(strokesRef\.current\)/)
  assert.match(app, /const connector = gesture\.routedConnector/)
  assert.match(app, /connectorLabelPosition\([^\n]*\) === gesture\.startLabelPosition\) \{[\s\S]{0,200}historyRef\.current\.discardLast\(\)/)
})

test('A(text) builds a rectangle with rounded: true; [text] stays sharp', () => {
  const g = ok('flowchart TD\nA(Round) --> B[Sharp]\nC([Stadium])')
  const { items } = buildMermaidItems(g)
  const rect = (name) => items.find((i) => i.kind === 'rectangle' && items.some((t) => t.kind === 'text' && t.text === name && t.x >= i.x && t.x < i.x + i.width && t.y >= i.y && t.y < i.y + i.height))
  assert.equal(rect('Round').rounded, true)
  assert.equal(rect('Sharp').rounded, undefined)
  assert.equal(rect('Stadium').rounded, undefined)
})
