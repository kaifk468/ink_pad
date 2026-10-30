import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const pageTemplateSource = await readFile(new URL('../src/pageTemplates.ts', import.meta.url), 'utf8')
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const testableSource = pageTemplateSource.replace(
  "import { SHEET_BOUNDS, SHEET_HEIGHT, SHEET_WIDTH } from './viewport'",
  'const SHEET_BOUNDS = { x: 0, y: 0 }; const SHEET_WIDTH = 2500; const SHEET_HEIGHT = 1500',
)
const output = ts.transpileModule(testableSource, {
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

test('template selector redraws the sheet background and shares it with both overviews', () => {
  assert.match(appSource, /aria-label="Page template"/)
  assert.match(appSource, /drawPageTemplate\(ctx, pageTemplate\)/)
  assert.equal((appSource.match(/drawPageTemplate\(ctx, pageTemplate\)/g) ?? []).length, 1)
  assert.equal((appSource.match(/drawPageTemplateOverview\(ctx, pageTemplate,/g) ?? []).length, 2)
  assert.match(appSource, /savePageTemplate\(pageTemplate\)/)
})

test('dotted marks are opaque and remain legible in overview scale', () => {
  assert.match(pageTemplateSource, /tileContext\.fillStyle = tileContext\.strokeStyle/)
  assert.match(pageTemplateSource, /export const PAGE_TEMPLATE_DOT_COLOR = '#566477'/)
  assert.match(pageTemplateSource, /tileContext\.arc\(center, center, radius/)
  assert.match(pageTemplateSource, /export function drawPageTemplateOverview/)
  assert.match(pageTemplateSource, /const radius = variant === 'overview' \? PAGE_TEMPLATE_OVERVIEW_DOT_RADIUS : 1\.65/)
  assert.equal((pageTemplateSource.match(/ctx\.globalAlpha = 1/g) ?? []).length, 2)
})
