import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { loadModule } from './helpers/loadModule.mjs'

const auth = await loadModule('googleAuth.ts')
const profile = await loadModule('driveProfile.ts')
const drive = await loadModule('googleDrive.ts')

const memoryStorage = () => {
  const map = new Map()
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key), map }
}
/** A stand-in for Google Identity Services: each request is answered by `answer(options)`. */
const fakeGoogle = (answer) => {
  const requests = []
  let config = null
  const google = { accounts: { oauth2: {
    initTokenClient: (cfg) => { config = cfg; return { requestAccessToken: (options) => { requests.push(options); const result = answer(options, requests.length); queueMicrotask(() => { if (result.error) config.error_callback?.({ type: result.error }); else config.callback(result) }) } } },
    revoke: () => undefined,
  } } }
  return { google, requests }
}
const make = (answer, extra = {}) => {
  const { google, requests } = fakeGoogle(answer)
  const clock = { now: 1_000_000 }
  const storage = extra.storage ?? memoryStorage()
  const instance = auth.createGoogleAuth({ loadGoogle: async () => google, storage, now: () => clock.now, getHint: () => extra.hint, ...(extra.deps ?? {}) })
  return { instance, requests, clock, storage }
}
const grant = (token = 'T1', expires = 3600) => () => ({ access_token: token, expires_in: expires })

test('a token from this tab is reused after a page refresh while it is still valid', async () => {
  const first = make(grant('T1'))
  assert.equal(await first.instance.getToken(false, true), 'T1')
  const refreshed = auth.createGoogleAuth({ loadGoogle: async () => { throw new Error('Google must not be asked') }, storage: first.storage, now: () => first.clock.now + 10 * 60 * 1000, getHint: () => undefined })
  assert.equal(await refreshed.getToken(), 'T1')
  assert.equal(refreshed.hasToken(), true)
})

test('an expired remembered token is dropped and nothing is reused', async () => {
  const first = make(grant('T1', 3600))
  await first.instance.getToken(false, true)
  const later = auth.createGoogleAuth({ loadGoogle: async () => { throw new Error('offline') }, storage: first.storage, now: () => first.clock.now + 2 * 3600 * 1000, getHint: () => undefined })
  assert.equal(later.hasToken(), false)
  assert.equal(first.storage.getItem(auth.TOKEN_STORAGE_KEY), null)
})

test('a background request is quiet: no window, and the remembered account is named', async () => {
  const quiet = make(grant('Q'), { hint: 'kaif@example.com' })
  assert.equal(await quiet.instance.getToken(), 'Q')
  assert.deepEqual(quiet.requests, [{ prompt: 'none', hint: 'kaif@example.com' }])
})

test('a tap asks Google normally, and the answer is shared when asked twice at once', async () => {
  const tap = make(grant('I'))
  const [a, b] = await Promise.all([tap.instance.getToken(false, true), tap.instance.getToken(false, true)])
  assert.deepEqual([a, b], ['I', 'I'])
  assert.equal(tap.requests.length, 1)
  assert.equal(tap.requests[0].prompt, '')
})

test('when the quiet request fails the person is asked to sign in, and a following tap still works', async () => {
  const flaky = make((options) => (options.prompt === 'none' ? { error: 'interaction_required' } : { access_token: 'TAP', expires_in: 3600 }))
  await assert.rejects(() => flaky.instance.getToken(), (error) => error instanceof drive.DriveAuthError)
  assert.equal(await flaky.instance.getToken(false, true), 'TAP')
  assert.deepEqual(flaky.requests.map((r) => r.prompt), ['none', ''])
})

test('a tap that arrives while a quiet request is running waits for it, and does not open a window if it succeeded', async () => {
  const both = make(grant('Q'))
  const quiet = both.instance.getToken()
  const tap = both.instance.getToken(false, true)
  assert.deepEqual(await Promise.all([quiet, tap]), ['Q', 'Q'])
  assert.equal(both.requests.length, 1)
})

test('the new token is remembered for the tab, and signing out forgets it', async () => {
  const run = make(grant('R'))
  await run.instance.getToken(true, true)
  assert.match(run.storage.getItem(auth.TOKEN_STORAGE_KEY), /"token":"R"/)
  run.instance.signOut()
  assert.equal(run.storage.getItem(auth.TOKEN_STORAGE_KEY), null)
  assert.equal(run.instance.hasToken(), false)
})

test('time left runs down and a forced request asks again', async () => {
  let count = 0
  const run = make(() => ({ access_token: `T${++count}`, expires_in: 3600 }))
  await run.instance.getToken()
  assert.ok(run.instance.msLeft() > 55 * 60 * 1000)
  run.clock.now += 50 * 60 * 1000
  assert.ok(run.instance.msLeft() < auth.REFRESH_WINDOW_MS)
  assert.equal(await run.instance.getToken(true), 'T2')
})

test('initials come from the first and last word of the name, else the email', () => {
  assert.equal(profile.initialsOf({ name: 'Kaif Siddique', email: 'k@x.com' }), 'KS')
  assert.equal(profile.initialsOf({ name: 'Madonna', email: '' }), 'M')
  assert.equal(profile.initialsOf({ name: 'Mary Jane van Dyke', email: '' }), 'MD')
  assert.equal(profile.initialsOf({ name: '', email: 'zed@x.com' }), 'Z')
  assert.equal(profile.initialsOf({ name: '', email: '' }), '?')
  assert.equal(profile.displayName({ name: '', email: 'zed@x.com' }), 'zed@x.com')
  assert.equal(profile.displayName({ name: ' Kaif ', email: 'k@x.com' }), 'Kaif')
})

test('the profile is remembered and read back, and damaged data is ignored', () => {
  const storage = memoryStorage()
  assert.equal(profile.readStoredProfile(storage), null)
  profile.writeStoredProfile({ name: 'Kaif', email: 'k@x.com', photoUrl: 'https://lh3.example/p.jpg' }, storage)
  assert.deepEqual(profile.readStoredProfile(storage), { name: 'Kaif', email: 'k@x.com', photoUrl: 'https://lh3.example/p.jpg' })
  profile.writeStoredProfile(null, storage)
  assert.equal(profile.readStoredProfile(storage), null)
  storage.setItem(profile.DRIVE_PROFILE_KEY, '{oops')
  assert.equal(profile.readStoredProfile(storage), null)
  storage.setItem(profile.DRIVE_PROFILE_KEY, JSON.stringify({ name: 3 }))
  assert.equal(profile.readStoredProfile(storage), null)
})

test('the name, email and photo come from Drive with the permission the app already has', async () => {
  const seen = []
  const env = { getToken: async () => 'tok', fetch: async (url) => { seen.push(url); return new Response(JSON.stringify({ user: { displayName: 'Kaif S', emailAddress: 'k@x.com', photoLink: 'https://lh3.example/p' } }), { status: 200 }) } }
  assert.deepEqual(await drive.fetchDriveProfile(env), { name: 'Kaif S', email: 'k@x.com', photoUrl: 'https://lh3.example/p' })
  assert.match(seen[0], /drive\/v3\/about\?fields=user/)
  const bare = { getToken: async () => 'tok', fetch: async () => new Response('{}', { status: 200 }) }
  assert.deepEqual(await drive.fetchDriveProfile(bare), { name: '', email: '', photoUrl: null })
})

test('the app wires the new Drive behaviour in', async () => {
  const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8')
  const [hook, account, panel, app] = await Promise.all([read('app/useDocuments.ts'), read('app/AccountButton.tsx'), read('StoragePanel.tsx'), read('App.tsx')])
  // a diagram that has not changed is not saved again when switching
  assert.match(hook, /signature === savedSignatureRef\.current/)
  assert.match(hook, /savedSignatureRef\.current = signature/)
  // the quiet sign-in on load; a failure shows Reconnect Drive and no longer opens the Storage panel by itself
  assert.match(hook, /await withTimeout\(driveAuth\.getToken\(\), STARTUP_SIGN_IN_WAIT_MS\)/)
  const driveStartup = hook.slice(hook.indexOf("readStorageMode() === 'drive'"), hook.indexOf("readStorageMode() === 'device' && isDeviceFolderSupported()"))
  assert.doesNotMatch(driveStartup, /setStoragePanelOpen/)
  // taps may open Google's window; background work never does
  assert.match(hook, /driveAuth\.getToken\(false, true\)/)
  assert.match(hook, /driveAuth\.getToken\(true, true\)/)
  assert.match(hook, /window\.setInterval\(/)
  // browser copies and the remembered list
  assert.match(hook, /createDriveBackend\(driveEnv, \{ cache: getDriveCache\(\) \}\)/)
  assert.match(hook, /backend\.listCached/)
  assert.match(hook, /backend\.load\(id, fresherVersion\(backend, id\)\)/)
  // disconnecting forgets the account and the copies
  assert.match(hook, /await getDriveCache\(\)\.clear\(\)/)
  // avatar: picture or initials, name on hover, Reconnect button, opens Storage
  assert.match(account, /referrerPolicy="no-referrer"/)
  assert.match(account, /initialsOf\(profile\)/)
  assert.match(account, /title=\{name \?\? 'Storage and account'\}/)
  assert.match(account, /Reconnect Drive/)
  assert.match(app, /<AccountButton profile=\{driveProfile\} needsReconnect=\{storage\.kind === 'drive' && storage\.locked\}/)
  assert.match(panel, /displayName\(props\.profile\)/)
  assert.match(panel, /Reconnect Drive/)
})
