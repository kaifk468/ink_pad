import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const home = readFileSync(new URL('../src/app/HomeScreen.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

test('scrolling inside the right-click menu does not close it', () => {
  assert.match(app, /const closeOutside = \(event: Event\) => \{ if \(!contextMenuElementRef\.current\?\.contains\(event\.target as Node\)\) setContextMenu\(null\) \}/)
  assert.match(app, /addEventListener\('wheel', closeOutside, true\)/)
  assert.match(app, /addEventListener\('scroll', closeOutside, true\)/)
  assert.doesNotMatch(app, /addEventListener\('wheel', close, true\)/)
})

test('inline diagram rename replaces the card actions and keeps the title', () => {
  assert.match(home, /\{renamingDiagramId !== entry\.id && !selectMode && <span className="home-card-actions">/)
  assert.match(home, /<span className="home-card-title">\{entry\.title \|\| 'Untitled diagram'\}<\/span>/)
})
