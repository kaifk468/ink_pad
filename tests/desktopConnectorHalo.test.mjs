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

test('save pill is a button that saves now (Ctrl+S path), with a live status text', async () => {
  const cluster = await read('app/DesktopStatusCluster.tsx')
  assert.match(cluster, /<button [^]*?type="button"[^]*?top-status-pill[^]*?title="Save now \(Ctrl\+S\)"[^>]*aria-label=\{`\$\{text\}\. Save now`\}[^]*?onClick=\{onSave\}/)
  assert.match(cluster, /className="top-status-text" role="status"/)
  const app = await read('App.tsx')
  assert.match(app, /<DesktopStatusCluster [^>]*onSave=\{saveNowWithToast\}/)
  const css = await read('app/desktop-topbar.css')
  assert.match(css, /\.top-status-pill:hover \{ background: var\(--ip-surface-2\)/)
  assert.match(css, /\.top-status-pill:focus-visible/)
})
