import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const { parseMermaidState } = await loadModule('mermaidStateImport.ts')
const { buildMermaidDiagram, isMermaidText, mermaidInsertMessage } = await loadModule('mermaidImport.ts')
const doc = await loadModule('documentFormat.ts')

const ok = (text) => {
  const r = parseMermaidState(text)
  assert.equal(r.ok, true, JSON.stringify(r))
  return r
}
const built = (text) => {
  const r = buildMermaidDiagram(text)
  assert.equal(r.ok, true, JSON.stringify(r))
  return r
}
const rects = (r) => r.items.filter((i) => i.kind === 'rectangle')
const texts = (r) => r.items.filter((i) => i.kind === 'text')
const connectors = (r) => r.items.filter((i) => i.kind === 'connector')
const labelOf = (r, box) => texts(r).find((t) => t.x >= box.x && t.x + t.width <= box.x + box.width && t.y >= box.y && t.y + t.height <= box.y + box.height)
const inside = (outer, inner) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

const BASIC = 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running : start\n  Running --> Idle : stop\n  Running --> [*]'

test('states, start and end nodes, labelled transitions', () => {
  const g = ok(BASIC)
  assert.deepEqual(g.states.map((s) => [s.id, s.kind]), [['[*]start', 'start'], ['Idle', 'state'], ['Running', 'state'], ['[*]end', 'end']])
  assert.deepEqual(g.transitions.map((t) => [t.from, t.to, t.label]), [['[*]start', 'Idle', undefined], ['Idle', 'Running', 'start'], ['Running', 'Idle', 'stop'], ['Running', '[*]end', undefined]])
  assert.equal(g.direction, 'TB')
  assert.equal(g.ignoredLines, 0)
})

test('built items: rounded state boxes, filled start circle, thick end circle, directed connectors', () => {
  const r = built(BASIC)
  assert.equal(r.kind, 'state')
  assert.deepEqual([r.boxes, r.links, r.ignoredLines], [2, 4, 0])
  const boxes = rects(r)
  const circles = boxes.filter((b) => b.ellipse)
  const states = boxes.filter((b) => !b.ellipse)
  assert.equal(circles.length, 2)
  assert.equal(states.length, 2)
  assert.ok(states.every((b) => b.rounded === true))
  assert.deepEqual(states.map((b) => labelOf(r, b).text), ['Idle', 'Running'])
  assert.ok(states.every((b) => labelOf(r, b).align === 'center'))
  const [start, end] = circles
  assert.deepEqual([start.width, start.height, start.fillColor], [24, 24, start.strokeColor])
  assert.deepEqual([end.width, end.height], [26, 26])
  assert.ok(end.fillColor && end.strokeWidth > start.strokeWidth)
  assert.equal(texts(r).length, 2, 'circles have no label')
  for (const c of connectors(r)) {
    assert.equal(c.relationshipType, 'directed-association')
    assert.ok(c.startAttachment && c.endAttachment)
  }
  assert.deepEqual(connectors(r).map((c) => c.label), [undefined, 'start', 'stop', undefined])
  // top-down: the start circle is above Idle, which is above Running
  const idle = states[0]
  const running = states[1]
  assert.ok(start.y < idle.y && idle.y < running.y)
  assert.equal(Math.min(...boxes.map((b) => b.x)), 0)
  assert.equal(Math.min(...boxes.map((b) => b.y)), 0)
})

test('one shared start and end at top level, separate ones inside a composite', () => {
  const g = ok('stateDiagram-v2\n[*] --> A\n[*] --> B\nA --> [*]\nB --> [*]\nstate X {\n  [*] --> C\n  C --> [*]\n}\nA --> X')
  assert.equal(g.states.filter((s) => s.kind === 'start').length, 2)
  assert.equal(g.states.filter((s) => s.kind === 'end').length, 2)
  assert.deepEqual(g.states.filter((s) => s.kind === 'start').map((s) => s.parent), [null, 'X'])
})

test('state "Long name" as A, descriptions, and bare declarations', () => {
  const g = ok('stateDiagram\nstate "Waiting for input" as W\nW : first line\nW : second line\nX\nW --> X')
  assert.equal(g.states[0].label, 'Waiting for input')
  assert.deepEqual(g.states[0].description, ['first line', 'second line'])
  const r = built('stateDiagram\nstate "Waiting for input" as W\nW : first line\nW --> X')
  const box = rects(r).find((b) => b.rounded)
  assert.equal(labelOf(r, box).text, 'Waiting for input\nfirst line')
})

test('choice is a small diamond, fork and join are filled bars', () => {
  const r = built('stateDiagram-v2\nstate C <<choice>>\nstate F <<fork>>\nstate J <<join>>\nA --> F\nF --> B\nF --> D\nB --> J\nD --> J\nJ --> C\nC --> E : yes')
  const boxes = rects(r)
  const diamond = boxes.filter((b) => b.diamond)
  assert.equal(diamond.length, 1)
  assert.ok(diamond[0].width <= 60 && diamond[0].height <= 60)
  const bars = boxes.filter((b) => !b.rounded && !b.diamond && !b.ellipse)
  assert.equal(bars.length, 2)
  assert.ok(bars.every((b) => b.fillColor && b.height < 20 && b.width > 60))
  assert.equal(r.boxes, 7)
  assert.equal(texts(r).length, 4, 'only A, B, D, E carry labels')
})

test('composite state: boundary around its members, titled, members laid out inside', () => {
  const r = built('stateDiagram-v2\nstate Active {\n  [*] --> Working\n  Working --> Paused : pause\n  Paused --> Working : resume\n}\n[*] --> Idle\nIdle --> Working\nActive --> Idle : stop')
  const frames = rects(r).filter((b) => b.dash === 'dashed')
  assert.equal(frames.length, 1)
  const frame = frames[0]
  const members = rects(r).filter((b) => b !== frame && (b.rounded || b.ellipse))
  const idle = members.find((b) => labelOf(r, b)?.text === 'Idle')
  const working = members.find((b) => labelOf(r, b)?.text === 'Working')
  const paused = members.find((b) => labelOf(r, b)?.text === 'Paused')
  const innerStart = members.filter((b) => b.ellipse).find((b) => inside(frame, b))
  assert.ok(inside(frame, working) && inside(frame, paused) && innerStart)
  assert.ok(!overlap(frame, idle), 'a state outside the composite stays outside its boundary')
  assert.equal(texts(r).filter((t) => t.text === 'Active').length, 1)
  // the boundary is drawn first (behind) and can be a connector end
  assert.equal(r.items.indexOf(frame), 0)
  const ends = connectors(r).filter((c) => c.startAttachment.rectangleId === frame.id || c.endAttachment.rectangleId === frame.id)
  assert.equal(ends.length, 1)
  assert.equal(r.boxes, 4)
  assert.equal(r.links, 6)
})

test('nested composites keep inner boundaries inside outer ones', () => {
  const r = built('stateDiagram-v2\nstate Outer {\n  state Inner {\n    A --> B\n  }\n  C --> Inner\n}')
  const frames = rects(r).filter((b) => b.dash === 'dashed')
  assert.equal(frames.length, 2)
  assert.ok(inside(frames[0], frames[1]))
  const plain = rects(r).filter((b) => b.rounded)
  assert.ok(plain.every((b) => inside(frames[0], b)))
  assert.equal(plain.filter((b) => inside(frames[1], b)).length, 2)
})

test('notes: single line and multi-line become sticky notes beside their state', () => {
  const r = built('stateDiagram-v2\nA --> B\nnote left of A : left note\nnote right of B\n  first\n  second\nend note')
  const sticky = rects(r).filter((b) => b.fillColor === '#fff3a3')
  assert.equal(sticky.length, 2)
  const a = rects(r).find((b) => b.rounded && labelOf(r, b)?.text === 'A')
  const b = rects(r).find((x) => x.rounded && labelOf(r, x)?.text === 'B')
  const left = sticky.find((s) => labelOf(r, s).text === 'left note')
  const right = sticky.find((s) => labelOf(r, s).text === 'first\nsecond')
  assert.ok(left.x + left.width <= a.x)
  assert.ok(right.x >= b.x + b.width)
  assert.equal(r.boxes, 2, 'notes are not states')
  const all = rects(r)
  for (let i = 0; i < all.length; i += 1) for (let j = i + 1; j < all.length; j += 1) assert.ok(!overlap(all[i], all[j]), `${i} overlaps ${j}`)
})

test('direction LR runs left to right; TB by default; concurrency and unknown lines are ignored and counted', () => {
  const lr = built('stateDiagram-v2\ndirection LR\nA --> B\nB --> C')
  const [a, b, c] = ['A', 'B', 'C'].map((name) => rects(lr).find((x) => labelOf(lr, x)?.text === name))
  assert.ok(a.x < b.x && b.x < c.x)
  const tb = built('stateDiagram-v2\nA --> B')
  const [ta, tbb] = ['A', 'B'].map((name) => rects(tb).find((x) => labelOf(tb, x)?.text === name))
  assert.ok(ta.y < tbb.y)
  const g = ok('---\ntitle: T\n---\n%% c\nstateDiagram-v2\nclassDef x fill:#f00\nstate P {\n  A --> B\n  --\n  C --> D\n}\nclass A x\nA --> A\nthis is ! nonsense\naccTitle: t')
  assert.equal(g.ignoredLines, 6)
  assert.equal(g.states.length, 5)
})

test('errors, limits and empty diagrams', () => {
  assert.equal(parseMermaidState('stateDiagram-v2\n[*] --> [*]').ok, false)
  assert.equal(buildMermaidDiagram('stateDiagram\n').ok, false)
})

test('ids are unique per kind and items survive saving and loading', () => {
  const r = built('stateDiagram-v2\n[*] --> A\nstate X {\n  [*] --> B\n  B --> C : go\n}\nA --> X\nstate Ch <<choice>>\nX --> Ch\nCh --> D : ok\nnote right of A : hello world\nD --> [*]')
  for (const kind of ['rectangle', 'connector', 'text']) {
    const ids = r.items.filter((i) => i.kind === kind).map((i) => i.id)
    assert.equal(new Set(ids).size, ids.length, kind)
  }
  const bare = (item) => { const { rounded, startLabel, endLabel, ...rest } = item; return rest }
  const saved = doc.createDocument({ template: 'blank', background: 'white', items: r.items })
  const parsed = doc.parseDocument(doc.stringifyDocument(saved))
  assert.deepEqual((parsed.document ?? parsed).items.map(bare), r.items.map(bare))
  for (const item of r.items) assert.deepEqual(bare(doc.sanitizeItem(JSON.parse(JSON.stringify(item)))), bare(item))
})

test('dispatcher, detection and toast', () => {
  assert.equal(isMermaidText('stateDiagram\nA --> B'), true)
  assert.equal(isMermaidText('%% c\nstateDiagram-v2'), true)
  assert.equal(isMermaidText('stateDiagram-v3'), false)
  assert.equal(mermaidInsertMessage(5, 6, 0, 'state'), 'Inserted 5 states and 6 transitions')
  assert.equal(mermaidInsertMessage(1, 1, 1, 'state'), 'Inserted 1 state and 1 transition (1 line ignored)')
})
