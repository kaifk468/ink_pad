import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const { parseMermaidClass, buildMermaidClassItems } = await loadModule('mermaidClassImport.ts')
const { getConnectorRenderSpec } = await loadModule('canvasModel.ts')
const doc = await loadModule('documentFormat.ts')

const ok = (text) => {
  const r = parseMermaidClass(text)
  assert.equal(r.ok, true, JSON.stringify(r))
  return r
}
const cls = (g, id) => g.classes.find((c) => c.id === id)
const rel = (r) => [r.from, r.to, r.type, r.dashed]

test('classes, bodies, member lines, methods vs attributes', () => {
  const g = ok('classDiagram\nclass A\nclass B {\n  +name: String\n  -count int\n  +run() void\n  +add(x, y)$ int\n}\nA : +id: int\nA : +go()\nC : +x')
  assert.deepEqual(g.classes.map((c) => c.id), ['A', 'B', 'C'])
  assert.deepEqual(cls(g, 'B').attributes, ['+name: String', '-count int'])
  assert.deepEqual(cls(g, 'B').methods, ['+run() void', '+add(x, y)$ int'])
  assert.deepEqual([cls(g, 'A').attributes, cls(g, 'A').methods], [['+id: int'], ['+go()']])
  assert.deepEqual(cls(g, 'C').attributes, ['+x'])
})

test('header variants, front matter, comments and skipped lines are counted', () => {
  const g = ok('---\ntitle: T\n---\n%% comment\nclassDiagram-v2\ndirection RL\nnote "hi"\nnote for A "x"\nclick A call f()\nstyle A fill:#f00\ncssClass "A" c\nclass A\nnamespace N {\n  class B\n}\nA --> B\nthis is nonsense')
  assert.deepEqual(g.classes.map((c) => c.id), ['A', 'B'])
  assert.equal(g.relations.length, 1)
  assert.equal(g.ignoredLines, 8)
})

test('generics and annotations', () => {
  const g = ok('classDiagram\nclass List~T~\nclass Map~K,V~ {\n  <<interface>>\n  +get(k: K) V\n  +all: List~List~int~~\n}\n<<abstract>> Shape\nclass Foo\nFoo : <<service>>')
  assert.equal(cls(g, 'List').name, 'List<T>')
  assert.equal(cls(g, 'Map').name, 'Map<K,V>')
  assert.equal(cls(g, 'Map').annotation, 'interface')
  assert.deepEqual(cls(g, 'Map').attributes, ['+all: List<List<int>>'])
  assert.equal(cls(g, 'Shape').annotation, 'abstract')
  assert.equal(cls(g, 'Foo').annotation, 'service')
  const built = buildMermaidClassItems(g)
  const box = built.items.find((i) => i.kind === 'rectangle' && i.classBox.name.includes('Shape'))
  assert.equal(box.classBox.name, '«abstract»\nShape')
})

test('relationship mapping: connector start -> end', () => {
  const cases = [
    ['A <|-- B', ['B', 'A', 'inheritance', false]],
    ['B --|> A', ['B', 'A', 'inheritance', false]],
    ['A <|.. B', ['B', 'A', 'realization', false]],
    ['B ..|> A', ['B', 'A', 'realization', false]],
    ['A *-- B', ['A', 'B', 'composition', false]],
    ['B --* A', ['A', 'B', 'composition', false]],
    ['A o-- B', ['A', 'B', 'aggregation', false]],
    ['B --o A', ['A', 'B', 'aggregation', false]],
    ['A --> B', ['A', 'B', 'directed-association', false]],
    ['B <-- A', ['A', 'B', 'directed-association', false]],
    ['A ..> B', ['A', 'B', 'dependency', false]],
    ['B <.. A', ['A', 'B', 'dependency', false]],
    ['A -- B', ['A', 'B', 'association', false]],
    ['A .. B', ['A', 'B', 'association', true]],
    ['A <--> B', ['A', 'B', 'association', false]],
  ]
  for (const [line, expected] of cases) assert.deepEqual(rel(ok(`classDiagram\n${line}`).relations[0]), expected, line)
})

test('rendered symbol sits at the right class', () => {
  const built = (line) => buildMermaidClassItems(ok(`classDiagram\n${line}`))
  const boxId = (b, name) => b.items.find((i) => i.kind === 'rectangle' && i.classBox.name === name).id
  const symbolEnd = (b) => {
    const c = b.items.find((i) => i.kind === 'connector')
    const spec = getConnectorRenderSpec(c)
    const attach = spec.endpoint === 'start' ? c.startAttachment : c.endAttachment
    return { spec, rectangleId: attach.rectangleId }
  }
  const check = (line, symbol, name) => {
    const b = built(line)
    const end = symbolEnd(b)
    assert.equal(end.spec.symbol, symbol, line)
    assert.equal(end.rectangleId, boxId(b, name), line)
  }
  check('Animal <|-- Dog', 'hollow-triangle', 'Animal')
  check('Dog --|> Animal', 'hollow-triangle', 'Animal')
  check('Dog ..|> Animal', 'hollow-triangle', 'Animal')
  check('Car *-- Wheel', 'filled-diamond', 'Car')
  check('Wheel --* Car', 'filled-diamond', 'Car')
  check('Team o-- Player', 'hollow-diamond', 'Team')
  check('Player --o Team', 'hollow-diamond', 'Team')
  check('A --> B', 'open-arrow', 'B')
  check('B <-- A', 'open-arrow', 'B')
  check('A ..> B', 'open-arrow', 'B')
  check('B <.. A', 'open-arrow', 'B')
  const line = built('A .. B').items.find((i) => i.kind === 'connector')
  assert.equal(line.dash, 'dashed')
  assert.equal(getConnectorRenderSpec(line).symbol, 'none')
})

test('cardinalities are ignored, labels kept, self links and unreadable lines counted', () => {
  const g = ok('classDiagram\nCustomer "1" --> "*" Order : places\nOrder "1" *-- "1..*" Item\nA --> A\nA ~~ B')
  assert.deepEqual(g.relations.map((r) => [r.from, r.to, r.label]), [['Customer', 'Order', 'places'], ['Order', 'Item', undefined]])
  assert.equal(g.ignoredLines, 2)
})

test('errors and limits', () => {
  assert.equal(parseMermaidClass('classDiagram\n').ok, false)
  const many = 'classDiagram\n' + Array.from({ length: 151 }, (_, i) => `class C${i}`).join('\n')
  assert.equal(parseMermaidClass(many).ok, false)
  assert.equal(parseMermaidClass(many.replace(/\nclass C150/, '')).ok, true)
})

test('built items: parent above child, attached connectors, saved format round-trip', () => {
  const g = ok('classDiagram\nclass Animal {\n  <<abstract>>\n  +name: String\n  +speak() void\n}\nAnimal <|-- Dog\nAnimal <|-- Cat : is a\nDog --> Bone')
  const built = buildMermaidClassItems(g)
  assert.equal(built.boxes, 4)
  assert.equal(built.links, 3)
  const boxes = built.items.filter((i) => i.kind === 'rectangle')
  const animal = boxes.find((b) => b.classBox.name.endsWith('Animal'))
  const dog = boxes.find((b) => b.classBox.name === 'Dog')
  assert.ok(animal.y < dog.y)
  assert.ok(boxes.every((b) => b.x >= 0 && b.y >= 0))
  const connectors = built.items.filter((i) => i.kind === 'connector')
  assert.ok(connectors.every((c) => c.startAttachment && c.endAttachment))
  assert.equal(connectors.filter((c) => c.label === 'is a').length, 1)
  const saved = doc.createDocument({ template: 'blank', background: 'white', items: built.items })
  const parsed = doc.parseDocument(doc.stringifyDocument(saved))
  assert.deepEqual((parsed.document ?? parsed).items, built.items)
})
