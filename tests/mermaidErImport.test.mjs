import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const { parseMermaidEr, buildMermaidErItems, erCardinality } = await loadModule('mermaidErImport.ts')
const { buildMermaidDiagram, isMermaidText, mermaidInsertMessage } = await loadModule('mermaidImport.ts')
const doc = await loadModule('documentFormat.ts')

const ok = (text) => {
  const r = parseMermaidEr(text)
  assert.equal(r.ok, true, JSON.stringify(r))
  return r
}
const SAMPLE = `erDiagram
  CUSTOMER {
    int id PK
    string name "full name"
    int address_id FK
    string email PK, UK
  }
  CUSTOMER ||--o{ ORDER : places
  ORDER ||..|{ LINE_ITEM : "contains"
`

test('entities, attributes with keys, relationship-only entities', () => {
  const g = ok(SAMPLE)
  assert.deepEqual(g.entities.map((e) => e.id), ['CUSTOMER', 'ORDER', 'LINE_ITEM'])
  assert.deepEqual(g.entities[0].attributes, ['PK id: int', 'name: string', 'FK address_id: int', 'PK, UK email: string'])
  assert.deepEqual(g.entities[1].attributes, [])
  assert.equal(g.ignoredLines, 0)
})

test('cardinality mapping on both sides and dashed', () => {
  assert.deepEqual(['||', '|o', 'o|', '}|', '|{', '}o', 'o{'].map(erCardinality), ['1', '0..1', '0..1', '1..*', '1..*', '0..*', '0..*'])
  const g = ok('erDiagram\nA ||--o{ B : has\nC }o..o| D : x\nE }|--|{ F : y\nG |o--|| H : z')
  assert.deepEqual(g.relations.map((r) => [r.from, r.to, r.dashed, r.startLabel, r.endLabel, r.label]), [
    ['A', 'B', false, '1', '0..*', 'has'],
    ['C', 'D', true, '0..*', '0..1', 'x'],
    ['E', 'F', false, '1..*', '1..*', 'y'],
    ['G', 'H', false, '0..1', '1', 'z'],
  ])
})

test('alias labels, quoted verbs, single-line bodies, comments and ignored lines', () => {
  const g = ok('erDiagram\n%% c\ntitle Shop\nCUSTOMER["Customer"] {\n  int id PK\n}\nORDER[Order] { int id PK }\nCUSTOMER ||--|{ ORDER : "places order"\nSELF ||--|| SELF : me\nnonsense here')
  assert.deepEqual(g.entities.map((e) => e.name), ['Customer', 'Order', 'SELF'])
  assert.equal(g.relations[0].label, 'places order')
  assert.equal(g.relations.length, 1)
  assert.equal(g.ignoredLines, 3)
  assert.deepEqual(g.entities[1].attributes, ['PK id: int'])
})

test('unreadable attribute lines are ignored; errors for empty input', () => {
  const g = ok('erDiagram\nA {\n  onlyone\n  int id PK\n}')
  assert.equal(g.ignoredLines, 1)
  assert.deepEqual(g.entities[0].attributes, ['PK id: int'])
  assert.equal(parseMermaidEr('erDiagram\n').ok, false)
})

test('built items: class boxes, attached association connectors with labels', () => {
  const r = buildMermaidDiagram(SAMPLE)
  assert.equal(r.ok, true)
  assert.equal(r.kind, 'er')
  assert.deepEqual([r.boxes, r.links, r.ignoredLines], [3, 2, 0])
  const boxes = r.items.filter((i) => i.kind === 'rectangle')
  assert.equal(boxes.length, 3)
  assert.ok(boxes.every((b) => b.classBox))
  assert.equal(boxes[0].classBox.name, 'CUSTOMER')
  assert.equal(boxes[0].classBox.attributes, 'PK id: int\nname: string\nFK address_id: int\nPK, UK email: string')
  assert.equal(boxes[0].classBox.methods, '')
  const links = r.items.filter((i) => i.kind === 'connector')
  assert.equal(links.length, 2)
  for (const c of links) {
    assert.equal(c.relationshipType, 'association')
    assert.ok(c.startAttachment && c.endAttachment)
  }
  assert.deepEqual([links[0].label, links[0].startLabel, links[0].endLabel, links[0].dash], ['places', '1', '0..*', undefined])
  assert.deepEqual([links[1].label, links[1].startLabel, links[1].endLabel, links[1].dash], ['contains', '1', '1..*', 'dashed'])
  // left to right: the start entity is left of the end entity
  const byId = new Map(boxes.map((b) => [b.id, b]))
  assert.ok(byId.get(links[0].startAttachment.rectangleId).x < byId.get(links[0].endAttachment.rectangleId).x)
  assert.equal(Math.min(...boxes.map((b) => b.x)), 0)
  assert.equal(Math.min(...boxes.map((b) => b.y)), 0)
})

test('ids are unique per kind and items round-trip through documentFormat', () => {
  const r = buildMermaidDiagram(SAMPLE)
  for (const kind of ['rectangle', 'connector', 'text']) {
    const ids = r.items.filter((i) => i.kind === kind).map((i) => i.id)
    assert.equal(new Set(ids).size, ids.length, kind)
  }
  assert.ok(r.items.some((i) => i.kind === 'connector' && i.startLabel && i.endLabel), 'cardinalities are on the built connectors')
  const bare = (item) => item
  const saved = doc.createDocument({ template: 'blank', background: 'white', items: r.items })
  const parsed = doc.parseDocument(doc.stringifyDocument(saved))
  assert.deepEqual((parsed.document ?? parsed).items, r.items)
  for (const item of r.items) assert.deepEqual(doc.sanitizeItem(JSON.parse(JSON.stringify(item))), item)
})

test('dispatcher, detection and toast', () => {
  assert.equal(isMermaidText('erDiagram\nA ||--o{ B : x'), true)
  assert.equal(isMermaidText('%% c\n\nerDiagram'), true)
  assert.equal(isMermaidText('erDiagramX'), false)
  assert.equal(mermaidInsertMessage(3, 2, 0, 'er'), 'Inserted 3 entities and 2 relationships')
  assert.equal(mermaidInsertMessage(1, 1, 2, 'er'), 'Inserted 1 entity and 1 relationship (2 lines ignored)')
  assert.equal(buildMermaidDiagram('erDiagram\n').ok, false)
  const parsed = ok('erDiagram\nA ||--o{ B : x')
  assert.equal(buildMermaidErItems(parsed).links, 1)
})
