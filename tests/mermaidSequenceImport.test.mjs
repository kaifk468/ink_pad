import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const { isMermaidSequenceText, buildMermaidSequence } = await loadModule('mermaidSequenceImport.ts')
const doc = await loadModule('documentFormat.ts')

const build = (text) => {
  const result = buildMermaidSequence(text)
  assert.equal(result.ok, true, JSON.stringify(result))
  return result
}
const rects = (r) => r.items.filter((i) => i.kind === 'rectangle')
const texts = (r) => r.items.filter((i) => i.kind === 'text')
const strokes = (r) => r.items.filter((i) => i.kind === 'stroke')
const lifelines = (r) => strokes(r).filter((s) => s.color === '#6b7280')
const arrows = (r) => strokes(r).filter((s) => s.color !== '#6b7280')
const textOf = (r, value) => texts(r).find((t) => t.text === value)

test('detection', () => {
  assert.equal(isMermaidSequenceText('sequenceDiagram\nA->>B: hi'), true)
  assert.equal(isMermaidSequenceText('%% c\n\n  sequenceDiagram'), true)
  assert.equal(isMermaidSequenceText('---\ntitle: x\n---\nsequenceDiagram\nA->>B: hi'), true)
  assert.equal(isMermaidSequenceText('flowchart TD\nA-->B'), false)
  assert.equal(isMermaidSequenceText('A->>B: hi'), false)
  assert.equal(isMermaidSequenceText(''), false)
})

test('errors', () => {
  assert.equal(buildMermaidSequence('flowchart TD\nA-->B').ok, false)
  assert.deepEqual(buildMermaidSequence('sequenceDiagram\n%% nothing\n'), { ok: false, error: 'No participants found' })
})

test('participants, aliases, actors and implicit order', () => {
  const r = build('sequenceDiagram\nparticipant A as Alice\nactor U as User\nA->>B: hi\nC->>A: yo')
  assert.equal(r.boxes, 4)
  assert.equal(r.kind, 'sequence')
  assert.deepEqual(texts(r).slice(0, 4).map((t) => t.text), ['Alice', 'User', 'B', 'C'])
  const [alice, user, b, c] = rects(r).slice(0, 4)
  assert.ok(alice.x < user.x && user.x < b.x && b.x < c.x)
  assert.equal(user.hldShape, 'user')
  assert.equal(alice.hldShape, undefined)
  assert.equal(lifelines(r).length, 4)
})

test('alias declared after first use keeps order', () => {
  const r = build('sequenceDiagram\nA->>B: x\nparticipant B as Bob')
  assert.deepEqual(texts(r).slice(0, 2).map((t) => t.text), ['A', 'Bob'])
})

test('message kinds: dash and arrowheads', () => {
  const r = build('sequenceDiagram\nA->>B: a\nA-->>B: b\nA->B: c\nA-->B: d\nA-xB: e\nA--xB: f\nA-)B: g\nA--)B: h\nA->>+B: i\nB-->>-A: j')
  assert.equal(r.links, 10)
  assert.deepEqual(arrows(r).map((s) => [s.shape, s.dash ?? 'solid', s.arrowheads]), [
    ['arrow', 'solid', 'end'], ['arrow', 'dashed', 'end'], ['line', 'solid', 'none'], ['line', 'dashed', 'none'],
    ['arrow', 'solid', 'end'], ['arrow', 'dashed', 'end'], ['arrow', 'solid', 'end'], ['arrow', 'dashed', 'end'],
    ['arrow', 'solid', 'end'], ['arrow', 'dashed', 'end'],
  ])
  assert.equal(r.ignoredLines, 0)
})

test('arrows run from lifeline to lifeline, rows top to bottom', () => {
  const r = build('sequenceDiagram\nA->>B: one\nB->>A: two')
  const [one, two] = arrows(r)
  assert.ok(one.points[1].x > one.points[0].x)
  assert.ok(two.points[1].x < two.points[0].x)
  assert.ok(two.points[0].y > one.points[0].y)
  assert.equal(one.points[0].y, one.points[1].y)
  assert.equal(one.points[0].x, lifelines(r)[0].points[0].x)
  assert.equal(one.points[1].x, lifelines(r)[1].points[0].x)
})

test('labels sit just above their arrow between the right lifelines', () => {
  const r = build('sequenceDiagram\nA->>B: hello\nB->>C: world')
  const [ab, bc] = arrows(r)
  const hello = textOf(r, 'hello')
  const world = textOf(r, 'world')
  assert.equal(hello.align, 'center')
  assert.ok(hello.y + hello.height <= ab.points[0].y)
  assert.ok(ab.points[0].y - (hello.y + hello.height) < 20)
  assert.ok(Math.abs(hello.x + hello.width / 2 - (ab.points[0].x + ab.points[1].x) / 2) <= 1)
  assert.ok(world.x >= bc.points[0].x && world.x + world.width <= bc.points[1].x)
})

test('self message is a three-stroke loop with a label to its right', () => {
  const r = build('sequenceDiagram\nA->>A: think\nA-->>B: go')
  const [s1, s2, s3, go] = arrows(r)
  assert.equal(s1.points[0].x, lifelines(r)[0].points[0].x)
  assert.ok(s1.points[1].x > s1.points[0].x)
  assert.ok(s2.points[1].y > s2.points[0].y)
  assert.equal(s3.arrowheads, 'end')
  assert.equal(s3.points[1].x, s1.points[0].x)
  assert.equal(go.dash, 'dashed')
  assert.ok(textOf(r, 'think').x > s1.points[1].x)
  assert.ok(go.points[0].y > s3.points[0].y)
})

test('notes over, left of and right of', () => {
  const r = build('sequenceDiagram\nA->>B: x\nNote over A: solo\nNote over A,B: both\nNote left of A: l\nNote right of B: r')
  const notes = rects(r).filter((n) => n.fillColor)
  assert.equal(notes.length, 4)
  const [a, b] = rects(r).slice(0, 2)
  const ac = a.x + a.width / 2
  const bc = b.x + b.width / 2
  const [solo, both, left, right] = notes
  assert.ok(solo.x < ac && solo.x + solo.width > ac)
  assert.ok(both.x < ac && both.x + both.width > bc)
  assert.ok(left.x + left.width <= ac)
  assert.ok(right.x >= bc)
  assert.ok(solo.y > a.y + a.height)
  assert.equal(textOf(r, 'both').align, 'center')
  assert.ok(Math.min(...r.items.filter((i) => i.kind !== 'stroke').map((i) => i.x)) >= 0)
  assert.equal(r.links, 1)
})

test('autonumber and title', () => {
  const r = build('sequenceDiagram\ntitle: My flow\nautonumber\nA->>B: first\nB->>A: second\nA->>B')
  assert.ok(textOf(r, '1. first') && textOf(r, '2. second') && textOf(r, '3.'))
  assert.ok(textOf(r, 'My flow').y < rects(r)[0].y)
  assert.equal(r.ignoredLines, 0)
})

test('skipped lines are counted, blank and comment lines are not', () => {
  const r = build('sequenceDiagram\n%% c\n\nA->>B: x\nloop Every min\nB->>A: y\nend\nactivate A\ndeactivate A\nalt ok\nelse no\nend\nbox Blue\ncreate participant Z\ndestroy Z\nfoo bar')
  assert.equal(r.ignoredLines, 11)
  assert.equal(r.links, 2)
  assert.equal(r.boxes, 2)
})

test('text cleaning', () => {
  const r = build('sequenceDiagram\nparticipant A as "Web<br>App"\nA->>B: a#quot;b#quot;<br/>c')
  assert.ok(textOf(r, 'Web\nApp'))
  assert.ok(textOf(r, 'a"b"\nc'))
})

test('caps on participants and messages', () => {
  const many = Array.from({ length: 33 }, (_, i) => `participant P${i}`).join('\n')
  const a = build(`sequenceDiagram\n${many}\nP0->>P40: x\nP0->>P1: y`)
  assert.equal(a.boxes, 30)
  assert.equal(a.ignoredLines, 4)
  const b = build(`sequenceDiagram\n${Array.from({ length: 205 }, () => 'A->>B: m').join('\n')}`)
  assert.equal(b.links, 200)
  assert.equal(b.ignoredLines, 5)
})

test('layout: no overlapping boxes, lifelines reach below the last message', () => {
  const r = build('sequenceDiagram\nparticipant A\nparticipant B\nparticipant C\nA->>C: a rather long message label to fit between\nC->>A: back\nA->>A: self')
  const boxes = rects(r).slice(0, 3)
  for (let i = 1; i < boxes.length; i += 1) {
    assert.ok(boxes[i].x >= boxes[i - 1].x + boxes[i - 1].width + 20)
    assert.ok(boxes[i].x + boxes[i].width / 2 - (boxes[i - 1].x + boxes[i - 1].width / 2) >= 220)
  }
  const lowest = Math.max(...arrows(r).flatMap((s) => s.points.map((p) => p.y)))
  boxes.forEach((box, i) => {
    const line = lifelines(r)[i]
    assert.equal(line.shape, 'line')
    assert.equal(line.dash, 'dashed')
    assert.equal(line.points[0].x, Math.round(box.x + box.width / 2))
    assert.equal(line.points[0].y, box.y + box.height)
    assert.ok(line.points[1].y > lowest)
  })
  const long = textOf(r, 'a rather long message label to fit between')
  const first = arrows(r)[0]
  assert.ok(long.x >= first.points[0].x && long.x + long.width <= first.points[1].x)
  assert.ok(Math.min(...r.items.filter((i) => i.kind !== 'stroke').map((i) => i.x)) >= 0)
})

test('ids are local, unique per kind and start at 1', () => {
  const r = build('sequenceDiagram\nactor U\nU->>S: x\nNote over S: n\nS->>S: y')
  for (const kind of ['stroke', 'rectangle', 'text']) {
    const ids = r.items.filter((i) => i.kind === kind).map((i) => i.id).sort((a, b) => a - b)
    assert.deepEqual(ids, ids.map((_, i) => i + 1), kind)
  }
})

test('built items survive saving and loading unchanged', () => {
  const r = build('sequenceDiagram\ntitle: T\nautonumber\nactor U as User\nparticipant S as Service\nU->>+S: req\nS-->>-U: res\nS->>S: self\nNote over U,S: n\nNote left of U: l')
  const saved = doc.createDocument({ template: 'blank', background: 'white', items: r.items })
  const parsed = doc.parseDocument(doc.stringifyDocument(saved))
  assert.deepEqual((parsed.document ?? parsed).items, r.items)
  for (const item of r.items) assert.deepEqual(doc.sanitizeItem(JSON.parse(JSON.stringify(item))), item)
})
