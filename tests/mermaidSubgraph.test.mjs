import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { parseMermaid, buildMermaidItems, buildMermaidDiagram, isMermaidText, mermaidInsertMessage } = await loadModule('mermaidImport.ts')
const doc = await loadModule('documentFormat.ts')
const app = await readAppSource()

const ok = (text) => {
  const result = parseMermaid(text)
  assert.equal(result.ok, true, JSON.stringify(result))
  return result
}
const bounds = (i) => ({ l: i.x, t: i.y, r: i.x + i.width, b: i.y + i.height })
const encloses = (outer, inner) => outer.l <= inner.l && outer.t <= inner.t && outer.r >= inner.r && outer.b >= inner.b
const frames = (items) => items.filter((i) => i.kind === 'rectangle' && i.dash === 'dashed')
const plainBoxes = (items) => items.filter((i) => i.kind === 'rectangle' && !i.dash)
const boxOf = (items, text) => {
  const label = items.find((i) => i.kind === 'text' && i.text === text)
  return plainBoxes(items).find((i) => label && label.x >= i.x && label.x + label.width <= i.x + i.width && label.y >= i.y && label.y + label.height <= i.y + i.height)
}

test('subgraph: forms, membership, nesting; links to a subgraph id are skipped', () => {
  const g = ok('flowchart TD\nsubgraph one [First]\nA --> B\nsubgraph inner\nC\nend\nend\nsubgraph "Quoted title"\nD\nend\nsubgraph x\nend\nE\nA --> one\nE --> D')
  assert.deepEqual(g.subgraphs.map((s) => [s.id, s.title, s.parent, s.nodes]), [
    ['one', 'First', null, ['A', 'B']], ['inner', 'inner', 0, ['C']], ['subgraph3', 'Quoted title', null, ['D']], ['x', 'x', null, []],
  ])
  assert.equal(g.nodes.some((n) => n.id === 'one'), false)
  assert.equal(g.edges.length, 2)
  assert.equal(g.ignoredLines, 1)
})

test('subgraph: dashed boundaries behind the boxes, inner inside outer, empty ones skipped', () => {
  const g = ok('flowchart LR\nsubgraph outer [Outer]\nA --> B\nsubgraph inner [Inner]\nC\nend\nend\nsubgraph empty\nend\nB --> C\nD --> A')
  const built = buildMermaidItems(g)
  const dashed = frames(built.items)
  assert.equal(dashed.length, 2)
  assert.equal(built.items.indexOf(dashed[0]), 0)
  const firstBox = built.items.findIndex((i) => i.kind === 'rectangle' && !i.dash)
  assert.ok(built.items.indexOf(dashed[1]) < firstBox)
  const [outer, inner] = dashed
  assert.equal(outer.strokeColor, '#64748b')
  assert.equal(outer.fillColor, undefined)
  assert.ok(outer.x < inner.x && outer.y < inner.y && outer.x + outer.width > inner.x + inner.width && outer.y + outer.height > inner.y + inner.height)
  for (const name of ['A', 'B', 'C']) assert.ok(encloses(bounds(outer), bounds(boxOf(built.items, name))), name)
  assert.ok(encloses(bounds(inner), bounds(boxOf(built.items, 'C'))))
  const texts = built.items.filter((i) => i.kind === 'text').map((i) => i.text)
  assert.ok(texts.includes('Outer') && texts.includes('Inner') && !texts.includes('empty'))
  const rectangles = built.items.filter((i) => i.kind === 'rectangle')
  assert.ok(Math.min(...rectangles.map((i) => i.x)) >= 0 && Math.min(...rectangles.map((i) => i.y)) >= 0)
  assert.equal(built.boxes, 4)
  assert.equal(new Set(rectangles.map((i) => i.id)).size, rectangles.length)
  const labels = built.items.filter((i) => i.kind === 'text')
  assert.equal(new Set(labels.map((i) => i.id)).size, labels.length)
})

test('subgraph: members stay next to each other in the layout order', () => {
  const g = ok('flowchart TD\nsubgraph s\nA\nB\nend\nC --> A\nC --> B\nD --> C')
  const built = buildMermaidItems(g)
  const [frame] = frames(built.items)
  const inside = plainBoxes(built.items).filter((b) => encloses(bounds(frame), bounds(b))).length
  assert.equal(inside, 2)
})

test('subgraph: a graph without subgraphs has no boundaries', () => {
  assert.equal(frames(buildMermaidItems(ok('graph TD\nA --> B')).items).length, 0)
})

test('subgraph: saved items round-trip unchanged', () => {
  const built = buildMermaidItems(ok('flowchart TD\nsubgraph s [S]\nA --> B\nend\nB --> C'))
  const saved = doc.createDocument({ template: 'blank', background: 'white', items: built.items })
  const parsed = doc.parseDocument(doc.stringifyDocument(saved))
  assert.deepEqual((parsed.document ?? parsed).items, built.items)
})

test('dispatcher routes by header', () => {
  assert.equal(isMermaidText('classDiagram\nclass A'), true)
  assert.equal(isMermaidText('classDiagram-v2\nclass A'), true)
  assert.equal(isMermaidText('%% c\nsequenceDiagram\nA->>B: hi'), true)
  assert.equal(isMermaidText('classDiagrams\nA'), false)
  const flow = buildMermaidDiagram('graph TD\nA --> B')
  assert.equal(flow.ok && flow.kind, 'flowchart')
  assert.equal(flow.links, 1)
  const cls = buildMermaidDiagram('classDiagram\nA <|-- B')
  assert.equal(cls.ok && cls.kind, 'class')
  assert.equal(cls.boxes, 2)
  assert.equal(buildMermaidDiagram('classDiagram\n').ok, false)
  assert.equal(buildMermaidDiagram('graph TD\n').ok, false)
  const sequence = buildMermaidDiagram('sequenceDiagram\nA->>B: hi')
  assert.equal(sequence.ok && sequence.kind, 'sequence')
  assert.equal(sequence.boxes, 2)
  assert.equal(mermaidInsertMessage(2, 1, 0, 'sequence'), 'Inserted 2 participants and 1 message')
  assert.equal(mermaidInsertMessage(3, 5, 0, 'sequence', 2), 'Inserted 3 participants, 5 messages and 2 frames')
  assert.equal(mermaidInsertMessage(3, 5, 1, 'sequence', 1), 'Inserted 3 participants, 5 messages and 1 frame (1 line ignored)')
})

test('class diagrams say classes in the toast', () => {
  assert.equal(mermaidInsertMessage(3, 2, 0, 'class'), 'Inserted 3 classes and 2 links')
  assert.equal(mermaidInsertMessage(1, 1, 1, 'class'), 'Inserted 1 class and 1 link (1 line ignored)')
  assert.equal(mermaidInsertMessage(3, 2, 0), 'Inserted 3 boxes and 2 links')
})

test('wiring: dispatcher in App and dialog hint', async () => {
  assert.match(app, /import \{ buildMermaidDiagram, isMermaidText, MAX_MERMAID_TEXT, mermaidInsertMessage \} from '\.\/mermaidImport'/)
  assert.match(app, /const built = buildMermaidDiagram\(text\)\n\s+if \(!built\.ok\) return built\.error/)
  assert.match(app, /mermaidInsertMessage\(built\.boxes, built\.links, built\.ignoredLines, built\.kind, built\.frames \?\? 0\)/)
  assert.match(app, /const parsed = buildMermaidDiagram\(mermaidText\)/)
  const dialog = await readFile(new URL('../src/app/MermaidDialog.tsx', import.meta.url), 'utf8')
  assert.match(dialog, /flowchart[\s\S]*classDiagram[\s\S]*sequenceDiagram/)
})

const hitsRect = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b
const assertClean = (items, memberships) => {
  const boxes = plainBoxes(items)
  const dashed = frames(items)
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.equal(hitsRect(bounds(boxes[i]), bounds(boxes[j])), false, `boxes ${i}/${j} overlap`)
  for (const [title, ids] of memberships) {
    const label = items.find((i) => i.kind === 'text' && i.text === title)
    const frame = dashed.find((f) => label && label.x >= f.x && label.x <= f.x + f.width && label.y >= f.y && label.y <= f.y + f.height && ![...dashed].some((o) => o !== f && o.x > f.x - 1 && encloses(bounds(f), bounds(o)) && label.x >= o.x && label.y >= o.y && label.x <= o.x + o.width && label.y <= o.y + o.height))
    assert.ok(frame, `frame ${title}`)
    for (const box of boxes) {
      const member = ids.some((id) => boxOf(items, id) === box)
      if (!member) assert.equal(hitsRect(bounds(box), bounds(frame)), false, `non-member box overlaps ${title}`)
    }
  }
}

test('subgraph: a non-member box is moved out of nested boundaries', () => {
  const g = ok('flowchart LR\nsubgraph vpc [VPC]\n  subgraph priv [Private subnet]\n    S[[Order service]] --> D[(Orders DB)]\n  end\n  LB[Load balancer] --> S\nend\nC((Client)) <--> LB\nS -.-> Q[Queue]')
  const { items } = buildMermaidItems(g)
  assertClean(items, [['VPC', ['Order service', 'Orders DB', 'Load balancer']], ['Private subnet', ['Order service', 'Orders DB']]])
  assert.equal(buildMermaidItems(g).items.length, items.length)
})

test('subgraph: TD layout keeps outsiders out of the boundary', () => {
  const g = ok('flowchart TD\nsubgraph a [Group A]\n  X --> Y\nend\nT --> X\nX -.-> Z\nT --> Z\nY --> W')
  assertClean(buildMermaidItems(g).items, [['Group A', ['X', 'Y']]])
})

test('subgraph: interleaved sibling subgraphs do not overlap', () => {
  const g = ok('flowchart LR\nsubgraph one [One]\n  A1 --> A2\nend\nsubgraph two [Two]\n  B1 --> B2\nend\nA1 --> B1\nB1 --> A2\nA2 --> B2\nS --> A1\nS --> B1')
  const { items } = buildMermaidItems(g)
  assertClean(items, [['One', ['A1', 'A2']], ['Two', ['B1', 'B2']]])
  const [f1, f2] = frames(items)
  assert.equal(hitsRect(bounds(f1), bounds(f2)), false)
})
