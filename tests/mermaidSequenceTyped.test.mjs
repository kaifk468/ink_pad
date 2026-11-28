import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const { buildMermaid } = await loadModule('mermaidExport.ts')
const { buildMermaidSequence } = await loadModule('mermaidSequenceImport.ts')

const imported = (text) => {
  const result = buildMermaidSequence(text)
  assert.equal(result.ok, true, JSON.stringify(result))
  return result
}
const shapesOf = (items) => items.filter((item) => item.kind === 'rectangle' && !item.fillColor && !item.dash).map((item) => item.hldShape)

test('typed participants: database / queue / actor are written and read back (Mermaid 11 @{ type })', () => {
  const text = `sequenceDiagram
actor U as User
participant Q@{ "type": "queue" } as Order queue
participant D@{ "type" : "database" } as Orders DB
participant S
U->>Q: enqueue
Q->>S: pop
S->>D: save
`
  const built = imported(text)
  const kinds = shapesOf(built.items)
  assert.deepEqual(kinds, ['user', 'queue', 'database', undefined])
  const out = buildMermaid(built.items).text
  const lines = out.split('\n').map((line) => line.trim())
  assert.ok(lines.includes('actor User'), out)
  assert.ok(lines.includes('participant Order_queue@{ "type": "queue" } as Order queue'), out)
  assert.ok(lines.includes('participant Orders_DB@{ "type": "database" } as Orders DB'), out)
  assert.ok(lines.includes('participant S'), out)
  assert.deepEqual(shapesOf(imported(out).items), kinds)
})

test('importer reads @{ type } variations; other types stay plain boxes', () => {
  const shapes = (config) => shapesOf(imported(`sequenceDiagram\nparticipant A${config}\nparticipant B\nA->>B: x`).items)
  assert.deepEqual(shapes("@{ 'type': 'database' }"), ['database', undefined])
  assert.deepEqual(shapes('@{"type":"queue"}'), ['queue', undefined])
  assert.deepEqual(shapes(' @{ type: database }'), ['database', undefined])
  for (const type of ['collections', 'entity', 'boundary', 'control']) assert.deepEqual(shapes(`@{ "type": "${type}" }`), [undefined, undefined])
  const actor = imported('sequenceDiagram\nactor A\nparticipant B\nA->>B: x')
  assert.deepEqual(shapesOf(actor.items), ['user', undefined])
})
