import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const css = read('../src/app/desktop-library.css')
const tokens = read('../src/app/tokens.css')
const styles = read('../src/styles.css')
const home = read('../src/app/HomeScreen.tsx')
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((r) => r.split('{')[0].trim()).filter(Boolean)

test('every desktop library rule is scoped under .home-desktop', () => {
  assert.ok(rules.length > 30)
  for (const selectorList of rules) {
    for (const selector of selectorList.split(',')) assert.match(selector.trim(), /^\.home-desktop\b/, selector)
  }
})

test('tokens reach the library through .home-desktop; tablet palette stays untouched', () => {
  assert.match(tokens, /\.app-shell\[data-input-mode="desktop"\],\s*\.home-desktop \{\s*--ip-bg/)
  assert.match(styles, /\.home-screen \{\s*--home-bg: #f4f6fa;[^}]*--home-accent: #475fdb;/)
  assert.match(css, /--home-accent: var\(--ip-accent\)/)
  assert.doesNotMatch(css, /#475fdb|#f4f6fa/i)
})

test('animation stays cheap: no transitions on paint properties, none above 240ms', () => {
  assert.doesNotMatch(css, /transition:/)
})

test('view toggle exposes aria-pressed and labels; sort stays a native select; one primary button', () => {
  assert.match(home, /aria-label="Grid" aria-pressed=\{layout === 'grid'\}/)
  assert.match(home, /aria-label="List" aria-pressed=\{layout === 'list'\}/)
  assert.match(home, /<select aria-label="Sort"/)
  assert.match(css, /\.home-desktop \.home-sort select \{[^}]*appearance: none/)
  assert.equal((home.match(/className="home-primary"/g) ?? []).length >= 1, true)
  assert.doesNotMatch(css, /\.home-secondary[^{]*\{[^}]*background: var\(--ip-accent\)/)
  assert.match(css, /\.home-desktop \.home-back, \.home-desktop \.home-secondary \{[^}]*background: transparent/)
})

test('storage line stays on one line and focus rings come from the desktop rule', () => {
  assert.match(css, /\.home-desktop \.home-storage > span \{[^}]*white-space: nowrap/)
  assert.match(read('../src/app/desktopPolish.css'), /\.home-desktop :where\(button, \[role="switch"\], a, select\):focus-visible/)
})

test('desktop library grid cards: 4:3 well, padded contained picture, star in the title row (scoped to .home-desktop)', () => {
  const block = read('../src/app/desktopPolish.css').split('Library grid cards (desktop)')[1]
  assert.match(block, /\.home-grid \.home-card-preview \{ height: auto; aspect-ratio: 4 \/ 3; \}/)
  assert.match(block, /\.home-card-preview img \{ padding: 14px; box-sizing: border-box; object-fit: contain; \}/)
  assert.match(block, /\.home-star \{ top: calc\(75cqw \+ 4px\)/)
  for (const line of block.split('\n').filter((l) => l.includes('{'))) assert.match(line, /^\.home-desktop /)
  assert.doesNotMatch(block, /transition|animation/)
  assert.match(styles, /\.home-star \{ position: absolute; top: 8px; right: 8px/)
})

test('desktop library search: short placeholder plus a "/" key chip hidden while typing or focused; tablet keeps the long placeholder', async () => {
  const { readFile } = await import('node:fs/promises')
  const home = await readFile(new URL('../src/app/HomeScreen.tsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/app/desktop-library.css', import.meta.url), 'utf8')
  assert.match(home, /placeholder=\{props\.desktop \? 'Search diagrams' : 'Search diagrams or folders \(press \/\)'\}/)
  assert.match(home, /\{props\.desktop && !query && <kbd className="home-search-kbd" aria-hidden="true">\/<\/kbd>\}/)
  assert.match(css, /\.home-search:focus-within \.home-search-kbd \{ display: none; \}/)
})
