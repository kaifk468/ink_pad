import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { loadModule } from './helpers/loadModule.mjs'

const picker = await loadModule('boardPicker.ts')
const menuSearch = await loadModule('app/menuSearch.ts')
const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
const sheet = await read('app/DesktopMenuSheet.tsx')
const bar = await read('app/TopLeftBar.tsx')
const previews = await read('app/BoardPreviews.tsx')
const hint = await read('app/EmptyCanvasHint.tsx')
const app = await read('App.tsx')
const css = await read('styles.css')
const panel = bar.slice(bar.indexOf('{menuOpen && <div className="menu-panel"'), bar.indexOf('{props.diagnostics.enabled && <>'))

test('selected tiles follow board, sketchy, template and canvas', () => {
  const s = (board, sketchy, template = 'blank', canvas) => picker.boardPickerState(board, sketchy, template, canvas)
  assert.equal(s(undefined, false).style, 'clean')
  assert.equal(s(undefined, true).style, 'sketch')
  assert.equal(s('dark', true).style, 'sketch')
  assert.equal(s('dark', false).style, 'clean')
  assert.equal(s('dark', false).dark, true)
  // Sketch selected only when sketchy is on and the board is not chalk.
  assert.equal(s('chalk', true).style, 'chalk')
  assert.equal(s('chalk', false).style, 'chalk')
  assert.equal(s('chalk', true).chalk, true)
  assert.equal(s('chalk', true).dark, false)
  // An unknown board value draws as light.
  assert.deepEqual([s('neon', false).style, s('neon', false).dark, s('neon', false).sheetFromBoard], ['clean', false, false])
  assert.equal(s('dark', false).sheetFromBoard, true)
  assert.equal(s('chalk', false).sheetFromBoard, true)
})

test('the selected canvas tile uses the extra canvas type when known, otherwise the template; spacing hides on blank', () => {
  const s = (template, canvas) => picker.boardPickerState(undefined, false, template, canvas)
  assert.equal(s('dotted', undefined).canvas, 'dotted')
  assert.equal(s('dotted', 'grid').canvas, 'grid')
  assert.equal(s('lined', 'cornell').canvas, 'cornell')
  assert.equal(s('dotted', 'future-type').canvas, 'dotted')
  assert.equal(s('blank', undefined).showSpacing, false)
  assert.equal(s('blank', undefined).canvas, 'blank')
  assert.equal(s('dotted', 'isometric').showSpacing, true)
})

test('canvas previews draw each pattern inside the 72x48 tile', () => {
  assert.deepEqual(picker.canvasPreviewMarks('blank'), { dots: '', lines: '', strong: '' })
  const dots = picker.canvasPreviewMarks('dotted')
  assert.match(dots.dots, /^M6 6h0/)
  assert.equal(dots.lines, '')
  assert.ok(picker.canvasPreviewMarks('lined').lines.startsWith('M0 10H72'))
  const grid = picker.canvasPreviewMarks('grid')
  assert.match(grid.lines, /M0 8H72/)
  assert.match(grid.lines, /M8 0V48/)
  // Isometric rows are staggered by half a column.
  const iso = picker.canvasPreviewMarks('isometric').dots
  assert.match(iso, /M6 6h0/)
  assert.match(iso, /M10 13h0/)
  const cornell = picker.canvasPreviewMarks('cornell')
  assert.match(cornell.strong, /M20 0V36/)
  assert.ok(cornell.lines.length > 0)
  for (const type of ['dotted', 'isometric', 'lined', 'grid', 'cornell']) {
    const marks = picker.canvasPreviewMarks(type)
    for (const [, x, y] of `${marks.dots}`.matchAll(/M(\d+) (\d+)h0/g)) assert.ok(Number(x) < 72 && Number(y) < 48, `${type} dot ${x},${y}`)
  }
})

test('palette commands: three boards, one theme toggle for Clean/Sketch, eight canvases', () => {
  const labels = (style, dark) => picker.boardCommands(style, dark).map((c) => c.label)
  assert.deepEqual(labels('clean', false), ['Board: Clean', 'Board: Sketch', 'Board: Chalkboard', 'Board: Dark theme', 'Canvas: Blank', 'Canvas: Dots', 'Canvas: Lined', 'Canvas: Grid', 'Canvas: Isometric', 'Canvas: Cornell', 'Canvas: Lanes', 'Canvas: Notebook'])
  assert.ok(labels('sketch', true).includes('Board: Light theme'))
  assert.ok(!labels('sketch', true).includes('Board: Dark theme'))
  // The chalkboard is always dark: no theme toggle.
  assert.ok(!labels('chalk', false).some((label) => /theme/.test(label)))
  const dark = picker.boardCommands('sketch', false).find((c) => c.id === 'board:dark')
  assert.deepEqual([dark.style, dark.dark], ['sketch', true])
  const sketch = picker.boardCommands('clean', true).find((c) => c.id === 'board:sketch')
  assert.deepEqual([sketch.style, sketch.dark], ['sketch', true])
  const grid = picker.boardCommands('clean', false).find((c) => c.id === 'canvas:grid')
  assert.equal(grid.canvas, 'grid')
  assert.match(grid.keywords, /graph/)
})

test('menu search finds the board rows by chalk, dark, grid, graph, isometric, cornell, board, style and paper', () => {
  const rows = [
    { id: 'board-style', label: 'Style', keywords: picker.BOARD_STYLE_KEYWORDS },
    { id: 'board-theme', label: 'Theme', keywords: picker.BOARD_THEME_KEYWORDS },
    { id: 'board-canvas', label: 'Canvas', keywords: picker.BOARD_CANVAS_KEYWORDS },
  ]
  const ids = (q) => menuSearch.filterMenuEntries(rows, q).map((r) => r.id)
  assert.ok(ids('chalk').includes('board-style'))
  assert.ok(ids('dark').includes('board-theme') && ids('dark').includes('board-style'))
  for (const word of ['grid', 'graph', 'isometric', 'cornell', 'paper']) assert.ok(ids(word).includes('board-canvas'), word)
  assert.equal(ids('board').length, 3)
  assert.equal(ids('style').includes('board-style'), true)
})

test('both menus have a Board section whose tiles call onBoardStyle and onCanvasType', () => {
  assert.match(sheet, /type SectionName = 'Diagram' \| 'Board'/)
  assert.match(sheet, /SECTIONS: SectionName\[\] = \['Diagram', 'Board', 'Preferences'/)
  assert.match(sheet, /id: 'board-style'[^\n]*BOARD_STYLE_KEYWORDS/)
  assert.match(sheet, /id: 'board-canvas'[^\n]*BOARD_CANVAS_KEYWORDS/)
  assert.match(sheet, /selected=\{picker\.style === id\} onClick=\{\(\) => props\.onBoardStyle\?\.\(id, picker\.dark\)\}/)
  assert.match(sheet, /selected=\{picker\.canvas === id\} onClick=\{\(\) => props\.onCanvasType\?\.\(id\)\}/)
  assert.match(sheet, /props\.onBoardStyle\?\.\(picker\.style, dark\)/)
  assert.match(sheet, /Chalkboard is always dark/)
  assert.match(sheet, /Set by the board style/)
  assert.doesNotMatch(sheet, /TEMPLATES/)
  assert.ok(sheet.indexOf("'Diagram', 'Board'") > 0)

  assert.match(panel, /<div className="menu-section-title" data-section="board">Board<\/div>/)
  assert.match(panel, /selected=\{picker\.style === id\} onClick=\{\(\) => props\.onBoardStyle\?\.\(id, picker\.dark\)\}/)
  assert.match(panel, /selected=\{picker\.canvas === id\} onClick=\{\(\) => props\.onCanvasType\?\.\(id\)\}/)
  assert.match(panel, /props\.onBoardStyle\?\.\(picker\.style, dark\)/)
  assert.match(panel, /Chalkboard is always dark/)
  assert.ok(panel.indexOf('>File<') < panel.indexOf('>Board<') && panel.indexOf('>Board<') < panel.indexOf('>Canvas<'))
  assert.doesNotMatch(panel, /PAGE_TEMPLATE_CHOICES/)
  // Both menus use the one shared preview file.
  assert.match(sheet, /from '\.\/BoardPreviews'/)
  assert.match(bar, /from '\.\/BoardPreviews'/)
  assert.match(previews, /export function BoardStylePreview/)
  assert.match(previews, /export function CanvasPreview/)
  assert.match(previews, /BOARD_PALETTES\.chalk/)
})

test('tiles are at least 44px on the tablet and the menu still scrolls', () => {
  assert.match(css, /\.bp-tile \{[^}]*min-height: 44px/)
  assert.match(css, /\.menu-panel \{[^}]*max-height: calc\(100dvh - 96px\); overflow-y: auto;/)
})

test('palette entries call chooseBoardStyle / chooseCanvasType in group Settings', () => {
  assert.match(app, /boardCommands\(boardStyleOf\(board, sketchy\), isDarkBoard\(board\)\)/)
  assert.match(app, /group: 'Settings', keywords: command\.keywords,/)
  assert.match(app, /chooseBoardStyle\(command\.style, command\.dark\)/)
  assert.match(app, /chooseCanvasType\(command\.canvas\)/)
})

test('the empty-page "Choose board" button opens the menu at the Board section and never blocks the pen', () => {
  assert.match(hint, /className="empty-canvas-board" onClick=\{onBoard\}>Choose board/)
  assert.match(app, /onBoard=\{\(\) => setMenuRequest\(\(count\) => count \+ 1\)\}/)
  assert.match(app, /menuRequest=\{menuRequest\}/)
  assert.match(bar, /querySelector\('\[data-section="board"\]'\)\?\.scrollIntoView/)
  assert.match(css, /\.empty-canvas-hint \{[^}]*pointer-events: none/)
  assert.match(css, /\.empty-canvas-actions \{[^}]*pointer-events: none/)
  assert.match(css, /\.empty-canvas-board \{ pointer-events: auto/)
})
