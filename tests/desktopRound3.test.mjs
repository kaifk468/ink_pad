import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const input = await loadModule('desktopInput.ts')
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const key = (extra) => ({ key: 's', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, repeat: false, ...extra })

test('Ctrl/Cmd+S is saveNow on desktop only; Shift or Alt does not count', () => {
  assert.deepEqual(input.keyCommand(key({ ctrlKey: true }), 'desktop'), { kind: 'saveNow' })
  assert.deepEqual(input.keyCommand(key({ metaKey: true }), 'desktop'), { kind: 'saveNow' })
  assert.deepEqual(input.keyCommand(key({ key: 'S', ctrlKey: true }), 'desktop'), { kind: 'saveNow' })
  assert.equal(input.keyCommand(key({ ctrlKey: true }), 'tablet'), null)
  assert.notDeepEqual(input.keyCommand(key({ key: 'S', ctrlKey: true, shiftKey: true }), 'desktop'), { kind: 'saveNow' })
  assert.equal(input.keyCommand(key({ ctrlKey: true, altKey: true }), 'desktop'), null)
  assert.notEqual(input.keyCommand(key(), 'desktop')?.kind, 'saveNow')
})

test('saveNow always cancels the browser Save page dialog, and has a shortcut row that maps to it', async () => {
  assert.equal(input.alwaysPreventsDefault({ kind: 'saveNow' }, 'desktop'), true)
  assert.equal(input.alwaysPreventsDefault({ kind: 'saveNow' }, 'tablet'), false)
  const shortcuts = await loadModule('desktopShortcuts.ts')
  const row = shortcuts.DESKTOP_SHORTCUTS.find((entry) => entry.label === 'Save now')
  assert.equal(row.keys, 'Ctrl+S')
  assert.deepEqual(input.keyCommand(shortcuts.shortcutKeyInput(row), 'desktop'), { kind: 'saveNow' })
})

test('App wires saveNow to the document save path, a toast and the status flash', async () => {
  const app = await readAppSource()
  assert.match(app, /case 'saveNow': saveNowWithToast\(\)/)
  assert.match(app, /showToast\('Saved'\)/)
  assert.match(app, /flashKey=\{statusFlash\}/)
  const docs = await read('../src/app/useDocuments.ts')
  assert.match(docs, /const saveNow = async[\s\S]*?await persistNow\(\)/)
  const cluster = await read('../src/app/DesktopStatusCluster.tsx')
  assert.match(cluster, /flashKey/)
  const css = await read('../src/app/desktop-topbar.css')
  assert.match(css, /\.top-status-pill\.flash::before/)
  assert.match(css, /prefers-reduced-motion[\s\S]*\.top-status-pill\.flash::before \{ animation: none; \}/)
})

test('the Keep tool tip shows once, on desktop, with Keep tool off', () => {
  assert.equal(input.shouldShowKeepToolTip(false, false, 'desktop'), true)
  assert.equal(input.shouldShowKeepToolTip(true, false, 'desktop'), false)
  assert.equal(input.shouldShowKeepToolTip(false, true, 'desktop'), false)
  assert.equal(input.shouldShowKeepToolTip(false, false, 'tablet'), false)
  assert.equal(input.KEEP_TOOL_TIP, 'Tip: press Q (Keep tool) to draw several in a row')
})

test('the tip is session memory only: a ref in App, no new storage key', async () => {
  const app = await readAppSource()
  assert.match(app, /keepToolTipShownRef = useRef\(false\)/)
  assert.ok((app.match(/maybeShowKeepToolTip\(\)/g) ?? []).length >= 2)
  const source = await read('../src/desktopInput.ts')
  assert.doesNotMatch(source, /inkpad\.keepToolTip|inkpad\.toolTip/)
})

test('library cards: desktop-scoped polish with reduced-motion fallback', async () => {
  const css = await read('../src/app/desktopPolish.css')
  assert.match(css, /\.home-desktop \.home-card \{[^}]*border-radius: 14px/)
  assert.match(css, /\.home-desktop \.home-card:hover[\s\S]*translateY\(-2px\)/)
  assert.match(css, /\.home-desktop \.home-card-preview \{[^}]*#f7f6f2[^}]*border-bottom: 1px solid/)
  assert.match(css, /\.home-desktop \.home-card-title \{[^}]*600 14px/)
  assert.match(css, /\.home-desktop \.home-recent h3 \{[^}]*11px[^}]*uppercase/)
  assert.match(css, /prefers-reduced-motion[\s\S]*\.home-desktop \.home-card:hover[^}]*transform: none/)
})

test('library pictures embed Excalifont so labels are not drawn in the browser serif fallback', async () => {
  const docs = await read('../src/app/useDocuments.ts')
  assert.match(docs, /const getThumbnailExport = async[\s\S]*loadExcalifontCss\(\)/)
  assert.match(docs, /await getThumbnailExport\('first'\)/)
  assert.match(docs, /await getThumbnailExport\(index\)/)
})

test('round 3 walk fixes: desktop says Click to rename, chrome text unselectable, menu descriptions wrap', async () => {
  const { readFile } = await import('node:fs/promises')
  const bar = await readFile(new URL('../src/app/TopLeftBar.tsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/app/desktopPolish.css', import.meta.url), 'utf8')
  const assert = (await import('node:assert/strict')).default
  assert.match(bar, /desktop \? 'Click to rename this diagram' : 'Tap to rename this diagram'/)
  assert.match(css, /\.tool-dock, \.context-panel[^}]*user-select: none/)
  assert.match(css, /\.ms-desc \{[^}]*-webkit-line-clamp: 2/)
})
