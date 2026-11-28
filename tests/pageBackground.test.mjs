import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'
import { readAppSource } from './helpers/appSource.mjs'

const source = await readFile(new URL('../src/pageBackground.ts', import.meta.url), 'utf8')
const appSource = await readAppSource()
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
const background = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
const mockStorage = () => {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('sheet color offers light presets and defaults or falls back to white', () => {
  assert.deepEqual(background.PAGE_BACKGROUND_COLORS, {
    white: '#ffffff',
    warm: '#fffaf0',
    blue: '#f2f7ff',
    yellow: '#fff9df',
    green: '#f0f8f1',
  })
  const storage = mockStorage()
  assert.equal(background.loadPageBackground(storage), 'white')
  storage.setItem('inkpad.pageBackground', 'invalid')
  assert.equal(background.loadPageBackground(storage), 'white')
})

test('sheet background selection saves and restores independently of template selection', async () => {
  const storage = mockStorage()
  background.savePageBackground('blue', storage)
  assert.equal(background.loadPageBackground(storage), 'blue')
  const templateSource = await readFile(new URL('../src/pageTemplates.ts', import.meta.url), 'utf8')
  assert.match(source, /inkpad\.pageBackground/)
  assert.match(templateSource, /inkpad\.pageTemplate/)
  assert.notEqual('inkpad.pageBackground', 'inkpad.pageTemplate')
})

test('sheet color is rendered on the page in all views while the workspace background stays gray', () => {
  assert.match(appSource, /aria-label="Sheet background color"/)
  assert.match(appSource, /PAGE_COLOR_CHOICES/)
  assert.equal((appSource.match(/ctx\.fillStyle = sheetColorForBoard\(board, PAGE_BACKGROUND_COLORS\[pageBackground\]\)/g) ?? []).length, 1)
  assert.match(appSource, /sheetColorForBoard\(board, PAGE_BACKGROUND_COLORS\[pageBackground\]\),\s*viewport,/)
  assert.match(appSource, /'#e9ebf0' : palette\.desk[\s\S]*?ctx\.fillStyle = sheetColorForBoard\(board, PAGE_BACKGROUND_COLORS\[pageBackground\]\)/)
  assert.match(appSource, /savePageBackground\(pageBackground\)/)
  assert.match(appSource, /onClick=\{\(\) => props\.onPageBackground\(value\)\}/)
  assert.match(appSource, /onPageBackground=\{setPageBackground\}/)
})
