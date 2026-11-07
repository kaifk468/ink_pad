import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const format = await loadModule('documentFormat.ts')
const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')

test('renaming in place saves only a real change, cleaned like any title', () => {
  assert.equal(format.titleToCommit('Zepto', 'Zepto'), null)
  assert.equal(format.titleToCommit('Zepto', '  Zepto  '), null)
  assert.equal(format.titleToCommit('Zepto', 'Zepto LLD'), 'Zepto LLD')
  assert.equal(format.titleToCommit('Zepto', '  Zepto   order   split '), 'Zepto order split')
  assert.equal(format.titleToCommit('Zepto', 'x'.repeat(300)).length, 120)
})

test('clearing the name goes back to the default title, and the default stays unchanged', () => {
  assert.equal(format.titleToCommit('Zepto', ''), 'Untitled diagram')
  assert.equal(format.titleToCommit('Zepto', '   '), 'Untitled diagram')
  assert.equal(format.titleToCommit('Untitled diagram', ''), null)
  assert.equal(format.titleToCommit('', ''), null)
})

test('the title in the top bar is edited in place: Enter or tapping away saves, Escape cancels', async () => {
  const bar = await read('app/TopLeftBar.tsx')
  const app = await read('App.tsx')
  assert.match(bar, /className="diagram-title-input"/)
  assert.match(bar, /aria-label="Diagram title"/)
  assert.match(bar, /onBlur=\{\(\) => finishTitleEdit\(true\)\}/)
  assert.match(bar, /event\.key === 'Enter'\) finishTitleEdit\(true\)/)
  assert.match(bar, /event\.key === 'Escape'\) \{ event\.stopPropagation\(\); finishTitleEdit\(false\) \}/)
  assert.match(bar, /if \(!editingTitleRef\.current\) return/)
  assert.match(bar, /const next = titleToCommit\(props\.title, draftTitle\)\s+if \(next !== null\) props\.onRenameTitle\(next\)/)
  assert.match(bar, /onClick=\{beginTitleEdit\}/)
  // tapping the title no longer opens the File dialog
  assert.doesNotMatch(bar, /className="diagram-title"[^>]*onClick=\{props\.onToggleFilePanel\}/)
  assert.match(app, /onRenameTitle=\{renameDiagram\}/)
})

test('a rename saves the open diagram right away', async () => {
  const hook = await read('app/useDocuments.ts')
  assert.match(hook, /const renameDiagram = \(title: string\) => \{\s+const cleaned = cleanTitle\(title\)/)
  assert.match(hook, /if \(docIdRef\.current \|\| hostRef\.current\.getItems\(\)\.length > 0\) void persistNow\(\)/)
})
