import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const search = await loadModule('shapeSearch.ts')
const hld = await loadModule('hldShapes.ts')
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const insertTray = await read('src/app/InsertTray.tsx')
const moreTray = await read('src/app/MoreShapesTray.tsx')
const app = await read('src/App.tsx')

const first = (query) => search.searchShapes(query)[0]

test('every HLD shape in the trays, and every basic tray entry, is in the table', () => {
  const ids = new Set(search.SHAPE_SEARCH_TABLE.map((entry) => entry.id))
  const trayShapes = [...insertTray.matchAll(/\{ shape: '(\w+)'/g)].map((m) => m[1])
  assert.equal(trayShapes.length, 14)
  for (const shape of trayShapes) assert.ok(ids.has(shape), `${shape} missing`)
  for (const shape of hld.HLD_SHAPES) assert.ok(ids.has(shape), `${shape} missing`)
  for (const id of ['text', 'shapes', 'sticky', 'classBox']) assert.ok(ids.has(id))
  for (const entry of search.SHAPE_SEARCH_TABLE) {
    if (hld.HLD_SHAPE_LABELS[entry.id]) assert.equal(entry.name, hld.HLD_SHAPE_LABELS[entry.id], 'display name matches the tray label')
  }
  assert.equal(ids.size, search.SHAPE_SEARCH_TABLE.length, 'no duplicate ids')
})

test('tech names find their shape', () => {
  const expected = {
    redis: 'cache', memcached: 'cache', valkey: 'cache', kafka: 'stream', kinesis: 'stream', pubsub: 'stream', s3: 'objectStorage', minio: 'objectStorage',
    nginx: 'loadBalancer', envoy: 'loadBalancer', postgres: 'database', dynamodb: 'database', cassandra: 'database', cloudfront: 'cdn', cloudflare: 'cdn',
    ec2: 'server', pod: 'server', lambda: 'worker', cron: 'worker', kong: 'apiGateway', apigee: 'apiGateway', sqs: 'queue', rabbitmq: 'queue', celery: 'queue',
    microservice: 'service', actor: 'user', spa: 'browser', android: 'mobile', diamond: 'shapes', rectangle: 'shapes', 'code block': 'classBox', sticky: 'sticky',
  }
  for (const [query, id] of Object.entries(expected)) assert.equal(first(query)?.id, id, query)
})

test('matches report the alias that matched, name matches report none', () => {
  assert.equal(first('redis').alias, 'redis')
  assert.equal(search.shapeMatchLabel(first('redis')), 'Cache · redis')
  assert.equal(first('cache').alias, null)
  assert.equal(search.shapeMatchLabel(first('cache')), 'Cache')
  assert.equal(first('KAFKA').alias, 'kafka', 'case-insensitive')
  assert.equal(first('  s3 ').id, 'objectStorage', 'trimmed')
})

test('ranking: exact name, name prefix, alias exact, alias prefix, substring', () => {
  const table = [
    { id: 'sub', name: 'Zeta', aliases: ['myfoobar'] },
    { id: 'aliasPrefix', name: 'Yota', aliases: ['foobaz'] },
    { id: 'aliasExact', name: 'Xi', aliases: ['foo'] },
    { id: 'namePrefix', name: 'Foolish', aliases: [] },
    { id: 'exact', name: 'Foo', aliases: [] },
  ]
  const ranked = search.searchShapes('foo', table)
  assert.deepEqual(ranked.map((m) => m.id), ['exact', 'namePrefix', 'aliasExact', 'aliasPrefix', 'sub'])
  assert.deepEqual(ranked.map((m) => m.rank), [0, 1, 2, 3, 4])
  assert.equal(search.searchShapes('s').slice(0, 3).every((m) => m.rank <= 3), true)
  assert.equal(first('server').id, 'server')
  assert.equal(first('data').id, 'database', 'name prefix beats substring aliases')
})

test('empty query returns every shape in tray order; no match returns nothing', () => {
  const all = search.searchShapes('')
  assert.deepEqual(all.map((m) => m.id), search.SHAPE_SEARCH_TABLE.map((e) => e.id))
  assert.deepEqual(search.searchShapes('   ').length, all.length)
  assert.deepEqual(all.slice(4).map((m) => m.id), ['database', 'queue', 'service', ...[...insertTray.matchAll(/\{ shape: '(\w+)'/g)].map((m) => m[1]).slice(3)])
  assert.deepEqual(search.searchShapes('zzzzqqq'), [])
})

test('shapeKeywords lists the aliases for the palette', () => {
  assert.match(search.shapeKeywords('stream'), /\bkafka\b/)
  assert.equal(search.shapeKeywords('nope'), '')
})

test('More shapes grid: search field focused on open, filters, Enter inserts the first, Esc clears then closes, empty state', () => {
  assert.match(moreTray, /import \{ searchShapes \} from '\.\.\/shapeSearch'/)
  assert.match(moreTray, /placeholder="Search shapes \(redis, kafka…\)"/)
  assert.match(moreTray, /searchRef\.current\?\.focus\(\)/)
  assert.match(moreTray, /event\.key === 'Enter' && firstShown\) \{ event\.preventDefault\(\); insertMatch\(firstShown\.id\)/)
  assert.match(moreTray, /if \(id === 'sticky'\) onSticky\(\); else onHldShape\(id as HldShape\); setOpen\(false\)/)
  assert.match(moreTray, /Escape'\) \{\s*if \(searchRef\.current && searchRef\.current\.value\) \{ setQuery\(''\)[^}]*\} else setOpen\(false\)/)
  assert.match(moreTray, /No shape matches/)
  assert.match(moreTray, /shape-search-alias/)
})

test('Insert tray: search field without autofocus, filters, Enter inserts the first, Esc clears then closes, empty state', () => {
  assert.match(insertTray, /placeholder="Search shapes \(redis, kafka…\)"/)
  assert.doesNotMatch(insertTray, /autoFocus|\.focus\(\)/)
  assert.match(insertTray, /event\.key === 'Enter' && matches\[0\]\) \{ event\.preventDefault\(\); insertById\(matches\[0\]\.id\)/)
  assert.match(insertTray, /id === 'text'\) onText\(\)[\s\S]*id === 'shapes'\) onShapes\(\)[\s\S]*id === 'sticky'\) onSticky\(\)[\s\S]*id === 'classBox'\) onClass\(\)[\s\S]*onHldShape\(id as HldShape\)/)
  assert.match(insertTray, /Escape'\) \{\s*if \(searchRef\.current && searchRef\.current\.value\) \{ setQuery\(''\)[^}]*\} else setOpen\(false\)/)
  assert.match(insertTray, /No shape matches/)
  assert.match(insertTray, /\{!searching && <>/, 'the normal sections show when the query is empty')
})

test('command palette: "Insert shape: <Name>" rows carry the aliases as keywords', () => {
  assert.match(app, /label: `Insert shape: \$\{HLD_SHAPE_LABELS\[shape\]\}`, group: 'Shapes', keywords: `hld system design add \$\{shapeKeywords\(shape\)\}`/)
  assert.match(app, /import \{ shapeKeywords \} from '\.\/shapeSearch'/)
})
