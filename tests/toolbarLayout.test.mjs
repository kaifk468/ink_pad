import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

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

function ruleBody(source, selector, startAt = 0) {
  const selectorAt = source.indexOf(selector, startAt)
  assert.notEqual(selectorAt, -1, `missing CSS selector ${selector}`)
  return blockAt(source, source.indexOf('{', selectorAt))
}

const toolbar = ruleBody(styles, '.toolbar {')
const toolbarItems = ruleBody(styles, '.toolbar > * {')
const mobileAt = styles.indexOf('@media (max-width: 720px)')
const mobileBody = blockAt(styles, styles.indexOf('{', mobileAt))
const narrowAt = styles.indexOf('@media (max-width: 410px)')
const narrowBody = blockAt(styles, styles.indexOf('{', narrowAt))

test('toolbar stays inside narrow, medium, and wide viewports and scrolls instead of clipping tools', () => {
  for (const width of [320, 640, 1280]) {
    const maxWidth = width - 24
    assert.ok(maxWidth > 0)
    assert.match(toolbar, /max-width:\s*calc\(100vw\s*-\s*24px\)/)
    assert.match(toolbar, /overflow-x:\s*auto/)
    assert.match(toolbar, /overflow-y:\s*hidden/)
    assert.match(toolbar, /touch-action:\s*pan-x/)
    assert.match(toolbarItems, /flex:\s*0\s+0\s+auto/)
  }
  assert.match(mobileBody, /\.toolbar\s*\{[^}]*width:\s*calc\(100%\s*-\s*24px\)/s)
  assert.match(mobileBody, /\.toolbar\s*\{[^}]*left:\s*12px/s)
  assert.match(narrowBody, /\.toolbar\s*\{[^}]*gap:\s*3px/s)
})

test('responsive rules keep every existing tool control rendered and horizontally reachable', () => {
  const toolSelectors = ['pen-button', 'shape-button', 'selection-button', 'lasso-button', 'connector-button', 'eraser-button']
  const controlSelectors = [...toolSelectors, 'clear-selection-button', 'relationship-controls', 'color-group', 'thickness-group', 'stroke-display-control', 'page-template-control', 'history-button', 'clear-button']
  for (const selector of toolSelectors) {
    assert.match(app, new RegExp(`className=\{\`tool-button ${selector}`))
  }
  assert.match(app, /aria-label="Eraser"/)
  for (const selector of controlSelectors) assert.doesNotMatch(styles, new RegExp(`\\.${selector}\\s*\\{[^}]*display:\\s*none`, 's'))
  for (const body of [mobileBody, narrowBody]) {
    for (const selector of controlSelectors) {
      assert.doesNotMatch(body, new RegExp(`\\.${selector}\\s*\\{[^}]*display:\\s*none`, 's'))
    }
  }
})

test('toolbar uses compact spacing and exposes clear selected states for existing modes', () => {
  assert.match(toolbar, /gap:\s*5px/)
  assert.match(toolbar, /min-height:\s*68px/)
  assert.match(app, /aria-label="Pen"[\s\S]*?aria-pressed=\{penModeActive\}/)
  assert.match(app, /penModeActive \? ' selected' : ''/)
  assert.match(app, /aria-pressed=\{eraser\}/)
  assert.match(app, /aria-pressed=\{lassoMode\}/)
  assert.match(app, /aria-pressed=\{connectorMode \|\| umlConnectorType !== null\}/)
  assert.match(app, /aria-label="Raw stroke display"[\s\S]*?aria-pressed=\{strokeDisplayMode === 'raw'\}/)
  assert.match(app, /aria-label="Smooth stroke display"[\s\S]*?aria-pressed=\{strokeDisplayMode === 'smooth'\}/)
  assert.match(styles, /\.stroke-mode-button\.selected\s*\{[^}]*background:\s*#e8edff/)
})

test('toolbar follows the reference grouping with stacked tool labels and existing controls only', () => {
  assert.match(styles, /\.tool-button\s*\{[^}]*flex-direction:\s*column/s)
  assert.match(styles, /\.history-button\s*\{[^}]*flex-direction:\s*column/s)
  assert.match(app, /<span>Undo<\/span>[\s\S]*?<span>Redo<\/span>/)
  assert.match(app, /<span>Smooth<\/span>[\s\S]*?<span>Raw<\/span>/)
  assert.match(styles, /\.pen-button\s*\{\s*order:\s*3/)
  assert.match(styles, /\.eraser-control\s*\{\s*order:\s*4/)
  assert.match(styles, /\.lasso-button\s*\{\s*order:\s*5/)
  assert.match(styles, /\.connector-button\s*\{\s*order:\s*6/)
  assert.match(styles, /\.shape-button\s*\{\s*order:\s*7/)
  assert.doesNotMatch(app, /aria-label="Ruler"|aria-label="Text tool"|aria-label="Image tool"|aria-label="More tools"/)
})
