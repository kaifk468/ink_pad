import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const chrome = await loadModule('app/desktopChrome.ts')
const read = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')

test('desktop status: empty never-saved page reads Autosave on with a neutral tone', () => {
  assert.equal(chrome.desktopStatusText('idle', 'Not saved yet', false, true), 'Autosave on')
  assert.equal(chrome.desktopStatusTone('idle', false), 'idle')
})

test('desktop status: content waiting for autosave reads Saving soon (never Saved)', () => {
  assert.equal(chrome.desktopStatusText('idle', 'Not saved yet', true, true, true), 'Saving soon')
  assert.equal(chrome.desktopStatusText('idle', 'Not saved yet', true, true, false), 'Not saved yet', 'no timer pending: nothing is about to be saved')
  assert.equal(chrome.desktopStatusText('idle', 'Not saved yet', false, true, true), 'Autosave on')
  assert.equal(chrome.desktopStatusTone('idle', true), 'pending')
})

test('desktop status: saving, saved, error and locked keep their wording and tones', () => {
  for (const [status, base] of [['saving', 'Saving…'], ['saved', 'Saved in this browser'], ['error', 'Could not save — export a copy'], ['locked', 'Storage locked — not saving']]) {
    assert.equal(chrome.desktopStatusText(status, base, false, true), base)
    assert.equal(chrome.desktopStatusText(status, base, true, true), base)
  }
  assert.equal(chrome.desktopStatusTone('saved', true), 'ok')
  assert.equal(chrome.desktopStatusTone('error', false), 'bad')
  assert.equal(chrome.desktopStatusTone('locked', true), 'bad')
  assert.equal(chrome.desktopStatusTone('saving', false), 'pending')
})

test('tablet status wording is unchanged', () => {
  assert.equal(chrome.desktopStatusText('idle', 'Not saved yet', false, false), 'Not saved yet')
  assert.equal(chrome.desktopStatusText('idle', 'Not saved yet', true, false), 'Not saved yet')
})

test('App passes desktop wording only to the desktop pill; the tablet navigator keeps statusLabel', async () => {
  const app = await read('App.tsx')
  assert.match(app, /<DesktopStatusCluster status=\{saveStatus\} hasContent=\{hasInk\} text=\{desktopStatusText\(/)
  assert.match(app, /statusText=\{statusLabel\(saveStatus, storage\.kind\)\}/)
})

test('page chip: "Page 1 of 3" aria on desktop, tablet label unchanged', async () => {
  assert.equal(chrome.desktopPageAria(0, 3), 'Page 1 of 3')
  assert.equal(chrome.desktopPageAria(1, 1, 'Intro'), 'Page 2 of 1 · Intro')
  const tsx = await read('app/PageControls.tsx')
  assert.match(tsx, /page-indicator-inline/)
  assert.match(tsx, /aria-label=\{`Page \$\{pageLabel\(index, count, name\)\}`\}/)
  const css = await read('app/desktop-canvas-chrome.css')
  assert.match(css, /\.page-indicator\.page-indicator-inline \{ display: flex/)
})

test('blank grey pill above the dock was the empty toast fading out: hidden on desktop only', async () => {
  assert.equal(chrome.hideEmptyToast('', true), true)
  assert.equal(chrome.hideEmptyToast(undefined, true), true)
  assert.equal(chrome.hideEmptyToast('Saved', true), false)
  assert.equal(chrome.hideEmptyToast('', false), false)
  const css = await read('app/desktop-canvas-chrome.css')
  assert.match(css, /\[data-input-mode="desktop"\] \.app-toast\.app-toast-empty \{ visibility: hidden/)
})

test('top-right connector button is the UML tools restore: desktop gets DockTip, tablet keeps its title', async () => {
  const app = await read('App.tsx')
  assert.match(app, /inputMode === 'desktop' && <DockTip name=\{UML_RESTORE_TIP\}/)
  assert.match(app, /title=\{inputMode === 'desktop' \? undefined : 'Restore UML connector tools \(drag to move\)'\}/)
  assert.match(app, /aria-label="Restore UML connector tools"/)
  assert.equal(chrome.UML_RESTORE_TIP, 'UML connector tools')
})

test('desktop menu sheet body scrolls and shows a static scroll shadow (nothing animated)', async () => {
  const { readFile } = await import('node:fs/promises')
  const css = await readFile(new URL('../src/app/desktopPolish.css', import.meta.url), 'utf8')
  const block = css.slice(css.indexOf('.ms-body {'))
  assert.match(block, /no-repeat local/)
  assert.match(block, /no-repeat scroll/)
  assert.doesNotMatch(block.split('}')[0], /transition|animation/)
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.match(styles, /\.ms-body \{ flex: 1 1 auto; min-height: 0; overflow-y: auto/)
})
