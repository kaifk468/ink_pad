import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { loadModule } from './helpers/loadModule.mjs'

const panel = await readFile(new URL('../src/app/ContextPanel.tsx', import.meta.url), 'utf8')
const css = await readFile(new URL('../src/app/desktop-panels.css', import.meta.url), 'utf8')
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const await_model_source = await readFile(new URL('../src/app/optionsPanelModel.ts', import.meta.url), 'utf8')
const model = await loadModule('app/optionsPanelModel.ts')
const fills = await loadModule('shapeFill.ts')

test('section order: colour first, then text/size, width, style rows, layer, arrange, actions, secondary last', () => {
  const order = [...model.DESKTOP_SECTION_ORDER]
  assert.equal(order[0], 'colour')
  assert.equal(order.at(-1), 'more')
  assert.ok(order.indexOf('colour') < order.indexOf('width'))
  assert.ok(order.indexOf('width') < order.indexOf('style'))
  assert.ok(order.indexOf('style') < order.indexOf('layer'))
  assert.ok(order.indexOf('layer') < order.indexOf('more'))
  assert.equal(new Set(order).size, order.length)
})

test('the rendered desktop order follows DESKTOP_SECTION_ORDER and colour includes the selection colour (fill is a style row)', () => {
  assert.match(panel, /DESKTOP_SECTION_ORDER\.filter\(\(id\) => id !== 'more'\)\.map/)
  assert.match(panel, /colour: <>\{props\.showStyle && colourEl\}\{selColorEl\}<\/>/)
  assert.match(panel, /width: <>\{props\.showStyle && widthEl\}\{selectionWidthEl\}<\/>/)
  // Every section id has a node.
  for (const id of model.DESKTOP_SECTION_ORDER) assert.match(panel, new RegExp(`\\n    ${id}: `), id)
})

test('header has a name, a swatch and a chevron button with aria-expanded and a label', () => {
  assert.match(panel, /className="options-header"/)
  assert.match(panel, /className="options-chevron"[^>]*aria-label=\{collapsed \? 'Expand options' : 'Collapse options'\}[^>]*aria-expanded=\{!collapsed\}/)
  assert.match(panel, /className="options-header-title" aria-hidden="true" onClick=\{toggleCollapsed\}/)
  assert.match(panel, /props\.contextName \?\? 'Options'/)
  assert.match(panel, /collapsed \? ' is-collapsed' : ''/)
  assert.match(panel, /\{!collapsed && <div className="options-body"/)
  assert.match(css, /\.options-header \{[^}]*height: 36px/)
  assert.match(css, /\.options-chevron:focus-visible/)
  assert.match(app, /contextName=\{inputMode === 'desktop' \? optionsContextName/)
})

test('secondary actions sit behind a closed "More actions" disclosure, not in the default flow', () => {
  assert.match(panel, /const \[moreOpen, setMoreOpen\] = useState\(false\)/)
  assert.match(panel, /className="options-more-toggle"[^>]*aria-expanded=\{moreOpen\}/)
  assert.match(panel, /<span>More actions<\/span>/)
  assert.match(panel, /moreOpen && <div className="options-more-body"[^>]*><span className="panel-label">More<\/span>\{rotationEl\}\{newShapeDefaultEl\}\{changeShapeEl\}\{boundaryToolsEl\}/)
  // Change shape / boundary tools are not part of the always-visible sections.
  const sections = panel.slice(panel.indexOf('const sectionNodes'), panel.indexOf('const hasMore'))
  assert.doesNotMatch(sections, /changeShapeEl|boundaryToolsEl|rotationEl|newShapeDefaultEl/)
})

test('every element built in ContextPanel is rendered on tablet or in a desktop section (no silently dropped controls)', () => {
  const built = [...panel.matchAll(/\n  const (\w+El) = /g)].map((m) => m[1])
  assert.ok(built.length > 20)
  const tablet = panel.slice(panel.indexOf('const tabletBody'), panel.indexOf('if (!props.desktop)'))
  const desktop = panel.slice(panel.indexOf('const sectionNodes'))
  // App passes these only on tablet (inputMode !== 'desktop'), so the desktop panel never needs them.
  const tabletOnly = new Set(['selectionToolsEl', 'movePagesEl'])
  for (const name of tabletOnly) assert.match(app, new RegExp(`${name.replace('El', '')}=\\{inputMode !== 'desktop'`), name)
  for (const name of built) {
    assert.match(tablet, new RegExp(`\\b${name}\\b`), `${name} is on tablet`)
    if (!tabletOnly.has(name)) assert.match(desktop, new RegExp(`\\b${name}\\b`), `${name} is rendered on desktop`)
  }
})

test('motion: fade + translateY(-4px) at the menu duration, only opacity/transform, no height animation', () => {
  assert.match(css, /@keyframes ip-options-in \{ from \{ opacity: 0; transform: translateY\(-4px\); \} to \{ opacity: 1; transform: none; \} \}/)
  assert.match(css, /\.options-body \{ animation: ip-options-in var\(--ip-dur-menu\)/)
  const added = css.slice(css.indexOf('/* Header row, collapse'), css.indexOf('/* Below 1158px'))
  assert.doesNotMatch(added, /transition:[^;]*(height|max-height|width|top|left)/)
  assert.doesNotMatch(added, /@keyframes[^}]*height/)
})

test('preference: round-trips, and never throws when storage is missing or blocked', () => {
  const store = new Map()
  const ok = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
  assert.equal(model.readOptionsCollapsed(ok), false)
  model.writeOptionsCollapsed(ok, true)
  assert.equal(store.get('inkpad.desktop.optionsCollapsed'), '1')
  assert.equal(model.readOptionsCollapsed(ok), true)
  model.writeOptionsCollapsed(ok, false)
  assert.equal(model.readOptionsCollapsed(ok), false)
  const blocked = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
  assert.equal(model.readOptionsCollapsed(blocked), false)
  assert.doesNotThrow(() => model.writeOptionsCollapsed(blocked, true))
  assert.equal(model.readOptionsCollapsed(null), false)
  assert.doesNotThrow(() => model.writeOptionsCollapsed(undefined, true))
  assert.equal(model.browserStorage(), null) // node has no localStorage
  const source = (modelSource) => modelSource.replace(/\/\*[\s\S]*?\*\//g, '')
  const src = source(await_model_source)
  assert.equal((src.match(/\btry \{/g) ?? []).length, 3)
})

test('header names', () => {
  const n = model.optionsContextName
  assert.equal(n({ count: 3 }), '3 objects')
  assert.equal(n({ count: 1, selectedKind: 'connector' }), 'Connector')
  assert.equal(n({ count: 1, selectedKind: 'rectangle' }), 'Shape')
  assert.equal(n({ count: 1 }), 'Object')
  assert.equal(n({ count: 0, tool: 'rectangle' }), 'Rectangle')
  assert.equal(n({ count: 0, tool: 'arrow' }), 'Arrow')
  assert.equal(n({ count: 0, eraser: true }), 'Eraser')
  assert.equal(n({ count: 0, text: true }), 'Text')
  assert.equal(n({ count: 0 }), 'Pen')
  // Open editors: "Text" for text items, "Label" for connector/shape labels, over any selection or tool.
  assert.equal(n({ count: 0, editing: 'text' }), 'Text')
  assert.equal(n({ count: 0, editing: 'label' }), 'Label')
  assert.equal(n({ count: 1, selectedKind: 'connector', editing: 'label' }), 'Label')
  assert.equal(n({ count: 1, selectedKind: 'rectangle', editing: 'text', tool: 'rectangle' }), 'Text')
  assert.equal(n({ count: 0, editing: null }), 'Pen')
})

test('tablet is unchanged: plain aside, original block order and the original tablet colour markup', () => {
  assert.match(panel, /if \(!props\.desktop\) return <aside className="context-panel" aria-label="Tool options">\{tabletBody\}<\/aside>/)
  assert.match(panel, /props\.desktop \? <ColorChoices[^\n]*: <div className="tool-group color-group" role="group" aria-label="Pen color">/)
  const body = panel.slice(panel.indexOf('const tabletBody'), panel.indexOf("if (!props.desktop) return"))
  const order = [...body.matchAll(/\{(\w+El)\}/g)].map((m) => m[1])
  assert.deepEqual(order, ['colourEl', 'widthEl', 'selectionWidthEl', 'lineStyleEl', 'arrowheadsEl', 'layerEl', 'groupEl', 'changeShapeEl', 'selectionToolsEl', 'movePagesEl', 'arrangeEl', 'flipEl', 'sameSizeEl', 'boundaryToolsEl',
    'selColorEl', 'fillEl', 'newShapeDefaultEl', 'cornersEl', 'rotationEl', 'codeEl', 'eraserEl', 'fontsEl', 'alignEl', 'connSizeEl', 'textSizeEl', 'clearEl', 'copyEl', 'deleteEl', 'relationshipEl'])
  // The desktop header and collapse state never reach the tablet branch.
  assert.ok(panel.indexOf("if (!props.desktop) return") < panel.indexOf('className="options-header"'))
  assert.match(panel, /useState\(\(\) => \(props\.desktop \? readOptionsCollapsed\(browserStorage\(\)\) : false\)\)/)
})

test('new CSS is scoped to the desktop shell', () => {
  const added = css.slice(css.indexOf('/* Header row, collapse'), css.indexOf('/* Below 1158px')).replace(/\/\*[\s\S]*?\*\//g, '')
  for (const chunk of added.split('}')) {
    const selector = chunk.split('{')[0].trim()
    if (!selector || selector.startsWith('@') || selector === 'from' || selector === 'to') continue
    for (const piece of selector.split(',')) assert.match(piece.trim(), /^\.app-shell\[data-input-mode="desktop"\]/, piece)
  }
})

test('text size row: exactly one segment is active (Fit wins over a number; otherwise the label size)', () => {
  const sizes = [10, 12, 14, 16, 18, 24, 32, 48]
  assert.equal(model.activeTextSizeSegment(sizes, 24, true), 'fit')
  assert.equal(model.activeTextSizeSegment(sizes, 24, false), 24)
  assert.equal(model.activeTextSizeSegment(sizes, 23.6, null), 24)
  assert.equal(model.activeTextSizeSegment(sizes, 21, false), null)
})

test('the header derives Text / Label from the open text editor', () => {
  assert.match(app, /editing: textEditor \? \(textEditor\.connectorId !== undefined \|\| textEditor\.centerOn \? 'label' : 'text'\) : null/)
})

test('fill More-colours swatch is idle for no fill and for every preset fill, not for a custom colour', () => {
  assert.equal(model.fillMoreColoursIdle(null), true)
  assert.equal(model.fillMoreColoursIdle('none'), true)
  for (const preset of fills.FILL_PRESETS) { assert.equal(model.fillMoreColoursIdle(preset.fill), true); assert.equal(model.fillMoreColoursIdle(preset.fill.toUpperCase()), true) }
  assert.equal(model.fillMoreColoursIdle('#123456'), false)
  assert.match(panel, /idle=\{props\.desktop && fillMoreColoursIdle\(props\.fill\.color\)\}/)
})

test('below 740px the More tray carries the Sticky note tile, shape search and the selected state; tray height uses dvh', () => {
  const more = readFileSync(new URL('../src/app/MoreTray.tsx', import.meta.url), 'utf8')
  const dockCss = readFileSync(new URL('../src/app/desktop-dock.css', import.meta.url), 'utf8')
  assert.match(more, /aria-label="Search shapes"/)
  assert.match(more, /aria-label="Sticky note"/)
  assert.match(more, /desktopTip && hldActive \? ' hld-active' : ''/)
  assert.match(readFileSync(new URL('../src/app/ToolDock.tsx', import.meta.url), 'utf8'), /<MoreTray desktopTip[^\n]*onSticky=\{props\.onSticky\}/)
  assert.match(dockCss, /max-width: 739px\) \{\s*\.app-shell\[data-input-mode="desktop"\] \.tool-dock\.desktop-dock \.tool-button\.more-button\.hld-active/)
  assert.match(dockCss, /calc\(100dvh - 140px\)/)
  assert.doesNotMatch(dockCss, /100vh/)
})

test('round 6: desktop connector section is plain language with a closed UML disclosure; tablet keeps the UML select text', () => {
  const start = panel.indexOf('const relationshipEl')
  const end = panel.indexOf('const colourEl')
  const block = panel.slice(start, end)
  const [desktop, tablet] = block.split('relationship && !props.desktop')
  assert.ok(tablet, 'tablet branch is separate')
  // desktop: overlines, plain labels, disclosure closed by default
  for (const text of ['>Line<', '>Arrowheads<', '>End<', '>Both<', 'Diagram notation (UML)', 'Plain line (association)', 'Arrow (directed association)', 'Inherits from (inheritance)', 'Implements (realization)', 'Depends on (dependency)', 'Has a (aggregation)', 'Owns (composition)', 'e.g. 1 and * for one-to-many', 'aria-label="Reverse direction"', 'Add label', 'Insert box']) assert.ok(desktop.includes(text), text)
  assert.ok(panel.includes('isUmlRelationship(relationship.type)'))
  assert.ok(panel.includes('const [umlChoice, setUmlChoice]'))
  assert.ok(desktop.includes('{umlOpen && '))
  assert.ok(desktop.includes("relationship.type === 'directed-association'"))
  assert.ok(!desktop.includes('Directed association<'))
  // tablet: original text untouched
  for (const text of ['>Association<', '>Directed association<', '>Inheritance<', 'One way', 'Both ends', 'End labels']) assert.ok(tablet.includes(text), text)
  assert.ok(!tablet.includes('Plain line'))
})

test('round 6: desktop line-style heading is short, eraser active segment uses the accent tokens, connector CSS is desktop scoped', () => {
  assert.ok(panel.includes("props.desktop ? 'Line style'"))
  assert.match(css, /\.eraser-mode-card\.selected \{ background: var\(--ip-accent-soft\); color: var\(--ip-accent\)/)
  const tail = css.slice(css.indexOf('Connector section in plain language'))
  for (const line of tail.split('\n').filter((l) => /^\.[\w-]|^\.app-shell/.test(l))) assert.ok(line.startsWith('.app-shell[data-input-mode="desktop"]'), line)
  assert.ok(!/transition/.test(tail))
})

test('connector section: UML opens by default for UML types, Reverse is disabled for two-way, Line labels fit, actions match the other buttons', () => {
  assert.equal(model.isUmlRelationship('association'), false)
  assert.equal(model.isUmlRelationship('directed-association'), false)
  for (const t of ['inheritance', 'realization', 'dependency', 'aggregation', 'composition']) assert.equal(model.isUmlRelationship(t), true, t)
  assert.match(panel, /<button className="connector-icon-button" type="button" title="Reverse direction" aria-label="Reverse direction" disabled=\{relationship\.twoWay\}/)
  assert.match(panel, /title=\{props\.desktop && props\.lineStyle\.label === 'Line style for new shapes'/)
  assert.match(css, /\.connector-plain \.routing-toggle button \{[^}]*padding: 0 3px; font-size: 12px/)
  assert.match(css, /\.connector-action \{[^}]*justify-content: center/)
  assert.match(css, /\.connector-actions \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(css, /\.options-more-toggle \{[^}]*background: transparent/)
})
