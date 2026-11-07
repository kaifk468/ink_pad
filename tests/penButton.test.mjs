import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { loadModule } from './helpers/loadModule.mjs'

const pb = await loadModule('penButton.ts')

test('the S Pen button counts whether Chrome reports it as barrel or eraser button, and only for a pen', () => {
  assert.equal(pb.isPenButtonHeld({ pointerType: 'pen', buttons: 1 }), false)
  assert.equal(pb.isPenButtonHeld({ pointerType: 'pen', buttons: 0 }), false)
  assert.equal(pb.isPenButtonHeld({ pointerType: 'pen', buttons: 3 }), true, 'contact + barrel')
  assert.equal(pb.isPenButtonHeld({ pointerType: 'pen', buttons: 2 }), true, 'hover + barrel')
  assert.equal(pb.isPenButtonHeld({ pointerType: 'pen', buttons: 32 }), true, 'eraser button')
  assert.equal(pb.isPenButtonHeld({ pointerType: 'pen', buttons: 1, button: 5 }), true)
  assert.equal(pb.isPenButtonHeld({ pointerType: 'touch', buttons: 2 }), false)
  assert.equal(pb.isPenButtonHeld({ pointerType: 'mouse', buttons: 2 }), false)
})

test('the debug line shows what the tablet sends', () => {
  assert.match(pb.describePenEvent('down', { pointerType: 'pen', buttons: 3, button: 0 }), /buttons=3 button=0 · BUTTON HELD/)
  assert.match(pb.describePenEvent('move', { pointerType: 'pen', buttons: 0 }), /no button/)
})

test('the last eraser mode and size are remembered and damaged data falls back to defaults', () => {
  const store = new Map()
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
  assert.deepEqual(pb.loadEraserPrefs(storage), { whole: false, size: 28 })
  pb.saveEraserPrefs({ whole: true, size: 60 }, storage)
  assert.deepEqual(pb.loadEraserPrefs(storage), { whole: true, size: 60 })
  store.set('inkpad.eraser', JSON.stringify({ whole: 'yes', size: 9999 }))
  assert.deepEqual(pb.loadEraserPrefs(storage), { whole: false, size: 96 })
  store.set('inkpad.eraser', '{broken')
  assert.deepEqual(pb.loadEraserPrefs(storage), { whole: false, size: 28 })
})

test('App erases with the pen button using the last eraser, shows a different look for the whole eraser, and has a debug note', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.match(app, /const buttonErase = !eraser && isPenButtonHeld\(event\.nativeEvent\)/)
  assert.match(app, /\(eraser \|\| buttonErase\) && objectEraser/)
  assert.match(app, /useState\(savedEraser\.whole\)/)
  assert.match(app, /saveEraserPrefs\(\{ whole: objectEraser, size: eraserSize \}\)/)
  assert.match(app, /cursor\.classList\.toggle\('whole', objectEraser\)/)
  assert.match(app, /onContextMenu=\{\(event\) => event\.preventDefault\(\)\}/)
  assert.match(app, /DRAW_SWITCHES\.get\('penbutton'\) === 'show'/)
  assert.match(css, /\.eraser-cursor\.whole/)
  assert.doesNotMatch(app, /if \(eraser \|\| objectEraser\) return/, 'the remembered whole-eraser mode must not switch off hold-to-shape for the pen')
})
