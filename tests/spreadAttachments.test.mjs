import assert from 'node:assert/strict'
import test from 'node:test'

import { loadModule } from './helpers/loadModule.mjs'

const sp = await loadModule('spreadAttachments.ts')
const mermaid = await loadModule('mermaidImport.ts')

const box = (id, x, y, extra = {}) => ({ kind: 'rectangle', id, x, y, width: 100, height: 60, strokeColor: '#000', strokeWidth: 2, ...extra })
const conn = (id, from, fromSide, to, toSide) => {
  const at = (b, side) => ({ rectangleId: b.id, offsetX: side === 'right' ? b.width : side === 'left' ? 0 : b.width / 2, offsetY: side === 'bottom' ? b.height : side === 'top' ? 0 : b.height / 2 })
  const a = at(from, fromSide), z = at(to, toSide)
  return { kind: 'connector', id, start: { x: from.x + a.offsetX, y: from.y + a.offsetY, pressure: 1 }, end: { x: to.x + z.offsetX, y: to.y + z.offsetY, pressure: 1 }, strokeColor: '#000', strokeWidth: 2, relationshipType: 'association', reversed: false, startAttachment: a, endAttachment: z }
}
const endsOn = (items, rectangleId) => items.filter((i) => i.kind === 'connector').flatMap((c) => [c.startAttachment, c.endAttachment]).filter((a) => a.rectangleId === rectangleId)
const distinct = (list) => new Set(list.map((a) => `${a.offsetX},${a.offsetY}`)).size === list.length

test('two ends on one side are spread at 1/3 and 2/3, ordered by the other end', () => {
  const hub = box(1, 100, 0), left = box(2, 0, 200), right = box(3, 300, 200)
  // The connector to the right box is listed first but must land on the right-hand slot.
  const items = [hub, left, right, conn(1, hub, 'bottom', right, 'top'), conn(2, hub, 'bottom', left, 'top')]
  const out = sp.spreadConnectorAttachments(items)
  const toRight = out[3], toLeft = out[4]
  assert.ok(Math.abs(toLeft.startAttachment.offsetX - 100 / 3) < 1e-9)
  assert.ok(Math.abs(toRight.startAttachment.offsetX - 200 / 3) < 1e-9)
  assert.equal(toLeft.startAttachment.offsetY, 60)
  assert.ok(Math.abs(toLeft.start.x - (100 + 100 / 3)) < 1e-9 && toLeft.start.y === 60)
  assert.deepEqual(toLeft.end, items[4].end, 'a lone end on the other box keeps its midpoint')
  assert.equal(items[3].startAttachment.offsetX, 50, 'input not mutated')
})

test('single ends come back unchanged; ellipses and diamonds are skipped', () => {
  const a = box(1, 0, 0), b = box(2, 200, 0)
  const items = [a, b, conn(1, a, 'right', b, 'left')]
  assert.equal(sp.spreadConnectorAttachments(items), items)
  const e = box(3, 0, 200, { ellipse: true }), d = box(4, 0, 400, { diamond: true })
  const out = sp.spreadConnectorAttachments([a, e, d, conn(1, a, 'bottom', e, 'top'), conn(2, a, 'bottom', d, 'top')])
  assert.equal(out[3].endAttachment.offsetX, 50)
  assert.equal(out[4].endAttachment.offsetX, 50)
  assert.notEqual(out[3].startAttachment.offsetX, 50, 'the plain box side is still spread')
})

test('three ends spread at 1/4, 1/2, 3/4', () => {
  const hub = box(1, 0, 0), t = [box(2, -200, 200), box(3, 0, 200), box(4, 200, 200)]
  const out = sp.spreadConnectorAttachments([hub, ...t, ...t.map((b, i) => conn(i + 1, hub, 'bottom', b, 'top'))])
  assert.deepEqual([4, 5, 6].map((i) => out[i].startAttachment.offsetX), [25, 50, 75])
})

test('class import: the Invoice example attaches at distinct points, points match offsets', () => {
  const result = mermaid.buildMermaidDiagram('classDiagram\n  class Customer\n  class Invoice\n  class Payment\n  Customer "1" --> "*" Invoice : owns\n  Invoice "1" *-- "1..*" Payment')
  assert.ok(result.ok)
  const invoice = result.items.find((i) => i.kind === 'rectangle' && i.classBox?.name === 'Invoice')
  const mine = endsOn(result.items, invoice.id)
  assert.equal(mine.length, 2)
  assert.ok(distinct(mine), 'no two ends share a point')
  for (const c of result.items.filter((i) => i.kind === 'connector')) {
    for (const [end, a] of [['start', c.startAttachment], ['end', c.endAttachment]]) {
      const b = result.items.find((i) => i.kind === 'rectangle' && i.id === a.rectangleId)
      assert.equal(c[end].x, b.x + a.offsetX)
      assert.equal(c[end].y, b.y + a.offsetY)
    }
  }
})

test('er, flowchart and state imports spread shared sides', () => {
  const er = mermaid.buildMermaidDiagram('erDiagram\n  ORDER ||--o{ LINE_ITEM : has\n  PRODUCT ||--o{ LINE_ITEM : in')
  assert.ok(er.ok)
  const lineItem = er.items.find((i) => i.kind === 'rectangle' && i.classBox?.name === 'LINE_ITEM')
  assert.ok(distinct(endsOn(er.items, lineItem.id)))
  const flow = mermaid.buildMermaidDiagram('flowchart TD\n  A[Top] --> B[One]\n  A --> C[Two]')
  assert.ok(flow.ok)
  const top = flow.items.find((i) => i.kind === 'rectangle')
  assert.ok(distinct(endsOn(flow.items, top.id)))
  const st = mermaid.buildMermaidDiagram('stateDiagram-v2\n  A --> B\n  A --> C')
  assert.ok(st.ok)
  const a = st.items.find((i) => i.kind === 'rectangle')
  assert.ok(distinct(endsOn(st.items, a.id)))
})
