import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'
import { readFile } from 'node:fs/promises'

const exp = await loadModule('exportOptions.ts')
const sheet = await loadModule('sheetExport.ts')
const input = await loadModule('desktopInput.ts')
const shortcuts = await loadModule('desktopShortcuts.ts')
const app = await readAppSource()

const rect = (id, x = 0) => ({ kind: 'rectangle', id, x, y: 0, width: 100, height: 60, strokeColor: '#000', strokeWidth: 3 })
const text = (id, font, t = 'hi') => ({ kind: 'text', id, x: 10, y: 10, width: 40, height: 20, text: t, fontSize: 16, color: '#000', ...(font ? { fontFamily: font } : {}) })
const conn = (id) => ({ kind: 'connector', id, start: { x: 100, y: 30, pressure: 1 }, end: { x: 200, y: 30, pressure: 1 }, strokeColor: '#000', strokeWidth: 3 })
const eraser = { kind: 'stroke', id: 9, color: '#000', width: 10, erase: true, points: [{ x: 0, y: 0, pressure: 1 }, { x: 5, y: 5, pressure: 1 }] }
const key = (k, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra })
const base = { width: 800, height: 600, template: 'lined', backgroundColor: '#fffdf5' }

const menuOf = (hasSelection, clipboardHasItems, pageHasItems, extra = {}) => input.contextMenuEntries({ hasSelection, clipboardHasItems, pageHasItems, canEditText: false, lockedTarget: false, anyLocked: false, ...extra })

test('itemsForExport: no keys exports everything, keys export exactly the selection plus erasers', () => {
  const items = [rect(1), rect(2, 300), conn(1), text(1, 'sans'), eraser]
  assert.equal(exp.itemsForExport(items, null).length, 5)
  assert.equal(exp.itemsForExport(items, new Set()).length, 5)
  const picked = exp.itemsForExport(items, new Set(['rectangle:1', 'text:1']))
  assert.deepEqual(picked.map((i) => i.kind), ['rectangle', 'text', 'stroke'])
  assert.ok(!picked.some((i) => i.kind === 'connector'))
  assert.equal(exp.isSelectionExport(new Set(['rectangle:1'])), true)
  assert.equal(exp.isSelectionExport(new Set()), false)
})

test('usesExcalifont and file names', () => {
  assert.equal(exp.usesExcalifont([text(1, 'excalifont')]), true)
  assert.equal(exp.usesExcalifont([text(1, 'sans'), text(2, undefined), rect(1)]), false)
  assert.equal(exp.usesExcalifont([text(1, 'excalifont', '  ')]), false)
  assert.equal(exp.exportBaseName('Design', true), 'Design-selection')
  assert.equal(exp.exportBaseName('Design', false), 'Design')
  assert.match(exp.excalifontFontFaceCss('AAA'), /font-family:'Excalifont'.*data:font\/woff2;base64,AAA/)
})

test('transparent choice is remembered, defaults off and survives broken storage', () => {
  const store = new Map()
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
  assert.equal(exp.readTransparentExport(storage), false)
  exp.writeTransparentExport(storage, true)
  assert.equal(exp.readTransparentExport(storage), true)
  exp.writeTransparentExport(storage, false)
  assert.equal(exp.readTransparentExport(storage), false)
  const broken = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') } }
  assert.equal(exp.readTransparentExport(broken), false)
  exp.writeTransparentExport(broken, true)
  assert.equal(exp.readTransparentExport(null), false)
})

test('buildSheetSvg: default output unchanged; embedded font css goes in defs; transparent drops sheet and template', () => {
  const items = [rect(1), text(1, 'excalifont')]
  const plain = sheet.buildSheetSvg(items, base)
  assert.ok(!plain.includes('<style>'))
  assert.equal(sheet.buildSheetSvg(items, { ...base, embeddedFontCss: undefined }), plain)
  const css = "@font-face{font-family:'Excalifont';src:url(data:font/woff2;base64,AAA)}"
  const withFont = sheet.buildSheetSvg(items, { ...base, embeddedFontCss: css })
  assert.match(withFont, /<defs><style>@font-face\{font-family:'Excalifont'/)
  assert.equal(withFont.replace(/<style>.*?<\/style>/, ''), plain)
  const clear = sheet.buildSheetSvg(items, { ...base, transparent: true })
  assert.ok(!clear.includes('fill="#fffdf5"') && !clear.includes('url(#template)'))
  const cropped = sheet.cropSvg(withFont, { x: 0, y: 0, width: 50, height: 50 })
  assert.match(cropped, /^<svg [^>]*width="50"/)
})

test('keyCommand: Shift+Alt+C is copyPng by physical key; Ctrl+Shift+C (Chrome DevTools) is not; plain copy and tablet unchanged', () => {
  assert.deepEqual(input.keyCommand(key('C', { code: 'KeyC', altKey: true, shiftKey: true }), 'desktop'), { kind: 'copyPng' })
  assert.deepEqual(input.keyCommand(key('Ç', { code: 'KeyC', altKey: true, shiftKey: true }), 'desktop'), { kind: 'copyPng' }, 'Mac Alt changes key')
  assert.equal(input.keyCommand(key('C', { code: 'KeyC', altKey: true, shiftKey: true, repeat: true }), 'desktop'), null)
  assert.equal(input.keyCommand(key('C', { code: 'KeyC', altKey: true, shiftKey: true }), 'tablet'), null)
  assert.equal(input.keyCommand(key('C', { code: 'KeyC', ctrlKey: true, shiftKey: true }), 'desktop'), null, 'Chrome reserves Ctrl+Shift+C')
  assert.equal(input.keyCommand(key('C', { code: 'KeyC', altKey: true, shiftKey: true, ctrlKey: true }), 'desktop'), null)
  assert.equal(input.keyCommand(key('c', { code: 'KeyC', altKey: true }), 'desktop'), null)
  assert.deepEqual(input.keyCommand(key('c', { code: 'KeyC', ctrlKey: true }), 'desktop'), { kind: 'copy' })
  assert.ok(shortcuts.DESKTOP_SHORTCUTS.some((row) => row.keys === 'Shift+Alt+C' && row.input))
})

test('context menu: Copy as PNG always, export entries only with a selection', () => {
  const none = menuOf(false, false, true)
  assert.equal(none.find((e) => e.action === 'copyPng').disabled, false)
  assert.ok(!none.some((e) => e.action === 'exportPng' || e.action === 'exportSvg'))
  assert.equal(menuOf(false, false, false).find((e) => e.action === 'copyPng').disabled, true)
  const some = menuOf(true, false, true)
  assert.deepEqual(some.filter((e) => e.action.startsWith('export')).map((e) => e.label), ['Export selection as PNG', 'Export selection as SVG'])
  assert.equal(input.contextMenuHeight(some), input.contextMenuHeight(some.filter(() => true)))
})

test('wiring: copy as PNG, selection export, toasts, font embedding, transparent checkbox', async () => {
  assert.match(app, /case 'copyPng': return copyAsPng\(\)/)
  assert.match(app, /case 'exportPng': exportSelectionAs\('png'\)/)
  assert.match(app, /aria-live="polite"/)
  assert.match(app, /showToast\('Nothing to paste'\)/)
  assert.match(app, /showToast\('Duplicated'\)/)
  assert.match(app, /error \?\? 'Copied as PNG'/)
  assert.match(app, /if \(inputModeRef\.current !== 'desktop'\) return\s+if \(toastTimerRef/)
  assert.match(app, /new Item\(\{ 'image\/png': blobPromise \}\)/)
  assert.match(app, /loadExcalifontCss\(\)/)
  assert.match(app, /clampMenuPosition\(contextMenu\.x, contextMenu\.y, CONTEXT_MENU_WIDTH, contextMenuHeight\(entries\)/)
  const panel = await readFile(new URL('../src/FilePanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /Transparent background/)
  const font = await readFile(new URL('../src/fontEmbed.ts', import.meta.url), 'utf8')
  assert.match(font, /Excalifont-Regular\.woff2\?url/)
})
