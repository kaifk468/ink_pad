import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const layout = await loadModule('textLayout.ts')
const app = await readAppSource()

test('stepTextSize: panel presets first, then +/-4 above 48 up to 300, stopping at 10', () => {
  assert.equal(layout.stepTextSize(24, 1), 32)
  assert.equal(layout.stepTextSize(24, -1), 18)
  assert.equal(layout.stepTextSize(48, 1), 52)
  assert.equal(layout.stepTextSize(52, 1), 56)
  assert.equal(layout.stepTextSize(56, -1), 52)
  assert.equal(layout.stepTextSize(50, -1), 48, 'coming down never skips below the top preset')
  assert.equal(layout.stepTextSize(52, -1), 48)
  assert.equal(layout.stepTextSize(48, -1), 32)
  assert.equal(layout.stepTextSize(298, 1), 300)
  assert.equal(layout.stepTextSize(300, 1), null)
  assert.equal(layout.stepTextSize(10, -1), null)
  assert.equal(layout.stepTextSize(8, 1), 10)
  assert.equal(layout.stepTextSize(20, 1), 24)
})

test('wiring: all targets step with stepTextSize; an open text editor takes the keys; palette has Bigger/Smaller text', () => {
  assert.doesNotMatch(app, /stepFontSize\(/)
  assert.match(app, /const stepEditorFontSize = \(direction: 1 \| -1\): boolean => \{\s*const editor = textEditorRef\.current\s*if \(!editor \|\| inputModeRef\.current !== 'desktop' \|\| editor\.connectorId !== undefined\) return false\s*const size = stepTextSize\(editor\.fontSize, direction\)\s*if \(size !== null\) \{ pickTextSize\(size\)/)
  assert.match(app, /onSizeKey=\{inputMode === 'desktop' \? stepEditorFontSize : undefined\}/)
  const overlay = readFileSync(new URL('../src/TextEditorOverlay.tsx', import.meta.url), 'utf8')
  assert.match(overlay, /const sizeKey = onSizeKey && !event\.nativeEvent\.isComposing \? keyCommand\(event, 'desktop'\) : null\s*if \(sizeKey\?\.kind === 'fontSize'\) \{ if \(onSizeKey\?\.\(sizeKey\.direction\)\) event\.preventDefault\(\) \}/)
  assert.match(app, /label: 'Bigger text'[\s\S]*?label: 'Smaller text'/)
})
