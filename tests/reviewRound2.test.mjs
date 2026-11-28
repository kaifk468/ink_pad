import assert from 'node:assert/strict'
import test from 'node:test'

import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const g = await loadModule('grouping.ts')
const dup = await loadModule('dragDuplicate.ts')
const input = await loadModule('desktopInput.ts')
const hld = await loadModule('hldShapes.ts')
const app = await readAppSource()
const css = (await import('node:fs')).readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

const rect = (id, extra = {}) => ({ kind: 'rectangle', id, x: 0, y: 0, width: 50, height: 40, strokeColor: '#111', strokeWidth: 2, ...extra })
const text = (id, extra = {}) => ({ kind: 'text', id, x: 0, y: 0, width: 30, height: 20, text: 't', fontSize: 16, color: '#000', ...extra })
const conn = (id, extra = {}) => ({ kind: 'connector', id, start: { x: 0, y: 0, pressure: 1 }, end: { x: 9, y: 9, pressure: 1 }, strokeColor: '#000', strokeWidth: 3, color: '#000', width: 3, relationshipType: 'association', ...extra })

test('touch connector handle: only without a pen near or down, and cancelled by a second touch or a pen', () => {
  assert.match(app, /touchNav\.touchCount\(\) === 0 && activeEndpointRef\.current === null && !touchNav\.penNear\(performance\.now\(\)\) && startConnectorHandleGesture/)
  assert.match(app, /pointerType: event\.pointerType, id: connector\.id/)
  assert.match(app, /activeEndpointRef\.current\?\.pointerType === 'touch'\) cancelConnectorHandleGesture\(\)\n    if \(event\.pointerType === 'pen'\) touchNav\.penDown\(\)/)
  // a second finger cancels the handle drag and hands both fingers to touch navigation
  assert.match(app, /cancelConnectorHandleGesture\(\)\n        touchNav\.down\(firstId, firstStart/)
})

test('select-tool press on a group member expands to the group and starts a group drag', () => {
  assert.match(app, /const pressedGroup = expandSelectionState\(\{ keys: \[canvasItemKey\(selectedItem\)\], rectangleId: null \}\)\n      if \(pressedGroup\.keys\.length > 1\) \{\n        applySelectionState\(pressedGroup\)\n        startGroupDrag\(event, point\)/)
})

test('double-click on a connector restores what the two clicks did before opening the label editor', () => {
  assert.match(app, /target\.kind === 'connector' && before && before\.owner === historyRef\.current && !clickItemsUnchanged\(before\.items, strokesRef\.current\)/)
})

test('group, ungroup, library and style keys always cancel the browser default in Desktop mode', () => {
  for (const kind of ['group', 'ungroup', 'library', 'copyStyle', 'pasteStyle']) {
    assert.equal(input.alwaysPreventsDefault({ kind }, 'desktop'), true, kind)
    assert.equal(input.alwaysPreventsDefault({ kind }, 'tablet'), false, kind)
  }
  assert.equal(input.alwaysPreventsDefault({ kind: 'copy' }, 'desktop'), false)
  assert.match(app, /if \(handled \|\| alwaysPreventsDefault\(command, inputModeRef\.current\)\) event\.preventDefault\(\)/)
  // the typing-target return stays ahead of it
  assert.ok(app.indexOf('isTypingTarget(target?.tagName') < app.indexOf('alwaysPreventsDefault(command'))
})

test('paste style bails out when a gesture started or the page changed during the font load', () => {
  assert.match(app, /pageIndexRef\.current !== pageAtPress \|\| activePointerRef\.current !== null/)
})

test('copy style on exactly one group takes its topmost non-connector, non-label shape', () => {
  const items = [rect(1, { group: 1 }), rect(2, { group: 1, strokeColor: '#f00' }), text(1, { group: 1 }), conn(1, { group: 1 }), rect(3)]
  const keys = new Set(['rectangle:1', 'rectangle:2', 'text:1', 'connector:1'])
  assert.equal(g.groupStyleSource(items, keys).id, 2)
  assert.equal(g.groupStyleSource(items, keys).kind, 'rectangle')
  // labels and connectors only: the first member
  const only = [text(1, { group: 2 }), conn(1, { group: 2 })]
  assert.equal(g.groupStyleSource(only, new Set(['text:1', 'connector:1'])).kind, 'text')
  // not exactly one group
  assert.equal(g.groupStyleSource(items, new Set(['rectangle:1', 'rectangle:2'])), null)
  assert.equal(g.groupStyleSource(items, new Set(['rectangle:1', 'rectangle:3'])), null)
})

test('Mac: only Cmd duplicates a drag; elsewhere Ctrl or Cmd', () => {
  assert.equal(dup.isDuplicateDragPress('desktop', 'mouse', 0, true, false, true), false)
  assert.equal(dup.isDuplicateDragPress('desktop', 'mouse', 0, false, true, true), true)
  assert.equal(dup.isDuplicateDragPress('desktop', 'mouse', 0, true, false, false), true)
  assert.equal(dup.isDuplicateDragPress('desktop', 'mouse', 0, false, true, false), true)
})

test('context menu taller than the window scrolls and sits at the top margin', () => {
  assert.match(css, /\.canvas-context-menu \{[^}]*max-height: calc\(100vh - 16px\); overflow-y: auto;/)
  assert.deepEqual(input.clampMenuPosition(100, 300, 248, 690, 1024, 600), { x: 100, y: 8 })
  assert.deepEqual(input.clampMenuPosition(100, 100, 248, 236, 1000, 800), { x: 100, y: 100 })
})

test('a finger tap that wobbles a pixel still makes the default-sized HLD shape', () => {
  const start = { width: 40, height: 40 }
  assert.equal(hld.isHldTapCreate(start, { width: 41, height: 40 }, 1), true)
  assert.equal(hld.isHldTapCreate(start, { width: 120, height: 90 }, 1), false)
  assert.equal(hld.isHldTapCreate(start, { width: 44, height: 40 }, 2), true)
  assert.match(app, /isHldTapCreate\(finished\.originalBounds, createdNow, viewportRef\.current\.scale\)/)
})
