import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { buildMermaid } = await loadModule('mermaidExport.ts')
const { buildMermaidEr, parseMermaidEr } = await loadModule('mermaidErImport.ts')
const { buildMermaidDiagram } = await loadModule('mermaidImport.ts')

const TEXTS = [
  `erDiagram
  CUSTOMER {
    int id PK
    string name "full name"
    int address_id FK
    string email PK, UK
  }
  CUSTOMER ||--o{ ORDER : places
  ORDER ||..|{ LINE_ITEM : "contains"
`,
  'erDiagram\nA ||--o{ B : has\nC }o..o| D : x\nE }|--|{ F : y\nG |o--|| H : z',
  'erDiagram\nCUSTOMER["Customer account"] {\n  int id PK\n}\nCUSTOMER ||--|{ ORDER_ITEM : "buys # things"\nORDER_ITEM }o--o| CUSTOMER : ""\nLONELY',
]

/** Structure only: entity names with attributes, relationships by entity name. */
const structure = (parsed) => {
  const name = new Map(parsed.entities.map((e) => [e.id, e.name]))
  return {
    entities: parsed.entities.map((e) => [e.name, e.attributes]).sort((a, b) => a[0].localeCompare(b[0])),
    relations: parsed.relations.map((r) => [name.get(r.from), name.get(r.to), r.dashed, r.startLabel, r.endLabel, r.label ?? '']).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  }
}

test('ER pages copy as erDiagram and round-trip to the same entities, attributes and relationships', () => {
  for (const text of TEXTS) {
    const first = parseMermaidEr(text)
    assert.equal(first.ok, true)
    const built = buildMermaidEr(text)
    assert.equal(built.ok, true)
    const result = buildMermaid(built.items)
    assert.equal(result.kind, 'er')
    assert.equal(result.boxes, first.entities.length)
    assert.equal(result.links, first.relations.length)
    assert.equal(result.skipped, false)
    assert.ok(result.text.startsWith('erDiagram\n'))
    const second = parseMermaidEr(result.text)
    assert.equal(second.ok, true, result.text)
    assert.equal(second.ignoredLines, 0, result.text)
    assert.deepEqual(structure(second), structure(first), result.text)
    // and a second export is stable
    assert.equal(buildMermaid(buildMermaidDiagram(result.text).items).text, result.text)
  }
})

test('attributes are written as "type name KEYS", relationships with cardinality symbols and a quoted label', () => {
  const text = buildMermaid(buildMermaidEr(TEXTS[0]).items).text
  assert.match(text, /^ {4}int id PK$/m)
  assert.match(text, /^ {4}string email PK, UK$/m)
  assert.match(text, /^ {2}CUSTOMER \|\|--o\{ ORDER : "places"$/m)
  assert.match(text, /^ {2}ORDER \|\|\.\.\|\{ LINE_ITEM : "contains"$/m)
  const other = buildMermaid(buildMermaidEr(TEXTS[1]).items).text
  assert.match(other, /^ {2}C \}o\.\.o\| D : "x"$/m)
  assert.match(other, /^ {2}G \|o--\|\| H : "z"$/m)
})

test('non-ER pages are unchanged: class pages and flowcharts', () => {
  assert.equal(buildMermaid(buildMermaidDiagram('flowchart LR\nA-->B').items).kind, 'flowchart')
  assert.equal(buildMermaid(buildMermaidDiagram('classDiagram\nclass A {\n  +int x\n  +run()\n}\nA --> B').items).kind, 'class')
  assert.equal(buildMermaid(buildMermaidDiagram('classDiagram\nclass A {\n  +int x\n}\nA <|-- B').items).kind, 'class')
  assert.equal(buildMermaid([]).kind, 'flowchart')
})

test('an ER page with free text reports skipped; a non-association link makes it a class page', () => {
  const built = buildMermaidEr(TEXTS[1])
  const text = { kind: 'text', id: 999, x: 0, y: 0, text: 'note', color: '#000', fontSize: 20, width: 40, height: 24 }
  assert.equal(buildMermaid([...built.items, text]).skipped, true)
  const changed = built.items.map((item) => (item.kind === 'connector' ? { ...item, relationshipType: 'inheritance' } : item))
  assert.notEqual(buildMermaid(changed).kind, 'er')
})

test('wiring: Copy as Mermaid toast for ER pages and the builder hook', async () => {
  const app = await readAppSource()
  assert.match(app, /result\.kind === 'er' \? `Copied ER diagram as Mermaid/)
  const exp = await readFile(new URL('../src/mermaidExport.ts', import.meta.url), 'utf8')
  assert.match(exp, /const er = buildMermaidErText\(items\)\n\s+if \(er\) return/)
})
