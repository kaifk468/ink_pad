import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const sel = await loadModule('librarySelect.ts')
const pd = await loadModule('pendingDelete.ts')
const src = (name) => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8')
const doc = (id, folderId = null) => ({ id, title: id, updatedAt: '2026-11-01T00:00:00Z', itemCount: 1, folderId })
const folder = (id) => ({ id, name: id, parentId: null, createdAt: '2026-11-01T00:00:00Z' })

test('toggle, select all and effective selection only touch visible ids', () => {
  let s = sel.toggleSelected(new Set(), 'a')
  s = sel.toggleSelected(s, 'b')
  assert.deepEqual([...s], ['a', 'b'])
  assert.deepEqual([...sel.toggleSelected(s, 'a')], ['b'])
  assert.deepEqual(sel.effectiveSelection(new Set(['a', 'z']), ['c', 'a', 'b']), ['a'])
  assert.deepEqual([...sel.selectAllIds(['a', 'b'])], ['a', 'b'])
  assert.equal(sel.allSelected(new Set(['a', 'b']), ['a', 'b']), true)
  assert.equal(sel.allSelected(new Set(['a']), ['a', 'b']), false)
  assert.equal(sel.allSelected(new Set(), []), false)
})

test('texts', () => {
  assert.equal(sel.selectionLabel(3), '3 selected')
  assert.equal(sel.deleteConfirmText(3), 'Delete 3 diagrams?')
  assert.equal(sel.deleteConfirmText(1), 'Delete 1 diagram?')
  assert.equal(sel.movedMessage(3, 3, 'X'), 'Moved 3 diagrams to X')
  assert.equal(sel.movedMessage(2, 3, 'X'), 'Moved 2 of 3 to X')
})

test('idsToMove skips diagrams already in the destination', () => {
  const lib = [doc('a'), doc('b', 'f1'), doc('c', 'gone')]
  const folders = [folder('f1')]
  assert.deepEqual(sel.idsToMove(lib, folders, ['a', 'b', 'c', 'nope'], 'f1'), ['a', 'c'])
  assert.deepEqual(sel.idsToMove(lib, folders, ['a', 'b', 'c'], null), ['b'])
})

test('runMoves runs one after another and counts failures and throws', async () => {
  const order = []
  let active = 0
  const result = await sel.runMoves(['a', 'b', 'c', 'd'], async (id) => {
    active += 1
    assert.equal(active, 1)
    await new Promise((r) => setTimeout(r, 1))
    order.push(id)
    active -= 1
    if (id === 'b') return false
    if (id === 'c') throw new Error('x')
    return true
  })
  assert.deepEqual(order, ['a', 'b', 'c', 'd'])
  assert.deepEqual(result, { moved: 2, failed: 2 })
})

function clock() {
  const timers = []
  return { setTimer: (cb, ms) => { timers.push({ cb, ms }); return timers.length }, clearTimer: () => {}, fire: () => timers.pop().cb(), timers }
}
const entries = (ids, calls, failId) => ids.map((id) => ({ id, label: id, run: async () => { calls.push(id); return id !== failId } }))

test('batchDelete hides all at once, one Undo restores all, nothing ran', () => {
  const c = clock(); const calls = []
  const ctl = pd.createPendingDeletes({ delayMs: 8000, setTimer: c.setTimer, clearTimer: c.clearTimer })
  ctl.schedule(pd.batchDelete(entries(['a', 'b', 'c'], calls)))
  assert.ok(['a', 'b', 'c'].every((id) => ctl.isHidden(id)))
  assert.equal(ctl.isHidden('d'), false)
  assert.equal(pd.pendingLabel(ctl.current()), '3 diagrams')
  assert.equal(c.timers[0].ms, 8000)
  assert.ok(ctl.cancel())
  assert.ok(['a', 'b', 'c'].every((id) => !ctl.isHidden(id)))
  assert.deepEqual(calls, [])
})

test('batchDelete runs every delete in order after the timer; one failure does not drop the rest', async () => {
  const c = clock(); const calls = []; const failed = []
  const ctl = pd.createPendingDeletes({ delayMs: 8000, setTimer: c.setTimer, clearTimer: c.clearTimer, onFailed: (item) => failed.push(item.id) })
  ctl.schedule(pd.batchDelete(entries(['a', 'b', 'c'], calls, 'b')))
  c.fire()
  assert.equal(await ctl.flush(), false)
  assert.deepEqual(calls, ['a', 'b', 'c'])
  assert.deepEqual(failed, ['a'])
})

test('a batch is run (not dropped) when the next delete is scheduled or the Library closes', async () => {
  const c = clock(); const calls = []
  const ctl = pd.createPendingDeletes({ delayMs: 8000, setTimer: c.setTimer, clearTimer: c.clearTimer })
  ctl.schedule(pd.batchDelete(entries(['a', 'b'], calls)))
  ctl.schedule(pd.batchDelete(entries(['c'], calls)))
  await ctl.dispose()
  assert.deepEqual(calls, ['a', 'b', 'c'])
})

test('single delete behaviour is unchanged: quoted label', () => {
  assert.equal(pd.pendingLabel({ label: 'My doc' }), '“My doc”')
  assert.equal(pd.pendingLabel({ label: 'My doc', count: 1 }), '“My doc”')
})

test('HomeScreen wiring: Select button, bar, shared move/delete paths, Esc and Ctrl+A', async () => {
  const s = await src('app/HomeScreen.tsx')
  assert.match(s, /title="Select several diagrams"/)
  assert.match(s, /home-selectbar/)
  assert.match(s, /Select all<\/button>/)
  assert.match(s, /Move…<\/button>/)
  assert.match(s, /disabled=\{chosenIds\.length === 0/)
  assert.match(s, /props\.onMoveDiagram\(id, folderId\)/)
  assert.match(s, /pending\.schedule\(batchDelete\(/)
  assert.match(s, /props\.onDeleteDiagram\(id\)/)
  assert.match(s, /canDragCards\(Boolean\(props\.desktop\), hasFinePointer\(\)\) && !selectMode/)
  assert.match(s, /selectApi\.current\.active\) selectApi\.current\.exit\(\)/)
  assert.match(s, /event\.key\.toLowerCase\(\) === 'a'/)
  assert.match(s, /showRecent = !selectMode/)
  assert.match(s, /type="checkbox"/)
  const css = await src('styles.css')
  assert.match(css, /\.home-card-check input \{ width: 28px; height: 28px/)
})
