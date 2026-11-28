import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { loadModule } from './helpers/loadModule.mjs'
import { FakeDrive, tree } from './helpers/fakeDrive.mjs'

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
const tr = await loadModule('folderTree.ts')
const drop = await loadModule('libraryDrop.ts')
const drive = await loadModule('googleDrive.ts')
const f = (id, parentId = null, name = id) => ({ id, name, parentId, createdAt: '2026-01-01T00:00:00Z' })
const folders = [f('lld'), f('hld'), f('pay', 'lld', 'Payments'), f('api', 'pay', 'Api'), f('other', 'hld', 'Payments')]

test('canMoveFolder refuses itself, its own subfolders, the current parent, unknown folders and name clashes', () => {
  assert.deepEqual(tr.canMoveFolder(folders, 'lld', 'lld'), { ok: false, reason: 'self' })
  assert.deepEqual(tr.canMoveFolder(folders, 'lld', 'api'), { ok: false, reason: 'inside' })
  assert.deepEqual(tr.canMoveFolder(folders, 'pay', 'api'), { ok: false, reason: 'inside' })
  assert.deepEqual(tr.canMoveFolder(folders, 'pay', 'lld'), { ok: false, reason: 'same-parent' })
  assert.deepEqual(tr.canMoveFolder(folders, 'lld', null), { ok: false, reason: 'same-parent' })
  assert.deepEqual(tr.canMoveFolder(folders, 'nope', null), { ok: false, reason: 'missing' })
  assert.deepEqual(tr.canMoveFolder(folders, 'pay', 'nope'), { ok: false, reason: 'missing-target' })
  assert.deepEqual(tr.canMoveFolder(folders, 'pay', 'hld'), { ok: false, reason: 'name-clash' }) // "Payments" already in hld
  assert.deepEqual(tr.canMoveFolder([...folders, f('x', null, 'payments')], 'pay', null), { ok: false, reason: 'name-clash' }) // case-insensitive
  assert.deepEqual(tr.canMoveFolder(folders, 'api', null), { ok: true })
  assert.deepEqual(tr.canMoveFolder(folders, 'hld', 'lld'), { ok: true })
})

test('canMoveFolder tolerates cycles and broken parent links', () => {
  const cyclic = [f('a', 'b'), f('b', 'a'), f('c', 'gone')]
  assert.equal(tr.canMoveFolder(cyclic, 'a', 'b').ok, false)
  assert.deepEqual(tr.canMoveFolder(cyclic, 'c', null), { ok: false, reason: 'same-parent' }) // unknown parent counts as the top level
})

test('folderMoveTargets lists the top level and every folder except itself, its descendants and its current parent', () => {
  const ids = (id) => tr.folderMoveTargets(folders, id).map((t) => t.folder?.id ?? 'top')
  assert.deepEqual(ids('lld'), ['hld', 'other']) // top level is its current place
  assert.deepEqual(ids('pay'), ['top', 'hld', 'other']) // not lld (its parent), not pay/api
  assert.deepEqual(ids('api'), ['top', 'hld', 'other', 'lld'])
  assert.deepEqual(tr.folderMoveTargets(folders, 'nope'), [])
  assert.deepEqual(tr.folderMoveTargets(folders, 'pay').map((t) => t.depth), [0, 0, 1])
})

test('decideFolderDrop: valid targets only', () => {
  assert.deepEqual(drop.decideFolderDrop(folders, 'api', null), { ok: true })
  assert.deepEqual(drop.decideFolderDrop(folders, 'lld', 'api'), { ok: false })
  assert.deepEqual(drop.decideFolderDrop(folders, 'lld', 'lld'), { ok: false })
  assert.deepEqual(drop.decideFolderDrop(folders, null, 'lld'), { ok: false })
  assert.equal(drop.FOLDER_DRAG_TYPE, 'application/x-inkpad-folder')
})

/** The browser backend with documentStore replaced by an in-memory fake. */
async function browserBackend(initial) {
  const fake = `export const createDocumentId = () => 'd'; export const createFolderId = () => 'new'
export const listFolders = async () => globalThis.__folders.map((x) => ({ ...x }))
export const saveFolder = async (x) => { globalThis.__folders = globalThis.__folders.filter((y) => y.id !== x.id).concat([{ ...x }]) }
export const deleteFolderRecord = async () => {}; export const deleteStoredDocument = async () => {}; export const listStoredDocuments = async () => []
export const loadStoredDocument = async () => null; export const saveStoredDocument = async () => {}; export const setDocumentFolder = async () => {}`
  globalThis.__folders = initial.map((x) => ({ ...x }))
  const out = (path) => ts.transpileModule(src(path), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
  const url = (text) => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`
  const code = out('storageBackend.ts').replace(`from './documentStore'`, `from '${url(fake)}'`).replace(`from './folderTree'`, `from '${url(out('folderTree.ts'))}'`)
  const mod = await import(url(code))
  return mod.createBrowserBackend()
}

test('browser backend moveFolder re-parents the same id and keeps every other record', async () => {
  const backend = await browserBackend(folders)
  await backend.moveFolder('api', null)
  const after = globalThis.__folders
  assert.equal(after.length, folders.length)
  assert.equal(after.find((x) => x.id === 'api').parentId, null)
  assert.equal(after.find((x) => x.id === 'api').name, 'Api')
  assert.equal(after.find((x) => x.id === 'pay').parentId, 'lld')
  await backend.moveFolder('hld', 'lld')
  assert.equal(globalThis.__folders.find((x) => x.id === 'hld').parentId, 'lld')
  assert.equal(globalThis.__folders.find((x) => x.id === 'other').parentId, 'hld') // its subtree comes along untouched
  assert.equal(globalThis.__folders.length, folders.length)
})

test('browser backend moveFolder refuses cycles and name clashes and changes nothing', async () => {
  const backend = await browserBackend(folders)
  const before = JSON.stringify(globalThis.__folders)
  await assert.rejects(() => backend.moveFolder('lld', 'api'), /subfolders/)
  await assert.rejects(() => backend.moveFolder('lld', 'lld'), /itself/)
  await assert.rejects(() => backend.moveFolder('pay', 'hld'), /already has a folder named/)
  assert.equal(await backend.moveFolder('pay', 'lld'), 'noop') // already there: nothing to do
  assert.equal(JSON.stringify(globalThis.__folders), before)
})

const setupDrive = () => {
  const fake = new FakeDrive()
  const requests = []
  const env = { fetch: (url, init) => { requests.push({ url: String(url), method: init?.method ?? 'GET' }); return fake.fetch(url, init) }, getToken: async () => 'tok' }
  return { fake, requests, store: drive.createDriveBackend(env) }
}

test('Drive moveFolder re-parents the folder with addParents/removeParents; contents come along, ids stay', async () => {
  const { fake, requests, store } = setupDrive()
  const a = await store.createFolder('A', null)
  const b = await store.createFolder('B', a)
  const c = await store.createFolder('C', null)
  requests.length = 0
  await store.moveFolder(b, c)
  const patches = requests.filter((r) => r.method === 'PATCH')
  assert.equal(patches.length, 1)
  assert.match(patches[0].url, new RegExp(`/files/${b}\\?`))
  const params = new URL(patches[0].url).searchParams
  assert.equal(params.get('addParents'), c)
  assert.equal(params.get('removeParents'), a)
  assert.deepEqual(tree(fake), ['A/', 'C/', 'C/B/'])
  await store.moveFolder(b, null)
  assert.equal(new URL(requests.filter((r) => r.method === 'PATCH').at(-1).url).searchParams.get('addParents'), 'appDataFolder')
  assert.deepEqual(tree(fake), ['A/', 'B/', 'C/'])
  assert.deepEqual((await store.list()).folders.map((x) => x.id).sort(), [a, b, c].sort())
})

test('Drive moveFolder refuses cycles and name clashes without changing anything', async () => {
  const { fake, requests, store } = setupDrive()
  const a = await store.createFolder('A', null)
  const b = await store.createFolder('B', a)
  const x = await store.createFolder('B', null)
  requests.length = 0
  await assert.rejects(() => store.moveFolder(a, b), /subfolders/)
  await assert.rejects(() => store.moveFolder(x, a), /already has a folder named/)
  assert.equal(await store.moveFolder(b, a), 'noop') // same place
  assert.equal(requests.filter((r) => r.method !== 'GET').length, 0)
  assert.deepEqual(tree(fake), ['A/', 'A/B/', 'B/'])
})

test('wiring: folder menu entry, drag and drop, undo toast, device hint', () => {
  const home = src('app/HomeScreen.tsx')
  assert.match(home, /Move to…<\/button>/)
  assert.match(home, /folderMoveTargets\(folders, movingFolder\.id\)/)
  assert.match(home, /draggable=\{dragEnabled && foldersMovable\}/)
  assert.match(home, /setData\(FOLDER_DRAG_TYPE, folder\.id\)/)
  assert.match(home, /decideFolderDrop\(folders, dragFolderId, folderId\)/)
  assert.match(home, /Moved “\$\{name\}” into “\$\{target\}”/)
  assert.match(home, /to the top level/)
  assert.match(home, /props\.onMoveFolder\?\.\(folder\.id, before\)/)
  assert.match(home, /To move a folder, use your file manager/)
  assert.match(src('App.tsx'), /canMoveFolders=\{storage\.kind !== 'device'\}/)
  assert.match(src('App.tsx'), /onMoveFolder=\{\(id, parentId\) => moveFolder\(id, parentId\)\}/)
  assert.doesNotMatch(src('deviceStore.ts'), /moveFolder/)
  assert.match(src('app/useDocuments.ts'), /const moveFolder = async/)
  assert.match(src('app/useDocuments.ts'), /const moveFolder = async[\s\S]*?await inSaveChain\(async \(\): Promise<boolean \| 'noop'> =>[\s\S]*?=== 'noop' \? 'noop' : true/)
  assert.match(home, /if \(result === false \|\| result === 'noop'\) return/)
})

test('going to another folder closes the folder Move to… picker (walk fix)', () => {
  const home = src('app/HomeScreen.tsx')
  assert.match(home, /useEffect\(\(\) => \{ setMovingFolderId\(null\) \}, \[here\]\)/)
})
