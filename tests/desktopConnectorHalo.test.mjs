import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')

test('selected connector: desktop uses the arrowhead-free halo, tablet keeps the old thick draw', async () => {
  const app = await read('App.tsx')
  assert.match(app, /if \(inputModeRef\.current === 'desktop'\) drawConnectorHalo\(ctx, item, '#5574ed', item\.strokeWidth \+ 6\)\s*\n\s*else drawConnector\(ctx, item, '#5574ed', item\.strokeWidth \+ 8\)/)
})

test('drawConnectorHalo strokes only the plain path at low alpha', async () => {
  const r = await read('app/canvasRenderer.ts')
  const body = r.match(/export function drawConnectorHalo[^]*?\n}\n/)[0]
  assert.match(body, /globalAlpha = 0\.28/)
  assert.match(body, /setLineDash\(\[\]\)/)
  assert.match(body, /tracePath\(ctx, connectorPoints\(connector\), false\)/)
  assert.doesNotMatch(body, /Symbol|Geometry/)
})
