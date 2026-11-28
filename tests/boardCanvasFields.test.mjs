import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { loadModule } from './helpers/loadModule.mjs'

const doc = await loadModule('documentFormat.ts')
const board = await loadModule('boardStyle.ts')
const canvas = await loadModule('canvasTypes.ts')

const base = { template: 'blank', background: 'white', items: [] }
const roundTrip = (input) => {
  const parsed = doc.parseDocument(JSON.stringify(doc.createDocument(input, '2026-11-28T00:00:00.000Z')))
  assert.equal(parsed.ok, true)
  return parsed
}

test('old files without board / canvas load and re-save without the fields', () => {
  const parsed = roundTrip(base)
  assert.equal('board' in parsed.document.page, false)
  assert.equal('canvas' in parsed.document.page, false)
  assert.equal(doc.isLossyParse(parsed.document), false)
  assert.equal(parsed.document.version, 1)
})

test('board and canvas round-trip and are not a lossy parse', () => {
  const parsed = roundTrip({ ...base, template: 'dotted', board: 'chalk', canvas: 'grid', sketchy: true })
  assert.equal(parsed.document.page.board, 'chalk')
  assert.equal(parsed.document.page.canvas, 'grid')
  assert.equal(parsed.document.page.template, 'dotted')
  assert.equal(doc.isLossyParse(parsed.document), false)
  assert.equal(parsed.document.version, 1)
})

test('unknown board / canvas words from a newer InkPad are kept; junk is dropped', () => {
  const text = JSON.stringify({ format: 'inkpad-document', version: 1, title: 'x', createdAt: 'a', updatedAt: 'b', page: { template: 'lined', background: 'white', board: 'neon-2', canvas: 'hexagon' }, items: [] })
  const parsed = doc.parseDocument(text)
  assert.equal(parsed.document.page.board, 'neon-2')
  assert.equal(parsed.document.page.canvas, 'hexagon')
  const again = doc.parseDocument(JSON.stringify(doc.createDocument({ ...base, template: parsed.document.page.template, board: parsed.document.page.board, canvas: parsed.document.page.canvas })))
  assert.equal(again.document.page.board, 'neon-2')
  assert.equal(again.document.page.canvas, 'hexagon')
  const junk = doc.parseDocument(text.replace('"neon-2"', '"<b>"').replace('"hexagon"', '42'))
  assert.equal('board' in junk.document.page, false)
  assert.equal('canvas' in junk.document.page, false)
  // Unknown values draw as the default.
  assert.equal(board.boardTheme('neon-2'), 'light')
  assert.equal(canvas.effectiveCanvasType('lined', 'hexagon'), 'lined')
})

test('signature notices board and canvas changes', () => {
  const sig = { title: 't', template: 'blank', background: 'white', items: [] }
  assert.equal(doc.sameSignature(sig, { ...sig }), true)
  assert.equal(doc.sameSignature(sig, { ...sig, board: 'chalk' }), false)
  assert.equal(doc.sameSignature(sig, { ...sig, canvas: 'grid' }), false)
})

test('board style fields', () => {
  assert.deepEqual(board.boardFieldsFor('clean', false), { board: undefined, sketchy: false })
  assert.deepEqual(board.boardFieldsFor('clean', true), { board: 'dark', sketchy: false })
  assert.deepEqual(board.boardFieldsFor('sketch', true), { board: 'dark', sketchy: true })
  assert.deepEqual(board.boardFieldsFor('chalk', false), { board: 'chalk', sketchy: true })
  assert.equal(board.boardStyleOf(undefined, false), 'clean')
  assert.equal(board.boardStyleOf('dark', true), 'sketch')
  assert.equal(board.boardStyleOf('chalk', false), 'chalk')
})

test('canvas type fields keep a similar template for older builds', () => {
  assert.deepEqual(canvas.canvasFieldsFor('grid'), { template: 'dotted', canvas: 'grid' })
  assert.deepEqual(canvas.canvasFieldsFor('cornell'), { template: 'lined', canvas: 'cornell' })
  assert.deepEqual(canvas.canvasFieldsFor('lined'), { template: 'lined', canvas: undefined })
  assert.equal(canvas.effectiveCanvasType('dotted', 'isometric'), 'isometric')
  assert.equal(canvas.effectiveCanvasType('dotted', undefined), 'dotted')
})

test('App saves board and canvas with the diagram and loads them back', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /board: boardRef\.current, canvas: pageCanvasRef\.current/)
  assert.match(app, /setBoard\(loaded\.page\.board\)/)
  assert.match(app, /setPageCanvas\(loaded\.page\.canvas\)/)
  const hook = readFileSync(new URL('../src/app/useDocuments.ts', import.meta.url), 'utf8')
  assert.match(hook, /board: page\.board,\s*canvas: page\.canvas/)
})

test('canvas marks follow the board in the sheet layer, minimap and SVG export', async () => {
  const sheet = await loadModule('sheetExport.ts')
  const svg = sheet.buildSheetSvg([], { width: 200, height: 200, template: 'grid', backgroundColor: '#ffffff', board: 'chalk' })
  assert.match(svg, new RegExp(board.BOARD_PALETTES.chalk.line))
  assert.match(svg, new RegExp(board.BOARD_PALETTES.chalk.sheet))
  const light = sheet.buildSheetSvg([], { width: 200, height: 200, template: 'grid', backgroundColor: '#ffffff' })
  assert.doesNotMatch(light, new RegExp(board.BOARD_PALETTES.chalk.line))
  const transparent = sheet.buildSheetSvg([], { width: 200, height: 200, template: 'grid', backgroundColor: '#ffffff', board: 'chalk', transparent: true })
  assert.doesNotMatch(transparent, /pattern/)
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  // Round 12: the marks pass through effectiveMarks (mark strength), still the board's own palette for non-light boards and none for the benchmark.
  assert.match(app, /pageSpacing,\s*benchmarkBackground \? undefined : effectiveMarks\(theme === 'light' \? undefined : palette,/)
  assert.match(app, /drawPageTemplateOverview\(ctx, canvasType, \{[^}]*\}, effectiveMarks\(theme === 'light' \? undefined : palette,/)
})

test('template and import ink (#1e1e1e) and black follow the board too', async () => {
  const colors = await loadModule('boardColors.ts')
  for (const c of ['#202124', '#1e1e1e', '#1E1E1E', '#000000']) assert.equal(colors.isDefaultInk(c), true)
  assert.equal(colors.isDefaultInk('#3568d4'), false)
})
