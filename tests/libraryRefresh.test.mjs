import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { shouldRefreshLibrary, LIBRARY_FRESH_MS } = await loadModule('libraryRefresh.ts')

test('the library list is reused for 30 s', () => {
  assert.equal(LIBRARY_FRESH_MS, 30000)
  assert.equal(shouldRefreshLibrary(null, 1000), true)
  assert.equal(shouldRefreshLibrary(1000, 1000), false)
  assert.equal(shouldRefreshLibrary(1000, 30999), false)
  assert.equal(shouldRefreshLibrary(1000, 31000), true)
  assert.equal(shouldRefreshLibrary(5000, 1000), true, 'a clock that went backwards refreshes')
})

test('wiring: the palette refreshes only a stale list; refreshLibrary renews and clears the stamp', async () => {
  const app = await readAppSource()
  const docs = await readFile(new URL('../src/app/useDocuments.ts', import.meta.url), 'utf8')
  assert.match(app, /if \(paletteOpen\) void refreshLibraryIfStale\(\)/)
  assert.match(docs, /shouldRefreshLibrary\(libraryListedAtRef\.current, Date\.now\(\)\)/)
  assert.match(docs, /libraryListedAtRef\.current = null/)
  assert.match(docs, /libraryListedAtRef\.current = Date\.now\(\)/)
})
