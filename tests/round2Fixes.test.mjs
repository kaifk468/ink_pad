import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')

test('options panel height leaves room for the zoom controls and scrolls with a shadow', async () => {
  const css = await read('app/desktop-panels.css')
  assert.match(css, /max-height: calc\(100vh - 84px - 76px\)/)
  assert.match(css, /max-width: 1157px\) \{[^}]*calc\(100vh - 84px - 130px\)/)
  assert.match(css, /no-repeat local/)
  assert.doesNotMatch(css, /100vh - 250px/)
})

test('context menu shows an accent focus ring (desktop)', async () => {
  const css = await read('app/desktop-panels.css')
  const polish = await read('app/desktopPolish.css')
  assert.match(css, /\.app-shell\[data-input-mode="desktop"\] \.canvas-context-menu button:focus-visible \{ outline: 2px solid var\(--ip-accent\); outline-offset: -2px; \}/)
  assert.doesNotMatch(polish, /canvas-context-menu button:focus-visible/)
})

test('dock tooltips for Rectangle, Diamond and Ellipse carry a Shift hint', async () => {
  const dock = await read('app/ToolDock.tsx')
  const tip = await read('app/DockTip.tsx')
  const css = await read('app/desktop-dock.css')
  assert.match(dock, /kind: 'rectangle', hint: 'Shift: square'/)
  assert.match(dock, /kind: 'diamond', hint: 'Shift: square'/)
  assert.match(dock, /kind: 'ellipse', hint: 'Shift: circle'/)
  assert.match(dock, /hint=\{hint\}/)
  assert.match(tip, /dock-tip-hint/)
  assert.match(css, /\.dock-tip-hint \{[^}]*font-size: 11px/)
})

test('desktop status pill stays in focus mode (Export hides); the menu sheet no longer repeats the status', async () => {
  const cluster = await read('app/DesktopStatusCluster.tsx')
  const sheet = await read('app/DesktopMenuSheet.tsx')
  assert.match(cluster, /!hideExport && <button/)
  assert.doesNotMatch(sheet, /ms-status/)
})

test('a failed PNG export on desktop is a toast only (no file notice)', async () => {
  const hook = await read('app/useDocuments.ts')
  assert.match(hook, /if \(!quiet\) setFileNotice\(message\)/)
})
