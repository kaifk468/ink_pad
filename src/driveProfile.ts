/** Who is signed in to Google Drive: shown on the avatar button and in the Storage panel, and remembered between visits. */
export type DriveProfile = { name: string; email: string; photoUrl: string | null }

export const DRIVE_PROFILE_KEY = 'inkpad.drive.profile'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function readStoredProfile(storage: StorageLike | null = defaultStorage()): DriveProfile | null {
  try {
    const raw = storage?.getItem(DRIVE_PROFILE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<DriveProfile>
    if (typeof data.name !== 'string' || typeof data.email !== 'string') return null
    return { name: data.name, email: data.email, photoUrl: typeof data.photoUrl === 'string' && data.photoUrl ? data.photoUrl : null }
  } catch { return null }
}

export function writeStoredProfile(profile: DriveProfile | null, storage: StorageLike | null = defaultStorage()): void {
  try {
    if (profile) storage?.setItem(DRIVE_PROFILE_KEY, JSON.stringify(profile))
    else storage?.removeItem(DRIVE_PROFILE_KEY)
  } catch { /* the avatar just will not be remembered */ }
}

function defaultStorage(): StorageLike | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

/** One or two capital letters for the avatar when there is no photo: first and last word of the name, else the start of the email. */
export function initialsOf(profile: Pick<DriveProfile, 'name' | 'email'>): string {
  const words = profile.name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return `${firstLetter(words[0])}${firstLetter(words[words.length - 1])}`.toUpperCase()
  if (words.length === 1) return firstLetter(words[0]).toUpperCase()
  const local = profile.email.trim().split('@')[0]
  return local ? firstLetter(local).toUpperCase() : '?'
}

function firstLetter(word: string): string {
  return Array.from(word)[0] ?? ''
}

/** The name to show: the Google name, else the email. */
export function displayName(profile: Pick<DriveProfile, 'name' | 'email'>): string {
  return profile.name.trim() || profile.email.trim() || 'Google account'
}
