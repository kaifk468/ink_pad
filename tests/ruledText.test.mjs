import assert from 'node:assert/strict'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { ruledBaselineY, isRuledCanvas, RULE_TOP_OFFSET } = await loadModule('ruledText.ts')
const { getTextBaselines } = await loadModule('textLayout.ts')
const pt = await loadModule('pageTemplates.ts')
const app = await readAppSource()

const UNITS = 32
const baselineOf = (y, size) => y + getTextBaselines('x', size)[0]
const onRule = (value) => Math.abs(((value + RULE_TOP_OFFSET) / UNITS) - Math.round((value + RULE_TOP_OFFSET) / UNITS)) < 1e-3

test('lined: the first baseline lands on the nearest ruled line, y only', () => {
  for (const size of [18, 24, 32]) {
    for (const y of [60, 75.3, 130, 401.7]) {
      const snapped = ruledBaselineY(y, size, UNITS, 'lined')
      assert.ok(onRule(baselineOf(snapped, size)), `size ${size} y ${y}`)
      assert.ok(Math.abs(baselineOf(snapped, size) - baselineOf(y, size)) <= UNITS / 2 + 1e-6, 'nearest line')
    }
  }
})

test('already on a line stays (within rounding); spacing units are respected', () => {
  const size = 24
  const y = 5 * UNITS - RULE_TOP_OFFSET - getTextBaselines('x', size)[0]
  assert.ok(Math.abs(ruledBaselineY(y, size, UNITS, 'lined') - y) < 0.01)
  const wide = ruledBaselineY(200, size, 40, 'lined')
  assert.ok(Math.abs(((baselineOf(wide, size) + RULE_TOP_OFFSET) / 40) % 1) < 1e-3 || Math.abs(((baselineOf(wide, size) + RULE_TOP_OFFSET) / 40) % 1 - 1) < 1e-3)
})

test('notebook snaps to its header line when that is nearest; cornell to header and summary lines', () => {
  const size = 24
  const offset = getTextBaselines('x', size)[0]
  assert.ok(Math.abs(baselineOf(ruledBaselineY(96 - offset + 3, size, UNITS, 'notebook'), size) - pt.NOTEBOOK_HEADER_Y) < 0.01)
  assert.ok(Math.abs(baselineOf(ruledBaselineY(pt.CORNELL_HEADER_Y - offset + 0.5, size, UNITS, 'cornell'), size) - pt.CORNELL_HEADER_Y) < 0.01)
  assert.ok(Math.abs(baselineOf(ruledBaselineY(pt.CORNELL_SUMMARY_Y - offset + 4, size, UNITS, 'cornell'), size) - pt.CORNELL_SUMMARY_Y) < 0.01)
  // lined has no header line
  assert.ok(onRule(baselineOf(ruledBaselineY(96 - offset + 1, size, UNITS, 'lined'), size)))
})

test('other canvases and bad input are unchanged', () => {
  for (const type of ['blank', 'dotted', 'grid', 'isometric', 'lanes']) {
    assert.equal(ruledBaselineY(123.4, 24, UNITS, type), 123.4)
    assert.equal(isRuledCanvas(type), false)
  }
  assert.equal(ruledBaselineY(NaN, 24, UNITS, 'lined'), NaN)
  assert.equal(ruledBaselineY(50, 24, 0, 'lined'), 50)
})

test('a label near the sheet top never starts above the sheet', () => {
  assert.ok(ruledBaselineY(0, 24, UNITS, 'lined') >= 0)
  assert.ok(ruledBaselineY(-10, 40, UNITS, 'lined') >= 0)
})

test('wiring: only the Text tool tap passes the event (so Alt can skip); editing and double-click do not', () => {
  assert.match(app, /ruledBaselineY\(point\.y - textSize \* 0\.65, textSize, pageSpacingUnits\(pageSpacingRef\.current\), effectiveCanvasType\(pageTemplateRef\.current, pageCanvasRef\.current\)\)/)
  assert.match(app, /event && !snappingSuspended\(event, inputModeRef\.current\)/)
  assert.match(app, /else openNewTextEditorAt\(tap\.point, event\)/)
  assert.match(app, /openNewTextEditorAt\(point\)\n/)
})
