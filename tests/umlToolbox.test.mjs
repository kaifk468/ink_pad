import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8')

test('floating UML toolbox exposes all seven first-class relationship tools', () => {
  for (const [type, label] of [
    ['association', 'Association'],
    ['directed-association', 'Directed association'],
    ['inheritance', 'Inheritance'],
    ['realization', 'Realization'],
    ['aggregation', 'Aggregation'],
    ['composition', 'Composition'],
    ['dependency', 'Dependency'],
  ]) {
    assert.match(appSource, new RegExp(`type: '${type}', label: '${label}'`))
  }
  assert.match(appSource, /aria-label="UML connector tools"/)
  assert.match(appSource, /aria-label=\{`\$\{label\} connector`\}/)
  assert.match(appSource, /<UmlConnectorIcon type=\{type\} \/>/)
})

test('toolbox drag is isolated and the panel is a floating overlay beside the canvas', () => {
  assert.match(appSource, /onPointerDown=\{startUmlToolboxDrag\}/)
  assert.match(appSource, /onPointerMove=\{moveUmlToolbox\}/)
  assert.match(appSource, /setPointerCapture\(event\.pointerId\)/)
  assert.match(appSource, /event\.stopPropagation\(\)/)
  assert.match(appSource, /className=\{`uml-toolbox\$\{umlToolboxMinimized/)
  assert.match(styles, /\.uml-toolbox\s*\{[^}]*position:\s*absolute/s)
  assert.match(styles, /\.uml-toolbox\s*\{[^}]*touch-action:\s*none/s)
})

test('toolbox is narrower, keeps icon labels, and can minimize and restore', () => {
  assert.match(styles, /\.uml-toolbox\s*\{[^}]*width:\s*164px/s)
  assert.match(styles, /\.uml-toolbox\s*\{[^}]*padding:\s*5px 4px/s)
  assert.match(appSource, /className="uml-toolbox-minimize"/)
  assert.match(appSource, /setUmlToolboxMinimized\(true\)/)
  assert.match(appSource, /className="uml-toolbox-restore"/)
  assert.match(appSource, /aria-label="Restore UML connector tools"/)
  assert.match(appSource, /setUmlToolboxMinimized\(false\)/)
  assert.match(appSource, /umlToolboxMinimized \? \(/)
  assert.match(appSource, /suppressMinimizedToolboxClickRef\.current = umlToolboxMinimized && umlToolboxDragRef\.current\.moved/)
})

test('expanded header and minimized button both provide draggable pointer capture', () => {
  assert.equal((appSource.match(/onPointerDown=\{startUmlToolboxDrag\}/g) ?? []).length, 2)
  assert.equal((appSource.match(/onPointerMove=\{moveUmlToolbox\}/g) ?? []).length, 2)
  assert.equal((appSource.match(/onPointerUp=\{endUmlToolboxDrag\}/g) ?? []).length, 2)
  assert.match(appSource, /event\.currentTarget\.setPointerCapture\(event\.pointerId\)/)
})

test('selected relationship type flows through pen preview and snapped connector creation', () => {
  assert.match(appSource, /if \(connectorMode \|\| umlConnectorType !== null\)/)
  assert.match(appSource, /const snappedStart = snapConnectorEndpointWithinWorkspace\(point\)/)
  assert.match(appSource, /const snappedEnd = snapConnectorEndpointWithinWorkspace\(point\)/)
  assert.match(appSource, /relationshipType: umlConnectorType \?\? 'association'/)
  assert.match(appSource, /activeConnector\.relationshipType,[\s\S]*?\)\)/)
  assert.match(appSource, /setUmlConnectorType\(relationshipType\)[\s\S]*?setConnectorMode\(false\)/)
})
