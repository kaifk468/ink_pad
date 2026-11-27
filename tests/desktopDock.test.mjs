import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const dock = await read('../src/app/ToolDock.tsx')
const tip = await read('../src/app/DockTip.tsx')
const more = await read('../src/app/MoreTray.tsx')
const shapes = await read('../src/app/MoreShapesTray.tsx')
const css = await read('../src/app/desktop-dock.css')
const main = await read('../src/main.tsx')

test('desktop dock: tooltip spans only on desktop, no corner digit, aria-labels kept', () => {
  assert.match(tip, /className="dock-tip" aria-hidden="true"/)
  // tablet label stays a plain <span> under the icon
  assert.match(dock, /props\.desktop\s*\?\s*<DockTip name=\{name\} keys=\{\[key, num\]\} \/>\s*:\s*<span>\{name\}<\/span>/)
  assert.doesNotMatch(dock, /dock-key|badge\(/)
  for (const name of ['Pen', 'Eraser', 'Select', 'Lasso', 'Connector', 'Text']) assert.match(dock, new RegExp(`aria-label="${name}"`))
  assert.match(dock, /aria-label=\{shapeName\}/)
  assert.match(dock, /tablet|InsertTray/)
  // More / More shapes only use the tooltip when the dock asks for it
  for (const src of [more, shapes]) assert.match(src, /desktopTip \? <DockTip name="More( shapes)?" \/> : <span>More( shapes)?<\/span>/)
  assert.match(dock, /<MoreTray desktopTip /)
  assert.match(dock, /<MoreShapesTray desktopTip /)
  // tablet InsertTray / MoreTray calls do not pass desktopTip
  const tabletPart = dock.slice(dock.lastIndexOf('return (\n    <nav'))
  assert.doesNotMatch(tabletPart, /desktopTip/)
  assert.match(tabletPart, /className=\{`tool-dock\$\{props\.desktop \? ' desktop-dock' : ''\}`\}/)
})

test('desktop-dock.css is wired, desktop-scoped, icon-only 40px with tooltip delay', () => {
  assert.match(main, /import '\.\/app\/desktop-dock\.css'/)
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  let checked = 0
  const walk = (text) => {
    let i = 0
    while (i < text.length) {
      const open = text.indexOf('{', i)
      if (open < 0) break
      const selector = text.slice(i, open).trim()
      let depth = 1, j = open + 1
      while (j < text.length && depth) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++ }
      if (selector.startsWith('@media')) walk(text.slice(open + 1, j - 1))
      else for (const piece of selector.split(',')) { checked++; assert.match(piece.trim(), /^\.app-shell\[data-input-mode="desktop"\]/, piece.trim()) }
      i = j
    }
  }
  walk(bare)
  assert.ok(checked > 10)
  assert.match(css, /width: 40px; min-width: 40px; height: 40px/)
  assert.match(css, /\.dock-tip \{[^}]*pointer-events: none/)
  assert.match(css, /:hover \.dock-tip \{[^}]*transition-delay: 400ms/)
  assert.match(css, /:focus-visible \.dock-tip/)
  assert.match(css, /:active \{ transform: scale\(\.94\); \}/)
})
