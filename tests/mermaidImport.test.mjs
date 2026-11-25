import assert from 'node:assert/strict'
import test from 'node:test'
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
    ['A', 'Rect', 'rectangle'], ['B', 'Round', 'rectangle'], ['C', 'Stadium', 'rectangle'], ['D', 'Circle', 'ellipse'],
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

test('comments, subgraph, style lines are skipped and the unparsed ones counted', () => {
  const g = ok('%% a comment\nflowchart TD\nsubgraph S\nA-->B\nend\nclassDef x fill:#f00\nclass A x\nstyle B fill:#fff\nlinkStyle 0 stroke:red\nclick A callback\n%% another\nthis is not mermaid ((')
  assert.equal(g.nodes.length, 2)
  assert.equal(g.edges.length, 1)
  assert.equal(g.ignoredLines, 8)
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
  assert.match(app, /parseMermaid\(text\)/)
  assert.match(app, /showToast\(mermaidInsertMessage\(/)
})

test('wiring: Desktop paste of system text', () => {
  assert.match(app, /window\.addEventListener\('paste', onPaste\)/)
  assert.match(app, /clipboardData\?\.getData\('text\/plain'\)/)
  // Ctrl+V with an empty in-app clipboard is left unhandled on keydown so the paste event fires
  assert.match(app, /case 'paste':[\s\S]{0,260}inputModeRef\.current === 'desktop' && clipboardRef\.current\.length === 0\) return false/)
  assert.match(app, /isTypingTarget\(target\?\.tagName \?\? 'BODY', Boolean\(target\?\.isContentEditable\)\) \|\| overlayOpen\(\)/)
  assert.match(app, /isMermaidText\(text\)/)
  assert.match(app, /\.slice\(0, 2000\)/)
  // the in-app clipboard path is unchanged
  assert.match(app, /const pasteWithToast = \(at\?: Point \| null\): boolean => \{/)
})
