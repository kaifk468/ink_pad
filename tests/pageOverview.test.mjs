import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const appSource = await readAppSource()
const pages = await loadModule('pages.ts')
const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')

test('movePage: moves one page, clamps, no-ops return a copy', () => {
  const list = ['a', 'b', 'c', 'd']
  assert.deepEqual(pages.movePage(list, 0, 1), ['b', 'a', 'c', 'd'])
  assert.deepEqual(pages.movePage(list, 3, 1), ['a', 'd', 'b', 'c'])
  assert.deepEqual(pages.movePage(list, 1, 99), ['a', 'c', 'd', 'b'])
  assert.deepEqual(pages.movePage(list, 2, -5), ['c', 'a', 'b', 'd'])
  const same = pages.movePage(list, 2, 2)
  assert.deepEqual(same, list)
  assert.notEqual(same, list)
  assert.deepEqual(list, ['a', 'b', 'c', 'd'], 'input is not changed')
  assert.deepEqual(pages.movePage(['only'], 0, 3), ['only'])
  assert.deepEqual(pages.movePage([], 0, 1), [])
})

test('indexAfterMove: the page on screen stays on screen', () => {
  const count = 5
  for (let from = 0; from < count; from += 1) for (let to = 0; to < count; to += 1) for (let current = 0; current < count; current += 1) {
    const ids = [0, 1, 2, 3, 4]
    const moved = pages.movePage(ids, from, to)
    assert.equal(moved[pages.indexAfterMove(current, from, to)], current, `current ${current}, ${from} -> ${to}`)
  }
})

test('a page keeps its items and undo history when moved (they travel as one slot)', () => {
  const history = (name) => ({ name })
  const slots = [{ items: ['a'], history: history('a') }, { items: ['b'], history: null }, { items: ['c'], history: history('c') }]
  const moved = pages.movePage(slots, 0, 2)
  assert.deepEqual(moved.map((slot) => slot.items[0]), ['b', 'c', 'a'])
  assert.equal(moved[2].history, slots[0].history)
  assert.equal(moved[1].history, slots[2].history)
  assert.equal(moved[0].history, null)
})

test('wiring: overview button, more menu, palette entry and overlay', async () => {
  const controls = await read('app/PageControls.tsx')
  assert.match(controls, /className="page-overview" aria-label="Page overview" title="Page overview"/)
  const tray = await read('app/MoreTray.tsx')
  assert.match(tray, /aria-label="Page overview"/)
  const dock = await read('app/ToolDock.tsx')
  assert.equal((dock.match(/onPageOverview=\{props\.onPageOverview\}/g) ?? []).length, 2, 'both modes')
  assert.match(appSource, /id: 'page:overview', label: 'Page overview'/)
  assert.match(appSource, /\{pageOverviewOpen && <PageOverview /)
  assert.match(appSource, /onPageOverview=\{\(\) => setPageOverviewOpen\(true\)\}/)
  assert.match(appSource, /onOverview=\{\(\) => setPageOverviewOpen\(true\)\}/)
})

test('wiring: moving a page restacks history, follows the page, saves and remembers it', () => {
  const body = appSource.slice(appSource.indexOf('const movePageTo = '), appSource.indexOf('const undoDeletePage = '))
  assert.match(body, /dismissDeletedPage\(\)/)
  assert.match(body, /stashCurrentPage\(\)/)
  assert.match(body, /movePage\(pagesRef\.current, from, target\)/)
  assert.match(body, /indexAfterMove\(/)
  assert.match(body, /writeLastPage\(currentDocId, shown\)/)
  assert.match(body, /scheduleAutosave\(\)/)
})

test('overlay: tile navigation, move buttons disabled at the ends, Esc and backdrop close', async () => {
  const overlay = await read('app/PageOverview.tsx')
  assert.match(overlay, /onClick=\{\(\) => onGo\(index\)\}/)
  assert.match(overlay, /disabled=\{index === 0\}/)
  assert.match(overlay, /disabled=\{index === count - 1\}/)
  assert.match(overlay, /event\.key !== 'Escape'/)
  assert.match(overlay, /event\.target === event\.currentTarget\) onClose\(\)/)
  assert.match(overlay, /Move earlier/)
  assert.match(overlay, /Move later/)
})
