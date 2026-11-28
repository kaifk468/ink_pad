import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const chalk = await loadModule('chalkTexture.ts')

test('the texture applies to the chalkboard only', () => {
  assert.equal(chalk.chalkTextureApplies('chalk'), true)
  for (const board of [undefined, 'dark', '', 'future-board']) assert.equal(chalk.chalkTextureApplies(board), false)
})

test('the grain tile is deterministic, subtle and not a solid fill', () => {
  const a = chalk.chalkGrainPixels()
  const b = chalk.chalkGrainPixels()
  assert.equal(a.length, chalk.CHALK_TILE_SIZE * chalk.CHALK_TILE_SIZE * 4)
  assert.deepEqual(Array.from(a), Array.from(b))
  assert.notDeepEqual(Array.from(a), Array.from(chalk.chalkGrainPixels(chalk.CHALK_TILE_SIZE, 7)))
  let covered = 0
  let maxAlpha = 0
  for (let i = 3; i < a.length; i += 4) { if (a[i] > 0) covered++; maxAlpha = Math.max(maxAlpha, a[i]) }
  const coverage = covered / (a.length / 4)
  assert.ok(coverage > 0.2 && coverage < 0.6, `coverage ${coverage}`)
  assert.ok(maxAlpha <= 100, `max alpha ${maxAlpha}`)
})

test('without a canvas the cached tile is null (no throw)', () => {
  assert.equal(chalk.chalkGrainCssUrl(), null)
})

test('wiring: the grain is a sheet-layer pseudo-element, set only for chalk, and exports stay flat', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /className="sheet-layer"[\s\S]{0,200}data-board=\{chalkTextureApplies\(board\) \? 'chalk' : undefined\}/)
  assert.match(app, /'--chalk-grain'/)
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
  const rule = css.match(/\.sheet-layer\[data-board='chalk'\]::before\s*\{([^}]*)\}/)
  assert.ok(rule, 'chalk grain rule exists')
  assert.match(rule[1], /pointer-events:\s*none/)
  assert.match(rule[1], /var\(--chalk-grain\)/)
  assert.doesNotMatch(css, /\.drawing-canvas[^{]*chalk/)
  for (const file of ['sheetExport.ts', 'pageTemplates.ts', 'performanceBenchmark.ts', 'notebookExport.ts', 'pdfExport.ts']) {
    assert.doesNotMatch(readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8'), /chalkTexture|chalk-grain|chalkGrain/, file)
  }
})

test('wiring: the grain is not touched by renderAll or pointer handlers', async () => {
  const source = await readAppSource()
  assert.equal(source.match(/chalkGrainCssUrl\(\)/g)?.length, 1)
})
