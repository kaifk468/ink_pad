import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')

test('the empty-canvas hint has desktop and tablet texts and takes no pointer events', async () => {
  const hint = await read('app/EmptyCanvasHint.tsx')
  for (const text of ['Start your diagram', 'Pick a tool below or press 1–9 · R rectangle, A arrow, T text', 'Double-click anywhere to type', 'Press ? for all shortcuts',
    'Write or draw with the pen', 'Two fingers to zoom · three fingers to pan', 'Insert has shapes, text and HLD parts']) assert.ok(hint.includes(text), text)
  assert.match(hint, /aria-hidden="true"/)
  const css = await read('styles.css')
  assert.match(css, /\.empty-canvas-hint \{[^}]*pointer-events: none/)
})

test('App shows the hint only for an empty page with no editor or modal, from the existing hasInk state', async () => {
  const app = await read('App.tsx')
  assert.match(app, /import \{ EmptyCanvasHint \} from '\.\/app\/EmptyCanvasHint'/)
  const line = app.split('\n').find((l) => l.includes('<EmptyCanvasHint'))
  assert.ok(line)
  for (const flag of ['!hasInk', '!textEditor', '!codeEditor', '!classBoxEditor', '!libraryOpen', '!filePanelOpen', '!storagePanelOpen', '!shortcutHelpOpen']) assert.ok(line.includes(flag), flag)
  assert.match(line, /desktop=\{inputMode === 'desktop'\}/)
  // hasInk is React state refreshed where items change (not per pointermove): the hint adds no work to the stroke path
  assert.equal(app.includes('canvas-hint'), false)
})
