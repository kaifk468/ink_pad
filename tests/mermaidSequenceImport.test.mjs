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

test('cross and async arrows (-x, --x, -), --)) are messages; double dash is dashed', () => {
  const r = build('sequenceDiagram\nA-xB: lost\nA--xB: lost dashed\nA-)B: async\nA--)B: async dashed\nA->>B: plain')
  assert.equal(r.links, 5)
  assert.equal(r.ignoredLines, 0)
  assert.deepEqual(arrows(r).map((s) => [s.dash ?? 'solid', s.arrowheads]), [['solid', 'end'], ['dashed', 'end'], ['solid', 'end'], ['dashed', 'end'], ['solid', 'end']])
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
  const r = build('sequenceDiagram\n%% c\n\nA->>B: x\nloop Every min\nB->>A: y\nend\nactivate A\ndeactivate A\nalt ok\nelse no\nend\nend\nelse x\nbox Blue\ncreate participant Z\ndestroy Z\nfoo bar')
  assert.equal(r.ignoredLines, 8) // activate, deactivate, box, create, destroy, foo bar, plus a stray end and a stray else
  assert.equal(r.frames, 1) // the loop; the empty alt is skipped
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

const frameRects = (r) => rects(r).filter((i) => i.dash === 'dashed')

test('each participant box, its label and its lifeline share one group; groups differ per participant', () => {
  const r = build('sequenceDiagram\nparticipant A\nactor B\nA->>B: hi')
  const groups = new Map()
  for (const i of r.items) if (i.group !== undefined) groups.set(i.group, [...(groups.get(i.group) ?? []), i.kind + (i.color === '#6b7280' ? ':lifeline' : '')])
  assert.equal(groups.size, 2)
  for (const members of groups.values()) assert.deepEqual([...members].sort(), ['rectangle', 'stroke:lifeline', 'text'])
  assert.equal(lifelines(r).every((l) => l.group !== undefined), true)
  assert.equal(arrows(r).some((a) => a.group !== undefined), false)
})

test('imported groups are renumbered when pasted next to existing groups', async () => {
  const { pasteItems } = await loadModule('clipboard.ts')
  const r = build('sequenceDiagram\nA->>B: hi')
  const existing = [{ kind: 'text', id: 1, x: 0, y: 0, width: 5, height: 5, text: 'x', fontSize: 10, color: '#000', group: 1 }, { kind: 'text', id: 2, x: 0, y: 0, width: 5, height: 5, text: 'y', fontSize: 10, color: '#000', group: 2 }]
  const out = pasteItems(r.items, { stroke: 1, rectangle: 1, connector: 1, text: 3 }, 20, { x: 0, y: 0, width: 5000, height: 5000 }, null, existing)
  const groups = new Set(out.items.filter((i) => i.group !== undefined).map((i) => i.group))
  assert.deepEqual([...groups].sort(), [3, 4])
})

test('loop, alt with else, nested frames become dashed boundaries with labels and dividers', () => {
  const r = build('sequenceDiagram\nparticipant A\nparticipant B\nparticipant C\nA->>B: before\nloop every 5 s\nA->>B: ping\nalt ok\nB->>C: yes\nelse failed\nB->>C: no\nend\nend\nC->>A: after')
  assert.equal(r.frames, 2)
  const frames = frameRects(r)
  assert.equal(frames.length, 2)
  const [outer, inner] = frames
  assert.ok(inner.x > outer.x && inner.y > outer.y && inner.x + inner.width < outer.x + outer.width && inner.y + inner.height < outer.y + outer.height)
  assert.equal(r.items.indexOf(outer) < r.items.indexOf(lifelines(r)[0]), true) // behind everything
  assert.equal(outer.fillColor, undefined)
  assert.ok(textOf(r, 'loop: every 5 s'))
  assert.ok(textOf(r, 'alt: ok'))
  const label = textOf(r, 'loop: every 5 s')
  assert.ok(label.x >= outer.x && label.y >= outer.y && label.y < outer.y + 30)
  const divider = strokes(r).find((s) => s.dash === 'dashed' && s.color !== '#6b7280' && s.points[0].y === s.points[1].y)
  assert.ok(divider && divider.points[0].y > inner.y && divider.points[0].y < inner.y + inner.height)
  assert.ok(textOf(r, 'failed'))
  // the loop frame holds ping, yes, no but not before / after
  const arrowYs = (text) => textOf(r, text).y
  assert.ok(arrowYs('ping') > outer.y && arrowYs('no') < outer.y + outer.height)
  assert.ok(arrowYs('before') < outer.y && arrowYs('after') > outer.y + outer.height)
  // spans only the touched participants: the loop covers A, B and C (via nested), the alt covers B and C only
  const centre = (id) => { const t = textOf(r, id); return t.x + t.width / 2 }
  assert.ok(inner.x > centre('A') && inner.x < centre('B'))
  assert.ok(outer.x < centre('A'))
})

test('frame labels never overlap the first message label inside', () => {
  const r = build('sequenceDiagram\nA->>B: x\nopt maybe\nB->>A: inside\nend')
  const label = textOf(r, 'opt: maybe')
  const msg = textOf(r, 'inside')
  assert.ok(label.y + label.height < msg.y)
})

test('par / and, critical / option, break, rect and empty frames', () => {
  const r = build('sequenceDiagram\nA->>B: x\npar left\nA->>B: l\nand right\nB->>A: r\nend\ncritical connect\nA->>B: c\noption timeout\nB->>A: t\nend\nbreak stop\nA->>B: b\nend\nrect rgb(0, 255, 0)\nA->>B: q\nend\nloop nothing\nend')
  assert.equal(r.frames, 4)
  assert.equal(r.ignoredLines, 0)
  for (const t of ['par: left', 'right', 'critical: connect', 'timeout', 'break: stop']) assert.ok(textOf(r, t), t)
  assert.equal(texts(r).some((t) => t.text.startsWith('rect') || t.text.startsWith('loop')), false)
  assert.equal(frameRects(r).length, 4)
  const bare = build('sequenceDiagram\nA->>B: x\nloop\nB->>A: y\nend')
  assert.ok(textOf(bare, 'loop'))
})

test('a frame left open closes at the end; frames do not disturb ids or saving', () => {
  const r = build('sequenceDiagram\nA->>B: x\nloop forever\nB->>A: y')
  assert.equal(r.frames, 1)
  for (const kind of ['stroke', 'rectangle', 'text']) {
    const ids = r.items.filter((i) => i.kind === kind).map((i) => i.id).sort((a, b) => a - b)
    assert.deepEqual(ids, ids.map((_, i) => i + 1), kind)
  }
  const saved = doc.createDocument({ template: 'blank', background: 'white', items: r.items })
  const parsed = doc.parseDocument(doc.stringifyDocument(saved))
  assert.deepEqual((parsed.document ?? parsed).items, r.items)
})
