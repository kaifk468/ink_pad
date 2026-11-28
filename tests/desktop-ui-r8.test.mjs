import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

test('desktop More shapes tray shows named logo tiles (desktop dock only), four shrinkable columns', () => {
  assert.match(read('../src/app/MoreShapesTray.tsx'), /<LogoPicker autoFocus=\{false\} labelled=\{desktopTip\}/)
  const css = read('../src/styles.css')
  assert.match(css, /\.more-shapes-tray \.logo-grid-labelled \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/)
  assert.match(css, /\.more-shapes-tray \.logo-grid-labelled \.logo-button \{ min-width: 0;/)
})

test('empty-state hint turns light on dark and Chalkboard boards (desktop only)', () => {
  const css = read('../src/app/desktop-canvas-chrome.css')
  assert.match(css, /\.app-shell\[data-input-mode="desktop"\] \.canvas-stage\[data-board\] \.empty-canvas-hint \.empty-canvas-title \{ color: #eef1ec; \}/)
  assert.doesNotMatch(css.split('Dark and Chalkboard boards')[1], /transition|animation/)
})
