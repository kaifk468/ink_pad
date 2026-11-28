import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { readAppSource } from './helpers/appSource.mjs'

const renderer = readFileSync(new URL('../src/app/canvasRenderer.ts', import.meta.url), 'utf8')
const app = await readAppSource()

test('minimap fades the same keys as the canvas, and only when focus is on', () => {
  assert.match(renderer, /export function drawMinimapItems\(ctx[^)]*focusFaded: ReadonlySet<string> \| null = null(, palette\?: BoardPalette)?\)/)
  assert.match(renderer, /const fade = focusFaded !== null && focusFaded\.has\(canvasItemKey\(item\)\)\n\s+if \(fade\) ctx\.globalAlpha = FOCUS_FADE_ALPHA/)
  assert.match(renderer, /if \(fade\) ctx\.globalAlpha = 1/)
  assert.match(app, /drawMinimapItemsToCanvas\(ctx, [^\n]*geometry, focusRef\.current, palette\)/)
})

test('starting and leaving focus redraws the minimap ink at once', () => {
  assert.match(app, /setFocusActive\(true\)[\s\S]{0,120}renderAll\(\)\n\s+renderNavigator\(true\)/)
  assert.match(app, /setFocusActive\(false\)\n\s+historyCacheRef\.current = null\n\s+renderAll\(\)\n\s+renderNavigator\(true\)/)
})
