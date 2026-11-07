import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'

const thumb = await loadModule('thumbnail.ts')
const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')

test('a drawing is shrunk to fit the picture box and keeps its shape', () => {
  assert.deepEqual(thumb.thumbnailSize(720, 440), { width: 360, height: 220 })
  assert.deepEqual(thumb.thumbnailSize(3600, 1100), { width: 360, height: 110 })
  assert.deepEqual(thumb.thumbnailSize(500, 4400), { width: 25, height: 220 })
})

test('a small drawing is never enlarged, and bad sizes still give a valid picture size', () => {
  assert.deepEqual(thumb.thumbnailSize(120, 80), { width: 120, height: 80 })
  assert.deepEqual(thumb.thumbnailSize(0, 50), { width: 1, height: 1 })
  assert.deepEqual(thumb.thumbnailSize(NaN, NaN), { width: 1, height: 1 })
  assert.deepEqual(thumb.thumbnailSize(1, 100000), { width: 1, height: 220 })
})

test('only PNG data pictures of a sane size are shown', () => {
  assert.equal(thumb.isThumbnailDataUrl('data:image/png;base64,AAAA'), true)
  assert.equal(thumb.isThumbnailDataUrl('https://example.com/x.png'), false)
  assert.equal(thumb.isThumbnailDataUrl('javascript:alert(1)'), false)
  assert.equal(thumb.isThumbnailDataUrl('data:image/svg+xml;base64,AAAA'), false)
  assert.equal(thumb.isThumbnailDataUrl('data:image/png;base64,' + 'A'.repeat(400_000)), false)
  assert.equal(thumb.isThumbnailDataUrl(null), false)
})

test('pictures live in their own browser store, not in the saved diagram', async () => {
  const store = await read('documentStore.ts')
  assert.match(store, /DB_VERSION = 3/)
  assert.match(store, /createObjectStore\(THUMBNAIL_STORE, \{ keyPath: 'id' \}\)/)
  assert.match(store, /export async function saveThumbnail/)
  assert.match(store, /export async function loadThumbnails/)
  assert.match(store, /export async function deleteThumbnail/)
  const format = await read('documentFormat.ts')
  assert.doesNotMatch(format, /thumbnail/i)
})

test('the picture is made when the Library opens, never during writing, and only for a changed diagram', async () => {
  const hook = await read('app/useDocuments.ts')
  const app = await read('App.tsx')
  assert.match(hook, /const captureThumbnail = async \(\) => \{/)
  assert.match(hook, /hostRef\.current\.isInputActive\(\)\) return/)
  assert.match(hook, /sameSignature\(signature, last\.signature\)\) return/)
  assert.match(hook, /exported\.svg\.length > THUMBNAIL_MAX_SVG_CHARS\) return/)
  // not part of save: doPersist must not draw the page
  const persist = hook.slice(hook.indexOf('const doPersist'), hook.indexOf('const persistNow'))
  assert.doesNotMatch(persist, /Thumbnail|svgToPngBlob|getImageExport/)
  assert.match(app, /if \(!libraryOpen\) window\.setTimeout\(\(\) => void captureThumbnail\(\), 250\)/)
})

test('deleting a diagram removes its picture, and the card shows the picture or an icon', async () => {
  const hook = await read('app/useDocuments.ts')
  assert.match(hook, /void deleteThumbnail\(id\)/)
  const home = await read('app/HomeScreen.tsx')
  assert.match(home, /props\.thumbnails\[entry\.id\]/)
  assert.match(home, /<img src=\{props\.thumbnails\[entry\.id\]\}/)
})

test('the card picture stays inside its box (it once spilled over the title)', async () => {
  const css = await read('styles.css')
  assert.match(css, /\.home-card-preview \{ position: relative; overflow: hidden;/)
  assert.match(css, /\.home-card-preview img \{ position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; \}/)
})
