import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const { TECH_LOGOS } = await loadModule('techLogoData.ts')
const searchModule = await loadModule('techLogoSearch.ts')
const layout = await loadModule('logoLayout.ts')
const registry = await loadModule('techLogos.ts')
const shapeSearch = await loadModule('shapeSearch.ts')
const doc = await loadModule('documentFormat.ts')
const sheet = await loadModule('sheetExport.ts')
const changeShape = await loadModule('changeShape.ts')
const boundary = await loadModule('boundary.ts')

const find = (slug) => TECH_LOGOS.find((logo) => logo.slug === slug)

// ---- data ----

test('the generated table has about 100+ unique, well-formed logos', () => {
  assert.ok(TECH_LOGOS.length >= 100 && TECH_LOGOS.length <= 200, `count ${TECH_LOGOS.length}`)
  assert.equal(new Set(TECH_LOGOS.map((logo) => logo.slug)).size, TECH_LOGOS.length, 'unique slugs')
  for (const logo of TECH_LOGOS) {
    assert.match(logo.slug, searchModule.LOGO_SLUG_PATTERN, `${logo.slug} fits the file format slug rule`)
    assert.ok(logo.title.length > 0, `${logo.slug} title`)
    assert.match(logo.hex, /^#[0-9a-f]{6}$/, `${logo.slug} colour`)
    assert.ok(logo.path.length >= 10 && /^[Mm]/.test(logo.path), `${logo.slug} path`)
    assert.ok(logo.keywords.length > 0 && logo.keywords === logo.keywords.toLowerCase(), `${logo.slug} keywords`)
    assert.ok(logo.keywords.includes(logo.title.toLowerCase().split(/\s+/)[0]), `${logo.slug} keywords include the title`)
  }
  for (const slug of ['postgresql', 'mysql', 'mongodb', 'redis', 'apachekafka', 'rabbitmq', 'docker', 'kubernetes', 'nginx', 'grafana', 'prometheus', 'stripe', 'github', 'googlecloud', 'terraform']) assert.ok(find(slug), `${slug} present`)
  for (const slug of ['amazonaws', 'amazons3', 'microsoftazure', 'azure']) assert.equal(find(slug), undefined, `${slug} is not in the set`)
})

test('every logo outside CC0 carries its permissive licence, and no copyleft, NC or custom-licence artwork is included', () => {
  for (const logo of TECH_LOGOS) if (logo.license !== undefined) assert.ok(['Apache-2.0', 'MIT', 'BSD-3-Clause'].includes(logo.license), `${logo.slug}: ${logo.license}`)
})

// ---- search ----

test('logo search ranks the obvious logo first', () => {
  const first = (query) => searchModule.searchTechLogos(query, TECH_LOGOS)[0]?.slug
  assert.equal(first('kafka'), 'apachekafka')
  assert.equal(first('postgres'), 'postgresql')
  assert.equal(first('redis'), 'redis')
  assert.equal(first('k8s'), 'kubernetes')
  assert.equal(first('Docker'), 'docker')
  assert.equal(first('mongo'), 'mongodb')
  assert.equal(searchModule.searchTechLogos('zzzzqq', TECH_LOGOS).length, 0)
  assert.equal(searchModule.searchTechLogos('', TECH_LOGOS).length, TECH_LOGOS.length)
  assert.equal(searchModule.searchTechLogos('', TECH_LOGOS, 5).length, 5)
  assert.ok(searchModule.searchTechLogos('message queue', TECH_LOGOS).some((logo) => logo.slug === 'rabbitmq'), 'every word must match somewhere')
})

test('AWS, Azure and their service names offer the generic HLD icons, not brand logos', () => {
  const ids = (query) => shapeSearch.searchShapes(query).map((match) => match.id)
  assert.ok(ids('aws').length >= 5, 'aws finds several generic shapes')
  assert.deepEqual(searchModule.searchTechLogos('aws', TECH_LOGOS), [])
  assert.ok(ids('azure').includes('server') && ids('azure').includes('objectStorage'))
  assert.equal(ids('s3')[0], 'objectStorage')
  assert.equal(ids('lambda')[0], 'function')
  assert.equal(ids('sqs')[0], 'queue')
  assert.ok(ids('azure function').includes('function'))
  assert.ok(ids('azure blob').includes('objectStorage'))
  assert.ok(ids('ec2').includes('server'))
})

// ---- file format ----

const logoBox = (extra = {}) => ({ kind: 'rectangle', id: 3, x: 10, y: 20, width: 150, height: 150, strokeColor: '#1e1e1e', strokeWidth: 3, rounded: true, logo: 'redis', ...extra })

test('a logo box round-trips; the brand colour is kept; the file version is unchanged', () => {
  const created = doc.createDocument({ title: 'Logos', template: 'blank', background: 'white', items: [logoBox({ logoColor: 'brand' }), logoBox({ id: 4, logo: 'postgresql' })] }, '2026-11-28T00:00:00.000Z')
  assert.equal(created.version, 1)
  const parsed = doc.parseDocument(doc.stringifyDocument(created))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.droppedItems, 0)
  assert.deepEqual(parsed.document.items ?? parsed.document.pages?.[0]?.items, created.items ?? created.pages?.[0]?.items)
  const items = parsed.document.items ?? parsed.document.pages[0].items
  assert.equal(items[0].logo, 'redis')
  assert.equal(items[0].logoColor, 'brand')
  assert.equal(items[1].logoColor, undefined)
})

test('an unknown slug is kept, junk is dropped, and old files are untouched', () => {
  const clean = (value) => doc.sanitizeItem(value)
  assert.equal(clean(logoBox({ logo: 'some-new-brand.js' })).logo, 'some-new-brand.js', 'unknown to this build, still preserved')
  assert.equal(clean(logoBox({ logo: 'a'.repeat(64) })).logo, 'a'.repeat(64))
  for (const junk of ['', 'A', 'Redis', '-redis', 'a'.repeat(65), 'has space', 'x/y', '<b>', 7, null, {}, ['redis']]) assert.equal('logo' in clean(logoBox({ logo: junk })), false, `junk ${JSON.stringify(junk)}`)
  const plain = clean(logoBox({ logo: undefined, logoColor: 'brand' }))
  assert.equal('logoColor' in plain, false, 'logoColor needs a logo')
  assert.equal('logoColor' in clean(logoBox({ logoColor: 'red' })), false, 'only brand is kept')
  assert.equal('logoColor' in clean(logoBox({ logoColor: true })), false)
  const old = { kind: 'rectangle', id: 1, x: 0, y: 0, width: 10, height: 10, strokeColor: '#111', strokeWidth: 2 }
  assert.deepEqual(clean(old), old)
  assert.equal('logo' in clean({ ...old, ellipse: true, logo: 'redis' }), false, 'logos live on plain rectangles only')
  assert.equal('logo' in clean({ ...old, diamond: true, logo: 'redis' }), false)
})

// ---- layout, colour and insert items ----

test('logo placement is square, centred above the name band, and inside the box', () => {
  const box = { x: 100, y: 50, width: 150, height: 150 }
  const placement = layout.logoPlacement(box)
  assert.ok(placement.size > 50 && placement.size < 100)
  assert.ok(placement.x >= box.x && placement.x + placement.size <= box.x + box.width)
  assert.ok(placement.y >= box.y && placement.y + placement.size <= box.y + box.height - 20, 'a band is left under it for the name')
  assert.ok(Math.abs(placement.x + placement.size / 2 - (box.x + box.width / 2)) < 0.01)
  const wide = layout.logoPlacement({ x: 0, y: 0, width: 400, height: 150 })
  assert.equal(wide.size, placement.size, 'height limits a wide box')
  assert.equal(layout.logoPlacement({ x: 0, y: 0, width: 4, height: 4 }).size >= 0, true)
  assert.match(layout.logoSvgTransform(placement), /^translate\([\d. -]+\) scale\([\d.]+\)$/)
})

test('flat uses the line colour, brand uses the logo colour, an unknown logo stays flat', () => {
  const redis = find('redis')
  assert.equal(layout.logoFillColor({ strokeColor: '#336699' }, redis), '#336699')
  assert.equal(layout.logoFillColor({ strokeColor: '#336699', logoColor: 'brand' }, redis), redis.hex)
  assert.equal(layout.logoFillColor({ strokeColor: '#336699', logoColor: 'brand' }, undefined), '#336699')
})

test('inserting builds a rounded logo box plus a name label inside it; Show name off leaves only the box', () => {
  const [box, label] = layout.buildLogoItems({ slug: 'apachecassandra', title: 'Apache Cassandra' }, '#1e1e1e', true)
  assert.equal(box.kind, 'rectangle')
  assert.equal(box.logo, 'apachecassandra')
  assert.equal(box.rounded, true)
  assert.equal(box.hldShape, undefined)
  assert.equal(box.inkBox, undefined)
  assert.equal(label.kind, 'text')
  assert.equal(label.text, 'Apache Cassandra')
  assert.ok(label.x >= box.x && label.x + label.width <= box.x + box.width, 'a long name is shrunk to fit the box')
  assert.ok(label.y >= box.y + box.height / 2 && label.y + label.height <= box.y + box.height, 'the label is in the lower half')
  assert.equal(layout.buildLogoItems({ slug: 'redis', title: 'Redis' }, '#1e1e1e', false).length, 1)
  assert.equal(boundary.isContainerBox([box, label], box), false, 'a logo box with its label is not a boundary')
  assert.equal(changeShape.boxShape(box), null, 'Change shape does not apply to a logo box')
})

test('Logo colour sets and clears brand on logo boxes only, as one change', () => {
  const a = logoBox()
  const b = logoBox({ id: 4 })
  const other = { kind: 'rectangle', id: 9, x: 0, y: 0, width: 50, height: 50, strokeColor: '#111', strokeWidth: 2 }
  const items = [a, b, other]
  const keys = new Set(['rectangle:3', 'rectangle:4'])
  assert.equal(layout.logoColorChoice(items, keys), 'flat')
  assert.equal(layout.logoColorChoice(items, new Set(['rectangle:3', 'rectangle:9'])), null, 'mixed selection: no row')
  assert.equal(layout.logoColorChoice(items, new Set(['rectangle:9'])), null)
  const branded = layout.setLogoColor(items, keys, true)
  assert.equal(branded[0].logoColor, 'brand')
  assert.equal(branded[1].logoColor, 'brand')
  assert.equal(branded[2], other)
  assert.equal(layout.logoColorChoice(branded, keys), 'brand')
  assert.equal(layout.setLogoColor(branded, keys, true), branded, 'no change returns the same array')
  const flat = layout.setLogoColor(branded, keys, false)
  assert.equal('logoColor' in flat[0], false)
  assert.equal(layout.setLogoColor(items, new Set(['rectangle:9']), true), items)
})

// ---- Path2D cache ----

test('the path cache builds each slug once, however often it is asked', () => {
  let built = 0
  class FakePath2D { constructor(d) { built += 1; this.d = d } }
  const cache = layout.createPathCache((d) => new FakePath2D(d))
  const first = cache.get('redis', 'M0 0')
  for (let frame = 0; frame < 500; frame += 1) assert.equal(cache.get('redis', 'M0 0'), first)
  cache.get('docker', 'M1 1')
  cache.get('docker', 'M1 1')
  assert.equal(built, 2)
  assert.equal(cache.size, 2)
})

// ---- registry and export ----

test('the registry returns installed logos, notifies listeners and keeps unknown slugs unknown', () => {
  let notified = 0
  const off = registry.subscribeTechLogos(() => { notified += 1 })
  registry.installTechLogos(TECH_LOGOS)
  assert.equal(notified, 1)
  assert.equal(registry.findTechLogo('redis').title, 'Redis')
  assert.equal(registry.findTechLogo('no-such-logo'), undefined)
  assert.equal(registry.loadedTechLogos().length, TECH_LOGOS.length)
  off()
})

test('SVG export draws the logo as a filled path with the same placement and colour; unknown slugs get a placeholder', () => {
  registry.installTechLogos(TECH_LOGOS)
  const opts = { width: 2500, height: 1500, template: 'blank', backgroundColor: '#ffffff' }
  const flat = sheet.buildSheetSvg([logoBox({ x: 100, y: 100 })], opts)
  const redis = find('redis')
  assert.ok(flat.includes(`<path d="${redis.path}" transform="translate(`), 'logo path')
  assert.match(flat, /scale\([\d.]+\)" fill="#1e1e1e"\/>/)
  const brand = sheet.buildSheetSvg([logoBox({ logoColor: 'brand' })], opts)
  assert.ok(brand.includes(`fill="${redis.hex}"/>`))
  const unknown = sheet.buildSheetSvg([logoBox({ logo: 'brand-new-thing' })], opts)
  assert.doesNotMatch(unknown, new RegExp(redis.path.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(unknown, />\?<\/text>/)
  const sketchy = sheet.buildSheetSvg([logoBox()], { ...opts, sketchy: true })
  assert.ok(sketchy.includes(redis.path), 'sketchy mode draws the logo crisp')
})

// ---- wiring ----

test('trays, panel, palette and credits are wired', async () => {
  const insertTray = await read('src/app/InsertTray.tsx')
  const moreShapes = await read('src/app/MoreShapesTray.tsx')
  const picker = await read('src/app/LogoPicker.tsx')
  const panel = await read('src/app/ContextPanel.tsx')
  const dock = await read('src/app/ToolDock.tsx')
  const help = await read('src/app/ShortcutHelp.tsx')
  const app = await read('src/App.tsx')
  const renderer = await read('src/app/canvasRenderer.ts')
  const css = await read('src/styles.css')
  assert.match(insertTray, /<LogoPicker touch /)
  assert.match(insertTray, /onLogo: \(logo: TechLogo, showName: boolean\) => void/)
  assert.match(moreShapes, /<LogoPicker /)
  assert.match(moreShapes, /Tech logos/)
  assert.match(picker, /aria-label="Search logos"/)
  assert.match(picker, /Show name/)
  assert.match(picker, /aria-label=\{logo\.title\} title=\{logo\.title\}/, 'tooltip is the brand name')
  assert.match(picker, /Logos: Simple Icons \(CC0; a few keep their own Apache-2\.0, MIT or BSD licence\)\. Brand names and logos belong to their owners\./)
  assert.match(help, /LOGO_CREDIT/)
  assert.match(css, /\.logo-picker-touch \.logo-button \{ min-height: 48px/, 'touch buttons are at least 44px')
  assert.match(css, /\.logo-button \{[^}]*min-height: 44px/)
  assert.match(dock, /onLogo=\{props\.onLogo\}/)
  assert.equal((dock.match(/onLogo=\{props\.onLogo\}/g) ?? []).length, 2, 'desktop More shapes and the tablet Insert tray')
  assert.match(panel, /aria-label="Logo colour"/)
  assert.match(panel, /Flat<\/button>/)
  assert.match(panel, /Brand<\/button>/)
  assert.match(app, /id: 'logo:insert', label: 'Insert logo…'/)
  assert.match(app, /<LogoDialog onInsert=\{insertLogo\}/)
  assert.match(app, /logoColor=\{\(\(\) => \{ const choice = logoColorChoice/)
  assert.match(app, /const setSelectedLogoColor = [\s\S]{0,200}saveHistory\(\)/, 'one undo step')
  assert.match(app, /subscribeTechLogos\(\(\) => \{ historyCacheRef\.current = null; renderAllRef\.current\(\) \}\)/, 'repaint when the lazy table arrives')
  assert.match(renderer, /if \(rectangle\.logo !== undefined\) drawLogo\(ctx, rectangle\)/)
  // Only the generated table is imported, lazily; never the whole package.
  assert.match(await read('src/techLogos.ts'), /import\('\.\/techLogoData'\)/)
  for (const file of ['src/App.tsx', 'src/techLogos.ts', 'src/sheetExport.ts', 'src/app/canvasRenderer.ts', 'src/app/LogoPicker.tsx', 'src/app/logoRender.ts']) assert.doesNotMatch(await read(file), /from 'simple-icons/, file)
})
