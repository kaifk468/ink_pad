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
  assert.match(app, /command\.kind === 'saveNow'\) \{ if \(activeStrokeRef\.current === null && activePointerRef\.current === null\) saveNowWithToast\(\); return true \}/)
  assert.match(app, /saveToastText\(status/)
  assert.match(app, /flashKey=\{statusFlash\}/)
  const docs = await read('../src/app/useDocuments.ts')
  assert.match(docs, /const saveNow = async[\s\S]*?await persistNow\(\)/)
  const cluster = await read('../src/app/DesktopStatusCluster.tsx')
  assert.match(cluster, /flashKey/)
  const css = await read('../src/app/desktop-topbar.css')
  assert.match(css, /\.top-status-flash \{/)
  assert.match(css, /prefers-reduced-motion[\s\S]*\.top-status-flash \{ animation: none; \}/)
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
  assert.match(css, /\.home-desktop \.home-card:not\(\.dragging\):hover[\s\S]*translateY\(-2px\)/)
  assert.match(css, /\.home-desktop \.home-card-preview \{[^}]*var\(--ip-bg, #f7f6f2\)[^}]*border-bottom: 1px solid/)
  assert.match(css, /\.home-desktop \.home-card-title \{[^}]*600 14px/)
  assert.match(css, /\.home-desktop \.home-recent h3 \{[^}]*11px[^}]*uppercase/)
  assert.match(css, /prefers-reduced-motion[\s\S]*\.home-desktop \.home-card:hover[^}]*transform: none/)
})

test('library pictures embed Excalifont so labels are not drawn in the browser serif fallback', async () => {
  const docs = await read('../src/app/useDocuments.ts')
  assert.match(docs, /const getThumbnailExport = async[\s\S]*loadExcalifontCss\(\)/)
  assert.match(docs, /getInputMode\?\.\(\) !== 'desktop'\) return getImageExport\(which\)/)
  assert.doesNotMatch(docs, /const probe = getImageExport\(which\)/)
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
  assert.match(css, /\.ms-desc \{[^}]*white-space: nowrap[^}]*text-overflow: ellipsis/)
  assert.doesNotMatch(css, /\.ms-desc \{[^}]*line-clamp/)
})

test('a held Ctrl+S only cancels the browser dialog; the save runs on the first press', () => {
  assert.deepEqual(input.keyCommand(key({ ctrlKey: true, repeat: true }), 'desktop'), { kind: 'saveNowRepeat' })
  assert.equal(input.alwaysPreventsDefault({ kind: 'saveNowRepeat' }, 'desktop'), true)
  assert.equal(input.alwaysPreventsDefault({ kind: 'saveNowRepeat' }, 'tablet'), false)
  assert.equal(input.keyCommand(key({ ctrlKey: true, repeat: true }), 'tablet'), null)
})

test('the Ctrl+S toast is honest about the status', () => {
  assert.equal(input.saveToastText('saved', 'Saved in your device folder'), 'Saved')
  assert.equal(input.saveToastText('idle', 'x'), 'Nothing to save yet')
  assert.equal(input.saveToastText('saving', 'Saving...'), 'Saving...')
  assert.equal(input.saveToastText('error', 'Could not save'), 'Could not save')
  assert.equal(input.saveToastText('locked', 'Locked'), 'Locked')
})

test('Ctrl+S works in text fields and under dialogs', async () => {
  const app = await readAppSource()
  assert.match(app, /isTypingTarget[\s\S]{0,200}command\.kind === 'saveNow'\) \{ event\.preventDefault\(\); keyActionsRef\.current\(command\); return \}/)
  const guard = app.indexOf("command.kind === 'saveNow') { if (activeStrokeRef")
  assert.ok(guard > 0 && guard < app.indexOf('if (editingBlocksCanvas()) return false'))
  assert.match(app, /command\.kind === 'saveNowRepeat'\) return true/)
})

test('thumbnails: one build, font embedded on desktop only', async () => {
  const docs = await read('../src/app/useDocuments.ts')
  const body = docs.slice(docs.indexOf('const getThumbnailExport'), docs.indexOf('const renderPageThumbnail'))
  assert.equal((body.match(/getImageExport\(/g) ?? []).length, 3) // tablet, no-font, font: each path builds once
  assert.match(body, /usesExcalifont\(/)
  const app = await readAppSource()
  assert.match(app, /getInputMode: \(\) => inputModeRef\.current/)
})

test('palette: labelled groups, Map index, scroll to top on wrap', async () => {
  const src = await read('../src/app/CommandPalette.tsx')
  assert.match(src, /role=\{groups \? 'group'/)
  assert.match(src, /aria-labelledby=\{groups \? `command-palette-group-/)
  assert.doesNotMatch(src, /results\.indexOf/)
  assert.match(src, /new Map\(results\.map/)
  assert.match(src, /current === 0 && listRef\.current\) listRef\.current\.scrollTop = 0/)
})

test('desktop css: no paint transitions, selectable notices and editors, card tokens', async () => {
  const panels = await read('../src/app/desktop-panels.css')
  assert.doesNotMatch(panels, /export-tile \{[^}]*transition/)
  assert.doesNotMatch(panels, /export-switch \{[^}]*transition/)
  const css = await read('../src/app/desktopPolish.css')
  assert.doesNotMatch(css, /transition: [^;]*box-shadow/)
  assert.match(css, /\[contenteditable\], \.file-panel-notice, \[role="alert"\]/)
  assert.match(css, /\.home-card \{[^}]*var\(--ip-surface, #fff\)/)
  const file = await read('../src/FilePanel.tsx')
  assert.match(file, /aria-labelledby="export-dialog-title"/)
  assert.match(file, /if \(props\.desktop\) firstTileRef\.current\?\.focus\(\)/)
})

test('Ctrl+S never saves in the middle of a stroke or pointer gesture', async () => {
  const src = await readAppSource()
  assert.match(src, /command\.kind === 'saveNow'\) \{ if \(activeStrokeRef\.current === null && activePointerRef\.current === null\) saveNowWithToast\(\)/)
})
