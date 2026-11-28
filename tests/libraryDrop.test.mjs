import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { loadModule } from './helpers/loadModule.mjs'

const drop = await loadModule('libraryDrop.ts')
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const doc = (id, folderId = null) => ({ id, title: id, updatedAt: '2026-11-01T00:00:00Z', itemCount: 1, folderId })
const folder = (id, parentId = null) => ({ id, name: id, parentId, createdAt: '2026-11-01T00:00:00Z' })
const folders = [folder('f1'), folder('f2', 'f1')]
const library = [doc('a'), doc('b', 'f1'), doc('c', 'gone')]

test('decideDrop: moves to another folder or to the top level', () => {
  assert.deepEqual(drop.decideDrop(library, folders, 'a', 'f1'), { ok: true, folderId: 'f1' })
  assert.deepEqual(drop.decideDrop(library, folders, 'b', null), { ok: true, folderId: null })
  assert.deepEqual(drop.decideDrop(library, folders, 'b', 'f2'), { ok: true, folderId: 'f2' })
})

test('decideDrop: dropping on the current folder does nothing (an unknown folder counts as the top level)', () => {
  assert.deepEqual(drop.decideDrop(library, folders, 'a', null), { ok: false, reason: 'same-folder' })
  assert.deepEqual(drop.decideDrop(library, folders, 'b', 'f1'), { ok: false, reason: 'same-folder' })
  assert.deepEqual(drop.decideDrop(library, folders, 'c', null), { ok: false, reason: 'same-folder' })
})

test('decideDrop: a missing diagram or folder is refused', () => {
  assert.deepEqual(drop.decideDrop(library, folders, null, 'f1'), { ok: false, reason: 'missing-diagram' })
  assert.deepEqual(drop.decideDrop(library, folders, 'zzz', 'f1'), { ok: false, reason: 'missing-diagram' })
  assert.deepEqual(drop.decideDrop(library, folders, 'a', 'nope'), { ok: false, reason: 'missing-folder' })
})

test('canDragCards: desktop mode or a fine pointer only', () => {
  assert.equal(drop.canDragCards(true, false), true)
  assert.equal(drop.canDragCards(false, true), true)
  assert.equal(drop.canDragCards(false, false), false)
})

test('hasFinePointer is false where there is no window (and never throws)', () => {
  assert.equal(drop.hasFinePointer(), false)
})

test('wiring: drag only when enabled, targets are the folder tree and All diagrams, same move function and toast', () => {
  const home = read('../src/app/HomeScreen.tsx')
  assert.match(home, /canDragCards\(Boolean\(props\.desktop\), hasFinePointer\(\)\)/)
  assert.match(home, /draggable=\{dragEnabled && renamingDiagramId !== entry\.id\}/)
  assert.match(home, /\{\.\.\.dropTarget\(null\)\}/, 'All diagrams = top level')
  assert.match(home, /\{\.\.\.dropTarget\(folder\.id\)\}/)
  assert.match(home, /drop-over/)
  assert.match(home, /if \(decision\.ok && entry\) moveTo\(entry, decision\.folderId\)/, 'the drop uses the Move dialog function')
  assert.match(home, /props\.onMoveDiagram\(entry\.id, folderId\), `Moved “/)
  assert.match(home, /if \(!valid\) return\n\s+event\.preventDefault\(\)/, 'a same-folder target is not a drop target')
  const app = read('../src/App.tsx')
  assert.match(app, /desktop=\{inputMode === 'desktop'\}\n\s+\/>\}/)
  assert.match(read('../src/styles.css'), /\.home-nav\.drop-over \{/)
})
