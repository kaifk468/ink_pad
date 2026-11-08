import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const appSource = await readAppSource()
const view = await loadModule('viewport.ts')
const growth = await loadModule('sheetGrowth.ts')
const format = await loadModule('documentFormat.ts')

const stroke = (y, width = 4) => ({ kind: 'stroke', id: 1, points: [{ x: 10, y: 10, pressure: 0.5 }, { x: 20, y }], color: '#000', width, erase: false })

test('the page starts at 1500, is capped at 3000 and grows in 500 strips', () => {
  assert.equal(view.SHEET_MIN_HEIGHT, 1500)
  assert.equal(view.SHEET_MAX_HEIGHT, 3000)
  assert.equal(view.SHEET_GROW_STEP, 500)
  assert.equal(view.nextSheetHeight(1500, 100), 1500)
  assert.equal(view.nextSheetHeight(1500, 1300), 1500, 'exactly at the edge of the grow zone does not grow')
  assert.equal(view.nextSheetHeight(1500, 1301), 2000)
  assert.equal(view.nextSheetHeight(2000, 1900), 2500)
  assert.equal(view.nextSheetHeight(2500, 2400), 3000)
  assert.equal(view.nextSheetHeight(3000, 2999), 3000, 'never past the cap')
})

test('a stroke that reaches far below the page adds as many strips as it needs', () => {
  assert.equal(view.nextSheetHeight(1500, 1700), 2000)
  assert.equal(view.nextSheetHeight(1500, 1900), 2500)
  assert.equal(view.nextSheetHeight(1500, 99999), 3000)
})

test('the page never shrinks: a lower or equal ink position leaves the height as it is', () => {
  assert.equal(view.nextSheetHeight(2500, 50), 2500)
})

test('saved heights are forced to a valid strip count', () => {
  assert.equal(view.normalizeSheetHeight(undefined), 1500)
  assert.equal(view.normalizeSheetHeight('3000'), 1500)
  assert.equal(view.normalizeSheetHeight(NaN), 1500)
  assert.equal(view.normalizeSheetHeight(900), 1500)
  assert.equal(view.normalizeSheetHeight(2000), 2000)
  assert.equal(view.normalizeSheetHeight(2100), 2500)
  assert.equal(view.normalizeSheetHeight(99999), 3000)
})

test('bounds follow the page height and keep the 5% workspace margin', () => {
  assert.deepEqual(view.sheetBoundsFor(2500), { x: 0, y: 0, width: 2500, height: 2500 })
  const workspace = view.workspaceBoundsFor(2000)
  assert.equal(workspace.height, 2000 * 1.1)
  assert.equal(workspace.y, -100)
  assert.deepEqual(view.workspaceBoundsFor(1500), view.WORKSPACE_BOUNDS)
})

test('the view can scroll down a taller page but not past its bottom', () => {
  const tall = view.clampViewportToSheet({ scale: 1, offsetX: 0, offsetY: -99999 }, 1000, 800, 3000)
  assert.equal(tall.offsetY, 800 - 3000)
  const short = view.clampViewportToSheet({ scale: 1, offsetX: 0, offsetY: -99999 }, 1000, 800)
  assert.equal(short.offsetY, 800 - 1500)
})

test('a taller page opens on its first screen, like a short one', () => {
  const a = view.getInitialViewport(1280, 800, 1500)
  const b = view.getInitialViewport(1280, 800, 3000)
  assert.deepEqual(a, b)
})

test('item bottoms cover strokes, boxes, text and connectors; erasers reach nothing', () => {
  assert.equal(growth.itemBottom(stroke(400, 6)), 403)
  assert.equal(growth.itemBottom({ ...stroke(400), erase: true }), 0)
  assert.equal(growth.itemBottom({ kind: 'rectangle', id: 1, x: 0, y: 100, width: 50, height: 70, strokeColor: '#000', strokeWidth: 2 }), 170)
  assert.equal(growth.itemBottom({ kind: 'text', id: 1, x: 0, y: 10, width: 5, height: 30, text: 'a', fontSize: 16, color: '#000' }), 40)
  assert.equal(growth.itemBottom({ kind: 'connector', id: 1, start: { x: 0, y: 5, pressure: 1 }, end: { x: 0, y: 90, pressure: 1 }, strokeColor: '#000', strokeWidth: 2 }), 92)
})

test('a loaded diagram keeps its saved height and only grows if its content passes the bottom', () => {
  assert.equal(growth.sheetHeightForItems([]), 1500)
  assert.equal(growth.sheetHeightForItems([stroke(1450)]), 1500, 'inside the grow zone, but opening a diagram must not change it')
  assert.equal(growth.sheetHeightForItems([stroke(1600)]), 2000)
  assert.equal(growth.sheetHeightForItems([stroke(100)], 2500), 2500)
})

test('documents write the page height only when it has grown, and old documents still open', () => {
  const base = { template: 'dotted', background: 'white', items: [] }
  assert.equal('sheetHeight' in format.createDocument(base).page, false)
  assert.equal('sheetHeight' in format.createDocument({ ...base, sheetHeight: 1500 }).page, false)
  assert.equal(format.createDocument({ ...base, sheetHeight: 2500 }).page.sheetHeight, 2500)
  assert.equal('sheetHeight' in format.createDocument({ ...base, sheetHeight: 1234 }).page, false)
  const text = format.stringifyDocument(format.createDocument({ ...base, sheetHeight: 3000 }))
  const parsed = format.parseDocument(text)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.document.page.sheetHeight, 3000)
  const old = JSON.stringify({ format: 'inkpad-document', version: 1, title: 'old', page: { template: 'blank', background: 'white' }, items: [] })
  assert.equal(format.parseDocument(old).document.page.sheetHeight, undefined)
  const bad = JSON.stringify({ format: 'inkpad-document', version: 1, title: 'x', page: { template: 'blank', background: 'white', sheetHeight: 9999 }, items: [] })
  assert.equal(format.parseDocument(bad).document.page.sheetHeight, undefined)
})

test('a changed page height counts as a change worth saving', () => {
  const a = { title: 't', template: 'blank', background: 'white', items: [] }
  assert.equal(format.sameSignature(a, { ...a }), true)
  assert.equal(format.sameSignature(a, { ...a, sheetHeight: 1500 }), true)
  assert.equal(format.sameSignature(a, { ...a, sheetHeight: 2000 }), false)
})

test('the grown heights a document accepts match the viewport rules', () => {
  const valid = []
  for (let h = view.SHEET_MIN_HEIGHT + view.SHEET_GROW_STEP; h <= view.SHEET_MAX_HEIGHT; h += view.SHEET_GROW_STEP) valid.push(h)
  for (const h of valid) assert.equal(format.createDocument({ template: 'blank', background: 'white', items: [], sheetHeight: h }).page.sheetHeight, h)
  assert.equal('sheetHeight' in format.createDocument({ template: 'blank', background: 'white', items: [], sheetHeight: view.SHEET_MAX_HEIGHT + view.SHEET_GROW_STEP }).page, false)
})

test('the app wires growth to a pen lift, the saved page, the sheet layer and the map', () => {
  assert.match(appSource, /const growSheetForNewestItem = \(\) =>/)
  assert.match(appSource, /queueMicrotask\(growSheetForNewestItem\)/)
  assert.match(appSource, /sheetHeight: sheetHeightRef\.current/)
  assert.match(appSource, /sheetHeightForItems\(strokesRef\.current, normalizeSheetHeight\(loaded\.page\.sheetHeight\)\)/)
  assert.match(appSource, /height: 108 \+ \(sheetHeight - SHEET_MIN_HEIGHT\) \* 0\.06/)
  assert.doesNotMatch(appSource, /\bWORKSPACE_BOUNDS\b|\bSHEET_BOUNDS\b/, 'fixed bounds would ignore the grown page')
})
