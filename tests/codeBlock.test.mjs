import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const doc = await loadModule('documentFormat.ts')
const model = await loadModule('canvasModel.ts')
const block = await loadModule('codeBlock.ts')
const hl = await loadModule('codeHighlight.ts')
const clip = await loadModule('clipboard.ts')
const editing = await loadModule('codeEditing.ts')
const exporter = await loadModule('sheetExport.ts')
const lasso = await loadModule('lassoSelection.ts')
const growth = await loadModule('sheetGrowth.ts')
const visible = await loadModule('app/visibleInk.ts')
const eraser = await loadModule('app/eraserCompaction.ts')
const codeRenderer = await loadModule('app/codeRenderer.ts')
const renderer = await loadModule('app/canvasRenderer.ts')

const parse = (items) => doc.parseDocument(JSON.stringify({ format: 'inkpad-document', version: 1, items }))
const code = (extra = {}) => ({ kind: 'code', id: 3, x: 10, y: 20, width: 300, height: 120, text: 'class A {}\n', language: 'java', ...extra })
const unknownItem = { kind: 'diagram3d', id: 9, x: 5, y: 6, width: 70, height: 40, payload: { deep: [1, 2, { a: 'b' }] } }
const workspace = { x: 0, y: 0, width: 2000, height: 1500 }

test('code item: valid fields are kept, optional ones only when not default', () => {
  const item = parse([code()]).document.items[0]
  assert.deepEqual(item, code())
  assert.equal('theme' in item, false)
  assert.equal('fontSize' in item, false)
  const full = parse([code({ theme: 'dark', fontSize: 18 })]).document.items[0]
  assert.equal(full.theme, 'dark')
  assert.equal(full.fontSize, 18)
})

test('code item: invalid fields are dropped or clamped, broken items are dropped', () => {
  const result = parse([
    code({ id: 1, language: 'brainfuck', theme: 'neon', fontSize: 13 }),
    code({ id: 2, fontSize: 500 }),
    code({ id: 4, fontSize: 2 }),
    code({ id: 5, fontSize: 'big' }),
    code({ id: 6, text: 'a\tb\r\n\u0000c' }),
    code({ id: 7, text: 42 }),
    code({ id: 8, width: 'wide' }),
    code({ id: 10, height: -1 }),
  ])
  const byId = Object.fromEntries(result.document.items.map((item) => [item.id, item]))
  assert.equal(result.droppedItems, 3)
  assert.equal(byId[1].language, 'plaintext')
  assert.equal('theme' in byId[1], false)
  assert.equal('fontSize' in byId[1], false)
  assert.equal(byId[2].fontSize, 24)
  assert.equal(byId[4].fontSize, 8)
  assert.equal('fontSize' in byId[5], false)
  assert.equal(byId[6].text, 'a b\nc')
  assert.equal(byId[7], undefined)
  assert.equal(byId[8], undefined)
})

test('round trip: code items survive save and load, and old files are written back unchanged', () => {
  const items = [code({ theme: 'dark', fontSize: 16 }), { kind: 'text', id: 1, x: 0, y: 0, width: 10, height: 10, text: 'hi', fontSize: 20, color: '#111111' }]
  const saved = doc.stringifyDocument(doc.createDocument({ template: 'blank', background: 'white', items }))
  assert.deepEqual(parse(JSON.parse(saved).items).document.items, items)
  const old = [{ kind: 'rectangle', id: 1, x: 0, y: 0, width: 10, height: 10, strokeColor: '#111111', strokeWidth: 2 }]
  const again = doc.stringifyDocument(doc.createDocument({ template: 'blank', background: 'white', items: parse(old).document.items }))
  assert.deepEqual(JSON.parse(again).items, old)
  assert.equal(JSON.parse(again).version, 1)
})

test('getNextIds counts code ids in the text counter and keeps every counter past unknown item ids', () => {
  const items = parse([code({ id: 7 }), unknownItem, { kind: 'text', id: 2, x: 0, y: 0, width: 1, height: 1, text: 'a', fontSize: 20, color: '#111111' }]).document.items
  assert.deepEqual(doc.getNextIds(items), { stroke: 10, rectangle: 10, connector: 10, text: 10 })
})

test('unknown kind: kept, written back unchanged, and nothing throws in model, render or export paths', () => {
  const loaded = parse([unknownItem, { kind: 'rectangle', id: 1, x: 0, y: 0, width: 10, height: 10, strokeColor: '#111111', strokeWidth: 2 }, { kind: 'noBox', id: 4, whatever: true }, { kind: 'halfBox', id: 5, x: 'a', y: 1, width: 2, height: 2 }, { kind: 'noId' }])
  assert.equal(loaded.droppedItems, 1)
  const items = loaded.document.items
  assert.equal(items.length, 4)
  assert.deepEqual(items[0].box, { x: 5, y: 6, width: 70, height: 40 })
  assert.equal(items[2].box, null)
  assert.equal(items[3].box, null)
  // saving: each opaque item is written as it was read, including nested data
  const saved = JSON.parse(doc.stringifyDocument(doc.createDocument({ template: 'blank', background: 'white', items })))
  assert.deepEqual(saved.items[0], unknownItem)
  assert.deepEqual(saved.items[2], { kind: 'noBox', id: 4, whatever: true })
  assert.deepEqual(JSON.parse(JSON.stringify(doc.createDocument({ template: 'blank', background: 'white', items }))).items[0], unknownItem)
  // a second pass keeps it too
  assert.deepEqual(parse(saved.items).document.items.map((item) => item.raw), items.map((item) => item.raw))
  // model helpers
  const all = new Set(model.allCanvasItemKeys(items))
  assert.equal(all.size, 1)
  assert.equal(model.getCanvasSelectionBounds(items, new Set(items.map(model.canvasItemKey))).width >= 16, true)
  assert.equal(model.translateSelectedItems(items, new Set(items.map(model.canvasItemKey)), 5, 5)[0], items[0])
  assert.equal(model.resizeSelectedItems(items, all, { x: 0, y: 0, width: 50, height: 50 })[0], items[0])
  assert.equal(model.recolorItems(items, new Set(items.map(model.canvasItemKey)), '#ff0000')[0], items[0])
  assert.equal(model.cloneCanvasItems(items)[0], items[0])
  assert.equal(model.deleteCanvasItemsByKey(items, new Set([model.canvasItemKey(items[1])])).length, 3)
  assert.equal(lasso.itemHitTest(items[0], { x: 10, y: 10, pressure: 1 }), false)
  assert.deepEqual(lasso.selectItemsByLasso(items, [{ x: 0, y: 0, pressure: 1 }, { x: 99, y: 0, pressure: 1 }, { x: 99, y: 99, pressure: 1 }, { x: 0, y: 99, pressure: 1 }]), [model.canvasItemKey(items[1])])
  assert.equal(growth.itemBottom(items[0]), 46)
  assert.equal(growth.itemBottom(items[2]), 0)
  assert.equal(visible.isItemVisible(items[0], { x: 1000, y: 1000, width: 10, height: 10 }), false)
  assert.equal(visible.isItemVisible(items[2], { x: 1000, y: 1000, width: 10, height: 10 }), true)
  for (const item of items) assert.ok(eraser.itemInkBounds(item))
  assert.equal(clip.copyItems(items, new Set(['opaque:9', 'rectangle:1'])).length, 1)
  assert.equal(clip.pasteItems(items, { stroke: 1, rectangle: 5, connector: 1, text: 1 }, 24, workspace) !== null, true)
  // drawing and export
  const ctx = new Proxy({}, { get: (_t, name) => (name === 'measureText' ? () => ({ width: 7 }) : () => undefined), set: () => true })
  for (const item of items) renderer.drawItem(ctx, item, 'raw')
  renderer.drawMinimapItems(ctx, items, { scale: 0.1, offsetX: 0, offsetY: 0 })
  const svg = exporter.buildSheetSvg(items, { width: 400, height: 300, template: 'blank', backgroundColor: '#ffffff' })
  assert.ok(typeof svg === 'string' && svg.includes('Unsupported: diagram3d'))
})

test('code block: model helpers (bounds, move, resize, clone, hit test, export)', () => {
  const items = [code()]
  const keys = new Set(['code:3'])
  assert.deepEqual(model.getCanvasSelectionBounds(items, keys), { x: 10, y: 20, width: 300, height: 120 })
  assert.deepEqual(model.translateSelectedItems(items, keys, 5, -5)[0], code({ x: 15, y: 15 }))
  const resized = model.resizeSelectedItems(items, keys, { x: 10, y: 20, width: 150, height: 60 })[0]
  assert.equal(resized.width, 150)
  assert.equal(resized.height, 60)
  assert.equal(resized.fontSize, undefined)
  assert.equal(model.resizeSelectedItems(items, keys, { x: 10, y: 20, width: 1, height: 1 })[0].width, 96)
  const copy = model.cloneCanvasItems(items)[0]
  assert.notEqual(copy, items[0])
  assert.deepEqual(copy, items[0])
  assert.equal(lasso.itemHitTest(items[0], { x: 100, y: 60, pressure: 1 }), true)
  assert.equal(model.recolorItems(items, keys, '#ff0000')[0], items[0])
  const svg = exporter.buildSheetSvg(items, { width: 400, height: 300, template: 'blank', backgroundColor: '#ffffff' })
  assert.ok(svg.includes('class A {}') && svg.includes('monospace'))
  const ctx = new Proxy({}, { get: (_t, name) => (name === 'measureText' ? () => ({ width: 7 }) : () => undefined), set: () => true })
  codeRenderer.drawCode(ctx, items[0])
  renderer.drawItem(ctx, items[0], 'raw')
})

test('clipboard: copying and pasting a code block gives a new id from the text counter and moves it', () => {
  const items = [code({ id: 3 })]
  const copied = clip.copyItems(items, new Set(['code:3']))
  assert.equal(copied.length, 1)
  assert.notEqual(copied[0], items[0])
  const result = clip.pasteItems(copied, { stroke: 1, rectangle: 1, connector: 1, text: 12 }, 24, workspace)
  assert.equal(result.items[0].kind, 'code')
  assert.equal(result.items[0].id, 12)
  assert.equal(result.counters.text, 13)
  assert.equal(result.items[0].x, 34)
  assert.equal(result.items[0].y, 44)
  assert.equal(result.items[0].text, items[0].text)
  assert.deepEqual(result.keys, ['code:12'])
  const at = clip.pasteItems(copied, { stroke: 1, rectangle: 1, connector: 1, text: 12 }, 24, workspace, { x: 500, y: 500 })
  assert.equal(at.items[0].x, 350)
  assert.equal(at.items[0].y, 440)
})

test('font size: clamp 8 to 24, default not saved, step buttons stop at the ends', () => {
  assert.equal(block.clampCodeFontSize(3), 8)
  assert.equal(block.clampCodeFontSize(99), 24)
  assert.equal(block.clampCodeFontSize(13.4), 13)
  assert.equal(block.clampCodeFontSize(NaN), 13)
  assert.equal(block.clampCodeFontSize('x'), 13)
  let items = [code()]
  items = block.setCodeFontSize(items, 3, 14)
  assert.equal(items[0].fontSize, 14)
  items = block.setCodeFontSize(items, 3, 13)
  assert.equal('fontSize' in items[0], false)
  assert.equal(block.setCodeFontSize(items, 3, 13), items)
  assert.equal(block.stepCodeFontSize(code({ fontSize: 24 }), 1), 24)
  assert.equal(block.stepCodeFontSize(code({ fontSize: 8 }), -1), 8)
  assert.equal(block.stepCodeFontSize(code(), 1), 14)
})

test('language, theme and text edits replace the item and leave others alone', () => {
  const other = { kind: 'text', id: 3, x: 0, y: 0, width: 1, height: 1, text: 'a', fontSize: 20, color: '#111111' }
  let items = [code(), other]
  items = block.setCodeLanguage(items, 3, 'python')
  assert.equal(items[0].language, 'python')
  assert.equal(items[1], other)
  assert.equal(block.setCodeLanguage(items, 3, 'nope')[0].language, 'plaintext')
  items = block.setCodeTheme(items, 3, 'dark')
  assert.equal(items[0].theme, 'dark')
  items = block.setCodeTheme(items, 3, 'light')
  assert.equal('theme' in items[0], false)
  assert.equal(block.setCodeText(items, 3, 'a\tb')[0].text, 'a b')
  assert.equal(block.setCodeText(items, 3, items[0].text), items)
})

test('tokenizer cache: the same item, or the same text in a new object, is highlighted once', () => {
  hl.resetCodeHighlightForTests()
  const item = code({ text: 'let x = 1' })
  const plain = hl.getCodeLines(item)
  assert.deepEqual(plain, [[{ text: 'let x = 1', kind: 'plain' }]])
  let calls = 0
  hl.setCodeHighlighter((text) => { calls += 1; return `<span class="hljs-keyword">let</span> x = <span class="hljs-number">1</span>` })
  const first = hl.getCodeLines(item)
  assert.equal(first[0][0].kind, 'keyword')
  assert.equal(first[0][2].kind, 'number')
  assert.equal(calls, 1)
  for (let i = 0; i < 20; i += 1) assert.equal(hl.getCodeLines(item), first)
  const moved = { ...item, x: 99 }
  hl.getCodeLines(moved)
  assert.equal(calls, 1)
  hl.getCodeLines({ ...item, text: 'let y = 2' })
  assert.equal(calls, 2)
  hl.getCodeLines({ ...item, language: 'plaintext' })
  assert.equal(calls, 2) // plain text is never sent to the library
  hl.setCodeHighlighter(() => { throw new Error('bad grammar') })
  assert.deepEqual(hl.getCodeLines({ ...item, text: 'zzz' }), [[{ text: 'zzz', kind: 'plain' }]])
  hl.resetCodeHighlightForTests()
})

test('highlight html is split into coloured pieces per line', () => {
  const lines = hl.parseHighlightHtml('<span class="hljs-comment">// a &lt; b\n// c</span>\n<span class="hljs-keyword">class</span> <span class="hljs-title class_">A</span> <span class="hljs-string">&quot;x&quot;</span>')
  assert.deepEqual(lines[0], [{ text: '// a < b', kind: 'comment' }])
  assert.deepEqual(lines[1], [{ text: '// c', kind: 'comment' }])
  assert.deepEqual(lines[2].map((token) => token.kind), ['keyword', 'plain', 'type', 'plain', 'string'])
  assert.equal(lines[2][4].text, '"x"')
  assert.equal(hl.kindOfClasses('hljs-title function_'), 'function')
})

test('Tab and Shift+Tab', () => {
  assert.deepEqual(editing.indentSelection('ab', 1, 1, false), { text: 'a b', start: 2, end: 2 })
  assert.deepEqual(editing.indentSelection('  ab', 4, 4, true), { text: 'ab', start: 2, end: 2 })
  assert.deepEqual(editing.indentSelection('ab', 1, 1, true), { text: 'ab', start: 1, end: 1 })
  const multi = editing.indentSelection('a\nb\nc', 0, 3, false)
  assert.equal(multi.text, '  a\n  b\nc')
  assert.equal(editing.indentSelection(multi.text, multi.start, multi.end, true).text, 'a\nb\nc')
})

test('the model and parser constants agree with codeBlock', () => {
  assert.equal(block.MIN_CODE_WIDTH, 96)
  assert.equal(block.MIN_CODE_HEIGHT, 48)
})

test('review fixes: unknown items are capped and cached, marquee skips them, highlighter and editor wiring', async () => {
  // a 100k-deep unknown item cannot be written: it is dropped (counted) and the rest still saves
  const deepText = `{"kind":"deep","id":3,"x":0,"y":0,"width":5,"height":5,"nest":${'['.repeat(100000)}${']'.repeat(100000)}}`
  const loaded = doc.parseDocument(`{"format":"inkpad-document","version":1,"items":[${deepText},${JSON.stringify(unknownItem)}]}`)
  assert.equal(loaded.ok, true)
  assert.equal(loaded.droppedItems, 1)
  assert.equal(loaded.document.items.length, 1)
  assert.ok(doc.stringifyDocument(loaded.document).length > 0)
  // over the size cap: dropped too
  assert.equal(parse([{ kind: 'big', id: 4, blob: 'x'.repeat(1_100_000) }]).droppedItems, 1)
  // the written text is the cached text of the item as read
  const kept = parse([unknownItem]).document
  assert.deepEqual(JSON.parse(doc.stringifyDocument(kept)).items[0], unknownItem)
  // marquee never picks an unknown item, even one with a box inside it
  const input = await loadModule('desktopInput.ts')
  assert.deepEqual(input.marqueeKeys(kept.items, { x: 0, y: 0, width: 500, height: 500 }), [])
  // drawCode starts the highlighter library by itself; the canvas is not redrawn mid-stroke
  const { readFile } = await import('node:fs/promises')
  assert.match(await readFile(new URL('../src/app/codeRenderer.ts', import.meta.url), 'utf8'), /ensureCodeHighlighter\(\)/)
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /redrawWhenIdle/)
  assert.match(app, /activePointerRef\.current !== null \|\| codeEditorRef\.current !== null/)
  assert.match(app, /codeEditorRef\.current = null\n    setCodeEditor\(null\)\n  }/)
})

test('review fixes: zero-size code and unknown boxes draw and export without negative sizes', () => {
  const tiny = { kind: 'code', id: 1, x: 0, y: 0, width: 0, height: 0, text: 'a', language: 'plaintext' }
  const svg = exporter.buildSheetSvg([tiny, ...parse([unknownItem]).document.items], { width: 400, height: 300, template: 'blank', backgroundColor: '#ffffff' })
  assert.doesNotMatch(svg, /(width|height)="-/)
  assert.match(svg, /fill-opacity="0.18"/)
})
