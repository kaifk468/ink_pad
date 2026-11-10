import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { readAppSource } from './helpers/appSource.mjs'

const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
const app = await readAppSource()
const read = (name) => readFile(new URL(`../src/app/${name}`, import.meta.url), 'utf8')
const dock = await read('ToolDock.tsx')
const tray = await read('InsertTray.tsx')
const context = await read('ContextPanel.tsx')
const topLeft = await read('TopLeftBar.tsx')

function blockAt(source, openingBrace) {
  let depth = 0
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(openingBrace + 1, index)
    }
  }
  throw new Error('Unclosed CSS block')
}

function ruleBody(source, selector) {
  const selectorAt = source.indexOf(selector)
  assert.notEqual(selectorAt, -1, `missing CSS selector ${selector}`)
  return blockAt(source, source.indexOf('{', selectorAt))
}

const mediaBody = (query) => blockAt(styles, styles.indexOf('{', styles.indexOf(query)))

test('the dock sits at the bottom center, stays inside the viewport and never clips the Insert tray', () => {
  const rule = ruleBody(styles, '.tool-dock {')
  assert.match(rule, /bottom:\s*max\(16px/)
  assert.match(rule, /left:\s*50%/)
  assert.match(rule, /max-width:\s*calc\(100vw\s*-\s*24px\)/)
  assert.doesNotMatch(rule, /overflow/)
  assert.match(ruleBody(styles, '.insert-tray {'), /bottom:\s*calc\(100%\s*\+\s*14px\)/)
})

test('dock order is Pen, Eraser | Select, Lasso | Connector, Insert', () => {
  const order = ['pen-button', 'eraser-control', 'selection-button', 'lasso-button', 'connector-button', '<InsertTray']
  const positions = order.map((marker) => dock.indexOf(marker))
  assert.ok(positions.every((position) => position >= 0), `missing marker in ${positions}`)
  assert.deepEqual([...positions].sort((a, b) => a - b), positions)
  assert.equal((dock.match(/dock-divider/g) ?? []).length, 2)
})

test('every dock tool keeps its label, pressed state and selected styling', () => {
  for (const label of ['Pen', 'Eraser', 'Select', 'Lasso', 'Connector']) assert.match(dock, new RegExp(`aria-label="${label}"`))
  for (const selector of ['pen-button', 'selection-button', 'lasso-button', 'connector-button', 'eraser-button']) {
    assert.match(dock, new RegExp(`tool-button ${selector}\\$\\{props\\.[a-zA-Z]+ \\? ' selected' : ''\\}`))
  }
  assert.match(app, /penActive=\{penModeActive\}/)
  assert.match(app, /connectorActive=\{connectorMode \|\| umlConnectorType !== null\}/)
  assert.match(dock, /aria-expanded=\{props\.eraserMenuOpen\}/)
  assert.match(styles, /\.tool-button\.selected\s*\{[^}]*background:\s*#e9edff/)
})

test('the Insert tray holds Text label, Shapes, Typed class box and the three HLD shapes', () => {
  for (const label of ['Text', 'Shapes', 'Typed class box']) assert.match(tray, new RegExp(`aria-label="${label}"`))
  for (const shape of ['database', 'queue', 'service']) assert.match(tray, new RegExp(`shape: '${shape}'`))
  assert.match(tray, /onHldShape\(shape\)/)
  assert.doesNotMatch(tray, /soon-badge/)
  assert.match(tray, /key === 'Escape'/)
  assert.match(tray, /rootRef\.current\.contains/)
  assert.match(tray, /aria-expanded=\{open\}/)
})

test('tray entries and dock buttons reuse the existing tool handlers instead of new logic', () => {
  for (const handler of ['toggleShapeTool', 'toggleSelectTool', 'toggleTextTool', 'toggleClassTool', 'toggleLassoTool', 'toggleConnectorTool', 'tapEraserTool', 'selectPenMode']) {
    assert.match(app, new RegExp(`const ${handler} = |${handler}\\b`))
  }
  assert.match(app, /onText=\{toggleTextTool\}/)
  assert.match(app, /onClass=\{toggleClassTool\}/)
  assert.match(app, /onShapes=\{toggleShapeTool\}/)
  assert.match(app, /setEraser\(\(value\) => !value\)/)
  assert.match(app, /const toggleConnectorTool = \(\) => \{ const next = !connectorMode; setConnectorMode\(next\)/)
})

test('the contextual panel shows colors, widths and stroke display only for drawing tools, and text sizes in Text mode', () => {
  assert.match(app, /showStyle=\{optionsFor === 'pen' && penModeActive\}/)
  assert.match(app, /showTextSizes=\{optionsFor === 'text' && textMode\}/)
  assert.match(context, /aria-label="Pen color"/)
  assert.match(context, /aria-label="Stroke thickness"/)
  assert.match(context, /aria-label="Raw stroke display"[\s\S]*?aria-pressed=\{props\.strokeDisplayMode === 'raw'\}/)
  assert.match(context, /aria-label="Smooth stroke display"[\s\S]*?aria-pressed=\{props\.strokeDisplayMode === 'smooth'\}/)
  assert.match(context, /aria-label=\{`Text size \$\{size\}`\}/)
  assert.match(context, /return null/)
  assert.match(app, /const selectColor = \(value: string\) => \{ setColor\(value\); setEraser\(false\)/)
})

test('connector relationship controls and Clear selection moved into the contextual panel', () => {
  assert.match(context, /aria-label="Connector relationship type"/)
  assert.match(context, /aria-label="Reverse connector direction"/)
  assert.match(context, /Clear selection/)
  assert.match(app, /relationship=\{selectedConnectorId !== null && selectedConnectorType !== null/)
})

test('top bars: menu, library, title, undo/redo and account button', () => {
  assert.match(topLeft, /aria-label="Menu"/)
  assert.match(topLeft, /aria-label="Library"/)
  assert.match(topLeft, /aria-label="Page template"/)
  assert.match(topLeft, /aria-label="Sheet background color"/)
  assert.match(topLeft, /Clear canvas/)
  assert.match(topLeft, /Export and import/)
  assert.match(app, /<HomeScreen/)
  assert.match(app, /<span>Undo<\/span>|HistoryBar/)
  assert.match(app, /<AccountButton profile=\{driveProfile\}/)
  assert.match(app, /onOpenStorage=\{\(\) => setStoragePanelOpen\(true\)\} leading=/)
})

test('zoom controls and save status are present and the old top toolbar is gone', () => {
  assert.match(app, /aria-label="Zoom in"/)
  assert.match(app, /aria-label="Zoom out"/)
  assert.match(app, /const zoomBy = \(factor: number\)/)
  assert.match(app, /navigator-status/)
  assert.doesNotMatch(app, /className="toolbar"/)
  assert.doesNotMatch(styles, /\n\.toolbar\s*\{/)
})

test('placeholder controls are not interactive tools and nothing hides a control with display none', () => {
  assert.doesNotMatch(styles, /\.(tool-dock|context-panel|top-left-bar|history-bar|zoom-controls)[^{]*\{[^}]*display:\s*none/)
  for (const query of ['@media (max-width: 980px)', '@media (max-width: 720px)', '@media (max-width: 410px)']) {
    const body = mediaBody(query)
    for (const selector of ['pen-button', 'eraser-control', 'selection-button', 'lasso-button', 'connector-button', 'insert-button', 'history-button']) {
      assert.doesNotMatch(body, new RegExp(`\\.${selector}\\s*\\{[^}]*display:\\s*none`, 's'))
    }
  }
})

test('touch targets are at least 44px for the new layout controls', () => {
  assert.match(ruleBody(styles, '.top-icon-button, .account-button {'), /width:\s*48px;\s*height:\s*48px/)
  assert.match(ruleBody(styles, '.zoom-controls button {'), /width:\s*44px;\s*height:\s*48px/)
  assert.match(ruleBody(styles, '.insert-entry {'), /min-height:\s*46px/)
  assert.match(ruleBody(styles, '.context-panel .color-swatch {'), /width:\s*40px;\s*height:\s*40px/)
  assert.match(ruleBody(styles, '.context-panel .thickness-button {'), /width:\s*44px;\s*height:\s*44px/)
  assert.match(mediaBody('@media (max-width: 720px)'), /\.tool-button\s*\{[^}]*min-width:\s*44px/)
})

test('corner panels move above the dock on narrow tablets so they never overlap it', () => {
  const body = mediaBody('@media (max-width: 980px)')
  assert.match(body, /\.viewport-navigator\s*\{[^}]*bottom:\s*calc\(max\(16px,\s*env\(safe-area-inset-bottom\)\)\s*\+\s*84px\)/)
  assert.match(body, /\.zoom-controls\s*\{[^}]*bottom:\s*calc\(max\(16px,\s*env\(safe-area-inset-bottom\)\)\s*\+\s*84px\)/)
})

test('the sheet layer and canvas stacking are unchanged', () => {
  assert.match(ruleBody(styles, '.sheet-layer {'), /position:\s*absolute;[\s\S]*pointer-events:\s*none/)
  assert.match(ruleBody(styles, '.drawing-canvas {'), /position:\s*absolute;\s*inset:\s*0/)
  assert.ok(app.indexOf('className="sheet-layer"') < app.indexOf('className={`drawing-canvas'))
})
