import { DRIVE_SCOPE, DriveAuthError, GOOGLE_CLIENT_ID } from './googleDrive'

/**
 * Google sign-in for Drive storage, using Google Identity Services (the token flow).
 * The access token lives only in memory and lasts about an hour. Asking again for a token the person
 * already approved is quick, but the browser only allows the sign-in window after a tap, so the app
 * refreshes the token on a tap shortly before it expires and shows "Sign in again" if that fails.
 */

type TokenResponse = { access_token?: string; expires_in?: number | string; error?: string }
type TokenClient = { requestAccessToken(overrides?: { prompt?: string }): void }
type GoogleGlobal = {
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
const SIGN_IN_TIMEOUT_MS = 20000
export const REFRESH_WINDOW_MS = 10 * 60 * 1000

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

export function createGoogleAuth() {
  let token: string | null = null
  let expiresAt = 0
  let client: TokenClient | null = null
  let inflight: Promise<string> | null = null
  let settle: { resolve: (token: string) => void; reject: (error: Error) => void } | null = null

  const ensureClient = async () => {
    await loadGoogleScript()
    if (client) return client
    const google = (window as unknown as { google: GoogleGlobal }).google
    client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        const pending = settle
        settle = null
        if (response.error || !response.access_token) { pending?.reject(new DriveAuthError()); return }
        token = response.access_token
        expiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000 - 60000
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

  const request = (): Promise<string> => {
    if (inflight) return inflight
    inflight = (async () => {
      const tokenClient = await ensureClient()
      return new Promise<string>((resolve, reject) => {
        const timer = window.setTimeout(() => { settle = null; reject(new DriveAuthError()) }, SIGN_IN_TIMEOUT_MS)
        settle = {
          resolve: (value) => { window.clearTimeout(timer); resolve(value) },
          reject: (error) => { window.clearTimeout(timer); reject(error) },
        }
        tokenClient.requestAccessToken({ prompt: '' })
      })
    })().finally(() => { inflight = null })
    return inflight
  }

  return {
    /** A valid token, asking Google for a new one when needed (force = even if the cached one looks fine). */
    getToken(force = false): Promise<string> {
      if (!force && token && Date.now() < expiresAt) return Promise.resolve(token)
      return request()
    },
    /** Milliseconds until the token expires (0 when there is none). */
    msLeft(): number {
      return token ? Math.max(0, expiresAt - Date.now()) : 0
    },
    hasToken(): boolean {
      return token !== null
    },
    signOut(): void {
      const old = token
      token = null
      expiresAt = 0
      const google = (window as unknown as { google?: GoogleGlobal }).google
      if (old && google?.accounts?.oauth2) google.accounts.oauth2.revoke(old)
    },
  }
}

export const driveAuth = createGoogleAuth()
