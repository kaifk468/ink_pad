import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import { readAppSource } from './helpers/appSource.mjs'
import { loadModule } from './helpers/loadModule.mjs'

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
  assert.equal(templates.PAGE_TEMPLATE_DOT_COLOR, '#788392')
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
  assert.equal((appSource.match(/benchmarkBackground\?\.template \?\? canvasType/g) ?? []).length, 1)
  assert.equal((appSource.match(/drawPageTemplateOverview\(ctx, canvasType,/g) ?? []).length, 1)
  assert.match(appSource, /savePageTemplate\(pageTemplate\)/)
})

test('dotted marks are opaque and remain legible in overview scale', () => {
  assert.match(pageTemplateSource, /c\.fillStyle = marks\.dot/)
  assert.match(pageTemplateSource, /export const PAGE_TEMPLATE_DOT_COLOR = '#788392'/)
  assert.match(pageTemplateSource, /c\.arc\(x, y, radius/)
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
  assert.match(dotted.backgroundImage, /^radial-gradient\(circle at 2px 2px, #788392 1\.5px, transparent 1\.9px\)$/)
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
  assert.match(appSource, /className="sheet-layer" aria-hidden="true" style=\{\{ width: SHEET_WIDTH, height: sheetHeight \}\}/)
  const sheetRule = stylesSource.match(/\.sheet-layer \{([^}]*)\}/)?.[1] ?? ''
  assert.match(sheetRule, /pointer-events: none;/)
  assert.match(sheetRule, /transform-origin: 0 0;/)
  assert.match(sheetRule, /position: absolute;/)
  assert.match(stylesSource, /\.drawing-canvas \{\s*position: absolute;\s*inset: 0;/)
})

test('page spacing: narrow is 20% tighter and wide 20% looser than the standard 32 units, for lined and dotted', () => {
  assert.deepEqual(['narrow', 'standard', 'wide'].map(templates.pageSpacingUnits), [25.6, 32, 38.4])
  assert.equal(templates.DEFAULT_PAGE_SPACING, 'standard')
  const narrow = templates.getPageTemplateCss('lined', 'narrow')
  assert.equal(narrow.backgroundSize, '25.6px 25.6px')
  assert.match(narrow.backgroundImage, /transparent 24\.475px, #aebfd8 24\.475px/)
  const wide = templates.getPageTemplateCss('dotted', 'wide')
  assert.equal(wide.backgroundSize, '38.4px 38.4px')
  assert.match(wide.backgroundImage, /#788392 1\.5px/)
  assert.deepEqual(templates.getPageTemplateCss('lined'), templates.getPageTemplateCss('lined', 'standard'))
  assert.equal(templates.getPageTemplateCss('blank', 'wide').backgroundImage, 'none')
  assert.equal(templates.getSheetLayerState('dotted', '#fff', { scale: 1, offsetX: 0, offsetY: 0 }, 'narrow').backgroundSize, '25.6px 25.6px')
})

test('page spacing setting defaults to standard, rejects invalid values and persists', () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  assert.equal(templates.loadPageSpacing(storage), 'standard')
  templates.savePageSpacing('wide', storage)
  assert.equal(templates.loadPageSpacing(storage), 'wide')
  assert.equal(templates.parsePageSpacing('huge'), 'standard')
  assert.equal(templates.parsePageSpacing(null), 'standard')
})

test('dots are fainter than before', () => {
  const channel = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  for (let i = 0; i < 3; i += 1) assert.ok(channel(templates.PAGE_TEMPLATE_DOT_COLOR, i) > channel('#566477', i))
})

test('spacing is saved only when not standard, repaired when invalid, and counts as a change', async () => {
  const format = await loadModule('documentFormat.ts')
  const base = { template: 'lined', background: 'white', items: [] }
  assert.equal('spacing' in format.createDocument(base).page, false)
  assert.equal('spacing' in format.createDocument({ ...base, spacing: 'standard' }).page, false)
  assert.equal(format.createDocument({ ...base, spacing: 'narrow' }).page.spacing, 'narrow')
  const round = format.parseDocument(format.stringifyDocument(format.createDocument({ ...base, spacing: 'wide' })))
  assert.equal(round.document.page.spacing, 'wide')
  const bad = format.parseDocument(JSON.stringify({ format: 'inkpad-document', version: 1, page: { template: 'lined', background: 'white', spacing: 'tiny' }, items: [] }))
  assert.equal('spacing' in bad.document.page, false)
  const sig = (spacing) => ({ title: 't', template: 'lined', background: 'white', spacing, items: [] })
  assert.equal(format.sameSignature(sig(undefined), sig('standard')), true)
  assert.equal(format.sameSignature(sig(undefined), sig('wide')), false)
})

test('SVG export uses the chosen spacing', async () => {
  const exp = await loadModule('sheetExport.ts')
  const svg = (spacing) => exp.buildSheetSvg([], { width: 400, height: 300, template: 'lined', spacing, backgroundColor: '#fff' })
  assert.match(svg('narrow'), /<pattern id="template" width="25.6" height="25.6"/)
  assert.match(svg('wide'), /<pattern id="template" width="38.4" height="38.4"/)
  assert.match(svg(undefined), /<pattern id="template" width="32" height="32"/)
})

test('menu: a Spacing row (Narrow, Standard, Wide) shows under Page for lined and dotted, and is wired through the app and saved files', async () => {
  const bar = await readFile(new URL('../src/app/TopLeftBar.tsx', import.meta.url), 'utf8')
  assert.match(bar, /pageTemplate !== 'blank' && <div[^>]*aria-label="Line and dot spacing"/)
  for (const label of ['Narrow', 'Standard', 'Wide']) assert.match(bar, new RegExp(`label: '${label}'`))
  assert.match(appSource, /pageSpacing=\{pageSpacing\}/)
  assert.match(appSource, /savePageSpacing\(pageSpacing\)/)
  assert.match(appSource, /loaded\.page\.spacing \?\? 'standard'/)
})
