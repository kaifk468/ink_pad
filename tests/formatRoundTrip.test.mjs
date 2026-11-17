import assert from 'node:assert/strict'
import test from 'node:test'

import { loadModule } from './helpers/loadModule.mjs'

const doc = await loadModule('documentFormat.ts')

const p = (x, y, pressure = 0.5) => ({ x, y, pressure })
const NEW_KEYS = ['sketchy', 'seed', 'fillColor', 'fit', 'code', 'theme']

/** Every key used anywhere in a value (objects and arrays, any depth). */
function allKeys(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((entry) => allKeys(entry, found))
  else if (value && typeof value === 'object') for (const [key, entry] of Object.entries(value)) { found.add(key); allKeys(entry, found) }
  return found
}

const roundTrip = (text) => {
  const result = doc.parseDocument(text)
  assert.equal(result.ok, true)
  assert.equal(result.droppedItems, 0)
  return { result, out: doc.stringifyDocument(result.document) }
}

const inkStroke = (id) => ({ kind: 'stroke', id, points: [p(10, 10), p(20, 15), p(30, 12)], color: '#111', width: 3, erase: false })

/** An old-style file: every item kind and optional field that existed before the sketchy/fill/fit/code additions. */
function oldFile(pages = false) {
  const items = [
    inkStroke(1),
    { kind: 'stroke', id: 2, points: [p(0, 0), p(50, 50)], color: '#c00', width: 4, erase: false, shape: 'arrow' },
    { kind: 'stroke', id: 3, points: [p(0, 80), p(90, 80)], color: '#00c', width: 2, erase: false, shape: 'line' },
    { kind: 'stroke', id: 4, points: [p(5, 5)], color: '#000', width: 20, erase: true },
    { kind: 'rectangle', id: 1, x: 10, y: 20, width: 100, height: 60, strokeColor: '#111', strokeWidth: 2 },
    { kind: 'rectangle', id: 2, x: 150, y: 20, width: 100, height: 60, strokeColor: '#111', strokeWidth: 2, diamond: true, angle: 0.5 },
    { kind: 'rectangle', id: 3, x: 300, y: 20, width: 100, height: 60, strokeColor: '#111', strokeWidth: 2, ellipse: true },
    { kind: 'rectangle', id: 4, x: 10, y: 200, width: 160, height: 100, strokeColor: '#222', strokeWidth: 2, classBox: { name: 'Order', attributes: '+id: int', methods: '+save()' } },
    { kind: 'rectangle', id: 5, x: 200, y: 200, width: 160, height: 120, strokeColor: '#222', strokeWidth: 2, inkBox: { top: 240, mid: 280, ink: [inkStroke(10)] } },
    { kind: 'rectangle', id: 6, x: 400, y: 200, width: 120, height: 100, strokeColor: '#222', strokeWidth: 2, hldShape: 'database', inkBox: { top: 230, mid: 270, ink: [] } },
    { kind: 'rectangle', id: 7, x: 400, y: 320, width: 120, height: 80, strokeColor: '#222', strokeWidth: 2, hldShape: 'queue', inkBox: { top: 346, mid: 372, ink: [inkStroke(11)] } },
    { kind: 'rectangle', id: 8, x: 400, y: 420, width: 120, height: 80, strokeColor: '#222', strokeWidth: 2, hldShape: 'service', inkBox: { top: 446, mid: 474, ink: [] } },
    { kind: 'connector', id: 1, start: p(110, 50, 0), end: p(150, 50, 0), strokeColor: '#111', strokeWidth: 2, relationshipType: 'association', reversed: false },
    { kind: 'connector', id: 2, start: p(250, 50, 0), end: p(300, 50, 0), strokeColor: '#111', strokeWidth: 2, relationshipType: 'inheritance', reversed: true, routing: 'elbow', startAttachment: { rectangleId: 2, offsetX: 1, offsetY: 0.5 }, endAttachment: { rectangleId: 3, offsetX: 0, offsetY: 0.5 } },
    { kind: 'text', id: 1, x: 30, y: 40, width: 60, height: 31, text: 'Hello', fontSize: 24, color: '#111' },
    { kind: 'text', id: 2, x: 30, y: 400, width: 120, height: 62, text: 'Two\nlines', fontSize: 18, color: '#333', fontFamily: 'excalifont', angle: -0.75 },
  ]
  const file = {
    format: 'inkpad-document', version: pages ? 2 : 1, title: 'Old diagram', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    page: { template: 'dotted', background: 'warm', spacing: 'wide', sheetHeight: 2500 },
    items,
  }
  if (pages) file.pages = [{ items: [inkStroke(1), { kind: 'text', id: 1, x: 5, y: 5, width: 30, height: 31, text: 'p2', fontSize: 24, color: '#111', fontFamily: 'mono' }] }, { items: [] }]
  return file
}

/** A file that uses every addition. */
function newFile() {
  return {
    format: 'inkpad-document', version: 1, title: 'New diagram', createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z',
    page: { template: 'lined', background: 'blue', sketchy: true },
    items: [
      { kind: 'rectangle', id: 1, x: 10, y: 20, width: 100, height: 60, strokeColor: '#111', strokeWidth: 2, seed: 12345, fillColor: '#b2f2bb' },
      { kind: 'rectangle', id: 2, x: 150, y: 20, width: 100, height: 60, strokeColor: '#111', strokeWidth: 2, ellipse: true, seed: 4294967295, fillColor: '#a5d8ff' },
      { kind: 'rectangle', id: 3, x: 400, y: 200, width: 120, height: 100, strokeColor: '#222', strokeWidth: 2, hldShape: 'database', inkBox: { top: 230, mid: 270, ink: [] }, seed: 0, fillColor: '#ffec99' },
      { kind: 'text', id: 1, x: 30, y: 40, width: 60, height: 31, text: 'Auto', fontSize: 10, color: '#111', fit: 'off' },
      { kind: 'text', id: 2, x: 30, y: 400, width: 120, height: 62, text: 'A long label that wraps', fontSize: 10, color: '#333', fit: 'wrap' },
      { kind: 'code', id: 3, x: 50, y: 500, width: 360, height: 200, text: 'const a = 1\nreturn a', language: 'typescript', theme: 'dark', fontSize: 16 },
      { kind: 'code', id: 4, x: 450, y: 500, width: 200, height: 100, text: 'SELECT 1', language: 'sql' },
      { kind: 'hologram', id: 9, x: 5, y: 6, width: 70, height: 80, glow: { level: 3, tags: ['a', 'b'] } },
      { kind: 'future-thing', id: 10, payload: [1, 2, 3] },
    ],
  }
}

test('(a) an old v1 file loads and re-saves with exactly the same JSON and no new keys', () => {
  for (const pages of [false, true]) {
    const file = oldFile(pages)
    const { result, out } = roundTrip(JSON.stringify(file))
    assert.equal(result.migratedFrom, null)
    assert.deepEqual(JSON.parse(out), file)
    const keys = allKeys(JSON.parse(out))
    for (const key of NEW_KEYS) assert.equal(keys.has(key), false, `new key ${key} appeared in an old file`)
  }
})

test('(a) an old single-page file stays version 1 and a second round trip changes nothing', () => {
  const file = oldFile(false)
  const first = roundTrip(JSON.stringify(file)).out
  assert.equal(JSON.parse(first).version, 1)
  assert.equal(roundTrip(first).out, first)
})

test('(a) an old file made through createDocument from its parsed items matches too', () => {
  const file = oldFile(true)
  const parsed = doc.parseDocument(JSON.stringify(file)).document
  const again = doc.createDocument({ title: parsed.title, template: parsed.page.template, background: parsed.page.background, spacing: parsed.page.spacing, sheetHeight: parsed.page.sheetHeight, items: parsed.items, extraPages: parsed.pages.map((page) => page.items), createdAt: parsed.createdAt, updatedAt: parsed.updatedAt })
  assert.deepEqual(JSON.parse(doc.stringifyDocument(again)), file)
})

test('(b) a file with every addition round-trips identically and keeps version 1', () => {
  const file = newFile()
  const { result, out } = roundTrip(JSON.stringify(file))
  assert.equal(result.document.version, 1)
  assert.deepEqual(JSON.parse(out), file)
  assert.equal(roundTrip(out).out, out)
})

test('(b) sketchy through createDocument is written only when true', () => {
  const base = { title: 'x', template: 'blank', background: 'white', items: [] }
  assert.equal('sketchy' in doc.createDocument({ ...base, sketchy: false }).page, false)
  assert.equal('sketchy' in doc.createDocument({ ...base }).page, false)
  assert.equal(doc.createDocument({ ...base, sketchy: true }).page.sketchy, true)
})

test('(b) unknown kinds keep their exact fields, including nested ones, and add nothing', () => {
  const file = newFile()
  const out = JSON.parse(roundTrip(JSON.stringify(file)).out)
  assert.deepEqual(out.items.filter((item) => item.kind === 'hologram' || item.kind === 'future-thing'), file.items.filter((item) => item.kind === 'hologram' || item.kind === 'future-thing'))
})

test('(c) invalid values of each new field are dropped', () => {
  const file = newFile()
  file.page.sketchy = 'yes'
  file.items = [
    { kind: 'rectangle', id: 1, x: 0, y: 0, width: 50, height: 50, strokeColor: '#111', strokeWidth: 2, seed: 1.5, fillColor: '' },
    { kind: 'rectangle', id: 2, x: 0, y: 0, width: 50, height: 50, strokeColor: '#111', strokeWidth: 2, seed: -1, fillColor: 7 },
    { kind: 'rectangle', id: 3, x: 0, y: 0, width: 50, height: 50, strokeColor: '#111', strokeWidth: 2, seed: 4294967296, fillColor: 'x'.repeat(65) },
    { kind: 'rectangle', id: 4, x: 0, y: 0, width: 50, height: 50, strokeColor: '#111', strokeWidth: 2, seed: '5', fillColor: null },
    { kind: 'rectangle', id: 5, x: 0, y: 0, width: 160, height: 100, strokeColor: '#111', strokeWidth: 2, classBox: { name: 'A', attributes: '', methods: '' }, seed: 9, fillColor: '#b2f2bb' },
    { kind: 'rectangle', id: 6, x: 0, y: 0, width: 160, height: 100, strokeColor: '#111', strokeWidth: 2, hldShape: 'service', inkBox: { top: 30, mid: 60, ink: [] }, seed: 9, fillColor: '#b2f2bb' },
    { kind: 'text', id: 1, x: 0, y: 0, width: 50, height: 20, text: 'a', fontSize: 24, color: '#111', fit: 'shrink' },
    { kind: 'text', id: 2, x: 0, y: 0, width: 50, height: 20, text: 'b', fontSize: 24, color: '#111', fit: true },
    { kind: 'text', id: 3, x: 0, y: 0, width: 0, height: 20, text: 'c', fontSize: 24, color: '#111', fit: 'wrap' },
    { kind: 'code', id: 4, x: 0, y: 0, width: 100, height: 60, text: 'a', language: 'klingon', theme: 'light', fontSize: 13 },
    { kind: 'code', id: 5, x: 0, y: 0, width: 100, height: 60, text: 'a', language: 'go', theme: 'blue', fontSize: 'big' },
    { kind: 'code', id: 6, x: 0, y: 0, width: 100, height: 60, text: 'a', language: 'go', fontSize: 99 },
  ]
  const result = doc.parseDocument(JSON.stringify(file))
  assert.equal(result.ok, true)
  assert.equal(result.droppedItems, 0)
  const items = result.document.items
  assert.equal('sketchy' in result.document.page, false)
  for (const id of [1, 2, 3, 4]) {
    const rect = items.find((item) => item.kind === 'rectangle' && item.id === id)
    assert.equal('seed' in rect, false, `seed kept on rectangle ${id}`)
    assert.equal('fillColor' in rect, false, `fillColor kept on rectangle ${id}`)
  }
  for (const id of [5, 6]) {
    const rect = items.find((item) => item.kind === 'rectangle' && item.id === id)
    assert.equal('seed' in rect, false, `seed kept on a shape that cannot carry it (${id})`)
    assert.equal('fillColor' in rect, false, `fillColor kept on a shape that cannot carry it (${id})`)
  }
  for (const id of [1, 2, 3]) assert.equal('fit' in items.find((item) => item.kind === 'text' && item.id === id), false)
  const code4 = items.find((item) => item.kind === 'code' && item.id === 4)
  assert.equal(code4.language, 'plaintext')
  assert.equal('theme' in code4, false)
  assert.equal('fontSize' in code4, false)
  const code5 = items.find((item) => item.kind === 'code' && item.id === 5)
  assert.equal('theme' in code5, false)
  assert.equal('fontSize' in code5, false)
  assert.equal(items.find((item) => item.kind === 'code' && item.id === 6).fontSize, 24)
})

test('(c) a code item without usable geometry or text is dropped, and an unknown kind without an id too', () => {
  const file = newFile()
  file.items = [
    { kind: 'code', id: 1, x: 0, y: 0, width: -5, height: 60, text: 'a', language: 'go' },
    { kind: 'code', id: 2, x: 0, y: 0, width: 50, height: 60, text: 7, language: 'go' },
    { kind: 'mystery', x: 1 },
    { kind: 'code', id: 3, x: 0, y: 0, width: 50, height: 60, text: 'ok', language: 'go' },
  ]
  const result = doc.parseDocument(JSON.stringify(file))
  assert.equal(result.ok, true)
  assert.equal(result.droppedItems, 3)
  assert.deepEqual(result.document.items.map((item) => item.id), [3])
})

test('(d) the safety copy text (stringify then parse) keeps old files identical', () => {
  for (const pages of [false, true]) {
    const file = oldFile(pages)
    const document = doc.parseDocument(JSON.stringify(file)).document
    const text = doc.stringifyDocument(document)
    const restored = doc.parseDocument(text)
    assert.equal(restored.ok, true)
    assert.equal(restored.droppedItems, 0)
    assert.deepEqual(JSON.parse(doc.stringifyDocument(restored.document)), file)
  }
})

test('(d) the safety copy text keeps new fields and unknown kinds identical', () => {
  const file = newFile()
  const document = doc.parseDocument(JSON.stringify(file)).document
  // the record text is a stringifyDocument output; it is parsed again on restore, and may go round more than once
  let text = doc.stringifyDocument(document)
  for (let pass = 0; pass < 3; pass += 1) {
    const restored = doc.parseDocument(text)
    assert.equal(restored.ok, true)
    assert.equal(restored.droppedItems, 0)
    assert.equal(restored.document.version, 1)
    text = doc.stringifyDocument(restored.document)
    assert.deepEqual(JSON.parse(text), file)
  }
})

test('(d) a document built with createDocument from loaded items survives the safety copy text', () => {
  const file = newFile()
  const loaded = doc.parseDocument(JSON.stringify(file)).document
  const built = doc.createDocument({ title: loaded.title, template: loaded.page.template, background: loaded.page.background, sketchy: loaded.page.sketchy, items: loaded.items, createdAt: loaded.createdAt, updatedAt: loaded.updatedAt })
  assert.deepEqual(JSON.parse(doc.stringifyDocument(doc.parseDocument(doc.stringifyDocument(built)).document)), file)
})
