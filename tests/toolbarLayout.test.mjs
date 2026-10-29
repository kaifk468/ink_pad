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
  const toolSelectors = ['shape-button', 'selection-button', 'lasso-button', 'connector-button', 'eraser-button']
  const controlSelectors = [...toolSelectors, 'clear-selection-button', 'relationship-controls', 'color-group', 'thickness-group', 'history-button', 'clear-button']
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
