import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const colors = await loadModule('boardColors.ts')
const styles = await loadModule('boardStyle.ts')
const sheet = await loadModule('sheetExport.ts')
const doc = await loadModule('documentFormat.ts')

const light = styles.boardPalette(undefined)
const chalk = styles.boardPalette('chalk')
const dark = styles.boardPalette('dark')

const stroke = (color, extra = {}) => ({ kind: 'stroke', id: 1, points: [{ x: 10, y: 10, pressure: 0.5 }, { x: 40, y: 30, pressure: 0.5 }], color, width: 4, erase: false, ...extra })
const rect = (extra = {}) => ({ kind: 'rectangle', id: 2, x: 20, y: 20, width: 120, height: 80, strokeColor: '#202124', strokeWidth: 3, ...extra })
const text = (color) => ({ kind: 'text', id: 3, x: 5, y: 5, width: 100, height: 30, text: 'Hi', fontSize: 20, color })
const connector = (strokeColor) => ({ kind: 'connector', id: 4, start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, strokeColor, strokeWidth: 3, routing: 'straight', relationshipType: 'association' })

test('light board: the very same object comes back for every kind', () => {
  for (const item of [stroke('#202124'), rect({ fillColor: '#ffffff' }), text('#202124'), connector('#202124')]) {
    assert.equal(colors.resolveItemForBoard(item, light), item)
  }
})

test('default ink and white fill follow the dark and chalk boards', () => {
  const s = colors.resolveItemForBoard(stroke('#202124'), chalk)
  assert.equal(s.color, chalk.ink)
  assert.equal(colors.resolveItemForBoard(stroke('#202124'), dark).color, dark.ink)
  assert.equal(colors.resolveItemForBoard(text('#202124'), chalk).color, chalk.ink)
  assert.equal(colors.resolveItemForBoard(connector('#202124'), chalk).strokeColor, chalk.ink)
  const r = colors.resolveItemForBoard(rect({ fillColor: '#ffffff' }), chalk)
  assert.equal(r.strokeColor, chalk.ink)
  assert.equal(r.fillColor, chalk.fill)
  assert.equal(colors.resolveItemForBoard(rect({ fillColor: '#FFF' }), chalk).fillColor, chalk.fill)
})

test('comparison is case-insensitive', () => {
  assert.equal(colors.resolveInk('#202124'.toUpperCase(), chalk), chalk.ink)
  assert.equal(colors.resolveInk('#20212A', chalk), '#20212A')
})

test('explicit colours stay exactly as stored', () => {
  const items = [stroke('#3568d4'), text('#e45b55'), connector('#8856c7'), rect({ strokeColor: '#38845b', fillColor: '#fff3a3' })]
  for (const item of items) assert.equal(colors.resolveItemForBoard(item, chalk), item)
  assert.equal(colors.resolveItemForBoard(rect({ strokeColor: '#38845b', fillColor: '#fff3a3' }), dark).fillColor, '#fff3a3')
})

test('erase strokes and code blocks are left alone', () => {
  const eraser = stroke('#202124', { erase: true })
  assert.equal(colors.resolveItemForBoard(eraser, chalk), eraser)
  const code = { kind: 'code', id: 9, x: 0, y: 0, width: 100, height: 50, text: 'x', language: 'ts' }
  assert.equal(colors.resolveItemForBoard(code, chalk), code)
})

test('ink box strokes resolve, without touching the original', () => {
  const box = rect({ inkBox: { top: 40, mid: 60, ink: [stroke('#202124'), stroke('#e45b55', { id: 8 })] } })
  const resolved = colors.resolveItemForBoard(box, chalk)
  assert.equal(resolved.inkBox.ink[0].color, chalk.ink)
  assert.equal(resolved.inkBox.ink[1].color, '#e45b55')
  assert.equal(box.inkBox.ink[0].color, '#202124')
  assert.equal(box.strokeColor, '#202124')
})

test('resolved copies are cached per item and theme', () => {
  const item = stroke('#202124')
  const a = colors.resolveItemForBoard(item, chalk)
  assert.equal(colors.resolveItemForBoard(item, chalk), a)
  const b = colors.resolveItemForBoard(item, dark)
  assert.notEqual(a, b)
  assert.equal(b.color, dark.ink)
  assert.equal(item.color, '#202124')
})

test('sheet colour: boards replace the saved tint, light keeps it', () => {
  assert.equal(colors.sheetColorForBoard(undefined, '#fff8dc'), '#fff8dc')
  assert.equal(colors.sheetColorForBoard('mystery', '#fff8dc'), '#fff8dc')
  assert.equal(colors.sheetColorForBoard('chalk', '#fff8dc'), chalk.sheet)
  assert.equal(colors.sheetColorForBoard('dark', '#ffffff'), dark.sheet)
})

test('pen colours on boards: first keeps the stored ink, others are light chalk colours', () => {
  const base = [
    { name: 'Ink black', value: '#202124' }, { name: 'Cobalt blue', value: '#3568d4' }, { name: 'Coral red', value: '#e45b55' },
    { name: 'Leaf green', value: '#38845b' }, { name: 'Violet', value: '#8856c7' },
  ]
  const lightPens = colors.penColorsForBoard('light', base)
  assert.deepEqual(lightPens.map((c) => c.value), base.map((c) => c.value))
  assert.deepEqual(lightPens.map((c) => c.display), base.map((c) => c.value))
  const chalkPens = colors.penColorsForBoard('chalk', base)
  assert.equal(chalkPens.length, 5)
  assert.equal(chalkPens[0].value, '#202124')
  assert.equal(chalkPens[0].display, chalk.ink)
  assert.equal(chalkPens[0].name, 'Chalk white')
  assert.equal(colors.penColorsForBoard('dark', base)[0].name, 'White ink')
  assert.deepEqual(chalkPens.slice(1).map((c) => c.value), ['#f6d365', '#f4a6b8', '#8cc8f0', '#a8e0a0'])
  assert.equal(colors.displayColorForBoard('#202124', 'dark'), dark.ink)
})

// ---- exports --------------------------------------------------------------------------------------------------

const exportOptions = { width: 400, height: 300, template: 'blank', backgroundColor: '#ffffff' }

test('buildSheetSvg on a chalk board uses the chalk sheet and the resolved ink', () => {
  const svg = sheet.buildSheetSvg([stroke('#202124'), stroke('#e45b55', { id: 5 })], { ...exportOptions, board: 'chalk' })
  assert.ok(svg.includes(`<rect width="400" height="300" fill="${chalk.sheet}"/>`))
  assert.ok(svg.includes(chalk.ink))
  assert.ok(!svg.includes('#202124'))
  assert.ok(svg.includes('#e45b55'))
})

test('buildSheetSvg without a board is unchanged', () => {
  const svg = sheet.buildSheetSvg([stroke('#202124')], exportOptions)
  assert.ok(svg.includes('fill="#ffffff"/>'))
  assert.ok(svg.includes('#202124'))
  assert.equal(svg, sheet.buildSheetSvg([stroke('#202124')], { ...exportOptions, board: undefined }))
  assert.equal(svg, sheet.buildSheetSvg([stroke('#202124')], { ...exportOptions, board: 'unknown-board' }))
})

test('a transparent export keeps the stored colours whatever the board', () => {
  const plain = sheet.buildSheetSvg([stroke('#202124')], { ...exportOptions, transparent: true })
  const onChalk = sheet.buildSheetSvg([stroke('#202124')], { ...exportOptions, transparent: true, board: 'chalk' })
  assert.equal(onChalk, plain)
  assert.ok(onChalk.includes('#202124'))
  assert.ok(!onChalk.includes(chalk.sheet))
})

test('class box body and label pad use the board fill in a dark export', () => {
  const box = rect({ classBox: { name: 'A', attributes: '', methods: '' } })
  const svg = sheet.buildSheetSvg([box], { ...exportOptions, board: 'dark' })
  assert.ok(svg.includes(`fill="${dark.fill}"`))
})

// ---- saved data is never rewritten --------------------------------------------------------------------------

test('a chalk-board document saved via createDocument keeps #202124 on its items', () => {
  const items = [stroke('#202124'), rect({ fillColor: '#ffffff' }), text('#202124'), connector('#202124')]
  const created = doc.createDocument({ template: 'blank', background: 'white', board: 'chalk', items }, '2026-11-28T00:00:00.000Z')
  const parsed = doc.parseDocument(JSON.stringify(created))
  assert.equal(parsed.ok, true)
  const text_ = JSON.stringify(parsed.document.page.items ?? parsed.document)
  assert.ok(text_.includes('#202124'))
  assert.ok(!text_.includes(chalk.ink))
  assert.equal(parsed.document.page.board, 'chalk')
  // resolving for drawing does not touch the stored items
  for (const item of items) colors.resolveItemForBoard(item, chalk)
  assert.equal(items[0].color, '#202124')
  assert.equal(items[1].strokeColor, '#202124')
  assert.equal(items[1].fillColor, '#ffffff')
})

// ---- wiring ---------------------------------------------------------------------------------------------------

test('wiring: live stroke, item drawing, minimap, cache and exports resolve for the board', async () => {
  const app = await readAppSource()
  assert.match(app, /drawLiveStrokeFrame\(\{[^}]*color: resolveInk\(liveStroke\.color, palette\)/)
  assert.match(app, /drawItemToCanvas\(ctx, resolveItemForBoard\(item, palette\)/)
  assert.match(app, /drawMinimapItemsToCanvas\(.*geometry, focusRef\.current, palette\)/)
  assert.match(app, /cache\.theme === theme/)
  assert.match(app, /setBoardFill\(palette\.fill\)/)
  assert.match(app, /setConnectorLabelBackground\(sheetColorForBoard\(board, /)
  assert.match(app, /sheetColorForBoard\(board, PAGE_BACKGROUND_COLORS\[pageBackground\]\),\s*viewport/)
  assert.match(app, /data-board=\{theme === 'light' \? undefined : theme\}/)
  assert.match(app, /style !== 'clean' && textFontId !== 'excalifont'\) setTextFontId\('excalifont'\)/)
  assert.match(app, /<PenColors color=\{color\} onColor=\{selectColor\} theme=\{theme\}/)
  assert.match(app, /<ContextPanel boardTheme=\{theme\}/)
  const live = readFileSync(new URL('../src/app/liveStroke.ts', import.meta.url), 'utf8')
  assert.match(live, /const color = frame\.color \?\? stroke\.color/)
  assert.ok(!/preparePenContext\([a-zA-Z]+, stroke\.color\)/.test(live))
  const documents = readFileSync(new URL('../src/app/useDocuments.ts', import.meta.url), 'utf8')
  assert.match(documents, /\.\.\.\(page\.board \? \{ board: page\.board \} : \{\}\)/)
  const notebook = readFileSync(new URL('../src/notebookExport.ts', import.meta.url), 'utf8')
  assert.ok(!/board/.test(notebook.replace(/No `board` on purpose[^\n]*/, '')))
})

test('wiring: hard-coded whites use the board fill', () => {
  const renderer = readFileSync(new URL('../src/app/canvasRenderer.ts', import.meta.url), 'utf8')
  assert.ok(!/fillStyle = '#ffffff'/.test(renderer))
  assert.ok(!/: '#ffffff'/.test(renderer))
  const sketchyRender = readFileSync(new URL('../src/app/sketchyRender.ts', import.meta.url), 'utf8')
  assert.ok(!/'#ffffff'/.test(sketchyRender))
})
