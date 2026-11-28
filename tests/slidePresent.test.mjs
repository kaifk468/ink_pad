import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const app = await readAppSource()
const shortcuts = await loadModule('desktopShortcuts.ts')

test('wiring: slide keys have their own listener, ahead of the shortcut one, only in present mode, never in a field, editor, dialog or gesture', () => {
  const start = app.indexOf('slideKeyRef.current = (event) => {')
  assert.ok(start > 0)
  const block = app.slice(start, app.indexOf("window.addEventListener('keydown', onSlideKey)", start))
  assert.match(block, /if \(!presentModeRef\.current\) return/)
  assert.match(block, /slideKeyTarget\(event, pageIndexRef\.current, pagesRef\.current\.length\)/)
  assert.match(block, /isTypingTarget\(tag, Boolean\(target\?\.isContentEditable\)\)/)
  assert.match(block, /event\.key === ' ' && \['BUTTON', 'A', 'SELECT'\]\.includes\(tag\)/)
  assert.match(block, /if \(canvasCommandBlocked\(\)\) return/)
  assert.match(block, /event\.preventDefault\(\)\n\s+event\.stopImmediatePropagation\(\)\n\s+showSlide\(slideTarget\)/)
  assert.ok(app.indexOf("window.addEventListener('keydown', onSlideKey)") < app.indexOf("const handled = keyActionsRef.current(command)"), 'registered first')
})

test('wiring: a page change goes through goToPage, then the page is fitted; zoom lock is respected', () => {
  const show = app.slice(app.indexOf('const showSlide = '), app.indexOf('const presentPages = '))
  assert.match(show, /goToPage\(target\)/)
  assert.match(show, /fitSlideView\(\)/)
  const fit = app.slice(app.indexOf('const fitSlideView = '), app.indexOf('const showSlide = '))
  assert.match(fit, /navigationSettingsRef\.current\.zoomLocked\) return/)
  assert.match(fit, /if \(!bounds\) \{ fitCanvasView\(\); return \}/)
  assert.match(fit, /fitViewportToBounds\(bounds, rect\.width, rect\.height, SLIDE_PADDING, MIN_ZOOM, SLIDE_MAX_ZOOM\)/)
  assert.doesNotMatch(show + fit, /saveHistory|scheduleAutosave|stashCurrentPage|showPageSlot/)
})

test('wiring: arrow nudges are ignored in present mode', () => {
  assert.match(app, /if \(presentModeRef\.current && command\.kind === 'nudge'\) return true/)
})

test('wiring: palette entry "Present pages" starts present mode and fits the page', () => {
  assert.match(app, /\{ id: 'view:presentPages', label: 'Present pages[^']*', group: 'View'[^}]*run: presentPages \}/)
  const present = app.slice(app.indexOf('const presentPages = '), app.indexOf('const togglePresentMode = '))
  assert.match(present, /if \(!presentModeRef\.current\) togglePresentMode\(\)/)
  assert.match(present, /fitSlideView\(\)/)
})

test('wiring: the control shows only presenting with several pages, buttons step through showSlide; the pill stays', () => {
  assert.match(app, /\{showSlideControl\(presentMode, pageCount\) && \(\s*<div className="slide-nav" role="group" aria-label="Slides">/)
  assert.match(app, /aria-label="Previous page"[^>]*disabled=\{!slideStepEnabled\(pageIndex, pageCount\)\.previous\} onClick=\{\(\) => showSlide\(pageIndexRef\.current - 1\)\}/)
  assert.match(app, /aria-label="Next page"[^>]*disabled=\{!slideStepEnabled\(pageIndex, pageCount\)\.next\} onClick=\{\(\) => showSlide\(pageIndexRef\.current \+ 1\)\}/)
  assert.match(app, /\{slideLabel\(pageIndex, pageCount\)\}/)
  assert.match(app, /\{presentMode && <button className="show-toolbars-pill"/)
})

test('wiring: no swipe or pointer handling was added for slides', () => {
  const nav = app.slice(app.indexOf('const fitSlideView = '), app.indexOf('const togglePresentMode = '))
  assert.doesNotMatch(nav, /pointer|touch|swipe/i)
})

test('css: the control is bottom centre, semi-transparent, with 44px touch targets', async () => {
  const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  assert.match(css, /\.slide-nav \{[^}]*left: 50%[^}]*bottom: max\(12px, env\(safe-area-inset-bottom\)\)[^}]*opacity: \.6/)
  assert.match(css, /\.slide-nav button \{ width: 44px; height: 44px;/)
})

test('help: the present-mode page keys are documented', () => {
  const rows = shortcuts.DESKTOP_SHORTCUTS.filter((row) => /toolbars are hidden/.test(row.label))
  const keys = rows.map((row) => row.keys).join(' | ')
  for (const part of ['Right arrow', 'PageDown', 'Space', 'Left arrow', 'PageUp', 'Home', 'End']) assert.ok(keys.includes(part), part)
  assert.ok(rows.some((row) => /do not nudge/.test(row.label)))
})
