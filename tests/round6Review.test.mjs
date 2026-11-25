import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { replaceInItems } = await loadModule('canvasReplace.ts')
const { buildMermaid } = await loadModule('mermaidExport.ts')
const { buildMermaidDiagram, parseMermaid } = await loadModule('mermaidImport.ts')
const { parseMermaidClass } = await loadModule('mermaidClassImport.ts')
const { buildMermaidSequence } = await loadModule('mermaidSequenceImport.ts')
const shapes = await loadModule('hldShapes.ts')
const fit = await loadModule('textFit.ts')
const app = await readAppSource()
const overlay = (await readFile(new URL('../src/TextEditorOverlay.tsx', import.meta.url), 'utf8')).replace(/\r\n/g, '\n')

const p = (x, y) => ({ x, y, pressure: 1 })
const box = (id, extra = {}) => ({ kind: 'rectangle', id, x: 0, y: 0, width: 400, height: 240, strokeColor: '#111', strokeWidth: 2, ...extra })

test('1. replace refits a label inside an HLD shape (an inkBox)', () => {
  const service = box(1, { hldShape: 'service', inkBox: { top: 0, mid: 0, ink: [] } })
  const plainInk = box(2, { x: 1000, inkBox: { top: 0, mid: 0, ink: [] } })
  const inside = (id, x) => ({ kind: 'text', id, x, y: 100, width: 60, height: 30, text: 'cache', fontSize: 24, color: '#111' })
  const measureFor = () => (line) => ({ width: line.length * 30, height: 30 })
  const longer = 'a much longer label than before'
  const result = replaceInItems([service, inside(3, 170)], 'cache', longer, { measureFor })
  const label = result.items.find((i) => i.kind === 'text')
  assert.equal(label.text, longer)
  assert.ok(label.width !== 60, 'label was re-measured by the refit')
  assert.equal(fit.isFitShape(service), true)
  assert.equal(fit.isFitShape(plainInk), false)
})

const classBox = (id, name, attributes = '', methods = '') => box(id, { x: id * 400, classBox: { name, attributes, methods } })
const roundTrip = (items) => {
  const out = buildMermaid(items)
  const back = parseMermaidClass(out.text)
  assert.equal(back.ok, true, out.text)
  return { text: out.text, back }
}

test('2. class export keeps annotations and display names', () => {
  const { text, back } = roundTrip([classBox(1, '«interface»\nShape', '', '+area(): float'), classBox(2, 'Order Item', '+id: int'), classBox(3, 'Repo<T>')])
  assert.doesNotMatch(text, /interface_Shape/)
  assert.match(text, /class Shape \{\n    <<interface>>/)
  assert.match(text, /class Order_Item\["Order Item"\] \{/)
  assert.match(text, /class Repo~T~ \{/)
  const names = back.classes.map((c) => [c.name, c.annotation])
  assert.deepEqual(names, [['Shape', 'interface'], ['Order Item', undefined], ['Repo<T>', undefined]])
})

test('7. class export and import keep two-way and dashed associations', () => {
  const link = (id, from, to, extra) => ({ kind: 'connector', id, start: p(0, 0), end: p(1, 1), strokeColor: '#111', strokeWidth: 2, reversed: false, startAttachment: { rectangleId: from, offsetX: 0, offsetY: 0 }, endAttachment: { rectangleId: to, offsetX: 0, offsetY: 0 }, ...extra })
  const items = [classBox(1, 'A'), classBox(2, 'B'), classBox(3, 'C'), link(10, 1, 2, { relationshipType: 'directed-association', twoWay: true }), link(11, 2, 3, { relationshipType: 'association', dash: 'dashed' })]
  const out = buildMermaid(items)
  assert.match(out.text, /A <--> B/)
  assert.match(out.text, /B \.\. C/)
  const built = buildMermaidDiagram(out.text)
  assert.equal(built.ok, true)
  const connectors = built.items.filter((i) => i.kind === 'connector')
  assert.equal(connectors.length, 2)
  assert.ok(connectors.some((c) => c.relationshipType === 'directed-association' && c.twoWay === true))
  assert.ok(connectors.some((c) => c.relationshipType === 'association' && c.dash === 'dashed' && !c.twoWay))
})

test('3. label drag on an unselected connector skips groups and duplicate presses', () => {
  assert.match(app, /!duplicatePress\(event\) && expandSelectionState\(\{ keys: \[canvasItemKey\(connector\)\], rectangleId: null \}\)\.keys\.length === 1 && startConnectorHandleGesture\(event, point, true\)/)
})

test('4. subgraph membership follows the block that mentions the node (Mermaid docs example)', () => {
  const parsed = parseMermaid('flowchart TB\n c1-->a2\n subgraph one\n a1-->a2\n end\n subgraph two\n b1-->b2\n end\n subgraph three\n c1-->c2\n end')
  assert.equal(parsed.ok, true)
  const members = Object.fromEntries(parsed.subgraphs.map((g) => [g.id, g.nodes]))
  assert.deepEqual(members.one.sort(), ['a1', 'a2'])
  assert.deepEqual(members.two.sort(), ['b1', 'b2'])
  assert.deepEqual(members.three.sort(), ['c1', 'c2'])
})

test('4. nested subgraphs: the inner block claims first', () => {
  const parsed = parseMermaid('flowchart TB\n subgraph outer\n x-->y\n subgraph inner\n y-->z\n end\n end')
  const members = Object.fromEntries(parsed.subgraphs.map((g) => [g.id, g.nodes]))
  assert.deepEqual(members.inner.sort(), ['y', 'z'])
  assert.deepEqual(members.outer, ['x'])
})

test('5. list continuation on keydown suppresses the same Enter in beforeinput', () => {
  assert.match(overlay, /applyListEnter\(event\.currentTarget\)\) \{ event\.preventDefault\(\); skipBeforeInput\.current = true/)
  assert.match(overlay, /onKeyUp=\{\(event\) => \{ if \(event\.key === 'Enter'\) skipBeforeInput\.current = false/)
})

test('6. execCommand fallback never edits already-changed text', () => {
  assert.match(overlay, /if \(!done\) \{\n\s+field\.setRangeText\(edit\.text, edit\.from, edit\.to, 'end'\)/)
  assert.match(overlay, /else if \(field\.value !== result\.value\) \{[^}]*field\.setRangeText\(result\.value, 0, field\.value\.length, 'end'\)/s)
})

test('8. HLD icon insets are symmetric', () => {
  for (const shape of ['apiGateway', 'server', 'objectStorage', 'stream', 'worker']) {
    for (const [w, h] of [[300, 200], [160, 100], [500, 300]]) {
      const i = shapes.hldIconInsets(shape, w, h)
      assert.equal(i.left, i.right, `${shape} horizontal`)
      assert.equal(i.top, i.bottom, `${shape} vertical`)
    }
  }
  assert.ok(shapes.hldIconInsets('apiGateway', 300, 200).right > 0)
  assert.ok(shapes.hldIconInsets('worker', 300, 200).bottom > 0)
})

test('9. desktop paste accepts class and sequence headers without links', () => {
  assert.match(app, /parsed\.links > 0 \|\| \(\(parsed\.kind === 'class' \|\| parsed\.kind === 'sequence'\) && parsed\.boxes > 0\)/)
  const one = buildMermaidDiagram('classDiagram\n class Solo')
  assert.equal(one.ok && one.links, 0)
  assert.equal(one.kind, 'class')
  assert.ok(one.boxes > 0)
})

test('10. a self message label ends before the next lifeline', () => {
  const label = 'a rather long self message label that needs room'
  const result = buildMermaidSequence(`sequenceDiagram\n participant A\n participant B\n A->>A: ${label}\n A->>B: hi`)
  assert.equal(result.ok, true)
  const lifelines = result.items.filter((i) => i.kind === 'stroke' && i.color === '#6b7280').map((s) => s.points[0].x).sort((a, b) => a - b)
  const text = result.items.find((i) => i.kind === 'text' && i.text === label)
  assert.ok(text.x + text.width < lifelines[1], `label right ${text.x + text.width} < lifeline ${lifelines[1]}`)
})
