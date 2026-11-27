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
  assert.match(app, /onCancel=\{inputMode === 'desktop' \? commitTextEditor : cancelTextEditor\}/)
  assert.match(app, /onExportPng=\{\(scale\) => void exportPngFile\(scale\)\.then\(\(error\) => \{ if \(inputMode === 'desktop'\) showToast\(exportToastText\('PNG', error\)\) \}\)\}/)
  assert.match(app, /onExportSvg=\{\(\) => void exportSvgFile\(\)\.then\(\(error\) => \{ if \(inputMode === 'desktop'\) showToast\(exportToastText\('SVG', error\)\) \}\)\}/)
})

test('export toast text and the shortcut row', () => {
  assert.equal(input.exportToastText('PNG', null), 'PNG downloaded')
  assert.equal(input.exportToastText('SVG', null), 'SVG downloaded')
  assert.equal(input.exportToastText('PNG', 'Could not export'), 'Could not export')
  assert.ok(shortcuts.DESKTOP_SHORTCUTS.some((row) => row.keys === 'Enter' && /Label the selected shape/.test(row.label)))
})
