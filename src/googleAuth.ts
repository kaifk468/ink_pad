import { DRIVE_SCOPE, DriveAuthError, GOOGLE_CLIENT_ID } from './googleDrive'
import { readStoredProfile } from './driveProfile'

/**
 * Google sign-in for Drive storage, using Google Identity Services (the token flow).
 * The access token lasts about an hour. It is kept in the tab's session storage, so a page refresh keeps working without
 * signing in; it is gone when the browser closes. Google can hand out a new token without any window ("quiet" request,
 * prompt none) when the person is still signed in to Google in this browser and has already approved the app; the app
 * tries that on load, shortly before the token runs out, and when Drive refuses a token. When it does not work
 * (Chrome blocked it, or Google wants a tap), the app shows "Reconnect Drive", and a tap opens the normal Google window,
 * which closes by itself when nothing has to be confirmed.
 */

type TokenResponse = { access_token?: string; expires_in?: number | string; error?: string }
type TokenRequestOptions = { prompt?: string; hint?: string }
type TokenClient = { requestAccessToken(overrides?: TokenRequestOptions): void }
export type GoogleGlobal = {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string
        scope: string
        callback: (response: TokenResponse) => void
        error_callback?: (error: { type?: string }) => void
      }): TokenClient
      revoke(token: string, done?: () => void): void
    }
  }
}

const SCRIPT_URL = 'https://accounts.google.com/gsi/client'
/** A window the person has to act in. */
const INTERACTIVE_TIMEOUT_MS = 20000
/** A quiet request opens no window; if Google has not answered by now it is not going to. */
const QUIET_TIMEOUT_MS = 8000
export const REFRESH_WINDOW_MS = 10 * 60 * 1000
export const TOKEN_STORAGE_KEY = 'inkpad.drive.token'
const TOKEN_SAFETY_MS = 60000

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type GoogleAuthDeps = {
  loadGoogle: () => Promise<GoogleGlobal>
  /** Where the token is kept for this tab (session storage), or null to keep it in memory only. */
  storage: StorageLike | null
  now: () => number
  /** The Google account to ask for, so a quiet request picks it without a chooser. */
  getHint: () => string | undefined
}

let scriptPromise: Promise<void> | null = null
function loadGoogleScript(): Promise<void> {
  if ((window as unknown as { google?: GoogleGlobal }).google?.accounts?.oauth2) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SCRIPT_URL
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => { scriptPromise = null; reject(new DriveAuthError('Could not reach Google. Check the connection.')) }
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

function defaultDeps(): GoogleAuthDeps {
  return {
    loadGoogle: async () => {
      await loadGoogleScript()
      return (window as unknown as { google: GoogleGlobal }).google
    },
    storage: (() => { try { return typeof window === 'undefined' ? null : window.sessionStorage } catch { return null } })(),
    now: () => Date.now(),
    getHint: () => readStoredProfile()?.email || undefined,
  }
}

export function createGoogleAuth(overrides: Partial<GoogleAuthDeps> = {}) {
  const deps = { ...defaultDeps(), ...overrides }
  let token: string | null = null
  let expiresAt = 0
  let client: TokenClient | null = null
  let inflight: { interactive: boolean; promise: Promise<string> } | null = null
  let settle: { resolve: (token: string) => void; reject: (error: Error) => void } | null = null

  const remember = () => {
    try {
      if (token) deps.storage?.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ token, expiresAt }))
      else deps.storage?.removeItem(TOKEN_STORAGE_KEY)
    } catch { /* the token just will not survive a refresh */ }
  }
  // A token from this tab's earlier page load is reused while it is still valid.
  try {
    const raw = deps.storage?.getItem(TOKEN_STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as { token?: unknown; expiresAt?: unknown }
      if (typeof saved.token === 'string' && typeof saved.expiresAt === 'number' && saved.expiresAt > deps.now() + TOKEN_SAFETY_MS) {
        token = saved.token
        expiresAt = saved.expiresAt
      } else deps.storage?.removeItem(TOKEN_STORAGE_KEY)
    }
  } catch { /* start without a remembered token */ }

  const valid = () => token !== null && deps.now() < expiresAt

  const ensureClient = async () => {
    const google = await deps.loadGoogle()
    if (client) return client
    client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        const pending = settle
        settle = null
        if (response.error || !response.access_token) { pending?.reject(new DriveAuthError()); return }
        token = response.access_token
        expiresAt = deps.now() + (Number(response.expires_in) || 3600) * 1000 - TOKEN_SAFETY_MS
        remember()
        pending?.resolve(token)
      },
      error_callback: () => {
        const pending = settle
        settle = null
        pending?.reject(new DriveAuthError())
      },
    })
    return client
  }

  const run = async (interactive: boolean): Promise<string> => {
    const tokenClient = await ensureClient()
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => { settle = null; reject(new DriveAuthError()) }, interactive ? INTERACTIVE_TIMEOUT_MS : QUIET_TIMEOUT_MS)
      settle = {
        resolve: (value) => { clearTimeout(timer); resolve(value) },
        reject: (error) => { clearTimeout(timer); reject(error) },
      }
      const hint = deps.getHint()
      tokenClient.requestAccessToken({ prompt: interactive ? '' : 'none', ...(hint ? { hint } : {}) })
    })
  }

  // Requests run one after another (the Google client answers one at a time); asking twice the same way shares one request.
  const request = (interactive: boolean, force: boolean): Promise<string> => {
    if (inflight?.interactive === interactive) return inflight.promise
    const previous = inflight ? inflight.promise.catch(() => undefined) : Promise.resolve(undefined)
    const promise: Promise<string> = previous.then(() => (!force && valid() ? (token as string) : run(interactive))).finally(() => {
      if (inflight?.promise === promise) inflight = null
    })
    inflight = { interactive, promise }
    return promise
  }

  return {
    /**
     * A valid token. force = ask Google for a new one even if the cached one looks fine.
     * interactive = the person just tapped, so Google's window may open; otherwise only the quiet request is tried.
     */
    getToken(force = false, interactive = false): Promise<string> {
      if (!force && valid()) return Promise.resolve(token as string)
      return request(interactive, force)
    },
    /** Milliseconds until the token expires (0 when there is none). */
    msLeft(): number {
      return token ? Math.max(0, expiresAt - deps.now()) : 0
    },
    hasToken(): boolean {
      return token !== null
    },
    signOut(): void {
      const old = token
      token = null
      expiresAt = 0
      remember()
      if (old) void deps.loadGoogle().then((google) => google.accounts.oauth2.revoke(old)).catch(() => undefined)
    },
  }
}

export const driveAuth = createGoogleAuth()
