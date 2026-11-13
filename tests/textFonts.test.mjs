import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const layout = await loadModule('textLayout.ts')
const doc = await loadModule('documentFormat.ts')
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const wide = (line) => line.length * 20
const IDS = ['excalifont', 'sans', 'serif', 'mono']

test('fixed font list: four fonts, hand-drawn default for new labels, clean sans for legacy', () => {
  assert.deepEqual(layout.TEXT_FONTS.map((f) => f.id), IDS)
  assert.equal(layout.DEFAULT_TEXT_FONT, 'excalifont')
  assert.equal(layout.LEGACY_TEXT_FONT, 'sans')
  assert.match(layout.textFontFamily('excalifont'), /^'Excalifont'/)
  assert.equal(layout.textFontFamily(undefined), layout.TEXT_FONT_FAMILY)
  assert.equal(layout.textFontFamily('serif'), 'Georgia, \'Times New Roman\', serif')
  assert.match(layout.textFont(24, 'mono'), /^24px .*monospace/)
  assert.equal(layout.textFont(24), `24px ${layout.TEXT_FONT_FAMILY}`)
})

test('createTextObject stores the font only when given', () => {
  const a = layout.createTextObject(1, 0, 0, 'hi', '#111')
  assert.equal('fontFamily' in a, false)
  const b = layout.createTextObject(2, 0, 0, 'hi', '#111', 24, undefined, 'excalifont')
  assert.equal(b.fontFamily, 'excalifont')
})

test('changeTextFont re-measures and keeps position, id, text, color', () => {
  const item = layout.createTextObject(3, 10, 20, 'hello', '#abc', 24, wide)
  assert.equal(item.width, 100)
  const next = layout.changeTextFont(item, 'mono', () => 177)
  assert.equal(next.fontFamily, 'mono')
  assert.equal(next.width, 177)
  assert.equal(next.height, item.height)
  assert.deepEqual([next.id, next.x, next.y, next.text, next.color, next.fontSize], [3, 10, 20, 'hello', '#abc', 24])
  assert.equal(item.fontFamily, undefined)
})

test('document keeps a valid fontFamily, drops an invalid one, leaves old labels untouched', () => {
  const base = { kind: 'text', x: 0, y: 0, width: 50, height: 30, text: 'a', fontSize: 24, color: '#111' }
  const items = [
    { ...base, id: 1, fontFamily: 'serif' },
    { ...base, id: 2, fontFamily: 'comic-papyrus' },
    { ...base, id: 3 },
  ]
  const parsed = doc.parseDocument(JSON.stringify({ format: 'inkpad-document', version: 1, items }))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.droppedItems, 0)
  const [a, b, c] = parsed.document.items
  assert.equal(a.fontFamily, 'serif')
  assert.equal('fontFamily' in b, false)
  assert.equal('fontFamily' in c, false)
  assert.equal(doc.parseDocument(doc.stringifyDocument(parsed.document)).document.items[0].fontFamily, 'serif')
  assert.equal(parsed.document.version, 1)
})

test('saved-format font list matches the app font list', async () => {
  const src = await read('src/documentFormat.ts')
  const m = src.match(/TEXT_FONT_KINDS[^=]*=\s*\[([^\]]+)\]/)
  assert.deepEqual([...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]), IDS)
  const model = await read('src/canvasModel.ts')
  const m2 = model.match(/TEXT_FONT_IDS\s*=\s*\[([^\]]+)\]/)
  assert.deepEqual([...m2[1].matchAll(/'(\w+)'/g)].map((x) => x[1]), IDS)
})

test('renderer, editor, export, loader and picker use the label font', async () => {
  assert.match(await read('src/app/canvasRenderer.ts'), /textFont\(text\.fontSize, text\.fontFamily\)/)
  assert.match(await read('src/TextEditorOverlay.tsx'), /fontFamily: textFontFamily\(editor\.fontFamily\)/)
  assert.match(await read('src/sheetExport.ts'), /textFontFamily\(text\.fontFamily\)/)
  const fonts = await read('src/textFonts.ts')
  assert.match(fonts, /document\.fonts\.load/)
  const app = await read('src/App.tsx')
  assert.match(app, /loadTextFont\(DEFAULT_TEXT_FONT\)/)
  assert.match(app, /addEventListener\?\.\('loadingdone'/)
  assert.match(app, /historyCacheRef\.current = null; renderAllRef\.current\(\)/)
  assert.match(app, /onTextFont=\{changeTextFontChoice\}/)
  const css = await read('src/styles.css')
  assert.match(css, /@font-face\s*\{[^}]*Excalifont[^}]*Excalifont-Regular\.woff2/s)
})
