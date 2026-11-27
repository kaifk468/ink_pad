import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const { showLibraryWelcome } = await loadModule('libraryView.ts')
const app = await readAppSource()
const css = await readFile(new URL('../src/app/desktopPolish.css', import.meta.url), 'utf8')
const main = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8')

test('library welcome shows only for an empty top-level, unfiltered Library', () => {
  assert.equal(showLibraryWelcome({ shown: 0, inFolder: false, searching: false, starredView: false }), true)
  assert.equal(showLibraryWelcome({ shown: 1, inFolder: false, searching: false, starredView: false }), false)
  assert.equal(showLibraryWelcome({ shown: 0, inFolder: true, searching: false, starredView: false }), false)
  assert.equal(showLibraryWelcome({ shown: 0, inFolder: false, searching: true, starredView: false }), false)
  assert.equal(showLibraryWelcome({ shown: 0, inFolder: false, searching: false, starredView: true }), false)
})

test('desktop polish wiring: attribute, stylesheet, desktop-only scoping, tablet hint text kept', () => {
  assert.match(app, /data-input-mode=\{inputMode\}>/)
  assert.match(main, /import '\.\/app\/desktopPolish\.css'/)
  assert.match(app, /home-screen\$\{props\.desktop \? ' home-desktop' : ''\}/)
  assert.match(app, /Start drawing/)
  assert.match(app, /Write or draw with the pen/)
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const chunk of bare.split('}')) {
    const selector = chunk.split('{')[0].trim()
    if (!selector || selector.startsWith('@') || chunk.indexOf('{') < 0) continue
    for (const piece of selector.replace(/:where\([^)]*\)/g, ':where()').split(',')) assert.match(piece.trim(), /data-input-mode="desktop"|\.home-desktop/, piece)
  }
})

function assertScoped(source, label) {
  const bare = source.replace(/\/\*[\s\S]*?\*\//g, '')
  let checked = 0
  const walk = (text) => {
    let i = 0
    while (i < text.length) {
      const open = text.indexOf('{', i)
      if (open < 0) break
      const selector = text.slice(i, open).trim()
      let depth = 1, j = open + 1
      while (j < text.length && depth) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++ }
      const body = text.slice(open + 1, j - 1)
      if (selector.startsWith('@media') || selector.startsWith('@supports')) walk(body)
      else if (!selector.startsWith('@')) {
        for (const piece of selector.replace(/:where\([^)]*\)/g, ':where()').split(',')) { checked++; assert.match(piece.trim(), /data-input-mode="desktop"|\.home-desktop/, `${label}: ${piece.trim()}`) }
      }
      i = j
    }
    return checked
  }
  assert.ok(walk(bare) > 0, label)
}

test('tokens.css is desktop-scoped and has no half-dark prefers-color-scheme block', async () => {
  const tokens = await readFile(new URL('../src/app/tokens.css', import.meta.url), 'utf8')
  assertScoped(tokens, 'tokens.css')
  assert.doesNotMatch(tokens.replace(/\/\*[\s\S]*?\*\//g, ''), /prefers-color-scheme/)
})

test('desktop sheet rules appended to styles.css are desktop-scoped', async () => {
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')
  const start = styles.indexOf('/* Desktop navigation sheet')
  assert.ok(start > 0)
  // The @keyframes block holds only from/to steps, so it is skipped.
  assertScoped(styles.slice(start).replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, ''), 'styles.css sheet block')
})

test('desktop top bar: undo/redo live in TopLeftBar, tablet keeps HistoryBar, css is desktop-scoped', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const bar = await readFile(new URL('../src/app/TopLeftBar.tsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/app/desktop-topbar.css', import.meta.url), 'utf8')
  assert.match(app, /history=\{inputMode === 'desktop' \? \{ canUndo, canRedo/)
  assert.match(app, /\{\(inputMode !== 'desktop' \|\| zoomLockActive\) && <HistoryBar/)
  assert.match(bar, /desktop && props\.history/)
  assert.match(bar, /title="Undo \(Ctrl\+Z\)"/)
  assertScoped(css, 'desktop-topbar.css')
})
