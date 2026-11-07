import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')

test('the stylesheet braces balance (a stray brace once swallowed rules after the Library block)', () => {
  let depth = 0
  for (const char of css) {
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    assert.ok(depth >= 0, 'closing brace without an opening one')
  }
  assert.equal(depth, 0)
})

test('Library touch targets are 48 px and text is 15 px, set once as tokens', () => {
  assert.match(css, /--home-touch: 48px/)
  assert.match(css, /color: var\(--home-text\); font-size: 15px;/)
  assert.match(css, /\.home-screen button \{ min-height: var\(--home-touch\);/)
  assert.match(css, /\.home-star \{[^}]*width: var\(--home-touch\)/)
  assert.match(css, /\.home-layout button \{ width: var\(--home-touch\)/)
  assert.match(css, /\.home-search \{[^}]*height: var\(--home-touch\)/)
  // card text never drops below 13 px
  for (const match of css.matchAll(/\.home-card-(?:title|folder|meta)\s*\{[^}]*font-size: (\d+)px/g)) assert.ok(Number(match[1]) >= 13, match[0])
})

test('on a tablet held upright or a phone the folders become one row of chips above the cards', () => {
  const block = css.slice(css.indexOf('@media (max-width: 900px) {\n  .home-screen'))
  assert.match(block, /\.home-screen \{ flex-direction: column; \}/)
  assert.match(block, /\.home-side \{[^}]*flex-direction: row;[^}]*flex-wrap: wrap;/)
  // the storage line stays reachable on its own row instead of scrolling out of sight
  assert.match(block, /\.home-storage \{ flex: 1 0 100%;/)
  assert.match(block, /\.home-brand, \.home-side-title, \.home-side-empty, \.home-hint \{ display: none; \}/)
  assert.match(block, /border-radius: 999px !important/)
})

test('the File dialog has touch-size controls', () => {
  assert.match(css, /\.file-panel-actions button \{ min-height: 44px;/)
  assert.match(css, /\.file-panel-save-title \{ min-width: 72px; min-height: 44px;/)
  assert.match(css, /\.file-panel-close \{ width: 44px; height: 44px;/)
  assert.match(css, /\.file-panel-field input \{ height: 44px;/)
})
