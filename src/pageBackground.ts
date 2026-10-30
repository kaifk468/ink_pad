export type PageBackground = 'white' | 'warm' | 'blue' | 'yellow' | 'green'

export const DEFAULT_PAGE_BACKGROUND: PageBackground = 'white'
export const PAGE_BACKGROUND_COLORS: Record<PageBackground, string> = {
  white: '#ffffff',
  warm: '#fffaf0',
  blue: '#f2f7ff',
  yellow: '#fff9df',
  green: '#f0f8f1',
}

const STORAGE_KEY = 'inkpad.pageBackground'

export function parsePageBackground(value: string | null): PageBackground {
  return value === 'warm' || value === 'blue' || value === 'yellow' || value === 'green'
    ? value
    : DEFAULT_PAGE_BACKGROUND
}

export function loadPageBackground(storage?: Pick<Storage, 'getItem'>): PageBackground {
  try {
    return parsePageBackground((storage ?? window.localStorage).getItem(STORAGE_KEY))
  } catch {
    return DEFAULT_PAGE_BACKGROUND
  }
}

export function savePageBackground(background: PageBackground, storage?: Pick<Storage, 'setItem'>): void {
  try {
    ;(storage ?? window.localStorage).setItem(STORAGE_KEY, parsePageBackground(background))
  } catch {
    // Storage can be unavailable in private browsing or restricted contexts.
  }
}
