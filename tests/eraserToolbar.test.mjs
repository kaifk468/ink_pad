import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { readAppSource } from './helpers/appSource.mjs'

const app = await readAppSource()
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')

test('eraser popover provides a continuous size range and retains the existing quick presets', () => {
  assert.match(app, /id="eraser-size-range"[^>]*type="range" min="8" max="96" step="1"/)
  assert.match(app, /aria-label="Eraser size"/)
  assert.match(app, /<output htmlFor="eraser-size-range">\{eraserSize\} px<\/output>/)
  assert.match(app, /const ERASER_SIZES = \[14, 28, 48, 72\]/)
  assert.match(app, /setEraserSize\(Number\(event\.target\.value\)\)/)
})

test('eraser modes remain separate, clearly labeled choices with selected state', () => {
  assert.match(app, /aria-label="Eraser mode"/)
  assert.match(app, /<span>Stroke Eraser<\/span>/)
  assert.match(app, /<span>Whole Eraser<\/span>/)
  assert.match(app, /aria-pressed=\{!objectEraser\}/)
  assert.match(app, /aria-pressed=\{objectEraser\}/)
  assert.match(app, /setObjectEraser\(true\)/)
  assert.match(app, /setObjectEraser\(false\)/)
  assert.match(styles, /\.eraser-mode-card\.selected\s*\{[^}]*background:\s*#e9edff/)
})

