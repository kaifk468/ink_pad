import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const flow = await loadModule('diagramFlow.ts')
const input = await loadModule('desktopInput.ts')
const shortcuts = await loadModule('desktopShortcuts.ts')
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')

const rect = (id, extra = {}) => ({ kind: 'rectangle', id, x: 0, y: 0, width: 100, height: 60, strokeColor: '#000', strokeWidth: 4, ...extra })
const text = (id) => ({ kind: 'text', id, x: 10, y: 10, width: 20, height: 10, text: 'Hi', fontSize: 16, color: '#000' })

test('Enter on one selected plain shape starts a label centred in it; a shape with a label edits it', () => {
  const items = [rect(1), rect(2, { ellipse: true })]
  const action = flow.shapeLabelForSelection(items, new Set(), 1)
  assert.equal(action.kind, 'newLabel')
  assert.deepEqual([action.centre.x, action.centre.y], [50, 30])
  assert.equal(flow.shapeLabelForSelection(items, new Set(['rectangle:2']), null).kind, 'newLabel')
  const labelled = flow.shapeLabelForSelection([rect(1), text(7)], new Set(), 1)
  assert.deepEqual(labelled, { kind: 'editLabel', id: 7 })
})

test('Enter label does nothing for no selection, several, class boxes or non-shapes', () => {
  const items = [rect(1), rect(2), rect(3, { classBox: { name: 'A', attributes: [], methods: [] } }), text(4)]
  assert.equal(flow.shapeLabelForSelection(items, new Set(), null), null)
  assert.equal(flow.shapeLabelForSelection(items, new Set(['rectangle:1', 'rectangle:2']), null), null)
  assert.equal(flow.shapeLabelForSelection(items, new Set(), 3), null)
  assert.equal(flow.shapeLabelForSelection(items, new Set(['text:4']), null), null)
})

test('letters stay tool shortcuts; Enter maps to the edit command only on desktop', () => {
  const ev = (key, extra = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra })
  assert.deepEqual(input.keyCommand(ev('Enter'), 'desktop'), { kind: 'edit' })
  assert.equal(input.keyCommand(ev('Enter'), 'tablet'), null)
  assert.equal(input.keyCommand(ev('c'), 'desktop')?.kind, 'tool')
})

test('App wiring: Enter falls back to the shape label (desktop only); Escape commits in the label editor on desktop; export toasts on desktop', () => {
  assert.match(app, /inputModeRef\.current === 'desktop' \? shapeLabelForSelection\(/)
  assert.match(app, /onCancel=\{inputMode === 'desktop' \? \(\) => \{[^]*?labelEscapeAction[^]*?: cancelTextEditor\}/)
  assert.match(app, /onExportPng=\{\(scale\) => void exportPngFile\(scale, undefined, inputMode === 'desktop'\)\.then\(\(error\) => \{ if \(inputMode === 'desktop'\) showToast\(exportToastText\('PNG', error\)\) \}\)\}/)
  assert.match(app, /onExportSvg=\{\(\) => void exportSvgFile\(\)\.then\(\(error\) => \{ if \(inputMode === 'desktop'\) showToast\(exportToastText\('SVG', error\)\) \}\)\}/)
})

test('export toast text and the shortcut row', () => {
  assert.equal(input.exportToastText('PNG', null), 'PNG downloaded')
  assert.equal(input.exportToastText('SVG', null), 'SVG downloaded')
  assert.equal(input.exportToastText('PNG', 'Could not export'), 'Could not export')
  assert.ok(shortcuts.DESKTOP_SHORTCUTS.some((row) => row.keys === 'Enter' && /Label the selected shape/.test(row.label)))
})

test('Esc in the desktop label editor commits, but never deletes an existing label', () => {
  assert.equal(input.labelEscapeAction(false, 'Hello'), 'commit')
  assert.equal(input.labelEscapeAction(false, '  '), 'commit') // a new, blank label is simply not created
  assert.equal(input.labelEscapeAction(true, 'Edited'), 'commit')
  assert.equal(input.labelEscapeAction(true, ''), 'cancel')
  assert.equal(input.labelEscapeAction(true, '   \n'), 'cancel')
  assert.ok(shortcuts.DESKTOP_SHORTCUTS.some((row) => row.keys === 'Esc' && /finish text editing/.test(row.label)))
})

test('context menu bottom clearance applies only over the dock', () => {
  const dock = { left: 400, right: 900 }
  assert.equal(input.menuBottomClearance(100, 248, dock), 0)
  assert.equal(input.menuBottomClearance(1000, 248, dock), 0)
  assert.equal(input.menuBottomClearance(300, 248, dock), input.CONTEXT_MENU_BOTTOM_CLEARANCE)
  assert.equal(input.menuBottomClearance(850, 248, dock), input.CONTEXT_MENU_BOTTOM_CLEARANCE)
  assert.equal(input.menuBottomClearance(100, 248, null), input.CONTEXT_MENU_BOTTOM_CLEARANCE)
  assert.match(app, /menuBottomClearance\(contextMenu\.x, CONTEXT_MENU_WIDTH, dockRange\(\)\)/)
})

test('tablet leading content of the account button is exactly the pre-round-2 expression', async () => {
  const { accountLeading } = await loadModule('app/accountLeading.ts')
  assert.equal(accountLeading(true, 'tablet', 'PEN'), 'PEN')
  assert.equal(accountLeading(false, 'tablet', 'PEN'), undefined) // no status pill or Export on tablet with another tool
  assert.equal(accountLeading(true, 'desktop', 'PEN'), undefined)
  assert.match(app, /: accountLeading\(penModeActive, inputMode, /)
  assert.match(app, /inputMode === 'desktop' \? <DesktopStatusCluster [^]*?hideExport=\{zoomLockActive\}/)
})
