import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { readAppSource } from './helpers/appSource.mjs'

const app = await readAppSource()
const panel = await readFile(new URL('../src/app/ContextPanel.tsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')

const toolsBlock = (() => {
  const start = panel.indexOf('{props.selectionTools &&')
  return panel.slice(start, panel.indexOf('{props.arrange &&', start))
})()

test('tablet panel: Select similar, Copy style, Paste style, Number steps buttons', () => {
  assert.match(toolsBlock, /aria-label="Select similar"/)
  assert.match(toolsBlock, /aria-label="Copy style"/)
  assert.match(toolsBlock, /aria-label="Paste style"/)
  assert.match(toolsBlock, /aria-label="Number steps"/)
  assert.match(toolsBlock, /disabled=\{!props\.selectionTools\.canPasteStyle\}/, 'paste only when a style was copied')
  assert.doesNotMatch(toolsBlock, /Ctrl|Alt\+/, 'no keyboard hints on the tablet')
  assert.match(toolsBlock, /className="clear-selection-button"/, 'same compact, touch-sized button class')
})

test('App passes the commands on the tablet only, with the desktop handlers', () => {
  const start = app.indexOf('selectionTools={inputMode !== \'desktop\'')
  assert.ok(start > 0)
  const block = app.slice(start, start + 900)
  assert.match(block, /sole !== null && similarItemKeys\(strokesRef\.current, sole\)\.length > 0 \? \(\) => \{ selectSimilarItems\(\) \}/, 'only one selected item')
  assert.match(block, /copyStyleWithToast\(\)/)
  assert.match(block, /pasteStyleWithToast\(\)/)
  assert.match(block, /canPasteStyle: copiedStyleRef\.current !== null/)
  assert.match(block, /stepTargets\(strokesRef\.current, keys\)\.length > 0 \? \(\) => \{ numberFlowSteps\(\) \}/)
})

test('Change shape is no longer desktop only, and the panel section uses the touch-sized buttons', () => {
  assert.doesNotMatch(app, /changeShape=\{inputMode === 'desktop'/)
  assert.match(panel, /className="change-shape-controls"/)
  assert.match(css, /\.context-panel \.clear-selection-button \{ height: 44px; \}/)
  assert.match(css, /\.context-panel \.selection-actions button \{ flex: 1 1 auto; min-height: 44px; \}/)
})
