import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import { readAppSource } from './helpers/appSource.mjs'

const pageTemplateSource = await readFile(new URL('../src/pageTemplates.ts', import.meta.url), 'utf8')
const appSource = await readAppSource()
const stylesSource = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
const output = ts.transpileModule(pageTemplateSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
const templates = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
const mockStorage = () => {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('page template supports blank, lined, and dotted with one shared default spacing', () => {
  assert.deepEqual(['blank', 'lined', 'dotted'].map(templates.parsePageTemplate), ['blank', 'lined', 'dotted'])
  assert.equal(templates.DEFAULT_PAGE_TEMPLATE, 'blank')
  assert.equal(templates.PAGE_TEMPLATE_SPACING, 32)
  assert.equal(templates.PAGE_TEMPLATE_DOT_COLOR, '#566477')
  assert.equal(templates.PAGE_TEMPLATE_LINE_COLOR, '#aebfd8')
  assert.equal(templates.PAGE_TEMPLATE_OVERVIEW_SPACING, 8)
  assert.equal(templates.PAGE_TEMPLATE_OVERVIEW_DOT_RADIUS, 1.35)
})

test('page template setting defaults to blank, rejects invalid values, and persists selection', () => {
  const storage = mockStorage()
  assert.equal(templates.loadPageTemplate(storage), 'blank')
  storage.setItem('inkpad.pageTemplate', 'invalid')
  assert.equal(templates.loadPageTemplate(storage), 'blank')
  templates.savePageTemplate('dotted', storage)
  assert.equal(templates.loadPageTemplate(storage), 'dotted')
  templates.savePageTemplate('lined', storage)
  assert.equal(templates.loadPageTemplate(storage), 'lined')
})

test('template selector updates the sheet layer and shares it with the workspace map', () => {
  assert.match(appSource, /aria-label="Page template"/)
  assert.doesNotMatch(appSource, /drawPageTemplate\(/)
  assert.equal((appSource.match(/benchmarkBackground\?\.template \?\? pageTemplate/g) ?? []).length, 1)
  assert.equal((appSource.match(/drawPageTemplateOverview\(ctx, pageTemplate,/g) ?? []).length, 1)
  assert.match(appSource, /savePageTemplate\(pageTemplate\)/)
})

test('dotted marks are opaque and remain legible in overview scale', () => {
  assert.match(pageTemplateSource, /tileContext\.fillStyle = tileContext\.strokeStyle/)
  assert.match(pageTemplateSource, /export const PAGE_TEMPLATE_DOT_COLOR = '#566477'/)
  assert.match(pageTemplateSource, /tileContext\.arc\(center, center, radius/)
  assert.match(pageTemplateSource, /export function drawPageTemplateOverview/)
  assert.match(pageTemplateSource, /const radius = PAGE_TEMPLATE_OVERVIEW_DOT_RADIUS/)
  assert.equal((pageTemplateSource.match(/ctx\.globalAlpha = 1/g) ?? []).length, 1)
})

test('lined and dotted marks are described as CSS tiled at the shared page spacing', () => {
  const blank = templates.getPageTemplateCss('blank')
  assert.equal(blank.backgroundImage, 'none')
  const lined = templates.getPageTemplateCss('lined')
  assert.equal(lined.backgroundSize, '32px 32px')
  assert.match(lined.backgroundImage, /^linear-gradient\(to bottom, transparent 30\.875px, #aebfd8 30\.875px\)$/)
  const dotted = templates.getPageTemplateCss('dotted')
  assert.equal(dotted.backgroundSize, '32px 32px')
  assert.match(dotted.backgroundImage, /^radial-gradient\(circle at 2px 2px, #566477 1\.5px, transparent 1\.9px\)$/)
  assert.equal(templates.PAGE_TEMPLATE_SPACING, 32)
})

test('sheet layer transform places canvas origin exactly where the canvas viewport transform does', () => {
  assert.equal(templates.getSheetLayerTransform({ scale: 1, offsetX: 0, offsetY: 0 }), 'translate3d(0px, 0px, 0) scale(1)')
  assert.equal(templates.getSheetLayerTransform({ scale: 2.5, offsetX: -120.5, offsetY: 33 }), 'translate3d(-120.5px, 33px, 0) scale(2.5)')
  const state = templates.getSheetLayerState('lined', '#fffaf0', { scale: 0.1, offsetX: 4, offsetY: 6 })
  assert.equal(state.transform, 'translate3d(4px, 6px, 0) scale(0.1)')
  assert.equal(state.backgroundColor, '#fffaf0')
  assert.equal(state.backgroundImage, templates.getPageTemplateCss('lined').backgroundImage)
})

test('applySheetLayer writes only changed style properties so steady frames cause no style writes', () => {
  const writes = []
  const style = {}
  for (const name of ['transform', 'backgroundColor', 'backgroundImage', 'backgroundSize']) {
    let value = ''
    Object.defineProperty(style, name, { get: () => value, set: (next) => { value = next; writes.push(name) } })
  }
  const element = { style }
  const applied = {}
  const viewport = { scale: 1, offsetX: 0, offsetY: 0 }
  templates.applySheetLayer(element, applied, templates.getSheetLayerState('dotted', '#ffffff', viewport))
  assert.deepEqual(writes.sort(), ['backgroundColor', 'backgroundImage', 'backgroundSize', 'transform'])
  writes.length = 0
  templates.applySheetLayer(element, applied, templates.getSheetLayerState('dotted', '#ffffff', viewport))
  assert.deepEqual(writes, [])
  templates.applySheetLayer(element, applied, templates.getSheetLayerState('dotted', '#ffffff', { ...viewport, offsetX: 12 }))
  assert.deepEqual(writes, ['transform'])
  writes.length = 0
  templates.applySheetLayer(element, applied, templates.getSheetLayerState('lined', '#f2f7ff', { ...viewport, offsetX: 12 }))
  assert.deepEqual(writes.sort(), ['backgroundColor', 'backgroundImage'])
  assert.equal(element.style.backgroundColor, '#f2f7ff')
  assert.equal(element.style.transform, 'translate3d(12px, 0px, 0) scale(1)')
})

test('sheet layer sits behind a transparent canvas and never receives pointer input', () => {
  const sheetIndex = appSource.indexOf('className="sheet-layer"')
  const canvasIndex = appSource.indexOf('className={`drawing-canvas')
  assert.ok(sheetIndex > 0 && sheetIndex < canvasIndex)
  assert.match(appSource, /className="sheet-layer" aria-hidden="true" style=\{\{ width: SHEET_WIDTH, height: SHEET_HEIGHT \}\}/)
  const sheetRule = stylesSource.match(/\.sheet-layer \{([^}]*)\}/)?.[1] ?? ''
  assert.match(sheetRule, /pointer-events: none;/)
  assert.match(sheetRule, /transform-origin: 0 0;/)
  assert.match(sheetRule, /position: absolute;/)
  assert.match(stylesSource, /\.drawing-canvas \{\s*position: absolute;\s*inset: 0;/)
})
