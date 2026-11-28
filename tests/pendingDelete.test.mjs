import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { loadModule } from './helpers/loadModule.mjs'

const pd = await loadModule('pendingDelete.ts')
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

/** Manual timers so nothing waits for real time. */
function clock() {
  const timers = new Map()
  let next = 1
  return {
    setTimer: (callback, ms) => { const id = next++; timers.set(id, { callback, ms }); return id },
    clearTimer: (id) => { timers.delete(id) },
    count: () => timers.size,
    fire: () => { const [id, timer] = [...timers.entries()][0]; timers.delete(id); timer.callback() },
  }
}
const doc = (id, folderId = null) => ({ id, title: id, updatedAt: '2026-11-01T00:00:00Z', itemCount: 1, folderId })
const folder = (id, parentId = null) => ({ id, name: id, parentId, createdAt: '2026-11-01T00:00:00Z' })
function setup(extra = {}) {
  const c = clock()
  const calls = []
  const failures = []
  const changes = []
  const ctl = pd.createPendingDeletes({ delayMs: 8000, setTimer: c.setTimer, clearTimer: c.clearTimer, onChange: (p) => changes.push(p?.id ?? null), onFailed: (item, error) => failures.push([item.id, error]), ...extra })
  const item = (id, run) => ({ kind: 'diagram', id, label: id, hiddenIds: pd.hiddenForDiagram(id), run: run ?? (async () => { calls.push(id); return true }) })
  return { c, calls, failures, changes, ctl, item }
}
const settle = () => new Promise((resolve) => setImmediate(resolve))

test('the default delay is 8 seconds and nothing is deleted at schedule time', async () => {
  assert.equal(pd.UNDO_DELETE_MS, 8000)
  const { ctl, calls, item, c } = setup()
  await ctl.schedule(item('a'))
  assert.equal(ctl.isHidden('a'), true)
  assert.equal(ctl.isHidden('b'), false)
  assert.deepEqual(calls, [])
  assert.equal(c.count(), 1)
})

test('the delete runs only when the timer ends, then the item is no longer pending', async () => {
  const { ctl, calls, item, c } = setup()
  await ctl.schedule(item('a'))
  c.fire()
  await settle()
  assert.deepEqual(calls, ['a'])
  assert.equal(ctl.current(), null)
  assert.equal(ctl.isHidden('a'), true, 'hidden until the lists drop it')
  ctl.sweep(() => false)
  assert.equal(ctl.isHidden('a'), false)
})

test('Undo cancels: the store call never runs and the item is visible again', async () => {
  const { ctl, calls, item, c } = setup()
  await ctl.schedule(item('a'))
  assert.equal(ctl.cancel()?.id, 'a')
  assert.equal(ctl.isHidden('a'), false)
  assert.equal(c.count(), 0)
  await ctl.flush()
  assert.deepEqual(calls, [])
  assert.equal(ctl.cancel(), null)
})

test('a second delete flushes the first one (really deletes it) before hiding the new one', async () => {
  const { ctl, calls, item, c } = setup()
  ctl.schedule(item('a'))
  ctl.schedule(item('b'))
  assert.equal(ctl.isHidden('a'), true, 'a and b are hidden at once, before any store call finishes')
  assert.equal(ctl.isHidden('b'), true)
  await settle()
  assert.deepEqual(calls, ['a'])
  ctl.sweep(() => false)
  assert.equal(ctl.isHidden('a'), false)
  assert.equal(ctl.isHidden('b'), true)
  await settle()
  assert.deepEqual(calls, ['a'])
  assert.equal(c.count(), 1, 'one countdown, for the new item')
  ctl.cancel()
  assert.deepEqual(calls, ['a'], 'undoing the second does not touch the first')
})

test('flush (Library closes or a diagram opens) deletes now and stops the timer', async () => {
  const { ctl, calls, item, c } = setup()
  assert.equal(await ctl.flush(), true, 'nothing pending is fine')
  await ctl.schedule(item('a'))
  assert.equal(await ctl.flush(), true)
  assert.deepEqual(calls, ['a'])
  assert.equal(c.count(), 0)
  assert.equal(await ctl.flush(), true)
  assert.deepEqual(calls, ['a'], 'never deleted twice')
})

test('a flush while the store call runs waits for it instead of deleting twice, and Undo is refused', async () => {
  let release
  let runs = 0
  const { ctl, item, c } = setup()
  await ctl.schedule(item('a', () => { runs += 1; return new Promise((resolve) => { release = () => resolve(true) }) }))
  c.fire()
  assert.equal(ctl.cancel(), null, 'too late to undo')
  assert.equal(ctl.isHidden('a'), true, 'stays hidden while it is being deleted')
  const second = ctl.flush()
  release()
  assert.equal(await second, true)
  assert.equal(runs, 1)
  ctl.sweep(() => false)
  assert.equal(ctl.isHidden('a'), false)
})

test('a delete that fails (false) un-hides the item and reports it', async () => {
  const { ctl, failures, item, c } = setup()
  await ctl.schedule(item('a', async () => false))
  c.fire()
  await settle()
  assert.equal(ctl.isHidden('a'), false)
  assert.equal(ctl.current(), null)
  assert.deepEqual(failures, [['a', undefined]])
})

test('a delete that throws un-hides the item and passes the error on; flush resolves false', async () => {
  const { ctl, failures, item } = setup()
  const boom = new Error('disk full')
  await ctl.schedule(item('a', async () => { throw boom }))
  assert.equal(await ctl.flush(), false)
  assert.equal(ctl.isHidden('a'), false)
  assert.equal(failures[0][1], boom)
})

test('a failed first delete does not block the second from being scheduled', async () => {
  const { ctl, failures, item } = setup()
  ctl.schedule(item('a', async () => false))
  ctl.schedule(item('b'))
  await settle()
  assert.equal(failures.length, 1)
  assert.equal(ctl.isHidden('a'), false)
  assert.equal(ctl.isHidden('b'), true)
})

test('hiddenForFolder hides the folder, its subfolders and every diagram inside, nothing else', () => {
  const folders = [folder('f1'), folder('f2', 'f1'), folder('f3')]
  const library = [doc('d1', 'f1'), doc('d2', 'f2'), doc('d3', 'f3'), doc('d4')]
  assert.deepEqual([...pd.hiddenForFolder(folders, library, 'f1')].sort(), ['d1', 'd2', 'f1', 'f2'])
  assert.deepEqual([...pd.hiddenForFolder(folders, library, 'f3')].sort(), ['d3', 'f3'])
})

test('three quick deletes while the first store call runs: all three are deleted in order, all hidden, only the last undoable', async () => {
  const { ctl, calls, item, c } = setup()
  let release
  ctl.schedule(item('a', () => new Promise((resolve) => { release = () => { calls.push('a'); resolve(true) } })))
  c.fire()
  await settle()
  ctl.schedule(item('b'))
  await settle()
  assert.equal(ctl.isRunning(), false, 'b has the Undo toast while a runs')
  ctl.schedule(item('c'))
  for (const id of ['a', 'b', 'c']) assert.equal(ctl.isHidden(id), true, `${id} hidden`)
  assert.equal(c.count(), 1)
  release()
  await settle()
  assert.deepEqual(calls, ['a', 'b'], 'c still waits for its timer or Undo')
  assert.equal(ctl.cancel()?.id, 'c')
  ctl.schedule(item('d'))
  c.fire()
  await settle()
  assert.deepEqual(calls, ['a', 'b', 'd'])
})

test('three scheduled deletes all run on flush, in order', async () => {
  const { ctl, calls, item } = setup()
  ctl.schedule(item('a')); ctl.schedule(item('b')); ctl.schedule(item('c'))
  assert.equal(await ctl.flush(), true)
  assert.deepEqual(calls, ['a', 'b', 'c'])
})

test('dispose flushes everything queued and no timer starts afterwards; start() makes it usable again', async () => {
  const { ctl, calls, item, c } = setup()
  ctl.schedule(item('a')); ctl.schedule(item('b'))
  await ctl.dispose()
  assert.deepEqual(calls, ['a', 'b'])
  assert.equal(c.count(), 0)
  ctl.schedule(item('late'))
  assert.equal(c.count(), 0, 'no timer after dispose')
  await settle()
  assert.deepEqual(calls, ['a', 'b', 'late'], 'a late delete runs straight away')
  ctl.start()
  ctl.schedule(item('again'))
  assert.equal(c.count(), 1)
})

test('while the store call runs the toast item reports running (no Undo); the card stays hidden until the lists drop it', async () => {
  let release
  const { ctl, item, c } = setup()
  ctl.schedule(item('a', () => new Promise((resolve) => { release = () => resolve(true) })))
  assert.equal(ctl.isRunning(), false)
  c.fire()
  await settle()
  assert.equal(ctl.isRunning(), true)
  assert.equal(ctl.cancel(), null)
  release()
  await settle()
  assert.equal(ctl.isRunning(), false)
  assert.equal(ctl.isHidden('a'), true, 'deleted, but the lists may still show it')
  ctl.sweep((id) => id === 'a')
  assert.equal(ctl.isHidden('a'), true, 'still listed: stays hidden')
  ctl.sweep(() => false)
  assert.equal(ctl.isHidden('a'), false)
  assert.equal(ctl.hasHidden(), false)
})

test('a folder hides what is inside it now, including diagrams that arrived after the confirmation', () => {
  const folders = [folder('f1'), folder('f2', 'f1')]
  const library = [doc('d1', 'f1'), doc('late', 'f2'), doc('other')]
  assert.equal(pd.hidesInFolder(folders, library, 'f1', 'late'), true)
  assert.equal(pd.hidesInFolder(folders, library, 'f1', 'f2'), true)
  assert.equal(pd.hidesInFolder(folders, library, 'f1', 'other'), false)
})

test('wiring: a folder delete is refused (with a notice, nothing removed) when the folder holds a diagram that was not confirmed', () => {
  const hook = read('../src/app/useDocuments.ts')
  const body = hook.slice(hook.indexOf('const deleteFolder = async'), hook.indexOf('const moveDiagram = async'))
  assert.match(body, /inside\.some\(\(entry\) => !confirmed\.has\(entry\.id\)\)/)
  assert.match(body, /was not deleted: it has new diagrams/)
  assert.ok(body.indexOf('was not deleted') < body.indexOf('backendRef.current.deleteFolder(id)'), 'checked before anything is removed')
  assert.match(body, /inSaveChain/)
  assert.match(body, /await refreshLibrary\(\)/)
  assert.match(hook, /const releaseFolderTarget/)
  const home = read('../src/app/HomeScreen.tsx')
  assert.match(home, /props\.onFolderDeleteScheduled\?\.\(gone\.id\)/)
})

test('wiring: diagram deletes run in the save chain and refresh before resolving', () => {
  const hook = read('../src/app/useDocuments.ts')
  const body = hook.slice(hook.indexOf('const deleteStoredDiagram = async'), hook.indexOf('/** Start a blank diagram'))
  assert.match(body, /inSaveChain/)
  assert.match(body, /await refreshLibrary\(\)/)
  assert.match(hook, /saveChainRef\.current\.then\(body, body\)/)
})

test('wiring: no page-unload deletion; Library lists, counts, Recent and search use the filtered data', () => {
  const home = read('../src/app/HomeScreen.tsx')
  const module = read('../src/pendingDelete.ts')
  assert.doesNotMatch(home + module, /(beforeunload|pagehide|unload|visibilitychange)['"]/)
  assert.match(home, /const library = useMemo\(\(\) => \(pending\.hasHidden\(\) \? props\.library\.filter\(\(entry\) => !pending\.isHidden\(entry\.id\)\)/)
  assert.match(home, /const folders = useMemo\(\(\) => \(pending\.hasHidden\(\) \? props\.folders\.filter\(\(folder\) => !pending\.isHidden\(folder\.id\)\)/)
  assert.match(home, /pending\.sweep\(/)
  assert.match(home, /pending\.start\(\); return \(\) => \{ void pending\.dispose\(\) \}/, 'unmount flushes and disposes')
  assert.match(home, /const openDiagram = \(id: string\) => \{ void pending\.flush\(\)\.then\(\(\) => props\.onOpenDiagram\(id\)\) \}/)
  assert.doesNotMatch(home, /onClick=\{\(\) => props\.onOpenDiagram/)
  assert.match(home, /deleteWithUndo\(\{ kind: 'folder'/)
  assert.match(home, /deleteWithUndo\(\{ kind: 'diagram'/)
  assert.match(home, /Deleted “\{pendingItem\.label\}”<\/span>/)
  assert.match(home, /Deleting “\{pendingItem\.label\}”…/)
  assert.match(home, /onClick=\{\(\) => \{ pending\.cancel\(\) \}\}>Undo<\/button>/)
  assert.match(home, /You can Undo for a few seconds after deleting\./)
  assert.doesNotMatch(home, /It cannot be undone/)
})

test('wiring: the store delete calls are unchanged (same hook functions, only delayed)', () => {
  const app = read('../src/App.tsx')
  assert.match(app, /onDeleteFolder=\{\(id, confirmed\) => deleteFolder\(id, confirmed\)\}/)
  assert.match(app, /onDeleteDiagram=\{\(id\) => deleteStoredDiagram\(id\)\}/)
  const hook = read('../src/app/useDocuments.ts')
  assert.match(hook, /await backendRef\.current\.remove\(id\)/)
  assert.match(hook, /await backendRef\.current\.deleteFolder\(id\)/)
})
