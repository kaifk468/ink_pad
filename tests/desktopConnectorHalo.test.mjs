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
  assert.match(body, /globalAlpha = 0\.4/)
  assert.match(body, /setLineDash\(\[\]\)/)
  assert.match(body, /tracePath\(ctx, connectorPoints\(connector\), false\)/)
  assert.doesNotMatch(body, /Symbol|Geometry/)
})

test('save pill is a button that saves now (Ctrl+S path), with a live status text', async () => {
  const cluster = await read('app/DesktopStatusCluster.tsx')
  assert.match(cluster, /<button [^]*?type="button"[^]*?top-status-pill[^]*?title="Save now \(Ctrl\+S\)"[^>]*aria-label="Save now"[^]*?onClick=\{onSave\}/)
  // Fixed button name; visible text hidden from AT; live text is a sibling OUTSIDE the button; the button is never re-keyed (focus survives a save).
  assert.match(cluster, /className="top-status-text" aria-hidden="true"/)
  assert.match(cluster, /<\/button>\s*<span className="ip-visually-hidden" role="status" aria-live="polite">\{text\}<\/span>/)
  assert.doesNotMatch(cluster, /<button key=/)
  assert.match(cluster, /<span key=\{`flash-\$\{flashKey\}`\} className="top-status-flash" aria-hidden="true"/)
  const topbar = await read('app/desktop-topbar.css')
  assert.match(topbar, /\.top-status-pill \*[^}]*user-select: none/)
  const app = await read('App.tsx')
  assert.match(app, /<DesktopStatusCluster [^>]*onSave=\{saveNowWithToast\}/)
  const css = await read('app/desktop-topbar.css')
  assert.match(css, /\.top-status-pill:hover \{ background: var\(--ip-surface-2\)/)
  assert.match(css, /\.top-status-pill:focus-visible/)
})
