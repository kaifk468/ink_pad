import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { loadModule } from './helpers/loadModule.mjs'

const choice = await loadModule('newDiagramChoice.ts')
const doc = await loadModule('documentFormat.ts')
const canvases = await loadModule('canvasTypes.ts')
const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')
const home = await read('app/HomeScreen.tsx')
const documents = await read('app/useDocuments.ts')
const app = await read('App.tsx')
const css = await read('styles.css')

const mockStorage = (initial) => {
  const values = new Map(initial ? [['inkpad.newDiagram', initial]] : [])
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values }
}

test('the remembered choice defaults to Clean light dots and survives a save and load', () => {
  assert.deepEqual(choice.loadNewDiagramChoice(mockStorage()), { style: 'clean', dark: false, canvas: 'dotted' })
  const storage = mockStorage()
  choice.saveNewDiagramChoice({ style: 'sketch', dark: true, canvas: 'cornell' }, storage)
  assert.deepEqual(choice.loadNewDiagramChoice(storage), { style: 'sketch', dark: true, canvas: 'cornell' })
})

test('unknown, damaged or unavailable storage falls back to the default; chalk is never light/dark', () => {
  const fallback = { style: 'clean', dark: false, canvas: 'dotted' }
  for (const bad of ['not json', '{"style":"neon","canvas":"zigzag","dark":"yes"}', '[]', '5', '']) assert.deepEqual(choice.parseNewDiagramChoice(bad), fallback)
  assert.deepEqual(choice.parseNewDiagramChoice('{"style":"chalk","dark":true,"canvas":"grid"}'), { style: 'chalk', dark: false, canvas: 'grid' })
  const broken = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  assert.deepEqual(choice.loadNewDiagramChoice(broken), fallback)
  assert.doesNotThrow(() => choice.saveNewDiagramChoice(fallback, broken))
})

test('every canvas type that is listed can be remembered', () => {
  for (const type of canvases.CANVAS_TYPES) {
    const storage = mockStorage()
    choice.saveNewDiagramChoice({ style: 'clean', dark: false, canvas: type.id }, storage)
    assert.equal(choice.loadNewDiagramChoice(storage).canvas, type.id)
  }
})

test('a choice produces the template, canvas, board and sketchy fields', () => {
  assert.deepEqual(choice.newDiagramOptionsFor({ style: 'clean', dark: false, canvas: 'dotted' }), { template: 'dotted', canvas: undefined, board: undefined, sketchy: false })
  assert.deepEqual(choice.newDiagramOptionsFor({ style: 'chalk', dark: false, canvas: 'grid' }), { template: 'dotted', canvas: 'grid', board: 'chalk', sketchy: true })
  assert.deepEqual(choice.newDiagramOptionsFor({ style: 'sketch', dark: true, canvas: 'cornell' }), { template: 'lined', canvas: 'cornell', board: 'dark', sketchy: true })
  assert.deepEqual(choice.newDiagramOptionsFor({ style: 'clean', dark: true, canvas: 'blank' }), { template: 'blank', canvas: undefined, board: 'dark', sketchy: false })
})

test('Sketch and Chalkboard ask for the hand-drawn text font, Clean does not', () => {
  const uses = (style) => choice.newDiagramUsesHandFont(choice.newDiagramOptionsFor({ style, dark: false, canvas: 'dotted' }))
  assert.deepEqual([uses('clean'), uses('sketch'), uses('chalk')], [false, true, true])
  assert.equal(choice.newDiagramUsesHandFont(undefined), false)
})

test('a new chalk grid diagram saves board chalk, sketchy, canvas grid and template dotted', () => {
  const options = choice.newDiagramOptionsFor({ style: 'chalk', dark: false, canvas: 'grid' })
  const saved = doc.createDocument({ template: options.template, background: 'white', canvas: options.canvas, board: options.board, sketchy: options.sketchy, items: [] })
  assert.equal(saved.page.board, 'chalk')
  assert.equal(saved.page.sketchy, true)
  assert.equal(saved.page.canvas, 'grid')
  assert.equal(saved.page.template, 'dotted')
  const plain = doc.createDocument({ template: 'dotted', background: 'white', canvas: undefined, board: undefined, sketchy: false, items: [] })
  assert.equal('board' in plain.page || 'sketchy' in plain.page || 'canvas' in plain.page, false)
})

test('the Library chooser lists every canvas type and board style, creates on a canvas tap and returns focus', () => {
  assert.match(home, /CANVAS_TYPES\.map\(/)
  assert.match(home, /BOARD_STYLES\.map\(/)
  assert.match(home, /BoardStylePreview/)
  assert.match(home, /CanvasPreview/)
  assert.match(home, /loadNewDiagramChoice\(\)/)
  assert.match(home, /saveNewDiagramChoice\(choice\)/)
  assert.match(home, /props\.onNewDiagram\(here, options\.template, options\)/)
  assert.match(home, /role="dialog" aria-label="New diagram"/)
  assert.match(home, /aria-label="Board theme"/)
  assert.match(home, /newButtonRef\.current\?\.focus\(\)/)
  // The other entries keep working unchanged.
  // "New diagram here" uses the remembered choice; the welcome button stays blank but keeps the remembered board.
  assert.match(home, /newDiagramOptionsFor\(newChoice\); props\.onNewDiagram\(here, options\.template, options\) \}\}>New diagram here/)
  assert.match(home, /newDiagramOptionsFor\(\{ \.\.\.newChoice, canvas: 'blank' \}\); props\.onNewDiagram\(null, options\.template, options\) \}\}>New blank diagram/)
  assert.match(css, /\.home-new-theme button \{[^}]*min-height: 44px/)
})

test('the options reach the document: useDocuments creates it with them and App sets the hand font', () => {
  assert.match(documents, /blankDocument = \(template\?: DocumentPageTemplate, options\?: NewDiagramOptions\)/)
  assert.match(documents, /canvas: options\.canvas, board: options\.board, sketchy: options\.sketchy/)
  assert.match(documents, /newDiagram = async \(template\?: DocumentPageTemplate, options\?: NewDiagramOptions\)/)
  assert.match(documents, /newDiagramIn = async \(folderId: string \| null, template\?: DocumentPageTemplate, options\?: NewDiagramOptions\)/)
  assert.match(documents, /await newDiagram\(template, options\)/)
  assert.match(app, /newDiagramIn\(folderId, template, options\)/)
  assert.match(app, /newDiagramUsesHandFont\(options\) && textFontId !== 'excalifont'\) setTextFontId\('excalifont'\)/)
})
