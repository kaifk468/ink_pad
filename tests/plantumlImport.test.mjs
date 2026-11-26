import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const { buildPlantUml, isPlantUmlText } = await loadModule('plantumlImport.ts')
const mermaid = await loadModule('mermaidImport.ts')
const { buildMermaidClassItems, parseMermaidClass } = await loadModule('mermaidClassImport.ts')
const doc = await loadModule('documentFormat.ts')

const CLASS_SAMPLE = `@startuml
' domain model
package "Domain Model" {
  abstract class Animal <<entity>> {
    -name : String
    +speak() : void
    {static} count : int
    --
    #age : int
  }
  interface Pet
  enum Color {
    RED
    GREEN
  }
}
class Dog extends Animal implements Pet
class Owner
Animal <|-- Dog
Owner "1" *-- "0..*" Dog : owns >
Owner o-- Color
Dog ..> Owner : uses
Dog -- Color
note right of Dog : good boy
note as N1
 floating
 text
end note
N1 .. Owner
skinparam classAttributeIconSize 0
hide empty members
skinparam class {
  BackgroundColor red
}
@enduml`

const SEQUENCE_SAMPLE = `@startuml
title Login
autonumber
actor User
participant "Web App" as Web
database DB
queue Q as "Event Queue"
User -> Web : open
Web -> Web : validate
Web --> User : ok
Web ->> DB : query
DB <-- Web : rows
User <- Web : back
alt success
  Web -> DB : save
else failure
  Web -> User : error
end
loop 3 times
  Web -> Q : retry
end
note over Web, DB : sync
note left of User
  hello
end note
activate Web
deactivate Web
skinparam monochrome true
@enduml`

const ok = (text) => {
  const result = buildPlantUml(text)
  assert.equal(result.ok, true, JSON.stringify(result))
  return result
}
const texts = (r) => r.items.filter((item) => item.kind === 'text').map((item) => item.text)
const connectors = (r) => r.items.filter((item) => item.kind === 'connector')
const classBoxes = (r) => r.items.filter((item) => item.kind === 'rectangle' && item.classBox)

test('class diagram: classes, members, stereotypes, relationships, notes, package', () => {
  const r = ok(CLASS_SAMPLE)
  assert.equal(r.kind, 'class')
  assert.equal(r.boxes, 5) // Animal, Pet, Color, Dog, Owner
  assert.equal(r.links, 7) // extends, implements, <|--, *--, o--, ..>, --
  const rels = connectors(r).map((c) => c.relationshipType)
  assert.ok(rels.includes('inheritance') && rels.includes('realization') && rels.includes('composition') && rels.includes('aggregation') && rels.includes('dependency'))
  const joined = JSON.stringify(r.items)
  assert.ok(joined.includes('«entity»') && joined.includes('«interface»') && joined.includes('«enumeration»'))
  assert.ok(joined.includes('-name : String') && joined.includes('+speak() : void') && joined.includes('RED') && joined.includes('count : int') && joined.includes('#age : int'))
  assert.ok(joined.includes('owns') && joined.includes('0..*'))
  assert.ok(texts(r).includes('Domain Model'), 'package boundary title')
  assert.ok(r.items.some((item) => item.kind === 'rectangle' && item.dash === 'dashed'), 'boundary rectangle')
  assert.ok(joined.includes('good boy') && joined.includes('floating'))
  assert.equal(r.ignoredLines, 3) // skinparam, hide, the skinparam block
})

test('class output equals the Mermaid class import of the same model', () => {
  const plant = ok('@startuml\nclass Animal {\n  +name : String\n  +speak() : void\n}\nclass Dog\nAnimal <|-- Dog\n@enduml')
  const parsed = parseMermaidClass('classDiagram\nclass Animal {\n  +name : String\n  +speak() : void\n}\nclass Dog\nAnimal <|-- Dog')
  assert.equal(parsed.ok, true)
  const built = buildMermaidClassItems(parsed)
  assert.equal(JSON.stringify(plant.items), JSON.stringify(built.items))
})

test('class relationship directions and cardinalities', () => {
  const r = ok('Animal <|-- Dog\nCat --|> Animal\nA *-- B\nC --* D\nE o-- F\nG --> H\nI <.. J\nK <|.. L\nM "1" -- "*" N : has')
  const byLabel = connectors(r)
  assert.equal(byLabel.length, 9)
  const types = byLabel.map((c) => c.relationshipType)
  assert.deepEqual(types.slice(0, 4), ['inheritance', 'inheritance', 'composition', 'composition'])
  assert.equal(types[5], 'directed-association')
  assert.equal(types[6], 'dependency')
  assert.equal(types[7], 'realization')
  const json = JSON.stringify(byLabel[8])
  assert.ok(json.includes('"1"') || json.includes(':"1"'), json)
  assert.ok(json.includes('has'))
})

test('class: generics, aliases, direction hints and colored arrows', () => {
  const r = ok('class "Long Name" as L\nclass List<T>\nL -down-> List\nL -[#red]-> List : x\nclass Foo #palegreen\nclass Bar { }\nFoo : +run()')
  assert.equal(r.kind, 'class')
  assert.equal(r.boxes, 4)
  assert.equal(r.links, 2)
  const joined = JSON.stringify(r.items)
  assert.ok(joined.includes('Long Name') && joined.includes('List<T>') && joined.includes('+run()'))
})

test('class: self relation and unknown lines are counted', () => {
  const r = ok('@startuml\nclass A\nA --> A\nfoo bar baz\nset namespaceSeparator ::\nA : x\n@enduml')
  assert.equal(r.boxes, 1)
  assert.equal(r.links, 0)
  assert.equal(r.ignoredLines, 3)
})

test('sequence diagram: participants, messages, frames, notes, autonumber, ignored lines', () => {
  const r = ok(SEQUENCE_SAMPLE)
  assert.equal(r.kind, 'sequence')
  assert.equal(r.boxes, 4)
  assert.equal(r.links, 9)
  assert.equal(r.frames, 2)
  assert.equal(r.ignoredLines, 3) // activate, deactivate, skinparam
  const all = texts(r)
  assert.ok(all.includes('Web App') && all.includes('Event Queue') && all.includes('Login'))
  assert.ok(all.includes('1. open') && all.includes('9. retry'), 'autonumber')
  assert.ok(all.includes('alt: success') && all.includes('loop: 3 times') && all.includes('failure'))
  assert.ok(all.includes('sync') && all.includes('hello'))
})

test('sequence: arrow directions, dashed lines and heads', () => {
  const r = ok('A -> B : one\nB --> A : two\nA <- B : three\nA -\\ B : four')
  assert.equal(r.kind, 'sequence')
  const arrows = r.items.filter((item) => item.kind === 'stroke' && item.color !== '#6b7280')
  assert.equal(arrows.length, 4)
  assert.equal(arrows[1].dash, 'dashed')
  assert.equal(arrows[0].dash, undefined)
  const x = (stroke) => [stroke.points[0].x, stroke.points[1].x]
  const [aFrom, aTo] = x(arrows[0])
  const [cFrom, cTo] = x(arrows[2])
  assert.ok(aFrom < aTo, 'A -> B goes right')
  assert.ok(cFrom > cTo, 'A <- B goes left')
})

test('sequence: group frame, activation shorthand, long-name references', () => {
  const r = ok('participant "Payment Service" as P\nparticipant Client\nClient -> "Payment Service" ++ : pay\nP --> Client -- : done\ngroup My group [label]\n  Client -> P : again\nend')
  assert.equal(r.kind, 'sequence')
  assert.equal(r.boxes, 2)
  assert.equal(r.links, 3)
  assert.equal(r.frames, 1)
})

test('without markers: detection', () => {
  assert.equal(isPlantUmlText(SEQUENCE_SAMPLE), true)
  assert.equal(isPlantUmlText('class Foo\nclass Bar\nFoo <|-- Bar'), true)
  assert.equal(isPlantUmlText('participant Alice\nAlice -> Bob: hi'), true)
  assert.equal(isPlantUmlText('interface Repo {\n  +find()\n}'), false, 'a lone unmarked declaration with a body could be code (round 8)')
  assert.equal(isPlantUmlText("' c\n@startuml\nA -> B\n@enduml"), true)
})

test('detection never steals plain text or Mermaid', () => {
  for (const text of ['', 'hello world', 'class notes tomorrow\nbring a pen', 'class Foo\nthis is some prose about it\nand more prose\nand even more', 'actor', 'Alice -> Bob: hi', 'actor Brad Pitt was great\nin that film', 'graph TD\nA-->B', 'flowchart LR\nA[x] --> B', 'sequenceDiagram\nA->>B: hi', 'classDiagram\nclass A\nA <|-- B', 'erDiagram\nA ||--o{ B : has', 'stateDiagram-v2\n[*] --> A', '---\ntitle: x\n---\nflowchart TD\nA-->B', '%% c\ngraph LR\nA-->B', '@startmindmap\n* a\n@endmindmap']) {
    assert.equal(isPlantUmlText(text), false, JSON.stringify(text))
    assert.equal(mermaid.isMermaidText(text) && !/^\s*(?:---|%%|graph|flowchart|sequenceDiagram|classDiagram|erDiagram|stateDiagram)/.test(text), false, JSON.stringify(text))
  }
})

test('Mermaid dispatcher routes PlantUML and still builds Mermaid', () => {
  assert.equal(mermaid.isMermaidText('@startuml\nclass A\n@enduml'), true)
  const plant = mermaid.buildMermaidDiagram('@startuml\nclass A\nclass B\nA <|-- B\n@enduml')
  assert.equal(plant.ok, true)
  assert.equal(plant.kind, 'class')
  const sequence = mermaid.buildMermaidDiagram('@startuml\nA -> B : hi\n@enduml')
  assert.equal(sequence.kind, 'sequence')
  const flow = mermaid.buildMermaidDiagram('flowchart LR\nA --> B')
  assert.equal(flow.kind, 'flowchart')
})

test('errors', () => {
  assert.equal(buildPlantUml('@startuml\n@enduml').ok, false)
  assert.equal(buildPlantUml('@startuml\ntitle only\n@enduml').ok, false)
  assert.equal(buildPlantUml('@startuml\nparticipant\n@enduml').ok, false)
})

test('imported items survive the document format', () => {
  for (const text of [CLASS_SAMPLE, SEQUENCE_SAMPLE]) {
    const r = ok(text)
    assert.ok(r.items.length > 3)
    for (const item of r.items) assert.ok(item.kind)
  }
  assert.ok(doc)
})

test('wiring: dialog text and palette keywords mention PlantUML; paste uses the shared detector', async () => {
  const dialog = await readFile(new URL('../src/app/MermaidDialog.tsx', import.meta.url), 'utf8')
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(dialog, /Insert from Mermaid or PlantUML/)
  assert.match(dialog, /PlantUML class and sequence/)
  assert.match(app, /id: 'mermaid:insert'[^\n]*plantuml/)
  assert.match(app, /isMermaidText\(mermaidText\)/)
})

test('round 8 fix: unmarked TypeScript, Java and Kotlin code stays plain text; marked or linked PlantUML still imports', () => {
  const ts = 'interface Props {\n  name: string\n  age: number\n}'
  const java = 'class Order {\n  private int id;\n  public void pay() {\n  }\n}'
  const kotlin = 'enum Color {\n  RED,\n  GREEN\n}'
  const tsClass = 'class Cart {\n  items: string[] = []\n}'
  for (const code of [ts, java, kotlin, tsClass]) assert.equal(isPlantUmlText(code), false, code)
  assert.equal(isPlantUmlText('@startuml\nclass Order {\n  +id: int\n}\n@enduml'), true)
  assert.equal(isPlantUmlText('class A\nclass B\nA --> B'), true)
  assert.equal(isPlantUmlText('class A {\n}\nclass B {\n}'), true)
})
