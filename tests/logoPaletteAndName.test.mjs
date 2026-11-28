import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'
import { readAppSource } from './helpers/appSource.mjs'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const { TECH_LOGOS } = await loadModule('techLogoData.ts')
const palette = await loadModule('commandPalette.ts')
const layout = await loadModule('logoLayout.ts')
const app = await readAppSource()

const kafka = TECH_LOGOS.find((logo) => logo.slug === 'apachekafka') ?? TECH_LOGOS.find((logo) => logo.title.toLowerCase().includes('kafka'))
const key = (item) => `${item.kind}:${item.id}`

test('palette logo entries: Logo: <Brand>, group Logos, ranked by the logo search', () => {
  const entries = palette.logoPaletteEntries('kafka', TECH_LOGOS)
  assert.ok(entries.length >= 1 && entries.length <= palette.MAX_LOGO_ENTRIES)
  assert.equal(entries[0].label, `Logo: ${kafka.title}`)
  assert.equal(entries[0].group, 'Logos')
  assert.equal(palette.logoSlugFromEntry(entries[0].id), kafka.slug)
  assert.equal(palette.logoSlugFromEntry('logo:insert'), null)
  assert.equal(palette.logoSlugFromEntry('export:png'), null)
})

test('palette logo entries: capped at 8, none for short queries or before the table loaded', () => {
  assert.equal(palette.logoPaletteEntries('data', TECH_LOGOS).length, palette.MAX_LOGO_ENTRIES)
  assert.deepEqual(palette.logoPaletteEntries('k', TECH_LOGOS), [])
  assert.deepEqual(palette.logoPaletteEntries(' k ', TECH_LOGOS), [])
  assert.deepEqual(palette.logoPaletteEntries('', TECH_LOGOS), [])
  assert.deepEqual(palette.logoPaletteEntries('kafka', null), [])
  assert.deepEqual(palette.logoPaletteEntries('zzzzqqqq', TECH_LOGOS), [])
})

test('text size: the duplicate Larger / Smaller shortcut rows are dropped, the commands keep "larger" and the keys', () => {
  const rows = palette.shortcutPaletteEntries()
  const kept = palette.withoutDuplicateTextSizeEntries(rows)
  assert.equal(rows.length - kept.length, 2)
  assert.ok(!kept.some((entry) => /^(Larger|Smaller) text/.test(entry.label)))
  assert.equal(palette.textSizeShortcutKeys('Larger'), 'Ctrl+Shift+.')
  assert.equal(palette.textSizeShortcutKeys('Smaller'), 'Ctrl+Shift+,')
  const bigger = { id: 'edit:text-bigger', label: 'Bigger text', group: 'Edit', keywords: 'font size larger increase label text' }
  assert.equal(palette.filterCommands([bigger], 'larger')[0], bigger)
  assert.match(app, /keys: textSizeShortcutKeys\('Larger'\), keywords: 'font size larger/)
  assert.match(app, /withoutDuplicateTextSizeEntries\(shortcutPaletteEntries\(\)\)/)
})

test('wiring: palette loads logos lazily, Enter inserts with the name, main bundle imports no data', async () => {
  const component = await read('src/app/CommandPalette.tsx')
  assert.match(component, /loadTechLogos\(\)\.then/)
  assert.match(component, /\.\.\.logoPaletteEntries\(query, logos\)/)
  assert.doesNotMatch(component, /techLogoData/)
  assert.doesNotMatch(await read('src/commandPalette.ts'), /techLogoData/)
  assert.match(app, /const logoSlug = logoSlugFromEntry\(id\)[\s\S]*?const logo = findTechLogo\(logoSlug\)[\s\S]*?insertLogo\(logo, true\)/)
})

const box = { kind: 'rectangle', id: 7, x: 100, y: 200, width: 150, height: 150, strokeColor: '#111', strokeWidth: 3, rounded: true, logo: kafka.slug }

test('logoNameLabel matches the label built at insert, moved to the box', () => {
  const built = layout.buildLogoItems(kafka, '#111', true)
  const label = layout.logoNameLabel({ ...box, x: 0, y: 0 }, kafka, 1)
  assert.deepEqual(label, built[1])
  const moved = layout.logoNameLabel(box, kafka, 9)
  assert.equal(moved.id, 9)
  assert.equal(moved.x, built[1].x + 100)
  assert.equal(moved.y, built[1].y + 200)
  assert.equal(moved.text, kafka.title)
  assert.equal(moved.align, 'center')
  assert.equal(layout.logoNameLabel({ ...box, group: 3 }, kafka, 9).group, 3)
})

test('findLogoNameLabels: by text under the box or shared group; ignores other texts', () => {
  const label = layout.logoNameLabel(box, kafka, 1)
  const far = { ...label, id: 2, x: 900, y: 900 }
  const other = { ...label, id: 3, text: 'Something else' }
  assert.deepEqual(layout.findLogoNameLabels([box, label, far, other], box, kafka).map((l) => l.id), [1])
  const grouped = { ...box, group: 4 }
  assert.deepEqual(layout.findLogoNameLabels([grouped, { ...far, group: 4 }], grouped, kafka).map((l) => l.id), [2])
  assert.deepEqual(layout.findLogoNameLabels([box], box, kafka), [])
  const moved = { ...box, x: 500 }
  assert.deepEqual(layout.findLogoNameLabels([moved, { ...label, x: label.x + 400 }], moved, kafka).map((l) => l.id), [1])
})

test('setLogoNameShown: Hide removes the label, Show adds one fresh label, no-ops return the same array', () => {
  const label = layout.logoNameLabel(box, kafka, 1)
  const items = [box, label]
  const hidden = layout.setLogoNameShown(items, box, kafka, false, 5)
  assert.deepEqual(hidden, [box])
  assert.equal(layout.setLogoNameShown(hidden, box, kafka, false, 5), hidden)
  const shown = layout.setLogoNameShown(hidden, box, kafka, true, 5)
  assert.equal(shown.length, 2)
  assert.deepEqual(shown[1], layout.logoNameLabel(box, kafka, 5))
  assert.equal(layout.setLogoNameShown(items, box, kafka, true, 5), items)
  const locked = { ...label, locked: true }
  assert.equal(layout.setLogoNameShown([box, locked], box, kafka, false, 5).length, 2)
  const resized = { ...box, x: 0, y: 0, width: 300, height: 200 }
  const added = layout.setLogoNameShown([resized], resized, kafka, true, 6)[1]
  assert.ok(added.x > 0 && added.x + added.width < 300 && added.y > 100 && added.y < 200)
})

test('selectedLogoBox: one unlocked known logo box (its own label may come along); unknown slugs, several boxes, locks refuse', () => {
  const label = layout.logoNameLabel(box, kafka, 1)
  const known = (slug) => (slug === kafka.slug ? kafka : undefined)
  assert.equal(layout.selectedLogoBox([box, label], new Set([key(box)]), known)?.box, box)
  assert.equal(layout.selectedLogoBox([box, label], new Set([key(box), key(label)]), known)?.box, box)
  const stranger = { kind: 'text', id: 8, x: 0, y: 0, width: 10, height: 10, text: 'x', fontSize: 20, color: '#000' }
  assert.equal(layout.selectedLogoBox([box, stranger], new Set([key(box), key(stranger)]), known), null)
  assert.equal(layout.selectedLogoBox([{ ...box, logo: 'nosuchlogo' }], new Set([key(box)]), known), null)
  const second = { ...box, id: 8 }
  assert.equal(layout.selectedLogoBox([box, second], new Set([key(box), key(second)]), known), null)
  assert.equal(layout.selectedLogoBox([{ ...box, locked: true }], new Set([key(box)]), known), null)
  assert.equal(layout.selectedLogoBox([{ ...box, logo: undefined }], new Set([key(box)]), known), null)
})

test('wiring: the panel has Name Show / Hide, App saves one history step and takes a fresh text id', async () => {
  const panel = await read('src/app/ContextPanel.tsx')
  assert.match(panel, /logoName\?: \{ shown: boolean; onChange: \(show: boolean\) => void \} \| null/)
  assert.match(panel, /<span className="panel-label">Name<\/span>[\s\S]*?>Show<\/button>[\s\S]*?>Hide<\/button>/)
  assert.match(panel, /!props\.logoColor && !props\.logoName/)
  assert.match(app, /const setSelectedLogoName = \(show: boolean\) => \{[\s\S]*?setLogoNameShown\(strokesRef\.current, target\.box, target\.logo, show, nextTextIdRef\.current\)[\s\S]*?saveHistory\(\)\s*if \(show\) nextTextIdRef\.current \+= 1/)
  assert.match(app, /logoName=\{\(\(\) => \{ const target = selectedLogoBox\(/)
})
