import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { buildMermaid } = await loadModule('mermaidExport.ts')
const { buildMermaidSequence } = await loadModule('mermaidSequenceImport.ts')
const app = await readAppSource()

const source = `sequenceDiagram
title Checkout flow
actor U as User
participant W as Web app
participant S as Order Service
participant D as Database
U->>W: Click pay
W->>S: POST /orders
activate S
S-->>W: 202 Accepted
loop every 5s
  W->>S: Poll status
  alt paid
    S-->>W: done
  else failed
    S-->>W: error
  end
end
S->>S: Validate
S-x D: Save
Note over S,D: Transaction
Note left of U: Customer
Note right of D: Replicated
D-->D: compact
opt receipt
  W->>U: Email
end
`

const imported = (text) => {
  const result = buildMermaidSequence(text)
  assert.equal(result.ok, true, JSON.stringify(result))
  return result
}
const exported = (items) => buildMermaid(items)

test('a sequence page copies as sequenceDiagram text', () => {
  const built = imported(source)
  const result = exported(built.items)
  assert.equal(result.kind, 'sequence')
  assert.equal(result.boxes, 4)
  assert.equal(result.links, built.links)
  const lines = result.text.split('\n').map((line) => line.trim())
  assert.equal(lines[0], 'sequenceDiagram')
  assert.ok(lines.includes('title Checkout flow'))
  assert.deepEqual(lines.filter((line) => /^(participant|actor)/.test(line)), ['actor User', 'participant Web_app as Web app', 'participant Order_Service as Order Service', 'participant Database'])
  // messages top to bottom with the right arrows
  const body = lines.filter((line) => /->|-->/.test(line) && !line.startsWith('participant') && !line.startsWith('actor'))
  assert.deepEqual(body, [
    'User->>Web_app: Click pay',
    'Web_app->>Order_Service: POST /orders',
    'Order_Service-->>Web_app: 202 Accepted',
    'Web_app->>Order_Service: Poll status',
    'Order_Service-->>Web_app: done',
    'Order_Service-->>Web_app: error',
    'Order_Service->>Order_Service: Validate',
    'Order_Service->>Database: Save',
    'Database-->Database: compact',
    'Web_app->>User: Email',
  ])
  assert.ok(lines.includes('loop every 5s'))
  assert.ok(lines.includes('alt paid'))
  assert.ok(lines.includes('else failed'))
  assert.ok(lines.includes('opt receipt'))
  assert.equal(lines.filter((line) => line === 'end').length, 3)
  assert.ok(lines.includes('Note over Order_Service,Database: Transaction'))
  assert.ok(lines.includes('Note left of User: Customer'))
  assert.ok(lines.includes('Note right of Database: Replicated'))
  assert.equal(result.skipped, false)
  // frame order: loop opens before its first message, alt before its first inner message, ends after
  assert.ok(lines.indexOf('loop every 5s') < lines.indexOf('alt paid') && lines.indexOf('alt paid') < lines.indexOf('else failed'))
})

test('round trip: import, export, import again gives the same diagram', () => {
  const first = imported(source)
  const text1 = exported(first.items).text
  const second = imported(text1)
  const text2 = exported(second.items).text
  assert.equal(text2, text1)
  assert.equal(second.boxes, first.boxes)
  assert.equal(second.links, first.links)
  assert.equal(second.frames, first.frames)
  // and a third pass is stable too
  assert.equal(exported(imported(text2).items).text, text1)
})

test('autonumber, self messages and special characters survive', () => {
  const text = 'sequenceDiagram\nautonumber\nparticipant A\nparticipant B\nA->>B: one; two #quot;q#quot;\nB->>B: self\nB-->>A: back<br/>line2\nloop x\nA->>B: again\nend'
  const first = imported(text)
  const out = exported(first.items).text
  assert.match(out, /autonumber/)
  assert.match(out, /A->>B: one#59; two #quot;q#quot;/)
  assert.match(out, /B->>B: self/)
  assert.match(out, /B-->>A: back<br\/>line2/)
  const again = imported(out)
  assert.equal(exported(again.items).text, out)
  assert.equal(again.links, first.links)
})

test('frames: par with and, critical with option, empty-label frames, nesting', () => {
  const text = 'sequenceDiagram\nA->>B: start\npar left\n  A->>B: one\nand right\n  A->>B: two\nend\ncritical lock\n  B->>A: ok\noption fail\n  B->>A: no\nend\nloop outer\n  opt inner\n    A->>B: deep\n  end\nend'
  const first = imported(text)
  const out = exported(first.items).text
  const lines = out.split('\n').map((line) => line.trim())
  for (const expected of ['par left', 'and right', 'critical lock', 'option fail', 'loop outer', 'opt inner']) assert.ok(lines.includes(expected), expected)
  assert.equal(lines.filter((line) => line === 'end').length, 4)
  const again = imported(out)
  assert.equal(again.frames, first.frames)
  assert.equal(exported(again.items).text, out)
})

test('non-sequence pages are unchanged', () => {
  const a = { kind: 'rectangle', id: 1, x: 0, y: 0, width: 200, height: 100, strokeColor: '#000', strokeWidth: 3 }
  const b = { ...a, id: 2, x: 400 }
  const c = { kind: 'connector', id: 1, start: { x: 200, y: 50, pressure: 1 }, end: { x: 400, y: 50, pressure: 1 }, strokeColor: '#000', strokeWidth: 3, relationshipType: 'directed-association', reversed: false, startAttachment: { rectangleId: 1, offsetX: 200, offsetY: 50 }, endAttachment: { rectangleId: 2, offsetX: 0, offsetY: 50 } }
  const result = exported([a, b, c])
  assert.equal(result.kind, 'flowchart')
  assert.match(result.text, /^flowchart LR/)
  // one dashed vertical line under one box is not a sequence page
  const line = { kind: 'stroke', id: 1, points: [{ x: 100, y: 100, pressure: 1 }, { x: 100, y: 400, pressure: 1 }], color: '#6b7280', width: 2, erase: false, shape: 'line', dash: 'dashed', arrowheads: 'none' }
  assert.equal(exported([a, b, c, line]).kind, 'flowchart')
  assert.equal(exported([]).kind, 'flowchart')
})

test('extra content on a sequence page is reported as skipped', () => {
  const built = imported('sequenceDiagram\nA->>B: hi')
  const extra = { kind: 'text', id: 99, x: 5000, y: 5000, width: 80, height: 24, text: 'stray', fontSize: 18, color: '#000' }
  const result = exported([...built.items, extra])
  assert.equal(result.kind, 'sequence')
  assert.equal(result.skipped, true)
  assert.doesNotMatch(result.text, /stray/)
})

test('App toast and wiring know the sequence kind', async () => {
  assert.match(app, /result\.kind === 'sequence'/)
  const mod = await readFile(new URL('../src/mermaidExport.ts', import.meta.url), 'utf8')
  assert.match(mod, /buildMermaidSequenceText/)
})
