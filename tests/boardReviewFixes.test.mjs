import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { loadModule } from './helpers/loadModule.mjs'

const colors = await loadModule('boardColors.ts')
const styles = await loadModule('boardStyle.ts')
const logoLayout = await loadModule('logoLayout.ts')
const sheet = await loadModule('sheetExport.ts')
const doc = await loadModule('documentFormat.ts')

const chalk = styles.boardPalette('chalk')
const dark = styles.boardPalette('dark')

const pt = (x, y) => ({ x, y, pressure: 0.5 })
const stroke = (color, points, id = 1) => ({ kind: 'stroke', id, points, color, width: 4, erase: false })
const rect = (extra = {}) => ({ kind: 'rectangle', id: 2, x: 100, y: 100, width: 200, height: 100, strokeColor: '#202124', strokeWidth: 3, ...extra })
const text = (x, y, color = '#202124', id = 3) => ({ kind: 'text', id, x, y, width: 40, height: 20, text: 'Hi', fontSize: 20, color })

// 1. mutable live stroke
test('a stroke whose points are replaced or grown is resolved again (live line / arrow preview)', () => {
  const live = stroke('#202124', [pt(0, 0), pt(10, 10)])
  const first = colors.resolveItemForBoard(live, dark)
  assert.equal(first.color, dark.ink)
  assert.equal(colors.resolveItemForBoard(live, dark), first, 'unchanged stroke: the cached copy')
  live.points = [live.points[0], pt(50, 60)]
  const second = colors.resolveItemForBoard(live, dark)
  assert.equal(second.points[1].x, 50)
  live.points.push(pt(70, 80))
  const third = colors.resolveItemForBoard(live, dark)
  assert.equal(third.points.length, 3)
  live.color = '#e45b55'
  assert.equal(colors.resolveItemForBoard(live, dark).color, '#e45b55')
})

// 2. fill swatches
test('fill swatches: the first stores the default white fill and shows the board fill', () => {
  const base = [{ name: 'Ink black', value: '#202124' }, { name: 'a', value: '#111111' }, { name: 'b', value: '#222222' }]
  assert.deepEqual(colors.fillColorsForBoard('light', base).map((c) => c.value), ['#202124', '#111111', '#222222'])
  for (const theme of ['dark', 'chalk']) {
    const fills = colors.fillColorsForBoard(theme, base)
    assert.equal(fills[0].value, '#ffffff')
    assert.equal(fills[0].display, styles.boardPalette(theme).fill)
    assert.ok(fills.every((c) => c.value !== '#202124'))
  }
  const panel = readFileSync(new URL('../src/app/ContextPanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /label="Fill colour picker" fill /)
  assert.match(panel, /fill \? fillColorsForBoard\(theme, COLORS\)/)
})

// 3. ink on light fills
test('text and strokes on an explicit light fill keep their stored ink on dark boards', () => {
  const sticky = rect({ fillColor: '#fff3a3' })
  const onSticky = text(150, 130)
  const offSticky = text(500, 500, '#202124', 4)
  const scribble = stroke('#202124', [pt(120, 120), pt(200, 160)], 5)
  const items = [sticky, onSticky, offSticky, scribble]
  assert.equal(colors.resolveItemForBoard(onSticky, chalk, items).color, '#202124')
  assert.equal(colors.resolveItemForBoard(scribble, dark, items).color, '#202124')
  assert.equal(colors.resolveItemForBoard(offSticky, chalk, items).color, chalk.ink)
})

test('a default white fill host does not keep ink; pastel presets and dark fills behave', () => {
  const white = rect({ fillColor: '#ffffff' })
  const pastel = rect({ id: 6, x: 400, y: 100, fillColor: '#d0bfff' })
  const darkFill = rect({ id: 7, x: 700, y: 100, fillColor: '#1971c2' })
  const t1 = text(150, 130, '#202124', 8)
  const t2 = text(450, 130, '#202124', 9)
  const t3 = text(750, 130, '#202124', 10)
  const items = [white, pastel, darkFill, t1, t2, t3]
  assert.equal(colors.resolveItemForBoard(t1, dark, items).color, dark.ink)
  assert.equal(colors.resolveItemForBoard(t2, dark, items).color, '#202124')
  assert.equal(colors.resolveItemForBoard(t3, dark, items).color, dark.ink)
})

test('the host lookup is built once per items array', () => {
  const items = [rect({ fillColor: '#fff3a3' }), text(150, 130)]
  const first = colors.resolveItemForBoard(items[1], dark, items)
  assert.equal(colors.resolveItemForBoard(items[1], dark, items), first)
  const src = readFileSync(new URL('../src/boardColors.ts', import.meta.url), 'utf8')
  assert.match(src, /hostCache = new WeakMap<readonly CanvasItem\[\]/)
})

test('SVG board export keeps ink on a sticky note', () => {
  const items = [rect({ fillColor: '#fff3a3', strokeColor: '#e0b400' }), text(150, 130), text(500, 400, '#202124', 4)]
  const svg = sheet.buildSheetSvg(items, { width: 800, height: 600, template: 'blank', backgroundColor: '#ffffff', board: 'dark' })
  assert.ok(svg.includes('#202124'), 'sticky label keeps the stored ink')
  assert.ok(svg.includes(dark.ink), 'the loose label follows the board')
})

// 4. dark brand logos
test('a very dark brand logo draws in the board ink on dark boards only', () => {
  const box = { strokeColor: '#202124', logoColor: 'brand' }
  assert.equal(logoLayout.logoFillColor(box, { hex: '#181717' }), '#181717')
  assert.equal(logoLayout.logoFillColor(box, { hex: '#181717' }, null), '#181717')
  assert.equal(logoLayout.logoFillColor(box, { hex: '#181717' }, dark.ink), dark.ink)
  assert.equal(logoLayout.logoFillColor(box, { hex: '#1877f2' }, dark.ink), '#1877f2')
  assert.equal(logoLayout.logoFillColor({ strokeColor: '#202124' }, { hex: '#181717' }, dark.ink), '#202124')
  const logoBox = rect({ logo: 'github', logoColor: 'brand', id: 11 })
  const svg = sheet.buildSheetSvg([logoBox], { width: 800, height: 600, template: 'blank', backgroundColor: '#ffffff', board: 'chalk' })
  if (svg.includes('<path')) assert.ok(!svg.includes('fill="#181717"'))
})

// 5. text editor
test('the text editor shows the resolved colour and a dark veil on dark boards', () => {
  const overlay = readFileSync(new URL('../src/TextEditorOverlay.tsx', import.meta.url), 'utf8')
  assert.match(overlay, /color: displayColor \?\? editor\.color/)
  assert.match(overlay, /text-editor-dark/)
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /displayColor=\{resolveInk\(textEditor\.color, palette\)\}/)
  assert.match(app, /dark=\{theme !== 'light'\}/)
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.match(css, /\.text-editor\.text-editor-dark/)
})

// 6. lossy drops
const baseDoc = { format: 'inkpad-document', version: 1, title: 't', createdAt: 'a', updatedAt: 'b', page: { template: 'blank', background: 'white' }, items: [] }
const parse = (patch) => {
  const raw = { ...baseDoc, ...patch, page: { ...baseDoc.page, ...(patch.page ?? {}) } }
  const result = doc.parseDocument(JSON.stringify(raw))
  assert.equal(result.ok, true)
  return result.document
}
const box = (extra) => ({ kind: 'rectangle', id: 1, x: 0, y: 0, width: 100, height: 100, strokeColor: '#202124', strokeWidth: 3, ...extra })

test('a present but invalid board / canvas makes the parse lossy', () => {
  assert.equal(doc.isLossyParse(parse({})), false)
  assert.equal(doc.isLossyParse(parse({ page: { board: 'chalk', canvas: 'grid' } })), false)
  assert.equal(doc.isLossyParse(parse({ page: { board: 'Not A Word' } })), true)
  assert.equal(doc.isLossyParse(parse({ page: { canvas: 42 } })), true)
})

test('a dropped logo / logoColor makes the parse lossy; kept ones do not', () => {
  assert.equal(doc.isLossyParse(parse({ items: [box({ logo: 'github', logoColor: 'brand' })] })), false)
  assert.equal(doc.isLossyParse(parse({ items: [box({ logo: 'github' })] })), false)
  assert.equal(doc.isLossyParse(parse({ items: [box({ logo: 'github', logoColor: 'rainbow' })] })), true)
  assert.equal(doc.isLossyParse(parse({ items: [box({ logo: 'github', ellipse: true })] })), true)
  assert.equal(doc.isLossyParse(parse({ items: [box({ logo: 'github', diamond: true })] })), true)
})
