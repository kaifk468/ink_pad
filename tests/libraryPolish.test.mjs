import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { loadModule } from './helpers/loadModule.mjs'

const view = await loadModule('libraryView.ts')
const input = await loadModule('desktopInput.ts')
const doc = (id, updatedAt) => ({ id, title: id, updatedAt, itemCount: 1, folderId: null })
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('recentDiagrams returns the newest n, unknown dates last, input untouched', () => {
  const lib = [doc('a', '2026-11-01T00:00:00Z'), doc('b', 'bad'), doc('c', '2026-11-03T00:00:00Z'), doc('d', '2026-11-02T00:00:00Z')]
  assert.deepEqual(view.recentDiagrams(lib, 3).map((x) => x.id), ['c', 'd', 'a'])
  assert.deepEqual(view.recentDiagrams(lib, 10).map((x) => x.id), ['c', 'd', 'a', 'b'])
  assert.deepEqual(view.recentDiagrams(lib, 0), [])
  assert.deepEqual(lib.map((x) => x.id), ['a', 'b', 'c', 'd'])
  assert.equal(view.recentDiagrams(Array.from({ length: 9 }, (_, i) => doc(`x${i}`, '2026-11-01T00:00:00Z'))).length, 6)
  assert.equal(view.RECENT_MIN_LIBRARY, 3)
})

test('Ctrl+O / Cmd+O is the library command in desktop mode only', () => {
  const key = (k, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra })
  assert.deepEqual(input.keyCommand(key('o', { ctrlKey: true }), 'desktop'), { kind: 'library' })
  assert.deepEqual(input.keyCommand(key('O', { metaKey: true }), 'desktop'), { kind: 'library' })
  assert.equal(input.keyCommand(key('o', { ctrlKey: true }), 'touch'), null)
  assert.deepEqual(input.keyCommand(key('o'), 'desktop'), { kind: 'tool', tool: 'ellipse' })
})

test('Library wiring: recent row, rename, breadcrumb, status, empty folder, keys', () => {
  const home = read('../src/app/HomeScreen.tsx')
  assert.match(home, /recentDiagrams\(library, RECENT_COUNT\)/)
  assert.match(home, /library\.length > RECENT_MIN_LIBRARY/)
  assert.match(home, /folderPath\(folders, here\)/)
  assert.match(home, /className="home-crumb"/)
  assert.match(home, /role="status"/)
  assert.match(home, /STATUS_MS = 3000/)
  assert.match(home, /props\.onRenameDiagram\(id, title\)/)
  assert.match(home, /if \(!title \|\| title === titleOf\(id\)\) return/)
  assert.match(home, /New diagram here/)
  assert.match(home, /props\.onNewDiagram\(here, NEW_DIAGRAM_PRESETS\[0\]\.template\)/)
  assert.match(home, /event\.key === '\/' && !typing/)
  assert.match(home, /target === searchRef\.current && searchRef\.current\?\.value/)
  const app = read('../src/App.tsx')
  assert.match(app, /onRenameDiagram=\{\(id, title\) => renameStoredDiagram\(id, title\)\}/)
  assert.match(app, /case 'library': toggleLibrary\(\); return true/)
  assert.match(app, /command\.kind === 'library' && libraryOpen\) return true/)
  const docs = read('../src/app/useDocuments.ts')
  assert.match(docs, /const renameStoredDiagram = async/)
  assert.match(docs, /if \(docIdRef\.current === id\) \{ renameDiagram\(title\)/)
  assert.match(docs, /backend\.save\(id, \{ \.\.\.stored, title: cleanTitle\(title\) \}, null\)/)
})
