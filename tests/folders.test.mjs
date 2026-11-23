import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
const compile = async (path) => {
  const out = ts.transpileModule(await read(path), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(out).toString('base64')}`)
}
const tree = await compile('folderTree.ts')
const f = (id, parentId = null, name = id) => ({ id, name, parentId, createdAt: '2026-01-01T00:00:00Z' })
const folders = [f('lld'), f('hld'), f('pay', 'lld', 'Payments'), f('api', 'pay', 'Api')]
const doc = (id, folderId = null) => ({ id, title: id, updatedAt: '2026-01-01', itemCount: 1, folderId })

test('folder names are cleaned and never empty', () => {
  assert.equal(tree.cleanFolderName('  LLD   notes '), 'LLD notes')
  assert.equal(tree.cleanFolderName('   '), 'New folder')
  assert.equal(tree.cleanFolderName('x'.repeat(100)).length, 60)
})

test('subfolders, paths and descendants', () => {
  assert.deepEqual(tree.childFolders(folders, null).map((x) => x.id), ['hld', 'lld'])
  assert.deepEqual(tree.childFolders(folders, 'lld').map((x) => x.id), ['pay'])
  assert.deepEqual(tree.folderPath(folders, 'api').map((x) => x.id), ['lld', 'pay', 'api'])
  assert.deepEqual(tree.folderPath(folders, null), [])
  assert.deepEqual(tree.folderAndDescendantIds(folders, 'lld').sort(), ['api', 'lld', 'pay'])
  assert.deepEqual(tree.folderAndDescendantIds(folders, 'hld'), ['hld'])
})

test('cycles and broken links do not hang or lose diagrams', () => {
  const cyclic = [f('a', 'b'), f('b', 'a')]
  assert.deepEqual(tree.folderAndDescendantIds(cyclic, 'a').sort(), ['a', 'b'])
  assert.equal(tree.folderPath(cyclic, 'a').length, 2)
  assert.ok(Array.isArray(tree.flattenFolders(cyclic)))
  const library = [doc('one', 'gone'), doc('two', 'lld'), doc('three')]
  assert.deepEqual(tree.diagramsInFolder(library, null, folders).map((x) => x.id), ['one', 'three'])
  assert.deepEqual(tree.diagramsInFolder(library, 'lld', folders).map((x) => x.id), ['two'])
})

test('the move picker lists folders in tree order with depth', () => {
  assert.deepEqual(tree.flattenFolders(folders).map((x) => [x.folder.id, x.depth]), [['hld', 0], ['lld', 0], ['pay', 1], ['api', 2]])
})

test('storage keeps the document format and adds folder stores without touching existing data', async () => {
  const store = await read('documentStore.ts')
  assert.match(store, /DB_VERSION = 3/) // 3 added the thumbnails store; every store is created only if missing
  assert.match(store, /createObjectStore\(FOLDER_STORE/)
  assert.match(store, /createObjectStore\(PLACEMENT_STORE/)
  assert.match(store, /if \(!request\.result\.objectStoreNames\.contains\(STORE\)\)/)
  assert.match(store, /folderOf\.get\(record\.id\) \?\? null/)
  assert.match(store, /store\.delete\(id\), PLACEMENT_STORE/)
  const format = await read('documentFormat.ts')
  assert.doesNotMatch(format, /folderId/)
})

test('deleting a folder removes its subfolders and diagrams; the UI asks first', async () => {
  const backend = await read('storageBackend.ts')
  assert.match(backend, /folderAndDescendantIds\(folders, id\)/)
  assert.match(backend, /await deleteStoredDocument\(entry\.id\)/)
  assert.match(backend, /await deleteFolderRecord\(folderId\)/)
  const ui = await read('app/HomeScreen.tsx')
  assert.match(ui, /role="alertdialog"/)
  assert.match(ui, /and everything inside it/)
  assert.match(ui, /props\.onDeleteFolder\(gone\.id\)/)
  assert.match(ui, /props\.onDeleteDiagram\(entry\.id\)/)
  assert.match(ui, /props.onMoveDiagram\(entry\.id, folderId\)/)
  assert.match(ui, /props\.onNewDiagram\(here, preset\.template\)/)
})

test('renaming saves with the Save button, Enter, and on any way of closing the panel', async () => {
  const panel = await read('FilePanel.tsx')
  assert.match(panel, /aria-label="Save title"/)
  assert.match(panel, /const closePanel = \(\) => \{ commitTitle\(\); latest\.current\.onClose\(\) \}/)
  assert.match(panel, /event\.target === event\.currentTarget\) closePanel\(\)/)
  assert.match(panel, /aria-label="Close" onClick=\{closePanel\}/)
  assert.match(panel, /event\.key === 'Escape'\) closePanel\(\)/)
})

test('the Library screen closes with Escape and the Back button, and opens from the folder button', async () => {
  const home = await read('app/HomeScreen.tsx')
  const bar = await read('app/TopLeftBar.tsx')
  const app = await read('App.tsx')
  assert.match(home, /else closeRef\.current\(\)/)
  assert.match(home, /Back to canvas/)
  assert.match(bar, /aria-label="Library"/)
  assert.match(bar, /onClick=\{props\.onOpenLibrary\}/)
  assert.match(app, /\{libraryOpen && <HomeScreen/)
  assert.match(app, /onOpenDiagram=\{\(id\) => \{ setLibraryOpen\(false\); void openStoredDiagram\(id\) \}\}/)
  assert.doesNotMatch(bar, /FoldersSidebar/)
})

test('the File panel no longer lists diagrams; the Library does', async () => {
  const panel = await read('FilePanel.tsx')
  assert.doesNotMatch(panel, /file-panel-list|props\.library/)
  const home = await read('app/HomeScreen.tsx')
  assert.match(home, /aria-label="Search diagrams"/)
  assert.match(home, /aria-label="Grid"/)
  assert.match(home, /aria-label="List"/)
  assert.match(home, /Import \.inkpad/)
})
